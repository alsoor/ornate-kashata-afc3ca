/**
 * دفع Polar — شراء Coins حقيقية.
 *
 * المفاتيح تُقرأ من متغيرات البيئة (Railway Variables) فقط، لا تُكتب بأي ملف:
 *   POLAR_ACCESS_TOKEN    (مطلوب)
 *   POLAR_WEBHOOK_SECRET  (مطلوب)
 *   POLAR_SERVER          (اختياري: "sandbox" للتجربة، وإلا إنتاج)
 *
 * الباقات تُقرأ من كتالوج Polar بالاسم: "50 Coins" ، "125 Coins" ... (منتج Custom Amount مستثنى).
 * عدد الكوينز المضاف يؤخذ من اسم الباقة وليس من المبلغ المدفوع.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** الباقات المسموح بيعها (لازم تطابق أسماء المنتجات في Polar) */
export const COIN_PACKS: readonly number[] = [50, 125, 400, 500, 1000, 1500, 3500, 10000, 15000];

const isSandbox = () => String(process.env.POLAR_SERVER || "").toLowerCase() === "sandbox";
const apiBase = () => (isSandbox() ? "https://sandbox-api.polar.sh/v1" : "https://api.polar.sh/v1");

export const polarConfigured = () => !!process.env.POLAR_ACCESS_TOKEN;
export const polarWebhookConfigured = () => !!process.env.POLAR_WEBHOOK_SECRET;

/** "1,500 Coins" → 1500 (فقط الباقات المعروفة، غيرها null) */
export function coinsFromProductName(name: unknown): number | null {
  const m = /^\s*([\d,]+)\s*coins\s*$/i.exec(String(name ?? ""));
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return COIN_PACKS.includes(n) ? n : null;
}

// ── التحقق من توقيع الويب هوك (Standard Webhooks) ──────────────────────────
type HeaderBag = Record<string, string | string[] | undefined>;
const h = (headers: HeaderBag, name: string): string => {
  const v = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(v) ? String(v[0] ?? "") : String(v ?? "");
};

function candidateKeys(secret: string): Buffer[] {
  const keys: Buffer[] = [Buffer.from(secret, "utf-8")]; // طريقة Polar: السر نفسه كنص
  const stripped = secret.replace(/^whsec_/, "");
  try {
    const b = Buffer.from(stripped, "base64");
    if (b.length > 0) keys.push(b); // الطريقة القياسية: السر base64
  } catch { /* ignore */ }
  return keys;
}

export function verifyPolarSignature(rawBody: Buffer | string, headers: HeaderBag, secret: string, nowMs = Date.now(), toleranceSec = 300): boolean {
  const id = h(headers, "webhook-id");
  const ts = h(headers, "webhook-timestamp");
  const sigHeader = h(headers, "webhook-signature");
  if (!secret || !id || !ts || !sigHeader) return false;
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(nowMs / 1000 - tsNum) > toleranceSec) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString("utf-8") : String(rawBody);
  const signed = `${id}.${ts}.${body}`;
  const provided = sigHeader.split(" ").map((p) => p.trim()).filter((p) => p.startsWith("v1,")).map((p) => p.slice(3));
  if (!provided.length) return false;
  for (const key of candidateKeys(secret)) {
    const expected = createHmac("sha256", key).update(signed).digest();
    for (const p of provided) {
      const got = Buffer.from(p, "base64");
      if (got.length === expected.length && timingSafeEqual(got, expected)) return true;
    }
  }
  return false;
}

// ── منتجات Polar (اسم الباقة → product id) ─────────────────────────────────
let productCache: { at: number; byCoins: Map<number, string>; byId: Map<string, number> } | null = null;

async function polarFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = process.env.POLAR_ACCESS_TOKEN;
  if (!token) throw new Error("POLAR_ACCESS_TOKEN missing");
  return fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
}

export async function loadProducts(force = false) {
  if (!force && productCache && Date.now() - productCache.at < 10 * 60 * 1000) return productCache;
  const byCoins = new Map<number, string>();
  const byId = new Map<string, number>();
  let page = 1;
  for (;;) {
    const r = await polarFetch(`/products/?is_archived=false&limit=100&page=${page}`);
    if (!r.ok) throw new Error(`polar products ${r.status}`);
    const d = (await r.json()) as { items?: Array<{ id: string; name: string }>; pagination?: { max_page?: number } };
    for (const p of d.items || []) {
      const c = coinsFromProductName(p.name);
      if (c != null) { byCoins.set(c, p.id); byId.set(p.id, c); }
    }
    const max = Number(d.pagination?.max_page) || 1;
    if (page >= max || page >= 10) break;
    page++;
  }
  productCache = { at: Date.now(), byCoins, byId };
  return productCache;
}

/** أصل الموقع الذي سيعرض صفحة الدفع داخله: EMBED_ORIGIN أو PUBLIC_APP_URL أو أصل success_url. */
function embedOrigin(successUrl: string, fromRequest?: string): string | undefined {
  // أصل الصفحة الفعلية التي ستعرض الدفع (من هيدر Origin) أولاً — لازم يطابق الدومين تماماً (www / بدون www)
  for (const v of [fromRequest, process.env.POLAR_EMBED_ORIGIN, process.env.PUBLIC_APP_URL, successUrl]) {
    try { if (v) return new URL(v).origin; } catch { /* try next */ }
  }
  return undefined;
}

export async function createCheckout(opts: { coins: number; userId: string; successUrl: string; embedOrigin?: string }): Promise<{ url: string; id: string }> {
  if (!COIN_PACKS.includes(opts.coins)) throw new Error("invalid pack");
  let prods = await loadProducts();
  let productId = prods.byCoins.get(opts.coins);
  if (!productId) { prods = await loadProducts(true); productId = prods.byCoins.get(opts.coins); }
  if (!productId) throw new Error(`product "${opts.coins} Coins" not found in Polar`);
  const r = await polarFetch("/checkouts/", {
    method: "POST",
    body: JSON.stringify({
      products: [productId],
      success_url: opts.successUrl,
      // يسمح بفتح صفحة الدفع داخل الموقع/التطبيق (iframe)؛ بدونه Polar يرجّع ERR_BLOCKED_BY_RESPONSE
      embed_origin: embedOrigin(opts.successUrl, opts.embedOrigin),
      metadata: { userId: opts.userId, coins: String(opts.coins) },
    }),
  });
  if (!r.ok) throw new Error(`polar checkout ${r.status} ${(await r.text()).slice(0, 200)}`);
  const d = (await r.json()) as { url?: string; id?: string; embed_origin?: string | null };
  if (!d.url) throw new Error("polar checkout: no url");
  console.log("[polar] checkout created, embed_origin =", d.embed_origin ?? null);
  return { url: d.url, id: String(d.id || "") };
}

// ── معالجة الأحداث ──────────────────────────────────────────────────────────
export interface Ledger {
  has(key: string): boolean;
  mark(key: string): void;
  /** يضيف (أو يخصم) للرصيد ويرجّع الرصيد الجديد */
  add(userId: string, delta: number): number;
  save(): void;
}

type OrderLike = {
  id?: string;
  product_id?: string;
  product?: { id?: string; name?: string };
  metadata?: Record<string, unknown>;
  checkout?: { metadata?: Record<string, unknown> };
};

async function resolveOrder(o: OrderLike): Promise<{ orderId: string; userId: string; coins: number } | null> {
  const orderId = String(o.id || "");
  const meta = { ...(o.checkout?.metadata || {}), ...(o.metadata || {}) } as Record<string, unknown>;
  const userId = String(meta.userId || "").slice(0, 80);
  let coins = coinsFromProductName(o.product?.name);
  if (coins == null) {
    const pid = String(o.product?.id || o.product_id || "");
    if (pid) coins = (await loadProducts()).byId.get(pid) ?? null;
  }
  if (!orderId || !userId || coins == null) return null;
  return { orderId, userId, coins };
}

export async function handlePolarEvent(event: { type?: string; data?: unknown }, ledger: Ledger): Promise<{ handled: boolean; note?: string }> {
  const type = String(event?.type || "");
  if (type !== "order.paid" && type !== "order.refunded") return { handled: false, note: "ignored" };
  const info = await resolveOrder((event.data || {}) as OrderLike);
  if (!info) {
    console.error("[polar] cannot attribute order — check metadata/product name", type, JSON.stringify(event.data || {}).slice(0, 400));
    return { handled: false, note: "unattributed" };
  }
  if (type === "order.paid") {
    const key = `polar_order_${info.orderId}`;
    if (ledger.has(key)) return { handled: true, note: "duplicate" };
    ledger.mark(key);
    const bal = ledger.add(info.userId, info.coins);
    ledger.save();
    console.log(`[polar] credited ${info.coins} coins to ${info.userId} (order ${info.orderId}) → balance ${bal}`);
    return { handled: true };
  }
  const rkey = `polar_refund_${info.orderId}`;
  if (ledger.has(rkey)) return { handled: true, note: "duplicate" };
  ledger.mark(rkey);
  const bal = ledger.add(info.userId, -info.coins);
  ledger.save();
  console.log(`[polar] refunded ${info.coins} coins from ${info.userId} (order ${info.orderId}) → balance ${bal}`);
  return { handled: true };
}
