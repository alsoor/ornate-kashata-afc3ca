/**
 * liveSplitViewPatch — everybody sees the two players, and the round line is the same on every phone.
 * Standalone, adds code only (works together with liveSplitPatch / liveBattlePatch / liveBattleFixPatch).
 *
 * PART 1 — viewers of the INVITED host (B) also see the split (A on one half, B on the other).
 *   The two cameras only exist together inside the room of the owner (A). B now announces `duet-split`
 *   into his OWN room (every 2.5s). A viewer of B's room opens a view-only second connection to A's channel,
 *   shows A's camera on the other half and plays his voice. Nobody is moved anywhere: the viewer stays where he is
 *   and can enter the other host's room himself to support the one he wants.
 *
 * PART 2 — round score kept by the SERVER (entry.ts: /api/live-battle).
 *   A registers the round; the server adds the coins of every gift posted to /api/live-gifts to the right side
 *   (gift in A's room addressed to B -> B, other gifts in A's room -> A, gift in B's room -> B).
 *   Everybody (hosts, supporters, viewers of both rooms) polls it, so the line moves for all of them
 *   even if a data-stream / signal message is lost.
 */

import React from 'react';
import { camChannelForHost, type DuetPerson } from '@/lib/liveDuetPatch';

/* ───────────────────────── helpers ───────────────────────── */

function uidFromString(s: string): number {
  if (!s || s === '0') return 0;
  return Math.abs(s.split('').reduce((a, c) => (Math.imul(31, a) + c.charCodeAt(0)) | 0, 0)) % 100_000 || 1;
}

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function fetchViewToken(channel: string, userId: string): Promise<{ token: string | null; uid: number; appId: string | null }> {
  try {
    const r = await fetch(`/api/call/token?channel=${encodeURIComponent(channel)}&uid=${encodeURIComponent(userId)}`, { credentials: 'include' });
    if (!r.ok) throw new Error('token');
    const d: any = await r.json();
    return { token: d.token ?? null, uid: Number(d.uid) || uidFromString(userId), appId: d.appId ?? null };
  } catch {
    return { token: null, uid: uidFromString(userId), appId: null };
  }
}

/* UID-CONFLICT-FIX: a view-only connection must never share an Agora uid with a main connection of the same person. */
async function fetchViewTokenStrict(channel: string, userId: string): Promise<{ token: string; uid: number; appId: string | null } | null> {
  try {
    const r = await fetch(`/api/call/token?channel=${encodeURIComponent(channel)}&uid=${encodeURIComponent(userId)}`, { credentials: 'include' });
    if (!r.ok) return null;
    const d: any = await r.json();
    if (!d?.token || !Number(d.uid)) return null;
    return { token: String(d.token), uid: Number(d.uid), appId: d.appId ?? null };
  } catch { return null; }
}

/** Every open view-only connection of this page session (module level: survives a route change). */
const openSplitViewers = new Set<() => Promise<void>>();

/** UID-CONFLICT-FIX: close all view-only connections (called before the main join and when leaving a room). */
export async function closeAllSplitViewers(): Promise<void> {
  const list = [...openSplitViewers];
  openSplitViewers.clear();
  await Promise.all(list.map((f) => f().catch(() => { /* ignore */ })));
}

/* ───────────────────────── PART 1: view-only second connection ───────────────────────── */

export type SplitViewHandle = { leave: () => Promise<void>; setMuted: (m: boolean) => void };

export async function startSplitViewer(opts: {
  owner: DuetPerson;
  me: DuetPerson;
  appIdFallback: string;
  onRemoteVideo: (track: any | null) => void;
  onEnded: () => void;
  /** UID-CONFLICT-FIX: channel of the room I am already in with my main connection (never join it a second time) */
  mainChannel?: string;
}): Promise<SplitViewHandle> {
  const { owner, me, appIdFallback, onRemoteVideo, onEnded } = opts;
  const channel = camChannelForHost(owner.userId);
  if (opts.mainChannel && opts.mainChannel === channel) throw new Error('split-view: same channel as my main connection');
  const ownerUid = uidFromString(owner.userId);
  const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
  const client: any = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
  let ended = false;
  let muted = false;
  let audio: any = null;

  const finish = async () => {
    if (ended) return;
    ended = true;
    openSplitViewers.delete(finish); // UID-CONFLICT-FIX
    try { onRemoteVideo(null); } catch { /* ignore */ }
    try { audio?.stop(); } catch { /* ignore */ }
    try { await client.leave(); } catch { /* ignore */ }
    try { onEnded(); } catch { /* ignore */ }
  };

  const sub = async (u: any, mt: 'audio' | 'video') => {
    if (ended || Number(u.uid) !== ownerUid) return; // only the owner's camera + voice, nobody else
    try {
      await client.subscribe(u, mt);
      if (mt === 'audio') {
        audio = u.audioTrack;
        if (!muted) { try { audio?.play(); } catch { /* ignore */ } }
      } else if (u.videoTrack) onRemoteVideo(u.videoTrack);
    } catch { /* ignore */ }
  };
  client.on('user-published', (u: any, mt: string) => { void sub(u, mt as 'audio' | 'video'); });
  client.on('user-unpublished', (u: any, mt: string) => { if (Number(u.uid) === ownerUid && mt === 'video') onRemoteVideo(null); });
  client.on('user-left', (u: any) => { if (Number(u.uid) === ownerUid) onRemoteVideo(null); });
  client.on('connection-state-change', (cur: string) => { if (cur === 'DISCONNECTED') void finish(); });

  openSplitViewers.add(finish); // UID-CONFLICT-FIX
  // UID-CONFLICT-FIX: own uid for the view-only connection (falls back to the normal one if the server refuses the id)
  const uniq = await fetchViewTokenStrict(channel, `${me.userId}~sv${Math.random().toString(36).slice(2, 7)}`);
  const t = uniq || (await fetchViewToken(channel, me.userId));
  try {
    await client.join(t.appId || appIdFallback, channel, t.token, t.uid);
  } catch (err) {
    ended = true;
    openSplitViewers.delete(finish);
    try { await client.leave(); } catch { /* ignore */ }
    throw err;
  }
  for (const u of client.remoteUsers || []) {
    if (u.hasVideo) await sub(u, 'video');
    if (u.hasAudio) await sub(u, 'audio');
  }
  return {
    leave: finish,
    setMuted: (m: boolean) => {
      muted = m;
      try { if (m) audio?.stop(); else audio?.play(); } catch { /* ignore */ }
    },
  };
}

/** B (invited host, split running): keep telling MY OWN room who I am split with. Nothing moves anyone. */
export function useSplitAnnounce(opts: {
  enabled: boolean;
  roomHostId: string;
  owner: DuetPerson | null;
  send: (payload: object) => unknown;
}): void {
  const { enabled, roomHostId, owner, send } = opts;
  const sendRef = React.useRef(send);
  sendRef.current = send;
  const oid = owner?.userId || '';
  const oname = owner?.name || '';
  const ouser = owner?.username || null;
  const oavatar = owner?.avatarUrl || null;
  React.useEffect(() => {
    if (!enabled || !roomHostId || !oid) return;
    const push = (gone = false) => {
      try {
        void sendRef.current({
          t: 'duet-split', hostId: roomHostId,
          owner: gone ? null : { userId: oid, name: oname, username: ouser, avatarUrl: oavatar },
          ts: Date.now(),
        });
      } catch { /* ignore */ }
    };
    push();
    const t1 = window.setTimeout(() => push(), 700);
    const iv = window.setInterval(() => push(), 2500);
    return () => { window.clearTimeout(t1); window.clearInterval(iv); push(true); };
  }, [enabled, roomHostId, oid, oname, ouser, oavatar]);
}

/** Viewer of B's room: shows the split once B announces it. `handleMessage` is called for every `duet-split` message. */
export function useSplitViewer(opts: {
  enabled: boolean;
  me: DuetPerson;
  appIdFallback: string;
  setSplitWith: (p: DuetPerson | null) => void;
  onRemoteVideo: (track: any | null) => void;
  muted: boolean;
  /** UID-CONFLICT-FIX: host of the room this page is in (its channel is already joined by the main connection) */
  roomHostId?: string;
}): { handleMessage: (msg: any) => void } {
  const optsRef = React.useRef(opts);
  optsRef.current = opts;
  const sessionRef = React.useRef<SplitViewHandle | null>(null);
  const ownerRef = React.useRef<string>('');
  const startingRef = React.useRef(false);
  const lastSeenRef = React.useRef(0);

  const stop = React.useCallback(async () => {
    const s = sessionRef.current;
    sessionRef.current = null;
    ownerRef.current = '';
    lastSeenRef.current = 0;
    try { await s?.leave(); } catch { /* ignore */ }
    optsRef.current.setSplitWith(null);
  }, []);

  const handleMessage = React.useCallback((msg: any) => {
    const o = optsRef.current;
    if (!o.enabled || !msg || msg.t !== 'duet-split') return;
    const ow = msg.owner;
    if (!ow || !ow.userId) { if (sessionRef.current || ownerRef.current) void stop(); return; }
    const ownerId = String(ow.userId);
    if (norm(ownerId) === norm(o.me.userId)) return; // I am the owner myself
    if (o.roomHostId && norm(ownerId) === norm(o.roomHostId)) return; // UID-CONFLICT-FIX: this IS the room I am in
    lastSeenRef.current = Date.now();
    if (ownerRef.current === ownerId || startingRef.current) return;
    startingRef.current = true;
    const person: DuetPerson = {
      userId: ownerId, name: String(ow.name || ow.username || 'User'),
      username: ow.username ?? null, avatarUrl: ow.avatarUrl ?? null,
    };
    void (async () => {
      try {
        if (sessionRef.current) await stop();
        const h = await startSplitViewer({
          owner: person, me: o.me, appIdFallback: o.appIdFallback,
          mainChannel: o.roomHostId ? camChannelForHost(o.roomHostId) : undefined, // UID-CONFLICT-FIX
          onRemoteVideo: (t) => optsRef.current.onRemoteVideo(t),
          onEnded: () => { if (ownerRef.current === ownerId) { sessionRef.current = null; ownerRef.current = ''; optsRef.current.setSplitWith(null); } },
        });
        sessionRef.current = h;
        ownerRef.current = ownerId;
        lastSeenRef.current = Date.now();
        h.setMuted(optsRef.current.muted);
        optsRef.current.setSplitWith(person);
      } catch (e) {
        console.warn('[SplitView] could not open the second half', e);
      } finally {
        startingRef.current = false;
      }
    })();
  }, [stop]);

  // B stopped announcing (split over / B left) -> close
  React.useEffect(() => {
    const iv = window.setInterval(() => {
      if (sessionRef.current && lastSeenRef.current && Date.now() - lastSeenRef.current > 9000) void stop();
    }, 2000);
    return () => window.clearInterval(iv);
  }, [stop]);

  React.useEffect(() => { sessionRef.current?.setMuted(opts.muted); }, [opts.muted]);
  React.useEffect(() => () => { void stop(); }, [stop]);

  return { handleMessage };
}

/* ───────────────────────── PART 2: server-side round score ───────────────────────── */

/**
 * Call inside live-camera after useLiveBattle.
 *  - A (mySide 'left', authority) registers the round on the server once.
 *  - everybody on a split page polls the round and applies it with `apply` (= battleApi.applyExternal).
 */
export function useBattleServerSync(opts: {
  /** a split is on (hosts, viewers of A through the duet, viewers of B through the announce) or a round is showing */
  enabled: boolean;
  roomHostId: string;
  mySide: 'left' | 'right' | null;
  peerUserId: string | null;
  battleId: string | null;
  battlePhase: 'running' | 'ended' | null;
  apply: (s: any, mirror: boolean) => void;
}): void {
  const { enabled, roomHostId, mySide, peerUserId, battleId, battlePhase } = opts;
  const applyRef = React.useRef(opts.apply);
  applyRef.current = opts.apply;
  const registeredRef = React.useRef<string>('');

  React.useEffect(() => {
    if (mySide !== 'left' || !battleId || battlePhase !== 'running' || !peerUserId || !roomHostId) return;
    if (registeredRef.current === battleId) return;
    registeredRef.current = battleId;
    const post = () => {
      try {
        void fetch('/api/live-battle', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'start', id: battleId, a: roomHostId, b: peerUserId }),
        }).catch(() => { /* ignore */ });
      } catch { /* ignore */ }
    };
    post();
    const t1 = window.setTimeout(post, 2000); // the server ignores a repeated start of the same round
    const t2 = window.setTimeout(post, 5000);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [mySide, battleId, battlePhase, peerUserId, roomHostId]);

  // the split closed on a host's phone -> tell the server to forget the round (a later split must not show it again)
  const lastIdRef = React.useRef<string | null>(null);
  lastIdRef.current = battleId;
  React.useEffect(() => {
    if (!mySide) return;
    return () => {
      const id = lastIdRef.current;
      if (!id) return;
      try {
        void fetch('/api/live-battle', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'end', id }), keepalive: true,
        }).catch(() => { /* ignore */ });
      } catch { /* ignore */ }
    };
  }, [mySide]);

  React.useEffect(() => {
    if (!enabled || !roomHostId) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/live-battle?hostId=${encodeURIComponent(roomHostId)}`, { credentials: 'include', cache: 'no-store' });
        if (!r.ok || stop) return;
        const d: any = await r.json();
        const b = d?.battle;
        if (!b || stop) return;
        // a viewer of B's room sees B on the left half -> mirror; hosts keep A = left (B's overlay flips itself)
        const mirror = !mySide && norm(roomHostId) === norm(b.b);
        applyRef.current(b, mirror);
      } catch { /* ignore */ }
    };
    // SUPPORT-LIVE-PATCH: score refresh is instant — poll every 0.5s AND right away when a gift is sent / seen (no overlapping requests)
    let busy = false;
    let again = false;
    const run = async () => {
      if (stop) return;
      if (busy) { again = true; return; }
      busy = true;
      try { await tick(); } finally { busy = false; if (again && !stop) { again = false; void run(); } }
    };
    const poke = () => { void run(); };
    void run();
    const iv = window.setInterval(poke, 500);
    window.addEventListener('stooorna:battle-poke', poke);
    window.addEventListener('stooorna:live-gifts-seen', poke);
    return () => {
      stop = true; window.clearInterval(iv);
      window.removeEventListener('stooorna:battle-poke', poke);
      window.removeEventListener('stooorna:live-gifts-seen', poke);
    };
  }, [enabled, roomHostId, mySide]);
}
