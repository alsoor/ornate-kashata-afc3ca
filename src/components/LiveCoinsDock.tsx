/**
 * LiveCoinsDock — شحن Coins بالفيزا + مربع الهدايا داخل البث الصوتي والمرئي.
 *
 *  - النقطة الصفراء  → مربع شحن Coins (6 باقات) ثم مربع الدفع بالفيزا
 *  - النقطة الزرقاء  → مربع الهدايا (6 مربعات فيها "+" للمستقبل)
 *  - الرصيد يظهر بزاوية المربعين، ويزيد بعد نجاح الدفع
 *  - Custom: المستخدم يكتب عدد Coins بنفسه والسعر USD يتحسب بالضبط (بالسنت، بدون كسور عشرية)
 *  - الهدية: كل نقرة تزيد العداد 1 2 3 ... وبعد توقف النقر تنرسل الهدية بعدد المرات وتنخصم بعدد المرات
 *
 *  - WalletSheet (مصدّر): صفحة الرصيد من زر $ في الإعدادات — Balance (أرباح الدعم + Withdrawal إلى PayPal) | Deposit (+ شحن مخصّص بالفيزا يزيد رصيد الهدايا مباشرة)
 *
 * مهم: PAYMENT_DEMO_MODE = true يعني الدفع تجريبي (ما يخصم أي مبلغ).
 * قبل الإطلاق الفعلي اربطه ببوابة دفع (processVisaPayment) وخله false.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, CreditCard, Lock, Pencil, ExternalLink, Gift as GiftIcon, DollarSign } from 'lucide-react';
import { GIFTS, TOP_GIFTS, ALL_GIFTS } from '@/lib/index';
import type { GiftDefinition } from '@/lib/types';

// ── إعدادات ─────────────────────────────────────────────────────────────
const PAYMENT_DEMO_MODE = true;

// ترتيب عرض شبكة الهدايا الرئيسية (فهرس داخل GIFTS):
// 0 حديقة، 1 بركان، 2 مطر، 3 قلعة  →  عرض: حديقة | قلعة | بركان | مطر | + | +
const MAIN_GIFT_ORDER = [0, 3, 1, 2, 4, 5];

// أسعار مخصّصة حسب فهرس GIFTS (لا تغيّر تعريف الهدية في lib — فقط العرض والخصم هنا)
// 1 بركان → 1500 | 2 مطر → 3500 | 3 قلعة → 1000
const GIFT_PRICE_BY_INDEX: Record<number, number> = {
  1: 1500,
  2: 3500,
  3: 1000,
};

/** خريطة id → سعر فعّال (تُبنى مرة من GIFTS + التجاوزات أعلاه) */
const GIFT_PRICE_BY_ID: Map<string, number> = (() => {
  const m = new Map<string, number>();
  GIFTS.forEach((g, i) => {
    if (!g?.id) return;
    const override = GIFT_PRICE_BY_INDEX[i];
    m.set(g.id, override != null ? override : g.price);
  });
  return m;
})();

function giftPrice(gift: GiftDefinition): number {
  return GIFT_PRICE_BY_ID.get(gift.id) ?? gift.price;
}

// قواعد الهدايا:
//  - المشاهد: يدعم صاحب البث، أو أي متحدث أعطاه صاحب البث المايك.
//  - صاحب البث: يدعم فقط من أخذ المايك (ما يقدر ينزل دعم عشوائي).
//  - المشاهد العادي (بدون مايك) ما ينعطي هدية من أي أحد. ولا أحد يعطي نفسه.

// مواضع النقطتين (فوق نقاط LiveVipDock الموجودة). عدّل الأرقام إذا ما انطبقت.
const YELLOW_DOT_RIGHT = 74; // px من اليمين (نفس القيمة للبث الصوتي والمرئي)
const BLUE_DOT_RIGHT = 28;   // px من اليمين (moved ~10px to the right)
const DOTS_BOTTOM_OFFSET = 33; // px فوق حد الشريط السفلي
const DOT_SIZE = 11; // حجم النقطتين (الصفراء والزرقاء نفس الحجم)
void DOT_SIZE; // kept for compatibility (buttons now sized like the hand button)

const PACKS: { id: string; coins: number; usd: number }[] = [
  { id: 'p50', coins: 50, usd: 0.5 },
  { id: 'p500', coins: 500, usd: 5 },
  { id: 'p1500', coins: 1500, usd: 20 },
  { id: 'p5500', coins: 5500, usd: 50 },
  { id: 'p7000', coins: 7000, usd: 80 },
  { id: 'p10000', coins: 10000, usd: 100 },
];

// ── Custom: عدد Coins حر ────────────────────────────────────────────────
// السعر يتحسب بالسنت (أعداد صحيحة) عشان ما يصير أي خلل بالكسور: USD = coins × CUSTOM_CENTS_PER_COIN ÷ 100
const CUSTOM_ID = 'custom';
const CUSTOM_CENTS_PER_COIN = 1;   // 1 Coin = USD 0.01  (نفس سعر باقة 50 و 500 و 10,000)
const CUSTOM_MIN_COINS = 50;       // أقل عدد (USD 0.50)
const CUSTOM_MAX_COINS = 100000;   // أكثر عدد (USD 1,000.00)

// ── تكرار الهدية: كل نقرة تزيد العداد، وبعد هذي المدة بدون نقر تنرسل ──────
const COMBO_WINDOW_MS = 1200;
const COMBO_MAX = 10;              // أقصى عدد مرات بالنقرات المتتالية

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

// ── أرباح الدعم (المبلغ اللي وصلك من الهدايا) + السحب ─────────────────────
const earningsKey = (uid: string) => `stooorna_coins_earnings_${uid || 'guest'}`;
export function readEarnings(uid: string): number {
  try {
    const n = Number(localStorage.getItem(earningsKey(uid)) || 0);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}
function writeEarnings(uid: string, n: number) {
  try {
    localStorage.setItem(earningsKey(uid), String(Math.max(0, Math.floor(n))));
    window.dispatchEvent(new CustomEvent('stooorna:coins-earnings', { detail: { userId: uid, earnings: n } }));
  } catch { /* ignore */ }
}
function addEarnings(uid: string, coins: number) {
  if (!uid || !(coins > 0)) return;
  writeEarnings(uid, readEarnings(uid) + coins);
}
const WITHDRAW_CENTS_PER_COIN = 1;   // قيمة Coin وحدة عند عرض الأرباح بالدولار (1 Coin = USD 0.01) — عدّلها إذا تبي نسبة ثانية
const PAYPAL_URL = 'https://www.paypal.com/myaccount/transfer/homepage';

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
      body: JSON.stringify({ packId: pack.id, coins: pack.coins, amountUsd: pack.usd, amountCents: Math.round(pack.usd * 100), method: 'visa' }),
    });
    if (!r.ok) return { ok: false, error: 'Payment failed' };
    const d = await r.json().catch(() => ({})) as { balance?: number };
    return { ok: true, balance: typeof d.balance === 'number' ? d.balance : undefined };
  } catch {
    return { ok: false, error: 'Network error' };
  }
}

// خصم سعر الهدية. في الوضع التجريبي محلي فقط؛ للإنتاج اربطه بسيرفرك (يخصم ويرجّع الرصيد الجديد).
async function spendCoinsForGift(gift: GiftDefinition, hostId?: string): Promise<{ ok: boolean; balance?: number; error?: string }> {
  if (PAYMENT_DEMO_MODE) return { ok: true };
  try {
    const r = await fetch('/api/gifts/send', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ giftId: gift.id, price: gift.price, hostId }),
    });
    if (!r.ok) return { ok: false, error: 'تعذر إرسال الهدية' };
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
export type SupportLeader = { userId: string; name: string; coins: number };

/** قائمة الداعمين (مرتبة: الأعلى دعماً أول). المراكز 1-3 فقط لهم تاج. */
export function useSupportLeaders(): SupportLeader[] {
  const [list, setList] = useState<SupportLeader[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as { leaders?: SupportLeader[] } | undefined;
      setList(Array.isArray(d?.leaders) ? d!.leaders! : []);
    };
    window.addEventListener('stooorna:support-leaders', on);
    return () => window.removeEventListener('stooorna:support-leaders', on);
  }, []);
  return list;
}

/** تاج المركز: 1 أخضر، 2 أبيض، 3 أحمر (يوضع داخل عنصر position:relative فوق الصورة) */
export function SupportCrown({ rank }: { rank: 1 | 2 | 3 }) {
  const col = rank === 1 ? '#22c55e' : rank === 2 ? '#f8fafc' : '#ef4444';
  return (
    <svg
      aria-hidden="true" width="26" height="18" viewBox="0 0 26 18"
      style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', filter: `drop-shadow(0 0 4px ${col})`, pointerEvents: 'none' }}
    >
      <path d="M2 15 L1 4 L8 9 L13 1 L18 9 L25 4 L24 15 Z" fill={col} stroke="rgba(0,0,0,0.5)" strokeWidth="1" strokeLinejoin="round" />
      <rect x="2" y="14" width="22" height="3.2" rx="1.2" fill={col} stroke="rgba(0,0,0,0.5)" strokeWidth="1" />
    </svg>
  );
}

export function LiveCoinsDock({ hostId, currentUserId, currentUserName, yellowRight = YELLOW_DOT_RIGHT }: { hostId?: string; currentUserId?: string; currentUserName?: string; yellowRight?: number }) {
  const uid = String(currentUserId || '');
  const [balance, setBalance] = useState<number>(() => readBalance(uid));
  const [coinsOpen, setCoinsOpen] = useState(false);
  const [giftsOpen, setGiftsOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [packId, setPackId] = useState<string>(PACKS[0].id);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [paidToast, setPaidToast] = useState(false);
  const [playing, setPlaying] = useState<{ gift: GiftDefinition; key: number } | null>(null);
  const [giftMsg, setGiftMsg] = useState('');
  const [customText, setCustomText] = useState('');
  const [tap, setTap] = useState<{ id: string; n: number } | null>(null);

  // تكرار الهدية + طابور التشغيل
  const tapRef = useRef<{ id: string; n: number } | null>(null);
  const tapTimerRef = useRef<number>(0);
  const busyRef = useRef(false);
  const queueRef = useRef<{ gift: GiftDefinition; toUserId?: string; toName?: string; toAvatar?: string | null }[]>([]);
  const [giftTarget, setGiftTarget] = useState<{ userId: string; name: string; avatarUrl?: string | null } | null>(null);
  const giftTargetRef = useRef<{ userId: string; name: string; avatarUrl?: string | null } | null>(null);
  const tagRestoreRef = useRef<(() => void) | null>(null);
  const speakerIdsRef = useRef<Set<string>>(new Set());   // userIds اللي معهم المايك (تجي من صفحة البث)
  const hostIdRef = useRef(String(hostId || ''));
  hostIdRef.current = String(hostId || '');
  const uidRef = useRef(uid);
  uidRef.current = uid;
  const creditedRef = useRef<Set<string>>(new Set());   // يمنع احتساب نفس الهدية مرتين
  const leadersKeyRef = useRef('');
  const playKeyRef = useRef(0);
  const playingRef = useRef(false);
  // بث الهدايا لباقي الحضور: مفتاح هذا الجهاز + غرفة الهدايا (نفس hostId = نفس الغرفة بالبث الصوتي والمرئي)
  const clientKeyRef = useRef(`gk_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`);
  const giftRoom = `gifts-${String(hostId || 'public').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'public'}`;

  const [cardNum, setCardNum] = useState('');
  const [cardExp, setCardExp] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [cardName, setCardName] = useState('');

  const isCustom = packId === CUSTOM_ID;
  const customCoins = Number(customText) || 0;
  const customValid = customCoins >= CUSTOM_MIN_COINS && customCoins <= CUSTOM_MAX_COINS;
  const pack = useMemo(() => {
    if (packId === CUSTOM_ID) {
      const cents = customCoins * CUSTOM_CENTS_PER_COIN;   // أعداد صحيحة بالسنت
      return { id: CUSTOM_ID, coins: customCoins, usd: cents / 100 };
    }
    return PACKS.find(p => p.id === packId) || PACKS[0];
  }, [packId, customCoins]);
  const canBuy = !isCustom || customValid;

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

  // استقبال هدايا باقي الحضور: كل ثانية ونص نسأل السيرفر عن هدايا جديدة بالغرفة ونشغّلها عندي بنفس الحدث المحلي
  useEffect(() => {
    let stop = false;
    let since: number | null = null;
    let timer = 0;
    const tick = async () => {
      if (stop) return;
      if (!document.hidden) {
        try {
          const firstPoll = since === null;
          const url = `/api/live-gifts?room=${encodeURIComponent(giftRoom)}` + (since === null ? '' : `&since=${since}`);
          const r = await fetch(url, { credentials: 'include', cache: 'no-store' });
          if (r.ok) {
            const d = await r.json() as { events?: { at: number; giftId: string; fromId?: string; toUserId?: string; toName?: string; toAvatar?: string | null; fromKey?: string; count?: number }[]; now?: number; leaders?: SupportLeader[] };
            if (typeof d.now === 'number') since = d.now;
            if (Array.isArray(d.leaders)) {
              const key = JSON.stringify(d.leaders);
              if (key !== leadersKeyRef.current) {
                leadersKeyRef.current = key;
                window.dispatchEvent(new CustomEvent('stooorna:support-leaders', { detail: { leaders: d.leaders } }));
              }
            }
            for (const ev of d.events || []) {
              // أرباح الدعم: الهدية موجّهة لي (من شخص ثاني) → تنضاف لرصيد Balance في المحفظة. أول استعلام (تاريخ قديم) ما ينحسب.
              if (!firstPoll && ev.fromKey !== clientKeyRef.current && ev.toUserId && uidRef.current && String(ev.toUserId) === uidRef.current) {
                const ck = `${ev.at}_${ev.giftId}_${ev.fromKey || ev.fromId || ''}`;
                if (!creditedRef.current.has(ck)) {
                  creditedRef.current.add(ck);
                  addEarnings(uidRef.current, (GIFT_PRICE_BY_ID.get(ev.giftId) ?? 0) * Math.max(1, Number(ev.count) || 1));
                }
              }
              if (ev.fromKey === clientKeyRef.current) continue; // هديتي أنا تشتغل محلياً أصلاً
              window.dispatchEvent(new CustomEvent('stooorna:gift-play', { detail: { giftId: ev.giftId, fromId: ev.fromId, toUserId: ev.toUserId, toName: ev.toName, toAvatar: ev.toAvatar, hostId, count: ev.count || 1, remote: true } }));
            }
          }
        } catch { /* ignore */ }
      }
      if (!stop) timer = window.setTimeout(tick, 1200);
    };
    void tick();
    return () => { stop = true; window.clearTimeout(timer); };
  }, [giftRoom]);

  // تشغيل أنميشن هدية (يستقبل الحدث المحلي، وأي بث مستقبلي لباقي الحضور يرسل نفس الحدث)
  useEffect(() => {
    const onPlay = (e: Event) => {
      const d = (e as CustomEvent).detail as { giftId?: string; count?: number; toUserId?: string; toName?: string; toAvatar?: string | null } | undefined;
      const g = ALL_GIFTS.find(x => x.id === d?.giftId);
      if (!g) return;
      const n = Math.max(1, Math.min(COMBO_MAX, Math.floor(Number(d?.count) || 1)));
      for (let i = 0; i < n; i++) queueRef.current.push({ gift: g, toUserId: d?.toUserId ? String(d.toUserId) : undefined, toName: d?.toName, toAvatar: d?.toAvatar ?? null });
      // إذا ما في هدية شغالة الحين، ابدأ أول واحدة
      if (!playingRef.current) startNext();
    };
    window.addEventListener('stooorna:gift-play', onPlay);
    return () => window.removeEventListener('stooorna:gift-play', onPlay);
  }, []);

  // يشغّل الهدية اللي بعدها بالطابور؛ إذا خلص الطابور يقفل
  function startNext() {
    const next = queueRef.current.shift();
    playingRef.current = !!next;
    applyGiftTarget(next?.toUserId, next?.toName, next?.toAvatar);
    setPlaying(next ? { gift: next.gift, key: ++playKeyRef.current } : null);
  }

  // يوجّه الأنميشن (التاج/الشبح) على صورة المتحدث المستلم بدل صاحب البث: يعلّم صورته بـ data-gift-host مؤقتاً
  function restoreGiftTarget() {
    tagRestoreRef.current?.();
    tagRestoreRef.current = null;
    try { delete (window as unknown as { __stooornaGiftLift?: unknown }).__stooornaGiftLift; } catch { /* ignore */ }
  }
  function applyGiftTarget(toUserId?: string, toName?: string, toAvatar?: string | null) {
    restoreGiftTarget();
    if (!toUserId || toUserId === hostIdRef.current) return;   // الهدية لصاحب البث: الأنميشن الأصلي على صورته
    // معلومات المستلم للأنميشن (البركان): صورته تصعد لمنتصف البث والشبح يلبسه التاج — حتى لو صورته مو ظاهرة بالقائمة
    (window as unknown as { __stooornaGiftLift?: unknown }).__stooornaGiftLift = { userId: toUserId, name: toName || '', avatarUrl: toAvatar || null };
    try {
      const el = document.querySelector<HTMLElement>(`[data-gift-user="${toUserId.replace(/["\\]/g, '')}"]`);
      if (!el) return;
      const others = Array.from(document.querySelectorAll<HTMLElement>('[data-gift-host]')).filter(x => x !== el);
      others.forEach(x => x.removeAttribute('data-gift-host'));
      el.setAttribute('data-gift-host', '1');
      el.setAttribute('data-gift-lift', '1');
      tagRestoreRef.current = () => {
        el.removeAttribute('data-gift-host');
        el.removeAttribute('data-gift-lift');
        others.forEach(x => x.setAttribute('data-gift-host', '1'));
      };
    } catch { /* ignore */ }
  }
  useEffect(() => () => restoreGiftTarget(), []);

  // قائمة اللي معهم المايك (تنرسل من صفحة البث)
  useEffect(() => {
    const onSp = (e: Event) => {
      const ids = ((e as CustomEvent).detail as { userIds?: string[] } | undefined)?.userIds;
      speakerIdsRef.current = new Set(Array.isArray(ids) ? ids.map(String) : []);
    };
    window.addEventListener('stooorna:live-speakers', onSp);
    return () => window.removeEventListener('stooorna:live-speakers', onSp);
  }, []);

  // مين يقدر ينعطي هدية: صاحب البث (من المشاهدين فقط) أو من معه المايك. لا أحد يعطي نفسه.
  function canGiftTo(toId: string): boolean {
    if (!toId || toId === uid) return false;
    const isHostUser = !!(hostId && uid === String(hostId));
    if (speakerIdsRef.current.has(toId)) return true;
    return !isHostUser && !!hostId && toId === String(hostId);
  }

  // اختيار المستلم: يضغط على متحدث بصفحة البث → يجي الحدث هنا ويفتح مربع الهدايا
  useEffect(() => {
    const onTarget = (e: Event) => {
      const d = (e as CustomEvent).detail as { userId?: string; name?: string; avatarUrl?: string | null } | undefined;
      const toId = String(d?.userId || '');
      if (!toId) return;
      if (toId === uid) { flashGiftMsg('ما تقدر تعطي نفسك هدية'); return; }
      if (!canGiftTo(toId)) { flashGiftMsg('الدعم لصاحب البث أو لمن أخذ المايك فقط'); return; }
      const t = { userId: toId, name: String(d?.name || 'User'), avatarUrl: d?.avatarUrl ?? null };
      giftTargetRef.current = t;
      setGiftTarget(t);
      setCoinsOpen(false);
      setGiftsOpen(true);
    };
    window.addEventListener('stooorna:gift-target', onTarget);
    return () => window.removeEventListener('stooorna:gift-target', onTarget);
  }, [uid, hostId]);

  // المستلم الفعلي: اللي اختاره المستخدم. المشاهد بدون اختيار: الهدية لصاحب البث. صاحب البث بدون اختيار: ما فيه مستلم.
  function resolveGiftTarget(): { userId: string; name: string; avatarUrl?: string | null } | null {
    const t = giftTargetRef.current;
    if (t) return t;
    if (hostId && String(hostId) !== uid) return { userId: String(hostId), name: 'Host' };
    return null;
  }

  // لما تخلص الهدية: شغّل اللي بعدها (نفس الهدية مرة ثانية) لين يخلص العدد
  function onGiftDone() { startNext(); }

  useEffect(() => () => window.clearTimeout(tapTimerRef.current), []);

  function flashGiftMsg(msg: string) {
    setGiftMsg(msg);
    window.setTimeout(() => setGiftMsg(''), 2400);
  }

  // إرسال الهدية بعد ما يخلص النقر: يخصم السعر بعدد النقرات (كل مرة طلب خصم مثل قبل) ثم يشغّلها بنفس العدد
  async function commitTap() {
    const t = tapRef.current;
    window.clearTimeout(tapTimerRef.current);
    if (!t) return;
    tapRef.current = null;
    setTap(null);
    const gift = ALL_GIFTS.find(g => g.id === t.id);
    if (!gift) return;
    const price = giftPrice(gift);
    const target = resolveGiftTarget();
    if (!target) { flashGiftMsg('اضغط على صورة متحدث واختر إرسال هدية'); return; }
    if (target.userId === uid) { flashGiftMsg('ما تقدر تعطي نفسك هدية'); return; }
    if (!canGiftTo(target.userId)) { flashGiftMsg('الدعم لصاحب البث أو لمن أخذ المايك فقط'); return; }
    busyRef.current = true;
    let bal = readBalance(uid);
    let sent = 0;
    for (let i = 0; i < t.n; i++) {
      if (bal < price) break;
      const res = await spendCoinsForGift({ ...gift, price }, hostId);
      if (!res.ok) { flashGiftMsg(res.error || 'تعذر إرسال الهدية'); break; }
      bal = typeof res.balance === 'number' ? res.balance : bal - price;
      writeBalance(uid, bal);
      setBalance(bal);
      sent++;
    }
    busyRef.current = false;
    if (sent === 0) return;
    setGiftsOpen(false);
    // تشغيل الأنميشن عندي (بعدد المرات). الإرسال لباقي الحضور يتم تحت عبر /api/live-gifts.
    window.dispatchEvent(new CustomEvent('stooorna:gift-play', { detail: { giftId: gift.id, fromId: uid, hostId, toUserId: target.userId, toName: target.name, toAvatar: target.avatarUrl ?? null, count: sent } }));
    giftTargetRef.current = null;
    setGiftTarget(null);
    // بث الهدية لكل من في البث (يشوفونها عندهم بنفس الأنميشن)
    void fetch('/api/live-gifts', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: giftRoom, giftId: gift.id, count: sent, price, fromId: uid, fromName: String(currentUserName || ''), toUserId: target.userId, toName: target.name, toAvatar: target.avatarUrl ?? null, fromKey: clientKeyRef.current, id: `lg_${clientKeyRef.current}_${Date.now()}` }),
    }).catch(() => { /* ignore */ });
  }

  // كل نقرة على الهدية تزيد العداد 1 2 3 ... وبعد ما يوقف النقر تنرسل
  async function tapGift(gift: GiftDefinition) {
    if (busyRef.current) return;
    // نقر على هدية ثانية وفي هدية معلّقة: أرسل المعلّقة أول
    if (tapRef.current && tapRef.current.id !== gift.id) await commitTap();
    const cur = tapRef.current && tapRef.current.id === gift.id ? tapRef.current.n : 0;
    const nextN = cur + 1;
    const bal = readBalance(uid);
    const price = giftPrice(gift);
    if (bal < price * nextN) {
      if (cur === 0) {
        setGiftsOpen(false);
        setCoinsOpen(true);
        flashGiftMsg('رصيدك غير كافٍ — اشحن Coins');
        return;
      }
      flashGiftMsg(`رصيدك يكفي ${cur} فقط`);
    } else if (nextN > COMBO_MAX) {
      flashGiftMsg(`الحد الأقصى ${COMBO_MAX} مرات`);
    } else {
      tapRef.current = { id: gift.id, n: nextN };
      setTap({ id: gift.id, n: nextN });
    }
    window.clearTimeout(tapTimerRef.current);
    if (tapRef.current) tapTimerRef.current = window.setTimeout(() => { void commitTap(); }, COMBO_WINDOW_MS);
  }

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

  // Dock buttons: fixed 30px in both audio and video broadcasts, same position
  const BTN = 30; // same size for audio and video broadcasts
  const ICON = 14;
  const dot = (right: number, color: string, label: string, icon: React.ReactNode, onClick: () => void) => (
    <button
      type="button" aria-label={label} title={label} onClick={onClick}
      style={{
        position: 'fixed', zIndex: 9000,
        right: right - BTN / 2 + 5,
        bottom: `calc(max(env(safe-area-inset-bottom, 0px), 12px) + ${DOTS_BOTTOM_OFFSET}px + 5px - ${BTN / 2}px)`,
        width: BTN, height: BTN, padding: 0, borderRadius: '50%', boxSizing: 'border-box',
        background: 'rgba(0,0,0,0.35)', border: `1.5px solid ${color}`, boxShadow: `0 0 8px ${color}88`,
        color, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent',
      }}
    >
      {icon}
    </button>
  );

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '12px 12px', borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.14)', background: '#1c1c1c', color: '#fff', fontSize: 15, outline: 'none',
  };

  return (
    <>
      {dot(yellowRight + (BTN - 36), '#facc15', 'Coins', <DollarSign size={ICON + 1} color="#facc15" strokeWidth={2.6} />, () => { setGiftsOpen(false); setCoinsOpen(true); })}
      {dot(BLUE_DOT_RIGHT, '#1d7cf2', 'Gifts', <GiftIcon size={ICON} color="#1d7cf2" strokeWidth={2.2} />, () => {
        setCoinsOpen(false);
        if (!resolveGiftTarget()) { flashGiftMsg('اضغط على صورة متحدث واختر إرسال هدية'); return; }
        setGiftsOpen(true);
      })}

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
          {/* Custom: يكتب عدد Coins اللي يبيه والسعر يطلع بالضبط */}
          <div
            role="button" tabIndex={0} onClick={() => setPackId(CUSTOM_ID)}
            onKeyDown={e => { if (e.key === 'Enter') setPackId(CUSTOM_ID); }}
            style={{
              ...CARD, gridColumn: '1 / -1', minHeight: 60, flexDirection: 'row', justifyContent: 'space-between',
              padding: '10px 14px', gap: 10, border: isCustom ? '1.5px solid #8b12ff' : '1.5px solid transparent',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 16 }}>
              <Pencil size={18} /> Custom
            </span>
            {isCustom ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, direction: 'ltr' }}>
                <CoinIcon size={20} />
                <input
                  autoFocus value={customText} inputMode="numeric" placeholder="Coins" aria-label="Custom coins"
                  onClick={e => e.stopPropagation()}
                  onChange={e => setCustomText(e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 6))}
                  style={{
                    width: 96, boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, textAlign: 'right',
                    border: '1px solid rgba(255,255,255,0.18)', background: '#1c1c1c', color: '#fff',
                    fontSize: 16, fontWeight: 800, outline: 'none',
                  }}
                />
                <span style={{ minWidth: 92, textAlign: 'right', color: customValid ? '#fff' : 'rgba(255,255,255,0.4)', fontWeight: 800, fontSize: 14 }}>
                  {customValid ? fmtUsd(pack.usd) : 'USD —'}
                </span>
              </span>
            ) : (
              <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 700, fontSize: 12.5 }}>اكتب أي عدد تبيه</span>
            )}
          </div>
        </div>
        {isCustom ? (
          <p style={{
            margin: '8px 2px 0', textAlign: 'center', fontSize: 12, fontWeight: 700,
            color: customText && !customValid ? '#f87171' : 'rgba(255,255,255,0.45)',
          }}>
            {fmtCoins(CUSTOM_MIN_COINS)} – {fmtCoins(CUSTOM_MAX_COINS)} Coins · 1 Coin = {fmtUsd(CUSTOM_CENTS_PER_COIN / 100)}
          </p>
        ) : null}
        <button type="button" disabled={!canBuy} onClick={() => { if (!canBuy) return; resetCard(); setPayOpen(true); }}
          style={{
            width: '100%', marginTop: 14, padding: '14px 10px', borderRadius: 14, border: 'none',
            cursor: canBuy ? 'pointer' : 'default', opacity: canBuy ? 1 : 0.5,
            background: '#8b12ff', color: '#fff', fontWeight: 800, fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
          {canBuy
            ? <>Get <CoinIcon size={20} /> {fmtCoins(pack.coins)} ({fmtUsd(pack.usd)})</>
            : <>Enter Coins amount</>}
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
      <Sheet open={giftsOpen} onClose={() => { setGiftsOpen(false); giftTargetRef.current = null; setGiftTarget(null); }} title={giftTarget ? `Gifts → ${giftTarget.name}` : (hostId && uid !== String(hostId) ? 'Gifts → Host' : 'Gifts')} balance={balance}>
        {/* صف علوي: 3 مربعات صغيرة فيها + (مكان هدايا مستقبلية) — بين هيد الرصيد وبقية الهدايا */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
          {[0, 1, 2].map(i => {
            const gift = TOP_GIFTS[i];
            if (!gift) {
              return (
                <div key={`top-${i}`} style={{ ...CARD, cursor: 'default', minHeight: 56, height: 56, padding: '6px' }}>
                  <Plus size={22} color="rgba(255,255,255,0.55)" strokeWidth={2.4} />
                </div>
              );
            }
            const count = tap && tap.id === gift.id ? tap.n : 0;
            return (
              <button key={gift.id} type="button" aria-label={`${gift.name} — ${gift.price} Coins`}
                onClick={() => void tapGift(gift)}
                style={{
                  ...CARD, position: 'relative', flexDirection: 'row', gap: 6, minHeight: 56, height: 56, padding: '4px 6px',
                  touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
                  border: count ? '1.5px solid #8b12ff' : '1.5px solid rgba(255,45,85,0.35)',
                }}>
                <gift.Preview size={40} />
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.8)', fontWeight: 800, fontSize: 12.5, lineHeight: '16px' }}>
                  <CoinIcon size={14} /> {fmtCoins(gift.price)}
                </span>
                <AnimatePresence>
                  {count > 0 && (
                    <motion.span
                      key={count}
                      initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 520, damping: 22 }}
                      style={{
                        position: 'absolute', top: 3, right: 4, minWidth: 22, height: 22, padding: '0 5px', boxSizing: 'border-box',
                        borderRadius: 11, background: '#8b12ff', color: '#fff', fontWeight: 900, fontSize: 13,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 10px rgba(139,18,255,0.6)', pointerEvents: 'none',
                      }}
                    >
                      {count}
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            );
          })}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {/* ترتيب: حديقة | قلعة(1000) مكان البركان | بركان(1500) | مطر(3500) مكان القلعة | + | + */}
          {MAIN_GIFT_ORDER.map(i => {
            const gift = GIFTS[i];
            if (!gift) {
              return (
                <div key={i} style={{ ...CARD, cursor: 'default' }}>
                  <Plus size={30} color="rgba(255,255,255,0.55)" strokeWidth={2.4} />
                </div>
              );
            }
            const price = giftPrice(gift);
            const count = tap && tap.id === gift.id ? tap.n : 0;
            return (
              <button key={gift.id} type="button" aria-label={`${gift.name} — ${price} Coins`}
                onClick={() => void tapGift(gift)}
                style={{
                  ...CARD, position: 'relative', justifyContent: 'flex-start', padding: '8px 4px 10px', gap: 6,
                  touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
                  border: count ? '1.5px solid #8b12ff' : '1.5px solid rgba(255,45,85,0.35)',
                }}>
                {/* منطقة ثابتة للصورة: كل الهدايا نفس الارتفاع عشان الأسعار تكون بنفس المستوى */}
                <span style={{ height: 86, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <gift.Preview size={70} />
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.8)', fontWeight: 800, fontSize: 12.5, lineHeight: '16px' }}>
                  <CoinIcon size={14} /> {fmtCoins(price)}
                </span>
                <AnimatePresence>
                  {count > 0 && (
                    <motion.span
                      key={count}
                      initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 520, damping: 22 }}
                      style={{
                        position: 'absolute', top: 6, right: 6, minWidth: 26, height: 26, padding: '0 6px', boxSizing: 'border-box',
                        borderRadius: 13, background: '#8b12ff', color: '#fff', fontWeight: 900, fontSize: 15,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 10px rgba(139,18,255,0.6)', pointerEvents: 'none',
                      }}
                    >
                      {count}
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            );
          })}
        </div>
      </Sheet>

      {playing ? <playing.gift.Animation key={playing.key} onDone={onGiftDone} /> : null}

      <AnimatePresence>
        {giftMsg ? (
          <motion.div
            key="gift-msg"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{
              position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 90, zIndex: 9300,
              background: '#dc2626', color: '#fff', padding: '10px 16px', borderRadius: 999, fontWeight: 800, fontSize: 14,
              boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
            }}
          >
            {giftMsg}
          </motion.div>
        ) : null}
      </AnimatePresence>

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


// ── صفحة الرصيد (Wallet): Balance | Deposit ─────────────────────────────
// تنفتح من زر $ في الإعدادات. الشحن هنا يزيد نفس رصيد الهدايا (stooorna_coins_balance_*) فيظهر فوراً في مربع الهدايا داخل البث.
function parseCents(t: string): number {
  const m = /^(\d{1,4})(?:\.(\d{1,2}))?$/.exec(t.trim());
  if (!m) return 0;
  return Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0'));
}

export function WalletSheet({ open, onClose, userId }: { open: boolean; onClose: () => void; userId?: string }) {
  const uid = String(userId || '');
  const [balance, setBalance] = useState<number>(() => readBalance(uid));
  const [earnings, setEarnings] = useState<number>(() => readEarnings(uid));
  const [depositOpen, setDepositOpen] = useState(false);
  const [amountText, setAmountText] = useState('');
  const [cardNum, setCardNum] = useState('');
  const [cardExp, setCardExp] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [cardName, setCardName] = useState('');
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => { setBalance(readBalance(uid)); setEarnings(readEarnings(uid)); }, [uid, open]);
  useEffect(() => {
    const on = () => { setBalance(readBalance(uid)); setEarnings(readEarnings(uid)); };
    window.addEventListener('stooorna:coins-balance', on);
    window.addEventListener('stooorna:coins-earnings', on);
    window.addEventListener('storage', on);
    return () => {
      window.removeEventListener('stooorna:coins-balance', on);
      window.removeEventListener('stooorna:coins-earnings', on);
      window.removeEventListener('storage', on);
    };
  }, [uid]);
  useEffect(() => {
    if (!open || PAYMENT_DEMO_MODE || !uid) return;
    fetch('/api/coins/balance', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then((d: { balance?: number } | null) => {
        if (d && typeof d.balance === 'number') { writeBalance(uid, d.balance); setBalance(d.balance); }
      })
      .catch(() => { /* ignore */ });
    fetch('/api/coins/earnings', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then((d: { earnings?: number } | null) => {
        if (d && typeof d.earnings === 'number') { writeEarnings(uid, d.earnings); setEarnings(d.earnings); }
      })
      .catch(() => { /* ignore */ });
  }, [open, uid]);

  const cents = parseCents(amountText);
  const coins = Math.floor(cents / CUSTOM_CENTS_PER_COIN);
  const amountValid = coins >= CUSTOM_MIN_COINS && coins <= CUSTOM_MAX_COINS;
  const earningsUsd = (earnings * WITHDRAW_CENTS_PER_COIN) / 100;

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '12px 12px', borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.14)', background: '#1c1c1c', color: '#fff', fontSize: 15, outline: 'none',
  };

  function openDeposit() {
    setAmountText(''); setCardNum(''); setCardExp(''); setCardCvc(''); setCardName(''); setPayError('');
    setDepositOpen(true);
  }

  function validate(): string {
    if (!amountValid) return `المبلغ من ${fmtUsd(CUSTOM_MIN_COINS * CUSTOM_CENTS_PER_COIN / 100)} إلى ${fmtUsd(CUSTOM_MAX_COINS * CUSTOM_CENTS_PER_COIN / 100)}`;
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
    const err = validate();
    if (err) { setPayError(err); return; }
    setPayError('');
    setPaying(true);
    const res = await processVisaPayment({ id: CUSTOM_ID, coins, usd: cents / 100 });
    setPaying(false);
    if (!res.ok) { setPayError(res.error || 'فشل الدفع'); return; }
    const next = typeof res.balance === 'number' ? res.balance : readBalance(uid) + coins;
    writeBalance(uid, next);          // نفس رصيد مربع الهدايا داخل البث
    setBalance(next);
    setAmountText(''); setCardNum(''); setCardExp(''); setCardCvc(''); setCardName('');
    setDepositOpen(false);
    setToast(`✓ تم الشحن +${fmtCoins(coins)}`);
    window.setTimeout(() => setToast(''), 2200);
  }

  function withdraw() {
    try { window.open(PAYPAL_URL, '_blank', 'noopener,noreferrer'); } catch { /* ignore */ }
  }

  const half: React.CSSProperties = {
    flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '14px 10px', display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 10,
  };
  const label: React.CSSProperties = { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' };

  return (
    <>
      <Sheet open={open} onClose={() => { if (!depositOpen) onClose(); }} title="Wallet" balance={balance} z={10000}>
        {/* مربع من قسمين: Balance | Deposit */}
        <div style={{ display: 'flex', alignItems: 'stretch', background: '#1c1c1c', borderRadius: 16, border: '1px solid rgba(255,255,255,0.1)', direction: 'ltr' }}>
          <div style={half}>
            <span style={label}>Balance</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <CoinIcon size={22} />
              <span style={{ color: '#fff', fontWeight: 900, fontSize: 22 }}>{fmtCoins(earnings)}</span>
            </div>
            <span style={{ color: '#4ade80', fontWeight: 800, fontSize: 13 }}>{fmtUsd(earningsUsd)}</span>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10.5, textAlign: 'center' }}>وصلك من الدعم</span>
          </div>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.1)', margin: '10px 0' }} />
          <div style={half}>
            <span style={label}>Deposit</span>
            <button type="button" onClick={openDeposit} aria-label="Deposit"
              style={{
                width: 64, height: 64, borderRadius: '50%', cursor: 'pointer', marginTop: 4,
                background: 'rgba(139,18,255,0.18)', border: '1.5px solid #8b12ff', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                boxShadow: '0 0 14px rgba(139,18,255,0.35)',
              }}>
              <Plus size={32} strokeWidth={2.6} />
            </button>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'rgba(255,255,255,0.7)', fontWeight: 800, fontSize: 12.5 }}>
              <CoinIcon size={14} /> {fmtCoins(balance)}
            </span>
          </div>
        </div>

        {/* Withdrawal تحت Balance → PayPal */}
        <button type="button" onClick={withdraw}
          style={{
            width: '100%', marginTop: 12, padding: '13px 10px', borderRadius: 14, cursor: 'pointer',
            background: 'rgba(250,204,21,0.12)', border: '1.5px solid rgba(250,204,21,0.55)', color: '#facc15',
            fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
          Withdrawal <ExternalLink size={16} />
        </button>
      </Sheet>

      {/* Deposit: مبلغ مخصّص (بدون باقات) + بيانات VISA → يزيد رصيد الهدايا مباشرة */}
      <Sheet open={depositOpen} onClose={() => { if (!paying) setDepositOpen(false); }} title="Visa" balance={balance} z={10100}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, direction: 'ltr' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <span style={{ position: 'absolute', left: 12, top: 12, color: 'rgba(255,255,255,0.55)', fontWeight: 800, fontSize: 15 }}>USD</span>
              <input
                value={amountText} inputMode="decimal" placeholder="0.00" aria-label="Amount" autoFocus
                onChange={e => {
                  let v = e.target.value.replace(/[^\d.]/g, '');
                  const i = v.indexOf('.');
                  if (i >= 0) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '').slice(0, 2);
                  setAmountText(v.slice(0, 7));
                }}
                style={{ ...inputStyle, paddingLeft: 52, fontSize: 18, fontWeight: 800 }}
              />
            </div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 90, justifyContent: 'flex-end', color: amountValid ? '#fff' : 'rgba(255,255,255,0.35)', fontWeight: 800, fontSize: 14 }}>
              <CoinIcon size={18} /> {amountValid ? fmtCoins(coins) : '—'}
            </span>
          </div>
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
        <p style={{ margin: '8px 2px 0', textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.45)' }}>
          {fmtUsd(CUSTOM_MIN_COINS * CUSTOM_CENTS_PER_COIN / 100)} – {fmtUsd(CUSTOM_MAX_COINS * CUSTOM_CENTS_PER_COIN / 100)} · 1 Coin = {fmtUsd(CUSTOM_CENTS_PER_COIN / 100)}
        </p>
        {payError ? <p style={{ margin: '10px 0 0', color: '#f87171', fontSize: 13, fontWeight: 700, textAlign: 'center' }}>{payError}</p> : null}
        <button type="button" disabled={paying} onClick={() => void pay()}
          style={{
            width: '100%', marginTop: 14, padding: '14px 10px', borderRadius: 14, border: 'none',
            cursor: paying ? 'default' : 'pointer', opacity: paying ? 0.7 : 1,
            background: '#8b12ff', color: '#fff', fontWeight: 800, fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
          <Lock size={16} /> {paying ? 'Processing…' : amountValid ? `Pay ${fmtUsd(cents / 100)}` : 'Pay'}
        </button>
        {PAYMENT_DEMO_MODE ? (
          <p style={{ margin: '10px 0 0', color: 'rgba(255,255,255,0.4)', fontSize: 11, textAlign: 'center' }}>
            وضع تجريبي — لا يتم خصم أي مبلغ من البطاقة
          </p>
        ) : null}
      </Sheet>

      <AnimatePresence>
        {toast ? (
          <motion.div
            key="wallet-toast"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{
              position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 90, zIndex: 10300,
              background: '#16a34a', color: '#fff', padding: '10px 16px', borderRadius: 999, fontWeight: 800, fontSize: 14,
              boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
            }}
          >
            {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

export default LiveCoinsDock;
