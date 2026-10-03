/**
 * lib/giftStrictPatch.ts — دعم البث (صاحب البث ↔ المستخدم) بشرط رصيد حقيقي فقط.
 *
 * المشكلة: الواجهة كانت تثق برصيد localStorage (قديم/غير مطابق للسيرفر)، وحتى تُرسل رصيدها للسيرفر
 * (حساب الأدمن يقدر يضبط الرصيد من العميل) — فيمرّ الدعم والرصيد صفر.
 *
 * الحل: السيرفر هو المصدر الوحيد للحقيقة.
 *   1) قبل أي دعم: نقرأ الرصيد الفعلي من السيرفر.
 *   2) الخصم يتم على السيرفر (/api/support/spend) — أي فشل (رصيد غير كافٍ، شبكة، تسجيل دخول) = لا دعم.
 *   3) لا يوجد أي "خصم محلي احتياطي" بعد الآن.
 */

export type ServerWallet = { balance: number; earnings: number };

export type StrictSpendResult =
  | { ok: true; balance: number }
  | { ok: false; code: 'insufficient' | 'auth' | 'network' | 'rejected'; error: string };

const toInt = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));

/** الرصيد وأرباح الدعم من السيرفر. null = تعذّر التحقق (لا نسمح بالدعم). */
export async function fetchServerWallet(): Promise<ServerWallet | null> {
  try {
    const r = await fetch('/api/gifts/balance', { credentials: 'include', cache: 'no-store' });
    if (!r.ok) return null;
    const d = (await r.json().catch(() => null)) as { balance?: number; earnings?: number } | null;
    if (!d || typeof d.balance !== 'number') return null;
    return { balance: toInt(d.balance), earnings: toInt(d.earnings) };
  } catch {
    return null;
  }
}

/** خصم الدعم على السيرفر. لا يرجع ok إلا إذا السيرفر فعلاً خصم. */
export async function strictGiftSpend(a: { giftId: string; toUserId: string; price: number; count: number }): Promise<StrictSpendResult> {
  const dedupeKey = `tap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    const r = await fetch('/api/support/spend', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ giftId: a.giftId, toUserId: a.toUserId, price: a.price, count: a.count, dedupeKey }),
    });
    const d = (await r.json().catch(() => ({}))) as { ok?: boolean; balance?: number; error?: string };
    if (r.status === 402 || d.error === 'insufficient balance') {
      return { ok: false, code: 'insufficient', error: 'رصيدك غير كافٍ — اشحن Coins' };
    }
    if (r.status === 401) return { ok: false, code: 'auth', error: 'سجّل دخولك أولاً' };
    if (!r.ok || d.ok !== true || typeof d.balance !== 'number') {
      return { ok: false, code: 'rejected', error: 'تعذّر إرسال الدعم' };
    }
    return { ok: true, balance: toInt(d.balance) };
  } catch {
    return { ok: false, code: 'network', error: 'تعذّر الاتصال — لم يتم الدعم ولم يُخصم شيء' };
  }
}

/** يكتب الرصيد/الأرباح المحلية مطابقة للسيرفر فقط (بدون إرسال أي شيء للسيرفر). */
export function mirrorWalletLocally(uid: string, w: ServerWallet) {
  try {
    localStorage.setItem(`stooorna_coins_balance_${uid || 'guest'}`, String(w.balance));
    localStorage.setItem(`stooorna_coins_earnings_${uid || 'guest'}`, String(w.earnings));
    // العرض يتحدّث (نفس الأحداث اللي تستخدمها LiveCoinsDock)
    window.dispatchEvent(new CustomEvent('stooorna:coins-balance', { detail: { userId: uid, balance: w.balance } }));
    window.dispatchEvent(new CustomEvent('stooorna:coins-earnings', { detail: { userId: uid, earnings: w.earnings } }));
  } catch { /* ignore */ }
}
