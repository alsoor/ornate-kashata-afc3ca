/**
 * TEMPLATES-SHARE-PATCH (client) — standalone file, linked into add-friend.tsx by apply-templates-share.py
 *
 *  1) <TplShareButton post={c} />  : share arrow under the Favorite icon of a Templates photo/video.
 *     Tap -> square bubble in the middle of the screen: friends list (avatar · @username · Share button).
 *     Share -> ✓ "تم ارسال المنشور" -> bubble closes.
 *  2) Receiver: a poller drops every incoming share into the Saved Messages vault as a rectangle tile
 *     (video / photo). <TplSharedTile text=… /> draws it; tapping fires 'stooorna:open-shared-post'
 *     (add-friend.tsx opens the post in the Templates feed: X on top, like / comment / favorite work).
 */
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Check, X } from 'lucide-react';

const MARK = '\u2063TPLSHARE\u2063';
const SEEN_KEY = 'stooorna_tpl_share_seen_';
const SAVED_KEY = 'stooorna_saved_messages_v1_';

type SharePayload = { postId: string; kind: 'video' | 'image'; from: string; sid?: string; u?: string };

export function isTplShareText(t?: string | null): boolean {
  return !!t && t.startsWith(MARK);
}
function parseShare(t?: string | null): SharePayload | null {
  if (!isTplShareText(t)) return null;
  try { return JSON.parse(String(t).slice(MARK.length)) as SharePayload; } catch { return null; }
}


/* ───────────── unread marker (orange blink) ───────────── */
const UNREAD_KEY = 'stooorna_tpl_share_unread_';
let curUid = '';
try { curUid = localStorage.getItem('stooorna_tpl_share_uid') || ''; } catch { /* */ }
function readUnread(): string[] {
  if (!curUid) return [];
  try { const a = JSON.parse(localStorage.getItem(UNREAD_KEY + curUid) || '[]'); return Array.isArray(a) ? a.map(String) : []; } catch { return []; }
}
function writeUnread(a: string[]) {
  if (!curUid) return;
  try { localStorage.setItem(UNREAD_KEY + curUid, JSON.stringify(a.slice(-200))); } catch { /* */ }
  try { window.dispatchEvent(new CustomEvent('stooorna:tpl-share-unread')); } catch { /* */ }
}
function markRead(sid?: string) {
  if (!sid) return;
  const a = readUnread();
  if (a.includes(sid)) writeUnread(a.filter(x => x !== sid));
}
/** number of shared posts I have not opened yet */
export function useTplShareUnread(): number {
  const [n, setN] = useState(() => readUnread().length);
  useEffect(() => {
    const f = () => setN(readUnread().length);
    f();
    window.addEventListener('stooorna:tpl-share-unread', f);
    window.addEventListener('stooorna:tpl-share-arrived', f);
    return () => { window.removeEventListener('stooorna:tpl-share-unread', f); window.removeEventListener('stooorna:tpl-share-arrived', f); };
  }, []);
  return n;
}
/** orange ring around a profile circle with a silver glint running along it (never touches the photo itself).
 *  Put inside a position:relative box the size of the circle; `style` can override the placement. */
export function TplShareDot({ style }: { style?: CSSProperties }) {
  const n = useTplShareUnread();
  if (!n) return null;
  const hole = 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px))';
  return (
    <>
      <style>{'@keyframes tplShareSpin{to{transform:rotate(360deg)}}'}</style>
      <span
        aria-hidden
        style={{
          position: 'absolute', inset: -3, borderRadius: '50%', pointerEvents: 'none',
          background: 'conic-gradient(#f97316 0deg, #f97316 235deg, #fdba74 275deg, #ffffff 305deg, #d1d5db 325deg, #f97316 360deg)',
          WebkitMask: hole, mask: hole, animation: 'tplShareSpin 1.3s linear infinite', ...style,
        }}
      />
    </>
  );
}
/** z-index helper: while Saved Messages (z 120050) is open, the Templates post page must sit above it */
export function tplZ(base: number): number {
  try { return sessionStorage.getItem('stooorna_saved_open') === '1' ? base + 110000 : base; } catch { return base; }
}

/* ───────────── receiver: inbox poller → Saved Messages vault ───────────── */
let pollerStarted = false;
async function pullInbox() {
  try {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    const r = await fetch('/api/templates-share/inbox', { credentials: 'include', cache: 'no-store' });
    if (!r.ok) return;
    const d = await r.json();
    const uid = String(d?.userId || '');
    if (uid && uid !== curUid) { curUid = uid; try { localStorage.setItem('stooorna_tpl_share_uid', uid); } catch { /* */ } }
    if (!uid || !Array.isArray(d.items) || !d.items.length) return;
    let seen: string[] = [];
    try { seen = JSON.parse(localStorage.getItem(SEEN_KEY + uid) || '[]'); } catch { /* */ }
    const fresh = d.items.filter((x: any) => !seen.includes(String(x.id)));
    if (!fresh.length) return;
    let list: any[] = [];
    try { list = JSON.parse(localStorage.getItem(SAVED_KEY + uid) || '[]'); if (!Array.isArray(list)) list = []; } catch { list = []; }
    for (const x of fresh) {
      const payload: SharePayload = { postId: String(x.postId), kind: x.kind === 'image' ? 'image' : 'video', from: String(x.fromUsername || x.fromName || ''), sid: String(x.id), u: String(x.mediaUrl || '') };
      list.push({
        id: `sm-${String(x.id)}`, kind: 'text', text: MARK + JSON.stringify(payload),
        senderName: payload.from || null, avatarUrl: x.fromAvatar || null, mediaUrl: null, createdAt: Number(x.at) || Date.now(),
      });
    }
    localStorage.setItem(SAVED_KEY + uid, JSON.stringify(list.slice(-500)));
    localStorage.setItem(SEEN_KEY + uid, JSON.stringify([...seen, ...fresh.map((x: any) => String(x.id))].slice(-500)));
    writeUnread([...readUnread(), ...fresh.map((x: any) => String(x.id))]);
    const last = fresh[fresh.length - 1];
    window.dispatchEvent(new CustomEvent('stooorna:tpl-share-arrived', { detail: { uid, from: String(last.fromUsername || last.fromName || ''), avatar: String(last.fromAvatar || ''), count: fresh.length } }));
  } catch { /* offline — try again next tick */ }
}
function startPoller() {
  if (pollerStarted || typeof window === 'undefined') return;
  pollerStarted = true;
  window.setTimeout(() => { void pullInbox(); }, 1500);
  window.setInterval(() => { void pullInbox(); }, 6000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void pullInbox(); });
  const mount = () => {
    try { const host = document.createElement('div'); host.id = 'tpl-share-toast-root'; document.body.appendChild(host); createRoot(host).render(<TplShareToast />); } catch { /* */ }
  };
  if (document.body) mount(); else window.addEventListener('DOMContentLoaded', mount, { once: true });
}
startPoller();


/* ───────────── top notification when a share arrives (outside Saved Messages) ───────────── */
function TplShareToast() {
  const [t, setT] = useState<{ from: string; avatar: string; count: number } | null>(null);
  useEffect(() => {
    let timer = 0;
    const onArrive = (e: Event) => {
      let inSaved = false;
      try { inSaved = sessionStorage.getItem('stooorna_saved_open') === '1'; } catch { /* */ }
      if (inSaved) return;
      const d = (e as CustomEvent).detail || {};
      setT({ from: String(d.from || ''), avatar: String(d.avatar || ''), count: Number(d.count) || 1 });
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setT(null), 15000);
    };
    window.addEventListener('stooorna:tpl-share-arrived', onArrive);
    return () => { window.removeEventListener('stooorna:tpl-share-arrived', onArrive); window.clearTimeout(timer); };
  }, []);
  if (!t) return null;
  const open = () => {
    setT(null);
    try { sessionStorage.setItem('stooorna_saved_open', '1'); } catch { /* */ }
    try { window.dispatchEvent(new CustomEvent('stooorna:open-saved')); } catch { /* */ }
  };
  return (
    <div
      dir="rtl"
      style={{ position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 8px)', left: 10, right: 10, zIndex: 2147483000, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}
    >
      <div
        style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 10, width: '100%', maxWidth: 420, background: '#06171a', border: '1px solid #f97316', borderRadius: 16, padding: '8px 10px', boxShadow: '0 8px 28px rgba(0,0,0,0.5)' }}
      >
        <button type="button" onClick={open} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'right', color: '#fff' }}>
          {t.avatar ? (
            <img src={t.avatar} alt="" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, boxShadow: '0 0 0 2px #f97316' }} />
          ) : (
            <span style={{ width: 38, height: 38, borderRadius: '50%', background: '#f97316', flexShrink: 0 }} />
          )}
          <span style={{ minWidth: 0, fontWeight: 700, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {t.from ? `@${t.from.replace(/^@/, '')} ` : ''}{t.count > 1 ? `شارك ${t.count} منشورات` : 'شارك منشور'}
          </span>
        </button>
        <button type="button" aria-label="Dismiss" onClick={() => setT(null)} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

/* ───────────── receiver: tile inside the Saved Messages chat ───────────── */
export function TplSharedTile({ text, lookup }: { text?: string | null; lookup?: (postId: string) => string | null }) {
  const p = parseShare(text);
  const [bad, setBad] = useState(false);
  if (!p) return null;
  const isVid = p.kind === 'video';
  // the live Templates / chat store wins over the stored link (always the real file); the stored link is the fallback
  let u = '';
  try { u = (lookup ? lookup(p.postId) : null) || p.u || ''; } catch { u = p.u || ''; }
  const open = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    markRead(p.sid);
    window.dispatchEvent(new CustomEvent('stooorna:tpl-open-in-saved', { detail: { postId: p.postId, u, kind: p.kind, from: p.from } }));
  };
  const box: CSSProperties = {
    display: 'block', position: 'relative', width: 'min(60vw, 240px)', height: 280, padding: 0, border: 'none', background: '#000',
    cursor: 'pointer', borderRadius: 10, overflow: 'hidden', WebkitTapHighlightColor: 'transparent',
  };
  if (u && !bad) {
    return (
      <button type="button" onClick={open} style={box}>
        {isVid ? (
          <video src={u} muted playsInline preload="metadata" controls={false} disablePictureInPicture onError={() => setBad(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none', background: '#000' }} />
        ) : (
          <img src={u} alt="" draggable={false} onError={() => setBad(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }} />
        )}
        {isVid ? (
          <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <span style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1.3rem' }}>▶</span>
          </span>
        ) : null}
      </button>
    );
  }
  // no usable thumbnail: plain tile (still opens the post)
  return (
    <button type="button" onClick={open} style={{ ...box, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'linear-gradient(135deg,#06171a,#0b2a30)', color: '#7ee8f5', fontWeight: 800, fontSize: '1rem' }}>
      <span>{isVid ? '▶' : '🖼'}</span><span>{isVid ? 'فيديو' : 'صورة'}</span>
    </button>
  );
}

/* ───────────── sender: share arrow + users bubble ───────────── */
type Friend = { friendId: string; name: string | null; username: string | null; avatarUrl?: string | null };

function ShareArrowIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.65))' }} aria-hidden>
      <path
        d="M13.2 4.6c0-.7.8-1.1 1.4-.6l7 6.2c.5.4.5 1.1 0 1.5l-7 6.2c-.6.5-1.4.1-1.4-.6v-3.4c-3.6-.1-6.1.9-8.2 4-.4.6-1.3.3-1.2-.4.7-5.6 3.7-9.2 9.4-9.9V4.6z"
        fill="rgba(255,255,255,0.95)" stroke="rgba(255,255,255,0.95)" strokeWidth="1" strokeLinejoin="round"
      />
    </svg>
  );
}

export function TplShareButton({ post, isVideo }: { post: { id: string; imageUrl?: string | null; text?: string | null }; isVideo?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Share"
        onClick={e => { e.stopPropagation(); setOpen(true); }}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', WebkitTapHighlightColor: 'transparent' }}
      >
        <ShareArrowIcon />
      </button>
      {open ? <TplShareBubble post={post} isVideo={isVideo} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function TplShareBubble({ post, isVideo, onClose }: { post: { id: string; imageUrl?: string | null; text?: string | null }; isVideo?: boolean; onClose: () => void }) {
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [sending, setSending] = useState<string>('');
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const url = String(post.imageUrl || '');
  const kind: 'video' | 'image' = isVideo === false ? 'image' : 'video';

  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const r = await fetch('/api/friends', { credentials: 'include' });
        const d = r.ok ? await r.json() : null;
        if (!off) setFriends(Array.isArray(d?.accepted) ? d.accepted : []);
      } catch { if (!off) setFriends([]); }
    })();
    return () => { off = true; };
  }, []);

  const send = async (f: Friend) => {
    if (sending || done) return;
    setSending(f.friendId); setErr('');
    try {
      const r = await fetch('/api/templates-share/send', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toUserId: f.friendId, postId: post.id, kind, mediaUrl: url }),
      });
      if (!r.ok) throw new Error('fail');
      setDone(true);
      window.setTimeout(onClose, 1100);
    } catch { setErr('تعذر الإرسال، حاول مرة ثانية'); setSending(''); }
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      onClick={e => { e.stopPropagation(); if (!done) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: tplZ(11200), background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'ltr' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ position: 'relative', width: 'min(86vw, 340px)', height: 'min(86vw, 340px)', background: '#06171a', borderRadius: 22, border: '1px solid rgba(126,232,245,0.25)', boxShadow: '0 12px 40px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {done ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Check size={38} color="#fff" strokeWidth={3} />
            </div>
            <p style={{ margin: 0, color: '#fff', fontWeight: 800, fontSize: '1rem' }}>تم ارسال المنشور</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px 8px' }}>
              <p style={{ margin: 0, flex: 1, color: '#7ee8f5', fontWeight: 800, fontSize: '0.98rem' }}>Share</p>
              <button type="button" aria-label="Close" onClick={onClose} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
              {friends === null ? (
                <p style={{ margin: '28px 0', textAlign: 'center', fontSize: '0.8rem', color: 'rgba(150,200,200,0.7)' }}>...</p>
              ) : friends.length === 0 ? (
                <p style={{ margin: '28px 0', textAlign: 'center', fontSize: '0.8rem', color: 'rgba(150,200,200,0.7)' }}>No users yet</p>
              ) : friends.map(f => (
                <div key={f.friendId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {f.avatarUrl ? (
                    <img src={f.avatarUrl} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: '#123' }} />
                  ) : (
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#0e3a42', color: '#7ee8f5', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {String(f.username || f.name || '?').replace(/^@/, '').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <span style={{ flex: 1, minWidth: 0, color: '#fff', fontWeight: 700, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    @{String(f.username || f.name || '').replace(/^@/, '')}
                  </span>
                  <button
                    type="button"
                    disabled={!!sending}
                    onClick={() => void send(f)}
                    style={{ border: 'none', borderRadius: 8, padding: '7px 14px', background: '#00BCD4', color: '#04252b', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', opacity: sending && sending !== f.friendId ? 0.5 : 1 }}
                  >
                    {sending === f.friendId ? '...' : 'Share'}
                  </button>
                </div>
              ))}
              {err ? <p style={{ margin: '8px 0 0', textAlign: 'center', color: '#fca5a5', fontSize: '0.78rem' }}>{err}</p> : null}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
