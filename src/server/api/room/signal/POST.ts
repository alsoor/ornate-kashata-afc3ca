/**
 * POST /api/room/signal
 * Body: { roomId: string, payload: object }
 * Stores a live-room signal so every viewer can poll it.
 * Place at: src/server/api/room/signal/POST.ts
 */

type LiveSignalRow = {
  at: number;
  payload: Record<string, unknown>;
};

type SignalStore = Map<string, LiveSignalRow[]>;

function store(): SignalStore {
  const g = globalThis as typeof globalThis & { __stooornaLiveSignals?: SignalStore };
  if (!g.__stooornaLiveSignals) g.__stooornaLiveSignals = new Map();
  return g.__stooornaLiveSignals;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function isUnreadStreamBody(b: any): boolean {
  return !!b && typeof b === 'object' && typeof b.getReader === 'function';
}

async function readBody(req: Request | any): Promise<any> {
  // Framework already parsed the body into a plain object (e.g. Express + body-parser).
  if (req?.body && typeof req.body === 'object' && !isUnreadStreamBody(req.body)) {
    return req.body;
  }
  // Standard Fetch API Request (or anything else exposing .json()) with an unread body.
  if (typeof req?.json === 'function') {
    try {
      return await req.json();
    } catch {
      return {};
    }
  }
  return {};
}

export async function POST(req: Request) {
  const body = await readBody(req);
  const roomId = String(body?.roomId || body?.id || '').trim();
  const payload =
    (body?.payload && typeof body.payload === 'object' && body.payload) ||
    (body?.data && typeof body.data === 'object' && body.data) ||
    (body?.t ? body : null);
  if (!roomId || !payload) return json({ ok: false, error: 'roomId and payload required' }, 400);

  const at = Date.now();
  const row: LiveSignalRow = { at, payload: { ...payload, at: payload.at || at, ts: payload.ts || at } };
  const list = store().get(roomId) || [];
  list.push(row);
  const cutoff = Date.now() - 120_000;
  store().set(
    roomId,
    list.filter((item) => item.at >= cutoff).slice(-200),
  );

  return json({ ok: true, at, roomId });
}

export default async function handler(req: any, res?: any) {
  if (res && typeof res.json === 'function') {
    const body = req.body || {};
    const roomId = String(body.roomId || '').trim();
    const payload =
      (body.payload && typeof body.payload === 'object' && body.payload) ||
      (body.data && typeof body.data === 'object' && body.data) ||
      (body.t ? body : null);
    if (!roomId || !payload) {
      res.statusCode = 400;
      return res.json({ ok: false, error: 'roomId and payload required' });
    }
    const at = Date.now();
    const list = store().get(roomId) || [];
    list.push({ at, payload: { ...payload, at: payload.at || at, ts: payload.ts || at } });
    const cutoff = Date.now() - 120_000;
    store().set(
      roomId,
      list.filter((item) => item.at >= cutoff).slice(-200),
    );
    res.statusCode = 200;
    return res.json({ ok: true, at, roomId });
  }

  return POST(req as Request);
}
