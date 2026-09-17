/**
 * /room?id=ch1 — Public Voice Room (Agora RTC)
 *
 * Audio model — Agora RTC SDK v4:
 *   1. Tap mic → take floor → createMicrophoneAudioTrack → publish
 *   2. Remote users auto-subscribed on user-published event
 *   3. Speaking indicators via WebSocket /ws/room-live (JSON only)
 *   4. Floor/mutex via /api/room/floor (one speaker at a time)
 *   5. Tap mic again → unpublish → release floor
 *
 * App ID: 149ef04e839c4132a08efb49d717c436 | Token: null (Testing Mode)
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { IAgoraRTCClient, IMicrophoneAudioTrack, IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng';
import { useNavigate, useSearchParams } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Mic, MicOff, Users, Volume2, VolumeX, X, KeyRound, LockKeyhole, ShieldCheck, ShieldOff, Snowflake, Star, ChevronDown, Send, Image as ImageIcon, Timer, MessageCircle, Crown } from 'lucide-react';
import { useSession } from '@/lib/auth/auth-client';
import { useHeartbeat } from '@/hooks/usePresence';
import UserAvatar from '@/components/UserAvatar';
import NotificationBell from '@/components/NotificationBell';
import OwnerRoomControlPanel from '@/components/OwnerRoomControlPanel';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';

// ── Theme ─────────────────────────────────────────────────────────────────────
const T = {
  bg: 'radial-gradient(ellipse 70% 60% at 50% 30%, #0d2a2e 0%, #0a1a1a 50%, #060e0e 100%)',
  primary: '#00BCD4',
  primaryDim: 'rgba(0,188,212,0.35)',
  primaryBorder: 'rgba(0,188,212,0.2)',
  primaryFaint: 'rgba(0,188,212,0.08)',
  text: 'rgba(200,230,230,0.9)',
  textDim: 'rgba(150,200,200,0.5)',
  navBorder: 'rgba(0,188,212,0.1)',
  red: '#ef4444',
  green: '#22c55e'
};
function channelLabel(id: string) {
  const n = id.replace('ch', '');
  return `Channel ${n}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface RoomMember {
  userId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  joinedAt: number;
  isRoomAdmin?: boolean;
}

// ── Audio chunk queue — REMOVED (replaced by Agora RTC) ──────────────────────
// ChunkPlayer class removed — Agora handles all audio transport natively.

// ── MIME picker — REMOVED (replaced by Agora RTC) ────────────────────────────
// pickMime() removed — Agora handles codec negotiation internally.

const AGORA_APP_ID = '149ef04e839c4132a08efb49d717c436';
// Token is null in Testing Mode (App Certificate disabled)

// ── Main component ────────────────────────────────────────────────────────────
export default function RoomPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const roomId = params.get('id') || 'ch1';
  const {
    user,
    isPending
  } = useSession();
  useHeartbeat(!!user);
  const tick = useAutoRefresh();

  // ── Guest mode: unauthenticated users get a random guest name ───────────────
  const isGuest = !isPending && !user;
  const guestName = useRef("Listener" + Math.floor(Math.random() * 9000)).current;
  const effectiveUserId = user?.id ?? `guest-${guestName}`;
  const effectiveUserName = user?.name ?? guestName;

  // ── Guest: show register modal when they tap mic ────────────────────────────
  const [showGuestModal, setShowGuestModal] = useState(false);

  // ── Room snapshot (HTTP polling) ────────────────────────────────────────────
  const [snapshot, setSnapshot] = useState<{
    floor: string | null;
    members: RoomMember[];
    frozenUsers: string[];
    roomAdmins: string[];
  }>({
    floor: null,
    members: [],
    frozenUsers: [],
    roomAdmins: []
  });
  const [joined, setJoined] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const joinedRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hbRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Recording state (Agora) ─────────────────────────────────────────────────
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [floorDenied, setFloorDenied] = useState(false);
  const [micLevels, setMicLevels] = useState<number[]>([0.3, 0.3, 0.3, 0.3]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const takingRef = useRef(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserRafRef = useRef<number | null>(null);
  const analyserCtxRef = useRef<AudioContext | null>(null);

  // Agora refs
  const agoraClientRef = useRef<IAgoraRTCClient | null>(null);
  const micTrackRef = useRef<IMicrophoneAudioTrack | null>(null);

  // ── Owner Control Panel state ─────────────────────────────────────────────
  const [showOwnerPanel, setShowOwnerPanel] = useState(false);

  // ── Friends Chat Drawer (replaces PTT/HOLD button) ──────────────────────────
  interface FriendEntry {
    id: string;
    name: string | null;
    username: string | null;
    avatarUrl: string | null;
  }
  const [showFriendsDrawer, setShowFriendsDrawer] = useState(false);
  const dmBtnRef = useRef<HTMLDivElement>(null);
  const dmPanelRef = useRef<HTMLDivElement>(null);
  const [dmPanelPos, setDmPanelPos] = useState<{
    top: number;
    right: number;
  } | null>(null);
  const [friendsList, setFriendsList] = useState<FriendEntry[]>([]);
  const [_friendsLoading, setFriendsLoading] = useState(false);
  const [friendsChatTarget, setFriendsChatTarget] = useState<FriendEntry | null>(null);
  const [friendsMsgs, setFriendsMsgs] = useState<QuickMsg[]>([]);
  const [friendsChatText, setFriendsChatText] = useState('');
  const [friendsChatSending, setFriendsChatSending] = useState(false);
  const [friendsTyping, setFriendsTyping] = useState(false);
  const [friendsUnread, setFriendsUnread] = useState<Map<string, QuickMsg>>(new Map());
  const friendsChatBottomRef = useRef<HTMLDivElement>(null);
  const friendsImgRef = useRef<HTMLInputElement>(null);
  const friendsTypingSignalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load friends list when drawer opens
  useEffect(() => {
    if (!showFriendsDrawer || !user) return;
    setFriendsLoading(true);
    fetch('/api/friends', {
      credentials: 'include'
    }).then(r => r.json()).then(d => {
      if (Array.isArray(d)) setFriendsList(d);
    }).catch(() => {}).finally(() => setFriendsLoading(false));
  }, [showFriendsDrawer, user]);

  // Poll DM messages for friends chat
  useEffect(() => {
    if (!friendsChatTarget || !user) return;
    async function pollFriends() {
      try {
        const r = await fetch(`/api/messages?userId=${friendsChatTarget!.id}`, {
          credentials: 'include'
        });
        if (!r.ok) return;
        const msgs = await r.json();
        if (!Array.isArray(msgs)) return;
        setFriendsMsgs(msgs);
        setTimeout(() => friendsChatBottomRef.current?.scrollIntoView({
          behavior: 'smooth'
        }), 60);
      } catch {/* silent */}
    }
    pollFriends();
    const iv = setInterval(pollFriends, 2500);
    return () => clearInterval(iv);
  }, [friendsChatTarget?.id, user]);

  // Poll typing for friends chat
  useEffect(() => {
    if (!friendsChatTarget || !user) return;
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`/api/messages/typing?userId=${friendsChatTarget!.id}`, {
          credentials: 'include'
        });
        if (!r.ok) return;
        const d = await r.json();
        setFriendsTyping(!!d?.typing);
      } catch {/* silent */}
    }, 2000);
    return () => clearInterval(iv);
  }, [friendsChatTarget?.id, user]);

  // Background poll for unread from friends
  useEffect(() => {
    if (!user || !friendsList.length) return;
    const iv = setInterval(async () => {
      for (const f of friendsList) {
        try {
          const r = await fetch(`/api/messages?userId=${f.id}`, {
            credentials: 'include'
          });
          if (!r.ok) continue;
          const msgs = await r.json();
          if (!Array.isArray(msgs) || msgs.length === 0) continue;
          const newest = msgs[msgs.length - 1];
          if (newest.senderId !== user?.id) {
            setFriendsUnread(map => {
              const prev = map.get(f.id);
              if (prev?.id === newest.id) return map;
              const n = new Map(map);
              n.set(f.id, newest);
              return n;
            });
          }
        } catch {/* silent */}
      }
    }, 5000);
    return () => clearInterval(iv);
  }, [user, friendsList]);
  function signalFriendsTyping() {
    if (!friendsChatTarget) return;
    if (friendsTypingSignalRef.current) return;
    fetch(`/api/messages/typing?userId=${friendsChatTarget.id}`, {
      method: 'POST',
      credentials: 'include'
    }).catch(() => {});
    friendsTypingSignalRef.current = setTimeout(() => {
      friendsTypingSignalRef.current = null;
    }, 2000);
  }
  async function sendFriendsMsg() {
    if (!friendsChatTarget || !friendsChatText.trim() || friendsChatSending) return;
    const body = friendsChatText.trim();
    setFriendsChatText('');
    setFriendsChatSending(true);
    try {
      await fetch(`/api/messages?receiverId=${friendsChatTarget.id}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          body,
          type: 'text'
        })
      });
    } catch {/* silent */} finally {
      setFriendsChatSending(false);
    }
  }
  async function sendFriendsImage(file: File) {
    if (!friendsChatTarget) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      await fetch(`/api/messages/file?receiverId=${friendsChatTarget.id}`, {
        method: 'POST',
        credentials: 'include',
        body: fd
      });
    } catch {/* silent */}
  }

  // ── Live WebSocket (speaking indicators only — no audio binary) ─────────────
  const wsRef = useRef<WebSocket | null>(null);

  // ── Volume (controls Agora remote track volume) ──────────────────────────────
  const [volume] = useState(1);
  const [showSpeakerMenu, setShowSpeakerMenu] = useState(false);
  const speakerMenuRef = useRef<HTMLDivElement>(null);

  // ── Mic Timer (admin-only) ────────────────────────────────────────────────────
  const [micTimerEnabled, setMicTimerEnabled] = useState(false);
  const [micTimerSecs, setMicTimerSecs] = useState(60); // default 60s
  const [micTimerLeft, setMicTimerLeft] = useState<number | null>(null);
  const micTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start mic timer countdown when recording begins (if enabled and admin)
  useEffect(() => {
    if (recording && micTimerEnabled && iAmAdmin) {
      setMicTimerLeft(micTimerSecs);
      micTimerRef.current = setInterval(() => {
        setMicTimerLeft(prev => {
          if (prev === null || prev <= 1) {
            clearInterval(micTimerRef.current!);
            // Auto-stop mic when timer hits 0
            stopRecording();
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (micTimerRef.current) clearInterval(micTimerRef.current);
      setMicTimerLeft(null);
    }
    return () => {
      if (micTimerRef.current) clearInterval(micTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  // ── Quick Chat List (arrow button) ───────────────────────────────────────────
  interface QuickMsg {
    id: number;
    senderId: string;
    senderName: string;
    senderAvatar: string | null;
    body: string;
    type: string;
    createdAt: string;
  }
  const [showQuickList, setShowQuickList] = useState(false);
  const quickListRef = useRef<HTMLDivElement>(null);
  // Map of userId → latest unread message for notification dot
  const [quickUnread, setQuickUnread] = useState<Map<string, QuickMsg>>(new Map());
  // Poll room chat messages to detect new ones
  const quickPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const quickLastCountRef = useRef<Record<string, number>>({});

  // ── Quick Chat bottom sheet ───────────────────────────────────────────────────
  const [quickChatTarget, setQuickChatTarget] = useState<RoomMember | null>(null);
  const [quickChatMsgs, setQuickChatMsgs] = useState<QuickMsg[]>([]);
  const [quickChatText, setQuickChatText] = useState('');
  const [quickChatSending, setQuickChatSending] = useState(false);
  const [quickTyping, setQuickTyping] = useState(false);
  const quickChatBottomRef = useRef<HTMLDivElement>(null);
  const quickImgRef = useRef<HTMLInputElement>(null);
  const quickTypingSignalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quickTypingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll DM messages for quick chat
  useEffect(() => {
    if (!quickChatTarget || !user) return;
    async function pollQuick() {
      try {
        const r = await fetch(`/api/messages?userId=${quickChatTarget!.userId}`, {
          credentials: 'include'
        });
        if (!r.ok) return;
        const msgs = await r.json();
        if (!Array.isArray(msgs)) return;
        setQuickChatMsgs(msgs);
        setTimeout(() => quickChatBottomRef.current?.scrollIntoView({
          behavior: 'smooth'
        }), 60);
      } catch {/* silent */}
    }
    pollQuick();
    const iv = setInterval(pollQuick, 2500);
    return () => clearInterval(iv);
  }, [quickChatTarget?.userId, user]);

  // Poll typing for quick chat
  useEffect(() => {
    if (!quickChatTarget || !user) return;
    async function pollTyping() {
      try {
        const r = await fetch(`/api/messages/typing?userId=${quickChatTarget!.userId}`, {
          credentials: 'include'
        });
        if (!r.ok) return;
        const d = await r.json();
        setQuickTyping(!!d?.typing);
      } catch {/* silent */}
    }
    quickTypingPollRef.current = setInterval(pollTyping, 2000);
    return () => {
      if (quickTypingPollRef.current) clearInterval(quickTypingPollRef.current);
    };
  }, [quickChatTarget?.userId, user]);

  // Background poll for room member messages (unread dots)
  useEffect(() => {
    if (!user || !joined) return;
    async function bgPoll() {
      for (const m of snapshot.members) {
        if (m.userId === effectiveUserId) continue;
        try {
          const r = await fetch(`/api/messages?userId=${m.userId}`, {
            credentials: 'include'
          });
          if (!r.ok) continue;
          const msgs = await r.json();
          if (!Array.isArray(msgs) || msgs.length === 0) continue;
          const prev = quickLastCountRef.current[m.userId] ?? msgs.length;
          if (msgs.length > prev) {
            const newest = msgs[msgs.length - 1];
            if (newest.senderId !== user?.id) {
              setQuickUnread(map => {
                const n = new Map(map);
                n.set(m.userId, newest);
                return n;
              });
            }
          }
          quickLastCountRef.current[m.userId] = msgs.length;
        } catch {/* silent */}
      }
    }
    quickPollRef.current = setInterval(bgPoll, 5000);
    return () => {
      if (quickPollRef.current) clearInterval(quickPollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, joined, snapshot.members.length]);

  // Signal typing in quick chat
  function signalQuickTyping() {
    if (!quickChatTarget) return;
    if (quickTypingSignalRef.current) return;
    fetch(`/api/messages/typing?userId=${quickChatTarget.userId}`, {
      method: 'POST',
      credentials: 'include'
    }).catch(() => {});
    quickTypingSignalRef.current = setTimeout(() => {
      quickTypingSignalRef.current = null;
    }, 2000);
  }

  // Send quick chat message
  async function sendQuickMsg() {
    if (!quickChatTarget || !quickChatText.trim() || quickChatSending) return;
    const body = quickChatText.trim();
    setQuickChatText('');
    setQuickChatSending(true);
    try {
      await fetch(`/api/messages?receiverId=${quickChatTarget.userId}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          body,
          type: 'text'
        })
      });
    } catch {/* silent */} finally {
      setQuickChatSending(false);
    }
  }

  // Send quick chat image
  async function sendQuickImage(file: File) {
    if (!quickChatTarget) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      await fetch(`/api/messages/file?receiverId=${quickChatTarget.userId}`, {
        method: 'POST',
        credentials: 'include',
        body: fd
      });
    } catch {/* silent */}
  }

  // Close quick list on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (quickListRef.current && !quickListRef.current.contains(e.target as Node)) {
        setShowQuickList(false);
      }
    }
    if (showQuickList) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showQuickList]);

  // DM panel position + outside-click close
  useEffect(() => {
    if (!showFriendsDrawer) return;
    const update = () => {
      if (!dmBtnRef.current) return;
      const r = dmBtnRef.current.getBoundingClientRect();
      setDmPanelPos({
        top: r.bottom + 8,
        right: window.innerWidth - r.right
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [showFriendsDrawer]);
  useEffect(() => {
    if (!showFriendsDrawer) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!dmBtnRef.current?.contains(t) && !dmPanelRef.current?.contains(t)) {
        setShowFriendsDrawer(false);
        setFriendsChatTarget(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFriendsDrawer]);

  // ── Enumerate output devices (kept for future use) ───────────────────────────
  const refreshDevices = useCallback(async () => {
    try {
      await navigator.mediaDevices.enumerateDevices();
    } catch {/* not supported */}
  }, []);

  // Close speaker menu on outside click
  useEffect(() => {
    if (!showSpeakerMenu) return;
    const handler = (e: MouseEvent) => {
      if (speakerMenuRef.current && !speakerMenuRef.current.contains(e.target as Node)) {
        setShowSpeakerMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSpeakerMenu]);

  // ── Volume change / device switch — reserved for future AudioControlPanel ────

  // ── Safe WS send — only sends when socket is fully OPEN ──────────────────────
  function wsSend(data: string) {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(data);
  }

  // ── Connect WebSocket (speaking indicators only — no audio binary) ────────────
  function connectWS() {
    if (wsRef.current) return;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/ws/room-live?room=${encodeURIComponent(roomId)}&userId=${encodeURIComponent(effectiveUserId)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'join',
        userId: effectiveUserId,
        name: effectiveUserName,
        mime: 'agora'
      }));
    };
    ws.onmessage = e => {
      if (e.data instanceof ArrayBuffer) return; // ignore binary (Agora handles audio)
      try {
        const msg = JSON.parse(e.data as string) as {
          type: string;
          userId?: string;
        };
        if (msg.type === 'peer_left' && msg.userId) {
          // Agora handles audio cleanup; just update snapshot via poll
        }
      } catch {/* ignore */}
    };
    ws.onclose = () => {
      wsRef.current = null;
    };
    ws.onerror = () => {
      wsRef.current = null;
    };
  }

  // ── Custom room name ────────────────────────────────────────────────────────
  const [roomCustomName, setRoomCustomName] = useState('');

  // ── PIN lock check ──────────────────────────────────────────────────────────
  const OWNER_EMAIL = 'alsoor@mail.com';
  const isOwner = user?.email === OWNER_EMAIL;
  // iAmAdmin: owner OR granted room-admin in this session
  const iAmAdmin = isOwner || snapshot.roomAdmins.includes(effectiveUserId);

  // ── Member popup (admin actions) ────────────────────────────────────────────
  const [selectedMember, setSelectedMember] = useState<RoomMember | null>(null);
  const adminAction = useCallback(async (targetId: string, action: string) => {
    await fetch('/api/room/admin', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        roomId,
        targetId,
        action
      })
    });
    setSelectedMember(null);
    // Refresh snapshot immediately
    const r = await fetch(`/api/room?id=${roomId}`, {
      credentials: 'include'
    });
    if (r.ok) setSnapshot(await r.json());
  }, [roomId]);
  const [pinStatus, setPinStatus] = useState<'checking' | 'locked' | 'unlocked'>('checking');
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinVerifying, setPinVerifying] = useState(false);
  useEffect(() => {
    fetch('/api/room/names').then(r => r.ok ? r.json() : {}).then((names: Record<string, string>) => setRoomCustomName(names[roomId] ?? '')).catch(() => {});
  }, [roomId]);
  useEffect(() => {
    if (isPending) return;
    if (isOwner) {
      setPinStatus('unlocked');
      return;
    }
    fetch('/api/room/pin', {
      credentials: 'include'
    }).then(async r => {
      if (!r.ok) return {};
      return r.json();
    }).then((locked: Record<string, boolean>) => {
      setPinStatus(locked[roomId] ? 'locked' : 'unlocked');
    }).catch(() => setPinStatus('unlocked'));
  }, [roomId, isOwner, isPending]);
  async function verifyPin() {
    if (!/^\d{8}$/.test(pinInput)) {
      setPinError('يجب أن يكون الرقم السري 8 أرقام');
      return;
    }
    setPinVerifying(true);
    setPinError('');
    try {
      const r = await fetch('/api/room/pin/verify', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          roomId,
          pin: pinInput
        })
      });
      if (r.ok) {
        setPinStatus('unlocked');
      } else {
        setPinError('رقم سري خاطئ');
        setPinInput('');
      }
    } catch {
      setPinError('Network error');
    }
    setPinVerifying(false);
  }

  // ── Highlighted users ───────────────────────────────────────────────────────
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!user) return;
    const load = () => fetch('/api/highlights').then(r => r.ok ? r.json() : []).then((ids: string[]) => setHighlightedIds(new Set(ids))).catch(() => {});
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [user]);
  const fetchSnapshot = useCallback(async () => {
    try {
      const r = await fetch(`/api/room?id=${roomId}`);
      if (r.ok) setSnapshot(await r.json());
    } catch {}
  }, [roomId]);
  useEffect(() => {
    if (!joined || !user) return;
    fetchSnapshot();
    pollRef.current = setInterval(fetchSnapshot, 1500);
    const hb = () => fetch('/api/room/heartbeat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        roomId,
        userId: effectiveUserId
      })
    }).catch(() => {});
    hb();
    hbRef.current = setInterval(hb, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (hbRef.current) clearInterval(hbRef.current);
    };
  }, [joined, user, roomId, fetchSnapshot, tick]);

  // ── Join — init Agora client + join channel ──────────────────────────────────
  async function handleJoin() {
    setHasJoined(true);
    fetch('/api/room/join', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        roomId,
        userId: effectiveUserId,
        name: effectiveUserName
      })
    }).catch(() => {});
    joinedRef.current = true;
    setJoined(true);
    connectWS();
    refreshDevices();

    // Guests: listen-only — don't join Agora (no audio publishing)
    if (isGuest) return;
    try {
      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
      AgoraRTC.setLogLevel(3);
      const client = AgoraRTC.createClient({
        mode: 'rtc',
        codec: 'vp8'
      } as any);
      agoraClientRef.current = client;
      client.on('user-published', async (remoteUser: IAgoraRTCRemoteUser, mediaType: string) => {
        if (mediaType !== 'audio') return;
        await client.subscribe(remoteUser, 'audio');
        remoteUser.audioTrack?.setVolume(Math.round(volume * 100));
        // Guests CAN hear audio (listen-only) — only mic/speaking is blocked
        if (!mutedRef.current) remoteUser.audioTrack?.play();
      });
      client.on('user-unpublished', (remoteUser: IAgoraRTCRemoteUser) => {
        remoteUser.audioTrack?.stop();
      });
      const tokenRes = await fetch(`/api/call/token?channel=${encodeURIComponent(roomId)}&uid=${encodeURIComponent(effectiveUserId)}`, { credentials: 'include' });
      if (!tokenRes.ok) throw new Error('Unable to secure the audio connection.');
      const { token, uid } = (await tokenRes.json()) as { token: string; uid: number };
      await client.join(AGORA_APP_ID, roomId, token, uid);
    } catch (err) {
      console.error('[room] Agora join error:', err);
    }
  }

  // ── Leave ────────────────────────────────────────────────────────────────────
  async function handleLeave() {
    joinedRef.current = false;
    await cancelRecording();
    wsRef.current?.close();
    wsRef.current = null;
    if (snapshot.floor === effectiveUserId) {
      await fetch('/api/room/floor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          roomId,
          action: 'forceRelease',
          userId: effectiveUserId
        })
      }).catch(() => {});
    }
    try {
      await agoraClientRef.current?.leave();
    } catch {}
    agoraClientRef.current = null;
    await fetch('/api/room/leave', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        roomId,
        userId: effectiveUserId
      })
    }).catch(() => {});
    navigate(-1);
  }

  // ── Mic level analyser (waveform from Agora mic track) ──────────────────────
  function startAnalyser(track: IMicrophoneAudioTrack) {
    try {
      const ctx = new AudioContext();
      analyserCtxRef.current = ctx;
      const mediaStream = new MediaStream([track.getMediaStreamTrack()]);
      const src = ctx.createMediaStreamSource(mediaStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 32;
      src.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const step = Math.floor(data.length / 4);
        const levels = [0, 1, 2, 3].map(i => Math.max(0.08, (data[i * step] ?? 0) / 255));
        setMicLevels(levels);
        analyserRafRef.current = requestAnimationFrame(tick);
      };
      analyserRafRef.current = requestAnimationFrame(tick);
    } catch {/* ignore */}
  }
  function stopAnalyser() {
    if (analyserRafRef.current) cancelAnimationFrame(analyserRafRef.current);
    analyserRafRef.current = null;
    analyserRef.current = null;
    analyserCtxRef.current?.close().catch(() => {});
    analyserCtxRef.current = null;
    setMicLevels([0.3, 0.3, 0.3, 0.3]);
  }

  // ── Start recording (Agora publish) ─────────────────────────────────────────
  async function startRecording() {
    if (takingRef.current || !agoraClientRef.current) return;
    takingRef.current = true;
    try {
      const r = await fetch('/api/room/floor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          roomId,
          action: 'take',
          userId: effectiveUserId
        })
      });
      const d = (await r.json()) as {
        granted: boolean;
      };
      if (!d.granted) {
        setFloorDenied(true);
        setTimeout(() => setFloorDenied(false), 1200);
        return;
      }
      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
      const micTrack = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: 'music_standard'
      });
      micTrackRef.current = micTrack;
      await agoraClientRef.current.publish([micTrack]);
      setRecording(true);
      setRecSeconds(0);
      recTimerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
      startAnalyser(micTrack);
      wsSend(JSON.stringify({
        type: 'start',
        userId: effectiveUserId
      }));
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        // mic permission denied — floor will be released below
      }
      await fetch('/api/room/floor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          roomId,
          action: 'forceRelease',
          userId: effectiveUserId
        })
      }).catch(() => {});
    } finally {
      takingRef.current = false;
    }
  }

  // ── Stop recording (Agora unpublish) ─────────────────────────────────────────
  async function stopRecording() {
    if (!micTrackRef.current) return;
    const track = micTrackRef.current;
    micTrackRef.current = null;
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    setRecording(false);
    setRecSeconds(0);
    try {
      await agoraClientRef.current?.unpublish([track]);
      track.stop();
      track.close();
    } catch {}
    stopAnalyser();
    wsSend(JSON.stringify({
      type: 'stop',
      userId: effectiveUserId
    }));
    await fetch('/api/room/floor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        roomId,
        action: 'forceRelease',
        userId: effectiveUserId
      })
    }).catch(() => {});
  }

  // ── Cancel recording ─────────────────────────────────────────────────────────
  async function cancelRecording() {
    if (!micTrackRef.current) return;
    const track = micTrackRef.current;
    micTrackRef.current = null;
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    setRecording(false);
    setRecSeconds(0);
    try {
      await agoraClientRef.current?.unpublish([track]);
      track.stop();
      track.close();
    } catch {}
    stopAnalyser();
    wsSend(JSON.stringify({
      type: 'stop',
      userId: effectiveUserId
    }));
    fetch('/api/room/floor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        roomId,
        action: 'forceRelease',
        userId: effectiveUserId
      })
    }).catch(() => {});
  }

  // ── Mute toggle — stop/play Agora remote tracks ──────────────────────────────
  function toggleMute() {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    agoraClientRef.current?.remoteUsers.forEach(u => {
      if (next) u.audioTrack?.stop();else u.audioTrack?.play();
    });
  }

  // ── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => () => {
    if (joinedRef.current) {
      wsRef.current?.close();
      void (async () => {
        if (micTrackRef.current) {
          try {
            await agoraClientRef.current?.unpublish([micTrackRef.current]);
          } catch {}
          micTrackRef.current.stop();
          micTrackRef.current.close();
          micTrackRef.current = null;
        }
        try {
          await agoraClientRef.current?.leave();
        } catch {}
        agoraClientRef.current = null;
      })();
    }
    stopAnalyser();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Guards ──────────────────────────────────────────────────────────────────
  if (isPending) return null;
  // Guests are allowed — they enter in listen-only mode

  // ── PIN lock screen ─────────────────────────────────────────────────────────
  if (pinStatus === 'checking') {
    return <div style={{
      minHeight: '100dvh',
      background: T.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
        <motion.div animate={{
        rotate: 360
      }} transition={{
        duration: 1,
        repeat: Infinity,
        ease: 'linear'
      }} style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        border: '2px solid rgba(0,188,212,0.2)',
        borderTopColor: T.primary
      }} />
      </div>;
  }
  if (pinStatus === 'locked') {
    const roomLabel = roomCustomName || channelLabel(roomId);
    return <>
        <Helmet><title>{roomLabel} | Private Room | Stooorna</title></Helmet>
        <div style={{
        minHeight: '100dvh',
        background: T.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
        padding: 32,
        fontFamily: 'var(--font-sans)'
      }}>
          {/* Back */}
          <motion.button whileTap={{
          scale: 0.88
        }} onClick={() => navigate(-1)} style={{
          position: 'absolute',
          top: 20,
          left: 20,
          color: T.primary,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 8
        }}>
            <ArrowLeft size={22} strokeWidth={2} />
          </motion.button>

          {/* Lock icon */}
          <motion.div animate={{
          scale: [1, 1.05, 1]
        }} transition={{
          duration: 2.5,
          repeat: Infinity
        }} style={{
          width: 90,
          height: 90,
          borderRadius: '50%',
          background: 'rgba(239,68,68,0.1)',
          border: '2px solid rgba(239,68,68,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 40px rgba(239,68,68,0.2)',
          marginBottom: 24
        }}>
            <LockKeyhole size={38} strokeWidth={1.5} color="#ef4444" />
          </motion.div>

          {/* Room name */}
          <p style={{
          color: T.text,
          fontSize: '1.2rem',
          fontWeight: 700,
          marginBottom: 6,
          textAlign: 'center'
        }}>
            {roomLabel}
          </p>
          <p style={{
          color: 'rgba(239,68,68,0.7)',
          fontSize: '0.78rem',
          marginBottom: 32,
          textAlign: 'center'
        }}>
            هذه الغرفة مغلقة من قبل الأونر — أدخل الرقم السري للدخول
          </p>

          {/* PIN input */}
          <div style={{
          width: '100%',
          maxWidth: 280,
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}>
            <div style={{
            position: 'relative'
          }}>
              <KeyRound size={15} style={{
              position: 'absolute',
              left: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'rgba(239,68,68,0.6)'
            }} />
              <input type="text" inputMode="numeric" maxLength={8} value={pinInput} onChange={e => {
              setPinInput(e.target.value.replace(/\D/g, '').slice(0, 8));
              setPinError('');
            }} placeholder="00000000" autoFocus style={{
              width: '100%',
              padding: '13px 14px 13px 40px',
              borderRadius: 12,
              background: 'rgba(0,20,25,0.8)',
              border: `1px solid ${pinError ? 'rgba(239,68,68,0.6)' : 'rgba(239,68,68,0.25)'}`,
              color: T.text,
              fontSize: '1.3rem',
              fontWeight: 700,
              letterSpacing: '0.4em',
              outline: 'none',
              fontFamily: 'monospace',
              textAlign: 'center',
              boxSizing: 'border-box'
            }} onKeyDown={e => {
              if (e.key === 'Enter') verifyPin();
            }} />
            </div>

            {pinError && <motion.p initial={{
            opacity: 0,
            y: -4
          }} animate={{
            opacity: 1,
            y: 0
          }} style={{
            color: '#ef4444',
            fontSize: '0.75rem',
            textAlign: 'center',
            margin: 0
          }}>
                {pinError}
              </motion.p>}

            <motion.button whileTap={{
            scale: 0.95
          }} onClick={verifyPin} disabled={pinVerifying || pinInput.length !== 8} style={{
            padding: '13px 0',
            borderRadius: 12,
            background: pinInput.length === 8 ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${pinInput.length === 8 ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)'}`,
            color: pinInput.length === 8 ? '#ef4444' : T.textDim,
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: pinVerifying ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'all 0.2s'
          }}>
              <LockKeyhole size={15} />
              {pinVerifying ? 'جاري التحقق…' : 'دخول'}
            </motion.button>
          </div>
        </div>
      </>;
  }

  // ── Join screen ─────────────────────────────────────────────────────────────
  if (!hasJoined) {
    return <>
        <Helmet>
          <title>{channelLabel(roomId)} Voice Room | Stooorna</title>
        </Helmet>
        <div style={{
        minHeight: '100dvh',
        background: T.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        padding: 32,
        fontFamily: 'var(--font-sans)'
      }}>
          <motion.button whileTap={{
          scale: 0.88
        }} onClick={() => navigate(-1)} style={{
          position: 'absolute',
          top: 20,
          left: 20,
          color: T.primary,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 8
        }}>
            <ArrowLeft size={22} strokeWidth={2} />
          </motion.button>
          <motion.div animate={{
          scale: [1, 1.06, 1]
        }} transition={{
          duration: 2,
          repeat: Infinity
        }} style={{
          width: 90,
          height: 90,
          borderRadius: '50%',
          background: T.primaryFaint,
          border: `2px solid ${T.primaryBorder}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 0 40px rgba(0,188,212,0.2)`
        }}>
            <Mic size={38} strokeWidth={1.5} color={T.primary} />
          </motion.div>
          <div style={{
          textAlign: 'center'
        }}>
            <p style={{
            color: T.text,
            fontSize: '1.2rem',
            fontWeight: 700,
            marginBottom: 6
          }}>
              {roomCustomName || channelLabel(roomId)}
            </p>
            <p style={{
            color: T.textDim,
            fontSize: '0.8rem'
          }}>Live voice room — tap to join</p>
          </div>
          <motion.button whileTap={{
          scale: 0.93
        }} onClick={handleJoin} style={{
          padding: '14px 48px',
          borderRadius: 32,
          background: `linear-gradient(135deg, ${T.primary} 0%, #0097a7 100%)`,
          border: 'none',
          color: '#001a1f',
          fontSize: '1rem',
          fontWeight: 700,
          cursor: 'pointer',
          letterSpacing: '0.04em',
          boxShadow: `0 0 30px rgba(0,188,212,0.4)`
        }}>
            Join Room
          </motion.button>
        </div>
      </>;
  }
  const currentSpeaker = snapshot.members.find(m => m.userId === snapshot.floor) ?? null;
  const iAmOnFloor = snapshot.floor === effectiveUserId;
  const floorBusy = !!snapshot.floor && !iAmOnFloor;
  const memberCount = snapshot.members.length;
  return <>
      <Helmet>
        <title>{channelLabel(roomId)} Voice Room | Stooorna</title>
        <meta name="description" content={`Join ${channelLabel(roomId)} — a live public voice room on Stooorna.`} />
        <link rel="canonical" href={`https://stooorna.com/room?id=${roomId}`} />
        <meta property="og:title" content={`${channelLabel(roomId)} Voice Room | Stooorna`} />
        <meta property="og:description" content={`Join ${channelLabel(roomId)} — a live public voice room on Stooorna.`} />
        <meta property="og:image" content="https://stooorna.com/og-image.svg" />
        <meta property="og:url" content={`https://stooorna.com/room?id=${roomId}`} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://stooorna.com/og-image.svg" />
      </Helmet>
      <h1 className="sr-only">{channelLabel(roomId)} Voice Room</h1>

      <div style={{
      minHeight: '100dvh',
      background: T.bg,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'var(--font-sans)'
    }}>

        {/* ── Header ── */}
        <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '40px 20px 14px',
        background: 'rgba(6,14,14,0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${T.navBorder}`,
        position: 'sticky',
        top: 0,
        zIndex: 20
      }}>
          <motion.button whileTap={{
          scale: 0.85
        }} onClick={handleLeave} style={{
          color: T.primary,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 4
        }}>
            <ArrowLeft size={22} strokeWidth={2} />
          </motion.button>
          <div style={{
          flex: 1
        }}>
            <p style={{
            color: T.text,
            fontSize: '0.9rem',
            fontWeight: 600
          }}>
              {roomCustomName || channelLabel(roomId)}
            </p>
            {roomCustomName && <p style={{
            color: T.textDim,
            fontSize: '0.6rem',
            marginBottom: 1
          }}>{channelLabel(roomId)}</p>}
            <p style={{
            color: T.textDim,
            fontSize: '0.68rem',
            display: 'flex',
            alignItems: 'center',
            gap: 4
          }}>
              <Users size={10} strokeWidth={2} />
              {memberCount} {memberCount === 1 ? 'person' : 'people'} in room
            </p>
          </div>

          {/* Mute toggle */}
          <motion.button whileTap={{
          scale: 0.88
        }} onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'} style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: muted ? 'rgba(239,68,68,0.15)' : T.primaryFaint,
          border: `1px solid ${muted ? 'rgba(239,68,68,0.4)' : T.primaryBorder}`,
          cursor: 'pointer',
          outline: 'none',
          transition: 'all 0.2s'
        }}>
            {muted ? <VolumeX size={16} strokeWidth={2} color={T.red} /> : <Volume2 size={16} strokeWidth={2} color={T.primary} />}
          </motion.button>

          {/* ── Owner Control Button (replaces AudioControlPanel — Owner only) ── */}
          {joined && isOwner && <motion.button whileTap={{
          scale: 0.92
        }} onClick={() => setShowOwnerPanel(true)} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '9px 18px',
          borderRadius: 22,
          background: 'hsl(var(--secondary) / 0.12)',
          border: `1.5px solid hsl(var(--secondary) / 0.35)`,
          cursor: 'pointer',
          outline: 'none',
          boxShadow: '0 0 16px hsl(var(--secondary) / 0.12)',
          transition: 'all 0.2s'
        }}>
              <Crown size={15} strokeWidth={2} color="hsl(var(--secondary))" />
              <span style={{
            color: 'hsl(var(--secondary))',
            fontSize: '0.72rem',
            fontWeight: 800,
            letterSpacing: '0.06em'
          }}>
                Control
              </span>
            </motion.button>}




        </div>

        {/* ── Members area ── */}
        {(() => {
        // Split members: guests (userId starts with "guest-") vs registered
        const registeredMembers = snapshot.members.filter(m => !m.userId.startsWith('guest-'));
        const guestMembers = snapshot.members.filter(m => m.userId.startsWith('guest-'));
        return <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px 16px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14
        }}>

              {/* ── Section header ── */}
              <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
                <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}>
                  <Users size={13} strokeWidth={2} color={T.primary} />
                  <span style={{
                color: T.primary,
                fontSize: '0.65rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase'
              }}>
                    أعضاء الروم
                  </span>
                </div>
                <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
                  <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 10px',
                borderRadius: 20,
                background: T.primaryFaint,
                border: `1px solid ${T.primaryBorder}`
              }}>
                    <motion.div animate={{
                  opacity: [1, 0.4, 1]
                }} transition={{
                  duration: 1.4,
                  repeat: Infinity
                }} style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: T.green
                }} />
                    <span style={{
                  color: T.text,
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums'
                }}>
                      {memberCount}
                    </span>
                  </div>
                  {/* Bell on right, Chat on its right */}
                  <div style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6
              }}>
                    {joined && user && <NotificationBell userId={user.id} />}
                    {/* ── DM Chat button — right of bell ── */}
                    {joined && <div style={{
                  position: 'relative'
                }} ref={dmBtnRef}>
                        <motion.button whileTap={{
                    scale: 0.88
                  }} onClick={() => {
                    if (user) {
                      setShowFriendsDrawer(v => !v);
                      if (showFriendsDrawer) setFriendsChatTarget(null);
                    }
                  }} title="الرسائل الخاصة" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: showFriendsDrawer ? 'hsl(var(--accent))' : friendsUnread.size > 0 || quickUnread.size > 0 ? T.primaryBorder : T.primaryFaint,
                    border: `1px solid ${T.primaryBorder}`,
                    cursor: 'pointer',
                    outline: 'none',
                    transition: 'all 0.2s',
                    position: 'relative'
                  }}>
                          <MessageCircle size={16} strokeWidth={2} color={T.primary} />
                          {(friendsUnread.size > 0 || quickUnread.size > 0) && <motion.div animate={{
                      scale: [1, 1.3, 1]
                    }} transition={{
                      duration: 0.9,
                      repeat: Infinity
                    }} style={{
                      position: 'absolute',
                      top: 2,
                      right: 2,
                      width: 9,
                      height: 9,
                      borderRadius: '50%',
                      background: T.red,
                      border: '1.5px solid hsl(var(--background))'
                    }} />}
                        </motion.button>
                      </div>}
                  </div>
                </div>
              </div>

              {/* ── Registered members — compact horizontal wrap ── */}
              {registeredMembers.length === 0 ? <div style={{
            textAlign: 'center',
            paddingTop: 20,
            color: T.textDim,
            fontSize: '0.78rem'
          }}>
                  لا يوجد أعضاء مسجلين بعد
                </div> : <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10
          }}>
                  {registeredMembers.map(m => {
              const isFloor = m.userId === snapshot.floor;
              const isRed = highlightedIds.has(m.userId);
              const isOwnerMember = m.username === 'Q8' || m.username === 'Stooorna';
              const isFrozen = snapshot.frozenUsers.includes(m.userId);
              const isAdmin = m.isRoomAdmin || snapshot.roomAdmins.includes(m.userId);
              const label = m.name ?? m.username ?? 'User';
              const isMe = m.userId === effectiveUserId;
              return <motion.div key={m.userId} initial={{
                opacity: 0,
                scale: 0.85
              }} animate={{
                opacity: 1,
                scale: 1
              }} onClick={() => {
                if (iAmAdmin && !isMe && !isOwnerMember) setSelectedMember(m);
              }} style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                width: 62,
                cursor: iAmAdmin && !isMe && !isOwnerMember ? 'pointer' : 'default'
              }}>
                        {/* Avatar with indicators */}
                        <div style={{
                  position: 'relative'
                }}>
                          {/* Speaking ring */}
                          {isFloor && <motion.div animate={{
                    scale: [1, 1.18, 1],
                    opacity: [0.7, 0.3, 0.7]
                  }} transition={{
                    duration: 0.7,
                    repeat: Infinity
                  }} style={{
                    position: 'absolute',
                    inset: -4,
                    borderRadius: '50%',
                    border: `2px solid ${T.red}`,
                    pointerEvents: 'none'
                  }} />}
                          <UserAvatar name={label} avatarUrl={m.avatarUrl} size={40} red={isRed} blue={isOwnerMember} />
                          {/* Status dot */}
                          {isFloor ? <motion.div animate={{
                    scale: [1, 1.3, 1]
                  }} transition={{
                    duration: 0.6,
                    repeat: Infinity
                  }} style={{
                    position: 'absolute',
                    bottom: -1,
                    right: -1,
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: T.red,
                    border: '2px solid hsl(var(--background))'
                  }} /> : isFrozen ? <div style={{
                    position: 'absolute',
                    bottom: -1,
                    right: -1,
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: 'hsl(var(--primary))',
                    border: '2px solid hsl(var(--background))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                              <Snowflake size={7} color="hsl(var(--primary-foreground))" />
                            </div> : isMe ? <div style={{
                    position: 'absolute',
                    bottom: -1,
                    right: -1,
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: T.green,
                    border: '2px solid hsl(var(--background))'
                  }} /> : null}
                        </div>
                        {/* Name */}
                        <p style={{
                  color: isRed ? T.red : isOwnerMember ? 'hsl(var(--secondary))' : isFloor ? T.red : T.text,
                  fontSize: '0.6rem',
                  fontWeight: isFloor || isOwnerMember ? 700 : 500,
                  textAlign: 'center',
                  maxWidth: 60,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  margin: 0,
                  textShadow: isOwnerMember ? '0 0 8px hsl(var(--secondary) / 0.5)' : 'none'
                }}>
                          {label.split(' ')[0]}{isMe ? ' (أنا)' : ''}
                        </p>
                        {/* Admin badge — tiny */}
                        {isAdmin && !isOwnerMember && <span style={{
                  fontSize: '0.48rem',
                  color: 'hsl(var(--accent))',
                  fontWeight: 700,
                  background: 'hsl(var(--accent) / 0.12)',
                  border: '1px solid hsl(var(--accent) / 0.3)',
                  padding: '1px 4px',
                  borderRadius: 3,
                  marginTop: -2
                }}>
                            آدمن
                          </span>}
                      </motion.div>;
            })}
                </div>}

              {/* ── Guests section — vertical list, listen-only ── */}
              {guestMembers.length > 0 && <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0
          }}>
                  {/* Guests header */}
                  <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 8
            }}>
                    <div style={{
                flex: 1,
                height: 1,
                background: T.navBorder
              }} />
                    <span style={{
                color: T.textDim,
                fontSize: '0.58rem',
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap'
              }}>
                      زوار ({guestMembers.length})
                    </span>
                    <div style={{
                flex: 1,
                height: 1,
                background: T.navBorder
              }} />
                  </div>
                  {/* Guest list — vertical, name only */}
                  <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4
            }}>
                    {guestMembers.map(m => <motion.div key={m.userId} initial={{
                opacity: 0,
                x: 8
              }} animate={{
                opacity: 1,
                x: 0
              }} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 10px',
                borderRadius: 8,
                background: 'hsl(var(--muted) / 0.3)'
              }}>
                        {/* Simple circle placeholder — no avatar for guests */}
                        <div style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: T.primaryFaint,
                  border: `1px solid ${T.primaryBorder}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                          <Users size={10} strokeWidth={2} color={T.textDim} />
                        </div>
                        <span style={{
                  color: T.textDim,
                  fontSize: '0.72rem',
                  fontWeight: 500
                }}>Listener</span>
                      </motion.div>)}
                  </div>
                </div>}

            </div>;
      })()}

        {/* ── Bottom bar ── */}
        <div style={{
        padding: '16px 24px 40px',
        background: 'rgba(6,14,14,0.95)',
        backdropFilter: 'blur(12px)',
        borderTop: `1px solid ${T.navBorder}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10
      }}>

          {/* ── Muted banner — top of bottom bar, always visible when muted ── */}
          <AnimatePresence>
            {muted && <motion.div key="muted-banner" initial={{
            opacity: 0,
            y: -6,
            scale: 0.95
          }} animate={{
            opacity: 1,
            y: 0,
            scale: 1
          }} exit={{
            opacity: 0,
            y: -6,
            scale: 0.95
          }} style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '8px 16px',
            borderRadius: 12,
            background: 'rgba(239,68,68,0.13)',
            border: '1px solid rgba(239,68,68,0.35)'
          }}>
                <VolumeX size={15} strokeWidth={2.5} color={T.red} />
                <span style={{
              color: T.red,
              fontSize: '0.78rem',
              fontWeight: 700,
              letterSpacing: '0.03em'
            }}>Speaker muted — you won't hear anyone</span>
              </motion.div>}
          </AnimatePresence>

          {/* Status hint */}
          <AnimatePresence mode="wait">
            {floorDenied ? <motion.p key="denied" initial={{
            opacity: 0
          }} animate={{
            opacity: 1
          }} exit={{
            opacity: 0
          }} style={{
            color: T.red,
            fontSize: '0.75rem',
            textAlign: 'center'
          }}>
                {currentSpeaker ? `${currentSpeaker.name ?? currentSpeaker.username ?? 'Someone'} يتحدث — انتظر` : 'الميكروفون مشغول'}
              </motion.p> : recording ? <motion.p key="rec" initial={{
            opacity: 0
          }} animate={{
            opacity: 1
          }} exit={{
            opacity: 0
          }} style={{
            color: T.red,
            fontSize: '0.75rem',
            textAlign: 'center'
          }}>
                مباشر — اضغط الميكروفون للإيقاف، أو ✕ للإلغاء
              </motion.p> : floorBusy ? <motion.p key="busy" initial={{
            opacity: 0
          }} animate={{
            opacity: 1
          }} exit={{
            opacity: 0
          }} style={{
            color: T.textDim,
            fontSize: '0.75rem',
            textAlign: 'center'
          }}>
                انتظر حتى يتحرر الميكروفون
              </motion.p> : <motion.p key="free" initial={{
            opacity: 0
          }} animate={{
            opacity: 1
          }} exit={{
            opacity: 0
          }} style={{
            color: T.textDim,
            fontSize: '0.75rem',
            textAlign: 'center'
          }}>
                {isGuest ? 'استمع فقط — سجّل للتحدث' : 'اضغط الميكروفون للتحدث مباشرة'}
              </motion.p>}
          </AnimatePresence>

          {/* Recording timer + Mic Timer countdown */}
          <AnimatePresence>
            {recording && <motion.div key="timer" initial={{
            opacity: 0,
            scale: 0.9
          }} animate={{
            opacity: 1,
            scale: 1
          }} exit={{
            opacity: 0,
            scale: 0.9
          }} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 18px',
            borderRadius: 24,
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)'
          }}>
                {/* Real mic waveform bars */}
                <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2
            }}>
                  {micLevels.concat(micLevels.slice().reverse()).map((lvl, i) => <div key={i} style={{
                width: 2.5,
                height: Math.max(3, lvl * 18),
                borderRadius: 2,
                background: T.red,
                transformOrigin: 'center',
                transition: 'height 0.08s ease'
              }} />)}
                </div>
                <span style={{
              color: T.red,
              fontSize: '0.85rem',
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              minWidth: 32
            }}>
                  {String(Math.floor(recSeconds / 60)).padStart(2, '0')}:{String(recSeconds % 60).padStart(2, '0')}
                </span>
                {/* Mic Timer countdown badge */}
                {micTimerEnabled && micTimerLeft !== null && <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 10,
              background: micTimerLeft <= 10 ? 'rgba(239,68,68,0.2)' : T.primaryFaint,
              border: `1px solid ${micTimerLeft <= 10 ? 'rgba(239,68,68,0.5)' : T.primaryBorder}`
            }}>
                    <Timer size={11} color={micTimerLeft <= 10 ? T.red : T.primary} strokeWidth={2.5} />
                    <span style={{
                color: micTimerLeft <= 10 ? T.red : T.primary,
                fontSize: '0.72rem',
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums'
              }}>
                      {micTimerLeft}s
                    </span>
                  </div>}
              </motion.div>}
          </AnimatePresence>

          {/* ── Current speaker — shown BELOW mic button ── */}
          <AnimatePresence>
            {currentSpeaker && <motion.div key="speaker-above-mic" initial={{
            opacity: 0,
            y: 8
          }} animate={{
            opacity: 1,
            y: 0
          }} exit={{
            opacity: 0,
            y: 8
          }} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6
          }}>
                {/* Avatar + name row */}
                <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
                  <motion.div animate={{
                scale: [1, 1.25, 1]
              }} transition={{
                duration: 0.6,
                repeat: Infinity
              }} style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: T.red,
                flexShrink: 0,
                boxShadow: '0 0 8px rgba(239,68,68,0.8)'
              }} />
                  {/* Guests see real avatar and name — they can hear and see who's speaking */}
                  <UserAvatar name={currentSpeaker.name ?? currentSpeaker.username ?? 'User'} avatarUrl={currentSpeaker.avatarUrl} size={32} red={highlightedIds.has(currentSpeaker.userId)} />
                  <span style={{
                color: highlightedIds.has(currentSpeaker.userId) ? T.red : T.text,
                fontSize: '0.82rem',
                fontWeight: 700
              }}>
                    {currentSpeaker.name ?? currentSpeaker.username ?? 'User'}
                    {currentSpeaker.userId === effectiveUserId && ' (أنا)'}
                  </span>
                </div>

                {/* Waveform — real levels if I'm the speaker, animated otherwise */}
                <div style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 3,
              height: 24
            }}>
                  {(currentSpeaker.userId === effectiveUserId ? micLevels.concat(micLevels.slice().reverse()).concat(micLevels) : Array.from({
                length: 9
              }, (_, i) => i)).map((val, i) => currentSpeaker.userId === effectiveUserId ? <div key={i} style={{
                width: 3.5,
                height: Math.max(3, (val as number) * 22),
                borderRadius: 3,
                background: `linear-gradient(to top, ${T.red}, rgba(239,68,68,0.4))`,
                transformOrigin: 'bottom',
                transition: 'height 0.08s ease'
              }} /> : <motion.div key={i} animate={{
                scaleY: [0.2, 1, 0.4, 0.85, 0.2]
              }} transition={{
                duration: 0.65,
                repeat: Infinity,
                delay: i * 0.08,
                ease: 'easeInOut' as const
              }} style={{
                width: 3.5,
                height: 20,
                borderRadius: 3,
                background: `linear-gradient(to top, ${T.red}, rgba(239,68,68,0.4))`,
                transformOrigin: 'bottom'
              }} />)}
                </div>
              </motion.div>}
          </AnimatePresence>

          {/* Mic button row */}
          <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 20
        }}>

            {/* ── Mic Timer control (admin-only, shown left of mic) ── */}
            {iAmAdmin && !recording && <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4
          }}>
                <motion.button whileTap={{
              scale: 0.9
            }} onClick={() => setMicTimerEnabled(v => !v)} style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: micTimerEnabled ? T.primaryFaint : 'rgba(255,255,255,0.04)',
              border: `1.5px solid ${micTimerEnabled ? T.primaryBorder : 'rgba(255,255,255,0.1)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              outline: 'none',
              transition: 'all 0.2s',
              boxShadow: micTimerEnabled ? `0 0 12px ${T.primaryFaint}` : 'none'
            }}>
                  <Timer size={20} strokeWidth={2} color={micTimerEnabled ? T.primary : T.textDim} />
                </motion.button>
                {micTimerEnabled ? <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3
            }}>
                    <motion.button whileTap={{
                scale: 0.85
              }} onClick={() => setMicTimerSecs(s => Math.max(10, s - 10))} style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: T.primaryFaint,
                border: `1px solid ${T.primaryBorder}`,
                color: T.primary,
                fontSize: '0.7rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                outline: 'none'
              }}>−</motion.button>
                    <span style={{
                color: T.primary,
                fontSize: '0.62rem',
                fontWeight: 700,
                minWidth: 24,
                textAlign: 'center',
                fontVariantNumeric: 'tabular-nums'
              }}>{micTimerSecs}s</span>
                    <motion.button whileTap={{
                scale: 0.85
              }} onClick={() => setMicTimerSecs(s => Math.min(300, s + 10))} style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: T.primaryFaint,
                border: `1px solid ${T.primaryBorder}`,
                color: T.primary,
                fontSize: '0.7rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                outline: 'none'
              }}>+</motion.button>
                  </div> : <span style={{
              color: T.textDim,
              fontSize: '0.48rem',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase'
            }}>Timer</span>}
              </div>}

            {/* Cancel button */}
            <AnimatePresence>
              {recording && <motion.button key="cancel" initial={{
              opacity: 0,
              scale: 0.7
            }} animate={{
              opacity: 1,
              scale: 1
            }} exit={{
              opacity: 0,
              scale: 0.7
            }} whileTap={{
              scale: 0.88
            }} onClick={cancelRecording} style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              outline: 'none'
            }}>
                  <X size={20} strokeWidth={2} color={T.red} />
                </motion.button>}
            </AnimatePresence>

            {/* Big mic circle + LIVE badge row */}
            <div style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 10
          }}>
            <div style={{
              position: 'relative'
            }}>
              {/* Ripples when recording */}
              <AnimatePresence>
                {recording && [0, 1, 2].map(i => <motion.div key={i} className="absolute rounded-full pointer-events-none" style={{
                  border: '1.5px solid rgba(239,68,68,0.4)',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%,-50%)'
                }} initial={{
                  width: 100,
                  height: 100,
                  opacity: 0.6
                }} animate={{
                  width: 180 + i * 30,
                  height: 180 + i * 30,
                  opacity: 0
                }} transition={{
                  duration: 1.5,
                  delay: i * 0.4,
                  repeat: Infinity,
                  ease: 'easeOut' as const
                }} />)}
              </AnimatePresence>

              {/* Guest: disabled mic with register prompt */}
              {isGuest ? <motion.button whileTap={{
                scale: 0.93
              }} onClick={() => setShowGuestModal(true)} style={{
                width: 100,
                height: 100,
                borderRadius: '50%',
                background: 'hsl(var(--muted))',
                border: '2px solid hsl(var(--border))',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                outline: 'none',
                opacity: 0.45
              }}>
                  <MicOff size={28} strokeWidth={1.8} color="hsl(var(--muted-foreground))" />
                </motion.button> : <motion.button whileTap={{
                scale: 0.93
              }} onClick={recording ? stopRecording : startRecording} disabled={floorBusy && !recording} style={{
                width: 100,
                height: 100,
                borderRadius: '50%',
                background: recording ? 'radial-gradient(circle at 38% 35%, #7f1d1d 0%, #450a0a 40%, #1a0202 100%)' : floorBusy ? 'radial-gradient(circle at 38% 35%, #1a1a1a 0%, #0d0d0d 40%, #060606 100%)' : 'radial-gradient(circle at 38% 35%, #2d3748 0%, #1a202c 40%, #0d1117 100%)',
                border: `2px solid ${recording ? 'rgba(239,68,68,0.5)' : floorBusy ? 'rgba(100,100,100,0.2)' : T.primaryBorder}`,
                boxShadow: recording ? '0 0 30px rgba(239,68,68,0.4), inset 0 2px 8px rgba(255,255,255,0.05)' : `0 0 20px ${T.primaryFaint}, inset 0 2px 8px rgba(255,255,255,0.04)`,
                cursor: floorBusy && !recording ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s',
                outline: 'none'
              }}>
                {recording ? <motion.div animate={{
                  scale: [1, 1.15, 1]
                }} transition={{
                  duration: 0.5,
                  repeat: Infinity
                }}>
                      <Mic size={32} strokeWidth={1.8} color={T.red} />
                    </motion.div> : floorBusy ? <MicOff size={28} strokeWidth={1.8} color="rgba(150,150,150,0.4)" /> : <Mic size={28} strokeWidth={1.8} color={T.primaryDim} />}
              </motion.button>}
            </div>

            </div>{/* end mic+badge row */}

          </div>
        </div>

      </div>

      {/* ── Member Admin Popup ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedMember && iAmAdmin && <motion.div key="admin-popup" initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} exit={{
        opacity: 0
      }} onClick={() => setSelectedMember(null)} style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'hsl(var(--background) / 0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center'
      }}>
            <motion.div initial={{
          y: 80,
          opacity: 0
        }} animate={{
          y: 0,
          opacity: 1
        }} exit={{
          y: 80,
          opacity: 0
        }} transition={{
          type: 'spring',
          damping: 22,
          stiffness: 280
        }} onClick={e => e.stopPropagation()} style={{
          width: '100%',
          maxWidth: 420,
          background: 'hsl(var(--card))',
          borderRadius: '20px 20px 0 0',
          border: '1px solid hsl(var(--border))',
          padding: '20px 20px 40px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}>
              {/* Header */}
              <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 4
          }}>
                <UserAvatar name={selectedMember.name ?? selectedMember.username ?? 'User'} avatarUrl={selectedMember.avatarUrl} size={44} />
                <div style={{
              flex: 1
            }}>
                  <p style={{
                fontWeight: 700,
                fontSize: '0.95rem',
                color: 'hsl(var(--foreground))',
                margin: 0
              }}>
                    {selectedMember.name ?? selectedMember.username ?? 'User'}
                  </p>
                  {selectedMember.username && <p style={{
                fontSize: '0.72rem',
                color: 'hsl(var(--muted-foreground))',
                margin: 0
              }}>
                      @{selectedMember.username}
                    </p>}
                </div>
                <motion.button whileTap={{
              scale: 0.88
            }} onClick={() => setSelectedMember(null)} style={{
              background: 'none',
              border: 'none',
              color: 'hsl(var(--muted-foreground))',
              cursor: 'pointer',
              padding: 4
            }}>
                  <X size={20} />
                </motion.button>
              </div>

              {/* Freeze / Unfreeze */}
              {snapshot.frozenUsers.includes(selectedMember.userId) ? <AdminBtn icon={<Snowflake size={18} />} label="رفع التجميد" color="hsl(var(--primary))" onClick={() => adminAction(selectedMember.userId, 'unfreeze')} /> : <AdminBtn icon={<Snowflake size={18} />} label="تجميد الميكروفون" color="hsl(var(--primary))" onClick={() => adminAction(selectedMember.userId, 'freeze')} />}

              {/* Grant / Revoke Admin — owner only */}
              {isOwner && (snapshot.roomAdmins.includes(selectedMember.userId) || selectedMember.isRoomAdmin ? <AdminBtn icon={<ShieldOff size={18} />} label="إلغاء صلاحيات الآدمن" color="hsl(var(--accent))" onClick={() => adminAction(selectedMember.userId, 'revoke-admin')} /> : <AdminBtn icon={<ShieldCheck size={18} />} label="منح صلاحيات آدمن" color="hsl(var(--accent))" onClick={() => adminAction(selectedMember.userId, 'grant-admin')} />)}

              {/* Ban — owner only */}
              {isOwner && <AdminBtn icon={<Star size={18} />} label="حظر المستخدم" color="hsl(var(--destructive))" onClick={async () => {
            await fetch(`/api/owner/users/${selectedMember.userId}`, {
              method: 'PATCH',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                isBanned: true
              })
            });
            await adminAction(selectedMember.userId, 'kick');
          }} />}
            </motion.div>
          </motion.div>}
      </AnimatePresence>

      {/* ── Quick Chat Bottom Sheet ─────────────────────────────────────────── */}
      <AnimatePresence>
        {quickChatTarget && <motion.div key="quick-chat-overlay" initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} exit={{
        opacity: 0
      }} onClick={() => setQuickChatTarget(null)} style={{
        position: 'fixed',
        inset: 0,
        background: 'hsl(var(--background) / 0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 300,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center'
      }}>
            <motion.div initial={{
          y: 120,
          opacity: 0
        }} animate={{
          y: 0,
          opacity: 1
        }} exit={{
          y: 120,
          opacity: 0
        }} transition={{
          type: 'spring',
          stiffness: 340,
          damping: 30
        }} onClick={e => e.stopPropagation()} style={{
          width: '100%',
          maxWidth: 480,
          background: 'hsl(var(--card))',
          borderRadius: '20px 20px 0 0',
          border: `1px solid ${T.primaryBorder}`,
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '72dvh'
        }}>

              {/* Header */}
              <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '16px 18px 12px',
            borderBottom: `1px solid ${T.navBorder}`,
            flexShrink: 0
          }}>
                <UserAvatar name={quickChatTarget.name ?? quickChatTarget.username ?? 'User'} avatarUrl={quickChatTarget.avatarUrl} size={38} />
                <div style={{
              flex: 1
            }}>
                  <p style={{
                color: T.text,
                fontSize: '0.88rem',
                fontWeight: 700,
                margin: 0
              }}>
                    {quickChatTarget.name ?? quickChatTarget.username ?? 'User'}
                  </p>
                  <p style={{
                color: T.textDim,
                fontSize: '0.62rem',
                margin: '2px 0 0'
              }}>
                    {new Date().toLocaleTimeString('ar-KW', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
                  </p>
                </div>
                <motion.button whileTap={{
              scale: 0.88
            }} onClick={() => setQuickChatTarget(null)} style={{
              background: 'none',
              border: 'none',
              color: T.textDim,
              cursor: 'pointer',
              padding: 4
            }}>
                  <X size={18} />
                </motion.button>
              </div>

              {/* Messages */}
              <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}>
                {quickChatMsgs.length === 0 && <p style={{
              color: T.textDim,
              fontSize: '0.78rem',
              textAlign: 'center',
              marginTop: 24
            }}>ابدأ المحادثة</p>}
                {quickChatMsgs.map(msg => {
              const isMe = msg.senderId === user?.id;
              return <div key={msg.id} style={{
                display: 'flex',
                flexDirection: isMe ? 'row-reverse' : 'row',
                alignItems: 'flex-end',
                gap: 6
              }}>
                      {!isMe && <UserAvatar name={msg.senderName ?? 'User'} avatarUrl={msg.senderAvatar} size={28} />}
                      <div style={{
                  maxWidth: '80%',
                  minWidth: 0
                }}>
                        {msg.type === 'image' ? <img src={msg.body} alt="صورة" style={{
                    maxWidth: '100%',
                    width: 220,
                    borderRadius: 14,
                    display: 'block',
                    objectFit: 'cover'
                  }} /> : <div style={{
                    padding: '9px 13px',
                    borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    background: isMe ? T.primary : T.primaryFaint,
                    border: `1px solid ${T.primaryBorder}`,
                    wordBreak: 'break-word'
                  }}>
                            <p style={{
                      color: isMe ? 'hsl(var(--primary-foreground))' : T.text,
                      fontSize: '0.84rem',
                      margin: 0,
                      lineHeight: 1.55,
                      whiteSpace: 'pre-wrap'
                    }}>{msg.body}</p>
                          </div>}
                        <p style={{
                    color: T.textDim,
                    fontSize: '0.58rem',
                    margin: '3px 4px 0',
                    textAlign: isMe ? 'right' : 'left'
                  }}>
                          {new Date(msg.createdAt).toLocaleTimeString('ar-KW', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                        </p>
                      </div>
                    </div>;
            })}
                {/* Typing indicator */}
                {quickTyping && <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}>
                    <UserAvatar name={quickChatTarget.name ?? 'User'} avatarUrl={quickChatTarget.avatarUrl} size={22} />
                    <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                padding: '7px 12px',
                borderRadius: '14px 14px 14px 4px',
                background: T.primaryFaint,
                border: `1px solid ${T.primaryBorder}`
              }}>
                      {[0, 1, 2].map(i => <motion.div key={i} animate={{
                  y: [0, -4, 0]
                }} transition={{
                  duration: 0.6,
                  repeat: Infinity,
                  delay: i * 0.15,
                  ease: 'easeInOut' as const
                }} style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: T.primary
                }} />)}
                    </div>
                  </div>}
                <div ref={quickChatBottomRef} />
              </div>

              {/* Input bar — text + image only */}
              <div style={{
            padding: '10px 14px 24px',
            borderTop: `1px solid ${T.navBorder}`,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0
          }}>
                {/* Image picker */}
                <motion.button whileTap={{
              scale: 0.88
            }} onClick={() => quickImgRef.current?.click()} style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: T.primaryFaint,
              border: `1px solid ${T.primaryBorder}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              outline: 'none',
              flexShrink: 0
            }}>
                  <ImageIcon size={16} strokeWidth={2} color={T.primary} />
                </motion.button>
                <input ref={quickImgRef} type="file" accept="image/*" style={{
              display: 'none'
            }} onChange={e => {
              const f = e.target.files?.[0];
              if (f) sendQuickImage(f);
              e.target.value = '';
            }} />

                {/* Text input */}
                <input value={quickChatText} onChange={e => {
              setQuickChatText(e.target.value);
              signalQuickTyping();
            }} onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendQuickMsg();
              }
            }} placeholder="اكتب رسالة..." dir="rtl" style={{
              flex: 1,
              background: T.primaryFaint,
              border: `1px solid ${T.primaryBorder}`,
              borderRadius: 20,
              padding: '9px 14px',
              color: T.text,
              fontSize: '0.82rem',
              outline: 'none',
              fontFamily: 'var(--font-sans)'
            }} />

                {/* Send */}
                <motion.button whileTap={{
              scale: 0.88
            }} onClick={sendQuickMsg} disabled={!quickChatText.trim() || quickChatSending} style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: quickChatText.trim() ? T.primary : T.primaryFaint,
              border: `1px solid ${T.primaryBorder}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: quickChatText.trim() ? 'pointer' : 'default',
              outline: 'none',
              flexShrink: 0,
              transition: 'background 0.2s'
            }}>
                  <Send size={15} strokeWidth={2} color={quickChatText.trim() ? 'hsl(var(--primary-foreground))' : T.textDim} />
                </motion.button>
              </div>
            </motion.div>
          </motion.div>}
      </AnimatePresence>

      {/* ── Owner Room Control Panel ─────────────────────────────────────────── */}
      {isOwner && <OwnerRoomControlPanel open={showOwnerPanel} onClose={() => setShowOwnerPanel(false)} members={snapshot.members} roomAdmins={snapshot.roomAdmins} frozenUsers={snapshot.frozenUsers} floorUserId={snapshot.floor} ownerUserId={effectiveUserId} onGrantAdmin={async id => {
      await adminAction(id, 'grant-admin');
    }} onRevokeAdmin={async id => {
      await adminAction(id, 'revoke-admin');
    }} onFreeze={async id => {
      await adminAction(id, 'freeze');
    }} onUnfreeze={async id => {
      await adminAction(id, 'unfreeze');
    }} onKick={async id => {
      await adminAction(id, 'kick');
    }} onBan={async id => {
      await fetch(`/api/owner/users/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          isBanned: true
        })
      });
      await adminAction(id, 'kick');
    }} />}

      {/* ── DM Chat Panel — portal, drops under the chat button like the bell ── */}
      {createPortal(<AnimatePresence>
          {showFriendsDrawer && dmPanelPos && <motion.div ref={dmPanelRef} key="dm-panel" initial={{
        opacity: 0,
        y: -10,
        scale: 0.96
      }} animate={{
        opacity: 1,
        y: 0,
        scale: 1
      }} exit={{
        opacity: 0,
        y: -10,
        scale: 0.96
      }} transition={{
        duration: 0.15
      }} style={{
        position: 'fixed',
        top: dmPanelPos.top,
        right: dmPanelPos.right,
        width: 320,
        maxHeight: 520,
        zIndex: 2147483647,
        background: 'hsl(var(--card))',
        border: '1.5px solid hsl(var(--primary) / 0.35)',
        borderRadius: 16,
        boxShadow: '0 16px 56px hsl(var(--background)), 0 0 0 1px hsl(var(--primary) / 0.12)',
        overflow: 'hidden',
        isolation: 'isolate',
        display: 'flex',
        flexDirection: 'column'
      }}>
              <AnimatePresence mode="wait">

                {/* ── SENDERS LIST ── */}
                {!friendsChatTarget && <motion.div key="dm-list" initial={{
            x: 40,
            opacity: 0
          }} animate={{
            x: 0,
            opacity: 1
          }} exit={{
            x: -40,
            opacity: 0
          }} transition={{
            duration: 0.18,
            ease: 'easeInOut' as const
          }} style={{
            display: 'flex',
            flexDirection: 'column',
            maxHeight: 520
          }}>

                    {/* Header */}
                    <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '13px 14px',
              borderBottom: '1.5px solid hsl(var(--primary) / 0.20)',
              background: 'hsl(var(--primary) / 0.10)',
              flexShrink: 0
            }}>
                      <MessageCircle size={15} strokeWidth={2} color={T.primary} />
                      <p style={{
                color: T.text,
                fontSize: '0.85rem',
                fontWeight: 700,
                flex: 1,
                margin: 0
              }}>الرسائل الخاصة</p>
                      <motion.button whileTap={{
                scale: 0.88
              }} onClick={() => {
                setShowFriendsDrawer(false);
                setFriendsChatTarget(null);
              }} style={{
                background: 'none',
                border: 'none',
                color: T.textDim,
                cursor: 'pointer',
                padding: 4
              }}>
                        <X size={16} />
                      </motion.button>
                    </div>

                    {/* List */}
                    <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '8px 8px'
            }}>
                      {(() => {
                const roomSenders = snapshot.members.filter(m => m.userId !== effectiveUserId && quickUnread.has(m.userId)).map(m => ({
                  id: m.userId,
                  name: m.name ?? m.username ?? 'User',
                  username: m.username,
                  avatarUrl: m.avatarUrl,
                  unreadMsg: quickUnread.get(m.userId)
                }));
                const friendEntries = friendsList.map(f => ({
                  id: f.id,
                  name: f.name ?? f.username ?? 'User',
                  username: f.username,
                  avatarUrl: f.avatarUrl,
                  unreadMsg: friendsUnread.get(f.id)
                }));
                const friendIds = new Set(friendEntries.map(f => f.id));
                const all = [...roomSenders.filter(r => !friendIds.has(r.id)), ...friendEntries].sort((a, b) => (b.unreadMsg ? 1 : 0) - (a.unreadMsg ? 1 : 0));
                if (all.length === 0) return <p style={{
                  color: T.textDim,
                  fontSize: '0.75rem',
                  textAlign: 'center',
                  padding: '24px 0'
                }}>لا يوجد محادثات بعد</p>;
                return all.map(entry => {
                  const hasUnread = !!entry.unreadMsg;
                  return <motion.button key={entry.id} whileTap={{
                    scale: 0.97
                  }} onClick={() => {
                    const fe: FriendEntry = {
                      id: entry.id,
                      name: entry.name,
                      username: entry.username,
                      avatarUrl: entry.avatarUrl
                    };
                    setFriendsChatTarget(fe);
                    setFriendsUnread(m => {
                      const n = new Map(m);
                      n.delete(entry.id);
                      return n;
                    });
                    setQuickUnread(m => {
                      const n = new Map(m);
                      n.delete(entry.id);
                      return n;
                    });
                  }} style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '9px 10px',
                    borderRadius: 12,
                    background: hasUnread ? T.primaryFaint : 'transparent',
                    border: `1px solid ${hasUnread ? T.primaryBorder : 'transparent'}`,
                    cursor: 'pointer',
                    outline: 'none',
                    transition: 'all 0.15s',
                    marginBottom: 3
                  }}>
                              <div style={{
                      position: 'relative',
                      flexShrink: 0
                    }}>
                                <UserAvatar name={entry.name} avatarUrl={entry.avatarUrl} size={38} />
                                {hasUnread && <motion.div animate={{
                        scale: [1, 1.25, 1]
                      }} transition={{
                        duration: 0.8,
                        repeat: Infinity
                      }} style={{
                        position: 'absolute',
                        top: -2,
                        right: -2,
                        width: 11,
                        height: 11,
                        borderRadius: '50%',
                        background: T.red,
                        border: '2px solid hsl(var(--card))'
                      }} />}
                              </div>
                              <div style={{
                      flex: 1,
                      minWidth: 0,
                      textAlign: 'right'
                    }}>
                                <p style={{
                        color: hasUnread ? T.text : T.textDim,
                        fontSize: '0.82rem',
                        fontWeight: hasUnread ? 700 : 500,
                        margin: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>{entry.name}</p>
                                {entry.unreadMsg && <p style={{
                        color: T.primary,
                        fontSize: '0.62rem',
                        margin: '2px 0 0',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                                    {entry.unreadMsg.type === 'image' ? '🖼 صورة' : (entry.unreadMsg.body ?? '').slice(0, 35)}
                                  </p>}
                              </div>
                              <ChevronDown size={13} color={T.textDim} style={{
                      transform: 'rotate(-90deg)',
                      flexShrink: 0
                    }} />
                            </motion.button>;
                });
              })()}
                    </div>
                  </motion.div>}

                {/* ── MINI CHAT ── */}
                {friendsChatTarget && <motion.div key="dm-chat" initial={{
            x: 60,
            opacity: 0
          }} animate={{
            x: 0,
            opacity: 1
          }} exit={{
            x: 60,
            opacity: 0
          }} transition={{
            duration: 0.18,
            ease: 'easeInOut' as const
          }} style={{
            display: 'flex',
            flexDirection: 'column',
            maxHeight: 520
          }}>

                    {/* Chat header */}
                    <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 12px',
              borderBottom: '1.5px solid hsl(var(--primary) / 0.20)',
              background: 'hsl(var(--primary) / 0.10)',
              flexShrink: 0
            }}>
                      <motion.button whileTap={{
                scale: 0.88
              }} onClick={() => setFriendsChatTarget(null)} style={{
                background: 'none',
                border: 'none',
                color: T.primary,
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center'
              }}>
                        <ChevronDown size={18} style={{
                  transform: 'rotate(90deg)'
                }} />
                      </motion.button>
                      <UserAvatar name={friendsChatTarget.name ?? friendsChatTarget.username ?? 'User'} avatarUrl={friendsChatTarget.avatarUrl} size={30} />
                      <div style={{
                flex: 1
              }}>
                        <p style={{
                  color: T.text,
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  margin: 0
                }}>{friendsChatTarget.name ?? friendsChatTarget.username ?? 'User'}</p>
                        {friendsTyping && <p style={{
                  color: T.primary,
                  fontSize: '0.58rem',
                  margin: '1px 0 0'
                }}>يكتب...</p>}
                      </div>
                      <motion.button whileTap={{
                scale: 0.88
              }} onClick={() => {
                setShowFriendsDrawer(false);
                setFriendsChatTarget(null);
              }} style={{
                background: 'none',
                border: 'none',
                color: T.textDim,
                cursor: 'pointer',
                padding: 4
              }}>
                        <X size={15} />
                      </motion.button>
                    </div>

                    {/* Messages */}
                    <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '8px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6
            }}>
                      {friendsMsgs.length === 0 && <p style={{
                color: T.textDim,
                fontSize: '0.72rem',
                textAlign: 'center',
                marginTop: 16
              }}>ابدأ المحادثة</p>}
                      {friendsMsgs.map(msg => {
                const isMe = msg.senderId === user?.id;
                return <div key={msg.id} style={{
                  display: 'flex',
                  flexDirection: isMe ? 'row-reverse' : 'row',
                  alignItems: 'flex-end',
                  gap: 5
                }}>
                            {!isMe && <UserAvatar name={msg.senderName ?? 'User'} avatarUrl={msg.senderAvatar} size={24} />}
                            <div style={{
                    maxWidth: '80%',
                    minWidth: 0
                  }}>
                              {msg.type === 'image' ? <img src={msg.body} alt="صورة" style={{
                      maxWidth: '100%',
                      width: 220,
                      borderRadius: 12,
                      display: 'block',
                      objectFit: 'cover'
                    }} /> : <div style={{
                      padding: '8px 12px',
                      borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      background: isMe ? T.primary : T.primaryFaint,
                      border: `1px solid ${T.primaryBorder}`,
                      wordBreak: 'break-word'
                    }}>
                                    <p style={{
                        color: isMe ? 'hsl(var(--primary-foreground))' : T.text,
                        fontSize: '0.84rem',
                        margin: 0,
                        lineHeight: 1.55,
                        whiteSpace: 'pre-wrap'
                      }}>{msg.body}</p>
                                  </div>}
                              <p style={{
                      color: T.textDim,
                      fontSize: '0.55rem',
                      margin: '3px 4px 0',
                      textAlign: isMe ? 'right' : 'left'
                    }}>
                                {new Date(msg.createdAt).toLocaleTimeString('ar-KW', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                              </p>
                            </div>
                          </div>;
              })}
                      {friendsTyping && <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5
              }}>
                          <UserAvatar name={friendsChatTarget.name ?? 'User'} avatarUrl={friendsChatTarget.avatarUrl} size={18} />
                          <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  padding: '5px 9px',
                  borderRadius: '10px 10px 10px 3px',
                  background: T.primaryFaint,
                  border: `1px solid ${T.primaryBorder}`
                }}>
                            {[0, 1, 2].map(i => <motion.div key={i} animate={{
                    y: [0, -4, 0]
                  }} transition={{
                    duration: 0.6,
                    repeat: Infinity,
                    delay: i * 0.15,
                    ease: 'easeInOut' as const
                  }} style={{
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: T.primary
                  }} />)}
                          </div>
                        </div>}
                      <div ref={friendsChatBottomRef} />
                    </div>

                    {/* Input */}
                    <div style={{
              padding: '8px 10px',
              borderTop: '1.5px solid hsl(var(--primary) / 0.20)',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              flexShrink: 0
            }}>
                      <motion.button whileTap={{
                scale: 0.88
              }} onClick={() => friendsImgRef.current?.click()} style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: T.primaryFaint,
                border: `1px solid ${T.primaryBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                outline: 'none',
                flexShrink: 0
              }}>
                        <ImageIcon size={14} strokeWidth={2} color={T.primary} />
                      </motion.button>
                      <input ref={friendsImgRef} type="file" accept="image/*" style={{
                display: 'none'
              }} onChange={e => {
                const f = e.target.files?.[0];
                if (f) sendFriendsImage(f);
                e.target.value = '';
              }} />
                      <input value={friendsChatText} onChange={e => {
                setFriendsChatText(e.target.value);
                signalFriendsTyping();
              }} onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendFriendsMsg();
                }
              }} placeholder="اكتب رسالة..." dir="rtl" style={{
                flex: 1,
                background: T.primaryFaint,
                border: `1px solid ${T.primaryBorder}`,
                borderRadius: 16,
                padding: '7px 11px',
                color: T.text,
                fontSize: '0.78rem',
                outline: 'none',
                fontFamily: 'var(--font-sans)'
              }} />
                      <motion.button whileTap={{
                scale: 0.88
              }} onClick={sendFriendsMsg} disabled={!friendsChatText.trim() || friendsChatSending} style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: friendsChatText.trim() ? T.primary : T.primaryFaint,
                border: `1px solid ${T.primaryBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: friendsChatText.trim() ? 'pointer' : 'default',
                outline: 'none',
                flexShrink: 0,
                transition: 'background 0.2s'
              }}>
                        <Send size={13} strokeWidth={2} color={friendsChatText.trim() ? 'hsl(var(--primary-foreground))' : T.textDim} />
                      </motion.button>
                    </div>
                  </motion.div>}

              </AnimatePresence>
            </motion.div>}
        </AnimatePresence>, document.body)}

      {/* ── Guest Register Modal ── */}
      <AnimatePresence>
        {showGuestModal && <motion.div initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} exit={{
        opacity: 0
      }} onClick={() => setShowGuestModal(false)} style={{
        position: 'fixed',
        inset: 0,
        background: 'hsl(var(--background) / 0.85)',
        backdropFilter: 'blur(6px)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24
      }}>
            <motion.div initial={{
          scale: 0.88,
          opacity: 0,
          y: 20
        }} animate={{
          scale: 1,
          opacity: 1,
          y: 0
        }} exit={{
          scale: 0.88,
          opacity: 0,
          y: 20
        }} transition={{
          type: 'spring',
          stiffness: 320,
          damping: 28
        }} onClick={e => e.stopPropagation()} style={{
          background: 'hsl(var(--card))',
          border: `1px solid ${T.primaryBorder}`,
          borderRadius: 22,
          padding: '32px 28px',
          maxWidth: 320,
          width: '100%',
          textAlign: 'center',
          boxShadow: `0 0 60px rgba(0,188,212,0.15)`
        }}>
              <div style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: T.primaryFaint,
            border: `2px solid ${T.primaryBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 18px'
          }}>
                <MicOff size={28} strokeWidth={1.8} color={T.primary} />
              </div>
              <p style={{
            color: T.text,
            fontSize: '1.05rem',
            fontWeight: 700,
            marginBottom: 8
          }}>
                وضع الاستماع فقط
              </p>
              <p style={{
            color: T.textDim,
            fontSize: '0.82rem',
            lineHeight: 1.6,
            marginBottom: 24
          }}>
                أنت الآن زائر ويمكنك الاستماع فقط. سجّل حساباً للتحدث والمشاركة في الغرف.
              </p>
              <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}>
                <motion.button whileTap={{
              scale: 0.95
            }} onClick={() => navigate('/settings')} style={{
              padding: '13px 0',
              borderRadius: 14,
              background: `linear-gradient(135deg, ${T.primary} 0%, #0097a7 100%)`,
              border: 'none',
              color: 'hsl(var(--primary-foreground))',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.02em',
              boxShadow: `0 0 20px rgba(0,188,212,0.3)`
            }}>
                  سجّل الآن
                </motion.button>
                <motion.button whileTap={{
              scale: 0.95
            }} onClick={() => setShowGuestModal(false)} style={{
              padding: '11px 0',
              borderRadius: 14,
              background: 'transparent',
              border: `1px solid ${T.primaryBorder}`,
              color: T.textDim,
              fontSize: '0.88rem',
              cursor: 'pointer'
            }}>
                  متابعة الاستماع
                </motion.button>
              </div>
            </motion.div>
          </motion.div>}
      </AnimatePresence>
    </>;
}

// ── Admin action button ───────────────────────────────────────────────────────
function AdminBtn({
  icon,
  label,
  color,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  color: string;
  onClick: () => void;
}) {
  return <motion.button whileTap={{
    scale: 0.96
  }} onClick={onClick} style={{
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '13px 16px',
    borderRadius: 14,
    width: '100%',
    background: 'hsl(var(--muted) / 0.4)',
    border: `1px solid hsl(var(--border))`,
    color,
    fontWeight: 600,
    fontSize: '0.9rem',
    cursor: 'pointer',
    textAlign: 'right',
    direction: 'rtl',
    transition: 'background 0.15s'
  }}>
      {icon}
      {label}
    </motion.button>;
}