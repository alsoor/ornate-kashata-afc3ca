/**
 * liveHeartsPatch — tap the screen of a live = hearts (live camera only). Standalone, adds code only.
 *
 *  - Tap anywhere on the live screen (not on a button): hearts float up from the finger and the heart counter goes up.
 *  - The counter sits on the chat box, on the right, above the Send button. 999 -> 1K -> 1M.
 *  - Everybody in the same live room sees the same number (kept by the server: /api/live-hearts).
 *  - During a game round every 10 taps = +1 on that side's line, 20 taps = +2 ... (done by the server, entry.ts).
 *    It is only a helper for the win: it is NOT a gift, it is never added to coins / profit.
 */

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart } from 'lucide-react';

/** 999 -> "999", 1000 -> "1K", 1500 -> "1.5K", 1000000 -> "1M" */
export function fmtHearts(n: number): string {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  if (v < 1000) return String(v);
  if (v < 1_000_000) {
    const k = v / 1000;
    return `${k >= 100 ? Math.floor(k) : Math.floor(k * 10) / 10}K`;
  }
  const m = v / 1_000_000;
  return `${m >= 100 ? Math.floor(m) : Math.floor(m * 10) / 10}M`;
}

type Burst = { id: number; x: number; y: number; dx: number; rot: number; color: string; size: number };

const COLORS = ['#ef4444', '#f43f5e', '#fb7185', '#fb923c', '#facc15', '#ec4899'];
const FLUSH_MS = 600;
const POLL_MS = 1000;
const BURST_LIFE_MS = 1300;
const MAX_BURSTS = 36;

export function useLiveHearts(opts: {
  /** I am inside a live room (joined) */
  enabled: boolean;
  /** id of the host whose room this page is in */
  roomHostId: string;
  /** I am the owner of this live: his first join starts the counter from zero */
  amOwner: boolean;
}): { total: number; bursts: Burst[]; tap: (x?: number, y?: number) => void } {
  const { enabled, roomHostId, amOwner } = opts;
  const [total, setTotal] = React.useState(0);
  const [bursts, setBursts] = React.useState<Burst[]>([]);
  const pendingRef = React.useRef(0);
  const flushTimerRef = React.useRef<number | null>(null);
  const idRef = React.useRef(0);
  const roomRef = React.useRef(roomHostId);
  roomRef.current = roomHostId;
  const enabledRef = React.useRef(enabled);
  enabledRef.current = enabled;

  const flush = React.useCallback(async () => {
    flushTimerRef.current = null;
    const room = roomRef.current;
    const n = pendingRef.current;
    if (!room || n <= 0) return;
    pendingRef.current = 0;
    try {
      const r = await fetch('/api/live-hearts', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room, n }),
      });
      if (r.ok) {
        const d: any = await r.json();
        if (typeof d?.total === 'number') setTotal((t) => Math.max(t, d.total));
        // the round line refreshes right away (liveSplitViewPatch listens to this event)
        try { window.dispatchEvent(new CustomEvent('stooorna:battle-poke')); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    if (pendingRef.current > 0 && flushTimerRef.current == null) flushTimerRef.current = window.setTimeout(() => { void flush(); }, FLUSH_MS);
  }, []);

  const tap = React.useCallback((x?: number, y?: number) => {
    if (!enabledRef.current) return;
    setTotal((t) => t + 1);
    pendingRef.current += 1;
    if (flushTimerRef.current == null) flushTimerRef.current = window.setTimeout(() => { void flush(); }, FLUSH_MS);
    const vw = typeof window !== 'undefined' ? window.innerWidth : 360;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 640;
    const id = ++idRef.current;
    const b: Burst = {
      id,
      x: x != null ? x : vw - 60,
      y: y != null ? y : vh * 0.62,
      dx: Math.round((Math.random() - 0.5) * 70),
      rot: Math.round((Math.random() - 0.5) * 50),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 22 + Math.round(Math.random() * 14),
    };
    setBursts((prev) => [...prev, b].slice(-MAX_BURSTS));
    window.setTimeout(() => setBursts((prev) => prev.filter((p) => p.id !== id)), BURST_LIFE_MS);
  }, [flush]);

  // new room / left the room: start clean
  React.useEffect(() => {
    setTotal(0);
    pendingRef.current = 0;
    setBursts([]);
  }, [roomHostId]);

  // the owner starting his live = counter from zero
  const resetDoneRef = React.useRef('');
  React.useEffect(() => {
    if (!enabled || !amOwner || !roomHostId || resetDoneRef.current === roomHostId) return;
    resetDoneRef.current = roomHostId;
    try {
      void fetch('/api/live-hearts', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: roomHostId, action: 'reset' }),
      }).catch(() => { /* ignore */ });
    } catch { /* ignore */ }
  }, [enabled, amOwner, roomHostId]);

  // everybody sees the same number: read the room total from the server
  React.useEffect(() => {
    if (!enabled || !roomHostId) return;
    let stop = false;
    const tick = async () => {
      if (stop || document.hidden) return;
      try {
        const r = await fetch(`/api/live-hearts?room=${encodeURIComponent(roomHostId)}`, { credentials: 'include', cache: 'no-store' });
        if (!r.ok || stop) return;
        const d: any = await r.json();
        if (typeof d?.total === 'number') setTotal((t) => Math.max(t, d.total));
      } catch { /* ignore */ }
    };
    void tick();
    const iv = window.setInterval(() => { void tick(); }, POLL_MS);
    return () => { stop = true; window.clearInterval(iv); };
  }, [enabled, roomHostId]);

  // send what is still waiting when I leave
  React.useEffect(() => () => {
    if (flushTimerRef.current != null) { window.clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
    const room = roomRef.current;
    const n = pendingRef.current;
    if (room && n > 0) {
      pendingRef.current = 0;
      try {
        void fetch('/api/live-hearts', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room, n }), keepalive: true,
        }).catch(() => { /* ignore */ });
      } catch { /* ignore */ }
    }
  }, []);

  return { total, bursts, tap };
}

/**
 * Invisible layer that catches the taps (it sits UNDER every button / the chat / the header, so those keep working)
 * + the floating hearts (drawn ABOVE everything, never catching a touch).
 */
export function HeartsTapLayer({ enabled, bursts, onTap }: { enabled: boolean; bursts: Burst[]; onTap: (x: number, y: number) => void }) {
  if (!enabled) return null;
  return (
    <>
      <div
        aria-hidden
        onPointerDown={(e) => { onTap(e.clientX, e.clientY); }}
        style={{ position: 'absolute', inset: 0, zIndex: 1, touchAction: 'manipulation', background: 'transparent' }}
      />
      <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 30, pointerEvents: 'none', overflow: 'hidden' }}>
        <AnimatePresence>
          {bursts.map((b) => (
            <motion.div
              key={b.id}
              initial={{ opacity: 0.95, scale: 0.5, x: 0, y: 0, rotate: 0 }}
              animate={{ opacity: 0, scale: 1.25, x: b.dx, y: -150, rotate: b.rot }}
              transition={{ duration: BURST_LIFE_MS / 1000, ease: 'easeOut' }}
              style={{ position: 'absolute', left: b.x - b.size / 2, top: b.y - b.size / 2, width: b.size, height: b.size, pointerEvents: 'none' }}
            >
              <Heart size={b.size} fill={b.color} color={b.color} strokeWidth={0} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

/**
 * Heart + number. Put it INSIDE the chat card (the card must be `position: relative`): it sits on the right,
 * above the Send button. Tapping it also gives a heart.
 */
export function HeartsCounter({ count, onTap, lift = 52 }: { count: number; onTap: () => void; lift?: number }) {
  return (
    <button
      type="button"
      aria-label="Hearts"
      onClick={(e) => { onTap(); e.stopPropagation(); }}
      style={{
        position: 'absolute',
        right: 10,
        bottom: lift,
        zIndex: 3,
        minWidth: 38,
        height: 38,
        padding: '0 9px',
        borderRadius: 999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        cursor: 'pointer',
        color: '#fff',
        background: 'rgba(0,0,0,0.45)',
        border: '1.5px solid rgba(251,146,60,0.9)',
        boxShadow: '0 0 8px rgba(251,146,60,0.4)',
        fontWeight: 900,
        fontSize: '0.78rem',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <Heart size={16} fill="#ef4444" color="#ef4444" strokeWidth={0} />
      <motion.span key={count} initial={{ scale: 1.25 }} animate={{ scale: 1 }} transition={{ duration: 0.15 }}>
        {fmtHearts(count)}
      </motion.span>
    </button>
  );
}
