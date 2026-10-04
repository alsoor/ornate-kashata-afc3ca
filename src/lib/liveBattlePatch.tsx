/**
 * liveBattlePatch — TikTok-style game round ("battle") inside the live-camera SPLIT screen
 *
 * Standalone patch used by /live-camera. It sits on top of liveSplitPatch / liveDuetPatch and does NOT change them.
 *
 * Flow
 *  1. Two hosts are in a split screen (A = owner of the room on the LEFT, B = invited host on the RIGHT).
 *  2. Either host taps the round "Play" button in the middle of the split.
 *  3. The other host gets the same Accept | Decline box used for the split invite.
 *  4. INSTANT-OPEN: the moment the other host taps Accept the round opens on BOTH sides (no need to invite back):
 *     4:00 countdown in the middle of the split, a yellow (left) / orange (right) line.
 *  5. Every gift sent in a host's room lengthens that host's line (15K coins -> +15K points) and an emoji walks on the line.
 *  6. Gift animations stay light (translucent) during the round and the small support pills never cover the screen.
 *  7. Last 15 seconds the timer turns red. At 0 the longer line wins -> "You Win" rectangle on his half.
 *
 * Signals (all travel on A's room channel, same transport as the duet signals):
 *   battle-invite / battle-accept / battle-decline / battle-state / battle-gift
 *
 * Authority: A (left, owner of the channel) keeps the clock + the scores and re-broadcasts `battle-state` every 2s,
 * so B, A's viewers and late joiners always see the same thing.
 */

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Swords } from 'lucide-react';

/* ───────────────────────── types ───────────────────────── */

export type BattleSide = 'left' | 'right';

export type BattleView = {
  id: string;
  phase: 'running' | 'ended';
  left: number;
  right: number;
  /** local wall-clock time when the round ends (running only) */
  endsAt: number;
  winner: BattleSide | 'draw' | null;
};

export type BattlePopup = { id: string; side: BattleSide; coins: number; count: number; label: string };

type Incoming = { id: string; fromSide: BattleSide; fromName: string; at: number };

export const BATTLE_DURATION_MS = 4 * 60 * 1000;
export const BATTLE_RED_MS = 15 * 1000;
const RESULT_MS = 7000;
const STATE_EVERY_MS = 2000;

/** Colors requested: left = yellow, right = orange. */
export const BATTLE_COLORS = { left: '#facc15', right: '#fb923c' } as const;
export const BATTLE_EMOJI = { left: '⚡', right: '🔥' } as const;

/* ───────────────────────── helpers ───────────────────────── */

export function isBattleMessage(msg: any): boolean {
  return !!msg && typeof msg.t === 'string' && msg.t.startsWith('battle-');
}

export function fmtCoins(n: number): string {
  const v = Math.max(0, Math.round(n));
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (v >= 10_000) return `${(v / 1000).toFixed(v >= 100_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(v);
}

function fmtClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const newBattleId = () => `bt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const sameId = (a: unknown, b: unknown) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

/* ───────────────────────── hook ───────────────────────── */

export type UseLiveBattleOpts = {
  /** split screen is on and I may see / play the round (hosts + viewers of the room) */
  active: boolean;
  /** 'left' = A (owner of the room), 'right' = B (invited host), null = viewer */
  mySide: BattleSide | null;
  myId: string;
  myName: string;
  /** the other host (for the dialog + to know which gifts in A's room count for B) */
  peerName: string;
  peerUserId: string | null;
  /** gift room keys of MY own live (polled while a round runs). Hosts only. Same key as LiveCoinsDock: `gifts-<hostId>`. */
  giftRooms: string[];
  /** unit price of a gift id (from LiveCoinsDock) — used when the server event has no `price` yet. */
  priceOf?: (giftId: string) => number;
  /** send a signal to everybody in the split room (A's channel). */
  send: (payload: Record<string, unknown>) => void;
  onToast?: (text: string) => void;
};

export function useLiveBattle(opts: UseLiveBattleOpts) {
  const { active, mySide, myId, myName, peerName, peerUserId, giftRooms, priceOf, send, onToast } = opts;

  const [battle, setBattle] = React.useState<BattleView | null>(null);
  const battleRef = React.useRef<BattleView | null>(null);
  const [pending, setPending] = React.useState<string | null>(null); // id of an invite I sent
  const pendingRef = React.useRef<string | null>(null);
  const [incoming, setIncoming] = React.useState<Incoming | null>(null);
  const incomingRef = React.useRef<Incoming | null>(null);
  const [popups, setPopups] = React.useState<BattlePopup[]>([]);
  const [now, setNow] = React.useState(() => Date.now());

  const srcRef = React.useRef(`b_${Math.random().toString(36).slice(2, 10)}`);
  const seenGiftsRef = React.useRef<Set<string>>(new Set());
  const seenMsgRef = React.useRef<Set<string>>(new Set());
  const clearTimerRef = React.useRef<number | null>(null);
  const acceptedIdRef = React.useRef<string | null>(null); // INSTANT-OPEN: invite I accepted as B, until A confirms it with battle-state
  const latest = React.useRef({ send, onToast, mySide, myId, myName, peerName, peerUserId, giftRooms, priceOf });
  latest.current = { send, onToast, mySide, myId, myName, peerName, peerUserId, giftRooms, priceOf };

  const setBattleBoth = (b: BattleView | null) => {
    battleRef.current = b;
    setBattle(b);
  };

  const emit = React.useCallback((payload: Record<string, unknown>) => {
    try { latest.current.send({ ...payload, src: srcRef.current, ts: Date.now() }); } catch { /* ignore */ }
  }, []);

  const scheduleClear = (id: string) => {
    if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
    clearTimerRef.current = window.setTimeout(() => {
      if (battleRef.current?.id === id && battleRef.current.phase === 'ended') setBattleBoth(null);
    }, RESULT_MS);
  };

  const addPopup = (p: BattlePopup) => {
    setPopups((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p].slice(-4)));
    window.setTimeout(() => setPopups((prev) => prev.filter((x) => x.id !== p.id)), 2600);
  };

  /* ── authority (A = left): clock, scores, state broadcast ── */
  const broadcastState = React.useCallback(() => {
    const b = battleRef.current;
    if (!b) return;
    emit({
      t: 'battle-state', id: b.id, phase: b.phase, left: b.left, right: b.right,
      remainMs: Math.max(0, b.endsAt - Date.now()), winner: b.winner,
    });
  }, [emit]);

  const startAsAuthority = React.useCallback((id: string) => {
    if (battleRef.current?.phase === 'running') return;
    seenGiftsRef.current = new Set();
    setBattleBoth({ id, phase: 'running', left: 0, right: 0, endsAt: Date.now() + BATTLE_DURATION_MS, winner: null });
    pendingRef.current = null;
    setPending(null);
    broadcastState();
    window.setTimeout(broadcastState, 500);
    window.setTimeout(broadcastState, 1500); // INSTANT-OPEN: make sure B opens even if the first signals are lost
    window.setTimeout(broadcastState, 3500);
  }, [broadcastState]);

  /** INSTANT-OPEN-V2: open the round on MY side (not the authority) the moment the other host agrees; A's battle-state keeps it in sync. */
  const openAsGuest = React.useCallback((id: string) => {
    if (battleRef.current?.phase === 'running') return;
    seenGiftsRef.current = new Set();
    setBattleBoth({ id, phase: 'running', left: 0, right: 0, endsAt: Date.now() + BATTLE_DURATION_MS, winner: null });
    pendingRef.current = null;
    setPending(null);
  }, []);

  const addScore = React.useCallback((side: BattleSide, coins: number) => {
    const b = battleRef.current;
    if (!b || b.phase !== 'running' || coins <= 0) return;
    setBattleBoth({ ...b, [side]: b[side] + coins });
  }, []);

  /* ── public actions ── */
  const play = React.useCallback(() => {
    const side = latest.current.mySide;
    if (!side || battleRef.current?.phase === 'running' || pendingRef.current) return;
    const id = newBattleId();
    pendingRef.current = id;
    setPending(id);
    const payload = { t: 'battle-invite', id, side, name: latest.current.myName };
    emit(payload);
    window.setTimeout(() => { if (pendingRef.current === id) emit(payload); }, 1200);
    window.setTimeout(() => { if (pendingRef.current === id) emit(payload); }, 3000); // INSTANT-OPEN-V2
    window.setTimeout(() => {
      if (pendingRef.current === id) {
        pendingRef.current = null;
        setPending(null);
        latest.current.onToast?.('No answer');
      }
    }, 30_000);
  }, [emit]);

  const accept = React.useCallback(() => {
    const inv = incomingRef.current;
    if (!inv) return;
    incomingRef.current = null;
    setIncoming(null);
    const side = latest.current.mySide;
    const payload = { t: 'battle-accept', id: inv.id, side };
    emit(payload);
    if (side === 'left') { startAsAuthority(inv.id); return; }
    // INSTANT-OPEN (B / right): open the round on my side the moment I tap Accept; A confirms + syncs it with battle-state.
    if (battleRef.current?.phase !== 'running') {
      acceptedIdRef.current = inv.id;
      seenGiftsRef.current = new Set();
      setBattleBoth({ id: inv.id, phase: 'running', left: 0, right: 0, endsAt: Date.now() + BATTLE_DURATION_MS, winner: null });
    }
    // keep telling A until his confirmation arrives (a lost signal must not cancel the round)
    [800, 2000, 4000].forEach((ms) => window.setTimeout(() => { if (acceptedIdRef.current === inv.id) emit(payload); }, ms));
    window.setTimeout(() => {
      if (acceptedIdRef.current !== inv.id) return;
      acceptedIdRef.current = null;
      if (battleRef.current?.id === inv.id && battleRef.current.phase === 'running') setBattleBoth(null);
      latest.current.onToast?.('Could not start the round');
    }, 12_000);
  }, [emit, startAsAuthority]);

  const decline = React.useCallback(() => {
    const inv = incomingRef.current;
    if (!inv) return;
    incomingRef.current = null;
    setIncoming(null);
    emit({ t: 'battle-decline', id: inv.id, side: latest.current.mySide, name: latest.current.myName });
  }, [emit]);

  /* ── incoming signals (call it from live-camera for every signal / data-stream message) ── */
  const handleMessage = React.useCallback((msg: any): boolean => {
    if (!isBattleMessage(msg)) return false;
    if (msg.src && msg.src === srcRef.current) return true; // my own echo
    const stamp = Number(msg.at) || Number(msg.ts) || 0;
    const age = stamp ? Date.now() - stamp : 0;
    const me = latest.current;

    switch (msg.t) {
      case 'battle-invite': {
        if (!me.mySide || msg.side === me.mySide || age > 45_000) return true;
        const id = String(msg.id || '');
        if (!id || seenMsgRef.current.has(`i:${id}`)) return true;
        seenMsgRef.current.add(`i:${id}`);
        if (battleRef.current?.phase === 'running' || incomingRef.current) return true;
        // INSTANT-OPEN-V2: both hosts tapped Play at the same time -> that is already an agreement: open at once, no box
        if (pendingRef.current) {
          emit({ t: 'battle-accept', id, side: me.mySide });
          if (me.mySide === 'left') startAsAuthority(id); else openAsGuest(id);
          pendingRef.current = null;
          setPending(null);
          return true;
        }
        const inv: Incoming = { id, fromSide: msg.side, fromName: String(msg.name || me.peerName || 'User'), at: Date.now() };
        incomingRef.current = inv;
        setIncoming(inv);
        window.setTimeout(() => {
          if (incomingRef.current?.id === id) { incomingRef.current = null; setIncoming(null); }
        }, 30_000);
        return true;
      }
      case 'battle-decline': {
        if (age > 45_000) return true;
        if (pendingRef.current && pendingRef.current === String(msg.id)) {
          pendingRef.current = null;
          setPending(null);
          me.onToast?.(`${msg.name || me.peerName || 'User'} declined`);
        }
        return true;
      }
      case 'battle-accept': {
        if (age > 45_000) return true;
        const id = String(msg.id || '');
        if (pendingRef.current === id) {
          // INSTANT-OPEN-V2: the other host accepted my invite -> open on my side right now (no waiting for the next battle-state)
          if (me.mySide === 'right') openAsGuest(id);
          pendingRef.current = null;
          setPending(null);
        }
        if (me.mySide === 'left' && id && !seenMsgRef.current.has(`a:${id}`)) {
          seenMsgRef.current.add(`a:${id}`);
          startAsAuthority(id);
        } else if (me.mySide === 'left' && battleRef.current?.id === id && battleRef.current.phase === 'running') {
          broadcastState(); // BATTLE-RELIABLE: B repeated his Accept = he has not got the round yet -> send the state to him again now
        }
        return true;
      }
      case 'battle-state': {
        if (me.mySide === 'left') return true; // I am the authority
        const id = String(msg.id || '');
        if (!id) return true;
        const expected = id === pendingRef.current || id === acceptedIdRef.current; // INSTANT-OPEN: round I just invited / accepted
        if (age > 10_000 && !expected) return true; // old replayed state
        const phase = msg.phase === 'ended' ? 'ended' : 'running';
        const prev = battleRef.current;
        if (phase === 'ended' && !prev) return true; // do not resurrect a finished round
        if (phase === 'running' && prev?.id === id && prev.phase === 'ended') return true;
        pendingRef.current = null;
        setPending(null);
        if (acceptedIdRef.current === id) acceptedIdRef.current = null; // confirmed by A
        incomingRef.current = null;
        setIncoming(null);
        const next: BattleView = {
          id, phase,
          left: Number(msg.left) || 0,
          right: Number(msg.right) || 0,
          endsAt: Date.now() + Math.max(0, Number(msg.remainMs) || 0),
          winner: msg.winner === 'left' || msg.winner === 'right' || msg.winner === 'draw' ? msg.winner : null,
        };
        setBattleBoth(next);
        if (phase === 'ended') scheduleClear(id);
        return true;
      }
      case 'battle-gift': {
        if (age > 20_000) return true;
        const gid = String(msg.gid || '');
        const side: BattleSide = msg.side === 'right' ? 'right' : 'left';
        const coins = Number(msg.coins) || 0;
        if (!gid || seenGiftsRef.current.has(gid)) return true;
        seenGiftsRef.current.add(gid);
        // the authority sums the other host's gifts (its own are summed from its own polling)
        if (me.mySide === 'left' && side === 'right') addScore('right', coins);
        addPopup({ id: gid, side, coins, count: Number(msg.count) || 1, label: String(msg.label || '') });
        return true;
      }
      default:
        return true;
    }
  }, [addScore, startAsAuthority, openAsGuest, broadcastState, emit]);

  /* ── authority loop: finish at 0 + heartbeat ── */
  React.useEffect(() => {
    if (mySide !== 'left' || !battle || battle.phase !== 'running') return;
    const id = battle.id;
    const iv = window.setInterval(() => {
      const b = battleRef.current;
      if (!b || b.id !== id || b.phase !== 'running') return;
      if (Date.now() >= b.endsAt) {
        const winner: BattleSide | 'draw' = b.left === b.right ? 'draw' : b.left > b.right ? 'left' : 'right';
        setBattleBoth({ ...b, phase: 'ended', endsAt: Date.now(), winner });
        broadcastState();
        window.setTimeout(broadcastState, 400);
        window.setTimeout(broadcastState, 1200);
        scheduleClear(id);
      } else {
        broadcastState();
      }
    }, STATE_EVERY_MS);
    return () => window.clearInterval(iv);
  }, [mySide, battle?.id, battle?.phase, broadcastState]);

  /* ── display clock ── */
  React.useEffect(() => {
    if (!battle || battle.phase !== 'running') return;
    const iv = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(iv);
  }, [battle?.id, battle?.phase]);

  /* ── my own gifts (hosts only): poll /api/live-gifts of my room while a round runs ── */
  React.useEffect(() => {
    if (!mySide || !battle || battle.phase !== 'running') return;
    const id = battle.id;
    let stop = false;
    const sinceByRoom = new Map<string, number>();

    const pollRoom = async (room: string) => {
      try {
        const since = sinceByRoom.get(room);
        const url = `/api/live-gifts?room=${encodeURIComponent(room)}${since != null ? `&since=${since}` : ''}`;
        const r = await fetch(url, { credentials: 'include', cache: 'no-store' });
        if (!r.ok) return;
        const d: any = await r.json();
        if (d?.now != null) sinceByRoom.set(room, Number(d.now) || Date.now());
        if (since == null) return; // first call only returns the clock
        for (const e of (d.events || []) as any[]) {
          const gid = `${room}:${e.id}`;
          if (seenGiftsRef.current.has(gid)) continue;
          seenGiftsRef.current.add(gid);
          const cur = latest.current;
          const unit = Number(e.price) > 0 ? Number(e.price) : (cur.priceOf?.(String(e.giftId || '')) || 1);
          const coins = Math.max(1, unit) * Math.max(1, Number(e.count) || 1);
          // in A's room a gift addressed to the guest B counts for B; everything else counts for the room owner
          const forGuest = cur.mySide === 'left' && cur.peerUserId && sameId(e.toUserId, cur.peerUserId);
          const side: BattleSide = cur.mySide === 'right' ? 'right' : forGuest ? 'right' : 'left';
          if (cur.mySide === 'left') addScore(side, coins);
          addPopup({ id: gid, side, coins, count: Number(e.count) || 1, label: String(e.toName || '') });
          // tell the other host + the viewers (authority re-broadcasts the totals anyway)
          emit({ t: 'battle-gift', id, gid: cur.mySide === 'right' ? gid : `${gid}#l`, side, coins, count: Number(e.count) || 1, label: String(e.toName || '') });
        }
      } catch { /* ignore */ }
    };

    const tick = () => { if (!stop) latest.current.giftRooms.filter(Boolean).forEach((room) => void pollRoom(room)); };
    tick();
    const iv = window.setInterval(tick, 2000);
    return () => { stop = true; window.clearInterval(iv); };
  }, [mySide, battle?.id, battle?.phase, addScore, emit]);

  /* ── reset when the split ends ── */
  React.useEffect(() => {
    if (active) return;
    setBattleBoth(null);
    pendingRef.current = null; setPending(null);
    acceptedIdRef.current = null;
    incomingRef.current = null; setIncoming(null);
    setPopups([]);
    seenGiftsRef.current = new Set();
  }, [active]);

  React.useEffect(() => () => { if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current); }, []);

  const remainMs = battle?.phase === 'running' ? Math.max(0, battle.endsAt - now) : 0;
  return { battle, remainMs, pending: !!pending, incoming, popups, play, accept, decline, handleMessage };
}

/* ───────────────────────── UI ───────────────────────── */

/**
 * While a round runs, the gift animation drawn by LiveCoinsDock (wrapped in [data-live-gift-fx]) becomes light and
 * translucent so it never hides the two cameras. It is only dimmed — it still plays and finishes normally.
 */
export function BattleGiftDimStyle({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <style>{`
[data-live-gift-fx] {
  opacity: 0.35 !important;
  pointer-events: none !important;
  transition: opacity 200ms ease;
}
`}</style>
  );
}

/** Round "Play" button in the middle of the split (hosts only). */
export function BattlePlayButton({
  visible, waiting, topPx, onPlay,
}: { visible: boolean; waiting: boolean; topPx: number | null; onPlay: () => void }) {
  return (
    <AnimatePresence>
      {visible ? (
        <motion.button
          key="battle-play"
          type="button"
          onClick={onPlay}
          disabled={waiting}
          aria-label="Start a game round"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          whileTap={{ scale: 0.92 }}
          style={{
            position: 'absolute',
            left: '50%',
            top: topPx != null ? topPx / 2 : '25%',
            transform: 'translate(-50%, -50%)',
            zIndex: 93,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            minWidth: 64,
            height: 64,
            padding: waiting ? '0 12px' : 0,
            borderRadius: 999,
            border: '2px solid rgba(255,255,255,0.9)',
            cursor: waiting ? 'default' : 'pointer',
            color: '#fff',
            fontWeight: 900,
            fontSize: '0.78rem',
            background: waiting
              ? 'linear-gradient(135deg, rgba(71,85,105,0.95), rgba(51,65,85,0.95))'
              : 'linear-gradient(135deg, #facc15 0%, #fb923c 100%)',
            boxShadow: '0 4px 18px rgba(251,146,60,0.55)',
            flexDirection: 'column',
          }}
        >
          {waiting ? (
            <span style={{ fontSize: '0.7rem', fontWeight: 800 }}>…</span>
          ) : (
            <>
              <Play size={22} fill="#fff" strokeWidth={0} />
              <span style={{ fontSize: '0.66rem', lineHeight: 1, letterSpacing: 0.4 }}>Play</span>
            </>
          )}
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}

/** Accept | Decline box for the invited host (same look as the duet invite box). */
export function BattleIncomingDialog({
  invite, onAccept, onDecline,
}: { invite: { fromName: string } | null; onAccept: () => void; onDecline: () => void }) {
  return (
    <AnimatePresence>
      {invite ? (
        <motion.div
          key="battle-incoming"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 9600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.55)',
          }}
        >
          <div
            style={{
              width: 'min(86%, 330px)',
              padding: '18px 16px 14px',
              borderRadius: 18,
              background: '#101818',
              border: '1px solid rgba(251,146,60,0.55)',
              boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
              textAlign: 'center',
              color: '#e6fbfb',
            }}
          >
            <div style={{ fontSize: '1.7rem', marginBottom: 4 }}>⚔️</div>
            <p style={{ margin: '0 0 4px', fontWeight: 900, fontSize: '0.95rem' }}>{invite.fromName}</p>
            <p style={{ margin: '0 0 14px', fontSize: '0.8rem', color: 'rgba(200,230,230,0.75)' }}>
              invites you to a game round · 4:00
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={onAccept}
                style={{
                  flex: 1, padding: '12px 8px', borderRadius: 14, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #facc15, #fb923c)', color: '#1a1200', fontWeight: 900, fontSize: '0.9rem',
                }}
              >
                Accept
              </button>
              <button
                type="button"
                onClick={onDecline}
                style={{
                  flex: 1, padding: '12px 8px', borderRadius: 14, cursor: 'pointer',
                  border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.06)', color: '#e6fbfb',
                  fontWeight: 800, fontSize: '0.9rem',
                }}
              >
                Decline
              </button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Name tag at the BOTTOM of a user's rectangle (replaces the top tag while the split is on). */
export function BattleNameTag({ name, username, side }: { name: string; username?: string | null; side: BattleSide }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 8,
        right: 8,
        bottom: 8,
        zIndex: 4,
        display: 'flex',
        justifyContent: side === 'left' ? 'flex-start' : 'flex-end',
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          maxWidth: '100%',
          padding: '4px 10px',
          borderRadius: 999,
          background: 'rgba(0,0,0,0.55)',
          color: '#fff',
          fontSize: '0.72rem',
          fontWeight: 800,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textShadow: '0 1px 2px rgba(0,0,0,0.6)',
        }}
      >
        {username ? `@${username}` : name}
      </span>
    </div>
  );
}

/** Score line, timer, "You Win" rectangle and light support pills — drawn over the split area only. */
export function BattleOverlay({
  battle: battleIn, remainMs, popups: popupsIn, heightPx, flip,
}: {
  battle: BattleView | null;
  remainMs: number;
  popups: BattlePopup[];
  mySide?: BattleSide | null;
  heightPx: number | null;
  /** B's own screen shows B on the left and A on the right: mirror the data so colors follow the SCREEN halves. */
  flip?: boolean;
}) {
  const mirror = (s: BattleSide): BattleSide => (s === 'left' ? 'right' : 'left');
  const battle: BattleView | null = battleIn && flip
    ? { ...battleIn, left: battleIn.right, right: battleIn.left, winner: battleIn.winner === 'draw' || battleIn.winner == null ? battleIn.winner : mirror(battleIn.winner) }
    : battleIn;
  const popups = flip ? popupsIn.map((p) => ({ ...p, side: mirror(p.side) })) : popupsIn;
  const running = battle?.phase === 'running';
  const ended = battle?.phase === 'ended';
  const total = battle ? battle.left + battle.right : 0;
  const leftPct = battle && total > 0 ? Math.min(92, Math.max(8, (battle.left / total) * 100)) : 50;
  const red = running && remainMs <= BATTLE_RED_MS;

  return (
    <div
      style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: heightPx != null ? heightPx : '60%',
        zIndex: 5, pointerEvents: 'none', overflow: 'hidden',
      }}
    >
      {battle ? (
        <div
          style={{
            position: 'absolute', left: 0, right: 0,
            top: 'calc(max(env(safe-area-inset-top,0px),14px) + 64px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          }}
        >
          {/* the line: yellow (left) | orange (right) */}
          <div style={{ width: '100%', position: 'relative', height: 20, display: 'flex' }}>
            <div style={{ width: `${leftPct}%`, background: BATTLE_COLORS.left, transition: 'width 600ms ease', position: 'relative' }}>
              <span style={{ position: 'absolute', left: 8, top: 0, lineHeight: '20px', fontWeight: 900, fontSize: '0.8rem', color: '#2b2000' }}>
                {fmtCoins(battle.left)}
              </span>
              <motion.span
                animate={{ y: [0, -2, 0] }}
                transition={{ repeat: Infinity, duration: 0.9 }}
                style={{ position: 'absolute', right: -2, top: -4, fontSize: '1.15rem', zIndex: 2 }}
              >
                {BATTLE_EMOJI.left}
              </motion.span>
            </div>
            <div style={{ flex: 1, background: BATTLE_COLORS.right, position: 'relative' }}>
              <span style={{ position: 'absolute', right: 8, top: 0, lineHeight: '20px', fontWeight: 900, fontSize: '0.8rem', color: '#2a1000' }}>
                {fmtCoins(battle.right)}
              </span>
              <motion.span
                animate={{ y: [0, -2, 0] }}
                transition={{ repeat: Infinity, duration: 0.9, delay: 0.2 }}
                style={{ position: 'absolute', left: -2, top: -4, fontSize: '1.15rem', zIndex: 2 }}
              >
                {BATTLE_EMOJI.right}
              </motion.span>
            </div>
          </div>

          {/* timer pill */}
          <motion.div
            animate={red ? { scale: [1, 1.08, 1] } : { scale: 1 }}
            transition={red ? { repeat: Infinity, duration: 0.8 } : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '4px 14px', borderRadius: 999,
              background: red ? 'rgba(127,29,29,0.92)' : 'rgba(30,30,30,0.82)',
              border: red ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.18)',
              color: red ? '#fecaca' : '#fff', fontWeight: 900, fontSize: '0.9rem', fontVariantNumeric: 'tabular-nums',
            }}
          >
            <Swords size={15} color={red ? '#fca5a5' : '#facc15'} />
            <span style={{ color: red ? '#ef4444' : '#fff' }}>{ended ? '00:00' : fmtClock(remainMs)}</span>
          </motion.div>
        </div>
      ) : null}

      {/* light support pills — small, translucent, at the bottom of the supported half */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 38, display: 'flex' }}>
        {(['left', 'right'] as BattleSide[]).map((side) => (
          <div key={side} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: side === 'left' ? 'flex-start' : 'flex-end', gap: 4, padding: '0 8px' }}>
            <AnimatePresence>
              {popups.filter((p) => p.side === side).map((p) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 0.78, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  style={{
                    padding: '3px 9px', borderRadius: 999, background: 'rgba(0,0,0,0.38)',
                    border: `1px solid ${BATTLE_COLORS[side]}88`, color: '#fff', fontWeight: 800, fontSize: '0.68rem',
                    maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}
                >
                  🎁{p.count > 1 ? ` ×${p.count}` : ''} +{fmtCoins(p.coins)}{p.label ? ` · ${p.label}` : ''}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* result rectangles */}
      <AnimatePresence>
        {ended && battle ? (
          <motion.div
            key="battle-result"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'absolute', inset: 0, display: 'flex' }}
          >
            {(['left', 'right'] as BattleSide[]).map((side) => {
              const win = battle.winner === side;
              const draw = battle.winner === 'draw';
              return (
                <div key={side} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div
                    style={{
                      padding: '10px 18px', borderRadius: 14,
                      background: draw ? 'rgba(30,41,59,0.9)' : win ? `linear-gradient(135deg, ${BATTLE_COLORS[side]}, #fff3b0)` : 'rgba(15,15,15,0.72)',
                      border: draw ? '2px solid #94a3b8' : win ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                      color: draw ? '#e2e8f0' : win ? '#2b1a00' : 'rgba(255,255,255,0.7)',
                      fontWeight: 900, fontSize: win ? '1.25rem' : '0.95rem', textAlign: 'center',
                      boxShadow: win ? '0 0 26px rgba(250,204,21,0.7)' : 'none',
                    }}
                  >
                    {draw ? 'Draw' : win ? '🏆 You Win' : 'You Lose'}
                  </div>
                </div>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
