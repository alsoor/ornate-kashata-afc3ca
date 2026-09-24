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

const CACHE_KEY = 'stooorna_live_location_net';
const FRESH_MS = 30 * 60 * 1000;

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

function asPing(raw: any): LiveLocPing | null {
  const ping = raw?.ping || raw;
  if (!ping) return null;
  const id = String(ping.id || ping.userId || '');
  const lat = Number(ping.lat);
  const lng = Number(ping.lng);
  if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    id,
    name: String(ping.name || 'User'),
    username: ping.username ?? null,
    avatarUrl: ping.avatarUrl ?? null,
    lat,
    lng,
    at: Number(ping.at) || Date.now(),
    on: ping.on !== false,
  };
}

export async function publishLiveLocation(ping: LiveLocPing) {
  const body = JSON.stringify({
    id: ping.id,
    userId: ping.id,
    name: ping.name,
    username: ping.username,
    avatarUrl: ping.avatarUrl,
    lat: ping.lat,
    lng: ping.lng,
    at: ping.at,
    on: ping.on,
  });
  const headers = { 'Content-Type': 'application/json' };
  const tries = [
    () => fetch('/api/live-gps', { method: 'POST', credentials: 'include', headers, body }),
    () => fetch('/api/live-location', { method: 'POST', credentials: 'include', headers, body }),
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

  const urls = ['/api/live-gps', '/api/live-location'];
  for (const url of urls) {
    try {
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) continue;
      const d = await r.json();
      const rows = (d.pins || d.pings || d.items || d.list || (Array.isArray(d) ? d : [])) as any[];
      for (const raw of rows) {
        const ping = asPing(raw);
        if (!ping || ping.on === false) continue;
        out.set(ping.id, ping);
      }
    } catch {
      /* optional */
    }
  }

  const list = [...out.values()];
  cachePings(list);
  return list;
}

export async function pullOnlineIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  try {
    const r = await fetch('/api/presence', { credentials: 'include' });
    if (!r.ok) return ids;
    const d = await r.json();
    const src = d.users || d.presence || d;
    if (src && typeof src === 'object') {
      for (const [id, row] of Object.entries(src as Record<string, any>)) {
        if (id === 'users' || id === 'presence') continue;
        if (row && (row.online === true || row.lastSeen)) ids.add(String(id));
      }
    }
  } catch {
    /* optional */
  }
  return ids;
}
