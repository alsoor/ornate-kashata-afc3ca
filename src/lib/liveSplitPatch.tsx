/**
 * liveSplitPatch — TikTok-style split screen between TWO live camera hosts (hosts only)
 *
 * Standalone patch used by /live-camera. It does NOT touch the voice-live invite system.
 *
 * Flow
 *  1. Host A taps the split button (top bar, hosts only) -> list of people who are live on camera now
 *     (the list itself is DuetInvitePanel from liveDuetPatch).
 *  2. A taps "Invite" -> `duet-invite` signal to B's live channel (existing duet signals).
 *  3. Host B sees the Accept / Decline box. On Accept B does NOT leave his live:
 *       - B stays in his own room (his viewers keep watching him as usual),
 *       - B's page opens a SECOND Agora client, joins A's channel as a camera guest and
 *         publishes the SAME camera/mic tracks he already has,
 *       - B announces `duet-join` to A's room -> A's room shows the split screen:
 *         A on the left half, B on the right half (A's viewers stay in A's room).
 *  4. The split ends when A taps End, A ends his live, or B taps End on his own badge.
 *     Ending only closes the second connection; B's own live keeps running.
 *
 * Signals reused from liveDuetPatch: duet-invite / duet-cancel / duet-decline / duet-accept /
 * duet-join / duet-set / duet-end / duet-leave.
 */

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { SplitSquareHorizontal, X } from 'lucide-react';
import { publishLiveSignal, subscribeLiveSignals } from '@/lib/liveRoomStage';
import { camChannelForHost, sendDuetSignal, type DuetPerson } from '@/lib/liveDuetPatch';

/* ───────────────────────── helpers ───────────────────────── */

function uidFromString(s: string): number {
  if (!s || s === '0') return 0;
  return Math.abs(s.split('').reduce((a, c) => (Math.imul(31, a) + c.charCodeAt(0)) | 0, 0)) % 100_000 || 1;
}

async function fetchSplitToken(channel: string, userId: string): Promise<{ token: string | null; uid: number; appId: string | null }> {
  try {
    const r = await fetch(
      `/api/call/token?channel=${encodeURIComponent(channel)}&uid=${encodeURIComponent(userId)}`,
      { credentials: 'include' },
    );
    if (!r.ok) throw new Error('token');
    const d: any = await r.json();
    return { token: d.token ?? null, uid: Number(d.uid) || uidFromString(userId), appId: d.appId ?? null };
  } catch {
    return { token: null, uid: uidFromString(userId), appId: null };
  }
}

/* ───────────────────────── guest session (second Agora connection) ───────────────────────── */

/** A track that is switched off (setEnabled(false) / muted) cannot be published — Agora throws TRACK_IS_DISABLED. */
function trackUsable(t: any): boolean {
  if (!t) return false;
  try {
    if (t.enabled === false) return false;
    if (t.muted === true) return false;
  } catch { /* ignore */ }
  return true;
}

function errText(e: any): string {
  return String(e?.code || e?.message || e || '').slice(0, 80);
}

export type SplitGuestHandle = {
  /** uid used inside the inviter's channel */
  uid: number;
  /** Camera was switched (front/back) on my own live -> publish the new track to the inviter's room too. */
  replaceCam: (cam: any) => Promise<void>;
  /** Close only the second connection (my own live is untouched). */
  leave: (notifyHost?: boolean) => Promise<void>;
};

/**
 * B accepted A's invite: join A's channel with a second client and publish the tracks B already has.
 * `onEnded` fires once when the split is over for any reason (A ended it, A left, B left, connection lost).
 */
export async function startSplitGuest(opts: {
  host: DuetPerson;
  me: DuetPerson;
  cam: any;
  mic: any | null;
  appIdFallback: string;
  /** The inviter's camera, to be shown in the other half of MY screen (null = it stopped). */
  onRemoteVideo: (track: any | null) => void;
  onEnded: () => void;
}): Promise<SplitGuestHandle> {
  const { host, me, appIdFallback, onEnded, onRemoteVideo } = opts;
  const hostChannel = camChannelForHost(host.userId);
  const hostUid = uidFromString(host.userId);
  const startedAt = Date.now();

  const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
  const client: any = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

  let ended = false;
  let currentCam: any = opts.cam;
  let unsubSig: (() => void) | null = null;
  let announce: number[] = [];
  let announceIv: number | null = null;
  const extra: any[] = [];

  const finish = async (notifyHost: boolean) => {
    if (ended) return;
    ended = true;
    announce.forEach((t) => window.clearTimeout(t));
    announce = [];
    if (announceIv != null) { window.clearInterval(announceIv); announceIv = null; }
    try { onRemoteVideo(null); } catch { /* ignore */ }
    try { unsubSig?.(); } catch { /* ignore */ }
    if (notifyHost) {
      sendDuetSignal(hostChannel, { t: 'duet-leave', uid: myUid, ts: Date.now() });
    }
    try { await client.unpublish(); } catch { /* ignore */ }
    try { await client.leave(); } catch { /* ignore */ }
    extra.forEach((t) => { try { t.stop(); } catch { /* ignore */ } try { t.close(); } catch { /* ignore */ } });
    try { onEnded(); } catch { /* ignore */ }
  };

  const t = await fetchSplitToken(hostChannel, me.userId);
  const myUid = t.uid;

  const onMsg = (msg: any) => {
    if (!msg || typeof msg.t !== 'string') return;
    const stamp = Number(msg.at) || Number(msg.ts) || 0;
    if (stamp && stamp < startedAt - 2000) return; // old replayed signal
    if (msg.t === 'duet-end' && (msg.uid == null || Number(msg.uid) === myUid)) void finish(false);
    else if (msg.t === 'room-ended') void finish(false);
  };

  client.on('user-left', (u: any) => {
    if (Number(u.uid) === hostUid) void finish(false); // inviter left his live
  });
  // I also watch + hear the inviter, so MY screen is split too (me on one half, him on the other)
  const subscribeHost = async (u: any, mediaType: 'audio' | 'video') => {
    if (Number(u.uid) !== hostUid) return;
    try {
      await client.subscribe(u, mediaType);
      if (mediaType === 'audio') { try { u.audioTrack?.play(); } catch { /* ignore */ } }
      else if (u.videoTrack) onRemoteVideo(u.videoTrack);
    } catch { /* ignore */ }
  };
  client.on('user-published', (u: any, mt: string) => { void subscribeHost(u, mt as 'audio' | 'video'); });
  client.on('user-unpublished', (u: any, mt: string) => {
    if (Number(u.uid) === hostUid && mt === 'video') onRemoteVideo(null);
  });
  client.on('connection-state-change', (cur: string) => {
    if (cur === 'DISCONNECTED') void finish(false);
  });
  const streamHandler = (...args: any[]) => {
    try {
      let data: any = args.length >= 2 ? args[1] : args[0];
      if (data && typeof data === 'object' && 'data' in data && !ArrayBuffer.isView(data) && !(data instanceof ArrayBuffer)) data = data.data;
      let raw = '';
      if (typeof data === 'string') raw = data;
      else if (data instanceof ArrayBuffer) raw = new TextDecoder().decode(new Uint8Array(data));
      else if (ArrayBuffer.isView(data)) raw = new TextDecoder().decode(data as unknown as Uint8Array);
      raw = raw.replace(/\u0000/g, '').trim();
      if (raw) onMsg(JSON.parse(raw));
    } catch { /* ignore */ }
  };
  client.on('stream-message', streamHandler);

  let streamId: number | null = null;
  try {
  await client.join(t.appId || appIdFallback, hostChannel, t.token, myUid);

  try {
    const sid = await client.createDataStream?.({ reliable: true, ordered: true });
    if (typeof sid === 'number') streamId = sid;
  } catch { /* ignore */ }

  // Publish the tracks my own live already uses. If the SDK refuses to share them with a second connection,
  // fall back to independent clones of the same camera / mic so the split still works.
  const micOk = trackUsable(opts.mic);
  const direct: any[] = [opts.cam];
  if (micOk) direct.push(opts.mic);
  let publishedMine: any[] = [];
  try {
    await client.publish(direct);
    publishedMine = direct;
  } catch (e1) {
    console.warn('[SplitPatch] direct publish failed, using clones', e1);
    try { await client.unpublish(); } catch { /* ignore */ }
    const camClone = AgoraRTC.createCustomVideoTrack({ mediaStreamTrack: opts.cam.getMediaStreamTrack().clone() });
    extra.push(camClone);
    const list: any[] = [camClone];
    if (micOk) {
      try {
        const micClone = AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: opts.mic.getMediaStreamTrack().clone() });
        extra.push(micClone);
        list.push(micClone);
      } catch { /* video only */ }
    }
    try {
      await client.publish(list);
      publishedMine = list;
    } catch {
      await client.publish([camClone]); // last resort: video only
      publishedMine = [camClone];
    }
  }
  currentCam = publishedMine[0];

  unsubSig = subscribeLiveSignals(hostChannel, onMsg as any);
  for (const u of client.remoteUsers || []) {
    if (u.hasVideo) await subscribeHost(u, 'video');
    if (u.hasAudio) await subscribeHost(u, 'audio');
  }
  } catch (err) {
    ended = true;
    try { await client.leave(); } catch { /* ignore */ }
    extra.forEach((x) => { try { x.stop(); } catch { /* ignore */ } try { x.close(); } catch { /* ignore */ } });
    throw err;
  }

  // announce myself so the inviter's room splits right away (data stream + signal transport, a few times)
  const guest = { uid: myUid, userId: me.userId, name: me.name, username: me.username, avatarUrl: me.avatarUrl };
  const sendJoin = () => {
    if (ended) return;
    const payload = { t: 'duet-join', uid: myUid, guest, ts: Date.now() };
    sendDuetSignal(hostChannel, payload);
    try { publishLiveSignal(hostChannel, payload as any); } catch { /* ignore */ }
    {
      const json = JSON.stringify(payload);
      try {
        const r = client.sendStreamMessage?.(streamId ?? 0, new TextEncoder().encode(json));
        if (r && typeof r.then === 'function') r.catch(() => { /* ignore */ });
      } catch {
        try { void client.sendStreamMessage?.(streamId ?? 0, json); } catch { /* ignore */ }
      }
    }
  };
  sendJoin();
  announce = [window.setTimeout(sendJoin, 800), window.setTimeout(sendJoin, 2000)];
  // keep announcing while the split is alive: if one signal gets lost the inviter's screen still splits
  announceIv = window.setInterval(sendJoin, 2500);

  return {
    uid: myUid,
    replaceCam: async (cam: any) => {
      if (ended) return;
      try { if (currentCam) await client.unpublish([currentCam]); } catch { /* ignore */ }
      let next: any = cam;
      if (extra.length) {
        try {
          next = AgoraRTC.createCustomVideoTrack({ mediaStreamTrack: cam.getMediaStreamTrack().clone() });
          extra.push(next);
        } catch { next = cam; }
      }
      currentCam = next;
      try { await client.publish([next]); } catch { /* ignore */ }
    },
    leave: (notifyHost = true) => finish(notifyHost),
  };
}

/* ───────────────────────── UI ───────────────────────── */

/** Top-bar button — only render it for the owner of the live. */
export function SplitInviteButton({ onClick, active }: { onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Split screen with another live"
      title="Split screen with another live"
      style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        padding: 0,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#22d3ee',
        background: active ? 'rgba(34,211,238,0.28)' : 'rgba(34,211,238,0.12)',
        border: '1.5px solid rgba(34,211,238,0.85)',
        boxShadow: '0 0 8px rgba(34,211,238,0.45)',
        flexShrink: 0,
      }}
    >
      <SplitSquareHorizontal size={17} strokeWidth={2.3} />
    </button>
  );
}

/** Shown on the invited host's own screen while he is also showing on the inviter's live. */
export function SplitGuestBadge({ withName, onEnd }: { withName: string | null; onEnd: () => void }) {
  return (
    <AnimatePresence>
      {withName ? (
        <motion.div
          key="split-guest-badge"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            top: 'calc(max(env(safe-area-inset-top,0px),14px) + 62px)',
            zIndex: 94,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 8px 6px 14px',
            borderRadius: 999,
            background: 'rgba(6,16,18,0.95)',
            border: '1px solid rgba(34,211,238,0.6)',
            color: '#a5f3fc',
            fontSize: '0.72rem',
            fontWeight: 800,
            maxWidth: '88%',
          }}
        >
          <SplitSquareHorizontal size={14} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Split with {withName}</span>
          <button
            type="button"
            onClick={onEnd}
            aria-label="End split screen"
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 999, cursor: 'pointer',
              border: 'none', background: '#ef4444', color: '#fff', fontWeight: 800, fontSize: '0.7rem',
            }}
          >
            <X size={12} /> End
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
