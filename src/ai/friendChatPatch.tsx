/**
 * FRIEND-CHAT PATCH  (ملف مستقل — لا يعدّل StooornaAiSheet.tsx)
 *
 * ماذا يسوي:
 *  - عند الضغط على صورة البروفايل (أعلى يسار صفحة Stooorna Ai) تظهر قائمة أصدقائك.
 *  - اختيار صديق => نفس صفحة Stooorna Ai تتحول إلى شات بينك وبينه:
 *      * تختفي: شارة "Stooorna Ai" + رصيد النقاط + زر السجل + زر الشات الجديد.
 *      * يبقى شريط الكتابة السفلي نفسه، والرسائل المرسلة تظهر لك مع علامة ✓ (أُرسلت) / ✓✓ (قُرئت).
 *  - عند الطرف الثاني: إذا وصلته رسائل غير مقروءة تتحول صورة بروفايله إلى دائرة فيها أيقونة شات
 *    (مع عدد الرسائل)، يضغط عليها فتظهر القائمة، يدخل عليك فتتحول الصفحة إلى شات.
 *
 * كيف يشتغل بدون تعديل الـSheet:
 *  - يراقب الـDOM ويكتشف الصفحة عندما تُفتح، ويقرأ المستخدم الحالي من props الـSheet نفسه.
 *  - يعترض (capture) أزرار الإرسال داخل وضع الشات فقط حتى لا تذهب الرسالة للـAi.
 *
 * الربط: سطر واحد في index.ts:  import './friendChatPatch';
 *
 * ⚠️ طبقة الاتصال (ADAPTER) أدناه هي الجزء الوحيد المرتبط بالسيرفر. عدّلها لتطابق نظام
 *    الرسائل عندك، أو عرّف window.__STOOORNA_FRIEND_CHAT__ = { listFriends, fetchMessages, send, unread, markRead }.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { MessageCircle, Check, CheckCheck, AlertCircle, ArrowLeft, ChevronDown, ListChecks, X, Plus, Image as ImageIcon, Pencil as EditIcon, Trash2 as TrashIcon, Copy as CopyIcon } from 'lucide-react';
import { loadDashboard } from './appAssistant';
// FRIEND-VOICE-LIVE: بث صوتي مباشر على المايك الأحمر داخل شات الصديق (ملف مستقل)
import FriendVoiceLive, { FRIEND_VOICE_TAP_EVENT } from './FriendVoiceLive';
import { installPushTapHandler, installPushReceiveHandler } from '@/native-push-tap'; // PUSH-TAP
import { useSession } from '@/lib/auth/auth-client'; // PUSH-TAP
// FRIEND-CHAT-MEDIA: نفس نظام شات المحفوظات بالضبط (اللوكيشن + إرسال الصور) — نفس المكونات ونفس التشفير
import { LocationChatCard } from '@/components/LocationPickerPatch';
import { encodeSavedLocation, decodeSavedLocation, encodeSavedMediaLink, decodeSavedMediaLink, prepareSavedMediaWithin } from '@/lib/savedMediaPatch';
import ImageMarkup from './ImageMarkup'; // IMAGE-MARKUP: علّم على الصورة (سهم/دائرة/قلم/نص) قبل الإرسال
const LocationPickerSheet = React.lazy(() => import('@/components/LocationPickerPatch').then(m => ({ default: m.LocationPickerSheet })));
const LocationViewSheet = React.lazy(() => import('@/components/LocationPickerPatch').then(m => ({ default: m.LocationViewSheet })));

export const FRIEND_CHAT_PATCH_VERSION = '2.0.0'; // 2.0.0: MSG-EDIT-DELETE + IMAGE-MARKUP · 1.9.0: GROUP-CHAT

/**
 * LOCATION-FREEZE-FIX: full-screen layer that lives on document.body (outside the Ai sheet).
 * The Ai sheet (modal dialog / drag-to-close / scroll-lock) was swallowing every touch that happened outside of it,
 * so the map picker / viewer looked frozen: no drag, no tap, no way to close.
 *  - pointer-events:auto  => works even when the page behind has body{pointer-events:none}
 *  - native listeners stop the events from bubbling to document-level handlers of the sheet (outside-click, drag, scroll lock)
 *  - Escape closes the layer
 */
function ModalLayer({ children, onEsc }: { children: React.ReactNode; onEsc?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    /* FREEZE-FIX-2: the old code called stopPropagation() on the layer itself, which also blocked React's own delegated
       listener (React listens for portal content on document.body) => every React tap/drag handler inside the picker was dead.
       Now the events are stopped on document.body instead: React's listener on body still runs, but the sheet's
       document-level handlers (outside click, drag-to-close, scroll lock) no longer see them. */
    const host: HTMLElement = document.body;
    const stop = (e: Event) => { if (el.contains(e.target as Node)) e.stopPropagation(); };
    const evs = ['pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'wheel', 'focusin', 'keydown'];
    evs.forEach(n => host.addEventListener(n, stop, { passive: true } as AddEventListenerOptions));
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onEsc?.(); };
    el.addEventListener('keydown', onKey);
    /* native close button: works even if the content below never reacts to touches */
    const closeBtn = el.querySelector('[data-sfc-native-close]') as HTMLElement | null;
    const onClose = (e: Event) => { e.preventDefault(); e.stopPropagation(); onEsc?.(); };
    closeBtn?.addEventListener('click', onClose);
    return () => {
      evs.forEach(n => host.removeEventListener(n, stop));
      el.removeEventListener('keydown', onKey);
      closeBtn?.removeEventListener('click', onClose);
    };
  }, [onEsc]);
  return (
    <div ref={ref} data-sfc-layer="1" style={{ position: 'fixed', inset: 0, zIndex: 2147483000, pointerEvents: 'auto', touchAction: 'auto', overscrollBehavior: 'contain' }}>
      {children}
      <button
        type="button" data-sfc-native-close="1" aria-label="Close"
        style={{
          position: 'absolute', top: 'max(10px, env(safe-area-inset-top))', left: 10, zIndex: 2147483001, width: 36, height: 36, borderRadius: '50%',
          border: 'none', background: 'rgba(17,17,17,0.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
        }}
      ><X size={18} /></button>
    </div>
  );
}

/* ───────────────────────── Types ───────────────────────── */
interface Me { id: string; name?: string | null; username?: string | null; avatarUrl?: string | null; image?: string | null }
interface Friend { id: string; name: string; avatar?: string | null }
/** PRESENCE: online / last seen / typing of a friend */
interface Presence { online?: boolean; lastSeen?: number | null; typing?: boolean }
interface ChatMsg {
  id: string; clientId?: string; from: string; to?: string; text: string; ts: number;
  status?: 'sending' | 'sent' | 'failed'; read?: boolean; reaction?: string;
  fromName?: string; kind?: 'text' | 'system'; // GROUP-CHAT
  edited?: boolean; // MSG-EDIT
}
interface Adapter {
  listFriends(me: Me): Promise<Friend[]>;
  fetchMessages(me: Me, peerId: string): Promise<ChatMsg[]>;
  send(me: Me, peerId: string, text: string, clientId: string): Promise<Partial<ChatMsg> | void>;
  unread(me: Me): Promise<Record<string, number>>;
  markRead(me: Me, peerId: string): Promise<void>;
  presence(me: Me, peerId: string): Promise<Presence>;
  typing(me: Me, peerId: string): Promise<void>;
  react(me: Me, peerId: string, messageId: string, emoji: string): Promise<void>;
  /** MSG-EDIT: تعديل نص رسالتي (السيرفر) */
  edit(me: Me, peerId: string, messageId: string, text: string): Promise<void>;
  /** MSG-DELETE: حذف رسالتي عند الطرفين (السيرفر) */
  remove(me: Me, peerId: string, messageId: string): Promise<void>;
  /** MSG-EDIT/DELETE: ما تغيّر عند الطرف الثاني (ids بصيغة db-N) */
  changes(me: Me, peerId: string): Promise<{ deleted: string[]; edited: string[] }>;
}

/* ───────────────────────── ADAPTER (الجزء المرتبط بالسيرفر) ───────────────────────── */
const DEFAULT_ROOT = 'https://welcoming-heart-production.up.railway.app';

function apiRoot(): string {
  try {
    const w: any = window;
    const v = w.__STOOORNA_API_ROOT__ || w.__STOOORNA_AI_API__ || (import.meta as any)?.env?.VITE_AI_API_URL || DEFAULT_ROOT;
    return String(v).replace(/\/+$/, '').replace(/\/ai$/, '');
  } catch { return DEFAULT_ROOT; }
}

async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${apiRoot()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** FIX: the app's real backend is same-origin `/api/...` with the session cookie (not the Railway /dm/* routes). */
async function local<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const asTs = (v: any): number => {
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  const n = Date.parse(v);
  return Number.isFinite(n) ? n : Date.now();
};
const toFriend = (o: any): Friend | null => {
  const id = o?.friendId ?? o?.userId ?? o?.id; // FIX: `id` in /api/friends is the row id; `friendId` is the user
  const name = o?.name || o?.displayName || o?.username || o?.email;
  if (!id || !name) return null;
  return { id: String(id), name: String(name), avatar: o?.avatarUrl ?? o?.avatar ?? o?.image ?? null };
};
const toMsg = (o: any): ChatMsg => ({
  id: typeof o.id === 'number' ? `db-${o.id}` : String(o.id ?? o._id ?? `${o.from ?? o.senderId}_${o.ts ?? o.createdAt}`),
  ...(o.clientId ? { clientId: String(o.clientId) } : {}),
  from: String(o.from ?? o.senderId ?? o.fromId),
  to: o.to ?? o.receiverId ?? o.toId,
  text: o.type && o.type !== 'text' && !o.text ? '📎 وسائط' : String(o.text ?? o.body ?? o.content ?? o.message ?? ''),
  ts: asTs(o.ts ?? o.createdAt ?? o.timestamp),
  read: !!(o.read ?? o.readAt),
  ...(o.reaction ? { reaction: String(o.reaction) } : {}),
  ...(o.edited || o.editedAt ? { edited: true } : {}), // MSG-EDIT
  status: 'sent',
});

/** يبحث داخل نتيجة loadDashboard عن مصفوفة الأصدقاء (احتياط إذا ما فيه endpoint للأصدقاء). */
function findFriends(o: any, depth = 0): Friend[] | null {
  if (!o || depth > 3 || typeof o !== 'object') return null;
  if (Array.isArray(o)) {
    const list = o.map(toFriend).filter(Boolean) as Friend[];
    return list.length ? list : null;
  }
  for (const k of Object.keys(o)) {
    if (/friend/i.test(k)) { const r = findFriends(o[k], depth + 1); if (r) return r; }
  }
  return null;
}

/** DEDICATED-TABLE: this chat now lives in its own server table (friend_chat_messages) via /api/friend-chat/*.
 *  No hidden marker is used any more, and the old /api/messages is never read or written by this screen. */

const restAdapter: Adapter = {
  async listFriends(me) {
    // 1) the app's real friends endpoint (same one the Add-Friend page uses)
    try {
      const d = await local('/api/friends');
      const arr = Array.isArray(d) ? d : d?.accepted || d?.friends || [];
      const seen = new Set<string>();
      const list = (arr.map(toFriend).filter(Boolean) as Friend[]).filter(f => {
        if (f.id === me.id || seen.has(f.id)) return false;
        seen.add(f.id); return true;
      });
      if (list.length) return list;
    } catch { /* fall through */ }
    // 2) the dashboard data (the screen already shows the friends count from here)
    try {
      const d = await (loadDashboard as any)(me);
      const l = findFriends(d);
      if (l && l.length) return l;
    } catch { /* fall through */ }
    // 3) old external route (kept as last resort)
    try {
      const d = await api(`/dm/friends?userId=${encodeURIComponent(me.id)}`);
      const arr = Array.isArray(d) ? d : d?.friends || [];
      return arr.map(toFriend).filter(Boolean) as Friend[];
    } catch { return []; }
  },
  async fetchMessages(me, peerId) {
    const d = await local(`/api/friend-chat/messages?with=${encodeURIComponent(peerId)}`);
    return (Array.isArray(d) ? d : d?.messages || []).map(toMsg);
  },
  async send(me, peerId, text, clientId) {
    const d = await local('/api/friend-chat/messages', { method: 'POST', body: JSON.stringify({ receiverId: peerId, body: text, clientId }) });
    return typeof d?.id === 'number' ? { id: `db-${d.id}`, ...(typeof d?.ts === 'number' ? { ts: d.ts } : {}) } : undefined;
  },
  async unread() {
    try {
      const d = await local('/api/friend-chat/unread');
      const by: Record<string, number> = d?.bySender || {};
      const out: Record<string, number> = {};
      Object.keys(by).forEach(k => { const n = Number(by[k] || 0); if (n > 0) out[k] = n; });
      return out;
    } catch { return {}; }
  },
  async markRead() { /* GET /api/friend-chat/messages?with=... already marks incoming messages as read */ },
  /** PRESENCE: GET /api/friend-chat/presence?with=<id> -> { online, lastSeen, typing | typingAt }; falls back to the fields on /api/friends */
  async presence(_me, peerId) {
    try {
      const d = await local(`/api/friend-chat/presence?with=${encodeURIComponent(peerId)}`);
      const typing = !!d?.typing || (d?.typingAt ? Date.now() - asTs(d.typingAt) < 6000 : false);
      return { online: !!d?.online, lastSeen: d?.lastSeen ? asTs(d.lastSeen) : null, typing };
    } catch { /* fall through */ }
    try {
      const d = await local('/api/friends');
      const arr: any[] = Array.isArray(d) ? d : d?.accepted || d?.friends || [];
      const o = arr.find(x => String(x?.friendId ?? x?.userId ?? x?.id) === peerId);
      if (o) {
        const ls = o.lastSeen ?? o.lastSeenAt ?? o.last_seen ?? o.lastActiveAt ?? o.lastActive ?? null;
        return { online: !!(o.online ?? o.isOnline), lastSeen: ls ? asTs(ls) : null };
      }
    } catch { /* */ }
    return {};
  },
  /** PRESENCE: POST /api/friend-chat/typing { receiverId } while the user is typing (throttled) */
  async typing(_me, peerId) {
    try { await local('/api/friend-chat/typing', { method: 'POST', body: JSON.stringify({ receiverId: peerId }) }); } catch { /* */ }
  },
  /** MSG-EDIT: PATCH /api/friend-chat/messages/:id { body } (friend-chat-edit-routes.ts) */
  async edit(_me, _peerId, messageId, text) {
    await local(`/api/friend-chat/messages/${encodeURIComponent(messageId.replace(/^db-/, ''))}`, { method: 'PATCH', body: JSON.stringify({ body: text }) });
  },
  /** MSG-DELETE: DELETE /api/friend-chat/messages/:id => يختفي عند الطرفين */
  async remove(_me, _peerId, messageId) {
    await local(`/api/friend-chat/messages/${encodeURIComponent(messageId.replace(/^db-/, ''))}`, { method: 'DELETE' });
  },
  /** MSG-EDIT/DELETE: GET /api/friend-chat/changes?with=<id> */
  async changes(_me, peerId) {
    try {
      const d = await local(`/api/friend-chat/changes?with=${encodeURIComponent(peerId)}`);
      return { deleted: (d?.deleted || []).map((x: any) => `db-${x}`), edited: (d?.edited || []).map((x: any) => `db-${x}`) };
    } catch { return { deleted: [], edited: [] }; }
  },
  /** REACTIONS: POST /api/friend-chat/react { receiverId, messageId, emoji } (emoji '' = remove). Best effort: the reaction is always kept on this device. */
  async react(_me, peerId, messageId, emoji) {
    try { await local('/api/friend-chat/react', { method: 'POST', body: JSON.stringify({ receiverId: peerId, messageId: messageId.replace(/^db-/, ''), emoji }) }); } catch { /* */ }
  },
};

/* ───────── GROUP-CHAT: قروبات داخل نفس الشات ─────────
 * القروب يُعامل كأنه "صديق" معرّفه g:<groupId> ، فكل شيء موجود (الكاش، الإرسال، الصور، القائمة، العدّاد) يشتغل عليه.
 * المسارات على /api/friend-group/* (ملف friend-group-chat-routes.ts). الشات العادي بين شخصين لم يتغير أبداً. */
const isGroupId = (id?: string | null): boolean => !!id && id.startsWith('g:');
const gid = (id: string): string => id.slice(2);
const GROUP_GONE = 'GROUP_GONE';
interface GroupMember { id: string; name: string; avatar?: string | null }
interface GroupInfo { id: string; name: string; ownerId: string; members: GroupMember[] }
async function gapi<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api/friend-group${path}`, {
    credentials: 'include', ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (r.status === 403 || r.status === 404) throw new Error(GROUP_GONE);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
const toGroupMsg = (o: any): ChatMsg => ({
  id: `db-${o.id}`, ...(o.clientId ? { clientId: String(o.clientId) } : {}),
  from: String(o.from), text: String(o.text ?? ''), ts: asTs(o.ts), read: !!o.read, status: 'sent',
  fromName: o.fromName ? String(o.fromName) : undefined, kind: o.kind === 'system' ? 'system' : 'text',
});
const adapter = (): Adapter => {
  const b: Adapter = { ...restAdapter, ...((window as any).__STOOORNA_FRIEND_CHAT__ || {}) };
  return {
    ...b,
    fetchMessages: (me, pid) => isGroupId(pid) ? gapi(`/${gid(pid)}/messages`).then(d => (d?.messages || []).map(toGroupMsg)) : b.fetchMessages(me, pid),
    send: (me, pid, text, cid) => isGroupId(pid)
      ? gapi(`/${gid(pid)}/messages`, { method: 'POST', body: JSON.stringify({ body: text, clientId: cid }) }).then(d => (typeof d?.id === 'number' ? { id: `db-${d.id}`, ...(typeof d?.ts === 'number' ? { ts: d.ts } : {}) } : undefined))
      : b.send(me, pid, text, cid),
    unread: async (me) => {
      const base = { ...(await b.unread(me)) };
      try {
        const d = await gapi('/unread');
        Object.entries(d?.byGroup || {}).forEach(([k, v]) => { const n = Number(v || 0); if (n > 0) base[`g:${k}`] = n; });
      } catch { /* */ }
      return base;
    },
    markRead: (me, pid) => (isGroupId(pid) ? Promise.resolve() : b.markRead(me, pid)), // GET messages already marks the group as read
    presence: (me, pid) => (isGroupId(pid) ? Promise.resolve({}) : b.presence(me, pid)),
    typing: (me, pid) => (isGroupId(pid) ? Promise.resolve() : b.typing(me, pid)),
    react: (me, pid, mid, em) => (isGroupId(pid) ? Promise.resolve() : b.react(me, pid, mid, em)),
    edit: (me, pid, mid, t) => (isGroupId(pid) ? Promise.reject(new Error('group')) : b.edit(me, pid, mid, t)), // MSG-EDIT
    remove: (me, pid, mid) => (isGroupId(pid) ? Promise.reject(new Error('group')) : b.remove(me, pid, mid)), // MSG-DELETE
    changes: (me, pid) => (isGroupId(pid) ? Promise.resolve({ deleted: [], edited: [] }) : b.changes(me, pid)),
  };
};

/* ───────────────────────── Helpers ───────────────────────── */
const DARK_GREEN = '#0a1f1a';
const cacheKey = (me: string, peer: string) => `stooorna_friend_chat_v3_${me}_${peer}`;
const loadCache = (me: string, peer: string): ChatMsg[] => {
  try { const v = JSON.parse(localStorage.getItem(cacheKey(me, peer)) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};
const saveCache = (me: string, peer: string, list: ChatMsg[]) => {
  try { localStorage.setItem(cacheKey(me, peer), JSON.stringify(list.slice(-150))); } catch { /* */ }
};

/* CHAT-LIST: conversations you entered stay as rectangles on the chat page; "delete" clears them from your side */
interface Recent extends Friend { ts: number }
const recentKey = (me: string) => `stooorna_friend_chat_recent_v1_${me}`;
const loadRecents = (me: string): Recent[] => {
  try { const v = JSON.parse(localStorage.getItem(recentKey(me)) || '[]'); return Array.isArray(v) ? v.filter((x: any) => x && x.id && x.name) : []; } catch { return []; }
};
const saveRecents = (me: string, l: Recent[]) => { try { localStorage.setItem(recentKey(me), JSON.stringify(l.slice(0, 100))); } catch { /* */ } };
const clearKey = (me: string, peer: string) => `stooorna_friend_chat_clear_v1_${me}_${peer}`;
const getClearedAt = (me: string, peer: string): number => { try { return Number(localStorage.getItem(clearKey(me, peer)) || 0) || 0; } catch { return 0; } };

function merge(prev: ChatMsg[], inc: ChatMsg[]): ChatMsg[] {
  const map = new Map<string, ChatMsg>();
  [...prev, ...inc].forEach(m => { const k = m.id.startsWith('db-') ? m.id : (m.clientId || m.id); map.set(k, { ...(map.get(k) || {}), ...m } as ChatMsg); });
  const all = [...map.values()];
  // pending local copy + same message coming back from the server without clientId => keep the server one
  const out = all.filter(m => {
    if (!m.id.startsWith('c_') || m.status === 'failed') return true;
    return !all.some(o => !o.id.startsWith('c_') && o.from === m.from && o.text === m.text && Math.abs(o.ts - m.ts) < 20000);
  });
  return out.sort((a, b) => a.ts - b.ts).slice(-300);
}

/** FRIEND-CHAT-MEDIA: short text shown in the chat list for a location / photo message */
/* TPL-POST-TO-CHAT: a Templates post shared to a friend = one text message "TPLPOST::{json}" (rendered as a picture tile) */
const TPL_POST_PREFIX = 'TPLPOST::';
interface TplPost { p: string; k: 'image' | 'video'; u: string }
function encodeTplPost(t: TplPost): string { return TPL_POST_PREFIX + JSON.stringify(t); }
function decodeTplPost(text: string): TplPost | null {
  if (!text || !text.startsWith(TPL_POST_PREFIX)) return null;
  try {
    const o = JSON.parse(text.slice(TPL_POST_PREFIX.length));
    if (!o || !o.p) return null;
    return { p: String(o.p), k: o.k === 'video' ? 'video' : 'image', u: String(o.u || '') };
  } catch { return null; }
}
function openTplPost(tp: TplPost, from?: string) {
  try { window.dispatchEvent(new CustomEvent('stooorna:tpl-open-friend', { detail: { postId: tp.p, u: tp.u, kind: tp.k, from } })); } catch { /* */ }
}
function TplPostTile({ tp, time, onOpen }: { tp: TplPost; time: string; onOpen: () => void }) {
  return (
    <div role="button" onClick={e => { e.stopPropagation(); onOpen(); }} style={{ position: 'relative', width: 220, maxWidth: '100%', height: 260, borderRadius: 14, overflow: 'hidden', background: '#0b1214', cursor: 'pointer' }}>
      {tp.u ? (tp.k === 'video'
        ? <video src={tp.u} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
        : <img src={tp.u} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />) : null}
      {tp.k === 'video' && (
        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, paddingLeft: 3 }}>▶</span>
        </span>
      )}
      <span style={{ position: 'absolute', left: 8, bottom: 8, padding: '3px 9px', borderRadius: 999, background: 'rgba(0,0,0,0.55)', color: '#7ee8f5', fontSize: 11.5, fontWeight: 800 }}>Post · {time}</span>
    </div>
  );
}

const previewOf = (t: string): string => {
  { const tp0 = decodeTplPost(t); if (tp0) return tp0.k === 'video' ? '🎬 Post' : '📷 Post'; } // TPL-POST-TO-CHAT
  if (decodeSavedLocation(t)) return '📍 Location';
  const dl = decodeSavedMediaLink(t);
  if (dl) return dl.kind === 'video' ? '🎬 Video' : '📷 Photo';
  return t;
};

/** SEND-SOUND: soft "pop" like WhatsApp when a message is sent; long-press on "+" mutes / unmutes it (saved on this device) */
const MUTE_KEY = 'stooorna_friend_chat_send_sound_muted_v1';
const isSoundMuted = (): boolean => { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } };
const setSoundMuted = (v: boolean) => { try { if (v) localStorage.setItem(MUTE_KEY, '1'); else localStorage.removeItem(MUTE_KEY); } catch { /* */ } };
let audioCtx: AudioContext | null = null;
function playSendSound(force = false) {
  if (!force && isSoundMuted()) return;
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    const ctx = audioCtx as AudioContext;
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime;
    const tone = (f0: number, f1: number, start: number, dur: number, vol: number) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, t0 + start);
      o.frequency.exponentialRampToValueAtTime(f1, t0 + start + dur);
      g.gain.setValueAtTime(0.0001, t0 + start);
      g.gain.exponentialRampToValueAtTime(vol, t0 + start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(t0 + start); o.stop(t0 + start + dur + 0.02);
    };
    tone(620, 980, 0, 0.09, 0.22);
    tone(980, 1240, 0.07, 0.12, 0.16);
  } catch { /* */ }
}

const hhmm = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** REACTIONS: emoji bubble opened by long-press on the friend's message */
const REACTIONS = ['❤️', '😂', '😍', '😮', '😢', '😡', '👍', '👎', '🙏', '🔥', '🎉', '😘'];
const reactKey = (me: string, peer: string) => `stooorna_friend_chat_react_v1_${me}_${peer}`;

/** DAY-SEPARATORS: "Today" / "Yesterday" / date, shown between messages of different days */
const dayKey = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
function dayLabel(ts: number): string {
  const d = new Date(ts); const now = new Date();
  if (dayKey(ts) === dayKey(now.getTime())) return 'Today';
  if (dayKey(ts) === dayKey(now.getTime() - 864e5)) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}) });
}
const DAY_CHIP: React.CSSProperties = { alignSelf: 'center', background: 'rgba(0,0,0,0.06)', color: '#6b7280', fontSize: 12, fontWeight: 700, padding: '4px 14px', borderRadius: 999, margin: '6px 0 2px', flexShrink: 0 };

/** SHATTER-DELETE: the deleted bubble (text / image / video) breaks into pieces that fly away and fade. */
function shatterEl(el: Element | null) {
  try {
    if (!el || typeof document === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const r = (el as HTMLElement).getBoundingClientRect();
    if (r.width < 6 || r.height < 6 || r.bottom < 0 || r.top > window.innerHeight) return;
    const cols = Math.max(3, Math.min(10, Math.round(r.width / 24)));
    const rows = Math.max(3, Math.min(10, Math.round(r.height / 24)));
    const cw = r.width / cols; const ch = r.height / rows;
    const layer = document.createElement('div');
    layer.setAttribute('data-sfc-shatter', '1');
    layer.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483600;pointer-events:none;';
    for (let rr = 0; rr < rows; rr++) {
      for (let c = 0; c < cols; c++) {
        const frag = document.createElement('div');
        frag.style.cssText = `position:fixed;left:${r.left + c * cw}px;top:${r.top + rr * ch}px;width:${cw + 0.5}px;height:${ch + 0.5}px;overflow:hidden;will-change:transform,opacity;pointer-events:none;`;
        const inner = (el as HTMLElement).cloneNode(true) as HTMLElement;
        inner.removeAttribute('data-sfc-bubble');
        inner.style.cssText += `;position:absolute;left:${-c * cw}px;top:${-rr * ch}px;width:${r.width}px;height:${r.height}px;max-width:none;margin:0;box-sizing:border-box;`;
        frag.appendChild(inner);
        layer.appendChild(frag);
        const dx = (Math.random() - 0.35) * 170 + (c / cols) * 50;
        const dy = (Math.random() - 0.6) * 150 - 20;
        const rot = (Math.random() - 0.5) * 220;
        const sc = 0.2 + Math.random() * 0.5;
        (frag as any).animate?.(
          [{ transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1 }, { transform: `translate(${dx}px,${dy}px) rotate(${rot}deg) scale(${sc})`, opacity: 0 }],
          { duration: 650 + Math.random() * 550, delay: (c / cols) * 140 + Math.random() * 60, easing: 'cubic-bezier(.2,.7,.35,1)', fill: 'forwards' },
        );
      }
    }
    document.body.appendChild(layer);
    window.setTimeout(() => layer.remove(), 1700);
  } catch { /* animation is cosmetic only */ }
}
function shatterById(id: string, root?: Element | null) {
  try { shatterEl((root || document).querySelector(`[data-sfc-bubble="${String(id).replace(/"/g, '')}"]`)); } catch { /* */ }
}

/** PRESENCE: text under the friend's name / inside the chat rectangle */
function seenText(p?: Presence): string {
  if (!p) return '';
  if (p.online) return 'Online';
  if (!p.lastSeen) return '';
  const d = new Date(p.lastSeen); const now = new Date();
  const y = new Date(now.getTime() - 864e5);
  if (d.toDateString() === now.toDateString()) return `Last seen today at ${hhmm(p.lastSeen)}`;
  if (d.toDateString() === y.toDateString()) return `Last seen yesterday at ${hhmm(p.lastSeen)}`;
  return `Last seen ${d.toLocaleDateString()} ${hhmm(p.lastSeen)}`;
}

/** current user: read straight from the Sheet's own props (no change to the Sheet). */
function findUser(el: Element): Me | null {
  try {
    const k = Object.keys(el).find(x => x.startsWith('__reactFiber$') || x.startsWith('__reactInternalInstance$'));
    let f: any = k ? (el as any)[k] : null;
    let n = 0;
    while (f && n++ < 80) {
      const p = f.memoizedProps;
      if (p && typeof p === 'object' && 'user' in p && 'onClose' in p && 'open' in p) {
        return p.user && p.user.id ? { ...p.user, id: String(p.user.id) } : null;
      }
      f = f.return;
    }
  } catch { /* */ }
  const g = (window as any).__STOOORNA_USER__;
  return g && g.id ? g : null;
}

interface SheetEls { inner: HTMLElement; header: HTMLElement; avatarWrap: HTMLElement; form: HTMLElement | null; btn: HTMLElement }

function scanSheet(): SheetEls | null {
  const btn = document.querySelector('button[aria-label="History"]') as HTMLElement | null;
  const header = btn?.parentElement?.parentElement as HTMLElement | null | undefined;
  const inner = header?.parentElement as HTMLElement | null | undefined;
  const avatarWrap = header?.firstElementChild?.firstElementChild as HTMLElement | null | undefined;
  if (!btn || !header || !inner || !avatarWrap) return null;
  return { inner, header, avatarWrap, form: inner.querySelector('form'), btn };
}

/* ───────────────────────── Component ───────────────────────── */
function FriendChatPatch() {
  const [sheet, setSheet] = useState<SheetEls | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [mode, setMode] = useState<'ai' | 'chat'>('ai');
  const [peer, setPeer] = useState<Friend | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [chat, setChat] = useState<{ peerId: string; list: ChatMsg[] }>({ peerId: '', list: [] });
  const chatRef = useRef(chat); chatRef.current = chat; // SHATTER-DELETE
  const scrollKey = useRef(''); // SCROLL-FIX
  const [rect, setRect] = useState({ top: 58, bottom: 90 });
  const [pillLeft, setPillLeft] = useState(64);
  const [toast, setToast] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef(mode); modeRef.current = mode;
  const peerRef = useRef(peer); peerRef.current = peer;
  const sheetRef = useRef(sheet); sheetRef.current = sheet;
  const unreadRef = useRef(unread); unreadRef.current = unread;
  const autoPick = useRef(false);
  // PUSH-TAP: live list previews + open a chat from a notification
  const [, setPvTick] = useState(0);
  const [reqTick, setReqTick] = useState(0);
  const openReq = useRef<{ id: string; name: string; at: number } | null>(null);
  useEffect(() => {
    const onPv = () => setPvTick(n => n + 1);
    const onOpen = (e: Event) => {
      const dt = (e as CustomEvent).detail || {};
      openReq.current = { id: String(dt.peerId || ''), name: String(dt.peerName || ''), at: Date.now() };
      setReqTick(n => n + 1);
    };
    window.addEventListener(PREVIEW_EVENT, onPv);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => { window.removeEventListener(PREVIEW_EVENT, onPv); window.removeEventListener(OPEN_EVENT, onOpen); };
  }, []);
  const [recents, setRecents] = useState<Recent[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const selectModeRef = useRef(selectMode); selectModeRef.current = selectMode;
  const [presence, setPresence] = useState<Record<string, Presence>>({});
  const meRef = useRef(me); meRef.current = me;
  const recentsRef = useRef(recents); recentsRef.current = recents;
  const friendsRef = useRef(friends); friendsRef.current = friends;
  // PUSH-TAP: tells the in-app banner which chat is on screen ('*' = the chat list)
  useEffect(() => { (window as any).__sfcOpenPeer = sheet && mode === 'chat' ? (peer ? peer.id : '*') : ''; }, [sheet, mode, peer?.id]);
  // PUSH-TAP: a notification asked to open a chat -> switch to the chat page and pick that person
  useEffect(() => {
    const rq = openReq.current;
    if (!rq) return;
    if (Date.now() - rq.at > 15000) { openReq.current = null; return; }
    if (!sheet || !me) { const tm = window.setTimeout(() => setReqTick(n => n + 1), 600); return () => window.clearTimeout(tm); }
    if (mode !== 'chat') { setMode('chat'); return; }
    if (!friends) return;
    const nm = rq.name.trim().toLowerCase();
    const pool: Friend[] = [...friends, ...recents.map(r => ({ id: r.id, name: r.name, avatar: r.avatar ?? null }))];
    let hit: Friend | undefined = rq.id ? pool.find(f => f.id === rq.id) : undefined;
    if (!hit && nm) hit = pool.find(f => f.name.trim().toLowerCase() === nm)
      || pool.find(f => { const a = normName(f.name); return !!a && a === normName(rq.name); })
      || pool.find(f => { const a = normName(f.name); const b = normName(rq.name); return !!a && !!b && (a.startsWith(b) || b.startsWith(a)); });
    if (!hit) hit = [...friends].filter(f => (unread[f.id] || 0) > 0).sort((a, b) => (unread[b.id] || 0) - (unread[a.id] || 0))[0];
    openReq.current = null;
    if (hit) {
      const h = hit;
      setPeer({ id: h.id, name: h.name, avatar: h.avatar ?? null }); setListOpen(false); setSelectMode(false); setSelected([]);
      setRecents(prev => { const next: Recent[] = [{ id: h.id, name: h.name, avatar: h.avatar ?? null, ts: Date.now() }, ...prev.filter(r => r.id !== h.id)]; saveRecents(me.id, next); return next; });
    }
  }, [reqTick, sheet, me?.id, mode, friends, unread, recents.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const typingSent = useRef(0);
  const lpDone = useRef(0); // SEND-SOUND: time of the last long-press on "+"
  const [picker, setPicker] = useState<string | null>(null);
  const [reactions, setReactions] = useState<Record<string, string>>({});
  const pressTimer = useRef(0);
  const pickerAt = useRef(0);
  const pressXY = useRef({ x: 0, y: 0, t: 0 });
  // FRIEND-CHAT-MEDIA: "+" menu (Photo / Location), location picker, viewers
  const [plusOpen, setPlusOpen] = useState(false);
  const [locPickerOpen, setLocPickerOpen] = useState(false);
  const [locView, setLocView] = useState<{ lat: number; lng: number; label: string; name?: string | null; avatar?: string | null } | null>(null);
  const [imgView, setImgView] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // GROUP-CHAT: members of the open group, invite sheet
  const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSel, setInviteSel] = useState<string[]>([]);
  const [inviteBusy, setInviteBusy] = useState(false);
  const isGroup = isGroupId(peer?.id);
  const photoRef = useRef<HTMLInputElement>(null);
  // MSG-EDIT / MSG-DELETE / IMAGE-MARKUP
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string; edited: boolean } | null>(null);
  const editRef = useRef<{ id: string; text: string; edited: boolean } | null>(null); editRef.current = editing;
  const commitEditRef = useRef<(t: string) => void>(() => { /* set below */ });
  const deletedRef = useRef<Set<string>>(new Set());
  const [markup, setMarkup] = useState<{ file: File; target: Friend } | null>(null);
  /** يكتب نصاً في مربع الكتابة الأصلي للـSheet (نفس طريقة التفريغ المستخدمة عند الإرسال) */
  const setComposer = (v: string) => {
    const ta = sheetRef.current?.inner.querySelector('textarea') as HTMLTextAreaElement | null;
    if (!ta) return;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(ta, v);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    if (v) { try { ta.focus(); } catch { /* */ } }
  };
  useEffect(() => { // تغيير المحادثة/الخروج => ألغِ التعديل والقوائم المفتوحة
    setActionMsg(null); setMarkup(null);
    if (editRef.current) { setEditing(null); editRef.current = null; setComposer(''); }
  }, [peer?.id, mode, sheet]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!sheet || mode !== 'chat' || !peer) { setPlusOpen(false); setLocPickerOpen(false); setLocView(null); setImgView(null); } }, [sheet, mode, peer?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* 1) find the sheet whenever it opens / closes */
  useEffect(() => {
    let raf = 0;
    const scan = () => {
      raf = 0;
      const next = scanSheet();
      setSheet(prev => {
        if (!next) return prev ? null : prev;
        if (prev && prev.inner === next.inner && prev.header === next.header && prev.avatarWrap === next.avatarWrap && prev.form === next.form) return prev;
        return next;
      });
    };
    const mo = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(scan); });
    mo.observe(document.body, { childList: true, subtree: true });
    scan();
    return () => { mo.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, []);

  /* 2) sheet closed => back to normal; sheet opened => read user */
  useEffect(() => {
    if (!sheet) { setMode('ai'); setPeer(null); setListOpen(false); setFriends(null); setUnread({}); setMe(null); setSelectMode(false); setSelected([]); setRecents([]); return; }
    setMe(findUser(sheet.btn));
  }, [sheet]);

  /* 2b) load the list of conversations you entered before */
  useEffect(() => { setRecents(me ? loadRecents(me.id) : []); }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* 3) unread counts (drives the chat-icon avatar for the receiver) */
  useEffect(() => {
    if (!sheet || !me) return;
    let alive = true;
    const tick = async () => { const u = await adapter().unread(me).catch(() => ({})); if (alive) setUnread(u); };
    void tick();
    const t = window.setInterval(tick, 2500);
    window.addEventListener(REFRESH_EVENT, tick);
    return () => { alive = false; window.clearInterval(t); window.removeEventListener(REFRESH_EVENT, tick); };
  }, [sheet, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* 4) friends list loads when the chat page / picker opens */
  const chatOpen = mode === 'chat';
  useEffect(() => {
    if ((!listOpen && !chatOpen) || !me) return;
    let alive = true;
    void adapter().listFriends(me).then(l => { if (alive) setFriends(l); }).catch(() => { if (alive) setFriends([]); });
    return () => { alive = false; };
  }, [listOpen, chatOpen, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* 4b) came in through the new-message icon: jump straight to the friend who wrote */
  useEffect(() => {
    if (mode !== 'chat' || peer || !autoPick.current || !friends) return;
    autoPick.current = false;
    const top = [...friends].filter(f => (unread[f.id] || 0) > 0).sort((a, b) => (unread[b.id] || 0) - (unread[a.id] || 0))[0];
    if (top) setPeer(top);
  }, [mode, peer, friends, unread]);

  /* 5) messages of the open chat: cache first, then poll */
  useEffect(() => {
    if (mode !== 'chat' || !peer || !me) return;
    let alive = true;
    setChat({ peerId: peer.id, list: loadCache(me.id, peer.id).filter(m => m.ts > getClearedAt(me.id, peer.id)) });
    const pull = async () => {
      try {
        const inc = await adapter().fetchMessages(me, peer.id);
        if (!alive) return;
        setChat(c => (c.peerId === peer.id ? { peerId: c.peerId, list: merge(c.list, inc.filter(m => m.ts > getClearedAt(me.id, peer.id) && !deletedRef.current.has(m.id))) } : c));
        if (!isGroupId(peer.id)) { // MSG-EDIT/DELETE: ما حذفه/عدّله الطرف الثاني ينعكس عندي (والعكس)
          const ch = await adapter().changes(me, peer.id);
          if (!alive) return;
          if (ch.deleted.length || ch.edited.length) {
            ch.deleted.forEach(id => { if (chatRef.current.list.some(m => m.id === id)) shatterById(id, sheetRef.current?.inner); }); // SHATTER-DELETE
            setChat(c => {
              if (c.peerId !== peer.id) return c;
              const need = c.list.some(m => ch.deleted.includes(m.id) || (ch.edited.includes(m.id) && !m.edited));
              if (!need) return c;
              return { peerId: c.peerId, list: c.list.filter(m => !ch.deleted.includes(m.id)).map(m => (ch.edited.includes(m.id) && !m.edited ? { ...m, edited: true } : m)) };
            });
          }
        }
        if (inc.some(m => m.from === peer.id && !m.read)) {
          void adapter().markRead(me, peer.id);
          setUnread(u => { const n = { ...u }; delete n[peer.id]; return n; });
        }
      } catch (e: any) { if (e?.message === GROUP_GONE && isGroupId(peer.id)) dropGroup(peer.id); /* offline: keep cache */ }
    };
    void pull();
    const t = window.setInterval(pull, 3000);
    return () => { alive = false; window.clearInterval(t); };
  }, [mode, peer?.id, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (me && chat.peerId) saveCache(me.id, chat.peerId, chat.list);
    // SCROLL-FIX: the 3s poll rebuilds `chat` every time — only scroll when the conversation really changed
    const list = chat.list; const last = list[list.length - 1];
    const key = `${chat.peerId}|${list.length}|${last ? (last.clientId || last.id) : ''}`;
    if (key === scrollKey.current) return;
    const samePeer = scrollKey.current.split('|')[0] === chat.peerId;
    scrollKey.current = key;
    const box = endRef.current?.parentElement as HTMLElement | null;
    const near = !box || box.scrollHeight - box.scrollTop - box.clientHeight < 160;
    if (!samePeer) { const go = () => endRef.current?.scrollIntoView({ block: 'end' }); go(); window.setTimeout(go, 150); window.setTimeout(go, 600); }
    else if (near || (!!last && last.from === me?.id)) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat, me]);

  /* 6) layout: the chat panel sits exactly between header and input bar */
  useEffect(() => {
    if (!sheet) return;
    const measure = () => {
      const ir = sheet.inner.getBoundingClientRect();
      const top = sheet.header.getBoundingClientRect().bottom - ir.top;
      const bottom = sheet.form ? ir.bottom - sheet.form.getBoundingClientRect().top : 90;
      setRect(p => (Math.abs(p.top - top) < 0.5 && Math.abs(p.bottom - bottom) < 0.5 ? p : { top, bottom }));
      const badge = Array.from(sheet.header.children).find(c => c !== sheet.header.firstElementChild && !c.hasAttribute('data-sfc-portal')) as HTMLElement | undefined;
      const bl = badge ? badge.getBoundingClientRect() : null;
      const left = bl && bl.width > 0 ? bl.left - sheet.header.getBoundingClientRect().left : 64;
      setPillLeft(l => (Math.abs(l - left) < 0.5 ? l : Math.max(48, left)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(sheet.inner); ro.observe(sheet.header); if (sheet.form) ro.observe(sheet.form);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('resize', measure); };
  }, [sheet]);

  /* 7) hide the orange-circled controls while chatting (header attribute + CSS) */
  useEffect(() => {
    if (!sheet) return;
    sheet.header.setAttribute('data-sfc', mode === 'chat' ? 'chat' : 'ai');
    sheet.avatarWrap.setAttribute('data-sfc-av', '1');
    const ta = sheet.inner.querySelector('textarea') as HTMLTextAreaElement | null;
    if (ta) ta.setAttribute('placeholder', mode === 'chat' ? 'اكتب رسالة…' : 'Ask anything');
    return () => { sheet.header.removeAttribute('data-sfc'); };
  }, [sheet, mode]);

  /* 5b) presence (last seen / typing): fast poll for the open chat, slow poll for the list rectangles */
  useEffect(() => {
    if (mode !== 'chat' || !me || !sheet) return;
    let alive = true;
    const tick = async () => {
      const p = peerRef.current;
      const ids = p
        ? [p.id]
        : Array.from(new Set([
            ...recentsRef.current.map(r => r.id),
            ...(friendsRef.current || []).filter(f => (unreadRef.current[f.id] || 0) > 0).map(f => f.id),
          ]));
      const res = await Promise.all(ids.map(id =>
        adapter().presence(me, id).then((x): [string, Presence] => [id, x || {}]).catch((): [string, Presence] => [id, {}])));
      if (alive) setPresence(prev => { const n = { ...prev }; res.forEach(([id, x]) => { n[id] = x; }); return n; });
    };
    void tick();
    const t = window.setInterval(tick, peer ? 1500 : 15000);
    return () => { alive = false; window.clearInterval(t); };
  }, [mode, peer?.id, me?.id, sheet, recents.length]); // eslint-disable-line react-hooks/exhaustive-deps

  /* 5c) reactions of the open chat (kept on this device) */
  useEffect(() => {
    setPicker(null);
    if (!me || !peer) { setReactions({}); return; }
    try {
      const v = JSON.parse(localStorage.getItem(reactKey(me.id, peer.id)) || '{}');
      setReactions(v && typeof v === 'object' ? v : {});
    } catch { setReactions({}); }
  }, [me?.id, peer?.id, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── sending ── */
  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast(''), 2500); };

  const sendText = useCallback(async (raw: string, retryId?: string) => {
    const p = peerRef.current; const t = raw.trim();
    if (!me || !p || !t) return;
    const cid = retryId || `c_${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const msg: ChatMsg = { id: cid, clientId: cid, from: me.id, to: p.id, text: t, ts: Date.now(), status: 'sending' };
    setChat(c => ({ peerId: p.id, list: merge(c.peerId === p.id ? c.list : [], [msg]) }));
    if (!retryId) playSendSound(); // SEND-SOUND
    try {
      const r = await adapter().send(me, p.id, t, cid);
      setChat(c => ({ ...c, list: c.list.map(x => (x.clientId === cid ? { ...x, ...(r || {}), clientId: cid, status: 'sent' as const } : x)) }));
    } catch {
      setChat(c => ({ ...c, list: c.list.map(x => (x.clientId === cid ? { ...x, status: 'failed' as const } : x)) }));
    }
  }, [me]);
  const sendRef = useRef(sendText); sendRef.current = sendText;

  /* GROUP-CHAT ─ removed / left / group deleted => clean it from the list and go back */
  const dropGroup = (id: string, msg = 'لم تعد عضواً في هذا القروب') => {
    const m = meRef.current;
    setRecents(prev => { const next = prev.filter(r => r.id !== id); if (m) saveRecents(m.id, next); return next; });
    if (peerRef.current?.id === id) { setPeer(null); setListOpen(false); }
    setGroupInfo(null); setInviteOpen(false); flash(msg);
  };
  /* GROUP-CHAT ─ live members of the open group (also detects "you were removed") */
  useEffect(() => {
    if (mode !== 'chat' || !peer || !isGroupId(peer.id) || !me) { setGroupInfo(null); return; }
    let alive = true;
    const pull = async () => {
      try {
        const d = await gapi<GroupInfo>(`/${gid(peer.id)}`);
        if (!alive) return;
        setGroupInfo(d);
        setPeer(p => (p && p.id === peer.id && p.name !== d.name ? { ...p, name: d.name } : p));
      } catch (e: any) { if (alive && e?.message === GROUP_GONE) dropGroup(peer.id); }
    };
    void pull();
    const t = window.setInterval(pull, 4000);
    return () => { alive = false; window.clearInterval(t); };
  }, [mode, peer?.id, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  /* GROUP-CHAT ─ groups you were added to appear in the chat list; groups you were removed from disappear */
  useEffect(() => {
    if (mode !== 'chat' || !me) return;
    let alive = true;
    const sync = async () => {
      try {
        const d = await gapi<{ groups: GroupInfo[] }>('/list');
        if (!alive) return;
        const mine = new Map((d.groups || []).map(g => [`g:${g.id}`, g] as [string, GroupInfo]));
        setRecents(prev => {
          const kept = prev.filter(r => !isGroupId(r.id) || mine.has(r.id));
          const have = new Set(kept.map(r => r.id));
          const added: Recent[] = [];
          mine.forEach((g, k) => { if (!have.has(k)) added.push({ id: k, name: g.name, avatar: null, ts: Date.now() }); });
          if (!added.length && kept.length === prev.length) return prev;
          const next = [...added, ...kept]; saveRecents(me.id, next); return next;
        });
      } catch { /* */ }
    };
    void sync();
    const t = window.setInterval(sync, 7000);
    return () => { alive = false; window.clearInterval(t); };
  }, [mode, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setInviteOpen(false); setInviteSel([]); }, [peer?.id, mode]);

  /* FRIEND-CHAT-MEDIA ─ location: same encoding as the Saved Messages chat, travels as the message text */
  const sendPickedLocation = (lat: number, lng: number, label: string) => {
    setLocPickerOpen(false);
    void sendRef.current(encodeSavedLocation(lat, lng, label || `${lat.toFixed(5)}, ${lng.toFixed(5)}`));
  };

  /* FRIEND-CHAT-MEDIA ─ keep the app alive while the system file picker is open (same idea as stooornaHoldForFilePicker) */
  const holdFilePicker = () => {
    try {
      const w: any = window;
      const extend = (ms: number) => { const u = Date.now() + ms; if (!w.__stooornaMediaHoldUntil || w.__stooornaMediaHoldUntil < u) w.__stooornaMediaHoldUntil = u; };
      extend(60000);
      document.body.dataset.stooornaFilePicking = '1';
      let left = false; let done = false;
      const onLeave = () => { left = true; };
      const release = () => {
        if (done) return; done = true;
        window.removeEventListener('blur', onLeave); window.removeEventListener('focus', onBack); document.removeEventListener('visibilitychange', onVis);
        extend(8000);
        window.setTimeout(() => { delete document.body.dataset.stooornaFilePicking; }, 8000);
      };
      const onBack = () => { if (left) release(); };
      const onVis = () => { if (document.visibilityState === 'hidden') onLeave(); else onBack(); };
      window.addEventListener('blur', onLeave); window.addEventListener('focus', onBack); document.addEventListener('visibilitychange', onVis);
      window.setTimeout(release, 10 * 60 * 1000);
    } catch { /* */ }
  };

  /* FRIEND-CHAT-MEDIA ─ photo upload: the same storage routes the live / saved chat uses (never stories) */
  const uploadPhoto = async (file: File): Promise<string | null> => {
    const uid = String(me?.id || '');
    const pick = (d: any): string | null => {
      for (const u of [d?.url, d?.mediaUrl, d?.fileUrl, d?.path, d?.publicUrl, d?.src, d?.data?.url, d?.data?.mediaUrl, d?.result?.url, d?.file?.url, d?.media?.url]) {
        if (typeof u === 'string' && u.trim().length > 2 && !/^(blob:|data:)/i.test(u.trim())) return u.trim();
      }
      return null;
    };
    const eps = ['/api/chat-images', '/api/live-chat/media', '/api/live-chat/upload', '/api/live-chat/image', '/api/upload', '/api/media', '/api/files/upload', '/api/posts/media'];
    for (const ep of eps) {
      try {
        const fd = new FormData();
        fd.append('file', file, file.name || `friend-chat-image-${Date.now()}.jpg`);
        fd.append('userId', uid);
        ['kind', 'type', 'mediaType'].forEach(k => fd.append(k, 'image'));
        fd.append('destination', 'live-chat'); fd.append('scope', 'live-chat'); fd.append('channel', 'live-chat');
        fd.append('noStory', '1'); fd.append('createStory', 'false'); fd.append('story', '0'); fd.append('skipStory', '1');
        const ctrl = new AbortController(); const tm = window.setTimeout(() => ctrl.abort(), 30000);
        const r = await fetch(ep, { method: 'POST', credentials: 'include', body: fd, signal: ctrl.signal });
        window.clearTimeout(tm);
        if (!r.ok) continue;
        const loc = r.headers.get('location');
        if (loc && /^(https?:\/\/|\/)/i.test(loc)) return loc;
        const d = await r.json().catch(() => null);
        const u = d ? pick(d) : null;
        if (u) return u;
      } catch { /* next endpoint */ }
    }
    return null;
  };

  const onPickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const target = peerRef.current;
    if (!file || !target) return;
    if (!/^image\//i.test(file.type || 'image/jpeg')) { flash('اختر صورة فقط'); return; }
    setMarkup({ file, target }); // IMAGE-MARKUP: علّم على الصورة ثم أرسل (بدون علامات = الأصلية)
  };
  const sendPhotoFile = async (file: File, target: Friend) => {
    setBusy(true); flash('جاري المعاينة…');
    try {
      const prep = await prepareSavedMediaWithin(file, 'image', async (f: File) => await uploadPhoto(f), 40000);
      if (prep.timedOut) { flash('انتهت المهلة (40 ثانية)، حاول مرة ثانية'); return; }
      if (!prep.url || String(prep.url).startsWith('blob:')) { flash('تعذر رفع الصورة، حاول مرة ثانية'); return; }
      if (peerRef.current?.id !== target.id) { flash('تم تغيير المحادثة، لم تُرسل الصورة'); return; }
      await sendRef.current(encodeSavedMediaLink(String(prep.url), 'image'));
    } catch { flash('تعذر إرسال الصورة'); }
    finally { setBusy(false); }
  };

  /* navigation: avatar -> chat page ; back arrow (same spot) -> Stooorna Ai page */
  const enterChat = () => {
    autoPick.current = Object.keys(unreadRef.current).length > 0;
    setPeer(null); setListOpen(false); setMode('chat');
  };
  const backToAi = () => { setMode('ai'); setPeer(null); setListOpen(false); autoPick.current = false; };
  /* back arrow: select mode -> normal list ; open chat -> chat list ; list -> Stooorna Ai page */
  const goBack = () => {
    if (selectModeRef.current) { setSelectMode(false); setSelected([]); return; }
    if (peerRef.current) { setPeer(null); setListOpen(false); return; }
    backToAi();
  };
  const navRef = useRef({ enterChat, backToAi, goBack }); navRef.current = { enterChat, backToAi, goBack };

  /* 8) capture handlers: avatar tap + keep Send/Voice/Attach away from the Ai while chatting */
  useEffect(() => {
    if (!sheet) return;
    const clearTextarea = (ta: HTMLTextAreaElement) => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      set?.call(ta, '');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const takeInput = () => {
      const ta = sheet.inner.querySelector('textarea') as HTMLTextAreaElement | null;
      if (!ta) return;
      const v = ta.value;
      if (!v.trim()) return;
      if (!peerRef.current) { flash('اختر صديقاً من الزر بالأعلى أولاً'); return; }
      if (editRef.current) { clearTextarea(ta); void commitEditRef.current(v); return; } // MSG-EDIT
      clearTextarea(ta); void sendRef.current(v);
    };
    const onClick = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (sheet.avatarWrap.contains(t)) {
        e.preventDefault(); e.stopPropagation();
        if (modeRef.current === 'chat') navRef.current.goBack(); else navRef.current.enterChat();
        return;
      }
      if (modeRef.current !== 'chat') return;
      const btn = t.closest('button') as HTMLElement | null;
      if (!btn || !sheet.inner.contains(btn)) return;
      const label = btn.getAttribute('aria-label');
      if (label === 'Attach' && Date.now() - lpDone.current < 700) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); return; } // SEND-SOUND: the click that ends a long-press does nothing
      if (label === 'Send') { e.preventDefault(); e.stopPropagation(); takeInput(); }
      else if (label === 'Attach') { // FRIEND-CHAT-MEDIA: "+" opens the Photo / Location menu
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        if (!peerRef.current) flash('النص فقط متاح في شات الأصدقاء حالياً'); else setPlusOpen(v => !v); // خارج الشات (قائمة المحادثات): الرسالة فقط — داخل الشات: قائمة الصور واللوكيشن
      }
      else if (label === 'Voice') { // FRIEND-VOICE-LIVE: داخل شات صديق = بث صوتي مباشر ؛ خارج الشات = النص فقط
        e.preventDefault(); e.stopPropagation();
        if (!peerRef.current) flash('النص فقط متاح في شات الأصدقاء حالياً'); else window.dispatchEvent(new CustomEvent(FRIEND_VOICE_TAP_EVENT));
      }
    };
    const onSubmit = (e: Event) => {
      if (modeRef.current !== 'chat') return;
      if (!(e.target as HTMLElement)?.closest?.('form') || !sheet.inner.contains(e.target as Node)) return;
      e.preventDefault(); e.stopPropagation(); takeInput();
    };
    const onKey = (e: KeyboardEvent) => {
      if (modeRef.current !== 'chat' || e.key !== 'Enter' || e.shiftKey || (e as any).isComposing) return;
      const t = e.target as HTMLElement | null;
      if (!t || t.tagName !== 'TEXTAREA' || !sheet.inner.contains(t)) return;
      e.preventDefault(); e.stopPropagation(); takeInput();
    };
    const onInput = (e: Event) => {
      const m = meRef.current; const pr = peerRef.current;
      if (modeRef.current !== 'chat' || !pr || !m || editRef.current) return;
      const t = e.target as HTMLTextAreaElement | null;
      if (!t || t.tagName !== 'TEXTAREA' || !sheet.inner.contains(t) || !t.value.trim()) return;
      const now = Date.now();
      if (now - typingSent.current < 2500) return;
      typingSent.current = now;
      void adapter().typing(m, pr.id);
    };
    /* SEND-SOUND: long-press (0.6s) on "+" inside a chat => mute / unmute the send sound; the button turns orange for 1s when muted */
    let lpTimer = 0; let lpBtn: HTMLElement | null = null; let lpXY = { x: 0, y: 0 };
    const attachBtn = (t: EventTarget | null): HTMLElement | null => {
      const b = (t as HTMLElement | null)?.closest?.('button') as HTMLElement | null;
      return b && sheet.inner.contains(b) && b.getAttribute('aria-label') === 'Attach' ? b : null;
    };
    const lpCancel = () => { if (lpTimer) { window.clearTimeout(lpTimer); lpTimer = 0; } };
    const onDown = (e: PointerEvent) => {
      if (modeRef.current !== 'chat' || !peerRef.current) return;
      const b = attachBtn(e.target); if (!b) return;
      lpCancel(); lpBtn = b; lpXY = { x: e.clientX, y: e.clientY };
      lpTimer = window.setTimeout(() => {
        lpTimer = 0; lpDone.current = Date.now();
        try { navigator.vibrate?.(20); } catch { /* */ }
        const nowMuted = !isSoundMuted();
        setSoundMuted(nowMuted);
        const el = lpBtn;
        if (el) {
          const prevBg = el.style.getPropertyValue('background'); const prevPri = el.style.getPropertyPriority('background');
          el.style.setProperty('background', nowMuted ? '#f97316' : '#22c55e', 'important');
          window.setTimeout(() => { if (prevBg) el.style.setProperty('background', prevBg, prevPri); else el.style.removeProperty('background'); }, 1000);
        }
        if (!nowMuted) playSendSound(true);
        flash(nowMuted ? 'تم إيقاف صوت الإرسال' : 'تم تشغيل صوت الإرسال');
      }, 600);
    };
    const onMove = (e: PointerEvent) => { if (lpTimer && Math.hypot(e.clientX - lpXY.x, e.clientY - lpXY.y) > 14) lpCancel(); };
    const onCtx = (e: Event) => { if (modeRef.current === 'chat' && attachBtn(e.target)) e.preventDefault(); };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', lpCancel, true);
    document.addEventListener('pointercancel', lpCancel, true);
    document.addEventListener('contextmenu', onCtx, true);
    document.addEventListener('input', onInput, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('submit', onSubmit, true);
    document.addEventListener('keydown', onKey, true);
    return () => { lpCancel(); document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('pointermove', onMove, true); document.removeEventListener('pointerup', lpCancel, true); document.removeEventListener('pointercancel', lpCancel, true); document.removeEventListener('contextmenu', onCtx, true); document.removeEventListener('input', onInput, true); document.removeEventListener('click', onClick, true); document.removeEventListener('submit', onSubmit, true); document.removeEventListener('keydown', onKey, true); };
  }, [sheet]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!sheet) return null;

  const openUnread = mode === 'chat' ? Object.fromEntries(Object.entries(unread).filter(([k]) => k !== peer?.id)) : unread;
  const totalUnread = Object.values(openUnread).reduce((a, b) => a + b, 0);
  const showIcon = mode === 'chat' || totalUnread > 0;
  const openPeer = (f: Friend) => {
    setPeer({ id: f.id, name: f.name, avatar: f.avatar ?? null }); setListOpen(false); setSelectMode(false); setSelected([]);
    if (me) {
      const next: Recent[] = [{ id: f.id, name: f.name, avatar: f.avatar ?? null, ts: Date.now() }, ...recents.filter(r => r.id !== f.id)];
      setRecents(next); saveRecents(me.id, next);
    }
  };
  /* GROUP-CHAT ─ invite / leave / kick */
  const myName = me?.name || me?.username || 'me';
  const myAvatar = me?.avatarUrl || me?.image || null;
  const isOwner = !!groupInfo && groupInfo.ownerId === me?.id;
  const inviteCandidates = (friends || []).filter(f => f.id !== me?.id && (isGroup ? !groupInfo?.members.some(m => m.id === f.id) : f.id !== peer?.id));
  const doInvite = async () => {
    if (!me || !peer || !inviteSel.length || inviteBusy) return;
    const chosen = inviteCandidates.filter(f => inviteSel.includes(f.id));
    if (!chosen.length) return;
    setInviteBusy(true);
    try {
      if (isGroup) {
        for (const f of chosen) await gapi(`/${gid(peer.id)}/invite`, { method: 'POST', body: JSON.stringify({ userId: f.id, name: f.name, avatar: f.avatar ?? null }) });
        const d = await gapi<GroupInfo>(`/${gid(peer.id)}`); setGroupInfo(d);
        flash('تمت الدعوة');
      } else {
        const ms = [peer, ...chosen];
        const d = await gapi<{ id: string; name: string }>('/create', { method: 'POST', body: JSON.stringify({
          name: [myName, ...ms.map(x => x.name)].join(', '), me: { name: myName, avatar: myAvatar },
          members: ms.map(x => ({ id: x.id, name: x.name, avatar: x.avatar ?? null })),
        }) });
        openPeer({ id: `g:${d.id}`, name: d.name, avatar: null });
      }
      setInviteOpen(false); setInviteSel([]);
    } catch (e: any) { flash(e?.message === GROUP_GONE ? 'لا تملك صلاحية الدعوة (أو لم تعد عضواً)' : 'تعذرت الدعوة — تأكد أنه من أصدقائك'); }
    finally { setInviteBusy(false); }
  };
  const leaveGroup = async () => {
    if (!peer || !isGroup) return;
    if (!window.confirm('Leave this group?')) return;
    try { await gapi(`/${gid(peer.id)}/leave`, { method: 'POST' }); dropGroup(peer.id, 'غادرت القروب'); }
    catch (e: any) { if (e?.message === GROUP_GONE) dropGroup(peer.id); else flash('تعذرت المغادرة'); }
  };
  const kickMember = async (m: GroupMember) => {
    if (!peer || !isGroup || !isOwner || m.id === me?.id) return;
    if (!window.confirm(`Remove ${m.name} from the group?`)) return;
    try {
      await gapi(`/${gid(peer.id)}/kick`, { method: 'POST', body: JSON.stringify({ userId: m.id }) });
      setGroupInfo(g => (g ? { ...g, members: g.members.filter(x => x.id !== m.id) } : g));
      flash(`تم طرد ${m.name}`);
    } catch { flash('تعذر الطرد'); }
  };
  /* REACTIONS: long-press (0.45s) on the friend's message -> emoji bubble in the middle -> pick -> sticks on the message */
  const reactionOf = (m: ChatMsg): string => (reactions[m.id] !== undefined ? reactions[m.id] : m.reaction || '');
  const clearPress = () => { if (pressTimer.current) { window.clearTimeout(pressTimer.current); pressTimer.current = 0; } };
  const openPicker = (id: string) => {
    if (Date.now() - pickerAt.current < 700) return; // already opened by the timer or the context-menu event
    pickerAt.current = Date.now();
    try { navigator.vibrate?.(15); } catch { /* */ }
    setPicker(id);
  };
  const pressProps = (id: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      clearPress();
      pressXY.current = { x: e.clientX, y: e.clientY, t: Date.now() };
      pressTimer.current = window.setTimeout(() => { pressTimer.current = 0; openPicker(id); }, 450);
    },
    // cancel only if the finger really moved (scrolling), not on tiny shakes
    onPointerMove: (e: React.PointerEvent) => {
      if (pressTimer.current && Math.hypot(e.clientX - pressXY.current.x, e.clientY - pressXY.current.y) > 12) clearPress();
    },
    onPointerUp: clearPress,
    // some Android browsers fire pointercancel when the long-press starts: ignore it unless it came very early (= scroll)
    onPointerCancel: () => { if (Date.now() - pressXY.current.t < 250) clearPress(); },
    // fallback: the native long-press (context menu) opens the same emoji bubble
    onContextMenu: (e: React.SyntheticEvent) => { e.preventDefault(); clearPress(); openPicker(id); },
  });
  /* MSG-EDIT / MSG-DELETE: long-press (0.45s) on MY message -> small menu (copy / edit / delete for both) */
  const openActions = (id: string) => {
    if (Date.now() - pickerAt.current < 700) return;
    pickerAt.current = Date.now();
    try { navigator.vibrate?.(15); } catch { /* */ }
    setActionMsg(id);
  };
  const pressPropsMine = (id: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      clearPress();
      pressXY.current = { x: e.clientX, y: e.clientY, t: Date.now() };
      pressTimer.current = window.setTimeout(() => { pressTimer.current = 0; openActions(id); }, 450);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (pressTimer.current && Math.hypot(e.clientX - pressXY.current.x, e.clientY - pressXY.current.y) > 12) clearPress();
    },
    onPointerUp: clearPress,
    onPointerCancel: () => { if (Date.now() - pressXY.current.t < 250) clearPress(); },
    onContextMenu: (e: React.SyntheticEvent) => { e.preventDefault(); clearPress(); openActions(id); },
  });
  const actionM = actionMsg ? chat.list.find(x => x.id === actionMsg) : undefined;
  const isPlainText = (m: ChatMsg) => !decodeSavedLocation(m.text) && !decodeSavedMediaLink(m.text) && !decodeTplPost(m.text);
  const startEdit = (m: ChatMsg) => {
    setActionMsg(null);
    const e = { id: m.id, text: m.text, edited: !!m.edited };
    editRef.current = e; setEditing(e);
    window.setTimeout(() => setComposer(m.text), 30);
  };
  const cancelEdit = () => { editRef.current = null; setEditing(null); setComposer(''); };
  const commitEdit = async (raw: string) => {
    const ed = editRef.current; const p = peerRef.current; const t = raw.trim();
    if (!ed || !me || !p) return;
    editRef.current = null; setEditing(null);
    if (!t || t === ed.text) return;
    setChat(c => ({ ...c, list: c.list.map(x => (x.id === ed.id ? { ...x, text: t, edited: true } : x)) }));
    try { await adapter().edit(me, p.id, ed.id, t); }
    catch {
      setChat(c => ({ ...c, list: c.list.map(x => (x.id === ed.id ? { ...x, text: ed.text, edited: ed.edited } : x)) }));
      flash('تعذر تعديل الرسالة');
    }
  };
  commitEditRef.current = commitEdit;
  const deleteMsg = async (m: ChatMsg) => {
    const p = peerRef.current; setActionMsg(null);
    if (!me || !p || m.status === 'sending') return;
    if (!window.confirm('حذف الرسالة عند الطرفين؟')) return;
    if (editRef.current?.id === m.id) cancelEdit();
    shatterById(m.id, sheetRef.current?.inner); // SHATTER-DELETE
    const onServer = m.id.startsWith('db-');
    if (onServer) deletedRef.current.add(m.id);
    setChat(c => ({ ...c, list: c.list.filter(x => x.id !== m.id) }));
    if (!onServer) return; // رسالة فاشلة لم تصل: تُحذف محلياً فقط
    try { await adapter().remove(me, p.id, m.id); }
    catch {
      deletedRef.current.delete(m.id);
      setChat(c => ({ ...c, list: merge(c.list, [m]) }));
      flash('تعذر حذف الرسالة');
    }
  };
  const pickerMsg = picker ? chat.list.find(x => x.id === picker) : undefined;
  const pickReaction = (emoji: string) => {
    const id = picker;
    if (!id || !me || !peer) return;
    const same = !!pickerMsg && reactionOf(pickerMsg) === emoji;
    const next = { ...reactions, [id]: same ? '' : emoji };
    setReactions(next);
    try { localStorage.setItem(reactKey(me.id, peer.id), JSON.stringify(next)); } catch { /* */ }
    setPicker(null);
    void adapter().react(me, peer.id, id, same ? '' : emoji);
  };
  const toggleSel = (id: string) => setSelected(a => (a.includes(id) ? a.filter(x => x !== id) : [...a, id]));
  const listRows = (() => {
    if (!me) return [] as Array<Recent & { last: ChatMsg | null }>;
    const map = new Map<string, Recent>();
    recents.forEach(r => map.set(r.id, r));
    (friends || []).forEach(f => { if ((unread[f.id] || 0) > 0 && !map.has(f.id)) map.set(f.id, { ...f, ts: Date.now() }); });
    return [...map.values()].map(r => {
      const cleared = getClearedAt(me.id, r.id);
      const msgs = loadCache(me.id, r.id).filter(m => m.ts > cleared);
      let last: ChatMsg | null = msgs.length ? msgs[msgs.length - 1] : null;
      const pv = (unread[r.id] || 0) > 0 ? readPreview(me.id, r.id) : null; // PUSH-TAP: unread text shows without opening the chat
      if (pv && (!last || pv.ts > last.ts)) last = { id: `pv_${pv.ts}`, from: r.id, text: pv.text, ts: pv.ts, status: 'sent' };
      return { ...r, last, ts: last ? last.ts : r.ts };
    }).sort((a, b) => b.ts - a.ts);
  })();
  /** delete whole conversations from your side (no server change): hides everything up to now, removes the rectangle */
  const deleteChats = async (ids: string[]) => {
    if (!me || !ids.length) return;
    if (!window.confirm(ids.some(isGroupId)
      ? `Delete ${ids.length > 1 ? ids.length + ' chats' : 'this chat'}? Groups will be left, other chats are cleared from your side only.`
      : `Delete ${ids.length > 1 ? ids.length + ' chats' : 'this chat'}? It will be cleared from your side only.`)) return;
    for (const id of ids) {
      if (isGroupId(id)) { // GROUP-CHAT: deleting a group from the list = leaving it
        try { await gapi(`/${gid(id)}/leave`, { method: 'POST' }); } catch { /* already gone */ }
        try { localStorage.removeItem(cacheKey(me.id, id)); } catch { /* */ }
        continue;
      }
      let latest = Date.now();
      try { const msgs = await adapter().fetchMessages(me, id); msgs.forEach(m => { if (m.ts > latest) latest = m.ts; }); } catch { /* */ } // opening = marks incoming as read
      try { localStorage.setItem(clearKey(me.id, id), String(latest)); localStorage.removeItem(cacheKey(me.id, id)); } catch { /* */ }
    }
    setRecents(prev => { const next = prev.filter(r => !ids.includes(r.id)); saveRecents(me.id, next); return next; });
    setUnread(u => { const n = { ...u }; ids.forEach(id => { delete n[id]; }); return n; });
    setSelected([]); setSelectMode(false);
  };
  const myId = me?.id || '';
  const sorted = [...(friends || [])].sort((a, b) => (unread[b.id] || 0) - (unread[a.id] || 0));

  return (
    <>
      <style>{`
        [data-sfc="chat"] > :not(:first-child) { visibility: hidden !important; pointer-events: none !important; }
        [data-sfc="chat"] > [data-sfc-portal] { visibility: visible !important; pointer-events: auto !important; }
        [data-sfc-av] { cursor: pointer; -webkit-tap-highlight-color: transparent; }
        @keyframes sfcPulse { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }
        @keyframes sfcPop { from { opacity: 0; transform: translateY(-6px) scale(0.98); } to { opacity: 1; transform: none; } }
      `}</style>

      {/* avatar circle: back arrow while on the chat page / chat icon when a new message arrived */}
      {showIcon && createPortal(
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', inset: 0, borderRadius: '50%', background: DARK_GREEN, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2,
          }}
        >
          {mode === 'chat' ? <ArrowLeft size={21} strokeWidth={2.4} /> : <MessageCircle size={19} strokeWidth={2.3} />}
          {totalUnread > 0 && (
            <span style={{
              position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
              background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 800, border: '2px solid #fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
            }}>{totalUnread > 99 ? '99+' : totalUnread}</span>
          )}
        </div>,
        sheet.avatarWrap,
      )}

      {/* top-right button (where the History button was): select chats -> delete whole conversations from outside */}
      {mode === 'chat' && !peer && createPortal(
        <div
          data-sfc-portal="1"
          style={{ position: 'absolute', right: 12, top: 0, bottom: 0, display: 'flex', alignItems: 'center', gap: 8, zIndex: 7, pointerEvents: 'none' }}
        >
          {selectMode ? (
            <>
              <button
                type="button" disabled={selected.length === 0} onClick={() => void deleteChats(selected)}
                style={{ pointerEvents: 'auto', border: 'none', cursor: selected.length ? 'pointer' : 'default', background: selected.length ? '#ef4444' : '#d1d5db', color: '#fff', borderRadius: 999, padding: '9px 16px', fontWeight: 800, fontSize: 14 }}
              >{selected.length ? `Delete (${selected.length})` : 'Delete'}</button>
              <button
                type="button" aria-label="Cancel selection" onClick={() => { setSelectMode(false); setSelected([]); }}
                style={{ pointerEvents: 'auto', width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: 'pointer', background: '#0a0a0a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              ><X size={18} /></button>
            </>
          ) : listRows.length > 0 && (
            <button
              type="button" aria-label="Select chats" onClick={() => setSelectMode(true)}
              style={{ pointerEvents: 'auto', width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: 'pointer', background: '#0a0a0a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.25)' }}
            ><ListChecks size={19} /></button>
          )}
        </div>,
        sheet.header,
      )}

      {/* the button in the header (same place as the Stooorna Ai badge): "choose a friend" -> becomes the friend's name */}
      {mode === 'chat' && !selectMode && createPortal(
        <div
          data-sfc-portal="1"
          style={{
            position: 'absolute', left: pillLeft, right: peer ? 62 : 12, top: 0, bottom: 0, display: 'flex', alignItems: 'center',
            zIndex: 6, pointerEvents: 'none',
          }}
        >
          <button
            type="button"
            onClick={() => setListOpen(v => !v)}
            style={{
              pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 8, maxWidth: '100%', border: 'none', cursor: 'pointer',
              background: '#0a0a0a', color: '#fff', borderRadius: 999, padding: peer ? '7px 14px 7px 8px' : '12px 18px',
              fontWeight: 800, fontSize: 15, boxShadow: '0 4px 12px rgba(0,0,0,0.25)', WebkitTapHighlightColor: 'transparent',
            }}
          >
            {peer && (peer.avatar
              ? <img src={peer.avatar} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              : <span style={{ width: 30, height: 30, borderRadius: '50%', background: '#e5e7eb', color: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{(peer.name[0] || '?').toUpperCase()}</span>)}
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{peer ? peer.name : 'اختر صديقاً'}</span>
            <ChevronDown size={16} style={{ flexShrink: 0, opacity: 0.8 }} />
          </button>
        </div>,
        sheet.header,
      )}

      {/* GROUP-CHAT: "+" (where the red dot was) -> invite friends into this chat (turns it into a group) */}
      {mode === 'chat' && peer && !selectMode && createPortal(
        <div data-sfc-portal="1" style={{ position: 'absolute', right: 12, top: 0, bottom: 0, display: 'flex', alignItems: 'center', zIndex: 9, pointerEvents: 'none' }}>
          <button
            type="button" aria-label="Invite friends" onClick={() => { setInviteSel([]); setInviteOpen(true); }}
            style={{ pointerEvents: 'auto', width: 42, height: 42, borderRadius: '50%', border: 'none', cursor: 'pointer', background: DARK_GREEN, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.25)', padding: 0, WebkitTapHighlightColor: 'transparent' }}
          ><Plus size={22} strokeWidth={2.6} /></button>
        </div>,
        sheet.header,
      )}

      {/* GROUP-CHAT: members strip (tap a member = owner removes him) + Leave */}
      {mode === 'chat' && peer && isGroup && groupInfo && createPortal(
        <div style={{ position: 'absolute', left: 0, right: 0, top: rect.top, height: 66, zIndex: 11, background: '#fff', borderBottom: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 12, overflowX: 'auto', alignItems: 'center', scrollbarWidth: 'none' }}>
            {groupInfo.members.map(m => {
              const canKick = isOwner && m.id !== me?.id;
              return (
                <button
                  key={m.id} type="button" title={m.name}
                  onClick={() => (canKick ? void kickMember(m) : flash(m.id === groupInfo.ownerId ? `${m.name} — صاحب القروب` : m.name))}
                  style={{ flexShrink: 0, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: 52, WebkitTapHighlightColor: 'transparent' }}
                >
                  <span style={{ position: 'relative', display: 'block' }}>
                    {m.avatar
                      ? <img src={m.avatar} alt="" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', display: 'block', border: m.id === groupInfo.ownerId ? '2px solid #f59e0b' : '2px solid transparent' }} />
                      : <span style={{ width: 38, height: 38, borderRadius: '50%', background: DARK_GREEN, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, border: m.id === groupInfo.ownerId ? '2px solid #f59e0b' : '2px solid transparent', boxSizing: 'border-box' }}>{(m.name[0] || '?').toUpperCase()}</span>}
                    {canKick && <span style={{ position: 'absolute', top: -3, right: -3, width: 15, height: 15, borderRadius: '50%', background: '#ef4444', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={10} strokeWidth={3} /></span>}
                  </span>
                  <span style={{ fontSize: 10.5, color: '#4b5563', maxWidth: 52, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.id === me?.id ? 'You' : m.name}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button" onClick={() => void leaveGroup()}
            style={{ flexShrink: 0, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', borderRadius: 999, padding: '8px 14px', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
          >Leave</button>
        </div>,
        sheet.inner,
      )}

      {/* GROUP-CHAT: invite sheet */}
      {mode === 'chat' && peer && inviteOpen && createPortal(
        <>
          <div role="presentation" onClick={() => setInviteOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: 49, background: 'rgba(0,0,0,0.3)' }} />
          <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', left: 10, right: 10, bottom: rect.bottom + 8, zIndex: 50, maxHeight: '62%', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 20, boxShadow: '0 12px 36px rgba(0,0,0,0.3)', padding: 10, animation: 'sfcPop 0.18s ease-out' }}>
            <p style={{ margin: '4px 8px 8px', fontWeight: 800, fontSize: 15, color: '#222' }}>{isGroup ? 'ادعُ أصدقاء للقروب' : 'ادعُ أصدقاء — يتحول الشات إلى قروب'}</p>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {friends === null && <p style={emptyStyle}>…</p>}
              {friends !== null && inviteCandidates.length === 0 && <p style={emptyStyle}>لا يوجد أصدقاء آخرون لدعوتهم</p>}
              {inviteCandidates.map(f => {
                const on = inviteSel.includes(f.id);
                return (
                  <button key={f.id} type="button" onClick={() => setInviteSel(a => (a.includes(f.id) ? a.filter(x => x !== f.id) : [...a, f.id]))} style={{ ...rowStyle, background: on ? 'rgba(10,31,26,0.07)' : 'transparent' }}>
                    {f.avatar
                      ? <img src={f.avatar} alt="" style={{ ...circle, objectFit: 'cover' }} />
                      : <span style={{ ...circle, background: DARK_GREEN, color: '#fff' }}>{(f.name[0] || '?').toUpperCase()}</span>}
                    <span style={nameStyle}>{f.name}</span>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${DARK_GREEN}`, background: on ? DARK_GREEN : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {on && <Check size={14} color="#fff" strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button" disabled={!inviteSel.length || inviteBusy} onClick={() => void doInvite()}
              style={{ marginTop: 8, border: 'none', borderRadius: 999, padding: '12px 16px', fontWeight: 800, fontSize: 15, color: '#fff', background: inviteSel.length ? DARK_GREEN : '#d1d5db', cursor: inviteSel.length && !inviteBusy ? 'pointer' : 'default', opacity: inviteBusy ? 0.7 : 1 }}
            >{inviteBusy ? '…' : inviteSel.length ? `Invite (${inviteSel.length})` : 'Invite'}</button>
          </div>
        </>,
        sheet.inner,
      )}

      {/* PRESENCE [v2]: last seen / "Type..." chip at the TOP of the chat, right under the header */}
      {mode === 'chat' && peer && !isGroup && (presence[peer.id]?.typing || seenText(presence[peer.id])) && createPortal(
        <div style={{ position: 'absolute', left: 0, right: 0, top: rect.top + 6, zIndex: 12, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.97)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 999, padding: '4px 12px',
            fontSize: 12.5, lineHeight: '16px', fontWeight: 700, color: presence[peer.id]?.typing ? '#16a34a' : '#6b7280', boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            animation: presence[peer.id]?.typing ? 'sfcPulse 1.2s ease-in-out infinite' : undefined,
          }}>
            {(presence[peer.id]?.online || presence[peer.id]?.typing) && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e' }} />}
            <span>{presence[peer.id]?.typing ? 'Type...' : seenText(presence[peer.id])}</span>
          </div>
        </div>,
        sheet.inner,
      )}

      {/* PRESENCE: "Type..." above the input box (orange line) while the friend is typing */}
      {mode === 'chat' && peer && presence[peer.id]?.typing && createPortal(
        <div style={{ position: 'absolute', left: 18, bottom: rect.bottom + 6, zIndex: 11, pointerEvents: 'none', fontSize: 13, fontWeight: 700, color: '#16a34a', animation: 'sfcPulse 1.2s ease-in-out infinite' }}>
          Type...
        </div>,
        sheet.inner,
      )}

      {/* chat page (replaces the Ai messages area, keeps the same input bar) */}
      {mode === 'chat' && createPortal(
        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: rect.top + (peer && isGroup ? 66 : 0), bottom: rect.bottom, zIndex: 10,
            background: '#fff', display: 'flex', flexDirection: 'column', overflowY: 'auto',
            padding: peer && !isGroup && (presence[peer.id]?.typing || seenText(presence[peer.id])) ? '44px 14px 16px' : '16px 14px', gap: 8,
          }}
        >
          {!peer && listRows.length === 0 && (
            <div style={{ margin: 'auto', textAlign: 'center', color: '#6b7280', fontSize: 15, padding: '0 24px' }}>
              اضغط على الزر بالأعلى واختر الصديق الذي تريد مراسلته
            </div>
          )}
          {!peer && listRows.map(r => {
            const sel = selected.includes(r.id);
            const un = unread[r.id] || 0;
            return (
              <div
                key={r.id} role="button"
                onClick={() => (selectMode ? toggleSel(r.id) : openPeer(r))}
                style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 16, cursor: 'pointer',
                  border: `1px solid ${sel ? DARK_GREEN : 'rgba(0,0,0,0.14)'}`, background: sel ? 'rgba(10,31,26,0.07)' : '#fff',
                }}
              >
                {selectMode && (
                  <span style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${DARK_GREEN}`, background: sel ? DARK_GREEN : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {sel && <Check size={14} color="#fff" strokeWidth={3} />}
                  </span>
                )}
                {r.avatar
                  ? <img src={r.avatar} alt="" style={{ ...circle, objectFit: 'cover' }} />
                  : <span style={{ ...circle, background: DARK_GREEN, color: '#fff' }}>{(r.name[0] || '?').toUpperCase()}</span>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                  <div dir="auto" style={{ fontSize: 13, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                    {r.last ? `${r.last.from === myId ? 'You: ' : ''}${previewOf(r.last.text)}` : 'Tap to chat'}
                  </div>
                  {seenText(presence[r.id]) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                      {presence[r.id]?.online && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{seenText(presence[r.id])}</span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  {r.last && <span style={{ fontSize: 11, color: '#9ca3af' }}>{hhmm(r.last.ts)}</span>}
                  {un > 0 && (
                    <span style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 10, background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>{un}</span>
                  )}
                </div>
              </div>
            );
          })}
          {peer && chat.peerId === peer.id && chat.list.length === 0 && (
            <div style={{ margin: 'auto', textAlign: 'center', color: '#6b7280', fontSize: 15 }}>
              ابدأ المحادثة مع <b style={{ color: '#111' }}>{peer.name}</b>
            </div>
          )}
          {peer && (chat.peerId === peer.id ? chat.list : []).map((m, i, arr) => {
            const daySep = (i === 0 || dayKey(arr[i - 1].ts) !== dayKey(m.ts)) ? <div style={DAY_CHIP}>{dayLabel(m.ts)}</div> : null; // DAY-SEPARATORS
            const node = (() => {
            if (m.kind === 'system') { // GROUP-CHAT: "X joined / left / was removed"
              return <div key={m.clientId || m.id} dir="auto" style={{ alignSelf: 'center', background: 'rgba(0,0,0,0.06)', color: '#6b7280', fontSize: 12, padding: '4px 12px', borderRadius: 999, textAlign: 'center', maxWidth: '90%' }}>{m.text}</div>;
            }
            const mine = m.from === myId;
            const loc = decodeSavedLocation(m.text); // FRIEND-CHAT-MEDIA
            const med = loc ? null : decodeSavedMediaLink(m.text); // FRIEND-CHAT-MEDIA
            const tp = loc || med ? null : decodeTplPost(m.text); // TPL-POST-TO-CHAT
            const media = !!loc || !!med || !!tp;
            return (
              <div key={m.clientId || m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%', display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                {isGroup && !mine && m.fromName && <span dir="auto" style={{ fontSize: 11.5, fontWeight: 700, color: '#0f766e', margin: '0 6px 2px' }}>{m.fromName}</span>}
                <div style={{ position: 'relative', maxWidth: '100%', marginBottom: reactionOf(m) ? 12 : 0 }}>
                <div
                  dir="auto"
                  {...(mine ? pressPropsMine(m.id) : pressProps(m.id))}
                  data-sfc-bubble={m.id}
                  onClick={() => { if (m.status === 'failed') void sendRef.current(m.text, m.clientId); }}
                  style={{
                    background: mine ? DARK_GREEN : '#f1f1ef', color: mine ? '#fff' : '#111',
                    padding: media ? 4 : '9px 13px', overflow: media ? 'hidden' : undefined, minWidth: loc ? 230 : undefined, borderRadius: 18, borderBottomRightRadius: mine ? 6 : 18, borderBottomLeftRadius: mine ? 18 : 6,
                    fontSize: 15, lineHeight: '21px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    opacity: m.status === 'sending' ? 0.7 : 1, cursor: m.status === 'failed' ? 'pointer' : 'default',
                    ...({ userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'manipulation' } as React.CSSProperties),
                  }}
                >{loc ? (
                  <LocationChatCard
                    lat={loc.lat} lng={loc.lng}
                    time={hhmm(m.ts)}
                    onOpen={() => setLocView({ lat: loc.lat, lng: loc.lng, label: /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(String(loc.label || '').trim()) ? '' : String(loc.label || ''), name: mine ? (me?.username || me?.name) : peer.name, avatar: mine ? (me?.avatarUrl || me?.image) : peer.avatar })}
                  />
                ) : tp ? (
                  <TplPostTile tp={tp} time={hhmm(m.ts)} onOpen={() => openTplPost(tp, mine ? (me?.username || me?.name) : peer.name)} />
                ) : med && med.kind !== 'video' ? (
                  <img
                    src={med.url} alt="" draggable={false}
                    onClick={e => { e.stopPropagation(); setImgView(med.url); }}
                    style={{ display: 'block', width: '100%', maxWidth: 240, maxHeight: 280, objectFit: 'cover', borderRadius: 14, cursor: 'pointer' }}
                  />
                ) : med ? (
                  <video src={med.url} controls playsInline preload="metadata" style={{ display: 'block', width: '100%', maxWidth: 240, maxHeight: 280, borderRadius: 14, background: '#000' }} />
                ) : m.text}</div>
                {reactionOf(m) && (
                  <span style={{
                    position: 'absolute', bottom: -12, ...(mine ? { left: 6 } : { right: 6 }), background: '#fff', border: '1px solid rgba(0,0,0,0.1)',
                    borderRadius: 999, padding: '1px 6px', fontSize: 15, lineHeight: '20px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                  }}>{reactionOf(m)}</span>
                )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, fontSize: 11, color: m.status === 'failed' ? '#ef4444' : '#9ca3af' }}>
                  <span>{hhmm(m.ts)}</span>
                  {m.edited && <span>· معدّلة</span>}
                  {mine && (m.status === 'failed'
                    ? <><AlertCircle size={13} /><span>فشل — اضغط للإعادة</span></>
                    : m.status === 'sending' ? <span>…</span>
                    : m.read ? <CheckCheck size={14} color="#22c55e" /> : <Check size={14} />)}
                </div>
              </div>
            );
            })();
            return <React.Fragment key={m.clientId || m.id}>{daySep}{node}</React.Fragment>;
          })}
          <div ref={endRef} />
          {toast && (
            <div style={{ position: 'sticky', bottom: 0, alignSelf: 'center', background: 'rgba(0,0,0,0.78)', color: '#fff', padding: '7px 14px', borderRadius: 999, fontSize: 12.5 }}>{toast}</div>
          )}
        </div>,
        sheet.inner,
      )}

      {/* REACTIONS: emoji bubble in the middle of the page */}
      {mode === 'chat' && peer && picker && createPortal(
        <div
          role="presentation"
          onClick={() => { if (Date.now() - pickerAt.current > 350) setPicker(null); }}
          style={{ position: 'absolute', inset: 0, zIndex: 46, background: 'rgba(0,0,0,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'sfcPop 0.15s ease-out' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 28, padding: '14px 12px', boxShadow: '0 12px 36px rgba(0,0,0,0.3)', display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, width: 'min(320px, calc(100% - 40px))' }}
          >
            {REACTIONS.map(em => (
              <button
                key={em} type="button" onClick={() => pickReaction(em)}
                style={{ border: 'none', background: pickerMsg && reactionOf(pickerMsg) === em ? 'rgba(0,0,0,0.09)' : 'transparent', borderRadius: 14, fontSize: 28, height: 46, lineHeight: '46px', padding: 0, cursor: 'pointer' }}
              >{em}</button>
            ))}
          </div>
        </div>,
        sheet.inner,
      )}

      {/* friends picker (opens under the header button) */}
      {mode === 'chat' && listOpen && createPortal(
        <>
          <div role="presentation" onClick={() => setListOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: 44, background: 'rgba(0,0,0,0.25)' }} />
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', top: rect.top - 4, left: 10, zIndex: 45, width: 'min(300px, calc(100% - 20px))', maxHeight: '60%', overflowY: 'auto',
              background: '#fff', borderRadius: 16, border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 10px 28px rgba(0,0,0,0.22)',
              padding: 8, animation: 'sfcPop 0.18s ease-out',
            }}
          >
            <p style={{ margin: '4px 8px 8px', fontWeight: 800, fontSize: 14, color: '#222' }}>الأصدقاء</p>

            {friends === null && <p style={emptyStyle}>…</p>}
            {friends !== null && friends.length === 0 && <p style={emptyStyle}>ما عندك أصدقاء مضافين</p>}

            {sorted.map(f => (
              <button key={f.id} type="button" onClick={() => openPeer(f)} style={{ ...rowStyle, background: peer?.id === f.id ? 'rgba(0,0,0,0.06)' : 'transparent' }}>
                {f.avatar
                  ? <img src={f.avatar} alt="" style={{ ...circle, objectFit: 'cover' }} />
                  : <span style={{ ...circle, background: DARK_GREEN, color: '#fff' }}>{(f.name[0] || '?').toUpperCase()}</span>}
                <span style={nameStyle}>{f.name}</span>
                {(unread[f.id] || 0) > 0 && (
                  <span style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 10, background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>{unread[f.id]}</span>
                )}
              </button>
            ))}
          </div>
        </>,
        sheet.inner,
      )}

      {/* FRIEND-VOICE-LIVE: ذبذبات + بث صوتي على المايك الأحمر (داخل شات الصديق فقط) */}
      <FriendVoiceLive me={me} peer={peer} active={mode === 'chat' && !!peer} formEl={sheet.form} onFlash={flash} />

      {/* MSG-EDIT / MSG-DELETE: menu on long-press of my message */}
      {mode === 'chat' && peer && actionMsg && actionM && actionM.from === myId && createPortal(
        <div
          role="presentation"
          onClick={() => { if (Date.now() - pickerAt.current > 350) setActionMsg(null); }}
          style={{ position: 'absolute', inset: 0, zIndex: 46, background: 'rgba(0,0,0,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'sfcPop 0.15s ease-out' }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 22, padding: 8, minWidth: 220, boxShadow: '0 12px 36px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(() => {
              const plain = isPlainText(actionM);
              const onServer = actionM.id.startsWith('db-');
              const item: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, border: 'none', background: '#f7f7f8', color: '#111', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', textAlign: 'start', width: '100%' };
              return (
                <>
                  {plain && (
                    <button type="button" style={item} onClick={() => { try { void navigator.clipboard?.writeText(actionM.text); } catch { /* */ } setActionMsg(null); flash('تم النسخ'); }}>
                      <CopyIcon size={18} />نسخ
                    </button>
                  )}
                  {plain && onServer && !isGroup && actionM.status !== 'failed' && (
                    <button type="button" style={item} onClick={() => startEdit(actionM)}><EditIcon size={18} />تعديل</button>
                  )}
                  {!isGroup && actionM.status !== 'sending' && (
                    <button type="button" style={{ ...item, background: '#fef2f2', color: '#dc2626' }} onClick={() => void deleteMsg(actionM)}>
                      <TrashIcon size={18} />حذف عند الطرفين
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        </div>,
        sheet.inner,
      )}

      {/* MSG-EDIT: banner above the input bar while editing (the normal input box holds the text; Send saves it) */}
      {mode === 'chat' && peer && editing && createPortal(
        <div style={{ position: 'absolute', left: 12, right: 12, bottom: rect.bottom + 6, zIndex: 43, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 14, background: '#fff', border: '1px solid #e5e7eb', boxShadow: '0 8px 22px rgba(0,0,0,0.14)', animation: 'sfcPop 0.15s ease-out' }}>
          <EditIcon size={16} color="#0b3a82" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#0b3a82' }}>تعديل الرسالة</div>
            <div dir="auto" style={{ fontSize: 13, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editing.text}</div>
          </div>
          <button type="button" aria-label="Cancel edit" onClick={cancelEdit} style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: '#f3f4f6', color: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}><X size={16} /></button>
        </div>,
        sheet.inner,
      )}

      {/* IMAGE-MARKUP: mark things on the photo before sending it */}
      {markup && createPortal(
        <ModalLayer onEsc={() => setMarkup(null)}>
          <ImageMarkup
            file={markup.file}
            onCancel={() => setMarkup(null)}
            onDone={(f) => { const t = markup.target; setMarkup(null); void sendPhotoFile(f, t); }}
          />
        </ModalLayer>,
        document.body,
      )}

      {/* FRIEND-CHAT-MEDIA: hidden photo input (opened from the "+" menu) */}
      <input ref={photoRef} type="file" accept="image/*" hidden onChange={onPickPhoto} />

      {/* FRIEND-CHAT-MEDIA: "+" menu → Photo / Location (same look as the Saved Messages menu) */}
      {mode === 'chat' && peer && plusOpen && createPortal(
        <>
          <div role="presentation" onClick={() => setPlusOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: 47, background: 'transparent' }} />
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', left: 14, bottom: rect.bottom + 8, zIndex: 48, display: 'flex', flexDirection: 'column', gap: 6, padding: 8,
              borderRadius: 16, background: '#fff', border: '1px solid #e5e7eb', boxShadow: '0 12px 28px rgba(0,0,0,0.14)', animation: 'sfcPop 0.15s ease-out',
            }}
          >
            {([
              { key: 'photo', label: 'Photo', icon: <ImageIcon size={18} strokeWidth={2.2} />, run: () => { holdFilePicker(); photoRef.current?.click(); } },
            ] as { key: string; label: string; icon: React.ReactNode; run: () => void }[]).map(it => (
              <button
                key={it.key} type="button" disabled={busy}
                onClick={() => { setPlusOpen(false); it.run(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, border: 'none', background: '#f7f7f8',
                  color: '#111', fontWeight: 700, fontSize: '0.86rem', cursor: busy ? 'wait' : 'pointer', minWidth: 160, textAlign: 'left', opacity: busy ? 0.6 : 1,
                }}
              >
                <span style={{ width: 28, height: 28, borderRadius: 8, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0b3a82' }}>{it.icon}</span>
                {it.label}
              </button>
            ))}
          </div>
        </>,
        sheet.inner,
      )}

      {/* FRIEND-CHAT-MEDIA: location picker (map + send selected location) / location viewer / full-screen photo */}
      {locPickerOpen && createPortal(
        <ModalLayer onEsc={() => setLocPickerOpen(false)}>
          <React.Suspense fallback={null}>
            <LocationPickerSheet onClose={() => setLocPickerOpen(false)} onSend={sendPickedLocation} />
          </React.Suspense>
        </ModalLayer>,
        document.body,
      )}
      {locView && createPortal(
        <ModalLayer onEsc={() => setLocView(null)}>
          <React.Suspense fallback={null}>
            <LocationViewSheet lat={locView.lat} lng={locView.lng} label={locView.label} senderName={locView.name} senderAvatar={locView.avatar} onClose={() => setLocView(null)} />
          </React.Suspense>
        </ModalLayer>,
        document.body,
      )}
      {imgView && createPortal(
        <div
          role="presentation" onClick={() => setImgView(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 2147483000, pointerEvents: 'auto', background: 'rgba(0,0,0,0.94)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <img src={imgView} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          <button
            type="button" aria-label="Close" onClick={() => setImgView(null)}
            style={{ position: 'absolute', top: 'max(14px, env(safe-area-inset-top))', right: 14, width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.18)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          ><X size={20} /></button>
        </div>,
        document.body,
      )}
    </>
  );
}

const rowStyle: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px', border: 'none',
  borderRadius: 12, background: 'transparent', cursor: 'pointer', textAlign: 'start',
};
const circle: React.CSSProperties = {
  width: 38, height: 38, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center',
  justifyContent: 'center', fontWeight: 800, fontSize: 15,
};
const nameStyle: React.CSSProperties = { flex: 1, fontSize: 15, fontWeight: 700, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const emptyStyle: React.CSSProperties = { margin: '10px 8px', color: '#6b7280', fontSize: 13.5, textAlign: 'center' };

/* ───────────────────────── Install ───────────────────────── */
/* ───────────────────────── PUSH-TAP: live list previews, open-from-notification, in-app banner ───────────────────────── */
const REFRESH_EVENT = 'stooorna:friend-chat-refresh';
const PREVIEW_EVENT = 'stooorna:friend-chat-preview';
const OPEN_EVENT = 'stooorna:friend-chat-open';
const normName = (s: string) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const previewKey = (me: string) => `stooorna_friend_chat_preview_v1_${me}`;
const readPreviews = (me: string): Record<string, { text: string; ts: number }> => {
  try { const v = JSON.parse(localStorage.getItem(previewKey(me)) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
};
const readPreview = (me: string, peer: string): { text: string; ts: number } | null => readPreviews(me)[peer] || null;
const writePreview = (me: string, peer: string, text: string) => {
  try { const all = readPreviews(me); all[peer] = { text: String(text).slice(0, 200), ts: Date.now() }; localStorage.setItem(previewKey(me), JSON.stringify(all)); } catch { /* */ }
};

function openAiSheet() {
  try { if (scanSheet()) return; } catch { /* */ }
  const fire = () => { try { window.dispatchEvent(new CustomEvent('stooorna:ai-open')); } catch { /* */ } };
  fire();
  window.setTimeout(() => {
    try { if (scanSheet()) return; } catch { /* */ }
    try {
      if (window.location.pathname !== '/') {
        window.history.pushState({}, '', '/');
        window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
      }
    } catch { /* */ }
    window.setTimeout(fire, 700);
    window.setTimeout(fire, 2000);
  }, 900);
}

/** a notification was tapped outside the app: go to the exact place */
function routePushUrl(url: string) {
  try {
    const u = new URL(url, window.location.origin);
    const sp = u.searchParams;
    if (sp.get('openChat') === '1') {
      window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { peerId: sp.get('peerId') || '', peerName: sp.get('peerName') || '' } }));
      return;
    }
    if (sp.get('openGeneralChat') === '1') { openAiSheet(); return; }
    window.history.pushState({}, '', u.pathname + u.search + u.hash);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  } catch { /* */ }
}

function FriendChatNotifier() {
  const { user } = useSession() as any;
  const meId = user?.id ? String(user.id) : '';
  const meRef = useRef<Me | null>(null); meRef.current = user?.id ? { ...user, id: String(user.id) } : null;
  const [banner, setBanner] = useState<{ id: string; name: string; text: string; avatar?: string | null } | null>(null);
  const prevRef = useRef<Record<string, number> | null>(null);
  const namesRef = useRef<{ at: number; map: Record<string, Friend> }>({ at: 0, map: {} });
  const pushRef = useRef<Record<string, { text: string; at: number }>>({});
  const timerRef = useRef(0);

  const loadNames = async (me: Me) => {
    if (Date.now() - namesRef.current.at < 60000 && Object.keys(namesRef.current.map).length) return namesRef.current.map;
    const map: Record<string, Friend> = {};
    loadRecents(me.id).forEach(r => { map[r.id] = { id: r.id, name: r.name, avatar: r.avatar ?? null }; });
    try { (await adapter().listFriends(me)).forEach(f => { map[f.id] = f; }); } catch { /* */ }
    namesRef.current = { at: Date.now(), map };
    return map;
  };

  /* global: tap on a notification from outside the app, and notifications received while the app is open */
  useEffect(() => {
    const offTap = installPushTapHandler(routePushUrl);
    const offRecv = installPushReceiveHandler((n) => {
      const type = String(n?.data?.type || '');
      if (type && type !== 'message') return;
      const title = String(n?.title || '').trim().toLowerCase();
      const body = String(n?.body || '');
      if (title) pushRef.current[normName(title)] = { text: body, at: Date.now() };
      const me = meRef.current;
      if (me && title && body) {
        const hit = Object.values(namesRef.current.map).find(f => f.name.trim().toLowerCase() === title || normName(f.name) === normName(title));
        if (hit) { writePreview(me.id, hit.id, body); window.dispatchEvent(new CustomEvent(PREVIEW_EVENT)); }
      }
      window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
    });
    const onOpen = () => openAiSheet();
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => { offTap(); offRecv(); window.removeEventListener(OPEN_EVENT, onOpen); };
  }, []);

  /* watch unread counts: new message => update the list preview now + show the in-app banner */
  useEffect(() => {
    prevRef.current = null;
    if (!meId) return;
    let alive = true;
    const tick = async () => {
      const me = meRef.current;
      if (!me || document.visibilityState === 'hidden') return;
      let u: Record<string, number> = {};
      try { u = await adapter().unread(me); } catch { return; }
      if (!alive) return;
      const prev = prevRef.current; prevRef.current = u;
      if (!prev) return;
      const fresh = Object.keys(u).filter(k => (u[k] || 0) > (prev[k] || 0));
      if (!fresh.length) return;
      const names = await loadNames(me);
      if (!alive) return;
      const id = fresh[0];
      const name = names[id]?.name || 'New message';
      const pushed = pushRef.current[normName(name)];
      const text = pushed && Date.now() - pushed.at < 20000 && pushed.text ? pushed.text : 'New message';
      writePreview(me.id, id, text);
      window.dispatchEvent(new CustomEvent(PREVIEW_EVENT));
      const open = String((window as any).__sfcOpenPeer || '');
      if (open === '*' || fresh.includes(open)) return; // that chat (or the chat list) is already on screen
      setBanner({ id, name, text: previewOf(text), avatar: names[id]?.avatar ?? null });
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setBanner(null), 7000);
    };
    void tick();
    const t = window.setInterval(tick, 3000);
    const onVis = () => { void tick(); };
    window.addEventListener(REFRESH_EVENT, onVis);
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; window.clearInterval(t); window.removeEventListener(REFRESH_EVENT, onVis); document.removeEventListener('visibilitychange', onVis); window.clearTimeout(timerRef.current); };
  }, [meId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!banner) return null;
  const go = () => {
    const b = banner; setBanner(null);
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { peerId: b.id, peerName: b.name } }));
  };
  return createPortal(
    <>
      <style>{`@keyframes sfcBannerIn { from { opacity: 0; transform: translateY(-14px); } to { opacity: 1; transform: none; } }`}</style>
      <div
        role="button" dir="auto" onClick={go}
        style={{
          position: 'fixed', top: 'max(10px, env(safe-area-inset-top))', left: 10, right: 10, zIndex: 2147483600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 16, background: 'rgba(10,31,26,0.97)', color: '#fff',
          boxShadow: '0 10px 30px rgba(0,0,0,0.35)', border: '1px solid rgba(34,197,94,0.5)', animation: 'sfcBannerIn 220ms ease-out',
        }}
      >
        <span style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
          {banner.avatar ? <img src={banner.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (banner.name.trim().charAt(0).toUpperCase() || '?')}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 800, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{banner.name}</span>
          <span style={{ display: 'block', fontSize: 13, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{banner.text}</span>
        </span>
        <button
          type="button" aria-label="Dismiss"
          onClick={(e) => { e.stopPropagation(); setBanner(null); }}
          style={{ border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
        ><X size={15} /></button>
      </div>
    </>,
    document.body,
  );
}

/* TPL-POST-TO-CHAT: Share on a Templates post -> the post goes to that user's Stooorna Ai chat (not Saved Messages).
 * The existing Share button still calls POST /api/templates-share/send; we first drop the post into the friend chat,
 * and only if that worked we tell the server to skip the old Saved-Messages copy. If the chat send fails, the old path runs unchanged. */
function installTplShareToFriendChat() {
  const w: any = window;
  if (w.__STOOORNA_TPL_TO_CHAT__) return;
  w.__STOOORNA_TPL_TO_CHAT__ = true;
  const orig: typeof fetch = w.fetch.bind(w);
  w.fetch = async (input: any, init?: RequestInit) => {
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : '';
      const method = String(init?.method || 'GET').toUpperCase();
      if (url && method === 'POST' && /\/api\/templates-share\/send(\?|$)/.test(url) && typeof init?.body === 'string') {
        const b = JSON.parse(init.body);
        const to = String(b?.toUserId || ''); const postId = String(b?.postId || '');
        if (to && postId) {
          const text = encodeTplPost({ p: postId, k: b?.kind === 'image' ? 'image' : 'video', u: String(b?.mediaUrl || '') });
          const r = await orig('/api/friend-chat/messages', {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ receiverId: to, body: text, clientId: `c_tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }),
          });
          if (r.ok) {
            try { window.dispatchEvent(new CustomEvent(REFRESH_EVENT)); } catch { /* */ }
            const h = new Headers(init.headers || {}); h.set('x-tpl-via-friend-chat', '1');
            return orig(input, { ...init, headers: h });
          }
        }
      }
    } catch { /* fall through to the normal request */ }
    return orig(input, init);
  };
}

export function installFriendChatPatch() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const w: any = window;
  if (w.__STOOORNA_FRIEND_CHAT_PATCH__) return;
  w.__STOOORNA_FRIEND_CHAT_PATCH__ = FRIEND_CHAT_PATCH_VERSION;
  try { installTplShareToFriendChat(); } catch { /* */ } // TPL-POST-TO-CHAT
  // NEW-CHAT: drop the cached old chats (v1/v2 + seen counters) so nothing old is tied to this screen
  try {
    Object.keys(localStorage).filter(k => k.startsWith('stooorna_friend_chat_v1_') || k.startsWith('stooorna_friend_chat_v2_') || k.startsWith('stooorna_friend_chat_seen_')).forEach(k => localStorage.removeItem(k));
  } catch { /* */ }
  const mount = () => {
    const host = document.createElement('div');
    host.id = 'stooorna-friend-chat-patch';
    document.body.appendChild(host);
    createRoot(host).render(<><FriendChatPatch /><FriendChatNotifier /></>);
  };
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount, { once: true });
}

installFriendChatPatch();
