/**
 * Live Location map (settings pin).
 * Full-screen cartoon globe, pan + pinch zoom.
 * Search any user: gray = offline location, green = live on map.
 * English-only.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Search, X } from 'lucide-react';

export type LiveLocUser = {
  id: string;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  lat?: number | null;
  lng?: number | null;
  live?: boolean;
};

const KEY = 'stooorna_live_location_optin';
const POS_KEY = 'stooorna_live_location_pos';
const USERS_KEY = 'stooorna_live_location_users';

function project(lat: number, lng: number, w: number, h: number) {
  const x = ((lng + 180) / 360) * w;
  const y = ((90 - lat) / 180) * h;
  return { x, y };
}

function liveOf(u: LiveLocUser) {
  return !!(u.live && u.lat != null && u.lng != null && Number.isFinite(u.lat) && Number.isFinite(u.lng));
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
  const [scale, setScale] = useState(1.15);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const mergeLive = useCallback((list: LiveLocUser[]) => {
    let liveRows: LiveLocUser[] = [];
    try {
      liveRows = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    } catch {
      liveRows = [];
    }
    const map = new Map<string, LiveLocUser>();
    for (const u of list) map.set(String(u.id), { ...u, live: false });
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
      setOn(localStorage.getItem(KEY) === '1');
      const pos = localStorage.getItem(POS_KEY);
      if (pos) setMe(JSON.parse(pos));
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
        /* optional endpoint */
      }
    }, 180);
    return () => window.clearTimeout(t);
  }, [q, mergeLive]);

  const publishMe = useCallback((lat: number, lng: number) => {
    setMe({ lat, lng });
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
    focusOn(lat, lng, 2.2);
  }, [currentUserId, currentName, currentUsername, currentAvatar]);

  function focusOn(lat: number, lng: number, nextScale = 2) {
    const el = boxRef.current;
    const w = el?.clientWidth || 360;
    const h = el?.clientHeight || 480;
    const p = project(lat, lng, w, h);
    setScale(nextScale);
    setTx(w / 2 - p.x * nextScale);
    setTy(h / 2 - p.y * nextScale);
  }

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
      if (self && u.id === self.id) {
        map.set(u.id, { ...u, ...self, live: self.live || liveOf(u) });
      } else map.set(u.id, u);
    }
    const all = [...map.values()];
    if (!s) return all.slice(0, 40);
    return all.filter(u =>
      u.name.toLowerCase().includes(s) || String(u.username || '').toLowerCase().includes(s),
    ).slice(0, 40);
  }, [q, directory, currentUserId, currentName, currentUsername, currentAvatar, me, on]);

  const liveUsers = filtered.filter(liveOf);

  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest('button,input,a')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, tx, ty };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    setTx(d.tx + (e.clientX - d.x));
    setTy(d.ty + (e.clientY - d.y));
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const a = e.touches[0];
      const b = e.touches[1];
      pinchRef.current = {
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        scale,
      };
      dragRef.current = null;
    }
  }
  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinchRef.current) {
      const a = e.touches[0];
      const b = e.touches[1];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const next = Math.min(4.5, Math.max(0.7, pinchRef.current.scale * (dist / pinchRef.current.dist)));
      setScale(next);
    }
  }
  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const next = Math.min(4.5, Math.max(0.7, scale * (e.deltaY > 0 ? 0.92 : 1.08)));
    setScale(next);
  }

  function pickUser(u: LiveLocUser) {
    setSelected(u);
    if (liveOf(u) && u.lat != null && u.lng != null) focusOn(u.lat, u.lng, 2.4);
  }

  const w = 720;
  const h = 720;

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
        <p style={{ margin: 0, flex: 1, fontWeight: 800, fontSize: '0.95rem', color: '#00BCD4' }}>Live Location</p>
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
            zIndex: 5,
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
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    overflow: 'hidden',
                    background: '#123',
                    flexShrink: 0,
                    position: 'relative',
                  }}>
                    {u.avatarUrl ? <img src={u.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                    <span style={{
                      position: 'absolute',
                      right: -1,
                      bottom: -1,
                      width: 9,
                      height: 9,
                      borderRadius: '50%',
                      background: live ? '#22c55e' : '#9ca3af',
                      border: '2px solid #061012',
                    }} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 800, fontSize: '0.8rem' }}>{u.name}</span>
                    <span style={{ display: 'block', color: 'rgba(150,200,200,0.55)', fontSize: '0.68rem' }}>
                      @{String(u.username || u.name).replace(/^@/, '')} · {live ? 'Live' : 'Unavailable'}
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
          background: 'radial-gradient(circle at 50% 45%, #163a40 0%, #071214 72%)',
        }}
      >
        <div style={{
          width: '100%',
          height: '100%',
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          transformOrigin: '0 0',
          willChange: 'transform',
        }}>
          <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
            <ellipse cx={w / 2} cy={h / 2} rx={w * 0.42} ry={h * 0.42} fill="#0e2c32" stroke="#00BCD4" strokeWidth="2" />
            {[...Array(9)].map((_, i) => (
              <ellipse key={`lat-${i}`} cx={w / 2} cy={h / 2} rx={w * 0.42} ry={(h * 0.42 * (i + 1)) / 10} fill="none" stroke="rgba(0,188,212,0.32)" strokeWidth="1" />
            ))}
            {[...Array(10)].map((_, i) => {
              const a = (i / 10) * Math.PI;
              const rx = w * 0.42 * Math.cos(a);
              return (
                <ellipse key={`lng-${i}`} cx={w / 2} cy={h / 2} rx={Math.max(10, Math.abs(rx))} ry={h * 0.42} fill="none" stroke="rgba(0,188,212,0.26)" strokeWidth="1" />
              );
            })}
          </svg>
          {liveUsers.map(u => {
            const el = boxRef.current;
            const bw = el?.clientWidth || w;
            const bh = el?.clientHeight || h;
            const p = project(u.lat as number, u.lng as number, bw, bh);
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => pickUser(u)}
                style={{
                  position: 'absolute',
                  left: p.x,
                  top: p.y,
                  transform: 'translate(-50%, -50%)',
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  padding: 0,
                  border: '2px solid #22c55e',
                  overflow: 'hidden',
                  background: '#123',
                  cursor: 'pointer',
                }}
              >
                {u.avatarUrl ? <img src={u.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (
                  <span style={{ color: '#22c55e', fontWeight: 800, fontSize: 12 }}>{(u.name || '?')[0]}</span>
                )}
              </button>
            );
          })}
        </div>

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
          }}>
            <span style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              overflow: 'hidden',
              background: '#123',
              position: 'relative',
              flexShrink: 0,
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
              right: 14,
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
