/**
 * liveGpsNavigatePatch - GPS Live: distance / car time / blue route line / Go countdown.
 * Standalone patch used by add-friend.tsx (CameraStoryCapture = the GPS Live map). It adds code only.
 *
 * What it does
 *  1. Distance + driving time between me and a user picked on the map (OSRM road route, with an offline fallback estimate).
 *  2. The road geometry for the blue line drawn on the map between me and him.
 *  3. A live countdown (HH:MM:SS) used after the Go button is pressed.
 *  4. A helper that zooms the map so both of us are visible.
 *
 * Routing server: the public OSRM demo server is used (driving profile). For heavy production traffic point ROUTE_URL
 * to your own OSRM / Valhalla / Mapbox directions endpoint (same GeoJSON shape for OSRM-compatible servers).
 */

import { useEffect, useRef, useState } from 'react';

export type LL = { lat: number; lng: number };

export type LiveGpsRoute = {
  distM: number;                 // meters
  durS: number;                  // seconds by car
  coords: [number, number][];    // [lat, lng] points of the road
  road: boolean;                 // true = real road route, false = straight-line estimate
  at: number;                    // when this route was computed (ms)
};

export const ROUTE_URL = 'https://router.project-osrm.org/route/v1/driving';
const FALLBACK_SPEED_MPS = 50 / 3.6;   // 50 km/h
const DETOUR_FACTOR = 1.3;             // straight line -> typical road length

export function haversineM(a: LL, b: LL): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function fallbackRoute(from: LL, to: LL): LiveGpsRoute {
  const straight = haversineM(from, to);
  const distM = straight * DETOUR_FACTOR;
  return {
    distM,
    durS: distM / FALLBACK_SPEED_MPS,
    coords: [[from.lat, from.lng], [to.lat, to.lng]],
    road: false,
    at: Date.now(),
  };
}

export async function fetchCarRoute(from: LL, to: LL, timeoutMs = 8000): Promise<LiveGpsRoute | null> {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = window.setTimeout(() => { try { ctl?.abort(); } catch { /* ignore */ } }, timeoutMs);
  try {
    const url = `${ROUTE_URL}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&alternatives=false&steps=false`;
    const r = await fetch(url, { signal: ctl ? ctl.signal : undefined, cache: 'no-store' });
    if (!r.ok) return null;
    const d: any = await r.json();
    const rt = d?.routes?.[0];
    if (!rt || !Number.isFinite(Number(rt.distance)) || !Number.isFinite(Number(rt.duration))) return null;
    let pts: [number, number][] = (rt.geometry?.coordinates || [])
      .filter((c: any) => Array.isArray(c) && c.length >= 2)
      .map((c: any) => [Number(c[1]), Number(c[0])] as [number, number]);
    if (pts.length > 900) {
      const step = Math.ceil(pts.length / 900);
      const last = pts[pts.length - 1];
      pts = pts.filter((_, i) => i % step === 0);
      pts.push(last);
    }
    return { distM: Number(rt.distance), durS: Number(rt.duration), coords: pts, road: pts.length > 1, at: Date.now() };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/** "850 m" / "12.4 km" */
export function formatDist(m: number): string {
  if (!Number.isFinite(m) || m < 0) return '--';
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  const km = m / 1000;
  return `${km < 100 ? km.toFixed(1) : Math.round(km)} km`;
}

/** "1 min" / "18 min" / "1 h 05 min" */
export function formatEta(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '--';
  const mins = Math.max(1, Math.round(sec / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const mm = mins % 60;
  return `${h} h ${String(mm).padStart(2, '0')} min`;
}

/** "HH:MM:SS" */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(Number.isFinite(sec) ? sec : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(x)}`;
}

/** Zoom/center so both points are visible in a w x h pixel area (never below zoom 5, so the flat map is used). */
export function fitZoomFor(a: LL, b: LL, w = 340, h = 300): { center: LL; zoom: number } {
  const center = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
  const wx = (lng: number, z: number) => ((lng + 180) / 360) * 256 * 2 ** z;
  const wy = (lat: number, z: number) => {
    const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * 2 ** z;
  };
  let zoom = 18;
  for (; zoom > 5; zoom--) {
    const dx = Math.abs(wx(a.lng, zoom) - wx(b.lng, zoom));
    const dy = Math.abs(wy(a.lat, zoom) - wy(b.lat, zoom));
    if (dx <= w && dy <= h) break;
  }
  return { center, zoom: Math.max(5, zoom) };
}

/**
 * Route from `from` (me) to `to` (him). Gives an instant straight-line estimate, then upgrades to the real road route
 * and keeps it fresh every `refreshMs`. Pass from=null or to=null to switch it off.
 */
export function useLiveGpsRoute(from: LL | null, to: LL | null, refreshMs = 30000): LiveGpsRoute | null {
  const [route, setRoute] = useState<LiveGpsRoute | null>(null);
  const fromRef = useRef<LL | null>(from);
  fromRef.current = from;
  const hasFrom = !!from;
  const toKey = to ? `${to.lat.toFixed(5)},${to.lng.toFixed(5)}` : '';

  useEffect(() => {
    if (!to || !hasFrom || !fromRef.current) { setRoute(null); return; }
    let stopped = false;
    const target: LL = { lat: to.lat, lng: to.lng };
    setRoute(fallbackRoute(fromRef.current, target));
    const run = async () => {
      const f = fromRef.current;
      if (!f || stopped) return;
      const rt = await fetchCarRoute(f, target);
      if (stopped) return;
      if (rt) setRoute(rt);
      else setRoute(prev => (prev && prev.road ? prev : fallbackRoute(fromRef.current || f, target)));
    };
    void run();
    const iv = window.setInterval(() => { void run(); }, Math.max(5000, refreshMs));
    return () => { stopped = true; window.clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toKey, hasFrom, refreshMs]);

  return route;
}

/** Seconds left to arrive, ticking every second while `running` (counts down from the last computed route). */
export function useRouteCountdown(route: LiveGpsRoute | null, running: boolean): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setTick(t => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [running]);
  if (!route) return 0;
  return Math.max(0, Math.round(route.durS - (Date.now() - route.at) / 1000));
}
