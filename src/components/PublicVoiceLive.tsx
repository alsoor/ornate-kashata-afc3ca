import { useCallback, useEffect, useRef, useState } from 'react';
import { LogOut, Mic, MicOff, Users, Volume2, VolumeX } from 'lucide-react';

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

type ChatMsg = {
  id: string;
  userId: string;
  name: string;
  text: string;
  at: number;
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
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [chatText, setChatText] = useState('');
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const sinceRef = useRef(0);

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
      await fetch('/api/room/floor', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: ROOM, userId, talking: true }),
      }).catch(() => {});
    } catch {
      setTalking(false);
    }
  }, [coolMs, talking, userId]);

  useEffect(() => {
    if (!talking) return;
    const t0 = Date.now();
    const id = window.setInterval(() => {
      const left = TALK_MS - (Date.now() - t0);
      if (left <= 0) {
        stopMic();
        setCoolMs(COOLDOWN_MS);
      } else setLeftMs(left);
    }, 200);
    return () => window.clearInterval(id);
  }, [talking, stopMic]);

  useEffect(() => {
    if (coolMs <= 0) return;
    const t0 = Date.now();
    const start = coolMs;
    const id = window.setInterval(() => setCoolMs(Math.max(0, start - (Date.now() - t0))), 200);
    return () => window.clearInterval(id);
  }, [coolMs > 0]);

  useEffect(() => {
    let stop = false;
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
    const pull = async () => {
      try {
        const r = await fetch(`/api/room?id=${encodeURIComponent(ROOM)}`, { credentials: 'include' });
        if (!r.ok || stop) return;
        const d = await r.json();
        const members = (d.members || d.users || []) as any[];
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
      try {
        const r = await fetch(`/api/room/signal?roomId=${encodeURIComponent(ROOM)}&since=${sinceRef.current}`, { credentials: 'include' });
        if (!r.ok || stop) return;
        const d = await r.json();
        const items = (d.items || d.signals || []) as any[];
        for (const raw of items) {
          const msg = raw?.data || raw;
          const at = Number(raw.at || msg.at || Date.now());
          if (at > sinceRef.current) sinceRef.current = at;
          if (msg?.t !== 'chat' || !msg.text) continue;
          setChatMsgs(prev => {
            if (prev.some(x => x.id === String(msg.id))) return prev;
            return [...prev, {
              id: String(msg.id || `${msg.userId}-${at}`),
              userId: String(msg.userId || ''),
              name: String(msg.name || 'User'),
              text: String(msg.text),
              at,
            }].slice(-80);
          });
        }
      } catch {
        /* optional */
      }
    };
    void pull();
    const id = window.setInterval(pull, 2200);
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
    if (id === me.id) return;
    setMutedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function sendChat() {
    const text = chatText.trim();
    if (!text || !userId) return;
    setChatText('');
    const msg: ChatMsg = {
      id: `${userId}-${Date.now()}`,
      userId,
      name: userUsername ? `@${String(userUsername).replace(/^@/, '')}` : (userName || 'Me'),
      text,
      at: Date.now(),
    };
    setChatMsgs(prev => [...prev, msg].slice(-80));
    await fetch('/api/room/signal', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId: ROOM,
        t: 'chat',
        data: { t: 'chat', id: msg.id, userId, name: msg.name, text, at: msg.at },
      }),
    }).catch(() => {});
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
      <style>{`
        @keyframes pubVoicePulse {
          0% { transform: scale(0.55); opacity: 0.7; }
          70% { transform: scale(1); opacity: 0; }
          100% { transform: scale(1); opacity: 0; }
        }
      `}</style>

      <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 800, color: '#00BCD4', fontSize: 13 }}>Public Voice</p>
          <p style={{ margin: 0, fontSize: 10, color: 'rgba(150,200,200,0.65)' }}>Shared room</p>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(150,200,200,0.9)',
          fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 14,
          background: 'rgba(0,188,212,0.1)', border: '1px solid rgba(0,188,212,0.3)',
        }}>
          <Users size={11} />
          <span>{list.length}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: 28, height: 28, borderRadius: '50%', cursor: 'pointer',
            background: 'rgba(239,68,68,0.16)', border: '1px solid rgba(239,68,68,0.45)',
            color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <LogOut size={13} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '2px 10px 8px' }}>
        {list.map(p => {
          const muted = mutedIds.has(p.id) || speakerMuted;
          const isTalk = !!p.talking;
          const ring = isTalk ? '#22c55e' : muted && p.id !== me.id ? '#6b7280' : 'rgba(0,188,212,0.35)';
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggleMute(p.id)}
              style={{ width: 56, flexShrink: 0, background: 'none', border: 'none', color: 'inherit', padding: 0, cursor: p.id === me.id ? 'default' : 'pointer' }}
            >
              <div style={{
                width: 42, height: 42, margin: '0 auto', borderRadius: '50%', overflow: 'hidden',
                border: `2px solid ${ring}`, background: '#102226',
                opacity: muted && p.id !== me.id ? 0.5 : 1,
                boxShadow: isTalk ? '0 0 8px rgba(34,197,94,0.55)' : 'none',
              }}>
                {p.avatarUrl ? (
                  <img src={p.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00BCD4', fontWeight: 800, fontSize: 13 }}>
                    {(p.name || '?')[0]}
                  </div>
                )}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 9, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.username ? `@${String(p.username).replace(/^@/, '')}` : p.name}
              </p>
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {chatOpen && (
          <div style={{
            position: 'absolute', left: 8, right: 8, bottom: 6, maxHeight: 168,
            background: 'rgba(4,14,16,0.88)', border: '1px solid rgba(0,188,212,0.18)',
            borderRadius: 12, padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 5,
          }}>
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 36, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {chatMsgs.length === 0 && (
                <p style={{ margin: 0, color: 'rgba(150,200,200,0.4)', fontSize: 11 }}>Live chat</p>
              )}
              {chatMsgs.map(m => (
                <p key={m.id} style={{ margin: 0, fontSize: 11, lineHeight: 1.3, color: m.userId === userId ? '#00BCD4' : 'rgba(220,240,240,0.9)' }}>
                  <span style={{ fontWeight: 800, color: m.userId === userId ? '#00BCD4' : '#eab308' }}>{m.name} </span>
                  {m.text}
                </p>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <input
                value={chatText}
                onChange={e => setChatText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void sendChat(); }}
                placeholder="Message"
                style={{
                  flex: 1, height: 30, borderRadius: 16, border: '1px solid rgba(0,188,212,0.25)',
                  background: 'rgba(0,20,24,0.8)', color: '#d7eeee', padding: '0 10px', outline: 'none', fontSize: 12,
                }}
              />
              <button
                type="button"
                onClick={() => void sendChat()}
                style={{
                  height: 30, border: 'none', borderRadius: 16, padding: '0 10px', fontWeight: 800, fontSize: 11,
                  background: '#00BCD4', color: '#041414', cursor: 'pointer',
                }}
              >
                Send
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{
        padding: '6px 10px max(10px, env(safe-area-inset-bottom))',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <button
          type="button"
          onClick={() => setChatOpen(o => !o)}
          style={{
            border: '1px solid rgba(0,188,212,0.28)', background: 'rgba(6,16,18,0.85)',
            color: '#00BCD4', borderRadius: 999, padding: '4px 8px', fontSize: 10, fontWeight: 800, cursor: 'pointer',
          }}
        >
          {chatOpen ? 'Hide' : 'Chat'}
        </button>

        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => (talking ? stopMic() : startMic())}
            disabled={coolMs > 0}
            style={{
              position: 'relative',
              width: 46,
              height: 46,
              borderRadius: '50%',
              border: talking ? '2px solid #ef4444' : '1px solid rgba(0,188,212,0.35)',
              background: talking ? 'rgba(239,68,68,0.22)' : 'rgba(0,188,212,0.1)',
              color: talking ? '#ef4444' : coolMs > 0 ? '#6b7280' : '#00BCD4',
              cursor: coolMs > 0 ? 'default' : 'pointer',
              overflow: 'hidden',
            }}
          >
            {talking && (
              <>
                <span style={{ position: 'absolute', inset: 4, borderRadius: '50%', border: '2px solid rgba(239,68,68,0.55)', animation: 'pubVoicePulse 1s ease-out infinite' }} />
                <span style={{ position: 'absolute', inset: 8, borderRadius: '50%', border: '2px solid rgba(239,68,68,0.4)', animation: 'pubVoicePulse 1s ease-out infinite 0.25s' }} />
              </>
            )}
            <span style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {talking ? <Mic size={16} /> : <MicOff size={16} />}
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setSpeakerMuted(v => !v)}
          style={{
            height: 28, padding: '0 8px', borderRadius: 10,
            border: speakerMuted ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(0,188,212,0.28)',
            background: speakerMuted ? 'rgba(239,68,68,0.12)' : 'rgba(0,188,212,0.08)',
            color: speakerMuted ? '#ef4444' : '#00BCD4', cursor: 'pointer', fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          {speakerMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
          {speakerMuted ? 'Unmute' : 'Mute'}
        </button>
      </div>
      <p style={{ margin: '0 0 6px', fontSize: 10, color: 'rgba(150,200,200,0.45)', textAlign: 'center' }}>
        {talking ? `${secs}s` : coolMs > 0 ? `Wait ${cool}s` : '30s turns'}
      </p>
    </div>
  );
}
