import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X as XIcon } from 'lucide-react';
import {
  getFriendsList, getOnlineList, getRequestsList, getPostsPanel, getBalance, loadDashboard,
  type AssistUser, type PanelKind, type Person, type PostStats, type DashboardNumbers,
} from './appAssistant';

/**
 * Stooorna Ai — white list pages (v1.0.0)
 * Place at: src/ai/AiInfoPanel.tsx
 *
 * A white page that slides UP over the app (X slides it down) with a tidy list:
 *   friends / online / requests -> profile picture + name (+ @username)
 *   posts                       -> numbers + grid of your posts
 *   summary                     -> all numbers, tap one to open its list
 *   app                         -> about the app
 */

const DARK_GREEN = '#0a1f1a';
const Z = 25000;

const isAr = () => {
  try {
    const o = (window as any).__STOOORNA_AI_LANG__;
    if (o) return /^ar/i.test(String(o));
  } catch { /* */ }
  return typeof navigator !== 'undefined' && /^ar/i.test(navigator.language || '');
};

function Avatar({ p, size = 46, dot }: { p: Person; size?: number; dot?: boolean }) {
  const [bad, setBad] = useState(false);
  const letter = (p.name || p.username || '?').trim().charAt(0).toUpperCase();
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {p.avatar && !bad ? (
        <img src={p.avatar} alt="" onError={() => setBad(true)} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', background: '#e5e7eb', display: 'block' }} />
      ) : (
        <div style={{ width: size, height: size, borderRadius: '50%', background: DARK_GREEN, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: size * 0.42 }}>
          {letter}
        </div>
      )}
      {dot ? <span style={{ position: 'absolute', right: 0, bottom: 0, width: 13, height: 13, borderRadius: '50%', background: '#22c55e', border: '2px solid #fff' }} /> : null}
    </div>
  );
}

function PeopleList({ people, dot, empty }: { people: Person[]; dot?: boolean; empty: string }) {
  if (!people.length) return <Empty text={empty} />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {people.map((p, i) => (
        <div key={p.id + i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 4px', borderBottom: i === people.length - 1 ? 'none' : '1px solid #f0f0f1' }}>
          <span style={{ width: 22, textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#9ca3af' }}>{i + 1}</span>
          <Avatar p={p} dot={dot} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name || p.username || '—'}</div>
            {p.username ? <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 600, direction: 'ltr', textAlign: 'start' }}>@{p.username}</div> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

const Empty = ({ text }: { text: string }) => (
  <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af', fontWeight: 700, fontSize: 15 }}>{text}</div>
);
const Loading = () => (
  <div style={{ display: 'flex', justifyContent: 'center', padding: '70px 0' }}>
    <div style={{ width: 30, height: 30, borderRadius: '50%', border: '3px solid #e5e7eb', borderTopColor: DARK_GREEN, animation: 'stooornaInfoSpin 0.7s linear infinite' }} />
  </div>
);

function PostsView({ s, ar }: { s: PostStats; ar: boolean }) {
  const stat = (icon: string, v: number, l: string) => (
    <div style={{ flex: 1, background: '#f4f4f5', borderRadius: 14, padding: '10px 4px', textAlign: 'center' }}>
      <div style={{ fontSize: 15 }}>{icon}</div>
      <div style={{ fontSize: 18, fontWeight: 900, color: DARK_GREEN }}>{v}</div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6b7280' }}>{l}</div>
    </div>
  );
  if (!s.total) return <Empty text={ar ? 'للحين ما أرسلت أي منشور' : "You haven't posted anything yet"} />;
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {stat('🖼', s.photos, ar ? 'صور' : 'Photos')}
        {stat('🎬', s.videos, ar ? 'فيديو' : 'Videos')}
        {stat('📝', s.textOnly, ar ? 'نص' : 'Text')}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {stat('❤️', s.likes, ar ? 'إعجابات' : 'Likes')}
        {stat('💬', s.comments, ar ? 'تعليقات' : 'Comments')}
        {stat('👁', s.views, ar ? 'مشاهدات' : 'Views')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {s.items.map(it => (
          <div key={it.id} style={{ position: 'relative', aspectRatio: '1 / 1', borderRadius: 12, overflow: 'hidden', background: it.kind === 'text' ? '#f4f4f5' : '#111' }}>
            {it.kind === 'photo' && it.media ? (
              <img src={it.media} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : it.kind === 'video' && it.media ? (
              <video src={`${it.media}#t=0.1`} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ padding: 8, fontSize: 12, fontWeight: 700, color: '#374151', overflow: 'hidden' }}>{it.text || '…'}</div>
            )}
            {it.kind === 'video' ? <span style={{ position: 'absolute', top: 5, left: 6, fontSize: 13 }}>▶️</span> : null}
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 6px 4px', background: 'linear-gradient(transparent, rgba(0,0,0,0.65))', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', gap: 8 }}>
              <span>❤️ {it.likes}</span><span>💬 {it.comments}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AppView({ ar }: { ar: boolean }) {
  const items = ar
    ? [
        ['📸', 'المنشورات', 'صور وفيديوهات ونصوص مع إعجاب وتعليق وإعادة نشر ومشاركة'],
        ['👥', 'الأصدقاء والمحادثات', 'أصدقاء، محادثات خاصة، قروبات، وشات عام'],
        ['📞', 'المكالمات', 'مكالمات صوت وفيديو'],
        ['🔴', 'البث المباشر LIVE', 'بث مع هدايا وعملات، وتقسيم الشاشة بين مذيعين'],
        ['🗺️', 'خريطة GPS الحية', 'تشوف أصدقاءك على الخريطة مباشرة'],
        ['🧩', 'Templates', 'انشر وتصفح الصور والفيديوهات'],
        ['✨', 'Stooorna Ai', 'تعديل الصور والفيديو، موسيقى، بحث صور — النشر 5 P للبوست'],
      ]
    : [
        ['📸', 'Posts', 'Photos, videos and text with likes, comments, reposts and sharing'],
        ['👥', 'Friends & chats', 'Friends, private chats, groups and a general chat'],
        ['📞', 'Calls', 'Voice and video calls'],
        ['🔴', 'LIVE broadcasts', 'Gifts, coins and split-screen between hosts'],
        ['🗺️', 'Live GPS map', 'See your friends on the map live'],
        ['🧩', 'Templates', 'Publish and browse photos and videos'],
        ['✨', 'Stooorna Ai', 'Edit photos and videos, music, photo search — publishing costs 5 P per post'],
      ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map(([icon, title, desc]) => (
        <div key={title} style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#f7f7f8', borderRadius: 16, padding: '12px 14px' }}>
          <div style={{ width: 42, height: 42, borderRadius: 13, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', flexShrink: 0 }}>{icon}</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#111' }}>{title}</div>
            <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 600, lineHeight: 1.4 }}>{desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

interface Props {
  kind: PanelKind;
  user?: AssistUser | null;
  onClose: () => void;
  onKind: (k: PanelKind) => void;
}

export default function AiInfoPanel({ kind, user, onClose, onKind }: Props) {
  const ar = isAr();
  const uid = String(user?.id || '');
  const [shown, setShown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState<Person[]>([]);
  const [total, setTotal] = useState(0);
  const [posts, setPosts] = useState<PostStats | null>(null);
  const [nums, setNums] = useState<DashboardNumbers | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => { const r = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(r); }, []);

  useEffect(() => {
    let dead = false;
    setLoading(true);
    const done = () => { if (!dead) setLoading(false); };
    const run = async () => {
      try {
        if (kind === 'friends') { const l = await getFriendsList(user); if (!dead) { setPeople(l); setTotal(l.length); } }
        else if (kind === 'online') { const r = await getOnlineList(user); if (!dead) { setPeople(r.online); setTotal(r.total); } }
        else if (kind === 'requests') { const r = await getRequestsList(user); if (!dead) { setPeople(r.people); setTotal(r.count); } }
        else if (kind === 'posts') { const r = await getPostsPanel(user); if (!dead) setPosts(r); }
        else if (kind === 'summary') {
          const [n, b] = await Promise.all([loadDashboard(user), getBalance(user)]);
          if (!dead) { setNums(n); setBalance(b); }
        }
      } catch { /* shows the empty state */ }
    };
    void run().then(done);
    // the online list refreshes by itself while the page is open
    const t = kind === 'online' ? window.setInterval(() => { void run(); }, 10000) : 0;
    return () => { dead = true; if (t) window.clearInterval(t); };
  }, [kind, uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => { setShown(false); window.setTimeout(onClose, 300); };

  const titles: Record<PanelKind, string> = ar
    ? { friends: 'أصدقائي', online: 'الأونلاين الآن', requests: 'طلبات الصداقة', posts: 'منشوراتي', app: 'عن التطبيق', summary: 'ملخص حسابي' }
    : { friends: 'My friends', online: 'Online now', requests: 'Friend requests', posts: 'My posts', app: 'About the app', summary: 'Account summary' };
  const count =
    kind === 'friends' || kind === 'requests' ? total
    : kind === 'online' ? `${people.length}${total ? ` / ${total}` : ''}`
    : kind === 'posts' ? (posts?.total ?? '')
    : '';

  const tiles: Array<{ k: PanelKind; icon: string; label: string; v: number | null }> = [
    { k: 'friends', icon: '👥', label: ar ? 'الأصدقاء' : 'Friends', v: nums?.friends ?? null },
    { k: 'online', icon: '🟢', label: ar ? 'أونلاين' : 'Online', v: nums?.online ?? null },
    { k: 'posts', icon: '🖼', label: ar ? 'منشوراتي' : 'My posts', v: nums?.posts ?? null },
    { k: 'requests', icon: '📩', label: ar ? 'الطلبات' : 'Requests', v: nums?.requests ?? null },
  ];

  let body: React.ReactNode;
  if (kind === 'app') body = <AppView ar={ar} />;
  else if (loading) body = <Loading />;
  else if (kind === 'friends') body = <PeopleList people={people} empty={ar ? 'ما عندك أصدقاء مضافين للحين' : 'No friends added yet'} />;
  else if (kind === 'online') body = <PeopleList people={people} dot empty={ar ? 'ما فيه أحد من أصدقائك أونلاين الحين' : 'None of your friends is online right now'} />;
  else if (kind === 'requests') body = people.length
    ? <PeopleList people={people} empty="" />
    : <Empty text={total ? (ar ? `عندك ${total} طلب صداقة` : `You have ${total} request(s)`) : (ar ? 'ما عندك طلبات جديدة' : 'No new requests')} />;
  else if (kind === 'posts') body = posts ? <PostsView s={posts} ar={ar} /> : <Empty text="—" />;
  else body = (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {tiles.map(t => (
          <button key={t.k} type="button" onClick={() => onKind(t.k)} style={{ border: '1px solid #e5e7eb', background: '#fff', borderRadius: 18, padding: '16px 8px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <span style={{ fontSize: 22 }}>{t.icon}</span>
            <span style={{ fontSize: 26, fontWeight: 900, color: DARK_GREEN }}>{t.v ?? '·'}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#6b7280' }}>{t.label}</span>
          </button>
        ))}
      </div>
      <div style={{ marginTop: 12, borderRadius: 18, background: DARK_GREEN, color: '#fff', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 800 }}>💰 {ar ? 'الرصيد' : 'Balance'}</span>
        <span style={{ fontWeight: 900, fontSize: 20 }}>{balance ?? '·'} P</span>
      </div>
    </div>
  );

  return createPortal(
    <div
      dir={ar ? 'rtl' : 'ltr'}
      // React events bubble through portals: without this the tap on X also reached the Ai sheet and closed it
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
      style={{
        position: 'fixed', inset: 0, zIndex: Z, background: '#fff', display: 'flex', flexDirection: 'column',
        transform: shown ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.3s cubic-bezier(0.22,1,0.36,1)',
        borderTopLeftRadius: 26, borderTopRightRadius: 26, marginTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 16px 12px', borderBottom: '1px solid #f0f0f1' }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: '#111', flex: 1 }}>
          {titles[kind]}
          {count !== '' ? <span style={{ marginInlineStart: 8, fontSize: 14, fontWeight: 800, color: '#fff', background: DARK_GREEN, borderRadius: 999, padding: '2px 10px' }}>{count}</span> : null}
        </div>
        <button type="button" aria-label="Close" onClick={e => { e.stopPropagation(); close(); }} style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', background: '#f1f1f2', color: '#111', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <XIcon size={20} />
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px calc(24px + env(safe-area-inset-bottom, 0px))' }}>{body}</div>
      <style>{'@keyframes stooornaInfoSpin { to { transform: rotate(360deg); } }'}</style>
    </div>,
    document.body,
  );
}
