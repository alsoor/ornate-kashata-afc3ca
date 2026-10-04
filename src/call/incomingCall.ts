/**
 * incomingCall.ts — استقبال الاتصال فقط.
 * src/call/incomingCall.ts
 */
import { callSession, newSessionId, sendSignal, stopRing, trackSignalSocket, type CallPeer } from './endCall';

export function wsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/call-signal`;
}

function playIncoming() {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    let ctx = (window as any).__stooornaRingCtx as AudioContext | undefined;
    if (!ctx || ctx.state === 'closed') ctx = new AC();
    (window as any).__stooornaRingCtx = ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 440;
    g.gain.value = 0.05;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    window.setTimeout(() => { try { o.stop(); } catch { /* */ } }, 700);
    navigator.vibrate?.([180, 100, 180]);
  } catch { /* */ }
}

export function isEnded(channel: string, at: number) {
  try {
    const raw = localStorage.getItem(`stooorna_call_ended_${channel}`);
    if (!raw) return false;
    const p = JSON.parse(raw);
    const endedAt = Number(p.endedAt || p.at || 0);
    if (!endedAt || Date.now() - endedAt > 180000) return false;
    if (at && at > endedAt + 800) return false;
    return true;
  } catch { return false; }
}

export function answerIncoming(me: CallPeer) {
  const session = callSession.current;
  if (!session) return;
  stopRing();
  session.phase = 'live';
  sendSignal({ type: 'answered', to: session.hostId, from: me.id, channel: session.channel, at: Date.now() });
  void fetch('/api/call/invite/clear', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: me.id, toUserId: me.id, channel: session.channel, answered: true, clear: true }),
  }).catch(() => {});
  for (const peer of session.peers) {
    if (!peer.id || peer.id === me.id) continue;
    sendSignal({ type: 'member-joined', to: peer.id, from: me.id, channel: session.channel, at: Date.now(), avatarUrl: me.avatarUrl, name: me.name });
  }
}

export function attachIncoming(meId: string, onEvent: (type: string, msg: any) => void) {
  let closed = false;
  let retry = 0;
  const connect = () => {
    if (closed) return;
    const ws = new WebSocket(wsUrl());
    trackSignalSocket(ws);
    ws.onopen = () => { try { ws.send(JSON.stringify({ type: 'register', userId: meId })); } catch { /* */ } };
    ws.onmessage = (ev) => {
      let msg: any;
      try { msg = JSON.parse(String(ev.data || '')); } catch { return; }
      const type = String(msg.type || '');
      if ((type === 'call' || type === 'incoming-call' || type === 'home-call') && (!msg.to || String(msg.to) === meId)) {
        const channel = String(msg.channel || '');
        const at = Number(msg.at || Date.now());
        if (!channel || isEnded(channel, at)) return;
        if (callSession.current?.phase === 'live') return;
        const peers: CallPeer[] = Array.isArray(msg.members) ? msg.members : [];
        callSession.current = {
          id: newSessionId(),
          channel,
          hostId: String(msg.from || msg.hostId || ''),
          peers,
          video: msg.callType === 'video' || msg.video === true,
          phase: 'incoming',
          startedAt: at,
        };
        playIncoming();
      }
      if (type === 'answered' || type === 'call-answered') {
        if (callSession.current && String(msg.channel || '') === callSession.current.channel) {
          callSession.current.phase = 'live';
          stopRing();
          const id = String(msg.from || '');
          const peer = callSession.current.peers.find(p => p.id === id);
          if (peer) peer.joined = true;
        }
      }
      onEvent(type, msg);
    };
    ws.onclose = () => { if (!closed) retry = window.setTimeout(connect, 2000); };
  };
  connect();
  return () => { closed = true; if (retry) window.clearTimeout(retry); };
}
