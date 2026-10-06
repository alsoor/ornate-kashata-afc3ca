/**
 * google-play.ts — التحقق من مشتريات Google Play وإضافة العملات (الطريقة الثانية بجانب Polar).
 *
 * يعمل بجانب polar.ts بنفس النمط: بدون أي مكتبة خارجية (crypto + fetch فقط، Node 18+).
 *
 * متغيرات البيئة (Railway Variables):
 *   GOOGLE_PLAY_PACKAGE_NAME       اسم حزمة التطبيق في Google Play (مثل com.stooorna.app)
 *   GOOGLE_PLAY_SERVICE_ACCOUNT    محتوى ملف JSON الخاص بـ Service Account (نص كامل)
 *   الـ Service Account يُدعى في Play Console ← Users and permissions بصلاحيتي
 *   "View financial data" و "Manage orders and subscriptions".
 *
 * المنتجات في Play Console (نوع Consumable) بالمعرّفات coins_50 ، coins_125 ... نفس COIN_PACKS في polar.ts.
 */
import { createSign } from "node:crypto";
import { COIN_PACKS } from "./polar.js";

export const googlePlayConfigured = () =>
  !!process.env.GOOGLE_PLAY_PACKAGE_NAME && !!process.env.GOOGLE_PLAY_SERVICE_ACCOUNT;

export type GooglePlayVerifyInput = { userId: string; sku: string; purchaseToken: string };

export type GooglePlayDeps = {
  /** هل عولج هذا الشراء من قبل؟ (مفتاح = orderId أو purchaseToken) */
  alreadyProcessed: (key: string) => Promise<boolean> | boolean;
  /** يضيف العملات ويسجّل المفتاح كمعالَج ويحفظ، ويرجع الرصيد الجديد */
  creditCoins: (args: { userId: string; coins: number; key: string }) => Promise<number> | number;
  getBalance: (userId: string) => Promise<number> | number;
};

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };
let cachedToken: { value: string; exp: number } | null = null;

const b64url = (input: string | Buffer): string =>
  Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

function readServiceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT || "";
  if (!raw) throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT is not set");
  const sa = JSON.parse(raw) as ServiceAccount;
  if (!sa.client_email || !sa.private_key) throw new Error("Invalid service account JSON");
  return sa;
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.value;
  const sa = readServiceAccount();
  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const signature = b64url(signer.sign(sa.private_key));
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claim}.${signature}`,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!res.ok || !data.access_token) throw new Error("Google auth failed");
  cachedToken = { value: data.access_token, exp: now + Number(data.expires_in || 3600) };
  return cachedToken.value;
}

type GoogleProductPurchase = {
  purchaseState?: number;      // 0 = تم الشراء ، 1 = ملغي ، 2 = معلّق
  consumptionState?: number;   // 0 = لم يُستهلك ، 1 = تم استهلاكه
  orderId?: string;
};

const productUrl = (sku: string, token: string) => {
  const pkg = process.env.GOOGLE_PLAY_PACKAGE_NAME || "";
  return `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(pkg)}/purchases/products/${encodeURIComponent(sku)}/tokens/${encodeURIComponent(token)}`;
};

async function fetchPurchase(sku: string, token: string): Promise<GoogleProductPurchase> {
  const res = await fetch(productUrl(sku, token), { headers: { Authorization: `Bearer ${await getAccessToken()}` } });
  if (!res.ok) throw new Error(`Google purchase lookup failed (${res.status})`);
  return (await res.json()) as GoogleProductPurchase;
}

/** يستهلك المنتج (Consume) ليستطيع المستخدم شراء نفس الباقة مرة أخرى. */
async function consumePurchase(sku: string, token: string): Promise<void> {
  const res = await fetch(`${productUrl(sku, token)}:consume`, { method: "POST", headers: { Authorization: `Bearer ${await getAccessToken()}` } });
  if (!res.ok && res.status !== 400) throw new Error(`Google consume failed (${res.status})`);
}

/** "coins_1500" → 1500 (فقط الباقات المعروفة في COIN_PACKS، غيرها null) */
export function coinsFromSku(sku: string): number | null {
  const m = /^coins_(\d+)$/.exec(sku);
  if (!m) return null;
  const coins = Number(m[1]);
  return COIN_PACKS.includes(coins) ? coins : null;
}

const inflight = new Set<string>();

export async function verifyAndCreditGooglePlay(
  input: GooglePlayVerifyInput,
  deps: GooglePlayDeps,
): Promise<{ ok: true; balance: number; coins: number; duplicate: boolean } | { ok: false; error: string; status: number }> {
  const coins = coinsFromSku(input.sku);
  if (!coins) return { ok: false, error: "invalid pack", status: 400 };
  if (!input.userId || !input.purchaseToken || input.purchaseToken.length > 2000) return { ok: false, error: "invalid request", status: 400 };
  // نفس الرمز لا يُعالَج بالتوازي (طلبان معاً)
  if (inflight.has(input.purchaseToken)) return { ok: false, error: "purchase is being processed", status: 409 };
  inflight.add(input.purchaseToken);
  try {
    let purchase: GoogleProductPurchase;
    try {
      purchase = await fetchPurchase(input.sku, input.purchaseToken);
    } catch (e) {
      console.error("[google-play] verify failed", e instanceof Error ? e.message : e);
      return { ok: false, error: "could not verify purchase", status: 502 };
    }
    if (purchase.purchaseState !== 0) return { ok: false, error: "purchase not completed", status: 402 };

    const key = `gplay_${purchase.orderId || input.purchaseToken}`;
    if (await deps.alreadyProcessed(key)) {
      if (purchase.consumptionState !== 1) { try { await consumePurchase(input.sku, input.purchaseToken); } catch { /* يُعاد لاحقاً */ } }
      return { ok: true, balance: await deps.getBalance(input.userId), coins, duplicate: true };
    }
    // مستهلَك عند Google لكن غير مسجّل عندنا = رمز قديم يُعاد إرساله → لا نضيف عملات أبداً
    if (purchase.consumptionState === 1) return { ok: false, error: "purchase already used", status: 409 };

    const balance = await deps.creditCoins({ userId: input.userId, coins, key });
    // الاستهلاك بعد إضافة العملات؛ لو فشل يُعاد مع أول تحقق لاحق (فرع alreadyProcessed أعلاه)
    try { await consumePurchase(input.sku, input.purchaseToken); } catch (e) { console.error("[google-play] consume failed", e instanceof Error ? e.message : e); }
    console.log(`[google-play] credited ${coins} coins to ${input.userId} (${key}) → balance ${balance}`);
    return { ok: true, balance, coins, duplicate: false };
  } finally {
    inflight.delete(input.purchaseToken);
  }
}
