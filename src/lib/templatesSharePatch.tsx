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
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';

const MARK = '\u2063TPLSHARE\u2063';
const SEEN_KEY = 'stooorna_tpl_share_seen_';
const SAVED_KEY = 'stooorna_saved_messages_v1_';

type SharePayload = { postId: string; kind: 'video' | 'image'; from: string };

export function isTplShareText(t?: string | null): boolean {
  return !!t && t.startsWith(MARK);
}
function parseShare(t?: string | null): SharePayload | null {
  if (!isTplShareText(t)) return null;
  try { return JSON.parse(String(t).slice(MARK.length)) as SharePayload; } catch { return null; }
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
    if (!uid || !Array.isArray(d.items) || !d.items.length) return;
    let seen: string[] = [];
    try { seen = JSON.parse(localStorage.getItem(SEEN_KEY + uid) || '[]'); } catch { /* */ }
    const fresh = d.items.filter((x: any) => !seen.includes(String(x.id)));
    if (!fresh.length) return;
    let list: any[] = [];
    try { list = JSON.parse(localStorage.getItem(SAVED_KEY + uid) || '[]'); if (!Array.isArray(list)) list = []; } catch { list = []; }
    for (const x of fresh) {
      const payload: SharePayload = { postId: String(x.postId), kind: x.kind === 'image' ? 'image' : 'video', from: String(x.fromUsername || x.fromName || '') };
      list.push({
        id: `sm-${String(x.id)}`, kind: 'text', text: MARK + JSON.stringify(payload),
        senderName: payload.from || null, avatarUrl: x.fromAvatar || null, mediaUrl: null, createdAt: Number(x.at) || Date.now(),
      });
    }
    localStorage.setItem(SAVED_KEY + uid, JSON.stringify(list.slice(-500)));
    localStorage.setItem(SEEN_KEY + uid, JSON.stringify([...seen, ...fresh.map((x: any) => String(x.id))].slice(-500)));
    window.dispatchEvent(new CustomEvent('stooorna:tpl-share-arrived', { detail: { uid } }));
  } catch { /* offline — try again next tick */ }
}
function startPoller() {
  if (pollerStarted || typeof window === 'undefined') return;
  pollerStarted = true;
  window.setTimeout(() => { void pullInbox(); }, 1500);
  window.setInterval(() => { void pullInbox(); }, 6000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void pullInbox(); });
}
startPoller();

/* ───────────── receiver: tile inside the Saved Messages chat ───────────── */
export function TplSharedTile({ text }: { text?: string | null }) {
  const p = parseShare(text);
  if (!p) return null;
  const isVid = p.kind === 'video';
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('stooorna:open-shared-post', { detail: { postId: p.postId } })); }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: 168, height: 96, border: 'none', cursor: 'pointer',
        borderRadius: 12, background: 'linear-gradient(135deg,#06171a,#0b2a30)', color: '#7ee8f5', fontWeight: 800, fontSize: '1rem',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{isVid ? '▶' : '🖼'}</span>
      <span>{isVid ? 'فيديو' : 'صورة'}</span>
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
      style={{ position: 'fixed', inset: 0, zIndex: 11200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'ltr' }}
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
