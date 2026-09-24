export type LiveLocPing = {
  id: string;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  lat: number;
  lng: number;
  at: number;
  on: boolean;
};

const ROOM = 'stooorna-live-location';
const CACHE_KEY = 'stooorna_live_location_net';
const FRESH_MS = 90_000;

export function cachePings(list: LiveLocPing[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list.slice(0, 400)));
  } catch {
    /* ignore */
  }
}

export function readCachedPings(): LiveLocPing[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
    const now = Date.now();
    return (Array.isArray(raw) ? raw : []).filter((x: LiveLocPing) => x?.on && x.at && now - x.at < FRESH_MS);
  } catch {
    return [];
  }
}

export async function publishLiveLocation(ping: LiveLocPing) {
  const body = JSON.stringify({ roomId: ROOM, t: 'll', ping });
  const tries = [
    () => fetch('/api/live-location', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ping) }),
    () => fetch('/api/room/signal', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body }),
  ];
  for (const fn of tries) {
    try {
      const r = await fn();
      if (r.ok) break;
    } catch {
      /* try next */
    }
  }
  const cur = readCachedPings().filter(x => x.id !== ping.id);
  if (ping.on) cur.unshift(ping);
  cachePings(cur);
}

export async function pullLiveLocations(): Promise<LiveLocPing[]> {
  const out = new Map<string, LiveLocPing>();
  for (const p of readCachedPings()) out.set(p.id, p);
  const urls = [
    '/api/live-location',
    `/api/room/signal?roomId=${encodeURIComponent(ROOM)}&since=0`,
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) continue;
      const d = await r.json();
      const rows = (d.pings || d.items || d.signals || d.list || (Array.isArray(d) ? d : [])) as any[];
      for (const raw of rows) {
        const ping: LiveLocPing | null = raw?.ping || (raw?.lat != null ? raw : raw?.data?.ping) || null;
        if (!ping?.id || ping.lat == null || ping.lng == null) continue;
        if (ping.on === false) continue;
        if (Date.now() - Number(ping.at || 0) > FRESH_MS) continue;
        out.set(String(ping.id), { ...ping, id: String(ping.id) });
      }
    } catch {
      /* optional */
    }
  }
  const list = [...out.values()];
  cachePings(list);
  return list;
}
