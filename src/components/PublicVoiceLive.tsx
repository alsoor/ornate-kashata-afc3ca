import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, X } from 'lucide-react';

const ROOM = 'stooorna-public-voice';
const TALK_MS = 30_000;
const COOLDOWN_MS = 3_000;

type Peer = {
  id: string;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  talking?: boolean;
};

export default function PublicVoiceLive({
  userId,
  userName,
  userUsername,
  userAvatar,
  onClose,
}: {
  userId?: string;
  userName?: string;
  userUsername?: string | null;
  userAvatar?: string | null;
  onClose?: () => void;
}) {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [talking, setTalking] = useState(false);
  const [leftMs, setLeftMs] = useState(0);
  const [coolMs, setCoolMs] = useState(0);
  const [mutedIds, setMutedIds] = useState<Set<string>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<number | null>(null);

  const me: Peer = {
    id: String(userId || 'me'),
    name: userName || 'Me',
    username: userUsername || null,
    avatarUrl: userAvatar || null,
    talking,
  };

  const stopMic = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setTalking(false);
    setLeftMs(0);
    void fetch('/api/room/floor', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: ROOM, userId, talking: false }),
    }).catch(() => {});
  }, [userId]);

  const startMic = useCallback(async () => {
    if (coolMs > 0 || talking || !userId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setTalking(true);
      setLeftMs(TALK_MS);
      await fetch('/api/room/join', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: ROOM,
          userId,
          name: userName,
          username: userUsername,
          avatarUrl: userAvatar,
        }),
      }).catch(() => {});
      await fetch('/api/room/floor', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: ROOM, userId, talking: true }),
      }).catch(() => {});
    } catch {
      setTalking(false);
    }
  }, [coolMs, talking, userId, userName, userUsername, userAvatar]);

  useEffect(() => {
    if (!talking) return;
    const t0 = Date.now();
    tickRef.current = window.setInterval(() => {
      const left = TALK_MS - (Date.now() - t0);
      if (left <= 0) {
        stopMic();
        setCoolMs(COOLDOWN_MS);
      } else {
        setLeftMs(left);
      }
    }, 200);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [talking, stopMic]);

  useEffect(() => {
    if (coolMs <= 0) return;
    const t0 = Date.now();
    const start = coolMs;
    const id = window.setInterval(() => {
      const left = start - (Date.now() - t0);
      setCoolMs(Math.max(0, left));
    }, 200);
    return () => window.clearInterval(id);
  }, [coolMs > 0]);

  useEffect(() => {
    let stop = false;
    const pull = async () => {
      try {
        const r = await fetch(`/api/room?id=${encodeURIComponent(ROOM)}`, { credentials: 'include' });
        if (!r.ok) return;
        const d = await r.json();
        const members = (d.members || d.users || []) as any[];
        if (stop) return;
        setPeers(
          members
            .map(m => ({
              id: String(m.id || m.userId || ''),
              name: String(m.name || m.username || 'User'),
              username: m.username ?? null,
              avatarUrl: m.avatarUrl ?? m.image ?? null,
              talking: !!(m.talking || m.floor),
            }))
            .filter(p => p.id),
        );
      } catch {
        /* optional */
      }
    };
    if (userId) {
      void fetch('/api/room/join', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: ROOM,
          userId,
          name: userName,
          username: userUsername,
          avatarUrl: userAvatar,
        }),
      }).catch(() => {});
    }
    void pull();
    const id = window.setInterval(pull, 2500);
    return () => {
      stop = true;
      window.clearInterval(id);
      stopMic();
      if (userId) {
        void fetch('/api/room/leave', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: ROOM, userId }),
        }).catch(() => {});
      }
    };
  }, [userId, userName, userUsername, userAvatar, stopMic]);

  function toggleMute(id: string) {
    setMutedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const list = [me, ...peers.filter(p => p.id !== me.id)];
  const secs = Math.ceil(leftMs / 1000);
  const cool = Math.ceil(coolMs / 1000);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 14000,
        background: 'radial-gradient(ellipse 70% 50% at 50% 0%, #132226 0%, #070f10 55%)',
        display: 'flex',
        flexDirection: 'column',
        color: '#d7eeee',
      }}
    >
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            border: '1px solid rgba(0,188,212,0.3)',
            background: 'rgba(0,20,24,0.8)',
            color: '#00BCD4',
            cursor: 'pointer',
          }}
        >
          <X size={16} />
        </button>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 800, color: '#00BCD4' }}>Public Voice</p>
          <p style={{ margin: 0, fontSize: 11, opacity: 0.7 }}>{list.length} here</p>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 10,
          overflowX: 'auto',
          padding: '8px 14px 16px',
        }}
      >
        {list.map(p => {
          const muted = mutedIds.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => p.id !== me.id && toggleMute(p.id)}
              style={{
                width: 86,
                flexShrink: 0,
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                cursor: p.id === me.id ? 'default' : 'pointer',
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  margin: '0 auto',
                  borderRadius: '50%',
                  overflow: 'hidden',
                  border: p.talking ? '3px solid #22c55e' : '2px solid rgba(0,188,212,0.35)',
                  opacity: muted ? 0.45 : 1,
                  background: '#102226',
                }}
              >
                {p.avatarUrl ? (
                  <img src={p.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00BCD4', fontWeight: 800 }}>
                    {(p.name || '?')[0]}
                  </div>
                )}
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 11, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.username ? `@${String(p.username).replace(/^@/, '')}` : p.name}
              </p>
              <p style={{ margin: 0, fontSize: 10, color: muted ? '#9ca3af' : p.talking ? '#22c55e' : 'transparent' }}>
                {muted ? 'Muted' : p.talking ? 'Talking' : '.'}
              </p>
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ padding: '18px 18px max(24px, env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={() => (talking ? stopMic() : startMic())}
          disabled={coolMs > 0}
          style={{
            width: 74,
            height: 74,
            borderRadius: '50%',
            border: talking ? '3px solid #ef4444' : '3px solid rgba(0,188,212,0.4)',
            background: talking ? 'rgba(239,68,68,0.2)' : 'rgba(0,188,212,0.12)',
            color: talking ? '#ef4444' : coolMs > 0 ? '#6b7280' : '#00BCD4',
            cursor: coolMs > 0 ? 'default' : 'pointer',
          }}
        >
          {talking ? <MicOff size={28} /> : <Mic size={28} />}
        </button>
        <p style={{ margin: 0, fontSize: 12, color: talking ? '#ef4444' : '#9ca3af' }}>
          {talking ? `${secs}s` : coolMs > 0 ? `Wait ${cool}s` : 'Hold floor 30s'}
        </p>
      </div>
    </div>
  );
}
