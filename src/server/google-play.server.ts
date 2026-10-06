/**
 * google-play.server.ts — التحقق من مشتريات Google Play وإضافة العملات (الطريقة الثانية بجانب Polar).
 *
 * الملف مستقل (لا يعتمد على أي مكتبة خارجية) ويستخدم فقط crypto و fetch الموجودين في Node 18+.
 * لا يعدّل أي شيء في Polar. لتشغيله:
 *
 * 1) متغيرات البيئة على السيرفر:
 *      GOOGLE_PLAY_PACKAGE_NAME        اسم حزمة التطبيق (مثل com.stooorna.app)
 *      GOOGLE_PLAY_SERVICE_ACCOUNT     محتوى ملف JSON الخاص بـ Service Account (كنص كامل)
 *    والـ Service Account يُربط في Play Console ← Users and permissions ← Invite new users
 *    بصلاحية "View financial data" و "Manage orders and subscriptions".
 *
 * 2) أنشئ مساراً POST /api/google-play/verify يستدعي handleGooglePlayVerify (مثال أسفل الملف)
 *    واربط deps بنفس دوال إضافة الرصيد التي يستخدمها webhook الخاص بـ Polar.
 *
 * 3) في Play Console أنشئ منتجات (Consumable) بالمعرّفات: coins_50 ، coins_125 ، coins_400 ، coins_500 ،
 *    coins_1000 ، coins_1500 ، coins_3500 ، coins_10000 ، coins_15000  (نفس باقات PACKS في LiveCoinsDock.tsx).
 */
import { createSign } from 'node:crypto';
import express from 'express';

/** الباقات المسموح بيعها — لازم تطابق PACKS في LiveCoinsDock.tsx */
export const GOOGLE_PLAY_COIN_PACKS = [50, 125, 400, 500, 1000, 1500, 3500, 10000, 15000] as const;

export type GooglePlayVerifyInput = { userId: string; sku: string; purchaseToken: string };

export type GooglePlayDeps = {
  /** معرّف المستخدم من الجلسة (نفس طريقة مسار /api/polar/checkout) — لا تثق بـ userId القادم من المتصفح */
  getSessionUserId: (req: any) => Promise<string | null>;
  /** هل تمت معالجة هذا الشراء من قبل؟ (مفتاح فريد = orderId أو purchaseToken). يمنع إضافة العملات مرتين */
  alreadyProcessed: (key: string) => Promise<boolean>;
  /** يضيف العملات ويسجّل المفتاح كمعالَج في نفس العملية (transaction)، ويرجع الرصيد الجديد */
  creditCoins: (args: { userId: string; coins: number; key: string; source: 'google-play' }) => Promise<number>;
  /** يرجع الرصيد الحالي (يُستخدم عندما يكون الشراء معالَجاً من قبل) */
  getBalance: (userId: string) => Promise<number>;
};

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

let cachedToken: { value: string; exp: number } | null = null;

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function readServiceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT || '';
  if (!raw) throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT is not set');
  const sa = JSON.parse(raw) as ServiceAccount;
  if (!sa.client_email || !sa.private_key) throw new Error('Invalid service account JSON');
  return sa;
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.value;
  const sa = readServiceAccount();
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const signature = b64url(signer.sign(sa.private_key));
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claim}.${signature}`,
    }),
  });
  const data = await res.json().catch(() => ({})) as { access_token?: string; expires_in?: number };
  if (!res.ok || !data.access_token) throw new Error('Google auth failed');
  cachedToken = { value: data.access_token, exp: now + Number(data.expires_in || 3600) };
  return cachedToken.value;
}

type GoogleProductPurchase = {
  purchaseState?: number;       // 0 = تم الشراء ، 1 = ملغي ، 2 = معلّق
  consumptionState?: number;    // 0 = لم يُستهلك ، 1 = تم استهلاكه
  acknowledgementState?: number;
  orderId?: string;
  refundableQuantity?: number;
};

async function fetchPurchase(sku: string, token: string): Promise<GoogleProductPurchase> {
  const pkg = process.env.GOOGLE_PLAY_PACKAGE_NAME || '';
  if (!pkg) throw new Error('GOOGLE_PLAY_PACKAGE_NAME is not set');
  const accessToken = await getAccessToken();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(pkg)}/purchases/products/${encodeURIComponent(sku)}/tokens/${encodeURIComponent(token)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Google purchase lookup failed (${res.status})`);
  return await res.json() as GoogleProductPurchase;
}

/** يستهلك المنتج (Consume) حتى يستطيع المستخدم شراء نفس الباقة مرة أخرى. */
async function consumePurchase(sku: string, token: string): Promise<void> {
  const pkg = process.env.GOOGLE_PLAY_PACKAGE_NAME || '';
  const accessToken = await getAccessToken();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(pkg)}/purchases/products/${encodeURIComponent(sku)}/tokens/${encodeURIComponent(token)}:consume`;
  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok && res.status !== 400) throw new Error(`Google consume failed (${res.status})`);
}

export function coinsFromSku(sku: string): number | null {
  const m = /^coins_(\d+)$/.exec(sku);
  if (!m) return null;
  const coins = Number(m[1]);
  return (GOOGLE_PLAY_COIN_PACKS as readonly number[]).includes(coins) ? coins : null;
}

export async function verifyAndCreditGooglePlay(
  input: GooglePlayVerifyInput,
  deps: Pick<GooglePlayDeps, 'alreadyProcessed' | 'creditCoins' | 'getBalance'>,
): Promise<{ ok: true; balance: number; coins: number; duplicate: boolean } | { ok: false; error: string; status: number }> {
  const coins = coinsFromSku(input.sku);
  if (!coins) return { ok: false, error: 'Unknown pack', status: 400 };
  if (!input.userId || !input.purchaseToken || input.purchaseToken.length > 2000) return { ok: false, error: 'Invalid request', status: 400 };

  let purchase: GoogleProductPurchase;
  try {
    purchase = await fetchPurchase(input.sku, input.purchaseToken);
  } catch {
    return { ok: false, error: 'Could not verify the Google Play purchase', status: 502 };
  }
  if (purchase.purchaseState !== 0) return { ok: false, error: 'Purchase is not completed', status: 402 };

  // مفتاح فريد لهذا الشراء — نفس الرمز لا يُحسب إلا مرة واحدة مهما تكرر الطلب
  const key = `gplay:${purchase.orderId || input.purchaseToken}`;
  if (await deps.alreadyProcessed(key)) {
    if (purchase.consumptionState !== 1) { try { await consumePurchase(input.sku, input.purchaseToken); } catch { /* يُعاد لاحقاً */ } }
    return { ok: true, balance: await deps.getBalance(input.userId), coins, duplicate: true };
  }

  const balance = await deps.creditCoins({ userId: input.userId, coins, key, source: 'google-play' });
  // الاستهلاك بعد إضافة العملات؛ لو فشل يُعاد تلقائياً مع أول تحقق لاحق (alreadyProcessed أعلاه)
  if (purchase.consumptionState !== 1) { try { await consumePurchase(input.sku, input.purchaseToken); } catch { /* ignore */ } }
  return { ok: true, balance, coins, duplicate: false };
}

/**
 * معالج جاهز لمسار POST /api/google-play/verify (يعتمد على Request/Response القياسية).
 * مثال الربط (عدّله حسب إطار السيرفر عندك):
 *
 *   export async function POST(req: Request) {
 *     return handleGooglePlayVerify(req, {
 *       getSessionUserId: async (r) => (await getSession(r))?.user?.id ?? null,   // نفس ما يستخدمه /api/polar/checkout
 *       alreadyProcessed: async (key) => await db.coinCredits.exists(key),
 *       creditCoins: async ({ userId, coins, key }) => await creditCoinsOnce(userId, coins, key),  // نفس دالة webhook الخاص بـ Polar
 *       getBalance: async (userId) => await readServerBalance(userId),
 *     });
 *   }
 */
export async function handleGooglePlayVerify(req: Request, deps: GooglePlayDeps): Promise<Response> {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  try {
    const sessionUserId = await deps.getSessionUserId(req);
    if (!sessionUserId) return json({ ok: false, error: 'Please sign in first' }, 401);
    const body = await req.json().catch(() => ({})) as Partial<GooglePlayVerifyInput>;
    const result = await verifyAndCreditGooglePlay(
      { userId: sessionUserId, sku: String(body.sku || ''), purchaseToken: String(body.purchaseToken || '') },
      deps,
    );
    if (!result.ok) return json({ ok: false, error: result.error }, result.status);
    return json({ ok: true, balance: result.balance, coins: result.coins });
  } catch {
    return json({ ok: false, error: 'Server error' }, 500);
  }
}

/**
 * ربط Express (نفس أسلوب registerAdSenseTextRoutes في entry.ts): سطر واحد في entry.ts يسجّل المسار.
 *
 *   import { registerGooglePlayRoutes } from "./google-play.server";
 *   registerGooglePlayRoutes(app, { getSessionUserId, alreadyProcessed, creditCoins, getBalance });
 */
export function registerGooglePlayRoutes(app: express.Express, deps: GooglePlayDeps): void {
  app.post('/api/google-play/verify', express.json({ limit: '16kb' }), async (req, res) => {
    try {
      const sessionUserId = await deps.getSessionUserId(req);
      if (!sessionUserId) { res.status(401).json({ ok: false, error: 'Please sign in first' }); return; }
      const body = (req.body || {}) as Partial<GooglePlayVerifyInput>;
      const result = await verifyAndCreditGooglePlay(
        { userId: sessionUserId, sku: String(body.sku || ''), purchaseToken: String(body.purchaseToken || '') },
        deps,
      );
      if (!result.ok) { res.status(result.status).json({ ok: false, error: result.error }); return; }
      res.json({ ok: true, balance: result.balance, coins: result.coins });
    } catch {
      res.status(500).json({ ok: false, error: 'Server error' });
    }
  });
}

/**
 * جاهز للربط مع نفس Ledger الذي يستخدمه webhook الخاص بـ Polar (انظر interface Ledger في polar.ts):
 * نفس الدفتر = نفس الرصيد ونفس حماية التكرار، فلا يوجد نظام رصيد ثانٍ.
 * الشكل معرّف هنا محلياً حتى لا يعتمد هذا الملف على مسار polar.ts.
 */
export type LedgerLike = {
  has(key: string): boolean;
  mark(key: string): void;
  add(userId: string, delta: number): number;
  save(): void;
};

export function googlePlayDepsFromLedger(
  ledger: LedgerLike,
  getSessionUserId: GooglePlayDeps['getSessionUserId'],
): GooglePlayDeps {
  return {
    getSessionUserId,
    alreadyProcessed: async (key) => ledger.has(key),
    creditCoins: async ({ userId, coins, key }) => {
      ledger.mark(key);                         // أولاً: يمنع التكرار لو وصل طلبان معاً
      const balance = ledger.add(userId, coins);
      ledger.save();
      return balance;
    },
    getBalance: async (userId) => ledger.add(userId, 0),   // إضافة صفر = قراءة الرصيد الحالي
  };
}
