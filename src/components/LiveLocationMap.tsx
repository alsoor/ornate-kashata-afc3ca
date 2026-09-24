/**
 * Live Location map (settings screen).
 * Cartoon globe style with clear linework. Shows opted-in users.
 * Pin tap shares current position privately. Fast local search.
 * English-only. Mount from Settings where the Live Location toggle lives.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MapPin, Search, X } from 'lucide-react';

export type LiveLocUser = {
  id: string;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  lat: number;
  lng: number;
};

const KEY = 'stooorna_live_location_optin';
const POS_KEY = 'stooorna_live_location_pos';
const USERS_KEY = 'stooorna_live_location_users';

function project(lat: number, lng: number, w: number, h: number) {
  const x = ((lng + 180) / 360) * w;
  const y = ((90 - lat) / 180) * h;
  return { x, y };
}

export default function LiveLocationMap({
  currentUserId,
  currentName,
}: {
  currentUserId?: string;
  currentName?: string;
}) {
  const [on, setOn] = useState(false);
  const [q, setQ] = useState('');
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [users, setUsers] = useState<LiveLocUser[]>([]);
  const [secret, setSecret] = useState(false);

  useEffect(() => {
    try {
      setOn(localStorage.getItem(KEY) === '1');
      const raw = localStorage.getItem(USERS_KEY);
      if (raw) setUsers(JSON.parse(raw));
      const pos = localStorage.getItem(POS_KEY);
      if (pos) setMe(JSON.parse(pos));
    } catch {
      /* ignore */
    }
  }, []);

  const publishMe = useCallback((lat: number, lng: number) => {
    setMe({ lat, lng });
    try {
      localStorage.setItem(POS_KEY, JSON.stringify({ lat, lng, at: Date.now() }));
    } catch {
      /* ignore */
    }
    if (!currentUserId) return;
    setUsers(prev => {
      const next = prev.filter(u => u.id !== currentUserId);
      next.push({
        id: currentUserId,
        name: currentName || 'Me',
        lat,
        lng,
      });
      try {
        localStorage.setItem(USERS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [currentUserId, currentName]);

  function toggleOptIn() {
    const next = !on;
    setOn(next);
    try {
      localStorage.setItem(KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (!next) {
      setSecret(false);
      return;
    }
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
      p => {
        setSecret(true);
        publishMe(p.coords.latitude, p.coords.longitude);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = on ? users : [];
    if (!s) return list;
    return list.filter(u =>
      u.name.toLowerCase().includes(s) || String(u.username || '').toLowerCase().includes(s),
    );
  }, [q, users, on]);

  const w = 360;
  const h = 220;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      padding: 12,
      color: 'rgba(200,230,230,0.92)',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ margin: 0, fontWeight: 800, fontSize: '0.95rem', color: '#00BCD4' }}>Live Location</p>
        <button
          type="button"
          onClick={toggleOptIn}
          style={{
            border: '1px solid rgba(0,188,212,0.35)',
            background: on ? 'rgba(0,188,212,0.2)' : 'transparent',
            color: '#00BCD4',
            borderRadius: 999,
            padding: '6px 12px',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          {on ? 'On' : 'Off'}
        </button>
      </div>

      <div style={{ position: 'relative' }}>
        <Search size={14} color="#00BCD4" style={{ position: 'absolute', left: 10, top: 11 }} />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search people..."
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '8px 10px 8px 30px',
            borderRadius: 12,
            border: '1px solid rgba(0,188,212,0.28)',
            background: 'rgba(0,20,24,0.9)',
            color: 'rgba(200,230,230,0.92)',
            outline: 'none',
          }}
        />
        {q ? (
          <button type="button" onClick={() => setQ('')} style={{ position: 'absolute', right: 8, top: 8, background: 'none', border: 'none', color: '#00BCD4', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        ) : null}
      </div>

      <div style={{
        position: 'relative',
        height: h,
        borderRadius: 16,
        overflow: 'hidden',
        border: '1px solid rgba(0,188,212,0.3)',
        background: 'radial-gradient(circle at 50% 45%, #163a40 0%, #071214 72%)',
      }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
          <ellipse cx={w / 2} cy={h / 2} rx={w * 0.42} ry={h * 0.42} fill="#0e2c32" stroke="#00BCD4" strokeWidth="1.4" />
          {[...Array(7)].map((_, i) => (
            <ellipse key={`lat-${i}`} cx={w / 2} cy={h / 2} rx={w * 0.42} ry={(h * 0.42 * (i + 1)) / 8} fill="none" stroke="rgba(0,188,212,0.28)" strokeWidth="0.7" />
          ))}
          {[...Array(8)].map((_, i) => {
            const a = (i / 8) * Math.PI;
            const rx = w * 0.42 * Math.cos(a);
            return (
              <ellipse key={`lng-${i}`} cx={w / 2} cy={h / 2} rx={Math.max(8, Math.abs(rx))} ry={h * 0.42} fill="none" stroke="rgba(0,188,212,0.22)" strokeWidth="0.7" />
            );
          })}
          {on && filtered.map(u => {
            const p = project(u.lat, u.lng, w, h);
            return (
              <g key={u.id}>
                <circle cx={p.x} cy={p.y} r={5} fill="#00BCD4" stroke="#041014" strokeWidth="1" />
              </g>
            );
          })}
          {secret && me ? (() => {
            const p = project(me.lat, me.lng, w, h);
            return <circle cx={p.x} cy={p.y} r={7} fill="#eab308" stroke="#041014" strokeWidth="1.4" />;
          })() : null}
        </svg>
        <button
          type="button"
          onClick={dropSecretPin}
          aria-label="Drop secret pin"
          style={{
            position: 'absolute',
            right: 10,
            bottom: 10,
            width: 44,
            height: 44,
            borderRadius: '50%',
            border: '1.5px solid rgba(0,188,212,0.45)',
            background: 'rgba(6,16,18,0.92)',
            color: '#00BCD4',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <MapPin size={18} />
        </button>
      </div>

      <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.slice(0, 40).map(u => (
          <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
            <span style={{ fontWeight: 700 }}>{u.name}</span>
            <span style={{ color: 'rgba(150,200,200,0.55)' }}>{u.lat.toFixed(2)}, {u.lng.toFixed(2)}</span>
          </div>
        ))}
        {on && filtered.length === 0 ? (
          <p style={{ margin: 0, color: 'rgba(150,200,200,0.5)', fontSize: '0.78rem' }}>No people on the map yet</p>
        ) : null}
      </div>
    </div>
  );
}
