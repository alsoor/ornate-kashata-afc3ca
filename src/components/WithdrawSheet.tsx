/**
 * WithdrawSheet.tsx — واجهة طلب السحب (بنك IBAN / PayPal)
 * الهوية والرصيد من السيرفر عبر الجلسة؛ لا نرسل userId ولا نثق برصيد المتصفح.
 * الاستخدام داخل WalletSheet:  <WithdrawSheet open={wOpen} onClose={() => setWOpen(false)} />
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

type Method = 'bank' | 'paypal';
type Item = {
  id: string; coins: number; usd: number; method: Method; status: 'pending' | 'approved' | 'paid' | 'rejected' | 'cancelled';
  dest: string; createdAt: number; releaseAt: number; reason?: string; payoutRef?: string;
};
type Cfg = { coinsPerUsd: number; minUsd: number; maxUsdPerRequest: number; holdHours: number; enabled: boolean };

const ERR: Record<string, string> = {
  unauthorized: 'سجّل الدخول أولاً', blocked: 'الحساب غير مسموح له بالسحب', bad_origin: 'طلب غير مصرّح',
  rate_limited: 'محاولات كثيرة، حاول بعد قليل', idempotency_key_required: 'تعذّر إنشاء الطلب، أعد المحاولة',
  account_too_new: 'الحساب جديد، السحب متاح بعد مدة قصيرة', open_request_exists: 'عندك طلب سحب قيد المراجعة',
  invalid_amount: 'المبلغ غير صحيح', below_minimum: 'المبلغ أقل من الحد الأدنى', above_maximum: 'المبلغ أكبر من الحد الأعلى للطلب',
  daily_limit: 'تجاوزت حد السحب اليومي', invalid_paypal_email: 'بريد PayPal غير صحيح', invalid_holder_name: 'اسم صاحب الحساب غير صحيح',
  invalid_bank_name: 'اكتب اسم البنك', invalid_iban: 'رقم IBAN غير صحيح', invalid_swift: 'رمز SWIFT غير صحيح',
  invalid_method: 'اختر طريقة السحب', destination_in_use: 'هذا الحساب مرتبط بمستخدم آخر', insufficient_earnings: 'أرباح الدعم لا تكفي',
  step_up_required: 'يلزم تأكيد الهوية أولاً', unavailable: 'السحب غير متاح حالياً', not_cancellable: 'لا يمكن إلغاء هذا الطلب',
  server_error: 'حدث خطأ، حاول لاحقاً',
};
const STATUS: Record<Item['status'], { t: string; c: string }> = {
  pending: { t: 'قيد المراجعة', c: '#facc15' }, approved: { t: 'تمت الموافقة', c: '#38bdf8' }, paid: { t: 'تم التحويل', c: '#4ade80' },
  rejected: { t: 'مرفوض (أُعيد الرصيد)', c: '#f87171' }, cancelled: { t: 'ملغي (أُعيد الرصيد)', c: '#a1a1aa' },
};

async function api<T = any>(url: string, init?: RequestInit): Promise<T & { ok: boolean; error?: string }> {
  try {
    const r = await fetch(url, { credentials: 'include', cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
    return await r.json();
  } catch { return { ok: false, error: 'server_error' } as any; }
}
const newKey = () => (crypto?.randomUUID ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2)}`);

export function WithdrawSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [avail, setAvail] = useState({ coins: 0, usd: 0 });
  const [items, setItems] = useState<Item[]>([]);
  const [method, setMethod] = useState<Method>('paypal');
  const [usdText, setUsdText] = useState('');
  const [email, setEmail] = useState('');
  const [holder, setHolder] = useState('');
  const [bankName, setBankName] = useState('');
  const [iban, setIban] = useState('');
  const [swift, setSwift] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const idem = useRef(newKey()); // نفس المفتاح عند إعادة المحاولة => لا خصم مزدوج

  const refresh = useCallback(async () => {
    const [c, m] = await Promise.all([api<{ coinsPerUsd: number; minUsd: number; maxUsdPerRequest: number; holdHours: number; enabled: boolean }>('/api/withdrawals/config'), api<{ availableCoins: number; availableUsd: number; items: Item[] }>('/api/withdrawals/me')]);
    if (c.ok) setCfg(c as unknown as Cfg);
    if (m.ok) { setAvail({ coins: m.availableCoins, usd: m.availableUsd }); setItems(m.items); }
    else if (m.error) setMsg({ ok: false, t: ERR[m.error] || ERR.server_error });
  }, []);
  useEffect(() => { if (open) { setMsg(null); void refresh(); } }, [open, refresh]);

  if (!open) return null;

  const usd = /^\d{1,4}(\.\d{1,2})?$/.test(usdText.trim()) ? Number(usdText) : 0;
  const coins = cfg ? Math.round(usd * cfg.coinsPerUsd) : 0;
  const hasOpen = items.some((i) => i.status === 'pending' || i.status === 'approved');
  const canSubmit = !!cfg?.enabled && !busy && !hasOpen && usd >= (cfg?.minUsd || 0) && coins <= avail.coins;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true); setMsg(null);
    const details = method === 'paypal' ? { email } : { holderName: holder, bankName, iban, swift };
    const r = await api<{ item: Item }>('/api/withdrawals', {
      method: 'POST', headers: { 'Idempotency-Key': idem.current }, body: JSON.stringify({ coins, method, details }),
    });
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, t: ERR[r.error || ''] || ERR.server_error }); return; }
    idem.current = newKey();
    setUsdText(''); setIban(''); setSwift(''); setHolder(''); setBankName(''); setEmail('');
    setMsg({ ok: true, t: `تم إرسال الطلب. المراجعة تستغرق حتى ${cfg?.holdHours ?? 48} ساعة.` });
    void refresh();
  }
  async function cancel(id: string) {
    setBusy(true);
    const r = await api('/api/withdrawals/' + id + '/cancel', { method: 'POST', body: '{}' });
    setBusy(false);
    setMsg(r.ok ? { ok: true, t: 'تم إلغاء الطلب وأُعيد الرصيد' } : { ok: false, t: ERR[r.error || ''] || ERR.server_error });
    void refresh();
  }

  const input: CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)', background: '#1c1c1c', color: '#fff', fontSize: 15, outline: 'none' };
  const tab = (m: Method): CSSProperties => ({ flex: 1, padding: '10px 0', borderRadius: 10, cursor: 'pointer', fontWeight: 800, border: `1.5px solid ${method === m ? '#facc15' : 'rgba(255,255,255,0.14)'}`, background: method === m ? 'rgba(250,204,21,0.12)' : 'transparent', color: method === m ? '#facc15' : '#d4d4d8' });

  return (
    <div dir="rtl" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxHeight: '92vh', overflowY: 'auto', background: '#111', color: '#fff', borderRadius: '18px 18px 0 0', padding: 18, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <b style={{ flex: 1, fontSize: 17 }}>سحب أرباح الدعم</b>
          <button type="button" onClick={onClose} aria-label="إغلاق" style={{ background: 'none', border: 'none', color: '#a1a1aa', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ background: '#1c1c1c', borderRadius: 12, padding: 14, marginBottom: 12 }}>
          <div style={{ color: '#a1a1aa', fontSize: 12 }}>المتاح للسحب (أرباح الدعم فقط)</div>
          <div style={{ fontSize: 26, fontWeight: 900 }}>${avail.usd.toFixed(2)} <span style={{ fontSize: 12, color: '#a1a1aa', fontWeight: 600 }}>· {avail.coins.toLocaleString('en-US')} Coins</span></div>
          {cfg && <div style={{ color: '#a1a1aa', fontSize: 11, marginTop: 4 }}>الحد الأدنى ${cfg.minUsd} · الأعلى ${cfg.maxUsdPerRequest} للطلب · رصيد الشحن لا يُسحب</div>}
        </div>

        {cfg && !cfg.enabled && <p style={{ color: '#f87171' }}>السحب غير متاح حالياً.</p>}

        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button type="button" style={tab('paypal')} onClick={() => setMethod('paypal')}>PayPal</button>
          <button type="button" style={tab('bank')} onClick={() => setMethod('bank')}>حساب بنكي</button>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <input style={input} inputMode="decimal" placeholder="المبلغ بالدولار" value={usdText} onChange={(e) => setUsdText(e.target.value)} />
          <button type="button" onClick={() => setUsdText(String(Math.min(avail.usd, cfg?.maxUsdPerRequest || avail.usd)))} style={{ background: 'none', border: 'none', color: '#facc15', textAlign: 'right', cursor: 'pointer', padding: 0, fontSize: 12 }}>سحب الحد الأقصى المتاح</button>
          {method === 'paypal' ? (
            <input style={input} type="email" dir="ltr" autoComplete="off" placeholder="PayPal email" value={email} onChange={(e) => setEmail(e.target.value)} />
          ) : (
            <>
              <input style={input} autoComplete="off" placeholder="اسم صاحب الحساب (مثل الهوية)" value={holder} onChange={(e) => setHolder(e.target.value)} />
              <input style={input} autoComplete="off" placeholder="اسم البنك" value={bankName} onChange={(e) => setBankName(e.target.value)} />
              <input style={input} dir="ltr" autoComplete="off" placeholder="IBAN" value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())} />
              <input style={input} dir="ltr" autoComplete="off" placeholder="SWIFT / BIC" value={swift} onChange={(e) => setSwift(e.target.value.toUpperCase())} />
            </>
          )}
          {hasOpen && <p style={{ margin: 0, color: '#facc15', fontSize: 12 }}>عندك طلب قيد المراجعة؛ انتظر اكتماله أو ألغِه.</p>}
          {msg && <p style={{ margin: 0, color: msg.ok ? '#4ade80' : '#f87171', fontSize: 13 }}>{msg.t}</p>}
          <button type="button" disabled={!canSubmit} onClick={submit} style={{ padding: 14, borderRadius: 12, border: 'none', fontWeight: 900, fontSize: 15, cursor: canSubmit ? 'pointer' : 'not-allowed', background: canSubmit ? '#facc15' : '#3f3f46', color: canSubmit ? '#000' : '#a1a1aa' }}>
            {busy ? '...' : 'إرسال طلب السحب'}
          </button>
        </div>

        {items.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <b style={{ fontSize: 14 }}>طلباتي</b>
            {items.map((i) => (
              <div key={i.id} style={{ background: '#1c1c1c', borderRadius: 10, padding: 12, marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontWeight: 800 }}>${i.usd.toFixed(2)} · {i.method === 'paypal' ? 'PayPal' : 'بنك'}</span>
                  <span style={{ color: STATUS[i.status].c, fontSize: 12, fontWeight: 800 }}>{STATUS[i.status].t}</span>
                </div>
                <div dir="ltr" style={{ color: '#a1a1aa', fontSize: 12, textAlign: 'right' }}>{i.dest}</div>
                {i.reason && <div style={{ color: '#f87171', fontSize: 12 }}>السبب: {i.reason}</div>}
                {i.payoutRef && <div dir="ltr" style={{ color: '#4ade80', fontSize: 12, textAlign: 'right' }}>Ref: {i.payoutRef}</div>}
                {i.status === 'pending' && <button type="button" disabled={busy} onClick={() => cancel(i.id)} style={{ marginTop: 6, background: 'none', border: '1px solid #52525b', color: '#e4e4e7', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 12 }}>إلغاء الطلب</button>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default WithdrawSheet;
