/**
 * outgoingCall.ts — إرسال الاتصال فقط.
 * src/call/outgoingCall.ts
 */
import { callSession, newSessionId, sendSignal, stopRing, type CallPeer } from './endCall';

const NO_ANSWER_MS = 45000;
export const APP_ID = '149ef04e839c4132a08efb49d717c436';

export function channelFor(a: string, b: string) {
  let h = 0;
  const s = [a, b].sort().join('_');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `private_${h.toString(36)}`;
}
export function groupChannel(ids: string[]) {
  let h = 0;
  const s = [...ids].sort().join('_');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `home_group_${h.toString(36)}`;
}

function playRingback() {
  if (callSession.current?.phase === 'live') return;
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    let ctx = (window as any).__stooornaRingCtx as AudioContext | undefined;
    if (!ctx || ctx.state === 'closed') ctx = new AC();
    (window as any).__stooornaRingCtx = ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 480;
    g.gain.value = 0.04;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    window.setTimeout(() => { try { o.stop(); } catch { /* */ } }, 600);
  } catch { /* */ }
}

export async function publishCall(meId: string, channel: string, video: boolean, client: { current: any }, mic: { current: any }, cam: { current: any }, onRemote: () => void) {
  const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
  const c = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' } as any);
  client.current = c;
  c.on('user-published', async (remote: any, mediaType: string) => {
    await c.subscribe(remote, mediaType);
    if (mediaType === 'audio') {
      const el = document.createElement('audio');
      el.autoplay = true;
      el.setAttribute('playsinline', 'true');
      el.dataset.stooornaCallAudio = '1';
      document.body.appendChild(el);
      try { remote.audioTrack?.play(el); } catch { remote.audioTrack?.play(); }
    }
    onRemote();
  });
  const tokenRes = await fetch(`/api/call/token?channel=${encodeURIComponent(channel)}&uid=${encodeURIComponent(meId)}`, { credentials: 'include' });
  const tokenData = await tokenRes.json().catch(() => ({}));
  const track = await AgoraRTC.createMicrophoneAudioTrack({ encoderConfig: 'speech_standard', AEC: true, ANS: true } as any);
  mic.current = track;
  if (video) {
    cam.current = await AgoraRTC.createCameraVideoTrack();
  }
  await c.join(tokenData.appId || APP_ID, channel, tokenData.token || null, tokenData.uid || meId);
  await c.publish(cam.current ? [track, cam.current] : [track]);
}

export function startOutgoing(me: CallPeer, peers: CallPeer[], video: boolean, onNoAnswer: () => void) {
  const ids = [me.id, ...peers.map(p => p.id)];
  const channel = peers.length === 1 ? channelFor(me.id, peers[0].id) : groupChannel(ids);
  const at = Date.now();
  const id = newSessionId();
  callSession.current = { id, channel, hostId: me.id, peers: [{ ...me, joined: true }, ...peers.map(p => ({ ...p, joined: false }))], video, phase: 'outgoing', startedAt: at };
  try { localStorage.removeItem(`stooorna_call_ended_${channel}`); } catch { /* */ }
  for (const peer of peers) {
    const body = { toUserId: peer.id, userId: peer.id, channel, hostId: me.id, fromId: me.id, hostName: me.name, hostAvatar: me.avatarUrl, members: callSession.current.peers, at, video, kind: video ? 'video' : 'voice' };
    void fetch('/api/call/invite', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
    sendSignal({ type: 'call', to: peer.id, from: me.id, fromName: me.name, fromAvatar: me.avatarUrl, channel, at, callType: video ? 'video' : 'voice', video, members: callSession.current.peers });
  }
  playRingback();
  const ring = window.setInterval(() => {
    if (callSession.current?.phase === 'live' || callSession.current?.phase === 'idle') { window.clearInterval(ring); stopRing(); return; }
    playRingback();
  }, 2600);
  const timer = window.setTimeout(() => {
    if (callSession.current?.id === id && callSession.current.phase !== 'live') onNoAnswer();
  }, NO_ANSWER_MS);
  return { channel, ring, timer, id };
}

/** دعوة شخص ثالث داخل مكالمة قائمة، وتبليغ كل الموجودين. */
export function inviteThird(me: CallPeer, peer: CallPeer) {
  const session = callSession.current;
  if (!session) return;
  if (!session.peers.some(p => p.id === peer.id)) session.peers.push({ ...peer, joined: false });
  const at = Date.now();
  const body = { toUserId: peer.id, userId: peer.id, channel: session.channel, hostId: session.hostId, fromId: me.id, hostName: me.name, hostAvatar: me.avatarUrl, members: session.peers, at, video: session.video, kind: session.video ? 'video' : 'voice' };
  void fetch('/api/call/invite', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
  sendSignal({ type: 'call', to: peer.id, from: me.id, fromName: me.name, fromAvatar: me.avatarUrl || peer.avatarUrl, channel: session.channel, at, callType: session.video ? 'video' : 'voice', members: session.peers });
  for (const other of session.peers) {
    if (!other.id || other.id === me.id || other.id === peer.id) continue;
    sendSignal({ type: 'member-invited', to: other.id, from: me.id, channel: session.channel, members: session.peers, added: [peer], at });
  }
}
