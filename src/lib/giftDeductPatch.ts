/**
 * giftDeductPatch — خصم الدعم فقط.
 * يخصم من رصيد المرسل فوراً، يثبت الرقم على السيرفر، ويرسل نصف المبلغ لأرباح الأونر.
 * ملف مستقل حتى لا يتضارب مع شحن الفيزا أو الاستبدال.
 */
const balanceKey = (uid: string) => `stooorna_coins_balance_${uid || 'guest'}`;
const guardKey = (uid: string) => `stooorna_gift_deduct_guard_${uid || 'guest'}`;

export function readGiftBalance(uid: string): number {
  try {
    const n = Number(localStorage.getItem(balanceKey(uid)) || 0);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

function lockBalance(uid: string, balance: number) {
  const v = Math.max(0, Math.floor(balance));
  try {
    localStorage.setItem(balanceKey(uid), String(v));
    localStorage.setItem(guardKey(uid), JSON.stringify({ balance: v, at: Date.now() }));
  } catch { /* ignore */ }
  try {
    window.dispatchEvent(new CustomEvent('stooorna:coins-balance', { detail: { userId: uid, balance: v, spend: true } }));
  } catch { /* ignore */ }
  return v;
}

/** أي مزامنة أعلى خلال 60 ثانية بعد الدعم تُرفض. */
export function giftBalanceOrLocked(uid: string, incoming: number): number {
  const local = readGiftBalance(uid);
  const next = Math.max(0, Math.floor(Number(incoming) || 0));
  try {
    const raw = localStorage.getItem(guardKey(uid));
    const g = raw ? JSON.parse(raw) as { balance?: number; at?: number } : null;
    if (g && Date.now() - Number(g.at) < 60_000 && next > Math.floor(Number(g.balance) || 0)) return local;
  } catch { /* ignore */ }
  return next;
}

export async function deductGiftSupport(input: {
  userId: string;
  price: number;
  count: number;
  giftId?: string;
  toUserId?: string;
}): Promise<{ ok: boolean; balance: number; deducted: number; ownerHalf: number; error?: string }> {
  const uid = String(input.userId || '');
  const price = Math.max(0, Math.floor(Number(input.price) || 0));
  const count = Math.max(1, Math.floor(Number(input.count) || 1));
  const cost = price * count;
  const before = readGiftBalance(uid);
  if (!uid) return { ok: false, balance: 0, deducted: 0, ownerHalf: 0, error: 'يجب تسجيل الدخول' };
  if (before < cost) return { ok: false, balance: before, deducted: 0, ownerHalf: 0, error: 'رصيدك غير كافٍ' };
  const next = lockBalance(uid, before - cost);
  const ownerHalf = Math.floor(cost / 2);
  const dedupeKey = `gift_${uid}_${input.toUserId || ''}_${input.giftId || ''}_${Date.now()}`;
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
        dedupeKey,
        balanceAfter: next,
        ownerHalf,
      }),
    });
    if (r.ok) {
      const d = await r.json().catch(() => ({})) as { balance?: number; ownerCoins?: number };
      const kept = typeof d.balance === 'number' ? giftBalanceOrLocked(uid, d.balance) : next;
      lockBalance(uid, kept);
      if (typeof d.ownerCoins === 'number') {
        try { localStorage.setItem('stooorna_owner_support_profit_coins', String(Math.max(0, Math.floor(d.ownerCoins)))); } catch { /* ignore */ }
        try { window.dispatchEvent(new CustomEvent('stooorna:owner-support-profit', { detail: { coins: d.ownerCoins, usd: d.ownerCoins / 100 } })); } catch { /* ignore */ }
        try { window.dispatchEvent(new CustomEvent('stooorna:app-profits', { detail: { coins: d.ownerCoins, usd: d.ownerCoins / 100 } })); } catch { /* ignore */ }
      }
      return { ok: true, balance: kept, deducted: cost, ownerHalf };
    }
  } catch { /* الخصم المحلي قائم */ }
  try {
    await fetch('/api/owner/support-profit', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ total: cost, half: ownerHalf, dedupeKey, fromId: uid, toUserId: input.toUserId || '' }),
    });
  } catch { /* ignore */ }
  return { ok: true, balance: next, deducted: cost, ownerHalf };
}
