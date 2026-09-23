import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Send, Mic, Trash2, Play, Pause, Check, X, Image as ImageIcon, Video as VideoIcon,
} from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';
import { useSession } from '@/lib/auth/auth-client';
import { usePresenceQuery, useHeartbeat } from '@/hooks/usePresence';

/* ════════════════════════════════════════════════════════════════════════
   DirectChatScreen — a full, self-contained rebuild of the 1:1 friend chat.
   Drop-in replacement for the old `{friendChatPeer && (...)}` JSX block.

   Usage:
     <DirectChatScreen
       peer={friendChatPeer}
       onClose={() => setFriendChatPeer(null)}
       headerActions={...}      // optional: call / history / options buttons
       onAvatarClick={...}      // optional: open the full-size profile photo
       peerTyping={...}         // optional: show the "type..." status
       onTyping={...}           // optional: called while the user is typing
     />

   Storage: reuses the exact same localStorage key format as the old
   "direct" share-thread (`stooorna_share_thread_<a>_<b>_direct`) and fires
   the same `stooorna:share-thread` event, so the existing friends-list
   panel (which reads that same key for previews/unread counts) keeps
   working with zero changes.

   Backend: GET/POST /api/messages — same endpoint the app already has,
   just now also sending `type` + `duration` so voice/image/video actually
   leave the device (the old code only ever sent `body` for text).
   ════════════════════════════════════════════════════════════════════════ */

// ─── Types ──────────────────────────────────────────────────────────────
export interface DirectChatPeer {
  friendId: string;
  name: string | null;
  username: string | null;
  avatarUrl?: string | null;
}

type MsgType = 'text' | 'voice' | 'image' | 'video' | 'file';

interface DirectMsg {
  id: string;
  fromId: string;
  type: MsgType;
  body: string;
  duration?: number | null;
  fileName?: string | null;
  kind?: string;
  replyToBody?: string | null;
  at: number;
  readAt?: number | null;
  reactions?: { emoji: string; fromId: string }[];
}

// ─── Storage (compatible with the existing friend-list previews) ───────
const threadKey = (a: string, b: string) => {
  const [x, y] = [String(a), String(b)].sort();
  return `stooorna_share_thread_${x}_${y}_direct`;
};

function loadThread(a: string, b: string): DirectMsg[] {
  try {
    const raw = localStorage.getItem(threadKey(a, b));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

function saveThread(a: string, b: string, list: DirectMsg[]) {
  try {
    localStorage.setItem(threadKey(a, b), JSON.stringify(list.slice(-300)));
    window.dispatchEvent(new CustomEvent('stooorna:share-thread', { detail: { a, b, postId: 'direct' } }));
  } catch { /* ignore */ }
}

// ─── Server sync ─────────────────────────────────────────────────────────
type ApiRow = {
  id: number; senderId: string; receiverId: string; type: string;
  body: string; duration: number | null; readAt: string | null; createdAt: string;
};

function mapRow(row: ApiRow): DirectMsg {
  return {
    id: `db-${row.id}`,
    fromId: row.senderId,
    type: (row.type as MsgType) || 'text',
    body: row.body,
    duration: row.duration ?? null,
    at: new Date(row.createdAt).getTime(),
    readAt: row.readAt ? new Date(row.readAt).getTime() : null,
  };
}

async function fetchThreadFromServer(peerId: string): Promise<DirectMsg[] | null> {
  try {
    const r = await fetch(`/api/messages?with=${encodeURIComponent(peerId)}`, { credentials: 'include' });
    if (!r.ok) return null;
    const rows = await r.json();
    if (!Array.isArray(rows)) return null;
    return rows.map(mapRow);
  } catch { return null; }
}

async function pullDown(meId: string, peerId: string) {
  const fetched = await fetchThreadFromServer(peerId);
  if (!fetched) return; // offline — keep local cache as-is
  const local = loadThread(meId, peerId);
  // The server has no concept of reactions, so carry them over from the local copy
  const localById = new Map(local.map(m => [m.id, m] as const));
  const serverRows = fetched.map(m => {
    const prev = localById.get(m.id);
    return prev?.reactions?.length ? { ...m, reactions: prev.reactions } : m;
  });
  const serverIds = new Set(serverRows.map(m => m.id));
  const localOnly = local.filter(m => !serverIds.has(m.id) && !m.id.startsWith('db-'));
  const merged = [...serverRows, ...localOnly].sort((x, y) => x.at - y.at);
  saveThread(meId, peerId, merged);
}

const UPLOAD_ENDPOINTS = ['/api/upload', '/api/files/upload', '/api/support/upload', '/api/media/upload'];

function pickUploadUrl(d: any): string | null {
  const u = d?.url || d?.mediaUrl || d?.fileUrl || d?.path
    || d?.data?.url || d?.data?.mediaUrl || d?.result?.url
    || d?.file?.url || d?.media?.url || d?.location;
  if (!u) return null;
  const s = String(u).trim();
  if (!s) return null;
  try { return new URL(s, window.location.origin).href; } catch { return s; }
}

async function uploadMedia(file: Blob, filename: string): Promise<string | null> {
  for (const ep of UPLOAD_ENDPOINTS) {
    try {
      const fd = new FormData();
      fd.append('file', file, filename);
      fd.append('media', file, filename);
      const r = await fetch(ep, { method: 'POST', credentials: 'include', body: fd });
      if (!r.ok) continue;
      const url = pickUploadUrl(await r.json().catch(() => null));
      if (url) return url;
    } catch { /* try the next endpoint */ }
  }
  return null;
}

async function sendToServer(meId: string, peerId: string, localId: string, type: MsgType, body: string, duration?: number | null) {
  try {
    const r = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ receiverId: peerId, body, type, duration: duration ?? null }),
    });
    if (!r.ok) return;
    const data = await r.json() as { id?: number };
    if (typeof data.id !== 'number') return;
    const list = loadThread(meId, peerId);
    const patched = list.map(m => (m.id === localId ? { ...m, id: `db-${data.id}` } : m));
    saveThread(meId, peerId, patched);
  } catch { /* stays local-only until the thread is next pulled */ }
}

function pushLocal(meId: string, peerId: string, msg: Omit<DirectMsg, 'id' | 'at'>): DirectMsg[] {
  const list = loadThread(meId, peerId);
  const next: DirectMsg = { id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: Date.now(), ...msg };
  const merged = [...list, next];
  saveThread(meId, peerId, merged);
  void sendToServer(meId, peerId, next.id, next.type, next.body, next.duration);
  return merged;
}

function toggleReaction(meId: string, peerId: string, msgId: string, emoji: string): DirectMsg[] {
  const list = loadThread(meId, peerId);
  const next = list.map(m => {
    if (m.id !== msgId) return m;
    const rs = Array.isArray(m.reactions) ? [...m.reactions] : [];
    const idx = rs.findIndex(r => r.fromId === meId && r.emoji === emoji);
    if (idx >= 0) { rs.splice(idx, 1); return { ...m, reactions: rs }; }
    const filtered = rs.filter(r => r.fromId !== meId);
    filtered.push({ emoji, fromId: meId });
    return { ...m, reactions: filtered };
  });
  saveThread(meId, peerId, next);
  return next;
}

// ─── Small formatting helpers ───────────────────────────────────────────
const REACT_EMOJIS = ['❤️', '😂', '😮', '😢', '🙏', '👍'];

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yest)) return 'Yesterday';
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function lastSeenLabel(online: boolean | undefined, ts: number | string | null | undefined): string {
  if (online) return 'Online';
  if (!ts) return 'Offline';
  const t = typeof ts === 'number' ? ts : new Date(ts).getTime();
  if (!Number.isFinite(t)) return 'Offline';
  const diffMin = Math.floor((Date.now() - t) / 60000);
  if (diffMin < 1) return 'Last seen just now';
  if (diffMin < 60) return `Last seen ${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Last seen ${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return diffD === 1 ? 'Last seen yesterday' : `Last seen ${diffD}d ago`;
}

function fmtDur(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ─── Colors (matches the existing white/WhatsApp-style friend list) ────
const C = {
  bg: '#efeae2',
  headerBg: '#ffffff',
  bubbleMe: '#dcf8c6',
  bubbleThem: '#ffffff',
  text: '#111111',
  textDim: 'rgba(0,0,0,0.45)',
  green: '#25D366',
  blueTick: '#34B7F1',
  border: 'rgba(0,0,0,0.08)',
};

// ─── Voice bubble player ────────────────────────────────────────────────
function VoiceBubble({ url, duration, isMe }: { url: string; duration: number | null | undefined; isMe: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [cur, setCur] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function toggle() {
    if (!audioRef.current) {
      audioRef.current = new Audio(url);
      audioRef.current.ontimeupdate = () => {
        const a = audioRef.current!;
        setProgress(a.duration ? a.currentTime / a.duration : 0);
        setCur(a.currentTime);
      };
      audioRef.current.onended = () => { setPlaying(false); setProgress(0); setCur(0); };
    }
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { void audioRef.current.play(); setPlaying(true); }
  }

  const total = duration ?? 0;
  const shown = playing ? cur : total;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 210 }}>
      <button type="button" onClick={toggle} style={{
        width: 34, height: 34, borderRadius: '50%', border: 'none', flexShrink: 0,
        background: isMe ? 'rgba(0,0,0,0.12)' : C.green, color: isMe ? '#075E54' : '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
      }}>
        {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
      </button>
      <div style={{ flex: 1 }}>
        <div style={{ height: 3, background: 'rgba(0,0,0,0.15)', borderRadius: 2, position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, width: `${progress * 100}%`, background: '#075E54', borderRadius: 2 }} />
        </div>
        <span style={{ fontSize: '0.68rem', color: C.textDim }}>{fmtDur(shown)}</span>
      </div>
    </div>
  );
}

// ─── Reaction picker (long-press popup, WhatsApp style) ─────────────────
function ReactionPicker({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.9 }}
      style={{
        display: 'flex', gap: 4, background: '#fff', borderRadius: 24, padding: '6px 8px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)', position: 'absolute', bottom: '100%', marginBottom: 6, zIndex: 20,
      }}
    >
      {REACT_EMOJIS.map(em => (
        <motion.button key={em} type="button" whileTap={{ scale: 1.4 }} whileHover={{ scale: 1.25 }}
          onClick={() => onPick(em)}
          style={{ border: 'none', background: 'none', fontSize: '1.35rem', cursor: 'pointer', padding: 2, lineHeight: 1 }}>
          {em}
        </motion.button>
      ))}
    </motion.div>
  );
}

// ─── Message bubble ──────────────────────────────────────────────────────
function Bubble({
  msg, isMe, onReact, showPickerFor, setShowPickerFor,
}: {
  msg: DirectMsg; isMe: boolean;
  onReact: (id: string, emoji: string) => void;
  showPickerFor: string | null; setShowPickerFor: (id: string | null) => void;
}) {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPress = () => { pressTimer.current = setTimeout(() => setShowPickerFor(msg.id), 450); };
  const cancelPress = () => { if (pressTimer.current) clearTimeout(pressTimer.current); };

  const grouped = useMemo(() => {
    const rs = msg.reactions || [];
    const map: Record<string, number> = {};
    rs.forEach(r => { map[r.emoji] = (map[r.emoji] || 0) + 1; });
    return Object.entries(map);
  }, [msg.reactions]);

  const isRead = !!msg.readAt;

  return (
    <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: grouped.length ? 14 : 4, padding: '0 10px' }}>
      <div
        onMouseDown={startPress} onMouseUp={cancelPress} onMouseLeave={cancelPress}
        onTouchStart={startPress} onTouchEnd={cancelPress}
        style={{ position: 'relative', maxWidth: '75%' }}
      >
        <AnimatePresence>
          {showPickerFor === msg.id && (
            <ReactionPicker onPick={(em) => { onReact(msg.id, em); setShowPickerFor(null); }} />
          )}
        </AnimatePresence>

        <div style={{
          background: isMe ? C.bubbleMe : C.bubbleThem,
          borderRadius: 10,
          padding: msg.type === 'text' ? '6px 8px' : 6,
          boxShadow: '0 1px 1px rgba(0,0,0,0.08)',
          position: 'relative',
        }}>
          {msg.replyToBody && msg.type === 'text' && (
            <div style={{
              borderLeft: `3px solid ${C.green}`, background: 'rgba(0,0,0,0.05)', borderRadius: 6,
              padding: '4px 8px', marginBottom: 4, fontSize: '0.78rem', color: C.textDim,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220,
            }}>
              {msg.replyToBody}
            </div>
          )}
          {msg.type === 'text' && (
            <p style={{ margin: 0, color: C.text, fontSize: '0.92rem', whiteSpace: 'pre-wrap', lineHeight: 1.4, paddingRight: 40 }}>
              {msg.body}
            </p>
          )}
          {msg.type === 'file' && (
            <a href={msg.body} target="_blank" rel="noreferrer" download={msg.fileName || undefined}
              style={{ display: 'block', color: '#075E54', fontSize: '0.88rem', textDecoration: 'underline', padding: '2px 4px 8px', paddingRight: 40, wordBreak: 'break-all' }}>
              {msg.fileName || 'File'}
            </a>
          )}
          {msg.type === 'image' && (
            <img src={msg.body} alt="" style={{ maxWidth: 240, maxHeight: 300, borderRadius: 8, display: 'block', objectFit: 'cover' }} />
          )}
          {msg.type === 'video' && (
            <video src={msg.body} controls style={{ maxWidth: 240, maxHeight: 300, borderRadius: 8, display: 'block' }} />
          )}
          {msg.type === 'voice' && <VoiceBubble url={msg.body} duration={msg.duration} isMe={isMe} />}

          <span style={{
            position: 'absolute', bottom: 4, right: 8, display: 'flex', alignItems: 'center', gap: 3,
            fontSize: '0.62rem', color: msg.type === 'image' || msg.type === 'video' ? '#fff' : C.textDim,
            textShadow: msg.type === 'image' || msg.type === 'video' ? '0 1px 2px rgba(0,0,0,0.6)' : 'none',
          }}>
            {timeLabel(msg.at)}
            {isMe && (
              <Check size={12} style={{ marginLeft: 1 }} color={isRead ? C.blueTick : 'rgba(0,0,0,0.4)'} strokeWidth={3} />
            )}
          </span>
        </div>

        {grouped.length > 0 && (
          <div style={{
            position: 'absolute', bottom: -12, [isMe ? 'left' : 'right']: 6,
            background: '#fff', borderRadius: 10, padding: '1px 5px', display: 'flex', gap: 2,
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)', fontSize: '0.7rem',
          } as React.CSSProperties}>
            {grouped.map(([em, count]) => (
              <span key={em}>{em}{count > 1 ? count : ''}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Voice recorder (press-and-hold mic, slide-left to cancel — WhatsApp) ─
function VoiceRecorderButton({ onRecorded }: { onRecorded: (blob: Blob, seconds: number) => void }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [dragX, setDragX] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startXRef = useRef(0);
  const cancelledRef = useRef(false);
  const secondsRef = useRef(0);
  // True while the finger / mouse is still down. getUserMedia() is async, so the
  // button can be released before the microphone is ready; this flag lets start()
  // notice that and bail out instead of recording forever.
  const heldRef = useRef(false);
  const startingRef = useRef(false);

  const CANCEL_THRESHOLD = -80;

  async function start() {
    if (startingRef.current || mediaRef.current) return;
    startingRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!heldRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/webm';
      const rec = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      cancelledRef.current = false;
      rec.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        mediaRef.current = null;
        const secs = secondsRef.current;
        if (!cancelledRef.current && chunksRef.current.length && secs >= 1) {
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || mimeType });
          onRecorded(blob, secs);
        }
      };
      mediaRef.current = rec;
      rec.start(100);
      secondsRef.current = 0;
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => {
        secondsRef.current += 1;
        setSeconds(secondsRef.current);
      }, 1000);
    } catch { /* microphone permission denied */ }
    finally {
      startingRef.current = false;
    }
  }

  function finish(cancel: boolean) {
    heldRef.current = false;
    cancelledRef.current = cancel;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const rec = mediaRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    setRecording(false);
    setDragX(0);
  }

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    startXRef.current = e.clientX;
    heldRef.current = true;
    void start();
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!recording) return;
    const dx = Math.min(0, e.clientX - startXRef.current);
    setDragX(dx);
  }
  function onPointerUp() {
    heldRef.current = false;
    if (!recording) return;
    finish(dragX <= CANCEL_THRESHOLD);
  }

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    cancelledRef.current = true;
    const rec = mediaRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  }, []);

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <AnimatePresence>
        {recording && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'absolute', right: 48, top: '50%', transform: 'translateY(-50%)',
              display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
              background: '#fff', padding: '6px 12px', borderRadius: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
            <span style={{ fontSize: '0.8rem', color: C.text, fontWeight: 600 }}>{fmtDur(seconds)}</span>
            <span style={{ fontSize: '0.75rem', color: dragX <= CANCEL_THRESHOLD ? '#ef4444' : C.textDim }}>
              {dragX <= CANCEL_THRESHOLD ? 'Release to cancel' : '← Slide to cancel'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => finish(true)}
        onContextMenu={e => e.preventDefault()}
        style={{
          width: 40, height: 40, borderRadius: '50%', border: 'none', flexShrink: 0,
          background: recording ? '#ef4444' : C.green, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          transform: recording ? 'scale(1.15)' : 'scale(1)', transition: 'transform 0.15s',
          touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
        }}
        aria-label="Hold to record a voice message"
      >
        <Mic size={18} />
      </button>
    </div>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────
export default function DirectChatScreen({
  peer, onClose, headerActions, onAvatarClick, peerTyping, onTyping,
}: {
  peer: DirectChatPeer;
  onClose: () => void;
  headerActions?: React.ReactNode;
  onAvatarClick?: () => void;
  peerTyping?: boolean;
  onTyping?: () => void;
}) {
  // useSession() in this app returns { user, isPending } directly (no `data` wrapper)
  const { user } = useSession();
  useHeartbeat(!!user);
  const presenceMap = usePresenceQuery(peer?.friendId ? [peer.friendId] : []) as Record<string, { online?: boolean; lastSeenAt?: number | string | null }>;
  const peerPresence = presenceMap[peer.friendId];

  const [msgs, setMsgs] = useState<DirectMsg[]>([]);
  const [text, setText] = useState('');
  const [showPickerFor, setShowPickerFor] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const imgInputRef = useRef<HTMLInputElement | null>(null);
  const vidInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(() => {
    if (!user?.id) return;
    setMsgs(loadThread(user.id, peer.friendId));
  }, [user?.id, peer.friendId]);

  // Initial load + live updates from this tab (post/reactions/send)
  useEffect(() => {
    refresh();
    const onEvt = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.postId === 'direct') refresh();
    };
    window.addEventListener('stooorna:share-thread', onEvt);
    return () => window.removeEventListener('stooorna:share-thread', onEvt);
  }, [refresh]);

  // Poll server for the peer's own messages every 3s while this screen is open
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const tick = async () => {
      await pullDown(user.id, peer.friendId);
      if (!cancelled) refresh();
    };
    void tick();
    const id = setInterval(tick, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, [user?.id, peer.friendId, refresh]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs.length]);

  function sendText() {
    if (!user?.id || !text.trim()) return;
    pushLocal(user.id, peer.friendId, { fromId: user.id, type: 'text', body: text.trim() });
    setText('');
    refresh();
  }

  function handleReact(msgId: string, emoji: string) {
    if (!user?.id) return;
    toggleReaction(user.id, peer.friendId, msgId, emoji);
    refresh();
  }

  async function handleVoice(blob: Blob, seconds: number) {
    if (!user?.id) return;
    const url = await uploadMedia(blob, `voice-${Date.now()}.webm`);
    if (!url) return; // upload failed — nothing sent rather than a broken local-only bubble
    pushLocal(user.id, peer.friendId, { fromId: user.id, type: 'voice', body: url, duration: seconds });
    refresh();
  }

  async function handleMediaFile(file: File, kind: 'image' | 'video') {
    if (!user?.id) return;
    const url = await uploadMedia(file, file.name);
    if (!url) return;
    pushLocal(user.id, peer.friendId, { fromId: user.id, type: kind, body: url });
    refresh();
  }

  // Group messages into day sections
  const sections = useMemo(() => {
    const out: { label: string; items: DirectMsg[] }[] = [];
    for (const m of msgs) {
      const label = dayLabel(m.at);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(m);
      else out.push({ label, items: [m] });
    }
    return out;
  }, [msgs]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}
      style={{ position: 'fixed', inset: 0, zIndex: 10860, display: 'flex', flexDirection: 'column', background: C.bg }}
      onClick={() => setShowPickerFor(null)}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
        paddingTop: 'max(10px, env(safe-area-inset-top))',
        background: C.headerBg, borderBottom: `1px solid ${C.border}`, flexShrink: 0,
      }}>
        <button type="button" onClick={onClose} aria-label="Back" style={{ background: 'none', border: 'none', color: C.text, cursor: 'pointer', display: 'flex' }}>
          <ArrowLeft size={20} />
        </button>
        <button
          type="button"
          onClick={() => onAvatarClick?.()}
          aria-label="View profile photo"
          style={{ background: 'none', border: 'none', padding: 0, flexShrink: 0, display: 'flex', cursor: onAvatarClick ? 'pointer' : 'default' }}
        >
          <UserAvatar name={peer.name ?? peer.username ?? '?'} avatarUrl={peer.avatarUrl} size={38} online={!!peerPresence?.online} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.98rem', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {peer.name ?? peer.username ?? 'User'}
          </p>
          <p style={{
            margin: 0, fontSize: '0.72rem',
            color: peerTyping ? '#128C7E' : (peerPresence?.online ? C.green : C.textDim),
            fontWeight: peerTyping || peerPresence?.online ? 700 : 400,
          }}>
            {peerTyping ? 'type...' : lastSeenLabel(peerPresence?.online, peerPresence?.lastSeenAt)}
          </p>
        </div>
        {headerActions}
      </div>

      {/* Messages */}
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
        {sections.map(sec => (
          <div key={sec.label}>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0' }}>
              <span style={{ background: '#e2f1fb', color: '#54656f', fontSize: '0.7rem', fontWeight: 600, padding: '4px 10px', borderRadius: 8 }}>
                {sec.label}
              </span>
            </div>
            {sec.items.map(m => (
              <Bubble
                key={m.id}
                msg={m}
                isMe={!!user?.id && String(m.fromId) === String(user.id)}
                onReact={handleReact}
                showPickerFor={showPickerFor}
                setShowPickerFor={setShowPickerFor}
              />
            ))}
          </div>
        ))}
        {sections.length === 0 && (
          <p style={{ textAlign: 'center', color: C.textDim, fontSize: '0.85rem', marginTop: 60 }}>
            No messages yet. Start the conversation.
          </p>
        )}
      </div>

      {/* Composer */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
        paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
        background: C.headerBg, borderTop: `1px solid ${C.border}`, flexShrink: 0,
      }} onClick={e => e.stopPropagation()}>
        <input ref={imgInputRef} type="file" accept="image/*" hidden onChange={e => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (f) void handleMediaFile(f, 'image');
        }} />
        <input ref={vidInputRef} type="file" accept="video/*" hidden onChange={e => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (f) void handleMediaFile(f, 'video');
        }} />
        <button type="button" onClick={() => imgInputRef.current?.click()} style={{ background: 'none', border: 'none', color: '#54656f', cursor: 'pointer', display: 'flex' }} aria-label="Image">
          <ImageIcon size={22} />
        </button>
        <button type="button" onClick={() => vidInputRef.current?.click()} style={{ background: 'none', border: 'none', color: '#54656f', cursor: 'pointer', display: 'flex' }} aria-label="Video">
          <VideoIcon size={22} />
        </button>
        <div style={{ flex: 1 }}>
          <input
            value={text}
            onChange={e => {
              setText(e.target.value);
              if (e.target.value.trim()) onTyping?.();
            }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); } }}
            placeholder="Message"
            style={{
              width: '100%', boxSizing: 'border-box', borderRadius: 20, padding: '9px 14px',
              background: '#f0f2f5', border: 'none', outline: 'none', fontSize: '0.9rem', color: C.text,
            }}
          />
        </div>
        {text.trim() ? (
          <button type="button" onClick={sendText} style={{
            width: 40, height: 40, borderRadius: '50%', border: 'none', background: C.green, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
          }} aria-label="Send">
            <Send size={17} />
          </button>
        ) : (
          <VoiceRecorderButton onRecorded={handleVoice} />
        )}
      </div>
    </motion.div>
  );
}
