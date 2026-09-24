/**
 * Live Location map (settings pin).
 * Real OpenStreetMap tiles, pan + pinch zoom.
 * Search any user: gray = unavailable, green = live on map.
 * English-only.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Search, X } from 'lucide-react';
import { publishLiveLocation, pullLiveLocations, pullOnlineIds, type LiveLocPing } from '@/lib/liveLocationSync';

export type LiveLocUser = {
  id: string;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  lat?: number | null;
  lng?: number | null;
  live?: boolean;
  online?: boolean;
};

const KEY = 'stooorna_live_location_optin';
const POS_KEY = 'stooorna_live_location_pos';
const USERS_KEY = 'stooorna_live_location_users';
const TILE = 256;

function tileUrl(z: number, x: number, y: number) {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${y}/${x}`;
}

function liveOf(u: LiveLocUser) {
  return !!(u.live && u.lat != null && u.lng != null && Number.isFinite(u.lat) && Number.isFinite(u.lng));
}

function wrapTile(v: number, n: number) {
  return ((v % n) + n) % n;
}

function lngLatToWorld(lat: number, lng: number, z: number) {
  const n = 2 ** z;
  const x = ((lng + 180) / 360) * n;
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const s = Math.sin((clamped * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return { x, y };
}

export default function LiveLocationMap({
  currentUserId,
  currentName,
  currentAvatar,
  currentUsername,
  onClose,
}: {
  currentUserId?: string;
  currentName?: string;
  currentAvatar?: string | null;
  currentUsername?: string | null;
  onClose?: () => void;
}) {
  const [on, setOn] = useState(false);
  const [q, setQ] = useState('');
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [directory, setDirectory] = useState<LiveLocUser[]>([]);
  const [selected, setSelected] = useState<LiveLocUser | null>(null);
  const [center, setCenter] = useState({ lat: 29.3759, lng: 47.9774 });
  const [zoom, setZoom] = useState(11);
  const dragRef = useRef<{ x: number; y: number; lat: number; lng: number } | null>(null);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 360, h: 520 });

  const applyPings = useCallback((list: LiveLocUser[], pings: LiveLocPing[]) => {
    const byId = new Map(pings.map(p => [String(p.id), p]));
    const byUser = new Map(
      pings.map(p => [String(p.username || '').replace(/^@/, '').toLowerCase(), p]),
    );
    return list.map(u => {
      const un = String(u.username || '').replace(/^@/, '').toLowerCase();
      const hit = byId.get(String(u.id)) || (un ? byUser.get(un) : undefined);
      if (!hit) return u;
      return {
        ...u,
        lat: hit.lat,
        lng: hit.lng,
        live: true,
        avatarUrl: u.avatarUrl || hit.avatarUrl,
        name: u.name || hit.name,
        username: u.username || hit.username,
      };
    });
  }, []);

  const mergeLive = useCallback((list: LiveLocUser[]) => {
    let liveRows: LiveLocUser[] = [];
    try {
      liveRows = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    } catch {
      liveRows = [];
    }
    const map = new Map<string, LiveLocUser>();
    for (const u of list) map.set(String(u.id), { ...u, live: !!u.live });
    for (const u of liveRows) {
      const id = String(u.id);
      const prev = map.get(id) || u;
      map.set(id, {
        ...prev,
        ...u,
        live: u.lat != null && u.lng != null,
      });
    }
    return [...map.values()];
  }, []);

  useEffect(() => {
    try {
      window.dispatchEvent(new CustomEvent('stooorna:live-map', { detail: { open: true } }));
    } catch { /* ignore */ }
    return () => {
      try {
        window.dispatchEvent(new CustomEvent('stooorna:live-map', { detail: { open: false } }));
      } catch { /* ignore */ }
    };
  }, []);

  useEffect(() => {
    try {
      setOn(localStorage.getItem(KEY) === '1');
      /* map style locked to cream streets */
      const pos = localStorage.getItem(POS_KEY);
      if (pos) {
        const p = JSON.parse(pos);
        setMe(p);
        if (p?.lat && p?.lng) setCenter({ lat: p.lat, lng: p.lng });
      }
    } catch {
      /* ignore */
    }
    const load = async () => {
      const base: LiveLocUser[] = [];
      try {
        const r = await fetch('/api/friends', { credentials: 'include' });
        if (r.ok) {
          const d = await r.json();
          const list = (d?.accepted ?? d?.friends ?? d ?? []) as any[];
          for (const f of list) {
            const id = String(f.friendId ?? f.id ?? f.userId ?? '');
            if (!id) continue;
            base.push({
              id,
              name: f.name || f.username || 'User',
              username: f.username ?? null,
              avatarUrl: f.avatarUrl ?? f.image ?? null,
              live: false,
            });
          }
        }
      } catch {
        /* ignore */
      }
      setDirectory(mergeLive(base));
    };
    void load();
  }, [mergeLive]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth || 360, h: el.clientHeight || 520 });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth || 360, h: el.clientHeight || 520 });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!q.trim()) return;
    const t = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/users/search?q=${encodeURIComponent(q.trim())}`, { credentials: 'include' });
        if (!r.ok) return;
        const d = await r.json();
        const list = (d.users ?? d ?? []) as any[];
        setDirectory(prev => {
          const map = new Map(prev.map(u => [u.id, u]));
          for (const f of list) {
            const id = String(f.id ?? f.userId ?? '');
            if (!id) continue;
            const old = map.get(id);
            map.set(id, {
              id,
              name: f.name || f.username || old?.name || 'User',
              username: f.username ?? old?.username ?? null,
              avatarUrl: f.avatarUrl ?? f.image ?? old?.avatarUrl ?? null,
              lat: old?.lat,
              lng: old?.lng,
              live: old?.live,
            });
          }
          return mergeLive([...map.values()]);
        });
      } catch {
        /* optional */
      }
    }, 180);
    return () => window.clearTimeout(t);
  }, [q, mergeLive]);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const [pings, onlineIds] = await Promise.all([pullLiveLocations(), pullOnlineIds()]);
      if (stop) return;
      setDirectory(prev => {
        const extra: LiveLocUser[] = [];
        for (const p of pings) {
          if (!prev.some(u => u.id === p.id)) {
            extra.push({
              id: p.id,
              name: p.name,
              username: p.username,
              avatarUrl: p.avatarUrl,
              lat: p.lat,
              lng: p.lng,
              live: true,
              online: true,
            });
          }
        }
        const merged = applyPings([...extra, ...prev], pings);
        return merged.map(u => ({
          ...u,
          online: u.online || onlineIds.has(String(u.id)),
        }));
      });
    };
    void tick();
    const id = window.setInterval(tick, 4000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [applyPings]);

  useEffect(() => {
    if (!on || !me || !currentUserId) return;
    const id = window.setInterval(() => {
      void publishLiveLocation({
        id: currentUserId,
        name: currentName || 'Me',
        username: currentUsername ?? null,
        avatarUrl: currentAvatar ?? null,
        lat: me.lat,
        lng: me.lng,
        at: Date.now(),
        on: true,
      });
    }, 8000);
    return () => window.clearInterval(id);
  }, [on, me, currentUserId, currentName, currentUsername, currentAvatar]);

  const publishMe = useCallback((lat: number, lng: number) => {
    setMe({ lat, lng });
    setCenter({ lat, lng });
    setZoom(z => Math.max(z, 14));
    try {
      localStorage.setItem(POS_KEY, JSON.stringify({ lat, lng, at: Date.now() }));
    } catch {
      /* ignore */
    }
    if (!currentUserId) return;
    const row: LiveLocUser = {
      id: currentUserId,
      name: currentName || 'Me',
      username: currentUsername ?? null,
      avatarUrl: currentAvatar ?? null,
      lat,
      lng,
      live: true,
    };
    setDirectory(prev => {
      const next = [row, ...prev.filter(u => u.id !== currentUserId)];
      try {
        localStorage.setItem(USERS_KEY, JSON.stringify(next.filter(liveOf)));
      } catch {
        /* ignore */
      }
      return next;
    });
    setSelected(row);
    void publishLiveLocation({
      id: currentUserId,
      name: currentName || 'Me',
      username: currentUsername ?? null,
      avatarUrl: currentAvatar ?? null,
      lat,
      lng,
      at: Date.now(),
      on: true,
    });
  }, [currentUserId, currentName, currentUsername, currentAvatar]);

  function toggleOptIn() {
    const next = !on;
    setOn(next);
    try {
      localStorage.setItem(KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (!next) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      p => publishMe(p.coords.latitude, p.coords.longitude),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  function dropSecretPin() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      p => publishMe(p.coords.latitude, p.coords.longitude),
      () => {},
      { enableHighAccuracy: true, maximumAge: 4000 },
    );
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const self: LiveLocUser | null = currentUserId
      ? {
          id: currentUserId,
          name: currentName || 'Me',
          username: currentUsername ?? null,
          avatarUrl: currentAvatar ?? null,
          lat: me?.lat,
          lng: me?.lng,
          live: !!(on && me),
        }
      : null;
    const map = new Map<string, LiveLocUser>();
    if (self) map.set(self.id, self);
    for (const u of directory) {
      if (self && u.id === self.id) map.set(u.id, { ...u, ...self, live: self.live || liveOf(u) });
      else map.set(u.id, u);
    }
    const all = [...map.values()].filter(u => !String(u.username || u.name || '').toLowerCase().includes('deleted_'));
    if (!s) return all.slice(0, 40);
    return all.filter(u =>
      u.name.toLowerCase().includes(s) || String(u.username || '').toLowerCase().includes(s),
    ).slice(0, 40);
  }, [q, directory, currentUserId, currentName, currentUsername, currentAvatar, me, on]);

  const liveUsers = filtered.filter(liveOf);

  const tiles = useMemo(() => {
    const z = Math.round(zoom);
    const n = 2 ** z;
    const world = lngLatToWorld(center.lat, center.lng, z);
    const cx = size.w / 2;
    const cy = size.h / 2;
    const minX = Math.floor(world.x - cx / TILE) - 1;
    const maxX = Math.floor(world.x + cx / TILE) + 1;
    const minY = Math.floor(world.y - cy / TILE) - 1;
    const maxY = Math.floor(world.y + cy / TILE) + 1;
    const out: { key: string; src: string; z: number; x: number; y: number; left: number; top: number }[] = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        if (y < 0 || y >= n) continue;
        const tx = wrapTile(x, n);
        out.push({
          key: `${z}-${tx}-${y}`,
          src: tileUrl(z, tx, y),
          z,
          x: tx,
          y,
          left: cx + (x - world.x) * TILE,
          top: cy + (y - world.y) * TILE,
        });
      }
    }
    return out;
  }, [center.lat, center.lng, zoom, size.w, size.h]);

  function pointFor(lat: number, lng: number) {
    const z = Math.round(zoom);
    const world = lngLatToWorld(center.lat, center.lng, z);
    const p = lngLatToWorld(lat, lng, z);
    return {
      left: size.w / 2 + (p.x - world.x) * TILE,
      top: size.h / 2 + (p.y - world.y) * TILE,
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest('button,input,a')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, lat: center.lat, lng: center.lng };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const z = Math.round(zoom);
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    const world = lngLatToWorld(d.lat, d.lng, z);
    const nx = world.x - dx / TILE;
    const ny = world.y - dy / TILE;
    const n = 2 ** z;
    const lng = (nx / n) * 360 - 180;
    const merc = Math.PI * (1 - (2 * ny) / n);
    const lat = (Math.atan(Math.sinh(merc)) * 180) / Math.PI;
    setCenter({ lat, lng });
  }
  function onPointerUp() {
    dragRef.current = null;
  }
  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const a = e.touches[0];
      const b = e.touches[1];
      pinchRef.current = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), zoom };
      dragRef.current = null;
    }
  }
  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinchRef.current) {
      const a = e.touches[0];
      const b = e.touches[1];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const next = Math.min(18, Math.max(3, pinchRef.current.zoom + Math.log2(dist / pinchRef.current.dist)));
      setZoom(next);
    }
  }
  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    setZoom(z => Math.min(18, Math.max(3, z + (e.deltaY > 0 ? -0.35 : 0.35))));
  }

  function pickUser(u: LiveLocUser) {
    setSelected(u);
    if (liveOf(u) && u.lat != null && u.lng != null) {
      setCenter({ lat: u.lat, lng: u.lng });
      setZoom(15);
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 0,
      color: 'rgba(200,230,230,0.92)',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ padding: '8px 12px 6px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <p style={{ margin: 0, fontWeight: 800, fontSize: '0.95rem', color: '#00BCD4' }}>Live Location</p>
        {(() => {
          const pool = directory.filter(u => !String(u.username || u.name || '').toLowerCase().includes('deleted_'));
          const onN = pool.filter(u => liveOf(u) || u.online).length + (on ? 0 : 0);
          const selfOn = on ? 1 : 0;
          const ids = new Set(pool.map(u => u.id));
          const onlineN = pool.filter(u => liveOf(u) || u.online || (on && u.id === currentUserId)).length + (currentUserId && !ids.has(currentUserId) && on ? 1 : 0);
          const offlineN = Math.max(0, pool.length + (currentUserId && !ids.has(currentUserId) ? 1 : 0) - onlineN);
          return (
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 36 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#9ca3af' }} />
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#9ca3af', lineHeight: 1 }}>{offlineN}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px rgba(34,197,94,0.7)' }} />
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#22c55e', lineHeight: 1 }}>{onlineN || selfOn}</span>
              </div>
            </div>
          );
        })()}
        <button
          type="button"
          onClick={toggleOptIn}
          style={{
            border: '1px solid rgba(0,188,212,0.35)',
            background: on ? 'rgba(34,197,94,0.18)' : 'transparent',
            color: on ? '#22c55e' : '#9ca3af',
            borderRadius: 999,
            padding: '6px 12px',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          {on ? 'On' : 'Off'}
        </button>
      </div>

      <div style={{ padding: '0 12px 8px', position: 'relative', flexShrink: 0 }}>
        <Search size={14} color="#00BCD4" style={{ position: 'absolute', left: 22, top: 11 }} />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search username..."
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '9px 10px 9px 32px',
            borderRadius: 12,
            border: '1px solid rgba(0,188,212,0.28)',
            background: 'rgba(0,20,24,0.9)',
            color: 'rgba(200,230,230,0.92)',
            outline: 'none',
          }}
        />
        {q ? (
          <div style={{
            position: 'absolute',
            left: 12,
            right: 12,
            top: 42,
            zIndex: 6,
            maxHeight: 180,
            overflowY: 'auto',
            background: 'rgba(6,16,18,0.98)',
            border: '1px solid rgba(0,188,212,0.25)',
            borderRadius: 12,
          }}>
            {filtered.map(u => {
              const live = liveOf(u);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => pickUser(u)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 10px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid rgba(0,188,212,0.08)',
                    color: '#e8f6f6',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{
                    width: 28, height: 28, borderRadius: '50%', overflow: 'hidden',
                    background: '#123', flexShrink: 0, position: 'relative',
                  }}>
                    {u.avatarUrl ? <img src={u.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                    <span style={{
                      position: 'absolute', right: -1, bottom: -1, width: 9, height: 9, borderRadius: '50%',
                      background: live ? '#22c55e' : '#9ca3af',
                      border: '2px solid #061012',
                    }} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 800, fontSize: '0.8rem' }}>{u.name}</span>
                    <span style={{ display: 'block', color: 'rgba(150,200,200,0.55)', fontSize: '0.68rem' }}>
                      @{String(u.username || u.name).replace(/^@/, '')} · {live ? 'Live' : (u.online ? 'Online' : 'Unavailable')}
                    </span>
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 ? (
              <p style={{ margin: 0, padding: 12, color: 'rgba(150,200,200,0.5)', fontSize: '0.78rem' }}>No users found</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        ref={boxRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onWheel={onWheel}
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          touchAction: 'none',
          background: '#0b1a1c',
        }}
      >
        {tiles.map(t => (
          <img
            key={t.key}
            src={t.src}
            alt=""
            draggable={false}
            onError={e => {
              const el = e.currentTarget;
              const next = `https://tile.openstreetmap.org/${t.z}/${t.x}/${t.y}.png`;
              if (el.src !== next) el.src = next;
            }}
            style={{
              position: 'absolute',
              left: t.left,
              top: t.top,
              width: TILE,
              height: TILE,
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          />
        ))}

        {liveUsers.map(u => {
          const p = pointFor(u.lat as number, u.lng as number);
          const active = selected?.id === u.id;
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => pickUser(u)}
              style={{
                position: 'absolute',
                left: p.left,
                top: p.top,
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                zIndex: active ? 3 : 2,
              }}
            >
              <span style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                overflow: 'hidden',
                background: '#123',
                border: active ? '3px solid #22c55e' : '2px solid rgba(34,197,94,0.7)',
                boxShadow: active ? '0 0 0 3px rgba(34,197,94,0.28)' : 'none',
                position: 'relative',
              }}>
                {u.avatarUrl ? (
                  <img src={u.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ color: '#22c55e', fontWeight: 800, fontSize: 12 }}>{(u.name || '?')[0]}</span>
                )}
                <span style={{
                  position: 'absolute',
                  right: 1,
                  bottom: 1,
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: '#22c55e',
                  border: '2px solid #061012',
                }} />
              </span>
              <span style={{
                fontSize: '0.62rem',
                fontWeight: 800,
                color: '#041014',
                background: 'rgba(255,255,255,0.88)',
                borderRadius: 8,
                padding: '1px 6px',
                maxWidth: 92,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                @{String(u.username || u.name).replace(/^@/, '')}
              </span>
            </button>
          );
        })}

        {selected ? (
          <div style={{
            position: 'absolute',
            left: 12,
            right: 70,
            top: 12,
            background: 'rgba(6,16,18,0.92)',
            border: `1px solid ${liveOf(selected) ? 'rgba(34,197,94,0.4)' : 'rgba(156,163,175,0.4)'}`,
            borderRadius: 12,
            padding: '8px 10px',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            zIndex: 3,
          }}>
            <span style={{
              width: 34, height: 34, borderRadius: '50%', overflow: 'hidden',
              background: '#123', position: 'relative', flexShrink: 0,
            }}>
              {selected.avatarUrl ? <img src={selected.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
              <span style={{
                position: 'absolute', right: 0, bottom: 0, width: 9, height: 9, borderRadius: '50%',
                background: liveOf(selected) ? '#22c55e' : '#9ca3af',
                border: '2px solid #061012',
              }} />
            </span>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 800, fontSize: '0.82rem' }}>{selected.name}</p>
              <p style={{ margin: 0, color: 'rgba(150,200,200,0.6)', fontSize: '0.68rem' }}>
                @{String(selected.username || selected.name).replace(/^@/, '')}
                {liveOf(selected) && selected.lat != null ? ` · ${selected.lat.toFixed(3)}, ${selected.lng?.toFixed(3)}` : ' · Unavailable'}
              </p>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={dropSecretPin}
          aria-label="Drop secret pin"
          style={{
            position: 'absolute',
            right: 14,
            bottom: 86,
            width: 48,
            height: 48,
            borderRadius: '50%',
            border: '1.5px solid rgba(0,188,212,0.45)',
            background: 'rgba(6,16,18,0.92)',
            color: '#00BCD4',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
            zIndex: 4,
          }}
        >
          <MapPin size={20} />
        </button>

        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute',
              left: 14,
              bottom: 22,
              width: 48,
              height: 48,
              borderRadius: 14,
              border: '1px solid rgba(0,188,212,0.3)',
              background: 'rgba(6,18,20,0.95)',
              color: '#00BCD4',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              zIndex: 4,
            }}
          >
            <X size={20} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
