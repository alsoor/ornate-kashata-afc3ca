'use client';
/**
 * CallHost.tsx — يركّب الملفات الثلاثة فقط.
 * src/call/CallHost.tsx
 * في RootLayout:
 *   import CallHost from '@/call/CallHost';
 *   <CallHost user={user} />
 * لا تضع منطق اتصال داخل RootLayout بعد ذلك.
 */
import { useEffect, useRef, useState } from 'react';
import { answerIncoming, attachIncoming } from './incomingCall';
import { inviteThird, publishCall, startOutgoing } from './outgoingCall';
import { callSession, endCall, leaveAsGuest, rememberRejoin, stopRing, type CallPeer } from './endCall';

export default function CallHost({ user }: { user: { id: string; name?: string | null; username?: string | null; avatarUrl?: string | null; image?: string | null } | null }) {
  const [phase, setPhase] = useState<'idle' | 'outgoing' | 'incoming' | 'live'>('idle');
  const [peers, setPeers] = useState<CallPeer[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [rejoin, setRejoin] = useState<{ channel: string; hostId: string; name?: string | null; avatarUrl?: string | null } | null>(null);
  const client = useRef<any>(null);
  const mic = useRef<any>(null);
  const cam = useRef<any>(null);
  const ring = useRef<number | null>(null);
  const noAnswer = useRef<number | null>(null);
  const me = user ? { id: user.id, name: user.name || user.username || 'You', avatarUrl: user.avatarUrl || user.image || null } : null;

  function sync() {
    const s = callSession.current;
    setPhase(s?.phase || 'idle');
    setPeers(s ? [...s.peers] : []);
  }
  async function hangup() {
    if (!me) return;
    if (ring.current) window.clearInterval(ring.current);
    if (noAnswer.current) window.clearTimeout(noAnswer.current);
    const guest = callSession.current && callSession.current.hostId !== me.id && callSession.current.peers.length > 2;
    if (guest) leaveAsGuest(me.id, client, mic, cam);
    else {
      const done = endCall(me.id, { client, mic, cam });
      sync(); // أغلق الواجهة فوراً، ثم انتظر تنظيف Agora
      await done;
    }
    sync();
  }

  useEffect(() => {
    if (!me) return;
    try {
      const saved = localStorage.getItem('stooorna_rejoin_call');
      if (saved) setRejoin(JSON.parse(saved));
    } catch { /* */ }
    return attachIncoming(me.id, (type, msg) => {
      if (type === 'hangup' || type === 'call-end' || type === 'ended') {
        const ch = String(msg.channel || '');
        if (callSession.current && ch && ch !== callSession.current.channel) return;
        stopRing();
        if (!callSession.current) { sync(); return; }
        if (callSession.current.phase === 'live' && String(msg.from || '') && callSession.current.peers.length > 2 && String(msg.from) !== callSession.current.hostId) {
          callSession.current.peers = callSession.current.peers.filter(p => p.id !== String(msg.from));
          sync();
          return;
        }
        if (ring.current) { window.clearInterval(ring.current); ring.current = null; }
        if (noAnswer.current) { window.clearTimeout(noAnswer.current); noAnswer.current = null; }
        const endedId = callSession.current.id;
        const done = endCall(me.id, { remote: true, client, mic, cam, sessionId: endedId, at: Number(msg.at) || undefined });
        sync(); // الجلسة أُغلقت فوراً: يختفي الرنين والواجهة بدون انتظار
        void done.then(sync);
        return;
      }
      if (type === 'member-left') {
        const id = String(msg.from || msg.userId || '');
        if (callSession.current) callSession.current.peers = callSession.current.peers.filter(p => p.id !== id);
        sync();
        return;
      }
      if (type === 'member-invited' && callSession.current) {
        const incoming = Array.isArray(msg.members) ? msg.members : [];
        for (const p of incoming) if (p?.id && !callSession.current.peers.some(x => x.id === p.id)) callSession.current.peers.push(p);
        sync();
        return;
      }
      if (type === 'answered' || type === 'call-answered' || type === 'member-joined') {
        if (callSession.current) {
          callSession.current.phase = 'live';
          callSession.current.peers = callSession.current.peers.map(p => p.id === String(msg.from || '') ? { ...p, joined: true } : p);
        }
        stopRing();
        if (ring.current) { window.clearInterval(ring.current); ring.current = null; }
        if (noAnswer.current) { window.clearTimeout(noAnswer.current); noAnswer.current = null; }
        sync();
      }
      if (type === 'call' || type === 'incoming-call' || type === 'home-call') sync();
    });
  }, [user?.id]);

  useEffect(() => {
    const onStart = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (!me || !d.friendId) return;
      if (ring.current) window.clearInterval(ring.current);
      if (noAnswer.current) window.clearTimeout(noAnswer.current);
      const previous = callSession.current;
      if (previous && previous.phase !== 'idle') {
        if (ring.current) window.clearInterval(ring.current);
        if (noAnswer.current) window.clearTimeout(noAnswer.current);
      }
      const started = startOutgoing(me, [{ id: String(d.friendId), name: d.name || null, avatarUrl: d.avatarUrl || null }], !!d.video, () => {
        if (callSession.current?.id === started.id && callSession.current.phase !== 'live') void hangup();
      });
      ring.current = started.ring;
      noAnswer.current = started.timer;
      void publishCall(me.id, started.channel, !!d.video, client, mic, cam, () => {
        if (callSession.current) callSession.current.phase = 'live';
        stopRing();
        sync();
      }, started.id);
      sync();
    };
    const onAdd = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (!me || !d.friendId || !callSession.current) return;
      inviteThird(me, { id: String(d.friendId), name: d.name || null, avatarUrl: d.avatarUrl || null });
      sync();
    };
    window.addEventListener('stooorna:direct-call', onStart as EventListener);
    window.addEventListener('stooorna:add-call-peer', onAdd as EventListener);
    return () => {
      window.removeEventListener('stooorna:direct-call', onStart as EventListener);
      window.removeEventListener('stooorna:add-call-peer', onAdd as EventListener);
    };
  }, [user?.id]);

  useEffect(() => {
    if (phase !== 'live') return;
    const t = window.setInterval(() => setSeconds(s => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [phase]);

  if (!me) return null;
  return (
    <>
      {rejoin && phase === 'idle' && (
        <button
          onClick={() => { setRejoin(null); try { localStorage.removeItem('stooorna_rejoin_call'); } catch { /* */ } window.dispatchEvent(new CustomEvent('stooorna:direct-call', { detail: { friendId: rejoin.hostId, name: rejoin.name, avatarUrl: rejoin.avatarUrl } })); }}
          style={{ position: 'fixed', right: 16, bottom: 92, zIndex: 90, border: 0, borderRadius: 999, background: '#00BCD4', color: '#042026', fontWeight: 800, padding: '10px 14px' }}
        >
          {rejoin.avatarUrl ? <img src={rejoin.avatarUrl} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', verticalAlign: 'middle', marginInlineEnd: 6 }} /> : null}
          Join
        </button>
      )}
      {phase !== 'idle' && (
        <div style={{ position: 'fixed', left: 12, right: 12, top: 12, zIndex: 80, borderRadius: 18, background: '#111', color: '#fff', padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div>
              {peers.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  {p.avatarUrl ? <img src={p.avatarUrl} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} /> : <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#0e7490', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{(p.name || '?')[0]}</span>}
                  <span>{p.name || p.id}{p.joined ? '' : ' · يرن'}</span>
                </div>
              ))}
              <div style={{ fontSize: 12, opacity: 0.75 }}>{phase === 'live' ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : phase === 'incoming' ? 'مكالمة واردة' : 'جاري الاتصال'}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {phase === 'incoming' && <button onClick={() => { answerIncoming(me); if (callSession.current) callSession.current.phase = 'live'; stopRing(); setPhase('live'); void publishCall(me.id, callSession.current!.channel, !!callSession.current?.video, client, mic, cam, () => { if (callSession.current) callSession.current.phase = 'live'; sync(); }, callSession.current!.id); sync(); }} style={{ background: '#16a34a', color: '#fff', border: 0, borderRadius: 12, padding: '8px 12px' }}>رد</button>}
              <button onClick={() => void hangup()} style={{ background: '#dc2626', color: '#fff', border: 0, borderRadius: 12, padding: '8px 12px' }}>إنهاء</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
