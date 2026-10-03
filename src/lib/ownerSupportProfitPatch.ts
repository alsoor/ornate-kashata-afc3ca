/**
 * ownerSupportProfitPatch — أرباح الدعم الخاصة للأونر.
 * كل دعم (مستخدم أو صاحب البث) يمر من السيرفر: نصف القيمة لأرباح الأونر فوراً.
 */
export const OWNER_SUPPORT_PROFIT_EVENT = 'stooorna:owner-support-profit';
const KEY = 'stooorna_owner_support_profit_coins';
const DONE = 'stooorna_owner_support_profit_done';

export function readOwnerSupportProfit(): { coins: number; usd: number } {
  try {
    const coins = Math.max(0, Math.floor(Number(localStorage.getItem(KEY) || 0) || 0));
    return { coins, usd: coins / 100 };
  } catch {
    return { coins: 0, usd: 0 };
  }
}

function remember(key: string): boolean {
  try {
    const raw = localStorage.getItem(DONE);
    const list = raw ? JSON.parse(raw) : [];
    const arr = Array.isArray(list) ? list.map(String) : [];
    if (arr.includes(key)) return false;
    arr.push(key);
    localStorage.setItem(DONE, JSON.stringify(arr.slice(-500)));
    return true;
  } catch {
    return true;
  }
}

export function addOwnerSupportProfit(coins: number) {
  const add = Math.max(0, Math.floor(Number(coins) || 0));
  const next = readOwnerSupportProfit().coins + add;
  try { localStorage.setItem(KEY, String(next)); } catch { /* ignore */ }
  const snap = { coins: next, usd: next / 100 };
  try { window.dispatchEvent(new CustomEvent(OWNER_SUPPORT_PROFIT_EVENT, { detail: snap })); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent('stooorna:app-profits', { detail: snap })); } catch { /* ignore */ }
  return snap;
}

/** نصف مبلغ الدعم يروح للأونر عبر السيرفر، ثم ينعكس في إعدادات Profits. */
export async function recordOwnerSupportHalf(input: {
  total: number;
  dedupeKey: string;
  fromId?: string;
  toUserId?: string;
}): Promise<{ ok: boolean; coins: number; usd: number; credited: number }> {
  const total = Math.max(0, Math.floor(Number(input.total) || 0));
  const half = Math.floor(total / 2);
  const key = String(input.dedupeKey || `own_${Date.now()}`);
  if (half <= 0) {
    const cur = readOwnerSupportProfit();
    return { ok: false, ...cur, credited: 0 };
  }
  if (remember(key)) addOwnerSupportProfit(half);
  let coins = readOwnerSupportProfit().coins;
  try {
    const r = await fetch('/api/owner/support-profit', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        total,
        half,
        dedupeKey: key,
        fromId: input.fromId || '',
        toUserId: input.toUserId || '',
      }),
    });
    if (r.ok) {
      const d = await r.json().catch(() => ({})) as { coins?: number };
      if (typeof d.coins === 'number') {
        coins = Math.max(coins, Math.floor(d.coins));
        try { localStorage.setItem(KEY, String(coins)); } catch { /* ignore */ }
        try { window.dispatchEvent(new CustomEvent(OWNER_SUPPORT_PROFIT_EVENT, { detail: { coins, usd: coins / 100 } })); } catch { /* ignore */ }
        try { window.dispatchEvent(new CustomEvent('stooorna:app-profits', { detail: { coins, usd: coins / 100 } })); } catch { /* ignore */ }
      }
    }
  } catch { /* الخصم المحلي للنصف قائم حتى لو الشبكة تأخرت */ }
  return { ok: true, coins, usd: coins / 100, credited: half };
}

export async function syncOwnerSupportProfit(): Promise<{ coins: number; usd: number }> {
  try {
    const r = await fetch('/api/owner/support-profit', { credentials: 'include', cache: 'no-store' });
    if (r.ok) {
      const d = await r.json().catch(() => ({})) as { coins?: number };
      if (typeof d.coins === 'number') {
        const coins = Math.max(readOwnerSupportProfit().coins, Math.floor(d.coins));
        try { localStorage.setItem(KEY, String(coins)); } catch { /* ignore */ }
        const snap = { coins, usd: coins / 100 };
        try { window.dispatchEvent(new CustomEvent(OWNER_SUPPORT_PROFIT_EVENT, { detail: snap })); } catch { /* ignore */ }
        return snap;
      }
    }
  } catch { /* ignore */ }
  return readOwnerSupportProfit();
}
