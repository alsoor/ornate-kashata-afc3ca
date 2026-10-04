/**
 * /live-camera — Host camera live (account broadcast only)
 *
 * Query params:
 *   hostId, hostName, hostUsername, hostAvatar
 * Channel: stooorna-livecam-{hostId}
 *
 * Public voice room is NOT used here.
 * Same enter animation and layout language as /live voice room.
 *
 * App ID: 149ef04e839c4132a08efb49d717c436
 * Token from /api/call/token
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Users,
  Snowflake,
  LogOut,
  ChevronDown,
  Video,
  VideoOff,
  SwitchCamera,
  X,
  Hand,
} from 'lucide-react';
import { useSession } from '@/lib/auth/auth-client';
import UserAvatar from '@/components/UserAvatar';
import type {
  IAgoraRTCClient,
  IMicrophoneAudioTrack,
  ICameraVideoTrack,
  IAgoraRTCRemoteUser,
} from 'agora-rtc-sdk-ng';
import {
  publishLiveActive,
  makeChatPayload,
  parseIncomingChat,
  publishLiveChat,
  subscribeLiveChat,
  LIVE_ENDED_TITLE,
  LIVE_ENDED_BODY,
  LIVE_ENDED_HINT,
  type LiveChatMsg,
} from '@/lib/liveRoomExtras';
import {
  publishLiveSignal,
  postLiveSignalHttp,
  subscribeLiveSignals,
  makeMicRequestPayload,
  canGrantSpeaker,
  type MicRequest,
  type LiveSignal,
} from '@/lib/liveRoomStage';
import { getVipMaxSpeakers } from '@/lib/vipPatch';
import { LiveVipDock } from '@/components/LiveVipDock';
import { LiveCoinsDock, SupportCrown, useSupportLeaders } from '@/components/LiveCoinsDock';
// DUET-PATCH: invite another live to join this live (split screen)
import {
  camChannelForHost,
  sendDuetSignal,
  isDuetMessage,
  newDuetId,
  duetRoomUrl,
  DuetInvitePanel,
  DuetIncomingDialog,
  DuetDivider,
  DuetNameTag,
  DuetEndButton,
  DuetToast,
  type DuetGuest,
  type DuetInvite,
  type DuetPerson,
  type AvailableLive,
} from '@/lib/liveDuetPatch';
// VOICE-INVITE-PATCH (video): anyone in the room invites ONLINE people (not only people who are live); they get the Accept / Decline box anywhere in the app
import {
  VoiceInviteButton,
  VoiceInvitePanel,
  VoiceInviteToast,
  useVoiceInviteReplies,
  cancelAllVoiceInvites,
  voiceReplyText,
} from '@/lib/liveVoiceInvite';

const AGORA_APP_ID = '149ef04e839c4132a08efb49d717c436';

type Member = {
  uid: number;
  userId?: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  isMe?: boolean;
  isHost?: boolean;
};

function uidFromString(s: string): number {
  if (!s || s === '0') return 0;
  return Math.abs(s.split('').reduce((a, c) => (Math.imul(31, a) + c.charCodeAt(0)) | 0, 0)) % 100_000 || 1;
}

async function fetchToken(channel: string, userId: string): Promise<{
  token: string;
  uid: number;
  appId: string;
}> {
  const r = await fetch(
    `/api/call/token?channel=${encodeURIComponent(channel)}&uid=${encodeURIComponent(userId)}`,
    { credentials: 'include' },
  );
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Failed to fetch Agora token (${r.status}): ${body || 'check /api/call/token'}`);
  }
  return r.json();
}

/** One person = one row: the same user can hold several Agora uids after a refresh/rejoin. */
function micPersonKey(x: { userId?: string | null; username?: string | null; uid: number }): string {
  return String(x.userId || (x.username ? `@${x.username}` : '') || `uid:${x.uid}`);
}

export default function LiveCameraPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionResult = useSession();
  const user =
    (sessionResult as any)?.data?.user ??
    (sessionResult as any)?.user ??
    (sessionResult as any)?.session?.user ??
    null;

  const myId = user?.id as string | undefined;
  const myName = (user?.name || (user as any)?.username || 'User') as string;
  const myUsername = ((user as any)?.username ?? null) as string | null;
  const myAvatar = ((user as any)?.avatarUrl ?? (user as any)?.image ?? null) as string | null;

  const hostId = (searchParams.get('hostId') || '').trim();
  const hostName = (searchParams.get('hostName') || '').trim() || 'Host';
  const hostUsername = (searchParams.get('hostUsername') || '').trim() || null;
  const hostAvatar = (searchParams.get('hostAvatar') || '').trim() || null;
  const isHostRoom = !!hostId;
  const amHost = !!(myId && hostId && myId === hostId);
  const micCap = getVipMaxSpeakers(hostId);
  const channelName = `stooorna-livecam-${(hostId || 'none').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || uidFromString(hostId || 'none')}`;
  const roomTitle = hostUsername ? `${hostName} (@${hostUsername})` : hostName;
  // DUET-PATCH: guest invited into this room's live (publishes camera + mic, shown on the right half)
  const amGuest = !!(isHostRoom && !amHost && searchParams.get('duet') === '1');

  const [joined, setJoined] = useState(false);
  const [livePageClosing, setLivePageClosing] = useState(false);
  const [enterGateDone, setEnterGateDone] = useState(false);
  const [joining, setJoining] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const micOnRef = useRef(true);
  const [camOn, setCamOn] = useState(true);
  const camOnRef = useRef(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [micFrozenByHost, setMicFrozenByHost] = useState(false);
  const micFrozenRef = useRef(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const speakerMutedRef = useRef(false);
  const [members, setMembers] = useState<Member[]>([]);
  const membersRef = useRef<Member[]>([]);
  membersRef.current = members;
  const [speakingUids, setSpeakingUids] = useState<Set<number>>(new Set());
  const [mutedUids, setMutedUids] = useState<Set<number>>(new Set());
  const mutedUidsRef = useRef<Set<number>>(new Set());
  const [frozenUids, setFrozenUids] = useState<Set<number>>(new Set());
  const frozenUidsRef = useRef<Set<number>>(new Set());
  const [speakerUids, setSpeakerUids] = useState<Set<number>>(new Set());
  const speakerUidsRef = useRef<Set<number>>(new Set());
  /** Uids the host has revoked mic access from — hard-muted for every listener
   *  right away, instead of relying only on the revoked device to disable its
   *  own mic in time. Cleared once that uid is granted the mic again. */
  const revokedUidsRef = useRef<Set<number>>(new Set());
  const [micRequests, setMicRequests] = useState<MicRequest[]>([]);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [micRequested, setMicRequested] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [liveChatMsgs, setLiveChatMsgs] = useState<LiveChatMsg[]>([]);
  const [liveChatText, setLiveChatText] = useState('');
  const [liveChatOpen, setLiveChatOpen] = useState(true);
  /** Compact by default. Full Chat rises to the yellow line; Hide chat drops it back. */
  const [chatFull, setChatFull] = useState(false);
  const [membersSheetOpen, setMembersSheetOpen] = useState(false);
  const [roomEndedOverlay, setRoomEndedOverlay] = useState(false);
  const liveChatEndRef = useRef<HTMLDivElement | null>(null);

  type HostPost = {
    id: number;
    text?: string | null;
    mediaUrl?: string | null;
    mediaType?: string | null;
    mediaUrls?: string[] | null;
    mediaTypes?: string[] | null;
    authorId?: string;
    authorName?: string | null;
    authorUsername?: string | null;
    authorAvatarUrl?: string | null;
    createdAt?: string;
    commentsCount?: number;
    likesCount?: number;
  };
  const [hostPostsOpen, setHostPostsOpen] = useState(false);
  const [hostPosts, setHostPosts] = useState<HostPost[]>([]);
  const [hostPostsLoading, setHostPostsLoading] = useState(false);
  const [viewPost, setViewPost] = useState<HostPost | null>(null);
  const [productDetailsOpen, setProductDetailsOpen] = useState(false);
  const [postComments, setPostComments] = useState<
    { id: number; authorName?: string; authorAvatarUrl?: string | null; body?: string; text?: string; createdAt?: string }[]
  >([]);
  const [postCommentText, setPostCommentText] = useState('');
  const [postCommentSending, setPostCommentSending] = useState(false);

  function extractProductFields(text: string | null | undefined): {
    title: string;
    details: string;
    price: string;
    extras: string[];
  } {
    const raw = (text || '').trim();
    const clean = raw.replace(/⟦stooorna-product:[A-Za-z0-9+/=]+⟧\s*$/u, '').trim();
    const lines = clean.split(/\n+/).map(l => l.trim()).filter(Boolean);
    let title = lines[0] || 'Product';
    let price = '';
    let details = '';
    const extras: string[] = [];
    for (const line of lines.slice(1)) {
      if (/price|KD|KWD/i.test(line) && !price) price = line;
      else if (!details) details = line;
      else extras.push(line);
    }
    if (raw.startsWith('{')) {
      try {
        const o = JSON.parse(raw.split('\n')[0]);
        if (o && o.__productAd === 1) {
          title = o.title || title;
          details = o.details || details;
          price = o.price ? String(o.price) : price;
          if (Array.isArray(o.extras)) extras.push(...o.extras.map(String));
        }
      } catch {
        /* ignore */
      }
    }
    return { title, details, price, extras };
  }

  function parseProductTitle(text: string | null | undefined): string {
    if (!text) return 'Post';
    const first = text.trim().split(/\n\n+/)[0]?.trim() || text.trim();
    return first.slice(0, 80) || 'Post';
  }

  async function loadHostPosts() {
    if (!hostId) return;
    setHostPostsLoading(true);
    try {
      const r = await fetch('/api/posts?audience=text', { credentials: 'include' });
      if (!r.ok) {
        const r2 = await fetch('/api/posts?audience=public', { credentials: 'include' });
        if (!r2.ok) throw new Error('fail');
        const d2 = await r2.json();
        const list = (d2.posts ?? d2 ?? []) as HostPost[];
        setHostPosts(list.filter(p => String(p.authorId) === String(hostId)));
      } else {
        const d = await r.json();
        const list = (d.posts ?? d ?? []) as HostPost[];
        setHostPosts(list.filter(p => String(p.authorId) === String(hostId)));
      }
    } catch {
      setHostPosts([]);
    } finally {
      setHostPostsLoading(false);
    }
  }

  function openHostPosts() {
    if (!isHostRoom || !hostId) return;
    setHostPostsOpen(true);
    void loadHostPosts();
  }

  async function openPostDetail(post: HostPost) {
    setViewPost(post);
    setProductDetailsOpen(false);
    setPostComments([]);
    setPostCommentText('');
    try {
      const r = await fetch(`/api/posts/${post.id}/comments`, { credentials: 'include' });
      if (r.ok) {
        const d = await r.json();
        setPostComments(d.comments ?? d ?? []);
      }
    } catch {
      /* silent */
    }
  }

  async function sendPostComment() {
    if (!viewPost || !postCommentText.trim() || postCommentSending) return;
    const body = postCommentText.trim();
    setPostCommentSending(true);
    try {
      const r = await fetch(`/api/posts/${viewPost.id}/comments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, parentCommentId: null }),
      });
      if (r.ok) {
        setPostCommentText('');
        const r2 = await fetch(`/api/posts/${viewPost.id}/comments`, { credentials: 'include' });
        if (r2.ok) {
          const d = await r2.json();
          setPostComments(d.comments ?? d ?? []);
        }
      }
    } catch {
      /* silent */
    } finally {
      setPostCommentSending(false);
    }
  }

  function postThumb(post: HostPost): { url: string; type: string } | null {
    const urls = post.mediaUrls?.length ? post.mediaUrls : post.mediaUrl ? [post.mediaUrl] : [];
    const types = post.mediaTypes?.length ? post.mediaTypes : post.mediaType ? [post.mediaType] : [];
    if (!urls[0]) return null;
    return { url: urls[0], type: types[0] || 'image' };
  }

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const micRef = useRef<IMicrophoneAudioTrack | null>(null);
  const camRef = useRef<ICameraVideoTrack | null>(null);
  // DUET-PATCH: left pane = room host, right pane = duet guest
  const hostPaneRef = useRef<HTMLDivElement | null>(null);
  const guestPaneRef = useRef<HTMLDivElement | null>(null);
  /** Last remote video track received, replayed once the viewer's video
   *  container has actually mounted (see the effect below). Without this,
   *  a track that arrives while the "Connecting…" screen is still showing
   *  gets silently dropped because remoteVideoElRef isn't attached yet. */
  type RemoteVideo = { play: (el: HTMLElement, opts?: object) => void; stop: () => void };
  const remoteVideoTracksRef = useRef<Map<number, RemoteVideo>>(new Map());
  const remoteVideoPlacedRef = useRef<Map<number, HTMLElement>>(new Map());
  const remoteTracksRef = useRef<Map<number, { stop: () => void; play: () => void }>>(new Map());
  const myUidRef = useRef<number | null>(null);
  const dataStreamIdRef = useRef<number | null>(null);
  const friendsByUidRef = useRef<
    Map<number, { userId: string; name: string; username: string | null; avatarUrl: string | null }>
  >(new Map());
  const leftRef = useRef(false);
  /** Host ended private room — listeners exit without re-broadcasting active */
  const forceEndRef = useRef(false);

  // ───────── DUET-PATCH state ─────────
  const [duet, setDuet] = useState<DuetGuest | null>(null);
  const duetRef = useRef<DuetGuest | null>(null);
  const duetSetTsRef = useRef(0);
  const [duetPanelOpen, setDuetPanelOpen] = useState(false);
  // VOICE-INVITE-PATCH (video) state
  const [voiceInvOpen, setVoiceInvOpen] = useState(false);
  const [voiceInvToast, setVoiceInvToast] = useState('');
  const voiceInvToastTimerRef = useRef<number | null>(null);
  useVoiceInviteReplies(!!(joined && isHostRoom), (r) => {
    setVoiceInvToast(voiceReplyText(r));
    if (voiceInvToastTimerRef.current) window.clearTimeout(voiceInvToastTimerRef.current);
    voiceInvToastTimerRef.current = window.setTimeout(() => setVoiceInvToast(''), 3200);
  });
  const [duetSent, setDuetSent] = useState<Record<string, number>>({});
  const duetSentIdsRef = useRef<Record<string, string>>({});
  const [duetIncoming, setDuetIncoming] = useState<DuetInvite | null>(null);
  const duetIncomingRef = useRef<DuetInvite | null>(null);
  const [duetToast, setDuetToast] = useState('');
  const duetToastTimerRef = useRef<number | null>(null);
  const duetSeenRef = useRef<Set<string>>(new Set());
  const handleDuetMsgRef = useRef<(msg: any) => boolean>(() => false);

  const playLocalVideo = useCallback(() => {
    const track = camRef.current;
    // DUET-PATCH: host plays in the left half, a duet guest in the right half
    const el = amGuest ? guestPaneRef.current : hostPaneRef.current;
    if (!track || !el) return;
    try {
      track.play(el, { fit: 'cover' });
    } catch {
      /* ignore */
    }
  }, [amGuest]);

  /** Put every received remote video into the right half (guest uid → right, everything else → left). */
  const placeRemoteVideos = useCallback(() => {
    remoteVideoTracksRef.current.forEach((track, uid) => {
      const d = duetRef.current;
      let target: HTMLElement | null = null;
      if (d && uid === d.uid) target = guestPaneRef.current;
      else if (!amHost) target = hostPaneRef.current; // the host shows their own camera on the left
      if (!target || remoteVideoPlacedRef.current.get(uid) === target) return;
      try { track.stop(); } catch { /* ignore */ }
      try {
        track.play(target, { fit: 'cover' });
        remoteVideoPlacedRef.current.set(uid, target);
      } catch {
        /* ignore */
      }
    });
  }, [amHost]);

  const playRemoteVideo = useCallback((track: RemoteVideo, uid: number) => {
    remoteVideoTracksRef.current.set(uid, track);
    remoteVideoPlacedRef.current.delete(uid);
    placeRemoteVideos();
  }, [placeRemoteVideos]);

  useEffect(() => {
    if (!myId) return;
    fetch('/api/friends', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const map = new Map<
          number,
          { userId: string; name: string; username: string | null; avatarUrl: string | null }
        >();
        const list = (d?.accepted ?? d?.friends ?? []) as Array<{
          friendId?: string;
          id?: string;
          name?: string | null;
          username?: string | null;
          avatarUrl?: string | null;
        }>;
        for (const f of list) {
          const fid = String(f.friendId ?? f.id ?? '');
          if (!fid) continue;
          map.set(uidFromString(fid), {
            userId: fid,
            name: f.name || f.username || 'Friend',
            username: f.username ?? null,
            avatarUrl: f.avatarUrl ?? null,
          });
        }
        if (hostId) {
          map.set(uidFromString(hostId), {
            userId: hostId,
            name: hostName,
            username: hostUsername,
            avatarUrl: hostAvatar,
          });
        }
        friendsByUidRef.current = map;
      })
      .catch(() => {});
  }, [myId, hostId, hostName, hostUsername, hostAvatar]);

  const resolveRemote = useCallback(
    (uid: number): Member => {
      const known = friendsByUidRef.current.get(uid);
      if (known) {
        return {
          uid,
          userId: known.userId,
          name: known.name,
          username: known.username,
          avatarUrl: known.avatarUrl,
          isHost: !!(hostId && known.userId === hostId),
        };
      }
      return {
        uid,
        name: `User ${uid}`,
        username: null,
        avatarUrl: null,
        isHost: !!(hostId && uid === uidFromString(hostId)),
      };
    },
    [hostId],
  );

  const rebuildMembers = useCallback(
    (remoteUids: number[]) => {
      const meUid = myUidRef.current;
      const list: Member[] = [];
      if (meUid != null && myId) {
        list.push({
          uid: meUid,
          userId: myId,
          name: myName,
          username: myUsername,
          avatarUrl: myAvatar,
          isMe: true,
          isHost: amHost,
        });
      }
      for (const uid of remoteUids) {
        if (uid === meUid) continue;
        list.push(resolveRemote(uid));
      }
      list.sort((a, b) => (b.isHost ? 1 : 0) - (a.isHost ? 1 : 0) || (b.isMe ? 1 : 0) - (a.isMe ? 1 : 0));
      setMembers(list);
    },
    [myId, myName, myUsername, myAvatar, amHost, resolveRemote],
  );

  const applyTrackPlayback = useCallback((uid: number, track: { stop: () => void; play: () => void }) => {
    const userMuted = mutedUidsRef.current.has(uid);
    const globalMuted = speakerMutedRef.current;
    const hostRevoked = revokedUidsRef.current.has(uid);
    try {
      if (userMuted || globalMuted || hostRevoked) track.stop();
      else track.play();
    } catch {
      /* ignore */
    }
  }, []);

  const forceMuteLocalMic = useCallback(async () => {
    if (!micRef.current) return;
    try {
      micRef.current.setMuted(true);
    } catch {
      /* ignore */
    }
    try {
      await micRef.current.setEnabled(false);
    } catch {
      /* ignore */
    }
    micOnRef.current = false;
    setMicOn(false);
  }, []);

  const ensureDataStream = useCallback(async (): Promise<number | null> => {
    const client = clientRef.current as any;
    if (!client) return null;
    if (dataStreamIdRef.current != null) return dataStreamIdRef.current;

    const applySid = (sid: unknown): number | null => {
      if (typeof sid === 'number' && Number.isFinite(sid)) {
        dataStreamIdRef.current = sid;
        return sid;
      }
      if (sid === true || sid === 0) {
        dataStreamIdRef.current = 0;
        return 0;
      }
      return null;
    };

    try {
      if (typeof client.createDataStream === 'function') {
        const maybe = client.createDataStream({ reliable: true, ordered: true });
        if (maybe && typeof maybe.then === 'function') {
          const sid = await maybe;
          const applied = applySid(sid);
          if (applied != null) return applied;
        } else {
          const applied = applySid(maybe);
          if (applied != null) return applied;
        }
      }
    } catch (err) {
      console.warn('[LiveCamera] createDataStream promise', err);
    }

    try {
      if (typeof client.createDataStream === 'function') {
        const sid = await new Promise<unknown>((resolve) => {
          let settled = false;
          const done = (v: unknown) => {
            if (settled) return;
            settled = true;
            resolve(v);
          };
          try {
            const ret = client.createDataStream(
              { reliable: true, ordered: true },
              (err: unknown, streamId: unknown) => {
                if (err) {
                  console.warn('[LiveCamera] createDataStream cb err', err);
                  done(null);
                } else {
                  done(streamId);
                }
              },
            );
            if (ret != null && typeof (ret as any).then !== 'function') {
              setTimeout(() => done(ret), 0);
            } else {
              setTimeout(() => {
                if (!settled) done(null);
              }, 400);
            }
          } catch {
            done(null);
          }
        });
        const applied = applySid(sid);
        if (applied != null) return applied;
      }
    } catch (err) {
      console.warn('[LiveCamera] createDataStream callback', err);
    }

    dataStreamIdRef.current = 0;
    return 0;
  }, []);

  const sendDataPayload = useCallback(async (payload: object) => {
    publishLiveSignal(channelName, payload);
    publishLiveChat(channelName, payload);
    void postLiveSignalHttp(channelName, payload);
    const client = clientRef.current as any;
    if (!client) return false;

    let streamId = await ensureDataStream();
    if (streamId == null) {
      streamId = 0;
      dataStreamIdRef.current = 0;
    }

    const json = JSON.stringify(payload);
    const safeJson = json.length > 900 ? JSON.stringify({
      ...payload,
      text: typeof (payload as any).text === 'string' ? String((payload as any).text).slice(0, 200) : (payload as any).text,
    }) : json;
    const bytes = new TextEncoder().encode(safeJson);

    let ok = false;
    for (let attempt = 0; attempt < 4 && !ok; attempt++) {
      try {
        if (typeof client.sendStreamMessage !== 'function') break;
        try {
          const r = client.sendStreamMessage(streamId, bytes);
          if (r && typeof r.then === 'function') await r;
          ok = true;
          break;
        } catch {
          const r2 = client.sendStreamMessage(streamId, safeJson);
          if (r2 && typeof r2.then === 'function') await r2;
          ok = true;
          break;
        }
      } catch (err) {
        console.warn('[LiveCamera] sendStreamMessage', attempt, err);
        dataStreamIdRef.current = null;
        streamId = await ensureDataStream();
        if (streamId == null) streamId = 0;
        await new Promise(r => setTimeout(r, 60 * (attempt + 1)));
      }
    }

    if (!ok) {
      try {
        if (typeof client.sendCustomReportMessage === 'function') {
          await client.sendCustomReportMessage({
            reportId: String((payload as any).t || 'livecam'),
            category: 1,
            event: Number((payload as any).uid) || 0,
            label: safeJson.slice(0, 255),
            value: (payload as any).t === 'chat' ? 2 : ((payload as any).t === 'freeze' ? 1 : 0),
          });
          ok = true;
        }
      } catch (err) {
        console.warn('[LiveCamera] customReport', err);
      }
    }
    return ok;
  }, [ensureDataStream, channelName]);

  const sendFreezeCmd = useCallback(async (targetUid: number, freeze: boolean) => {
    await sendDataPayload({
      t: freeze ? 'freeze' : 'unfreeze',
      uid: targetUid,
      host: myUidRef.current,
      ts: Date.now(),
    });
    await sendDataPayload({
      t: 'freeze-set',
      uids: [...frozenUidsRef.current],
      host: myUidRef.current,
      ts: Date.now(),
    });
    if (freeze) {
      const next = new Set(speakerUidsRef.current);
      next.delete(targetUid);
      speakerUidsRef.current = next;
      setSpeakerUids(next);
      await sendDataPayload({
        t: 'speakers-set',
        uids: [...next],
        host: myUidRef.current,
        ts: Date.now(),
      });
    }
  }, [sendDataPayload]);

  const leaveRoom = useCallback(async (opts?: { forced?: boolean; skipNavigate?: boolean; duetMove?: Record<string, unknown> }) => {
    const forced = !!opts?.forced;
    leftRef.current = true;
    forceEndRef.current = forced || forceEndRef.current;
    try { cancelAllVoiceInvites(); } catch { /* ignore */ } // VOICE-INVITE-PATCH (video)

    // DUET-PATCH: a guest leaving tells the room so the split screen closes right away
    if (amGuest && !forced && myUidRef.current != null) {
      try { await sendDataPayload({ t: 'duet-leave', uid: myUidRef.current, ts: Date.now() }); } catch { /* ignore */ }
    }

    // Host ends private room: notify listeners BEFORE leaving Agora channel
    if (amHost && isHostRoom && !forced) {
      try {
        for (let i = 0; i < 3; i++) {
          // DUET-PATCH: when the host leaves to join someone else's live, viewers are moved along instead of kicked out
          await sendDataPayload(
            opts?.duetMove
              ? { t: 'duet-moved', hostId: hostId || myId || '', host: myUidRef.current, ts: Date.now(), ...opts.duetMove }
              : { t: 'room-ended', hostId: hostId || myId || '', host: myUidRef.current, ts: Date.now() },
          );
        }
      } catch { /* ignore */ }
      try {
        publishLiveActive({
          hostId: hostId || myId || '',
          kind: 'camera',
          active: false,
          channel: channelName,
          hostName: hostName,
          hostUsername: hostUsername,
          hostAvatar: hostAvatar,
        });
      } catch { /* ignore */ }
      // إشعار فوري لصفحة القصة/الرئيسية: اختفاء دائرة ومربع البث قبل إكمال leave
      try {
        const activeHost = hostId || myId || '';
        if (activeHost) {
          localStorage.removeItem(`stooorna_livecam_active_${activeHost}`);
          localStorage.removeItem('stooorna_livecam_active_current');
          window.dispatchEvent(new CustomEvent('stooorna:livecam-active', { detail: { hostId: activeHost, active: false, kind: 'camera' } }));
        }
      } catch { /* ignore */ }
      try {
        await fetch('/api/room/leave', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: channelName, userId: myId, endRoom: true }),
        });
      } catch { /* ignore */ }
      await new Promise(r => setTimeout(r, 120));
    } else if (myId) {
      try {
        await fetch('/api/room/leave', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: channelName, userId: myId }),
        });
      } catch { /* ignore */ }
    }

    try {
      const c: any = clientRef.current;
      if (c?.__freezeBroadcast) window.clearInterval(c.__freezeBroadcast);
    } catch { /* ignore */ }
    try {
      if (micRef.current) {
        micRef.current.stop();
        micRef.current.close();
        micRef.current = null;
      }
      if (camRef.current) {
        camRef.current.stop();
        camRef.current.close();
        camRef.current = null;
      }
      remoteTracksRef.current.forEach(tr => {
        try { tr.stop(); } catch { /* ignore */ }
      });
      remoteTracksRef.current.clear();
      if (clientRef.current) {
        await clientRef.current.leave();
        clientRef.current = null;
      }
    } catch { /* ignore */ }
    myUidRef.current = null;
    dataStreamIdRef.current = null;
    // DUET-PATCH: reset split-screen state
    duetRef.current = null;
    setDuet(null);
    duetIncomingRef.current = null;
    setDuetIncoming(null);
    setDuetPanelOpen(false);
    setDuetSent({});
    remoteVideoTracksRef.current.clear();
    remoteVideoPlacedRef.current.clear();
    setMembers([]);
    setMutedUids(new Set());
    mutedUidsRef.current = new Set();
    setFrozenUids(new Set());
    frozenUidsRef.current = new Set();
    setSpeakerUids(new Set());
    speakerUidsRef.current = new Set();
    setMicRequests([]);
    setMicRequested(false);
    setRequestsOpen(false);
    setMicFrozenByHost(false);
    micFrozenRef.current = false;
    setJoined(false);
    setMicOn(true);
    micOnRef.current = true;
    setCamOn(true);
    camOnRef.current = true;

    // Only host (or forced end after host signal) clears global live-active
    if (amHost || forced) {
      try {
        const activeHost = hostId || myId || '';
        if (activeHost) {
          localStorage.removeItem(`stooorna_livecam_active_${activeHost}`);
        }
        localStorage.removeItem('stooorna_livecam_active_current');
        window.dispatchEvent(new CustomEvent('stooorna:livecam-active', { detail: { hostId: activeHost, active: false } }));
      } catch { /* ignore */ }
    }

    setJoining(false);
    setStatus('');
    if (!opts?.skipNavigate) navigate(-1);
  }, [navigate, hostId, myId, amHost, amGuest, isHostRoom, channelName, sendDataPayload]);

  const dismissLivePage = useCallback(() => {
    if (livePageClosing) return;
    setLivePageClosing(true);
    window.setTimeout(() => {
      void leaveRoom();
    }, 280);
  }, [livePageClosing, leaveRoom]);

  // Host ended broadcast elsewhere — eject listeners still on this page
  useEffect(() => {
    if (!isHostRoom || amHost || !hostId) return;
    const onEnd = (e: Event) => {
      const d = (e as CustomEvent).detail as { hostId?: string; active?: boolean } | undefined;
      if (!d || d.active !== false) return;
      if (String(d.hostId || '') !== String(hostId)) return;
      if (leftRef.current) return;
      forceEndRef.current = true;
      void leaveRoom({ forced: true });
    };
    window.addEventListener('stooorna:livecam-active', onEnd);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== `stooorna_livecam_active_${hostId}`) return;
      if (e.newValue) return;
      if (leftRef.current) return;
      forceEndRef.current = true;
      void leaveRoom({ forced: true });
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('stooorna:livecam-active', onEnd);
      window.removeEventListener('storage', onStorage);
    };
  }, [isHostRoom, amHost, hostId, leaveRoom]);


  useEffect(() => {
    return () => {
      leftRef.current = true;
      void (async () => {
        try {
          micRef.current?.stop();
          micRef.current?.close();
          micRef.current = null;
          camRef.current?.stop();
          camRef.current?.close();
          camRef.current = null;
          if (clientRef.current) {
            await clientRef.current.leave();
            clientRef.current = null;
          }
        } catch {
          /* ignore */
        }
      })();
    };
  }, []);

  const joinRoom = useCallback(async () => {
    if (!myId || joining || joined) return;
    if (!hostId) {
      setError('Camera live requires a host account room.');
      return;
    }
    leftRef.current = false;
    setJoining(true);
    setError('');
    setStatus('Connecting...');
    try {
      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
      AgoraRTC.setLogLevel(3);

      if (clientRef.current) {
        try {
          await clientRef.current.leave();
        } catch {
          /* ignore */
        }
        clientRef.current = null;
      }

      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      clientRef.current = client;

      const remoteUids = new Set<number>();
      const syncList = () => rebuildMembers([...remoteUids]);

      client.on('user-joined', (remoteUser: IAgoraRTCRemoteUser) => {
        remoteUids.add(remoteUser.uid as number);
        syncList();
      });

      client.on('user-published', async (remoteUser: IAgoraRTCRemoteUser, mediaType: string) => {
        remoteUids.add(remoteUser.uid as number);
        syncList();
        try {
          await client.subscribe(remoteUser, mediaType as 'audio' | 'video');
          if (mediaType === 'audio') {
            const track = remoteUser.audioTrack;
            if (track) {
              remoteTracksRef.current.set(remoteUser.uid as number, track);
              applyTrackPlayback(remoteUser.uid as number, track);
            }
          }
          if (mediaType === 'video' && remoteUser.videoTrack) {
            playRemoteVideo(remoteUser.videoTrack, remoteUser.uid as number);
          }
        } catch {
          /* remote left mid-subscribe */
        }
      });

      client.on('user-unpublished', (remoteUser: IAgoraRTCRemoteUser, mediaType: string) => {
        if (mediaType === 'audio') {
          remoteUser.audioTrack?.stop();
          remoteTracksRef.current.delete(remoteUser.uid as number);
        }
        if (mediaType === 'video') {
          remoteUser.videoTrack?.stop();
          remoteVideoTracksRef.current.delete(remoteUser.uid as number);
          remoteVideoPlacedRef.current.delete(remoteUser.uid as number);
        }
      });

      client.on('user-left', (remoteUser: IAgoraRTCRemoteUser) => {
        remoteUser.audioTrack?.stop();
        remoteUser.videoTrack?.stop();
        remoteTracksRef.current.delete(remoteUser.uid as number);
        revokedUidsRef.current.delete(remoteUser.uid as number);
        remoteUids.delete(remoteUser.uid as number);
        syncList();
        remoteVideoTracksRef.current.delete(remoteUser.uid as number);
        remoteVideoPlacedRef.current.delete(remoteUser.uid as number);
        // DUET-PATCH: the guest left → back to full screen
        if (duetRef.current && duetRef.current.uid === (remoteUser.uid as number)) {
          handleDuetMsgRef.current({ t: 'duet-leave', uid: remoteUser.uid, ts: Date.now() });
        }
        if (isHostRoom && !amHost && hostId) {
          const hostUid = uidFromString(hostId);
          const leftUid = remoteUser.uid as number;
          if (leftUid === hostUid || resolveRemote(leftUid).isHost) {
            forceEndRef.current = true;
            void leaveRoom({ forced: true });
          }
        }
      });

      const onStreamMessage = (...args: any[]) => {
        try {
          let data: any = args.length >= 2 ? args[1] : args[0];
          if (data && typeof data === 'object' && 'data' in data && !ArrayBuffer.isView(data) && !(data instanceof ArrayBuffer)) {
            data = (data as any).data;
          }
          let raw = '';
          if (typeof data === 'string') raw = data;
          else if (data instanceof ArrayBuffer) raw = new TextDecoder().decode(new Uint8Array(data));
          else if (ArrayBuffer.isView(data)) raw = new TextDecoder().decode(data as ArrayBufferView as Uint8Array);
          else if (data != null) raw = String(data);
          raw = raw.replace(/\u0000/g, '').trim();
          if (!raw) return;
          const msg = JSON.parse(raw) as { t?: string; uid?: number; uids?: number[] };
          if (handleDuetMsgRef.current(msg)) return; // DUET-PATCH
          const myUid = myUidRef.current;
          if (msg.t === 'freeze' && msg.uid === myUid) {
            micFrozenRef.current = true;
            setMicFrozenByHost(true);
            void forceMuteLocalMic();
          } else if (msg.t === 'unfreeze' && msg.uid === myUid) {
            micFrozenRef.current = false;
            setMicFrozenByHost(false);
          } else if (msg.t === 'freeze-set' && Array.isArray(msg.uids) && myUid != null) {
            const frozen = msg.uids.includes(myUid);
            if (frozen) {
              micFrozenRef.current = true;
              setMicFrozenByHost(true);
              void forceMuteLocalMic();
            } else if (micFrozenRef.current) {
              micFrozenRef.current = false;
              setMicFrozenByHost(false);
            }
            if (!amHost) {
              const set = new Set(msg.uids.map(Number));
              frozenUidsRef.current = set;
              setFrozenUids(set);
            }
          } else if (msg.t === 'chat') {
            const cm = parseIncomingChat(msg);
            if (cm && cm.uid !== myUid && !(cm.userId && myId && cm.userId === myId)) {
              setLiveChatMsgs(prev => {
                if (prev.some(x => x.id === cm.id)) return prev;
                return [...prev, { ...cm, isMe: false }].slice(-80);
              });
            }
          } else if (msg.t === 'room-ended') {
            if (!amHost && isHostRoom) {
              forceEndRef.current = true;
              setRoomEndedOverlay(true);
              window.setTimeout(() => {
                void leaveRoom({ forced: true });
              }, 1800);
            }
          } else if (msg.t === 'mic-req' && amHost && isHostRoom && msg.uid != null) {
            setMicRequests(prev => {
              if (prev.some(r => r.uid === msg.uid)) return prev;
              return [...prev, {
                uid: Number(msg.uid),
                userId: (msg as any).userId,
                name: String((msg as any).name || 'User'),
                username: (msg as any).username ?? null,
                avatarUrl: (msg as any).avatarUrl ?? null,
                at: Date.now(),
              }].slice(-30);
            });
          } else if ((msg.t === 'mic-grant' || msg.t === 'mic-revoke' || msg.t === 'speakers-set') && isHostRoom) {
            const list = ((msg as any).speakers || msg.uids || []).map(Number);
            const nextSpeakers = new Set(list);
            const prevSpeakers = speakerUidsRef.current;
            // A speaker who lost the mic is hard-muted for every listener
            // right away, instead of relying only on their own device to
            // disable its mic in time.
            prevSpeakers.forEach((prevUid) => {
              if (!nextSpeakers.has(prevUid)) {
                revokedUidsRef.current.add(prevUid);
                const track = remoteTracksRef.current.get(prevUid);
                if (track) applyTrackPlayback(prevUid, track);
              }
            });
            nextSpeakers.forEach((uid) => {
              if (revokedUidsRef.current.has(uid)) {
                revokedUidsRef.current.delete(uid);
                const track = remoteTracksRef.current.get(uid);
                if (track) applyTrackPlayback(uid, track);
              }
            });
            speakerUidsRef.current = nextSpeakers;
            setSpeakerUids(nextSpeakers);
            const me = myUidRef.current;
            if (me != null && !amHost && !amGuest && !list.includes(me)) void forceMuteLocalMic();
          }
        } catch {
          /* ignore bad payload */
        }
      };
      client.on('stream-message' as any, onStreamMessage);
      (client as any).on?.('streamMessage', onStreamMessage);
      try {
        (client as any).on?.('stream-message', onStreamMessage);
        client.on('streamMessage' as any, onStreamMessage);
      } catch {
        /* ignore */
      }

      client.enableAudioVolumeIndicator();
      client.on('volume-indicator', (vols: Array<{ uid: number; level: number }>) => {
        setSpeakingUids(new Set(vols.filter(v => v.level > 5).map(v => v.uid)));
      });

      setStatus('Fetching token...');
      let token: string | null;
      let uid: number;
      let appId: string = AGORA_APP_ID;
      try {
        const t = await fetchToken(channelName, myId);
        token = t.token;
        uid = t.uid;
        appId = t.appId || AGORA_APP_ID;
      } catch (tokenErr: any) {
        console.warn('[LiveCamera] token fetch failed, trying null token', tokenErr);
        token = null;
        uid = uidFromString(myId);
        appId = AGORA_APP_ID;
      }
      myUidRef.current = uid;
      setStatus('Joining channel...');
      await client.join(appId, channelName, token, uid);

      try {
        const streamId = await (client as any).createDataStream?.({ reliable: true, ordered: true });
        if (typeof streamId === 'number') dataStreamIdRef.current = streamId;
        else if (streamId === true || streamId === 0) dataStreamIdRef.current = 0;
      } catch {
        dataStreamIdRef.current = null;
      }
      if (amHost) {
        const freezeBroadcast = window.setInterval(() => {
          if (leftRef.current || !clientRef.current) {
            window.clearInterval(freezeBroadcast);
            return;
          }
          void sendDataPayload({
            t: 'freeze-set',
            uids: [...frozenUidsRef.current],
            host: myUidRef.current,
            ts: Date.now(),
          });
        }, 2000);
        (client as any).__freezeBroadcast = freezeBroadcast;
      }

      for (const u of client.remoteUsers) {
        remoteUids.add(u.uid as number);
        if (u.hasAudio) {
          try {
            await client.subscribe(u, 'audio');
            if (u.audioTrack) {
              remoteTracksRef.current.set(u.uid as number, u.audioTrack);
              applyTrackPlayback(u.uid as number, u.audioTrack);
            }
          } catch {
            /* ignore */
          }
        }
        if (u.hasVideo) {
          try {
            await client.subscribe(u, 'video');
            if (u.videoTrack) playRemoteVideo(u.videoTrack, u.uid as number);
          } catch {
            /* ignore */
          }
        }
      }
      syncList();

      setStatus('Enabling camera...');
      const mic = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: { sampleRate: 48000, stereo: false, bitrate: 48 },
        AEC: true,
        ANS: true,
        AGC: true,
      });
      micRef.current = mic;
      const startLive = amHost || amGuest; // DUET-PATCH
      await mic.setEnabled(true);
      try {
        mic.setMuted(false);
      } catch {
        /* ignore */
      }

      const tracksToPublish: any[] = [mic];
      if (amHost || amGuest) {
        const cam = await AgoraRTC.createCameraVideoTrack({
          facingMode: 'user',
          encoderConfig: '720p_2',
        });
        camRef.current = cam;
        await cam.setEnabled(true);
        tracksToPublish.push(cam);
      }

      await client.publish(tracksToPublish);
      if (amHost || amGuest) {
        window.setTimeout(() => playLocalVideo(), 60);
      }

      if (!startLive) {
        try {
          mic.setMuted(true);
        } catch {
          try {
            await mic.setEnabled(false);
          } catch {
            /* ignore */
          }
        }
      }
      micOnRef.current = startLive;
      setMicOn(startLive);
      camOnRef.current = amHost || amGuest;
      setCamOn(amHost || amGuest);

      setJoined(true);
      setStatus('');
      setJoining(false);
      // DUET-PATCH: guest announces itself to the room → split screen on every device
      if (amGuest && myId) {
        const g: DuetGuest = { uid, userId: myId, name: myName, username: myUsername, avatarUrl: myAvatar };
        duetRef.current = g;
        setDuet(g);
        const sendJoin = () => {
          if (leftRef.current) return;
          void sendDataPayload({ t: 'duet-join', uid, guest: g, ts: Date.now() });
        };
        sendJoin();
        window.setTimeout(sendJoin, 800);
        window.setTimeout(sendJoin, 2000);
      }
      if (amHost) {
        const seed = new Set<number>([uid]);
        speakerUidsRef.current = seed;
        setSpeakerUids(seed);
        void sendDataPayload({
          t: 'speakers-set',
          uids: [uid],
          host: uid,
          ts: Date.now(),
        });
      }

      try {
        await fetch('/api/room/join', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: channelName,
            userId: myId,
            name: myName,
            username: myUsername,
            avatarUrl: myAvatar,
          }),
        });
      } catch {
        /* ignore */
      }

      try {
        if (amHost && isHostRoom) {
          const activeHost = hostId || myId || '';
          if (activeHost) {
            publishLiveActive({
              hostId: activeHost,
              kind: 'camera',
              active: true,
              channel: channelName,
              hostName: hostName || myName,
              hostUsername: hostUsername || myUsername,
              hostAvatar: hostAvatar || myAvatar,
            });
          }
        }
      } catch {
        /* ignore */
      }
    } catch (err: any) {
      console.error('[LiveCamera]', err);
      setError(String(err?.message ?? err));
      setJoining(false);
      setStatus('');
    }
  }, [
    myId,
    joining,
    joined,
    rebuildMembers,
    applyTrackPlayback,
    channelName,
    amHost,
    amGuest,
    hostId,
    forceMuteLocalMic,
    sendDataPayload,
    playLocalVideo,
    playRemoteVideo,
    myName,
    myUsername,
    myAvatar,
  ]);

  useEffect(() => {
    if (!micFrozenByHost) return;
    void forceMuteLocalMic();
    const id = window.setInterval(() => {
      if (micFrozenRef.current) void forceMuteLocalMic();
    }, 800);
    return () => window.clearInterval(id);
  }, [micFrozenByHost, forceMuteLocalMic]);

  // DUET-PATCH: (re)attach local + remote video whenever the layout changes (single ↔ split screen)
  useEffect(() => {
    if (!joined) return;
    if (amHost || amGuest) playLocalVideo();
    placeRemoteVideos();
  }, [joined, amHost, amGuest, duet?.uid, playLocalVideo, placeRemoteVideos]);

  // Keep presence alive for profile visitors (local + event)
  useEffect(() => {
    if (!joined || !amHost || !hostId) return;
    const tick = () => {
      try {
        const payload = JSON.stringify({
          hostId,
          channel: channelName,
          at: Date.now(),
          active: true,
          kind: 'camera',
          hostName: hostName || myName,
          hostUsername: hostUsername || myUsername,
          hostAvatar: hostAvatar || myAvatar,
        });
        localStorage.setItem(`stooorna_livecam_active_${hostId}`, payload);
        localStorage.setItem('stooorna_livecam_active_current', payload);
        window.dispatchEvent(new CustomEvent('stooorna:livecam-active', {
          detail: {
            hostId,
            active: true,
            channel: channelName,
            kind: 'camera',
            hostName: hostName || myName,
            hostUsername: hostUsername || myUsername,
            hostAvatar: hostAvatar || myAvatar,
          },
        }));
      } catch { /* ignore */ }
    };
    tick();
    const id = window.setInterval(tick, 8000);
    return () => window.clearInterval(id);
  }, [joined, amHost, hostId, channelName, hostName, hostUsername, hostAvatar, myName, myUsername, myAvatar]);

  
  // ── Public live presence (story ring / feed) — server heartbeat every 8s ──
  useEffect(() => {
    if (!joined) return;
    const activeHost = String(hostId || myId || '');
    if (!activeHost) return;
    const amPublisher = typeof amHost !== 'undefined' ? amHost : true;
    if (!amPublisher && typeof isHostRoom !== 'undefined' && isHostRoom) return;
    const post = (active: boolean) => {
      try {
        void fetch('/api/live-presence', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hostId: activeHost,
            kind: 'camera',
            active,
            channel: typeof channelName !== 'undefined' ? channelName : undefined,
            hostName: typeof hostName !== 'undefined' ? hostName : undefined,
            hostUsername: typeof hostUsername !== 'undefined' ? hostUsername : undefined,
            hostAvatar: typeof hostAvatar !== 'undefined' ? hostAvatar : undefined,
          }),
          keepalive: true,
        }).catch(() => {});
      } catch { /* */ }
    };
    post(true);
    const id = window.setInterval(() => post(true), 8000);
    const onVis = () => { if (document.visibilityState === 'visible') post(true); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      post(false);
    };
  }, [joined, hostId, myId]);


  const toggleMic = async () => {
    if (!micRef.current || !joined) return;
    if (micFrozenRef.current || micFrozenByHost) {
      void forceMuteLocalMic();
      setError('Mic frozen by host');
      return;
    }
    if (!amHost && !amGuest) {
      const allowed = speakerUidsRef.current.has(myUidRef.current || -1);
      if (!allowed) {
        if (myUidRef.current == null) return;
        setMicRequested(true);
        await sendDataPayload(makeMicRequestPayload({
          uid: myUidRef.current,
          userId: myId,
          name: myName,
          username: myUsername,
          avatarUrl: myAvatar,
        }));
        setError('Mic request sent to host');
        return;
      }
    }
    const next = !micOn;
    try {
      if (next) {
        try {
          await micRef.current.setEnabled(true);
        } catch {
          /* already on */
        }
        try {
          micRef.current.setMuted(false);
        } catch {
          /* ignore */
        }
      } else {
        try {
          await micRef.current.setEnabled(false);
        } catch {
          try {
            micRef.current.setMuted(true);
          } catch {
            /* ignore */
          }
        }
      }
      micOnRef.current = next;
      setMicOn(next);
      setError('');
    } catch (err: any) {
      setError(String(err?.message ?? err));
    }
  };

  const toggleCam = async () => {
    if ((!amHost && !amGuest) || !camRef.current || !joined) return;
    const next = !camOn;
    try {
      await camRef.current.setEnabled(next);
      camOnRef.current = next;
      setCamOn(next);
      if (next) window.setTimeout(() => playLocalVideo(), 40);
    } catch (err: any) {
      setError(String(err?.message ?? err));
    }
  };

  const switchFacing = async () => {
    if ((!amHost && !amGuest) || !joined) return;
    const next = facingMode === 'user' ? 'environment' : 'user';
    const client = clientRef.current;
    const oldCam = camRef.current;
    try {
      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;

      // Prefer setDevice on the same track (avoids dual-publish)
      try {
        const cameras = await AgoraRTC.getCameras();
        const prefer = (label: string) => {
          const l = label.toLowerCase();
          if (next === 'environment') {
            return l.includes('back') || l.includes('rear') || l.includes('environment') || l.includes('world');
          }
          return l.includes('front') || l.includes('user') || l.includes('face') || l.includes('facing');
        };
        const match = cameras.find((d: MediaDeviceInfo) => prefer(d.label || ''));
        const fallback = cameras.find((d: MediaDeviceInfo) => {
          if (!oldCam) return !!d.deviceId;
          try {
            const cur = (oldCam as any).getTrack?.()?.getSettings?.()?.deviceId;
            return d.deviceId && d.deviceId !== cur;
          } catch {
            return !!d.deviceId;
          }
        });
        const target = match || fallback;
        if (oldCam && target?.deviceId && typeof (oldCam as any).setDevice === 'function') {
          await (oldCam as any).setDevice(target.deviceId);
          setFacingMode(next);
          camOnRef.current = true;
          setCamOn(true);
          window.setTimeout(() => playLocalVideo(), 40);
          setError('');
          return;
        }
      } catch {
        /* fall through to unpublish + recreate */
      }

      // Must unpublish the old video track before publishing a new one
      if (client && oldCam) {
        try {
          await client.unpublish([oldCam]);
        } catch {
          /* ignore */
        }
      }
      if (oldCam) {
        try {
          oldCam.stop();
        } catch {
          /* ignore */
        }
        try {
          oldCam.close();
        } catch {
          /* ignore */
        }
      }
      camRef.current = null;

      const cam = await AgoraRTC.createCameraVideoTrack({
        facingMode: next,
        encoderConfig: '720p_2',
      });
      camRef.current = cam;
      if (client) await client.publish([cam]);
      setFacingMode(next);
      camOnRef.current = true;
      setCamOn(true);
      window.setTimeout(() => playLocalVideo(), 40);
      setError('');
    } catch (err: any) {
      setError(String(err?.message ?? err));
    }
  };

  const toggleSpeakerMute = () => {
    const next = !speakerMuted;
    speakerMutedRef.current = next;
    setSpeakerMuted(next);
    remoteTracksRef.current.forEach((track, uid) => {
      applyTrackPlayback(uid, track);
    });
  };

  const toggleUserListenMute = (uid: number, isMe?: boolean) => {
    if (isMe) return;
    setMutedUids(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      mutedUidsRef.current = next;
      const track = remoteTracksRef.current.get(uid);
      if (track) applyTrackPlayback(uid, track);
      return next;
    });
  };

  const applySpeakerList = useCallback((uids: number[]) => {
    const next = new Set(uids.map(Number).filter(n => Number.isFinite(n)));
    const prev = speakerUidsRef.current;
    // A speaker who lost the mic is hard-muted for every listener right
    // away, instead of relying only on their own device to disable its
    // mic in time.
    prev.forEach((prevUid) => {
      if (!next.has(prevUid)) {
        revokedUidsRef.current.add(prevUid);
        const track = remoteTracksRef.current.get(prevUid);
        if (track) applyTrackPlayback(prevUid, track);
      }
    });
    next.forEach((uid) => {
      if (revokedUidsRef.current.has(uid)) {
        revokedUidsRef.current.delete(uid);
        const track = remoteTracksRef.current.get(uid);
        if (track) applyTrackPlayback(uid, track);
      }
    });
    speakerUidsRef.current = next;
    setSpeakerUids(next);
    const me = myUidRef.current;
    if (me == null || amHost || amGuest) return;
    if (!next.has(me) || frozenUidsRef.current.has(me)) {
      setMicRequested(false);
      void forceMuteLocalMic();
    }
  }, [amHost, amGuest, forceMuteLocalMic, applyTrackPlayback]);

  const hostSetSpeaker = useCallback(async (uid: number, grant: boolean) => {
    if (!amHost) return;
    const next = new Set(speakerUidsRef.current);
    if (grant) {
      if (frozenUidsRef.current.has(uid)) return;
      {
        const who = membersRef.current.find(x => x.uid === uid);
        const wk = who ? micPersonKey(who) : '';
        if (wk) for (const x of membersRef.current) { if (x.uid !== uid && !x.isHost && micPersonKey(x) === wk) next.delete(x.uid); }
      }
      if (!canGrantSpeaker(next, uid, hostId)) {
        setError(`Max ${micCap} speakers`);
        return;
      }
      next.add(uid);
    } else {
      next.delete(uid);
      {
        const who = membersRef.current.find(x => x.uid === uid);
        const wk = who ? micPersonKey(who) : '';
        if (wk) for (const x of membersRef.current) { if (!x.isHost && micPersonKey(x) === wk) next.delete(x.uid); }
      }
    }
    speakerUidsRef.current = next;
    setSpeakerUids(next);
    setMicRequests(prev => prev.filter(r => r.uid !== uid));
    await sendDataPayload({
      t: grant ? 'mic-grant' : 'mic-revoke',
      uid,
      uids: [...next],
      speakers: [...next],
      host: myUidRef.current,
      ts: Date.now(),
    });
    await sendDataPayload({
      t: 'speakers-set',
      uids: [...next],
      host: myUidRef.current,
      ts: Date.now(),
    });
  }, [amHost, sendDataPayload]);

  const applyIncomingSignal = useCallback((msg: LiveSignal) => {
    if (handleDuetMsgRef.current(msg)) return; // DUET-PATCH
    const myUid = myUidRef.current;
    if (msg.t === 'freeze' && msg.uid === myUid) {
      micFrozenRef.current = true;
      setMicFrozenByHost(true);
      void forceMuteLocalMic();
    } else if (msg.t === 'unfreeze' && msg.uid === myUid) {
      micFrozenRef.current = false;
      setMicFrozenByHost(false);
    } else if (msg.t === 'freeze-set' && Array.isArray(msg.uids) && myUid != null) {
      const frozen = msg.uids.includes(myUid);
      if (frozen) {
        micFrozenRef.current = true;
        setMicFrozenByHost(true);
        void forceMuteLocalMic();
      } else if (micFrozenRef.current) {
        micFrozenRef.current = false;
        setMicFrozenByHost(false);
      }
      if (!amHost) {
        const set = new Set(msg.uids.map(Number));
        frozenUidsRef.current = set;
        setFrozenUids(set);
      }
    } else if (msg.t === 'chat') {
      const cm = parseIncomingChat(msg);
      if (cm && cm.uid !== myUid && !(cm.userId && myId && cm.userId === myId)) {
        setLiveChatMsgs(prev => {
          if (prev.some(x => x.id === cm.id)) return prev;
          return [...prev, { ...cm, isMe: false }].slice(-80);
        });
      }
    } else if (msg.t === 'room-ended') {
      if (!amHost && isHostRoom) {
        forceEndRef.current = true;
        setRoomEndedOverlay(true);
        window.setTimeout(() => {
          void leaveRoom({ forced: true });
        }, 1800);
      }
    } else if (msg.t === 'mic-req' && amHost && msg.uid != null) {
      if (frozenUidsRef.current.has(msg.uid)) return;
      setMicRequests(prev => {
        if (prev.some(r => r.uid === msg.uid)) return prev;
        return [...prev, {
          uid: Number(msg.uid),
          userId: msg.userId,
          name: msg.name || `User ${msg.uid}`,
          username: msg.username ?? null,
          avatarUrl: msg.avatarUrl ?? null,
          at: Number(msg.at || Date.now()),
        }].slice(-30);
      });
    } else if (msg.t === 'mic-grant' || msg.t === 'mic-revoke' || msg.t === 'speakers-set') {
      const list = (msg.speakers || msg.uids || []).map(Number);
      applySpeakerList(list);
      if (msg.t === 'mic-grant' && msg.uid === myUid) {
        setMicRequested(false);
        setError('');
      }
    }
  }, [amHost, isHostRoom, myId, forceMuteLocalMic, leaveRoom, applySpeakerList]);

  const toggleHostFreeze = (uid: number, isMe?: boolean) => {
    if (!amHost || isMe) return;
    setFrozenUids(prev => {
      const next = new Set(prev);
      const freeze = !next.has(uid);
      if (freeze) next.add(uid);
      else next.delete(uid);
      frozenUidsRef.current = next;
      void sendFreezeCmd(uid, freeze);
      return next;
    });
  };

  const sendLiveChat = async () => {
    const raw = liveChatText.trim();
    if (!raw || myUidRef.current == null) return;
    const payload = makeChatPayload({
      uid: myUidRef.current,
      userId: myId,
      name: myName,
      username: myUsername,
      avatarUrl: myAvatar,
      text: raw,
    });
    setLiveChatText('');
    setLiveChatMsgs(prev => {
      if (prev.some(x => x.id === payload.id)) return prev;
      return [...prev, { ...payload, isMe: true }].slice(-80);
    });
    publishLiveChat(channelName, payload);
    await sendDataPayload(payload);
    try {
      liveChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch { /* ignore */ }
  };

  const chatInitScrollRef = useRef(false);
  useEffect(() => {
    if (!liveChatOpen) { chatInitScrollRef.current = false; return; }
    if (liveChatMsgs.length === 0) return;
    try {
      const end = liveChatEndRef.current;
      const box = end?.parentElement;
      const first = !chatInitScrollRef.current;
      chatInitScrollRef.current = true;
      const near = !!box && box.scrollHeight - box.scrollTop - box.clientHeight < 90;
      const last = liveChatMsgs[liveChatMsgs.length - 1];
      // Follow new messages only when the reader is at the bottom (or it is my own message): scrolling up to read old ones is never interrupted.
      if (first || near || last?.isMe) end?.scrollIntoView({ behavior: first ? 'auto' : 'smooth' });
    } catch { /* ignore */ }
  }, [liveChatMsgs, liveChatOpen]);

  // Mic protection: while I hold the mic a refresh must not drop me silently.
  const [leaveMicAsk, setLeaveMicAsk] = useState(false);
  const iHoldMic = !!joined && !amHost && myUidRef.current != null && speakerUids.has(myUidRef.current as number);
  useEffect(() => {
    if (!iHoldMic) return;
    const onBefore = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; return ''; };
    window.addEventListener('beforeunload', onBefore);
    const onKey = (e: KeyboardEvent) => {
      const k = String(e.key || '').toLowerCase();
      if (k === 'f5' || ((e.ctrlKey || e.metaKey) && k === 'r')) { e.preventDefault(); setLeaveMicAsk(true); }
    };
    window.addEventListener('keydown', onKey);
    const html = document.documentElement;
    const body = document.body;
    const prevH = html.style.overscrollBehaviorY;
    const prevB = body.style.overscrollBehaviorY;
    html.style.overscrollBehaviorY = 'contain';   // blocks pull-to-refresh
    body.style.overscrollBehaviorY = 'contain';
    return () => {
      window.removeEventListener('beforeunload', onBefore);
      window.removeEventListener('keydown', onKey);
      html.style.overscrollBehaviorY = prevH;
      body.style.overscrollBehaviorY = prevB;
    };
  }, [iHoldMic]);

  useEffect(() => {
    if (!joined || !channelName) return;
    const unsubChat = subscribeLiveChat(channelName, (cm) => {
      const myUid = myUidRef.current;
      if (cm.uid === myUid || (cm.userId && myId && cm.userId === myId)) return;
      setLiveChatMsgs(prev => {
        if (prev.some(x => x.id === cm.id)) return prev;
        return [...prev, { ...cm, isMe: false }].slice(-80);
      });
    });
    const unsubSig = subscribeLiveSignals(channelName, (msg) => {
      applyIncomingSignal(msg);
    });
    return () => {
      unsubChat();
      unsubSig();
    };
  }, [joined, channelName, myId, applyIncomingSignal]);

  const [speakerMenu, setSpeakerMenu] = useState<Member | null>(null);
  const supportLeaders = useSupportLeaders();

  // من معه المايك (صاحب البث أعطاه) — فقط هؤلاء ينعطون دعم من المشاهدين/صاحب البث
  const isMicHolder = (m: Member) =>
    !!m.userId && !m.isHost && !m.isMe && (speakerUidsRef.current.has(m.uid) || speakingUids.has(m.uid));

  // نرسل للـ Dock قائمة من معهم المايك (عشان يمنع أي دعم لغيرهم)
  useEffect(() => {
    const publish = () => {
      const ids = members.filter(m => !!m.userId && !m.isHost && (speakerUidsRef.current.has(m.uid) || speakingUids.has(m.uid))).map(m => String(m.userId));
      window.dispatchEvent(new CustomEvent('stooorna:live-speakers', { detail: { userIds: ids } }));
    };
    publish();
    const iv = window.setInterval(publish, 2000);
    return () => window.clearInterval(iv);
  }, [members, speakingUids, frozenUids]);

  const onMemberTap = (m: Member) => {
    if (m.isMe) return;
    // صاحب البث: متحدث (ياخذ المايك) → قائمة (دعم / تجميد). غير المتحدث → تجميد مباشرة مثل قبل
    if (amHost) {
      if (isMicHolder(m) && m.userId !== myId) {
        setSpeakerMenu(m);
        return;
      }
      toggleHostFreeze(m.uid, m.isMe);
      return;
    }
    // المشاهد: متحدث → قائمة (دعم / كتم محلي). غيره → كتم محلي فقط مثل قبل
    if (isMicHolder(m)) {
      setSpeakerMenu(m);
      return;
    }
    toggleUserListenMute(m.uid, m.isMe);
  };

  // ───────── DUET-PATCH: invite / accept / split screen ─────────
  const duetMe: DuetPerson = { userId: myId || '', name: myName, username: myUsername, avatarUrl: myAvatar };

  const showDuetToast = (text: string) => {
    setDuetToast(text);
    if (duetToastTimerRef.current) window.clearTimeout(duetToastTimerRef.current);
    duetToastTimerRef.current = window.setTimeout(() => setDuetToast(''), 3200);
  };

  const applyDuetGuest = (g: DuetGuest | null) => {
    if ((duetRef.current?.uid ?? null) === (g?.uid ?? null)) return;
    duetRef.current = g;
    setDuet(g);
    if (g) {
      friendsByUidRef.current.set(g.uid, { userId: g.userId, name: g.name, username: g.username, avatarUrl: g.avatarUrl });
    }
  };

  const toDuetGuest = (raw: any, uidFallback?: unknown): DuetGuest | null => {
    const uid = Number(raw?.uid ?? uidFallback);
    if (!raw?.userId || !Number.isFinite(uid)) return null;
    return {
      uid,
      userId: String(raw.userId),
      name: String(raw.name || raw.username || 'User'),
      username: raw.username ?? null,
      avatarUrl: raw.avatarUrl ?? null,
    };
  };

  const toDuetPerson = (raw: any): DuetPerson | null => {
    if (!raw?.userId) return null;
    return {
      userId: String(raw.userId),
      name: String(raw.name || raw.username || 'User'),
      username: raw.username ?? null,
      avatarUrl: raw.avatarUrl ?? null,
    };
  };

  /** Host: invite someone who is live on camera right now. */
  const inviteToDuet = (p: AvailableLive) => {
    if (!amHost || !myId || duetRef.current) return;
    const id = newDuetId(myId);
    duetSentIdsRef.current[p.userId] = id;
    setDuetSent(prev => ({ ...prev, [p.userId]: Date.now() }));
    const payload = { t: 'duet-invite', id, to: p.userId, from: duetMe, ts: Date.now() };
    const ch = camChannelForHost(p.userId);
    sendDuetSignal(ch, payload);
    window.setTimeout(() => sendDuetSignal(ch, payload), 1200); // receiver de-dupes by id
  };

  const cancelDuetInvite = (p: AvailableLive) => {
    const id = duetSentIdsRef.current[p.userId];
    setDuetSent(prev => { const n = { ...prev }; delete n[p.userId]; return n; });
    if (id) sendDuetSignal(camChannelForHost(p.userId), { t: 'duet-cancel', id, to: p.userId, ts: Date.now() });
  };

  /** Invited user: Decline (also used when the 30s timer runs out). */
  const declineDuetInvite = () => {
    const inv = duetIncomingRef.current;
    if (!inv) return;
    duetIncomingRef.current = null;
    setDuetIncoming(null);
    sendDuetSignal(camChannelForHost(inv.from.userId), {
      t: 'duet-decline', id: inv.id, to: inv.from.userId, from: duetMe, ts: Date.now(),
    });
  };

  /** Invited user: Accept → leave my own live (my viewers follow) and join the inviter's room as a guest. */
  const acceptDuetInvite = async () => {
    const inv = duetIncomingRef.current;
    if (!inv || !myId) return;
    duetIncomingRef.current = null;
    setDuetIncoming(null);
    sendDuetSignal(camChannelForHost(inv.from.userId), {
      t: 'duet-accept', id: inv.id, to: inv.from.userId, from: duetMe, ts: Date.now(),
    });
    await leaveRoom({
      skipNavigate: true,
      duetMove: {
        toHostId: inv.from.userId,
        toName: inv.from.name,
        toUsername: inv.from.username,
        toAvatar: inv.from.avatarUrl,
      },
    });
    navigate(duetRoomUrl(inv.from, true), { replace: true });
  };

  /** Host: close the split screen. */
  const endDuet = () => {
    const g = duetRef.current;
    if (!g) return;
    const ts = Date.now();
    duetSetTsRef.current = ts;
    void sendDataPayload({ t: 'duet-end', uid: g.uid, ts });
    void sendDataPayload({ t: 'duet-set', guest: null, ts: ts + 1 });
    applyDuetGuest(null);
  };

  // One handler for every duet message (Agora data stream + signal transport) — latest closure via ref.
  handleDuetMsgRef.current = (msg: any): boolean => {
    if (!isDuetMessage(msg)) return false;
    // The server keeps the last signals of a room in memory (no expiry), so old duet messages can be replayed
    // to someone who joins later → ignore anything stale (invites live 30s, the rest 30s too).
    const stamp = Number(msg.at) || Number(msg.ts) || 0;
    if (stamp && Date.now() - stamp > (msg.t === 'duet-invite' ? 45_000 : 30_000)) return true;
    const ts = Number(msg.ts) || Date.now();
    const myUid = myUidRef.current;

    switch (msg.t) {
      case 'duet-invite': {
        if (!amHost || !myId || String(msg.to) !== String(myId)) return true;
        const id = String(msg.id || '');
        const from = toDuetPerson(msg.from);
        if (!id || !from || from.userId === myId || duetSeenRef.current.has(id)) return true;
        duetSeenRef.current.add(id);
        if (duetRef.current || duetIncomingRef.current) {
          sendDuetSignal(camChannelForHost(from.userId), {
            t: 'duet-decline', id, to: from.userId, from: duetMe, busy: true, ts: Date.now(),
          });
          return true;
        }
        const inv: DuetInvite = { id, from, at: Date.now() };
        duetIncomingRef.current = inv;
        setDuetIncoming(inv);
        return true;
      }
      case 'duet-cancel': {
        if (String(msg.to) === String(myId) && duetIncomingRef.current?.id === msg.id) {
          duetIncomingRef.current = null;
          setDuetIncoming(null);
        }
        return true;
      }
      case 'duet-decline': {
        if (!amHost || String(msg.to) !== String(myId)) return true;
        const who = toDuetPerson(msg.from);
        if (who) setDuetSent(prev => { const n = { ...prev }; delete n[who.userId]; return n; });
        showDuetToast(`${who?.name || 'User'} ${msg.busy ? 'is busy' : 'declined'}`);
        return true;
      }
      case 'duet-accept': {
        if (!amHost || String(msg.to) !== String(myId)) return true;
        const who = toDuetPerson(msg.from);
        showDuetToast(`${who?.name || 'User'} accepted — joining…`);
        return true;
      }
      case 'duet-join': {
        const g = toDuetGuest(msg.guest, msg.uid);
        if (!g) return true;
        const isNew = duetRef.current?.uid !== g.uid;
        applyDuetGuest(g);
        if (amHost && isNew) {
          // the guest may speak: add to the speakers list for everyone
          const next = new Set(speakerUidsRef.current);
          next.add(g.uid);
          speakerUidsRef.current = next;
          setSpeakerUids(next);
          void sendDataPayload({ t: 'mic-grant', uid: g.uid, uids: [...next], speakers: [...next], host: myUid, ts: Date.now() });
          void sendDataPayload({ t: 'speakers-set', uids: [...next], host: myUid, ts: Date.now() });
          setDuetPanelOpen(false);
          setDuetSent({});
          showDuetToast(`${g.name} joined`);
        }
        return true;
      }
      case 'duet-set': {
        if (ts < duetSetTsRef.current) return true; // stale
        duetSetTsRef.current = ts;
        if (amHost) return true; // the host is the source of truth
        const g = toDuetGuest(msg.guest);
        // a guest never drops itself on a "null" set — it leaves on duet-end
        if (!g && amGuest) return true;
        applyDuetGuest(g);
        return true;
      }
      case 'duet-end': {
        if (amGuest) {
          if (msg.uid == null || Number(msg.uid) === myUid) {
            applyDuetGuest(null);
            if (!leftRef.current) void leaveRoom();
          }
          return true;
        }
        applyDuetGuest(null);
        return true;
      }
      case 'duet-leave': {
        const cur = duetRef.current;
        if (cur && Number(msg.uid) === cur.uid) {
          applyDuetGuest(null);
          if (amHost) {
            const t2 = Date.now();
            duetSetTsRef.current = t2;
            void sendDataPayload({ t: 'duet-set', guest: null, ts: t2 });
          }
        }
        return true;
      }
      case 'duet-moved': {
        // the host of this room just joined another live → follow them
        if (amHost || amGuest || leftRef.current) return true;
        if (String(msg.hostId) !== String(hostId)) return true;
        const dest = toDuetPerson({
          userId: msg.toHostId, name: msg.toName, username: msg.toUsername, avatarUrl: msg.toAvatar,
        });
        if (!dest) return true;
        void (async () => {
          await leaveRoom({ forced: true, skipNavigate: true });
          navigate(duetRoomUrl(dest, false), { replace: true });
        })();
        return true;
      }
      default:
        return true;
    }
  };

  // Host keeps the room's split-screen state fresh for late joiners (viewers who arrive after the duet started)
  useEffect(() => {
    if (!joined || !amHost || !duet) return;
    const send = () => {
      const ts = Date.now();
      duetSetTsRef.current = ts;
      void sendDataPayload({ t: 'duet-set', guest: duetRef.current, ts });
    };
    send();
    const id = window.setInterval(send, 2500);
    return () => window.clearInterval(id);
  }, [joined, amHost, duet?.uid, sendDataPayload]);

  useEffect(() => {
    const id = window.setTimeout(() => setEnterGateDone(true), 5000);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!enterGateDone || !myId || joined || joining) return;
    void joinRoom();
  }, [enterGateDone, myId, joined, joining, joinRoom]);

  if (!joined) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 'calc(52px + env(safe-area-inset-bottom))',
          zIndex: 1000,
          background: 'radial-gradient(ellipse 70% 60% at 50% 30%, #0d2a2e 0%, #0a1a1a 50%, #060e0e 100%)',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'var(--font-sans)',
          color: '#fff',
          transform: livePageClosing ? 'translateY(110%)' : 'translateY(0)',
          opacity: livePageClosing ? 0 : 1,
          transition: 'transform 280ms ease-in, opacity 220ms ease-in',
        }}
      >
        <Helmet>
          <title>{roomTitle} — Camera LIVE</title>
          <meta name="robots" content="noindex" />
        </Helmet>
        <style>{`
          @keyframes stooornaLiveSpin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes stooornaLivePulse {
            0%,100% { box-shadow: 0 0 12px rgba(0,188,212,0.25); }
            50% { box-shadow: 0 0 28px rgba(0,188,212,0.55); }
          }
        `}</style>
        <div style={{
          padding: 'max(env(safe-area-inset-top,0px),14px) 14px 8px',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        }}>
          <button type="button" onClick={dismissLivePage} aria-label="Leave live"
            style={{
              width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
              background: 'rgba(239,68,68,0.16)', border: '1px solid rgba(239,68,68,0.5)',
              color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            }}>
            <LogOut size={17} strokeWidth={2.4} />
          </button>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
          <div style={{
            width: 92, height: 92, borderRadius: '50%',
            border: '3px solid rgba(0,188,212,0.18)',
            borderTopColor: '#00BCD4',
            borderRightColor: 'rgba(239,68,68,0.85)',
            animation: 'stooornaLiveSpin 0.9s linear infinite, stooornaLivePulse 1.6s ease-in-out infinite',
          }} />
          <p style={{ margin: 0, color: '#00BCD4', fontWeight: 800, fontSize: '0.95rem' }}>
            {amHost ? 'Opening your camera live…' : `Entering ${hostName} live…`}
          </p>
          {error ? <p style={{ margin: 0, color: '#ef4444', fontSize: '0.78rem' }}>{error}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 'calc(52px + env(safe-area-inset-bottom))',
        zIndex: 1000,
        transform: livePageClosing ? 'translateY(110%)' : 'translateY(0)',
        opacity: livePageClosing ? 0 : 1,
        transition: 'transform 280ms ease-in, opacity 220ms ease-in',
        background: '#060e0e',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-sans)',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      <Helmet>
        <title>{roomTitle} — Camera LIVE</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* DUET-PATCH: left = room host, right = duet guest (yellow divider) */}
      <div style={{ position: 'absolute', inset: 0, background: '#000', zIndex: 0, display: 'flex' }}>
        <div style={{ flex: 1, minWidth: 0, height: '100%', position: 'relative', overflow: 'hidden' }}>
          <div ref={hostPaneRef} style={{ width: '100%', height: '100%' }} />
          {!camOn && amHost ? (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', background: '#0a1416', color: 'rgba(200,230,230,0.7)',
              fontWeight: 800,
            }}>
              Camera off
            </div>
          ) : null}
          {duet ? <DuetNameTag name={hostName} username={hostUsername} /> : null}
        </div>
        {duet ? (
          <>
            <DuetDivider />
            <div style={{ flex: 1, minWidth: 0, height: '100%', position: 'relative', overflow: 'hidden' }}>
              <div ref={guestPaneRef} style={{ width: '100%', height: '100%' }} />
              {!camOn && amGuest ? (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', background: '#0a1416', color: 'rgba(200,230,230,0.7)',
                  fontWeight: 800,
                }}>
                  Camera off
                </div>
              ) : null}
              <DuetNameTag name={duet.name} username={duet.username} />
            </div>
          </>
        ) : null}
      </div>

      <div
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: 'max(env(safe-area-inset-top,0px),14px) 14px 8px',
          flexShrink: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.62) 0%, transparent 100%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          {(() => {
            const hostUid = hostId ? uidFromString(hostId) : null;
            const hostInRoom = amHost || members.some(m => m.isHost || (hostUid != null && m.uid === hostUid));
            const hostTalking = amHost
              ? (!!myUidRef.current && speakingUids.has(myUidRef.current) && micOn && !micFrozenByHost)
              : (hostUid != null && speakingUids.has(hostUid));
            const hostBusy = !hostTalking;
            const ring = hostTalking ? '#22c55e' : '#facc15';
            const dot = !hostInRoom ? '#9ca3af' : hostTalking ? '#22c55e' : '#ef4444';
            return (
              <>
                <button
                  type="button"
                  onClick={openHostPosts}
                  aria-label="Host posts"
                  data-gift-host="1"
                  style={{
                    padding: 0,
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    flexShrink: 0,
                    borderRadius: '50%',
                    position: 'relative',
                  }}
                >
                  <UserAvatar
                      name={hostName}
                      avatarUrl={hostAvatar}
                      size={40}
                      style={{
                        borderRadius: '50%',
                        border: `2.5px solid ${ring}`,
                        boxShadow: hostTalking
                          ? `0 0 0 1px ${ring}33, 0 0 10px ${ring}55`
                          : '0 0 10px rgba(250,204,21,0.45)',
                        flexShrink: 0,
                      }}
                    />
                  <span
                    title={!hostInRoom ? 'Away' : hostBusy ? 'Busy' : 'Online'}
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      width: 11,
                      height: 11,
                      borderRadius: '50%',
                      background: dot,
                      border: '2px solid #060e0e',
                      boxSizing: 'border-box',
                    }}
                  />
                </button>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        background: 'rgba(239,68,68,0.15)',
                        border: '1px solid rgba(239,68,68,0.45)',
                        color: '#ef4444',
                        padding: '2px 8px',
                        borderRadius: 20,
                        fontSize: '0.58rem',
                        fontWeight: 800,
                      }}
                    >
                      ● LIVE
                    </span>
                    <span
                      style={{
                        color: 'rgba(200,230,230,0.95)',
                        fontSize: '0.86rem',
                        fontWeight: 800,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: 140,
                      }}
                    >
                      {hostName}
                    </span>
                      </div>
                  <p style={{ margin: '2px 0 0', fontSize: '0.66rem', color: 'rgba(150,200,200,0.55)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {hostUsername ? <>@{hostUsername}</> : null}
                    <span
                      style={{
                        fontSize: '0.6rem',
                        fontWeight: 800,
                        color: hostTalking ? '#22c55e' : '#ef4444',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: hostTalking ? '#22c55e' : '#ef4444',
                        display: 'inline-block',
                      }} />
                      {hostTalking ? 'Online' : 'Busy'}
                    </span>
                  </p>
                </div>
              </>
            );
          })()}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* VOICE-INVITE-PATCH (video): everyone in the room invites their online friends (replaces the live-only duet list) */}
          {isHostRoom ? (
            <VoiceInviteButton kind="camera" active={voiceInvOpen} onClick={() => setVoiceInvOpen(true)} />
          ) : null}
          <button
            type="button"
            onClick={() => setMembersSheetOpen(true)}
            aria-label="Viewers and members"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: 'rgba(150,200,200,0.9)',
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '6px 10px',
              borderRadius: 20,
              background: membersSheetOpen ? 'rgba(0,188,212,0.22)' : 'rgba(0,188,212,0.1)',
              border: '1px solid rgba(0,188,212,0.35)',
              cursor: 'pointer',
            }}
          >
            <Users size={14} />
            <span>{members.length}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (amHost) setRequestsOpen(true);
              else void toggleMic();
            }}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              color: '#111',
              fontSize: '0.7rem',
              fontWeight: 800,
              width: isHostRoom ? 36 : 46,
              height: isHostRoom ? 36 : 46,
              padding: 0,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 30% 30%, #ffe08a, #eab308)',
              border: '1.5px solid rgba(234,179,8,0.85)',
              boxShadow: isHostRoom ? '0 0 8px rgba(234,179,8,0.5)' : '0 0 12px rgba(234,179,8,0.5)',
              cursor: 'pointer',
            }}
            title="Mic requests"
          >
            <Hand size={isHostRoom ? 17 : 16} color="#111" />
            {amHost && micRequests.length > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  background: '#ef4444',
                  color: '#fff',
                  fontSize: '0.62rem',
                  fontWeight: 900,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 4px',
                  border: '1.5px solid #0a1f22',
                  lineHeight: 1,
                }}
              >
                {micRequests.length > 9 ? '9+' : micRequests.length}
              </span>
            )}
          </button>
          <button type="button" onClick={dismissLivePage} aria-label="Leave live"
            style={{
              width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
              background: 'rgba(239,68,68,0.16)', border: '1px solid rgba(239,68,68,0.5)',
              color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            }}>
            <LogOut size={17} strokeWidth={2.4} />
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            margin: '0 14px 6px',
            padding: '8px 12px',
            background: 'rgba(239,68,68,0.12)',
            borderRadius: 10,
            border: '1px solid rgba(239,68,68,0.3)',
            color: '#ef4444',
            fontSize: '0.78rem',
          }}
        >
          {error}
        </div>
      )}

      {amHost && (
        <p style={{ position: 'relative', zIndex: 2, margin: '0 14px 4px', fontSize: '0.66rem', color: 'rgba(250,204,21,0.85)', fontWeight: 600 }}>
          Tap a listener to freeze their mic
        </p>
      )}

      <div style={{ flex: 1, display: 'flex', minHeight: 0, padding: '4px 10px 0', gap: 8, position: 'relative', zIndex: 2, pointerEvents: 'none' }}>
        <div style={{ flex: 1 }} />
        <div
          style={{
            width: 100,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              paddingBottom: 8,
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <AnimatePresence initial={false}>
              {members.filter(m => {
                  // صاحب البث: لا يظهر في الشريط الجانبي عند التحدث — فقط الإطار الأخضر فوق أيقونته العلوية
                  if (m.isHost) return false;
                  if (duet && m.uid === duet.uid) return false; // DUET-PATCH: guest has its own half
                  const talking = speakingUids.has(m.uid) && !(m.isMe && (micFrozenByHost || !micOn));
                  const micActive = m.isMe ? (micOn && !micFrozenByHost) : !frozenUids.has(m.uid);
                  // Side rail: only active speakers (not silent viewers) — غير صاحب البث
                  return talking || (m.isMe && micActive && speakingUids.has(m.uid));
                }).map(m => {
                const talking = speakingUids.has(m.uid) && !(m.isMe && (micFrozenByHost || !micOn));
                const hostFrozen = frozenUids.has(m.uid);
                const userMuted = mutedUids.has(m.uid);
                const ringColor = hostFrozen ? '#ef4444' : talking ? '#22c55e' : '#facc15';
                const statusOnline = talking && !hostFrozen;
                const label = m.username ? `@${m.username}` : m.name;
                return (
                  <motion.button
                    key={m.uid}
                    type="button"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    whileTap={m.isMe ? undefined : { scale: 0.92 }}
                    onClick={() => onMemberTap(m)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: m.isMe ? 'default' : 'pointer',
                    }}
                  >
                    <div data-gift-user={m.userId || undefined} style={{ position: 'relative', width: 40, height: 40 }}>
                      <UserAvatar
                        name={m.name}
                        avatarUrl={m.avatarUrl}
                        size={40}
                        style={{
                          boxSizing: 'border-box',
                          border: `2.5px solid ${ringColor}`,
                          borderRadius: '50%',
                          boxShadow: talking
                            ? '0 0 0 1px rgba(34,197,94,0.25), 0 0 10px rgba(34,197,94,0.4)'
                            : '0 0 8px rgba(250,204,21,0.35)',
                          opacity: hostFrozen || userMuted ? 0.55 : 1,
                          transition: 'border-color 0.15s, box-shadow 0.15s',
                        }}
                      />
                      <span
                        title={statusOnline ? 'Online' : 'Busy'}
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          right: m.isMe ? 12 : 0,
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: hostFrozen ? '#ef4444' : statusOnline ? '#22c55e' : '#ef4444',
                          border: '2px solid #060e0e',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: '0.56rem',
                        fontWeight: 600,
                        color: hostFrozen || userMuted ? '#ef4444' : talking ? '#22c55e' : 'rgba(200,230,230,0.75)',
                        maxWidth: 90,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {label}
                    </span>
                    <span
                      style={{
                        fontSize: '0.5rem',
                        fontWeight: 800,
                        color: statusOnline ? '#22c55e' : '#ef4444',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {statusOnline ? 'Online' : 'Busy'}
                    </span>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'relative',
          zIndex: 3,
          flexShrink: 0,
          padding: '8px 12px max(env(safe-area-inset-bottom,0px),12px)',
          borderTop: '1px solid rgba(0,188,212,0.12)',
          background: 'rgba(4,16,18,0.92)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <motion.button
            type="button"
            whileTap={{ scale: micFrozenByHost ? 1 : 0.92 }}
            onClick={() => void toggleMic()}
            aria-label={micOn ? 'Mute mic' : 'Unmute mic'}
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              border: micFrozenByHost
                ? '2px solid #ef4444'
                : (micOn && !micFrozenByHost && myUidRef.current != null && speakingUids.has(myUidRef.current))
                  ? '2.5px solid #22c55e'
                  : micOn
                    ? '2.5px solid #facc15'
                    : '2px solid rgba(0,188,212,0.35)',
              background: micFrozenByHost
                ? 'rgba(239,68,68,0.2)'
                : (micOn && !micFrozenByHost && myUidRef.current != null && speakingUids.has(myUidRef.current))
                  ? 'linear-gradient(145deg, #22c55e 0%, #15803d 100%)'
                  : micOn
                    ? 'linear-gradient(145deg, #facc15 0%, #ca8a04 100%)'
                    : 'rgba(0,30,35,0.85)',
              boxShadow: (micOn && !micFrozenByHost && myUidRef.current != null && speakingUids.has(myUidRef.current))
                ? '0 0 14px rgba(34,197,94,0.55)'
                : micOn
                  ? '0 0 10px rgba(250,204,21,0.4)'
                  : 'none',
              cursor: micFrozenByHost ? 'not-allowed' : 'pointer',
              pointerEvents: micFrozenByHost ? 'none' : 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              opacity: micFrozenByHost ? 0.4 : 1,
              filter: micFrozenByHost ? 'grayscale(0.85)' : 'none',
              transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
            }}
          >
            {micFrozenByHost ? (
              <Snowflake size={20} color="#ef4444" strokeWidth={2} />
            ) : micOn ? (
              <Mic size={22} color="#041414" strokeWidth={2.2} />
            ) : (
              <MicOff size={22} color="rgba(0,188,212,0.75)" strokeWidth={2} />
            )}
          </motion.button>

          {(amHost || amGuest) ? (
            <>
              <motion.button
                type="button"
                whileTap={{ scale: 0.92 }}
                onClick={() => void toggleCam()}
                aria-label={camOn ? 'Turn camera off' : 'Turn camera on'}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  border: camOn ? '2px solid #00BCD4' : '1px solid rgba(239,68,68,0.4)',
                  background: camOn ? 'rgba(0,188,212,0.16)' : 'rgba(239,68,68,0.14)',
                  color: camOn ? '#00BCD4' : '#ef4444',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {camOn ? <Video size={18} /> : <VideoOff size={18} />}
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.92 }}
                onClick={() => void switchFacing()}
                aria-label="Switch camera"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  border: '1px solid rgba(0,188,212,0.28)',
                  background: 'rgba(0,188,212,0.08)',
                  color: '#00BCD4',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <SwitchCamera size={18} />
              </motion.button>
            </>
          ) : null}

          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            onClick={toggleSpeakerMute}
            style={{
              height: 40,
              padding: '0 12px',
              borderRadius: 12,
              border: speakerMuted ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(0,188,212,0.28)',
              background: speakerMuted ? 'rgba(239,68,68,0.12)' : 'rgba(0,188,212,0.08)',
              color: speakerMuted ? '#ef4444' : '#00BCD4',
              cursor: 'pointer',
              fontSize: '0.72rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexShrink: 0,
            }}
          >
            {speakerMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            {speakerMuted ? 'Unmute live' : 'Mute live'}
          </motion.button>
        </div>
        <p style={{ margin: 0, fontSize: '0.62rem', color: 'rgba(150,200,200,0.45)', textAlign: 'center' }}>
          {micFrozenByHost ? 'Mic frozen — viewer only' : micOn ? 'Mic on' : 'Mic off'}
        </p>
      </div>


      {/* Live room chat — compact on open; Full Chat rises to the yellow line, Hide chat drops it */}
      {joined && (
        <div
          style={{
            position: 'absolute',
            left: 10,
            right: 10,
            top: chatFull ? '36%' : 'auto',
            bottom: 'calc(118px + env(safe-area-inset-bottom, 0px))',
            zIndex: 25,
            pointerEvents: 'none',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            gap: 6,
            height: chatFull ? 'auto' : 'auto',
            maxHeight: chatFull ? 'none' : 168,
            transition: 'top .28s ease',
          }}
        >
          <button
            type="button"
            onClick={() => setChatFull(v => !v)}
            style={{
              alignSelf: 'flex-start',
              pointerEvents: 'auto',
              border: '1px solid rgba(0,188,212,0.3)',
              background: 'rgba(6,16,18,0.85)',
              color: '#00BCD4',
              borderRadius: 999,
              padding: '4px 10px',
              fontSize: '0.68rem',
              fontWeight: 800,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {chatFull ? 'Hide chat' : 'Full Chat'}
          </button>
          {liveChatOpen && (
            <div
              style={{
                pointerEvents: 'auto',
                background: 'rgba(4,14,16,0.82)',
                border: '1px solid rgba(0,188,212,0.2)',
                borderRadius: 14,
                padding: '8px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                flex: chatFull ? 1 : '0 0 auto',
                minHeight: chatFull ? 0 : undefined,
                maxHeight: chatFull ? 'none' : 132,
                overflow: 'hidden',
              }}
            >
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: chatFull ? 8 : 4, minHeight: chatFull ? 0 : 48, maxHeight: chatFull ? 'none' : 64, overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', WebkitMaskImage: chatFull ? 'none' : 'linear-gradient(to bottom, transparent 0, #000 18px)', maskImage: chatFull ? 'none' : 'linear-gradient(to bottom, transparent 0, #000 18px)' } as React.CSSProperties}>
                {liveChatMsgs.length === 0 && (
                  <p style={{ margin: 0, color: 'rgba(150,200,200,0.45)', fontSize: '0.68rem' }}>Live chat — say hello</p>
                )}
                {liveChatMsgs.map(m => {
                  const mem = members.find(x => x.uid === m.uid) || members.find(x => x.userId && m.userId && x.userId === m.userId);
                  const av = m.avatarUrl || mem?.avatarUrl || null;
                  const uname = m.username ? `@${m.username}` : (mem?.username ? `@${mem.username}` : m.name);
                  return (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
                        background: 'rgba(0,188,212,0.2)', border: '1px solid rgba(0,188,212,0.3)',
                      }}>
                        {av ? (
                          <img src={av} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#00BCD4' }}>
                            {(m.name || '?')[0]}
                          </div>
                        )}
                      </div>
                      <p style={{ margin: 0, fontSize: chatFull ? '0.9rem' : '0.72rem', lineHeight: chatFull ? 1.45 : 1.35, color: m.isMe ? '#00BCD4' : 'rgba(220,240,240,0.92)', minWidth: 0 }}>
                        <span style={{ fontWeight: 800, color: m.isMe ? '#00BCD4' : '#eab308' }}>{uname} </span>
                        {m.text}
                      </p>
                    </div>
                  );
                })}
                <div ref={liveChatEndRef} />
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={liveChatText}
                  onChange={e => setLiveChatText(e.target.value.slice(0, 200))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void sendLiveChat();
                    }
                  }}
                  placeholder="Message…"
                  data-gift-walk="1"
                  style={{
                    flex: 1,
                    borderRadius: 12,
                    border: '1px solid rgba(0,188,212,0.28)',
                    background: 'rgba(0,20,24,0.9)',
                    color: '#dff6f6',
                    padding: chatFull ? '10px 12px' : '8px 10px',
                    fontSize: chatFull ? '0.92rem' : '0.78rem',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => void sendLiveChat()}
                  style={{
                    borderRadius: 12,
                    border: 'none',
                    background: '#00BCD4',
                    color: '#041018',
                    fontWeight: 800,
                    padding: '0 12px',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                  }}
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </div>
      )}


      {/* All viewers / members — opens from TOP (near viewers icon) */}
      {membersSheetOpen && (
        <div
          onClick={() => setMembersSheetOpen(false)}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 55,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'flex-start',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxHeight: '70vh',
              marginTop: 'max(env(safe-area-inset-top, 0px), 8px)',
              background: 'rgba(6,16,18,0.98)',
              borderRadius: '0 0 18px 18px',
              border: '1px solid rgba(0,188,212,0.25)',
              borderTop: 'none',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '14px 14px 10px',
              borderBottom: '1px solid rgba(0,188,212,0.12)',
            }}>
              <Users size={18} color="#00BCD4" />
              <p style={{ margin: 0, flex: 1, color: '#fff', fontWeight: 800, fontSize: '0.92rem' }}>
                In this live · {members.length}
              </p>
              <button
                type="button"
                onClick={() => setMembersSheetOpen(false)}
                style={{ background: 'none', border: 'none', color: 'rgba(200,230,230,0.8)', cursor: 'pointer', padding: 6 }}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{
              flex: 1, overflowY: 'auto', padding: '8px 12px 16px',
              WebkitOverflowScrolling: 'touch', minHeight: 120,
            }}>
              {members.length === 0 && (
                <p style={{ textAlign: 'center', color: 'rgba(150,200,200,0.5)', fontSize: '0.8rem', marginTop: 24 }}>
                  No one else is here yet
                </p>
              )}
              {(() => {
                // ترتيب الداعمين: الأعلى دعماً أول (المراكز 1-3 لهم تاج، الباقي يظهر دعمهم فقط)
                const supMap = new Map<string, { coins: number; rank: number }>();
                supportLeaders.forEach((l, i) => supMap.set(String(l.userId), { coins: l.coins, rank: i + 1 }));
                const supOf = (m: Member) => (m.userId ? supMap.get(String(m.userId)) : undefined);
                const ordered = [...members].sort((a, b) => {
                  if (!!a.isHost !== !!b.isHost) return a.isHost ? -1 : 1;
                  const sa = supOf(a), sb = supOf(b);
                  if (sa && sb) return sa.rank - sb.rank;
                  if (sa) return -1;
                  if (sb) return 1;
                  return 0;
                });
                return ordered;
              })().map(m => {
                const talking = speakingUids.has(m.uid) && !(m.isMe && (micFrozenByHost || !micOn));
                const hostFrozen = frozenUids.has(m.uid);
                const label = m.username ? `@${m.username}` : m.name;
                const sup = m.userId ? (() => { const i = supportLeaders.findIndex(l => String(l.userId) === String(m.userId)); return i >= 0 ? { coins: supportLeaders[i].coins, rank: i + 1 } : null; })() : null;
                return (
                  <button
                    key={m.uid}
                    type="button"
                    onClick={() => {
                      if (!m.isMe && (amHost || isMicHolder(m))) {
                        onMemberTap(m);
                      }
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '14px 8px 10px',
                      border: 'none',
                      borderBottom: '1px solid rgba(0,188,212,0.08)',
                      background: 'transparent',
                      cursor: !m.isMe && (amHost || isMicHolder(m)) ? 'pointer' : 'default',
                      textAlign: 'left',
                      color: '#e8f6f6',
                    }}
                  >
                    <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
                      {sup && sup.rank <= 3 ? <SupportCrown rank={sup.rank as 1 | 2 | 3} /> : null}
                      <div style={{
                        width: 44, height: 44, borderRadius: '50%', overflow: 'hidden',
                        border: `2px solid ${hostFrozen ? '#ef4444' : talking ? '#22c55e' : 'rgba(0,188,212,0.35)'}`,
                        opacity: hostFrozen ? 0.55 : 1,
                        background: 'rgba(0,188,212,0.15)',
                      }}>
                        {m.avatarUrl ? (
                          <img src={m.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#00BCD4' }}>
                            {(m.name || '?')[0]}
                          </div>
                        )}
                      </div>
                      <span style={{
                        position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: '50%',
                        background: hostFrozen ? '#ef4444' : talking ? '#22c55e' : '#9ca3af',
                        border: '2px solid #061012',
                      }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 800, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.name}{m.isMe ? ' (you)' : ''}{m.isHost ? ' · Host' : ''}
                      </p>
                      <p style={{ margin: 0, color: 'rgba(150,200,200,0.55)', fontSize: '0.72rem' }}>{label}</p>
                      {sup ? (
                        <p style={{ margin: '2px 0 0', fontSize: '0.7rem', fontWeight: 800, color: '#facc15' }}>
                          {sup.rank <= 3 ? (
                            <span style={{ color: sup.rank === 1 ? '#22c55e' : sup.rank === 2 ? '#f8fafc' : '#ef4444', marginRight: 6 }}>
                              #{sup.rank}
                            </span>
                          ) : null}
                          🪙 {sup.coins.toLocaleString('en-US')}
                        </p>
                      ) : null}
                    </div>
                    <span style={{
                      fontSize: '0.68rem', fontWeight: 800,
                      color: hostFrozen ? '#ef4444' : talking ? '#22c55e' : 'rgba(150,200,200,0.5)',
                    }}>
                      {hostFrozen ? 'Frozen' : talking ? 'Speaking' : 'Viewer'}
                    </span>
                  </button>
                );
              })}
            </div>
            {amHost && (
              <p style={{ margin: 0, padding: '0 14px 14px', color: 'rgba(250,204,21,0.75)', fontSize: '0.68rem', fontWeight: 600 }}>
                Tap a listener to freeze or unfreeze their mic
              </p>
            )}
          </div>
        </div>
      )}

      {requestsOpen && amHost && (
        <div
          onClick={() => setRequestsOpen(false)}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 56,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'flex-start',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxHeight: '70vh',
              background: 'rgba(6,16,18,0.98)',
              borderRadius: '0 0 18px 18px',
              border: '1px solid rgba(250,204,21,0.3)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              paddingTop: 'max(8px, env(safe-area-inset-top, 0px))',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 14px 10px', borderBottom: '1px solid rgba(250,204,21,0.15)' }}>
              <Hand size={18} color="#facc15" />
              <p style={{ margin: 0, flex: 1, color: '#fff', fontWeight: 800, fontSize: '0.92rem' }}>
                Mic requests · speakers {new Set(members.filter(m => speakerUids.has(m.uid) && !m.isHost).map(micPersonKey)).size}/{micCap}
              </p>
              <button type="button" onClick={() => setRequestsOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(200,230,230,0.8)', cursor: 'pointer', padding: 6 }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 16px' }}>
              {(() => {
                type Row = { key: string; name: string; username: string | null; uids: number[] };
                const spk = new Map<string, Row>();
                members.filter(m => speakerUids.has(m.uid) && !m.isHost).forEach(m => {
                  const k = micPersonKey(m);
                  const e = spk.get(k);
                  if (e) e.uids.push(m.uid);
                  else spk.set(k, { key: k, name: m.name, username: m.username, uids: [m.uid] });
                });
                const req = new Map<string, Row>();
                micRequests.forEach(r => {
                  const k = micPersonKey(r);
                  if (spk.has(k) || speakerUids.has(r.uid)) return;
                  const e = req.get(k);
                  if (e) e.uids.push(r.uid);
                  else req.set(k, { key: k, name: r.name, username: r.username ?? null, uids: [r.uid] });
                });
                return (
                  <>
                    {[...spk.values()].map(p => (
                      <button
                        key={`spk-${p.key}`}
                        type="button"
                        onClick={async () => { for (const u of p.uids) await hostSetSpeaker(u, false); }}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', border: 'none', borderBottom: '1px solid rgba(0,188,212,0.08)', background: 'transparent', color: '#e8f6f6', cursor: 'pointer', textAlign: 'left' }}
                      >
                        <span style={{ flex: 1, fontWeight: 800 }}>{p.name}{p.username ? ` @${p.username}` : ''}</span>
                        <span style={{ color: '#ef4444', fontSize: '0.72rem', fontWeight: 800 }}>Remove mic</span>
                      </button>
                    ))}
                    {spk.size === 0 && req.size === 0 && (
                      <p style={{ textAlign: 'center', color: 'rgba(150,200,200,0.5)', fontSize: '0.8rem', marginTop: 24 }}>No mic requests</p>
                    )}
                    {[...req.values()].map(p => (
                      <button
                        key={`req-${p.key}`}
                        type="button"
                        onClick={() => void hostSetSpeaker(p.uids[p.uids.length - 1], true)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', border: 'none', borderBottom: '1px solid rgba(0,188,212,0.08)', background: 'transparent', color: '#e8f6f6', cursor: 'pointer', textAlign: 'left' }}
                      >
                        <span style={{ flex: 1, fontWeight: 800 }}>{p.name}{p.username ? ` @${p.username}` : ''}</span>
                        <span style={{ color: '#22c55e', fontSize: '0.72rem', fontWeight: 800 }}>Raise</span>
                      </button>
                    ))}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {leaveMicAsk && iHoldMic && (
        <div
          onClick={() => setLeaveMicAsk(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(0,0,0,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 320, background: 'rgba(6,16,18,0.98)', border: '1px solid rgba(250,204,21,0.35)', borderRadius: 16, padding: 18, color: '#fff', textAlign: 'center' }}
          >
            <p style={{ margin: '0 0 6px', fontWeight: 800, fontSize: '0.98rem' }}>Remove your mic?</p>
            <p style={{ margin: '0 0 14px', color: 'rgba(200,230,230,0.7)', fontSize: '0.78rem' }}>Refreshing will drop you from the mic.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => { setLeaveMicAsk(false); void forceMuteLocalMic().finally(() => { window.setTimeout(() => window.location.reload(), 150); }); }}
                style={{ flex: 1, borderRadius: 12, border: 'none', padding: '10px 0', fontWeight: 800, cursor: 'pointer', background: '#ef4444', color: '#fff' }}
              >Yes</button>
              <button
                type="button"
                onClick={() => setLeaveMicAsk(false)}
                style={{ flex: 1, borderRadius: 12, border: '1px solid rgba(0,188,212,0.45)', padding: '10px 0', fontWeight: 800, cursor: 'pointer', background: 'transparent', color: '#00BCD4' }}
              >Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Host closed broadcast — English guidance, then exit */}
      {roomEndedOverlay && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 80,
            background: 'rgba(0,0,0,0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 340,
              borderRadius: 18,
              border: '1px solid rgba(0,188,212,0.3)',
              background: 'rgba(8,18,20,0.98)',
              padding: '22px 18px',
              textAlign: 'center',
            }}
          >
            <p style={{ margin: '0 0 8px', color: '#fff', fontWeight: 900, fontSize: '1.05rem' }}>{LIVE_ENDED_TITLE}</p>
            <p style={{ margin: '0 0 6px', color: 'rgba(200,230,230,0.9)', fontSize: '0.85rem', lineHeight: 1.45 }}>{LIVE_ENDED_BODY}</p>
            <p style={{ margin: 0, color: 'rgba(150,200,200,0.55)', fontSize: '0.72rem' }}>{LIVE_ENDED_HINT}</p>
          </div>
        </div>
      )}

      <AnimatePresence>
        {hostPostsOpen && !viewPost && (
          <motion.div
            key="host-posts-sheet"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setHostPostsOpen(false)}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 40,
              background: 'rgba(0,0,0,0.45)',
              display: 'flex',
              alignItems: 'flex-end',
            }}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%',
                maxHeight: '78vh',
                background: 'rgba(6,16,18,0.98)',
                borderRadius: '18px 18px 0 0',
                border: '1px solid rgba(0,188,212,0.2)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 14px 12px', borderBottom: '1px solid rgba(0,188,212,0.12)', position: 'relative' }}>
                <UserAvatar name={hostName} avatarUrl={hostAvatar} size={32} style={{ borderRadius: '50%' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, color: '#fff', fontWeight: 800, fontSize: '0.88rem' }}>{hostName}</p>
                  <p style={{ margin: 0, color: 'rgba(150,200,200,0.55)', fontSize: '0.68rem' }}>Products · live continues</p>
                </div>
                <button type="button" onClick={() => setHostPostsOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(200,230,230,0.8)', cursor: 'pointer', padding: 6 }}>
                  <ChevronDown size={20} />
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 10, WebkitOverflowScrolling: 'touch' }}>
                {hostPostsLoading && (
                  <p style={{ textAlign: 'center', color: 'rgba(150,200,200,0.5)', fontSize: '0.8rem', marginTop: 24 }}>Loading…</p>
                )}
                {!hostPostsLoading && hostPosts.length === 0 && (
                  <p style={{ textAlign: 'center', color: 'rgba(150,200,200,0.5)', fontSize: '0.8rem', marginTop: 24 }}>No posts yet</p>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {hostPosts.map(post => {
                    const thumb = postThumb(post);
                    return (
                      <button
                        key={post.id}
                        type="button"
                        onClick={() => void openPostDetail(post)}
                        style={{
                          aspectRatio: '1',
                          borderRadius: 10,
                          overflow: 'hidden',
                          border: '1px solid rgba(0,188,212,0.2)',
                          background: '#0a1416',
                          padding: 0,
                          cursor: 'pointer',
                        }}
                      >
                        {thumb ? (
                          thumb.type === 'video' || (thumb.url && /\.(mp4|webm|mov)/i.test(thumb.url)) ? (
                            <video src={thumb.url} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : /\.pdf(\?|$)/i.test(thumb.url) ? (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00BCD4', fontSize: '0.7rem', fontWeight: 700 }}>PDF</div>
                          ) : (
                            <img src={thumb.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          )
                        ) : (
                          <div style={{ width: '100%', height: '100%', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ color: 'rgba(200,230,230,0.85)', fontSize: '0.62rem', fontWeight: 700, textAlign: 'center', lineHeight: 1.3 }}>
                              {parseProductTitle(post.text)}
                            </span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {viewPost && (
          <motion.div
            key="view-post-live"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'absolute', inset: 0, zIndex: 50, background: '#000', display: 'flex', flexDirection: 'column' }}
          >
            <div
              style={{
                position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5,
                display: 'flex', alignItems: 'center', gap: 10,
                padding: 'max(env(safe-area-inset-top,0px),12px) 12px 10px',
                background: 'linear-gradient(180deg, rgba(0,0,0,0.65) 0%, transparent 100%)',
              }}
            >
              <button
                type="button"
                onClick={() => { setViewPost(null); setProductDetailsOpen(false); }}
                style={{
                  width: 36, height: 36, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(0,0,0,0.35)', color: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <ChevronDown size={18} style={{ transform: 'rotate(90deg)' }} />
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, color: '#fff', fontWeight: 800, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {parseProductTitle(viewPost.text)}
                </p>
                <p style={{ margin: 0, color: 'rgba(200,230,230,0.55)', fontSize: '0.62rem' }}>Live continues</p>
              </div>
              <button
                type="button"
                onClick={() => { setViewPost(null); setHostPostsOpen(false); setProductDetailsOpen(false); }}
                style={{
                  padding: '7px 12px', borderRadius: 20, border: '1px solid rgba(0,188,212,0.4)',
                  background: 'rgba(0,188,212,0.15)', color: '#00BCD4', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer',
                }}
              >
                LIVE
              </button>
            </div>

            <div style={{ flex: 1, position: 'relative', minHeight: 0, background: '#000' }}>
              {(() => {
                const thumb = postThumb(viewPost);
                if (!thumb) {
                  return (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                      <p style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800, textAlign: 'center' }}>{parseProductTitle(viewPost.text)}</p>
                    </div>
                  );
                }
                if (thumb.type === 'video' || /\.(mp4|webm|mov)/i.test(thumb.url)) {
                  return <video src={thumb.url} autoPlay muted loop playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />;
                }
                if (/\.pdf(\?|$)/i.test(thumb.url)) {
                  return <iframe title="PDF" src={thumb.url} style={{ width: '100%', height: '100%', border: 'none', background: '#111' }} />;
                }
                return <img src={thumb.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />;
              })()}

              <button
                type="button"
                onClick={() => setProductDetailsOpen(true)}
                aria-label="Product details"
                style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: 'max(24px, env(safe-area-inset-bottom, 0px))',
                  transform: 'translateX(-50%)',
                  width: 56,
                  height: 36,
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.25)',
                  background: 'rgba(0,0,0,0.45)',
                  backdropFilter: 'blur(8px)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  cursor: 'pointer',
                  padding: 0,
                  zIndex: 4,
                }}
              >
                <span style={{ width: 22, height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.9)' }} />
                <span style={{ width: 22, height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.9)' }} />
                <span style={{ width: 22, height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.9)' }} />
              </button>
            </div>

            <AnimatePresence>
              {productDetailsOpen && (
                <motion.div
                  key="product-details-sheet"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setProductDetailsOpen(false)}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 10,
                    background: 'rgba(0,0,0,0.45)',
                    display: 'flex',
                    alignItems: 'flex-end',
                  }}
                >
                  <motion.div
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    transition={{ type: 'spring', stiffness: 380, damping: 36 }}
                    onClick={e => e.stopPropagation()}
                    style={{
                      width: '100%',
                      maxHeight: '70vh',
                      background: 'rgba(8,18,20,0.98)',
                      borderRadius: '18px 18px 0 0',
                      border: '1px solid rgba(0,188,212,0.25)',
                      padding: '10px 18px max(env(safe-area-inset-bottom,0px),20px)',
                      overflowY: 'auto',
                    }}
                  >
                    <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.25)', margin: '0 auto 14px' }} />
                    {(() => {
                      const f = extractProductFields(viewPost.text);
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <p style={{ margin: 0, color: '#fff', fontSize: '1.05rem', fontWeight: 800 }}>{f.title}</p>
                          {f.price ? <p style={{ margin: 0, color: '#00BCD4', fontSize: '0.95rem', fontWeight: 700 }}>{f.price}</p> : null}
                          {f.details ? (
                            <p style={{ margin: 0, color: 'rgba(200,230,230,0.9)', fontSize: '0.88rem', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{f.details}</p>
                          ) : null}
                          {f.extras.map((ex, i) => (
                            <p key={i} style={{ margin: 0, color: 'rgba(180,220,220,0.8)', fontSize: '0.85rem', lineHeight: 1.45 }}>{ex}</p>
                          ))}
                          {!f.details && !f.price && f.extras.length === 0 && viewPost.text ? (
                            <p style={{ margin: 0, color: 'rgba(200,230,230,0.9)', fontSize: '0.88rem', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                              {(viewPost.text || '').replace(/\u27E6stooorna-product:[A-Za-z0-9+/=]+\u27E7\s*$/u, '').trim()}
                            </p>
                          ) : null}
                        </div>
                      );
                    })()}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
      {/* DUET-PATCH overlays */}
      {amHost && duet ? <DuetEndButton onClick={endDuet} /> : null}
      {isHostRoom ? (
        <VoiceInvitePanel
          kind="camera"
          open={voiceInvOpen}
          onClose={() => setVoiceInvOpen(false)}
          canSearchAll={amHost}
          host={{ userId: hostId, name: hostName, username: hostUsername, avatarUrl: hostAvatar }}
          me={myId ? { userId: myId, name: myName, username: myUsername, avatarUrl: myAvatar } : null}
        />
      ) : null}
      <VoiceInviteToast text={voiceInvToast} />
      {/* DUET-PATCH: old live-only invite list kept in code but never opened (the online-people list above replaces it) */}
      {amHost ? (
        <DuetInvitePanel
          open={false && duetPanelOpen && !duet}
          myId={myId}
          sent={duetSent}
          onInvite={inviteToDuet}
          onCancel={cancelDuetInvite}
          onClose={() => setDuetPanelOpen(false)}
        />
      ) : null}
      {amHost ? (
        <DuetIncomingDialog
          invite={duetIncoming}
          onAccept={() => void acceptDuetInvite()}
          onDecline={declineDuetInvite}
        />
      ) : null}
      <DuetToast text={duetToast} />
      <LiveVipDock hostId={hostId} currentUserId={myId} />
      {/* قائمة المتحدث: دعم (هدية) + تجميد المايك لصاحب البث / كتم محلي للمشاهد */}
      {speakerMenu && (
        <div
          onClick={() => setSpeakerMenu(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 8800, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 420, background: '#101818', borderRadius: '18px 18px 0 0', padding: '16px 16px max(env(safe-area-inset-bottom,0px),16px)', border: '1px solid rgba(0,188,212,0.25)', display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            <p style={{ margin: 0, textAlign: 'center', color: '#dff6f6', fontWeight: 800, fontSize: '0.9rem' }}>
              {speakerMenu.username ? `@${speakerMenu.username}` : speakerMenu.name}
            </p>
            <button
              type="button"
              onClick={() => {
                const m = speakerMenu;
                setSpeakerMenu(null);
                if (!m.userId || m.isMe || m.userId === myId) return;
                window.dispatchEvent(new CustomEvent('stooorna:gift-target', { detail: { userId: m.userId, name: m.name, username: m.username, avatarUrl: m.avatarUrl } }));
              }}
              style={{ padding: '13px 10px', borderRadius: 14, border: 'none', cursor: 'pointer', background: '#8b12ff', color: '#fff', fontWeight: 800, fontSize: '0.95rem' }}
            >
              🎁 {amHost ? 'إرسال هدية' : 'دعم'}
            </button>
            <button
              type="button"
              onClick={() => { const m = speakerMenu; setSpeakerMenu(null); if (amHost) toggleHostFreeze(m.uid, m.isMe); else toggleUserListenMute(m.uid, m.isMe); }}
              style={{ padding: '13px 10px', borderRadius: 14, border: '1px solid rgba(0,188,212,0.35)', cursor: 'pointer', background: 'rgba(0,188,212,0.1)', color: '#dff6f6', fontWeight: 800, fontSize: '0.9rem' }}
            >
              {amHost
                ? (frozenUids.has(speakerMenu.uid) ? 'فك تجميد المايك' : 'تجميد المايك')
                : (mutedUids.has(speakerMenu.uid) ? 'إلغاء الكتم' : 'كتم الصوت (عندي فقط)')}
            </button>
            <button
              type="button"
              onClick={() => setSpeakerMenu(null)}
              style={{ padding: '11px 10px', borderRadius: 14, border: 'none', cursor: 'pointer', background: 'transparent', color: 'rgba(200,230,230,0.7)', fontWeight: 700, fontSize: '0.85rem' }}
            >
              إلغاء
            </button>
          </div>
        </div>
      )}
      <LiveCoinsDock hostId={hostId} currentUserId={myId} currentUserName={myName} />
    </div>
  );
}
