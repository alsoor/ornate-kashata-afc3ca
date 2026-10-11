/**
 * LiveTreasureBox — صندوق الكنز داخل البث (صوتي + مرئي).
 * Isolated file (like the Gift files). Mounted ONCE from LiveCoinsDock, so it shows in both live.tsx and live-camera.tsx.
 *
 *  1) Chest icon sits under the $ (Coins) and Gift icons. Anyone (host or viewer) can tap it.
 *  2) Sheet with three squares side by side: 250 / 500 / 1000 Coins → Buy.
 *  3) Buying shows the buyer's photo + name to everybody and starts a 4:00 countdown (server clock, same for all)
 *     with a special chest jingle.
 *  4) When the time ends the box opens: every viewer taps once and gets a share (random "lucky" split between the
 *     viewers present). The winner sees "+N Coins" and the coins go straight into the balance.
 *  5) As soon as everybody has taken a share the box closes and the timer/box disappears for all.
 *
 * Server: liveBox.server.ts → /api/live-box (state lives there, the client only polls it).
 * Image: /treasure-box.png (put the PNG in the app's public folder).
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Package } from 'lucide-react';

const TREASURE_IMG = '/treasure-box.png';
const PRICES = [250, 500, 1000] as const;
const ICON = 32;
const POLL_MS = 1200;

type Person = { id: string; name: string; avatar: string | null };
type BoxClaim = { userId: string; name: string; avatar: string | null; coins: number };
type BoxState = {
  id: string;
  phase: 'counting' | 'open';
  coins: number;
  buyer: Person;
  startedAt: number;
  openAt: number;
  claimEndsAt: number | null;
  total: number;
  left: number;
  claims: BoxClaim[];
  mine: number | null;
};

// ── the chest's own tune (synthesised, no audio file needed) ───────────────────────────
let actx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    if (!actx) actx = new AC();
    if (actx && actx.state === 'suspended') void actx.resume();
    return actx;
  } catch { return null; }
}
function note(c: AudioContext, freq: number, at: number, dur: number, type: OscillatorType, vol: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g); g.connect(c.destination);
  o.start(at); o.stop(at + dur + 0.05);
}
export function playBoxTune(kind: 'start' | 'open' | 'win') {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + 0.02;
  try {
    if (kind === 'start') {
      // magical "chest appears" arpeggio + low chord + shimmer
      [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98].forEach((f, i) => {
        note(c, f, t + i * 0.11, 0.55, 'triangle', 0.16);
        note(c, f * 2, t + i * 0.11, 0.35, 'sine', 0.05);
      });
      [130.81, 196, 261.63].forEach(f => note(c, f, t, 1.1, 'sine', 0.12));
      [2093, 2637, 3136].forEach((f, i) => note(c, f, t + 0.7 + i * 0.07, 0.3, 'sine', 0.05));
    } else if (kind === 'open') {
      [392, 440, 494, 523.25, 587.33, 659.25, 783.99, 1046.5].forEach((f, i) => note(c, f, t + i * 0.07, 0.3, 'triangle', 0.17));
      [523.25, 659.25, 783.99, 1046.5].forEach(f => note(c, f, t + 0.6, 0.9, 'sine', 0.13));
    } else {
      [1568, 2093, 1760, 2349, 2637].forEach((f, i) => note(c, f, t + i * 0.06, 0.22, 'square', 0.07));
      note(c, 1046.5, t + 0.32, 0.6, 'triangle', 0.14);
    }
  } catch { /* ignore */ }
}

const fmtCoins = (n: number) => n.toLocaleString('en-US');
const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

function Avatar({ name, src, size }: { name: string; src?: string | null; size: number }) {
  const [bad, setBad] = useState(false);
  useEffect(() => { setBad(false); }, [src]);
  if (src && !bad) {
    return <img src={src} alt="" onError={() => setBad(true)} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1.5px solid rgba(217,70,239,0.7)' }} />;
  }
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(217,70,239,0.25)', color: '#f5d0fe', fontWeight: 800, fontSize: size * 0.45, border: '1.5px solid rgba(217,70,239,0.7)' }}>
      {(name || '?').trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

function ChestImg({ size, style }: { size: number; style?: React.CSSProperties }) {
  const [bad, setBad] = useState(false);
  if (bad) return <Package size={size * 0.8} color="#e879f9" strokeWidth={2} style={style} />;
  return <img src={TREASURE_IMG} alt="" draggable={false} onError={() => setBad(true)} style={{ width: size, height: size, objectFit: 'contain', display: 'block', pointerEvents: 'none', ...style }} />;
}

export function LiveTreasureBox({
  room, uid, name, avatar, balance, centerRight,
  getBalance, spend, credit, onNeedCoins,
}: {
  room: string;
  uid: string;
  name: string;
  avatar?: string | null;
  balance: number;
  /** px from the right edge to the horizontal centre where the chest icon sits (between the $ and gift icons) */
  centerRight: number;
  getBalance: () => number;
  /** take `price` Coins from the spendable balance (returns the new balance) */
  spend: (price: number) => number;
  /** add Coins to the spendable balance right now */
  credit: (coins: number) => void;
  onNeedCoins: () => void;
}) {
  const [box, setBox] = useState<BoxState | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const offsetRef = useRef(0); // serverNow - localNow
  const seenIdRef = useRef('');
  const seenPhaseRef = useRef('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sel, setSel] = useState<number>(PRICES[0]);
  const [buying, setBuying] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [dismissedId, setDismissedId] = useState('');
  const [claimedId, setClaimedId] = useState('');
  const [win, setWin] = useState<{ coins: number; key: number } | null>(null);
  const [msg, setMsg] = useState('');
  const msgTimer = useRef(0);
  const flash = (t: string) => {
    setMsg(t);
    window.clearTimeout(msgTimer.current);
    msgTimer.current = window.setTimeout(() => setMsg(''), 2600);
  };
  useEffect(() => () => window.clearTimeout(msgTimer.current), []);

  // ── poll the shared box state (also tells the server I'm present in this room) ──
  useEffect(() => {
    if (!uid || !room) return;
    let stop = false;
    let timer = 0;
    const apply = (b: BoxState | null) => {
      if (b) {
        if (seenIdRef.current !== b.id) {
          const age = Date.now() + offsetRef.current - b.startedAt;
          seenIdRef.current = b.id;
          seenPhaseRef.current = b.phase;
          if (b.phase === 'counting' && age < 6000) playBoxTune('start');
        } else if (seenPhaseRef.current !== b.phase) {
          seenPhaseRef.current = b.phase;
          if (b.phase === 'open') playBoxTune('open');
        }
      } else {
        seenIdRef.current = '';
        seenPhaseRef.current = '';
      }
      setBox(b);
    };
    const tick = async () => {
      if (stop) return;
      if (!document.hidden) {
        try {
          const t0 = Date.now();
          const r = await fetch(`/api/live-box?room=${encodeURIComponent(room)}&uid=${encodeURIComponent(uid)}`, { credentials: 'include', cache: 'no-store' });
          if (r.ok) {
            const d = await r.json() as { now?: number; box?: BoxState | null };
            if (!stop) {
              if (typeof d.now === 'number') offsetRef.current = d.now - Math.round((t0 + Date.now()) / 2);
              apply(d.box || null);
            }
          }
        } catch { /* ignore */ }
      }
      if (!stop) timer = window.setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => { stop = true; window.clearTimeout(timer); };
  }, [uid, room]);

  // local ticker for the visible countdown (only while a box exists)
  useEffect(() => {
    if (!box) return;
    setClock(Date.now());
    const id = window.setInterval(() => setClock(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [box?.id]);

  // winner overlay auto-hide
  useEffect(() => {
    if (!win) return;
    const id = window.setTimeout(() => setWin(null), 3800);
    return () => window.clearTimeout(id);
  }, [win?.key]);

  const nowS = clock + offsetRef.current;
  const active = !!box;

  const buy = async () => {
    if (buying) return;
    if (active) { flash('يوجد صندوق شغّال الآن'); return; }
    const price = sel;
    if (getBalance() < price) {
      setSheetOpen(false);
      flash('رصيدك غير كافٍ — اشحن Coins');
      onNeedCoins();
      return;
    }
    setBuying(true);
    try {
      const r = await fetch('/api/live-box', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room, action: 'buy', coins: price, userId: uid, name, avatar: avatar ?? null }),
      });
      const d = await r.json().catch(() => null) as { ok?: boolean; error?: string; now?: number; box?: BoxState | null } | null;
      if (!r.ok || !d?.ok || !d.box) {
        flash(d?.error === 'active' ? 'يوجد صندوق شغّال الآن' : 'تعذر شراء الصندوق');
        if (d?.box) setBox(d.box);
        return;
      }
      spend(price);
      if (typeof d.now === 'number') offsetRef.current = d.now - Date.now();
      seenIdRef.current = d.box.id;
      seenPhaseRef.current = 'counting';
      playBoxTune('start');
      setBox(d.box);
      setSheetOpen(false);
    } catch {
      flash('تعذر الاتصال بالسيرفر');
    } finally {
      setBuying(false);
    }
  };

  const claim = async () => {
    if (!box || claiming || box.phase !== 'open') return;
    const id = box.id;
    setClaiming(true);
    try {
      const r = await fetch('/api/live-box', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room, action: 'claim', userId: uid, name, avatar: avatar ?? null }),
      });
      const d = await r.json().catch(() => null) as { ok?: boolean; error?: string; coins?: number; now?: number; box?: BoxState | null } | null;
      if (d && typeof d.now === 'number') offsetRef.current = d.now - Date.now();
      if (r.ok && d?.ok && typeof d.coins === 'number' && d.coins > 0) {
        credit(d.coins); // straight into the balance
        setClaimedId(id);
        setWin({ coins: d.coins, key: Date.now() });
        playBoxTune('win');
        setBox(d.box || null);
        if (!d.box) { seenIdRef.current = ''; seenPhaseRef.current = ''; }
      } else {
        if (d?.error === 'claimed') { setClaimedId(id); flash('فتحت هذا الصندوق من قبل'); }
        else { flash('انتهى الصندوق'); setBox(d?.box || null); }
      }
    } catch {
      flash('تعذر الاتصال بالسيرفر');
    } finally {
      setClaiming(false);
    }
  };

  if (typeof document === 'undefined' || !uid) return null;

  const iHaveClaimed = !!box && (box.mine != null || claimedId === box.id);
  const counting = !!box && box.phase === 'counting';
  const opened = !!box && box.phase === 'open';
  const remainMs = box ? Math.max(0, box.openAt - nowS) : 0;
  const totalMs = box ? Math.max(1, box.openAt - box.startedAt) : 1;
  const claimLeftMs = box && box.claimEndsAt ? Math.max(0, box.claimEndsAt - nowS) : 0;
  const showOverlay = opened && !iHaveClaimed && dismissedId !== box!.id;
  const buyerName = box?.buyer?.name || 'Someone';
  const bottomCss = `max(3px, calc(max(env(safe-area-inset-bottom, 0px), 12px) - 14px))`;

  return createPortal(
    <>
      <style>{`
        @keyframes stooornaBoxShake { 0%,100% { transform: rotate(0deg) scale(1); } 20% { transform: rotate(-8deg) scale(1.08); } 40% { transform: rotate(8deg) scale(1.1); } 60% { transform: rotate(-5deg) scale(1.06); } 80% { transform: rotate(5deg) scale(1.08); } }
        @keyframes stooornaBoxGlow { 0%,100% { filter: drop-shadow(0 0 4px rgba(217,70,239,.6)); } 50% { filter: drop-shadow(0 0 12px rgba(244,114,182,1)); } }
        @keyframes stooornaBoxBounce { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-8px) scale(1.06); } }
        @keyframes stooornaBoxPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(217,70,239,.55); } 50% { box-shadow: 0 0 0 10px rgba(217,70,239,0); } }
        @keyframes stooornaCoinFly { from { transform: translate(0,0) scale(.4); opacity: 1; } to { transform: translate(var(--dx), var(--dy)) scale(1.1); opacity: 0; } }
      `}</style>

      {/* chest icon — under the $ and gift icons */}
      <button
        type="button"
        aria-label="Treasure Box"
        title="Treasure Box"
        onClick={() => setSheetOpen(true)}
        style={{
          position: 'fixed', zIndex: 9000,
          right: centerRight - ICON / 2, bottom: bottomCss,
          width: ICON, height: ICON, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
          filter: 'drop-shadow(0 0 5px rgba(217,70,239,.7))',
          animation: active ? 'stooornaBoxGlow 1.1s ease-in-out infinite' : undefined,
        }}
      >
        <ChestImg size={ICON} style={{ animation: opened ? 'stooornaBoxShake .7s ease-in-out infinite' : undefined }} />
      </button>

      {/* toast */}
      {msg ? (
        <div style={{
          position: 'fixed', zIndex: 9460, left: '50%', transform: 'translateX(-50%)', bottom: 90,
          background: 'rgba(20,20,28,0.95)', color: '#fff', border: '1px solid rgba(217,70,239,0.6)', borderRadius: 12,
          padding: '9px 14px', fontWeight: 700, fontSize: 13, maxWidth: '86vw', textAlign: 'center',
        }}>{msg}</div>
      ) : null}

      {/* banner: who bought + big countdown, visible to everybody */}
      {box ? (
        <div
          role={opened ? 'button' : undefined}
          onClick={() => { if (opened && !iHaveClaimed) setDismissedId(''); }}
          style={{
            position: 'fixed', zIndex: 9060, left: '50%', transform: 'translateX(-50%)',
            top: 'var(--stooorna-box-top, calc(env(safe-area-inset-top, 0px) + 150px))',
            width: 'min(92vw, 360px)', boxSizing: 'border-box', overflow: 'hidden',
            display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px',
            borderRadius: 18, background: 'rgba(10,8,20,0.93)', border: '1.5px solid #d946ef',
            boxShadow: '0 6px 22px rgba(217,70,239,0.35)', cursor: opened && !iHaveClaimed ? 'pointer' : 'default',
          }}
        >
          <Avatar name={buyerName} src={box.buyer?.avatar} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{buyerName}</div>
            <div style={{ color: '#f0abfc', fontWeight: 700, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {counting ? `bought a ${fmtCoins(box.coins)} Coins Treasure Box` : iHaveClaimed ? `Box opened · ${box.left} left` : `Box is open — tap to grab!`}
            </div>
          </div>
          <ChestImg size={34} style={{ animation: 'stooornaBoxShake 1.4s ease-in-out infinite', flexShrink: 0 }} />
          <div style={{ minWidth: 58, textAlign: 'center', color: opened ? '#fde047' : '#fff', fontWeight: 900, fontSize: 19, letterSpacing: 0.5, fontVariantNumeric: 'tabular-nums', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            {counting ? fmtClock(remainMs) : fmtClock(claimLeftMs)}
          </div>
          {counting ? (
            <div style={{ position: 'absolute', left: 0, bottom: 0, height: 3, width: `${Math.min(100, Math.max(0, (1 - remainMs / totalMs) * 100))}%`, background: 'linear-gradient(90deg,#d946ef,#f472b6)' }} />
          ) : null}
        </div>
      ) : null}

      {/* the opened box: tap to take your share */}
      <AnimatePresence>
        {showOverlay && box ? (
          <motion.div
            key={`open_${box.id}`}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 9400, background: 'rgba(4,2,12,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <div style={{ position: 'relative', width: 'min(88vw, 340px)', textAlign: 'center', padding: '22px 16px 18px', borderRadius: 24, background: 'linear-gradient(180deg, rgba(40,10,60,0.97), rgba(10,6,22,0.98))', border: '1.5px solid #d946ef', boxShadow: '0 0 40px rgba(217,70,239,0.45)' }}>
              <button type="button" aria-label="Close" onClick={() => setDismissedId(box.id)}
                style={{ position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} />
              </button>
              <div style={{ color: '#fde047', fontWeight: 900, fontSize: 18, marginBottom: 2 }}>Treasure Box is open!</div>
              <div style={{ color: '#f0abfc', fontWeight: 700, fontSize: 12, marginBottom: 10 }}>
                {fmtCoins(box.coins)} Coins · {box.left} left · {fmtClock(claimLeftMs)}
              </div>
              <button type="button" onClick={() => { void claim(); }} disabled={claiming} aria-label="Open the box"
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, animation: 'stooornaBoxBounce 0.9s ease-in-out infinite', filter: 'drop-shadow(0 0 22px rgba(244,114,182,0.95))', WebkitTapHighlightColor: 'transparent' }}>
                <ChestImg size={150} />
              </button>
              <button type="button" onClick={() => { void claim(); }} disabled={claiming}
                style={{ display: 'block', margin: '8px auto 0', padding: '11px 34px', borderRadius: 999, border: 'none', cursor: 'pointer', fontWeight: 900, fontSize: 15, color: '#fff', background: 'linear-gradient(90deg,#d946ef,#f472b6)', animation: 'stooornaBoxPulse 1.2s ease-out infinite', opacity: claiming ? 0.6 : 1 }}>
                {claiming ? '...' : 'TAP TO OPEN'}
              </button>
              {box.claims.length > 0 ? (
                <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxHeight: 84, overflowY: 'auto' }}>
                  {box.claims.slice(-8).map(c => (
                    <span key={c.userId} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px 3px 3px', borderRadius: 999, background: 'rgba(255,255,255,0.07)', color: '#fde68a', fontWeight: 800, fontSize: 11 }}>
                      <Avatar name={c.name} src={c.avatar} size={20} />
                      <span style={{ maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#fff' }}>{c.name || '—'}</span>
                      +{fmtCoins(c.coins)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* you won */}
      <AnimatePresence>
        {win ? (
          <motion.div
            key={`win_${win.key}`}
            initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
            onClick={() => setWin(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 9450, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(4,2,12,0.55)' }}
          >
            <div style={{ position: 'relative', textAlign: 'center', padding: '22px 34px', borderRadius: 24, background: 'linear-gradient(180deg, rgba(60,30,6,0.97), rgba(20,10,4,0.98))', border: '1.5px solid #facc15', boxShadow: '0 0 44px rgba(250,204,21,0.5)' }}>
              {Array.from({ length: 14 }).map((_, i) => {
                const ang = (i / 14) * Math.PI * 2;
                const dist = 90 + (i % 3) * 22;
                return (
                  <span key={i} aria-hidden="true" style={{
                    position: 'absolute', left: '50%', top: '42%', fontSize: 20, pointerEvents: 'none',
                    ['--dx' as any]: `${Math.cos(ang) * dist}px`, ['--dy' as any]: `${Math.sin(ang) * dist}px`,
                    animation: `stooornaCoinFly 1.1s ease-out ${(i % 5) * 0.05}s forwards`,
                  } as React.CSSProperties}>🪙</span>
                );
              })}
              <ChestImg size={78} style={{ margin: '0 auto', animation: 'stooornaBoxBounce 0.9s ease-in-out infinite' }} />
              <div style={{ color: '#fde047', fontWeight: 900, fontSize: 16, marginTop: 4 }}>You won!</div>
              <div style={{ color: '#fff', fontWeight: 900, fontSize: 36, lineHeight: 1.1 }}>+{fmtCoins(win.coins)}</div>
              <div style={{ color: '#fde68a', fontWeight: 800, fontSize: 14 }}>Coins</div>
              <div style={{ color: 'rgba(255,255,255,0.65)', fontWeight: 600, fontSize: 11, marginTop: 6 }}>Added to your balance</div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* buy sheet: three squares side by side */}
      <AnimatePresence>
        {sheetOpen ? (
          <motion.div
            key="box_sheet"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setSheetOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 9110, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              onClick={e => e.stopPropagation()}
              role="dialog" aria-label="Treasure Box"
              style={{ width: '100%', maxWidth: 520, boxSizing: 'border-box', background: '#121212', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: '14px 14px max(18px, env(safe-area-inset-bottom, 0px))' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ minWidth: 70, padding: '6px 10px', borderRadius: 999, background: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.45)', color: '#fde047', fontWeight: 800, fontSize: 13, textAlign: 'center' }}>
                  🪙 {fmtCoins(balance)}
                </span>
                <p style={{ margin: 0, flex: 1, textAlign: 'center', color: '#fff', fontWeight: 800, fontSize: 16 }}>Treasure Box</p>
                <button type="button" onClick={() => setSheetOpen(false)} aria-label="Close"
                  style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={18} />
                </button>
              </div>
              <p style={{ margin: '0 0 12px', textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 600 }}>
                Everyone in the room can open it when the 4:00 timer ends
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {PRICES.map(p => {
                  const on = sel === p;
                  return (
                    <button key={p} type="button" onClick={() => setSel(p)}
                      style={{
                        background: '#2a2a2a', borderRadius: 12, boxSizing: 'border-box', minHeight: 112, padding: '10px 6px', cursor: 'pointer', color: '#fff',
                        border: on ? '1.5px solid #d946ef' : '1.5px solid transparent',
                        boxShadow: on ? '0 0 14px rgba(217,70,239,0.5)' : 'none',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}>
                      <ChestImg size={52} />
                      <span style={{ fontWeight: 900, fontSize: 15 }}>{fmtCoins(p)} Coins</span>
                    </button>
                  );
                })}
              </div>
              <button type="button" onClick={() => { void buy(); }} disabled={buying || active}
                style={{ width: '100%', marginTop: 14, padding: '13px 14px', borderRadius: 14, border: 'none', cursor: buying || active ? 'default' : 'pointer', fontWeight: 900, fontSize: 15, color: '#fff', background: 'linear-gradient(90deg,#d946ef,#f472b6)', opacity: buying || active ? 0.55 : 1 }}>
                {active ? 'A box is running now' : buying ? '...' : `Buy · ${fmtCoins(sel)} Coins`}
              </button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>,
    document.body
  );
}

export default LiveTreasureBox;
