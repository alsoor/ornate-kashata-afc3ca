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
import { MessageCircle, Check, CheckCheck, AlertCircle, Bot } from 'lucide-react';
import { loadDashboard } from './appAssistant';

export const FRIEND_CHAT_PATCH_VERSION = '1.0.0';

/* ───────────────────────── Types ───────────────────────── */
interface Me { id: string; name?: string | null; username?: string | null; avatarUrl?: string | null; image?: string | null }
interface Friend { id: string; name: string; avatar?: string | null }
interface ChatMsg {
  id: string; clientId?: string; from: string; to?: string; text: string; ts: number;
  status?: 'sending' | 'sent' | 'failed'; read?: boolean;
}
interface Adapter {
  listFriends(me: Me): Promise<Friend[]>;
  fetchMessages(me: Me, peerId: string): Promise<ChatMsg[]>;
  send(me: Me, peerId: string, text: string, clientId: string): Promise<Partial<ChatMsg> | void>;
  unread(me: Me): Promise<Record<string, number>>;
  markRead(me: Me, peerId: string): Promise<void>;
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
  clientId: o.clientId ? String(o.clientId) : undefined,
  from: String(o.from ?? o.senderId ?? o.fromId),
  to: o.to ?? o.receiverId ?? o.toId,
  text: o.type && o.type !== 'text' && !o.text ? '📎 وسائط' : String(o.text ?? o.body ?? o.content ?? o.message ?? ''),
  ts: asTs(o.ts ?? o.createdAt ?? o.timestamp),
  read: !!(o.read ?? o.readAt),
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
    const d = await local(`/api/messages?with=${encodeURIComponent(peerId)}`);
    return (Array.isArray(d) ? d : d?.messages || []).map(toMsg);
  },
  async send(me, peerId, text, clientId) {
    const d = await local('/api/messages', { method: 'POST', body: JSON.stringify({ receiverId: peerId, body: text }) });
    // only return the server id: the optimistic copy keeps from/text/ts
    return typeof d?.id === 'number' ? { id: `db-${d.id}` } : undefined;
  },
  async unread(me) {
    try {
      const d = await local('/api/messages/unread');
      const o = d?.bySender || {};
      const out: Record<string, number> = {};
      Object.keys(o).forEach(k => { const n = Number(o[k]); if (n > 0) out[k] = n; });
      return out;
    } catch { return {}; }
  },
  async markRead() { /* GET /api/messages?with=... already marks incoming messages as read */ },
};

const adapter = (): Adapter => ({ ...restAdapter, ...((window as any).__STOOORNA_FRIEND_CHAT__ || {}) });

/* ───────────────────────── Helpers ───────────────────────── */
const DARK_GREEN = '#0a1f1a';
const cacheKey = (me: string, peer: string) => `stooorna_friend_chat_v1_${me}_${peer}`;
const loadCache = (me: string, peer: string): ChatMsg[] => {
  try { const v = JSON.parse(localStorage.getItem(cacheKey(me, peer)) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};
const saveCache = (me: string, peer: string, list: ChatMsg[]) => {
  try { localStorage.setItem(cacheKey(me, peer), JSON.stringify(list.slice(-150))); } catch { /* */ }
};

function merge(prev: ChatMsg[], inc: ChatMsg[]): ChatMsg[] {
  const map = new Map<string, ChatMsg>();
  [...prev, ...inc].forEach(m => { const k = m.clientId || m.id; map.set(k, { ...(map.get(k) || {}), ...m } as ChatMsg); });
  const all = [...map.values()];
  // pending local copy + same message coming back from the server without clientId => keep the server one
  const out = all.filter(m => {
    if (!m.id.startsWith('c_') || m.status === 'failed') return true;
    return !all.some(o => !o.id.startsWith('c_') && o.from === m.from && o.text === m.text && Math.abs(o.ts - m.ts) < 20000);
  });
  return out.sort((a, b) => a.ts - b.ts).slice(-300);
}

const hhmm = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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
  const [rect, setRect] = useState({ top: 58, bottom: 90 });
  const [toast, setToast] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef(mode); modeRef.current = mode;
  const peerRef = useRef(peer); peerRef.current = peer;
  const sheetRef = useRef(sheet); sheetRef.current = sheet;

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
    if (!sheet) { setMode('ai'); setPeer(null); setListOpen(false); setFriends(null); setUnread({}); setMe(null); return; }
    setMe(findUser(sheet.btn));
  }, [sheet]);

  /* 3) unread counts (drives the chat-icon avatar for the receiver) */
  useEffect(() => {
    if (!sheet || !me) return;
    let alive = true;
    const tick = async () => { const u = await adapter().unread(me).catch(() => ({})); if (alive) setUnread(u); };
    void tick();
    const t = window.setInterval(tick, 6000);
    return () => { alive = false; window.clearInterval(t); };
  }, [sheet, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* 4) friends list loads when the list opens */
  useEffect(() => {
    if (!listOpen || !me) return;
    let alive = true;
    void adapter().listFriends(me).then(l => { if (alive) setFriends(l); }).catch(() => { if (alive) setFriends([]); });
    return () => { alive = false; };
  }, [listOpen, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* 5) messages of the open chat: cache first, then poll */
  useEffect(() => {
    if (mode !== 'chat' || !peer || !me) return;
    let alive = true;
    setChat({ peerId: peer.id, list: loadCache(me.id, peer.id) });
    const pull = async () => {
      try {
        const inc = await adapter().fetchMessages(me, peer.id);
        if (!alive) return;
        setChat(c => (c.peerId === peer.id ? { peerId: c.peerId, list: merge(c.list, inc) } : c));
        if (inc.some(m => m.from === peer.id && !m.read)) {
          void adapter().markRead(me, peer.id);
          setUnread(u => { const n = { ...u }; delete n[peer.id]; return n; });
        }
      } catch { /* offline: keep cache */ }
    };
    void pull();
    const t = window.setInterval(pull, 3000);
    return () => { alive = false; window.clearInterval(t); };
  }, [mode, peer?.id, me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (me && chat.peerId) saveCache(me.id, chat.peerId, chat.list);
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat, me]);

  /* 6) layout: the chat panel sits exactly between header and input bar */
  useEffect(() => {
    if (!sheet) return;
    const measure = () => {
      const ir = sheet.inner.getBoundingClientRect();
      const top = sheet.header.getBoundingClientRect().bottom - ir.top;
      const bottom = sheet.form ? ir.bottom - sheet.form.getBoundingClientRect().top : 90;
      setRect(p => (Math.abs(p.top - top) < 0.5 && Math.abs(p.bottom - bottom) < 0.5 ? p : { top, bottom }));
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

  /* ── sending ── */
  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast(''), 2500); };

  const sendText = useCallback(async (raw: string, retryId?: string) => {
    const p = peerRef.current; const t = raw.trim();
    if (!me || !p || !t) return;
    const cid = retryId || `c_${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const msg: ChatMsg = { id: cid, clientId: cid, from: me.id, to: p.id, text: t, ts: Date.now(), status: 'sending' };
    setChat(c => ({ peerId: p.id, list: merge(c.peerId === p.id ? c.list : [], [msg]) }));
    try {
      const r = await adapter().send(me, p.id, t, cid);
      setChat(c => ({ ...c, list: c.list.map(x => (x.clientId === cid ? { ...x, ...(r || {}), clientId: cid, status: 'sent' as const } : x)) }));
    } catch {
      setChat(c => ({ ...c, list: c.list.map(x => (x.clientId === cid ? { ...x, status: 'failed' as const } : x)) }));
    }
  }, [me]);
  const sendRef = useRef(sendText); sendRef.current = sendText;

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
      if (v.trim()) { clearTextarea(ta); void sendRef.current(v); }
    };
    const onClick = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (sheet.avatarWrap.contains(t)) {
        e.preventDefault(); e.stopPropagation();
        setListOpen(v => !v);
        return;
      }
      if (modeRef.current !== 'chat') return;
      const btn = t.closest('button') as HTMLElement | null;
      if (!btn || !sheet.inner.contains(btn)) return;
      const label = btn.getAttribute('aria-label');
      if (label === 'Send') { e.preventDefault(); e.stopPropagation(); takeInput(); }
      else if (label === 'Voice' || label === 'Attach') { e.preventDefault(); e.stopPropagation(); flash('النص فقط متاح في شات الأصدقاء حالياً'); }
    };
    const onSubmit = (e: Event) => {
      if (modeRef.current !== 'chat') return;
      if (!(e.target as HTMLElement)?.closest?.('form') || !sheet.inner.contains(e.target as Node)) return;
      e.preventDefault(); e.stopPropagation(); takeInput();
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('submit', onSubmit, true);
    return () => { document.removeEventListener('click', onClick, true); document.removeEventListener('submit', onSubmit, true); };
  }, [sheet]);

  if (!sheet) return null;

  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);
  const showChatIcon = totalUnread > 0 || mode === 'chat';
  const openPeer = (f: Friend) => { setPeer(f); setMode('chat'); setListOpen(false); };
  const backToAi = () => { setMode('ai'); setPeer(null); setListOpen(false); };
  const myId = me?.id || '';
  const sorted = [...(friends || [])].sort((a, b) => (unread[b.id] || 0) - (unread[a.id] || 0));

  return (
    <>
      <style>{`
        [data-sfc="chat"] > :not(:first-child) { visibility: hidden !important; pointer-events: none !important; }
        [data-sfc-av] { cursor: pointer; -webkit-tap-highlight-color: transparent; }
        @keyframes sfcPop { from { opacity: 0; transform: translateY(-6px) scale(0.98); } to { opacity: 1; transform: none; } }
      `}</style>

      {/* avatar -> chat-icon circle (new messages, or while chatting) */}
      {showChatIcon && createPortal(
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', inset: 0, borderRadius: '50%', background: DARK_GREEN, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2,
          }}
        >
          <MessageCircle size={19} strokeWidth={2.3} />
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

      {/* friend name in the freed header space */}
      {mode === 'chat' && peer && createPortal(
        <div style={{
          position: 'absolute', left: 64, right: 16, top: 0, bottom: 0, display: 'flex', alignItems: 'center',
          gap: 10, pointerEvents: 'none', zIndex: 6,
        }}>
          {peer.avatar
            ? <img src={peer.avatar} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover' }} />
            : <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#e5e7eb', color: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>{(peer.name[0] || '?').toUpperCase()}</div>}
          <span style={{ fontWeight: 800, fontSize: 15, color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{peer.name}</span>
        </div>,
        sheet.header,
      )}

      {/* chat panel (replaces the Ai messages area, keeps the same input bar) */}
      {mode === 'chat' && peer && createPortal(
        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: rect.top, bottom: rect.bottom, zIndex: 10,
            background: '#fff', display: 'flex', flexDirection: 'column', overflowY: 'auto',
            padding: '16px 14px', gap: 8,
          }}
        >
          {chat.peerId === peer.id && chat.list.length === 0 && (
            <div style={{ margin: 'auto', textAlign: 'center', color: '#6b7280', fontSize: 15 }}>
              ابدأ المحادثة مع <b style={{ color: '#111' }}>{peer.name}</b>
            </div>
          )}
          {(chat.peerId === peer.id ? chat.list : []).map(m => {
            const mine = m.from === myId;
            return (
              <div key={m.clientId || m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%', display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                <div
                  dir="auto"
                  onClick={() => { if (m.status === 'failed') void sendRef.current(m.text, m.clientId); }}
                  style={{
                    background: mine ? DARK_GREEN : '#f1f1ef', color: mine ? '#fff' : '#111',
                    padding: '9px 13px', borderRadius: 18, borderBottomRightRadius: mine ? 6 : 18, borderBottomLeftRadius: mine ? 18 : 6,
                    fontSize: 15, lineHeight: '21px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    opacity: m.status === 'sending' ? 0.7 : 1, cursor: m.status === 'failed' ? 'pointer' : 'default',
                  }}
                >{m.text}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, fontSize: 11, color: m.status === 'failed' ? '#ef4444' : '#9ca3af' }}>
                  <span>{hhmm(m.ts)}</span>
                  {mine && (m.status === 'failed'
                    ? <><AlertCircle size={13} /><span>فشل — اضغط للإعادة</span></>
                    : m.status === 'sending' ? <span>…</span>
                    : m.read ? <CheckCheck size={14} color="#22c55e" /> : <Check size={14} />)}
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
          {toast && (
            <div style={{ position: 'sticky', bottom: 0, alignSelf: 'center', background: 'rgba(0,0,0,0.78)', color: '#fff', padding: '7px 14px', borderRadius: 999, fontSize: 12.5 }}>{toast}</div>
          )}
        </div>,
        sheet.inner,
      )}

      {/* friends list (opens under the avatar) */}
      {listOpen && createPortal(
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

            {mode === 'chat' && (
              <button type="button" onClick={backToAi} style={rowStyle}>
                <span style={{ ...circle, background: '#0a0a0a', color: '#fff' }}><Bot size={18} /></span>
                <span style={nameStyle}>Stooorna Ai</span>
              </button>
            )}

            {friends === null && <p style={emptyStyle}>…</p>}
            {friends !== null && friends.length === 0 && <p style={emptyStyle}>ما عندك أصدقاء مضافين</p>}

            {sorted.map(f => (
              <button key={f.id} type="button" onClick={() => openPeer(f)} style={{ ...rowStyle, background: peer?.id === f.id && mode === 'chat' ? 'rgba(0,0,0,0.06)' : 'transparent' }}>
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
export function installFriendChatPatch() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const w: any = window;
  if (w.__STOOORNA_FRIEND_CHAT_PATCH__) return;
  w.__STOOORNA_FRIEND_CHAT_PATCH__ = FRIEND_CHAT_PATCH_VERSION;
  const mount = () => {
    const host = document.createElement('div');
    host.id = 'stooorna-friend-chat-patch';
    document.body.appendChild(host);
    createRoot(host).render(<FriendChatPatch />);
  };
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount, { once: true });
}

installFriendChatPatch();
