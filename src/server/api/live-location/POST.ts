import type { IncomingMessage, ServerResponse } from 'http';

type Ping = {
  id: string;
  name?: string;
  username?: string | null;
  avatarUrl?: string | null;
  lat: number;
  lng: number;
  at: number;
  on?: boolean;
};

const g = globalThis as typeof globalThis & { __stooornaLL?: Ping[] };
if (!g.__stooornaLL) g.__stooornaLL = [];

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', c => { s += c; });
    req.on('end', () => resolve(s));
    req.on('error', reject);
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method && req.method !== 'POST') {
    res.statusCode = 405;
    res.end('method');
    return;
  }
  try {
    const raw = await readBody(req);
    const body = JSON.parse(raw || '{}');
    const ping: Ping = body.ping || body;
    if (!ping?.id || ping.lat == null || ping.lng == null) {
      res.statusCode = 400;
      res.end('bad');
      return;
    }
    const list = g.__stooornaLL!.filter(x => x.id !== String(ping.id));
    if (ping.on !== false) {
      list.unshift({
        id: String(ping.id),
        name: ping.name,
        username: ping.username ?? null,
        avatarUrl: ping.avatarUrl ?? null,
        lat: Number(ping.lat),
        lng: Number(ping.lng),
        at: Number(ping.at) || Date.now(),
        on: true,
      });
    }
    g.__stooornaLL = list.slice(0, 400);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true }));
  } catch {
    res.statusCode = 500;
    res.end('err');
  }
}
