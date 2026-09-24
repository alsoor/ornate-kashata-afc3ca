type Sig = {
  t: 'webrtc';
  from: string;
  to?: string;
  kind: 'offer' | 'answer' | 'ice' | 'bye';
  sdp?: RTCSessionDescriptionInit;
  ice?: RTCIceCandidateInit;
};

const pcs = new Map<string, RTCPeerConnection>();
const remotes = new Map<string, HTMLAudioElement>();
let localStream: MediaStream | null = null;
let muted = new Set<string>();
let speakerOff = false;
let myId = '';
let roomId = '';

function audioEl(id: string) {
  let el = remotes.get(id);
  if (!el) {
    el = new Audio();
    el.autoplay = true;
    (el as any).playsInline = true;
    remotes.set(id, el);
  }
  el.muted = speakerOff || muted.has(id);
  return el;
}

function pc(peerId: string) {
  let conn = pcs.get(peerId);
  if (conn) return conn;
  conn = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  if (localStream) localStream.getTracks().forEach(t => conn!.addTrack(t, localStream!));
  conn.onicecandidate = ev => {
    if (!ev.candidate) return;
    void sendSig({ t: 'webrtc', from: myId, to: peerId, kind: 'ice', ice: ev.candidate.toJSON() });
  };
  conn.ontrack = ev => {
    const el = audioEl(peerId);
    el.srcObject = ev.streams[0] || new MediaStream([ev.track]);
    void el.play().catch(() => {});
  };
  pcs.set(peerId, conn);
  return conn;
}

async function sendSig(data: Sig) {
  await fetch('/api/room/signal', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId, t: 'webrtc', data }),
  }).catch(() => {});
}

export function setPublicVoiceMute(peerId: string, on: boolean) {
  if (on) muted.add(peerId);
  else muted.delete(peerId);
  const el = remotes.get(peerId);
  if (el) el.muted = speakerOff || muted.has(peerId);
}

export function setPublicVoiceSpeaker(off: boolean) {
  speakerOff = off;
  remotes.forEach((el, id) => {
    el.muted = speakerOff || muted.has(id);
  });
}

export async function startPublicVoiceRtc(opts: { roomId: string; userId: string; stream: MediaStream; peerIds: string[] }) {
  roomId = opts.roomId;
  myId = opts.userId;
  localStream = opts.stream;
  for (const id of opts.peerIds) {
    if (!id || id === myId) continue;
    const conn = pc(id);
    localStream.getTracks().forEach(t => {
      if (!conn.getSenders().some(s => s.track === t)) conn.addTrack(t, localStream!);
    });
    const offer = await conn.createOffer();
    await conn.setLocalDescription(offer);
    await sendSig({ t: 'webrtc', from: myId, to: id, kind: 'offer', sdp: offer });
  }
}

export async function handlePublicVoiceSignal(raw: any) {
  const msg = (raw?.data || raw) as Sig;
  if (!msg || msg.t !== 'webrtc' || !msg.from || msg.from === myId) return;
  if (msg.to && msg.to !== myId) return;
  const conn = pc(msg.from);
  if (msg.kind === 'offer' && msg.sdp) {
    await conn.setRemoteDescription(new RTCSessionDescription(msg.sdp));
    if (localStream) {
      localStream.getTracks().forEach(t => {
        if (!conn.getSenders().some(s => s.track === t)) conn.addTrack(t, localStream!);
      });
    }
    const answer = await conn.createAnswer();
    await conn.setLocalDescription(answer);
    await sendSig({ t: 'webrtc', from: myId, to: msg.from, kind: 'answer', sdp: answer });
  } else if (msg.kind === 'answer' && msg.sdp) {
    if (conn.signalingState !== 'stable') await conn.setRemoteDescription(new RTCSessionDescription(msg.sdp));
  } else if (msg.kind === 'ice' && msg.ice) {
    try { await conn.addIceCandidate(new RTCIceCandidate(msg.ice)); } catch { /* ignore */ }
  } else if (msg.kind === 'bye') {
    stopPeer(msg.from);
  }
}

function stopPeer(id: string) {
  pcs.get(id)?.close();
  pcs.delete(id);
  const el = remotes.get(id);
  if (el) {
    el.srcObject = null;
    remotes.delete(id);
  }
}

export async function stopPublicVoiceRtc() {
  if (myId) await sendSig({ t: 'webrtc', from: myId, kind: 'bye' });
  pcs.forEach(c => c.close());
  pcs.clear();
  remotes.forEach(el => { el.srcObject = null; });
  remotes.clear();
  localStream?.getTracks().forEach(t => t.stop());
  localStream = null;
}
