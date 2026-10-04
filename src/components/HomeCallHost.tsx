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
  const videoRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const clientRef = useRef<any>(null);
  const micRef = useRef<any>(null);
  const camRef = useRef<any>(null);
  const ringTimer = useRef<number | null>(null);
  const noAnswerTimer = useRef<number | null>(null);
  const sessionRef = useRef(0);
  const endedAt = useRef<Map<string, number>>(new Map());
  const inviteInflight = useRef<Promise<unknown> | null>(null);
  const remoteBox = useRef<HTMLDivElement | null>(null);
  const localBox = useRef<HTMLDivElement | null>(null);

  // الـ refs تُحدَّث فوراً مع الـ state (وليس بعد الرسم) حتى لا تقرأ المعالجات قيمة قديمة.
  function setPhaseNow(p: Phase) { phaseRef.current = p; setPhase(p); }
  function setChannelNow(c: string | null) { channelRef.current = c; setChannel(c); }
  function setPeerNow(p: Peer | null) { peerRef.current = p; setPeer(p); }
  function setVideoNow(v: boolean) { videoRef.current = v; setVideo(v); }
  function markEnded(ch: string, at: number) {
    const prev = endedAt.current.get(ch) || 0;
    if (at > prev) endedAt.current.set(ch, at);
  }

  function stopRing() {
    if (ringTimer.current) { window.clearInterval(ringTimer.current); ringTimer.current = null; }
    try { navigator.vibrate?.(0); } catch { /* */ }
    const w = window as any;
    if (w.__stooornaIncomingVibrateTimer) { window.clearInterval(w.__stooornaIncomingVibrateTimer); w.__stooornaIncomingVibrateTimer = null; }
    const ctx = w.__stooornaRingCtx as AudioContext | undefined;
    if (ctx && ctx.state !== 'closed') { void ctx.close().catch(() => {}); w.__stooornaRingCtx = null; }
    // يُغلق أيضاً أي شريط/نغمة قديمة خارج هذا المكوّن.
    try {
      window.dispatchEvent(new CustomEvent('stooorna:stop-incoming-ring'));
      window.dispatchEvent(new CustomEvent('stooorna:incoming-call-ui', { detail: { ringing: false } }));
    } catch { /* */ }
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
    if (ringTimer.current) { window.clearInterval(ringTimer.current); ringTimer.current = null; }
    playRing();
    ringTimer.current = window.setInterval(() => {
      if (phaseRef.current === 'live' || phaseRef.current === 'idle') { stopRing(); return; }
      playRing();
    }, 2600);
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
    // إذا أنهى المتصل بسرعة، قد يصل طلب "المسح" قبل طلب "الإنشاء" فيُنشئ الخادم الدعوة بعد مسحها
    // ويبقى الرنين عند الطرف الآخر. لذلك ننتظر استقرار طلب الإنشاء أولاً.
    const pending = inviteInflight.current;
    if (pending) {
      try { await Promise.race([pending, new Promise(resolve => window.setTimeout(resolve, 3000))]); } catch { /* */ }
    }
    const body = JSON.stringify({ userId, toUserId: userId, channel: ch, clear: true, ended: true });
    for (let i = 0; i < 3; i++) {
      void fetch('/api/call/invite/clear', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
      void fetch('/api/call/invite', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }
  }
  async function leaveAgora() {
    const mic = micRef.current, cam = camRef.current, client = clientRef.current;
    micRef.current = null;
    camRef.current = null;
    clientRef.current = null;
    try { mic?.stop?.(); mic?.close?.(); } catch { /* */ }
    try { cam?.stop?.(); cam?.close?.(); } catch { /* */ }
    try { await client?.leave?.(); } catch { /* */ }
    document.querySelectorAll('audio[data-stooorna-call-audio="1"]').forEach(el => el.remove());
  }
  async function hangup(remote = false, at?: number) {
    const ch = channelRef.current;
    const other = peerRef.current;
    const me = user?.id;
    if (!ch) return; // لا توجد مكالمة: لا نلغي جلسة جديدة بالخطأ
    const stamp = remote ? (at || Date.now()) : Date.now();
    sessionRef.current += 1; // يُبطل أي انضمام Agora جارٍ
    if (noAnswerTimer.current) { window.clearTimeout(noAnswerTimer.current); noAnswerTimer.current = null; }
    stopRing();
    markEnded(ch, stamp);
    // أغلق الواجهة والحالة فوراً (قبل انتظار Agora) ليختفي الاتصال والرنين مباشرة.
    setPhaseNow('idle');
    setChannelNow(null);
    setPeerNow(null);
    setVideoNow(false);
    setSeconds(0);
    try { window.dispatchEvent(new CustomEvent('stooorna:home-call-ended', { detail: { channel: ch, at: stamp } })); } catch { /* */ }
    if (!remote && other?.id && me) {
      const blast = () => {
        send({ type: 'hangup', to: other.id, from: me, channel: ch, at: Date.now() });
        send({ type: 'ended', to: other.id, from: me, channel: ch, at: Date.now() });
        void clearInvite(other.id, ch);
      };
      blast();
      window.setTimeout(blast, 400);
      window.setTimeout(blast, 1200);
      window.setTimeout(blast, 2500);
    }
    if (me) {
      void fetch('/api/room/leave', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId: ch, userId: me, endRoom: !remote }) }).catch(() => {});
    }
    await leaveAgora();
  }
  async function joinAgora(ch: string, withVideo: boolean, session: number) {
    if (!user?.id) return;
    const alive = () => sessionRef.current === session;
    const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
    if (!alive()) return;
    await leaveAgora();
    if (!alive()) return;
    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' } as any);
    clientRef.current = client;
    let mic: any = null;
    let cam: any = null;
    // انتهت الجلسة أثناء التحضير: أغلق المايك/الكاميرا واخرج حتى لا يبقى المتصل داخل القناة.
    const abort = async () => {
      for (const t of [mic, cam]) { try { t?.stop?.(); t?.close?.(); } catch { /* */ } }
      try { await client.leave(); } catch { /* */ }
      if (clientRef.current === client) clientRef.current = null;
      if (micRef.current === mic) micRef.current = null;
      if (camRef.current === cam) camRef.current = null;
    };
    client.on('user-published', async (remoteUser: any, mediaType: string) => {
      if (!alive()) return;
      await client.subscribe(remoteUser, mediaType);
      if (!alive()) return;
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
        setPhaseNow('live');
        stopRing();
        if (noAnswerTimer.current) { window.clearTimeout(noAnswerTimer.current); noAnswerTimer.current = null; }
      }
    });
    client.on('user-left', () => { if (alive()) void hangup(true); });
    const tokenRes = await fetch(`/api/call/token?channel=${encodeURIComponent(ch)}&uid=${encodeURIComponent(user.id)}`, { credentials: 'include' });
    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!alive()) return abort();
    mic = await AgoraRTC.createMicrophoneAudioTrack({ encoderConfig: 'speech_standard', AEC: true, ANS: true } as any);
    if (!alive()) return abort();
    micRef.current = mic;
    if (withVideo) {
      cam = await AgoraRTC.createCameraVideoTrack();
      if (!alive()) return abort();
      camRef.current = cam;
      cam.play(localBox.current || undefined);
    }
    await client.join(tokenData.appId || APP_ID, ch, tokenData.token || null, tokenData.uid || user.id);
    if (!alive()) return abort();
    await client.publish(cam ? [mic, cam] : [mic]);
    if (!alive()) return abort();
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
    setPeerNow(p);
    setChannelNow(ch);
    setVideoNow(asVideo);
    setPhaseNow('outgoing');
    setSeconds(0);
    const at = Date.now();
    const body = { toUserId: p.id, userId: p.id, channel: ch, hostId: user.id, fromId: user.id, hostName: user.name || user.username, hostAvatar: user.avatarUrl || user.image, at, video: asVideo, kind: asVideo ? 'video' : 'voice' };
    inviteInflight.current = fetch('/api/call/invite', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
    send({ type: 'call', to: p.id, from: user.id, fromName: user.name || user.username, fromAvatar: user.avatarUrl || user.image, channel: ch, at, callType: asVideo ? 'video' : 'voice' });
    startRing();
    armNoAnswer(session);
    void joinAgora(ch, asVideo, session).catch(() => {});
  }
  async function answer() {
    const ch = channelRef.current;
    const p = peerRef.current;
    if (!ch || !p || !user?.id) return;
    const session = sessionRef.current;
    stopRing();
    if (noAnswerTimer.current) { window.clearTimeout(noAnswerTimer.current); noAnswerTimer.current = null; }
    setPhaseNow('live');
    send({ type: 'answered', to: p.id, from: user.id, channel: ch, at: Date.now() });
    void clearInvite(user.id, ch);
    await joinAgora(ch, videoRef.current, session);
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
        if (closed) return;
        let msg: any;
        try { msg = JSON.parse(String(ev.data || '')); } catch { return; }
        const type = String(msg.type || '');
        const ch = String(msg.channel || '');
        if (type === 'hangup' || type === 'call-end' || type === 'ended') {
          const stamp = Number(msg.at) || Date.now();
          // سجّل الإنهاء حتى لو وصل قبل رسالة "call" أو بعدها: أي رنة أقدم منه تُرفض.
          if (ch) markEnded(ch, stamp);
          if (!ch || ch === channelRef.current) void hangup(true, stamp);
          return;
        }
        if (type === 'answered' || type === 'call-answered') {
          if (ch && ch === channelRef.current && phaseRef.current === 'outgoing') {
            setPhaseNow('live');
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
        setPeerNow({ id: String(msg.from || msg.hostId || ''), name: msg.fromName || msg.hostName || null, avatarUrl: msg.fromAvatar || msg.hostAvatar || null });
        setChannelNow(ch);
        setVideoNow(msg.callType === 'video' || msg.video === true);
        setPhaseNow('incoming');
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
      if (ringTimer.current) { window.clearInterval(ringTimer.current); ringTimer.current = null; }
      if (noAnswerTimer.current) { window.clearTimeout(noAnswerTimer.current); noAnswerTimer.current = null; }
      try { wsRef.current?.close(); } catch { /* */ }
    };
  }, [user?.id]);

  // احتياط: إذا فاتتنا رسالة hangup (انقطاع الويب سوكت)، يُسقط الخادم الدعوة فنوقف الرنين.
  useEffect(() => {
    if (phase !== 'incoming' || !user?.id || !channel) return;
    const ch = channel;
    const session = sessionRef.current;
    const since = Date.now();
    const t = window.setInterval(() => {
      void fetch(`/api/call/invite?userId=${encodeURIComponent(user.id)}`, { credentials: 'include' })
        .then(r => r.json())
        .then(data => {
          if (sessionRef.current !== session || phaseRef.current !== 'incoming') return;
          const inv = data?.invite;
          const same = !!inv && String(inv.channel || '') === ch;
          const cancelled = same && (!!inv.clear || !!inv.ended);
          // غياب الدعوة وحده لا يُعتبر إلغاءً في أول ثوانٍ: قد لا يكون الخادم خزّنها بعد.
          const missing = !same && Date.now() - since > 4000;
          if (cancelled || missing) void hangup(true);
        })
        .catch(() => {});
    }, 1000);
    return () => window.clearInterval(t);
  }, [phase, channel, user?.id]);

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
