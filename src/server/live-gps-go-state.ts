/**
 * live-gps-go-state — server memory for GPS Live "Go" requests (ask first, then go).
 * Same style as the other live state kept in server memory. Used by /api/live-gps-go (GET + POST).
 *
 * Life of a request:  pending (90 s to answer) -> accepted (up to 6 h, until the driver stops) | declined | cancelled | expired | ended
 */

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

const PENDING_TTL = 90_000;
const ACCEPTED_TTL = 6 * 60 * 60 * 1000;
const STALE_DRIVER_MS = 5 * 60 * 1000;   // the driver stopped sending positions (app closed) -> ended
const DONE_KEEP = 3 * 60 * 1000;         // finished requests stay visible this long so the other phone can see the result

const g = globalThis as any;
const store: Map<string, GoReq> = g.__stooornaGoReqStore || (g.__stooornaGoReqStore = new Map<string, GoReq>());

const str = (v: unknown, max = 200) => String(v ?? '').slice(0, max);
const num = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const validLL = (lat?: number, lng?: number) =>
  lat !== undefined && lng !== undefined && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

function sweep() {
  const now = Date.now();
  for (const [id, r] of store) {
    if (r.status === 'pending' && now - r.at > PENDING_TTL) { r.status = 'expired'; r.updatedAt = now; }
    if (r.status === 'accepted') {
      const last = Math.max(r.updatedAt, r.fromAt || 0);
      if (now - r.at > ACCEPTED_TTL || now - last > STALE_DRIVER_MS) { r.status = 'ended'; r.updatedAt = now; }
    }
    if (r.status !== 'pending' && r.status !== 'accepted' && now - r.updatedAt > DONE_KEEP) store.delete(id);
  }
}

export function listFor(userId: string): { incoming: GoReq[]; outgoing: GoReq[] } {
  sweep();
  const incoming: GoReq[] = [];
  const outgoing: GoReq[] = [];
  for (const r of store.values()) {
    if (r.toId === userId && (r.status === 'pending' || r.status === 'accepted')) incoming.push(r);
    if (r.fromId === userId) outgoing.push(r);
  }
  return { incoming, outgoing };
}

export function applyAction(body: any): { ok: boolean; status: number; data: any } {
  sweep();
  const action = str(body?.action, 20);
  const now = Date.now();

  if (action === 'request') {
    const f = body?.from || {};
    const t = body?.to || {};
    const fromId = str(f.id, 80);
    const toId = str(t.id, 80);
    if (!fromId || !toId || fromId === toId) return { ok: false, status: 400, data: { error: 'bad request' } };
    // one live request per driver: any older pending/accepted one from him ends now
    for (const r of store.values()) {
      if (r.fromId === fromId && (r.status === 'pending' || r.status === 'accepted')) {
        r.status = r.status === 'pending' ? 'cancelled' : 'ended';
        r.updatedAt = now;
      }
    }
    const fromLat = num(body?.fromLat); const fromLng = num(body?.fromLng);
    const toLat = num(t.lat); const toLng = num(t.lng);
    const req: GoReq = {
      id: `go_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      fromId, fromName: str(f.name || f.username || 'User', 80), fromUsername: str(f.username, 80), fromAvatar: f.avatarUrl ? str(f.avatarUrl, 2000) : null,
      toId, toName: str(t.name || t.username || 'User', 80), toUsername: str(t.username, 80), toAvatar: t.avatarUrl ? str(t.avatarUrl, 2000) : null,
      status: 'pending', at: now, updatedAt: now,
    };
    if (validLL(fromLat, fromLng)) { req.fromLat = fromLat; req.fromLng = fromLng; req.fromAt = now; }
    if (validLL(toLat, toLng)) { req.toLat = toLat; req.toLng = toLng; }
    store.set(req.id, req);
    return { ok: true, status: 200, data: { request: req } };
  }

  const r = store.get(str(body?.id, 80));
  if (!r) return { ok: false, status: 404, data: { error: 'not found' } };
  const userId = str(body?.userId, 80);

  if (action === 'respond') {
    if (userId !== r.toId) return { ok: false, status: 403, data: { error: 'not allowed' } };
    if (r.status !== 'pending') return { ok: true, status: 200, data: { request: r } };
    r.status = body?.accept ? 'accepted' : 'declined';
    r.updatedAt = now;
    return { ok: true, status: 200, data: { request: r } };
  }

  if (action === 'cancel' || action === 'end') {
    if (userId !== r.fromId && userId !== r.toId) return { ok: false, status: 403, data: { error: 'not allowed' } };
    if (r.status === 'pending') r.status = 'cancelled';
    else if (r.status === 'accepted') r.status = 'ended';
    r.updatedAt = now;
    return { ok: true, status: 200, data: { request: r } };
  }

  if (action === 'position') {
    if (userId !== r.fromId) return { ok: false, status: 403, data: { error: 'not allowed' } };
    const lat = num(body?.lat); const lng = num(body?.lng);
    if (!validLL(lat, lng)) return { ok: false, status: 400, data: { error: 'bad position' } };
    r.fromLat = lat; r.fromLng = lng; r.fromAt = now;
    return { ok: true, status: 200, data: { request: r } };
  }

  return { ok: false, status: 400, data: { error: 'unknown action' } };
}
