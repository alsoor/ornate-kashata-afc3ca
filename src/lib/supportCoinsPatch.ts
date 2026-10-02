/**
 * supportCoinsPatch — خصم الدعم / الاستبدال / التحويل.
 * المصدر المعتمد لرصيد الهدايا: يخصم فوراً محلياً ثم يثبت الخصم على السيرفر.
 */
export const SUPPORT_BALANCE_EVENT = 'stooorna:coins-balance';
export const SUPPORT_EARNINGS_EVENT = 'stooorna:coins-earnings';

const balanceKey = (uid: string) => `stooorna_coins_balance_${uid || 'guest'}`;
const earningsKey = (uid: string) => `stooorna_coins_earnings_${uid || 'guest'}`;
const guardKey = (uid: string) => `stooorna_coins_spend_guard_${uid || 'guest'}`;

export function readSupportBalance(uid: string): number {
  try {
    const n = Number(localStorage.getItem(balanceKey(uid)) || 0);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export function readSupportEarnings(uid: string): number {
  try {
    const n = Number(localStorage.getItem(earningsKey(uid)) || 0);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export function writeSupportBalance(uid: string, n: number, spend = false) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  try {
    localStorage.setItem(balanceKey(uid), String(v));
    if (spend) localStorage.setItem(guardKey(uid), JSON.stringify({ balance: v, at: Date.now() }));
  } catch { /* ignore */ }
  try {
    window.dispatchEvent(new CustomEvent(SUPPORT_BALANCE_EVENT, { detail: { userId: uid, balance: v, spend } }));
  } catch { /* ignore */ }
  return v;
}

export function writeSupportEarnings(uid: string, n: number) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  try { localStorage.setItem(earningsKey(uid), String(v)); } catch { /* ignore */ }
  try {
    window.dispatchEvent(new CustomEvent(SUPPORT_EARNINGS_EVENT, { detail: { userId: uid, earnings: v } }));
  } catch { /* ignore */ }
  return v;
}

/** لا نسمح لرصيد سيرفر أعلى أن يلغي خصماً تم قبل أقل من 45 ثانية. */
export function supportBalanceAfterServer(uid: string, serverBalance: number): number {
  const local = readSupportBalance(uid);
  const server = Math.max(0, Math.floor(Number(serverBalance) || 0));
  try {
    const raw = localStorage.getItem(guardKey(uid));
    const g = raw ? JSON.parse(raw) as { balance?: number; at?: number } : null;
    if (g && typeof g.at === 'number' && Date.now() - g.at < 45_000 && server > Math.floor(Number(g.balance) || 0)) {
      return local;
    }
  } catch { /* ignore */ }
  return Math.min(local, server);
}

export async function supportSpend(input: {
  userId: string;
  price: number;
  count?: number;
  giftId?: string;
  toUserId?: string;
  dedupeKey?: string;
}): Promise<{ ok: boolean; balance: number; deducted: number; error?: string }> {
  const uid = String(input.userId || '');
  const price = Math.max(0, Math.floor(Number(input.price) || 0));
  const count = Math.max(1, Math.floor(Number(input.count) || 1));
  const cost = price * count;
  if (!uid) return { ok: false, balance: 0, deducted: 0, error: 'يجب تسجيل الدخول' };
  if (cost <= 0) return { ok: false, balance: readSupportBalance(uid), deducted: 0, error: 'سعر غير صالح' };
  const before = readSupportBalance(uid);
  if (before < cost) return { ok: false, balance: before, deducted: 0, error: 'رصيدك غير كافٍ' };
  const next = writeSupportBalance(uid, before - cost, true);
  try {
    const r = await fetch('/api/support/spend', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: uid,
        price,
        count,
        giftId: input.giftId || '',
        toUserId: input.toUserId || '',
        dedupeKey: input.dedupeKey || '',
      }),
    });
    if (r.ok) {
      const d = await r.json().catch(() => ({})) as { balance?: number };
      if (typeof d.balance === 'number') {
        const kept = supportBalanceAfterServer(uid, d.balance);
        writeSupportBalance(uid, kept, true);
        return { ok: true, balance: kept, deducted: cost };
      }
    }
  } catch { /* السيرفر اختياري؛ الخصم المحلي قائم */ }
  try {
    await fetch('/api/gifts/balance', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: uid, balance: next, delta: -cost }),
    });
  } catch { /* ignore */ }
  return { ok: true, balance: next, deducted: cost };
}

export async function supportConvert(input: {
  userId: string;
  amount?: number;
}): Promise<{ ok: boolean; balance: number; earnings: number; converted: number; error?: string }> {
  const uid = String(input.userId || '');
  if (!uid) return { ok: false, balance: 0, earnings: 0, converted: 0, error: 'يجب تسجيل الدخول' };
  const earn = readSupportEarnings(uid);
  const requested = input.amount == null ? earn : Math.floor(Number(input.amount) || 0);
  if (requested <= 0) return { ok: false, balance: readSupportBalance(uid), earnings: earn, converted: 0, error: 'اكتب عدد العملات' };
  if (requested > earn) return { ok: false, balance: readSupportBalance(uid), earnings: earn, converted: 0, error: 'الأرباح لا تكفي' };
  const nextEarn = writeSupportEarnings(uid, earn - requested);
  const nextBal = writeSupportBalance(uid, readSupportBalance(uid) + requested, false);
  try {
    const r = await fetch('/api/support/convert', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: uid, amount: requested }),
    });
    if (r.ok) {
      const d = await r.json().catch(() => ({})) as { balance?: number; earnings?: number; converted?: number };
      const bal = typeof d.balance === 'number' ? d.balance : nextBal;
      const er = typeof d.earnings === 'number' ? d.earnings : nextEarn;
      writeSupportBalance(uid, bal, false);
      writeSupportEarnings(uid, er);
      return { ok: true, balance: bal, earnings: er, converted: Math.floor(Number(d.converted) || requested) };
    }
  } catch { /* keep local */ }
  return { ok: true, balance: nextBal, earnings: nextEarn, converted: requested };
}
