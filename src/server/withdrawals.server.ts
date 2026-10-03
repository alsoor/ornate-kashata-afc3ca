/**
 * withdrawals.server.ts — طلبات سحب الأرباح إلى PayPal.
 *
 * التدفق:
 *  1) المستخدم يرسل POST /api/withdrawals/request  { paypalEmail, coins }
 *  2) السيرفر يتحقق، ثم يخصم الأرباح (ذرّياً) ويسجّل الطلب بحالة "pending"
 *  3) الأونر يراجع الطلبات، يحوّل المبلغ يدوياً من PayPal، ثم يضغط "paid"
 *     (أو "reject" فيرجع الرصيد للمستخدم تلقائياً)
 *
 * مهم: هذا الملف مكتوب بدون معرفة بقية السيرفر عندك. عدّل قسم ADAPTERS فقط
 * (3 دوال للأرباح + مكان تخزين الطلبات + معرفة المستخدم/الأونر). الباقي جاهز.
 *
 * التركيب (Express):
 *   import { withdrawalsRouter } from './withdrawals.server';
 *   app.use('/api/withdrawals', withdrawalsRouter);
 */
import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';

// ── إعدادات ─────────────────────────────────────────────────────────────
const MIN_COINS = 1000;             // لازم يطابق WITHDRAW_MIN_COINS بالواجهة
const MAX_COINS_PER_REQUEST = 1_000_000;
const CENTS_PER_COIN = 1;           // 1 Coin = USD 0.01
const MAX_PENDING_PER_USER = 3;

export type WithdrawStatus = 'pending' | 'paid' | 'rejected';
export interface WithdrawRequest {
  id: string;
  userId: string;
  paypalEmail: string;
  coins: number;
  usd: number;
  status: WithdrawStatus;
  createdAt: number;
  updatedAt: number;
}

// ── ADAPTERS: اربطها بنظامك ──────────────────────────────────────────────

/** هوية المستخدم من الجلسة/التوكن (لا تثق بـ userId القادم من الواجهة). null = غير مسجّل دخول. */
async function getAuthUserId(req: Request): Promise<string | null> {
  // TODO: مثال: return (req as any).session?.userId ?? null;
  void req;
  return null;
}

/** هل هذا المستخدم هو الأونر؟ (لصفحات المراجعة) */
async function isOwner(req: Request): Promise<boolean> {
  // TODO: مثال: return (req as any).session?.userId === process.env.OWNER_USER_ID;
  void req;
  return false;
}

/** أرباح الدعم الحالية للمستخدم (نفس الرقم اللي يرجعه /api/coins/earnings). */
async function getEarnings(userId: string): Promise<number> {
  // TODO: اقرأ من نفس مكان أرباح الدعم عندك
  void userId;
  return 0;
}

/**
 * خصم ذرّي: ينقص الأرباح بمقدار coins فقط إذا كانت كافية، ويرجع الرصيد الجديد،
 * أو null إذا غير كافية. لازم يكون ذرّياً (UPDATE ... WHERE earnings >= coins / transaction)
 * عشان طلبين متزامنين ما يسحبون نفس الرصيد مرتين.
 */
async function deductEarnings(userId: string, coins: number): Promise<number | null> {
  // TODO
  void userId; void coins;
  return null;
}

/** إرجاع الأرباح (عند الرفض أو فشل التسجيل). يرجع الرصيد الجديد. */
async function refundEarnings(userId: string, coins: number): Promise<number> {
  // TODO
  void userId; void coins;
  return 0;
}

/** تخزين الطلبات — استبدلها بقاعدة بياناتك. الافتراضي: ذاكرة (يضيع عند إعادة تشغيل السيرفر!). */
const store = {
  _rows: new Map<string, WithdrawRequest>(),
  async insert(r: WithdrawRequest) { this._rows.set(r.id, r); },
  async get(id: string) { return this._rows.get(id) ?? null; },
  async update(r: WithdrawRequest) { this._rows.set(r.id, r); },
  async listByUser(userId: string) { return [...this._rows.values()].filter(r => r.userId === userId).sort((a, b) => b.createdAt - a.createdAt); },
  async listByStatus(status: WithdrawStatus) { return [...this._rows.values()].filter(r => r.status === status).sort((a, b) => a.createdAt - b.createdAt); },
};

// ── المسارات ─────────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const fail = (res: Response, code: number, error: string) => res.status(code).json({ error });

export const withdrawalsRouter = Router();

// طلب سحب جديد
withdrawalsRouter.post('/request', async (req: Request, res: Response) => {
  const userId = await getAuthUserId(req);
  if (!userId) return fail(res, 401, 'يجب تسجيل الدخول');

  const paypalEmail = String(req.body?.paypalEmail ?? '').trim().toLowerCase();
  const coins = Math.floor(Number(req.body?.coins));
  if (!EMAIL_RE.test(paypalEmail) || paypalEmail.length > 120) return fail(res, 400, 'إيميل PayPal غير صحيح');
  if (!Number.isFinite(coins) || coins < MIN_COINS) return fail(res, 400, `أقل مبلغ للسحب ${MIN_COINS} Coins`);
  if (coins > MAX_COINS_PER_REQUEST) return fail(res, 400, 'المبلغ كبير جداً');

  const pending = await store.listByUser(userId);
  if (pending.filter(r => r.status === 'pending').length >= MAX_PENDING_PER_USER) {
    return fail(res, 429, 'عندك طلبات سحب معلّقة، انتظر مراجعتها');
  }

  // الخصم أولاً (ذرّياً) ثم التسجيل — وإذا فشل التسجيل نرجّع الأرباح
  const left = await deductEarnings(userId, coins);
  if (left === null) return fail(res, 400, `المتاح للسحب ${await getEarnings(userId)} فقط`);

  const now = Date.now();
  const row: WithdrawRequest = {
    id: randomUUID(), userId, paypalEmail, coins,
    usd: (coins * CENTS_PER_COIN) / 100,
    status: 'pending', createdAt: now, updatedAt: now,
  };
  try {
    await store.insert(row);
  } catch {
    await refundEarnings(userId, coins);
    return fail(res, 500, 'تعذر تسجيل الطلب، حاول مرة ثانية');
  }
  return res.json({ ok: true, id: row.id, status: row.status, earnings: left });
});

// طلبات المستخدم نفسه (بدون إظهار الإيميل)
withdrawalsRouter.get('/', async (req: Request, res: Response) => {
  const userId = await getAuthUserId(req);
  if (!userId) return fail(res, 401, 'يجب تسجيل الدخول');
  const rows = await store.listByUser(userId);
  return res.json({
    requests: rows.slice(0, 10).map(r => ({ id: r.id, coins: r.coins, usd: r.usd, status: r.status, createdAt: r.createdAt })),
  });
});

// ── للأونر: مراجعة الطلبات ────────────────────────────────────────────────
withdrawalsRouter.get('/admin/pending', async (req: Request, res: Response) => {
  if (!(await isOwner(req))) return fail(res, 403, 'غير مصرّح');
  return res.json({ requests: await store.listByStatus('pending') });
});

// تم تحويل المبلغ يدوياً من PayPal
withdrawalsRouter.post('/admin/:id/paid', async (req: Request, res: Response) => {
  if (!(await isOwner(req))) return fail(res, 403, 'غير مصرّح');
  const row = await store.get(String(req.params.id));
  if (!row) return fail(res, 404, 'الطلب غير موجود');
  if (row.status !== 'pending') return fail(res, 409, 'الطلب تمت معالجته');
  row.status = 'paid'; row.updatedAt = Date.now();
  await store.update(row);
  return res.json({ ok: true });
});

// رفض الطلب: يرجع الأرباح للمستخدم
withdrawalsRouter.post('/admin/:id/reject', async (req: Request, res: Response) => {
  if (!(await isOwner(req))) return fail(res, 403, 'غير مصرّح');
  const row = await store.get(String(req.params.id));
  if (!row) return fail(res, 404, 'الطلب غير موجود');
  if (row.status !== 'pending') return fail(res, 409, 'الطلب تمت معالجته');
  row.status = 'rejected'; row.updatedAt = Date.now();
  await store.update(row);               // نغيّر الحالة أولاً حتى ما ينرجع الرصيد مرتين
  await refundEarnings(row.userId, row.coins);
  return res.json({ ok: true });
});
