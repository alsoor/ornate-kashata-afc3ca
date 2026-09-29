/**
 * GuestLive.tsx — ملف الزائر المستقل (قبل تسجيل الدخول)
 * ─────────────────────────────────────────────────────────────────────────────
 * كل ما يخص الزائر غير المسجّل في مكان واحد، ومستقل تماماً عن منطق المسجّلين
 * (ما يعتمد على أصدقاء ولا قصص ولا liveShared ولا HomeLiveStack):
 *
 *   1) GUEST_POLICY        — ضوابط الزائر وخصائصه المحدودة (المتفق عليها).
 *   2) GUEST_SIGNIN_LABEL  — نص زر الدخول بالعربي/الإنجليزي + حفظ لغة الزائر.
 *   3) GuestLiveStack      — عرض البثوث الحيّة (صوتي/مرئي) للزائر تحت الخط الأخضر.
 *
 * الربط: يُستورد في add-friend.tsx ويُعرض فقط عندما يكون الزائر غير مسجّل.
 * التشخيص: افتح الصفحة بـ ?guestdebug=1 لتظهر لوحة صغيرة توضّح حالة كل طلب.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Headphones } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';
import { pullLiveLocations, pullOnlineIds } from '@/lib/liveLocationSync';
import type { IAgoraRTCClient, IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng';

// ════════════════════════════════════════════════════════════════════════════
// 1) ضوابط الزائر
// ════════════════════════════════════════════════════════════════════════════
export type GuestAction =
  | 'viewPosts' | 'viewLiveCards' | 'listenLivePreview' | 'changeLanguage' | 'signIn'
  | 'like' | 'comment' | 'repost' | 'share' | 'favorite' | 'follow' | 'productShare'
  | 'composePost' | 'enterLive' | 'chat' | 'call' | 'stories' | 'settings';

export const GUEST_POLICY: Record<GuestAction, boolean> = {
  // ✅ المسموح للزائر
  viewPosts: true,          // يشاهد المنشورات (الصفحة مفتوحة للزوار)
  viewLiveCards: true,      // يرى البثوث الحيّة الصوتية والمرئية قبل التسجيل
  listenLivePreview: true,  // معاينة استماع فقط داخل البطاقة
  changeLanguage: true,     // اختيار Ar / En
  signIn: true,             // أيقونة تسجيل الدخول بدل الإعدادات
  // ⛔ الممنوع (يفتح تسجيل الدخول أو يُوقفه useGuestGuard)
  like: false,
  comment: false,
  repost: false,
  share: false,
  favorite: false,
  follow: false,
  productShare: false,
  composePost: false,       // النشر يحوّله إلى /settings
  enterLive: false,         // الضغط على بطاقة البث يحوّله لتسجيل الدخول
  chat: false,
  call: false,
  stories: false,
  settings: false,
};

/** الهيدر يبقى مرفوعاً (مخفياً) دائماً للزائر — لا يمكنه فتحه. */
export const GUEST_HEADER_LOCKED = true;
/** الزائر يبقى داخل صفحة المنشورات النصية ولا توجد له صفحة قصص يرجع لها. */
export const GUEST_TEXT_POSTS_LOCKED = true;
/** لوحة تعليقات البث العامة مخفية عن الزائر. */
export const GUEST_HIDE_PUBLIC_LIVE_COMMENTS = true;

export const guestCan = (a: GuestAction): boolean => !!GUEST_POLICY[a];

export const GUEST_SIGNIN_LABEL = {
  en: 'Sign in',
  ar: '\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644',
} as const;

const GUEST_LANG_KEY = 'stooorna_guest_lang';
export function readGuestLang(): 'en' | 'ar' {
  try { return localStorage.getItem(GUEST_LANG_KEY) === 'ar' ? 'ar' : 'en'; } catch { return 'en'; }
}
export function saveGuestLang(l: 'en' | 'ar'): void {
  try { localStorage.setItem(GUEST_LANG_KEY, l); } catch { /* */ }
}

// ════════════════════════════════════════════════════════════════════════════
// 2) قنوات البث (نفس التسمية المستخدمة عند صاحب البث)
// ════════════════════════════════════════════════════════════════════════════
const AGORA_APP_ID = '149ef04e839c4132a08efb49d717c436';

function hostSlug(hostId: string): string {
  const clean = String(hostId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  if (clean) return clean;
  let h = 0;
  const s = String(hostId || '');
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return String(Math.abs(h) % 100_000 || 1);
}
const voiceChannel = (id: string) => `stooorna-live-${hostSlug(id)}`;
const camChannel = (id: string) => `stooorna-livecam-${hostSlug(id)}`;

function readLocalActive(prefix: 'stooorna_live_active_' | 'stooorna_livecam_active_', id: string): boolean {
  try {
    const raw = localStorage.getItem(prefix + id);
    if (!raw) return false;
    const d = JSON.parse(raw) as { active?: boolean; at?: number };
    if (!d?.active) return false;
    if (d.at && Date.now() - d.at > 45_000) return false;
    return true;
  } catch { return false; }
}

// ════════════════════════════════════════════════════════════════════════════
// 3) اكتشاف البثوث للزائر
// ════════════════════════════════════════════════════════════════════════════
type GuestHost = { id: string; name: string | null; username: string | null; avatarUrl: string | null };
type GuestEntry = GuestHost & { kind: 'voice' | 'camera'; count: number; lastSeen: number; since: number };
type Diag = Record<string, string | number>;

const hostInfoCache = new Map<string, GuestHost>();
const KEEP_MS = 12_000; // نُبقي البطاقة ثواني بعد آخر رصد لتجاوز أي انقطاع لحظي

async function getJson(url: string, diag: Diag, key: string): Promise<any | null> {
  try {
    const r = await fetch(url, { credentials: 'include' });
    diag[key] = r.status;
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    diag[key] = 'ERR';
    return null;
  }
}

async function membersOf(channel: string, diag: Diag, key: string): Promise<number | null> {
  const d = await getJson(`/api/room?id=${encodeURIComponent(channel)}`, diag, key);
  if (!d) return null;
  return Array.isArray(d.members) ? d.members.length : 0;
}

async function discoverHosts(diag: Diag): Promise<GuestHost[]> {
  const map = new Map<string, GuestHost>();
  const add = (id: unknown, info?: Partial<GuestHost>) => {
    const k = String(id ?? '').trim();
    if (!k || k === 'guest') return;
    const prev = map.get(k) || hostInfoCache.get(k) || { id: k, name: null, username: null, avatarUrl: null };
    const next: GuestHost = {
      id: k,
      name: info?.name ?? prev.name ?? null,
      username: info?.username ?? prev.username ?? null,
      avatarUrl: info?.avatarUrl ?? prev.avatarUrl ?? null,
    };
    map.set(k, next);
    hostInfoCache.set(k, next);
  };

  // (أ) مسار اختياري مخصص للزوار من السيرفر إن وُجد: { hosts: [{id,name,username,avatarUrl}] }
  const g = await getJson('/api/guest/live', diag, 'guest_live');
  if (g && Array.isArray(g.hosts)) g.hosts.forEach((h: any) => add(h?.id, h));

  // (ب) أصحاب الحالات/القصص
  const st = await getJson('/api/status', diag, 'status');
  if (st && Array.isArray(st.statuses)) {
    st.statuses.forEach((s: any) => add(s?.userId, { name: s?.name ?? null, username: s?.username ?? null, avatarUrl: s?.avatarUrl ?? null }));
  }

  // (ج) الخريطة الحية + المتواجدون الآن
  try {
    const pings = await pullLiveLocations();
    diag.map_pings = Array.isArray(pings) ? pings.length : 0;
    (pings || []).forEach((p: any) => { if (p && p.id != null) add(p.id, { name: p.name ?? null, username: p.username ?? null, avatarUrl: p.avatarUrl ?? null }); });
  } catch { diag.map_pings = 'ERR'; }
  try {
    const onl = await pullOnlineIds();
    const arr = Array.from((onl as Iterable<unknown>) || []);
    diag.online_ids = arr.length;
    arr.forEach(x => add(x));
  } catch { diag.online_ids = 'ERR'; }

  // أسماء/صور ناقصة: نجلبها بشكل غير معطّل
  map.forEach(h => {
    if (h.name || h.username) return;
    void (async () => {
      const d = await getJson(`/api/users/${encodeURIComponent(h.id)}`, {}, '_');
      const u = d?.user ?? d;
      if (u) hostInfoCache.set(h.id, { id: h.id, name: u.name ?? null, username: u.username ?? null, avatarUrl: u.avatarUrl ?? u.image ?? null });
    })();
  });

  return Array.from(map.values()).slice(0, 60);
}

async function probeHost(h: GuestHost, diag: Diag): Promise<{ kind: 'voice' | 'camera'; count: number } | null> {
  const cam = await membersOf(camChannel(h.id), diag, 'room_cam');
  if (cam && cam > 0) return { kind: 'camera', count: cam };
  const voice = await membersOf(voiceChannel(h.id), diag, 'room_voice');
  if (voice && voice > 0) return { kind: 'voice', count: voice };
  if (readLocalActive('stooorna_livecam_active_', h.id)) return { kind: 'camera', count: 0 };
  if (readLocalActive('stooorna_live_active_', h.id)) return { kind: 'voice', count: 0 };
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// 4) بطاقات البث للزائر
// ════════════════════════════════════════════════════════════════════════════
const SILVER = 'linear-gradient(135deg,#f4f6f9 0%,#9ba3ae 28%,#e6e9ee 52%,#8a929d 78%,#f1f3f6 100%)';

type Conn = { kind: 'voice' | 'camera'; stop: () => Promise<void>; resume: () => void; setMuted: (m: boolean) => void };

export function GuestLiveStack({ enabled, onSignIn, offsetPx = 20 }: {
  enabled: boolean;
  onSignIn: () => void;
  /** المسافة تحت صف الأيقونات لينزل عند الخط الأخضر */
  offsetPx?: number;
}) {
  const [entries, setEntries] = useState<GuestEntry[]>([]);
  const entriesRef = useRef<GuestEntry[]>([]);
  entriesRef.current = entries;
  const [muted, setMuted] = useState<Set<string>>(() => new Set());
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const [anchorTop, setAnchorTop] = useState(0);
  const [diag, setDiag] = useState<Diag>({});
  const debug = typeof window !== 'undefined' && (() => {
    try { return new URLSearchParams(window.location.search).get('guestdebug') === '1' || localStorage.getItem('stooorna_guest_debug') === '1'; } catch { return false; }
  })();

  const connsRef = useRef<Map<string, Conn>>(new Map());
  const videoEls = useRef<Map<string, HTMLDivElement>>(new Map());
  const videoTracks = useRef<Map<string, any>>(new Map());
  const refCbs = useRef<Map<string, (el: HTMLDivElement | null) => void>>(new Map());
  const sinceRef = useRef<Map<string, number>>(new Map());

  const attachVideo = useCallback((id: string) => {
    const el = videoEls.current.get(id);
    const tr = videoTracks.current.get(id);
    if (el && tr) { try { tr.play(el, { fit: 'cover' } as any); } catch { /* */ } }
  }, []);
  const getVideoRef = (id: string) => {
    let f = refCbs.current.get(id);
    if (!f) {
      f = (el: HTMLDivElement | null) => {
        if (el) { videoEls.current.set(id, el); attachVideo(id); } else videoEls.current.delete(id);
      };
      refCbs.current.set(id, f);
    }
    return f;
  };

  // الموضع: مباشرة تحت صف الأيقونات (مربع Sign in) عند الخط الأخضر
  useEffect(() => {
    if (!enabled) return;
    const measure = () => {
      const el = (document.querySelector('[data-stooorna-header-icons]') || document.querySelector('[data-stooorna-header-grabber]')) as HTMLElement | null;
      if (!el) return;
      const b = Math.round(el.getBoundingClientRect().bottom) + offsetPx;
      setAnchorTop(prev => (Math.abs(prev - b) < 1 ? prev : b));
    };
    measure();
    const id = window.setInterval(measure, 250);
    window.addEventListener('resize', measure);
    return () => { window.clearInterval(id); window.removeEventListener('resize', measure); };
  }, [enabled, offsetPx]);

  // اكتشاف + فحص البثوث (مستقل عن المسجّلين)
  useEffect(() => {
    if (!enabled) { setEntries([]); return; }
    let cancelled = false;
    let busy = false;
    const tick = async () => {
      if (busy || cancelled) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      busy = true;
      const d: Diag = {};
      try {
        const hosts = await discoverHosts(d);
        d.candidates = hosts.length;
        const prevIds = new Set(entriesRef.current.map(e => e.id));
        const cand = new Map<string, GuestHost>();
        hosts.forEach(h => cand.set(h.id, h));
        entriesRef.current.forEach(e => { if (!cand.has(e.id)) cand.set(e.id, e); });
        const res = await Promise.all(Array.from(cand.values()).map(async h => ({ h, r: await probeHost(h, d) })));
        if (cancelled) return;
        const now = Date.now();
        const next: GuestEntry[] = [];
        const prevById = new Map(entriesRef.current.map(e => [e.id, e] as const));
        for (const { h, r } of res) {
          const info = hostInfoCache.get(h.id) || h;
          const prev = prevById.get(h.id);
          if (r) {
            if (!sinceRef.current.has(h.id)) sinceRef.current.set(h.id, now);
            next.push({ ...info, kind: r.kind, count: r.count, lastSeen: now, since: sinceRef.current.get(h.id)! });
          } else if (prev && now - prev.lastSeen < KEEP_MS) {
            next.push(prev);
          }
        }
        Array.from(sinceRef.current.keys()).forEach(k => { if (!next.some(e => e.id === k)) sinceRef.current.delete(k); });
        next.sort((a, b) => a.since - b.since);
        d.live = next.length;
        void prevIds;
        setEntries(prev => {
          const same = prev.length === next.length && prev.every((p, i) => p.id === next[i].id && p.kind === next[i].kind && p.count === next[i].count && p.name === next[i].name && p.avatarUrl === next[i].avatarUrl);
          return same ? prev : next;
        });
      } finally {
        busy = false;
        if (!cancelled) setDiag(d);
      }
    };
    void tick();
    const iv = window.setInterval(() => { void tick(); }, 3000);
    const onEvt = () => { void tick(); };
    window.addEventListener('stooorna:live-active', onEvt);
    window.addEventListener('stooorna:livecam-active', onEvt);
    window.addEventListener('storage', onEvt);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
      window.removeEventListener('stooorna:live-active', onEvt);
      window.removeEventListener('stooorna:livecam-active', onEvt);
      window.removeEventListener('storage', onEvt);
    };
  }, [enabled]);

  // معاينة استماع/مشاهدة فقط — أي فشل بالتوكن لا يخفي البطاقة
  const startPreview = (hostId: string, kind: 'voice' | 'camera'): Conn => {
    let stopped = false;
    let client: IAgoraRTCClient | null = null;
    const channel = kind === 'camera' ? camChannel(hostId) : voiceChannel(hostId);
    const audioTracks = new Set<any>();
    let isMuted = mutedRef.current.has(hostId);
    (async () => {
      try {
        const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
        if (stopped) return;
        try { (AgoraRTC as any).setLogLevel?.(3); } catch { /* */ }
        const c = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' } as any);
        client = c;
        const handle = async (ru: IAgoraRTCRemoteUser, mt: 'audio' | 'video') => {
          try {
            await c.subscribe(ru, mt);
            if (stopped) return;
            if (mt === 'audio') {
              audioTracks.add(ru.audioTrack);
              if (!isMuted) ru.audioTrack?.play();
            } else if (kind === 'camera') {
              videoTracks.current.set(hostId, ru.videoTrack);
              attachVideo(hostId);
            }
          } catch { /* */ }
        };
        c.on('user-published', (ru: IAgoraRTCRemoteUser, mt: string) => { if (mt === 'audio' || mt === 'video') void handle(ru, mt); });
        c.on('user-unpublished', (ru: IAgoraRTCRemoteUser, mt: string) => {
          if (mt === 'audio') { try { ru.audioTrack?.stop(); } catch { /* */ } }
        });
        const getToken = async (): Promise<string | null> => {
          try {
            const tr = await fetch(`/api/call/token?channel=${encodeURIComponent(channel)}&uid=0`, { credentials: 'include' });
            if (!tr.ok) return null;
            const td = await tr.json() as { token: string };
            return td.token || null;
          } catch { return null; }
        };
        const tok = await getToken();
        if (!tok) return; // بدون توكن: البطاقة تبقى ظاهرة بدون صوت/صورة
        c.on('token-privilege-will-expire', async () => {
          const t = await getToken();
          if (t && !stopped) { try { await c.renewToken(t); } catch { /* */ } }
        });
        await c.join(AGORA_APP_ID, channel, tok, null);
        if (stopped) { try { await c.leave(); } catch { /* */ } return; }
        for (const ru of c.remoteUsers) {
          if (ru.hasAudio) await handle(ru, 'audio');
          if (kind === 'camera' && ru.hasVideo) await handle(ru, 'video');
        }
      } catch (err) {
        console.warn('[GuestLive] preview skipped', err);
      }
    })();
    return {
      kind,
      resume: () => { if (isMuted) return; audioTracks.forEach(t => { try { if (t && !t.isPlaying) t.play(); } catch { /* */ } }); },
      setMuted: (m: boolean) => { isMuted = m; audioTracks.forEach(t => { try { if (m) t?.stop(); else t?.play(); } catch { /* */ } }); },
      stop: async () => {
        stopped = true;
        audioTracks.forEach(t => { try { t?.stop(); } catch { /* */ } });
        audioTracks.clear();
        videoTracks.current.delete(hostId);
        try { await client?.leave(); } catch { /* */ }
      },
    };
  };

  const key = !enabled ? '' : entries.map(e => `${e.id}:${e.kind}`).join('|');
  useEffect(() => {
    const want = new Map<string, 'voice' | 'camera'>();
    if (key) key.split('|').forEach(p => { const i = p.lastIndexOf(':'); want.set(p.slice(0, i), p.slice(i + 1) as 'voice' | 'camera'); });
    const conns = connsRef.current;
    Array.from(conns.entries()).forEach(([id, c]) => { if (want.get(id) !== c.kind) { conns.delete(id); void c.stop(); } });
    if (!GUEST_POLICY.listenLivePreview) return;
    want.forEach((kind, id) => { if (!conns.has(id)) conns.set(id, startPreview(id, kind)); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => { connsRef.current.forEach((c, id) => c.setMuted(muted.has(id))); }, [muted]);
  useEffect(() => {
    const conns = connsRef.current;
    return () => { conns.forEach(c => { void c.stop(); }); conns.clear(); };
  }, []);
  useEffect(() => {
    const resume = () => { connsRef.current.forEach(c => c.resume()); };
    window.addEventListener('pointerdown', resume, { passive: true });
    window.addEventListener('touchend', resume, { passive: true });
    return () => { window.removeEventListener('pointerdown', resume); window.removeEventListener('touchend', resume); };
  }, []);

  if (typeof document === 'undefined' || !enabled || !GUEST_POLICY.viewLiveCards) return null;
  const topPx = anchorTop || 150;

  return createPortal(
    <>
      <div
        style={{
          position: 'fixed', left: 0, right: 0, top: topPx, zIndex: 16,
          display: 'flex', flexDirection: 'column', gap: 10,
          padding: entries.length ? '8px 12px' : 0,
          maxHeight: `calc(100dvh - ${topPx}px - 104px)`,
          overflowY: 'auto', overscrollBehavior: 'contain', scrollbarWidth: 'none',
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence initial={false}>
          {entries.map(e => {
            const name = e.name || e.username || 'Host';
            const isMuted = muted.has(e.id);
            return (
              <motion.div
                key={e.id}
                layout
                initial={{ opacity: 0, y: -40, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -30, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                onClick={onSignIn}
                role="button"
                aria-label={e.kind === 'camera' ? `Video Live — ${name}` : `Voice Live — ${name}`}
                style={{
                  position: 'relative', width: '100%', flexShrink: 0,
                  aspectRatio: '1080 / 514', minHeight: 150, boxSizing: 'border-box',
                  borderRadius: 20, border: '2px solid transparent',
                  background: `radial-gradient(ellipse 80% 90% at 50% 100%, #0e2b30 0%, #0a1a1c 55%, #071011 100%) padding-box, ${SILVER} border-box`,
                  boxShadow: '0 8px 22px rgba(0,0,0,0.45), 0 0 10px rgba(200,205,215,0.22)',
                  overflow: 'hidden', cursor: 'pointer', color: '#cfe8e8',
                  display: 'flex', flexDirection: 'column', padding: '10px 12px 0',
                  pointerEvents: 'auto',
                }}
              >
                {e.kind === 'camera' && (
                  <div ref={getVideoRef(e.id)} style={{ position: 'absolute', inset: 0, zIndex: 0, opacity: 0.55 }} />
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative', zIndex: 2 }}>
                  <div style={{ position: 'relative', width: 46, height: 46, flexShrink: 0 }}>
                    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid #facc15', boxShadow: '0 0 10px rgba(250,204,21,0.55)', boxSizing: 'border-box', overflow: 'hidden' }}>
                      <UserAvatar name={e.name ?? ''} avatarUrl={e.avatarUrl} size={40} style={{ width: '100%', height: '100%', border: 'none', boxShadow: 'none', borderRadius: '50%', display: 'block' }} />
                    </div>
                    <span style={{ position: 'absolute', right: -1, bottom: -1, width: 14, height: 14, borderRadius: '50%', background: '#ef4444', border: '2px solid #0a1a1c' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 10, background: 'rgba(239,68,68,0.16)', border: '1px solid rgba(239,68,68,0.5)', color: '#ef4444', fontWeight: 800, fontSize: '0.7rem', flexShrink: 0 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />LIVE
                      </span>
                      <span style={{ fontWeight: 800, fontSize: '1rem', color: '#d3ecec', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    </div>
                    {e.username && (
                      <div style={{ marginTop: 3, fontSize: '0.72rem', color: 'rgba(150,200,200,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{String(e.username).replace(/^@/, '')}</div>
                    )}
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 999, background: 'rgba(0,188,212,0.12)', border: '1px solid rgba(0,188,212,0.35)', color: '#cfe8e8', fontWeight: 700, fontSize: '0.9rem', flexShrink: 0 }}>
                    <Users size={15} strokeWidth={2} />{e.count}
                  </span>
                  <button
                    type="button"
                    aria-label={isMuted ? 'Unmute live audio' : 'Mute live audio'}
                    onClick={ev => {
                      ev.stopPropagation();
                      setMuted(prev => { const n = new Set(prev); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n; });
                    }}
                    style={{ width: 42, height: 42, borderRadius: '50%', border: '1px solid rgba(239,68,68,0.55)', background: isMuted ? 'rgba(239,68,68,0.06)' : 'rgba(239,68,68,0.16)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }}
                  >
                    <Headphones size={19} strokeWidth={2.2} color="#ef4444" style={{ opacity: isMuted ? 0.55 : 1 }} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      {debug && (
        <div style={{ position: 'fixed', left: 6, right: 6, bottom: 6, zIndex: 9999, background: 'rgba(0,0,0,0.85)', color: '#8ff', fontSize: 11, padding: 8, borderRadius: 8, pointerEvents: 'none', direction: 'ltr', wordBreak: 'break-all' }}>
          GUEST LIVE DEBUG — {Object.entries(diag).map(([k, v]) => `${k}=${v}`).join('  ') || 'waiting…'}
          <div style={{ opacity: 0.7 }}>401/403 = السيرفر يمنع الزائر من هذا الطلب · candidates=0 = ما لقينا أصحاب بث · live=0 مع candidates&gt;0 = لا أحد في غرف البث</div>
        </div>
      )}
    </>,
    document.body,
  );
}

export default GuestLiveStack;
