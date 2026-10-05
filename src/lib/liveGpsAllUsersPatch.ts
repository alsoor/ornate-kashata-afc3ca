/**
 * liveGpsAllUsersPatch — GPS Live shows EVERY user, not only friends.
 * Standalone patch used by add-friend.tsx (CameraStoryCapture = the GPS Live map). It adds code only.
 *
 * What it does
 *  1. Every user who has the map toggle ON is on the map at the last place he was seen (the server keeps that spot
 *     after he goes offline: /api/live-gps). The map used to drop everybody who was not a friend -> selectMapPins().
 *  2. A user who is online in the app with the toggle ON keeps his spot fresh even when he did not open the map
 *     -> useLiveGpsBackgroundPublisher(). Toggle OFF = nothing is sent (the map already clears his pin on the server).
 *  3. Search a user inside the map and tap him: the map zooms to his place at once, even if his pin was not loaded yet
 *     -> locateLiveGpsUser() asks the server for that one user.
 */

import { useEffect, useRef } from 'react';

export const LIVE_GPS_SHARE_KEY = 'stooorna_live_gps_share'; // '1' = toggle on, '0' = toggle off (same key as the map toggle)

export type LiveGpsPinLite = {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  lat: number;
  lng: number;
  at: number;
};

const MAX_PINS = 500; // keeps the map light when many users share

const readShare = (): string | null => {
  try { return localStorage.getItem(LIVE_GPS_SHARE_KEY); } catch { return null; }
};

/** The map showed the toggle as ON (the default) -> remember it as an explicit choice, so the background publisher may use it. */
export function rememberLiveGpsShare(): void {
  try { if (localStorage.getItem(LIVE_GPS_SHARE_KEY) !== '0') localStorage.setItem(LIVE_GPS_SHARE_KEY, '1'); } catch { /* ignore */ }
}

function normalize(p: any): LiveGpsPinLite | null {
  if (!p || p.id == null) return null;
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return {
    id: String(p.id),
    name: String(p.name || p.username || 'User'),
    username: String(p.username || '').replace(/^@/, ''),
    avatarUrl: p.avatarUrl ?? null,
    lat,
    lng,
    at: Number(p.at) || Date.now(),
  };
}

/**
 * PART 1 — the pins the map should show: everybody (not only friends). One pin per user (the newest wins), newest first, capped.
 * `friendsOnly` is the list the old code used (friends + me); it is always kept in the result.
 */
export function selectMapPins<T extends { id?: any; at?: any }>(all: T[], friendsOnly: T[] = []): T[] {
  const byId = new Map<string, T>();
  for (const p of [...(all || []), ...(friendsOnly || [])]) {
    if (!p || p.id == null) continue;
    const id = String(p.id);
    const prev = byId.get(id);
    if (!prev || Number(p.at || 0) >= Number(prev.at || 0)) byId.set(id, p);
  }
  const list = Array.from(byId.values()).sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
  if (list.length <= MAX_PINS) return list;
  const keep = list.slice(0, MAX_PINS);
  const keepIds = new Set(keep.map((p) => String(p.id)));
  for (const p of friendsOnly || []) if (p && !keepIds.has(String(p.id))) keep.push(p);
  return keep;
}

/**
 * PART 3 — a user picked from the search list: find his last place (server, one user, then the whole list) and return it.
 * The caller puts the pin on the map and zooms to it.
 */
export async function locateLiveGpsUser(hit: { id: string; username?: string | null; name?: string | null }): Promise<LiveGpsPinLite | null> {
  const wantId = String(hit.id || '');
  const wantUser = String(hit.username || '').replace(/^@/, '').toLowerCase();
  const wantName = String(hit.name || '').toLowerCase();
  const pull = async (url: string): Promise<LiveGpsPinLite[]> => {
    try {
      const r = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (!r.ok) return [];
      const d: any = await r.json();
      const rows = (d?.pins || d?.pings || d?.items || (Array.isArray(d) ? d : [])) as any[];
      return rows.map(normalize).filter((x): x is LiveGpsPinLite => !!x);
    } catch { return []; }
  };
  if (wantId) {
    const one = await pull(`/api/live-gps?id=${encodeURIComponent(wantId)}`);
    const hitOne = one.find((p) => p.id === wantId);
    if (hitOne) return hitOne;
  }
  const all = await pull('/api/live-gps');
  return (
    all.find((p) => p.id === wantId)
    || (wantUser ? all.find((p) => p.username.toLowerCase() === wantUser) : undefined)
    || (wantName ? all.find((p) => p.name.toLowerCase() === wantName) : undefined)
    || null
  );
}

/**
 * PART 2 — mount once in the page that knows the logged-in user. While the app is open and visible and the map toggle is ON,
 * my last place is refreshed on the server every 30s, so anybody who opens GPS Live later sees where I was.
 */
export function useLiveGpsBackgroundPublisher(me: {
  id?: string | null; name?: string | null; username?: string | null; avatarUrl?: string | null;
}): void {
  const meRef = useRef(me);
  meRef.current = me;
  const id = me.id ? String(me.id) : '';

  useEffect(() => {
    if (!id || typeof navigator === 'undefined' || !navigator.geolocation) return;
    let stopped = false;
    let busy = false;

    const tick = () => {
      if (stopped || busy) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (readShare() !== '1') return; // toggle off (or never chosen) -> nothing is sent
      busy = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          busy = false;
          if (stopped || readShare() !== '1') return;
          const m = meRef.current;
          try {
            void fetch('/api/live-gps', {
              method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id,
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                name: m.name || m.username || 'User',
                username: String(m.username || '').replace(/^@/, ''),
                avatarUrl: m.avatarUrl ?? null,
              }),
            }).catch(() => { /* ignore */ });
          } catch { /* ignore */ }
        },
        () => { busy = false; },
        { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
      );
    };

    tick();
    const iv = window.setInterval(tick, 30_000);
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stopped = true;
      window.clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [id]);
}
