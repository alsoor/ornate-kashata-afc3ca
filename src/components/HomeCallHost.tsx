'use client';
/**
 * HomeCallHost — مكالمة مستقلة عن RootLayout.
 * ضعه في src/components/HomeCallHost.tsx
 * وفي RootLayout أضف فقط:
 *   import HomeCallHost from '@/components/HomeCallHost';
 *   <HomeCallHost user={user} />
 * واحذف أو عطّل بلوك المكالمة القديم حتى لا يعمل نسختان.
 *
 * بدء مكالمة من أي ملف:
 *   window.dispatchEvent(new CustomEvent('stooorna:direct-call', { detail: { friendId, video: false, name, avatarUrl } }));
 */
import { useEffect, useRef, useState } from 'react';

const NO_ANSWER_MS = 45000;
const APP_ID = '149ef04e839c4132a08efb49d717c436';

type Peer = { id: string; name?: string | null; avatarUrl?: string | null };
type Phase = 'idle' | 'outgoing' | 'incoming' | 'live';

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
function channelFor(a: string, b: string) {
  return `private_${hash([a, b].sort().join('_'))}`;
}
function wsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/call-signal`;
}

export default function HomeCallHost({ user }: { user: { id: string; name?: string | null; username?: string | null; avatarUrl?: string | null; image?: string | null } | null }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [peer, setPeer] = useState<Peer | null>(null);
  const [channel, setChannel] = useState<string | null>(null);
  const [video, setVideo] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const phaseRef = useRef<Phase>('idle');
  const channelRef = useRef<string | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const clientRef = useRef<any>(null);
  const micRef = useRef<any>(null);
  const camRef = useRef<any>(null);
  const ringTimer = useRef<number | null>(null);
  const noAnswerTimer = useRef<number | null>(null);
  const sessionRef = useRef(0);
  const endedAt = useRef<Map<string, number>>(new Map());
  const remoteBox = useRef<HTMLDivElement | null>(null);
  const localBox = useRef<HTMLDivElement | null>(null);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { channelRef.current = channel; }, [channel]);
  useEffect(() => { peerRef.current = peer; }, [peer]);

  function stopRing() {
    if (ringTimer.current) { window.clearInterval(ringTimer.current); ringTimer.current = null; }
    try { navigator.vibrate?.(0); } catch { /* */ }
    const ctx = (window as any).__stooornaRingCtx as AudioContext | undefined;
    if (ctx && ctx.state !== 'closed') { void ctx.close().catch(() => {}); (window as any).__stooornaRingCtx = null; }
  }
  function playRing() {
    if (phaseRef.current === 'live' || phaseRef.current === 'idle') return;
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      let ctx = (window as any).__stooornaRingCtx as AudioContext | undefined;
      if (!ctx || ctx.state === 'closed') ctx = new AC();
      (window as any).__stooornaRingCtx = ctx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = phaseRef.current === 'incoming' ? 440 : 480;
      g.gain.value = 0.05;
      o.connect(g); g.connect(ctx.destination);
      o.start();
      window.setTimeout(() => { try { o.stop(); } catch { /* */ } }, 700);
      navigator.vibrate?.([200, 120, 200]);
    } catch { /* */ }
  }
  function startRing() {
    stopRing();
    playRing();
    ringTimer.current = window.setInterval(playRing, 2600);
  }
  function send(msg: Record<string, unknown>) {
    const payload = JSON.stringify(msg);
    const trySend = () => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) { try { ws.send(payload); return true; } catch { /* */ } }
      return false;
    };
    if (trySend()) return;
    let n = 0;
    const t = window.setInterval(() => { n += 1; if (trySend() || n >= 20) window.clearInterval(t); }, 500);
  }
  async function clearInvite(userId: string, ch: string) {
    const body = JSON.stringify({ userId, toUserId: userId, channel: ch, clear: true, ended: true });
    for (let i = 0; i < 3; i++) {
      void fetch('/api/call/invite/clear', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
      void fetch('/api/call/invite', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }
  }
  async function leaveAgora() {
    try { micRef.current?.stop?.(); micRef.current?.close?.(); } catch { /* */ }
    try { camRef.current?.stop?.(); camRef.current?.close?.(); } catch { /* */ }
    try { await clientRef.current?.leave?.(); } catch { /* */ }
    micRef.current = null;
    camRef.current = null;
    clientRef.current = null;
    document.querySelectorAll('audio[data-stooorna-call-audio="1"]').forEach(el => el.remove());
  }
  async function hangup(remote = false) {
    const ch = channelRef.current;
    const other = peerRef.current;
    const me = user?.id;
    sessionRef.current += 1;
    if (noAnswerTimer.current) { window.clearTimeout(noAnswerTimer.current); noAnswerTimer.current = null; }
    stopRing();
    if (ch) endedAt.current.set(ch, Date.now());
    if (!remote && ch && other?.id && me) {
      send({ type: 'hangup', to: other.id, from: me, channel: ch, at: Date.now() });
      void clearInvite(other.id, ch);
      window.setTimeout(() => send({ type: 'hangup', to: other.id, from: me, channel: ch, at: Date.now() }), 800);
    }
    if (ch && me) {
      void fetch('/api/room/leave', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId: ch, userId: me, endRoom: !remote }) }).catch(() => {});
    }
    await leaveAgora();
    setPhase('idle');
    setPeer(null);
    setChannel(null);
    setSeconds(0);
    setVideo(false);
  }
  async function joinAgora(ch: string, withVideo: boolean) {
    if (!user?.id) return;
    const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
    await leaveAgora();
    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' } as any);
    clientRef.current = client;
    client.on('user-published', async (remoteUser: any, mediaType: string) => {
      await client.subscribe(remoteUser, mediaType);
      if (mediaType === 'audio') {
        const el = document.createElement('audio');
        el.autoplay = true;
        el.setAttribute('playsinline', 'true');
        el.dataset.stooornaCallAudio = '1';
        document.body.appendChild(el);
        try { remoteUser.audioTrack?.play(el); } catch { remoteUser.audioTrack?.play(); }
      }
      if (mediaType === 'video') remoteUser.videoTrack?.play(remoteBox.current || undefined);
      if (phaseRef.current !== 'live') {
        setPhase('live');
        stopRing();
        if (noAnswerTimer.current) { window.clearTimeout(noAnswerTimer.current); noAnswerTimer.current = null; }
      }
    });
    client.on('user-left', () => { void hangup(true); });
    const tokenRes = await fetch(`/api/call/token?channel=${encodeURIComponent(ch)}&uid=${encodeURIComponent(user.id)}`, { credentials: 'include' });
    const tokenData = await tokenRes.json().catch(() => ({}));
    const mic = await AgoraRTC.createMicrophoneAudioTrack({ encoderConfig: 'speech_standard', AEC: true, ANS: true } as any);
    micRef.current = mic;
    let cam: any = null;
    if (withVideo) {
      cam = await AgoraRTC.createCameraVideoTrack();
      camRef.current = cam;
      cam.play(localBox.current || undefined);
    }
    await client.join(tokenData.appId || APP_ID, ch, tokenData.token || null, tokenData.uid || user.id);
    await client.publish(cam ? [mic, cam] : [mic]);
  }
  function armNoAnswer(session: number) {
    if (noAnswerTimer.current) window.clearTimeout(noAnswerTimer.current);
    noAnswerTimer.current = window.setTimeout(() => {
      if (sessionRef.current !== session) return;
      if (phaseRef.current === 'live') return;
      void hangup(false);
    }, NO_ANSWER_MS);
  }
  async function startCall(p: Peer, asVideo = false) {
    if (!user?.id || !p.id || p.id === user.id) return;
    if (phaseRef.current !== 'idle') await hangup(false);
    const ch = channelFor(user.id, p.id);
    const session = ++sessionRef.current;
    endedAt.current.delete(ch);
    setPeer(p);
    setChannel(ch);
    setVideo(asVideo);
    setPhase('outgoing');
    setSeconds(0);
    const at = Date.now();
    const body = { toUserId: p.id, userId: p.id, channel: ch, hostId: user.id, fromId: user.id, hostName: user.name || user.username, hostAvatar: user.avatarUrl || user.image, at, video: asVideo, kind: asVideo ? 'video' : 'voice' };
    void fetch('/api/call/invite', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
    send({ type: 'call', to: p.id, from: user.id, fromName: user.name || user.username, fromAvatar: user.avatarUrl || user.image, channel: ch, at, callType: asVideo ? 'video' : 'voice' });
    startRing();
    armNoAnswer(session);
    void joinAgora(ch, asVideo);
  }
  async function answer() {
    const ch = channelRef.current;
    const p = peerRef.current;
    if (!ch || !p || !user?.id) return;
    stopRing();
    if (noAnswerTimer.current) { window.clearTimeout(noAnswerTimer.current); noAnswerTimer.current = null; }
    setPhase('live');
    send({ type: 'answered', to: p.id, from: user.id, channel: ch, at: Date.now() });
    void clearInvite(user.id, ch);
    await joinAgora(ch, video);
  }

  useEffect(() => {
    (window as any).__HOME_CALL_EXTERNAL = true;
    if (!user?.id) return;
    let closed = false;
    let retry = 0;
    const connect = () => {
      if (closed) return;
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;
      ws.onopen = () => { try { ws.send(JSON.stringify({ type: 'register', userId: user.id })); } catch { /* */ } };
      ws.onmessage = (ev) => {
        let msg: any;
        try { msg = JSON.parse(String(ev.data || '')); } catch { return; }
        const type = String(msg.type || '');
        const ch = String(msg.channel || '');
        if (type === 'hangup' || type === 'call-end' || type === 'ended') {
          if (!ch || ch === channelRef.current) void hangup(true);
          return;
        }
        if (type === 'answered' || type === 'call-answered') {
          if (ch && ch === channelRef.current && phaseRef.current === 'outgoing') {
            setPhase('live');
            stopRing();
            if (noAnswerTimer.current) { window.clearTimeout(noAnswerTimer.current); noAnswerTimer.current = null; }
          }
          return;
        }
        if (type !== 'call' && type !== 'incoming-call' && type !== 'home-call') return;
        if (String(msg.to || '') && String(msg.to) !== user.id) return;
        const ended = endedAt.current.get(ch) || 0;
        const at = Number(msg.at || 0);
        if (ended && (!at || at <= ended + 800)) return;
        if (phaseRef.current !== 'idle') return;
        const session = ++sessionRef.current;
        setPeer({ id: String(msg.from || msg.hostId || ''), name: msg.fromName || msg.hostName || null, avatarUrl: msg.fromAvatar || msg.hostAvatar || null });
        setChannel(ch);
        setVideo(msg.callType === 'video' || msg.video === true);
        setPhase('incoming');
        startRing();
        armNoAnswer(session);
      };
      ws.onclose = () => { if (!closed) retry = window.setTimeout(connect, 2000); };
    };
    connect();
    const onDirect = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      const id = String(d.friendId || d.id || d.userId || '');
      if (!id) return;
      void startCall({ id, name: d.name || d.username || null, avatarUrl: d.avatarUrl || null }, !!d.video);
    };
    window.addEventListener('stooorna:direct-call', onDirect as EventListener);
    window.addEventListener('stooorna:home-group-call', onDirect as EventListener);
    return () => {
      closed = true;
      if (retry) window.clearTimeout(retry);
      window.removeEventListener('stooorna:direct-call', onDirect as EventListener);
      window.removeEventListener('stooorna:home-group-call', onDirect as EventListener);
      try { wsRef.current?.close(); } catch { /* */ }
    };
  }, [user?.id]);

  useEffect(() => {
    if (phase !== 'live') return;
    const t = window.setInterval(() => setSeconds(s => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [phase]);

  if (!user?.id || phase === 'idle') return null;
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return (
    <div style={{ position: 'fixed', left: 12, right: 12, top: 12, zIndex: 80, borderRadius: 18, background: '#111', color: '#fff', padding: 14, boxShadow: '0 10px 30px rgba(0,0,0,.35)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700 }}>{peer?.name || 'مكالمة'}</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>{phase === 'live' ? `${mm}:${ss}` : phase === 'incoming' ? 'مكالمة واردة' : 'جاري الاتصال'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {phase === 'incoming' && <button onClick={() => void answer()} style={{ background: '#16a34a', color: '#fff', border: 0, borderRadius: 12, padding: '8px 12px' }}>رد</button>}
          <button onClick={() => void hangup(false)} style={{ background: '#dc2626', color: '#fff', border: 0, borderRadius: 12, padding: '8px 12px' }}>إنهاء</button>
        </div>
      </div>
      {video && <div ref={remoteBox} style={{ marginTop: 10, height: 180, background: '#000', borderRadius: 12, overflow: 'hidden' }} />}
      {video && <div ref={localBox} style={{ marginTop: 8, height: 90, background: '#222', borderRadius: 12, overflow: 'hidden' }} />}
    </div>
  );
}
