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
 *   battle-invite / battle-accept / battle-countdown / battle-decline / battle-state / battle-gift
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
  /** SUPPORT-LIVE-PATCH: first three supporters of each side (server orientation: left = A) */
  top?: BattleTop;
};

/* SUPPORT-LIVE-PATCH: one of the first three supporters of a side (kept by the server for the running round) */
export type BattleSupporter = { userId: string; name: string; avatarUrl: string | null; coins: number };
export type BattleTop = { left: BattleSupporter[]; right: BattleSupporter[] };
function parseTop(x: any): BattleTop | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const one = (l: any): BattleSupporter[] => (Array.isArray(l) ? l : []).slice(0, 3)
    .map((s: any) => ({ userId: String(s?.userId || ''), name: String(s?.name || ''), avatarUrl: typeof s?.avatarUrl === 'string' && s.avatarUrl ? s.avatarUrl : null, coins: Number(s?.coins) || 0 }))
    .filter((s) => s.userId);
  return { left: one(x.left), right: one(x.right) };
}

export type BattlePopup = { id: string; side: BattleSide; coins: number; count: number; label: string; avatar?: string | null };

type Incoming = { id: string; fromSide: BattleSide; fromName: string; at: number };

export const BATTLE_DURATION_MS = 4 * 60 * 1000;
export const BATTLE_RED_MS = 15 * 1000;
const RESULT_MS = 7000;
/** OK-BUTTON-PATCH: how long an invite stays open (red ring runs this long, then the request fails on both phones). */
export const BATTLE_INVITE_MS = 20_000;
/** SUPPORT-LIVE-PATCH: after the other host taps Ok the round starts by itself this long afterwards (nobody taps Play again). */
export const BATTLE_AUTO_START_MS = 5000; // COUNTDOWN-START-PATCH: after the other host accepts, a 5..1 countdown circle on BOTH phones, then the round opens by itself
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
  /** LINE-FOR-ALL-PATCH: send a signal into MY OWN room (so the viewers of the invited host B can see the line too). */
  sendOwn?: (payload: Record<string, unknown>) => void;
  /** GIFT-FX-ALL-PATCH: id of the host whose room THIS page is in (viewers too) — a gift from the OTHER host's room is replayed here. */
  roomHostId?: string;
  onToast?: (text: string) => void;
};

export function useLiveBattle(opts: UseLiveBattleOpts) {
  const { active, mySide, myId, myName, peerName, peerUserId, giftRooms, priceOf, send, sendOwn, roomHostId, onToast } = opts;

  const [battle, setBattle] = React.useState<BattleView | null>(null);
  const battleRef = React.useRef<BattleView | null>(null);
  const [pending, setPending] = React.useState<string | null>(null); // id of an invite I sent
  const pendingRef = React.useRef<string | null>(null);
  const [incoming, setIncoming] = React.useState<Incoming | null>(null);
  const incomingRef = React.useRef<Incoming | null>(null);
  const [popups, setPopups] = React.useState<BattlePopup[]>([]);
  const [starting, setStarting] = React.useState<string | null>(null); // SUPPORT-LIVE-PATCH: Ok tapped -> auto start in 2s
  const startingIdRef = React.useRef<string | null>(null);
  const startingTimerRef = React.useRef<number | null>(null);
  const startedIdsRef = React.useRef<Set<string>>(new Set()); // COUNTDOWN-SYNC-PATCH: a round id never gets a second countdown
  const peerCountIdRef = React.useRef<string | null>(null); // COUNTDOWN-SYNC-PATCH-2: the other host told me HE counts too (proof the signal arrived both ways)
  const [countEnd, setCountEnd] = React.useState<number | null>(null); // COUNTDOWN-START-PATCH: when the 5..1 countdown ends (local clock)
  const [countLeft, setCountLeft] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (countEnd == null) { setCountLeft(null); return; }
    const upd = () => setCountLeft(Math.min(Math.ceil(BATTLE_AUTO_START_MS / 1000), Math.max(1, Math.ceil((countEnd - Date.now()) / 1000))));
    upd();
    const iv = window.setInterval(upd, 120);
    return () => window.clearInterval(iv);
  }, [countEnd]);
  const serverIdRef = React.useRef<string | null>(null); // SERVER-TRUTH-PATCH: round whose score is driven ONLY by the server (/api/live-battle)
  const [now, setNow] = React.useState(() => Date.now());

  const srcRef = React.useRef(`b_${Math.random().toString(36).slice(2, 10)}`);
  const seenGiftsRef = React.useRef<Set<string>>(new Set());
  const seenMsgRef = React.useRef<Set<string>>(new Set());
  const clearTimerRef = React.useRef<number | null>(null);
  const acceptedIdRef = React.useRef<string | null>(null); // INSTANT-OPEN: invite I accepted as B, until A confirms it with battle-state
  const latest = React.useRef({ send, sendOwn, roomHostId, onToast, mySide, myId, myName, peerName, peerUserId, giftRooms, priceOf });
  latest.current = { send, sendOwn, roomHostId, onToast, mySide, myId, myName, peerName, peerUserId, giftRooms, priceOf };

  const setBattleBoth = (b: BattleView | null) => {
    battleRef.current = b;
    setBattle(b);
  };

  const emit = React.useCallback((payload: Record<string, unknown>) => {
    try { latest.current.send({ ...payload, src: srcRef.current, ts: Date.now() }); } catch { /* ignore */ }
  }, []);

  /** COUNTDOWN-SERVER-PATCH: tell the SERVER the countdown of round `id` starts now. Both phones read it back from
   *  /api/live-battle (see useBattleServerSync) and show the same 5..1 circle. The server keeps the first call, repeats are harmless. */
  const postReady = React.useCallback((id: string) => {
    const c = latest.current;
    const rh = String(c.roomHostId || '');
    const peer = String(c.peerUserId || '');
    if (!c.mySide || !rh || !peer) return;
    const a = c.mySide === 'left' ? rh : peer; // a = owner of the split (left), b = invited host (right)
    const b = c.mySide === 'left' ? peer : rh;
    const post = () => {
      try {
        void fetch('/api/live-battle', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'ready', id, a, b }),
        }).catch(() => { /* ignore */ });
      } catch { /* ignore */ }
    };
    post();
    window.setTimeout(post, 1200);
  }, []);

  /* ── STOP-GAME-PATCH: "Stop Game" cancels the round (or its countdown / invite) but nobody leaves the split ── */
  const stoppedIdsRef = React.useRef<Set<string>>(new Set()); // a stopped round id is never shown / counted again (late signals, in-flight polls)

  const resetRoundLocal = React.useCallback(() => {
    if (clearTimerRef.current) { window.clearTimeout(clearTimerRef.current); clearTimerRef.current = null; }
    if (startingTimerRef.current) { window.clearTimeout(startingTimerRef.current); startingTimerRef.current = null; }
    startingIdRef.current = null; setStarting(null); setCountEnd(null);
    pendingRef.current = null; setPending(null);
    acceptedIdRef.current = null;
    incomingRef.current = null; setIncoming(null);
    setPopups([]);
    serverIdRef.current = null;
    setBattleBoth(null);
  }, []);

  const stop = React.useCallback(() => {
    const id = battleRef.current?.id || startingIdRef.current || pendingRef.current || incomingRef.current?.id || acceptedIdRef.current || null;
    if (!id) return false;
    stoppedIdsRef.current.add(id);
    const side = latest.current.mySide;
    const payload = { t: 'battle-stop', id };
    const fire = () => {
      emit(payload);
      // B: also tell the viewers of MY OWN room (A's viewers already get it through A's channel)
      if (side === 'right') { try { latest.current.sendOwn?.({ ...payload, src: srcRef.current, ts: Date.now() }); } catch { /* ignore */ } }
    };
    fire();
    [300, 900, 2000].forEach((ms) => window.setTimeout(fire, ms));
    try {
      void fetch('/api/live-battle', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'end', id }), keepalive: true,
      }).catch(() => { /* ignore */ });
    } catch { /* ignore */ }
    resetRoundLocal();
    latest.current.onToast?.('Game stopped');
    return true;
  }, [emit, resetRoundLocal]);

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

  /** SERVER-TRUTH-PATCH: a score that arrives through a signal (battle-state / battle-view) never overwrites the server score. */
  const mergeServerTruth = (prev: BattleView | null, next: BattleView): BattleView => {
    if (!prev || prev.id !== next.id || serverIdRef.current !== next.id) return next;
    if (next.phase === 'running') return { ...next, left: prev.left, right: prev.right };
    const left = Math.max(prev.left, next.left);
    const right = Math.max(prev.right, next.right);
    return { ...next, left, right, winner: left === right ? 'draw' : left > right ? 'left' : 'right' };
  };

  /* ── authority (A = left): clock, scores, state broadcast ── */
  const broadcastState = React.useCallback(() => {
    const b = battleRef.current;
    if (!b) return;
    emit({
      t: 'battle-state', id: b.id, phase: b.phase, left: b.left, right: b.right,
      remainMs: Math.max(0, b.endsAt - Date.now()), winner: b.winner, top: b.top,
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

  /** SUPPORT-LIVE-PATCH: the Play circle stays on both screens for 2s, then the round starts by itself (A = authority, B = guest).
   *  COUNTDOWN-SYNC-PATCH: whoever starts the countdown first ALSO sends `battle-countdown`, so the other phone shows the same
   *  5..1 circle even if its own Ok / Accept signal was lost or late. Both phones then open the round together. */
  const scheduleStart = React.useCallback((id: string, ms: number = BATTLE_AUTO_START_MS, announce: boolean = true) => {
    if (battleRef.current?.phase === 'running') return;
    if (startingIdRef.current) return; // COUNTDOWN-START-PATCH: one countdown at a time, a second accept / invite never restarts it
    if (startedIdsRef.current.has(id)) return; // COUNTDOWN-SYNC-PATCH
    if (stoppedIdsRef.current.has(id)) return; // STOP-GAME-PATCH
    startedIdsRef.current.add(id);
    const dur = Math.min(BATTLE_AUTO_START_MS, Math.max(800, ms));
    startingIdRef.current = id;
    setStarting(id);
    setCountEnd(Date.now() + dur);
    pendingRef.current = null;
    setPending(null);
    incomingRef.current = null;
    setIncoming(null);
    if (announce) {
      postReady(id); // COUNTDOWN-SERVER-PATCH
      const payload = { t: 'battle-countdown', id, remainMs: dur };
      emit(payload);
      window.setTimeout(() => { if (startingIdRef.current === id) emit({ ...payload, remainMs: Math.max(800, dur - 500) }); }, 500);
      window.setTimeout(() => { if (startingIdRef.current === id) emit({ ...payload, remainMs: Math.max(800, dur - 1500) }); }, 1500);
    }
    if (startingTimerRef.current) window.clearTimeout(startingTimerRef.current);
    startingTimerRef.current = window.setTimeout(() => {
      if (startingIdRef.current !== id) return;
      startingIdRef.current = null;
      setStarting(null);
      setCountEnd(null);
      if (battleRef.current?.phase === 'running') return;
      if (latest.current.mySide === 'left') startAsAuthority(id); else openAsGuest(id);
    }, dur);
  }, [startAsAuthority, openAsGuest, emit, postReady]);

  /** COUNTDOWN-SERVER-PATCH: the server says a countdown is running for my pair -> show the same circle here (hosts only). */
  const applyCountdown = React.useCallback((id: string, remainMs: number) => {
    if (!latest.current.mySide || !id || !(remainMs > 0)) return;
    if (stoppedIdsRef.current.has(id)) return; // STOP-GAME-PATCH
    if (battleRef.current) return;
    scheduleStart(id, remainMs, false);
  }, [scheduleStart]);

  const addScore = React.useCallback((side: BattleSide, coins: number) => {
    const b = battleRef.current;
    if (!b || b.phase !== 'running' || coins <= 0) return;
    // SERVER-TRUTH-PATCH: once the server keeps this round, the phone NEVER adds coins itself (it used to add the gift on top of the
    // server value = doubled line on some phones). Every phone just shows the server score, so all phones show the same number.
    if (serverIdRef.current === b.id) return;
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
    }, BATTLE_INVITE_MS);
  }, [emit]);

  const accept = React.useCallback(() => {
    const inv = incomingRef.current;
    if (!inv) return;
    incomingRef.current = null;
    setIncoming(null);
    const side = latest.current.mySide;
    const payload = { t: 'battle-accept', id: inv.id, side };
    emit(payload);
    if (side === 'left') { scheduleStart(inv.id); return; } // SUPPORT-LIVE-PATCH: starts 2s after Ok
    // INSTANT-OPEN (B / right): open the round on my side the moment I tap Accept; A confirms + syncs it with battle-state.
    if (battleRef.current?.phase !== 'running') {
      acceptedIdRef.current = inv.id;
      scheduleStart(inv.id); // SUPPORT-LIVE-PATCH: the round opens by itself 2s after Ok (A's battle-state may open it earlier)
    }
    // keep telling A until his confirmation arrives (a lost signal must not cancel the round)
    // COUNTDOWN-SYNC-PATCH-2: repeat Accept AND the countdown signal quickly until the other host confirms (so HIS circle always appears too)
    [400, 800, 1400, 2000, 3000, 4000].forEach((ms) => window.setTimeout(() => {
      if (acceptedIdRef.current !== inv.id || peerCountIdRef.current === inv.id) return;
      emit(payload);
      if (startingIdRef.current === inv.id) emit({ t: 'battle-countdown', id: inv.id, remainMs: Math.max(800, BATTLE_AUTO_START_MS - ms) });
    }, ms));
    window.setTimeout(() => {
      if (acceptedIdRef.current !== inv.id) return;
      acceptedIdRef.current = null;
      if (battleRef.current?.id === inv.id && battleRef.current.phase === 'running') setBattleBoth(null);
      latest.current.onToast?.('Could not start the round');
    }, 12_000);
  }, [emit, scheduleStart]);

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

    // STOP-GAME-PATCH: the host pressed "Stop Game" -> the round disappears everywhere, the split stays
    if (msg.t === 'battle-stop') {
      const sid = String(msg.id || '');
      if (!sid || age > 60_000 || stoppedIdsRef.current.has(sid)) return true;
      stoppedIdsRef.current.add(sid);
      const mine = battleRef.current?.id === sid || startingIdRef.current === sid || pendingRef.current === sid
        || incomingRef.current?.id === sid || acceptedIdRef.current === sid;
      if (mine) resetRoundLocal();
      if (me.mySide === 'left') { emit({ t: 'battle-stop', id: sid }); }                                   // A: make sure A's own viewers get it
      else if (me.mySide === 'right') { try { me.sendOwn?.({ t: 'battle-stop', id: sid, src: srcRef.current, ts: Date.now() }); } catch { /* ignore */ } } // B: his viewers
      if (mine && me.mySide) me.onToast?.('Game stopped');
      return true;
    }
    if (msg.id && stoppedIdsRef.current.has(String(msg.id))) return true; // late signal of a stopped round

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
          scheduleStart(id); // COUNTDOWN-START-PATCH: same 5..1 countdown for both
          pendingRef.current = null;
          setPending(null);
          return true;
        }
        const inv: Incoming = { id, fromSide: msg.side, fromName: String(msg.name || me.peerName || 'User'), at: Date.now() };
        incomingRef.current = inv;
        setIncoming(inv);
        window.setTimeout(() => {
          if (incomingRef.current?.id === id) { incomingRef.current = null; setIncoming(null); }
        }, BATTLE_INVITE_MS);
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
        const id = String(msg.id || '');
        if (age > 45_000 && pendingRef.current !== id) return true; // COUNTDOWN-SYNC-PATCH-2: an answer to MY open invite is never dropped for its age (clock skew)
        if (pendingRef.current === id) {
          // INSTANT-OPEN-V2: the other host accepted my invite -> open on my side right now (no waiting for the next battle-state)
          if (me.mySide === 'right') scheduleStart(id); // SUPPORT-LIVE-PATCH
          pendingRef.current = null;
          setPending(null);
        }
        if (me.mySide === 'left' && id && !seenMsgRef.current.has(`a:${id}`)) {
          seenMsgRef.current.add(`a:${id}`);
          scheduleStart(id); // SUPPORT-LIVE-PATCH
        } else if (me.mySide === 'left' && battleRef.current?.id === id && battleRef.current.phase === 'running') {
          broadcastState(); // BATTLE-RELIABLE: B repeated his Accept = he has not got the round yet -> send the state to him again now
        }
        return true;
      }
      case 'battle-countdown': {
        // COUNTDOWN-SYNC-PATCH: the other host's circle already counts -> show the same 5..1 circle here, then open together.
        // COUNTDOWN-SYNC-PATCH-2: a countdown for the round I invited / accepted is never dropped for its age; it is also answered
        // with my own countdown signal (loop-free: scheduleStart ignores a round that already counts).
        if (!me.mySide) return true;
        const id = String(msg.id || '');
        if (!id) return true;
        const known = id === pendingRef.current || id === acceptedIdRef.current || incomingRef.current?.id === id || startingIdRef.current === id;
        if (!known && age > 45_000) return true;
        if (battleRef.current) return true;
        peerCountIdRef.current = id;
        if (acceptedIdRef.current === id) acceptedIdRef.current = null; // confirmed: the other host counts too
        scheduleStart(id, Number(msg.remainMs) || BATTLE_AUTO_START_MS, true);
        return true;
      }
      case 'battle-state': {
        if (me.mySide === 'left') return true; // I am the authority
        const id = String(msg.id || '');
        if (!id) return true;
        const expected = id === pendingRef.current || id === acceptedIdRef.current; // INSTANT-OPEN: round I just invited / accepted
        // LINE-FOR-ALL-PATCH: a round I already know is never dropped for its age (phone clocks can differ by many seconds)
        const known = battleRef.current?.id === id;
        if (!known && age > 30_000 && !expected) return true; // old replayed state
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
          top: parseTop(msg.top) ?? (prev?.id === id ? prev.top : undefined), // SUPPORT-LIVE-PATCH
        };
        setBattleBoth(mergeServerTruth(prev, next)); // SERVER-TRUTH-PATCH
        if (phase === 'ended') scheduleClear(id);
        return true;
      }
      case 'battle-view': {
        // LINE-FOR-ALL-PATCH: B relays the round into his own room so HIS viewers see the line + timer too (already mirrored: left = B)
        if (me.mySide) return true;
        const id = String(msg.id || '');
        if (!id) return true;
        const prev = battleRef.current;
        if (!prev && age > 30_000) return true;
        const phase = msg.phase === 'ended' ? 'ended' : 'running';
        if (phase === 'ended' && !prev) return true;
        if (phase === 'running' && prev?.id === id && prev.phase === 'ended') return true;
        const next: BattleView = {
          id, phase,
          left: Number(msg.left) || 0,
          right: Number(msg.right) || 0,
          endsAt: Date.now() + Math.max(0, Number(msg.remainMs) || 0),
          winner: msg.winner === 'left' || msg.winner === 'right' || msg.winner === 'draw' ? msg.winner : null,
          top: parseTop(msg.top) ?? (prev?.id === id ? prev.top : undefined), // SUPPORT-LIVE-PATCH
        };
        setBattleBoth(mergeServerTruth(prev, next)); // SERVER-TRUTH-PATCH
        if (phase === 'ended') scheduleClear(id);
        return true;
      }
      case 'battle-gift': {
        if (age > 30_000) return true;
        const gid = String(msg.gid || '');
        const side: BattleSide = msg.side === 'right' ? 'right' : 'left';
        const coins = Number(msg.coins) || 0;
        if (!gid || seenGiftsRef.current.has(gid)) return true;
        seenGiftsRef.current.add(gid);
        // the authority sums the other host's gifts (its own are summed from its own polling)
        if (me.mySide === 'left' && side === 'right') addScore('right', coins);
        addPopup({ id: gid, side, coins, count: Number(msg.count) || 1, label: String(msg.label || ''), avatar: typeof msg.fx?.fromAvatar === 'string' && msg.fx.fromAvatar ? msg.fx.fromAvatar : null }); // SUPPORT-LIVE-PATCH
        // GIFT-FX-ALL-PATCH: a gift sent in the OTHER host's room is also played here (hosts, viewers, supporter see it).
        // Animation only: the coins/profit of that gift are handled by the room it was really sent in.
        try {
          const fx: any = msg.fx;
          if (fx && fx.giftId && String(fx.hostId || '') !== String(me.roomHostId || '')) {
            window.dispatchEvent(new CustomEvent('stooorna:gift-play', {
              detail: { giftId: fx.giftId, fromId: fx.fromId, fromName: fx.fromName, fromAvatar: fx.fromAvatar ?? null, hostId: me.roomHostId, count: Math.max(1, Number(fx.count) || 1), remote: true },
            }));
          }
        } catch { /* ignore */ }
        return true;
      }
      default:
        return true;
    }
  }, [addScore, startAsAuthority, openAsGuest, scheduleStart, broadcastState, emit, resetRoundLocal]);

  /* ── authority loop: finish at 0 + heartbeat ── */
  React.useEffect(() => {
    if (mySide !== 'left' || !battle || battle.phase !== 'running') return;
    const id = battle.id;
    let finishing = false; // SERVER-TRUTH-PATCH
    const iv = window.setInterval(() => {
      const b = battleRef.current;
      if (!b || b.id !== id || b.phase !== 'running') return;
      if (Date.now() >= b.endsAt) {
        // SERVER-TRUTH-PATCH: take the server's LAST score before the winner is decided (every phone then gets the same result)
        if (finishing) return;
        finishing = true;
        void (async () => {
          try {
            const host = String(latest.current.roomHostId || '');
            if (host) {
              const ctl = new AbortController();
              const to = window.setTimeout(() => ctl.abort(), 1200);
              const r = await fetch(`/api/live-battle?hostId=${encodeURIComponent(host)}`, { credentials: 'include', cache: 'no-store', signal: ctl.signal });
              window.clearTimeout(to);
              const sv: any = r.ok ? (await r.json())?.battle : null;
              const cur = battleRef.current;
              if (sv && cur && cur.id === id && cur.phase === 'running' && String(sv.id) === id) {
                setBattleBoth({ ...cur, left: Math.max(cur.left, Number(sv.left) || 0), right: Math.max(cur.right, Number(sv.right) || 0) });
              }
            }
          } catch { /* ignore */ }
          const e = battleRef.current;
          if (!e || e.id !== id || e.phase !== 'running') return;
          const winner: BattleSide | 'draw' = e.left === e.right ? 'draw' : e.left > e.right ? 'left' : 'right';
          setBattleBoth({ ...e, phase: 'ended', endsAt: Date.now(), winner });
          broadcastState();
          window.setTimeout(broadcastState, 400);
          window.setTimeout(broadcastState, 1200);
          scheduleClear(id);
        })();
      } else {
        broadcastState();
      }
    }, STATE_EVERY_MS);
    return () => window.clearInterval(iv);
  }, [mySide, battle?.id, battle?.phase, broadcastState]);

  /* ── LINE-FOR-ALL-PATCH: the authority broadcasts the moment a score changes (not only every 2s) ── */
  React.useEffect(() => {
    if (mySide !== 'left' || !battle || battle.phase !== 'running') return;
    const tm = window.setTimeout(broadcastState, 120);
    return () => window.clearTimeout(tm);
  }, [mySide, battle?.id, battle?.phase, battle?.left, battle?.right, broadcastState]);

  /* ── LINE-FOR-ALL-PATCH: B relays the round into his own room for his viewers ── */
  React.useEffect(() => {
    if (mySide !== 'right' || !battle) return;
    const mirrorW = (w: BattleView['winner']) => (w === 'left' ? 'right' : w === 'right' ? 'left' : w);
    const relay = () => {
      const b = battleRef.current;
      if (!b) return;
      try {
        latest.current.sendOwn?.({
          t: 'battle-view', id: b.id, phase: b.phase,
          left: b.right, right: b.left,
          remainMs: b.phase === 'running' ? Math.max(0, b.endsAt - Date.now()) : 0,
          winner: mirrorW(b.winner), top: b.top ? { left: b.top.right, right: b.top.left } : undefined, ts: Date.now(),
        });
      } catch { /* ignore */ }
    };
    relay();
    if (battle.phase !== 'running') return;
    const iv = window.setInterval(relay, 2000);
    return () => window.clearInterval(iv);
  }, [mySide, battle?.id, battle?.phase, battle?.left, battle?.right]);

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
          addPopup({ id: gid, side, coins, count: Number(e.count) || 1, label: String(e.fromName || e.toName || ''), avatar: typeof e.fromAvatar === 'string' && e.fromAvatar ? e.fromAvatar : null }); // SUPPORT-LIVE-PATCH
          // tell the other host + the viewers (authority re-broadcasts the totals anyway)
          const avatar = typeof e.toAvatar === 'string' && e.toAvatar.length <= 200 ? e.toAvatar : null;
          emit({
            t: 'battle-gift', id, gid: cur.mySide === 'right' ? gid : `${gid}#l`, side, coins, count: Number(e.count) || 1, label: String(e.fromName || e.toName || ''),
            fx: { giftId: String(e.giftId || ''), fromId: String(e.fromId || ''), fromName: String(e.fromName || ''), fromAvatar: typeof e.fromAvatar === 'string' && e.fromAvatar.length <= 300 ? e.fromAvatar : null, toName: String(e.toName || ''), toAvatar: avatar, count: Math.max(1, Number(e.count) || 1), hostId: String(cur.roomHostId || '') },
          });
        }
      } catch { /* ignore */ }
    };

    const tick = () => { if (!stop) latest.current.giftRooms.filter(Boolean).forEach((room) => void pollRoom(room)); };
    tick();
    const iv = window.setInterval(tick, 1000); // LINE-FOR-ALL-PATCH: 1s (was 2s)
    return () => { stop = true; window.clearInterval(iv); };
  }, [mySide, battle?.id, battle?.phase, addScore, emit]);

  /* ── BATTLE-FIX-PATCH: feed ONE gift event (seen by LiveCoinsDock's own polling) into the round ──
   * Same maths as the polling above (same `gid`, so a gift is never counted twice). Used by liveBattleFixPatch,
   * so the line moves whenever the gift animation plays, whatever room key the dock uses. */
  const ingestGift = React.useCallback((room: string, e: any) => {
    const b = battleRef.current;
    const cur = latest.current;
    if (!b || b.phase !== 'running' || !cur.mySide || !e || e.id == null) return;
    const gid = `${room}:${e.id}`;
    if (seenGiftsRef.current.has(gid)) return;
    seenGiftsRef.current.add(gid);
    const unit = Number(e.price) > 0 ? Number(e.price) : (cur.priceOf?.(String(e.giftId || '')) || 1);
    const coins = Math.max(1, unit) * Math.max(1, Number(e.count) || 1);
    const forGuest = cur.mySide === 'left' && cur.peerUserId && sameId(e.toUserId, cur.peerUserId);
    const side: BattleSide = cur.mySide === 'right' ? 'right' : forGuest ? 'right' : 'left';
    if (cur.mySide === 'left') addScore(side, coins);
    addPopup({ id: gid, side, coins, count: Number(e.count) || 1, label: String(e.fromName || e.toName || ''), avatar: typeof e.fromAvatar === 'string' && e.fromAvatar ? e.fromAvatar : null }); // SUPPORT-LIVE-PATCH
    const avatar = typeof e.toAvatar === 'string' && e.toAvatar.length <= 200 ? e.toAvatar : null;
    emit({
      t: 'battle-gift', id: b.id, gid: cur.mySide === 'right' ? gid : `${gid}#l`, side, coins, count: Number(e.count) || 1, label: String(e.fromName || e.toName || ''),
      fx: { giftId: String(e.giftId || ''), fromId: String(e.fromId || ''), fromName: String(e.fromName || ''), fromAvatar: typeof e.fromAvatar === 'string' && e.fromAvatar.length <= 300 ? e.fromAvatar : null, toName: String(e.toName || ''), toAvatar: avatar, count: Math.max(1, Number(e.count) || 1), hostId: String(cur.roomHostId || '') },
    });
  }, [addScore, emit]);

  /* ── BATTLE-SERVER-PATCH: apply the round kept by the SERVER (see liveSplitViewPatch / entry.ts /api/live-battle) ──
   * Scores only ever grow, so each side takes the larger of what I already counted and what the server counted
   * (the same gift can never be added twice). `mirror` = this phone shows the round with B on the left. */
  const applyExternal = React.useCallback((s: any, mirror: boolean) => {
    const id = String(s?.id || '');
    if (!id) return;
    if (stoppedIdsRef.current.has(id)) return; // STOP-GAME-PATCH
    const phase: 'running' | 'ended' = s.phase === 'ended' ? 'ended' : 'running';
    let l = Number(s.left) || 0;
    let r = Number(s.right) || 0;
    if (mirror) { const t = l; l = r; r = t; }
    const prev = battleRef.current;
    if (prev && prev.id !== id && prev.phase === 'running') return; // another round is still on screen
    if (!prev && phase === 'ended') return;                          // never resurrect a finished round
    if (prev && prev.id === id && prev.phase === 'ended') return;
    const same = !!prev && prev.id === id;
    // SERVER-TRUTH-PATCH: the first server answer REPLACES whatever this phone counted by itself; after that scores only grow
    // (max only protects against an answer that arrives out of order). From now on this phone never adds coins itself.
    const firstFromServer = serverIdRef.current !== id;
    serverIdRef.current = id;
    const left = same && !firstFromServer ? Math.max(prev!.left, l) : l;
    const right = same && !firstFromServer ? Math.max(prev!.right, r) : r;
    const winner: BattleView['winner'] = phase === 'ended' ? (left === right ? 'draw' : left > right ? 'left' : 'right') : null;
    if (pendingRef.current === id) { pendingRef.current = null; setPending(null); }
    if (acceptedIdRef.current === id) acceptedIdRef.current = null;
    incomingRef.current = null;
    setIncoming(null);
    const pt = parseTop(s?.top); // SUPPORT-LIVE-PATCH
    const top = pt ? (mirror ? { left: pt.right, right: pt.left } : pt) : (same ? prev!.top : undefined);
    setBattleBoth({ id, phase, left, right, endsAt: Date.now() + Math.max(0, Number(s.remainMs) || 0), winner, top });
    if (phase === 'ended') scheduleClear(id);
  }, []);

  /* ── reset when the split ends ── */
  React.useEffect(() => {
    if (active) return;
    setBattleBoth(null);
    pendingRef.current = null; setPending(null);
    acceptedIdRef.current = null;
    incomingRef.current = null; setIncoming(null);
    setPopups([]);
    startingIdRef.current = null; setStarting(null); setCountEnd(null); startedIdsRef.current = new Set(); peerCountIdRef.current = null; // SUPPORT-LIVE-PATCH
    seenGiftsRef.current = new Set();
    serverIdRef.current = null; // SERVER-TRUTH-PATCH
  }, [active]);

  React.useEffect(() => () => { if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current); if (startingTimerRef.current) window.clearTimeout(startingTimerRef.current); }, []);

  const remainMs = battle?.phase === 'running' ? Math.max(0, battle.endsAt - now) : 0;
  return { battle, remainMs, pending: !!pending, pendingId: pending, incoming, incomingId: incoming?.id ?? null, starting: !!starting, startingId: starting, countLeft: starting ? countLeft : null, popups, play, accept, decline, stop, handleMessage, ingestGift, applyExternal, applyCountdown };
}

/* ───────────────────────── UI ───────────────────────── */

/**
 * While a round runs, the gift animation drawn by LiveCoinsDock (wrapped in [data-live-gift-fx]) becomes light and
 * translucent so it never hides the two cameras. It is only dimmed — it still plays and finishes normally.
 */
export function BattleGiftDimStyle({ on, topPx }: { on: boolean; topPx?: number | null }) {
  if (!on) return null;
  // GIFT-FADE-PATCH: during a round the gift animation shows from a line near the cameras down to the bottom of the screen,
  // but NOT as a hard-cut box: its top edge fades out softly and bleeds a little over the two cameras.
  // Outside a round this component renders nothing, so normal gifts are untouched.
  const top = topPx != null && topPx > 0 ? Math.round(topPx) : null;
  if (top == null) {
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
  const from = Math.max(0, top - 34);
  const to = top + 96;
  const chipTop = top + 10; // SUPPORT-LIVE-PATCH: supporter name chip sits right under the line where the gift animation starts
  const grad = `linear-gradient(to bottom, transparent 0, transparent ${from}px, rgba(0,0,0,0.35) ${Math.round((from + to) / 2)}px, #000 ${to}px, #000 100%)`;
  return (
    <style>{`
:root { --stooorna-gift-chip-top: ${chipTop}px; }
[data-live-gift-fx] {
  pointer-events: none !important;
  -webkit-mask-image: ${grad} !important;
  mask-image: ${grad} !important;
}
`}</style>
  );
}

/**
 * Round button in the middle of the split (hosts only).
 *  - play:    small "Play" circle.
 *  - waiting: I sent the request ("…"), a red ring runs down; at the end the request fails.
 *  - ok:      the other host asked -> the SAME circle turns into "Ok" with a moving red ring; one tap = both enter the round.
 * OK-BUTTON-PATCH: there is no Accept | Decline box any more.
 */
export function BattlePlayButton({
  visible, waiting, incoming, auto, count, yPx, ringKey, ringMs = BATTLE_INVITE_MS, topPx, onPlay, onOk,
}: {
  /** COUNTDOWN-START-PATCH: the other host accepted -> the circle shows the 5..1 countdown, then the round opens by itself */
  auto?: boolean;
  /** COUNTDOWN-START-PATCH: seconds left (5..1) */
  count?: number | null;
  /** SUPPORT-LIVE-PATCH: exact centre of the circle (top of the middle line). Falls back to topPx / 2. */
  yPx?: number | null;
  visible: boolean;
  waiting: boolean;
  incoming?: boolean;
  ringKey?: string | null;
  ringMs?: number;
  topPx: number | null;
  onPlay: () => void;
  onOk?: () => void;
}) {
  const SIZE = 46;
  const R = (SIZE - 4) / 2;
  const C = 2 * Math.PI * R;
  // COUNTDOWN-START-PATCH: Play -> (my circle disappears while I wait) -> other host taps Ok -> BOTH phones show 5..1 in the same circle -> round opens
  const mode: 'play' | 'waiting' | 'ok' | 'auto' = auto ? 'auto' : incoming ? 'ok' : waiting ? 'waiting' : 'play';
  const dur = mode === 'auto' ? BATTLE_AUTO_START_MS : ringMs;
  const show = visible && mode !== 'waiting'; // the host who tapped Play sees NO circle until the other one answers
  return (
    <AnimatePresence>
      {show ? (
        <motion.button
          key={mode === 'auto' ? 'battle-count' : 'battle-play'} // COUNTDOWN-SYNC-PATCH-2: after Ok the Ok circle leaves and a NEW countdown circle appears on the middle line (both phones)
          type="button"
          onClick={mode === 'ok' ? onOk : mode === 'play' ? onPlay : undefined}
          disabled={mode === 'waiting' || mode === 'auto'}
          aria-label={mode === 'ok' ? 'Ok' : mode === 'auto' ? 'Round starting' : 'Start a game round'}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          whileTap={{ scale: 0.92 }}
          style={{
            position: 'absolute',
            left: '50%',
            top: yPx != null ? yPx : topPx != null ? topPx / 2 : '25%',
            // CIRCLE-CENTER-PATCH: framer-motion replaces a CSS `transform` as soon as it animates `scale`, so translate(-50%,-50%)
            // was lost and the circle sat ~23px to the right/below its point. Negative margins are never overridden: the circle
            // is now centred exactly on the middle line.
            marginLeft: -SIZE / 2,
            marginTop: -SIZE / 2,
            zIndex: 93,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: SIZE,
            height: SIZE,
            padding: 0,
            borderRadius: '50%',
            border: (mode === 'play' || mode === 'auto') ? '2px solid rgba(255,255,255,0.9)' : '2px solid rgba(255,255,255,0.25)',
            cursor: mode === 'waiting' || mode === 'auto' ? 'default' : 'pointer',
            color: '#fff',
            fontWeight: 900,
            background: mode === 'waiting'
              ? 'linear-gradient(135deg, rgba(71,85,105,0.95), rgba(51,65,85,0.95))'
              : 'linear-gradient(135deg, #facc15 0%, #fb923c 100%)',
            boxShadow: '0 3px 14px rgba(251,146,60,0.55)',
            flexDirection: 'column',
          }}
        >
          {mode === 'play' ? (
            <>
              <Play size={16} fill="#fff" strokeWidth={0} />
              <span style={{ fontSize: '0.55rem', lineHeight: 1, letterSpacing: 0.3 }}>Play</span>
            </>
          ) : mode === 'auto' ? (
            <motion.span
              key={`count-${count ?? ''}`}
              initial={{ scale: 1.5, opacity: 0.4 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.22 }}
              style={{ fontSize: '1.35rem', lineHeight: 1, color: '#1a1200', fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}
            >
              {count ?? Math.ceil(BATTLE_AUTO_START_MS / 1000)}
            </motion.span>
          ) : mode === 'ok' ? (
            <span style={{ fontSize: '0.86rem', lineHeight: 1, color: '#1a1200', fontWeight: 900 }}>Ok</span>
          ) : (
            <span style={{ fontSize: '0.7rem', fontWeight: 800 }}>…</span>
          )}
          {mode !== 'play' ? (
            <svg
              key={`ring-${mode}-${ringKey || ''}`}
              width={SIZE}
              height={SIZE}
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              style={{ position: 'absolute', inset: -2, transform: 'rotate(-90deg)', pointerEvents: 'none' }}
            >
              <motion.circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke="#ef4444"
                strokeWidth={3}
                strokeLinecap="round"
                strokeDasharray={C}
                initial={{ strokeDashoffset: 0 }}
                animate={{ strokeDashoffset: C }}
                transition={{ duration: dur / 1000, ease: 'linear' }}
              />
            </svg>
          ) : null}
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

/** PROFILE-TAP-PATCH: a person shown in the round (the two players, or one of the first three supporters). */
export type BattlePerson = { userId: string; name: string; username: string | null; avatarUrl: string | null };

/** PROFILE-TAP-PATCH: profile picture + @username of a player; a tap opens his profile (from there a viewer can enter his live and support him with gifts). */
function BattlePersonChip({ person, side, onOpen }: { person: BattlePerson; side: BattleSide; onOpen?: (p: BattlePerson) => void }) {
  const label = person.username ? `@${person.username}` : person.name;
  const clickable = !!onOpen && !!person.userId;
  return (
    <button
      type="button"
      onClick={clickable ? (e) => { e.stopPropagation(); onOpen!(person); } : undefined}
      aria-label={clickable ? `Open profile ${label}` : label}
      style={{
        position: 'absolute',
        bottom: 40, // above the "Full Chat" button, which sits on the bottom edge of the cameras and would swallow the tap
        [side === 'left' ? 'left' : 'right']: 8,
        maxWidth: 'calc(50% - 84px)',
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 10px 3px 3px',
        borderRadius: 999,
        border: '1px solid rgba(255,255,255,0.22)',
        background: 'rgba(0,0,0,0.55)',
        color: '#fff',
        cursor: clickable ? 'pointer' : 'default',
        pointerEvents: clickable ? 'auto' : 'none',
        zIndex: 7,
      } as React.CSSProperties}
    >
      <span
        style={{
          width: 22, height: 22, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#1f2937', border: `1.5px solid ${BATTLE_COLORS[side]}`, fontSize: '0.62rem', fontWeight: 900,
        }}
      >
        {person.avatarUrl
          ? <img src={person.avatarUrl} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : (person.name || '?').trim().charAt(0).toUpperCase()}
      </span>
      <span style={{ fontSize: '0.72rem', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>
        {label}
      </span>
    </button>
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
  battle: battleIn, remainMs, popups: popupsIn, heightPx, flip, lineTopPx, players, onOpenProfile,
}: {
  /** PROFILE-TAP-PATCH: the two players by SCREEN half (left half / right half) — drawn as picture + @username, tappable. */
  players?: { left: BattlePerson | null; right: BattlePerson | null } | null;
  /** PROFILE-TAP-PATCH: open the profile of a player / supporter. Omit it and the chips are only shown. */
  onOpenProfile?: (p: BattlePerson) => void;
  battle: BattleView | null;
  remainMs: number;
  popups: BattlePopup[];
  mySide?: BattleSide | null;
  heightPx: number | null;
  /** exact top of the score line (= top of the two cameras). Falls back to the old fixed offset. */
  lineTopPx?: number | null;
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
  // SUPPORT-LIVE-PATCH: first three supporters of each half, pictures stuck together next to the middle line (follows the screen halves)
  const topSup = battle?.top && heightPx != null ? (flip ? { left: battle.top.right, right: battle.top.left } : battle.top) : null;

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
            top: lineTopPx != null && lineTopPx > 0 ? lineTopPx : 'calc(max(env(safe-area-inset-top,0px),14px) + 64px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          }}
        >
          {/* the line: yellow (left) | orange (right) */}
          <div style={{ width: '100%', position: 'relative', height: 20, display: 'flex' }}>
            <div style={{ width: `${leftPct}%`, background: BATTLE_COLORS.left, transition: 'width 350ms ease', position: 'relative' }}>
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
                  {p.avatar ? <img src={p.avatar} alt="" referrerPolicy="no-referrer" style={{ width: 14, height: 14, borderRadius: '50%', objectFit: 'cover', verticalAlign: 'middle', marginRight: 4 }} /> : null}
                  {p.label ? `${p.label} · ` : ''}🎁{p.count > 1 ? ` ×${p.count}` : ''} +{fmtCoins(p.coins)}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {topSup ? (<><BattleSupCluster list={topSup.left} side="left" onOpen={onOpenProfile} /><BattleSupCluster list={topSup.right} side="right" onOpen={onOpenProfile} /></>) : null}

      {/* PROFILE-TAP-PATCH: picture + @username of each player at the bottom of his half */}
      {players && heightPx != null ? (
        <>
          {players.left ? <BattlePersonChip person={players.left} side="left" onOpen={onOpenProfile} /> : null}
          {players.right ? <BattlePersonChip person={players.right} side="right" onOpen={onOpenProfile} /> : null}
        </>
      ) : null}

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

/** SUPPORT-LIVE-PATCH: up to 3 profile pictures, stuck together, rank 1 touches the middle line. */
function BattleSupCluster({ list, side, onOpen }: { list: BattleSupporter[]; side: BattleSide; onOpen?: (p: BattlePerson) => void }) {
  if (!list || !list.length) return null;
  const SZ = 28;
  const ordered = side === 'left' ? [...list].reverse() : list;
  return (
    <div style={{ position: 'absolute', bottom: 6, [side === 'left' ? 'right' : 'left']: 'calc(50% + 3px)', display: 'flex', flexDirection: 'row', alignItems: 'center', pointerEvents: 'none', zIndex: 6 } as React.CSSProperties}>
      {ordered.map((sp, i) => {
        const rank = side === 'left' ? list.length - i : i + 1;
        const ring = rank === 1 ? '#facc15' : rank === 2 ? '#e5e7eb' : '#d97706';
        return (
          <div
            key={sp.userId}
            title={sp.name}
            role={onOpen ? 'button' : undefined}
            onClick={onOpen ? (e) => { e.stopPropagation(); onOpen({ userId: sp.userId, name: sp.name, username: null, avatarUrl: sp.avatarUrl }); } : undefined} // PROFILE-TAP-PATCH: tap a supporter = open his profile
            style={{
              pointerEvents: onOpen ? 'auto' : 'none', cursor: onOpen ? 'pointer' : 'default',
              width: SZ, height: SZ, borderRadius: '50%', marginLeft: i === 0 ? 0 : -9, overflow: 'hidden', flexShrink: 0,
              border: `2px solid ${ring}`, background: '#1f2937', zIndex: 10 - rank, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 900, fontSize: '0.7rem', boxShadow: '0 1px 4px rgba(0,0,0,0.55)',
            }}
          >
            {sp.avatarUrl
              ? <img src={sp.avatarUrl} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              : (sp.name || '?').trim().charAt(0).toUpperCase()}
          </div>
        );
      })}
    </div>
  );
}

/* ───────────────────────── STOP-GAME-PATCH: split-icon menu (Exit Game | Stop Game) ───────────────────────── */

/**
 * Bubble in the middle of the screen, opened by the split icon while a split is running.
 *  - Exit Game: the other host leaves the round / split (same as the old "End" pill)
 *  - Stop Game: cancels the round only; both hosts stay in the split (disabled while no round is running)
 */
export function SplitGameMenu({
  open, withName, canStop, onExit, onStop, onClose,
}: {
  open: boolean;
  withName?: string | null;
  canStop: boolean;
  onExit: () => void;
  onStop: () => void;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="split-game-menu"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 9700, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.45)',
          }}
        >
          <motion.div
            initial={{ scale: 0.88, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(260px, 78vw)', padding: 12, borderRadius: 22,
              background: 'rgba(6,18,20,0.97)', border: '1px solid rgba(34,211,238,0.45)',
              boxShadow: '0 10px 40px rgba(0,0,0,0.6), 0 0 24px rgba(34,211,238,0.18)',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}
          >
            {withName ? (
              <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', padding: '2px 0 4px' }}>
                Split with {withName}
              </div>
            ) : null}
            <button
              type="button"
              onClick={onExit}
              style={{
                height: 46, borderRadius: 14, border: '1px solid rgba(239,68,68,0.55)', background: 'rgba(239,68,68,0.16)',
                color: '#fca5a5', fontSize: 15, fontWeight: 800, cursor: 'pointer',
              }}
            >
              Exit Game
            </button>
            <button
              type="button"
              disabled={!canStop}
              onClick={onStop}
              style={{
                height: 46, borderRadius: 14, border: '1px solid rgba(250,204,21,0.55)', background: 'rgba(250,204,21,0.14)',
                color: '#fde047', fontSize: 15, fontWeight: 800, cursor: canStop ? 'pointer' : 'not-allowed',
                opacity: canStop ? 1 : 0.38,
              }}
            >
              Stop Game
            </button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
