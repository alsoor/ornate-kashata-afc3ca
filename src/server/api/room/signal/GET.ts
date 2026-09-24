/**
 * GET /api/room/signal?roomId=&since=
 * Returns live-room signals (chat, freeze, mic-req, speakers) after `since`.
 * Place at: src/server/api/room/signal/GET.ts
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

function prune(roomId: string) {
  const list = store().get(roomId);
  if (!list) return;
  const cutoff = Date.now() - 120_000;
  const next = list.filter((row) => row.at >= cutoff).slice(-200);
  store().set(roomId, next);
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

export async function GET(req: Request) {
  const url = new URL(req.url);
  const roomId = String(url.searchParams.get('roomId') || '').trim();
  const since = Number(url.searchParams.get('since') || 0) || 0;
  if (!roomId) return json({ error: 'roomId required', messages: [] }, 400);

  prune(roomId);
  const messages = (store().get(roomId) || []).filter((row) => row.at > since);
  return json({ roomId, messages });
}

export default async function handler(req: any, res?: any) {
  const url =
    typeof req?.url === 'string'
      ? new URL(req.url, 'http://localhost')
      : new URL(String(req?.originalUrl || '/api/room/signal'), 'http://localhost');

  if (res && typeof res.json === 'function') {
    const roomId = String(req.query?.roomId || url.searchParams.get('roomId') || '').trim();
    const since = Number(req.query?.since || url.searchParams.get('since') || 0) || 0;
    if (!roomId) {
      res.statusCode = 400;
      return res.json({ error: 'roomId required', messages: [] });
    }
    prune(roomId);
    const messages = (store().get(roomId) || []).filter((row) => row.at > since);
    res.statusCode = 200;
    return res.json({ roomId, messages });
  }

  return GET(new Request(url.toString(), { method: 'GET' }));
}
