/**
 * LiveCoinsDock — شحن Coins بالفيزا + مربع الهدايا داخل البث الصوتي والمرئي.
 *
 *  - النقطة الصفراء  → مربع شحن Coins (6 باقات) ثم مربع الدفع بالفيزا
 *  - النقطة الزرقاء  → مربع الهدايا (6 مربعات فيها "+" للمستقبل)
 *  - الرصيد يظهر بزاوية المربعين، ويزيد بعد نجاح الدفع
 *
 * مهم: PAYMENT_DEMO_MODE = true يعني الدفع تجريبي (ما يخصم أي مبلغ).
 * قبل الإطلاق الفعلي اربطه ببوابة دفع (processVisaPayment) وخله false.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, CreditCard, Lock } from 'lucide-react';

// ── إعدادات ─────────────────────────────────────────────────────────────
const PAYMENT_DEMO_MODE = true;

// مواضع النقطتين (فوق نقاط LiveVipDock الموجودة). عدّل الأرقام إذا ما انطبقت.
const YELLOW_DOT_RIGHT = 74; // px من اليمين (نفس القيمة للبث الصوتي والمرئي)
const BLUE_DOT_RIGHT = 38;   // px من اليمين
const DOTS_BOTTOM_OFFSET = 33; // px فوق حد الشريط السفلي
const DOT_SIZE = 11; // حجم النقطتين (الصفراء والزرقاء نفس الحجم)

const PACKS: { id: string; coins: number; usd: number }[] = [
  { id: 'p50', coins: 50, usd: 0.5 },
  { id: 'p500', coins: 500, usd: 5 },
  { id: 'p1500', coins: 1500, usd: 20 },
  { id: 'p5500', coins: 5500, usd: 50 },
  { id: 'p7000', coins: 7000, usd: 80 },
  { id: 'p10000', coins: 10000, usd: 100 },
];

const fmtCoins = (n: number) => n.toLocaleString('en-US');
const fmtUsd = (n: number) => `USD ${n.toFixed(2)}`;

// ── الرصيد ──────────────────────────────────────────────────────────────
const balanceKey = (uid: string) => `stooorna_coins_balance_${uid || 'guest'}`;
function readBalance(uid: string): number {
  try {
    const n = Number(localStorage.getItem(balanceKey(uid)) || 0);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}
function writeBalance(uid: string, n: number) {
  try {
    localStorage.setItem(balanceKey(uid), String(Math.max(0, Math.floor(n))));
    window.dispatchEvent(new CustomEvent('stooorna:coins-balance', { detail: { userId: uid, balance: n } }));
  } catch { /* ignore */ }
}

// ── الدفع ───────────────────────────────────────────────────────────────
// نقطة الربط ببوابة الدفع. لا ترسل بيانات البطاقة الخام لسيرفرك؛ استخدم توكن من البوابة.
async function processVisaPayment(pack: { id: string; coins: number; usd: number }): Promise<{ ok: boolean; balance?: number; error?: string }> {
  if (PAYMENT_DEMO_MODE) {
    await new Promise(r => setTimeout(r, 1200));
    return { ok: true };
  }
  try {
    const r = await fetch('/api/coins/checkout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packId: pack.id, coins: pack.coins, amountUsd: pack.usd, method: 'visa' }),
    });
    if (!r.ok) return { ok: false, error: 'Payment failed' };
    const d = await r.json().catch(() => ({})) as { balance?: number };
    return { ok: true, balance: typeof d.balance === 'number' ? d.balance : undefined };
  } catch {
    return { ok: false, error: 'Network error' };
  }
}

function luhnOk(num: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = num.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

// ── عناصر مشتركة ────────────────────────────────────────────────────────
function CoinIcon({ size = 26 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: 'radial-gradient(circle at 32% 28%, #fff1a8 0%, #f7c531 45%, #c98a06 100%)',
        border: '1.5px solid #e8a90c',
        boxShadow: 'inset 0 -2px 3px rgba(150,90,0,0.35)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color: '#8a5a00', fontWeight: 900, fontSize: size * 0.5, lineHeight: 1,
      }}
    >
      S
    </span>
  );
}

function BalancePill({ balance }: { balance: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px 4px 8px',
      borderRadius: 999, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
      direction: 'rtl',
    }}>
      <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: 700 }}>رصيد</span>
      <CoinIcon size={18} />
      <span style={{ color: '#fff', fontWeight: 800, fontSize: 13 }}>{fmtCoins(balance)}</span>
    </div>
  );
}

function Sheet({ open, onClose, title, balance, children, z = 9100 }: {
  open: boolean; onClose: () => void; title: string; balance: number; children: React.ReactNode; z?: number;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key={title}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, zIndex: z, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
        >
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            onClick={e => e.stopPropagation()}
            role="dialog" aria-label={title}
            style={{
              width: '100%', maxWidth: 520, boxSizing: 'border-box',
              background: '#121212', borderTopLeftRadius: 20, borderTopRightRadius: 20,
              padding: '14px 14px max(18px, env(safe-area-inset-bottom, 0px))',
              maxHeight: '88dvh', overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <BalancePill balance={balance} />
              <p style={{ margin: 0, flex: 1, textAlign: 'center', color: '#fff', fontWeight: 800, fontSize: 16 }}>{title}</p>
              <button type="button" onClick={onClose} aria-label="Close"
                style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                <X size={18} />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const CARD: React.CSSProperties = {
  background: '#2a2a2a', borderRadius: 12, boxSizing: 'border-box',
  border: '1.5px solid transparent', minHeight: 104,
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
  cursor: 'pointer', padding: '10px 6px', color: '#fff',
};

// ── المكوّن الرئيسي ─────────────────────────────────────────────────────
export function LiveCoinsDock({ currentUserId, yellowRight = YELLOW_DOT_RIGHT }: { hostId?: string; currentUserId?: string; yellowRight?: number }) {
  const uid = String(currentUserId || '');
  const [balance, setBalance] = useState<number>(() => readBalance(uid));
  const [coinsOpen, setCoinsOpen] = useState(false);
  const [giftsOpen, setGiftsOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [packId, setPackId] = useState<string>(PACKS[0].id);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [paidToast, setPaidToast] = useState(false);

  const [cardNum, setCardNum] = useState('');
  const [cardExp, setCardExp] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [cardName, setCardName] = useState('');

  const pack = useMemo(() => PACKS.find(p => p.id === packId) || PACKS[0], [packId]);

  useEffect(() => { setBalance(readBalance(uid)); }, [uid]);
  useEffect(() => {
    const on = () => setBalance(readBalance(uid));
    window.addEventListener('stooorna:coins-balance', on);
    window.addEventListener('storage', on);
    return () => {
      window.removeEventListener('stooorna:coins-balance', on);
      window.removeEventListener('storage', on);
    };
  }, [uid]);
  useEffect(() => {
    if (PAYMENT_DEMO_MODE || !uid) return;
    fetch('/api/coins/balance', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then((d: { balance?: number } | null) => {
        if (d && typeof d.balance === 'number') { writeBalance(uid, d.balance); setBalance(d.balance); }
      })
      .catch(() => { /* ignore */ });
  }, [uid]);

  function resetCard() { setCardNum(''); setCardExp(''); setCardCvc(''); setCardName(''); setPayError(''); }

  function validateCard(): string {
    const digits = cardNum.replace(/\s/g, '');
    if (digits.length !== 16 || !digits.startsWith('4') || !luhnOk(digits)) return 'رقم فيزا غير صحيح';
    const m = /^(\d{2})\/(\d{2})$/.exec(cardExp);
    if (!m) return 'تاريخ الانتهاء غير صحيح';
    const mm = Number(m[1]); const yy = 2000 + Number(m[2]);
    if (mm < 1 || mm > 12) return 'تاريخ الانتهاء غير صحيح';
    const now = new Date();
    if (yy < now.getFullYear() || (yy === now.getFullYear() && mm < now.getMonth() + 1)) return 'البطاقة منتهية';
    if (!/^\d{3}$/.test(cardCvc)) return 'CVC غير صحيح';
    if (cardName.trim().length < 2) return 'اكتب اسم حامل البطاقة';
    return '';
  }

  async function pay() {
    if (paying) return;
    const err = validateCard();
    if (err) { setPayError(err); return; }
    setPayError('');
    setPaying(true);
    const res = await processVisaPayment(pack);
    setPaying(false);
    if (!res.ok) { setPayError(res.error || 'فشل الدفع'); return; }
    const next = typeof res.balance === 'number' ? res.balance : readBalance(uid) + pack.coins;
    writeBalance(uid, next);
    setBalance(next);
    resetCard();
    setPayOpen(false);
    setPaidToast(true);
    window.setTimeout(() => setPaidToast(false), 2200);
  }

  const dot = (right: number, color: string, label: string, onClick: () => void) => (
    <button
      type="button" aria-label={label} onClick={onClick}
      style={{
        position: 'fixed', zIndex: 9000,
        right: right - 13, bottom: `calc(max(env(safe-area-inset-bottom, 0px), 12px) + ${DOTS_BOTTOM_OFFSET}px - 13px)`,
        width: 36, height: 36, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{ width: DOT_SIZE, height: DOT_SIZE, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />
    </button>
  );

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '12px 12px', borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.14)', background: '#1c1c1c', color: '#fff', fontSize: 15, outline: 'none',
  };

  return (
    <>
      {dot(yellowRight, '#facc15', 'Coins', () => { setGiftsOpen(false); setCoinsOpen(true); })}
      {dot(BLUE_DOT_RIGHT, '#1d7cf2', 'Gifts', () => { setCoinsOpen(false); setGiftsOpen(true); })}

      {/* مربع شحن Coins */}
      <Sheet open={coinsOpen} onClose={() => setCoinsOpen(false)} title="Coins" balance={balance}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {PACKS.map(p => {
            const on = p.id === packId;
            return (
              <button key={p.id} type="button" onClick={() => setPackId(p.id)}
                style={{ ...CARD, border: on ? '1.5px solid #8b12ff' : '1.5px solid transparent' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <CoinIcon size={22} />
                  <span style={{ fontWeight: 800, fontSize: 17 }}>{fmtCoins(p.coins)}</span>
                </span>
                <span style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 700, fontSize: 12.5 }}>{fmtUsd(p.usd)}</span>
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => { resetCard(); setPayOpen(true); }}
          style={{
            width: '100%', marginTop: 14, padding: '14px 10px', borderRadius: 14, border: 'none', cursor: 'pointer',
            background: '#8b12ff', color: '#fff', fontWeight: 800, fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
          Get <CoinIcon size={20} /> {fmtCoins(pack.coins)} ({fmtUsd(pack.usd)})
        </button>
      </Sheet>

      {/* مربع الدفع بالفيزا */}
      <Sheet open={payOpen} onClose={() => { if (!paying) setPayOpen(false); }} title="Visa" balance={balance} z={9200}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, color: '#fff' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800 }}>
            <CoinIcon size={20} /> {fmtCoins(pack.coins)}
          </span>
          <span style={{ fontWeight: 800 }}>{fmtUsd(pack.usd)}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, direction: 'ltr' }}>
          <div style={{ position: 'relative' }}>
            <input
              value={cardNum} inputMode="numeric" autoComplete="cc-number" placeholder="Card number"
              onChange={e => {
                const d = e.target.value.replace(/\D/g, '').slice(0, 16);
                setCardNum(d.replace(/(.{4})/g, '$1 ').trim());
              }}
              style={{ ...inputStyle, paddingRight: 44 }}
            />
            <CreditCard size={18} color="rgba(255,255,255,0.45)" style={{ position: 'absolute', right: 12, top: 14 }} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              value={cardExp} inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY"
              onChange={e => {
                const d = e.target.value.replace(/\D/g, '').slice(0, 4);
                setCardExp(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
              }}
              style={inputStyle}
            />
            <input
              value={cardCvc} inputMode="numeric" autoComplete="cc-csc" placeholder="CVC" type="password"
              onChange={e => setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 3))}
              style={inputStyle}
            />
          </div>
          <input
            value={cardName} autoComplete="cc-name" placeholder="Name on card"
            onChange={e => setCardName(e.target.value)} style={inputStyle}
          />
        </div>
        {payError ? <p style={{ margin: '10px 0 0', color: '#f87171', fontSize: 13, fontWeight: 700, textAlign: 'center' }}>{payError}</p> : null}
        <button type="button" disabled={paying} onClick={() => void pay()}
          style={{
            width: '100%', marginTop: 14, padding: '14px 10px', borderRadius: 14, border: 'none',
            cursor: paying ? 'default' : 'pointer', opacity: paying ? 0.7 : 1,
            background: '#8b12ff', color: '#fff', fontWeight: 800, fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
          <Lock size={16} /> {paying ? 'Processing…' : `Pay ${fmtUsd(pack.usd)}`}
        </button>
        {PAYMENT_DEMO_MODE ? (
          <p style={{ margin: '10px 0 0', color: 'rgba(255,255,255,0.4)', fontSize: 11, textAlign: 'center' }}>
            وضع تجريبي — لا يتم خصم أي مبلغ من البطاقة
          </p>
        ) : null}
      </Sheet>

      {/* مربع الهدايا: 6 مربعات فيها + للمستقبل */}
      <Sheet open={giftsOpen} onClose={() => setGiftsOpen(false)} title="Gifts" balance={balance}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} style={{ ...CARD, cursor: 'default' }}>
              <Plus size={30} color="rgba(255,255,255,0.55)" strokeWidth={2.4} />
            </div>
          ))}
        </div>
      </Sheet>

      <AnimatePresence>
        {paidToast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{
              position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 90, zIndex: 9300,
              background: '#16a34a', color: '#fff', padding: '10px 16px', borderRadius: 999, fontWeight: 800, fontSize: 14,
              boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
            }}
          >
            ✓ تم الشحن +{fmtCoins(pack.coins)}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default LiveCoinsDock;
