/**
 * liveGpsGoPatch — GPS Live "Go" needs the other person's approval + a Google-Maps-style route.
 * Standalone patch used by add-friend.tsx (CameraStoryCapture = the GPS Live map). It adds code only.
 *
 * What it does
 *  1. Go  -> "Please Wait": the request is sent to the other user (server: /api/live-gps-go). The blue line is NOT shown yet.
 *  2. The other user gets an "Accept | Decline" box on top of every page (self-hosted global host below, starts on import).
 *  3. Accept -> the line starts at once for the person who pressed Go. Decline -> he sees "declined".
 *  4. After Accept the other user sees "You want Go GPS Live" + Ok; Ok opens the map where he watches his friend arrive.
 *  5. Accurate route (Google-Maps feel): road geometry from a fresh OSM car router (fallback: OSRM demo), the car is snapped to
 *     the road line, the line shrinks behind the car, distance + time left are measured ALONG the road, automatic re-route
 *     when he leaves the line, smooth moving markers. The other user sees the same live line, distance and movement.
 */

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { useSession } from '@/lib/auth/auth-client';
import { haversineM, type LL } from '@/lib/liveGpsNavigatePatch';

/* ───────────────────────────── types + server API ───────────────────────────── */

export type GoStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'ended' | 'expired';

export type GoReq = {
  id: string;
  fromId: string; fromName: string; fromUsername: string; fromAvatar: string | null;
  toId: string; toName: string; toUsername: string; toAvatar: string | null;
  status: GoStatus;
  at: number; updatedAt: number;
  fromLat?: number; fromLng?: number; fromAt?: number;
  toLat?: number; toLng?: number;
};

export type GoPerson = { id: string; name?: string | null; username?: string | null; avatarUrl?: string | null };

const GO_URL = '/api/live-gps-go';

type GoPostResult = { ok: boolean; status: number; data: any };
async function goPost(body: Record<string, unknown>): Promise<GoPostResult> {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const killer = window.setTimeout(() => { try { ctl?.abort(); } catch { /* ignore */ } }, 12000);
  try {
    const r = await fetch(GO_URL, {
      method: 'POST', credentials: 'include', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      signal: ctl ? ctl.signal : undefined,
    });
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('json') ? await r.json().catch(() => ({})) : {};
    // an HTML page (index.html fallback) instead of JSON = the server route does not exist
    return { ok: r.ok && ct.includes('json'), status: r.status, data };
  } catch { return { ok: false, status: 0, data: {} }; } finally { window.clearTimeout(killer); }
}

/* ───────────────────────────── store ───────────────────────────── */

type GoState = {
  me: string;
  outgoing: GoReq | null;         // my Go request: pending (Please Wait) or accepted (I am driving to him)
  incomingPending: GoReq | null;  // somebody asks to come to me -> Accept | Decline box
  incomingActive: GoReq | null;   // somebody I accepted is on the way to me
  acceptedPrompt: GoReq | null;   // "You want Go GPS Live" + Ok
  declinedNotice: GoReq | null;   // my request was declined
  sending: boolean;               // Go pressed, waiting for the server to take the request
  sendError: string | null;       // why the request could not be sent
};

let state: GoState = { me: '', outgoing: null, incomingPending: null, incomingActive: null, acceptedPrompt: null, declinedNotice: null, sending: false, sendError: null };
const listeners = new Set<() => void>();
const setState = (p: Partial<GoState>) => { state = { ...state, ...p }; listeners.forEach(l => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getSnapshot = () => state;

const handledIncoming = new Set<string>();
const ackedOutgoing = new Set<string>();
const shownDeclined = new Set<string>();
let lastPromptId = '';

function newest(list: GoReq[], key: 'at' | 'updatedAt' = 'at'): GoReq | null {
  let best: GoReq | null = null;
  for (const r of list) if (!best || Number(r[key] || 0) >= Number(best[key] || 0)) best = r;
  return best;
}

function applyPoll(d: any) {
  const inc: GoReq[] = Array.isArray(d?.incoming) ? d.incoming : [];
  const outg: GoReq[] = Array.isArray(d?.outgoing) ? d.outgoing : [];
  const pend = newest(inc.filter(r => r && r.status === 'pending' && !handledIncoming.has(r.id)));
  const act = newest(inc.filter(r => r && r.status === 'accepted'), 'updatedAt');
  const out = newest(outg.filter(r => r && !ackedOutgoing.has(r.id)));
  const patch: Partial<GoState> = { incomingPending: pend, incomingActive: act };
  if (out && out.status === 'declined') {
    ackedOutgoing.add(out.id);
    if (!shownDeclined.has(out.id)) { shownDeclined.add(out.id); patch.declinedNotice = out; }
    patch.outgoing = null;
  } else if (out && (out.status === 'pending' || out.status === 'accepted')) {
    patch.outgoing = out;
  } else {
    patch.outgoing = null;
  }
  setState(patch);
  if (pend && pend.id !== lastPromptId) { lastPromptId = pend.id; alertSound(); }
}

let pollTimer: number | null = null;
let pollMe = '';
async function pollOnce() {
  if (!pollMe) return;
  try {
    const r = await fetch(`${GO_URL}?userId=${encodeURIComponent(pollMe)}`, { credentials: 'include', cache: 'no-store' });
    if (!r.ok) return;
    applyPoll(await r.json());
  } catch { /* ignore */ }
}
function startPolling(me: string) {
  stopPolling();
  pollMe = me;
  setState({ me });
  void pollOnce();
  const loop = () => {
    const fast = !!(state.outgoing || state.incomingActive || state.incomingPending);
    pollTimer = window.setTimeout(async () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') await pollOnce();
      loop();
    }, fast ? 1500 : 3000);
  };
  loop();
}
function stopPolling() { if (pollTimer != null) { window.clearTimeout(pollTimer); pollTimer = null; } }
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void pollOnce(); });
}

function alertSound() {
  try { (navigator as any).vibrate?.([220, 100, 220]); } catch { /* ignore */ }
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const c: AudioContext = new AC();
    void c.resume().catch(() => { /* ignore */ });
    [0, 0.22].forEach(off => {
      const o = c.createOscillator(); const g = c.createGain();
      o.type = 'sine'; o.frequency.value = off ? 1040 : 820;
      g.gain.setValueAtTime(0.0001, c.currentTime + off);
      g.gain.exponentialRampToValueAtTime(0.25, c.currentTime + off + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + off + 0.18);
      o.connect(g).connect(c.destination); o.start(c.currentTime + off); o.stop(c.currentTime + off + 0.2);
    });
    window.setTimeout(() => { try { void c.close(); } catch { /* ignore */ } }, 900);
  } catch { /* ignore */ }
}

/* ───────────────────────────── actions ───────────────────────────── */

/** Go pressed: ask the other user. Returns the request (status "pending") or null when the server is not reachable. */
export async function sendGoRequest(
  me: GoPerson, to: GoPerson & { lat: number; lng: number }, myPos: LL | null,
): Promise<GoReq | null> {
  if (state.sending) return null;
  setState({ sending: true, sendError: null, declinedNotice: null });
  const res = await goPost({
    action: 'request',
    from: { id: String(me.id), name: me.name || me.username || 'User', username: String(me.username || '').replace(/^@/, ''), avatarUrl: me.avatarUrl ?? null },
    to: { id: String(to.id), name: to.name || to.username || 'User', username: String(to.username || '').replace(/^@/, ''), avatarUrl: to.avatarUrl ?? null, lat: to.lat, lng: to.lng },
    fromLat: myPos?.lat, fromLng: myPos?.lng,
  });
  const req: GoReq | undefined = res.data?.request;
  if (res.ok && req) {
    setState({ sending: false, outgoing: req, sendError: null });
    return req;
  }
  const why = res.status === 0 ? 'no connection'
    : (res.status === 404 || res.status === 405 || !res.ok && res.status === 200) ? 'server route /api/live-gps-go is not installed'
    : `server error ${res.status}`;
  setState({ sending: false, sendError: `Could not send the request (${why}). Try again.` });
  return null;
}

/** Cancel a pending request / end a running trip (X, Stop, Done, map closed). */
export function finishGoOutgoing() {
  cancelScheduledFinish();
  const o = state.outgoing;
  if (!o) return;
  ackedOutgoing.add(o.id);
  setState({ outgoing: null });
  void goPost({ action: o.status === 'pending' ? 'cancel' : 'end', id: o.id, userId: o.fromId });
}
let finishTimer: number | null = null;
export function scheduleFinishGoOutgoing(ms = 500) {
  cancelScheduledFinish();
  finishTimer = window.setTimeout(() => { finishTimer = null; finishGoOutgoing(); }, ms);
}
export function cancelScheduledFinish() { if (finishTimer != null) { window.clearTimeout(finishTimer); finishTimer = null; } }

export function pushGoPosition(lat: number, lng: number) {
  const o = state.outgoing;
  if (!o || o.status !== 'accepted' || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
  void goPost({ action: 'position', id: o.id, userId: o.fromId, lat, lng });
}

export function ackGoDeclined() { if (state.declinedNotice) setState({ declinedNotice: null }); }
export function clearGoSendError() { if (state.sendError) setState({ sendError: null }); }

async function respondGo(req: GoReq, accept: boolean) {
  handledIncoming.add(req.id);
  if (accept) setState({ incomingPending: null, incomingActive: { ...req, status: 'accepted' }, acceptedPrompt: { ...req, status: 'accepted' } });
  else setState({ incomingPending: null });
  await goPost({ action: 'respond', id: req.id, userId: req.toId, accept });
}

/** Open the GPS Live map from anywhere in the app (same entry the Settings map-pin uses). */
export function openGpsLiveMap() {
  try {
    window.dispatchEvent(new CustomEvent('stooorna:open-live-map'));
    window.setTimeout(() => {
      try {
        if (document.querySelector('[data-gps-live="1"]')) return; // the page handled it
        window.history.pushState({}, '', '/add-friend?liveMap=1');
        window.dispatchEvent(new PopStateEvent('popstate'));
      } catch { /* ignore */ }
    }, 450);
  } catch { /* ignore */ }
}

/** For the map component. */
export function useLiveGpsGo() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    ...s,
    send: sendGoRequest,
    finish: finishGoOutgoing,
    scheduleFinish: scheduleFinishGoOutgoing,
    cancelScheduledFinish,
    pushPosition: pushGoPosition,
    ackDeclined: ackGoDeclined,
    clearSendError: clearGoSendError,
  };
}

/* ───────────────────────────── accurate route engine ───────────────────────────── */

export type RoutePro = {
  coords: [number, number][];  // [lat, lng]
  cum: number[];               // meters from the start to each point
  totalM: number;              // length of the geometry (meters)
  durS: number;                // seconds by car for the whole route
  road: boolean;               // true = real road geometry, false = straight-line estimate
  at: number;
};

export type RouteProgress = {
  snapped: LL;                 // my position pulled onto the road line
  idx: number;                 // segment index
  offM: number;                // how far I am from the line (meters)
  alongM: number;              // meters driven along the line
  remainingM: number;          // meters left ALONG the road
  remainingS: number;          // seconds left (route duration scaled by what is left)
  at: number;
};

const ROUTE_HOSTS = [
  'https://routing.openstreetmap.de/routed-car/route/v1/driving', // fresh OSM data, car profile
  'https://router.project-osrm.org/route/v1/driving',             // fallback
];
const FALLBACK_SPEED_MPS = 50 / 3.6;
const DETOUR_FACTOR = 1.3;

function buildRoute(coords: [number, number][], durS: number, road: boolean): RoutePro {
  const cum: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + haversineM({ lat: coords[i - 1][0], lng: coords[i - 1][1] }, { lat: coords[i][0], lng: coords[i][1] }));
  }
  return { coords, cum, totalM: cum[cum.length - 1] || 0, durS, road, at: Date.now() };
}

export function fallbackRoutePro(from: LL, to: LL): RoutePro {
  const straight = haversineM(from, to) * DETOUR_FACTOR;
  const r = buildRoute([[from.lat, from.lng], [to.lat, to.lng]], straight / FALLBACK_SPEED_MPS, false);
  r.totalM = straight;
  r.cum = [0, straight];
  return r;
}

/** Ramer–Douglas–Peucker, only used for very long routes (keeps every real turn). */
function simplify(pts: [number, number][], tolM: number): [number, number][] {
  if (pts.length < 3) return pts;
  const kLat = 111320;
  const kLng = 111320 * Math.cos((pts[0][0] * Math.PI) / 180);
  const keep = new Uint8Array(pts.length);
  keep[0] = 1; keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxD = 0; let at = -1;
    const ax = pts[a][1] * kLng, ay = pts[a][0] * kLat, bx = pts[b][1] * kLng, by = pts[b][0] * kLat;
    const dx = bx - ax, dy = by - ay; const L2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i][1] * kLng, py = pts[i][0] * kLat;
      let t = L2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d > maxD) { maxD = d; at = i; }
    }
    if (at > 0 && maxD > tolM) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

async function fetchOne(host: string, from: LL, to: LL, timeoutMs: number): Promise<RoutePro | null> {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = window.setTimeout(() => { try { ctl?.abort(); } catch { /* ignore */ } }, timeoutMs);
  try {
    const url = `${host}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&alternatives=false&steps=false&continue_straight=true`;
    const r = await fetch(url, { signal: ctl ? ctl.signal : undefined, cache: 'no-store' });
    if (!r.ok) return null;
    const d: any = await r.json();
    const rt = d?.routes?.[0];
    if (!rt || !Number.isFinite(Number(rt.duration))) return null;
    let pts: [number, number][] = (rt.geometry?.coordinates || [])
      .filter((c: any) => Array.isArray(c) && c.length >= 2)
      .map((c: any) => [Number(c[1]), Number(c[0])] as [number, number]);
    if (pts.length < 2) return null;
    if (pts.length > 4000) pts = simplify(pts, 1.5);
    return buildRoute(pts, Number(rt.duration), true);
  } catch { return null; } finally { window.clearTimeout(timer); }
}

export async function fetchRoutePro(from: LL, to: LL, timeoutMs = 7000): Promise<RoutePro | null> {
  for (const host of ROUTE_HOSTS) {
    const r = await fetchOne(host, from, to, timeoutMs);
    if (r) return r;
  }
  return null;
}

/** Nearest point of the road line to `p`. `minAlongM` ignores the part of the line already driven (no jumping back on loops). */
export function projectOnRoute(route: RoutePro, p: LL, minAlongM = 0): RouteProgress {
  const cs = route.coords;
  const now = Date.now();
  if (cs.length < 2) {
    return { snapped: { lat: p.lat, lng: p.lng }, idx: 0, offM: 0, alongM: 0, remainingM: 0, remainingS: 0, at: now };
  }
  const kLat = 111320;
  const kLng = 111320 * Math.cos((p.lat * Math.PI) / 180);
  let bestD = Infinity; let bestIdx = 0; let bestT = 0;
  for (let i = 0; i < cs.length - 1; i++) {
    if (route.cum[i + 1] < minAlongM) continue;
    const ax = (cs[i][1] - p.lng) * kLng, ay = (cs[i][0] - p.lat) * kLat;
    const bx = (cs[i + 1][1] - p.lng) * kLng, by = (cs[i + 1][0] - p.lat) * kLat;
    const dx = bx - ax, dy = by - ay; const L2 = dx * dx + dy * dy;
    let t = L2 > 0 ? -(ax * dx + ay * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < bestD) { bestD = d; bestIdx = i; bestT = t; }
  }
  if (!Number.isFinite(bestD)) return projectOnRoute(route, p, 0);
  const lat = cs[bestIdx][0] + (cs[bestIdx + 1][0] - cs[bestIdx][0]) * bestT;
  const lng = cs[bestIdx][1] + (cs[bestIdx + 1][1] - cs[bestIdx][1]) * bestT;
  const alongM = route.cum[bestIdx] + (route.cum[bestIdx + 1] - route.cum[bestIdx]) * bestT;
  const remainingM = Math.max(0, route.totalM - alongM);
  const remainingS = route.totalM > 0 ? (route.durS * remainingM) / route.totalM : 0;
  return { snapped: { lat, lng }, idx: bestIdx, offM: bestD, alongM, remainingM, remainingS, at: now };
}

export type GoRouteState = {
  route: RoutePro | null;
  prog: RouteProgress | null;
  line: LL[];        // what is left of the road line: [snapped car, ...road ahead]
  leftS: number;     // seconds left, ticking every second
  leftM: number;     // meters left along the road
  snapped: LL | null;
};

/**
 * Live road route from `from` (the one driving) to `to` (the one waiting). Active only after the other user accepted.
 * Re-routes at once when the car leaves the line or the destination moves, refreshes every 25 s.
 */
export function useGoRoute(from: LL | null, to: LL | null, active: boolean): GoRouteState {
  const [route, setRoute] = useState<RoutePro | null>(null);
  const [, setTick] = useState(0);
  const fromRef = useRef<LL | null>(from); fromRef.current = from;
  const toRef = useRef<LL | null>(to); toRef.current = to;
  const routeRef = useRef<RoutePro | null>(null);
  const lastFetchRef = useRef(0);
  const fetchingRef = useRef(false);
  const offCntRef = useRef(0);
  const alongRef = useRef(0);
  const hasFrom = !!from;
  const hasTo = !!to;

  useEffect(() => {
    if (!active || !hasFrom || !hasTo || !fromRef.current || !toRef.current) {
      routeRef.current = null; setRoute(null); return;
    }
    let stopped = false;
    const fetchNow = async () => {
      const f = fromRef.current; const t = toRef.current;
      if (!f || !t || fetchingRef.current || stopped) return;
      fetchingRef.current = true; lastFetchRef.current = Date.now();
      const rt = await fetchRoutePro(f, t);
      fetchingRef.current = false;
      if (stopped) return;
      if (rt) { routeRef.current = rt; alongRef.current = 0; offCntRef.current = 0; setRoute(rt); }
      else if (!routeRef.current) { const fb = fallbackRoutePro(f, t); routeRef.current = fb; setRoute(fb); }
    };
    const fb = fallbackRoutePro(fromRef.current, toRef.current);
    routeRef.current = fb; alongRef.current = 0; setRoute(fb);
    void fetchNow();
    const refresh = window.setInterval(() => { void fetchNow(); }, 25000);
    const watch = window.setInterval(() => {
      setTick(n => n + 1);
      const rt = routeRef.current; const f = fromRef.current; const t = toRef.current;
      if (!rt || !f || !t) return;
      if (!rt.road) { if (Date.now() - lastFetchRef.current > 6000) void fetchNow(); return; }
      const pr = projectOnRoute(rt, f, alongRef.current - 150);
      offCntRef.current = pr.offM > 35 ? offCntRef.current + 1 : 0;
      const end = rt.coords[rt.coords.length - 1];
      const moved = haversineM({ lat: end[0], lng: end[1] }, t);
      if ((offCntRef.current >= 2 || moved > 45) && Date.now() - lastFetchRef.current > 4000) void fetchNow();
    }, 1000);
    return () => { stopped = true; window.clearInterval(refresh); window.clearInterval(watch); };
  }, [active, hasFrom, hasTo]);

  const fLat = from ? from.lat : NaN;
  const fLng = from ? from.lng : NaN;
  const prog = useMemo(() => {
    if (!active || !route || !Number.isFinite(fLat) || !Number.isFinite(fLng)) return null;
    return projectOnRoute(route, { lat: fLat, lng: fLng }, alongRef.current - 150);
  }, [active, route, fLat, fLng]);
  useEffect(() => { if (prog) alongRef.current = Math.max(0, prog.alongM); }, [prog]);

  const line = useMemo<LL[]>(() => {
    if (!active || !route) return [];
    if (!route.road || !prog) {
      const f = fromRef.current; const t = toRef.current;
      return f && t ? [f, t] : [];
    }
    const ahead = route.coords.slice(prog.idx + 1).map(c => ({ lat: c[0], lng: c[1] }));
    return [prog.snapped, ...ahead];
  }, [active, route, prog]);

  const leftS = prog ? Math.max(0, prog.remainingS - (Date.now() - prog.at) / 1000) : 0;
  return { route, prog, line, leftS, leftM: prog ? prog.remainingM : 0, snapped: prog && route && route.road && prog.offM <= 40 ? prog.snapped : null };
}

/** Smooth moving marker: glides to every new position instead of jumping (jumps > 2 km are instant). */
export function useSmoothLL(target: LL | null, ms = 1100): LL | null {
  const [cur, setCur] = useState<LL | null>(target);
  const curRef = useRef<LL | null>(target);
  const rafRef = useRef<number | null>(null);
  const tLat = target ? target.lat : NaN;
  const tLng = target ? target.lng : NaN;
  useEffect(() => {
    if (!Number.isFinite(tLat) || !Number.isFinite(tLng)) { curRef.current = null; setCur(null); return; }
    const to = { lat: tLat, lng: tLng };
    const from = curRef.current;
    if (!from || haversineM(from, to) > 2000) { curRef.current = to; setCur(to); return; }
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const p = { lat: from.lat + (to.lat - from.lat) * e, lng: from.lng + (to.lng - from.lng) * e };
      curRef.current = p; setCur(p);
      if (k < 1) rafRef.current = requestAnimationFrame(step);
    };
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); };
  }, [tLat, tLng, ms]);
  return cur;
}

/* ───────────────────────────── global Accept | Decline host (on top of every page) ───────────────────────────── */

type Identity = { id: string };
let identity: Identity | null = null;
const idListeners = new Set<() => void>();
/** Optional fallback: the page tells the host who is logged in (used only if the host cannot read the session itself). */
export function setLiveGpsGoIdentity(id: string | null | undefined) {
  const next = id ? { id: String(id) } : null;
  if ((identity && identity.id) === (next && next.id)) return;
  identity = next;
  idListeners.forEach(l => l());
}
const idSubscribe = (l: () => void) => { idListeners.add(l); return () => { idListeners.delete(l); }; };
const idSnapshot = () => identity;

const Z = 10700; // above the bottom nav (10200), the live-kind sheet (10500) and the story camera

function Avatar({ src, name, size = 56, ring = '#22c55e' }: { src: string | null; name: string; size?: number; ring?: string }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', background: '#111', border: `2.5px solid ${ring}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ color: '#fff', fontWeight: 800, fontSize: size * 0.4 }}>{(name || '?').slice(0, 1).toUpperCase()}</span>}
    </div>
  );
}

function Sheet({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: Z, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, pointerEvents: 'auto' }}>
      <div style={{ width: '100%', maxWidth: 340, borderRadius: 20, background: '#050505', border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)', padding: 18, color: '#fff', textAlign: 'center' }}>
        {children}
      </div>
    </div>
  );
}

function HostCore({ me }: { me: string }) {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!me) { stopPolling(); return; }
    startPolling(me);
    return () => stopPolling();
  }, [me]);

  // the "declined" notice is shown inside the map card; when the map is not open the box below shows it for a moment
  const declined = s.declinedNotice;
  useEffect(() => {
    if (!declined) return;
    const t = window.setTimeout(() => { if (state.declinedNotice && state.declinedNotice.id === declined.id) ackGoDeclined(); }, 6000);
    return () => window.clearTimeout(t);
  }, [declined]);

  const pending = s.incomingPending;
  const accepted = s.acceptedPrompt;

  if (pending) {
    const nm = pending.fromUsername || pending.fromName;
    return (
      <Sheet>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
          <Avatar src={pending.fromAvatar} name={pending.fromName} size={64} />
        </div>
        <p style={{ margin: '0 0 4px', fontWeight: 900, fontSize: '1.05rem' }}>@{nm}</p>
        <p style={{ margin: '0 0 16px', color: 'rgba(255,255,255,0.75)', fontSize: '0.9rem', lineHeight: 1.4 }}>
          wants to Go to your location on GPS Live
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button" disabled={busy}
            onClick={async () => { setBusy(true); await respondGo(pending, true); setBusy(false); }}
            style={{ flex: 1, border: 'none', borderRadius: 12, padding: '12px 8px', background: '#22c55e', color: '#04130a', fontWeight: 900, fontSize: '1rem', cursor: 'pointer' }}
          >Accept</button>
          <button
            type="button" disabled={busy}
            onClick={async () => { setBusy(true); await respondGo(pending, false); setBusy(false); }}
            style={{ flex: 1, border: 'none', borderRadius: 12, padding: '12px 8px', background: '#ef4444', color: '#fff', fontWeight: 900, fontSize: '1rem', cursor: 'pointer' }}
          >Decline</button>
        </div>
      </Sheet>
    );
  }

  if (accepted) {
    const nm = accepted.fromUsername || accepted.fromName;
    return (
      <Sheet>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
          <Avatar src={accepted.fromAvatar} name={accepted.fromName} size={56} />
        </div>
        <p style={{ margin: '0 0 6px', fontWeight: 900, fontSize: '1.1rem' }}>You want Go GPS Live</p>
        <p style={{ margin: '0 0 16px', color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem' }}>@{nm} is on the way to you</p>
        <button
          type="button"
          onClick={() => { setState({ acceptedPrompt: null }); openGpsLiveMap(); }}
          style={{ width: '100%', border: 'none', borderRadius: 12, padding: '12px 8px', background: '#22c55e', color: '#04130a', fontWeight: 900, fontSize: '1rem', cursor: 'pointer' }}
        >Ok</button>
      </Sheet>
    );
  }

  return null;
}

function HostWithSession() {
  const { user } = useSession() as any;
  const id = user?.id ? String(user.id) : '';
  const fb = useSyncExternalStore(idSubscribe, idSnapshot, idSnapshot);
  return <HostCore me={id || (fb ? fb.id : '')} />;
}

function HostNoSession() {
  const fb = useSyncExternalStore(idSubscribe, idSnapshot, idSnapshot);
  return <HostCore me={fb ? fb.id : ''} />;
}

class HostBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { /* session hook not usable outside the app tree -> fall back to the identity given by the page */ }
  render() { return this.state.failed ? <HostNoSession /> : this.props.children; }
}

/** Starts the global host once (own React root appended to <body>, so the box shows on every page). */
export function ensureLiveGpsGoHost() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const w = window as any;
  if (w.__stooornaGpsGoHost) return;
  w.__stooornaGpsGoHost = true;
  const mount = () => {
    try {
      const el = document.createElement('div');
      el.id = 'stooorna-gps-go-host';
      document.body.appendChild(el);
      createRoot(el).render(<HostBoundary><HostWithSession /></HostBoundary>);
    } catch { w.__stooornaGpsGoHost = false; }
  };
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount, { once: true });
}
ensureLiveGpsGoHost();
