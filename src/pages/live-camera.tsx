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
import { getVipMaxSpeakers, isVip } from '@/lib/vipPatch';
import { LiveVipDock } from '@/components/LiveVipDock';
import { VipAvatarFrame, VipBadge } from '@/components/VipBadge';

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
  const hostIsVip = isVip(hostId);
  const channelName = `stooorna-livecam-${(hostId || 'none').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || uidFromString(hostId || 'none')}`;
  const roomTitle = hostUsername ? `${hostName} (@${hostUsername})` : hostName;

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
  const [speakingUids, setSpeakingUids] = useState<Set<number>>(new Set());
  const [mutedUids, setMutedUids] = useState<Set<number>>(new Set());
  const mutedUidsRef = useRef<Set<number>>(new Set());
  const [frozenUids, setFrozenUids] = useState<Set<number>>(new Set());
  const frozenUidsRef = useRef<Set<number>>(new Set());
  const [speakerUids, setSpeakerUids] = useState<Set<number>>(new Set());
  const speakerUidsRef = useRef<Set<number>>(new Set());
  const [micRequests, setMicRequests] = useState<MicRequest[]>([]);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [micRequested, setMicRequested] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [liveChatMsgs, setLiveChatMsgs] = useState<LiveChatMsg[]>([]);
  const [liveChatText, setLiveChatText] = useState('');
  const [liveChatOpen, setLiveChatOpen] = useState(true);
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
  const localVideoElRef = useRef<HTMLDivElement | null>(null);
  const remoteVideoElRef = useRef<HTMLDivElement | null>(null);
  const remoteTracksRef = useRef<Map<number, { stop: () => void; play: () => void }>>(new Map());
  const myUidRef = useRef<number | null>(null);
  const dataStreamIdRef = useRef<number | null>(null);
  const friendsByUidRef = useRef<
    Map<number, { userId: string; name: string; username: string | null; avatarUrl: string | null }>
  >(new Map());
  const leftRef = useRef(false);
  /** Host ended private room — listeners exit without re-broadcasting active */
  const forceEndRef = useRef(false);

  const playLocalVideo = useCallback(() => {
    const track = camRef.current;
    const el = localVideoElRef.current;
    if (!track || !el) return;
    try {
      track.play(el, { fit: 'cover' });
    } catch {
      /* ignore */
    }
  }, []);

  const playRemoteVideo = useCallback((track: { play: (el: HTMLElement, opts?: object) => void }) => {
    const el = remoteVideoElRef.current;
    if (!el) return;
    try {
      track.play(el, { fit: 'cover' });
    } catch {
      /* ignore */
    }
  }, []);

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
    try {
      if (userMuted || globalMuted) track.stop();
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

  const leaveRoom = useCallback(async (opts?: { forced?: boolean; skipNavigate?: boolean }) => {
    const forced = !!opts?.forced;
    leftRef.current = true;
    forceEndRef.current = forced || forceEndRef.current;

    // Host ends private room: notify listeners BEFORE leaving Agora channel
    if (amHost && isHostRoom && !forced) {
      try {
        for (let i = 0; i < 3; i++) {
          await sendDataPayload({
            t: 'room-ended',
            hostId: hostId || myId || '',
            host: myUidRef.current,
            ts: Date.now(),
          });
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
  }, [navigate, hostId, myId, amHost, isHostRoom, channelName, sendDataPayload]);

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
            playRemoteVideo(remoteUser.videoTrack);
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
        }
      });

      client.on('user-left', (remoteUser: IAgoraRTCRemoteUser) => {
        remoteUser.audioTrack?.stop();
        remoteUser.videoTrack?.stop();
        remoteTracksRef.current.delete(remoteUser.uid as number);
        remoteUids.delete(remoteUser.uid as number);
        syncList();
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
            if (cm) publishLiveChat(channelName, msg);
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
            speakerUidsRef.current = new Set(list);
            setSpeakerUids(new Set(list));
            const me = myUidRef.current;
            if (me != null && !amHost && !list.includes(me)) void forceMuteLocalMic();
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
            if (u.videoTrack) playRemoteVideo(u.videoTrack);
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
      const startLive = amHost;
      await mic.setEnabled(true);
      try {
        mic.setMuted(false);
      } catch {
        /* ignore */
      }

      const tracksToPublish: any[] = [mic];
      if (amHost) {
        const cam = await AgoraRTC.createCameraVideoTrack({
          facingMode: 'user',
          encoderConfig: '720p_2',
        });
        camRef.current = cam;
        await cam.setEnabled(true);
        tracksToPublish.push(cam);
      }

      await client.publish(tracksToPublish);
      if (amHost) {
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
      camOnRef.current = amHost;
      setCamOn(amHost);

      setJoined(true);
      setStatus('');
      setJoining(false);
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

  useEffect(() => {
    if (joined && amHost) playLocalVideo();
  }, [joined, amHost, playLocalVideo]);

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

  const toggleMic = async () => {
    if (!micRef.current || !joined) return;
    if (micFrozenRef.current || micFrozenByHost) {
      void forceMuteLocalMic();
      setError('Mic frozen by host');
      return;
    }
    if (!amHost) {
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
    if (!amHost || !camRef.current || !joined) return;
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
    if (!amHost || !joined) return;
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
    speakerUidsRef.current = next;
    setSpeakerUids(next);
    const me = myUidRef.current;
    if (me == null || amHost) return;
    if (!next.has(me) || frozenUidsRef.current.has(me)) {
      setMicRequested(false);
      void forceMuteLocalMic();
    }
  }, [amHost, forceMuteLocalMic]);

  const hostSetSpeaker = useCallback(async (uid: number, grant: boolean) => {
    if (!amHost) return;
    const next = new Set(speakerUidsRef.current);
    if (grant) {
      if (frozenUidsRef.current.has(uid)) return;
      if (!canGrantSpeaker(next, uid, hostId)) {
        setError(`Max ${micCap} speakers`);
        return;
      }
      next.add(uid);
    } else {
      next.delete(uid);
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

  useEffect(() => {
    if (!liveChatOpen || liveChatMsgs.length === 0) return;
    try {
      liveChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch { /* ignore */ }
  }, [liveChatMsgs, liveChatOpen]);

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

  const onMemberTap = (m: Member) => {
    if (m.isMe) return;
    if (amHost) {
      toggleHostFreeze(m.uid, m.isMe);
      return;
    }
    toggleUserListenMute(m.uid, m.isMe);
  };

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

      <div style={{ position: 'absolute', inset: 0, background: '#000', zIndex: 0 }}>
        {amHost ? (
          <div ref={localVideoElRef} style={{ width: '100%', height: '100%' }} />
        ) : (
          <div ref={remoteVideoElRef} style={{ width: '100%', height: '100%' }} />
        )}
        {!camOn && amHost ? (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: '#0a1416', color: 'rgba(200,230,230,0.7)',
            fontWeight: 800,
          }}>
            Camera off
          </div>
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
                  <VipAvatarFrame userId={hostId} size={40}>
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
                  </VipAvatarFrame>
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
                    <VipBadge userId={hostId} compact />
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
              width: 46,
              height: 46,
              padding: 0,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 30% 30%, #ffe08a, #eab308)',
              border: '1.5px solid rgba(234,179,8,0.85)',
              boxShadow: '0 0 12px rgba(234,179,8,0.5)',
              cursor: 'pointer',
            }}
            title="Mic requests"
          >
            <Hand size={16} color="#111" />
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
                  const talking = speakingUids.has(m.uid) && !(m.isMe && (micFrozenByHost || !micOn));
                  const micActive = m.isMe ? (micOn && !micFrozenByHost) : !frozenUids.has(m.uid);
                  // Side rail: only active speakers (not silent viewers)
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
                    <div style={{ position: 'relative', width: 40, height: 40 }}>
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

          {amHost ? (
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


      {/* Live room chat */}
      {joined && (
        <div
          style={{
            position: 'absolute',
            left: 10,
            right: 10,
            bottom: 'calc(118px + env(safe-area-inset-bottom, 0px))',
            zIndex: 25,
            pointerEvents: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            maxHeight: liveChatOpen ? 220 : 36,
          }}
        >
          <button
            type="button"
            onClick={() => setLiveChatOpen(o => !o)}
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
            }}
          >
            {liveChatOpen ? 'Hide chat' : 'Show chat'}
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
                maxHeight: 160,
              }}
            >
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 48 }}>
                {liveChatMsgs.length === 0 && (
                  <p style={{ margin: 0, color: 'rgba(150,200,200,0.45)', fontSize: '0.68rem' }}>Live chat — say hello</p>
                )}
                {liveChatMsgs.map(m => {
                  const mem = members.find(x => x.uid === m.uid) || members.find(x => x.userId && m.userId && x.userId === m.userId);
                  const av = mem?.avatarUrl || null;
                  const uname = mem?.username ? `@${mem.username}` : m.name;
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
                      <p style={{ margin: 0, fontSize: '0.72rem', lineHeight: 1.35, color: m.isMe ? '#00BCD4' : 'rgba(220,240,240,0.92)', minWidth: 0 }}>
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
                  style={{
                    flex: 1,
                    borderRadius: 12,
                    border: '1px solid rgba(0,188,212,0.28)',
                    background: 'rgba(0,20,24,0.9)',
                    color: '#dff6f6',
                    padding: '8px 10px',
                    fontSize: '0.78rem',
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


      {/* All viewers / members — opens from top Users icon */}
      {membersSheetOpen && (
        <div
          onClick={() => setMembersSheetOpen(false)}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 55,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'flex-end',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxHeight: '70vh',
              background: 'rgba(6,16,18,0.98)',
              borderRadius: '18px 18px 0 0',
              border: '1px solid rgba(0,188,212,0.25)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
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
              {members.map(m => {
                const talking = speakingUids.has(m.uid) && !(m.isMe && (micFrozenByHost || !micOn));
                const hostFrozen = frozenUids.has(m.uid);
                const label = m.username ? `@${m.username}` : m.name;
                return (
                  <button
                    key={m.uid}
                    type="button"
                    onClick={() => {
                      if (amHost && !m.isMe) {
                        onMemberTap(m);
                      }
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 8px',
                      border: 'none',
                      borderBottom: '1px solid rgba(0,188,212,0.08)',
                      background: 'transparent',
                      cursor: amHost && !m.isMe ? 'pointer' : 'default',
                      textAlign: 'left',
                      color: '#e8f6f6',
                    }}
                  >
                    <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
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
            alignItems: 'flex-end',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxHeight: '70vh',
              background: 'rgba(6,16,18,0.98)',
              borderRadius: '18px 18px 0 0',
              border: '1px solid rgba(250,204,21,0.3)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 14px 10px', borderBottom: '1px solid rgba(250,204,21,0.15)' }}>
              <Hand size={18} color="#facc15" />
              <p style={{ margin: 0, flex: 1, color: '#fff', fontWeight: 800, fontSize: '0.92rem' }}>
                Mic requests · speakers {speakerUids.size}/{micCap}
              </p>
              <button type="button" onClick={() => setRequestsOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(200,230,230,0.8)', cursor: 'pointer', padding: 6 }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 16px' }}>
              {members.filter(m => speakerUids.has(m.uid) && !m.isHost).map(m => (
                <button
                  key={`spk-${m.uid}`}
                  type="button"
                  onClick={() => void hostSetSpeaker(m.uid, false)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', border: 'none', borderBottom: '1px solid rgba(0,188,212,0.08)', background: 'transparent', color: '#e8f6f6', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ flex: 1, fontWeight: 800 }}>{m.name}{m.username ? ` @${m.username}` : ''}</span>
                  <span style={{ color: '#ef4444', fontSize: '0.72rem', fontWeight: 800 }}>Remove mic</span>
                </button>
              ))}
              {micRequests.length === 0 && members.filter(m => speakerUids.has(m.uid) && !m.isHost).length === 0 && (
                <p style={{ textAlign: 'center', color: 'rgba(150,200,200,0.5)', fontSize: '0.8rem', marginTop: 24 }}>No mic requests</p>
              )}
              {micRequests.map(r => (
                <button
                  key={`req-${r.uid}`}
                  type="button"
                  onClick={() => void hostSetSpeaker(r.uid, !speakerUids.has(r.uid))}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', border: 'none', borderBottom: '1px solid rgba(0,188,212,0.08)', background: 'transparent', color: '#e8f6f6', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ flex: 1, fontWeight: 800 }}>{r.name}{r.username ? ` @${r.username}` : ''}</span>
                  <span style={{ color: speakerUids.has(r.uid) ? '#ef4444' : '#22c55e', fontSize: '0.72rem', fontWeight: 800 }}>
                    {speakerUids.has(r.uid) ? 'Remove mic' : 'Raise'}
                  </span>
                </button>
              ))}
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
      <LiveVipDock hostId={hostId} currentUserId={myId} />
    </div>
  );
}
