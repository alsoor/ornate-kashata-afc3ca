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

export default async function handler(_req: IncomingMessage, res: ServerResponse) {
  const now = Date.now();
  const pings = (g.__stooornaLL || []).filter(x => x.on !== false && now - Number(x.at || 0) < 90_000);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ pings }));
}
