import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import {
  ArrowLeft, Send, Mic, Trash2, Play, Pause, Check, X, Plus, Smile,
  Image as ImageIcon, Video as VideoIcon, MapPin, Reply,
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
       headerActions={...}      // optional: extra buttons on the right of the header
       onAvatarClick={...}      // optional: open the full-size profile photo
       peerTyping={...}         // optional: show the "type..." status
       onTyping={...}           // optional: called while the user is typing
     />

   Features:
     - text / voice / photo / video / location messages
     - timestamps rendered in the flow of each bubble (never overlap the text)
     - "+" menu (Photo, Video, Location) and an emoji panel
     - tap-to-record voice messages (trash to cancel, black send button to send)
     - swipe a message to the right to reply, replies are quoted inside the bubble
     - long-press a message to react

   Storage: reuses the exact same localStorage key format as the old
   "direct" share-thread (`stooorna_share_thread_<a>_<b>_direct`) and fires
   the same `stooorna:share-thread` event, so the existing friends-list
   panel (which reads that same key for previews/unread counts) keeps
   working with zero changes.

   Backend: GET/POST /api/messages — same endpoint the app already has,
   sending `type` + `duration` so voice/image/video actually leave the device.
   A reply is carried inside the text body as a small encoded prefix, so the
   quoted message also shows up on the other person's device.
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
  replyToFromId?: string | null;
  replyToBody?: string | null;
  at: number;
  readAt?: number | null;
  read?: boolean;
  reactions?: { emoji: string; fromId: string }[];
}

// ─── Reply codec (a reply travels inside the text body) ─────────────────
// Wire format: <open>r:<fromId>:<quote><close><text> — every part is URI-encoded,
// so the closing marker can never appear inside the payload.
const REPLY_RE = /^\u27e6r:([^:\u27e7]*):([^\u27e7]*)\u27e7([\s\S]*)$/;

function encodeReplyBody(body: string, quoteFromId: string, quoteText: string): string {
  return `\u27e6r:${encodeURIComponent(quoteFromId)}:${encodeURIComponent(quoteText.slice(0, 120))}\u27e7${body}`;
}

function decodeReplyBody(body: string): { fromId: string; quote: string; text: string } | null {
  const m = REPLY_RE.exec(body || '');
  if (!m) return null;
  try {
    return { fromId: decodeURIComponent(m[1]), quote: decodeURIComponent(m[2]), text: m[3] };
  } catch { return null; }
}

// ─── Location helpers (a shared location is a plain text message with a maps link) ─
const LOCATION_RE = /^https:\/\/www\.google\.com\/maps\?q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/;

function parseLocation(body: string): { lat: string; lng: string } | null {
  const m = LOCATION_RE.exec((body || '').trim());
  return m ? { lat: m[1], lng: m[2] } : null;
}

function previewOf(m: DirectMsg): string {
  if (m.type === 'image') return 'Photo';
  if (m.type === 'video') return 'Video';
  if (m.type === 'voice') return 'Voice message';
  if (m.type === 'file') return m.fileName || 'File';
  if (parseLocation(m.body)) return 'Location';
  return (m.body || '').slice(0, 120);
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

// Keeps a single copy of every id (a server id can briefly exist twice while a send resolves)
function dedupeById(list: DirectMsg[]): DirectMsg[] {
  const map = new Map<string, DirectMsg>();
  for (const m of list) {
    const prev = map.get(m.id);
    if (!prev) { map.set(m.id, m); continue; }
    map.set(m.id, { ...prev, ...m, reactions: m.reactions?.length ? m.reactions : prev.reactions });
  }
  return Array.from(map.values());
}

function saveThread(a: string, b: string, list: DirectMsg[]) {
  try {
    localStorage.setItem(threadKey(a, b), JSON.stringify(dedupeById(list).slice(-300)));
    window.dispatchEvent(new CustomEvent('stooorna:share-thread', { detail: { a, b, postId: 'direct' } }));
  } catch { /* ignore */ }
}

// ─── Server sync ─────────────────────────────────────────────────────────
type ApiRow = {
  id: number; senderId: string; receiverId: string; type: string;
  body: string; duration: number | null; readAt: string | null; createdAt: string;
};

function mapRow(row: ApiRow): DirectMsg {
  const type = ((row.type as MsgType) || 'text');
  const rep = type === 'text' ? decodeReplyBody(row.body) : null;
  return {
    id: `db-${row.id}`,
    fromId: row.senderId,
    type,
    body: rep ? rep.text : row.body,
    duration: row.duration ?? null,
    replyToFromId: rep ? rep.fromId : null,
    replyToBody: rep ? rep.quote : null,
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
    const incoming = String(m.fromId) !== String(meId);
    return {
      ...m,
      ...(prev?.reactions?.length ? { reactions: prev.reactions } : {}),
      // The thread is open on screen, so everything the other person sent counts as read
      ...(incoming ? { read: true } : {}),
    };
  });
  const serverIds = new Set(serverRows.map(m => m.id));
  // A message that was just sent can show up from the server before its local copy
  // is renamed; drop that local copy instead of showing the message twice.
  const localOnly = local.filter(m => {
    if (serverIds.has(m.id) || m.id.startsWith('db-')) return false;
    return !serverRows.some(s =>
      s.fromId === m.fromId && s.type === m.type && s.body === m.body && Math.abs(s.at - m.at) < 60000);
  });
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

// `wireBody` is what is sent to the server when it differs from what is stored locally
// (used to carry the reply quote inside the text body).
function pushLocal(meId: string, peerId: string, msg: Omit<DirectMsg, 'id' | 'at'>, wireBody?: string): DirectMsg[] {
  const list = loadThread(meId, peerId);
  const next: DirectMsg = { id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: Date.now(), ...msg };
  const merged = [...list, next];
  saveThread(meId, peerId, merged);
  void sendToServer(meId, peerId, next.id, next.type, wireBody ?? next.body, next.duration);
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
const EMOJI_PANEL = (
  '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😗 😋 😜 🤪 😎 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 😣 ' +
  '😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 😶 😐 😑 😬 🙄 😯 ' +
  '😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 💕 💖 💯 🔥 ✨ 🎉 ' +
  '👍 👎 👏 🙌 🙏 💪 👋 ✋ 👌 ✌️ 🤞 🤝 👀 🌹 ☕ 🎂 🎁 ⭐ ☀️ 🌙'
).split(' ');

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
  action: '#000000',
};

// Black circle with a white icon — used by the mic and the send buttons
const ROUND_BTN: React.CSSProperties = {
  width: 40, height: 40, borderRadius: '50%', border: 'none', flexShrink: 0,
  background: C.action, color: '#ffffff',
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
};

const ICON_BTN: React.CSSProperties = {
  background: 'none', border: 'none', color: '#54656f', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, flexShrink: 0,
};

// ─── Voice bubble player ────────────────────────────────────────────────
function VoiceBubble({ url, duration, isMe }: { url: string; duration: number | null | undefined; isMe: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [cur, setCur] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
  }, []);

  function toggle() {
    if (!audioRef.current) {
      audioRef.current = new Audio(url);
      audioRef.current.ontimeupdate = () => {
        const a = audioRef.current;
        if (!a) return;
        setProgress(a.duration && Number.isFinite(a.duration) ? a.currentTime / a.duration : 0);
        setCur(a.currentTime);
      };
      audioRef.current.onended = () => { setPlaying(false); setProgress(0); setCur(0); };
    }
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { void audioRef.current.play().catch(() => setPlaying(false)); setPlaying(true); }
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

// ─── Reaction picker (long-press popup) ─────────────────────────────────
// A horizontally scrollable strip: it never grows wider than the screen, and the
// person can swipe it sideways to reach every emoji.
const REACT_EMOJIS = [
  '❤️', '😂', '😮', '😢', '🙏', '👍', '👎', '🔥', '😍', '😡', '🎉', '👏',
  '😊', '🤔', '😭', '💯', '😎', '🥰', '🤣', '😘', '💔', '🙌', '😱', '🥳',
];

function ReactionPicker({ onPick, align }: { onPick: (emoji: string) => void; align: 'left' | 'right' }) {
  return (
    <motion.div
      className="dcs-strip"
      initial={{ opacity: 0, y: 6, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.95 }}
      onClick={e => e.stopPropagation()}
      style={{
        position: 'absolute', bottom: '100%', marginBottom: 4, [align]: 10, zIndex: 20,
        maxWidth: 'calc(100% - 20px)', display: 'flex', alignItems: 'center', gap: 2,
        background: '#fff', borderRadius: 26, padding: '6px 8px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch', touchAction: 'pan-x',
        scrollbarWidth: 'none',
      } as React.CSSProperties}
    >
      {REACT_EMOJIS.map(em => (
        <motion.button key={em} type="button" whileTap={{ scale: 1.3 }}
          onClick={() => onPick(em)}
          style={{ border: 'none', background: 'none', fontSize: '1.45rem', cursor: 'pointer', padding: '2px 5px', lineHeight: 1, flexShrink: 0 }}>
          {em}
        </motion.button>
      ))}
    </motion.div>
  );
}

// ─── Message bubble ──────────────────────────────────────────────────────
// - the timestamp lives in its own row inside the bubble, so it never covers the message
// - dragging the bubble to the right triggers a reply (swipe to reply)
function Bubble({
  msg, isMe, meId, peerName, onReact, onReply, showPickerFor, setShowPickerFor,
}: {
  msg: DirectMsg; isMe: boolean; meId: string; peerName: string;
  onReact: (id: string, emoji: string) => void;
  onReply: (msg: DirectMsg) => void;
  showPickerFor: string | null; setShowPickerFor: (id: string | null) => void;
}) {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPress = () => { pressTimer.current = setTimeout(() => setShowPickerFor(msg.id), 450); };
  const cancelPress = () => { if (pressTimer.current) clearTimeout(pressTimer.current); };

  const x = useMotionValue(0);
  const hintOpacity = useTransform(x, [0, 56], [0, 1]);
  const hintScale = useTransform(x, [0, 56], [0.6, 1]);

  const grouped = useMemo(() => {
    const rs = msg.reactions || [];
    const map: Record<string, number> = {};
    rs.forEach(r => { map[r.emoji] = (map[r.emoji] || 0) + 1; });
    return Object.entries(map);
  }, [msg.reactions]);

  const isRead = !!msg.readAt;
  const loc = msg.type === 'text' ? parseLocation(msg.body) : null;
  const quoteName = msg.replyToFromId
    ? (String(msg.replyToFromId) === String(meId) ? 'You' : peerName)
    : null;
  const isMedia = msg.type === 'image' || msg.type === 'video';

  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: grouped.length ? 14 : 4, padding: '0 10px', boxSizing: 'border-box', width: '100%', overflow: 'visible' }}>
      {/* Reply hint revealed while dragging */}
      <motion.div
        aria-hidden
        style={{
          position: 'absolute', left: 16, top: '50%', marginTop: -14, width: 28, height: 28, borderRadius: '50%',
          background: 'rgba(0,0,0,0.12)', color: '#54656f', display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none', opacity: hintOpacity, scale: hintScale,
        }}
      >
        <Reply size={16} />
      </motion.div>

      {/* Reaction picker lives outside the draggable bubble so it can be scrolled sideways */}
      <AnimatePresence>
        {showPickerFor === msg.id && (
          <ReactionPicker
            align={isMe ? 'right' : 'left'}
            onPick={(em) => { onReact(msg.id, em); setShowPickerFor(null); }}
          />
        )}
      </AnimatePresence>

      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0, right: 0.45 }}
        dragSnapToOrigin
        onDragStart={cancelPress}
        onDragEnd={(_, info) => { if (info.offset.x > 56) onReply(msg); }}
        onMouseDown={startPress} onMouseUp={cancelPress} onMouseLeave={cancelPress}
        onTouchStart={startPress} onTouchEnd={cancelPress}
        onContextMenu={e => e.preventDefault()}
        style={{ x, position: 'relative', maxWidth: '75%', minWidth: 0 }}
      >

        <div style={{
          background: isMe ? C.bubbleMe : C.bubbleThem,
          borderRadius: 10,
          padding: isMedia ? 4 : '6px 8px',
          boxShadow: '0 1px 1px rgba(0,0,0,0.08)',
          position: 'relative',
        }}>
          {msg.replyToBody && msg.type === 'text' && (
            <div style={{
              borderLeft: `3px solid ${C.green}`, background: 'rgba(0,0,0,0.06)', borderRadius: 6,
              padding: '4px 8px', marginBottom: 4, maxWidth: 240, overflow: 'hidden',
            }}>
              {quoteName && (
                <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, color: '#128C7E' }}>{quoteName}</p>
              )}
              <p style={{ margin: 0, fontSize: '0.78rem', color: C.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {msg.replyToBody}
              </p>
            </div>
          )}

          {msg.type === 'text' && !loc && (
            <p style={{ margin: 0, color: C.text, fontSize: '0.92rem', whiteSpace: 'pre-wrap', lineHeight: 1.4, wordBreak: 'break-word' }}>
              {msg.body}
            </p>
          )}
          {loc && (
            <a href={msg.body} target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: C.text, minWidth: 170, padding: '2px 2px 0' }}>
              <span style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(0,0,0,0.85)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MapPin size={18} />
              </span>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Location</span>
                <span style={{ fontSize: '0.72rem', color: '#128C7E', textDecoration: 'underline' }}>Open in Maps</span>
              </span>
            </a>
          )}
          {msg.type === 'file' && (
            <a href={msg.body} target="_blank" rel="noreferrer" download={msg.fileName || undefined}
              style={{ display: 'block', color: '#075E54', fontSize: '0.88rem', textDecoration: 'underline', padding: '2px 4px', wordBreak: 'break-all' }}>
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

          {/* Timestamp row — in the normal flow, always fully visible */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 2,
            padding: isMedia ? '0 4px 2px' : 0, fontSize: '0.66rem', color: C.textDim, lineHeight: 1.2,
          }}>
            <span>{timeLabel(msg.at)}</span>
            {isMe && (
              <Check size={12} color={isRead ? C.blueTick : 'rgba(0,0,0,0.4)'} strokeWidth={3} />
            )}
          </div>
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
      </motion.div>
    </div>
  );
}

// ─── Voice recorder hook (tap the mic to start, trash to cancel, send to finish) ─
function useVoiceRecorder(
  onDone: (blob: Blob, seconds: number) => void,
  onError: (message: string) => void,
) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const sendRef = useRef(false);
  const startingRef = useRef(false);
  const onDoneRef = useRef(onDone);
  const onErrorRef = useRef(onError);
  onDoneRef.current = onDone;
  onErrorRef.current = onError;

  const start = useCallback(async () => {
    if (startingRef.current || mediaRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onErrorRef.current('Voice recording is not supported on this device');
      return;
    }
    startingRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const canCheck = typeof MediaRecorder.isTypeSupported === 'function';
      const mimeType = canCheck
        ? (MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '')
        : '';
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      sendRef.current = false;
      rec.ondataavailable = e => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        mediaRef.current = null;
        const elapsedMs = Date.now() - startedAtRef.current;
        const chunks = chunksRef.current;
        chunksRef.current = [];
        if (!sendRef.current) return;
        if (!chunks.length || elapsedMs < 800) {
          onErrorRef.current('Recording is too short');
          return;
        }
        const blob = new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' });
        onDoneRef.current(blob, Math.max(1, Math.round(elapsedMs / 1000)));
      };
      mediaRef.current = rec;
      startedAtRef.current = Date.now();
      rec.start(250);
      setSeconds(0);
      setRecording(true);
      timerRef.current = setInterval(() => {
        setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 500);
    } catch {
      onErrorRef.current('Microphone access was denied or is unavailable');
    } finally {
      startingRef.current = false;
    }
  }, []);

  const stop = useCallback((send: boolean) => {
    sendRef.current = send;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const rec = mediaRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    setRecording(false);
    setSeconds(0);
  }, []);

  useEffect(() => () => {
    sendRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    const rec = mediaRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  }, []);

  return { recording, seconds, start, stop };
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
  const peerName = peer.name ?? peer.username ?? 'User';

  const [msgs, setMsgs] = useState<DirectMsg[]>([]);
  const [text, setText] = useState('');
  const [showPickerFor, setShowPickerFor] = useState<string | null>(null);
  const [showPlus, setShowPlus] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [replyTo, setReplyTo] = useState<DirectMsg | null>(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const imgInputRef = useRef<HTMLInputElement | null>(null);
  const vidInputRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

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
    const body = text.trim();
    const target = replyTo;
    const quote = target ? previewOf(target) : null;
    pushLocal(
      user.id,
      peer.friendId,
      {
        fromId: user.id,
        type: 'text',
        body,
        replyToFromId: target ? target.fromId : null,
        replyToBody: quote,
      },
      target && quote ? encodeReplyBody(body, target.fromId, quote) : undefined,
    );
    setText('');
    setReplyTo(null);
    refresh();
  }

  function handleReact(msgId: string, emoji: string) {
    if (!user?.id) return;
    toggleReaction(user.id, peer.friendId, msgId, emoji);
    refresh();
  }

  function handleReply(msg: DirectMsg) {
    setReplyTo(msg);
    setShowPlus(false);
    setShowEmoji(false);
    setTimeout(() => inputRef.current?.focus(), 60);
  }

  async function handleVoice(blob: Blob, seconds: number) {
    if (!user?.id) return;
    const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
    setUploading(true);
    const url = await uploadMedia(blob, `voice-${Date.now()}.${ext}`);
    setUploading(false);
    if (!url) { showToast('Could not send the voice message. Please try again.'); return; }
    pushLocal(user.id, peer.friendId, { fromId: user.id, type: 'voice', body: url, duration: seconds });
    refresh();
  }

  const recorder = useVoiceRecorder(handleVoice, showToast);

  async function handleMediaFile(file: File, kind: 'image' | 'video') {
    if (!user?.id) return;
    setUploading(true);
    const url = await uploadMedia(file, file.name);
    setUploading(false);
    if (!url) { showToast(`Could not send the ${kind === 'image' ? 'photo' : 'video'}. Please try again.`); return; }
    pushLocal(user.id, peer.friendId, { fromId: user.id, type: kind, body: url });
    refresh();
  }

  function handleLocation() {
    if (!user?.id) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      showToast('Location is not available on this device');
      return;
    }
    showToast('Getting your location...');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const url = `https://www.google.com/maps?q=${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`;
        pushLocal(user.id, peer.friendId, { fromId: user.id, type: 'text', body: url });
        setToast(null);
        refresh();
      },
      () => showToast('Could not get your location. Check the location permission.'),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
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

  const plusItems: { key: string; label: string; icon: React.ReactNode; run: () => void }[] = [
    { key: 'photo', label: 'Photo', icon: <ImageIcon size={20} />, run: () => imgInputRef.current?.click() },
    { key: 'video', label: 'Video', icon: <VideoIcon size={20} />, run: () => vidInputRef.current?.click() },
    { key: 'location', label: 'Location', icon: <MapPin size={20} />, run: handleLocation },
  ];

  const statusText = uploading ? 'Sending...' : toast;

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 10860, display: 'flex', flexDirection: 'column', background: C.bg,
        width: '100%', maxWidth: '100vw', overflow: 'hidden',
      }}
      onClick={() => { setShowPickerFor(null); setShowPlus(false); }}
    >
      <style>{'.dcs-strip::-webkit-scrollbar { display: none; }'}</style>
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
            {peerName}
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
      <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', padding: '10px 0' }}>
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
                meId={user?.id ?? ''}
                peerName={peerName}
                onReact={handleReact}
                onReply={handleReply}
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

      {/* Bottom area: status toast, reply preview, emoji panel, composer */}
      <div style={{ position: 'relative', flexShrink: 0, background: C.headerBg, borderTop: `1px solid ${C.border}` }} onClick={e => e.stopPropagation()}>
        <AnimatePresence>
          {statusText && (
            <motion.div
              key="status-toast"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
              style={{ position: 'absolute', left: 0, right: 0, bottom: '100%', marginBottom: 8, display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 25 }}
            >
              <span style={{ background: 'rgba(0,0,0,0.82)', color: '#fff', fontSize: '0.78rem', padding: '7px 14px', borderRadius: 16, maxWidth: '86%', textAlign: 'center' }}>
                {statusText}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Reply preview */}
        {replyTo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px 0' }}>
            <div style={{ flex: 1, minWidth: 0, borderLeft: `4px solid ${C.green}`, background: '#f0f2f5', borderRadius: 8, padding: '6px 10px' }}>
              <p style={{ margin: 0, fontSize: '0.74rem', fontWeight: 700, color: '#128C7E' }}>
                {user?.id && String(replyTo.fromId) === String(user.id) ? 'You' : peerName}
              </p>
              <p style={{ margin: 0, fontSize: '0.8rem', color: C.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {previewOf(replyTo)}
              </p>
            </div>
            <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" style={ICON_BTN}>
              <X size={20} />
            </button>
          </div>
        )}

        {/* Emoji panel */}
        {showEmoji && !recorder.recording && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, padding: '8px 10px 0', maxHeight: 170, overflowY: 'auto' }}>
            {EMOJI_PANEL.map((em, i) => (
              <button
                key={`${em}-${i}`}
                type="button"
                onClick={() => { setText(t => t + em); onTyping?.(); }}
                style={{ border: 'none', background: 'none', fontSize: '1.5rem', cursor: 'pointer', padding: 4, lineHeight: 1, width: '12.5%', minWidth: 38 }}
              >
                {em}
              </button>
            ))}
          </div>
        )}

        {/* Composer */}
        <input ref={imgInputRef} type="file" accept="image/*" hidden onChange={e => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (f) void handleMediaFile(f, 'image');
        }} />
        <input ref={vidInputRef} type="file" accept="video/*" hidden onChange={e => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (f) void handleMediaFile(f, 'video');
        }} />

        {recorder.recording ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
            paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
          }}>
            <button type="button" onClick={() => recorder.stop(false)} aria-label="Cancel recording" style={{ ...ICON_BTN, color: '#ef4444', padding: 6 }}>
              <Trash2 size={22} />
            </button>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, borderRadius: 20, padding: '9px 14px', background: '#f0f2f5' }}>
              <motion.span
                animate={{ opacity: [1, 0.25, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
                style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }}
              />
              <span style={{ fontSize: '0.92rem', fontWeight: 700, color: C.text, minWidth: 36 }}>{fmtDur(recorder.seconds)}</span>
              <span style={{ fontSize: '0.8rem', color: C.textDim }}>Recording...</span>
            </div>
            <button type="button" onClick={() => recorder.stop(true)} style={ROUND_BTN} aria-label="Send voice message">
              <Send size={17} />
            </button>
          </div>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
            paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
          }}>
            <div style={{ position: 'relative', display: 'flex' }}>
              <AnimatePresence>
                {showPlus && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    style={{
                      position: 'absolute', left: 0, bottom: '100%', marginBottom: 10, minWidth: 176, zIndex: 30,
                      background: '#fff', borderRadius: 14, padding: 6, boxShadow: '0 4px 18px rgba(0,0,0,0.25)',
                    }}
                  >
                    {plusItems.map(it => (
                      <button
                        key={it.key}
                        type="button"
                        onClick={() => { setShowPlus(false); it.run(); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12, width: '100%', border: 'none', background: 'none',
                          padding: '10px 12px', borderRadius: 10, cursor: 'pointer', color: C.text, fontSize: '0.92rem', fontWeight: 600,
                        }}
                      >
                        <span style={{ width: 34, height: 34, borderRadius: '50%', background: C.action, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {it.icon}
                        </span>
                        {it.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
              <button
                type="button"
                onClick={() => { setShowPlus(v => !v); setShowEmoji(false); }}
                aria-label="Attach"
                style={{ ...ICON_BTN, transform: showPlus ? 'rotate(45deg)' : 'none', transition: 'transform 0.15s' }}
              >
                <Plus size={26} />
              </button>
            </div>

            <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: '#f0f2f5', borderRadius: 20, paddingRight: 6 }}>
              <input
                ref={inputRef}
                value={text}
                onChange={e => {
                  setText(e.target.value);
                  if (e.target.value.trim()) onTyping?.();
                }}
                onFocus={() => setShowPlus(false)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); } }}
                placeholder="Message"
                style={{
                  flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '9px 14px',
                  background: 'transparent', border: 'none', outline: 'none', fontSize: '0.9rem', color: C.text,
                }}
              />
              <button
                type="button"
                onClick={() => { setShowEmoji(v => !v); setShowPlus(false); }}
                aria-label="Emoji"
                style={{ ...ICON_BTN, color: showEmoji ? '#128C7E' : '#54656f' }}
              >
                <Smile size={22} />
              </button>
            </div>

            {text.trim() ? (
              <button type="button" onClick={sendText} style={ROUND_BTN} aria-label="Send">
                <Send size={17} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { setShowEmoji(false); void recorder.start(); }}
                style={ROUND_BTN}
                aria-label="Record a voice message"
              >
                <Mic size={18} />
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
