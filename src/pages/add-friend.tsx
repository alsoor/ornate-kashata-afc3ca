import { add_friend } from 'virtual:content';
import { useState, useEffect, useRef, useMemo, useCallback, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import React from 'react';
import { useNavigate, useSearchParams } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import UserAvatar from '@/components/UserAvatar';
import { Search, UserPlus, Clock, Check, X, MessageCircle, Plus, Trash2, ShieldOff, Lock, LockKeyhole, Eye, EyeOff, Send, KeyRound, LogOut, Mic, MicOff, Image as ImageIcon, Images, Video, FileText, Play, Pause, Phone, PhoneOff, ArrowLeft, MoreVertical, Heart, Users, Repeat2, Hash, Inbox, Smile, Music, Camera, Zap, ZapOff, SlidersHorizontal, Download, Bookmark, Bell, PenLine, ClipboardPaste, Link2, Pin, PinOff, Volume2, VolumeX, ChevronLeft, ChevronRight, Settings, Radio, Building2, LogIn } from 'lucide-react';
import type { IAgoraRTCClient, IMicrophoneAudioTrack, IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng';
import { useSession } from '@/lib/auth/auth-client';
import { motion, AnimatePresence } from 'framer-motion';
import { usePresenceQuery } from '@/hooks/usePresence';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { useGlobalCall } from '@/components/GlobalCallProvider';
import { useGuestGuard } from '@/hooks/useGuestGuard';
interface SearchUser {
  id: string;
  name: string | null;
  username: string | null;
  email: string;
  avatarUrl?: string | null;
  friendStatus: 'pending' | 'accepted' | 'rejected' | null;
  iRequested: boolean;
}
interface IncomingRequest {
  id: number;
  requesterId: string;
  name: string | null;
  username: string | null;
  email: string | null;
  avatarUrl?: string | null;
  since: string | null;
}
interface Friend {
  id: number;
  friendId: string;
  name: string | null;
  username: string | null;
  email: string | null;
  avatarUrl?: string | null;
  since: string | null;
}
interface SecretChat {
  id: number;
  name: string;
  created_by: string;
  created_at: string | null;
  member_count: number;
}
// ── Design tokens — CSS colour aliases used throughout this page ──
// These are raw CSS values (gradients, rgba, hsl), not user-visible copy,
// so they intentionally live here rather than in virtual:content.
const PAGE_BG   = 'radial-gradient(ellipse 70% 60% at 50% 30%, #0d2a2e 0%, #0a1a1a 50%, #060e0e 100%)';
const CLR_HEADER_BG     = 'hsl(var(--background)/0.95)';
const CLR_PRIMARY       = '#00BCD4';
const CLR_PRIMARY_DIM   = 'rgba(0,188,212,0.35)';
const CLR_PRIMARY_FAINT = 'rgba(0,188,212,0.08)';
const CLR_PRIMARY_BORDER= 'rgba(0,188,212,0.2)';
const CLR_TEXT          = 'rgba(200,230,230,0.9)';
const CLR_TEXT_DIM      = 'rgba(150,200,200,0.5)';
const CLR_CARD_BG       = 'rgba(0,188,212,0.05)';
const CLR_CARD_BORDER   = 'rgba(0,188,212,0.12)';
const CLR_INPUT_BG      = 'rgba(0,30,35,0.8)';
const CLR_NAV_BORDER    = 'rgba(0,188,212,0.08)';
const CLR_TAB_ACTIVE    = 'rgba(0,188,212,0.15)';
const CLR_TAB_BORDER    = 'rgba(0,188,212,0.3)';

const CLR_POST_BORDER   = '#0d3d33';

// ── بث صوتي نشط: أيقونة حمراء وامضة لكل البثوث ─────────────────────────────
function liveChannelForHost(hostId: string): string {
  const clean = String(hostId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  if (clean) return `stooorna-live-${clean}`;
  let h = 0;
  const s = String(hostId || '');
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  const uid = Math.abs(h) % 100_000 || 1;
  return `stooorna-live-${uid}`;
}

function readLocalLiveActive(hostId: string): boolean {
  try {
    const raw = localStorage.getItem(`stooorna_live_active_${hostId}`);
    if (!raw) return false;
    const data = JSON.parse(raw) as { active?: boolean; at?: number };
    if (!data?.active) return false;
    if (data.at && Date.now() - data.at > 20_000) return false;
    return true;
  } catch {
    return false;
  }
}

/** هل يوجد بث صوتي شغّال لهذا الحساب الآن؟ */
function useLiveBroadcastActive(hostId: string | null | undefined): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!hostId) {
      setActive(false);
      return;
    }
    let cancelled = false;
    const channel = liveChannelForHost(hostId);

    const apply = (v: boolean) => {
      if (!cancelled) setActive(v);
    };

    const checkLocal = () => apply(readLocalLiveActive(hostId));

    const checkRoom = async () => {
      if (readLocalLiveActive(hostId)) {
        apply(true);
      }
      try {
        const r = await fetch(`/api/room?id=${encodeURIComponent(channel)}`, { credentials: 'include' });
        if (!r.ok) {
          checkLocal();
          return;
        }
        const data = await r.json() as { members?: unknown[] };
        const n = Array.isArray(data.members) ? data.members.length : 0;
        if (n > 0) apply(true);
        else apply(readLocalLiveActive(hostId));
      } catch {
        checkLocal();
      }
    };

    checkRoom();
    const interval = window.setInterval(checkRoom, 4000);

    const onEvt = (e: Event) => {
      const d = (e as CustomEvent).detail as { hostId?: string; active?: boolean } | undefined;
      if (!d || !d.hostId) return;
      if (String(d.hostId) === String(hostId)) apply(!!d.active);
    };
    window.addEventListener('stooorna:live-active', onEvt);

    const onStorage = (e: StorageEvent) => {
      if (e.key === `stooorna_live_active_${hostId}`) checkLocal();
    };
    window.addEventListener('storage', onStorage);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('stooorna:live-active', onEvt);
      window.removeEventListener('storage', onStorage);
    };
  }, [hostId]);

  return active;
}


// ── Notification sound design — small synthesized tones (water-drop / bubble mixes) ──
// No audio files needed: each event gets its own tiny Web Audio mix so the tones stay distinct.
let sfxCtx: AudioContext | null = null;
function getSfxCtx(): AudioContext | null {
  try {
    if (!sfxCtx) {
      const Ctx: typeof AudioContext | undefined = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return null;
      sfxCtx = new Ctx();
    }
    if (sfxCtx.state === 'suspended') void sfxCtx.resume();
    return sfxCtx;
  } catch { return null; }
}
function sfxTone(ctx: AudioContext, startTime: number, freq: number, duration: number, opts: { type?: OscillatorType; peakGain?: number; glideTo?: number } = {}) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, startTime);
  if (opts.glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(opts.glideTo, 20), startTime + duration);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(opts.peakGain ?? 0.22, startTime + Math.min(0.03, duration * 0.25));
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.03);
}
/** نشر بوست جديد — نقرتا "قطرة ماء" صاعدتان ولمّاعتان */
function playNewPostSound() {
  const ctx = getSfxCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  sfxTone(ctx, t, 1100, 0.16, { type: 'sine', peakGain: 0.26, glideTo: 550 });
  sfxTone(ctx, t + 0.1, 1500, 0.18, { type: 'sine', peakGain: 0.26, glideTo: 720 });
}
/** إشعار وصول محتوى جديد (بانر New Post) — رنة جرسية ناعمة بنغمتين */
function playNotificationSound() {
  const ctx = getSfxCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  sfxTone(ctx, t, 1320, 0.32, { type: 'sine', peakGain: 0.2 });
  sfxTone(ctx, t, 1324, 0.32, { type: 'sine', peakGain: 0.12 });
  sfxTone(ctx, t + 0.16, 990, 0.3, { type: 'sine', peakGain: 0.16 });
}
/** وصول مسج شير — "قطرة تسقط" ثم "فقاعة" صغيرة تصعد */
function playShareArrivedSound() {
  const ctx = getSfxCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  sfxTone(ctx, t, 700, 0.14, { type: 'sine', peakGain: 0.24, glideTo: 260 });
  sfxTone(ctx, t + 0.12, 340, 0.22, { type: 'triangle', peakGain: 0.18, glideTo: 680 });
}
/** وجود أحد على المايك — نقرة جرس هاتف قصيرة، أقل من ثانيتين، تُشغَّل مرة واحدة وتختفي */
/** رنة اتصال واردة — نغمة "رنين جوال" حقيقية: مقطع سريع من أربع نغمات صاعدة (زي رنات
 *  الجوالات الافتراضية)، يتكرر مرتين متتاليتين لكل دفعة رنين. الدفعة نفسها تتكرر من الخارج
 *  (انظر ringIntervalRef بمكوّن GlobeVoiceControl) لين يرد المستخدم أو ينقطع الاتصال */
function playIncomingCallRing() {
  const ctx = getSfxCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
  const playTrill = (start: number) => {
    notes.forEach((freq, i) => {
      sfxTone(ctx, start + i * 0.09, freq, 0.16, { type: 'triangle', peakGain: 0.26 });
    });
  };
  playTrill(t);
  playTrill(t + 0.42);
}

// ── ScVoiceBubble — voice player for secret chat ──────────────────────────────
const SC_BARS = 24;
function ScVoiceBubble({
  url,
  duration,
  isMe,
  primaryColor,
  primaryBorder,
  textDim
}: {
  url: string;
  duration: number | null;
  isMe: boolean;
  primaryColor: string;
  primaryBorder: string;
  textDim: string;
}) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  function toggle() {
    if (!audioRef.current) {
      audioRef.current = new Audio(url);
      audioRef.current.ontimeupdate = () => {
        const a = audioRef.current!;
        setProgress(a.duration ? a.currentTime / a.duration : 0);
        setCurrentTime(a.currentTime);
      };
      audioRef.current.onended = () => {
        setPlaying(false);
        setProgress(0);
        setCurrentTime(0);
      };
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  }
  const barHeights = useMemo(() => {
    let seed = 0;
    for (let i = 0; i < url.length; i++) seed = seed * 31 + url.charCodeAt(i) & 0xffff;
    return Array.from({
      length: SC_BARS
    }, (_, i) => {
      seed = seed * 1664525 + 1013904223 & 0xffff;
      const base = 0.25 + seed / 0xffff * 0.75;
      const edge = Math.min(i, SC_BARS - 1 - i) / (SC_BARS / 4);
      return Math.max(0.2, base * Math.min(1, edge));
    });
  }, [url]);
  const totalSecs = duration ?? 0;
  const displaySecs = playing ? currentTime : totalSecs;
  const label = `${Math.floor(displaySecs / 60)}:${String(Math.floor(displaySecs % 60)).padStart(2, '0')}`;
  return <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 160,
    maxWidth: 220
  }}>
      <motion.button whileTap={{
      scale: 0.88
    }} onClick={toggle} style={{
      width: 34,
      height: 34,
      borderRadius: '50%',
      flexShrink: 0,
      background: isMe ? 'rgba(0,188,212,0.2)' : 'rgba(255,255,255,0.08)',
      border: `1.5px solid ${primaryBorder}`,
      color: primaryColor,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
        {playing ? <Pause size={13} strokeWidth={2.5} /> : <Play size={13} strokeWidth={2.5} />}
      </motion.button>
      <div style={{
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      height: 28
    }}>
        {barHeights.map((h, i) => {
        const filled = i / SC_BARS <= progress;
        return <motion.div key={i} animate={playing && Math.abs(i / SC_BARS - progress) < 1 / SC_BARS ? {
          scaleY: [1, 1.4, 0.8, 1]
        } : {
          scaleY: 1
        }} transition={{
          duration: 0.4,
          repeat: playing ? Infinity : 0,
          ease: 'easeInOut' as const
        }} style={{
          flex: 1,
          height: `${h * 100}%`,
          borderRadius: 2,
          background: filled ? primaryColor : isMe ? 'rgba(0,188,212,0.2)' : 'rgba(255,255,255,0.12)',
          transformOrigin: 'center',
          transition: 'background 0.1s'
        }} />;
      })}
      </div>
      <span style={{
      color: textDim,
      fontSize: '0.62rem',
      flexShrink: 0,
      minWidth: 26,
      textAlign: 'right'
    }}>{label}</span>
    </div>;
}
// ── Story types ───────────────────────────────────────────────────────────────
interface StoryItem {
  id: number;
  mediaUrl: string;
  mediaType: string;
  duration: number;
  expiresAt: string;
  createdAt: string;
  seen: boolean;
  audioUrl?: string | null;
  overlayText?: string | null;
  overlayColor?: string | null;
  overlayX?: number | null;   // 0–1 fraction of container width
  overlayY?: number | null;   // 0–1 fraction of container height
  musicBadgeX?: number | null;
  musicBadgeY?: number | null;
  musicBadgeScale?: number | null;
}
interface StoryGroup {
  userId: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  items: StoryItem[];
}

// ── Post (feed) types ─────────────────────────────────────────────────────────
interface PostComment {
  id: number;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  text: string;
  parentCommentId?: number | null;
  createdAt: string;
}
interface PostItem {
  id: number;
  authorId: string;
  authorName: string;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  text: string;
  mediaUrl: string | null;
  mediaType: 'image' | 'video' | null;
  mediaUrls?: string[];
  mediaTypes?: ('image' | 'video')[];
  // text = منشور نصي (قد يحمل وسائط مرفقة)، photos/videos = أقسام الوسائط المستقلة فقط
  audience?: 'text' | 'public' | string | null;
  destination?: 'text' | 'photos' | 'videos' | string | null;
  hashtags: string[];
  createdAt: string;
  likesCount: number;
  likedByMe: boolean;
  repostsCount: number;
  repostedByMe: boolean;
  commentsCount: number;
  // Present only on a feed entry that represents someone reposting this post —
  // used to render the "X reposted this" ribbon above the (otherwise unchanged) post card.
  repostedBy?: { id: string; name: string | null; username: string | null; avatarUrl: string | null } | null;
  repostedAt?: string | null;
  repostKey?: string;
  // هل حساب الناشر خاص (Private)؟ يحدد سلوك زر "Follow": لو false (عام) تتم
  // الإضافة فورًا بلا انتظار، ولو true تُرسل كطلب صداقة بانتظار القبول. اختياري
  // لأن الحقل قد لا يكون مضافًا بعد من طرف الـ API — نفترض الحذر (انتظار) لو غاب.
  authorIsPrivate?: boolean;
}

// ── Product ad — plain Arabic text only (server rejected JSON / special markers) ──
// Format stored in post.text:
//   LINE1: title
//   optional "السعر: …"
//   then details + extra paragraphs separated by blank lines
interface ProductAdData {
  __productAd: 1;
  title: string;
  details: string;
  price: string;
  extras: string[];
}
function buildProductPostText(data: { title: string; details: string; price: string; extras: string[] }): string {
  const title = (data.title || 'منتج').trim();
  const price = (data.price || '').trim();
  const details = (data.details || '').trim();
  const extras = (data.extras || []).map(s => s.trim()).filter(Boolean);
  const parts: string[] = [title];
  if (price) parts.push(`السعر: ${price}`);
  if (details) parts.push(details);
  for (const ex of extras) parts.push(ex);
  return parts.join('\n\n');
}
function parseProductAd(text: string | null | undefined): ProductAdData | null {
  if (!text) return null;
  const trimmed = text.trim();
  // legacy JSON / marker formats from earlier builds
  if (trimmed.startsWith('{')) {
    try {
      const first = trimmed.split('\n')[0];
      const o = JSON.parse(first.startsWith('{') ? first : trimmed) as ProductAdData;
      if (o && (o as any).__productAd === 1) return o;
    } catch { /* ignore */ }
    try {
      const o = JSON.parse(trimmed) as ProductAdData;
      if (o && (o as any).__productAd === 1) return o;
    } catch { /* ignore */ }
  }
  const marker = trimmed.match(/⟦stooorna-product:([A-Za-z0-9+/=]+)⟧\s*$/);
  if (marker) {
    try {
      const json = decodeURIComponent(escape(atob(marker[1])));
      const o = JSON.parse(json) as ProductAdData;
      if (o && o.__productAd === 1) return o;
    } catch { /* ignore */ }
  }
  // plain format produced by buildProductPostText
  const body = trimmed.replace(/\n*⟦stooorna-product:[A-Za-z0-9+/=]+⟧\s*$/, '').trim();
  if (!body) return null;
  const blocks = body.split(/\n\n+/).map(b => b.trim()).filter(Boolean);
  if (blocks.length === 0) return null;
  const title = blocks[0];
  let price = '';
  const rest: string[] = [];
  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i];
    if (!price && /^السعر\s*:/.test(b)) {
      price = b.replace(/^السعر\s*:\s*/, '').trim();
    } else {
      rest.push(b);
    }
  }
  return {
    __productAd: 1,
    title,
    price,
    details: rest[0] || '',
    extras: rest.slice(1),
  };
}
function productAdDisplayTitle(post: PostItem): string {
  const ad = parseProductAd(post.text);
  if (ad?.title?.trim()) return ad.title.trim();
  return (post.text || '').split('\n')[0]?.trim().slice(0, 80) || 'إعلان';
}

/** True when post has real caption text (not media-only). Used to enable three-lines. */
function postHasVisibleCaption(post: PostItem | null | undefined): boolean {
  if (!post) return false;
  const raw = (post.text || '').trim();
  if (!raw) return false;
  const ad = parseProductAd(raw);
  if (ad) {
    if ((ad.title || '').trim()) return true;
    if ((ad.details || '').trim()) return true;
    if ((ad.price || '').trim()) return true;
    if ((ad.extras || []).some(x => (x || '').trim())) return true;
    return false;
  }
  const cleaned = raw.replace(/\n*\u27E6stooorna-product:[A-Za-z0-9+/=]+\u27E7\s*$/u, '').trim();
  return cleaned.length > 0;
}


/** استفسار عن منتج — يُرسل كرسالة شات للشركة ويظهر في صندوق شات الشركات */
const PRODUCT_INQUIRY_PREFIX = '__PRODUCT_INQUIRY__';
export type ProductInquiryPayload = {
  postId: number;
  title: string;
  price: string;
  details: string;
  imageUrl: string;
  question: string;
  companyId: string;
  companyName: string;
  companyUsername?: string | null;
  companyAvatar?: string | null;
};
export function buildProductInquiryBody(data: ProductInquiryPayload): string {
  return PRODUCT_INQUIRY_PREFIX + JSON.stringify(data);
}
export function parseProductInquiry(body: string | null | undefined): ProductInquiryPayload | null {
  if (!body || typeof body !== 'string' || !body.startsWith(PRODUCT_INQUIRY_PREFIX)) return null;
  try {
    const o = JSON.parse(body.slice(PRODUCT_INQUIRY_PREFIX.length)) as ProductInquiryPayload;
    if (o && o.postId && o.companyId) return o;
  } catch { /* ignore */ }
  return null;
}
const PRODUCT_INQUIRY_THREADS_KEY = 'stooorna_product_inquiry_threads';
/** خيوط استفسار نشطة عند المستخدم — لمصفرة أيقونة الشير عند رد الشركة */
function loadProductInquiryThreads(): Record<string, { companyId: string; hasReply: boolean; postId: number }> {
  try {
    const raw = localStorage.getItem(PRODUCT_INQUIRY_THREADS_KEY);
    const o = raw ? JSON.parse(raw) : {};
    return o && typeof o === 'object' ? o : {};
  } catch { return {}; }
}
function saveProductInquiryThread(postId: number, companyId: string, hasReply = false) {
  try {
    const all = loadProductInquiryThreads();
    all[String(postId)] = { companyId, hasReply, postId };
    localStorage.setItem(PRODUCT_INQUIRY_THREADS_KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent('stooorna:product-inquiry', { detail: all }));
  } catch { /* */ }
}
function productInquiryShareAlert(postId: number): boolean {
  const t = loadProductInquiryThreads()[String(postId)];
  return !!(t && t.hasReply);
}
function clearProductInquiryReplyFlag(postId: number) {
  try {
    const all = loadProductInquiryThreads();
    if (all[String(postId)]) {
      all[String(postId)] = { ...all[String(postId)], hasReply: false };
      localStorage.setItem(PRODUCT_INQUIRY_THREADS_KEY, JSON.stringify(all));
      window.dispatchEvent(new CustomEvent('stooorna:product-inquiry', { detail: all }));
    }
  } catch { /* */ }
}

const USER_SHARE_INBOX_KEY = (uid: string) => `stooorna_user_share_inbox_${uid}`;
type UserShareInboxItem = {
  id: string;
  fromId: string;
  fromName: string | null;
  fromUsername: string | null;
  fromAvatar: string | null;
  post: PostItem;
  note: string;
  at: number;
  read: boolean;
};
function loadUserShareInbox(uid: string): UserShareInboxItem[] {
  try {
    const raw = localStorage.getItem(USER_SHARE_INBOX_KEY(uid));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}
function saveUserShareInbox(uid: string, list: UserShareInboxItem[]) {
  try {
    localStorage.setItem(USER_SHARE_INBOX_KEY(uid), JSON.stringify(list.slice(0, 100)));
    window.dispatchEvent(new CustomEvent('stooorna:user-share-inbox', { detail: { userId: uid, list } }));
  } catch { /* */ }
}
function pushUserShareInbox(toUserId: string, item: Omit<UserShareInboxItem, 'id' | 'at' | 'read'> & { id?: string }) {
  if (!toUserId) return;
  const list = loadUserShareInbox(toUserId);
  const next: UserShareInboxItem = {
    id: item.id || `ushare-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fromId: item.fromId,
    fromName: item.fromName ?? null,
    fromUsername: item.fromUsername ?? null,
    fromAvatar: item.fromAvatar ?? null,
    post: item.post,
    note: item.note || '',
    at: Date.now(),
    read: false,
  };
  saveUserShareInbox(toUserId, [next, ...list.filter(x => x.id !== next.id)]);
  // قائمة Chat Friends في الشريط السفلي — عند الطرفين
  const upsertFriendBar = (ownerId: string, peer: { id: string; name: string | null; username: string | null; avatarUrl: string | null; text: string; unread: number }) => {
    if (!ownerId || !peer.id) return;
    try {
      const key = `stooorna_user_friend_chats_${ownerId}`;
      const raw = localStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(arr) ? arr : [];
      const row = {
        id: peer.id,
        name: peer.name,
        username: peer.username,
        avatarUrl: peer.avatarUrl,
        lastMessage: peer.text,
        at: Date.now(),
        unread: peer.unread,
        kind: 'friend',
        postId: next.post?.id ?? null,
        postText: (next.post?.text || '').slice(0, 400),
        note: next.note || '',
        mediaItems: (() => {
          const post = next.post as any;
          if (!post) return [];
          const urls = Array.isArray(post.mediaUrls) && post.mediaUrls.length ? post.mediaUrls : (post.mediaUrl ? [post.mediaUrl] : []);
          const types = Array.isArray(post.mediaTypes) && post.mediaTypes.length ? post.mediaTypes : (post.mediaType ? [post.mediaType] : []);
          return urls.filter(Boolean).map((url: string, i: number) => {
            const ty = String(types[i] || '').toLowerCase();
            const kind = ty.includes('video') || /\.(mp4|webm|mov)(\?|$)/i.test(url) ? 'video'
              : ty.includes('pdf') || /\.pdf(\?|$)/i.test(url) ? 'pdf' : 'image';
            return { url, type: kind };
          });
        })(),
      };
      const out = [row, ...list.filter((x: any) => x.id !== peer.id)].slice(0, 200);
      localStorage.setItem(key, JSON.stringify(out));
      window.dispatchEvent(new CustomEvent('stooorna:user-friend-chats', { detail: { userId: ownerId, list: out, yellowBlink: peer.unread > 0 } }));
      window.dispatchEvent(new CustomEvent('stooorna:bottom-chat-blink', { detail: { target: 'user', userId: ownerId, yellow: peer.unread > 0 } }));
    } catch { /* */ }
  };
  upsertFriendBar(toUserId, {
    id: next.fromId,
    name: next.fromName,
    username: next.fromUsername,
    avatarUrl: next.fromAvatar,
    text: next.note || (next.post?.text || 'مشاركة منشور').slice(0, 80),
    unread: 1,
  });
  if (next.fromId && next.fromId !== toUserId) {
    upsertFriendBar(next.fromId, {
      id: toUserId,
      name: null,
      username: null,
      avatarUrl: null,
      text: next.note || 'تم إرسال المشاركة',
      unread: 0,
    });
  }
}



type ShareThreadMsg = {
  id: string;
  fromId: string;
  type: 'text' | 'voice' | 'image' | 'video';
  body: string;
  duration?: number | null;
  at: number;
};
const SHARE_THREAD_KEY = (a: string, b: string, postId: string | number) => {
  const [x, y] = [String(a), String(b)].sort();
  return `stooorna_share_thread_${x}_${y}_${postId}`;
};
function loadShareThread(a: string, b: string, postId: string | number): ShareThreadMsg[] {
  try {
    const raw = localStorage.getItem(SHARE_THREAD_KEY(a, b, postId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}
function saveShareThread(a: string, b: string, postId: string | number, list: ShareThreadMsg[]) {
  try {
    localStorage.setItem(SHARE_THREAD_KEY(a, b, postId), JSON.stringify(list.slice(-200)));
    window.dispatchEvent(new CustomEvent('stooorna:share-thread', { detail: { a, b, postId } }));
  } catch { /* */ }
}
function pushShareThreadMsg(a: string, b: string, postId: string | number, msg: Omit<ShareThreadMsg, 'id' | 'at'> & { id?: string }) {
  const list = loadShareThread(a, b, postId);
  const next: ShareThreadMsg = {
    id: msg.id || `stm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fromId: msg.fromId,
    type: msg.type,
    body: msg.body,
    duration: msg.duration ?? null,
    at: Date.now(),
  };
  saveShareThread(a, b, postId, [...list, next]);
  return next;
}

// ── Shared-posts inbox types — posts someone sent me via the share sheet ──────
interface SharedPostComment {
  id: number;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  text: string;
  parentCommentId?: number | null;
  createdAt: string;
}
interface PostInteractionItem {
  id: number;
  type: 'repost' | 'share';
  title: string;
  body: string;
  url: string;
  read: boolean;
  createdAt: string;
}

interface SharedPostItem {
  id: number; // share id
  post: PostItem;
  senderId: string;
  senderName: string | null;
  senderUsername: string | null;
  senderAvatarUrl: string | null;
  createdAt: string;
  read: boolean;
}

// ── Story-comment inbox types — comments friends left on one of my stories ────
interface StoryComment {
  id: number;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  text: string;
  parentCommentId?: number | null;
  createdAt: string;
  likesCount: number;
  likedByMe: boolean;
}
interface StoryCommentThread {
  storyId: number; // the story item that received the comment(s)
  mediaUrl: string;
  mediaType: string;
  createdAt: string; // when the story itself was posted
  expiresAt: string; // the thread disappears from the box 24h after this
  commentsCount: number;
  lastComment: { text: string; authorName: string; createdAt: string } | null;
  read: boolean;
}

// ── Post-comment inbox types — comments friends left on one of my video/photo posts,
//    shown in the same inbox box as the story-comment threads above, same 24h auto-expiry. ──
interface PostCommentThread {
  post: PostItem; // the full post — reused directly by loadComments/PostDetailPage to open it
  expiresAt: string; // the thread disappears from the box 24h after the post was published
  commentsCount: number;
  lastComment: { text: string; authorName: string; createdAt: string } | null;
  read: boolean;
}

// ── MusicSearchModal — global music search & favorites (iTunes Search API, free 30s previews, no API key).
// Ported here (self-contained) so the music icon on this page's profile header works on its own,
// without depending on RecorderScreen being mounted. Same component/behavior as the one there. ──
export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  previewUrl: string;
}
// ── musicPlayerStore — global music-player singleton living OUTSIDE the React tree ──
// It used to live as useState/useRef inside AddFriendPage, so its <audio> element got
// destroyed (and the song cut off) the instant the user navigated to another screen and
// this page unmounted. Module-scope state and a plain `new Audio()` (never attached to
// the DOM) aren't tied to any component's lifecycle — as long as the app doesn't do a
// full page reload, this JS module stays loaded, so the song keeps playing in the
// background no matter which page the user browses to next. Any component (here, and any
// other page that later imports this) can read this store with useSyncExternalStore. ──
type MusicPlayerListener = () => void;
const musicPlayerStore = (() => {
  let audio: HTMLAudioElement | null = null;
  let currentTrack: MusicTrack | null = null;
  let isPlaying = false;
  let snapshot: { currentTrack: MusicTrack | null; isPlaying: boolean } = { currentTrack, isPlaying };
  const listeners = new Set<MusicPlayerListener>();

  function publish() {
    snapshot = { currentTrack, isPlaying };
    listeners.forEach(l => l());
  }
  function getAudio(): HTMLAudioElement | null {
    if (typeof window === 'undefined') return null;
    if (!audio) {
      audio = new Audio();
      audio.onplay = () => { isPlaying = true; publish(); };
      audio.onpause = () => { isPlaying = false; publish(); };
      audio.onended = () => { isPlaying = false; publish(); };
    }
    return audio;
  }
  return {
    subscribe(listener: MusicPlayerListener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getSnapshot() { return snapshot; },
    playTrack(track: MusicTrack) {
      const a = getAudio();
      if (!a) return;
      if (currentTrack?.id === track.id) {
        // نفس المقطع: تبديل تشغيل/إيقاف بدل إعادة التحميل
        if (a.paused) void a.play(); else a.pause();
        return;
      }
      currentTrack = track;
      a.src = track.previewUrl;
      void a.play();
      publish();
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        try {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title,
            artist: track.artist,
            artwork: track.artwork ? [{ src: track.artwork, sizes: '100x100', type: 'image/jpeg' }] : [],
          });
        } catch { /* mediaSession optional */ }
      }
    },
    stop() {
      const a = getAudio();
      if (a) { a.pause(); a.currentTime = 0; a.src = ''; }
      currentTrack = null;
      isPlaying = false;
      publish();
    },
    setupMediaSessionHandlers() {
      if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
      try {
        navigator.mediaSession.setActionHandler('play', () => { void getAudio()?.play(); });
        navigator.mediaSession.setActionHandler('pause', () => { getAudio()?.pause(); });
        navigator.mediaSession.setActionHandler('stop', () => musicPlayerStore.stop());
      } catch { /* mediaSession optional */ }
    },
  };
})();
interface MusicSearchModalProps {
  onClose: () => void;
  currentTrack: MusicTrack | null;
  isPlaying: boolean;
  onPlayTrack: (track: MusicTrack) => void;
  favorites: MusicTrack[];
  onToggleFavorite: (track: MusicTrack) => void;
  // ── Pinned track (profile "Get" button) — id of the track currently pinned to my
  // profile (or null), plus handlers to pin/unpin. Pinning never touches playback or
  // favorites; it's a separate action shown as its own small button per row. ──
  pinnedTrackId: string | null;
  onPinTrack: (track: MusicTrack) => void;
  onUnpinTrack: () => void;
}
function MusicSearchModal({ onClose, currentTrack, isPlaying, onPlayTrack, favorites, onToggleFavorite, pinnedTrackId, onPinTrack, onUnpinTrack }: MusicSearchModalProps) {
  const [musicModalTab, setMusicModalTab] = useState<'search' | 'favorites'>('search');
  const [musicModalQuery, setMusicModalQuery] = useState('');
  const [musicModalResults, setMusicModalResults] = useState<MusicTrack[]>([]);
  const [musicModalSearching, setMusicModalSearching] = useState(false);
  const [musicModalError, setMusicModalError] = useState<string | null>(null);
  const musicSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runMusicSearch = useCallback((term: string) => {
    if (!term.trim()) { setMusicModalResults([]); setMusicModalError(null); setMusicModalSearching(false); return; }
    setMusicModalSearching(true);
    setMusicModalError(null);
    fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=25`)
      .then((res) => res.json())
      .then((data: { results?: Array<{ trackId: number; trackName: string; artistName: string; artworkUrl100?: string; previewUrl?: string }> }) => {
        const items: MusicTrack[] = (data.results ?? [])
          .filter((r) => !!r.previewUrl)
          .map((r) => ({
            id: String(r.trackId),
            title: r.trackName,
            artist: r.artistName,
            artwork: r.artworkUrl100 ?? '',
            previewUrl: r.previewUrl as string,
          }));
        setMusicModalResults(items);
      })
      .catch(() => setMusicModalError('تعذر البحث، تحقق من الاتصال بالإنترنت'))
      .finally(() => setMusicModalSearching(false));
  }, []);
  function handleMusicQueryChange(v: string) {
    setMusicModalQuery(v);
    if (musicSearchDebounceRef.current) clearTimeout(musicSearchDebounceRef.current);
    musicSearchDebounceRef.current = setTimeout(() => runMusicSearch(v), 450);
  }
  const isMusicFav = (id: string) => favorites.some((f) => f.id === id);
  const musicList = musicModalTab === 'search' ? musicModalResults : favorites;
  return createPortal(
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2147483000,
        background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 18,
        overflow: 'hidden',
      }}
    >
      <motion.div
        role="presentation"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
        style={{
          width: '100%', maxWidth: 380,
          maxHeight: '78vh',
          display: 'flex', flexDirection: 'column',
          background: 'rgba(12,10,8,0.97)',
          border: '1px solid rgba(0,188,212,0.28)',
          borderRadius: 20,
          boxShadow: '0 12px 50px rgba(0,0,0,0.55), 0 0 30px rgba(0,188,212,0.1)',
          overflow: 'hidden',
        }}
      >
        {/* header + search input */}
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Music size={16} color="#00BCD4" />
              الموسيقى
            </span>
            <button
              onClick={onClose}
              style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 999, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <X size={14} color="rgba(255,255,255,0.7)" />
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={14} color="rgba(255,255,255,0.4)" style={{ position: 'absolute', top: '50%', right: 12, transform: 'translateY(-50%)' }} />
            <input
              autoFocus
              value={musicModalQuery}
              onChange={(e) => handleMusicQueryChange(e.target.value)}
              placeholder="ابحث عن أغنية أو فنان..."
              style={{
                width: '100%', padding: '9px 36px 9px 12px',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff', fontSize: '0.78rem', outline: 'none',
              }}
            />
          </div>
        </div>
        {/* tabs: بحث / مفضلة */}
        <div style={{ display: 'flex', padding: '8px 14px 0' }}>
          {(['search', 'favorites'] as const).map((tKey) => (
            <button
              key={tKey}
              onClick={() => setMusicModalTab(tKey)}
              style={{
                flex: 1, padding: '8px 0', textAlign: 'center',
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: musicModalTab === tKey ? '#00BCD4' : 'rgba(255,255,255,0.4)',
                fontSize: '0.72rem', fontWeight: 700,
                borderBottom: musicModalTab === tKey ? '2px solid #00BCD4' : '2px solid transparent',
              }}
            >
              {tKey === 'search' ? 'بحث' : `المفضلة${favorites.length ? ` (${favorites.length})` : ''}`}
            </button>
          ))}
        </div>
        {/* list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px 14px' }}>
          {musicModalTab === 'search' && musicModalSearching && (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', textAlign: 'center', padding: '20px 0' }}>جاري البحث...</p>
          )}
          {musicModalTab === 'search' && !musicModalSearching && musicModalError && (
            <p style={{ color: 'rgba(239,68,68,0.8)', fontSize: '0.72rem', textAlign: 'center', padding: '20px 0' }}>{musicModalError}</p>
          )}
          {musicModalTab === 'search' && !musicModalSearching && !musicModalError && musicModalQuery.trim() && musicList.length === 0 && (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', textAlign: 'center', padding: '20px 0' }}>لا توجد نتائج</p>
          )}
          {musicModalTab === 'search' && !musicModalQuery.trim() && (
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem', textAlign: 'center', padding: '20px 0' }}>اكتب اسم أغنية أو فنان للبحث</p>
          )}
          {musicModalTab === 'favorites' && favorites.length === 0 && (
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem', textAlign: 'center', padding: '20px 0' }}>لا توجد أغاني في المفضلة بعد</p>
          )}
          {musicList.map((track) => {
            const active = currentTrack?.id === track.id;
            return (
              <div
                key={track.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 6px', borderRadius: 12,
                  background: active ? 'rgba(0,188,212,0.1)' : 'transparent',
                  marginBottom: 4,
                }}
              >
                {track.artwork ? (
                  <img src={track.artwork} alt="" width={40} height={40} style={{ borderRadius: 8, flexShrink: 0, objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: active ? '#00BCD4' : '#fff', fontSize: '0.74rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {track.title}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.64rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {track.artist}
                  </div>
                </div>
                <button
                  onClick={() => onToggleFavorite(track)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}
                >
                  <Heart size={16} color={isMusicFav(track.id) ? '#ef4444' : 'rgba(255,255,255,0.35)'} fill={isMusicFav(track.id) ? '#ef4444' : 'none'} />
                </button>
                {/* ── Get / X — pins this track to my profile (shown above my name, playable
                    by anyone who visits). Pressing it again on the pinned track unpins it. ── */}
                <button
                  onClick={() => (pinnedTrackId === track.id ? onUnpinTrack() : onPinTrack(track))}
                  aria-label={pinnedTrackId === track.id ? 'إلغاء التثبيت' : 'تثبيت على البروفايل'}
                  style={{
                    background: pinnedTrackId === track.id ? 'rgba(239,68,68,0.15)' : 'rgba(0,188,212,0.12)',
                    border: `1px solid ${pinnedTrackId === track.id ? 'rgba(239,68,68,0.4)' : 'rgba(0,188,212,0.3)'}`,
                    borderRadius: 999, height: 26, minWidth: 26,
                    padding: pinnedTrackId === track.id ? 0 : '0 10px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', flexShrink: 0,
                    color: pinnedTrackId === track.id ? '#ef4444' : '#00BCD4',
                    fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.02em',
                  }}
                >
                  {pinnedTrackId === track.id ? <X size={13} /> : 'Get'}
                </button>
                <button
                  onClick={() => onPlayTrack(track)}
                  style={{
                    background: active && isPlaying ? 'rgba(0,188,212,0.22)' : 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(0,188,212,0.3)',
                    borderRadius: 999, width: 30, height: 30,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  {active && isPlaying ? <Pause size={13} color="#00BCD4" /> : <Play size={13} color="#00BCD4" style={{ marginRight: -1 }} />}
                </button>
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>,
    document.body
  );
}

// ── PinnedTrackBar — the pinned "now playing" pill shown above a profile's name/avatar.
// Borderless rounded rectangle: small artwork, play/pause toggle, a little waveform that
// animates while it's playing, and the track's name. Shown both on my own header (above my
// name/username) and on my profile as seen by any visitor (above the avatar) — anyone who
// presses play hears the pinned 30-second preview and sees its title. Purely a display +
// playback control; pinning/unpinning itself happens from the music search modal. ──
function PinnedTrackBar({ track, style }: { track: MusicTrack | null; style?: React.CSSProperties }) {
  const musicSnapshot = useSyncExternalStore(musicPlayerStore.subscribe, musicPlayerStore.getSnapshot);
  if (!track) return null;
  const isThisPlaying = musicSnapshot.currentTrack?.id === track.id && musicSnapshot.isPlaying;
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 10px 5px 6px', borderRadius: 999,
        background: 'rgba(0,188,212,0.1)', border: 'none',
        width: 'fit-content', maxWidth: '100%', boxSizing: 'border-box',
        ...style,
      }}
    >
      <style>{`
        @keyframes stooorna-pinned-wave { 0%, 100% { transform: scaleY(0.32); } 50% { transform: scaleY(1); } }
      `}</style>
      {track.artwork ? (
        <img src={track.artwork} alt="" width={24} height={24} style={{ borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }} />
      ) : (
        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,188,212,0.18)', flexShrink: 0 }} />
      )}
      <motion.button
        whileTap={{ scale: 0.88 }}
        onClick={() => musicPlayerStore.playTrack(track)}
        aria-label={isThisPlaying ? 'إيقاف' : 'تشغيل'}
        style={{
          width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
          background: 'rgba(0,188,212,0.2)', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
        }}
      >
        {isThisPlaying ? <Pause size={10} color="#00BCD4" /> : <Play size={10} color="#00BCD4" style={{ marginRight: -1 }} />}
      </motion.button>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 12, flexShrink: 0 }}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            style={{
              width: 2, height: '100%', borderRadius: 1, background: '#00BCD4',
              transformOrigin: 'bottom', display: 'inline-block',
              animation: isThisPlaying ? `stooorna-pinned-wave ${0.55 + i * 0.11}s ease-in-out infinite` : 'none',
              transform: isThisPlaying ? undefined : 'scaleY(0.32)',
            }}
          />
        ))}
      </div>
      <span
        style={{
          fontSize: '0.66rem', fontWeight: 700, color: '#fff',
          maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {track.title}
      </span>
    </div>
  );
}

// ── Builds a MusicTrack out of a fetched profile's pinned-track fields, or null if
// nothing is pinned (or the backend hasn't added the columns yet). ──
function pinnedTrackFromProfile(profile: MiniProfileData | null): MusicTrack | null {
  if (!profile?.pinnedTrackId || !profile?.pinnedTrackPreviewUrl) return null;
  return {
    id: profile.pinnedTrackId,
    title: profile.pinnedTrackTitle ?? '',
    artist: profile.pinnedTrackArtist ?? '',
    artwork: profile.pinnedTrackArtwork ?? '',
    previewUrl: profile.pinnedTrackPreviewUrl,
  };
}

// ── وقت نسبي بالعربي (لعرضه بجانب اسم المستخدم في الستوري) ───────────────────
function storyRelativeTime(dateStr: string): string {
  const arabicNumber = (value: number) => new Intl.NumberFormat('ar-KW').format(value);
  const diffSeconds = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000));
  if (diffSeconds < 60) return `منذ ${arabicNumber(diffSeconds || 1)} ثانية`;
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `منذ ${arabicNumber(minutes)} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${arabicNumber(hours)} ساعة`;
  const days = Math.floor(hours / 24);
  return `منذ ${arabicNumber(days)} يوم`;
}

/** تسمية وقت صغيرة لشبكة المنشورات (3 أعمدة) — من الخارج أسفل المربع */
function postGridTimeLabel(dateStr: string | null | undefined): { relative: string; date: string } {
  if (!dateStr) return { relative: '', date: '' };
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return { relative: '', date: '' };
  const date = d.toLocaleDateString('ar-KW', { day: 'numeric', month: 'short', year: 'numeric' });
  return { relative: storyRelativeTime(dateStr), date };
}


/** هل الحساب الحالي شركة؟ (صلاحية New Post / إعلان للقصة) — الأفراد لا ينشرون بوستات */
function isCompanyUserAccount(user: any, companiesList?: Array<{ id?: string; email?: string | null; username?: string | null; name?: string | null }> | null): boolean {
  if (!user) return false;
  const t = String(user.accountType || user.type || user.role || user.userType || '').toLowerCase();
  if (t === 'company' || t === 'business') return true;
  if (user.isCompany === true || user.company === true || user.authorIsCompany === true) return true;
  if (user.publisherType === 'company') return true;
  if (user.companyName || user.tradeName || user.licenseNumber || user.commercialLicense) return true;
  const email = String(user.email || '').trim().toLowerCase();
  const uid = String(user.id || user.userId || '').trim();
  const un = String(user.username || '').replace(/^@/, '').trim().toLowerCase();
  const nm = String(user.name || '').trim().toLowerCase();
  try {
    const raw = localStorage.getItem('stooorna_companies_registry');
    const list = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list)) {
      const hit = list.find((c: any) => {
        const em = String(c.email || '').toLowerCase();
        const id = String(c.userId || c.id || '');
        const cun = String(c.username || '').replace(/^@/, '').trim().toLowerCase();
        const cname = String(c.companyName || c.name || c.tradeName || '').trim().toLowerCase();
        return (email && em === email)
          || (uid && id === uid)
          || (un && cun && un === cun)
          || (nm && cname && nm === cname);
      });
      if (hit) return true;
    }
    const dir = localStorage.getItem('stooorna_companies_directory');
    const dlist = dir ? JSON.parse(dir) : [];
    if (Array.isArray(dlist)) {
      const hit = dlist.some((c: any) => {
        const id = String(c.id || c.userId || '');
        const em = String(c.email || '').toLowerCase();
        const cun = String(c.username || '').replace(/^@/, '').trim().toLowerCase();
        const cname = String(c.name || c.companyName || c.tradeName || '').trim().toLowerCase();
        return (uid && id === uid)
          || (email && em === email)
          || (un && cun && un === cun)
          || (nm && cname && nm === cname);
      });
      if (hit) return true;
    }
  } catch { /* ignore */ }
  if (companiesList && Array.isArray(companiesList)) {
    const hit = companiesList.some(c => {
      const id = String(c.id || '');
      const em = String(c.email || '').toLowerCase();
      const cun = String((c as any).username || '').replace(/^@/, '').trim().toLowerCase();
      const cname = String((c as any).name || (c as any).companyName || (c as any).tradeName || '').trim().toLowerCase();
      return (uid && id === uid)
        || (email && em === email)
        || (un && cun && un === cun)
        || (nm && cname && nm === cname);
    });
    if (hit) return true;
  }
  return false;
}

function readBusinessApproved(userId?: string | null): boolean {
  if (!userId) return false;
  try {
    const raw = localStorage.getItem('stooorna_business_registry');
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return false;
    return list.some((x: any) => String(x.userId) === String(userId) && x.status === 'approved');
  } catch {
    return false;
  }
}

function useBusinessApproved(userId?: string | null): boolean {
  const [on, setOn] = useState(() => readBusinessApproved(userId));
  useEffect(() => {
    const sync = () => setOn(readBusinessApproved(userId));
    sync();
    window.addEventListener('stooorna:business-registry', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('stooorna:business-registry', sync);
      window.removeEventListener('storage', sync);
    };
  }, [userId]);
  return on;
}


function PostGridTimeFooter({ createdAt, onMedia }: { createdAt?: string | null; onMedia?: boolean }) {
  const { relative, date } = postGridTimeLabel(createdAt);
  if (!relative && !date) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: '10px 4px 3px',
        background: onMedia
          ? 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.35) 55%, transparent 100%)'
          : 'linear-gradient(to top, rgba(0,20,24,0.88) 0%, rgba(0,20,24,0.45) 60%, transparent 100%)',
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        zIndex: 2,
      }}
    >
      <span style={{
        color: onMedia ? 'rgba(255,255,255,0.95)' : 'rgba(200,230,230,0.95)',
        fontSize: '0.52rem',
        fontWeight: 700,
        lineHeight: 1.15,
        textAlign: 'center',
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>{relative}</span>
      <span style={{
        color: onMedia ? 'rgba(255,255,255,0.7)' : 'rgba(150,200,200,0.75)',
        fontSize: '0.48rem',
        fontWeight: 600,
        lineHeight: 1.1,
        textAlign: 'center',
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>{date}</span>
    </div>
  );
}

// ── لون حلقة الستوري: حالتان فقط بدون أي فواصل أو عدّ تنازلي —
//    أصفر بالكامل ما دام في عنصر واحد على الأقل لم يُشاهَد بعد،
//    وبمجرد مشاهدة كل عناصر المستخدم تتحول الحلقة بالكامل للأزرق
//    (نفس أزرق دائرة "قصتي" الرئيسية) وتبقى كذلك حتى انتهاء الستوري ──────────
function storyRingColor(items: StoryItem[], unseenColor: string, seenColor: string): string {
  if (items.length === 0) return seenColor;
  const hasUnseen = items.some(it => !it.seen);
  return hasUnseen ? unseenColor : seenColor;
}

// ── CameraStoryCapture — كاميرا مدمجة لنشر القصة مباشرة ────────────────────────
// نقرة قصيرة على الدائرة = صورة، ضغط مطوّل = تسجيل فيديو (مع عدّاد مدة)،
// نقرتان متتاليتان على الشاشة = تبديل الكاميرا الأمامية/الخلفية، وأزرار التحكم
// الوحيدة هي: فلاش وفلاتر متقدمة. بعد التصوير تظهر ثلاثة خيارات نصية:
// نشر القصة / إعادة التصوير / إغلاق الكاميرا. الإغلاق ينزل الشاشة بأنيميشن للأسفل.
type CameraFilterId = 'none' | 'soft' | 'glow' | 'bw' | 'warm' | 'cool' | 'vivid' | 'dramatic' | 'vintage' | 'fade';
const CAMERA_FILTERS: { id: CameraFilterId; label: string; css: string }[] = [
  { id: 'none', label: 'عادي', css: 'none' },
  { id: 'soft', label: 'ناعم', css: 'brightness(1.08) contrast(0.92) saturate(1.05)' },
  { id: 'glow', label: 'إشراق', css: 'brightness(1.12) contrast(0.95) saturate(1.12)' },
  { id: 'bw', label: 'أبيض وأسود', css: 'grayscale(1) contrast(1.05)' },
  { id: 'warm', label: 'دافئ', css: 'sepia(0.35) saturate(1.4) contrast(1.05)' },
  { id: 'cool', label: 'بارد', css: 'hue-rotate(180deg) saturate(1.2)' },
  { id: 'vivid', label: 'حيوي', css: 'saturate(1.6) contrast(1.15)' },
  { id: 'dramatic', label: 'درامي', css: 'contrast(1.3) brightness(0.9) saturate(1.1)' },
  { id: 'vintage', label: 'عتيق', css: 'sepia(0.5) contrast(0.9) brightness(1.05) saturate(0.85)' },
  { id: 'fade', label: 'باهت', css: 'contrast(0.85) brightness(1.1) saturate(0.7)' },
];

function CameraStoryCapture({ onClose, onPublish, avatarUrl, userName, friendRequests = [], onRespondFriendRequest, onOpenStoryComments, storyCommentUnread = 0, shareChatUnread = 0, allowMusic = true, publishLabel }: {
  onClose: () => void;
  onPublish: (file: File) => Promise<void> | void;
  avatarUrl?: string | null;
  userName?: string | null;
  friendRequests?: IncomingRequest[];
  onRespondFriendRequest?: (id: number, action: 'accept' | 'reject') => void | Promise<void>;
  /** جرس التنبيهات داخل الكاميرا — تعليقات الأصدقاء على الستوري */
  onOpenStoryComments?: () => void;
  /** عدد خيوط تعليقات الستوري غير المقروءة (شارة الجرس) */
  storyCommentUnread?: number;
  /** مشاركات واردة من مستخدمين — تصفّر الجرس أصفر */
  shareChatUnread?: number;
  /** الأفراد: موسيقى + نص؛ الشركات: بدون موسيقى (تعليق/نص فقط) */
  allowMusic?: boolean;
  publishLabel?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRecordingRef = useRef(false);
  const lastTapRef = useRef<number>(0);

  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  // نقرتان متتاليتان على شاشة الكاميرا = تبديل أمامية/خلفية
  function handleVideoDoubleTap() {
    const now = Date.now();
    if (now - lastTapRef.current < 350) {
      setFacingMode(m => m === 'environment' ? 'user' : 'environment');
    }
    lastTapRef.current = now;
  }
  const [requestsBoxOpen, setRequestsBoxOpen] = useState(false);
  const [respondingId, setRespondingId] = useState<number | null>(null);
  // بحث يوزرات داخل بكس طلبات الإضافة (بدون تغيير شكل البكس)
  const [camSearchQuery, setCamSearchQuery] = useState('');
  const [camSearchResults, setCamSearchResults] = useState<SearchUser[]>([]);
  const [camSearching, setCamSearching] = useState(false);
  const [camSendingId, setCamSendingId] = useState<string | null>(null);
  const camSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!requestsBoxOpen) {
      setCamSearchQuery('');
      setCamSearchResults([]);
      setCamSearching(false);
      return;
    }
    if (camSearchDebounceRef.current) clearTimeout(camSearchDebounceRef.current);
    const q = camSearchQuery.trim();
    if (q.length < 2) {
      setCamSearchResults([]);
      setCamSearching(false);
      return;
    }
    setCamSearching(true);
    camSearchDebounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, { credentials: 'include' });
        const data = await r.json();
        setCamSearchResults(Array.isArray(data) ? data : []);
      } catch {
        setCamSearchResults([]);
      } finally {
        setCamSearching(false);
      }
    }, 350);
    return () => {
      if (camSearchDebounceRef.current) clearTimeout(camSearchDebounceRef.current);
    };
  }, [camSearchQuery, requestsBoxOpen]);
  async function camSendFriendRequest(addresseeId: string) {
    setCamSendingId(addresseeId);
    try {
      const response = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ addresseeId }),
      });
      const data = await response.json().catch(() => ({})) as { status?: 'accepted' | 'pending' };
      if (!response.ok && response.status !== 409) return;
      const status = data.status ?? 'pending';
      setCamSearchResults(prev => prev.map(u => u.id === addresseeId ? {
        ...u,
        friendStatus: status,
        iRequested: true,
      } : u));
    } catch { /* silent */ } finally {
      setCamSendingId(null);
    }
  }
  const [flashOn, setFlashOn] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filter, setFilter] = useState<CameraFilterId>('none');
  // فقط 0.5x (عدسة واسعة) و1x (طبيعي) — أزلنا 2x/3x لأنهما بدون تكبير عتاد حقيقي
  // كانا يعطيان نفس نتيجة القصّ الرقمي البسيط ولا يضيفان شيء فعليًا.
  const [zoom, setZoom] = useState<0.5 | 1>(1);
  const [, setHardwareZoomOk] = useState(false);
  // معرّف كاميرا العدسة الواسعة (Ultra-Wide) إن وُجدت على الجهاز — نستخدمها لـ0.5x
  // الحقيقي بدل تكبير رقمي وهمي، لأن 0.5x فعليًا عدسة فيزيائية مختلفة على أغلب الهواتف
  // وليس مجرد "زوم بالسالب" على نفس العدسة.
  const [ultraWideDeviceId, setUltraWideDeviceId] = useState<string | null>(null);
  const [backDeviceId, setBackDeviceId] = useState<string | null>(null);
  const [frontDeviceId, setFrontDeviceId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [captured, setCaptured] = useState<{ url: string; blob: Blob; type: 'image' | 'video' } | null>(null);
  const [closing, setClosing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');

  // ── شاشة تحرير القصة (نص + موسيقى) ─────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [overlayText, setOverlayText] = useState('');
  const [overlayColor, setOverlayColor] = useState('#ffffff');
  // موضع النص على الصورة (0–1 نسبة من أبعاد الحاوية)
  const [overlayPos, setOverlayPos] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const overlayDragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);

  // ── موضع وحجم شارة الموسيقى (قابلة للسحب والتكبير) ──────────────────────────
  const [musicBadgePos, setMusicBadgePos] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.88 });
  const [musicBadgeScale, setMusicBadgeScale] = useState(1);
  const musicDragRef = useRef<{
    startX: number; startY: number; startPosX: number; startPosY: number;
  } | null>(null);
  const musicPinchRef = useRef<{
    startDist: number; startScale: number;
  } | null>(null);

  const [selectedMusic, setSelectedMusic] = useState<{ label: string; file: File } | null>(null);
  const musicPreviewRef = useRef<HTMLAudioElement | null>(null);
  const [previewingMusic, setPreviewingMusic] = useState<string | null>(null);

  // ── بحث الموسيقى عبر iTunes Search API ──────────────────────────────────────
  const [musicQuery, setMusicQuery] = useState('');
  const [musicResults, setMusicResults] = useState<{ id: string; title: string; artist: string; previewUrl: string; artworkUrl: string }[]>([]);
  const [musicSearching, setMusicSearching] = useState(false);
  const [musicDownloading, setMusicDownloading] = useState<string | null>(null);
  const [selectedSearchMusic, setSelectedSearchMusic] = useState<{ id: string; title: string; artist: string; previewUrl: string; artworkUrl: string } | null>(null);
  const musicSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function searchMusic(q: string) {
    if (!q.trim()) { setMusicResults([]); return; }
    setMusicSearching(true);
    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=12&country=US`;
      const r = await fetch(url);
      const data = await r.json() as { results: { trackId: number; trackName: string; artistName: string; previewUrl?: string; artworkUrl60?: string }[] };
      setMusicResults(
        data.results
          .filter(t => t.previewUrl)
          .map(t => ({
            id: String(t.trackId),
            title: t.trackName,
            artist: t.artistName,
            previewUrl: t.previewUrl!,
            artworkUrl: (t.artworkUrl60 ?? '').replace('60x60', '100x100'),
          }))
      );
    } catch { setMusicResults([]); }
    setMusicSearching(false);
  }

  function handleMusicQueryChange(q: string) {
    setMusicQuery(q);
    if (musicSearchTimer.current) clearTimeout(musicSearchTimer.current);
    musicSearchTimer.current = setTimeout(() => { void searchMusic(q); }, 500);
  }

  async function downloadAndSelectMusic(track: { id: string; title: string; artist: string; previewUrl: string; artworkUrl: string }) {
    setMusicDownloading(track.id);
    stopMusicPreview();
    try {
      const resp = await fetch(track.previewUrl);
      const blob = await resp.blob();
      const file = new File([blob], `${track.title}-${track.artist}.m4a`, { type: 'audio/mp4' });
      setSelectedMusic({ label: `${track.title} — ${track.artist}`, file });
      setSelectedBuiltinMusic(null);
      setSelectedSearchMusic(track);
    } catch { /* تجاهل */ }
    setMusicDownloading(null);
  }

  // ألوان النص المتاحة
  const TEXT_COLORS = ['#ffffff','#000000','#facc15','#f87171','#34d399','#60a5fa','#e879f9','#fb923c'];

  // موسيقى مدمجة — ملفات صوتية من المكتبة العامة (royalty-free)
  const BUILTIN_MUSIC: { id: string; label: string; emoji: string; url: string }[] = [
    { id: 'upbeat',   label: 'نشيط',      emoji: '🎵', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
    { id: 'chill',    label: 'هادئ',      emoji: '🎶', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
    { id: 'romantic', label: 'رومانسي',   emoji: '💕', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
    { id: 'epic',     label: 'ملحمي',     emoji: '🔥', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3' },
    { id: 'fun',      label: 'مرح',       emoji: '🎉', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3' },
  ];
  const [selectedBuiltinMusic, setSelectedBuiltinMusic] = useState<string | null>(null);

  function stopMusicPreview() {
    if (musicPreviewRef.current) {
      musicPreviewRef.current.pause();
      musicPreviewRef.current.src = '';
      musicPreviewRef.current = null;
    }
    setPreviewingMusic(null);
  }

  function toggleMusicPreview(url: string, id: string) {
    if (previewingMusic === id) { stopMusicPreview(); return; }
    stopMusicPreview();
    const audio = new Audio(url);
    audio.volume = 0.5;
    void audio.play().catch(() => {});
    musicPreviewRef.current = audio;
    setPreviewingMusic(id);
    audio.onended = () => setPreviewingMusic(null);
  }

  const activeFilterCss = CAMERA_FILTERS.find(f => f.id === filter)?.css ?? 'none';

  // البحث عن عدسة واسعة (Ultra-Wide) فعلية على الجهاز — هذه غالبًا كاميرا فيزيائية
  // منفصلة عن العدسة الرئيسية (deviceId مختلف)، وليست مجرد رقم "زوم" على نفس العدسة.
  // نعتمد على تسمية الجهاز (label) التي تظهر بعد إذن الوصول للكاميرا — لا يوجد معيار
  // ويب موحّد لتحديد "أي عدسة هي الواسعة"، فهذا أفضل تقريب متاح في المتصفح.
  useEffect(() => {
    let cancelled = false;
    async function findCameras() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter(d => d.kind === 'videoinput');
        // كاميرا خلفية: أي كاميرا تحمل back/rear/environment في اسمها
        const backCam = cams.find(d => /back|rear|environment/i.test(d.label));
        // كاميرا أمامية: أي كاميرا تحمل front/user/face في اسمها
        const frontCam = cams.find(d => /front|user|face/i.test(d.label));
        // عدسة واسعة
        const wantedUW = facingMode === 'user' ? /front|user|face/i : /back|rear|environment/i;
        const ultra = cams.find(d => /ultra.?wide|0\.5x|wide angle/i.test(d.label) && wantedUW.test(d.label))
          ?? cams.find(d => /ultra.?wide|0\.5x/i.test(d.label));
        if (!cancelled) {
          setUltraWideDeviceId(ultra?.deviceId ?? null);
          if (backCam?.deviceId) setBackDeviceId(backCam.deviceId);
          if (frontCam?.deviceId) setFrontDeviceId(frontCam.deviceId);
        }
      } catch { if (!cancelled) setUltraWideDeviceId(null); }
    }
    void findCameras();
    return () => { cancelled = true; };
  }, [facingMode]);

  // فتح/إعادة فتح الكاميرا عند تبديل الاتجاه (أمامية/خلفية)، أو فقط عند تبديل
  // 0.5x/1x إذا كان هذا التبديل فعليًا يحتاج فتح جهاز كاميرا مختلف (عدسة واسعة
  // منفصلة). إذا الجهاز ما فيه عدسة واسعة منفصلة أصلاً، فـ0.5x و1x يستخدمان نفس
  // الكاميرا بنفس القيود تمامًا، فلا داعي لإعادة فتح أي شي — وهذا هو سبب الشاشة
  // السوداء سابقًا: كنا نعيد فتح الكاميرا حتى لو الجهاز المطلوب نفسه لم يتغيّر.
  const wantUltraWide = zoom === 0.5 && !!ultraWideDeviceId && facingMode === 'environment';
  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        let stream: MediaStream | null = null;

        // نبني قائمة محاولات بترتيب الأولوية:
        // 1. deviceId محدد (أدق) إن كان متاحاً
        // 2. facingMode:exact
        // 3. facingMode:ideal
        // 4. facingMode بدون exact/ideal
        const specificId = wantUltraWide
          ? ultraWideDeviceId!
          : facingMode === 'environment'
            ? backDeviceId
            : frontDeviceId;

        const attempts: MediaTrackConstraints[] = [
          ...(specificId ? [{ deviceId: { exact: specificId } }] : []),
          { facingMode: { exact: facingMode } },
          { facingMode: { ideal: facingMode } },
          { facingMode },
        ];

        for (const video of attempts) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video, audio: true });
            // تحقق أن الـ stream فعلاً من الكاميرا المطلوبة
            const track = stream.getVideoTracks()[0];
            const settings = track?.getSettings?.() ?? {};
            const gotFacing = (settings as { facingMode?: string }).facingMode;
            // إذا حصلنا على facing مختلف عن المطلوب نوقف هذا الـ stream ونجرب التالي
            if (gotFacing && gotFacing !== facingMode && !wantUltraWide) {
              stream.getTracks().forEach(t => t.stop());
              stream = null;
              continue;
            }
            break;
          } catch { /* جرّب القيد التالي */ }
        }

        if (!stream) {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        }
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

        // احفظ deviceId الكاميرا التي فُتحت فعلاً لاستخدامها في التبديل القادم
        const openedTrack = stream.getVideoTracks()[0];
        const openedSettings = openedTrack?.getSettings?.() ?? {};
        const openedDeviceId = (openedSettings as { deviceId?: string }).deviceId;
        const openedFacing = (openedSettings as { facingMode?: string }).facingMode;
        if (openedDeviceId) {
          if (openedFacing === 'environment' || (!openedFacing && facingMode === 'environment')) {
            setBackDeviceId(openedDeviceId);
          } else if (openedFacing === 'user' || (!openedFacing && facingMode === 'user')) {
            setFrontDeviceId(openedDeviceId);
          }
        }

        const previousStream = streamRef.current;
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.style.transform = facingMode === 'user' ? 'scaleX(-1)' : 'none';
          await videoRef.current.play().catch(() => {});
        }
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        previousStream?.getTracks().forEach(t => t.stop());
        setFlashOn(false);
        setError('');
      } catch {
        if (!cancelled) setError('تعذر فتح الكاميرا — تأكد من السماح بالوصول');
      }
    }
    void start();
    return () => { cancelled = true; };
  }, [facingMode, wantUltraWide, ultraWideDeviceId, backDeviceId, frontDeviceId]);

  // حلقة رسم: نعرض الفيديو كاملًا بأسلوب contain داخل إطار عمودي (بدون زوم إضافي)
  useEffect(() => {
    function draw() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.videoWidth > 0 && video.videoHeight > 0) {
        // إطار عمودي ثابت للأبعاد (قصص) — 9:16
        const targetW = 1080;
        const targetH = 1920;
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.filter = activeFilterCss === 'none' ? 'none' : activeFilterCss;
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, targetW, targetH);

          const vw = video.videoWidth;
          const vh = video.videoHeight;

          // zoom منطق:
          // 1x  = نقرأ 70% من مركز المستشعر (crop رقمي = تكبير خفيف)
          // 0.5x = نقرأ 100% من المستشعر (زاوية أوسع = wide angle رقمي)
          // الفرق يكون واضحاً ومحسوساً بين الوضعين
          const readFraction = zoom === 0.5 ? 1.0 : 0.7;
          const srcW = vw * readFraction;
          const srcH = vh * readFraction;
          const srcX = (vw - srcW) / 2;
          const srcY = (vh - srcH) / 2;

          // cover: ملء الإطار 9:16 بدون أشرطة سوداء
          const scale = Math.max(targetW / srcW, targetH / srcH);
          const dw = srcW * scale;
          const dh = srcH * scale;
          const dx = (targetW - dw) / 2;
          const dy = (targetH - dh) / 2;

          // إن كانت الكاميرا أمامية نرسم مرآة أفقية لتطابق المعاينة
          if (facingMode === 'user') {
            ctx.translate(targetW, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(video, srcX, srcY, srcW, srcH, targetW - dx - dw, dy, dw, dh);
          } else {
            ctx.drawImage(video, srcX, srcY, srcW, srcH, dx, dy, dw, dh);
          }
          ctx.restore();
        }
      }
      rafRef.current = requestAnimationFrame(draw);
    }
    rafRef.current = requestAnimationFrame(draw);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [activeFilterCss, facingMode, zoom]);

  // محاولة تطبيق تكبير عتاد أقل من 1x (بعض الأجهزة تدعم zoom < 1 كقيد على نفس
  // المستشعر) — تُستخدم فقط كخيار احتياطي إن لم نجد جهاز عدسة واسعة منفصل.
  useEffect(() => {
    let cancelled = false;
    async function applyHardwareZoom() {
      if (ultraWideDeviceId) { if (!cancelled) setHardwareZoomOk(true); return; } // نستخدم الجهاز المخصص أصلًا
      const track = streamRef.current?.getVideoTracks()[0];
      if (!track) { if (!cancelled) setHardwareZoomOk(false); return; }
      try {
        const caps = (track.getCapabilities?.() as MediaTrackCapabilities & { zoom?: { min: number; max: number } }) ?? {};
        // لا نطبّق zoom عتادي عند 1x — بعض الأجهزة تفسّره كقصّ رقمي
        if (zoom === 1) {
          if (caps.zoom) {
            try {
              await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min } as unknown as MediaTrackConstraintSet] });
            } catch { /* ignore */ }
          }
          if (!cancelled) setHardwareZoomOk(true);
          return;
        }
        if (caps.zoom && zoom >= caps.zoom.min && zoom <= caps.zoom.max) {
          await track.applyConstraints({ advanced: [{ zoom } as unknown as MediaTrackConstraintSet] });
          if (!cancelled) setHardwareZoomOk(true);
          return;
        }
      } catch { /* غير مدعوم على هذا الجهاز */ }
      if (!cancelled) setHardwareZoomOk(false);
    }
    void applyHardwareZoom();
    return () => { cancelled = true; };
  }, [zoom, facingMode, ultraWideDeviceId]);

  // تنظيف كامل عند إزالة المكوّن
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    };
  }, []);

  function takePhoto() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      setCaptured({ url, blob, type: 'image' });
    }, 'image/jpeg', 0.92);
  }

  function startRecording() {
    const canvas = canvasRef.current;
    const stream = streamRef.current;
    if (!canvas || !stream) return;
    const canvasStream = canvas.captureStream(30);
    stream.getAudioTracks().forEach(track => canvasStream.addTrack(track));
    let mime = 'video/webm;codecs=vp9,opus';
    if (typeof MediaRecorder !== 'undefined' && !MediaRecorder.isTypeSupported(mime)) mime = 'video/webm;codecs=vp8,opus';
    if (typeof MediaRecorder !== 'undefined' && !MediaRecorder.isTypeSupported(mime)) mime = 'video/webm';
    const recorder = new MediaRecorder(canvasStream, { mimeType: mime });
    recordedChunksRef.current = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      setCaptured({ url, blob, type: 'video' });
    };
    recorder.start();
    recorderRef.current = recorder;
    isRecordingRef.current = true;
    setIsRecording(true);
    setRecordSeconds(0);
  }

  function stopRecording() {
    if (recorderRef.current && isRecordingRef.current) recorderRef.current.stop();
    isRecordingRef.current = false;
    setIsRecording(false);
  }

  // عدّاد مدة التسجيل
  useEffect(() => {
    if (!isRecording) return;
    const interval = setInterval(() => setRecordSeconds(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [isRecording]);

  // نقرة قصيرة = صورة، ضغط مطوّل (فوق 320ms) = بدء تسجيل فيديو
  function handlePressStart() {
    if (captured) return;
    pressTimerRef.current = setTimeout(() => {
      pressTimerRef.current = null;
      startRecording();
    }, 320);
  }
  function handlePressEnd() {
    if (captured) return;
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
      takePhoto();
    } else if (isRecordingRef.current) {
      stopRecording();
    }
  }

  async function toggleFlash() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !flashOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as unknown as MediaTrackConstraintSet] });
    } catch { /* الفلاش غير مدعوم على هذا الجهاز — نتجاهل بصمت */ }
    setFlashOn(next);
  }

  function retake() {
    if (captured) URL.revokeObjectURL(captured.url);
    setCaptured(null);
    setRecordSeconds(0);
    setError('');
    setEditMode(false);
    setOverlayText('');
    setOverlayColor('#ffffff');
    setOverlayPos({ x: 0.5, y: 0.5 });
    setMusicBadgePos({ x: 0.5, y: 0.88 });
    setMusicBadgeScale(1);
    setSelectedMusic(null);
    setSelectedBuiltinMusic(null);
    stopMusicPreview();
  }

  function requestClose() {
    // إغلاق بانزلاق للأسفل ثم إزالة المكوّن
    setClosing(true);
    setTimeout(() => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      onClose();
    }, 420);
  }

  async function publish() {
    if (!captured) return;
    setPublishing(true);
    setError('');
    try {
      const ext = captured.type === 'video' ? 'webm' : 'jpg';
      const mediaFile = captured.blob instanceof File
        ? captured.blob
        : new File([captured.blob], `story-camera-${Date.now()}.${ext}`, {
            type: captured.type === 'video' ? 'video/webm' : 'image/jpeg',
          });

      // إذا لا توجد موسيقى ولا نص — نستخدم onPublish المباشر (legacy)
      if (!selectedMusic && !selectedBuiltinMusic && !overlayText.trim()) {
        await onPublish(mediaFile);
        requestClose();
        return;
      }

      // Multipart: media + optional music/text (try several field names for API compatibility)
      let audioFile: File | null = null;
      if (selectedMusic) {
        audioFile = selectedMusic.file;
      } else if (selectedBuiltinMusic) {
        const track = BUILTIN_MUSIC.find(m => m.id === selectedBuiltinMusic);
        if (track) {
          try {
            const resp = await fetch(track.url);
            const blob = await resp.blob();
            audioFile = new File([blob], `music-${track.id}.mp3`, { type: 'audio/mpeg' });
          } catch { /* ignore music load */ }
        }
      }

      const buildForm = (mediaKey: string, audioKey: string) => {
        const form = new FormData();
        form.append(mediaKey, mediaFile, mediaFile.name);
        form.append('file', mediaFile, mediaFile.name);
        form.append('type', captured.type === 'video' ? 'video' : 'image');
        if (overlayText.trim()) form.append('overlayText', overlayText.trim());
        if (overlayColor !== '#ffffff') form.append('overlayColor', overlayColor);
        form.append('overlayX', String(overlayPos.x));
        form.append('overlayY', String(overlayPos.y));
        if (allowMusic) {
          form.append('musicBadgeX', String(musicBadgePos.x));
          form.append('musicBadgeY', String(musicBadgePos.y));
          form.append('musicBadgeScale', String(musicBadgeScale));
        }
        if (audioFile) {
          form.append(audioKey, audioFile, audioFile.name);
          form.append('audio', audioFile, audioFile.name);
          form.append('music', audioFile, audioFile.name);
        }
        return form;
      };

      let r: Response | null = null;
      let errText = '';
      // Prefer multipart that carries caption + music; never use raw-only when metadata exists
      const formAttempts = [
        () => fetch('/api/status', { method: 'POST', credentials: 'include', body: buildForm('media', 'audio') }),
        () => fetch('/api/status', { method: 'POST', credentials: 'include', body: buildForm('file', 'audio') }),
        () => {
          const f = buildForm('media', 'audio');
          f.append('text', overlayText.trim());
          f.append('caption', overlayText.trim());
          f.append('description', overlayText.trim());
          if (selectedSearchMusic?.previewUrl) f.append('audioUrl', selectedSearchMusic.previewUrl);
          return fetch('/api/status', { method: 'POST', credentials: 'include', body: f });
        },
      ];
      for (const run of formAttempts) {
        try {
          r = await run();
          if (r.ok) break;
          errText = await r.text().catch(() => '');
        } catch (e) {
          errText = e instanceof Error ? e.message : 'network';
          r = null;
        }
      }
      // Two-step: upload media raw, then attach overlay/audio via JSON
      if (!r || !r.ok) {
        try {
          const up = await fetch('/api/status', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': mediaFile.type || 'image/jpeg', 'X-File-Ext': `.${mediaFile.name.split('.').pop() || 'jpg'}` },
            body: mediaFile,
          });
          if (up.ok) {
            let mediaUrl = '';
            let statusId: number | string | null = null;
            try {
              const d = await up.json() as any;
              mediaUrl = d?.url || d?.mediaUrl || d?.status?.mediaUrl || d?.item?.mediaUrl || '';
              statusId = d?.id || d?.statusId || d?.status?.id || d?.item?.id || null;
            } catch { /* */ }
            const audioUrl = selectedSearchMusic?.previewUrl || '';
            const metaBody = {
              id: statusId,
              statusId,
              mediaUrl,
              overlayText: overlayText.trim() || undefined,
              text: overlayText.trim() || undefined,
              caption: overlayText.trim() || undefined,
              audioUrl: audioUrl || undefined,
              overlayX: overlayPos.x,
              overlayY: overlayPos.y,
              overlayColor: overlayColor,
              musicBadgeX: musicBadgePos.x,
              musicBadgeY: musicBadgePos.y,
              musicBadgeScale: musicBadgeScale,
            };
            const metaAttempts = [
              () => fetch('/api/status', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(metaBody) }),
              () => fetch(`/api/status/${statusId}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(metaBody) }),
              () => fetch('/api/status/update', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(metaBody) }),
            ];
            for (const run of metaAttempts) {
              if (!statusId && !mediaUrl) break;
              try {
                const mr = await run();
                if (mr.ok) { r = mr; break; }
              } catch { /* */ }
            }
            if (!r || !r.ok) r = up; // at least media published
          } else {
            errText = await up.text().catch(() => errText);
          }
        } catch (e) {
          errText = e instanceof Error ? e.message : errText;
        }
      }
      if (!r || !r.ok) {
        console.error('[publish] server error', r?.status, errText);
        throw new Error(errText || 'publish failed');
      }
      try { window.dispatchEvent(new CustomEvent('stooorna:story-published')); } catch { /* */ }
      requestClose();
    } catch (err) {
      console.error('[publish] caught error:', err);
      setError('تعذر نشر القصة — حاول مرة ثانية');
      setPublishing(false);
    }
  }

  const mm = String(Math.floor(recordSeconds / 60)).padStart(2, '0');
  const ss = String(recordSeconds % 60).padStart(2, '0');

  return (
    <motion.div
      initial={{ opacity: 0, y: '100%' }}
      animate={closing
        ? { opacity: 0.35, y: '100%' }
        : { opacity: 1, y: 0 }
      }
      exit={{ opacity: 0, y: '100%' }}
      transition={closing
        ? { duration: 0.4, ease: [0.32, 0.72, 0, 1] }
        : { type: 'spring', stiffness: 380, damping: 36, mass: 0.9 }
      }
      style={{
        position: 'fixed', inset: 0, zIndex: 12500, background: '#000',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      <div
        onClick={handleVideoDoubleTap}
        style={{ position: 'relative', flex: 1, overflow: 'hidden', display: captured ? 'none' : 'block', background: '#000' }}
      >
        {/* معاينة مباشرة — cover يملأ الشاشة */}
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover',
            background: '#000',
            // 1x  = scale(1/0.7 ≈ 1.43) → crop المنتصف → تكبير خفيف
            // 0.5x = scale(1)             → كامل المستشعر → زاوية أوسع
            // نجمع مع mirror الكاميرا الأمامية
            transform: facingMode === 'user'
              ? `scaleX(${zoom === 0.5 ? -1 : -(1 / 0.7)}) scaleY(${zoom === 0.5 ? 1 : 1 / 0.7})`
              : zoom === 0.5 ? 'none' : `scale(${1 / 0.7})`,
            transformOrigin: 'center center',
            filter: activeFilterCss === 'none' ? 'none' : activeFilterCss,
            transition: 'transform 0.2s ease',
          }}
        />
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none',
          }}
        />

        {/* ── شريط علوي مضغوط ليتناسب مع الأزرار ── */}
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5,
            paddingTop: 'max(env(safe-area-inset-top,0px), 6px)',
            paddingLeft: 12, paddingRight: 12, paddingBottom: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, transparent 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%', overflow: 'hidden',
              border: '1.5px solid rgba(255,255,255,0.85)', background: '#222',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ color: '#fff', fontSize: '0.7rem', fontWeight: 700 }}>
                  {(userName || '?').slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
          </div>

          {isRecording ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.5)',
              borderRadius: 20, padding: '4px 10px',
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444' }} />
              <span style={{ color: '#fff', fontSize: '0.74rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{mm}:{ss}</span>
            </div>
          ) : (
            <div style={{ width: 36 }} />
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => void toggleFlash()}
              style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.35)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              {flashOn ? <Zap size={16} color="#FFD54A" strokeWidth={2.2} /> : <ZapOff size={16} color="#fff" strokeWidth={2.2} />}
            </motion.button>
            {/* جرس — تعليقات الستوري فقط */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => onOpenStoryComments?.()}
              aria-label="Story comments"
              style={{
                width: 32, height: 32, borderRadius: '50%',
                background: storyCommentUnread > 0 ? 'rgba(239,68,68,0.28)' : 'rgba(0,0,0,0.35)',
                border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative',
              }}
            >
              <Bell size={16} color="#fff" strokeWidth={2.2} />
              {storyCommentUnread > 0 && (
                <span style={{
                  position: 'absolute', top: -2, right: -2, minWidth: 15, height: 15, borderRadius: 8,
                  background: '#ef4444',
                  color: '#fff',
                  fontSize: '0.55rem', fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
                  border: '1.5px solid #000',
                }}>
                  {storyCommentUnread > 9 ? '9+' : storyCommentUnread}
                </span>
              )}
            </motion.button>
            {/* أيقونة الإضافة — طلبات الصداقة تصل هنا (بجانب الجرس) */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setRequestsBoxOpen(true)}
              aria-label="Friend requests"
              style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.35)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative' }}
            >
              <UserPlus size={16} color="#fff" strokeWidth={2.2} />
              {friendRequests.length > 0 && (
                <span style={{
                  position: 'absolute', top: -2, right: -2, minWidth: 15, height: 15, borderRadius: 8,
                  background: '#ef4444', color: '#fff', fontSize: '0.55rem', fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
                  border: '1.5px solid #000',
                }}>
                  {friendRequests.length > 9 ? '9+' : friendRequests.length}
                </span>
              )}
            </motion.button>
          </div>
        </div>

        {/* بوكس طلبات الإضافة + بحث يوزرات (نفس شكل البكس) */}
        {requestsBoxOpen && (
          <div
            onClick={e => { e.stopPropagation(); setRequestsBoxOpen(false); }}
            style={{
              position: 'absolute', inset: 0, zIndex: 20,
              background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 20,
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 340,
                background: 'rgba(12,18,18,0.96)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 18,
                padding: '18px 16px 14px',
                boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ color: '#fff', fontWeight: 800, fontSize: '0.92rem' }}>طلبات الإضافة</span>
                <button type="button" onClick={() => setRequestsBoxOpen(false)}
                  style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={16} />
                </button>
              </div>

              {/* حقل بحث اليوزرات — داخل البكس دون تغيير شكله */}
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <Search
                  size={14}
                  color="rgba(255,255,255,0.4)"
                  style={{ position: 'absolute', top: '50%', right: 12, transform: 'translateY(-50%)', pointerEvents: 'none' }}
                />
                <input
                  value={camSearchQuery}
                  onChange={e => setCamSearchQuery(e.target.value)}
                  placeholder="ابحث عن يوزر…"
                  autoComplete="off"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '10px 36px 10px 12px',
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#fff',
                    fontSize: '0.8rem',
                    outline: 'none',
                  }}
                />
              </div>

              {camSearchQuery.trim().length >= 2 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 280, overflowY: 'auto' }}>
                  {camSearching && (
                    <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.75rem', textAlign: 'center', padding: '16px 0', margin: 0 }}>جاري البحث…</p>
                  )}
                  {!camSearching && camSearchResults.length === 0 && (
                    <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.75rem', textAlign: 'center', padding: '16px 0', margin: 0 }}>لا توجد نتائج</p>
                  )}
                  {!camSearching && camSearchResults.map(u => {
                    const isPending = u.friendStatus === 'pending' || u.iRequested;
                    const isFriend = u.friendStatus === 'accepted';
                    return (
                      <div key={u.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 10px', borderRadius: 12,
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                      }}>
                        <UserAvatar name={u.name || u.username || '?'} avatarUrl={u.avatarUrl ?? null} size={40} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ color: '#fff', fontWeight: 700, fontSize: '0.82rem', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {u.name || u.username || 'مستخدم'}
                          </p>
                          {u.username && (
                            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.7rem', margin: '2px 0 0' }}>@{u.username}</p>
                          )}
                        </div>
                        {isFriend ? (
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'rgba(0,188,212,0.85)', padding: '4px 8px' }}>صديق</span>
                        ) : isPending ? (
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'rgba(255,255,255,0.45)', padding: '4px 8px' }}>بانتظار</span>
                        ) : (
                          <button
                            type="button"
                            disabled={camSendingId === u.id}
                            onClick={() => void camSendFriendRequest(u.id)}
                            style={{
                              width: 34, height: 34, borderRadius: '50%', border: 'none',
                              background: 'rgba(0,188,212,0.18)', color: '#00BCD4', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              opacity: camSendingId === u.id ? 0.55 : 1,
                            }}
                          >
                            <UserPlus size={16} strokeWidth={2.4} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : friendRequests.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 10px 16px' }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%', margin: '0 auto 12px',
                    background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <UserPlus size={20} color="#ef4444" />
                  </div>
                  <p style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', margin: 0 }}>لا يوجد طلبات إضافة</p>
                  <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.75rem', margin: '8px 0 0' }}>ابحث عن يوزر بالأعلى أو انتظر طلبات واردة</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 280, overflowY: 'auto' }}>
                  {friendRequests.map(req => (
                    <div key={req.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 10px', borderRadius: 12,
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                    }}>
                      <UserAvatar name={req.name || req.username || '?'} avatarUrl={req.avatarUrl ?? null} size={40} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ color: '#fff', fontWeight: 700, fontSize: '0.82rem', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {req.name || req.username || 'مستخدم'}
                        </p>
                        {req.username && (
                          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.7rem', margin: '2px 0 0' }}>@{req.username}</p>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          disabled={respondingId === req.id}
                          onClick={async () => {
                            setRespondingId(req.id);
                            try { await onRespondFriendRequest?.(req.id, 'accept'); }
                            finally { setRespondingId(null); }
                          }}
                          style={{
                            width: 34, height: 34, borderRadius: '50%', border: 'none',
                            background: 'rgba(34,197,94,0.2)', color: '#22c55e', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <Check size={16} strokeWidth={2.6} />
                        </button>
                        <button
                          type="button"
                          disabled={respondingId === req.id}
                          onClick={async () => {
                            setRespondingId(req.id);
                            try { await onRespondFriendRequest?.(req.id, 'reject'); }
                            finally { setRespondingId(null); }
                          }}
                          style={{
                            width: 34, height: 34, borderRadius: '50%', border: 'none',
                            background: 'rgba(239,68,68,0.18)', color: '#ef4444', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <X size={16} strokeWidth={2.6} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        )}

        {error && (
          <div style={{ position: 'absolute', top: '40%', left: 20, right: 20, textAlign: 'center', color: '#fff', fontSize: '0.82rem', background: 'rgba(0,0,0,0.5)', borderRadius: 10, padding: 12, zIndex: 4 }}>
            {error}
          </div>
        )}

        {/* شريط فلاتر فوق الزوم والدائرة */}
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute',
            bottom: 'calc(max(env(safe-area-inset-bottom,0px), 12px) + 150px)',
            left: 0, right: 0, zIndex: 5,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            pointerEvents: 'none',
          }}
        >
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => setFiltersOpen(v => !v)}
            style={{
              pointerEvents: 'auto',
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 18,
              background: filtersOpen ? 'rgba(0,188,212,0.28)' : 'rgba(0,0,0,0.5)',
              border: `1px solid ${filtersOpen ? 'rgba(0,188,212,0.55)' : 'rgba(255,255,255,0.28)'}`,
              color: '#fff', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
            }}
          >
            <SlidersHorizontal size={13} strokeWidth={2.2} />
            فلاتر{filter !== 'none' ? ` · ${CAMERA_FILTERS.find(f => f.id === filter)?.label ?? ''}` : ''}
          </motion.button>
          {filtersOpen && (
            <div style={{
              pointerEvents: 'auto', width: '100%', overflowX: 'auto',
              WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
              display: 'flex', gap: 7, padding: '0 12px 2px',
            }}>
              {CAMERA_FILTERS.map(f => {
                const active = filter === f.id;
                return (
                  <button key={f.id} type="button" onClick={() => setFilter(f.id)} style={{
                    flexShrink: 0, minWidth: 58, height: 30, borderRadius: 15, padding: '0 10px',
                    background: active ? 'rgba(0,188,212,0.95)' : 'rgba(0,0,0,0.55)',
                    border: active ? 'none' : '1px solid rgba(255,255,255,0.25)',
                    color: active ? '#001417' : '#fff',
                    fontSize: '0.66rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>{f.label}</button>
                );
              })}
            </div>
          )}
        </div>

        {/* زوم 0.5x / 1x — فوق دائرة التصوير */}
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute',
            bottom: 'calc(max(env(safe-area-inset-bottom,0px), 12px) + 96px)',
            left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, zIndex: 5,
          }}
        >
          {([0.5, 1] as const).map(level => (
            <motion.button
              key={level}
              whileTap={{ scale: 0.92 }}
              onClick={() => setZoom(level)}
              style={{
                minWidth: 34, height: 34, borderRadius: '50%',
                padding: '0 8px',
                background: zoom === level ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.45)',
                border: zoom === level ? 'none' : '1px solid rgba(255,255,255,0.35)',
                color: zoom === level ? '#000' : '#fff',
                fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {level === 1 ? '1x' : '0.5'}
            </motion.button>
          ))}
        </div>

        {/* دائرة التصوير + زر مكتبة الصور + زر إغلاق */}
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute',
            bottom: 'calc(max(env(safe-area-inset-bottom,0px), 12px) + 16px)',
            left: 0, right: 0, zIndex: 5,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28,
            padding: '0 20px',
          }}
        >
          {/* زر مكتبة الصور — يفتح file picker */}
          <label
            aria-label="اختيار صورة من المكتبة"
            className="cam-gallery-btn"
          >
            <Images size={20} strokeWidth={2.1} />
            <input
              type="file"
              accept="image/*,video/*"
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                const url = URL.createObjectURL(file);
                const type = file.type.startsWith('video/') ? 'video' : 'image';
                setCaptured({ url, blob: file, type });
                e.target.value = '';
              }}
            />
          </label>
          <motion.button
            whileTap={{ scale: 0.92 }}
            onPointerDown={handlePressStart}
            onPointerUp={handlePressEnd}
            onPointerCancel={handlePressEnd}
            onPointerLeave={() => { if (isRecordingRef.current) stopRecording(); }}
            aria-label={isRecording ? 'إيقاف التسجيل' : 'التقاط'}
            style={{
              width: 72, height: 72, borderRadius: '50%',
              border: `5px solid ${isRecording ? '#ef4444' : '#fff'}`,
              background: isRecording ? 'rgba(239,68,68,0.35)' : 'transparent',
              boxShadow: isRecording ? '0 0 0 4px rgba(239,68,68,0.25)' : '0 0 0 2px rgba(255,255,255,0.15)',
              cursor: 'pointer', touchAction: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'border-color 0.15s, background 0.15s',
              flexShrink: 0,
            }}
          >
            {isRecording && (
              <span style={{ width: 20, height: 20, borderRadius: 5, background: '#ef4444' }} />
            )}
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={requestClose}
            aria-label="إغلاق الكاميرا"
            style={{
              width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(0,0,0,0.55)',
              border: '1px solid rgba(255,255,255,0.35)',
              color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={22} strokeWidth={2.4} />
          </motion.button>
        </div>
      </div>

      {/* معاينة بعد التصوير */}
      {captured && (
        <div style={{ position: 'relative', flex: 1, background: '#000', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
            {captured.type === 'image' ? (
              <img src={captured.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            ) : (
              <video src={captured.url} autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            )}
            {overlayText.trim() && (
              <div
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              >
                <span
                  className="story-overlay-text story-overlay-draggable"
                  style={{
                    color: overlayColor,
                    position: 'absolute',
                    left: `${overlayPos.x * 100}%`,
                    top: `${overlayPos.y * 100}%`,
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'auto',
                    cursor: 'grab',
                    userSelect: 'none',
                    touchAction: 'none',
                  }}
                  onPointerDown={e => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                    overlayDragRef.current = {
                      startX: e.clientX,
                      startY: e.clientY,
                      startPosX: overlayPos.x,
                      startPosY: overlayPos.y,
                    };
                    const onMove = (ev: PointerEvent) => {
                      if (!overlayDragRef.current) return;
                      const dx = (ev.clientX - overlayDragRef.current.startX) / rect.width;
                      const dy = (ev.clientY - overlayDragRef.current.startY) / rect.height;
                      setOverlayPos({
                        x: Math.max(0.05, Math.min(0.95, overlayDragRef.current.startPosX + dx)),
                        y: Math.max(0.05, Math.min(0.95, overlayDragRef.current.startPosY + dy)),
                      });
                    };
                    const onUp = () => {
                      overlayDragRef.current = null;
                      window.removeEventListener('pointermove', onMove);
                      window.removeEventListener('pointerup', onUp);
                    };
                    window.addEventListener('pointermove', onMove);
                    window.addEventListener('pointerup', onUp);
                  }}
                >
                  {overlayText}
                </span>
              </div>
            )}
            {allowMusic && (selectedMusic || selectedBuiltinMusic) && (
              <div
                className="story-music-orb story-music-badge--draggable"
                style={{
                  position: 'absolute',
                  left: `${musicBadgePos.x * 100}%`,
                  top: `${musicBadgePos.y * 100}%`,
                  transform: `translate(-50%, -50%) scale(${musicBadgeScale})`,
                  transformOrigin: 'center center',
                  zIndex: 4,
                }}
                onPointerDown={e => {
                  if (e.isPrimary === false) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                  musicDragRef.current = {
                    startX: e.clientX,
                    startY: e.clientY,
                    startPosX: musicBadgePos.x,
                    startPosY: musicBadgePos.y,
                  };
                  const onMove = (ev: PointerEvent) => {
                    if (!musicDragRef.current || !ev.isPrimary) return;
                    const dx = (ev.clientX - musicDragRef.current.startX) / rect.width;
                    const dy = (ev.clientY - musicDragRef.current.startY) / rect.height;
                    setMusicBadgePos({
                      x: Math.max(0.05, Math.min(0.95, musicDragRef.current.startPosX + dx)),
                      y: Math.max(0.05, Math.min(0.95, musicDragRef.current.startPosY + dy)),
                    });
                  };
                  const onUp = () => {
                    musicDragRef.current = null;
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                  };
                  window.addEventListener('pointermove', onMove);
                  window.addEventListener('pointerup', onUp);
                }}
                onTouchStart={e => {
                  if (e.touches.length !== 2) return;
                  const t1 = e.touches[0], t2 = e.touches[1];
                  const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                  musicPinchRef.current = { startDist: dist, startScale: musicBadgeScale };
                }}
                onTouchMove={e => {
                  if (e.touches.length !== 2 || !musicPinchRef.current) return;
                  e.preventDefault();
                  const t1 = e.touches[0], t2 = e.touches[1];
                  const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                  const ratio = dist / musicPinchRef.current.startDist;
                  setMusicBadgeScale(Math.max(0.3, Math.min(3, musicPinchRef.current.startScale * ratio)));
                }}
                onTouchEnd={() => { musicPinchRef.current = null; }}
              >
                <span className="orb-bar" />
                <span className="orb-bar" />
                <span className="orb-bar" />
                <span className="orb-bar" />
                <span className="orb-bar" />
              </div>
            )}
            <motion.button whileTap={{ scale: 0.9 }} onClick={requestClose} aria-label="إغلاق" className="story-close-btn">
              <X size={18} strokeWidth={2.4} />
            </motion.button>
            {overlayText.trim() && (
              <div className="story-drag-hint">اسحب النص لتغيير موضعه</div>
            )}
            {(selectedMusic || selectedBuiltinMusic) && (
              <div className="story-drag-hint" style={{ bottom: overlayText.trim() ? 30 : 8 }}>اسحب الموسيقى • قرّب إصبعين للتكبير</div>
            )}
          </div>

          {error && <p className="story-edit-error">{error}</p>}

          <div className="story-preview-bar">
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => setEditMode(true)} className="story-edit-btn">
              <PenLine size={15} strokeWidth={2.2} />
              تحرير (نص + موسيقى)
              {(overlayText.trim() || selectedMusic || selectedBuiltinMusic) && (
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'hsl(var(--primary))', display: 'inline-block' }} />
              )}
            </motion.button>
            <motion.button whileTap={{ scale: 0.97 }} disabled={publishing} onClick={() => void publish()} className="story-edit-publish-btn">
              {publishing ? 'جارِ النشر…' : (publishLabel || (allowMusic ? 'نشر قصة' : 'نشر إعلان للقصة'))}
            </motion.button>
            <div style={{ display: 'flex', gap: 8 }}>
              <motion.button whileTap={{ scale: 0.97 }} onClick={retake} disabled={publishing} className="story-edit-retake-btn">إعادة التصوير</motion.button>
              <motion.button whileTap={{ scale: 0.97 }} onClick={requestClose} disabled={publishing} className="story-edit-retake-btn">إغلاق</motion.button>
            </div>
          </div>
        </div>
      )}

      {/* ── شاشة التحرير: نص + موسيقى ─────────────────────────────────────── */}
      <AnimatePresence>
        {editMode && captured && (
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className="story-edit-overlay"
          >
            <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
              {captured.type === 'image' ? (
                <img src={captured.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <video src={captured.url} autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
              <div className="story-edit-dim" />
            </div>

            <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* شريط علوي */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'max(env(safe-area-inset-top,0px),12px) 16px 10px' }}>
                <button className="story-edit-btn-back" onClick={() => setEditMode(false)}>
                  <ArrowLeft size={18} strokeWidth={2.4} /> رجوع
                </button>
                <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>تحرير القصة</span>
                <button className="story-edit-btn-done" onClick={() => setEditMode(false)}>تم</button>
              </div>

              {/* حقل النص */}
              <div style={{ padding: '0 16px 12px' }}>
                <div className="story-edit-section">
                  <p className="story-edit-section-label">
                    <PenLine size={11} style={{ display: 'inline', marginLeft: 4 }} />نص على الصورة
                  </p>
                  <input
                    className="story-edit-text-input"
                    placeholder="اكتب شيئاً…"
                    value={overlayText}
                    onChange={e => setOverlayText(e.target.value)}
                    maxLength={80}
                    style={{ color: overlayColor }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    {TEXT_COLORS.map(c => (
                      <button key={c} type="button"
                        className={`story-edit-color-dot${overlayColor === c ? ' active' : ''}`}
                        style={{ background: c }} onClick={() => setOverlayColor(c)} aria-label={c} />
                    ))}
                  </div>
                </div>
              </div>

              {/* قسم الموسيقى — للأفراد فقط (الشركات بدون موسيقى) */}
              {allowMusic && (
              <div style={{ padding: '0 16px', flex: 1, overflowY: 'auto' }}>
                <div className="story-edit-section">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <p className="story-edit-section-label">
                      <Music size={11} style={{ display: 'inline', marginLeft: 4 }} />موسيقى خلفية
                    </p>
                    {(selectedBuiltinMusic || selectedMusic) && (
                      <button type="button" className="story-music-remove-btn"
                        onClick={() => { setSelectedBuiltinMusic(null); setSelectedMusic(null); setSelectedSearchMusic(null); stopMusicPreview(); }}>
                        إزالة
                      </button>
                    )}
                  </div>

                  {/* شارة الاختيار الحالي */}
                  {selectedMusic && (
                    <div className="story-music-selected-banner">
                      <Music size={14} color="hsl(var(--primary))" />
                      <span>{selectedMusic.label}</span>
                      <Check size={14} color="hsl(var(--primary))" strokeWidth={2.5} />
                    </div>
                  )}

                  {/* ── بحث iTunes ── */}
                  <div className="story-music-search-wrap">
                    <Search size={14} className="story-music-search-icon" />
                    <input
                      className="story-music-search-input"
                      placeholder="ابحث عن أغنية أو فنان…"
                      value={musicQuery}
                      onChange={e => handleMusicQueryChange(e.target.value)}
                    />
                  </div>

                  {musicSearching && <p className="story-music-search-empty">جارِ البحث…</p>}
                  {!musicSearching && musicQuery.trim() && musicResults.length === 0 && (
                    <p className="story-music-search-empty">لا نتائج — جرّب كلمة أخرى</p>
                  )}

                  {musicResults.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                      {musicResults.map(track => {
                        const isSelected = selectedSearchMusic?.id === track.id;
                        const isDownloading = musicDownloading === track.id;
                        return (
                          <div key={track.id} className={`story-music-result-row${isSelected ? ' selected' : ''}`}>
                            {track.artworkUrl
                              ? <img src={track.artworkUrl} alt="" className="story-music-result-art" />
                              : <div className="story-music-result-art" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Music size={18} color="hsl(var(--muted-foreground))" /></div>
                            }
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p className="story-music-result-title">{track.title}</p>
                              <p className="story-music-result-artist">{track.artist}</p>
                            </div>
                            <div className="story-music-result-actions">
                              <button type="button"
                                className={`story-music-preview-btn${previewingMusic === track.id ? ' active' : ' idle'}`}
                                onClick={e => { e.stopPropagation(); toggleMusicPreview(track.previewUrl, track.id); }}>
                                {previewingMusic === track.id ? <Pause size={15} /> : <Play size={15} />}
                              </button>
                              <button type="button"
                                className={`story-music-dl-btn${isSelected ? ' done' : ''}`}
                                disabled={isDownloading}
                                onClick={() => { void downloadAndSelectMusic(track); }}>
                                {isDownloading
                                  ? <span className="cam-spinner" style={{ animation: 'spin 0.7s linear infinite' }} />
                                  : isSelected
                                    ? <><Check size={12} strokeWidth={2.5} /> تم</>
                                    : <><Download size={12} strokeWidth={2.2} /> اختيار</>
                                }
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* مقاطع مدمجة — تظهر فقط عند عدم البحث */}
                  {!musicQuery.trim() && (
                    <>
                      <p className="story-music-section-title">مقاطع مدمجة</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {BUILTIN_MUSIC.map(track => (
                          <div key={track.id}
                            className={`story-music-row${selectedBuiltinMusic === track.id ? ' selected' : ''}`}
                            onClick={() => {
                              if (selectedBuiltinMusic === track.id) { setSelectedBuiltinMusic(null); stopMusicPreview(); }
                              else { setSelectedBuiltinMusic(track.id); setSelectedMusic(null); setSelectedSearchMusic(null); }
                            }}>
                            <span style={{ fontSize: '1.1rem' }}>{track.emoji}</span>
                            <span className="story-music-name">{track.label}</span>
                            <button type="button"
                              className={`story-music-preview-btn${previewingMusic === track.id ? ' active' : ' idle'}`}
                              onClick={e => { e.stopPropagation(); toggleMusicPreview(track.url, track.id); }}>
                              {previewingMusic === track.id ? <Pause size={15} /> : <Play size={15} />}
                            </button>
                            {selectedBuiltinMusic === track.id && <Check size={15} color="hsl(var(--primary))" strokeWidth={2.5} />}
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {/* رفع من الجهاز */}
                  <p className="story-music-section-title" style={{ marginTop: 12 }}>من جهازك</p>
                  <label className="story-music-upload-label">
                    <Music size={15} color="hsl(var(--muted-foreground))" />
                    <span>{(selectedMusic && !selectedSearchMusic) ? `✓ ${selectedMusic.label}` : 'رفع ملف صوتي…'}</span>
                    <input type="file" accept="audio/*" style={{ display: 'none' }}
                      onChange={e => {
                        const f = e.target.files?.[0]; if (!f) return;
                        setSelectedMusic({ label: f.name.replace(/\.[^.]+$/, ''), file: f });
                        setSelectedBuiltinMusic(null); setSelectedSearchMusic(null); stopMusicPreview(); e.target.value = '';
                      }} />
                  </label>
                </div>
              </div>
              )}

              {/* معاينة النص — قابل للسحب */}
              {overlayText.trim() && (
                <span
                  className="story-overlay-text story-overlay-draggable"
                  style={{
                    color: overlayColor,
                    position: 'absolute',
                    left: `${overlayPos.x * 100}%`,
                    top: `${overlayPos.y * 100}%`,
                    transform: 'translate(-50%, -50%)',
                    zIndex: 5,
                    cursor: 'grab',
                    touchAction: 'none',
                  }}
                  onPointerDown={e => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                    overlayDragRef.current = {
                      startX: e.clientX,
                      startY: e.clientY,
                      startPosX: overlayPos.x,
                      startPosY: overlayPos.y,
                    };
                    const onMove = (ev: PointerEvent) => {
                      if (!overlayDragRef.current) return;
                      const dx = (ev.clientX - overlayDragRef.current.startX) / rect.width;
                      const dy = (ev.clientY - overlayDragRef.current.startY) / rect.height;
                      setOverlayPos({
                        x: Math.max(0.05, Math.min(0.95, overlayDragRef.current.startPosX + dx)),
                        y: Math.max(0.05, Math.min(0.95, overlayDragRef.current.startPosY + dy)),
                      });
                    };
                    const onUp = () => {
                      overlayDragRef.current = null;
                      window.removeEventListener('pointermove', onMove);
                      window.removeEventListener('pointerup', onUp);
                    };
                    window.addEventListener('pointermove', onMove);
                    window.addEventListener('pointerup', onUp);
                  }}
                >
                  {overlayText}
                </span>
              )}
              <div style={{ height: 'max(env(safe-area-inset-bottom,0px), 16px)', flexShrink: 0 }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── StoryViewer — fullscreen viewer ───────────────────────────────────────────
function StoryViewer({ groups, startGroupIdx, myId, onClose, onSeen, onAddMedia, onPublishPhoto, onPublishVideo, onOpenCamera, onDeleteItem, onSendComment, isCompanyPublisher = false }: {
  groups: StoryGroup[];
  startGroupIdx: number;
  myId: string;
  onClose: () => void;
  onSeen: (storyId: number) => void;
  onAddMedia: () => void;
  onPublishPhoto: () => void;
  onPublishVideo: () => void;
  onOpenCamera: () => void;
  onDeleteItem: (storyId: number) => void;
  onSendComment: (storyId: number, text: string) => Promise<boolean>;
  /** شركة = إعلان للقصة؛ فرد = نشر قصة (مع موسيقى/نص في الكاميرا) */
  isCompanyPublisher?: boolean;
}) {
  const [gIdx, setGIdx] = useState(startGroupIdx);
  const [iIdx, setIIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [storyMenuOpen, setStoryMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // موسيقى القصة
  const storyAudioRef = useRef<HTMLAudioElement | null>(null);
  // ── Inline story comment composer — stays on this same screen, never navigates away ──
  const [commentText, setCommentText] = useState('');
  const [commentSending, setCommentSending] = useState(false);
  const [commentSent, setCommentSent] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const commentInputRef = useRef<HTMLInputElement>(null);

  const group = groups[gIdx];
  const item = group?.items[iIdx];
  const isMyStory = group?.userId === myId;

  // ── تتبّع بالمعرّف لا بالفهرس ─────────────────────────────────────────────
  // groups تتجدد كل ثانيتين تلقائياً (ريفرش القصص) وقد يتغيّر ترتيبها أو
  // تُحذف/تُضاف عناصر منها من مكان آخر. لو اعتمدنا على gIdx/iIdx فقط كأرقام
  // فهرسة، فأي تغيّر في المصفوفة يقفز بالمُشاهد لستوري خاطئة أو يفرغ الشاشة.
  // لذلك نحتفظ بمعرّف المستخدم والعنصر الحاليين، ونعيد تحديد موقعهما الفعلي
  // داخل groups الجديدة عند كل تحديث، بدل الوثوق بالفهرس القديم.
  const viewingUserIdRef = useRef<string | null>(group?.userId ?? null);
  const viewingItemIdRef = useRef<number | null>(null);
  if (group) viewingUserIdRef.current = group.userId;
  if (item) viewingItemIdRef.current = item.id;

  // تشغيل موسيقى القصة عند تغيّر العنصر
  useEffect(() => {
    // أوقف الموسيقى السابقة
    if (storyAudioRef.current) {
      storyAudioRef.current.pause();
      storyAudioRef.current.src = '';
      storyAudioRef.current = null;
    }
    if (item?.audioUrl) {
      const audio = new Audio(item.audioUrl);
      audio.volume = 0.6;
      audio.loop = true;
      void audio.play().catch(() => {});
      storyAudioRef.current = audio;
    }
    return () => {
      if (storyAudioRef.current) {
        storyAudioRef.current.pause();
        storyAudioRef.current.src = '';
        storyAudioRef.current = null;
      }
    };
  }, [item?.id, item?.audioUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const targetUserId = viewingUserIdRef.current;
    if (targetUserId == null) return;
    const foundGIdx = groups.findIndex(g => g.userId === targetUserId);
    if (foundGIdx === -1) {
      // المجموعة اختفت بالكامل (كل عناصرها اتحذفت/انتهت) — نغلق المُشغّل بدل تجميده فارغاً.
      onClose();
      return;
    }
    setGIdx(prev => (prev === foundGIdx ? prev : foundGIdx));
    const g = groups[foundGIdx];
    const targetItemId = viewingItemIdRef.current;
    if (targetItemId == null) return;
    const foundIIdx = g.items.findIndex(it => it.id === targetItemId);
    if (foundIIdx !== -1) {
      setIIdx(prev => (prev === foundIIdx ? prev : foundIIdx));
    } else if (g.items.length === 0) {
      onClose();
    } else {
      // العنصر المعروض اتحذف من مكان آخر (تبويب ثاني / تحديث تلقائي) —
      // ننتقل لأقرب عنصر صالح بدل شاشة فارغة تنتظر خروج ودخول يدوي.
      setIIdx(prev => Math.min(prev, g.items.length - 1));
    }
  }, [groups]); // eslint-disable-line react-hooks/exhaustive-deps

  // كل ستوري مستقل: عند الانتهاء من آخر عنصر لهذا المستخدم نغلق المُشغّل
  // ونرجع للصفحة الرئيسية بدل الانتقال التلقائي لستوري مستخدم آخر.
  const goNext = useCallback(() => {
    if (!group) return;
    if (iIdx < group.items.length - 1) {
      setIIdx(i => i + 1); setProgress(0);
    } else {
      onClose();
    }
  }, [group, iIdx, onClose]);

  const goPrev = () => {
    if (iIdx > 0) { setIIdx(i => i - 1); setProgress(0); }
  };

  useEffect(() => {
    if (!item) return;
    onSeen(item.id);
    if (timerRef.current) clearInterval(timerRef.current);
    setProgress(0);
    const dur = item.duration * 1000;
    const tick = 50;
    timerRef.current = setInterval(() => {
      setProgress(p => {
        const next = p + (tick / dur) * 100;
        if (next >= 100) { clearInterval(timerRef.current!); goNext(); return 100; }
        return next;
      });
    }, tick);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCommentText('');
    setCommentSent(false);
    setEmojiOpen(false);
    setDeleteError(null);
  }, [item?.id]);

  if (!group || !item) return null;

  async function handleDelete() {
    if (!item) return;
    setDeleting(true);
    setDeleteError(null);
    const id = item.id;
    // Local-first: remove from UI immediately so delete always feels successful
    onDeleteItem(id);
    if (group.items.length <= 1) {
      onClose();
    } else if (iIdx >= group.items.length - 1) {
      setIIdx(Math.max(0, group.items.length - 2));
    }
    setConfirmDelete(false);
    setDeleting(false);
    // Best-effort server delete (any matching route)
    const attempts: Array<() => Promise<Response>> = [
      () => fetch(`/api/status/${id}`, { method: 'DELETE', credentials: 'include' }),
      () => fetch(`/api/status/${encodeURIComponent(String(id))}`, { method: 'DELETE', credentials: 'include' }),
      () => fetch(`/api/status?id=${encodeURIComponent(String(id))}`, { method: 'DELETE', credentials: 'include' }),
      () => fetch('/api/status/delete', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, statusId: id, storyId: id }),
      }),
      () => fetch(`/api/stories/${id}`, { method: 'DELETE', credentials: 'include' }),
      () => fetch('/api/status', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id, statusId: id }),
      }),
      () => fetch('/api/status', {
        method: 'DELETE', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, statusId: id }),
      }),
    ];
    for (const run of attempts) {
      try {
        const res = await run();
        if (res.ok || res.status === 204) break;
      } catch { /* try next */ }
    }
  }

  async function handleSubmitComment() {
    if (!item || !commentText.trim() || commentSending) return;
    const trimmed = commentText.trim();
    const storyId = item.id;
    setCommentSending(true);
    setCommentText('');
    setEmojiOpen(false);
    try {
      const sent = await onSendComment(storyId, trimmed);
      if (sent) {
        setCommentSent(true);
        setTimeout(() => setCommentSent(false), 1600);
      } else {
        setCommentText(trimmed);
      }
    } finally {
      setCommentSending(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }}
      animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }}
      style={{ position: 'fixed', inset: 0, zIndex: 10310, background: 'hsl(var(--background))', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      onClick={e => {
        const x = (e as React.MouseEvent).clientX;
        if (x < window.innerWidth * 0.35) goPrev(); else goNext();
      }}
    >
      {/* Progress bars */}
      <div style={{ display: 'flex', gap: 3, padding: '12px 12px 0', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 }}>
        {group.items.map((it, i) => (
          <div key={it.id} style={{ flex: 1, height: 2, borderRadius: 2, background: 'hsl(var(--muted))', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2, background: 'hsl(var(--primary))',
              width: i < iIdx ? '100%' : i === iIdx ? `${progress}%` : '0%',
            }} />
          </div>
        ))}
      </div>
      {/* Story identity and controls — intentionally below the progress line */}
      <div style={{ position: 'absolute', top: 28, left: 0, right: 0, zIndex: 3, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px' }}>
        <UserAvatar name={group.name} avatarUrl={group.avatarUrl} size={36} style={{ border: '2px solid hsl(var(--card))', boxShadow: 'none' }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
          <p style={{ color: 'hsl(var(--foreground))', fontSize: '0.85rem', fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.name}</p>
          <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.68rem', margin: 0 }}>{storyRelativeTime(item.createdAt)}</p>
        </div>
        {isMyStory && (
          <div style={{ position: 'relative' }}>
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={e => { e.stopPropagation(); setStoryMenuOpen(open => !open); }}
              style={{ width: 34, height: 34, borderRadius: '50%', background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              aria-label="خيارات الحالة"
            >
              <MoreVertical size={19} strokeWidth={2.2} />
            </motion.button>
            {storyMenuOpen && (
              <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 40, right: 0, minWidth: 142, padding: 6, borderRadius: 12, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', boxShadow: '0 12px 28px hsl(var(--background)/0.5)' }}>
                <button onClick={() => { setStoryMenuOpen(false); onAddMedia(); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', border: 'none', borderRadius: 8, background: 'transparent', color: 'hsl(var(--foreground))', cursor: 'pointer', fontSize: '0.8rem', textAlign: 'right' }}>
                  <Plus size={16} color="hsl(var(--primary))" /> {isCompanyPublisher ? 'نشر إعلان للقصة' : 'نشر قصة'}
                </button>
                <button onClick={() => { setStoryMenuOpen(false); onOpenCamera(); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', border: 'none', borderRadius: 8, background: 'transparent', color: 'hsl(var(--foreground))', cursor: 'pointer', fontSize: '0.8rem', textAlign: 'right' }}>
                  <Camera size={16} color="hsl(var(--primary))" /> {isCompanyPublisher ? 'نشر إعلان للقصة عبر' : 'نشر القصة عبر'}
                </button>
                <button onClick={() => { setStoryMenuOpen(false); setDeleteError(null); setConfirmDelete(true); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', border: 'none', borderRadius: 8, background: 'transparent', color: 'hsl(var(--destructive))', cursor: 'pointer', fontSize: '0.8rem', textAlign: 'right' }}>
                  <Trash2 size={16} /> حذف الحالة
                </button>
              </div>
            )}
          </div>
        )}
        <button onClick={e => { e.stopPropagation(); onClose(); }} style={{ background: 'none', border: 'none', color: 'hsl(var(--foreground))', cursor: 'pointer', padding: 4 }} aria-label="إغلاق">
          <X size={22} strokeWidth={2.2} />
        </button>
      </div>
      {/* Media */}
      {item.mediaType === 'video'
        ? <video src={item.mediaUrl} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        : <img src={item.mediaUrl} alt="story" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      }
      {/* نص overlay على القصة */}
      {item.overlayText && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }}>
          <span
            className="story-overlay-text"
            style={{
              color: item.overlayColor ?? '#ffffff',
              position: 'absolute',
              left: `${(item.overlayX ?? 0.5) * 100}%`,
              top: `${(item.overlayY ?? 0.5) * 100}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {item.overlayText}
          </span>
        </div>
      )}
      {/* دائرة الموسيقى — تظهر بالموضع والحجم اللذين اختارهما الناشر */}
      {item.audioUrl && (
        <div
          className="story-music-orb"
          style={{
            position: 'absolute',
            left: `${(item.musicBadgeX ?? 0.5) * 100}%`,
            top:  `${(item.musicBadgeY ?? 0.88) * 100}%`,
            transform: `translate(-50%, -50%) scale(${item.musicBadgeScale ?? 1})`,
            transformOrigin: 'center center',
            zIndex: 3,
            pointerEvents: 'none',
          }}
        >
          <span className="orb-bar" />
          <span className="orb-bar" />
          <span className="orb-bar" />
          <span className="orb-bar" />
          <span className="orb-bar" />
        </div>
      )}
      {/* ── Confirm delete overlay ── */}
      {confirmDelete && (
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }}
          animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', inset: 0, zIndex: 10,
            background: 'hsl(var(--background)/0.82)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 16,
          }}
        >
          <Trash2 size={36} color="hsl(var(--destructive))" strokeWidth={1.8} />
          <p style={{ color: 'hsl(var(--foreground))', fontSize: '1rem', fontWeight: 600, margin: 0 }}>حذف هذه الحالة؟</p>
          <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.78rem', margin: 0 }}>لا يمكن التراجع</p>
          {deleteError && (
            <p style={{ color: 'hsl(var(--destructive))', fontSize: '0.75rem', margin: 0, textAlign: 'center', maxWidth: 240 }}>{deleteError}</p>
          )}
          <div style={{ display: 'flex', gap: 12 }}>
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => { setConfirmDelete(false); setDeleteError(null); }}
              style={{
                padding: '9px 22px', borderRadius: 20,
                background: 'hsl(var(--muted))',
                border: '1px solid hsl(var(--border))',
                color: 'hsl(var(--foreground))', fontSize: '0.85rem', cursor: 'pointer',
              }}
            >إلغاء</motion.button>
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={handleDelete}
              disabled={deleting}
              style={{
                padding: '9px 22px', borderRadius: 20,
                background: 'hsl(var(--destructive))',
                border: 'none',
                color: 'hsl(var(--destructive-foreground))', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
                opacity: deleting ? 0.6 : 1,
              }}
            >{deleting ? '…' : 'حذف'}</motion.button>
          </div>
        </motion.div>
      )}

      {/* ── Inline comment composer — لا يفتح صفحة ثانية، كتابة وإرسال في نفس المكان ── */}
      {!isMyStory && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 4,
            padding: '10px 12px calc(10px + env(safe-area-inset-bottom))',
            background: 'linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0))',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}
        >
          {emojiOpen && (
            <div style={{
              display: 'flex', gap: 6, padding: '8px 10px', borderRadius: 14,
              background: 'rgba(20,20,20,0.72)', backdropFilter: 'blur(10px)',
              width: 'fit-content',
            }}>
              {add_friend.QUICK_EMOJIS.map(em => (
                <button
                  key={em}
                  onClick={() => { setCommentText(t => t + em); commentInputRef.current?.focus(); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.15rem', padding: 2, lineHeight: 1 }}
                >
                  {em}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setEmojiOpen(o => !o)}
              aria-label="إيموجي"
              style={{
                width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                background: emojiOpen ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.12)',
                border: 'none', color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Smile size={18} strokeWidth={2} />
            </button>
            <input
              ref={commentInputRef}
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !commentSending) handleSubmitComment(); }}
              placeholder="اكتب تعليقاً..."
              style={{
                flex: 1, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)',
                borderRadius: 22, padding: '10px 16px', color: '#fff', fontSize: '0.85rem', outline: 'none',
              }}
            />
            <motion.button
              whileTap={{ scale: 0.9 }}
              disabled={commentSending || !commentText.trim()}
              onClick={handleSubmitComment}
              aria-label="إرسال التعليق"
              style={{
                width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                background: commentText.trim() ? 'hsl(var(--primary))' : 'rgba(255,255,255,0.14)',
                border: 'none', color: commentText.trim() ? '#06171a' : 'rgba(255,255,255,0.6)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {commentSending ? (
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }} style={{
                  width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(0,0,0,0.25)', borderTopColor: '#06171a',
                }} />
              ) : <Send size={15} strokeWidth={2.4} />}
            </motion.button>
          </div>
          <AnimatePresence>
            {commentSent && (
              <motion.p
                initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
                style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.68rem', margin: '0 4px', textAlign: 'center' }}
              >
                تم إرسال تعليقك
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}

// ── Detect image/video URLs inside plain text (for text posts with pasted links) ──
const URL_IN_TEXT_RE = /https?:\/\/[^\s<>"')\]]+/gi;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?.*)?$/i;
const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|ogg|ogv)(\?.*)?$/i;
const COMPOSER_SHORT_LINKS_KEY = 'stooorna_short_links';

function composerLookupOriginalUrl(maybeShort: string): string {
  try {
    const u = new URL(maybeShort.trim());
    const m = u.pathname.match(/^\/s\/([A-Za-z0-9_-]+)/);
    if (!m) return maybeShort.trim();
    const code = m[1];
    const list = JSON.parse(localStorage.getItem(COMPOSER_SHORT_LINKS_KEY) || '[]') as Array<{ code: string; url: string }>;
    const hit = list.find(e => e.code === code);
    return hit?.url || maybeShort.trim();
  } catch {
    return maybeShort.trim();
  }
}


/** استخراج معرف التغريدة من رابط x.com / twitter.com */
function parseXStatusId(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (!/(^|\.)((twitter|x)\.com)$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/\/status(?:es)?\/(\d+)/i);
    return m?.[1] ?? null;
  } catch { return null; }
}

/**
 * جلب وسائط تغريدة X عبر واجهات عامة (بدون مفتاح API).
 * تُعيد روابط مباشرة لصور/فيديو من pbs.twimg.com / video.twimg.com
 */
async function resolveXStatusMedia(statusUrl: string): Promise<{ url: string; type: 'image' | 'video' }[]> {
  const id = parseXStatusId(statusUrl);
  if (!id) return [];
  const endpoints = [
    `https://api.fxtwitter.com/status/${id}`,
    `https://api.vxtwitter.com/status/${id}`,
  ];
  for (const ep of endpoints) {
    try {
      const r = await fetch(ep);
      if (!r.ok) continue;
      const data = await r.json() as any;
      const out: { url: string; type: 'image' | 'video' }[] = [];
      const media = data?.tweet?.media ?? data?.media ?? null;
      const photos = media?.photos ?? [];
      const videos = media?.videos ?? (media?.video ? [media.video] : []);
      if (Array.isArray(photos)) {
        for (const p of photos) {
          const url = p.url || p.media_url_https || p.src;
          if (url) out.push({ url, type: 'image' });
        }
      }
      if (Array.isArray(videos)) {
        for (const v of videos) {
          const variants = v.variants || v.video_info?.variants || [];
          let url = v.url || v.video_url || null;
          if (Array.isArray(variants) && variants.length) {
            const mp4s = variants.filter((x: any) => String(x.content_type || x.type || '').includes('mp4') || String(x.url || '').includes('.mp4'));
            mp4s.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
            url = mp4s[0]?.url || variants[0]?.url || url;
          }
          if (url) out.push({ url, type: 'video' });
        }
      }
      if (!out.length && Array.isArray(data?.mediaURLs)) {
        for (const url of data.mediaURLs) {
          if (typeof url !== 'string') continue;
          if (VIDEO_EXT_RE.test(url) || /video\.twimg\.com/i.test(url)) out.push({ url, type: 'video' });
          else out.push({ url, type: 'image' });
        }
      }
      if (!out.length && data?.video?.url) out.push({ url: data.video.url, type: 'video' });
      if (!out.length && typeof data?.image === 'string') out.push({ url: data.image, type: 'image' });
      // all media array
      const all = media?.all ?? data?.tweet?.media?.all;
      if (!out.length && Array.isArray(all)) {
        for (const item of all) {
          if (item.type === 'video' || item.type === 'gif') {
            const variants = item.variants || [];
            const mp4s = variants.filter((x: any) => String(x.content_type || '').includes('mp4'));
            mp4s.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
            const url = mp4s[0]?.url || item.url;
            if (url) out.push({ url, type: 'video' });
          } else if (item.url) {
            out.push({ url: item.url, type: 'image' });
          }
        }
      }
      if (out.length) return out;
    } catch { /* try next */ }
  }
  return [];
}

function classifyMediaUrl(raw: string): 'image' | 'video' | null {
  try {
    // حلّ الروابط القصيرة المحلية إلى الأصل قبل التصنيف
    const resolved = composerLookupOriginalUrl(raw);
    const u = new URL(resolved);
    const path = u.pathname || '';
    const full = u.href;
    if (IMAGE_EXT_RE.test(path) || IMAGE_EXT_RE.test(full)) return 'image';
    if (VIDEO_EXT_RE.test(path) || VIDEO_EXT_RE.test(full)) return 'video';
    // استعلامات ?format=jpg وغيرها
    if (/[?&](format|ext|type)=(png|jpe?g|gif|webp|avif)/i.test(full)) return 'image';
    if (/[?&](format|ext|type)=(mp4|webm|mov)/i.test(full)) return 'video';
    // hosts شائعة للصور
    if (/(images\.unsplash\.com|i\.imgur\.com|cdn\.discordapp\.com|media\.tenor\.com|pbs\.twimg\.com|instagram\.|fbcdn\.|googleusercontent\.com)/i.test(u.hostname)) return 'image';
    if (/video\.twimg\.com/i.test(u.hostname)) return 'video';
    if (/\/image|\/img|\/photo|\/photos|\/thumb|\/media\/.*\.(png|jpe?g|gif|webp)/i.test(full)) return 'image';
    if (/\/video|\/videos|\.mp4|\.webm|\/stream/i.test(full)) return 'video';
    return null;
  } catch {
    return null;
  }
}

async function resolveLinkToDirectMedia(rawUrl: string): Promise<{ url: string; type: 'image' | 'video' }[] | null> {
  const normalized = composerNormalizeUrl(rawUrl);
  if (!normalized) return null;
  const kind = classifyMediaUrl(normalized);
  if (kind) return [{ url: normalized, type: kind }];
  if (parseXStatusId(normalized)) {
    const media = await resolveXStatusMedia(normalized);
    if (media.length) return media;
  }
  return null;
}

function extractTextMediaEmbeds(text: string): { cleanText: string; embeds: { url: string; type: 'image' | 'video' }[]; xStatusUrls: string[] } {
  if (!text) return { cleanText: '', embeds: [], xStatusUrls: [] };
  const embeds: { url: string; type: 'image' | 'video' }[] = [];
  const xStatusUrls: string[] = [];
  const seen = new Set<string>();
  const cleanText = text.replace(URL_IN_TEXT_RE, (match) => {
    const raw = match.replace(/[.,;:!?]+$/, '');
    const resolved = composerLookupOriginalUrl(raw);
    const kind = classifyMediaUrl(resolved);
    if (kind && !seen.has(resolved)) {
      seen.add(resolved);
      embeds.push({ url: resolved, type: kind });
      return '';
    }
    // رابط تغريدة X — يُعرض لاحقًا كميديا كاملة عبر مكوّن async
    if (parseXStatusId(resolved) && !seen.has(resolved)) {
      seen.add(resolved);
      xStatusUrls.push(resolved);
      return '';
    }
    return match;
  }).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { cleanText, embeds, xStatusUrls };
}

// ── روابط الوسائط: نحتفظ بالرابط الأصلي للصورة/الفيديو حتى تُعرض مباشرة داخل البوست ──
export function composerMakeShortCode(len = 7): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  const arr = new Uint8Array(len);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(arr);
  else for (let i = 0; i < len; i++) arr[i] = Math.floor(Math.random() * 256);
  for (let i = 0; i < len; i++) out += alphabet[arr[i] % alphabet.length];
  return out;
}
function composerNormalizeUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`;
    const u = new URL(withProto);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch { return null; }
}
function composerSaveShortLink(entry: { code: string; url: string; shortUrl: string; createdAt: number }) {
  try {
    const prev = JSON.parse(localStorage.getItem(COMPOSER_SHORT_LINKS_KEY) || '[]') as Array<{ code: string }>;
    const next = [entry, ...prev.filter(e => e.code !== entry.code)].slice(0, 100);
    localStorage.setItem(COMPOSER_SHORT_LINKS_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}
async function composerCreateShortLink(rawUrl: string): Promise<string | null> {
  const normalized = composerNormalizeUrl(rawUrl);
  if (!normalized) return null;
  // رابط قصير قديم محلي → أرجع الأصل إن وُجد (حتى لا يفتح 404)
  if (/^https?:\/\/(www\.)?stooorna\.com\/s\//i.test(normalized)) {
    const original = composerLookupOriginalUrl(normalized);
    // إن لم نجد الأصل لا نُعيد /s/ المعطوب — أفضل إرجاع null ليظهر خطأ واضح
    if (original && !/^https?:\/\/(www\.)?stooorna\.com\/s\//i.test(original)) return original;
    return null;
  }
  // صورة/فيديو مباشرة: الرابط الأصلي كما هو → يُعرض كبيرًا داخل البوست
  const mediaKind = classifyMediaUrl(normalized);
  if (mediaKind === 'image' || mediaKind === 'video') {
    return normalized;
  }
  // صفحات (مثل x.com / مقالات): جرّب API السيرفر فقط — إن فشل نُبقي الرابط الأصلي
  // ولا نختلق أبدًا stooorna.com/s/xxx بدون مسار حقيقي على السيرفر (سبب الـ 404)
  try {
    const r = await fetch('/api/short-links', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: normalized }),
    });
    if (r.ok) {
      const d = await r.json() as { code?: string; shortUrl?: string; url?: string; id?: string };
      const code = d.code || d.id;
      const shortUrl = d.shortUrl || (code ? `https://stooorna.com/s/${code}` : null);
      // نقبل القصير فقط إن السيرفر أكّد الحفظ (ok) — وإلا الأصل
      if (shortUrl && code) {
        composerSaveShortLink({ code, url: normalized, shortUrl, createdAt: Date.now() });
        return shortUrl;
      }
      if (shortUrl && !/^https?:\/\/(www\.)?stooorna\.com\/s\//i.test(shortUrl)) return shortUrl;
    }
  } catch { /* keep original */ }
  // لا اختصار وهمي — الرابط الأصلي (x.com وغيره) يبقى كما هو ويعمل
  return normalized;
}

// ── X status → full image/video embed (fetches direct media) ───────────────────
function XStatusEmbed({ statusUrl }: { statusUrl: string }) {
  const [items, setItems] = useState<{ url: string; type: 'image' | 'video' }[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    resolveXStatusMedia(statusUrl).then(media => {
      if (cancelled) return;
      if (media.length) setItems(media);
      else setFailed(true);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) { setFailed(true); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [statusUrl]);
  if (loading) {
    return (
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', minHeight: 120, borderRadius: 14, marginTop: 8,
        background: 'rgba(0,188,212,0.06)', border: `1px solid ${CLR_POST_BORDER}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: CLR_TEXT_DIM, fontSize: '0.75rem',
      }}>
        جاري تحميل الوسائط…
      </div>
    );
  }
  if (failed || !items.length) {
    return (
      <a href={statusUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
        style={{ color: CLR_PRIMARY, fontSize: '0.75rem', wordBreak: 'break-all' }}>
        {statusUrl}
      </a>
    );
  }
  return <PostLinkEmbeds embeds={items} />;
}

// ── Auto-expand image/video links large (no tap required) ─────────────────────
function PostLinkEmbeds({ embeds }: { embeds: { url: string; type: 'image' | 'video' }[] }) {
  if (!embeds.length) return null;
  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8, width: '100%' }}
    >
      {embeds.map((m, i) => (
        <div
          key={`${m.type}-${i}-${m.url}`}
          style={{
            width: '100%', borderRadius: 14, overflow: 'hidden',
            border: `1px solid ${CLR_POST_BORDER}`, background: '#000',
          }}
        >
          {m.type === 'video' ? (
            <video
              src={m.url}
              controls
              autoPlay
              muted
              playsInline
              loop
              style={{ width: '100%', maxHeight: '70vh', display: 'block', background: '#000' }}
            />
          ) : (
            <img
              src={m.url}
              alt=""
              style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', display: 'block', background: '#000' }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── روابط X (Twitter) داخل نص البوست — تعمل لنشر المستخدمين والشركات ─────────────
// الرابط يبقى في النص كما هو، والصورة/الفيديو تظهر كاملة مباشرة
// (معاينة مربع الكتابة + الفييد + صفحة البوست المفتوح).
const X_MEDIA_CACHE = new Map<string, Promise<{ url: string; type: 'image' | 'video' }[]>>();

/** كل روابط تغريدات X/Twitter داخل نص (بدون تكرار، بنفس ترتيب ظهورها) */
function extractXStatusUrls(text: string | null | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const matches = text.match(URL_IN_TEXT_RE) || [];
  for (const m of matches) {
    const raw = m.replace(/[.,;:!?،؛]+$/, '');
    const resolved = composerLookupOriginalUrl(raw);
    const id = parseXStatusId(resolved);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(resolved);
  }
  return out;
}

/** نفس resolveXStatusMedia لكن مع كاش (لا يعيد الجلب عند كل عرض/تمرير). الفشل لا يُخزَّن حتى يمكن إعادة المحاولة */
function resolveXStatusMediaCached(statusUrl: string): Promise<{ url: string; type: 'image' | 'video' }[]> {
  const key = parseXStatusId(statusUrl) || statusUrl;
  let pending = X_MEDIA_CACHE.get(key);
  if (!pending) {
    pending = resolveXStatusMedia(statusUrl)
      .then(list => {
        if (!list.length) X_MEDIA_CACHE.delete(key);
        return list;
      })
      .catch(() => {
        X_MEDIA_CACHE.delete(key);
        return [] as { url: string; type: 'image' | 'video' }[];
      });
    X_MEDIA_CACHE.set(key, pending);
  }
  return pending;
}

/** رابط X → الصورة/الفيديو كاملة مباشرة (بدون أي ضغطة). failedNote: نص بديل بدل الرابط عند عدم وجود وسائط */
function XLinkMedia({ statusUrl, failedNote }: { statusUrl: string; failedNote?: string }) {
  const [items, setItems] = useState<{ url: string; type: 'image' | 'video' }[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setItems([]);
    resolveXStatusMediaCached(statusUrl).then(media => {
      if (cancelled) return;
      if (media.length) { setItems(media); setStatus('ready'); }
      else setStatus('failed');
    });
    return () => { cancelled = true; };
  }, [statusUrl]);

  if (status === 'loading') {
    return (
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', minHeight: 120, borderRadius: 14, marginTop: 8, boxSizing: 'border-box',
        background: 'rgba(0,188,212,0.06)', border: `1px solid ${CLR_POST_BORDER}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#536471', fontSize: '0.75rem',
      }}>
        جاري تحميل الوسائط…
      </div>
    );
  }
  if (status === 'failed') {
    if (failedNote) {
      return <p style={{ margin: '6px 0 0', color: '#536471', fontSize: '0.75rem' }}>{failedNote}</p>;
    }
    return (
      <a href={statusUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
        style={{ color: CLR_PRIMARY, fontSize: '0.75rem', wordBreak: 'break-all' }}>
        {statusUrl}
      </a>
    );
  }
  return <PostLinkEmbeds embeds={items} />;
}

// ── روابط الصور/الفيديو (X أو رابط مباشر) — مستطيل Paste + الفييد ─────────────────
/** تصنيف صارم لروابط الملفات المباشرة (امتداد/format=/مضيفات معروفة) — حتى لا نُدرج صفحات عادية كفيديو */
function classifyDirectMediaUrl(raw: string): 'image' | 'video' | null {
  try {
    const u = new URL(raw);
    const full = u.href;
    if (IMAGE_EXT_RE.test(u.pathname) || IMAGE_EXT_RE.test(full)) return 'image';
    if (VIDEO_EXT_RE.test(u.pathname) || VIDEO_EXT_RE.test(full)) return 'video';
    if (/[?&](format|ext|type)=(png|jpe?g|gif|webp|avif)/i.test(full)) return 'image';
    if (/[?&](format|ext|type)=(mp4|webm|mov)/i.test(full)) return 'video';
    if (/(^|\.)video\.twimg\.com$/i.test(u.hostname)) return 'video';
    if (/(^|\.)(pbs\.twimg\.com|images\.unsplash\.com|i\.imgur\.com|cdn\.discordapp\.com|media\.tenor\.com)$/i.test(u.hostname)) return 'image';
  } catch { /* not a url */ }
  return null;
}

/** كل الروابط التي تُعرض كوسائط داخل نص: تغريدات X + روابط صور/فيديو مباشرة (بدون تكرار) */
function extractLinkMediaUrls(text: string | null | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const matches = text.match(URL_IN_TEXT_RE) || [];
  for (const m of matches) {
    const raw = m.replace(/[.,;:!?،؛]+$/, '');
    const resolved = composerLookupOriginalUrl(raw);
    const xId = parseXStatusId(resolved);
    const key = xId ? `x:${xId}` : resolved;
    if (seen.has(key)) continue;
    if (xId || classifyDirectMediaUrl(resolved)) {
      seen.add(key);
      out.push(resolved);
    }
  }
  return out;
}

/** أول رابط داخل نص الحافظة (يقبل: https://… أو www… أو x.com/…) وإلا null */
function pickLinkFromText(raw: string | null | undefined): string | null {
  const t = (raw || '').trim();
  if (!t) return null;
  const found = t.match(URL_IN_TEXT_RE);
  if (found && found[0]) return found[0].replace(/[.,;:!?،؛]+$/, '');
  if (/^(www\.\S+|[a-z0-9-]+(\.[a-z0-9-]+)+\/\S*)$/i.test(t)) return composerNormalizeUrl(t);
  return null;
}

/** رابط واحد (X أو صورة/فيديو مباشر) → الصورة/الفيديو كاملة مباشرة. failedNote يظهر إن تعذّر العرض */
function LinkMediaPreview({ url, failedNote }: { url: string; failedNote?: string }) {
  const normalized = composerNormalizeUrl(url);
  if (!normalized) return null;
  const resolved = composerLookupOriginalUrl(normalized);
  if (parseXStatusId(resolved)) return <XLinkMedia statusUrl={resolved} failedNote={failedNote} />;
  const kind = classifyDirectMediaUrl(resolved);
  if (kind) return <PostLinkEmbeds embeds={[{ url: resolved, type: kind }]} />;
  return failedNote ? <p style={{ margin: '6px 0 0', color: '#536471', fontSize: '0.75rem' }}>{failedNote}</p> : null;
}

// ── PostText — renders post text with #hashtags highlighted ──────────────────
function PostText({ text, color, textColor, onHashtag, embedMediaLinks = false, bold = false, collapseLong = false, onMore }: {
  text: string;
  color: string;
  textColor: string;
  onHashtag?: (tag: string) => void;
  embedMediaLinks?: boolean;
  bold?: boolean;
  /** في الفييد: أكثر من 10 أسطر → أول 4 + More يفتح صفحة كاملة */
  collapseLong?: boolean;
  onMore?: () => void;
}) {
  if (!text) return null;
  const extracted = embedMediaLinks
    ? extractTextMediaEmbeds(text)
    : { cleanText: text, embeds: [] as { url: string; type: 'image' | 'video' }[], xStatusUrls: [] as string[] };
  const { cleanText, embeds, xStatusUrls } = extracted;
  if (!cleanText && embeds.length === 0 && xStatusUrls.length === 0) return null;
  const COLLAPSE_AFTER_LINES = 5;
  const PREVIEW_LINES = 5;
  const allLines = cleanText ? cleanText.split('\n') : [];
  const shouldCollapse = !!collapseLong && !!onMore && allLines.length > COLLAPSE_AFTER_LINES;
  const visibleText = shouldCollapse
    ? allLines.slice(0, PREVIEW_LINES).join('\n') + (allLines.length > PREVIEW_LINES ? '\n…' : '')
    : cleanText;
  const parts = visibleText ? visibleText.split(/(#[\p{L}\p{N}_]+|@[\p{L}\p{N}_]+|https?:\/\/[^\s<>"')\]]+)/gu) : [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {visibleText ? (
        <p style={{ color: textColor, fontSize: '0.78rem', fontWeight: bold ? 700 : undefined, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: "'Alexandria', var(--font-sans), sans-serif" }}>
          {parts.map((part, i) => {
            if (part.startsWith('#')) {
              return <button key={i} onClick={event => { event.stopPropagation(); onHashtag?.(part.slice(1)); }} style={{ color: '#1d9bf0', fontWeight: 700, background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}>{part}</button>;
            }
            if (part.startsWith('@')) {
              return <span key={i} style={{ color: 'hsl(var(--primary))', fontWeight: 700 }}>{part}</span>;
            }
            if (/^https?:\/\//i.test(part)) {
              return <a key={i} href={part} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color, fontWeight: 600, wordBreak: 'break-all' }}>{part}</a>;
            }
            return <React.Fragment key={i}>{part}</React.Fragment>;
          })}
        </p>
      ) : null}
      {shouldCollapse && (
        <button type="button" onClick={e => { e.stopPropagation(); onMore?.(); }} aria-label="More"
          style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: '2px 0', margin: 0, color: color || 'hsl(var(--primary))', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
          More
        </button>
      )}
      {embedMediaLinks && <PostLinkEmbeds embeds={embeds} />}
      {embedMediaLinks && xStatusUrls.map(u => <XStatusEmbed key={u} statusUrl={u} />)}
    </div>
  );
}

/** Normalize media/avatar URLs so relative paths load on every route */
function resolveMediaUrl(url: string | null | undefined): string {
  if (!url) return '';
  const s = String(url).trim();
  if (!s) return '';
  if (/^(https?:|blob:|data:|\/\/)/i.test(s)) {
    if (s.startsWith('//') && typeof window !== 'undefined') return `${window.location.protocol}${s}`;
    return s;
  }
  if (typeof window !== 'undefined') {
    try {
      if (s.startsWith('/')) return `${window.location.origin}${s}`;
      return new URL(s, window.location.origin).href;
    } catch {
      return s;
    }
  }
  return s;
}


/** Record a unique post view (server dedupes per viewer). Fire-and-forget. */
const recordedPostViews = new Set<string>();

const FEED_ADS_KEY = 'stooorna_feed_ads';
const AD_MEDIA_DB = 'stooorna_ad_media_db';
const AD_MEDIA_STORE = 'media';

function openAdMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(AD_MEDIA_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(AD_MEDIA_STORE)) db.createObjectStore(AD_MEDIA_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
}

async function stooornaAdMediaPut(id: string, dataUrl: string) {
  try {
    const db = await openAdMediaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(AD_MEDIA_STORE, 'readwrite');
      tx.objectStore(AD_MEDIA_STORE).put(dataUrl, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { /* ignore */ }
}

async function stooornaAdMediaGet(id: string): Promise<string | null> {
  try {
    const db = await openAdMediaDb();
    const val = await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(AD_MEDIA_STORE, 'readonly');
      const r = tx.objectStore(AD_MEDIA_STORE).get(id);
      r.onsuccess = () => resolve((r.result as string) || null);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return val;
  } catch { return null; }
}

async function stooornaAdMediaDelete(id: string) {
  try {
    const db = await openAdMediaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(AD_MEDIA_STORE, 'readwrite');
      tx.objectStore(AD_MEDIA_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { /* ignore */ }
}

function loadFeedAdsMeta(): any[] {
  try {
    const mem = (typeof window !== 'undefined' && (window as any).__stooornaFeedAds) as any[] | undefined;
    if (Array.isArray(mem) && mem.length) return mem;
  } catch { /* */ }
  try {
    const raw = localStorage.getItem(FEED_ADS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

function saveFeedAdsMeta(list: any[]) {
  const next = Array.isArray(list) ? list.slice(0, 120) : [];
  try { (window as any).__stooornaFeedAds = next; } catch { /* */ }
  try {
    // metadata only — media lives in IndexedDB
    const light = next.map(a => ({
      ...a,
      mediaUrl: a.mediaUrl && String(a.mediaUrl).startsWith('data:') ? null : a.mediaUrl,
      pdfUrl: a.pdfUrl && String(a.pdfUrl).startsWith('data:') ? null : a.pdfUrl,
    }));
    localStorage.setItem(FEED_ADS_KEY, JSON.stringify(light));
  } catch {
    try {
      localStorage.setItem(FEED_ADS_KEY, JSON.stringify(next.map(a => ({
        id: a.id, userId: a.userId, authorName: a.authorName, authorUsername: a.authorUsername,
        authorAvatarUrl: a.authorAvatarUrl, title: a.title, body: a.body, mediaType: a.mediaType,
        mediaName: a.mediaName, mediaMime: a.mediaMime, createdAt: a.createdAt, endsAt: a.endsAt,
        expiresAt: a.expiresAt, campaignEndsAt: a.campaignEndsAt, nextEligibleAt: a.nextEligibleAt,
      }))));
    } catch { /* */ }
  }
  try { window.dispatchEvent(new CustomEvent('stooorna:feed-ads', { detail: next })); } catch { /* */ }
}

function isAdLive(a: any, now = Date.now()): boolean {
  const ends = new Date(a.endsAt || a.expiresAt || 0).getTime();
  if (!ends) return true;
  return ends > now;
}

function formatAdEndsAt(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** live = on public feed (24h), cooldown = hidden 4h then auto republish, ended = campaign over */
function getAdPhase(a: any, now = Date.now()): 'live' | 'cooldown' | 'ended' {
  const ends = new Date(a.endsAt || a.expiresAt || 0).getTime();
  const nextEl = new Date(a.nextEligibleAt || 0).getTime();
  const campaign = new Date(a.campaignEndsAt || 0).getTime();
  if (campaign && campaign <= now) return 'ended';
  if (ends && ends > now) return 'live';
  if (nextEl && nextEl > now) return 'cooldown';
  if (campaign && campaign > now) return 'cooldown';
  return 'ended';
}

function getAdCountdownMs(a: any, now = Date.now()): number {
  const phase = getAdPhase(a, now);
  if (phase === 'live') {
    return Math.max(0, new Date(a.endsAt || a.expiresAt || 0).getTime() - now);
  }
  if (phase === 'cooldown') {
    const nextEl = new Date(a.nextEligibleAt || 0).getTime();
    return Math.max(0, nextEl - now);
  }
  return 0;
}

/** When 24h ends → 4h cooldown; when 4h ends → auto Publish another 24h until campaign ends */

const AD_CLIMB_MS = 5 * 60 * 1000;

function getAdCycleStartMs(a: any): number {
  const t = new Date(a.lastAutoPublishAt || a.createdAt || 0).getTime();
  return t || Date.now();
}

function getAdClimbCount(a: any, now = Date.now()): number {
  const start = getAdCycleStartMs(a);
  if (!start || now <= start) return 0;
  return Math.floor((now - start) / AD_CLIMB_MS);
}

function getAdNextClimbMs(a: any, now = Date.now()): number {
  const start = getAdCycleStartMs(a);
  if (!start) return AD_CLIMB_MS;
  const elapsed = Math.max(0, now - start);
  const mod = elapsed % AD_CLIMB_MS;
  return mod === 0 ? AD_CLIMB_MS : AD_CLIMB_MS - mod;
}

/** Insert index among posts: new posts stay above; every 5 min climb one older slot toward top */
function getAdInsertIndex(ad: any, posts: any[], now = Date.now()): number {
  const adCreated = new Date(ad.createdAt || 0).getTime() || now;
  const climbs = getAdClimbCount(ad, now);
  let newer = 0;
  let older = 0;
  for (const p of posts) {
    const pt = new Date((p as any).createdAt || 0).getTime() || 0;
    if (pt > adCreated) newer += 1;
    else older += 1;
  }
  const olderAbove = Math.max(0, older - climbs);
  return Math.min(posts.length, newer + olderAbove);
}

function buildFeedWithAds(posts: any[], ads: any[], now = Date.now()): Array<{ type: 'post'; post: any } | { type: 'ad'; ad: any }> {
  const liveAds = (ads || []).filter((a) => isAdLive(a, now));
  if (!liveAds.length) {
    return posts.map((post) => ({ type: 'post' as const, post }));
  }
  // Place ads from lowest insert index first so later inserts shift correctly
  const planned = liveAds
    .map((ad) => ({ ad, index: getAdInsertIndex(ad, posts, now) }))
    .sort((a, b) => a.index - b.index || String(a.ad.id).localeCompare(String(b.ad.id)));

  const out: Array<{ type: 'post'; post: any } | { type: 'ad'; ad: any }> = [];
  let pi = 0;
  let ai = 0;
  while (pi < posts.length || ai < planned.length) {
    while (ai < planned.length && planned[ai].index <= pi) {
      out.push({ type: 'ad', ad: planned[ai].ad });
      ai += 1;
    }
    if (pi < posts.length) {
      out.push({ type: 'post', post: posts[pi] });
      pi += 1;
    } else {
      while (ai < planned.length) {
        out.push({ type: 'ad', ad: planned[ai].ad });
        ai += 1;
      }
    }
  }
  return out;
}

function processAdAutoRepublish(list: any[], now = Date.now()): { list: any[]; changed: boolean } {
  let changed = false;
  const next = (Array.isArray(list) ? list : []).map((a) => {
    const campaign = new Date(a.campaignEndsAt || 0).getTime();
    if (campaign && campaign <= now) return a;
    let ends = new Date(a.endsAt || a.expiresAt || 0).getTime();
    let nextEl = new Date(a.nextEligibleAt || 0).getTime();
    if (!ends) return a;
    // Live window expired but cooldown not set properly
    if (ends <= now && (!nextEl || nextEl <= ends)) {
      nextEl = ends + 4 * 3600 * 1000;
      changed = true;
      return {
        ...a,
        nextEligibleAt: new Date(nextEl).toISOString(),
      };
    }
    // Cooldown finished → auto republish 24h
    if (ends <= now && nextEl && nextEl <= now && (!campaign || campaign > now)) {
      const newEnds = now + 24 * 3600 * 1000;
      const newNext = newEnds + 4 * 3600 * 1000;
      changed = true;
      return {
        ...a,
        endsAt: new Date(newEnds).toISOString(),
        expiresAt: new Date(newEnds).toISOString(),
        nextEligibleAt: new Date(newNext).toISOString(),
        lastAutoPublishAt: new Date(now).toISOString(),
      };
    }
    return a;
  });
  return { list: next, changed };
}

const LOCAL_POST_VIEWS_KEY = 'stooorna_local_post_views';
const LOCAL_AUTHOR_VIEWS_KEY = 'stooorna_local_author_views';

function readLocalPostViews(): Record<string, number> {
  try {
    const o = JSON.parse(localStorage.getItem(LOCAL_POST_VIEWS_KEY) || '{}');
    return o && typeof o === 'object' ? o : {};
  } catch { return {}; }
}
function readLocalAuthorViews(): Record<string, number> {
  try {
    const o = JSON.parse(localStorage.getItem(LOCAL_AUTHOR_VIEWS_KEY) || '{}');
    return o && typeof o === 'object' ? o : {};
  } catch { return {}; }
}
function getLocalPostViewCount(postId: number | string | null | undefined): number {
  if (postId == null || postId === '') return 0;
  return Number(readLocalPostViews()[String(postId)] || 0) || 0;
}
function getLocalAuthorViewCount(authorId: string | null | undefined): number {
  if (!authorId) return 0;
  return Number(readLocalAuthorViews()[String(authorId)] || 0) || 0;
}
/** Profile header Views: server counts + local fallback views */
function resolveProfileViewsCount(
  profileLike: { viewsCount?: number; viewCount?: number; id?: string; userId?: string } | null | undefined,
  posts: Array<{ viewsCount?: number; views?: number; authorId?: string }> = [],
): number {
  const server =
    Number((profileLike as any)?.viewsCount ?? (profileLike as any)?.viewCount ?? 0) || 0;
  const fromPosts = posts.reduce((sum, p) => {
    const sv = Number((p as any).viewsCount ?? (p as any).views ?? 0) || 0;
    const lv = getLocalPostViewCount((p as any).id);
    return sum + Math.max(sv, lv);
  }, 0);
  const authorId = String((profileLike as any)?.id || (profileLike as any)?.userId || '');
  const localAuthor = getLocalAuthorViewCount(authorId);
  return Math.max(server, fromPosts, localAuthor);
}

function recordPostView(postId: number | string | null | undefined, authorId?: string | null) {
  if (postId == null || postId === '') return;
  const key = String(postId);
  if (recordedPostViews.has(key)) return;
  recordedPostViews.add(key);
  try {
    if (typeof sessionStorage !== 'undefined') {
      const sk = `stooorna_pv_${key}`;
      if (sessionStorage.getItem(sk)) return;
      sessionStorage.setItem(sk, '1');
    }
  } catch { /* ignore */ }
  // Local counters so Views works even if /view API is missing
  try {
    const pv = readLocalPostViews();
    pv[key] = (Number(pv[key]) || 0) + 1;
    localStorage.setItem(LOCAL_POST_VIEWS_KEY, JSON.stringify(pv));
    if (authorId) {
      const av = readLocalAuthorViews();
      const ak = String(authorId);
      av[ak] = (Number(av[ak]) || 0) + 1;
      localStorage.setItem(LOCAL_AUTHOR_VIEWS_KEY, JSON.stringify(av));
    }
    window.dispatchEvent(new CustomEvent('stooorna:post-views', { detail: { postId: key, authorId } }));
  } catch { /* ignore */ }
  void fetch(`/api/posts/${encodeURIComponent(key)}/view`, {
    method: 'POST',
    credentials: 'include',
  }).catch(() => { /* ignore */ });
  // Alternate endpoints some backends use
  void fetch('/api/posts/view', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ postId: key, id: key }),
  }).catch(() => { /* ignore */ });
}

function normalizePostMediaFields<T extends {
  mediaUrl?: string | null;
  mediaUrls?: string[] | null;
  authorAvatarUrl?: string | null;
}>(post: T): T {
  const mediaUrl = post.mediaUrl ? resolveMediaUrl(post.mediaUrl) : post.mediaUrl;
  const mediaUrls = Array.isArray(post.mediaUrls)
    ? post.mediaUrls.map(u => resolveMediaUrl(u)).filter(Boolean)
    : post.mediaUrls;
  const authorAvatarUrl = post.authorAvatarUrl ? resolveMediaUrl(post.authorAvatarUrl) : post.authorAvatarUrl;
  return { ...post, mediaUrl, mediaUrls, authorAvatarUrl };
}

/** True when author is an approved Business account (yellow badge next to @username) */
function isAuthorBusinessAccount(authorId?: string | null, authorUsername?: string | null): boolean {
  try {
    const id = String(authorId || '').trim();
    const un = String(authorUsername || '').replace(/^@/, '').trim().toLowerCase();
    if (!id && !un) return false;
    const dirRaw = localStorage.getItem('stooorna_business_directory');
    const dir = dirRaw ? JSON.parse(dirRaw) : [];
    if (Array.isArray(dir) && dir.some((x: any) =>
      (id && String(x.userId || '') === id) ||
      (un && String(x.username || '').replace(/^@/, '').toLowerCase() === un)
    )) return true;
    const regRaw = localStorage.getItem('stooorna_business_registry');
    const reg = regRaw ? JSON.parse(regRaw) : [];
    if (Array.isArray(reg) && reg.some((x: any) =>
      x.status === 'approved' && (
        (id && String(x.userId || '') === id) ||
        (un && String(x.username || '').replace(/^@/, '').toLowerCase() === un)
      )
    )) return true;
  } catch { /* ignore */ }
  return false;
}

function BusinessHeadBadgeInline({ compact }: { compact?: boolean }) {
  return (
    <span
      title="Business"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: compact ? '0.52rem' : '0.58rem',
        fontWeight: 900,
        color: '#0a0a0a',
        background: '#eab308',
        borderRadius: 5,
        padding: compact ? '1px 5px' : '2px 7px',
        letterSpacing: '0.04em',
        lineHeight: 1.2,
        boxShadow: '0 0 8px rgba(234,179,8,0.45)',
        verticalAlign: 'middle',
        flexShrink: 0,
        marginInlineStart: 4,
      }}
    >
      Business
    </span>
  );
}

// ── PostCard — a single feed post: one card, paper-style text area, small expandable media ──
function PostMediaItems(post: PostItem): { url: string; type: 'image' | 'video' }[] {
  if (post.mediaUrls?.length) {
    return post.mediaUrls.map((url, index) => ({
      url: resolveMediaUrl(url),
      type: post.mediaTypes?.[index] === 'video' ? 'video' : 'image',
    })).filter(m => !!m.url);
  }
  return post.mediaUrl
    ? [{ url: resolveMediaUrl(post.mediaUrl), type: post.mediaType ?? 'image' }]
    : [];
}

// ── دمج منشورات جاية من السيرفر مع النسخة المحلية الحالية — يحمي منشوراتنا اللي
// فيها أكثر من صورة: لو السيرفر رجّع نفس المنشور بعدد صور أقل (مثلاً صورة وحدة
// بس بدل ٤ أو ٥)، نحافظ على قائمة الصور المحلية الكاملة بدل ما نفقدها كل ما
// يصير تحديث بالخلفية (كل ثانيتين) أو عند فتح بانر "New Posts". ──
function mergePostsPreservingMedia(prevPosts: PostItem[], serverPosts: PostItem[]): PostItem[] {
  const prevById = new Map(prevPosts.map(p => [p.id, p]));
  const serverIds = new Set(serverPosts.map(p => p.id));
  const merged = serverPosts.map(serverPost => {
    const existing = prevById.get(serverPost.id);
    const normalized = normalizePostMediaFields(serverPost);
    if (!existing) return normalized;
    const existingCount = existing.mediaUrls?.length ?? (existing.mediaUrl ? 1 : 0);
    const serverCount = normalized.mediaUrls?.length ?? (normalized.mediaUrl ? 1 : 0);
    if (existingCount > serverCount) {
      return normalizePostMediaFields({
        ...normalized,
        mediaUrl: existing.mediaUrl,
        mediaType: existing.mediaType,
        mediaUrls: existing.mediaUrls,
        mediaTypes: existing.mediaTypes,
      });
    }
    return normalized;
  });
  // Keep local-only posts (just published, or media-only filtered out of server payload)
  for (const p of prevPosts) {
    if (!serverIds.has(p.id)) merged.push(normalizePostMediaFields(p));
  }
  return merged.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

function PostCard({
  post,
  isMine,
  followStatus,
  onFollow,
  onToggleLike,
  onOpenPost,
  onOpenComments,
  onRequestDelete,
  onRemoveMedia,
  onHashtag,
  onToggleFavorite,
  isFavorited,
  onShare,
  onRepost,
  onDownload,
  onOpenProfile,
  isPinned,
  onTogglePin,
  likeBurstKey = 0,
  onProductShareMenu,
  productShareAlert = false,
  isCompanyAuthor = false,
}: {
  post: PostItem;
  isMine: boolean;
  // null لصاحب المنشور نفسه (ما نعرض له زر متابعة على منشوره)، وإلا حالة العلاقة
  // الحالية بين المستخدم الحالي وناشر هذا المنشور.
  followStatus: 'accepted' | 'pending' | 'none' | null;
  onFollow: (post: PostItem) => void;
  onToggleLike: (post: PostItem) => void;
  /** يزيد عند كل لايك لتشغيل أنيميشن الفقاعة */
  likeBurstKey?: number;
  onOpenPost: (post: PostItem) => void;
  /** Instagram-style comments sheet — only the comment icon should open this */
  onOpenComments?: (post: PostItem) => void;
  onRequestDelete: (post: PostItem) => void;
  onRemoveMedia: (post: PostItem) => void;
  onHashtag: (tag: string) => void;
  onToggleFavorite: (post: PostItem) => void;
  isFavorited: (postId: number) => boolean;
  onShare: (post: PostItem) => void;
  /** قائمة شير المنتج: خارجي أو استفسار */
  onProductShareMenu?: (post: PostItem) => void;
  /** شير أصفر عند وجود رد من الشركة على استفسار */
  productShareAlert?: boolean;
  /** منشور شركة — نفس شريط المنتج بالخارج */
  isCompanyAuthor?: boolean;
  onRepost: (post: PostItem) => void;
  onDownload: (post: PostItem) => void;
  // فتح صورة الملف الشخصي الآن يفتح مربع البروفايل الكامل (بيانات + شات + مكالمة) بدل
  // معاينة الصورة وحدها — لا يُستدعى لمنشورك أنت (isMine).
  onOpenProfile: (post: PostItem) => void;
  // هل هذا هو منشوري المثبّت؟ اختياري — يظهر شارة "مثبت" ويتيح خيار "إلغاء التثبيت"
  // بدل "تثبيت" في قائمة الثلاث نقاط. لا يُمرَّر إلا على منشوراتي أنا.
  isPinned?: boolean;
  onTogglePin?: (post: PostItem) => void;
}) {
  const postDate = new Date(post.createdAt);
  const arabicNumber = (value: number) => new Intl.NumberFormat('ar-KW').format(value);
  const timeAgo = (() => {
    const diffSeconds = Math.max(0, Math.floor((Date.now() - postDate.getTime()) / 1000));
    if (diffSeconds < 60) return `منذ ${arabicNumber(diffSeconds || 1)} ثانية`;
    const minutes = Math.floor(diffSeconds / 60);
    if (minutes < 60) return `منذ ${arabicNumber(minutes)} دقيقة`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `منذ ${arabicNumber(hours)} ساعة`;
    const days = Math.floor(hours / 24);
    return `منذ ${arabicNumber(days)} يوم`;
  })();
  const publishedDate = postDate.toLocaleDateString('ar-KW', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const mediaItems = PostMediaItems(post);
  const hasMedia = mediaItems.length > 0;
  const [mediaLightbox, setMediaLightbox] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
  const [postMenuOpen, setPostMenuOpen] = useState(false);
  // ── قائمة الثلاث نقاط + كتم الصوت داخل المعاينة كاملة الشاشة (mediaLightbox) ──
  const [lightboxMenuOpen, setLightboxMenuOpen] = useState(false);
  const [lightboxMuted, setLightboxMuted] = useState(false);
  // ── كتم الصوت لكل عنصر فيديو داخل معاينة الفييد الصغيرة (مكتوم افتراضياً كمعاينة) ──
  const [feedMuted, setFeedMuted] = useState<Record<number, boolean>>({});
  // ── معرض الصور المتعددة داخل المنشور — تنقل يمين/يسار + عداد صفحات (1/N) زي انستغرام ──
  const [mediaPage, setMediaPage] = useState(0);
  const mediaScrollRef = useRef<HTMLDivElement | null>(null);
  const productAd = parseProductAd(post.text);
  // Product UI (hamburger + details sheet) is only for company/business authors
  const isProductAd = !!productAd && !!isCompanyAuthor;

  useEffect(() => {
    recordPostView(post.id, post.authorId);
  }, [post.id, post.authorId]);
  // روابط X داخل نص المنشور — نص إعلان/منشور المنتج مخفي في الفييد، فنعرض وسائط الرابط مباشرة
  const postXUrls = isProductAd ? extractLinkMediaUrls(post.text) : [];
  const [productDetailsOpen, setProductDetailsOpen] = useState(false);
  function goToMediaPage(idx: number) {
    const el = mediaScrollRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(idx, mediaItems.length - 1));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: 'smooth' });
    setMediaPage(clamped);
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          border: 'none',
          borderBottom: `1px solid ${CLR_POST_BORDER}`,
          background: '#ffffff',
          borderRadius: 0,
          padding: hasMedia ? '14px 0 14px' : '14px 14px',
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: hasMedia ? 0 : 10,
          position: 'relative',
        }}
      >
        {/* Repost attribution ribbon — only present on a feed entry created by a repost */}
        {post.repostedBy && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#000000', fontSize: '0.68rem', fontWeight: 700, paddingInline: 14, marginBottom: 8 }}>
            <Repeat2 size={13} strokeWidth={2.2} />
            <span>أعاد {post.repostedBy.name || post.repostedBy.username || '—'} نشر هذا المنشور</span>
          </div>
        )}
        {/* Header: صورة البروفايل بجانب الاسم لكل مستخدم وشركة */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingInline: hasMedia ? 14 : 0, marginBottom: hasMedia ? 10 : 0 }}>
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={e => {
              e.stopPropagation();
              if (isMine) return;
              onOpenProfile(post);
            }}
            aria-label="عرض الملف الشخصي"
            style={{ padding: 0, border: 'none', background: 'none', cursor: isMine ? 'default' : 'pointer', borderRadius: '50%', flexShrink: 0 }}
          >
            <UserAvatar name={post.authorName} avatarUrl={resolveMediaUrl(post.authorAvatarUrl) || post.authorAvatarUrl} size={38} />
          </motion.button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: '#000000', fontSize: '0.82rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
              {post.authorName || post.authorUsername || '—'}
              <span style={{ color: 'rgba(0,0,0,0.55)', fontSize: '0.66rem', fontWeight: 700, marginInlineStart: 6 }}>
                {publishedDate}
              </span>
              <span style={{ color: 'rgba(0,0,0,0.45)', fontSize: '0.64rem', fontWeight: 600 }}>
                · {timeAgo}
              </span>
              {isPinned && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  marginInlineStart: 8, padding: '2px 7px', borderRadius: 10,
                  background: 'hsl(var(--primary) / 0.12)', color: 'hsl(var(--primary))',
                  fontSize: '0.62rem', fontWeight: 700,
                }}>
                  <Pin size={10} strokeWidth={2.4} />
                  مثبت
                </span>
              )}
            </p>
            <p style={{ color: '#000000', fontSize: '0.68rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
              {post.authorUsername && <span style={{ color: 'hsl(var(--primary))', fontWeight: 700 }}>@{post.authorUsername}</span>}
              {isAuthorBusinessAccount(post.authorId, post.authorUsername) && <BusinessHeadBadgeInline compact />}
            </p>
          </div>

          {/* زر المتابعة/الإضافة — لا يظهر على منشورك أنت (followStatus === null) */}
          {followStatus === 'pending' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
              padding: '5px 10px', borderRadius: 20, background: CLR_CARD_BG, border: `1px solid ${CLR_CARD_BORDER}`,
            }}>
              <Clock size={12} strokeWidth={2} color={CLR_TEXT_DIM} />
              <span style={{ fontSize: '0.66rem', color: CLR_TEXT_DIM, fontWeight: 600, whiteSpace: 'nowrap' }}>بانتظار القبول</span>
            </div>
          )}
          {followStatus === 'none' && (
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={e => { e.stopPropagation(); onFollow(post); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                padding: '6px 12px', borderRadius: 20, background: 'hsl(var(--primary))',
                border: 'none', color: '#06171a', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
              }}
            >
              {post.authorIsPrivate ? <Lock size={12} strokeWidth={2.6} /> : <UserPlus size={12} strokeWidth={2.6} />}
              {post.authorIsPrivate ? 'Private' : 'Follow'}
            </motion.button>
          )}

          {/* ⋮ قائمة الناشر — زاوية البوست يمين */}
          {isMine && (
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={e => { e.stopPropagation(); setPostMenuOpen(v => !v); }}
                aria-label="خيارات المنشور"
                style={{
                  width: 32, height: 32, borderRadius: '50%', border: 'none',
                  background: 'transparent', color: '#000000', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                }}
              >
                <MoreVertical size={18} strokeWidth={2.2} />
              </motion.button>
              {postMenuOpen && (
                <>
                  <div
                    onClick={e => { e.stopPropagation(); setPostMenuOpen(false); }}
                    style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                  />
                  <div
                    onClick={e => e.stopPropagation()}
                    style={{
                      position: 'absolute', top: 34, insetInlineEnd: 0, zIndex: 41,
                      minWidth: 150, padding: 6, borderRadius: 12,
                      background: 'hsl(var(--card))',
                      border: `1px solid ${CLR_CARD_BORDER}`,
                      boxShadow: '0 12px 28px rgba(0,0,0,0.45)',
                    }}
                  >
                    {onTogglePin && (
                      <button
                        type="button"
                        onClick={() => {
                          setPostMenuOpen(false);
                          onTogglePin(post);
                        }}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                          padding: '10px 12px', border: 'none', borderRadius: 8,
                          background: 'transparent', color: CLR_TEXT, cursor: 'pointer',
                          fontSize: '0.8rem', textAlign: 'right',
                        }}
                      >
                        {isPinned ? <PinOff size={15} color={CLR_PRIMARY} /> : <Pin size={15} color={CLR_PRIMARY} />}
                        {isPinned ? 'إلغاء التثبيت' : 'تثبيت المنشور'}
                      </button>
                    )}
                    {hasMedia && (
                      <button
                        type="button"
                        onClick={() => {
                          setPostMenuOpen(false);
                          onRemoveMedia(post);
                        }}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                          padding: '10px 12px', border: 'none', borderRadius: 8,
                          background: 'transparent', color: CLR_TEXT, cursor: 'pointer',
                          fontSize: '0.8rem', textAlign: 'right',
                        }}
                      >
                        <ImageIcon size={15} color={CLR_PRIMARY} />
                        حذف الوسائط
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setPostMenuOpen(false);
                        onRequestDelete(post);
                      }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 12px', border: 'none', borderRadius: 8,
                        background: 'transparent', color: 'hsl(var(--destructive))', cursor: 'pointer',
                        fontSize: '0.8rem', textAlign: 'right',
                      }}
                    >
                      <Trash2 size={15} />
                      حذف المنشور
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Text-only posts (no media): show caption on the card */}
        {!hasMedia && post.text && !isProductAd && (
          <div style={{ background: 'transparent', border: 'none', borderRadius: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column' }}>
            <PostText text={post.text} color="hsl(var(--primary))" textColor="#000000" bold onHashtag={onHashtag} embedMediaLinks collapseLong onMore={() => setProductDetailsOpen(true)} />
          </div>
        )}

        {/* Media posts: caption is hidden on the card — open via the three-lines button only */}

        {/* Media — من اليمين لليسار بعرض الشاشة كاملاً. لو أكثر من عنصر واحد: معرض قابل
            للتصفح يمين/يسار (سحب أو أزرار الأسهم) مع عداد صفحات "1/N" زي انستغرام. */}
        {hasMedia && (
          <div style={{ position: 'relative', width: '100%' }}>
            {mediaItems.length > 1 && (
              <style>{'.post-media-scroll::-webkit-scrollbar{display:none}'}</style>
            )}
            <div
              ref={mediaScrollRef}
              className={mediaItems.length > 1 ? 'post-media-scroll' : undefined}
              onScroll={e => {
                if (mediaItems.length <= 1) return;
                const el = e.currentTarget;
                if (!el.clientWidth) return;
                const idx = Math.round(el.scrollLeft / el.clientWidth);
                setMediaPage(prev => (prev === idx ? prev : idx));
              }}
              style={{
                display: 'flex', flexDirection: 'row', width: '100%',
                // نفرض LTR داخل شريط التصفح نفسه فقط (بعيدًا عن اتجاه الصفحة العام RTL)
                // عشان يكون ترتيب السحب/العدّاد ثابت ومتوقّع دايمًا: سحب لليسار = الصورة التالية.
                direction: 'ltr',
                overflowX: mediaItems.length > 1 ? 'auto' : 'hidden',
                scrollSnapType: mediaItems.length > 1 ? 'x mandatory' : undefined,
                WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
              }}
            >
              {mediaItems.map((media, index) => (
                <div
                  key={`${media.type}-${index}`}
                  style={{
                    position: 'relative', width: '100%', flexShrink: 0,
                    scrollSnapAlign: mediaItems.length > 1 ? 'start' : undefined,
                  }}
                >
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      onOpenPost(post);
                    }}
                    aria-label={media.type === 'video' ? 'فتح الفيديو' : 'فتح الصورة'}
                    style={{
                      position: 'relative', width: '100%', border: '3px solid #000', boxSizing: 'border-box', padding: 0,
                      background: '#000', cursor: 'pointer', display: 'block', overflow: 'hidden', maxHeight: '48vh',
                    }}
                  >
                    {media.type === 'video' ? (
                      <video
                        src={media.url}
                        muted={feedMuted[index] !== false}
                        autoPlay
                        loop
                        playsInline
                        preload="metadata"
                        onClick={e => e.stopPropagation()}
                        style={{ width: '100%', maxHeight: '48vh', objectFit: 'cover', display: 'block', background: '#000' }}
                      />
                    ) : (
                      <img
                        src={media.url}
                        alt=""
                        style={{ width: '100%', maxHeight: '48vh', objectFit: 'cover', display: 'block', background: '#000' }}
                      />
                    )}
                  </button>
                  {/* أيقونة كتم/تشغيل الصوت — تحل محل أزرار الفيديو الافتراضية (controls) على
                      معاينة الفييد الصغيرة، فتبقى الصورة/الفيديو تبين كاملة وبعيدة بدون تحكمات كبيرة تغطيها. */}
                  {media.type === 'video' && (
                    <motion.button
                      whileTap={{ scale: 0.88 }}
                      onClick={e => {
                        e.stopPropagation();
                        setFeedMuted(prev => ({ ...prev, [index]: prev[index] === false ? true : false }));
                      }}
                      aria-label={feedMuted[index] === false ? 'كتم الصوت' : 'تشغيل الصوت'}
                      style={{
                        position: 'absolute', bottom: 10, insetInlineEnd: 10, width: 30, height: 30, borderRadius: '50%',
                        background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2,
                      }}
                    >
                      {feedMuted[index] === false ? <Volume2 size={14} strokeWidth={2.2} /> : <VolumeX size={14} strokeWidth={2.2} />}
                    </motion.button>
                  )}
                  {isMine && index === 0 && (
                    <motion.button whileTap={{ scale: 0.88 }} onClick={e => { e.stopPropagation(); onRemoveMedia(post); }} aria-label="حذف الوسائط" style={{
                      position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: '50%',
                      background: 'rgba(20,20,20,0.85)', border: `1px solid ${CLR_POST_BORDER}`, color: '#fff', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2,
                    }}>
                      <X size={14} strokeWidth={2.6} />
                    </motion.button>
                  )}
                </div>
              ))}
            </div>

            {/* أسهم يمين/يسار + عداد الصفحات — تظهر فقط لو المنشور فيه أكثر من صورة/فيديو */}
            {mediaItems.length > 1 && (
              <>
                {mediaPage > 0 && (
                  <motion.button
                    whileTap={{ scale: 0.88 }}
                    onClick={e => { e.stopPropagation(); goToMediaPage(mediaPage - 1); }}
                    aria-label="الصورة السابقة"
                    style={{
                      position: 'absolute', top: '50%', left: 8, transform: 'translateY(-50%)',
                      width: 30, height: 30, borderRadius: '50%',
                      background: 'rgba(0,0,0,0.45)', border: 'none', color: '#fff', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2,
                    }}
                  >
                    <ChevronLeft size={17} strokeWidth={2.4} />
                  </motion.button>
                )}
                {mediaPage < mediaItems.length - 1 && (
                  <motion.button
                    whileTap={{ scale: 0.88 }}
                    onClick={e => { e.stopPropagation(); goToMediaPage(mediaPage + 1); }}
                    aria-label="الصورة التالية"
                    style={{
                      position: 'absolute', top: '50%', right: 8, transform: 'translateY(-50%)',
                      width: 30, height: 30, borderRadius: '50%',
                      background: 'rgba(0,0,0,0.45)', border: 'none', color: '#fff', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2,
                    }}
                  >
                    <ChevronRight size={17} strokeWidth={2.4} />
                  </motion.button>
                )}
                <div style={{
                  position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
                  padding: '3px 10px', borderRadius: 999, background: 'rgba(0,0,0,0.55)',
                  color: '#fff', fontSize: '0.68rem', fontWeight: 700, zIndex: 2, letterSpacing: '0.02em',
                }}>
                  {mediaPage + 1}/{mediaItems.length}
                </div>
                <div style={{
                  position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
                  display: 'flex', alignItems: 'center', gap: 4, zIndex: 2,
                }}>
                  {mediaItems.map((_, dotIdx) => (
                    <span key={dotIdx} style={{
                      width: dotIdx === mediaPage ? 6 : 5, height: dotIdx === mediaPage ? 6 : 5, borderRadius: '50%',
                      background: dotIdx === mediaPage ? '#fff' : 'rgba(255,255,255,0.45)',
                      transition: 'all 0.15s',
                    }} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* رابط X داخل نص المنشور (مستخدم أو شركة): الصورة/الفيديو تظهر كاملة مباشرة بدون ضغطة */}
        {postXUrls.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingInline: hasMedia ? 14 : 0, paddingTop: hasMedia ? 10 : 0 }}>
            {postXUrls.map(u => <LinkMediaPreview key={u} url={u} />)}
          </div>
        )}

        {/* Actions — منتج أو شركة: لايك → تعليقات → شير | تفاصيل (نفس داخل البوست) */}
        {(isProductAd || isCompanyAuthor) ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            paddingTop: 12, paddingInline: hasMedia ? 14 : 0, gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 72 }}>
              <motion.button whileTap={{ scale: 0.88 }} onClick={e => { e.stopPropagation(); onToggleLike(post); }} style={{
                position: 'relative', display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer',
                color: post.likedByMe ? '#ef4444' : '#000000',
              }}>
                <Heart size={18} strokeWidth={2} fill={post.likedByMe ? '#ef4444' : 'none'} />
                <span style={{ fontSize: '0.7rem', fontWeight: 700 }}>{post.likesCount > 0 ? post.likesCount : ''}</span>
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={e => { e.stopPropagation(); (onOpenComments ?? onOpenPost)(post); }}
                style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: '#000000' }}
              >
                <MessageCircle size={18} strokeWidth={2} />
                <span style={{ fontSize: '0.7rem', fontWeight: 700 }}>{post.commentsCount > 0 ? post.commentsCount : ''}</span>
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={e => {
                  e.stopPropagation();
                  if (onProductShareMenu) onProductShareMenu(post);
                  else onShare(post);
                }}
                aria-label="مشاركة"
                style={{
                  display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer',
                  color: productShareAlert ? '#eab308' : '#000000',
                }}
              >
                <Send size={17} strokeWidth={2} color={productShareAlert ? '#eab308' : undefined} />
              </motion.button>
            </div>

            <motion.button
              whileTap={{ scale: postHasVisibleCaption(post) ? 0.92 : 1 }}
              onClick={e => { e.stopPropagation(); if (postHasVisibleCaption(post)) setProductDetailsOpen(true); }}
              aria-label="Details"
              disabled={!postHasVisibleCaption(post)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                background: 'rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.12)',
                borderRadius: 10, width: 44, height: 36,
                cursor: postHasVisibleCaption(post) ? 'pointer' : 'default',
                padding: 0, opacity: postHasVisibleCaption(post) ? 1 : 0.28,
              }}
            >
              <span style={{ width: 16, height: 2, borderRadius: 1, background: '#111' }} />
              <span style={{ width: 16, height: 2, borderRadius: 1, background: '#111' }} />
              <span style={{ width: 16, height: 2, borderRadius: 1, background: '#111' }} />
            </motion.button>

            {/* موازنة المساحة بعد نقل التعليقات بين اللايك والشير */}
            <div style={{ minWidth: 72 }} />
          </div>
        ) : (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 12, paddingInline: hasMedia ? 14 : 0, gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 72 }}>
            <motion.button whileTap={{ scale: 0.88 }} onClick={e => { e.stopPropagation(); onToggleLike(post); }} style={{
              position: 'relative', display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer',
              color: post.likedByMe ? '#ef4444' : '#000000', overflow: 'visible',
            }}>
              <span style={{ position: 'relative', width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <motion.span
                  key={likeBurstKey}
                  animate={likeBurstKey ? { scale: [1, 1.35, 0.92, 1] } : { scale: 1 }}
                  transition={{ duration: 0.42, ease: 'easeOut' }}
                  style={{ display: 'inline-flex' }}
                >
                  <Heart size={16} strokeWidth={2} fill={post.likedByMe ? '#ef4444' : 'none'} />
                </motion.span>
                <AnimatePresence>
                  {likeBurstKey > 0 && (
                    <motion.span
                      key={`bubble-${likeBurstKey}`}
                      initial={{ opacity: 0.95, scale: 0.25 }}
                      animate={{ opacity: 0, scale: 2.6 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.55, ease: 'easeOut' }}
                      aria-hidden
                      style={{
                        position: 'absolute', left: '50%', top: '50%', width: 18, height: 18,
                        marginLeft: -9, marginTop: -9, borderRadius: '50%',
                        border: '2px solid #ef4444',
                        boxShadow: '0 0 12px rgba(239,68,68,0.55)',
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                </AnimatePresence>
                <AnimatePresence>
                  {likeBurstKey > 0 && (
                    <motion.span
                      key={`bubble2-${likeBurstKey}`}
                      initial={{ opacity: 0.7, scale: 0.4 }}
                      animate={{ opacity: 0, scale: 3.4 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.7, ease: 'easeOut', delay: 0.05 }}
                      aria-hidden
                      style={{
                        position: 'absolute', left: '50%', top: '50%', width: 14, height: 14,
                        marginLeft: -7, marginTop: -7, borderRadius: '50%',
                        background: 'rgba(239,68,68,0.25)',
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                </AnimatePresence>
              </span>
              <span style={{ fontSize: '0.7rem', fontWeight: 700 }}>{post.likesCount > 0 ? post.likesCount : ''}</span>
            </motion.button>
            <motion.button whileTap={{ scale: 0.88 }} onClick={e => { e.stopPropagation(); (onOpenComments ?? onOpenPost)(post); }} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: '#000000' }}>
              <MessageCircle size={15} strokeWidth={2} />
              <span style={{ fontSize: '0.7rem', fontWeight: 700 }}>{post.commentsCount > 0 ? post.commentsCount : ''}</span>
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={e => { e.stopPropagation(); onShare(post); }}
              aria-label="Share"
              style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#000000' }}
            >
              <Send size={15} strokeWidth={2} />
            </motion.button>
          </div>

          <motion.button
            whileTap={{ scale: postHasVisibleCaption(post) ? 0.92 : 1 }}
            onClick={e => { e.stopPropagation(); if (postHasVisibleCaption(post)) setProductDetailsOpen(true); }}
            aria-label="Details"
            disabled={!postHasVisibleCaption(post)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
              background: 'rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.12)',
              borderRadius: 10, width: 44, height: 36,
              cursor: postHasVisibleCaption(post) ? 'pointer' : 'default',
              padding: 0, opacity: postHasVisibleCaption(post) ? 1 : 0.28,
            }}
          >
            <span style={{ width: 16, height: 2, borderRadius: 1, background: '#111' }} />
            <span style={{ width: 16, height: 2, borderRadius: 1, background: '#111' }} />
            <span style={{ width: 16, height: 2, borderRadius: 1, background: '#111' }} />
          </motion.button>

          <div style={{ minWidth: 72 }} />
        </div>
        )}

        {/* Caption / product details sheet — three lines only, does not open post page */}
        <AnimatePresence>
          {productDetailsOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={e => { e.stopPropagation(); setProductDetailsOpen(false); }}
              style={{
                position: 'fixed', inset: 0, zIndex: 10600, background: 'rgba(0,0,0,0.45)',
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
              }}
            >
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', stiffness: 420, damping: 38 }}
                onClick={e => e.stopPropagation()}
                style={{
                  width: '100%', maxWidth: 520, maxHeight: '70vh', overflowY: 'auto',
                  background: '#fff', borderRadius: '18px 18px 0 0',
                  padding: '14px 18px calc(20px + env(safe-area-inset-bottom, 0px))',
                }}
              >
                                <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.15)', margin: '0 auto 14px' }} />
                {!isCompanyAuthor ? (
                  <p style={{ margin: 0, color: '#0a0a0a', fontSize: '0.95rem', fontWeight: 600, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                    {(post.text || '').replace(/\u27E6stooorna-product:[A-Za-z0-9+/=]+\u27E7\s*$/u, '').trim()}
                  </p>
                ) : (
                  <>
                    <p style={{ margin: 0, color: '#0a0a0a', fontSize: '1.1rem', fontWeight: 800, lineHeight: 1.35 }}>
                      {productAd?.title || productAdDisplayTitle(post) || post.authorName || 'تفاصيل'}
                    </p>
                    {productAd?.price ? (
                      <p style={{ margin: '8px 0 0', color: '#00BCD4', fontSize: '1rem', fontWeight: 800 }}>{productAd.price}</p>
                    ) : null}
                    {productAd?.details ? (
                      <p style={{ margin: '14px 0 0', color: '#1a1a1a', fontSize: '0.9rem', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{productAd.details}</p>
                    ) : null}
                  </>
                )}
                {isCompanyAuthor && (productAd?.extras ?? []).map((ex, i) => {
                  const cleaned = ex.replace(URL_IN_TEXT_RE, (match) => {
                    const raw = match.replace(/[.,;:!?،؛]+$/, '');
                    const resolved = composerLookupOriginalUrl(raw);
                    if (parseXStatusId(resolved) || classifyMediaUrl(resolved) || classifyDirectMediaUrl(resolved)) return '';
                    return match;
                  }).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
                  if (!cleaned) return null;
                  return (
                    <p key={i} style={{ margin: '10px 0 0', color: '#333', fontSize: '0.86rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', paddingTop: 8, borderTop: '1px solid rgba(0,0,0,0.06)' }}>{cleaned}</p>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setProductDetailsOpen(false)}
                  style={{
                    marginTop: 18, width: '100%', height: 44, borderRadius: 12, border: 'none',
                    background: '#0f1419', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
                  }}
                >
                  إغلاق
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Fullscreen media — يمين/يسار كامل الشاشة + النص أعلى أو أسفل */}
      {mediaLightbox && typeof document !== 'undefined' && createPortal(
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setMediaLightbox(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 10500, background: '#000',
            display: 'flex', flexDirection: 'column',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: 'max(10px, env(safe-area-inset-top, 0px)) 12px 8px',
            flexShrink: 0,
          }}>
            <button
              type="button"
              onClick={() => setMediaLightbox(null)}
              style={{
                width: 36, height: 36, borderRadius: '50%', border: 'none',
                background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={18} strokeWidth={2.4} />
            </button>

            {/* ⋮ قائمة خيارات المنشور — تظهر داخل معاينة الفيديو/الصورة كاملة الشاشة، أعلى اليمين */}
            {isMine && (
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setLightboxMenuOpen(v => !v); }}
                  aria-label="خيارات المنشور"
                  style={{
                    width: 36, height: 36, borderRadius: '50%', border: 'none',
                    background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <MoreVertical size={18} strokeWidth={2.4} />
                </button>
                {lightboxMenuOpen && (
                  <>
                    <div
                      onClick={e => { e.stopPropagation(); setLightboxMenuOpen(false); }}
                      style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                    />
                    <div
                      onClick={e => e.stopPropagation()}
                      style={{
                        position: 'absolute', top: 42, insetInlineEnd: 0, zIndex: 41,
                        minWidth: 160, padding: 6, borderRadius: 12,
                        background: 'rgba(28,28,28,0.97)',
                        border: '1px solid rgba(255,255,255,0.14)',
                        boxShadow: '0 12px 28px rgba(0,0,0,0.55)',
                      }}
                    >
                      {onTogglePin && (
                        <button
                          type="button"
                          onClick={() => { setLightboxMenuOpen(false); onTogglePin(post); }}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                            padding: '10px 12px', border: 'none', borderRadius: 8,
                            background: 'transparent', color: '#fff', cursor: 'pointer',
                            fontSize: '0.8rem', textAlign: 'right',
                          }}
                        >
                          {isPinned ? <PinOff size={15} color={CLR_PRIMARY} /> : <Pin size={15} color={CLR_PRIMARY} />}
                          {isPinned ? 'إلغاء التثبيت' : 'تثبيت المنشور'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { setLightboxMenuOpen(false); setMediaLightbox(null); onRemoveMedia(post); }}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                          padding: '10px 12px', border: 'none', borderRadius: 8,
                          background: 'transparent', color: '#fff', cursor: 'pointer',
                          fontSize: '0.8rem', textAlign: 'right',
                        }}
                      >
                        <ImageIcon size={15} color={CLR_PRIMARY} />
                        حذف الوسائط
                      </button>
                      <button
                        type="button"
                        onClick={() => { setLightboxMenuOpen(false); setMediaLightbox(null); onRequestDelete(post); }}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                          padding: '10px 12px', border: 'none', borderRadius: 8,
                          background: 'transparent', color: '#ef4444', cursor: 'pointer',
                          fontSize: '0.8rem', textAlign: 'right',
                        }}
                      >
                        <Trash2 size={15} />
                        حذف المنشور
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div
            onClick={e => e.stopPropagation()}
            style={{
              flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '100%',
            }}
          >
            {mediaLightbox.type === 'video' ? (
              <video
                src={mediaLightbox.url}
                controls
                autoPlay
                muted={lightboxMuted}
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
              />
            ) : (
              <img
                src={mediaLightbox.url}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
              />
            )}
          </div>

          {/* Same action bar as public post card: like, comment, share, three-lines */}
          <div
            onClick={e => e.stopPropagation()}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 20px calc(12px + env(safe-area-inset-bottom, 0px))', flexShrink: 0,
              background: 'linear-gradient(to top, rgba(0,0,0,0.92), rgba(0,0,0,0.55))',
              borderTop: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 88 }}>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => onToggleLike(post)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: post.likedByMe ? '#ef4444' : '#fff' }}
              >
                <Heart size={22} strokeWidth={2} fill={post.likedByMe ? '#ef4444' : 'none'} />
                <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>{post.likesCount > 0 ? post.likesCount : ''}</span>
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => (onOpenComments ?? onOpenPost)(post)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: '#fff' }}
              >
                <MessageCircle size={22} strokeWidth={2} />
                <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>{post.commentsCount > 0 ? post.commentsCount : ''}</span>
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => onShare(post)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 4, color: '#fff' }}
              >
                <Send size={20} strokeWidth={2} />
              </motion.button>
            </div>
            <motion.button
              whileTap={{ scale: postHasVisibleCaption(post) ? 0.92 : 1 }}
              onClick={() => { if (!postHasVisibleCaption(post)) return; setMediaLightbox(null); setProductDetailsOpen(true); }}
              aria-label="Details"
              disabled={!postHasVisibleCaption(post)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: 12, width: 52, height: 44,
                cursor: postHasVisibleCaption(post) ? 'pointer' : 'default',
                padding: 0, opacity: postHasVisibleCaption(post) ? 1 : 0.28,
              }}
            >
              <span style={{ width: 18, height: 2, borderRadius: 1, background: '#fff' }} />
              <span style={{ width: 18, height: 2, borderRadius: 1, background: '#fff' }} />
              <span style={{ width: 18, height: 2, borderRadius: 1, background: '#fff' }} />
            </motion.button>
            <div style={{ minWidth: 88 }} />
          </div>


        </motion.div>,
        document.body
      )}
    </>
  );
}

// ── MiniProfileModal — limited profile view opened from the wrench icon on a text post ──
// Shows only: cover + avatar (tappable to view large), a CHAT button, Display name, BIO, User Name, Phone Number.
interface MiniProfileData {
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  coverUrl?: string | null;
  bio?: string | null;
  phoneNumber?: string | null;
  // ── Stats shown beside the avatar: Post / Followers / Following / Likes.
  //    Optional so the modal still works if the backend hasn't added these fields yet
  //    to /api/users/by-username/:username — they simply show as 0 until it does. ──
  postsCount?: number;
  followersCount?: number;
  followingCount?: number;
  likesCount?: number;
  repostsCount?: number;
  // Optional so this still works if the backend hasn't added the field yet —
  // defaults to false (public) until then.
  isPrivate?: boolean;
  // Owner's manual "hide my followers list" switch — independent of isPrivate.
  // undefined/true = visible, false = hidden even on a public account. Optional so
  // this still degrades gracefully (stays visible) until the backend adds the field.
  followersVisible?: boolean;
  // ── Pinned profile track ("Get" button in the music search modal) — shown above the
  // avatar/name to anyone visiting this profile. Optional so this still degrades
  // gracefully (simply hides the pinned bar) until the backend adds these columns to
  // /api/users/by-username/:username and /api/users/me. ──
  pinnedTrackId?: string | null;
  pinnedTrackTitle?: string | null;
  pinnedTrackArtist?: string | null;
  pinnedTrackArtwork?: string | null;
  pinnedTrackPreviewUrl?: string | null;
  // ── Pinned POST id (Pin option in a post's ⋮ menu) — when set, that post should be
  // shown first in this person's Posts list on their profile, ahead of the rest. Optional
  // so this degrades gracefully (no reordering) until the backend adds this column to
  // /api/users/by-username/:username and /api/users/me. ──
  pinnedPostId?: number | null;
}
// ── FollowersListModal — switch only (no user list). When on, others see a lock
// instead of the followers count. Independent from the private-account rule. ──
function FollowersListModal({
  friends: _friends,
  followersVisible,
  onToggleVisible,
  onClose,
}: {
  friends?: Friend[];
  followersVisible: boolean;
  onToggleVisible: (next: boolean) => void;
  onClose: () => void;
}) {
  // Switch only — no followers list for owner or visitors.
  void _friends;
  const hidden = !followersVisible;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,8,10,0.72)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        zIndex: 10300,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <motion.div
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.88, y: 28 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 16 }}
        transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }}
        style={{
          width: '100%', maxWidth: 300,
          borderRadius: 24,
          overflow: 'hidden',
          background: 'linear-gradient(165deg, rgba(14,36,40,0.98) 0%, rgba(8,18,20,0.99) 55%, rgba(6,14,16,1) 100%)',
          border: `1.5px solid ${hidden ? 'rgba(0,188,212,0.45)' : 'rgba(0,188,212,0.18)'}`,
          boxShadow: hidden
            ? '0 24px 60px rgba(0,0,0,0.55), 0 0 40px rgba(0,188,212,0.18), inset 0 1px 0 rgba(255,255,255,0.06)'
            : '0 24px 60px rgba(0,0,0,0.5), 0 0 24px rgba(0,188,212,0.08), inset 0 1px 0 rgba(255,255,255,0.05)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '22px 20px 20px',
          position: 'relative',
        }}
      >
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          style={{
            position: 'absolute', top: 12, left: 12,
            width: 30, height: 30, borderRadius: '50%', border: 'none',
            background: 'rgba(255,255,255,0.06)',
            color: 'rgba(200,230,230,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <X size={14} strokeWidth={2.4} />
        </button>

        {/* Icon badge */}
        <motion.div
          key={hidden ? 'lock' : 'users'}
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
          style={{
            width: 64, height: 64, borderRadius: 20,
            marginBottom: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: hidden
              ? 'linear-gradient(145deg, rgba(0,188,212,0.28), rgba(0,188,212,0.08))'
              : 'linear-gradient(145deg, rgba(0,188,212,0.16), rgba(0,188,212,0.04))',
            border: `1.5px solid ${hidden ? 'rgba(0,188,212,0.5)' : 'rgba(0,188,212,0.22)'}`,
            boxShadow: hidden ? '0 8px 28px rgba(0,188,212,0.22)' : '0 6px 18px rgba(0,0,0,0.25)',
            color: '#00BCD4',
          }}
        >
          {hidden ? <Lock size={26} strokeWidth={2.1} /> : <Users size={26} strokeWidth={2.1} />}
        </motion.div>

        <p style={{
          margin: 0, fontSize: '1rem', fontWeight: 800, color: 'rgba(220,245,245,0.95)',
          letterSpacing: '0.01em', textAlign: 'center',
        }}>
          خصوصية المتابعين
        </p>
        <p style={{
          margin: '8px 0 0', fontSize: '0.72rem', fontWeight: 500,
          color: 'rgba(150,200,200,0.65)', lineHeight: 1.55, textAlign: 'center',
          maxWidth: 240,
        }}>
          {hidden
            ? 'المتابعون مخفيون — يظهر قفل بدل العدد للزوار'
            : 'العدد ظاهر للجميع. فعّل المفتاح لإخفائه'}
        </p>

        {/* Toggle row */}
        <div
          style={{
            width: '100%', marginTop: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: '14px 14px',
            borderRadius: 16,
            background: hidden ? 'rgba(0,188,212,0.12)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${hidden ? 'rgba(0,188,212,0.35)' : 'rgba(0,188,212,0.12)'}`,
            transition: 'background 0.25s ease, border-color 0.25s ease',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, textAlign: 'right' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: hidden ? '#00BCD4' : 'rgba(200,230,230,0.9)' }}>
              {hidden ? 'مخفي' : 'ظاهر'}
            </span>
            <span style={{ fontSize: '0.64rem', color: 'rgba(150,200,200,0.55)', lineHeight: 1.4 }}>
              إخفاء متابعيني عن الآخرين
            </span>
          </div>
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={() => onToggleVisible(!followersVisible)}
            aria-label="تبديل إخفاء المتابعين"
            aria-pressed={hidden}
            style={{
              width: 52, height: 30, borderRadius: 999, padding: 3, border: 'none',
              cursor: 'pointer', flexShrink: 0,
              background: hidden
                ? 'linear-gradient(90deg, #00BCD4, #26C6DA)'
                : 'rgba(255,255,255,0.12)',
              display: 'flex', alignItems: 'center',
              justifyContent: hidden ? 'flex-end' : 'flex-start',
              boxShadow: hidden ? '0 4px 16px rgba(0,188,212,0.4)' : 'none',
              transition: 'background 0.25s ease, box-shadow 0.25s ease',
            }}
          >
            <motion.span
              layout
              transition={{ type: 'spring', stiffness: 500, damping: 32 }}
              style={{
                width: 24, height: 24, borderRadius: '50%',
                background: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                color: hidden ? '#00BCD4' : 'rgba(100,120,120,0.7)',
              }}
            >
              {hidden ? <Lock size={11} strokeWidth={2.6} /> : <Eye size={11} strokeWidth={2.6} />}
            </motion.span>
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
// Retained profile renderer; not mounted in the current feed.
// @ts-ignore TS6133: retained for future reuse.
const MiniProfileModal = ({
  authorId,
  authorName,
  authorUsername,
  authorAvatarUrl,
  onClose,
}: {
  authorId: string;
  authorName: string;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  onClose: () => void;
}) => {
  const navigate = useNavigate();
  const { user } = useSession();
  const isOwnProfile = user?.id === authorId;
  const [profile, setProfile] = useState<MiniProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [avatarExpanded, setAvatarExpanded] = useState(false);
  const [friendState, setFriendState] = useState<'none' | 'pending' | 'accepted'>('none');
  const [friendLoading, setFriendLoading] = useState(false);
  const [friendMenuOpen, setFriendMenuOpen] = useState(false);
  const [followersModalOpen, setFollowersModalOpen] = useState(false);
  // Manual "hide my followers" switch — only meaningful/editable when this is my own
  // profile; persisted locally and best-effort synced to the backend (see
  // FollowersListModal for the shared implementation used across this file).
  const [followersVisible, setFollowersVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const raw = window.localStorage.getItem('stooorna_followers_visible');
      return raw === null ? true : raw === '1';
    } catch { return true; }
  });
  const handleToggleFollowersVisible = useCallback(async (next: boolean) => {
    setFollowersVisible(next);
    try { window.localStorage.setItem('stooorna_followers_visible', next ? '1' : '0'); } catch { /* storage optional */ }
    try {
      await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ followersVisible: next }),
      });
    } catch { /* silent — the local toggle above still governs this device */ }
  }, []);

  // Tell the profile owner "someone's here" for as long as this modal stays open.
  useProfileVisitHeartbeat(
    isOwnProfile ? null : authorId,
    user ? { id: user.id, name: user.name ?? null, username: (user as any)?.username ?? null, avatarUrl: (user as any)?.avatarUrl ?? null } : null
  );

  const [myFriendsForFollowersList, setMyFriendsForFollowersList] = useState<Friend[]>([]);
  useEffect(() => {
    let cancelled = false;
    async function loadFriendState() {
      try {
        const response = await fetch('/api/friends', { credentials: 'include' });
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled) return;
        if ((data.accepted ?? []).some((friend: Friend) => friend.friendId === authorId)) {
          setFriendState('accepted');
        } else if ((data.outgoing ?? []).some((request: { addresseeId?: string; userId?: string }) => (request.addresseeId ?? request.userId) === authorId)) {
          setFriendState('pending');
        }
        if (isOwnProfile) setMyFriendsForFollowersList(data.accepted ?? []);
      } catch { /* keep default */ }
    }
    loadFriendState();
    return () => { cancelled = true; };
  }, [authorId, isOwnProfile]);

  async function requestFriendship() {
    if (friendState !== 'none' || friendLoading) return;
    setFriendLoading(true);
    try {
      const response = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ addresseeId: authorId }),
      });
      if (response.ok) setFriendState('pending');
    } finally {
      setFriendLoading(false);
    }
  }

  async function removeFriendship() {
    if (friendLoading) return;
    setFriendLoading(true);
    try {
      const response = await fetch(`/api/friends/${authorId}`, { method: 'DELETE', credentials: 'include' });
      if (response.ok) setFriendState('none');
    } finally {
      setFriendLoading(false);
      setFriendMenuOpen(false);
    }
  }

  async function blockUser() {
    if (friendLoading) return;
    setFriendLoading(true);
    try {
      await fetch(`/api/friends/${authorId}`, { method: 'DELETE', credentials: 'include' });
      const response = await fetch('/api/users/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ targetId: authorId, action: 'block' }),
      });
      if (response.ok) {
        setFriendState('none');
        onClose();
      }
    } finally {
      setFriendLoading(false);
      setFriendMenuOpen(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!authorUsername) {
        setLoading(false);
        return;
      }
      try {
        const r = await fetch(`/api/users/by-username/${encodeURIComponent(authorUsername)}`, { credentials: 'include' });
        if (r.ok) {
          const d = await r.json();
          if (!cancelled) {
            setProfile(d);
          }
        }
      } catch {/* silent */}
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [authorUsername]);

  const name = profile?.name ?? authorName;
  const username = profile?.username ?? authorUsername;
  const avatarUrl = resolveMediaUrl(profile?.avatarUrl ?? authorAvatarUrl) || (profile?.avatarUrl ?? authorAvatarUrl);
  const coverUrl = profile?.coverUrl ?? null;
  const bio = profile?.bio ?? null;
  const phoneNumber = profile?.phoneNumber ?? null;
  // مقطع Get المثبت فوق الصورة — من السيرفر، أو localStorage لبروفايلي
  const miniPinnedTrack = (() => {
    const fromApi = pinnedTrackFromProfile(profile);
    if (fromApi) return fromApi;
    if (!isOwnProfile || typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem('stooorna_pinned_track');
      return raw ? (JSON.parse(raw) as MusicTrack) : null;
    } catch { return null; }
  })();

  function Field({ label, value }: { label: string; value: string | null }) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <p style={{ color: CLR_TEXT_DIM, fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', margin: 0, fontWeight: 600 }}>
          {label}
        </p>
        <p style={{ color: CLR_TEXT, fontSize: '0.84rem', margin: 0, lineHeight: 1.5 }}>
          {value || <span style={{ color: CLR_TEXT_DIM, fontStyle: 'italic' }}>—</span>}
        </p>
      </div>
    );
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)',
          zIndex: 260, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}
      >
        <motion.div
          onClick={e => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
          style={{
            width: '100%', maxWidth: 480,
            background: 'hsl(var(--card))',
            borderRadius: '20px 20px 0 0',
            overflow: 'hidden',
            maxHeight: '85dvh',
            display: 'flex', flexDirection: 'column',
          }}
        >
          {/* Close button */}
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={onClose}
            aria-label="إغلاق"
            style={{
              position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: '50%',
              background: 'rgba(0,0,0,0.4)', border: 'none', color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2,
            }}
          >
            <X size={15} strokeWidth={2.4} />
          </motion.button>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
            {/* Cover photo + pinned music above avatar */}
            <div style={{
              width: '100%', height: 130, position: 'relative',
              background: 'transparent',
            }}>
              {coverUrl && <img src={coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
              {miniPinnedTrack && (
                <div style={{
                  position: 'absolute', left: 0, right: 0, bottom: 44,
                  display: 'flex', justifyContent: 'center', zIndex: 2,
                  padding: '0 16px',
                }}>
                  <PinnedTrackBar track={miniPinnedTrack} style={{
                    background: 'rgba(6,14,14,0.72)',
                    backdropFilter: 'blur(8px)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
                    border: '1px solid rgba(0,188,212,0.35)',
                  }} />
                </div>
              )}
            </div>

            {/* Avatar overlapping cover — tap to view large */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: -40, paddingBottom: 6 }}>
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={() => setAvatarExpanded(true)}
                style={{
                  width: 80, height: 80, borderRadius: '50%', overflow: 'hidden', padding: 0,
                  border: `3px solid hsl(var(--card))`, cursor: 'pointer', background: '#000',
                }}
              >
                <UserAvatar name={name || ''} avatarUrl={avatarUrl} size={80} style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
              </motion.button>

              {/* ── Stats beside the profile picture: Post / Followers / Following / Likes —
                  same layout as the own-profile header, so any visited profile shows the
                  full picture (posts, likes, and follow counts) at a glance. ── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: CLR_TEXT }}>{profile?.postsCount ?? 0}</span>
                  <span style={{ fontSize: '0.6rem', color: CLR_TEXT_DIM }}>Post</span>
                </div>
                <motion.button
                  whileTap={isOwnProfile ? { scale: 0.94 } : undefined}
                  onClick={() => { if (isOwnProfile) setFollowersModalOpen(true); }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, background: 'none', border: 'none', padding: 0, cursor: isOwnProfile ? 'pointer' : 'default' }}
                >
                  {(isOwnProfile ? !followersVisible : (!isCompanyUserAccount(profile) && (!!profile?.isPrivate || profile?.followersVisible === false))) ? (
                    <Lock size={13} strokeWidth={2.2} color={CLR_TEXT_DIM} />
                  ) : (
                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: CLR_TEXT }}>{profile?.followersCount ?? 0}</span>
                  )}
                  <span style={{ fontSize: '0.6rem', color: CLR_TEXT_DIM }}>Followers</span>
                </motion.button>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: CLR_TEXT }}>{resolveProfileViewsCount(profile as any, [])}</span>
                  <span style={{ fontSize: '0.6rem', color: CLR_TEXT_DIM }}>Views</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: CLR_TEXT }}>{profile?.likesCount ?? 0}</span>
                  <span style={{ fontSize: '0.6rem', color: CLR_TEXT_DIM }}>Likes</span>
                </div>
              </div>

              {/* حالة الصداقة فقط — الشات والاتصال نُقلا إلى الشريط السفلي وداخل صفحة الشات */}
              {!isOwnProfile && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {friendState === 'accepted' ? (
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ padding: '8px 14px', borderRadius: 20, background: CLR_PRIMARY_FAINT, color: CLR_PRIMARY, fontSize: '0.78rem', fontWeight: 700 }}>صديق</span>
                    <button onClick={() => setFriendMenuOpen(open => !open)} aria-label="خيارات الصديق" aria-expanded={friendMenuOpen} style={{ width: 32, height: 32, borderRadius: '50%', border: `1px solid ${CLR_PRIMARY_BORDER}`, background: 'transparent', color: CLR_PRIMARY, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                      <MoreVertical size={17} />
                    </button>
                    {friendMenuOpen && <div style={{ position: 'absolute', top: 38, insetInlineEnd: 0, zIndex: 280, minWidth: 142, padding: 6, borderRadius: 12, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', boxShadow: 'var(--shadow-lg)' }}>
                      <button onClick={removeFriendship} disabled={friendLoading} style={{ width: '100%', padding: '9px 10px', border: 'none', borderRadius: 8, background: 'transparent', color: 'hsl(var(--foreground))', cursor: friendLoading ? 'default' : 'pointer', textAlign: 'right', fontSize: '0.78rem' }}>حذف صديق</button>
                      <button onClick={blockUser} disabled={friendLoading} style={{ width: '100%', padding: '9px 10px', border: 'none', borderRadius: 8, background: 'transparent', color: 'hsl(var(--destructive))', cursor: friendLoading ? 'default' : 'pointer', textAlign: 'right', fontSize: '0.78rem' }}>حظر</button>
                    </div>}
                  </div>
                ) : (
                  <>
                    {friendState === 'none' && (
                      <motion.button whileTap={{ scale: 0.95 }} onClick={requestFriendship} disabled={friendLoading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'transparent', border: `1px solid ${CLR_PRIMARY}`, borderRadius: 20, color: CLR_PRIMARY, fontSize: '0.78rem', fontWeight: 700, cursor: friendLoading ? 'default' : 'pointer', opacity: friendLoading ? 0.6 : 1 }}>
                        <UserPlus size={15} strokeWidth={2.4} />
                        طلب صداقة
                      </motion.button>
                    )}
                    {friendState === 'pending' && <span style={{ padding: '8px 16px', borderRadius: 20, background: CLR_PRIMARY_FAINT, color: CLR_PRIMARY, fontSize: '0.78rem', fontWeight: 700 }}>بانتظار القبول</span>}
                  </>
                )}
              </div>}

            </div>

            {/* Fields */}
            {loading ? (
              <div className="flex items-center justify-center" style={{ padding: '24px 0' }}>
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} style={{
                  width: 20, height: 20, borderRadius: '50%', border: `2px solid ${CLR_PRIMARY_BORDER}`, borderTopColor: CLR_PRIMARY,
                }} />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '18px 20px 28px' }}>
                <Field label="Display name" value={name} />
                <Field label="BIO" value={bio} />
                <Field label="User Name" value={username ? `@${username}` : null} />
                <Field label="Phone Number" value={phoneNumber} />
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Fullscreen avatar lightbox */}
      <AnimatePresence>
        {avatarExpanded && avatarUrl && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }}
            onClick={() => setAvatarExpanded(false)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
              zIndex: 270, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
            }}
          >
            <motion.img
              src={avatarUrl} alt=""
              onClick={e => e.stopPropagation()}
              initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              style={{ maxWidth: '100%', maxHeight: '90dvh', borderRadius: 12, objectFit: 'contain' }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Followers list — only ever opened for my own profile from this modal, since we
          don't have another user's friends list to show. */}
      <AnimatePresence>
        {isOwnProfile && followersModalOpen && (
          <FollowersListModal
            friends={myFriendsForFollowersList}
            followersVisible={followersVisible}
            onToggleVisible={handleToggleFollowersVisible}
            onClose={() => setFollowersModalOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ── FriendStoryProfile — profile for another user: avatar, stats, and ONLY their posts.
//    Video/Photo tabs removed; cover has no dark overlay. Posts (text + media alike) render
//    three-per-row below, tapping any tile opens the full post page like a text post. ──
export interface FriendStoryProfileProps {
  authorId: string;
  authorName: string | null;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  onClose: () => void;
  onOpenPost: (post: PostItem) => void;
  /** يفتح شيت التعليقات المنزلق من الأسفل فقط (نفس المستخدم بكل مكان) — بدون فتح صفحة
   * المنشور الكاملة. اختياري حتى لا ينكسر أي استدعاء قديم لهذا المكوّن. */
  onToggleLike?: (post: PostItem) => void;
  /** إعادة النشر — تظهر كزر داخل معاينة الصورة/الفيديو كاملة الشاشة (نفس شريط البوست النصي). اختياري. */
  onRepost?: (post: PostItem) => void;
  /** حساب شركة عام: يظهر اليوزر والمنشورات والبث للجميع بدون شرط صداقة.
   * اللايك والتعليق متاحان للمستخدمين المسجّلين (guestGuard كما في باقي التطبيق). */
  isCompanyProfile?: boolean;
}
export function FriendStoryProfile({ authorId, authorName, authorUsername, authorAvatarUrl, onClose, onOpenPost, onToggleLike, onRepost, isCompanyProfile = false }: FriendStoryProfileProps) {
  const navigate = useNavigate();
  const { user } = useSession();
  const liveActive = useLiveBroadcastActive(authorId);
  const [profile, setProfile] = useState<MiniProfileData | null>(null);
  const [friendProfileMediaTab, setFriendProfileMediaTab] = useState<'videos' | 'photos'>('videos');
  const [loading, setLoading] = useState(true);
  const [avatarExpanded, setAvatarExpanded] = useState(false);
  const [friendState, setFriendState] = useState<'none' | 'pending' | 'accepted'>('none');
  const [friendLoading, setFriendLoading] = useState(false);
  const [friendMenuOpen, setFriendMenuOpen] = useState(false);
  const [authorPosts, setAuthorPosts] = useState<PostItem[]>([]);
  // فتح الصورة/الفيديو فقط بملء الشاشة — بدون فتح صفحة المنشور الكاملة القديمة
  const [mediaLightbox, setMediaLightbox] = useState<{ url: string; type: 'image' | 'video'; post: PostItem } | null>(null);
  // كتم صوت معاينة الفيديو كاملة الشاشة
  const [lightboxMuted, setLightboxMuted] = useState(false);

  useProfileVisitHeartbeat(
    authorId,
    user ? { id: user.id, name: user.name ?? null, username: (user as any)?.username ?? null, avatarUrl: (user as any)?.avatarUrl ?? null } : null
  );

  useEffect(() => {
    let cancelled = false;
    async function loadFriendState() {
      try {
        const response = await fetch('/api/friends', { credentials: 'include' });
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled) return;
        if ((data.accepted ?? []).some((friend: Friend) => friend.friendId === authorId)) {
          setFriendState('accepted');
        } else if ((data.outgoing ?? []).some((request: { addresseeId?: string; userId?: string }) => (request.addresseeId ?? request.userId) === authorId)) {
          setFriendState('pending');
        }
      } catch { /* keep default */ }
    }
    loadFriendState();
    return () => { cancelled = true; };
  }, [authorId]);

  async function requestFriendship() {
    if (friendState !== 'none' || friendLoading) return;
    setFriendLoading(true);
    try {
      const response = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ addresseeId: authorId }),
      });
      if (response.ok) setFriendState('pending');
    } finally {
      setFriendLoading(false);
    }
  }

  async function removeFriendship() {
    if (friendLoading) return;
    setFriendLoading(true);
    try {
      const response = await fetch(`/api/friends/${authorId}`, { method: 'DELETE', credentials: 'include' });
      if (response.ok) setFriendState('none');
    } finally {
      setFriendLoading(false);
      setFriendMenuOpen(false);
    }
  }

  async function blockUser() {
    if (friendLoading) return;
    setFriendLoading(true);
    try {
      await fetch(`/api/friends/${authorId}`, { method: 'DELETE', credentials: 'include' });
      const response = await fetch('/api/users/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ targetId: authorId, action: 'block' }),
      });
      if (response.ok) {
        setFriendState('none');
        onClose();
      }
    } finally {
      setFriendLoading(false);
      setFriendMenuOpen(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // Prefer the username lookup (richer/cached), but always fall back to fetching
        // by ID so the cover photo and the rest of the profile still load even when a
        // post came through without a username attached — e.g. opened from a text post.
        let d: MiniProfileData | null = null;
        if (authorUsername) {
          const r = await fetch(`/api/users/by-username/${encodeURIComponent(authorUsername)}`, { credentials: 'include' });
          if (r.ok) d = await r.json();
        }
        if (!d && authorId) {
          const r2 = await fetch(`/api/users/${authorId}`, { credentials: 'include' });
          if (r2.ok) d = await r2.json();
        }
        if (!cancelled && d) setProfile(d);
      } catch {/* silent */}
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [authorId, authorUsername]);

  // ── منشورات هذا الحساب للعامة: نصية + منتجات (حتى لو حُفظت audience=public مع وسائط) ──
  useEffect(() => {
    let cancelled = false;
    async function loadPosts() {
      try {
        const collected: PostItem[] = [];
        const r = await fetch('/api/posts?audience=text', { credentials: 'include' });
        if (r.ok) {
          const data = await r.json() as { posts: PostItem[] };
          collected.push(...(data.posts ?? []));
        }
        try {
          const pubR = await fetch('/api/posts?audience=public', { credentials: 'include' });
          let pubPosts: PostItem[] = [];
          if (pubR.ok) {
            const data = await pubR.json() as { posts: PostItem[] };
            pubPosts = data.posts ?? [];
          } else {
            const fallback = await fetch('/api/posts', { credentials: 'include' });
            if (fallback.ok) {
              const data = await fallback.json() as { posts: PostItem[] };
              pubPosts = data.posts ?? [];
            }
          }
          for (const p of pubPosts) {
            const body = (p.text && String(p.text).trim()) || '';
            const hasMedia = !!(p.mediaUrl || (p.mediaUrls && p.mediaUrls.length));
            if (!body && !hasMedia) continue;
            if (parseProductAd(body) || p.audience === 'text' || p.destination === 'text' || body.length > 0 || hasMedia) {
              collected.push(p);
            }
          }
        } catch { /* optional */ }
        if (cancelled) return;
        const byId = new Map<number, PostItem>();
        for (const p of collected) {
          if (String(p.authorId) === String(authorId)) byId.set(p.id, p);
        }
        setAuthorPosts(Array.from(byId.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ));
      } catch {/* silent */}
    }
    loadPosts();
    return () => { cancelled = true; };
  }, [authorId]);

  const name = profile?.name ?? authorName;
  const username = profile?.username ?? authorUsername;
  const avatarUrl = resolveMediaUrl(profile?.avatarUrl ?? authorAvatarUrl) || (profile?.avatarUrl ?? authorAvatarUrl);
  const coverUrl = profile?.coverUrl ?? null;
  const pinnedTrack = pinnedTrackFromProfile(profile);
  // الشركات عامة دائماً — لا تُخفى حتى لو وُسم الحساب خاصاً أو بدون صداقة
  const isHiddenPrivate = !isCompanyProfile && !!profile?.isPrivate && friendState !== 'accepted';
  // منشور هذا المستخدم المثبّت (إن وُجد) يظهر أولًا، والباقي تحته بترتيبه الطبيعي بدون تثبيت
  const sortedAuthorPosts = useMemo(() => {
    // الشركة: كل المنشورات/المنتجات بدون تبويب Video/Photo
    let list = isCompanyProfile
      ? [...authorPosts]
      : authorPosts.filter(p => {
          const t = (p.mediaTypes?.[0] ?? p.mediaType) || '';
          const dest = String(p.destination || p.audience || '');
          const isVid = t === 'video' || dest === 'videos';
          const isPhoto = t === 'image' || dest === 'photos' || (!!p.mediaUrl && t !== 'video');
          return true;
        });
    if (profile?.pinnedPostId == null) return list;
    const pinnedIndex = list.findIndex(p => p.id === profile.pinnedPostId);
    if (pinnedIndex <= 0) return list;
    const copy = [...list];
    const [pinned] = copy.splice(pinnedIndex, 1);
    copy.unshift(pinned);
    return copy;
  }, [authorPosts, profile?.pinnedPostId, friendProfileMediaTab, isCompanyProfile]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }}
      transition={{ type: 'tween', duration: 0.32, ease: 'easeIn' }}
      style={{ position: 'fixed', inset: 0, zIndex: 10420, background: PAGE_BG, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
        {/* Cover photo + close — بدون تعتيم؛ الخلفية نفس الصفحة */}
        <div style={{ width: '100%', height: 130, position: 'relative', background: 'transparent' }}>
          {coverUrl && (
            <img
              src={coverUrl}
              alt=""
              style={{
                width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                // بدون أي طبقة تعتيم فوق صورة الغلاف
              }}
            />
          )}
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={onClose}
            aria-label="إغلاق"
            style={{
              position: 'absolute', top: 10, insetInlineStart: 10, width: 32, height: 32, borderRadius: '50%',
              background: coverUrl ? 'rgba(0,0,0,0.25)' : 'rgba(0,188,212,0.12)',
              border: coverUrl ? 'none' : `1px solid ${CLR_PRIMARY_BORDER}`,
              color: coverUrl ? '#fff' : CLR_PRIMARY,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2,
            }}
          >
            <X size={17} strokeWidth={2.4} />
          </motion.button>
          {/* مقطع Get المثبت — في منتصف أعلى الغلاف فوق الصورة (مكان الخطوط الحمراء) */}
          {pinnedTrack && (
            <div style={{
              position: 'absolute', left: 0, right: 0, bottom: 44,
              display: 'flex', justifyContent: 'center', zIndex: 2, pointerEvents: 'auto',
              padding: '0 16px',
            }}>
              <PinnedTrackBar track={pinnedTrack} style={{
                background: 'rgba(6,14,14,0.72)',
                backdropFilter: 'blur(8px)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
                border: '1px solid rgba(0,188,212,0.35)',
              }} />
            </div>
          )}
        </div>

        {/* Avatar + stats */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: -40, paddingBottom: 6 }}>
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={() => setAvatarExpanded(true)}
            style={{ width: 80, height: 80, borderRadius: '50%', overflow: 'hidden', padding: 0, border: `3px solid ${PAGE_BG}`, cursor: 'pointer', background: '#000' }}
          >
            <UserAvatar name={name || ''} avatarUrl={avatarUrl} size={80} style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
          </motion.button>

          <p style={{ color: CLR_TEXT, fontSize: '0.9rem', fontWeight: 700, margin: '8px 0 0' }}>{name || username || '—'}</p>
          {username && <p style={{ color: CLR_PRIMARY, fontSize: '0.75rem', fontWeight: 600, margin: '2px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>@{username}
            {(isCompanyProfile || readBusinessApproved(authorId)) && (
              <span style={{
                fontSize: '0.55rem', fontWeight: 900, color: '#0a0a0a',
                background: '#eab308', borderRadius: 5, padding: '2px 6px',
              }}>Business</span>
            )}
          </p>}
          {profile?.bio && (
            <p style={{ color: CLR_TEXT, opacity: 0.85, fontSize: '0.72rem', fontWeight: 500, margin: '6px 20px 0', textAlign: 'center', lineHeight: 1.5 }}>
              {profile.bio}
            </p>
          )}

          {/* Post / Followers / Views / Likes */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: CLR_TEXT }}>{profile?.postsCount ?? authorPosts.length}</span>
              <span style={{ fontSize: '0.6rem', color: CLR_TEXT_DIM }}>Post</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              {(!isCompanyProfile && (!!profile?.isPrivate || profile?.followersVisible === false)) ? (
                <Lock size={13} strokeWidth={2.2} color={CLR_TEXT_DIM} />
              ) : (
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: CLR_TEXT }}>{profile?.followersCount ?? 0}</span>
              )}
              <span style={{ fontSize: '0.6rem', color: CLR_TEXT_DIM }}>Followers</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: CLR_TEXT }}>
                {resolveProfileViewsCount(profile as any, authorPosts)}
              </span>
              <span style={{ fontSize: '0.6rem', color: CLR_TEXT_DIM }}>Views</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: CLR_TEXT }}>
                {profile?.likesCount ?? authorPosts.reduce((sum, p) => sum + (p.likesCount ?? 0), 0)}
              </span>
              <span style={{ fontSize: '0.6rem', color: CLR_TEXT_DIM }}>Likes</span>
            </div>
          </div>

          {/* حالة الصداقة (لا تظهر لصاحب البروفايل نفسه) + دخول البث الصوتي */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            {user?.id && String(user.id) !== String(authorId) && (
              friendState === 'accepted' ? (
                <span aria-label="صديق" title="صديق" style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={20} strokeWidth={3} color="#22c55e" />
                </span>
              ) : (
                <>
                  {friendState === 'none' && (
                    <motion.button whileTap={{ scale: 0.95 }} onClick={requestFriendship} disabled={friendLoading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'transparent', border: `1px solid ${CLR_PRIMARY}`, borderRadius: 20, color: CLR_PRIMARY, fontSize: '0.78rem', fontWeight: 700, cursor: friendLoading ? 'default' : 'pointer', opacity: friendLoading ? 0.6 : 1 }}>
                      <UserPlus size={15} strokeWidth={2.4} />
                      طلب صداقة
                    </motion.button>
                  )}
                  {friendState === 'pending' && <span style={{ padding: '8px 16px', borderRadius: 20, background: CLR_PRIMARY_FAINT, color: CLR_PRIMARY, fontSize: '0.78rem', fontWeight: 700 }}>بانتظار القبول</span>}
                </>
              )
            )}
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              animate={liveActive ? { opacity: [1, 0.45, 1] } : { opacity: 1 }}
              transition={liveActive ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
              onClick={() => {
                const qs = new URLSearchParams({
                  hostId: authorId,
                  hostName: name || username || 'Host',
                });
                if (username) qs.set('hostUsername', username);
                if (avatarUrl) qs.set('hostAvatar', avatarUrl);
                navigate(`/live?${qs.toString()}`);
              }}
              aria-label="البث الصوتي"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 20,
                background: liveActive ? 'rgba(239,68,68,0.14)' : 'rgba(0,188,212,0.12)',
                border: `1px solid ${liveActive ? 'rgba(239,68,68,0.45)' : CLR_PRIMARY_BORDER}`,
                color: liveActive ? '#ef4444' : CLR_PRIMARY,
                fontSize: '0.78rem', fontWeight: 700,
                cursor: 'pointer',
                boxShadow: liveActive ? '0 0 12px rgba(239,68,68,0.35)' : 'none',
              }}
            >
              <Radio size={15} strokeWidth={2.3} color={liveActive ? '#ef4444' : CLR_PRIMARY} />
              {liveActive ? 'البث مباشر' : 'بث صوتي'}
            </motion.button>
          </div>
        </div>

        {friendState === 'accepted' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', direction: 'ltr', padding: '4px 12px 0' }}>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setFriendMenuOpen(open => !open)} aria-label="خيارات الصديق" aria-expanded={friendMenuOpen} style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'transparent', color: CLR_PRIMARY, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <MoreVertical size={18} strokeWidth={2} style={{ display: 'block' }} />
              </button>
              {friendMenuOpen && <div style={{ position: 'absolute', top: 34, left: 0, zIndex: 30, minWidth: 142, padding: 6, borderRadius: 12, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', boxShadow: 'var(--shadow-lg)', direction: 'rtl' }}>
                <button onClick={removeFriendship} disabled={friendLoading} style={{ width: '100%', padding: '9px 10px', border: 'none', borderRadius: 8, background: 'transparent', color: 'hsl(var(--foreground))', cursor: friendLoading ? 'default' : 'pointer', textAlign: 'right', fontSize: '0.78rem' }}>حذف صديق</button>
                <button onClick={blockUser} disabled={friendLoading} style={{ width: '100%', padding: '9px 10px', border: 'none', borderRadius: 8, background: 'transparent', color: 'hsl(var(--destructive))', cursor: friendLoading ? 'default' : 'pointer', textAlign: 'right', fontSize: '0.78rem' }}>حظر</button>
              </div>}
            </div>
          </div>
        )}
                {isHiddenPrivate ? (
          <div className="flex flex-col items-center justify-center gap-3" style={{ paddingTop: 40, paddingBottom: 48, borderTop: `1px solid ${CLR_NAV_BORDER}`, marginTop: 8 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: CLR_PRIMARY_FAINT, border: `1px solid ${CLR_PRIMARY_BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: CLR_PRIMARY_DIM }}>
              <LockKeyhole size={22} strokeWidth={1.6} />
            </div>
            <p style={{ color: CLR_TEXT, fontSize: '0.85rem', fontWeight: 600, textAlign: 'center' }}>هذا الحساب خاص</p>
            <p style={{ color: CLR_TEXT_DIM, fontSize: '0.78rem', textAlign: 'center', maxWidth: 240, lineHeight: 1.6 }}>
                  أضف {name ?? 'هذا المستخدم'} كصديق لرؤية منشوراته
            </p>
          </div>
        ) : (
          <>
            {/* Single Post section header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '10px 0', marginTop: 8,
              borderTop: `1px solid ${CLR_NAV_BORDER}`, borderBottom: `1px solid ${CLR_NAV_BORDER}`,
              color: CLR_PRIMARY, fontSize: '0.78rem', fontWeight: 800,
              background: CLR_TAB_ACTIVE,
            }}>
              <FileText size={15} strokeWidth={2} />
              {(isCompanyProfile || readBusinessApproved(authorId)) ? 'المنتجات' : 'Post'}
            </div>

            {loading ? (
              <div className="flex items-center justify-center" style={{ padding: '24px 0' }}>
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${CLR_PRIMARY_BORDER}`, borderTopColor: CLR_PRIMARY }} />
              </div>
            ) : sortedAuthorPosts.length > 0 ? (
              (() => {
                const enrichedPosts = sortedAuthorPosts.map(post => {
                  const rawThumbUrl = post.mediaUrls?.[0] ?? post.mediaUrl;
                  const rawIsVideo = (post.mediaTypes?.[0] ?? post.mediaType) === 'video';
                  // إذا المنشور بدون وسائط مرفقة لكن نصّه يحتوي رابط صورة/فيديو مباشر (مثل
                  // video.twimg.com) — نستخرجه ونعرضه كصورة/فيديو مصغّر بدل ترك الرابط الخام
                  // يظهر كنص عادي بلا معاينة.
                  const textEmbed = !rawThumbUrl && post.text ? extractTextMediaEmbeds(post.text) : null;
                  const embeddedMedia = textEmbed?.embeds?.[0] ?? null;
                  const thumbUrl = rawThumbUrl ?? embeddedMedia?.url;
                  const isVideo = rawThumbUrl ? rawIsVideo : embeddedMedia?.type === 'video';
                  const displayText = textEmbed ? textEmbed.cleanText : post.text;
                  const isPinnedPost = profile?.pinnedPostId != null && profile.pinnedPostId === post.id;
                  return { post, thumbUrl, isVideo, displayText, isPinnedPost };
                });
                // كل المنشورات — نصيّة أو فيها وسائط — تعرض الآن سوا في شبكة واحدة ثلاثة
                // جمب بعض (نفس ترتيب sortedAuthorPosts، والمنشور المثبّت أولًا). المربع
                // اللي فيه صورة/فيديو يعرض المعاينة، والمربع النصي البحت يعرض مقتطف من
                // النص. النقر على أي مربع (نصي أو وسائط) يفتح صفحة المنشور الكاملة بنفس
                // الطريقة اللي تفتح فيها المنشورات النصية بالضبط.
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, padding: '4px 0 24px' }}>
                    {enrichedPosts.map(({ post, thumbUrl, isVideo, displayText, isPinnedPost }) => (
                      <button
                        key={post.id}
                        type="button"
                        onClick={() => onOpenPost(post)}
                        aria-label={thumbUrl ? (isVideo ? 'فتح الفيديو' : 'فتح الصورة') : 'فتح المنشور'}
                        style={{
                          position: 'relative', width: '100%', aspectRatio: '1 / 1', overflow: 'hidden',
                          border: isPinnedPost ? '3px solid #ef4444' : 'none', boxSizing: 'border-box', padding: 0,
                          background: thumbUrl ? '#000' : CLR_CARD_BG, cursor: 'pointer', display: 'block',
                        }}
                      >
                        {thumbUrl ? (
                          <>
                            {isVideo ? (
                              <video src={thumbUrl} muted autoPlay loop playsInline preload="auto" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            ) : (
                              <img src={thumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            )}
                            {isVideo && (
                              <div style={{ position: 'absolute', top: 6, insetInlineEnd: 6 }}>
                                <Play size={13} strokeWidth={2.4} color="#fff" fill="#fff" />
                              </div>
                            )}
                          </>
                        ) : (
                          <div style={{
                            width: '100%', height: '100%', padding: '8px 7px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: `1px solid ${CLR_CARD_BORDER}`, boxSizing: 'border-box',
                          }}>
                            <p style={{
                              color: CLR_TEXT, fontSize: '0.64rem', lineHeight: 1.45, margin: 0,
                              textAlign: 'center',
                              display: '-webkit-box', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            }}>
                              {displayText}
                            </p>
                          </div>
                        )}
                        {/* المنشور المثبّت يبين بالأحمر */}
                        {isPinnedPost && (
                          <div style={{
                            position: 'absolute', top: 6, insetInlineStart: 6,
                            color: '#ef4444', filter: thumbUrl ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.7))' : 'none',
                            display: 'flex', alignItems: 'center',
                          }}>
                            <Pin size={15} strokeWidth={2.6} fill="#ef4444" />
                          </div>
                        )}
                        <PostGridTimeFooter createdAt={post.createdAt} onMedia={!!thumbUrl} />
                      </button>
                    ))}
                  </div>
                );
              })()
            ) : (
              <div className="flex flex-col items-center justify-center gap-3" style={{ paddingTop: 32, paddingBottom: 40 }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: CLR_PRIMARY_FAINT, border: `1px solid ${CLR_PRIMARY_BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: CLR_PRIMARY_DIM }}>
                  <FileText size={20} strokeWidth={1.5} />
                </div>
                <p style={{ color: CLR_TEXT_DIM, fontSize: '0.82rem', textAlign: 'center', maxWidth: 220, lineHeight: 1.6 }}>
                  لا توجد منشورات بعد
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── الصورة/الفيديو فقط بملء الشاشة — بدون فتح صفحة المنشور الكاملة القديمة.
          التعليقات تُفتح فقط من أيقونة التعليقات (شيت منزلق من الأسفل يديره المستوى الأعلى). ── */}
      <AnimatePresence>
        {mediaLightbox && typeof document !== 'undefined' && createPortal(
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMediaLightbox(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 10450, background: '#000',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
              padding: 'max(10px, env(safe-area-inset-top, 0px)) 12px 8px',
              flexShrink: 0,
            }}>
              <button
                type="button"
                onClick={() => setMediaLightbox(null)}
                aria-label="إغلاق"
                style={{
                  width: 36, height: 36, borderRadius: '50%', border: 'none',
                  background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={18} strokeWidth={2.4} />
              </button>
            </div>

            <div
              onClick={e => e.stopPropagation()}
              style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}
            >
              {mediaLightbox.type === 'video' ? (
                <video
                  src={mediaLightbox.url}
                  controls
                  autoPlay
                  muted={lightboxMuted}
                  playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
                />
              ) : (
                <img
                  src={mediaLightbox.url}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
                />
              )}
            </div>

            {/* Same bar as public post: like, comment — open full post for share/details */}
            <div
              onClick={e => e.stopPropagation()}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 20px calc(12px + env(safe-area-inset-bottom, 0px))', flexShrink: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,0.92), rgba(0,0,0,0.55))',
                borderTop: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 88 }}>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => onToggleLike(mediaLightbox.post)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: mediaLightbox.post.likedByMe ? '#ef4444' : '#fff' }}
                >
                  <Heart size={22} strokeWidth={2} fill={mediaLightbox.post.likedByMe ? '#ef4444' : 'none'} />
                  <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>{mediaLightbox.post.likesCount > 0 ? mediaLightbox.post.likesCount : ''}</span>
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => onOpenPost(mediaLightbox.post)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: '#fff' }}
                >
                  <MessageCircle size={22} strokeWidth={2} />
                  <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>{mediaLightbox.post.commentsCount > 0 ? mediaLightbox.post.commentsCount : ''}</span>
                </motion.button>
              </div>
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => { setMediaLightbox(null); onOpenPost(mediaLightbox.post); }}
                aria-label="Details"
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)',
                  borderRadius: 12, width: 52, height: 44, cursor: 'pointer', padding: 0,
                }}
              >
                <span style={{ width: 18, height: 2, borderRadius: 1, background: '#fff' }} />
                <span style={{ width: 18, height: 2, borderRadius: 1, background: '#fff' }} />
                <span style={{ width: 18, height: 2, borderRadius: 1, background: '#fff' }} />
              </motion.button>
              <div style={{ minWidth: 88 }} />
            </div>
          </motion.div>,
          document.body
        )}
      </AnimatePresence>

      {/* Fullscreen avatar lightbox */}
      <AnimatePresence>
        {avatarExpanded && avatarUrl && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }}
            onClick={() => setAvatarExpanded(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 10260, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, overflow: 'hidden' }}
          >
            <img src={avatarUrl} alt="" style={{ maxWidth: '100%', maxHeight: '90dvh', borderRadius: 12, objectFit: 'contain' }} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Instagram-style Comments sheet — white bottom sheet over the feed (like IG Reels/Posts).
// Opens only when the user taps the comment icon — does NOT navigate to another page. ──
function InstagramCommentsSheet({
  post,
  comments,
  commentText,
  commentSending,
  onChangeCommentText,
  onSubmitComment,
  onClose,
}: {
  post: PostItem;
  comments: PostComment[];
  commentText: string;
  commentSending: boolean;
  onChangeCommentText: (v: string) => void;
  onSubmitComment: (parentCommentId?: number | null) => void;
  onClose: () => void;
}) {
  const [replyingTo, setReplyingTo] = useState<PostComment | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [post.id]);

  const formatCommentDate = (value: string) => {
    const diff = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
    if (diff < 60) return `${diff || 1}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value));
  };

  const submitWithReply = () => {
    onSubmitComment(replyingTo?.id ?? null);
    setReplyingTo(null);
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10450,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 420, damping: 38, mass: 0.9 }}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520,
          height: 'min(72dvh, 640px)',
          background: '#ffffff',
          borderRadius: '18px 18px 0 0',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Handle + title */}
        <div style={{
          flexShrink: 0, padding: '10px 16px 12px',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.18)' }} />
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <span style={{ color: '#0f0f0f', fontSize: '0.95rem', fontWeight: 700 }}>Comments</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
                width: 32, height: 32, borderRadius: '50%', border: 'none',
                background: 'rgba(0,0,0,0.06)', color: '#0f0f0f', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={16} strokeWidth={2.4} />
            </button>
          </div>
        </div>

        {/* Comments list */}
        <div
          ref={listRef}
          style={{
            flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
            padding: '12px 16px 8px', background: '#ffffff',
          }}
        >
          {comments.length === 0 ? (
            <div style={{ padding: '48px 16px', textAlign: 'center' }}>
              <p style={{ color: '#0f0f0f', fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>No comments yet</p>
              <p style={{ color: 'rgba(0,0,0,0.45)', fontSize: '0.8rem', margin: '8px 0 0' }}>Start the conversation.</p>
            </div>
          ) : (
            comments.map(c => (
              <div
                key={c.id}
                style={{
                  display: 'flex', gap: 10, marginBottom: 16,
                  marginLeft: c.parentCommentId ? 36 : 0,
                }}
              >
                <UserAvatar name={c.authorName} avatarUrl={c.authorAvatarUrl} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, lineHeight: 1.35 }}>
                    <span style={{ color: '#0f0f0f', fontSize: '0.82rem', fontWeight: 700 }}>{c.authorName}</span>
                    <span style={{ color: 'rgba(0,0,0,0.4)', fontSize: '0.72rem', marginInlineStart: 6 }}>{formatCommentDate(c.createdAt)}</span>
                  </p>
                  <p style={{ color: '#0f0f0f', fontSize: '0.86rem', margin: '3px 0 0', lineHeight: 1.45, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                    {c.text}
                  </p>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(c)}
                    style={{
                      background: 'none', border: 'none', padding: 0, marginTop: 6,
                      color: 'rgba(0,0,0,0.45)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600,
                    }}
                  >
                    Reply
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Composer — Instagram style */}
        <div style={{
          flexShrink: 0,
          borderTop: '1px solid rgba(0,0,0,0.08)',
          background: '#ffffff',
          padding: '8px 12px calc(10px + env(safe-area-inset-bottom, 0px))',
        }}>
          {replyingTo && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 4px 8px',
            }}>
              <span style={{ color: 'rgba(0,0,0,0.5)', fontSize: '0.72rem' }}>
                Replying to {replyingTo.authorName}
              </span>
              <button type="button" onClick={() => setReplyingTo(null)} style={{ background: 'none', border: 'none', color: 'rgba(0,0,0,0.45)', cursor: 'pointer', padding: 2 }}>
                <X size={14} />
              </button>
            </div>
          )}
          {/* emoji quick row */}
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '2px 2px 10px', scrollbarWidth: 'none' }}>
            {['❤️', '🙌', '🔥', '👏', '😢', '😍', '😮', '😂'].map(emoji => (
              <button
                key={emoji}
                type="button"
                onClick={() => onChangeCommentText((commentText || '') + emoji)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', padding: 0, lineHeight: 1 }}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              value={commentText}
              onChange={e => onChangeCommentText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !commentSending) submitWithReply(); }}
              placeholder="What do you think of this?"
              inputMode="text"
              // لا autoFocus — الكيبورد يفتح فقط عندما يضغط المستخدم على الحقل بنفسه
              style={{
                flex: 1, background: 'transparent', border: '1px solid rgba(0,0,0,0.12)',
                borderRadius: 22, padding: '11px 14px', color: '#0f0f0f', fontSize: '0.88rem',
                outline: 'none',
              }}
            />
            <motion.button
              whileTap={{ scale: 0.92 }}
              disabled={commentSending || !commentText.trim()}
              onClick={submitWithReply}
              style={{
                background: 'none', border: 'none', cursor: commentText.trim() ? 'pointer' : 'default',
                color: commentText.trim() ? '#0095f6' : 'rgba(0,0,0,0.25)',
                fontWeight: 700, fontSize: '0.88rem', padding: '8px 4px', flexShrink: 0,
              }}
            >
              Post
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}

// ── PostDetailPage — fullscreen "single post" page: media fills the screen edge-to-edge,
// with the author/time overlaid on top. Likes + comments only apply to other people's posts —
// the owner just sees their own media fullscreen with nothing under it. ──
function PostDetailPage({
  post,
  isMine,
  comments,
  commentText,
  commentSending,
  onChangeCommentText,
  onSubmitComment,
  onToggleLike,
  onRemoveMedia,
  onRequestDelete,
  onSaveMediaText,
  onClose,
  enterFromSide = false,
}: {
  post: PostItem;
  isMine: boolean;
  comments: PostComment[];
  commentText: string;
  commentSending: boolean;
  onChangeCommentText: (v: string) => void;
  onSubmitComment: (parentCommentId?: number | null) => void;
  onToggleLike: (post: PostItem) => void;
  onRemoveMedia: (post: PostItem) => void;
  onRequestDelete: (post: PostItem) => void;
  onSaveMediaText: (post: PostItem, text: string) => Promise<void>;
  onClose: () => void;
  enterFromSide?: boolean;
}) {
  const [replyingTo, setReplyingTo] = useState<PostComment | null>(null);
  const [mediaText, setMediaText] = useState(post.text ?? '');
  const [savingMediaText, setSavingMediaText] = useState(false);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const media = PostMediaItems(post);
  const hasMedia = media.length > 0;
  // ── دفاع إضافي ضد مشكلة "النص الأبيض ينزل على التعليقات": حتى مع الـ key الموجود على
  // مستوى الأب (الذي يفرض إعادة تركيب هذا المكوّن بالكامل عند تغيّر المنشور)، نتأكد هنا
  // أيضاً أن شريط التمرير يرجع للأعلى فور فتح أي منشور، بدل أن يبقى بمكانه من منشور سابق. ──
  const panelScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (panelScrollRef.current) panelScrollRef.current.scrollTop = 0;
    setActiveMediaIndex(0);
    setMediaText(post.text ?? '');
  }, [post.id, post.text]);

  const postDate = new Date(post.createdAt);
  const arabicNumber = (value: number) => new Intl.NumberFormat('ar-KW').format(value);
  const timeAgo = (() => {
    const diffSeconds = Math.max(0, Math.floor((Date.now() - postDate.getTime()) / 1000));
    if (diffSeconds < 60) return `منذ ${arabicNumber(diffSeconds || 1)} ثانية`;
    const minutes = Math.floor(diffSeconds / 60);
    if (minutes < 60) return `منذ ${arabicNumber(minutes)} دقيقة`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `منذ ${arabicNumber(hours)} ساعة`;
    const days = Math.floor(hours / 24);
    return `منذ ${arabicNumber(days)} يوم`;
  })();

  const formatCommentDate = (value: string) => new Intl.DateTimeFormat('ar-KW', {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value));
  const submitWithReply = () => {
    onSubmitComment(replyingTo?.id ?? null);
    setReplyingTo(null);
  };

  // Below the fullscreen media: caption (everyone) + like/comments (other people's posts only).
  const showBelowPanel = !!post.text || isMine || !isMine;
  const isMediaPost = hasMedia && (post.mediaType === 'image' || post.mediaType === 'video');
  const saveMediaText = async () => {
    setSavingMediaText(true);
    try { await onSaveMediaText(post, mediaText); } finally { setSavingMediaText(false); }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 10400,
        background: PAGE_BG,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header — overlaid directly on the media so nothing eats into it */}
      <div style={{
        position: hasMedia ? 'absolute' : 'relative',
        top: 0, left: 0, right: 0, zIndex: 2,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '40px 14px 16px',
        background: hasMedia ? 'linear-gradient(to bottom, rgba(0,0,0,0.68), rgba(0,0,0,0.32) 60%, transparent)' : CLR_HEADER_BG,
        backdropFilter: hasMedia ? undefined : 'blur(14px)',
        borderBottom: hasMedia ? undefined : `1px solid ${CLR_NAV_BORDER}`,
      }}>
        <button onClick={onClose} aria-label="إغلاق" style={{
          background: 'none', border: 'none', color: hasMedia ? '#fff' : CLR_TEXT, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, flexShrink: 0,
        }}>
          <X size={20} strokeWidth={2.2} />
        </button>
        <UserAvatar name={post.authorName} avatarUrl={post.authorAvatarUrl} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: hasMedia ? '#fff' : CLR_TEXT, fontSize: '0.82rem', fontWeight: 700, margin: 0, textShadow: hasMedia ? '0 1px 3px rgba(0,0,0,0.5)' : undefined }}>
            {post.authorName || post.authorUsername || '—'}
          </p>
          <p style={{ color: hasMedia ? 'rgba(255,255,255,0.82)' : CLR_TEXT_DIM, fontSize: '0.66rem', margin: '1px 0 0', textShadow: hasMedia ? '0 1px 3px rgba(0,0,0,0.5)' : undefined }}>
            {timeAgo}
          </p>
        </div>
        {isMine && (
          <button onClick={() => onRequestDelete(post)} aria-label="حذف المنشور" style={{
            background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4,
          }}>
            <Trash2 size={19} strokeWidth={2.2} />
          </button>
        )}
      </div>

      {/* Fullscreen media — edge to edge, no border/padding/box, cover-fit so there are no gaps */}
      {hasMedia && (
        <div style={{
          position: 'relative', width: '100%', background: '#000', overflow: 'hidden',
          border: '3px solid #000', boxSizing: 'border-box',
          flex: '0 0 auto',
          height: 'min(62dvh, 520px)',
          minHeight: 220,
          maxHeight: '62dvh',
        }}>
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {media[activeMediaIndex] && (
              media[activeMediaIndex].type === 'video' ? (
                <video
                  key={media[activeMediaIndex].url}
                  src={media[activeMediaIndex].url}
                  controls
                  autoPlay
                  playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <img key={media[activeMediaIndex].url} src={media[activeMediaIndex].url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              )
            )}
            {media.length > 1 && (
              <>
                <button type="button" aria-label="الوسائط السابقة" onClick={() => setActiveMediaIndex(index => (index - 1 + media.length) % media.length)} className="absolute top-1/2 start-2 -translate-y-1/2 rounded-full border-0 bg-primary text-primary-foreground" style={{ width: 36, height: 36, cursor: 'pointer', fontSize: '1.35rem', lineHeight: 1 }}>‹</button>
                <button type="button" aria-label="الوسائط التالية" onClick={() => setActiveMediaIndex(index => (index + 1) % media.length)} className="absolute top-1/2 end-2 -translate-y-1/2 rounded-full border-0 bg-primary text-primary-foreground" style={{ width: 36, height: 36, cursor: 'pointer', fontSize: '1.35rem', lineHeight: 1 }}>›</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Below the media: caption, then — for other people's posts only — the like frame and comments */}
      {showBelowPanel && (
        <>
        <style>{`.post-detail-panel::-webkit-scrollbar{display:none}`}</style>
        <div
          ref={panelScrollRef}
          className="post-detail-panel flex-1 min-h-0 overflow-y-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', display: 'flex', flexDirection: 'column', minHeight: 180, flexGrow: 1, background: '#ffffff' }}
        >
          {isMine && isMediaPost && (
            <div style={{ margin: '14px 14px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <textarea
                value={mediaText}
                onChange={event => setMediaText(event.target.value)}
                placeholder="اكتب منشوراً نصياً للصورة أو الفيديو"
                rows={3}
                style={{ width: '100%', resize: 'vertical', borderRadius: 12, border: `1px solid ${CLR_POST_BORDER}`, background: CLR_INPUT_BG, color: CLR_TEXT, padding: '10px 12px', fontFamily: 'inherit', fontSize: '0.82rem', boxSizing: 'border-box' }}
              />
              <button type="button" onClick={saveMediaText} disabled={savingMediaText} style={{ alignSelf: 'flex-end', border: 'none', borderRadius: 10, background: CLR_PRIMARY, color: 'hsl(var(--primary-foreground))', padding: '8px 14px', fontSize: '0.76rem', fontWeight: 700, cursor: savingMediaText ? 'wait' : 'pointer' }}>
                {savingMediaText ? 'جارٍ الحفظ...' : 'نشر النص'}
              </button>
            </div>
          )}
          {/* نص البوست يظهر دائماً إن وُجد */}
          {!!post.text && (
            <div style={{ background: 'transparent', border: 'none', borderRadius: 0, padding: '16px 16px', margin: '14px 14px 0' }}>
              <PostText text={post.text} color="hsl(var(--primary))" textColor="#000000" bold embedMediaLinks />
            </div>
          )}

          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            margin: '12px 14px 0', padding: '10px 14px',
            border: `1px solid ${CLR_POST_BORDER}`, borderRadius: 14,
            background: 'hsl(var(--muted))',
          }}>
            <motion.button whileTap={{ scale: 0.88 }} onClick={() => onToggleLike(post)} style={{
              display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer',
              color: post.likedByMe ? '#ef4444' : CLR_TEXT_DIM,
            }}>
              <Heart size={17} strokeWidth={2} fill={post.likedByMe ? '#ef4444' : 'none'} />
              <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>{post.likesCount > 0 ? post.likesCount : 'إعجاب'}</span>
            </motion.button>
          </div>

          <div style={{ padding: '14px 14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ color: '#000000', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '4px 0' }}>
              الردود {comments.length > 0 ? `(${comments.length})` : ''}
            </p>
            {comments.length === 0 && (
              <p style={{ color: '#000000', fontSize: '0.78rem', fontWeight: 700, textAlign: 'center', padding: '24px 0' }}>
                لا توجد ردود بعد — كن أول من يعلّق
              </p>
            )}
              {comments.map(c => (
                <div key={c.id} style={{ display: 'flex', gap: 8, marginLeft: c.parentCommentId ? 22 : 0 }}>
                  <UserAvatar name={c.authorName} avatarUrl={c.authorAvatarUrl} size={30} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: '#000000', fontSize: '0.76rem', fontWeight: 700, margin: 0 }}>{c.authorName}</p>
                    <p style={{ color: '#000000', fontSize: '0.8rem', fontWeight: 700, margin: '2px 0 0', lineHeight: 1.5, wordBreak: 'break-word' }}>{c.text}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                      <time dateTime={c.createdAt} style={{ color: '#000000', fontSize: '0.62rem', fontWeight: 700 }}>{formatCommentDate(c.createdAt)}</time>
                      <button onClick={() => setReplyingTo(c)} style={{ background: 'none', border: 'none', padding: 0, color: CLR_PRIMARY, cursor: 'pointer', fontSize: '0.66rem', fontWeight: 700 }}>رد</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
        </div>
        </>
      )}

      {/* Comment composer — fixed at bottom for everyone */}
      {(
        <div style={{
          position: 'relative',
          display: 'flex', alignItems: 'center', gap: hasMedia ? 8 : 0,
          padding: hasMedia ? '10px 14px calc(10px + env(safe-area-inset-bottom))' : `0 0 env(safe-area-inset-bottom)`,
          borderTop: `1px solid ${CLR_NAV_BORDER}`,
          background: CLR_HEADER_BG, backdropFilter: 'blur(14px)',
        }}>
          {replyingTo && (
            <div style={{ position: 'absolute', bottom: 58, left: 14, right: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 10, background: CLR_INPUT_BG, border: `1px solid ${CLR_PRIMARY_BORDER}` }}>
              <span style={{ color: CLR_TEXT_DIM, fontSize: '0.68rem' }}>رد على {replyingTo.authorName}</span>
              <button onClick={() => setReplyingTo(null)} aria-label="إلغاء الرد" style={{ background: 'none', border: 'none', color: CLR_TEXT_DIM, cursor: 'pointer', padding: 0 }}><X size={14} /></button>
            </div>
          )}
          <input
            value={commentText}
            onChange={e => onChangeCommentText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !commentSending) submitWithReply(); }}
            placeholder="اكتب ردّاً على هذا المنشور..."
            style={hasMedia ? {
              flex: 1, background: CLR_INPUT_BG, border: `1px solid ${CLR_PRIMARY_BORDER}`,
              borderRadius: 20, padding: '10px 14px', color: CLR_TEXT, fontSize: '0.82rem', outline: 'none',
            } : {
              flex: 1, background: CLR_HEADER_BG, border: 'none', boxShadow: 'none',
              borderRadius: 0, padding: '14px 14px', color: CLR_TEXT, fontSize: '0.82rem',
              outline: 'none', WebkitAppearance: 'none', appearance: 'none',
            }}
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            disabled={commentSending || !commentText.trim()}
            onClick={submitWithReply}
            style={hasMedia ? {
              width: 38, height: 38, borderRadius: '50%',
              background: commentText.trim() ? CLR_PRIMARY : CLR_PRIMARY_FAINT,
              border: 'none', color: commentText.trim() ? '#06171a' : CLR_TEXT_DIM,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            } : {
              width: 52, height: 52, borderRadius: 0,
              background: CLR_HEADER_BG,
              border: 'none', borderInlineStart: `1px solid ${CLR_NAV_BORDER}`,
              color: commentText.trim() ? CLR_PRIMARY : CLR_TEXT_DIM,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <Send size={15} strokeWidth={2.4} />
          </motion.button>
        </div>
      )}
    </motion.div>
  );
}


// ── GlobeVoiceControl — public Agora room beside the story creator ────────────
interface GlobeVoiceMember {
  userId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
}

interface GlobeVoiceControlProps {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  /** 'row' (default) keeps the three controls side by side; 'column' stacks them one under another;
   * 'split' renders just the dots-button and the mic-button (no toggle switch, no bordered wrapper)
   * so the caller can interleave them with its own UI — see renderSplit below. */
  layout?: 'row' | 'column' | 'split';
  /** Only used when layout === 'split'. Receives the dots-button and mic-button as ready-made
   * elements so the caller can place them wherever it needs (e.g. on opposite ends of a row with
   * other buttons in between). If omitted while layout === 'split', the two pieces are rendered
   * next to each other in a fragment. */
  renderSplit?: (parts: { dotsButton: React.ReactNode; micButton: React.ReactNode }) => React.ReactNode;
  /** When provided, the control becomes a PRIVATE 1:1 call with this specific person instead of
   * the public shared room — the two users' ids are combined into a unique, deterministic
   * channel so only the two of them can ever land in that room together. */
  peerId?: string;
  /** True when someone is currently viewing this person's profile (see useProfileVisitPresence
   * below). Turns all three dots solid yellow as a "someone's here" signal — but only when no
   * one is actually live in the voice room; an active room keeps its normal rainbow indicator,
   * which is never overridden by a plain profile visit. */
  hasProfileVisitor?: boolean;
  /** People currently viewing this profile (from useProfileVisitPresence), listed in the panel
   * under a second "الموجودون في بروفايل قصتك" section, below the voice-room members. */
  profileVisitors?: GlobeVoiceMember[];
}

const GLOBE_VOICE_CHANNEL = 'globe-public-voice';
const AGORA_APP_ID = '149ef04e839c4132a08efb49d717c436';

// Agora channel names must stay within 64 bytes and only use
// [a-zA-Z0-9 !#$%&()+-:;<=.>?@[]^_{}|~,]. Our real user ids (e.g. long auth
// ids/emails) can easily blow past 64 bytes once combined into a private
// "<idA>_<idB>" pair name — that's exactly the INVALID_PARAMS error. Instead
// we hash the sorted pair down to a short, fixed-length hex string so the
// channel name is always short and always in the allowed character set,
// while staying deterministic and order-independent for the same two users.
function shortChannelHash(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
}

// ── Profile-visit presence ─────────────────────────────────────────────────
// Lightweight polling presence: whoever has someone else's profile open sends a heartbeat
// every 4s; the profile owner polls for who's currently there every 4s. A visitor "expires"
// if no heartbeat arrives for ~12s (tab closed, navigated away, connection dropped, etc).
//
// Needs three new backend endpoints, matching the existing /api/room/* pattern in this file:
//   POST /api/profile-visit/heartbeat   body: { ownerId, viewerId, viewerName, viewerUsername, viewerAvatarUrl }
//   POST /api/profile-visit/leave       body: { ownerId, viewerId }
//   GET  /api/profile-visit/visitors?ownerId=...   ->  { visitors: GlobeVoiceMember[] }
// (visitors = viewers whose last heartbeat is within the last ~12s; server should prune older ones)
function useProfileVisitHeartbeat(ownerId: string | null, viewer: { id: string; name: string | null; username?: string | null; avatarUrl?: string | null } | null) {
  useEffect(() => {
    if (!ownerId || !viewer || viewer.id === ownerId) return;
    const send = () => {
      void fetch('/api/profile-visit/heartbeat', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerId, viewerId: viewer.id, viewerName: viewer.name,
          viewerUsername: viewer.username ?? null, viewerAvatarUrl: viewer.avatarUrl ?? null,
        }),
      });
    };
    send();
    const interval = window.setInterval(send, 4000);
    const leave = () => {
      try {
        navigator.sendBeacon?.(
          '/api/profile-visit/leave',
          new Blob([JSON.stringify({ ownerId, viewerId: viewer.id })], { type: 'application/json' })
        );
      } catch {}
    };
    window.addEventListener('pagehide', leave);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('pagehide', leave);
      void fetch('/api/profile-visit/leave', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerId, viewerId: viewer.id }),
      });
    };
  }, [ownerId, viewer?.id, viewer?.name, viewer?.username, viewer?.avatarUrl]);
}

function useProfileVisitors(ownerId: string | null): GlobeVoiceMember[] {
  const [visitors, setVisitors] = useState<GlobeVoiceMember[]>([]);
  useEffect(() => {
    if (!ownerId) { setVisitors([]); return; }
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch(`/api/profile-visit/visitors?ownerId=${encodeURIComponent(ownerId)}`, { credentials: 'include' });
        if (!r.ok || cancelled) return;
        const d = await r.json() as { visitors?: GlobeVoiceMember[] };
        if (!cancelled) setVisitors(d.visitors ?? []);
      } catch {}
    };
    void poll();
    const interval = window.setInterval(poll, 4000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [ownerId]);
  return visitors;
}

// Module-scope on purpose: this call must keep running while the user browses other
// pages in the app (which unmounts/remounts this component), so its connection can't
// live inside a per-instance useRef.
const globeVoiceClientRef: { current: IAgoraRTCClient | null } = { current: null };
const globeVoiceMicTrackRef: { current: IMicrophoneAudioTrack | null } = { current: null };
const globeVoiceJoinedRef: { current: boolean } = { current: false };

// ── Global "in-call" banner state ───────────────────────────────────────────
// A GlobeVoiceControl instance only exists while its screen (a friend's profile,
// the story header, ...) is mounted. The call itself lives in the module refs above
// and keeps running after that screen closes — but with nothing mounted, there was
// no way to see/mute/hang up the call from elsewhere in the app. This tiny store lets
// a single always-mounted <GlobalCallBanner /> reflect and control that call from
// anywhere, decoupled from whichever GlobeVoiceControl instance (if any) is mounted.
type ActiveCallState = {
  joined: boolean;
  answered: boolean; // the other side actually joined too, not just me alone
  muted: boolean;
  channel: string | null;
  userId: string | null;
  isPrivate: boolean;
  peerLabel: string | null;
};
let activeCallState: ActiveCallState = {
  joined: false, answered: false, muted: false, channel: null, userId: null, isPrivate: false, peerLabel: null,
};
const activeCallListeners = new Set<() => void>();
function getActiveCallSnapshot(): ActiveCallState { return activeCallState; }
function setActiveCallState(patch: Partial<ActiveCallState>) {
  activeCallState = { ...activeCallState, ...patch };
  activeCallListeners.forEach(listener => listener());
}
function subscribeActiveCall(listener: () => void) {
  activeCallListeners.add(listener);
  return () => { activeCallListeners.delete(listener); };
}
// Mutes/unmutes MY own outgoing mic — works purely off the module-scope track ref,
// so it's callable from the banner even with no GlobeVoiceControl mounted.
function toggleActiveCallMute() {
  const nextMuted = !activeCallState.muted;
  try { void globeVoiceMicTrackRef.current?.setMuted(nextMuted); } catch {}
  setActiveCallState({ muted: nextMuted });
}
// Hangs up the call from anywhere — same cleanup as GlobeVoiceControl's own leaveRoom,
// just operating on the module refs directly instead of through a mounted instance.
async function endActiveCallGlobally() {
  const { channel, userId } = activeCallState;
  globeVoiceJoinedRef.current = false;
  try {
    const track = globeVoiceMicTrackRef.current;
    if (track) {
      await globeVoiceClientRef.current?.unpublish([track]);
      track.stop();
      track.close();
    }
    globeVoiceMicTrackRef.current = null;
    await globeVoiceClientRef.current?.leave();
  } catch {}
  globeVoiceClientRef.current = null;
  if (channel && userId) {
    void fetch('/api/room/leave', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: channel, userId }),
    });
  }
  setActiveCallState({ joined: false, answered: false, muted: false, channel: null, userId: null, peerLabel: null });
}

// ── Incoming-call ("ringing") global state ──────────────────────────────────
// Separate from ActiveCallState above: this represents a call someone else has started
// with ME, before I've answered it. It's populated by <GlobalIncomingCallWatcher/>
// (mounted once at the page root, see AddFriendPage's return), which polls for it on its
// own — independent of whichever screen/tab of the page happens to be open. That's what
// makes the ring/banner show up without needing to be sitting on the caller's profile.
type IncomingCallState = {
  ringing: boolean;
  channel: string | null;
  callerId: string | null;
  callerLabel: string | null;
  isPrivate: boolean;
  ringSilenced: boolean; // "ميوت" — يوقف صوت/رجفة الرنة بس يخلي البانر الأخضر ظاهر
};
let incomingCallState: IncomingCallState = {
  ringing: false, channel: null, callerId: null, callerLabel: null, isPrivate: true, ringSilenced: false,
};
const incomingCallListeners = new Set<() => void>();
function getIncomingCallSnapshot(): IncomingCallState { return incomingCallState; }
function setIncomingCallState(patch: Partial<IncomingCallState>) {
  incomingCallState = { ...incomingCallState, ...patch };
  incomingCallListeners.forEach(listener => listener());
}
function subscribeIncomingCall(listener: () => void) {
  incomingCallListeners.add(listener);
  return () => { incomingCallListeners.delete(listener); };
}

// حلقة رنين مستقلة على مستوى الموديول (منفصلة عن ringIntervalRef اللي جوه GlobeVoiceControl،
// لأن ذاك يشتغل بس إذا كان في instance من GlobeVoiceControl متركّب بالشاشة). هذي تشتغل طول
// ما الصفحة مفتوحة، بغض النظر عن أي تبويب/شاشة داخلية أنت فيها.
let globalRingIntervalRef: number | null = null;
function stopGlobalIncomingRing() {
  if (globalRingIntervalRef != null) {
    window.clearInterval(globalRingIntervalRef);
    globalRingIntervalRef = null;
  }
}
function startGlobalIncomingRing() {
  if (globalRingIntervalRef != null) return;
  if (!incomingCallState.ringSilenced) {
    playIncomingCallRing();
    try { navigator.vibrate?.([300, 200, 300, 200]); } catch {}
  }
  globalRingIntervalRef = window.setInterval(() => {
    if (incomingCallState.ringSilenced) return; // ميوت: نوقف الصوت والرجفة بس نخلي البانر شغال
    playIncomingCallRing();
    try { navigator.vibrate?.([300, 200, 300, 200]); } catch {}
  }, 2600);
}

// إشعار نظام حقيقي (Notification API) — يوصل طول ما المتصفح/التطبيق شغال بالخلفية (تبويب
// ثاني، الشاشة مفتوحة بس التطبيق مو فوق)، حتى لو ما كنت بصفحة الشات. ملاحظة مهمة: هذا
// مختلف عن Push حقيقي — لو المتصفح/التطبيق مقفول بالكامل ما توصل، لأن هذا يحتاج Service
// Worker + اشتراك Push + سيرفر يرسل الإشعار، وهذا الملف ما فيه هذي البنية.
function notifyIncomingCallSystem(callerLabel: string) {
  try {
    if (typeof Notification === 'undefined') return;
    const show = () => {
      if (Notification.permission !== 'granted') return;
      const n = new Notification('مكالمة واردة', {
        body: `${callerLabel} يتصل بك الآن`,
        tag: 'stooorna-incoming-call',
        requireInteraction: true,
      });
      n.onclick = () => { window.focus(); n.close(); };
    };
    if (Notification.permission === 'granted') show();
    else if (Notification.permission !== 'denied') {
      void Notification.requestPermission().then(perm => { if (perm === 'granted') show(); });
    }
  } catch {}
}

// الرد على مكالمة واردة من أي مكان بالصفحة — نفس منطق joinRoom بالضبط لكنه يشتغل على
// نفس الـ refs العامة اللي يستخدمها endActiveCallGlobally/toggleActiveCallMute فوق،
// بدل ما يحتاج instance من GlobeVoiceControl يكون متركّب بالشاشة عشان يرد.
async function answerIncomingCallGlobally(myUserId: string, myUserName: string | null) {
  const { channel, callerLabel, isPrivate } = incomingCallState;
  if (!channel) return;
  stopGlobalIncomingRing();
  setIncomingCallState({ ringing: false, channel: null, callerId: null, callerLabel: null, ringSilenced: false });
  try {
    const register = await fetch('/api/room/join', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: channel, userId: myUserId, name: myUserName }),
    });
    if (!register.ok) throw new Error('Unable to start the voice room.');

    const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' } as any);
    globeVoiceClientRef.current = client;
    client.on('user-published', async (remoteUser: IAgoraRTCRemoteUser, mediaType: string) => {
      if (mediaType !== 'audio') return;
      try {
        await client.subscribe(remoteUser, 'audio');
        remoteUser.audioTrack?.play();
      } catch (subscribeError) {
        console.warn('[GlobalIncomingCall] audio subscription skipped', subscribeError);
      }
    });
    client.on('user-unpublished', (remoteUser: IAgoraRTCRemoteUser) => remoteUser.audioTrack?.stop());
    client.on('user-left', (remoteUser: IAgoraRTCRemoteUser) => remoteUser.audioTrack?.stop());

    const tokenResponse = await fetch(`/api/call/token?channel=${encodeURIComponent(channel)}&uid=${encodeURIComponent(myUserId)}`, { credentials: 'include' });
    if (!tokenResponse.ok) throw new Error('Voice connection is unavailable.');
    const tokenData = await tokenResponse.json() as { token: string; uid: number };
    await client.join(AGORA_APP_ID, channel, tokenData.token, tokenData.uid);

    globeVoiceJoinedRef.current = true;
    setActiveCallState({ joined: true, answered: false, muted: false, channel, userId: myUserId, isPrivate, peerLabel: callerLabel });

    const micTrack = await AgoraRTC.createMicrophoneAudioTrack({ encoderConfig: 'speech_standard' });
    globeVoiceMicTrackRef.current = micTrack;
    await client.publish([micTrack]);

    await Promise.all(client.remoteUsers.map(async (remoteUser) => {
      if (!remoteUser.hasAudio) return;
      try { await client.subscribe(remoteUser, 'audio'); remoteUser.audioTrack?.play(); } catch (subscribeError) {
        console.warn('[GlobalIncomingCall] existing audio subscription skipped', subscribeError);
      }
    }));

    try { navigator.vibrate?.(35); } catch {}
  } catch (answerError) {
    console.error('[GlobalIncomingCall] answer error', answerError);
    // فشل الرد — نرجّع حالة الاتصال النشط لصفرها عشان زر "إنهاء" ما يعلق ظاهر على مكالمة فاضية
    globeVoiceJoinedRef.current = false;
    setActiveCallState({ joined: false, answered: false, muted: false, channel: null, userId: null, peerLabel: null });
  }
}

// بانر المكالمة الواردة — نفس شكل ومكان GlobalCallBanner بالضبط (نفس المستطيل)، لكن
// بالأخضر وبدون زر إنهاء: بس "رد" + "ميوت". يظهر فقط إذا كان في رنين ولسا ما دخلت مكالمة.
function GlobalIncomingCallBanner({ myUserId, myUserName }: { myUserId: string | null; myUserName: string | null }) {
  const incoming = useSyncExternalStore(subscribeIncomingCall, getIncomingCallSnapshot, getIncomingCallSnapshot);
  const activeState = useSyncExternalStore(subscribeActiveCall, getActiveCallSnapshot, getActiveCallSnapshot);
  if (!incoming.ringing || activeState.joined || !myUserId) return null;
  return (
    <div style={{
      position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 8px)', left: '50%', transform: 'translateX(-50%)',
      zIndex: 10500, display: 'flex', alignItems: 'center', gap: 10,
      background: 'rgba(10,26,26,0.94)', border: '1px solid rgba(34,197,94,0.55)',
      borderRadius: 999, padding: '6px 8px 6px 12px', boxShadow: '0 4px 18px rgba(34,197,94,0.25)',
      backdropFilter: 'blur(6px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 16 }} aria-hidden="true">
        {[0, 1, 2, 3, 4].map(i => (
          <span key={i} style={{
            width: 3, height: '100%', borderRadius: 2, background: '#22c55e',
            transformOrigin: 'center',
            animation: `globeVoiceWave 0.6s ease-in-out ${i * 0.09}s infinite alternate`,
          }} />
        ))}
      </div>
      <span style={{ color: '#fff', fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
        {incoming.callerLabel || 'مكالمة واردة'}
      </span>
      <button
        onClick={() => { void answerIncomingCallGlobally(myUserId, myUserName); }}
        aria-label="رد"
        title="رد"
        style={{
          width: 26, height: 26, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0,
          background: '#22c55e', color: '#06171a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}
      >
        <Phone size={13} strokeWidth={2.6} />
      </button>
      <button
        onClick={() => setIncomingCallState({ ringSilenced: !incoming.ringSilenced })}
        aria-label={incoming.ringSilenced ? 'إلغاء الميوت' : 'ميوت الرنة'}
        title={incoming.ringSilenced ? 'إلغاء الميوت' : 'ميوت الرنة'}
        style={{
          width: 26, height: 26, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0,
          background: incoming.ringSilenced ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.1)',
          color: incoming.ringSilenced ? '#22c55e' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}
      >
        {incoming.ringSilenced ? <MicOff size={13} strokeWidth={2.3} /> : <Mic size={13} strokeWidth={2.3} />}
      </button>
    </div>
  );
}

// الراصد العام للمكالمات الواردة — مكوّن غير مرئي (يرجّع null دايمًا)، يتركّب مرة وحدة
// بجذر الصفحة (AddFriendPage) ويفحص كل ٣ ثواني هل في أحد يتصل فيني، بدون ما يحتاج أكون
// داخل شاشة بروفايل معينة. يعتمد بالكامل على الـ APIs الموجودة فعلاً (profile-visit + room)
// فما يحتاج أي تعديل بالباك-إند.
function GlobalIncomingCallWatcher({ myUserId, myUserName }: { myUserId: string | null; myUserName: string | null }) {
  void myUserName;
  useEffect(() => {
    if (!myUserId) return;
    let cancelled = false;
    const poll = async () => {
      // أنا أصلاً بمكالمة (رديت أو أنا البادئ) — ما فيه داعي أدوّر على رنين جديد
      if (activeCallState.joined) return;
      try {
        const r = await fetch(`/api/profile-visit/visitors?ownerId=${encodeURIComponent(myUserId)}`, { credentials: 'include' });
        if (!r.ok || cancelled) return;
        const d = await r.json() as { visitors?: GlobeVoiceMember[] };
        const visitor = (d.visitors ?? [])[0];
        if (!visitor) {
          if (incomingCallState.ringing) {
            stopGlobalIncomingRing();
            setIncomingCallState({ ringing: false, channel: null, callerId: null, callerLabel: null, ringSilenced: false });
          }
          return;
        }
        const channel = `private_${shortChannelHash([myUserId, visitor.userId].sort().join('_'))}`;
        const roomRes = await fetch(`/api/room?id=${encodeURIComponent(channel)}`, { credentials: 'include' });
        if (!roomRes.ok || cancelled) return;
        const roomData = await roomRes.json() as { members?: GlobeVoiceMember[] };
        const members = roomData.members ?? [];
        const callerActive = members.some(m => m.userId !== myUserId);
        if (callerActive && !incomingCallState.ringing) {
          const label = visitor.name || visitor.username || null;
          setIncomingCallState({ ringing: true, channel, callerId: visitor.userId, callerLabel: label, isPrivate: true, ringSilenced: false });
          startGlobalIncomingRing();
          notifyIncomingCallSystem(label || 'صديق');
        } else if (!callerActive && incomingCallState.ringing && incomingCallState.channel === channel) {
          stopGlobalIncomingRing();
          setIncomingCallState({ ringing: false, channel: null, callerId: null, callerLabel: null, ringSilenced: false });
        }
      } catch {}
    };
    void poll();
    const interval = window.setInterval(() => { void poll(); }, 3000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [myUserId]);
  return null;
}

// Fixed pill at the top of the screen showing the live call's audio waveform, a mute
// toggle, and a hang-up button — mounted once at the page root so it stays visible (and
// controllable) no matter which screen the user is browsing while the call is active.
function GlobalCallBanner() {
  const state = useSyncExternalStore(subscribeActiveCall, getActiveCallSnapshot, getActiveCallSnapshot);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!state.answered) { setSeconds(0); return; }
    const start = Date.now();
    setSeconds(0);
    const interval = window.setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(interval);
  }, [state.answered]);
  if (!state.joined) return null;
  const durationLabel = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <div style={{
      position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 8px)', left: '50%', transform: 'translateX(-50%)',
      zIndex: 10500, display: 'flex', alignItems: 'center', gap: 10,
      background: 'rgba(10,26,26,0.94)', border: '1px solid rgba(34,197,94,0.4)',
      borderRadius: 999, padding: '6px 8px 6px 12px', boxShadow: '0 4px 18px rgba(0,0,0,0.35)',
      backdropFilter: 'blur(6px)',
    }}>
      {/* ذبذبات الصوت — نشطة فقط لما الطرف الثاني يكون منضم فعليًا */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 16 }} aria-hidden="true">
        {[0, 1, 2, 3, 4].map(i => (
          <span key={i} style={{
            width: 3, height: '100%', borderRadius: 2, background: '#22c55e',
            transformOrigin: 'center',
            animation: state.answered ? `globeVoiceWave 0.6s ease-in-out ${i * 0.09}s infinite alternate` : 'none',
            opacity: state.answered ? 1 : 0.35,
          }} />
        ))}
      </div>
      <span style={{ color: '#fff', fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
        {state.peerLabel || (state.isPrivate ? 'مكالمة صوتية' : 'صوت مباشر')}
        {state.answered && (
          <span style={{ marginInlineStart: 6, fontVariantNumeric: 'tabular-nums', opacity: 0.8 }}>{durationLabel}</span>
        )}
      </span>
      <button
        onClick={toggleActiveCallMute}
        aria-label={state.muted ? 'إلغاء كتم المايك' : 'كتم المايك'}
        title={state.muted ? 'إلغاء كتم المايك' : 'كتم المايك'}
        style={{
          width: 26, height: 26, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0,
          background: state.muted ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.1)',
          color: state.muted ? '#ef4444' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}
      >
        {state.muted ? <MicOff size={13} strokeWidth={2.3} /> : <Mic size={13} strokeWidth={2.3} />}
      </button>
      <button
        onClick={() => void endActiveCallGlobally()}
        aria-label="إنهاء المكالمة"
        title="إنهاء المكالمة"
        style={{
          width: 26, height: 26, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0,
          background: 'rgba(239,68,68,0.9)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}
      >
        <X size={14} strokeWidth={2.6} />
      </button>
    </div>
  );
}

function GlobeVoiceControl({ userId, userName, avatarUrl, layout = 'row', renderSplit, peerId, hasProfileVisitor = false, profileVisitors = [] }: GlobeVoiceControlProps) {
  void avatarUrl;
  const isColumn = layout === 'column';
  // Private call → a channel unique to this pair of users (order-independent), so the room can
  // never contain anyone but the two of them. No peerId → falls back to the old public channel.
  // The pair is hashed (see shortChannelHash) so long/real user ids never push the channel name
  // past Agora's 64-byte limit or outside its allowed character set.
  const channel = peerId ? `private_${shortChannelHash([userId, peerId].sort().join('_'))}` : GLOBE_VOICE_CHANNEL;
  const isPrivate = !!peerId;
  const [members, setMembers] = useState<GlobeVoiceMember[]>([]);
  const [joined, setJoined] = useState(() => globeVoiceJoinedRef.current);
  const [, setVoiceEnabled] = useState(() => globeVoiceJoinedRef.current);
  const [joining, setJoining] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [error, setError] = useState('');
  // ── Call duration timer — starts counting only once the peer has actually joined
  // too (the call was "answered"), not the moment I tap the phone myself. ──
  const [callSeconds, setCallSeconds] = useState(0);
  const clientRef = globeVoiceClientRef;
  const micTrackRef = globeVoiceMicTrackRef;
  const joinedRef = globeVoiceJoinedRef;
  const alertedRef = useRef(false);
  // ── حلقة رنين الاتصال الوارد — تدق بشكل متكرر لين يرد المستخدم (joined) أو
  //    ينقطع الاتصال (الأعضاء يرجعون صفر)؛ تُلغى بأي من الحالتين. ──
  const ringIntervalRef = useRef<number | null>(null);
  const stopIncomingRing = useCallback(() => {
    if (ringIntervalRef.current != null) {
      window.clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
  }, []);
  const startIncomingRing = useCallback(() => {
    if (ringIntervalRef.current != null) return; // تدق أصلًا
    playIncomingCallRing();
    try { navigator.vibrate?.([300, 200, 300, 200]); } catch {}
    ringIntervalRef.current = window.setInterval(() => {
      playIncomingCallRing();
      try { navigator.vibrate?.([300, 200, 300, 200]); } catch {}
    }, 2600);
  }, []);
  useEffect(() => stopIncomingRing, [stopIncomingRing]); // تنظيف عند إزالة المكوّن

  // ── Per-member actions: mute (local only), block, remove from friends ──────
  const [mutedUserIds, setMutedUserIds] = useState<Set<string>>(new Set());
  const mutedUserIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => { mutedUserIdsRef.current = mutedUserIds; }, [mutedUserIds]);
  const [memberMenuFor, setMemberMenuFor] = useState<GlobeVoiceMember | null>(null);
  const [confirmDeleteMember, setConfirmDeleteMember] = useState<GlobeVoiceMember | null>(null);
  const [confirmBlockMember, setConfirmBlockMember] = useState<GlobeVoiceMember | null>(null);
  const [memberActionBusy, setMemberActionBusy] = useState(false);
  // Maps app userId <-> the numeric Agora uid used for this channel, resolved lazily
  const uidMapRef = useRef<Record<string, number>>({});
  const userIdByAgoraUidRef = useRef<Record<number, string>>({});
  const resolveAgoraUid = useCallback(async (appUserId: string): Promise<number | null> => {
    if (uidMapRef.current[appUserId] != null) return uidMapRef.current[appUserId];
    try {
      const r = await fetch(`/api/call/token?channel=${encodeURIComponent(channel)}&uid=${encodeURIComponent(appUserId)}`, { credentials: 'include' });
      if (!r.ok) return null;
      const d = await r.json() as { uid: number };
      uidMapRef.current[appUserId] = d.uid;
      userIdByAgoraUidRef.current[d.uid] = appUserId;
      return d.uid;
    } catch { return null; }
  }, [channel]);

  const fetchRoom = useCallback(async () => {
    try {
      const response = await fetch(`/api/room?id=${encodeURIComponent(channel)}`, { credentials: 'include' });
      if (!response.ok) return;
      const data = await response.json() as { members?: GlobeVoiceMember[] };
      const nextMembers = data.members ?? [];
      setMembers(nextMembers);
      // Warm the uid cache for whoever is in the room so mute can apply instantly on publish
      nextMembers.forEach(member => { if (member.userId !== userId) void resolveAgoraUid(member.userId); });
      if (nextMembers.length > 0 && !joinedRef.current && !alertedRef.current) {
        alertedRef.current = true;
        startIncomingRing();
      }
      if (nextMembers.length === 0) {
        alertedRef.current = false;
        stopIncomingRing();
      }
    } catch {}
  }, [resolveAgoraUid, userId, channel, startIncomingRing, stopIncomingRing]);

  useEffect(() => {
    void fetchRoom();
    const interval = window.setInterval(() => { void fetchRoom(); }, 3000);
    return () => window.clearInterval(interval);
  }, [fetchRoom]);

  useEffect(() => {
    if (!joined) return;
    const heartbeat = () => {
      void fetch('/api/room/heartbeat', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: channel, userId }),
      });
    };
    heartbeat();
    const interval = window.setInterval(heartbeat, 5000);
    return () => window.clearInterval(interval);
  }, [joined, userId, channel]);

  const leaveRoom = useCallback(async () => {
    if (!joinedRef.current) return;
    joinedRef.current = false;
    setJoined(false);
    setVoiceEnabled(false);
    setJoining(false);
    try {
      const track = micTrackRef.current;
      if (track) {
        await clientRef.current?.unpublish([track]);
        track.stop();
        track.close();
      }
      micTrackRef.current = null;
      await clientRef.current?.leave();
    } catch {}
    clientRef.current = null;
    void fetch('/api/room/leave', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: channel, userId }),
    });
    setActiveCallState({ joined: false, answered: false, muted: false, channel: null, userId: null, peerLabel: null });
    void fetchRoom();
  }, [fetchRoom, userId, channel]);

  // Do NOT leave the room when this component unmounts — navigating between pages
  // inside the app unmounts/remounts this control, and the call must keep running
  // while the user browses. The room is only left when the user actually exits the
  // app/tab (below) or explicitly taps the mic to hang up.
  useEffect(() => {
    const handleAppExit = () => {
      if (!joinedRef.current) return;
      try {
        navigator.sendBeacon?.(
          '/api/room/leave',
          new Blob([JSON.stringify({ roomId: channel, userId })], { type: 'application/json' })
        );
      } catch {}
    };
    window.addEventListener('pagehide', handleAppExit);
    window.addEventListener('beforeunload', handleAppExit);
    return () => {
      window.removeEventListener('pagehide', handleAppExit);
      window.removeEventListener('beforeunload', handleAppExit);
    };
  }, [userId, channel]);

  async function joinRoom() {
    if (joinedRef.current || joining) return;
    stopIncomingRing(); // المستخدم رد على الاتصال — أوقف الرنة فورًا
    setJoining(true);
    setError('');
    try {
      const register = await fetch('/api/room/join', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: channel, userId, name: userName }),
      });
      if (!register.ok) throw new Error('Unable to start the voice room.');

      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' } as any);
      clientRef.current = client;
      client.on('user-published', async (remoteUser: IAgoraRTCRemoteUser, mediaType: string) => {
        if (mediaType !== 'audio') return;
        try {
          await client.subscribe(remoteUser, 'audio');
          const mappedUserId = userIdByAgoraUidRef.current[remoteUser.uid as number];
          const isMuted = !!mappedUserId && mutedUserIdsRef.current.has(mappedUserId);
          if (!isMuted) remoteUser.audioTrack?.play();
        } catch (subscribeError) {
          // A remote user can unpublish or leave between Agora's event and subscription request.
          // Ignore that expected race condition so the live-room controls remain usable.
          console.warn('[GlobeVoiceControl] audio subscription skipped', subscribeError);
        }
      });
      client.on('user-unpublished', (remoteUser: IAgoraRTCRemoteUser) => remoteUser.audioTrack?.stop());
      client.on('user-left', (remoteUser: IAgoraRTCRemoteUser) => remoteUser.audioTrack?.stop());

      const tokenResponse = await fetch(`/api/call/token?channel=${encodeURIComponent(channel)}&uid=${encodeURIComponent(userId)}`, { credentials: 'include' });
      if (!tokenResponse.ok) throw new Error('Voice connection is unavailable.');
      const tokenData = await tokenResponse.json() as { token: string; uid: number };
      await client.join(AGORA_APP_ID, channel, tokenData.token, tokenData.uid);

      // Register the local state before requesting microphone permission. This makes
      // the shared room indicator update immediately for other listeners.
      joinedRef.current = true;
      setJoined(true);
      setVoiceEnabled(true);
      setActiveCallState({ joined: true, answered: false, muted: false, channel, userId, isPrivate, peerLabel: null });
      void fetchRoom();

      // تحقق مبكر: بعض الـ WebViews (تطبيقات الموبايل المغلّفة) ما تعرّف
      // navigator.mediaDevices إطلاقًا إذا التطبيق الأصلي ما منح صلاحية المايك
      // على مستوى النظام (Android/iOS) — هذا مختلف تمامًا عن "المستخدم رفض الإذن".
      if (!window.isSecureContext) {
        throw new Error('MIC_INSECURE_CONTEXT');
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('MIC_UNSUPPORTED_CONTEXT');
      }
      const micTrack = await AgoraRTC.createMicrophoneAudioTrack({ encoderConfig: 'speech_standard' }).catch((micError: any) => {
        // نطبع تفاصيل الخطأ الحقيقي بالكونسول عشان يصير التشخيص أدق من الرسالة العامة وحدها.
        console.error('[GlobeVoiceControl] raw mic error', { name: micError?.name, code: micError?.code, message: micError?.message });
        const name = (micError?.name || micError?.code || '').toString().toUpperCase();
        if (name.includes('NOTALLOWED') || name.includes('PERMISSIONDENIED') || name.includes('PERMISSION_DENIED') || name.includes('SECURITYERROR')) {
          throw new Error('MIC_PERMISSION_DENIED');
        }
        if (name.includes('NOTFOUND') || name.includes('DEVICESNOTFOUND') || name.includes('DEVICE_NOT_FOUND')) {
          throw new Error('MIC_NOT_FOUND');
        }
        if (name.includes('NOTREADABLE') || name.includes('TRACKSTARTERROR') || name.includes('NOT_READABLE')) {
          throw new Error('MIC_IN_USE');
        }
        // سبب غير معروف — نرفق التفاصيل الخام بنفس رسالة الخطأ عشان تبين للمستخدم مباشرة
        // بدون فتح الـ console، ونقدر نشخصها من أول رسالة يرسلها.
        const rawDetail = micError?.name || micError?.code || micError?.message || 'unknown';
        throw new Error(`MIC_UNKNOWN::${rawDetail}`);
      });
      micTrackRef.current = micTrack;
      await client.publish([micTrack]);

      // Agora does not replay user-published events that occurred before this
      // client joined. Subscribe to every already-published remote audio track.
      await Promise.all(client.remoteUsers.map(async (remoteUser) => {
        if (!remoteUser.hasAudio) return;
        try {
          await client.subscribe(remoteUser, 'audio');
          const mappedUserId = userIdByAgoraUidRef.current[remoteUser.uid as number];
          const isMuted = !!mappedUserId && mutedUserIdsRef.current.has(mappedUserId);
          if (!isMuted) remoteUser.audioTrack?.play();
        } catch (subscribeError) {
          console.warn('[GlobeVoiceControl] existing audio subscription skipped', subscribeError);
        }
      }));

      try { navigator.vibrate?.(35); } catch {}
      void fetchRoom();
    } catch (joinError) {
      console.error('[GlobeVoiceControl] join error', joinError);
      const reason = (joinError as Error)?.message ?? '';
      const messages: Record<string, string> = {
        MIC_PERMISSION_DENIED: 'تم رفض إذن المايكروفون. افتح إعدادات المتصفح/التطبيق واسمح بالوصول للمايكروفون لهذا الموقع، ثم أعد المحاولة.',
        MIC_NOT_FOUND: 'لم يتم العثور على مايكروفون متصل بجهازك. تأكد من توصيل المايكروفون وحاول مجددًا.',
        MIC_IN_USE: 'المايكروفون مستخدم حاليًا من تطبيق آخر. أغلق التطبيقات الأخرى التي تستخدم المايكروفون وحاول مجددًا.',
        MIC_INSECURE_CONTEXT: 'الاتصال بالمايكروفون يتطلب اتصالًا آمنًا (HTTPS). تأكد أنك تفتح الموقع عبر رابط آمن.',
        MIC_UNSUPPORTED_CONTEXT: 'هذا التطبيق/المتصفح لا يوفّر وصولًا للمايكروفون بهذا السياق — إذا كنت تستخدم نسخة التطبيق المُغلّفة (WebView)، تأكد إن التطبيق نفسه منحته صلاحية المايكروفون من إعدادات النظام (Android/iOS)، مو بس إعدادات المتصفح.',
        'Unable to start the voice room.': 'تعذر بدء الغرفة الصوتية من السيرفر — تحقق من اتصال الإنترنت وحاول مجددًا.',
        'Voice connection is unavailable.': 'تعذر الحصول على توكن الاتصال الصوتي من السيرفر — تحقق من اتصال الإنترنت وحاول مجددًا.',
      };
      if (reason.startsWith('MIC_UNKNOWN::')) {
        const rawDetail = reason.slice('MIC_UNKNOWN::'.length);
        setError(`تعذر تشغيل المايك. تأكد من السماح بالوصول للمايكروفون. (السبب: ${rawDetail})`);
      } else {
        setError(messages[reason] ?? `تعذر تشغيل المايك. تأكد من السماح بالوصول للمايكروفون. (السبب: ${reason || 'غير معروف'})`);
      }
      await leaveRoom();
    } finally {
      setJoining(false);
    }
  }

  const roomActive = members.length > 0;
  // "Answered" = I'm joined AND at least one other person is actually in the channel with me —
  // not just me sitting alone in an empty room.
  const callAnswered = joined && members.some(m => m.userId !== userId);
  const micColor = callAnswered ? '#22c55e' : joined ? 'hsl(var(--primary))' : roomActive ? 'hsl(var(--accent))' : 'hsl(var(--destructive))';

  // Count seconds while the call is actually answered; reset the moment it isn't.
  useEffect(() => {
    if (!callAnswered) { setCallSeconds(0); return; }
    const start = Date.now();
    setCallSeconds(0);
    const interval = window.setInterval(() => {
      setCallSeconds(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [callAnswered]);

  const callDurationLabel = `${Math.floor(callSeconds / 60)}:${String(callSeconds % 60).padStart(2, '0')}`;

  // While this instance is the one actually holding the call, keep the global banner's
  // "answered" flag and peer name in sync. A not-joined instance (e.g. a different
  // profile screen just sitting there) never touches the store, so it can't clobber
  // the real call's state.
  useEffect(() => {
    if (!joined) return;
    const peer = members.find(m => m.userId !== userId);
    setActiveCallState({ answered: callAnswered, peerLabel: isPrivate ? (peer?.name || peer?.username || null) : 'صوت مباشر' });
  }, [joined, callAnswered, members, userId, isPrivate]);

  const micLabel = joined
    ? (isPrivate ? 'أنت متصل بمكالمة صوتية خاصة' : 'أنت متصل بالصوت المباشر')
    : roomActive
      ? (isPrivate ? 'الشخص بانتظارك — اضغط للانضمام' : 'يوجد شخص في الصوت المباشر — اضغط للانضمام')
      : (isPrivate ? 'ابدأ مكالمة صوتية خاصة' : 'ابدأ محادثة صوتية عامة');

  const toggleVoice = () => {
    if (joined) {
      void leaveRoom();
      return;
    }
    void joinRoom();
  };

  // Mute is local-only — it stops playback of that member's remote audio track for me,
  // it does not affect what other people in the room hear.
  async function toggleMuteMember(member: GlobeVoiceMember) {
    const next = new Set(mutedUserIds);
    const nowMuted = !next.has(member.userId);
    if (nowMuted) next.add(member.userId); else next.delete(member.userId);
    setMutedUserIds(next);
    const agoraUid = await resolveAgoraUid(member.userId);
    if (agoraUid == null) return;
    const remoteUser = clientRef.current?.remoteUsers.find(ru => ru.uid === agoraUid);
    if (!remoteUser?.audioTrack) return;
    if (nowMuted) remoteUser.audioTrack.stop(); else remoteUser.audioTrack.play();
  }

  async function deleteMemberFromFriends(member: GlobeVoiceMember) {
    setMemberActionBusy(true);
    try {
      await fetch(`/api/friends/${member.userId}`, { method: 'DELETE', credentials: 'include' });
    } catch {/* silent */} finally {
      setMemberActionBusy(false);
      setConfirmDeleteMember(null);
    }
  }

  async function blockMember(member: GlobeVoiceMember) {
    setMemberActionBusy(true);
    try {
      // Remove friend first, then block
      await fetch(`/api/friends/${member.userId}`, { method: 'DELETE', credentials: 'include' });
      await fetch('/api/users/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ targetId: member.userId, action: 'block' }),
      });
      setMembers(prev => prev.filter(m => m.userId !== member.userId));
    } catch {/* silent */} finally {
      setMemberActionBusy(false);
      setConfirmBlockMember(null);
    }
  }

  // 'split' renders the dots-button and the mic-button as two standalone circular buttons
  // (same borderless "⋮"-style look as the block/"more" button elsewhere on the friend's profile)
  // so a caller can drop them on opposite ends of its own row, with the mic sitting in the middle.
  const isSplit = layout === 'split';

  const micButtonEl = (
    <span style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Call-duration timer — only ticks, and only shows, once the call is actually answered.
          Sits beside the mic button on its left, vertically centered, instead of above it. */}
      {callAnswered && (
        <span style={{
          position: 'absolute', top: '50%', right: 'calc(100% + 6px)', transform: 'translateY(-50%)',
          fontSize: '0.58rem', fontWeight: 800, color: micColor, whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
        }}>{callDurationLabel}</span>
      )}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={toggleVoice}
        disabled={joining}
        aria-label={micLabel}
        title={micLabel}
        style={{
          width: 30, height: 30, border: 'none',
          background: 'transparent', color: micColor, cursor: joining ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          filter: roomActive ? `drop-shadow(0 0 6px ${micColor})` : 'none',
          animation: roomActive && !joined ? 'globeVoicePulse 1.2s ease-in-out infinite' : 'none',
        }}
      >
        <PhoneOff size={17} strokeWidth={2.3} />
      </motion.button>
      {roomActive && (
        <span style={{
          position: 'absolute',
          top: isColumn ? undefined : -2,
          bottom: isColumn ? -2 : undefined,
          right: -2,
          minWidth: 16, height: 16, padding: '0 4px', borderRadius: 10,
          background: micColor, color: 'hsl(var(--primary-foreground))', fontSize: '0.58rem', fontWeight: 800,
          display: 'grid', placeItems: 'center',
        }}>{members.length}</span>
      )}
    </span>
  );

  const dotsButtonEl = (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={() => setPanelOpen(open => !open)}
      aria-label="المشاركون في المحادثة الصوتية"
      aria-expanded={panelOpen}
      style={isSplit ? {
        width: 30, height: 30, padding: 0, margin: 0, appearance: 'none', WebkitAppearance: 'none',
        border: 'none', borderRadius: '50%', outline: 'none', boxShadow: 'none',
        background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 3, flexShrink: 0,
      } : { width: 22, height: 14, padding: 0, margin: 0, appearance: 'none', WebkitAppearance: 'none', border: 0, outline: 'none', boxShadow: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, flexShrink: 0 }}
    >
      {isSplit ? (
        // نفس حجم زر "⋮" القديم بالضبط — بس بدل ما تكون النقاط الثلاث لون واحد (أحمر)،
        // كل نقطة الحين إلها لونها الخاص مع نبضة أنيميشن، من فوق لتحت: أصفر، أخضر، بنفسجي.
        (["#FACC15", "#22c55e", "#A855F7"].map((color, index) => {
          const dotLit = roomActive || hasProfileVisitor;
          const dotColor = dotLit ? color : 'hsl(var(--muted-foreground))';
          return (
            <span
              key={color}
              aria-hidden="true"
              style={{
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: dotColor,
                boxShadow: dotLit ? `0 0 7px ${dotColor}` : 'none',
                animation: dotLit ? `globeParticipantDotPulse 1.15s ease-in-out ${index * 0.18}s infinite` : 'none',
                transition: 'background 180ms ease, box-shadow 180ms ease',
              }}
            />
          );
        }))
      ) : ["#FACC15", "#38BDF8", "#A855F7"].map((color, index) => {
        // An active voice room keeps its normal rainbow indicator — never overridden.
        // Otherwise, a plain profile visit (no call happening) turns all three dots solid yellow.
        const dotColor = roomActive ? color : hasProfileVisitor ? '#FACC15' : 'hsl(var(--muted-foreground))';
        const dotLit = roomActive || hasProfileVisitor;
        return (
          <span
            key={color}
            aria-hidden="true"
            style={{
              width: 4,
              height: 4,
              borderRadius: '50%',
              background: dotColor,
              boxShadow: dotLit ? `0 0 7px ${dotColor}` : 'none',
              animation: dotLit ? `globeParticipantDotPulse 1.15s ease-in-out ${index * 0.18}s infinite` : 'none',
              transition: 'background 180ms ease, box-shadow 180ms ease',
            }}
          />
        );
      })}
    </motion.button>
  );

  const content = isSplit
    ? (renderSplit ? renderSplit({ dotsButton: dotsButtonEl, micButton: micButtonEl }) : <>{dotsButtonEl}{micButtonEl}</>)
    : <>{micButtonEl}{dotsButtonEl}</>;

  return (
    <div style={isSplit ? { position: 'relative', display: 'contents' } : { display: 'flex', flexDirection: isColumn ? 'column' : 'row', alignItems: 'center', gap: isColumn ? 4 : 9, position: 'relative' }}>
      {content}
      <AnimatePresence>
        {panelOpen && (
          <motion.div
            key="globe-voice-panel-overlay"
            initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }}
            onClick={() => setPanelOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, overflow: 'hidden' }}
          >
            <motion.div
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              style={{ position: 'relative', width: 'min(320px, calc(100vw - 40px))' }}
            >
              {/* زر إغلاق بحافة المستطيل — خارج صندوق السكرول عشان ما ينقص منه، بدون التأثير على رقم عدد المستخدمين بالهيدر */}
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label="إغلاق"
                style={{
                  position: 'absolute', top: -8, right: -8, width: 24, height: 24, borderRadius: '50%',
                  background: '#ef4444', border: '2px solid hsl(var(--card))', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.35)', padding: 0, zIndex: 1,
                }}
              >
                <X size={13} strokeWidth={2.6} />
              </button>
              <div style={{ maxHeight: '64dvh', overflowY: 'auto', padding: 16, borderRadius: 18, background: 'hsl(var(--card))', border: `1px solid ${micColor}`, boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 3px 12px', color: 'hsl(var(--foreground))', fontSize: '0.85rem', fontWeight: 800 }}>
                <Users size={17} color={micColor} /> الموجودون في الصوت المباشر
                <span style={{ marginInlineStart: 'auto', color: micColor, fontSize: '0.72rem', fontWeight: 700 }}>{members.length}</span>
              </div>
              {members.length === 0 ? (
                <p style={{ margin: 0, padding: '10px 3px', color: 'hsl(var(--muted-foreground))', fontSize: '0.76rem', textAlign: 'center' }}>لا يوجد أحد في المحادثة الآن.</p>
              ) : members.map(member => {
                const isSelf = member.userId === userId;
                const isMemberMuted = mutedUserIds.has(member.userId);
                return (
                  <motion.button
                    key={member.userId}
                    whileTap={isSelf ? undefined : { scale: 0.97 }}
                    onClick={() => { if (!isSelf) setMemberMenuFor(member); }}
                    disabled={isSelf}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 6px',
                      border: 'none', borderRadius: 12, background: 'transparent', cursor: isSelf ? 'default' : 'pointer',
                      textAlign: 'right',
                    }}
                  >
                    <UserAvatar name={member.name ?? member.username ?? 'User'} avatarUrl={member.avatarUrl} size={36} />
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ color: 'hsl(var(--foreground))', fontSize: '0.82rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {member.name ?? member.username ?? 'مستخدم'}
                      </span>
                      {member.username && (
                        <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.68rem' }}>@{member.username}</span>
                      )}
                    </div>
                    {isSelf ? (
                      <span style={{ color: micColor, fontSize: '0.68rem', fontWeight: 700 }}>أنت</span>
                    ) : isMemberMuted ? (
                      <MicOff size={15} color="hsl(var(--destructive))" />
                    ) : (
                      <Mic size={15} color="hsl(var(--primary))" />
                    )}
                  </motion.button>
                );
              })}

              {/* ── الموجودون في بروفايل قصتك — من فتح بروفايلك الآن (بدون ما يكون بالضرورة بالمكالمة) ── */}
              {profileVisitors.length > 0 && (
                <>
                  <div style={{ height: 1, background: 'hsl(var(--border))', margin: '10px 0 8px' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 3px 10px', color: 'hsl(var(--foreground))', fontSize: '0.85rem', fontWeight: 800 }}>
                    <Eye size={16} color="#FACC15" /> الموجودون في بروفايل قصتك
                    <span style={{ marginInlineStart: 'auto', color: '#FACC15', fontSize: '0.72rem', fontWeight: 700 }}>{profileVisitors.length}</span>
                  </div>
                  {profileVisitors.map(visitor => (
                    <div key={visitor.userId} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 6px' }}>
                      <UserAvatar name={visitor.name ?? visitor.username ?? 'User'} avatarUrl={visitor.avatarUrl} size={36} />
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span style={{ color: 'hsl(var(--foreground))', fontSize: '0.82rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {visitor.name ?? visitor.username ?? 'مستخدم'}
                        </span>
                        {visitor.username && (
                          <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.68rem' }}>@{visitor.username}</span>
                        )}
                      </div>
                      <Eye size={14} color="#FACC15" />
                    </div>
                  ))}
                </>
              )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Voice-room member action menu (حذف / حظر / كتم الصوت) — يفتح بمنتصف الشاشة ── */}
      <AnimatePresence>
        {memberMenuFor && (
          <motion.div
            key="globe-voice-member-menu-overlay"
            initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }}
            onClick={() => setMemberMenuFor(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, overflow: 'hidden' }}
          >
            <motion.div
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.15 }}
              style={{ background: 'rgba(6,14,14,0.98)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 14, padding: 8, display: 'flex', flexDirection: 'column', gap: 3, width: '100%', maxWidth: 240, boxShadow: '0 8px 30px rgba(0,0,0,0.6)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px 10px' }}>
                <UserAvatar name={memberMenuFor.name ?? memberMenuFor.username ?? 'User'} avatarUrl={memberMenuFor.avatarUrl} size={30} />
                <span style={{ color: 'hsl(var(--foreground))', fontSize: '0.78rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {memberMenuFor.username ? `@${memberMenuFor.username}` : memberMenuFor.name ?? 'مستخدم'}
                </span>
              </div>
              <div style={{ height: 1, background: 'rgba(239,68,68,0.15)', margin: '0 6px' }} />

              <motion.button whileTap={{ scale: 0.96 }} onClick={() => { const m = memberMenuFor; setMemberMenuFor(null); void toggleMuteMember(m); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'transparent', border: 'none', borderRadius: 9, color: CLR_TEXT, fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', width: '100%', textAlign: 'right', justifyContent: 'flex-end' }}>
                {mutedUserIds.has(memberMenuFor.userId) ? 'إلغاء كتم الصوت' : 'كتم الصوت'}
                {mutedUserIds.has(memberMenuFor.userId) ? <Mic size={16} strokeWidth={2} /> : <MicOff size={16} strokeWidth={2} />}
              </motion.button>
              <div style={{ height: 1, background: 'rgba(239,68,68,0.15)', margin: '0 6px' }} />

              <motion.button whileTap={{ scale: 0.96 }} onClick={() => { setConfirmBlockMember(memberMenuFor); setMemberMenuFor(null); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'transparent', border: 'none', borderRadius: 9, color: '#ef4444', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', width: '100%', textAlign: 'right', justifyContent: 'flex-end' }}>
                حظر
                <ShieldOff size={16} strokeWidth={2} />
              </motion.button>
              <div style={{ height: 1, background: 'rgba(239,68,68,0.15)', margin: '0 6px' }} />

              <motion.button whileTap={{ scale: 0.96 }} onClick={() => { setConfirmDeleteMember(memberMenuFor); setMemberMenuFor(null); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'transparent', border: 'none', borderRadius: 9, color: '#ef4444', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', width: '100%', textAlign: 'right', justifyContent: 'flex-end' }}>
                حذف
                <Trash2 size={16} strokeWidth={2} />
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Confirm delete (remove from my friends list permanently) ── */}
      <AnimatePresence>
        {confirmDeleteMember && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }}
            onClick={() => !memberActionBusy && setConfirmDeleteMember(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, overflow: 'hidden' }}
          >
            <motion.div
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
              style={{ background: 'hsl(var(--card))', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 16, padding: '24px 20px', width: '100%', maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Trash2 size={19} strokeWidth={2} color="#ef4444" />
                </div>
                <p style={{ color: CLR_TEXT, fontSize: '0.88rem', fontWeight: 700, margin: 0 }}>حذف {confirmDeleteMember.username ? `@${confirmDeleteMember.username}` : confirmDeleteMember.name ?? 'المستخدم'}</p>
              </div>
              <p style={{ color: CLR_TEXT_DIM, fontSize: '0.8rem', lineHeight: 1.5, textAlign: 'center', margin: 0 }}>
                سيتم حذفه من قائمة إضافاتك بشكل نهائي. لا يمكن التراجع عن هذا الإجراء.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => setConfirmDeleteMember(null)} disabled={memberActionBusy} style={{ flex: 1, padding: '10px', background: CLR_PRIMARY_FAINT, border: `1px solid ${CLR_PRIMARY_BORDER}`, borderRadius: 10, color: CLR_TEXT, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                  إلغاء
                </motion.button>
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => deleteMemberFromFriends(confirmDeleteMember)} disabled={memberActionBusy} style={{ flex: 1, padding: '10px', background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 10, color: '#ef4444', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {memberActionBusy ? (
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }} style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(239,68,68,0.3)', borderTopColor: '#ef4444' }} />
                  ) : <><Trash2 size={13} strokeWidth={2} /> حذف</>}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Confirm block (full block — they won't find your username until you unblock) ── */}
      <AnimatePresence>
        {confirmBlockMember && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }}
            onClick={() => !memberActionBusy && setConfirmBlockMember(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, overflow: 'hidden' }}
          >
            <motion.div
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
              style={{ background: 'hsl(var(--card))', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 16, padding: '24px 20px', width: '100%', maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <UserAvatar name={confirmBlockMember.name ?? confirmBlockMember.username ?? '?'} avatarUrl={confirmBlockMember.avatarUrl} size={52} />
                <p style={{ color: CLR_TEXT, fontSize: '0.88rem', fontWeight: 700, margin: 0 }}>{confirmBlockMember.name ?? confirmBlockMember.username ?? '—'}</p>
                {confirmBlockMember.username && <p style={{ color: CLR_TEXT_DIM, fontSize: '0.72rem', margin: 0 }}>@{confirmBlockMember.username}</p>}
              </div>
              <p style={{ color: CLR_TEXT_DIM, fontSize: '0.8rem', lineHeight: 1.5, textAlign: 'center', margin: 0 }}>
                هل تريد حظر هذا المستخدم؟ لن يتمكن من إيجاد يوزرك حتى لو بحث عنه، ويُزال من قائمة أصدقائك، إلى أن ترفع الحظر بنفسك.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => setConfirmBlockMember(null)} disabled={memberActionBusy} style={{ flex: 1, padding: '10px', background: CLR_PRIMARY_FAINT, border: `1px solid ${CLR_PRIMARY_BORDER}`, borderRadius: 10, color: CLR_TEXT, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                  إلغاء
                </motion.button>
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => blockMember(confirmBlockMember)} disabled={memberActionBusy} style={{ flex: 1, padding: '10px', background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 10, color: '#ef4444', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {memberActionBusy ? (
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }} style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(239,68,68,0.3)', borderTopColor: '#ef4444' }} />
                  ) : <><ShieldOff size={13} strokeWidth={2} /> حظر</>}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && <span role="status" style={{ position: 'absolute', top: 50, right: 0, width: 260, color: 'hsl(var(--destructive))', fontSize: '0.62rem', lineHeight: 1.5, textAlign: 'right' }}>{error}</span>}
      <style>{`@keyframes globeVoicePulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.07); } } @keyframes globeParticipantDotPulse { 0%,100% { transform: scale(0.85); opacity: 0.55; } 50% { transform: scale(1.55); opacity: 1; } } @keyframes globeVoiceWave { from { transform: scaleY(0.42); opacity: 0.62; } to { transform: scaleY(1); opacity: 1; } } @keyframes storyCommentAlert { 0%,100% { transform: scale(1); box-shadow: 0 0 0 0 hsl(var(--destructive) / 0.5); } 50% { transform: scale(1.015); box-shadow: 0 0 0 6px hsl(var(--destructive) / 0); } }`}</style>
    </div>
  );
}

// ── SharedInboxDrawer — list of posts other users sent me via the share sheet ──
// Redesigned as a big full-screen box: opens on a 2×2 grid of square tiles (Story /
// Repost / Share / Favorites), each with its own icon. Tapping a tile opens that
// section as its own full page with an independent scroll container — so a long
// Favorites list scrolls on its own instead of being crammed under three other
// sections in one shared scroll area (which is what made it feel "stuck").
type SharedInboxSection = 'story' | 'favorites';
function SharedInboxDrawer({
  shares,
  postInteractions,
  loading,
  onClose,
  onOpenShare,
  storyThreads,
  storyThreadsLoading,
  onOpenStoryThread,
  onDeleteStoryThread,
  postThreads,
  postThreadsLoading,
  onOpenPostThread,
  favoritedPosts,
  onOpenFavoritePost,
  userShareInbox = [],
  onOpenUserShare,
  onDeleteUserShare,
  initialSection = 'story',
  storyOnly = false,
  zIndex = 10295,
}: {
  shares: SharedPostItem[];
  postInteractions: PostInteractionItem[];
  loading: boolean;
  onClose: () => void;
  onOpenShare: (share: SharedPostItem) => void;
  storyThreads: StoryCommentThread[];
  storyThreadsLoading: boolean;
  onOpenStoryThread: (thread: StoryCommentThread) => void;
  onDeleteStoryThread?: (thread: StoryCommentThread) => void;
  postThreads: PostCommentThread[];
  postThreadsLoading: boolean;
  onOpenPostThread: (thread: PostCommentThread) => void;
  favoritedPosts: PostItem[];
  onOpenFavoritePost: (post: PostItem) => void;
  userShareInbox?: UserShareInboxItem[];
  onOpenUserShare?: (item: UserShareInboxItem) => void;
  onDeleteUserShare?: (id: string) => void;
  initialSection?: SharedInboxSection;
  storyOnly?: boolean;
  zIndex?: number;
}) {
  const [activeSection, setActiveSection] = useState<SharedInboxSection>(storyOnly ? 'story' : initialSection);
  const formatDate = (value: string) => new Intl.DateTimeFormat('ar-KW', {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value));

  const storyUnread = storyThreads.filter(t => !t.read).length;
  const chatUnread = (userShareInbox || []).filter(t => !t.read).length;
  const tiles: { key: Exclude<SharedInboxSection, 'grid'>; label: string; caption: string; Icon: typeof Camera; count: number; unread: number }[] = [
    { key: 'story', label: 'Story', caption: 'تعليقات على قصتك', Icon: Camera, count: storyThreads.length, unread: storyUnread },
  ];
  const activeTile = tiles.find(t => t.key === activeSection) ?? null;

  const EmptyState = ({ icon, text }: { icon: React.ReactNode; text: string }) => (
    <div className="flex flex-col items-center justify-center gap-3" style={{ paddingTop: 40, paddingBottom: 8 }}>
      <div style={{
        width: 52, height: 52, borderRadius: '50%',
        background: CLR_PRIMARY_FAINT, border: `1px solid ${CLR_PRIMARY_BORDER}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: CLR_PRIMARY_DIM,
      }}>
        {icon}
      </div>
      <p style={{ color: CLR_TEXT_DIM, fontSize: '0.82rem', textAlign: 'center', maxWidth: 220, lineHeight: 1.6 }}>
        {text}
      </p>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
      style={{
        position: 'fixed', inset: 0, zIndex,
        background: PAGE_BG,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '40px 14px 12px',
        borderBottom: `1px solid ${CLR_NAV_BORDER}`,
        background: CLR_HEADER_BG, backdropFilter: 'blur(14px)',
      }}>
        <button onClick={onClose} aria-label="إغلاق" style={{
          background: 'none', border: 'none', color: CLR_TEXT, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4,
        }}>
          <X size={20} strokeWidth={2.2} />
        </button>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          {activeTile && <activeTile.Icon size={16} strokeWidth={2.2} color={CLR_PRIMARY} />}
          <p style={{ color: CLR_TEXT, fontSize: '0.9rem', fontWeight: 700, margin: 0 }}>
            {activeTile?.label}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${CLR_NAV_BORDER}`, background: CLR_HEADER_BG }}>
        {tiles.map(tile => (
          <button
            key={tile.key}
            onClick={() => setActiveSection(tile.key)}
            style={{
              position: 'relative', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '9px 8px', borderRadius: 10, cursor: 'pointer',
              border: `1px solid ${activeSection === tile.key ? CLR_PRIMARY : CLR_CARD_BORDER}`,
              background: activeSection === tile.key ? CLR_PRIMARY_FAINT : CLR_CARD_BG,
              color: activeSection === tile.key ? CLR_PRIMARY : CLR_TEXT_DIM, fontSize: '0.76rem', fontWeight: 700,
            }}
          >
            <tile.Icon size={15} strokeWidth={2} />
            {tile.label}
            {tile.unread > 0 && (
              <span style={{ minWidth: 16, height: 16, borderRadius: 8, padding: '0 4px', background: CLR_PRIMARY, color: '#06171a', fontSize: '0.58rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                {tile.unread}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Story: full page, own scroll ── */}
      {activeSection === 'story' && (
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', padding: '14px 14px 20px' }}>
          {storyThreadsLoading && storyThreads.length === 0 && (
            <p style={{ color: CLR_TEXT_DIM, fontSize: '0.78rem', textAlign: 'center', padding: '24px 0' }}>جارٍ التحميل...</p>
          )}
          {!storyThreadsLoading && storyThreads.length === 0 && (
            <EmptyState icon={<Inbox size={20} strokeWidth={1.5} />} text="لا توجد منشورات مُرسلة إليك من قصتك بعد" />
          )}
          {storyThreads.map(thread => (
            <div key={thread.storyId} style={{ position: 'relative', marginBottom: 10 }}>
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => onOpenStoryThread(thread)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                border: `2px solid ${thread.read ? CLR_POST_BORDER : 'hsl(var(--destructive))'}`,
                background: thread.read ? 'hsl(var(--muted))' : 'hsl(var(--destructive))',
                color: thread.read ? CLR_TEXT : 'hsl(var(--destructive-foreground))',
                borderRadius: 14, padding: 10, cursor: 'pointer', textAlign: 'right',
                animation: thread.read ? 'none' : 'storyCommentAlert 1.1s ease-in-out infinite',
                paddingInlineEnd: 44,
              }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: '#000' }}>
                {thread.mediaType === 'video'
                  ? <video src={thread.mediaUrl} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <img src={thread.mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                }
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: thread.read ? 'hsl(var(--foreground))' : 'hsl(var(--destructive-foreground))', fontSize: '0.8rem', fontWeight: 700, margin: 0 }}>
                    تعليقات على قصتك

                  <span style={{ color: CLR_TEXT_DIM, fontSize: '0.64rem', fontWeight: 500, marginInlineStart: 7 }}>
                    {formatDate(thread.createdAt)}
                  </span>
                </p>
                <p style={{
                  color: thread.read ? CLR_TEXT_DIM : 'hsl(var(--destructive-foreground))', fontSize: '0.74rem', margin: '3px 0 0',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {thread.lastComment ? `${thread.lastComment.authorName}: ${thread.lastComment.text}` : `${thread.commentsCount} تعليق`}
                </p>
              </div>
              {!thread.read && (
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'hsl(var(--destructive-foreground))', flexShrink: 0, boxShadow: '0 0 0 3px hsl(var(--destructive) / 0.35)' }} />
              )}
            </motion.button>
            {onDeleteStoryThread && (
              <button
                onClick={e => { e.stopPropagation(); onDeleteStoryThread(thread); }}
                title="Delete notification"
                style={{
                  position: 'absolute', top: '50%', insetInlineEnd: 10,
                  transform: 'translateY(-50%)',
                  background: 'hsl(var(--destructive) / 0.15)',
                  border: '1px solid hsl(var(--destructive) / 0.35)',
                  borderRadius: 8, width: 30, height: 30,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'hsl(var(--destructive))',
                  zIndex: 2,
                }}
              >
                <Trash2 size={14} strokeWidth={2} />
              </button>
            )}
            </div>
          ))}
          {storyThreads.length > 0 && (
            <p style={{ color: CLR_TEXT_DIM, fontSize: '0.66rem', textAlign: 'center', margin: '10px 0 0', lineHeight: 1.6 }}>
              تختفي التعليقات تلقائياً بعد 24 ساعة من نشر القصة
            </p>
          )}
        </div>
      )}

      {/* ── Repost: comments on your posts — retained for compatibility, not shown in the two-section inbox. ── */}
      {false && (
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', padding: '14px 14px 20px' }}>
          {postThreadsLoading && postThreads.length === 0 && (
            <p style={{ color: CLR_TEXT_DIM, fontSize: '0.78rem', textAlign: 'center', padding: '24px 0' }}>جارٍ التحميل...</p>
          )}
          {!postThreadsLoading && postThreads.length === 0 && (
            <EmptyState icon={<Inbox size={20} strokeWidth={1.5} />} text="لا توجد تعليقات على منشوراتك بعد" />
          )}
          {postThreads.map(thread => {
            const thumbUrl = thread.post.mediaUrls && thread.post.mediaUrls.length > 0 ? thread.post.mediaUrls[0] : thread.post.mediaUrl;
            const thumbType = thread.post.mediaTypes && thread.post.mediaTypes.length > 0 ? thread.post.mediaTypes[0] : thread.post.mediaType;
            return (
              <motion.button
                key={thread.post.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => onOpenPostThread(thread)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  border: `2px solid ${thread.read ? CLR_POST_BORDER : CLR_PRIMARY}`,
                  background: thread.read ? 'hsl(var(--muted))' : CLR_PRIMARY_FAINT,
                  borderRadius: 14, padding: 10, marginBottom: 10, cursor: 'pointer', textAlign: 'right',
                }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: '#000' }}>
                  {thumbType === 'video'
                    ? <video src={thumbUrl ?? ''} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <img src={thumbUrl ?? ''} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: 'hsl(var(--foreground))', fontSize: '0.8rem', fontWeight: 700, margin: 0 }}>
                    تعليقات على منشورك
                    <span style={{ color: CLR_TEXT_DIM, fontSize: '0.64rem', fontWeight: 500, marginInlineStart: 7 }}>
                      {formatDate(thread.post.createdAt)}
                    </span>
                  </p>
                  <p style={{
                    color: CLR_TEXT_DIM, fontSize: '0.74rem', margin: '3px 0 0',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {thread.lastComment ? `${thread.lastComment.authorName}: ${thread.lastComment.text}` : `${thread.commentsCount} تعليق`}
                  </p>
                </div>
                {!thread.read && (
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: CLR_PRIMARY, flexShrink: 0 }} />
                )}
              </motion.button>
            );
          })}
          {postInteractions.filter(item => item.type === 'repost').map(item => (
            <div key={`repost-${item.id}`} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, border: `2px solid ${item.read ? CLR_POST_BORDER : CLR_PRIMARY}`, background: item.read ? 'hsl(var(--muted))' : CLR_PRIMARY_FAINT, borderRadius: 14, padding: 10, marginBottom: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, display: 'grid', placeItems: 'center', flexShrink: 0, background: 'hsl(var(--muted))', color: 'hsl(var(--primary))' }}><Repeat2 size={19} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: 'hsl(var(--foreground))', fontSize: '0.8rem', fontWeight: 700, margin: 0 }}>{item.title}<span style={{ color: CLR_TEXT_DIM, fontSize: '0.64rem', fontWeight: 500, marginInlineStart: 7 }}>{formatDate(item.createdAt)}</span></p>
                <p style={{ color: CLR_TEXT_DIM, fontSize: '0.74rem', margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.body}</p>
              </div>
              {!item.read && <span style={{ width: 9, height: 9, borderRadius: '50%', background: CLR_PRIMARY, flexShrink: 0 }} />}
            </div>
          ))}
          {(postThreads.length > 0 || postInteractions.some(item => item.type === 'repost')) && (
            <p style={{ color: CLR_TEXT_DIM, fontSize: '0.66rem', textAlign: 'center', margin: '10px 0 0', lineHeight: 1.6 }}>
              تختفي التعليقات تلقائياً بعد 24 ساعة من نشر المنشور
            </p>
          )}
        </div>
      )}

      {/* ── Share: retained for compatibility, not shown in the two-section inbox. ── */}
      {false && (
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', padding: '14px 14px 20px' }}>
          {loading && shares.length === 0 && (
            <p style={{ color: CLR_TEXT_DIM, fontSize: '0.78rem', textAlign: 'center', padding: '24px 0' }}>جارٍ التحميل...</p>
          )}
          {!loading && shares.length === 0 && postInteractions.filter(item => item.type === 'share').length === 0 && (
            <EmptyState icon={<Inbox size={20} strokeWidth={1.5} />} text="لا توجد منشورات مُرسلة إليك بعد" />
          )}
          {postInteractions.filter(item => item.type === 'share').map(item => (
            <div key={`share-${item.id}`} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, border: `2px solid ${item.read ? CLR_POST_BORDER : CLR_PRIMARY}`, background: item.read ? 'hsl(var(--muted))' : CLR_PRIMARY_FAINT, borderRadius: 14, padding: 10, marginBottom: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, display: 'grid', placeItems: 'center', flexShrink: 0, background: 'hsl(var(--muted))', color: 'hsl(var(--primary))' }}><Send size={19} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: 'hsl(var(--foreground))', fontSize: '0.8rem', fontWeight: 700, margin: 0 }}>{item.title}<span style={{ color: CLR_TEXT_DIM, fontSize: '0.64rem', fontWeight: 500, marginInlineStart: 7 }}>{formatDate(item.createdAt)}</span></p>
                <p style={{ color: CLR_TEXT_DIM, fontSize: '0.74rem', margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.body}</p>
              </div>
              {!item.read && <span style={{ width: 9, height: 9, borderRadius: '50%', background: CLR_PRIMARY, flexShrink: 0 }} />}
            </div>
          ))}
          {shares.map(share => (
            <motion.button
              key={share.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => onOpenShare(share)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                border: `2px solid ${share.read ? CLR_POST_BORDER : CLR_PRIMARY}`,
                background: share.read ? 'hsl(var(--muted))' : CLR_PRIMARY_FAINT,
                borderRadius: 14, padding: 10, marginBottom: 10, cursor: 'pointer', textAlign: 'right',
              }}
            >
              <UserAvatar name={share.senderName} avatarUrl={share.senderAvatarUrl} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: 'hsl(var(--foreground))', fontSize: '0.8rem', fontWeight: 700, margin: 0 }}>
                  {share.senderName || share.senderUsername || '—'}
                  <span style={{ color: CLR_TEXT_DIM, fontSize: '0.64rem', fontWeight: 500, marginInlineStart: 7 }}>
                    {formatDate(share.createdAt)}
                  </span>
                </p>
                <p style={{
                  color: CLR_TEXT_DIM, fontSize: '0.74rem', margin: '3px 0 0',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {share.post.text || (share.post.mediaType === 'video' ? 'أرسل لك مقطع فيديو' : share.post.mediaType === 'image' ? 'أرسل لك صورة' : 'أرسل لك منشوراً')}
                </p>
              </div>
              {!share.read && (
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: CLR_PRIMARY, flexShrink: 0 }} />
              )}
            </motion.button>
          ))}
        </div>
      )}

      {/* ── Favorites: posts pinned via the ⭐ icon — full page, own scroll (this is the
          section that used to be unreachable once the list above it grew long) ── */}
      {false && activeSection === 'favorites' && (
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', padding: '14px 14px 20px' }}>
          {favoritedPosts.length === 0 && (
            <EmptyState icon={<Bookmark size={20} strokeWidth={1.5} />} text="لا توجد منشورات مفضّلة بعد" />
          )}
          {favoritedPosts.map(post => {
            const media = PostMediaItems(post)[0];
            return (
              <motion.button
                key={post.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => onOpenFavoritePost(post)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  border: `2px solid ${CLR_POST_BORDER}`,
                  background: 'hsl(var(--muted))',
                  borderRadius: 14, padding: 10, marginBottom: 10, cursor: 'pointer', textAlign: 'right',
                }}
              >
                {media ? (
                  <div style={{ width: 40, height: 40, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: '#000' }}>
                    {media.type === 'video'
                      ? <video src={media.url} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <img src={media.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    }
                  </div>
                ) : (
                  <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: CLR_PRIMARY_FAINT, display: 'flex', alignItems: 'center', justifyContent: 'center', color: CLR_PRIMARY }}>
                    <FileText size={17} strokeWidth={2} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: 'hsl(var(--foreground))', fontSize: '0.8rem', fontWeight: 700, margin: 0 }}>
                    {post.authorName || post.authorUsername || '—'}
                    <span style={{ color: CLR_TEXT_DIM, fontSize: '0.64rem', fontWeight: 500, marginInlineStart: 7 }}>
                      {formatDate(post.createdAt)}
                    </span>
                  </p>
                  <p style={{
                    color: CLR_TEXT_DIM, fontSize: '0.74rem', margin: '3px 0 0',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {post.text || (media?.type === 'video' ? 'فيديو' : media ? 'صورة' : '')}
                  </p>
                </div>
                <Bookmark size={15} strokeWidth={2} color={CLR_PRIMARY} fill={CLR_PRIMARY} style={{ flexShrink: 0 }} />
              </motion.button>
            );
          })}
        </div>
      )}

    </motion.div>
  );
}

// ── SharedPostThread — full post + private reply thread with the person who shared it ──
function SharedPostThread({
  share,
  comments,
  commentText,
  commentSending,
  onChangeCommentText,
  onSubmitComment,
  onToggleLike,
  onClose,
}: {
  share: SharedPostItem;
  comments: SharedPostComment[];
  commentText: string;
  commentSending: boolean;
  onChangeCommentText: (v: string) => void;
  onSubmitComment: (parentCommentId?: number | null) => void;
  onToggleLike: (share: SharedPostItem) => void;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [replyingTo, setReplyingTo] = useState<SharedPostComment | null>(null);
  const post = share.post;
  const formatCommentDate = (value: string) => new Intl.DateTimeFormat('ar-KW', {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value));
  const submitWithReply = () => {
    onSubmitComment(replyingTo?.id ?? null);
    setReplyingTo(null);
  };
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 260,
        background: PAGE_BG,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '40px 14px 12px',
        borderBottom: `1px solid ${CLR_NAV_BORDER}`,
        background: CLR_HEADER_BG, backdropFilter: 'blur(14px)',
      }}>
        <button onClick={onClose} aria-label="رجوع" style={{
          background: 'none', border: 'none', color: CLR_TEXT, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4,
        }}>
          <ArrowLeft size={20} strokeWidth={2.2} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: CLR_TEXT, fontSize: '0.86rem', fontWeight: 700, margin: 0 }}>منشور مُرسل</p>
          <p style={{ color: CLR_TEXT_DIM, fontSize: '0.68rem', margin: 0 }}>مع {share.senderName || share.senderUsername || '—'}</p>
        </div>
      </div>
      {/* Scrollable content: the post itself + the private thread with the sender */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div style={{
          border: `2px solid ${CLR_POST_BORDER}`,
          background: 'hsl(var(--muted))',
          borderRadius: 16,
          padding: 12,
          margin: '14px 14px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <UserAvatar name={post.authorName} avatarUrl={post.authorAvatarUrl} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: 'hsl(var(--foreground))', fontSize: '0.84rem', fontWeight: 700, margin: 0 }}>
                {post.authorName || post.authorUsername || '—'}
              </p>
              {post.authorUsername && <p style={{ color: 'hsl(var(--foreground))', fontSize: '0.68rem', margin: 0 }}>@{post.authorUsername}</p>}
            </div>
          </div>

          {post.text && (
            <div style={{ background: 'transparent', border: 'none', borderRadius: 0, padding: '12px 14px' }}>
              <PostText text={post.text} color="hsl(var(--primary))" textColor={CLR_TEXT_DIM} embedMediaLinks />
            </div>
          )}

          {PostMediaItems(post).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignSelf: 'flex-start' }}>
              {PostMediaItems(post).map((media, index) => (
                media.type === 'video' ? (
                  // Video plays right here, inline, as soon as the page opens — no extra tap needed,
                  // and the comments thread sits directly below it.
                  (<video
                    key={`${media.type}-${index}`}
                    src={media.url}
                    controls
                    autoPlay
                    playsInline
                    style={{
                      width: '100%', maxHeight: '60dvh', borderRadius: 10,
                      border: `1px solid ${CLR_POST_BORDER}`, background: '#000', display: 'block',
                    }}
                  />)
                ) : (
                  <motion.button key={`${media.type}-${index}`} whileTap={{ scale: 0.97 }} onClick={() => setExpanded(true)} aria-label="تكبير الوسائط" style={{
                    position: 'relative', width: 160, height: 160, borderRadius: 10, overflow: 'hidden',
                    border: `1px solid ${CLR_POST_BORDER}`, padding: 0, background: '#000', cursor: 'pointer', display: 'block',
                  }}>
                    <img src={media.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Eye size={20} strokeWidth={2} color="#fff" />
                    </div>
                  </motion.button>
                )
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 22, paddingTop: 2 }}>
            <motion.button whileTap={{ scale: 0.88 }} onClick={() => onToggleLike(share)} style={{
              display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer',
              color: post.likedByMe ? '#ef4444' : CLR_TEXT_DIM,
            }}>
              <Heart size={16} strokeWidth={2} fill={post.likedByMe ? '#ef4444' : 'none'} />
              <span style={{ fontSize: '0.7rem', fontWeight: 600 }}>{post.likesCount > 0 ? post.likesCount : ''}</span>
            </motion.button>
          </div>
        </div>

        {/* Private reply thread — only between me and the sender */}
        <div style={{ padding: '10px 14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ color: CLR_TEXT_DIM, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '4px 0' }}>
            المحادثة مع {share.senderName || share.senderUsername || '—'} {comments.length > 0 ? `(${comments.length})` : ''}
          </p>
          {comments.length === 0 && (
            <p style={{ color: CLR_TEXT_DIM, fontSize: '0.78rem', textAlign: 'center', padding: '24px 0' }}>
              لا توجد ردود بعد — علّق على المنشور المُرسل إليك
            </p>
          )}
          {comments.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 8, marginLeft: c.parentCommentId ? 22 : 0 }}>
              <UserAvatar name={c.authorName} avatarUrl={c.authorAvatarUrl} size={30} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: CLR_TEXT, fontSize: '0.76rem', fontWeight: 700, margin: 0 }}>{c.authorName}</p>
                <p style={{ color: CLR_TEXT, fontSize: '0.8rem', margin: '2px 0 0', lineHeight: 1.5, wordBreak: 'break-word' }}>{c.text}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                  <time dateTime={c.createdAt} style={{ color: CLR_TEXT_DIM, fontSize: '0.62rem' }}>{formatCommentDate(c.createdAt)}</time>
                  <button onClick={() => setReplyingTo(c)} style={{ background: 'none', border: 'none', padding: 0, color: CLR_PRIMARY, cursor: 'pointer', fontSize: '0.66rem', fontWeight: 700 }}>رد</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Comment composer — fixed at bottom */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px calc(10px + env(safe-area-inset-bottom))',
        borderTop: `1px solid ${CLR_NAV_BORDER}`,
        background: CLR_HEADER_BG, backdropFilter: 'blur(14px)',
        position: 'relative',
      }}>
        {replyingTo && (
          <div style={{ position: 'absolute', bottom: 58, left: 14, right: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 10, background: CLR_INPUT_BG, border: `1px solid ${CLR_PRIMARY_BORDER}` }}>
            <span style={{ color: CLR_TEXT_DIM, fontSize: '0.68rem' }}>رد على {replyingTo.authorName}</span>
            <button onClick={() => setReplyingTo(null)} aria-label="إلغاء الرد" style={{ background: 'none', border: 'none', color: CLR_TEXT_DIM, cursor: 'pointer', padding: 0 }}><X size={14} /></button>
          </div>
        )}
        <input
          value={commentText}
          onChange={e => onChangeCommentText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !commentSending) submitWithReply(); }}
          placeholder="اكتب ردّاً..."
          style={{
            flex: 1, background: CLR_INPUT_BG, border: `1px solid ${CLR_PRIMARY_BORDER}`,
            borderRadius: 20, padding: '10px 14px', color: CLR_TEXT, fontSize: '0.82rem', outline: 'none',
          }}
        />
        <motion.button
          whileTap={{ scale: 0.9 }}
          disabled={commentSending || !commentText.trim()}
          onClick={submitWithReply}
          style={{
            width: 38, height: 38, borderRadius: '50%',
            background: commentText.trim() ? CLR_PRIMARY : CLR_PRIMARY_FAINT,
            border: 'none', color: commentText.trim() ? '#06171a' : CLR_TEXT_DIM,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <Send size={15} strokeWidth={2.4} />
        </motion.button>
      </div>
      {/* Fullscreen lightbox for this page's media */}
      <AnimatePresence>
        {expanded && post.mediaUrl && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }}
            onClick={() => setExpanded(false)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
              zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
            }}
          >
            <motion.button
              onClick={() => setExpanded(false)}
              whileTap={{ scale: 0.88 }}
              aria-label="إغلاق"
              style={{
                position: 'absolute', top: 20, right: 20, width: 38, height: 38, borderRadius: '50%',
                background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
              }}
            >
              <X size={20} strokeWidth={2.4} />
            </motion.button>
            <motion.div
              onClick={e => e.stopPropagation()}
              initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              style={{ maxWidth: '100%', maxHeight: '100%' }}
            >
              {post.mediaType === 'video' ? (
                <video src={post.mediaUrl} controls autoPlay style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: 8 }} />
              ) : (
                <img src={post.mediaUrl} alt="" style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: 8, display: 'block' }} />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── StoryCommentThreadPage — comments left by friends on one of my stories ────
function StoryCommentThreadPage({
  thread,
  comments,
  commentText,
  commentSending,
  onChangeCommentText,
  onSubmitComment,
  onToggleLike,
  onClose,
  onChatWithAuthor,
}: {
  thread: StoryCommentThread;
  comments: StoryComment[];
  commentText: string;
  commentSending: boolean;
  onChangeCommentText: (v: string) => void;
  onSubmitComment: (parentCommentId?: number | null) => void;
  onToggleLike: (comment: StoryComment) => void;
  onClose: () => void;
  /** فتح الشات الخاص مع صاحب التعليق للرد والدردشة */
  onChatWithAuthor?: (comment: StoryComment) => void;
}) {
  const [replyingTo, setReplyingTo] = useState<StoryComment | null>(null);
  const formatCommentDate = (value: string) => new Intl.DateTimeFormat('ar-KW', {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value));
  const expiresLabel = formatCommentDate(thread.expiresAt);
  const submitWithReply = () => {
    onSubmitComment(replyingTo?.id ?? null);
    setReplyingTo(null);
  };
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 260,
        background: PAGE_BG,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '40px 14px 12px',
        borderBottom: `1px solid ${CLR_NAV_BORDER}`,
        background: CLR_HEADER_BG, backdropFilter: 'blur(14px)',
      }}>
        <button onClick={onClose} aria-label="رجوع" style={{
          background: 'none', border: 'none', color: CLR_TEXT, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4,
        }}>
          <ArrowLeft size={20} strokeWidth={2.2} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: CLR_TEXT, fontSize: '0.86rem', fontWeight: 700, margin: 0 }}>تعليقات على قصتك</p>
          <p style={{ color: CLR_TEXT_DIM, fontSize: '0.66rem', margin: '2px 0 0' }}>تختفي هذه المحادثة في {expiresLabel}</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
        {/* Story preview */}
        <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ position: 'relative', alignSelf: 'flex-start', width: 130, height: 130, borderRadius: 10, overflow: 'hidden', border: `1px solid ${CLR_POST_BORDER}`, background: '#000' }}>
            {thread.mediaType === 'video' ? (
              <video src={thread.mediaUrl} muted controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <img src={thread.mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
          </div>
        </div>

        {/* Comments */}
        <div style={{ padding: '0 14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ color: CLR_TEXT_DIM, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '4px 0' }}>
            التعليقات {comments.length > 0 ? `(${comments.length})` : ''}
          </p>
          {comments.length === 0 && (
            <p style={{ color: CLR_TEXT_DIM, fontSize: '0.78rem', textAlign: 'center', padding: '24px 0' }}>
              لا توجد تعليقات بعد
            </p>
          )}
          {comments.map(c => (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => onChatWithAuthor?.(c)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChatWithAuthor?.(c); } }}
              style={{
                display: 'flex', gap: 8, marginLeft: c.parentCommentId ? 22 : 0,
                cursor: onChatWithAuthor ? 'pointer' : 'default',
                borderRadius: 12, padding: '6px 4px',
                transition: 'background 0.15s',
              }}
            >
              <UserAvatar name={c.authorName} avatarUrl={c.authorAvatarUrl} size={30} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: CLR_TEXT, fontSize: '0.76rem', fontWeight: 700, margin: 0 }}>{c.authorName}</p>
                <p style={{ color: CLR_TEXT, fontSize: '0.8rem', margin: '2px 0 0', lineHeight: 1.5, wordBreak: 'break-word' }}>{c.text}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 }} onClick={e => e.stopPropagation()}>
                  <time dateTime={c.createdAt} style={{ color: CLR_TEXT_DIM, fontSize: '0.62rem' }}>{formatCommentDate(c.createdAt)}</time>
                  <button onClick={() => setReplyingTo(c)} style={{ background: 'none', border: 'none', padding: 0, color: CLR_PRIMARY, cursor: 'pointer', fontSize: '0.66rem', fontWeight: 700 }}>رد</button>
                  <motion.button whileTap={{ scale: 0.88 }} onClick={() => onToggleLike(c)} style={{
                    display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    color: c.likedByMe ? '#ef4444' : CLR_TEXT_DIM,
                  }}>
                    <Heart size={12} strokeWidth={2} fill={c.likedByMe ? '#ef4444' : 'none'} />
                    <span style={{ fontSize: '0.62rem', fontWeight: 600 }}>{c.likesCount > 0 ? c.likesCount : ''}</span>
                  </motion.button>
                  {onChatWithAuthor && (
                    <button
                      type="button"
                      onClick={() => onChatWithAuthor(c)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: 'none', border: 'none', padding: 0,
                        color: CLR_PRIMARY, cursor: 'pointer', fontSize: '0.66rem', fontWeight: 700,
                      }}
                    >
                      <MessageCircle size={12} strokeWidth={2.2} />
                      شات
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Comment composer — fixed at bottom */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px calc(10px + env(safe-area-inset-bottom))',
        borderTop: `1px solid ${CLR_NAV_BORDER}`,
        background: CLR_HEADER_BG, backdropFilter: 'blur(14px)',
        position: 'relative',
      }}>
        {replyingTo && (
          <div style={{ position: 'absolute', bottom: 58, left: 14, right: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 10, background: CLR_INPUT_BG, border: `1px solid ${CLR_PRIMARY_BORDER}` }}>
            <span style={{ color: CLR_TEXT_DIM, fontSize: '0.68rem' }}>رد على {replyingTo.authorName}</span>
            <button onClick={() => setReplyingTo(null)} aria-label="إلغاء الرد" style={{ background: 'none', border: 'none', color: CLR_TEXT_DIM, cursor: 'pointer', padding: 0 }}><X size={14} /></button>
          </div>
        )}
        <input
          value={commentText}
          onChange={e => onChangeCommentText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !commentSending) submitWithReply(); }}
          placeholder="اكتب ردّاً..."
          style={{
            flex: 1, background: CLR_INPUT_BG, border: `1px solid ${CLR_PRIMARY_BORDER}`,
            borderRadius: 20, padding: '10px 14px', color: CLR_TEXT, fontSize: '0.82rem', outline: 'none',
          }}
        />
        <motion.button
          whileTap={{ scale: 0.9 }}
          disabled={commentSending || !commentText.trim()}
          onClick={submitWithReply}
          style={{
            width: 38, height: 38, borderRadius: '50%',
            background: commentText.trim() ? CLR_PRIMARY : CLR_PRIMARY_FAINT,
            border: 'none', color: commentText.trim() ? '#06171a' : CLR_TEXT_DIM,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <Send size={15} strokeWidth={2.4} />
        </motion.button>
      </div>
    </motion.div>
  );
}

export default function AddFriendPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isPending } = useSession();
  // Keeps the latest user/companies values reachable from event listeners that are
  // attached once on mount, so those listeners never act on a stale (pre-login-load) user.
  const latestUserRef = useRef(user);
  useEffect(() => { latestUserRef.current = user; }, [user]);
  const latestCompaniesRef = useRef<CompanyAccount[]>([]);
  const { startCall } = useGlobalCall();
  const tick = useAutoRefresh();
  const { guard: guestGuard, GuestModal } = useGuestGuard(user);

  // ── Music player — driven by the module-level musicPlayerStore (outside the React
  // tree) instead of local state, so the song keeps playing across navigation even
  // after this page unmounts. See musicPlayerStore above for details. ──
  const [musicModalOpen, setMusicModalOpen] = useState(false);
  // ── Top hamburger menu — sits at the very top of the page above everything else.
  // Groups the Music and Posts-box (shared inbox) features into one small menu, so
  // they're tucked away instead of taking up their own row of icons. ──
  // قائمة الثلاث خطوط أُزيلت بالكامل — الموسيقى في الإعدادات فقط
  const musicSnapshot = useSyncExternalStore(musicPlayerStore.subscribe, musicPlayerStore.getSnapshot);
  const musicCurrentTrack = musicSnapshot.currentTrack;
  const musicIsPlaying = musicSnapshot.isPlaying;
  const [musicFavorites, setMusicFavorites] = useState<MusicTrack[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem('stooorna_music_favorites');
      return raw ? (JSON.parse(raw) as MusicTrack[]) : [];
    } catch { return []; }
  });
  const handleMusicPlayTrack = useCallback((track: MusicTrack) => {
    musicPlayerStore.playTrack(track);
  }, []);
  const handleMusicToggleFavorite = useCallback((track: MusicTrack) => {
    setMusicFavorites((prev) => {
      const exists = prev.some((f) => f.id === track.id);
      const next = exists ? prev.filter((f) => f.id !== track.id) : [track, ...prev];
      try { window.localStorage.setItem('stooorna_music_favorites', JSON.stringify(next)); } catch { /* storage optional */ }
      return next;
    });
  }, []);
  useEffect(() => {
    musicPlayerStore.setupMediaSessionHandlers();
  }, []);

  // ── Pinned profile track — set from the "Get" button inside the music search modal.
  // Shown above my name/username here, and above my avatar on the profile anyone else
  // sees when they visit me (see FriendStoryProfile). Kept in localStorage so it survives
  // a refresh immediately, and best-effort synced to the backend the same way
  // followersVisible is above — until /api/users/me and /api/users/by-username/:username
  // actually store/return these columns, the pin still works for me on this device but
  // other visitors won't see it yet. ──
  const [pinnedTrack, setPinnedTrack] = useState<MusicTrack | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem('stooorna_pinned_track');
      return raw ? (JSON.parse(raw) as MusicTrack) : null;
    } catch { return null; }
  });
  const handlePinTrack = useCallback((track: MusicTrack) => {
    setPinnedTrack(track);
    try { window.localStorage.setItem('stooorna_pinned_track', JSON.stringify(track)); } catch { /* storage optional */ }
    void fetch('/api/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        pinnedTrackId: track.id,
        pinnedTrackTitle: track.title,
        pinnedTrackArtist: track.artist,
        pinnedTrackArtwork: track.artwork,
        pinnedTrackPreviewUrl: track.previewUrl,
      }),
    }).catch(() => { /* best-effort — the local pin above still governs this device */ });
  }, []);
  const handleUnpinTrack = useCallback(() => {
    setPinnedTrack(null);
    try { window.localStorage.removeItem('stooorna_pinned_track'); } catch { /* storage optional */ }
    void fetch('/api/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        pinnedTrackId: null, pinnedTrackTitle: null, pinnedTrackArtist: null,
        pinnedTrackArtwork: null, pinnedTrackPreviewUrl: null,
      }),
    }).catch(() => { /* best-effort */ });
  }, []);

  // ── Who's currently viewing MY profile — only ever appears to me when someone's actually there ──
  const profileVisitors = useProfileVisitors(user?.id ?? null);

  // ── My own username + bio, shown under the story circle on the profile header ──
  const myUsername = (user as any)?.username ?? null;
  const [myBio, setMyBio] = useState<string | null>(null);
  useEffect(() => {
    if (!myUsername) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/users/by-username/${encodeURIComponent(myUsername)}`, { credentials: 'include' });
        if (!r.ok || cancelled) return;
        const d = await r.json() as MiniProfileData;
        if (cancelled) return;
        setMyBio(d.bio ?? null);
        // Only hydrate from the backend if nothing is pinned locally yet — avoids
        // clobbering a pin/unpin the user just made on this device before this fetch resolved.
        setPinnedTrack(prev => (prev ? prev : pinnedTrackFromProfile(d)));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [myUsername]);

  // ── Stories state ────────────────────────────────────────────────────────────
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([]);
  const [viewerGroupIdx, setViewerGroupIdx] = useState<number | null>(null);
  const [storyUploading, setStoryUploading] = useState(false);
  const storyFileRef = useRef<HTMLInputElement>(null);
  // ref for adding extra media from inside the viewer
  const storyAddFileRef = useRef<HTMLInputElement>(null);
  // اختيار صورة/فيديو للستوري: مربّعان فقط بدون خيار "ملفات" ثالث —
  // نحدّد نوع الملف المسموح على الـ input قبل فتحه بدل قبول النوعين معاً.
  const [storyPickerOpen, setStoryPickerOpen] = useState<null | 'main' | 'add'>(null);
  // 4-option menu opened from the "+" badge on my story avatar: نشر إعلان للقصة / نشر صورة / نشر فيديو / نشر إعلان للقصة عبر الكاميرا
  const [publishMenuOpen, setPublishMenuOpen] = useState(false);
  // فتح الكاميرا المدمجة لالتقاط ونشر القصة مباشرة
  const [cameraCaptureOpen, setCameraCaptureOpen] = useState(false);
  // إخفاء الشريط السفلي أثناء الكاميرا
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('stooorna:story-camera-state', { detail: { open: cameraCaptureOpen } }));
    return () => {
      window.dispatchEvent(new CustomEvent('stooorna:story-camera-state', { detail: { open: false } }));
    };
  }, [cameraCaptureOpen]);
  const openStoryPicker = useCallback((kind: 'image' | 'video', target: 'main' | 'add') => {
    const ref = target === 'main' ? storyFileRef : storyAddFileRef;
    const input = ref.current;
    if (!input) {
      setQuickPublishError('تعذّر فتح مكتبة الوسائط. أعد المحاولة.');
      return;
    }

    input.accept = kind === 'image' ? 'image/*' : 'video/*';
    setStoryPickerOpen(null);
    requestAnimationFrame(() => input.click());
  }, []);

  useEffect(() => {
    const openStoryCamera = () => {
      setPublishMenuOpen(false);
      setStoryPickerOpen(null);
      setCameraCaptureOpen(true);
    };
    window.addEventListener('stooorna:open-story-camera', openStoryCamera);
    return () => window.removeEventListener('stooorna:open-story-camera', openStoryCamera);
  }, []);

  // Fetch stories
  const knownStoryItemIdsRef = useRef<Set<number> | null>(null);
  // ── معرّفات الستوريات المحذوفة محلياً: الريفرش التلقائي كل ثانيتين قد يكون
  // طلبه بدأ قبل اكتمال طلب الحذف على السيرفر (race condition)، فيرجع بنسخة
  // قديمة تتضمّن العنصر المحذوف ويُعيد ظهوره فوراً بعد اختفائه. نحتفظ بقائمة
  // المعرّفات المحذوفة ونستبعدها من أي نتيجة fetch لاحقة حتى لو رجعت متأخرة. ──
  const deletedStoryIdsRef = useRef<Set<number>>(new Set());
  const fetchStories = useCallback(async () => {
    try {
      const r = await fetch('/api/status', { credentials: 'include' });
      if (!r.ok) return;
      const data = await r.json() as { statuses: StoryGroup[]; myId: string };
      // الأحدث أولاً: أي ستوري جديدة تُعتبر "الأولى للمشاهدة" وتُدفع القديمة
      // بعدها — بدل ترتيب السيرفر الافتراضي (الأقدم أولاً) اللي كان يخلي أول
      // فيديو يُعرض عند فتح الستوري هو الأقدم بدل اللي نزل للتو.
      const fresh = (data.statuses ?? [])
        .map(g => ({
          ...g,
          items: [...g.items]
            .filter(it => !deletedStoryIdsRef.current.has(it.id))
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        }))
        .filter(g => g.items.length > 0);
      // نغمة إشعار عند نشر ستوري جديدة — فقط لو كانت من مستخدم آخر غير صاحب
      // الجهاز؛ نستثني مجموعة صاحب النشر نفسه بالكامل (data.myId) حتى ما تُشغَّل
      // له النغمة عن ستوريه اللي هو نشرها للتو (uploadStory يستدعي fetchStories أيضاً).
      if (knownStoryItemIdsRef.current) {
        const hasNewFromOthers = fresh.some(g =>
          g.userId !== data.myId && g.items.some(it => !knownStoryItemIdsRef.current!.has(it.id))
        );
        if (hasNewFromOthers) playNewPostSound();
      }
      knownStoryItemIdsRef.current = new Set(fresh.flatMap(g => g.items.map(it => it.id)));
      setStoryGroups(fresh);
    } catch {/* silent */}
  }, []);

  useEffect(() => { fetchStories(); }, [fetchStories]);
  useEffect(() => {
    const onPub = () => { void fetchStories(); };
    window.addEventListener('stooorna:story-published', onPub);
    return () => window.removeEventListener('stooorna:story-published', onPub);
  }, [fetchStories]);

  // ── ريفرش تلقائي للقصص/الستوريات كل ثانيتين ─────────────────────────────────
  // مؤقّت مستقل تماماً عن useAutoRefresh (tick) المستخدم في بقية الصفحة، حتى لا
  // يتأثر المايك أو أي منطق آخر مرتبط بالمحادثات والمكالمات بهذا التحديث.
  // نتجنّب التحديث وقت جلب/رفع ستوري جديد لتفادي تعارض عرضي بسيط، وعند إخفاء
  // التبويب لتوفير الطلبات؛ ومشاهدة الستوري نفسها لا تتأثر إطلاقاً لأن
  // StoryViewer يعيد تموضعه بالمعرّف (id) لا بالفهرس، فتحديث القائمة في الخلفية
  // لا يقاطع التقدّم الزمني ولا يقفل الستوري المفتوحة طالما ما زالت موجودة.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.hidden || storyUploading) return;
      fetchStories();
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchStories, storyUploading]);

  // Upload a story
  async function uploadStory(file: File) {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      setQuickPublishError('Please choose an image or video for your story.');
      return;
    }

    setQuickPublishError('');
    setStoryUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? (file.type.startsWith('video/') ? 'mp4' : 'jpg');
      let response: Response | null = null;
      // 1) raw body (legacy)
      try {
        response = await fetch('/api/status', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Ext': `.${ext}` },
          body: file,
        });
      } catch { response = null; }
      // 2) FormData media/file
      if (!response || !response.ok) {
        const fd = new FormData();
        fd.append('media', file, file.name);
        fd.append('file', file, file.name);
        fd.append('type', file.type.startsWith('video/') ? 'video' : 'image');
        try {
          response = await fetch('/api/status', { method: 'POST', credentials: 'include', body: fd });
        } catch { response = null; }
      }
      if (!response || !response.ok) {
        throw new Error('Story upload failed');
      }
      await fetchStories();
    } catch {
      setQuickPublishError('Unable to publish this story. Please try a different image or video.');
    } finally {
      setStoryUploading(false);
    }
  }

  // Mark story as seen
  async function markStorySeen(storyId: number) {
    try {
      await fetch(`/api/status/view`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusId: storyId }),
      });
      setStoryGroups(prev => prev.map(g => ({
        ...g,
        items: g.items.map(it => it.id === storyId ? { ...it, seen: true } : it),
      })));
    } catch {/* silent */}
  }
  // ── Posts (feed) state ──────────────────────────────────────────────────────
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [viewsTick, setViewsTick] = useState(0);
  useEffect(() => {
    const onV = () => setViewsTick(x => x + 1);
    window.addEventListener('stooorna:post-views', onV);
    return () => window.removeEventListener('stooorna:post-views', onV);
  }, []);
  const [favoritedPosts, setFavoritedPosts] = useState<PostItem[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem('stooorna_favorite_posts');
      return raw ? (JSON.parse(raw) as PostItem[]) : [];
    } catch { return []; }
  });
  const isPostFavorited = useCallback((postId: number) => favoritedPosts.some(item => item.id === postId), [favoritedPosts]);
  const handleToggleFavoritePost = useCallback((post: PostItem) => {
    if (guestGuard()) return;
    setFavoritedPosts(current => {
      const isSaved = current.some(item => item.id === post.id);
      const next = isSaved
        ? current.filter(item => item.id !== post.id)
        : [{ ...post }, ...current];
      try { window.localStorage.setItem('stooorna_favorite_posts', JSON.stringify(next)); } catch { /* storage optional */ }
      return next;
    });
  }, []);
  // ── Download a post — media posts save each image/video file; text-only posts
  // save a .txt file of the post text. Falls back to opening the media in a new
  // tab if the fetch/blob download is blocked (e.g. cross-origin restrictions). ──
  const handleDownloadPost = useCallback(async (post: PostItem) => {
    const mediaItems = PostMediaItems(post);
    const triggerBlobDownload = (blobUrl: string, filename: string) => {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    };
    try {
      if (mediaItems.length > 0) {
        for (let i = 0; i < mediaItems.length; i++) {
          const media = mediaItems[i];
          const response = await fetch(media.url);
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          const ext = media.type === 'video' ? 'mp4' : 'jpg';
          triggerBlobDownload(blobUrl, `stooorna-post-${post.id}${mediaItems.length > 1 ? `-${i + 1}` : ''}.${ext}`);
        }
      } else if (post.text) {
        const blob = new Blob([post.text], { type: 'text/plain;charset=utf-8' });
        const blobUrl = URL.createObjectURL(blob);
        triggerBlobDownload(blobUrl, `stooorna-post-${post.id}.txt`);
      }
    } catch {
      if (mediaItems[0]) window.open(mediaItems[0].url, '_blank');
    }
  }, []);
  const [showComposer, setShowComposer] = useState(false);
  const [businessAdsOpen, setBusinessAdsOpen] = useState(false);
  const [businessAdTitle, setBusinessAdTitle] = useState('');
  const [businessAdBody, setBusinessAdBody] = useState('');
  const [businessAdMedia, setBusinessAdMedia] = useState<{ name: string; dataUrl: string; type: 'image' | 'video' | 'pdf'; mime: string } | null>(null);
  const [composerBizHint, setComposerBizHint] = useState(false);
  const [myAdsHubOpen, setMyAdsHubOpen] = useState(false);
  const [myAdsHubTab, setMyAdsHubTab] = useState<'video' | 'photo' | 'pdf'>('video');
  const [feedAdViewer, setFeedAdViewer] = useState<any | null>(null);
  const [feedAdsTick, setFeedAdsTick] = useState(0);
  const [adPublishing, setAdPublishing] = useState(false);
  const [adPublishProgress, setAdPublishProgress] = useState(0);
  const [adClockTick, setAdClockTick] = useState(0);
  const [adDetailOpen, setAdDetailOpen] = useState<any | null>(null);
  useEffect(() => {
    const onAds = () => setFeedAdsTick(x => x + 1);
    window.addEventListener('stooorna:feed-ads', onAds);
    return () => window.removeEventListener('stooorna:feed-ads', onAds);
  }, []);
  // Countdown + auto republish cycle (24h live → 4h wait → auto Publish)
  useEffect(() => {
    const tick = () => {
      setAdClockTick(x => x + 1);
      try {
        const { list, changed } = processAdAutoRepublish(loadFeedAdsMeta(), Date.now());
        if (changed) {
          saveFeedAdsMeta(list);
          setFeedAdsTick(x => x + 1);
        }
      } catch { /* */ }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  // Restore media blobs from IndexedDB so video/image survive refresh
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = loadFeedAdsMeta();
        let changed = false;
        const next = [];
        for (const a of list) {
          if ((a.mediaUrl || a.pdfUrl) || !a.id) { next.push(a); continue; }
          const m = await stooornaAdMediaGet(String(a.id));
          if (m) {
            changed = true;
            next.push({
              ...a,
              mediaUrl: m,
              pdfUrl: a.mediaType === 'pdf' ? m : a.pdfUrl,
            });
          } else next.push(a);
        }
        if (!cancelled && changed) {
          try { (window as any).__stooornaFeedAds = next; } catch { /* */ }
          setFeedAdsTick(x => x + 1);
        }
      } catch { /* */ }
    })();
    return () => { cancelled = true; };
  }, [feedAdsTick === 0]);
  const isBusinessUser = !!(user?.id && (() => { try { const raw = localStorage.getItem('stooorna_business_registry'); const list = raw ? JSON.parse(raw) : []; return Array.isArray(list) && list.some((x: any) => String(x.userId) === String(user.id) && x.status === 'approved'); } catch { return false; } })());
  // وضع النشر: اختيار فقط (لا يفتح المعرض) — Text | Photo | Video
  const [composerDestination, setComposerDestination] = useState<'text' | 'photos' | 'videos'>('text');
  const [composerText, setComposerText] = useState('');
  // ── Product ad composer fields (title bold + details + price + dynamic + boxes) ──
  const [composerProductTitle, setComposerProductTitle] = useState('');
  const [composerProductDetails, setComposerProductDetails] = useState('');
  const [composerProductPrice, setComposerProductPrice] = useState('');
  const [composerProductExtras, setComposerProductExtras] = useState<string[]>([]);
  const [composerMediaFiles, setComposerMediaFiles] = useState<{ file: File; type: 'image' | 'video' | 'pdf'; preview: string }[]>([]);
  // الحد الأقصى لعدد الصور التي يمكن إرفاقها بالمنشور الواحد (تُعرض بعدها كمعرض قابل للتصفح يمين/يسار)
  const MAX_COMPOSER_IMAGES = 10;
  const [composerPosting, setComposerPosting] = useState(false);
  const [composerError, setComposerError] = useState('');
  // setters used in clearPostMedia — values not read directly
  const [, setComposerAwaitingMedia] = useState(false);
  // composerLinkStep: يتحكم بإظهار/إخفاء مستطيل «رابط صورة أو فيديو» داخل صفحة كتابة البوست
  const [composerLinkStep, setComposerLinkStep] = useState(false);
  const [composerLinkInput, setComposerLinkInput] = useState('');
  const [composerLinkShortening, setComposerLinkShortening] = useState(false);
  // ── روابط X داخل مربع الكتابة (العنوان + التفاصيل + الحقول الإضافية) ──
  // بمجرد لصق/كتابة الرابط تظهر الصورة أو الفيديو كاملة أسفل المربع (مستخدم + شركة — نفس الـ composer).
  // debounce قصير حتى لا نجلب أثناء كتابة رقم التغريدة. الرابط يبقى داخل النص كما هو.
  const [composerXText, setComposerXText] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => {
      setComposerXText([composerProductTitle, composerProductDetails, ...composerProductExtras].join('\n'));
    }, 250);
    return () => window.clearTimeout(t);
  }, [composerProductTitle, composerProductDetails, composerProductExtras]);
  // ── مستطيل «Paste»: الرابط المُلصق (composerLinkInput) يُعرض كاملًا فورًا مع النص ──
  const [composerLinkPreviewUrl, setComposerLinkPreviewUrl] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setComposerLinkPreviewUrl(composerLinkInput.trim()), 250);
    return () => window.clearTimeout(t);
  }, [composerLinkInput]);
  // روابط الوسائط داخل النص نفسه (بدون تكرار ما في المستطيل)
  const composerXUrls = useMemo(() => {
    const own = composerLinkPreviewUrl ? extractLinkMediaUrls(composerLinkPreviewUrl) : [];
    return extractLinkMediaUrls(composerXText).filter(u => !own.includes(u)).slice(0, 4);
  }, [composerXText, composerLinkPreviewUrl]);
  /** زر Paste: يقرأ الحافظة وينزّل الرابط مباشرة في المستطيل */
  async function pasteLinkFromClipboard() {
    setComposerError('');
    try {
      const clip = await navigator.clipboard.readText();
      const link = pickLinkFromText(clip);
      if (!link) {
        setComposerError(clip?.trim() ? 'الحافظة لا تحتوي رابطًا صالحًا' : 'الحافظة فارغة');
        return;
      }
      setComposerLinkInput(link);
      setComposerLinkPreviewUrl(link);
    } catch {
      setComposerError('تعذر القراءة من الحافظة — اضغط مطولًا داخل المستطيل والصق الرابط');
    }
  }
  const [openComments, setOpenComments] = useState<PostItem | null>(null);
  // Only the "Post" tab (text posts) opens PostDetailPage with a slide-in-from-the-side
  // animation; Video/Photo grid thumbnails keep the original fade/scale-in behavior.
  const [postDetailEnterSide, setPostDetailEnterSide] = useState(false);
  function openTextPostDetail(post: PostItem) { setPostDetailEnterSide(true); loadComments(post); }
  function openMediaPostDetail(post: PostItem) {
    setPostDetailEnterSide(false);
    loadComments(post);
  }

  function closePostDetail() {
    setOpenComments(null);
  }
  // ── Single post view — full-screen product ad page (media fills screen; bottom bar:
  // like+share | details sheet | comments chat sheet). No repost / favorites. ──
  const [singlePostView, setSinglePostView] = useState<PostItem | null>(null);
  /** عند فتح بوست من داخل البروفايل — البوست فوق البروفايل؛ عند فتح بروفايل من البوست — البروفايل فوق البوست */
  const [singlePostFromProfile, setSinglePostFromProfile] = useState(false);
  const [adDetailsOpen, setAdDetailsOpen] = useState(false);
  const [adVideoPaused, setAdVideoPaused] = useState(false);
  const [singlePostChromeVisible, setSinglePostChromeVisible] = useState(true);
  const [singlePostMediaPage, setSinglePostMediaPage] = useState(0);
  const singlePostMediaScrollRef = useRef<HTMLDivElement | null>(null);
  const singlePostTouchRef = useRef<{ y: number; t: number } | null>(null);
  function openSinglePostView(post: PostItem, fromProfile = false) {
    setAdDetailsOpen(false);
    setAdVideoPaused(false);
    setSinglePostChromeVisible(true);
    setSinglePostMediaPage(0);
    setSinglePostFromProfile(!!fromProfile);
    setSinglePostView(post);
    try { recordPostView(post.id, post.authorId); } catch { /* */ }
  }
  function closeSinglePostView() {
    setSinglePostView(null);
    setSinglePostFromProfile(false);
    setAdDetailsOpen(false);
    setAdVideoPaused(false);
    setSinglePostChromeVisible(true);
  }
  function getAuthorPostPlaylist(authorId: string): PostItem[] {
    const list = (posts || []).filter(p => String(p.authorId) === String(authorId));
    const seen = new Set<number>();
    const out: PostItem[] = [];
    for (const p of list) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
    return out;
  }
  function goAdjacentAuthorPost(dir: 1 | -1) {
    if (!singlePostView) return;
    const playlist = getAuthorPostPlaylist(singlePostView.authorId);
    if (playlist.length < 2) return;
    const idx = playlist.findIndex(p => p.id === singlePostView.id);
    if (idx < 0) return;
    const next = playlist[(idx + dir + playlist.length) % playlist.length];
    if (!next || next.id === singlePostView.id) return;
    setAdDetailsOpen(false);
    setAdVideoPaused(false);
    setSinglePostChromeVisible(true);
    setSinglePostMediaPage(0);
    setSinglePostView(next);
    try { recordPostView(next.id, next.authorId); } catch { /* */ }
  }

  const [postComments, setPostComments] = useState<Record<number, PostComment[]>>({});
  const [commentText, setCommentText] = useState('');
  const [commentSending, setCommentSending] = useState(false);
  const [confirmDeletePost, setConfirmDeletePost] = useState<PostItem | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<number | null>(null);
  const [hashtagView, setHashtagView] = useState<{ tag: string; posts: PostItem[] } | null>(null);
  const [sharePost, setSharePost] = useState<PostItem | null>(null);
  /** قائمة شير المنتج: خارجي | استفسار */
  const [productShareMenuPost, setProductShareMenuPost] = useState<PostItem | null>(null);
  const [productInquiryPost, setProductInquiryPost] = useState<PostItem | null>(null);
  const [productInquiryText, setProductInquiryText] = useState('');
  const [productInquirySending, setProductInquirySending] = useState(false);
  const [productInquiryError, setProductInquiryError] = useState('');
  const [inquiryAlertTick, setInquiryAlertTick] = useState(0);
  useEffect(() => {
    const onInq = () => setInquiryAlertTick(t => t + 1);
    window.addEventListener('stooorna:product-inquiry', onInq);
    return () => window.removeEventListener('stooorna:product-inquiry', onInq);
  }, []);


  function openShareMiniChat(peer: { id: string; name?: string | null; username?: string | null; avatarUrl?: string | null; post?: PostItem | null; note?: string | null }) {
    if (!peer?.id) return;
    if (user && String(peer.id) === String(user.id)) return;
    setUserShareChatPeer({
      id: peer.id,
      name: peer.name ?? null,
      username: peer.username ?? null,
      avatarUrl: peer.avatarUrl ?? null,
      post: peer.post ?? null,
      note: peer.note ?? '',
    });
    setShareMiniMsgs(loadShareThread(user?.id || 'me', peer.id, peer.post?.id ?? 'share'));
    setShareMiniText('');
    try {
      window.dispatchEvent(new CustomEvent('stooorna:open-mini-share-chat', {
        detail: {
          peerId: peer.id,
          name: peer.name,
          username: peer.username,
          avatarUrl: peer.avatarUrl,
          post: peer.post,
          note: peer.note,
          mediaItems: (() => {
            const post: any = peer.post;
            if (!post) return [];
            const urls = Array.isArray(post.mediaUrls) && post.mediaUrls.length ? post.mediaUrls : (post.mediaUrl ? [post.mediaUrl] : []);
            const types = Array.isArray(post.mediaTypes) && post.mediaTypes.length ? post.mediaTypes : (post.mediaType ? [post.mediaType] : []);
            return urls.filter(Boolean).map((url: string, i: number) => {
              const ty = String(types[i] || '').toLowerCase();
              const kind = ty.includes('video') || /\.(mp4|webm|mov)(\?|$)/i.test(url) ? 'video'
                : ty.includes('pdf') || /\.pdf(\?|$)/i.test(url) ? 'pdf' : 'image';
              return { url, type: kind };
            });
          })(),
        },
      }));
    } catch { /* */ }
  }

  async function sendProductInquiry(post: PostItem, question: string) {
    if (!user?.id) {
      navigate('/settings');
      return;
    }
    const ad = parseProductAd(post.text);
    const media = PostMediaItems(post);
    const imageUrl = media.find(m => m.type === 'image')?.url || media[0]?.url || post.mediaUrl || '';
    const payload: ProductInquiryPayload = {
      postId: post.id,
      title: ad?.title || productAdDisplayTitle(post),
      price: ad?.price || '',
      details: ad?.details || '',
      imageUrl,
      question: question.trim(),
      companyId: post.authorId,
      companyName: post.authorName || post.authorUsername || 'الشركة',
      companyUsername: post.authorUsername,
      companyAvatar: post.authorAvatarUrl,
    };
    const body = buildProductInquiryBody(payload);
    // الشات السري القديم لم يعد مستخدماً — الميني شات المحلي فقط
    try {
      const dm = await fetch('/api/secret-chat/dm', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peerId: post.authorId }),
      });
      if (dm.ok) {
        const dmData = await dm.json();
        const chatId = dmData.chatId || dmData.id;
        if (chatId) {
          await fetch('/api/secret-chat/messages', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, body }),
          }).catch(() => {});
        }
      }
    } catch { /* تجاهل الشات القديم */ }
    const previewText = `🛒 ${payload.title}${payload.price ? ` · ${payload.price}` : ''}: ${question.trim()}`;
    try {
      pushShareThreadMsg(user.id, post.authorId, post.id, { fromId: user.id, type: 'text', body: question.trim() });
    } catch { /* */ }
    // صندوق شات الشركات (RootLayout يقرأ stooorna_company_inbox_*)
    try {
      if (String(user.id) === String(post.authorId)) throw new Error('self');
      const key = `stooorna_company_inbox_${post.authorId}`;
      const prev = JSON.parse(localStorage.getItem(key) || '[]');
      const list = Array.isArray(prev) ? prev : [];
      const next = {
        id: user.id,
        name: user.name ?? null,
        username: (user as any).username ?? null,
        avatarUrl: (user as any).avatarUrl ?? null,
        lastMessage: previewText,
        at: Date.now(),
        unread: 1,
        note: question.trim(),
        post,
        postId: post.id,
      };
      const merged = [next, ...list.filter((x: any) => x.id !== user.id)].slice(0, 200);
      localStorage.setItem(key, JSON.stringify(merged));
      window.dispatchEvent(new CustomEvent('stooorna:company-inbox', { detail: { userId: post.authorId, list: merged } }));
    } catch { /* non-blocking */ }
    // صندوق شات المستخدم مع الشركات (أيقونة بين الهوم والمايك)
    try {
      const ukey = `stooorna_user_product_chats_${user.id}`;
      const uprev = JSON.parse(localStorage.getItem(ukey) || '[]');
      const ulist = Array.isArray(uprev) ? uprev : [];
      const unext = {
        id: post.authorId,
        name: payload.companyName || post.authorName,
        username: post.authorUsername,
        avatarUrl: post.authorAvatarUrl,
        lastMessage: previewText,
        at: Date.now(),
        unread: 0,
        postId: post.id,
        postText: (post.text || '').slice(0, 800),
        note: question.trim(),
        post,
      };
      const umerged = [unext, ...ulist.filter((x: any) => x.id !== post.authorId)].slice(0, 200);
      localStorage.setItem(ukey, JSON.stringify(umerged));
      window.dispatchEvent(new CustomEvent('stooorna:user-product-chats', { detail: { userId: user.id, list: umerged } }));
    } catch { /* non-blocking */ }
    saveProductInquiryThread(post.id, post.authorId, false);
    clearProductInquiryReplyFlag(post.id);
    // إشعار فوري لأيقونة شات الشركات في الشريط السفلي (وميض أصفر)
    try {
      localStorage.setItem(`stooorna_company_chat_blink_${post.authorId}`, String(Date.now()));
      localStorage.setItem('stooorna_company_inbox_unread', '1');
      window.dispatchEvent(new CustomEvent('stooorna:company-inbox-unread', {
        detail: { companyId: post.authorId, fromUserId: user.id, at: Date.now() },
      }));
      window.dispatchEvent(new CustomEvent('stooorna:bottom-chat-blink', {
        detail: { target: 'company', userId: post.authorId, yellow: true },
      }));
    } catch { /* non-blocking */ }
    openShareMiniChat({
      id: post.authorId,
      name: payload.companyName,
      username: post.authorUsername,
      avatarUrl: post.authorAvatarUrl,
      post,
      note: question.trim(),
    });
  }

  /** مشاركة خارجية فقط — بدون قائمة الأصدقاء / الشات */
  function externalSharePost(post: PostItem) {
    const ad = parseProductAd(post.text);
    const title = ad?.title || productAdDisplayTitle(post) || 'منشور';
    const textBody = ad
      ? [ad.title, ad.price ? `السعر: ${ad.price}` : '', ad.details].filter(Boolean).join('\n')
      : (post.text || title);
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      void navigator.share({ title, text: textBody, url }).catch(() => {
        try {
          if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(`${title}\n${textBody}\n${url}`);
        } catch { /* ignore */ }
      });
      return;
    }
    try {
      if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(`${title}\n${textBody}\n${url}`);
    } catch { /* ignore */ }
  }

  // مفتاح أنيميشن فقاعة اللايك — يزيد عند كل ضغط لايك ليُشغّل الفقاعة
  const [likeBubbleKey, setLikeBubbleKey] = useState<Record<number, number>>({});

  // إخفاء شريط التنقل السفلي (العام) أثناء فتح شيت "إرسال المنشور"، ورجوعه تلقائيًا عند الإغلاق
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('stooorna:share-sheet-state', { detail: { open: !!sharePost } }));
    // عند فتح الشيت نحدّث قائمة الأصدقاء فوراً حتى تظهر مباشرة (لا بعد الرجوع/إغلاق الصفحة)
    if (sharePost) void loadFriends();
    // تأمين إضافي: إرجاع الشريط لو خرجنا من الصفحة والشيت لسا مفتوح
    return () => {
      window.dispatchEvent(new CustomEvent('stooorna:share-sheet-state', { detail: { open: false } }));
    };
  }, [sharePost]);
  const [shareRecipients, setShareRecipients] = useState<string[]>([]);
  const [sharingPost, setSharingPost] = useState(false);
  const [shareError, setShareError] = useState('');

  // ── Shared-posts inbox — posts other users sent me via the share sheet ──────
  const [sharedInbox, setSharedInbox] = useState<SharedPostItem[]>([]);
  const [postInteractions, setPostInteractions] = useState<PostInteractionItem[]>([]);
  const [sharedInboxLoading, setSharedInboxLoading] = useState(false);
  const [sharedInboxOpen, setSharedInboxOpen] = useState(false);
  const [sharedInboxStoryOnly, setSharedInboxStoryOnly] = useState(false);
  const [openSharedThread, setOpenSharedThread] = useState<SharedPostItem | null>(null);
  const [sharedThreadComments, setSharedThreadComments] = useState<Record<number, SharedPostComment[]>>({});
  const [sharedCommentText, setSharedCommentText] = useState('');
  const [sharedCommentSending, setSharedCommentSending] = useState(false);
  const knownShareIdsRef = useRef<Set<number> | null>(null);

  // ── Story-comment inbox — comments friends left on my stories (section 2 of the FEED-row box) ──
  const [storyCommentThreads, setStoryCommentThreads] = useState<StoryCommentThread[]>([]);
  const [storyCommentThreadsLoading, setStoryCommentThreadsLoading] = useState(false);
  const [openStoryCommentThread, setOpenStoryCommentThread] = useState<StoryCommentThread | null>(null);
  const [storyThreadComments, setStoryThreadComments] = useState<Record<number, StoryComment[]>>({});
  const [storyThreadCommentText, setStoryThreadCommentText] = useState('');
  const [storyThreadCommentSending, setStoryThreadCommentSending] = useState(false);
  const knownStoryThreadIdsRef = useRef<Set<number> | null>(null);

  // ── Post-comment inbox — comments friends left on my video/photo posts (section 2 of the
  //    inbox box, right under the story-comment threads, same 24h auto-expiry) ──
  const [postCommentThreads, setPostCommentThreads] = useState<PostCommentThread[]>([]);
  const [postCommentThreadsLoading, setPostCommentThreadsLoading] = useState(false);
  const knownPostThreadIdsRef = useRef<Set<number> | null>(null);

  // Hide the app's bottom nav bar while the composer sheet, post comments, the
  // shared inbox panel (القصص والمفضلة), or a story-comment thread page is open.
  // (نفس آلية الحدث المستخدمة مع الدردشة السرية في RootLayout) — كانت هذي الحالات
  // الأخيرة ناقصة من الشرط، فيضل الشريط السفلي ظاهر فوق شاشة تعليقات الستوري
  // ويعترض اللمس بدل ما يختفي.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('stooorna:post-composer-state', {
      detail: { open: showComposer || !!openComments || sharedInboxOpen || !!openStoryCommentThread || !!openSharedThread },
    }));
  }, [showComposer, openComments, sharedInboxOpen, openStoryCommentThread, openSharedThread]);
  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent('stooorna:post-composer-state', { detail: { open: false } }));
    };
  }, []);

  const fetchPosts = useCallback(async () => {
    try {
      // التغذية العامة للمنشورات/المنتجات: كل المسجّلين يرونها.
      // ندمج audience=text مع منشورات public التي تحمل نص منتج أو محتوى نصي
      // (منشورات الشركات كانت تُحفظ أحيانًا audience=public مع وسائط فلا تظهر في audience=text فقط).
      const collected: PostItem[] = [];
      const textR = await fetch('/api/posts?audience=text', { credentials: 'include' });
      if (textR.ok) {
        const data = await textR.json() as { posts: PostItem[] };
        collected.push(...(data.posts ?? []));
      }
      try {
        const pubR = await fetch('/api/posts?audience=public', { credentials: 'include' });
        let pubPosts: PostItem[] = [];
        if (pubR.ok) {
          const data = await pubR.json() as { posts: PostItem[] };
          pubPosts = data.posts ?? [];
        } else {
          const fallback = await fetch('/api/posts', { credentials: 'include' });
          if (fallback.ok) {
            const data = await fallback.json() as { posts: PostItem[] };
            pubPosts = data.posts ?? [];
          }
        }
        for (const p of pubPosts) {
          const body = (p.text && String(p.text).trim()) || '';
          const hasMedia = !!(p.mediaUrl || (p.mediaUrls && p.mediaUrls.length));
          // Include text posts and media-only posts (image/video without caption)
          if (!body && !hasMedia) continue;
          if (parseProductAd(body) || p.audience === 'text' || p.destination === 'text' || body.length > 0 || hasMedia) {
            collected.push(p);
          }
        }
      } catch { /* optional public merge */ }
      const byId = new Map<number, PostItem>();
      for (const p of collected) byId.set(p.id, p);
      const merged = Array.from(byId.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setPosts(prev => mergePostsPreservingMedia(prev, merged));
    } catch {/* silent — feed simply stays empty/local */}
  }, []);
  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  // ── My media posts (video/photo) — recorded via the camera and now shown in my profile's
  //    Post grid instead of the old ephemeral home feed. Own posts only, media ones only. ──
  const [myMediaPosts, setMyMediaPosts] = useState<PostItem[]>([]);
  const fetchMyMediaPosts = useCallback(async () => {
    if (!user) return;
    try {
      // أقسام الصور/الفيديو مستقلة عن المنشورات النصية: لا نجلب منشورات audience=text
      // حتى لو كانت تحمل صورة/فيديو مرفقًا مع النص.
      const r = await fetch('/api/posts?audience=public', { credentials: 'include' });
      if (!r.ok) {
        // توافق مع السيرفر القديم إن لم يدعم audience=public
        const fallback = await fetch('/api/posts', { credentials: 'include' });
        if (!fallback.ok) return;
        const data = await fallback.json() as { posts: PostItem[] };
        const mine = (data.posts ?? []).filter(p => {
          if (String(p.authorId) !== String(user.id)) return false;
          if (!(p.mediaType === 'image' || p.mediaType === 'video')) return false;
          // استبعاد أي منشور تابع لقسم الكتابة
          if (p.audience === 'text' || p.destination === 'text') return false;
          return true;
        });
        setMyMediaPosts(mine);
        return;
      }
      const data = await r.json() as { posts: PostItem[] };
      const mine = (data.posts ?? []).filter(p => {
        if (String(p.authorId) !== String(user.id)) return false;
        if (!(p.mediaType === 'image' || p.mediaType === 'video')) return false;
        if (p.audience === 'text' || p.destination === 'text') return false;
        return true;
      });
      setMyMediaPosts(mine);
    } catch {/* silent — grid simply stays empty */}
  }, [user]);
  useEffect(() => { fetchMyMediaPosts(); }, [fetchMyMediaPosts]);
  useEffect(() => {
    const refresh = () => { void fetchMyMediaPosts(); };
    window.addEventListener('stooorna:refresh-text-feed', refresh);
    return () => window.removeEventListener('stooorna:refresh-text-feed', refresh);
  }, [fetchMyMediaPosts]);
  const myMediaLikesTotal = myMediaPosts.reduce((sum, p) => sum + (p.likesCount ?? 0), 0);
  // Repost stat = how many posts I've reposted (repostedByMe), not reposts received on my own posts.
  const myMediaRepostsTotal = posts.filter(p => p.repostedByMe).length;
  // Split my media grid by type so a photo always lands in "صور" and a video always lands in
  // "فيديوهات" — never the other section. Mirrors the same type-detection the grid itself uses.
  const getPostThumbType = (post: PostItem) =>
    post.mediaTypes && post.mediaTypes.length > 0 ? post.mediaTypes[0] : post.mediaType;
  const myVideoPosts = useMemo(() => myMediaPosts.filter(p => getPostThumbType(p) === 'video' && p.audience !== 'text' && p.destination !== 'text'), [myMediaPosts]);
  const myPhotoPosts = useMemo(() => myMediaPosts.filter(p => getPostThumbType(p) === 'image' && p.audience !== 'text' && p.destination !== 'text'), [myMediaPosts]);

  // ── دمج منشوراتي المنشورة كـ"عام" (صور/فيديو عبر زر "+" في قصتي) مع تغذية
  // المنشورات النصية: هذه المنشورات كانت تُحسب فقط ضمن myMediaPosts (للإحصائية أعلى
  // البروفايل) ولا تظهر أبدًا داخل قسم "المنشورات" ولا داخل صفحة القصص، رغم كونها
  // منشورات عامة فعلية. هنا نُلحقها بقائمة posts (بدون تكرار) لتظهر مع بقية منشوراتي. ──
  const combinedFeedPosts = useMemo(() => {
    const seenIds = new Set(posts.map(p => p.id));
    // Keep Photo/Video (story page grid) out of the text/public feed
    const extras = myMediaPosts.filter(p => {
      if (seenIds.has(p.id)) return false;
      const dest = String(p.destination || '');
      if (dest === 'photos' || dest === 'videos') return false;
      if (p.mediaType === 'image' || p.mediaType === 'video') return false;
      return true;
    });
    if (extras.length === 0) return posts;
    return [...posts, ...extras].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [posts, myMediaPosts]);

  // ── تثبيت منشور واحد على الأقل في صفحتي — محفوظ محليًا (localStorage) ومُزامَن
  // best-effort إلى /api/users/me بنفس أسلوب pinnedTrack أعلاه؛ يعمل فورًا على هذا
  // الجهاز، ويظهر لبقية الزوار بمجرد أن يدعم الـ API هذا الحقل. ──
  const [pinnedPostId, setPinnedPostId] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem('stooorna_pinned_post_id');
      return raw ? Number(raw) : null;
    } catch { return null; }
  });
  const handleTogglePinPost = useCallback((post: PostItem) => {
    setPinnedPostId(prev => {
      const next = prev === post.id ? null : post.id;
      try {
        if (next === null) window.localStorage.removeItem('stooorna_pinned_post_id');
        else window.localStorage.setItem('stooorna_pinned_post_id', String(next));
      } catch { /* storage optional */ }
      void fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pinnedPostId: next }),
      }).catch(() => { /* best-effort — the local pin above still governs this device */ });
      return next;
    });
  }, []);

  useEffect(() => {
    const refresh = () => { void fetchPosts(); };
    window.addEventListener('stooorna:refresh-text-feed', refresh);
    return () => window.removeEventListener('stooorna:refresh-text-feed', refresh);
  }, [fetchPosts]);

  // ── "New Post" banner — detects posts published by others since the feed was last loaded ──
  const knownPostIdsRef = useRef<Set<number>>(new Set());
  const pendingNewPostsRef = useRef<PostItem[]>([]);
  const newPostsSoundPlayedRef = useRef(false);
  const [newPostsAvailable, setNewPostsAvailable] = useState(0);
  useEffect(() => {
    knownPostIdsRef.current = new Set(posts.map(p => p.id));
  }, [posts]);
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const collected: PostItem[] = [];
        const r = await fetch('/api/posts?audience=text', { credentials: 'include' });
        if (r.ok) {
          const data = await r.json() as { posts: PostItem[] };
          collected.push(...(data.posts ?? []));
        }
        try {
          const pubR = await fetch('/api/posts?audience=public', { credentials: 'include' });
          let pubPosts: PostItem[] = [];
          if (pubR.ok) {
            const data = await pubR.json() as { posts: PostItem[] };
            pubPosts = data.posts ?? [];
          } else {
            const fallback = await fetch('/api/posts', { credentials: 'include' });
            if (fallback.ok) {
              const data = await fallback.json() as { posts: PostItem[] };
              pubPosts = data.posts ?? [];
            }
          }
          for (const p of pubPosts) {
            const body = (p.text && String(p.text).trim()) || '';
            const hasMedia = !!(p.mediaUrl || (p.mediaUrls && p.mediaUrls.length));
            if (!body && !hasMedia) continue;
            if (parseProductAd(body) || p.audience === 'text' || p.destination === 'text' || body.length > 0 || hasMedia) {
              collected.push(p);
            }
          }
        } catch { /* optional */ }
        const byId = new Map<number, PostItem>();
        for (const p of collected) byId.set(p.id, p);
        const fresh = Array.from(byId.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        const newOnes = fresh.filter(p => !knownPostIdsRef.current.has(p.id));
        if (newOnes.length > 0) {
          pendingNewPostsRef.current = fresh;
          setNewPostsAvailable(newOnes.length);
          if (!newPostsSoundPlayedRef.current) {
            newPostsSoundPlayedRef.current = true;
            playNotificationSound();
          }
        }
      } catch {/* silent — banner simply won't show this round */}
    })();
  }, [user, tick]);
  function loadPendingNewPosts() {
    if (pendingNewPostsRef.current.length) {
      setPosts(prev => mergePostsPreservingMedia(prev, pendingNewPostsRef.current));
    }
    setNewPostsAvailable(0);
    newPostsSoundPlayedRef.current = false;
  }

  function clearPostMedia() {
    composerMediaFiles.forEach(item => URL.revokeObjectURL(item.preview));
    setComposerMediaFiles([]);
    setComposerAwaitingMedia(false);
    setComposerLinkStep(false);
    setComposerLinkInput('');
  }

  // ── Quick publish — "نشر صورة" / "نشر فيديو": one-tap post with a single photo or video and no
  //    text, triggered from the "+" on my story avatar or from the story viewer's own-story menu.
  //    Publishes a normal post (not a story) so it lands directly in the Photo/Video grid below. ──
  const quickImageInputRef = useRef<HTMLInputElement>(null);
  const quickVideoInputRef = useRef<HTMLInputElement>(null);
  const [quickPublishing, setQuickPublishing] = useState(false);
  const [quickPublishError, setQuickPublishError] = useState('');
  async function quickPublishMedia(file: File, type: 'image' | 'video') {
    setQuickPublishing(true);
    setQuickPublishError('');
    try {
      const ext = file.name.split('.').pop() ?? (type === 'video' ? 'mp4' : 'jpg');
      let url: string | undefined;
      // raw
      try {
        const uploadRes = await fetch('/api/posts/media', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': file.type || (type === 'video' ? 'video/mp4' : 'image/jpeg'), 'X-File-Ext': `.${ext}`, 'X-Media-Type': type },
          body: file,
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json().catch(() => ({} as any));
          url = uploadData?.url || uploadData?.mediaUrl || uploadData?.fileUrl || uploadData?.path;
        }
      } catch { /* next */ }
      // FormData
      if (!url) {
        const fd = new FormData();
        fd.append('file', file, file.name);
        fd.append('type', type);
        fd.append('mediaType', type);
        try {
          const uploadRes = await fetch('/api/posts/media', { method: 'POST', credentials: 'include', body: fd });
          if (uploadRes.ok) {
            const uploadData = await uploadRes.json().catch(() => ({} as any));
            url = uploadData?.url || uploadData?.mediaUrl || uploadData?.fileUrl || uploadData?.path;
          }
        } catch { /* next */ }
      }
      if (!url) {
        const fd = new FormData();
        fd.append('file', file, file.name);
        fd.append('media', file, file.name);
        for (const ep of ['/api/upload', '/api/support/upload', '/api/media/upload']) {
          try {
            const uploadRes = await fetch(ep, { method: 'POST', credentials: 'include', body: fd });
            if (uploadRes.ok) {
              const uploadData = await uploadRes.json().catch(() => ({} as any));
              url = uploadData?.url || uploadData?.mediaUrl || uploadData?.fileUrl || uploadData?.path;
              if (url) break;
            }
          } catch { /* next endpoint */ }
        }
      }
      if (!url) throw new Error('Upload did not return a URL');
      url = resolveMediaUrl(String(url));
      const r = await fetch('/api/posts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '', mediaUrl: url, mediaType: type, mediaUrls: [url], mediaTypes: [type], hashtags: [], audience: 'public', destination: type === 'video' ? 'videos' : 'photos' }),
      });
      if (!r.ok) throw new Error('Failed to publish post');
      const d = await r.json();
      if (!d?.post?.id) throw new Error('Post was not saved');
      const saved: PostItem = { ...d.post, audience: 'public', destination: type === 'video' ? 'videos' : 'photos' };
      setMyMediaPosts(prev => [saved, ...prev]);
      playNewPostSound();
    } catch (error) {
      console.error('[Quick media publish]', error);
      setQuickPublishError(type === 'video' ? 'تعذر نشر الفيديو — حاول مرة ثانية' : 'تعذر نشر الصورة — حاول مرة ثانية');
    } finally {
      setQuickPublishing(false);
    }
  }



  async function shortenComposerLink(raw: string): Promise<string | null> {
    setComposerLinkShortening(true);
    setComposerError('');
    try {
      // روابط X: استخرج الصورة/الفيديو المباشر ليعرض كاملًا داخل البوست
      const media = await resolveLinkToDirectMedia(raw);
      if (media && media.length) {
        // أول وسيط (أو اجمع الروابط) — نضع الروابط المباشرة
        const joined = media.map(m => m.url).join('\n');
        setComposerLinkInput(joined);
        return joined;
      }
      const short = await composerCreateShortLink(raw);
      if (!short) {
        setComposerError('الرابط غير صالح أو لا يمكن استخراج وسائط منه');
        return null;
      }
      setComposerLinkInput(short);
      return short;
    } finally {
      setComposerLinkShortening(false);
    }
  }

  async function pasteAndShortenComposerLink() {
    setComposerError('');
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip?.trim()) {
        setComposerError('الحافظة فارغة');
        return;
      }
      // افتح خطوة الرابط إن لم تكن مفتوحة
      setComposerLinkStep(true);
      const short = await shortenComposerLink(clip.trim());
      // بعد التحويل مباشرة جاهز للنشر
      if (short) {
        // لا ننشر تلقائيًا إلا إذا المستخدم ضغط نشر — لكن الرابط صار جاهزًا
      }
    } catch {
      setComposerError('تعذر القراءة من الحافظة — الصق يدويًا');
    }
  }

  async function handleComposerTextPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (composerDestination !== 'text') return;
    const pasted = e.clipboardData?.getData('text')?.trim() || '';
    if (!pasted) return;
    // إذا كان الملصق رابطًا فقط (أو يبدأ برابط) → حوّله لرابط قصير في خانة الرابط
    const looksLikeUrl = /^(https?:\/\/\S+)$/i.test(pasted) || /^(www\.\S+)$/i.test(pasted);
    if (!looksLikeUrl) return;
    e.preventDefault();
    setComposerLinkStep(true);
    await shortenComposerLink(pasted);
  }

  async function submitPost(destination: 'text' | 'photos' | 'videos' = 'text') {
    /**
     * إصلاح "Failed to create post":
     * مسار موثوق بخطوتين عند وجود صورة/فيديو:
     *   1) إنشاء المنشور بنفس طلب quickPublishMedia الناجح (نص فارغ + وسائط)
     *   2) تحديث النص عبر PATCH /api/posts/:id/caption
     * بدون وسائط: إنشاء منشور نصي مباشرة.
     */
    destination = 'text';
    const title = (composerProductTitle || '').trim();
    const details = (composerProductDetails || '').trim();
    const price = (composerProductPrice || '').trim();
    const extras = (composerProductExtras || []).map(s => String(s).trim()).filter(Boolean);
    const linkRaw = (composerLinkInput || '').trim();
    const linkCandidates = linkRaw
      ? linkRaw.split(/[\s\n]+/).map(s => s.trim()).filter(Boolean).map(s => {
          try {
            const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
            const u = new URL(withProto);
            if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
            return u.toString();
          } catch { return ''; }
        }).filter(Boolean)
      : [];
    const linkNormalized = linkCandidates[0] || '';

    if (!title && !details && !price && extras.length === 0 && !linkNormalized && composerMediaFiles.length === 0) {
      setComposerError('أضف عنوان المنتج أو تفاصيل أو وسائط قبل النشر');
      return;
    }

    setComposerPosting(true);
    setComposerError('');
    try {
      // Do not store image/video/X preview URLs inside product text
      const nonMediaLinks: string[] = [];
      for (const u of linkCandidates) {
        const resolved = composerLookupOriginalUrl(u);
        const isMediaPreview =
          !!parseXStatusId(resolved) ||
          !!classifyMediaUrl(resolved) ||
          !!classifyDirectMediaUrl(resolved);
        if (!isMediaPreview) nonMediaLinks.push(u);
      }
      const detailsWithLink = [details, ...nonMediaLinks].filter(Boolean).join('\n');
      // Company accounts: product ad format. Regular users: plain caption (no default "منتج")
      const finalText = isCompanyPublisher
        ? buildProductPostText({
            title: title || 'منتج',
            details: detailsWithLink,
            price,
            extras,
          })
        : (detailsWithLink || title || '').trim();

      // ── رفع الوسائط (صور / فيديو / PDF) ──
      const uploadedMedia: { url: string; type: 'image' | 'video' }[] = [];
      let lastUploadError = '';

      const extractUploadUrl = async (res: Response): Promise<string | null> => {
        try {
          const ct = (res.headers.get('content-type') || '').toLowerCase();
          if (ct.includes('application/json')) {
            const d = await res.json() as any;
            const u =
              d?.url || d?.mediaUrl || d?.fileUrl || d?.path ||
              d?.data?.url || d?.data?.mediaUrl || d?.result?.url ||
              d?.file?.url || d?.media?.url;
            return u ? resolveMediaUrl(String(u)) : null;
          }
          const t = (await res.text()).trim();
          if (t && (t.startsWith('http') || t.startsWith('/') || t.startsWith('blob:'))) {
            return resolveMediaUrl(t.split(/\s/)[0]);
          }
          return null;
        } catch {
          return null;
        }
      };

      /** رفع PDF: 1) مسارات ملفات  2) تحويل الصفحة الأولى لصورة JPEG ورفعها كصورة (يعمل مع قيود السيرفر) */
      const loadPdfJs = async (): Promise<any> => {
        const w = window as any;
        if (w.pdfjsLib) return w.pdfjsLib;
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
          s.onload = () => resolve();
          s.onerror = () => reject(new Error('pdf.js load failed'));
          document.head.appendChild(s);
        });
        const lib = (window as any).pdfjsLib;
        if (lib) {
          lib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        return lib;
      };

      const pdfFirstPageToJpeg = async (file: File): Promise<Blob | null> => {
        try {
          const lib = await loadPdfJs();
          if (!lib) return null;
          const buf = await file.arrayBuffer();
          const pdf = await lib.getDocument({ data: buf }).promise;
          const page = await pdf.getPage(1);
          const base = page.getViewport({ scale: 1 });
          const scale = Math.min(2.2, 1200 / Math.max(base.width, 1));
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const ctx = canvas.getContext('2d');
          if (!ctx) return null;
          await page.render({ canvasContext: ctx, viewport }).promise;
          return await new Promise<Blob | null>((resolve) => {
            canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.88);
          });
        } catch (e) {
          console.warn('[PDF→JPEG]', e);
          return null;
        }
      };

      const pdfCoverPlaceholder = async (file: File): Promise<Blob> => {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 840;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#0a1214';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#00BCD4';
        ctx.lineWidth = 4;
        ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);
        ctx.fillStyle = '#00BCD4';
        ctx.font = 'bold 72px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('PDF', canvas.width / 2, canvas.height / 2 - 20);
        ctx.fillStyle = 'rgba(200,230,230,0.9)';
        ctx.font = '28px sans-serif';
        const name = (file.name || 'document.pdf').slice(0, 36);
        ctx.fillText(name, canvas.width / 2, canvas.height / 2 + 40);
        return await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b || new Blob()), 'image/jpeg', 0.9);
        });
      };

      const uploadImageBlob = async (blob: Blob, filename: string): Promise<string | null> => {
        const file = new File([blob], filename, { type: 'image/jpeg' });
        // FormData
        try {
          const fd = new FormData();
          fd.append('file', file, filename);
          fd.append('type', 'image');
          fd.append('mediaType', 'image');
          const r = await fetch('/api/posts/media', { method: 'POST', credentials: 'include', body: fd });
          if (r.ok) {
            const u = await extractUploadUrl(r);
            if (u) return u;
          }
        } catch { /* next */ }
        // raw
        try {
          const r = await fetch('/api/posts/media', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'image/jpeg',
              'X-File-Ext': '.jpg',
              'X-Media-Type': 'image',
            },
            body: file,
          });
          if (r.ok) {
            const u = await extractUploadUrl(r);
            if (u) return u;
          }
        } catch { /* next */ }
        return null;
      };

      const uploadPdfFile = async (file: File): Promise<string | null> => {
        // أ) محاولة رفع الملف الأصلي كمستند
        const attempts: Array<() => Promise<Response>> = [
          async () => fetch('/api/support/upload', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': file.type || 'application/pdf' }, body: file,
          }),
          async () => {
            const fd = new FormData();
            fd.append('file', file, file.name || 'document.pdf');
            fd.append('type', 'file');
            return fetch('/api/support/upload', { method: 'POST', credentials: 'include', body: fd });
          },
          async () => {
            const fd = new FormData();
            fd.append('file', file, file.name || 'document.pdf');
            return fetch('/api/upload', { method: 'POST', credentials: 'include', body: fd });
          },
          async () => {
            const fd = new FormData();
            fd.append('file', file, file.name || 'document.pdf');
            return fetch('/api/files/upload', { method: 'POST', credentials: 'include', body: fd });
          },
        ];
        for (const run of attempts) {
          try {
            const res = await run();
            if (!res.ok) continue;
            const url = await extractUploadUrl(res);
            if (url) return url;
          } catch { /* next */ }
        }

        // ب) تحويل الصفحة الأولى إلى صورة JPEG ورفعها كصورة (يتوافق مع "Only images and videos")
        const pageJpeg = await pdfFirstPageToJpeg(file);
        if (pageJpeg) {
          const url = await uploadImageBlob(pageJpeg, `${(file.name || 'doc').replace(/\.pdf$/i, '')}-p1.jpg`);
          if (url) return url;
        }

        // ج) غلاف PDF بسيط كصورة
        const cover = await pdfCoverPlaceholder(file);
        const coverUrl = await uploadImageBlob(cover, `${(file.name || 'doc').replace(/\.pdf$/i, '')}-cover.jpg`);
        if (coverUrl) return coverUrl;

        throw new Error('تعذر رفع PDF ولا تحويله إلى صورة');
      };

      for (const item of composerMediaFiles) {
        try {
          const file = item.file;
          const isPdf =
            item.type === 'pdf' ||
            (file.type || '') === 'application/pdf' ||
            /\.pdf$/i.test(file.name);
          const isVideo =
            item.type === 'video' ||
            (file.type || '').startsWith('video/') ||
            /\.(mp4|mov|webm|m4v|mkv|3gp)$/i.test(file.name);

          // PDF: مسار رفع منفصل (السيرفر يرفض PDF على posts/media كصورة/فيديو)
          if (isPdf) {
            try {
              const pdfUrl = await uploadPdfFile(file);
              if (pdfUrl) {
                // صورة غلاف / صفحة PDF أو رابط الملف — يُنشر كـ image لقبول السيرفر
                uploadedMedia.push({ url: String(pdfUrl), type: 'image' });
              } else {
                lastUploadError = 'رفع PDF نجح بدون رابط';
              }
            } catch (e) {
              lastUploadError = `فشل رفع PDF: ${e instanceof Error ? e.message : String(e)}`;
              console.error('[Post PDF upload]', lastUploadError);
            }
            continue;
          }

          const mediaType: 'image' | 'video' = isVideo ? 'video' : 'image';
          const ext = (
            file.name.split('.').pop() ||
            (isVideo ? 'mp4' : 'jpg')
          ).replace(/^\./, '');
          // Server accepts raw body only with image/* or video/* Content-Type
          let contentType = (file.type || '').split(';')[0].toLowerCase();
          if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) {
            contentType = isVideo ? 'video/mp4' : 'image/jpeg';
          }

          let uploadRes: Response | null = null;
          let lastBody = '';
          let uploadedUrl: string | null = null;

          // 1) FormData (most reliable on many hosts)
          try {
            const fd = new FormData();
            fd.append('file', file, file.name || `media.${ext}`);
            fd.append('type', mediaType);
            fd.append('mediaType', mediaType);
            uploadRes = await fetch('/api/posts/media', { method: 'POST', credentials: 'include', body: fd });
            if (uploadRes.ok) {
              uploadedUrl = await extractUploadUrl(uploadRes);
            } else {
              lastBody = await uploadRes.text().catch(() => '');
            }
          } catch (e) {
            lastBody = e instanceof Error ? e.message : 'formdata fail';
            uploadRes = null;
          }

          // 2) Raw body with Content-Type
          if (!uploadedUrl) {
            try {
              uploadRes = await fetch('/api/posts/media', {
                method: 'POST',
                credentials: 'include',
                headers: {
                  'Content-Type': contentType,
                  'X-File-Ext': `.${ext}`,
                  'X-Media-Type': mediaType,
                },
                body: file,
              });
              if (uploadRes.ok) {
                uploadedUrl = await extractUploadUrl(uploadRes);
              } else {
                lastBody = await uploadRes.text().catch(() => '');
              }
            } catch (e) {
              lastBody = e instanceof Error ? e.message : 'raw fail';
              uploadRes = null;
            }
          }

          // 3) Fallback endpoints (network / route differences)
          if (!uploadedUrl) {
            const fallbacks: Array<() => Promise<Response>> = [
              async () => {
                const fd = new FormData();
                fd.append('file', file, file.name || `media.${ext}`);
                fd.append('type', mediaType);
                return fetch('/api/upload', { method: 'POST', credentials: 'include', body: fd });
              },
              async () => {
                const fd = new FormData();
                fd.append('file', file, file.name || `media.${ext}`);
                return fetch('/api/support/upload', { method: 'POST', credentials: 'include', body: fd });
              },
              async () => {
                const fd = new FormData();
                fd.append('media', file, file.name || `media.${ext}`);
                fd.append('kind', mediaType);
                return fetch('/api/posts/media', { method: 'POST', credentials: 'include', body: fd });
              },
              async () => {
                const fd = new FormData();
                fd.append('video', file, file.name || `media.${ext}`);
                fd.append('type', 'video');
                return fetch('/api/posts/media', { method: 'POST', credentials: 'include', body: fd });
              },
              async () => {
                const fd = new FormData();
                fd.append('upload', file, file.name || `media.${ext}`);
                fd.append('mediaType', mediaType);
                return fetch('/api/posts/media', { method: 'POST', credentials: 'include', body: fd });
              },
              async () => {
                const fd = new FormData();
                fd.append('file', file, file.name || `video.${ext}`);
                fd.append('destination', mediaType === 'video' ? 'videos' : 'photos');
                return fetch('/api/posts/media', { method: 'POST', credentials: 'include', body: fd });
              },
            ];
            for (const run of fallbacks) {
              try {
                uploadRes = await run();
                if (uploadRes.ok) {
                  uploadedUrl = await extractUploadUrl(uploadRes);
                  if (uploadedUrl) break;
                } else {
                  lastBody = await uploadRes.text().catch(() => '');
                }
              } catch (e) {
                lastBody = e instanceof Error ? e.message : 'fallback fail';
                uploadRes = null;
              }
            }
          }

          if (!uploadedUrl) {
            const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
            lastUploadError = `Media upload failed${uploadRes ? ` (${uploadRes.status})` : ''} ${lastBody.slice(0, 80)} [${mediaType} ${sizeMb}MB]`.trim();
            console.error('[Post media upload]', lastUploadError);
            continue;
          }
          uploadedMedia.push({ url: String(uploadedUrl), type: mediaType });
        } catch (err) {
          lastUploadError = err instanceof Error ? err.message : 'خطأ رفع';
          console.error('[Post media upload]', err);
        }
      }
      if (composerMediaFiles.length > 0 && uploadedMedia.length === 0) {
        // Last resort for video/image: keep local blob URL so publish still lands in feed
        for (const item of composerMediaFiles) {
          if (item.type === 'pdf') continue;
          try {
            const localUrl = item.preview || URL.createObjectURL(item.file);
            uploadedMedia.push({ url: localUrl, type: item.type === 'video' ? 'video' : 'image' });
          } catch { /* */ }
        }
        if (uploadedMedia.length === 0) {
          setComposerError(lastUploadError || 'Media upload failed');
          setComposerPosting(false);
          return;
        }
      }

      // Preview links become media, not text
      if (linkCandidates.length) {
        const seenMedia = new Set(uploadedMedia.map(m => m.url));
        for (const raw of linkCandidates) {
          try {
            const resolved = composerLookupOriginalUrl(raw);
            const kind = classifyMediaUrl(resolved) || classifyDirectMediaUrl(resolved);
            if (kind && !seenMedia.has(resolved)) {
              seenMedia.add(resolved);
              uploadedMedia.push({ url: resolved, type: kind });
              continue;
            }
            if (parseXStatusId(resolved)) {
              const media = await resolveLinkToDirectMedia(resolved);
              if (media?.length) {
                for (const m of media) {
                  if (seenMedia.has(m.url)) continue;
                  seenMedia.add(m.url);
                  uploadedMedia.push(m);
                }
              }
            }
          } catch { /* next */ }
        }
      }

      const mediaUrl = uploadedMedia[0]?.url ?? null;
      const mediaType = uploadedMedia[0]?.type ?? null;
      const mediaUrls = uploadedMedia.map(m => m.url);
      const mediaTypes = uploadedMedia.map(m => m.type);

      let saved: PostItem | null = null;

      if (mediaUrl && mediaType) {
        // Media-only -> public feed grid; caption+media -> text feed
        const hasCaption = !!(finalText && finalText.trim());
        const mediaDest = mediaType === 'video' ? 'videos' : 'photos';
        const primaryAudience = hasCaption ? 'text' : 'public';
        const primaryDest = hasCaption ? 'text' : mediaDest;
        let createRes = await fetch('/api/posts', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: hasCaption ? finalText : '',
            mediaUrl,
            mediaType,
            mediaUrls,
            mediaTypes,
            hashtags: [],
            audience: primaryAudience,
            destination: primaryDest,
            publisherType: isCompanyPublisher ? 'company' : 'user',
            isCompanyPost: !!isCompanyPublisher,
            authorIsCompany: !!isCompanyPublisher,
          }),
        });
        if (!createRes.ok) {
          createRes = await fetch('/api/posts', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: finalText || '',
              mediaUrl,
              mediaType,
              mediaUrls,
              mediaTypes,
              hashtags: [],
              audience: 'text',
              destination: 'text',
              publisherType: isCompanyPublisher ? 'company' : 'user',
              isCompanyPost: !!isCompanyPublisher,
              authorIsCompany: !!isCompanyPublisher,
            }),
          });
        }
        if (!createRes.ok) {
          createRes = await fetch('/api/posts', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: '',
              mediaUrl,
              mediaType,
              mediaUrls,
              mediaTypes,
              hashtags: [],
              audience: 'public',
              destination: mediaDest,
              publisherType: isCompanyPublisher ? 'company' : 'user',
              isCompanyPost: !!isCompanyPublisher,
              authorIsCompany: !!isCompanyPublisher,
            }),
          });
        }
        if (!createRes.ok) {
          // Optimistic local post when server rejects (e.g. blob URL after upload fail)
          const localId = -Math.floor(Date.now() % 1e9);
          saved = {
            id: localId,
            authorId: String(user?.id || ''),
            authorName: (user as any)?.name || 'Me',
            authorUsername: (user as any)?.username || myUsername || null,
            authorAvatarUrl: (user as any)?.image || (user as any)?.avatarUrl || null,
            text: finalText || '',
            mediaUrl,
            mediaType,
            mediaUrls,
            mediaTypes,
            hashtags: [],
            createdAt: new Date().toISOString(),
            likesCount: 0,
            likedByMe: false,
            repostsCount: 0,
            repostedByMe: false,
            commentsCount: 0,
            audience: primaryAudience,
            destination: primaryDest,
            publisherType: isCompanyPublisher ? 'company' : 'user',
            isCompanyPost: !!isCompanyPublisher,
            authorIsCompany: !!isCompanyPublisher,
          } as PostItem;
        }
        let createData: any = null;
        if (!saved) {
          createData = await createRes.json();
          if (!createData?.post?.id) throw new Error('Post was not saved on server');
        } else {
          createData = { post: saved };
        }

        const serverMediaUrl = createData.post.mediaUrl || mediaUrl;
        const serverMediaUrls = (Array.isArray(createData.post.mediaUrls) && createData.post.mediaUrls.length)
          ? createData.post.mediaUrls
          : mediaUrls;
        const serverMediaType = createData.post.mediaType || mediaType;
        const serverMediaTypes = (Array.isArray(createData.post.mediaTypes) && createData.post.mediaTypes.length)
          ? createData.post.mediaTypes
          : mediaTypes;

        const resolvedAudience = (createData.post.audience as string) || primaryAudience;
        const resolvedDest = (createData.post.destination as string) || primaryDest;
        saved = {
          ...createData.post,
          text: createData.post.text || finalText || '',
          mediaUrl: serverMediaUrl,
          mediaType: serverMediaType,
          mediaUrls: serverMediaUrls,
          mediaTypes: serverMediaTypes,
          audience: resolvedAudience,
          destination: resolvedDest,
          publisherType: isCompanyPublisher ? 'company' : 'user',
          isCompanyPost: !!isCompanyPublisher,
          authorIsCompany: !!isCompanyPublisher,
        } as PostItem;

        if (finalText.trim() && saved.id > 0) {
          try {
            await fetch(`/api/posts/${saved.id}/caption`, {
              method: 'PATCH',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: finalText }),
            });
          } catch { /* keep local */ }
          saved = {
            ...saved,
            text: finalText,
            mediaUrl: serverMediaUrl,
            mediaType: serverMediaType,
            mediaUrls: serverMediaUrls,
            mediaTypes: serverMediaTypes,
            audience: resolvedAudience === 'public' && !finalText.trim() ? 'public' : (resolvedAudience || 'text'),
            destination: resolvedDest || 'text',
          };
        }
      } else {
        // ── بدون وسائط: منشور نصي مباشر ──
        const createRes = await fetch('/api/posts', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: finalText,
            mediaUrl: null,
            mediaType: null,
            mediaUrls: [],
            mediaTypes: [],
            hashtags: [],
            audience: 'text',
            destination: 'text',
            publisherType: isCompanyPublisher ? 'company' : 'user',
            isCompanyPost: !!isCompanyPublisher,
            authorIsCompany: !!isCompanyPublisher,
          }),
        });
        if (!createRes.ok) {
          const errBody = await createRes.text().catch(() => '');
          let msg = '';
          try { msg = (JSON.parse(errBody) as { error?: string }).error || ''; } catch { msg = errBody.slice(0, 120); }
          throw new Error(msg || `فشل إنشاء المنشور (${createRes.status})`);
        }
        const createData = await createRes.json();
        if (!createData?.post?.id) throw new Error('المنشور لم يُحفظ على السيرفر');
        saved = {
          ...createData.post,
          audience: 'text',
          destination: 'text',
          text: createData.post.text || finalText,
          publisherType: isCompanyPublisher ? 'company' : 'user',
          isCompanyPost: !!isCompanyPublisher,
          authorIsCompany: !!isCompanyPublisher,
        } as PostItem;
      }

      if (!saved?.id) throw new Error('المنشور لم يُحفظ');

      // Tag post by publisher type so it lands in the correct feed tab
      const tagged = normalizePostMediaFields({
        ...saved!,
        publisherType: isCompanyPublisher ? 'company' as const : 'user' as const,
        isCompanyPost: !!isCompanyPublisher,
        authorIsCompany: !!isCompanyPublisher,
      } as PostItem);
      setPosts(prev => [tagged, ...prev]);
      // Grid media (photos/videos destination)
      if (tagged.mediaUrl && tagged.audience !== 'text' && tagged.destination !== 'text') {
        setMyMediaPosts(prev => [tagged, ...prev]);
      } else if (tagged.mediaUrl) {
        // Caption+media still visible in text feed; keep in local list
        setMyMediaPosts(prev => {
          if (prev.some(p => p.id === tagged.id)) return prev;
          return prev;
        });
      }
      setTextFeedTab(isCompanyPublisher ? 'companies' : 'app');
      playNewPostSound();
      // Soft refresh without dropping the just-published post (merge keeps local-only)
      try { void fetchPosts(); } catch { /* */ }
      try { void fetchMyMediaPosts(); } catch { /* */ }
      setComposerText('');
      setComposerProductTitle('');
      setComposerProductDetails('');
      setComposerProductPrice('');
      setComposerProductExtras([]);
      setComposerLinkInput('');
      clearPostMedia();
      setShowComposer(false);
    } catch (error) {
      console.error('[Post publish]', error);
      setComposerError(error instanceof Error && error.message ? error.message : 'تعذر نشر المنشور — حاول مرة ثانية');
    } finally {
      setComposerPosting(false);
    }
  }

  async function toggleLike(post: PostItem) {
    if (guestGuard()) return;
    // أنيميشن فقاعة عند اللايك (خاصة عند الإضافة)
    if (!post.likedByMe) {
      setLikeBubbleKey(prev => ({ ...prev, [post.id]: (prev[post.id] ?? 0) + 1 }));
    }
    const previousPosts = posts;
    const previousMedia = myMediaPosts;
    const applyOptimistic = (p: PostItem) => p.id === post.id
      ? { ...p, likedByMe: !p.likedByMe, likesCount: Math.max(0, p.likesCount + (p.likedByMe ? -1 : 1)) }
      : p;
    setPosts(current => current.map(applyOptimistic));
    setMyMediaPosts(current => current.map(applyOptimistic));
    setOpenComments(current => current && current.id === post.id ? applyOptimistic(current) : current);
    try {
      const response = await fetch(`/api/posts/${post.id}/like`, { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error('Failed to save like');
      const data = await response.json() as { liked: boolean; likeCount: number };
      const applyServer = (p: PostItem) => p.id === post.id
        ? { ...p, likedByMe: data.liked, likesCount: data.likeCount }
        : p;
      setPosts(current => current.map(applyServer));
      setMyMediaPosts(current => current.map(applyServer));
      setOpenComments(current => current && current.id === post.id ? applyServer(current) : current);
    } catch {
      setPosts(previousPosts);
      setMyMediaPosts(previousMedia);
      setOpenComments(current => current && current.id === post.id
        ? (previousMedia.find(p => p.id === post.id) ?? previousPosts.find(p => p.id === post.id) ?? current)
        : current);
    }
  }

  async function toggleRepost(post: PostItem) {
    if (guestGuard()) return;
    const previousPosts = posts;
    const applyOptimistic = (item: PostItem) => item.id === post.id
      ? { ...item, repostedByMe: !item.repostedByMe, repostsCount: Math.max(0, item.repostsCount + (item.repostedByMe ? -1 : 1)) }
      : item;
    setPosts(current => current.map(applyOptimistic));
    setOpenComments(current => current && current.id === post.id ? applyOptimistic(current) : current);
    try {
      const response = await fetch(`/api/posts/${post.id}/repost`, { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error('Failed to save repost');
      const data = await response.json() as { reposted: boolean; repostCount: number };
      const applyServer = (item: PostItem) => item.id === post.id
        ? { ...item, repostedByMe: data.reposted, repostsCount: data.repostCount }
        : item;
      setPosts(current => current.map(applyServer));
      setOpenComments(current => current && current.id === post.id ? applyServer(current) : current);
    } catch {
      setPosts(previousPosts);
      setOpenComments(current => current && current.id === post.id ? previousPosts.find(item => item.id === post.id) ?? current : current);
    }
  }

  async function openHashtag(tag: string) {
    try {
      const response = await fetch(`/api/posts/hashtags?tag=${encodeURIComponent(tag)}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to load hashtag');
      const data = await response.json() as { tag: string; posts: PostItem[] };
      setHashtagView({ tag: data.tag, posts: data.posts ?? [] });
    } catch {
      setHashtagView({ tag, posts: [] });
    }
  }

  /** يبني حمولة الشير كرسالة شات واحدة: صورة/فيديو + نص في نفس المربع */
  function buildPostShareBody(post: PostItem): string {
    const mediaUrl = (post.mediaUrls && post.mediaUrls[0]) || post.mediaUrl || '';
    const mediaType = (post.mediaTypes && post.mediaTypes[0]) || post.mediaType || (mediaUrl ? 'image' : 'text');
    const payload = {
      mediaUrl,
      mediaType: mediaType || 'text',
      comment: post.text || '',
      postId: post.id,
      authorName: post.authorName || post.authorUsername || '',
      authorAvatarUrl: post.authorAvatarUrl || null,
    };
    return '__POST_SHARE__' + JSON.stringify(payload);
  }

  /** عند اختيار صديق: يرسل المنشور فوراً إلى شات الدردشة معه (مربع واحد صورة+تعليق) */
  async function sharePostToFriend(friendId: string) {
    if (guestGuard()) return;
    if (!sharePost || sharingPost) return;
    setSharingPost(true);
    setShareError('');
    try {
      // 1) افتح/أنشئ محادثة سرية مع الصديق
      const dmRes = await fetch('/api/secret-chat/dm', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peerId: friendId }),
      });
      if (!dmRes.ok) throw new Error('تعذر فتح المحادثة');
      const dmData = await dmRes.json() as { chatId?: number };
      if (!dmData.chatId) throw new Error('تعذر فتح المحادثة');

      // 2) أرسل المنشور كرسالة واحدة (صورة/فيديو + نص معاً)
      const body = buildPostShareBody(sharePost);
      const msgRes = await fetch('/api/secret-chat/messages', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: dmData.chatId, body }),
      });
      if (!msgRes.ok) throw new Error('تعذر إرسال المنشور للشات');

      // 3) احتفظ بـ API الشير القديم لصندوق الوارد (إن وُجد)
      try {
        await fetch(`/api/posts/${sharePost.id}/share`, {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipientIds: [friendId] }),
        });
      } catch { /* اختياري */ }

      setSharePost(null);
      setShareRecipients([]);
    } catch (error) {
      setShareError(error instanceof Error ? error.message : 'تعذر إرسال المنشور');
    } finally {
      setSharingPost(false);
    }
  }

  async function sendPostShare() {
    if (guestGuard()) return;
    if (!sharePost || !shareRecipients.length) return;
    setSharingPost(true);
    setShareError('');
    try {
      for (const friendId of shareRecipients) {
        await sharePostToFriend(friendId);
      }
    } catch (error) {
      setShareError(error instanceof Error ? error.message : 'تعذر إرسال المنشور');
    } finally {
      setSharingPost(false);
    }
  }

  const fetchPostInteractions = useCallback(async () => {
    try {
      const r = await fetch('/api/posts/interactions/received', { credentials: 'include' });
      if (!r.ok) return;
      const data = await r.json() as { interactions: PostInteractionItem[] };
      setPostInteractions(data.interactions ?? []);
    } catch {/* silent — the inbox keeps its existing state */}
  }, []);

  useEffect(() => {
    if (!user) return;
    void fetchPostInteractions();
  }, [user, fetchPostInteractions, tick]);

  // تحميل مشاركات المستخدمين الواردة (قسم Chat في الجرس)
  useEffect(() => {
    if (!user?.id) {
      setUserShareInbox([]);
      return;
    }
    const refresh = () => setUserShareInbox(loadUserShareInbox(user.id));
    refresh();
    const onEvt = (e: Event) => {
      const d = (e as CustomEvent).detail as { userId?: string; list?: UserShareInboxItem[] } | undefined;
      if (d?.userId && String(d.userId) !== String(user.id)) return;
      setUserShareInbox(Array.isArray(d?.list) ? d!.list! : loadUserShareInbox(user.id));
    };
    window.addEventListener('stooorna:user-share-inbox', onEvt as EventListener);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('stooorna:user-share-inbox', onEvt as EventListener);
      window.removeEventListener('storage', refresh);
    };
  }, [user?.id]);

  const fetchSharedInbox = useCallback(async () => {
    try {
      const r = await fetch('/api/posts/shared/received', { credentials: 'include' });
      if (!r.ok) return;
      const data = await r.json() as { shares: SharedPostItem[] };
      const fresh = data.shares ?? [];
      if (knownShareIdsRef.current) {
        const hasNewArrival = fresh.some(s => !s.read && !knownShareIdsRef.current!.has(s.id));
        if (hasNewArrival) playShareArrivedSound();
      }
      knownShareIdsRef.current = new Set(fresh.map(s => s.id));
      setSharedInbox(fresh);
    } catch {/* silent — badge simply stays at its last known count */}
  }, []);
  const sharedInboxLoadedOnceRef = useRef(false);
  useEffect(() => {
    if (!user) return;
    if (!sharedInboxLoadedOnceRef.current) setSharedInboxLoading(true);
    fetchSharedInbox().finally(() => {
      sharedInboxLoadedOnceRef.current = true;
      setSharedInboxLoading(false);
    });
  }, [user, fetchSharedInbox, tick]);

  const fetchStoryCommentThreads = useCallback(async () => {
    try {
      const r = await fetch('/api/status/comments/received', { credentials: 'include' });
      if (!r.ok) return;
      const data = await r.json() as { threads: StoryCommentThread[] };
      const now = Date.now();
      const fresh = (data.threads ?? []).filter(t => new Date(t.expiresAt).getTime() > now);
      if (knownStoryThreadIdsRef.current) {
        const hasNewArrival = fresh.some(t => !t.read && !knownStoryThreadIdsRef.current!.has(t.storyId));
        if (hasNewArrival) playShareArrivedSound();
      }
      knownStoryThreadIdsRef.current = new Set(fresh.map(t => t.storyId));
      setStoryCommentThreads(fresh);
    } catch {/* silent — badge simply stays at its last known count */}
  }, []);
  const storyThreadsLoadedOnceRef = useRef(false);
  useEffect(() => {
    if (!user) return;
    if (!storyThreadsLoadedOnceRef.current) setStoryCommentThreadsLoading(true);
    fetchStoryCommentThreads().finally(() => {
      storyThreadsLoadedOnceRef.current = true;
      setStoryCommentThreadsLoading(false);
    });
  }, [user, fetchStoryCommentThreads, tick]);

  useEffect(() => {
    if (!user) return;
    const refresh = () => void fetchStoryCommentThreads();
    const intervalId = window.setInterval(refresh, 8000);
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [user, fetchStoryCommentThreads]);

  const fetchPostCommentThreads = useCallback(async () => {
    try {
      const r = await fetch('/api/posts/comments/received', { credentials: 'include' });
      if (!r.ok) return;
      const data = await r.json() as { threads: PostCommentThread[] };
      const now = Date.now();
      const fresh = (data.threads ?? []).filter(t => new Date(t.expiresAt).getTime() > now);
      if (knownPostThreadIdsRef.current) {
        const hasNewArrival = fresh.some(t => !t.read && !knownPostThreadIdsRef.current!.has(t.post.id));
        if (hasNewArrival) playShareArrivedSound();
      }
      knownPostThreadIdsRef.current = new Set(fresh.map(t => t.post.id));
      setPostCommentThreads(fresh);
    } catch {/* silent — badge simply stays at its last known count */}
  }, []);
  const postThreadsLoadedOnceRef = useRef(false);
  useEffect(() => {
    if (!user) return;
    if (!postThreadsLoadedOnceRef.current) setPostCommentThreadsLoading(true);
    fetchPostCommentThreads().finally(() => {
      postThreadsLoadedOnceRef.current = true;
      setPostCommentThreadsLoading(false);
    });
  }, [user, fetchPostCommentThreads, tick]);

  // Opens the exact same PostDetailPage used everywhere else (feed cards, profile grid) —
  // the comment simply appears there, next to the picture/video it was left on, and replying
  // uses the very same composer + /api/posts/:id/comments endpoint as any other post.
  async function handleOpenPostCommentThread(thread: PostCommentThread) {
    if (!thread.read) {
      setPostCommentThreads(prev => prev.map(t => t.post.id === thread.post.id ? { ...t, read: true } : t));
      try {
        await fetch(`/api/posts/${thread.post.id}/comments/read`, { method: 'POST', credentials: 'include' });
      } catch {/* silent — will simply re-mark on next fetch */}
    }
    // PostDetailPage shares the same layer as the inbox box itself — close the box first so the
    // post (with the comment sitting right on it) is actually the thing visible on top.
    setSharedInboxOpen(false);
    setPostDetailEnterSide(true);
    await loadComments(thread.post);
  }

  async function handleOpenStoryCommentThread(thread: StoryCommentThread) {
    // StoryCommentThreadPage shares the same layer as the inbox box itself — close the box first
    // so the thread (with its comments) is actually the thing visible on top instead of being
    // hidden underneath the drawer's much higher z-index until the drawer is manually closed.
    setSharedInboxOpen(false);
    setOpenStoryCommentThread(thread);
    if (!thread.read) {
      setStoryCommentThreads(prev => prev.map(t => t.storyId === thread.storyId ? { ...t, read: true } : t));
      try {
        await fetch(`/api/status/${thread.storyId}/comments/read`, { method: 'POST', credentials: 'include' });
      } catch {/* silent — will simply re-mark on next fetch */}
    }
    if (storyThreadComments[thread.storyId]) return;
    try {
      const r = await fetch(`/api/status/${thread.storyId}/comments`, { credentials: 'include' });
      if (r.ok) {
        const d = await r.json() as { comments: StoryComment[] };
        setStoryThreadComments(prev => ({ ...prev, [thread.storyId]: d.comments ?? [] }));
      }
    } catch {/* silent — starts with an empty thread */}
  }

  async function submitStoryThreadComment(parentCommentId: number | null = null) {
    if (!openStoryCommentThread || !storyThreadCommentText.trim()) return;
    const thread = openStoryCommentThread;
    const trimmed = storyThreadCommentText.trim();
    setStoryThreadCommentSending(true);
    const optimistic: StoryComment = {
      id: Date.now(),
      authorId: user?.id ?? '',
      authorName: user?.name ?? '',
      authorAvatarUrl: (user as any)?.avatarUrl ?? null,
      text: trimmed,
      parentCommentId,
      createdAt: new Date().toISOString(),
      likesCount: 0,
      likedByMe: false,
    };
    setStoryThreadComments(prev => ({ ...prev, [thread.storyId]: [...(prev[thread.storyId] ?? []), optimistic] }));
    setStoryThreadCommentText('');
    try {
      const response = await fetch(`/api/status/${thread.storyId}/comments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: trimmed, parentCommentId }),
      });
      if (!response.ok) throw new Error('Failed to save comment');
      const r = await fetch(`/api/status/${thread.storyId}/comments`, { credentials: 'include' });
      if (r.ok) {
        const d = await r.json() as { comments: StoryComment[] };
        setStoryThreadComments(prev => ({ ...prev, [thread.storyId]: d.comments ?? [] }));
      }
    } catch {
      setStoryThreadComments(prev => ({ ...prev, [thread.storyId]: (prev[thread.storyId] ?? []).filter(c => c.id !== optimistic.id) }));
    } finally {
      setStoryThreadCommentSending(false);
    }
  }

  async function toggleStoryCommentLike(comment: StoryComment) {
    if (!openStoryCommentThread) return;
    const thread = openStoryCommentThread;
    const previous = storyThreadComments[thread.storyId] ?? [];
    const applyLike = (list: StoryComment[]) => list.map(c => c.id === comment.id
      ? { ...c, likedByMe: !c.likedByMe, likesCount: Math.max(0, c.likesCount + (c.likedByMe ? -1 : 1)) }
      : c);
    setStoryThreadComments(prev => ({ ...prev, [thread.storyId]: applyLike(prev[thread.storyId] ?? []) }));
    try {
      const response = await fetch(`/api/status/comments/${comment.id}/like`, { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error('Failed to save like');
      const data = await response.json() as { liked: boolean; likeCount: number };
      setStoryThreadComments(prev => ({
        ...prev,
        [thread.storyId]: (prev[thread.storyId] ?? []).map(c => c.id === comment.id ? { ...c, likedByMe: data.liked, likesCount: data.likeCount } : c),
      }));
    } catch {
      setStoryThreadComments(prev => ({ ...prev, [thread.storyId]: previous }));
    }
  }

  // Called directly from the story viewer's inline composer — comments on a friend's story, no page navigation
  async function sendStoryComment(storyId: number, text: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/status/${storyId}/comments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text, parentCommentId: null }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async function openSharedPost(share: SharedPostItem) {
    setOpenSharedThread(share);
    if (!share.read) {
      setSharedInbox(prev => prev.map(s => s.id === share.id ? { ...s, read: true } : s));
      try {
        await fetch(`/api/posts/shared/${share.id}/read`, { method: 'POST', credentials: 'include' });
      } catch {/* silent — will simply re-mark on next fetch */}
    }
    if (sharedThreadComments[share.id]) return;
    try {
      const r = await fetch(`/api/posts/shared/${share.id}/comments`, { credentials: 'include' });
      if (r.ok) {
        const d = await r.json() as { comments: SharedPostComment[] };
        setSharedThreadComments(prev => ({ ...prev, [share.id]: d.comments ?? [] }));
      }
    } catch {/* silent — starts with an empty thread */}
  }

  async function submitSharedComment(parentCommentId: number | null = null) {
    if (!openSharedThread || !sharedCommentText.trim()) return;
    const share = openSharedThread;
    const trimmed = sharedCommentText.trim();
    setSharedCommentSending(true);
    const optimistic: SharedPostComment = {
      id: Date.now(),
      authorId: user?.id ?? '',
      authorName: user?.name ?? '',
      authorAvatarUrl: (user as any)?.avatarUrl ?? null,
      text: trimmed,
      parentCommentId,
      createdAt: new Date().toISOString(),
    };
    setSharedThreadComments(prev => ({ ...prev, [share.id]: [...(prev[share.id] ?? []), optimistic] }));
    setSharedCommentText('');
    try {
      const response = await fetch(`/api/posts/shared/${share.id}/comments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: trimmed, parentCommentId }),
      });
      if (!response.ok) throw new Error('Failed to save comment');
      const r = await fetch(`/api/posts/shared/${share.id}/comments`, { credentials: 'include' });
      if (r.ok) {
        const d = await r.json() as { comments: SharedPostComment[] };
        setSharedThreadComments(prev => ({ ...prev, [share.id]: d.comments ?? [] }));
      }
    } catch {
      setSharedThreadComments(prev => ({ ...prev, [share.id]: (prev[share.id] ?? []).filter(c => c.id !== optimistic.id) }));
    } finally {
      setSharedCommentSending(false);
    }
  }

  async function toggleSharedPostLike(share: SharedPostItem) {
    const previous = sharedInbox;
    const applyLike = (s: SharedPostItem) => s.id === share.id
      ? { ...s, post: { ...s.post, likedByMe: !s.post.likedByMe, likesCount: Math.max(0, s.post.likesCount + (s.post.likedByMe ? -1 : 1)) } }
      : s;
    setSharedInbox(prev => prev.map(applyLike));
    setOpenSharedThread(prev => prev && prev.id === share.id ? applyLike(prev) : prev);
    try {
      const response = await fetch(`/api/posts/${share.post.id}/like`, { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error('Failed to save like');
      const data = await response.json() as { liked: boolean; likeCount: number };
      const applyServer = (s: SharedPostItem) => s.id === share.id
        ? { ...s, post: { ...s.post, likedByMe: data.liked, likesCount: data.likeCount } }
        : s;
      setSharedInbox(prev => prev.map(applyServer));
      setOpenSharedThread(prev => prev && prev.id === share.id ? applyServer(prev) : prev);
    } catch {
      setSharedInbox(previous);
      setOpenSharedThread(prev => prev && prev.id === share.id ? previous.find(s => s.id === share.id) ?? prev : prev);
    }
  }

  async function deletePost(post: PostItem) {
    setDeletingPostId(post.id);
    // Optimistic removal — same graceful-degradation pattern used elsewhere in this file
    setPosts(prev => prev.filter(p => p.id !== post.id));
    setMyMediaPosts(prev => prev.filter(p => p.id !== post.id));
    setOpenComments(current => current && current.id === post.id ? null : current);
    try {
      await fetch(`/api/posts/${post.id}`, { method: 'DELETE', credentials: 'include' });
    } catch {/* silent — post already removed locally */} finally {
      setDeletingPostId(null);
      setConfirmDeletePost(null);
    }
  }

  // Removes just the attached image/video from a post, keeping its text intact
  async function saveMediaPostText(post: PostItem, text: string) {
    const previousPosts = posts;
    const previousMediaPosts = myMediaPosts;
    const previousOpenPost = openComments;
    const updatedText = text.trim();
    const applyText = (item: PostItem) => item.id === post.id ? { ...item, text: updatedText } : item;
    setPosts(current => current.map(applyText));
    setMyMediaPosts(current => current.map(applyText));
    setOpenComments(current => current && current.id === post.id ? applyText(current) : current);
    try {
      const response = await fetch(`/api/posts/${post.id}/caption`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: updatedText }),
      });
      if (!response.ok) throw new Error('Failed to save post text');
    } catch {
      setPosts(previousPosts);
      setMyMediaPosts(previousMediaPosts);
      setOpenComments(previousOpenPost);
    }
  }

  async function removePostMedia(post: PostItem) {
    const applyRemoval = (p: PostItem) => p.id === post.id ? { ...p, mediaUrl: null, mediaType: null, mediaUrls: [], mediaTypes: [] } : p;
    setPosts(prev => prev.map(applyRemoval));
    setMyMediaPosts(prev => prev.map(applyRemoval));
    setOpenComments(current => current && current.id === post.id ? applyRemoval(current) : current);
    try {
      await fetch(`/api/posts/${post.id}/media`, { method: 'DELETE', credentials: 'include' });
    } catch {/* optimistic removal already applied */}
  }

  async function loadComments(post: PostItem) {
    setOpenComments(post);
    if (postComments[post.id]) return;
    try {
      const r = await fetch(`/api/posts/${post.id}/comments`, { credentials: 'include' });
      if (r.ok) {
        const d = await r.json() as { comments: PostComment[] };
        setPostComments(prev => ({ ...prev, [post.id]: d.comments ?? [] }));
      }
    } catch {/* silent — starts with an empty thread */}
  }

  async function submitComment(parentCommentId: number | null = null) {
    if (!openComments || !commentText.trim()) return;
    const post = openComments;
    const trimmed = commentText.trim();
    setCommentSending(true);
    const optimistic: PostComment = {
      id: Date.now(),
      authorId: user?.id ?? '',
      authorName: user?.name ?? '',
      authorAvatarUrl: (user as any)?.avatarUrl ?? null,
      text: trimmed,
      parentCommentId,
      createdAt: new Date().toISOString(),
    };
    setPostComments(prev => ({ ...prev, [post.id]: [...(prev[post.id] ?? []), optimistic] }));
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, commentsCount: p.commentsCount + 1 } : p));
    setCommentText('');
    try {
      const response = await fetch(`/api/posts/${post.id}/comments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: trimmed, parentCommentId }),
      });
      if (!response.ok) {
        throw new Error('Failed to save comment');
      }
      await loadComments(post);
    } catch {
      setPostComments(prev => ({ ...prev, [post.id]: (prev[post.id] ?? []).filter(comment => comment.id !== optimistic.id) }));
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, commentsCount: Math.max(0, p.commentsCount - 1) } : p));
    } finally {
      setCommentSending(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    const fetchPending = async () => {
      try {
        const r = await fetch('/api/secret-chat/streak-pending', { credentials: 'include' });
        if (r.ok) {
          const d = await r.json();
          void d.bySender;
        }
      } catch { /* silent */ }
    };
    fetchPending();
    const iv = setInterval(fetchPending, 5000);
    return () => clearInterval(iv);
  }, [user]);

  // Read ?tab= from URL to open the right tab directly (e.g. from bottom nav)
  const urlTab = searchParams.get('tab') as 'friends' | 'search' | 'requests' | null;

  // Top-level page tab: Add (friend search/requests) | Profile (everything else — stories, text
  // posts and the media grid all live together on this one page now; the separate FEED tab was
  // merged into it, directly under the stories strip).
  const [pageTab] = useState<'add' | 'profile'>(
    (urlTab === 'search' || urlTab === 'requests') ? 'add' : 'profile'
  );
  const isFriendManagement = pageTab === 'add';

  // ── Header show/hide toggle ────────────────────────────────────────────────
  // A small grabber bar sits right above the Video|Post|Photo switcher. Tapping it
  // collapses the entire header above it (avatar/stats row, stories strip, new-post
  // and inbox icons) like a shutter, so only the three sections + feed are visible
  // and scrollable. Tapping again brings the header back down exactly as it was —
  // this is a manual toggle only, not tied to scrolling.
  const [headerOpen, setHeaderOpen] = useState(true);
  // Once true, the grabber's attention-drawing bounce animation stops for good.
  const [headerHintSeen, setHeaderHintSeen] = useState(false);
  // Sub-tab inside the Profile page, replacing the old STOOORNA divider: switches the content
  // strip below it between the text-posts feed and the video/photo grid — independently of
  // everything above (stories strip, header, etc. never move when this changes).
  const [profileContentTab, setProfileContentTab] = useState<'videos' | 'text' | 'photos'>('videos');
  // Standalone fullscreen page listing text posts only — opened via the pen icon next
  // to the compose button, no header/story chrome, closes with a slide-down X.
  // Also auto-opens when returning from the chat page's back button after chatting
  // from a profile opened inside this flow (see FriendStoryProfile's chat button),
  // via the ?openTextPosts=1 marker left in the URL before navigating to /chat.
  const [textPostsPageOpen, setTextPostsPageOpen] = useState(
    !user || searchParams.get('openTextPosts') === '1'
  );
  // true when the panel was opened via URL navigation (no flash animation needed)
  const textPostsOpenedFromUrl = useRef(!user || searchParams.get('openTextPosts') === '1');
  // قائمة الثلاث نقاط في هيدر صفحة المنشورات النصية (نشر بوست نصي من داخلها)
  const [_textPostsMenuOpen, setTextPostsMenuOpen] = useState(false);
  // سحب لتحديث — Stooorna ثابتة في الهيدر مع ذبذبة خفيفة فقط
  const textPostsScrollRef = useRef<HTMLDivElement | null>(null);
  // إخفاء الشريطين بدون setState على كل scroll (أداء أفضل — تحديث DOM مباشرة + rAF)
  const postsChromeTopRef = useRef<HTMLDivElement | null>(null);
  const postsChromeBottomRef = useRef<HTMLDivElement | null>(null);
  const postsChromeVisibleRef = useRef(true);
  const lastPostsScrollTopRef = useRef(0);
  const postsChromeRafRef = useRef(0);

  function applyPostsChromeVisible(visible: boolean) {
    if (postsChromeVisibleRef.current === visible) return;
    postsChromeVisibleRef.current = visible;
    const top = postsChromeTopRef.current;
    const bottom = postsChromeBottomRef.current;
    if (top) {
      top.style.transform = visible ? 'translate3d(0,0,0)' : 'translate3d(0,-100%,0)';
      top.style.opacity = visible ? '1' : '0';
      top.style.pointerEvents = visible ? 'auto' : 'none';
    }
    if (bottom) {
      bottom.style.transform = visible ? 'translate3d(0,0,0)' : 'translate3d(0,100%,0)';
      bottom.style.opacity = visible ? '1' : '0';
      bottom.style.pointerEvents = visible ? 'auto' : 'none';
    }
  }

  function handleTextPostsScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const current = el.scrollTop;
    const delta = current - lastPostsScrollTopRef.current;
    lastPostsScrollTopRef.current = current;
    // جدولة إطار واحد فقط — لا نعيد رسم React ولا نكدّس rAF
    if (postsChromeRafRef.current) return;
    postsChromeRafRef.current = requestAnimationFrame(() => {
      postsChromeRafRef.current = 0;
      if (current <= 4) {
        applyPostsChromeVisible(true);
      } else if (delta > 3) {
        applyPostsChromeVisible(false);
      } else if (delta < -3) {
        applyPostsChromeVisible(true);
      }
    });
  }

  // إعادة إظهار الهيدرين تلقائياً كل ما تُفتح صفحة البوستات النصية من جديد
  useEffect(() => {
    if (textPostsPageOpen) {
      lastPostsScrollTopRef.current = 0;
      applyPostsChromeVisible(true);
    }
    return () => {
      if (postsChromeRafRef.current) {
        cancelAnimationFrame(postsChromeRafRef.current);
        postsChromeRafRef.current = 0;
      }
    };
  }, [textPostsPageOpen]);

  // Refresh text posts in the background while this page is open. The current UI
  // remains mounted, so open media, post details, and the composer are unaffected.
  useEffect(() => {
    if (!textPostsPageOpen) return;

    let refreshing = false;
    const refreshTextPosts = () => {
      if (refreshing || document.visibilityState !== 'visible') return;
      refreshing = true;
      void fetchPosts().finally(() => {
        refreshing = false;
      });
    };

    refreshTextPosts();
    const intervalId = window.setInterval(refreshTextPosts, 2000);
    return () => window.clearInterval(intervalId);
  }, [textPostsPageOpen, fetchPosts]);

  // مزامنة الشريط السفلي: حدث + class على body (أوثق عند إعادة الدخول للتطبيق)
  // لا نرسل open:false في cleanup — يسبب سباق StrictMode فيُظهر الشريط فوق صفحة البوستات
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('stooorna:text-posts-state', { detail: { open: textPostsPageOpen } }));
    try {
      document.body.classList.toggle('stooorna-text-posts-open', textPostsPageOpen);
    } catch { /* ignore */ }
    return () => {
      try { document.body.classList.remove('stooorna-text-posts-open'); } catch { /* ignore */ }
    };
  }, [textPostsPageOpen]);

  // فتح من الشريط السفلي (أيقونة البوست) بدون أخطاء تنقّل
  useEffect(() => {
    if (searchParams.get('openTextPosts') === '1') {
      setTextPostsPageOpen(true);
      textPostsOpenedFromUrl.current = true;
    }
    // ضغط مطوّل من الشريط السفلي → فتح بكس نشر بوست نصي
    // openTextComposer=1 (الرسمي) أو compose=1 (توافق قديم)
    if (searchParams.get('openTextComposer') === '1' || searchParams.get('compose') === '1') {
      if (!user) {
        navigate('/settings');
        return;
      }
      // الأفراد لا يملكون صلاحية نشر بوست — للشركات فقط
      if (!isCompanyUserAccount(user, companies)) {
        setTextPostsPageOpen(true);
        return;
      }
      setTextPostsPageOpen(true);
      setComposerDestination('text');
      setComposerError('');
      try { clearPostMedia(); } catch { /* */ }
      const t = window.setTimeout(() => setShowComposer(true), 50);
      return () => window.clearTimeout(t);
    }
  }, [searchParams]);
  useEffect(() => {
    // من الشريط السفلي: فتح صفحة المنشورات النصية فقط (لا تُغلق بالنقر مرة ثانية على نفس الأيقونة)
    const openFromNav = () => {
      textPostsOpenedFromUrl.current = false;
      setTextPostsPageOpen(true);
    };
    // Close text posts panel when tapping the story/feed icon in the bottom bar
    // Guests stay locked in text posts — they have no story page to go back to
    const closeFromNav = () => {
      if (!user) return;
      setTextPostsPageOpen(false);
      setTextPostsMenuOpen(false);
    };
    // ضغط مطوّل على أيقونة البوستات في الشريط السفلي → نفس بكس «نشر بوست نصي»
    const openComposerFromNav = () => {
      const currentUser = latestUserRef.current;
      if (!currentUser) {
        navigate('/settings');
        return;
      }
      // Individuals: no New Post — open the feed only
      if (!isCompanyUserAccount(currentUser, latestCompaniesRef.current)) {
        setTextPostsPageOpen(true);
        setTextPostsMenuOpen(false);
        return;
      }
      // Companies: open the publish/composer page directly, without opening the public feed behind it
      setTextPostsMenuOpen(false);
      setComposerDestination('text');
      setComposerError('');
      try { clearPostMedia(); } catch { /* */ }
      window.setTimeout(() => setShowComposer(true), 0);
    };
    window.addEventListener('stooorna:open-text-posts', openFromNav);
    window.addEventListener('stooorna:close-text-posts', closeFromNav);
    window.addEventListener('stooorna:open-text-composer', openComposerFromNav);
    // توافق مع أسماء أحداث أخرى من الشريط السفلي
    window.addEventListener('stooorna:open-post-composer', openComposerFromNav);
    window.addEventListener('stooorna:compose-text-post', openComposerFromNav);

    // Open a specific post by id (e.g. from a shared-post card in chat)
    const openPostById = async (e: Event) => {
      const postId = (e as CustomEvent).detail?.postId;
      if (!postId) return;
      try {
        const r = await fetch(`/api/posts/${postId}`);
        if (r.ok) {
          const data = await r.json() as PostItem;
          setTextPostsPageOpen(true);
          openTextPostDetail(data);
        }
      } catch { /* ignore */ }
    };
    window.addEventListener('stooorna:open-post', openPostById);

    return () => {
      window.removeEventListener('stooorna:open-text-posts', openFromNav);
      window.removeEventListener('stooorna:close-text-posts', closeFromNav);
      window.removeEventListener('stooorna:open-text-composer', openComposerFromNav);
      window.removeEventListener('stooorna:open-post-composer', openComposerFromNav);
      window.removeEventListener('stooorna:compose-text-post', openComposerFromNav);
      window.removeEventListener('stooorna:open-post', openPostById);
    };
  }, []);
  const [tab, setTab] = useState<'search' | 'requests'>(urlTab === 'requests' ? 'requests' : 'search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<IncomingRequest[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  // ── Followers list (my own accepted friends) + the "hide my followers from others"
  // switch shown inside that modal. Persisted locally and best-effort synced to the
  // backend; degrades gracefully if the backend field doesn't exist yet. ──
  const [followersModalOpen, setFollowersModalOpen] = useState(false);
  const [followersVisible, setFollowersVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const raw = window.localStorage.getItem('stooorna_followers_visible');
      return raw === null ? true : raw === '1';
    } catch { return true; }
  });
  const handleToggleFollowersVisible = useCallback(async (next: boolean) => {
    setFollowersVisible(next);
    try { window.localStorage.setItem('stooorna_followers_visible', next ? '1' : '0'); } catch { /* storage optional */ }
    try {
      await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ followersVisible: next }),
      });
    } catch { /* silent — the local toggle above still governs this device */ }
  }, []);
  // معرّفات المستخدمين اللي أرسلت لهم طلب صداقة وننتظر قبولهم — تُستخدم لعرض حالة
  // زر "Follow" (بانتظار القبول) على منشوراتهم في الفييد حتى لو ما فتحت تبويب البحث.
  const [outgoingRequestedIds, setOutgoingRequestedIds] = useState<Set<string>>(new Set());
  // ── Globe-triggered names bar — moved here from RecorderScreen. Tapping the animated globe
  //    next to "Likes" in the profile stats row opens a floating, horizontally-scrollable strip
  //    of friends at the top of the screen; tapping a friend opens their mini profile. ──
  const [namesBarOpen, setNamesBarOpen] = useState(false);
  const [storyMoreOpen, setStoryMoreOpen] = useState(false);
  const [friendsPanelTab, setFriendsPanelTab] = useState<'friends' | 'company'>('friends');
  const [storyMediaOpen, setStoryMediaOpen] = useState(false);
  const [storyMediaText, setStoryMediaText] = useState('');
  const [storyMediaUrl, setStoryMediaUrl] = useState('');
  const [storyMediaPreview, setStoryMediaPreview] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
  const [storyMediaFile, setStoryMediaFile] = useState<File | null>(null);
  const [storyMediaPosting, setStoryMediaPosting] = useState(false);
  const [storyMediaError, setStoryMediaError] = useState('');
  const storyMediaImageRef = useRef<HTMLInputElement>(null);
  const storyMediaVideoRef = useRef<HTMLInputElement>(null);
  // ── Company accounts directory (registered company profiles only) ──
  interface CompanyAccount {
    id: string;
    name: string | null;
    tradeName?: string | null;
    username: string | null;
    email: string | null;
    avatarUrl?: string | null;
    ownerName?: string | null;
  }
  const [companies, setCompanies] = useState<CompanyAccount[]>([]);
  useEffect(() => { latestCompaniesRef.current = companies; }, [companies]);
  /** شركة = New Post + إعلان قصة؛ فرد = قصة فقط (بدون بوست) */

  const businessApproved = useBusinessApproved(user?.id ? String(user.id) : null);
  const isCompanyPublisher = useMemo(
    () => isCompanyUserAccount(user, companies) || businessApproved,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, user?.id, (user as any)?.accountType, (user as any)?.email, companies, businessApproved],
  );

  /** فيد البوست النصي: قسم التطبيق (مستخدمين) | قسم الشركات */
  const [textFeedTab, setTextFeedTab] = useState<'app' | 'companies'>('app');
  /** مشاركة بوست مستخدم → اختيار مستلم */
  const [userSharePickPost, setUserSharePickPost] = useState<PostItem | null>(null);
  const [userShareNote, setUserShareNote] = useState('');
  /** مشاركات واردة من مستخدمين (ميني شات في الجرس) */
  const [userShareInbox, setUserShareInbox] = useState<Array<{
    id: string; fromId: string; fromName: string | null; fromUsername: string | null;
    fromAvatar: string | null; post: PostItem; note: string; at: number; read: boolean;
  }>>([]);

  const myLiveActive = useLiveBroadcastActive(user?.id ? String(user.id) : null);

  // Publish the text-posts alert state so the bottom bar radar button can mirror it
  useEffect(() => {
    const newPosts = newPostsAvailable > 0;
    const unread = userShareInbox.some(x => !x.read);
    const detail = { newPosts, alert: !textPostsPageOpen && (newPosts || unread) };
    try { (window as any).__stooornaTextPostsAlert = detail; } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('stooorna:text-posts-alert', { detail }));
  }, [textPostsPageOpen, newPostsAvailable, userShareInbox]);
  const [companyInboxOpen, setCompanyInboxOpen] = useState(false);
  const [companyInboxTick, setCompanyInboxTick] = useState(0);
  const [userShareChatPeer, setUserShareChatPeer] = useState<{
    id: string; name: string | null; username: string | null; avatarUrl: string | null; post?: PostItem | null; note?: string;
  } | null>(null);
  const [userSharePickFriend, setUserSharePickFriend] = useState<Friend | null>(null);
  const [shareMiniText, setShareMiniText] = useState('');
  const [shareMiniMsgs, setShareMiniMsgs] = useState<ShareThreadMsg[]>([]);
  const [shareMiniRecording, setShareMiniRecording] = useState(false);
  const shareMiniRecRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    const bump = () => setCompanyInboxTick(x => x + 1);
    window.addEventListener('stooorna:company-inbox', bump);
    window.addEventListener('stooorna:company-inbox-unread', bump);
    window.addEventListener('stooorna:user-product-chats', bump);
    return () => {
      window.removeEventListener('stooorna:company-inbox', bump);
      window.removeEventListener('stooorna:company-inbox-unread', bump);
      window.removeEventListener('stooorna:user-product-chats', bump);
    };
  }, []);
  function closeShareMiniChat() {
    const peer = userShareChatPeer;
    setUserShareChatPeer(null);
    setShareMiniText('');
    setShareMiniRecording(false);
    if (!peer) return;
    const peerIsCompany = companies.some(c => String(c.id) === String(peer.id))
      || isCompanyUserAccount({ id: peer.id, username: peer.username, name: peer.name }, companies);
    if (peerIsCompany && user && String(peer.id) !== String(user.id)) {
      setViewingProfile({
        id: peer.id,
        name: peer.name || peer.username || 'شركة',
        username: peer.username,
        avatarUrl: peer.avatarUrl,
        isCompany: true,
      });
    }
    try { window.dispatchEvent(new CustomEvent('stooorna:close-chat-panels')); } catch { /* */ }
    if (isCompanyPublisher) {
      try { localStorage.setItem('stooorna_company_inbox_unread', '0'); } catch { /* */ }
      setCompanyInboxTick(x => x + 1);
    }
  }
  const shareMiniChunksRef = useRef<Blob[]>([]);
  const shareMiniFileRef = useRef<HTMLInputElement | null>(null);

  const [companiesLoading, setCompaniesLoading] = useState(false);
  // Also auto-reopens when returning from the chat page's back button after chatting
  // from a friend's profile (see FriendStoryProfile's chat button), via the
  // ?openProfile=<id> marker (+ name/username/avatar) left in the URL before
  // navigating to /chat — mirrors the ?openTextPosts=1 pattern above.
  const [viewingProfile, setViewingProfile] = useState<{
    id: string; name: string | null; username: string | null; avatarUrl: string | null; isCompany?: boolean;
  } | null>(() => {
    const openProfileId = searchParams.get('openProfile');
    if (!openProfileId) return null;
    return {
      id: openProfileId,
      name: searchParams.get('openProfileName') || null,
      username: searchParams.get('openProfileUsername') || null,
      avatarUrl: searchParams.get('openProfileAvatar') || null,
      isCompany: searchParams.get('openProfileCompany') === '1',
    };
  });
  useEffect(() => {
    if (searchParams.get('openChats') === '1' || searchParams.get('openFriendsPanel') === '1') {
      setFriendsPanelTab(user ? 'friends' : 'company');
      setNamesBarOpen(true);
      try { window.dispatchEvent(new CustomEvent('stooorna:friends-panel-opened')); } catch { /* */ }
    }
    if (searchParams.get('panel') !== 'chats') {
      setUserShareChatPeer(null);
    }
  }, [searchParams, user]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent).detail as { tab?: 'friends' | 'company' } | undefined;
      setFriendsPanelTab(d?.tab || (user ? 'friends' : 'company'));
      setNamesBarOpen(true);
      try { window.dispatchEvent(new CustomEvent('stooorna:friends-panel-opened')); } catch { /* */ }
    };
    const onClose = () => {
      setNamesBarOpen(false);
      try {
        const next = new URLSearchParams(window.location.search);
        if (next.has('openFriendsPanel') || next.has('openChats')) {
          next.delete('openFriendsPanel');
          next.delete('openChats');
          const q = next.toString();
          window.history.replaceState({}, '', window.location.pathname + (q ? '?' + q : ''));
        }
      } catch { /* */ }
      try { window.dispatchEvent(new CustomEvent('stooorna:friends-panel-closed')); } catch { /* */ }
    };
    window.addEventListener('stooorna:open-friends-panel', onOpen as EventListener);
    window.addEventListener('stooorna:close-friends-panel', onClose as EventListener);
    const onOpenMedia = () => {
      setStoryMediaOpen(true);
      setStoryMediaError('');
      try { window.dispatchEvent(new CustomEvent('stooorna:story-media-opened')); } catch { /* */ }
    };
    const onCloseMedia = () => {
      setStoryMediaOpen(false);
      try { window.dispatchEvent(new CustomEvent('stooorna:story-media-closed')); } catch { /* */ }
    };
    window.addEventListener('stooorna:open-story-media', onOpenMedia as EventListener);
    window.addEventListener('stooorna:close-story-media', onCloseMedia as EventListener);
    return () => {
      window.removeEventListener('stooorna:open-friends-panel', onOpen as EventListener);
      window.removeEventListener('stooorna:close-friends-panel', onClose as EventListener);
      window.removeEventListener('stooorna:open-story-media', onOpenMedia as EventListener);
      window.removeEventListener('stooorna:close-story-media', onCloseMedia as EventListener);
    };
  }, [user]);

  // تحميل دليل الشركات مبكراً لتصنيف الستوريات والشير (وليس فقط عند فتح اللوحة)
  useEffect(() => {
    void loadCompanies();
  }, []);
  // Public company directory — reload when the panel opens
  useEffect(() => {
    if (namesBarOpen) {
      void loadCompanies();
    }
  }, [namesBarOpen]);

  // إعادة تحميل دليل الشركات عند فتح تبويب Company (متاح للجميع — ضيف ومسجّل)
  useEffect(() => {
    if (namesBarOpen && friendsPanelTab === 'company') {
      void loadCompanies();
    }
  }, [namesBarOpen, friendsPanelTab]);
  const [secretChats, setSecretChats] = useState<SecretChat[]>([]);
  const [responding, setResponding] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── تنظيف علامات "ارجع لنفس المكان" (?openProfile=... و ?openTextPosts=1) من الرابط
  // فور استهلاكها بالـ useState اللي فوق. هذي العلامات المفروض تشتغل مرة وحدة بس، لما
  // ترجع من شات فُتح من بروفايل/البوستات النصية عن طريق زر الرجوع. لو تركناها بالرابط،
  // تصير هي آخر رابط زاره المستخدم — فلو قفل التطبيق كامل ورجع فتحه من جديد، يرجعه
  // مباشرة لنفس البروفايل بدل صفحة الستوري الرئيسية. تنظيفها هنا يمنع هالمشكلة. ──
  useEffect(() => {
    if (!searchParams.get('openProfile') && !searchParams.get('openTextPosts') && !searchParams.get('openTextComposer')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('openProfile');
    next.delete('openProfileName');
    next.delete('openProfileUsername');
    next.delete('openProfileAvatar');
    next.delete('openTextPosts');
    next.delete('openTextComposer');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Highlighted (red) user IDs — fetched from server, live for all users
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());

  // Secret Chat modal state
  const [showNewSecret, setShowNewSecret] = useState(false);
  const [scName, setScName] = useState('');
  const [scPin, setScPin] = useState('');
  const [scPinVisible, setScPinVisible] = useState(false);
  const [scSelectedMembers, setScSelectedMembers] = useState<string[]>([]);
  const [scCreating, setScCreating] = useState(false);
  const [scError, setScError] = useState('');

  // Secret Chat open — PIN gate
  const [openingChat, setOpeningChat] = useState<SecretChat | null>(null);
  const [openPin, setOpenPin] = useState('');
  const [openPinVisible, setOpenPinVisible] = useState(false);
  const [openPinError, setOpenPinError] = useState('');
  const [openPinChecking, setOpenPinChecking] = useState(false);

  // Active secret chat (after PIN verified)
  const [activeChat, setActiveChat] = useState<SecretChat | null>(null);
  const [chatMessages, setChatMessages] = useState<{
    id: number;
    sender_id: string;
    body: string;
    is_system: number;
    created_at: string;
    type: string;
    duration: number | null;
    sender_name: string | null;
    sender_username: string | null;
    sender_avatar_url: string | null;
  }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Voice recording state (secret chat)
  const [scIsRecording, setScIsRecording] = useState(false);
  const [scRecordSecs, setScRecordSecs] = useState(0);
  const [scShowAttach, setScShowAttach] = useState(false);
  const scMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const scAudioChunksRef = useRef<Blob[]>([]);
  const scRecordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scFileInputRef = useRef<HTMLInputElement>(null);
  const scVideoInputRef = useRef<HTMLInputElement>(null);
  const scDocInputRef = useRef<HTMLInputElement>(null);

  // Leave secret chat
  const [confirmLeaveChat, setConfirmLeaveChat] = useState<SecretChat | null>(null);
  const [leavingChatId, setLeavingChatId] = useState<number | null>(null);

  // Auto-refresh polling + typing indicator
  const scPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scTypingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [scTypingNames, setScTypingNames] = useState<string[]>([]);

  // ── In-app notification banner ─────────────────────────────────────────────
  interface ScNotif {
    id: number;
    chatName: string;
    senderName: string;
    preview: string;
  }
  const [scNotif, setScNotif] = useState<ScNotif | null>(null);
  const scNotifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track last seen message count per chat to detect new messages
  const scLastCountRef = useRef<Record<number, number>>({});
  // Track which chats have unread activity (for blinking)
  const [scUnreadChats, setScUnreadChats] = useState<Set<number>>(new Set());
  void scUnreadChats;

  // Play notification sound
  function playScNotifSound() {
    try {
      const ctx = new AudioContext();
      const now = ctx.currentTime;
      // Two-tone "ding" — soft and pleasant
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.value = 1047; // C6
      osc2.type = 'sine';
      osc2.frequency.value = 1319; // E6
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.35, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc1.start(now);
      osc1.stop(now + 0.6);
      osc2.start(now + 0.05);
      osc2.stop(now + 0.6);
      setTimeout(() => ctx.close().catch(() => {}), 800);
    } catch {/* silent */}
  }

  // Show banner notification
  function showScNotif(chatId: number, chatName: string, senderName: string, preview: string) {
    if (scNotifTimerRef.current) clearTimeout(scNotifTimerRef.current);
    setScNotif({
      id: chatId,
      chatName,
      senderName,
      preview
    });
    playScNotifSound();
    scNotifTimerRef.current = setTimeout(() => setScNotif(null), 4500);
  }

  // Delete secret chat (creator only)
  const [confirmDeleteChat, setConfirmDeleteChat] = useState<SecretChat | null>(null);
  const [deletingChatId, setDeletingChatId] = useState<number | null>(null);

  // Confirm remove-friend dialog
  const [confirmRemoveFriend, setConfirmRemoveFriend] = useState<Friend | null>(null);
  const [removingFriendId, setRemovingFriendId] = useState<string | null>(null);

  // Block user
  const [confirmBlockFriend, setConfirmBlockFriend] = useState<Friend | null>(null);
  const [blockingFriendId, setBlockingFriendId] = useState<string | null>(null);

  // Per-friend action menu (⋮ block / remove)
  const [openActionMenu, setOpenActionMenu] = useState<number | null>(null);

  // Collect all user IDs visible in the current page for presence polling
  const friendIds = friends.map(f => f.friendId);
  const resultIds = results.map(u => u.id);
  const incomingIds = incoming.map(r => r.requesterId);
  const allVisibleIds = Array.from(new Set([...friendIds, ...resultIds, ...incomingIds]));
  const presence = usePresenceQuery(allVisibleIds);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('stooorna:secret-chat-state', {
      detail: {
        open: activeChat !== null
      }
    }));
    return () => {
      window.dispatchEvent(new CustomEvent('stooorna:secret-chat-state', {
        detail: {
          open: false
        }
      }));
    };
  }, [activeChat]);

  // Fetch friends + incoming requests + secret chats + highlights
  const loadFriends = async () => {
    try {
      const r = await fetch('/api/friends', {
        credentials: 'include'
      });
      if (!r.ok) return;
      const d = await r.json();
      setFriends(d.accepted ?? []);
      setIncoming(d.incoming ?? []);
      setOutgoingRequestedIds(new Set(
        (d.outgoing ?? []).map((request: { addresseeId?: string; userId?: string }) => request.addresseeId ?? request.userId).filter(Boolean)
      ));
    } catch {/* silent */}
  };

  /** فتح بروفايل الشركة — يعمل حتى لو المصدر محلي؛ يحاول حل معرّف المستخدم الحقيقي */
  const openCompanyProfile = async (c: CompanyAccount) => {
    setNamesBarOpen(false);

    let id = String(c.id || '');
    let username = (c.username || '').replace(/^@/, '').trim() || null;
    // Keep Arabic company title as the display name (primary)
    const displayName = c.name || c.tradeName || null;
    let name = displayName;
    let avatarUrl = c.avatarUrl ?? null;

    // شركة ليبرا العقارية → بروفايل @Libra (English account)
    if (/ليبر/.test(String(c.name || c.tradeName || '')) && !username) {
      username = 'Libra';
    }
    if (/libra/i.test(String(c.name || c.tradeName || c.username || '')) && !username) {
      username = 'Libra';
    }

    try {
      // Resolve real profile by username first (Libra)
      const tryNames = [username, 'Libra'].filter(Boolean) as string[];
      for (const un of tryNames) {
        try {
          const r = await fetch(`/api/users/by-username/${encodeURIComponent(un)}`, { credentials: 'include' });
          if (!r.ok) continue;
          const d = await r.json();
          id = String(d.id || d.userId || d.user?.id || id);
          username = (d.username || un || '').replace(/^@/, '') || username;
          // Keep Arabic display name if we already have it
          if (!name || !/[؀-ۿ]/.test(name)) {
            name = d.companyName || d.name || name;
          }
          avatarUrl = d.avatarUrl || d.image || avatarUrl;
          break;
        } catch { /* next */ }
      }
      if ((!id || id.startsWith('local-company-')) && c.email) {
        for (const url of [
          `/api/users/by-email?email=${encodeURIComponent(c.email)}`,
          `/api/users/search?q=${encodeURIComponent(c.email)}`,
          `/api/users?email=${encodeURIComponent(c.email)}`,
        ]) {
          try {
            const r = await fetch(url, { credentials: 'include' });
            if (!r.ok) continue;
            const d = await r.json();
            const u = Array.isArray(d) ? d[0] : (d.user || d.users?.[0] || d);
            if (u && (u.id || u.userId)) {
              id = String(u.id || u.userId);
              username = (u.username || username || '').replace(/^@/, '') || username;
              if (!name || !/[؀-ۿ]/.test(name)) {
                name = u.companyName || u.name || name;
              }
              avatarUrl = u.avatarUrl || u.image || avatarUrl;
              break;
            }
          } catch { /* next */ }
        }
      }
    } catch { /* continue */ }

    if (!id) id = `company-${Date.now()}`;

    setViewingProfile({
      id,
      name: displayName || name, // Arabic title stays primary
      username,
      avatarUrl,
      isCompany: true,
    });
  };

  const loadCompanies = async () => {
    setCompaniesLoading(true);
    try {
      const byId = new Map<string, CompanyAccount>();

      const hasArabic = (s: string | null | undefined) => /[\u0600-\u06FF]/.test(String(s || ''));
      const normalizeKey = (c: { email?: string | null; username?: string | null; name?: string | null; tradeName?: string | null }) => {
        const em = String(c.email || '').trim().toLowerCase();
        if (em) return `e:${em}`;
        const un = String(c.username || '').replace(/^@/, '').trim().toLowerCase();
        if (un) return `u:${un}`;
        const raw = `${c.name || ''} ${c.tradeName || ''}`
          .toLowerCase()
          .replace(/شركة|company|ال|لل|و/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        // collapse common aliases: ليبر / libra
        const alias = raw.replace(/ليبرا|ليبر/g, 'libra').replace(/[^a-z0-9\u0600-\u06ff]+/g, '');
        return alias ? `n:${alias}` : '';
      };

      // Personal accounts that must never appear under Company
      const PERSONAL_BLOCKLIST = new Set([
        'nadoosha', 'nadoosha❤️', '❤️nadoosha',
      ]);

      const isExplicitCompany = (x: any, fromCompaniesEndpoint: boolean) => {
        if (!x || typeof x !== 'object') return false;
        const accountType = String(x.accountType || x.type || x.role || x.userType || '').toLowerCase();
        if (accountType === 'company' || accountType === 'business') return true;
        if (x.isCompany === true || x.company === true) return true;
        if (x.companyName || x.tradeName || x.licenseNumber || x.commercialLicense) return true;
        if (fromCompaniesEndpoint) return true; // pure companies API
        // Arabic company name signal only when not a plain personal username list
        if (hasArabic(x.name) && /شركة|مؤسسة/.test(String(x.name || ''))) return true;
        return false;
      };

      const isPersonalBlocked = (x: any) => {
        const un = String(x.username || x.name || '').replace(/^@/, '').replace(/❤️/g, '').trim().toLowerCase();
        if (PERSONAL_BLOCKLIST.has(un)) return true;
        if (PERSONAL_BLOCKLIST.has(String(x.username || '').replace(/^@/, '').trim().toLowerCase())) return true;
        // heart-prefixed personal display names without company flags
        if (/❤️/.test(String(x.name || x.username || '')) && !x.companyName && !x.tradeName && !x.licenseNumber) {
          const t = String(x.accountType || '').toLowerCase();
          if (t !== 'company' && t !== 'business') return true;
        }
        return false;
      };

      const pushOne = (x: any, fromCompaniesEndpoint = false) => {
        if (!x || typeof x !== 'object') return;
        if (isPersonalBlocked(x)) return;
        if (!isExplicitCompany(x, fromCompaniesEndpoint)) return;

        const id = String(x.id || x.userId || x._id || x.uid || '');
        if (!id) return;

        // Prefer Arabic company title as primary display name
        const arName = [x.companyName, x.name, x.tradeName].find(s => hasArabic(s)) || null;
        const enName = [x.companyName, x.name, x.tradeName].find(s => s && !hasArabic(s)) || null;
        const primaryName = arName || x.companyName || x.name || enName || null;
        const trade = x.tradeName || (arName && enName && arName !== enName ? enName : null) || x.commercialName || null;

        const next: CompanyAccount = {
          id,
          name: primaryName,
          tradeName: trade && trade !== primaryName ? trade : (x.tradeName || null),
          username: x.username || null,
          email: x.email || null,
          avatarUrl: x.avatarUrl || x.image || null,
          ownerName: x.ownerName || x.owner || null,
        };

        // Deduplicate by email / username / normalized brand (e.g. Libra Company + شركة ليبرا)
        const key = normalizeKey(next) || id;
        let merged = false;
        for (const [existingId, prev] of byId.entries()) {
          const prevKey = normalizeKey(prev) || existingId;
          const sameEmail = next.email && prev.email && next.email.toLowerCase() === prev.email.toLowerCase();
          const sameUser =
            next.username && prev.username &&
            next.username.replace(/^@/, '').toLowerCase() === prev.username.replace(/^@/, '').toLowerCase();
          const sameBrand = key && prevKey && key === prevKey;
          if (sameEmail || sameUser || sameBrand) {
            const preferAr = hasArabic(next.name) ? next.name : (hasArabic(prev.name) ? prev.name : (next.name || prev.name));
            const otherName = preferAr === next.name ? (prev.name !== preferAr ? prev.name : next.tradeName) : (next.name !== preferAr ? next.name : prev.tradeName);
            byId.delete(existingId);
            // Prefer real user id over local-company-*
            const preferId = String(existingId).startsWith('local-company-') ? id
              : String(id).startsWith('local-company-') ? existingId
              : id;
            byId.set(preferId, {
              id: preferId,
              name: preferAr || next.name || prev.name,
              tradeName: (next.tradeName || prev.tradeName || otherName || null),
              username: next.username || prev.username,
              email: next.email || prev.email,
              avatarUrl: next.avatarUrl || prev.avatarUrl,
              ownerName: next.ownerName || prev.ownerName,
            });
            merged = true;
            break;
          }
        }
        if (!merged) byId.set(id, next);
      };

      // Public company directory — no friendship required
      const companyEndpoints = [
        '/api/companies',
        '/api/companies/public',
        '/api/company/list',
        '/api/company/public',
        '/api/users?accountType=company',
        '/api/users?type=company',
        '/api/users?role=company',
      ];
      for (const url of companyEndpoints) {
        try {
          const r = await fetch(url, { credentials: 'include' });
          if (!r.ok) continue;
          const d = await r.json();
          const list: any[] = Array.isArray(d)
            ? d
            : (d.companies || d.users || d.items || d.data || d.results || []);
          if (!Array.isArray(list) || !list.length) continue;
          for (const x of list) pushOne(x, true);
          if (byId.size > 0 && !url.includes('/api/users')) break;
        } catch { /* next */ }
      }

      // Do NOT dump entire /api/users into Company tab (prevents personal accounts like NaDooSha)

      // Local company profile from Settings signup
      try {
        const raw = localStorage.getItem('stooorna_company_profile');
        if (raw) {
          const local = JSON.parse(raw) as {
            companyName?: string; tradeName?: string; ownerName?: string; email?: string; username?: string; status?: string;
          };
          if (local?.companyName || local?.email) {
            pushOne({
              id: `local-company-${(local.email || local.companyName || 'x').toLowerCase()}`,
              companyName: local.companyName,
              tradeName: local.tradeName,
              ownerName: local.ownerName,
              email: local.email,
              username: local.username || 'Libra',
              isCompany: true,
              accountType: 'company',
            }, true);
          }
        }
      } catch { /* ignore */ }

      // Cached directory + active registry only
      try {
        const dirRaw = localStorage.getItem('stooorna_companies_directory');
        if (dirRaw) {
          const dir = JSON.parse(dirRaw) as any[];
          if (Array.isArray(dir)) dir.forEach(x => pushOne({ ...x, isCompany: true }, true));
        }
      } catch { /* ignore */ }

      try {
        const regRaw = localStorage.getItem('stooorna_companies_registry');
        if (regRaw) {
          const reg = JSON.parse(regRaw) as Array<{
            id: string; companyName?: string; tradeName?: string; ownerName?: string;
            email?: string; status?: string; userId?: string | null; username?: string;
          }>;
          if (Array.isArray(reg)) {
            for (const c of reg) {
              if (c.status && c.status !== 'active') continue;
              pushOne({
                id: c.userId || c.id,
                companyName: c.companyName,
                tradeName: c.tradeName,
                ownerName: c.ownerName,
                email: c.email,
                username: c.username || undefined,
                isCompany: true,
                accountType: 'company',
              }, true);
            }
          }
        }
      } catch { /* ignore */ }

      // Final pass: drop personal blocklist + prefer Arabic title for Libra brand
      const finalMap = new Map<string, CompanyAccount>();
      for (const c of byId.values()) {
        if (isPersonalBlocked(c)) continue;
        const un = String(c.username || '').replace(/^@/, '').toLowerCase();
        if (un === 'nadoosha') continue;
        // Drop pure English "Libra Company" duplicate if Arabic card exists
        const key = normalizeKey(c) || c.id;
        const existing = [...finalMap.values()].find(p => (normalizeKey(p) || p.id) === key);
        if (existing) {
          const preferAr = hasArabic(c.name) ? c : hasArabic(existing.name) ? existing : c;
          const other = preferAr === c ? existing : c;
          finalMap.delete([...finalMap.entries()].find(([, v]) => v === existing)![0]);
          finalMap.set(preferAr.id, {
            ...preferAr,
            name: preferAr.name || other.name,
            tradeName: preferAr.tradeName || other.tradeName || (other.name !== preferAr.name ? other.name : null),
            username: preferAr.username || other.username || 'Libra',
            email: preferAr.email || other.email,
            avatarUrl: preferAr.avatarUrl || other.avatarUrl,
            ownerName: preferAr.ownerName || other.ownerName,
          });
        } else {
          // If English-only "Libra Company" and no Arabic yet, keep but rename display if registry has Arabic
          finalMap.set(c.id, c);
        }
      }

      // Hard-remove English-only Libra Company card when Arabic Libra company exists
      const list = [...finalMap.values()];
      const hasArabicLibra = list.some(c => hasArabic(c.name) && /ليبر/.test(String(c.name)));
      const mapped = list
        .filter(c => {
          if (hasArabicLibra && !hasArabic(c.name) && /libra\s*company/i.test(String(c.name || ''))) return false;
          if (/nadoosha/i.test(String(c.name || c.username || ''))) return false;
          return true;
        })
        .map(c => {
          // Ensure Arabic Libra opens the English Libra profile (username Libra)
          if (hasArabic(c.name) && /ليبر/.test(String(c.name)) && !c.username) {
            return { ...c, username: 'Libra' };
          }
          return c;
        })
        .sort((a, b) => (a.name || a.username || '').localeCompare(b.name || b.username || '', 'ar'));

      try {
        localStorage.setItem(
          'stooorna_companies_directory',
          JSON.stringify(mapped.filter(c => !String(c.id).startsWith('local-company-')).slice(0, 500)),
        );
      } catch { /* ignore */ }

      setCompanies(mapped);
    } catch {
      setCompanies([]);
    } finally {
      setCompaniesLoading(false);
    }
  };


  const loadSecretChats = async () => {
    try {
      const r = await fetch('/api/secret-chat', {
        credentials: 'include'
      });
      if (!r.ok) return;
      const data: SecretChat[] = await r.json();
      setSecretChats(data);
    } catch {/* silent */}
  };
  const loadHighlights = async () => {
    try {
      const r = await fetch('/api/highlights', {
        credentials: 'include'
      });
      if (!r.ok) return;
      const ids: string[] = await r.json();
      setHighlightedIds(new Set(ids));
    } catch {/* silent */}
  };
  useEffect(() => {
    if (!user) return;
    loadFriends();
    loadHighlights();
    // Poll highlights every 10s — also re-runs on tick (every 3s from useAutoRefresh)
    const interval = setInterval(loadHighlights, 10_000);
    return () => {
      clearInterval(interval);
    };
  }, [user, tick]);

  // ── Background polling: detect new messages in ALL secret chats (for blinking) ──
  const scBgPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!user || secretChats.length === 0) return;
    async function bgPollAll() {
      for (const sc of secretChats) {
        // Skip the currently open chat (already polled inside)
        if (activeChat?.id === sc.id) continue;
        try {
          const r = await fetch(`/api/secret-chat/messages?chatId=${sc.id}`, {
            credentials: 'include'
          });
          if (!r.ok) continue;
          const msgs = await r.json();
          if (!Array.isArray(msgs)) continue;
          const prev = scLastCountRef.current[sc.id] ?? msgs.length;
          if (msgs.length > prev) {
            // New message in a background chat
            const newest = msgs[msgs.length - 1];
            const isFromMe = newest?.sender_id === user?.id;
            if (!isFromMe) {
              // Add to unread set (blinking)
              setScUnreadChats(s => {
                const n = new Set(s);
                n.add(sc.id);
                return n;
              });
              // Show banner + sound
              const preview = newest.type === 'voice' ? '🎤 رسالة صوتية' : newest.type === 'image' ? '🖼 صورة' : newest.type === 'video' ? '🎬 فيديو' : newest.type === 'file' ? '📎 ملف' : (newest.body ?? '').slice(0, 60);
              showScNotif(sc.id, sc.name, newest.sender_name ?? newest.sender_username ?? 'شخص ما', preview);
            }
          }
          scLastCountRef.current[sc.id] = msgs.length;
        } catch {/* silent */}
      }
    }
    scBgPollRef.current = setInterval(bgPollAll, 6000);
    return () => {
      if (scBgPollRef.current) clearInterval(scBgPollRef.current);
    };
  }, [user, secretChats.length, activeChat?.id]);

  // Auto-switch to requests tab when there are incoming (only in add mode)
  useEffect(() => {
    if (incoming.length > 0 && tab === 'search' && friends.length === 0) {
      setTab('requests');
    }
  }, [incoming.length]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
          credentials: 'include'
        });
        const data = await r.json();
        setResults(Array.isArray(data) ? data : []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // ── Secret chat: auto-refresh polling + typing indicator ────────────────────
  useEffect(() => {
    if (!activeChat) {
      if (scPollRef.current) clearInterval(scPollRef.current);
      if (scTypingRef.current) clearInterval(scTypingRef.current);
      scPollRef.current = null;
      scTypingRef.current = null;
      setScTypingNames([]);
      return;
    }
    const chatId = activeChat.id;

    // Poll messages every 3 seconds
    async function pollMessages() {
      try {
        const mr = await fetch(`/api/secret-chat/messages?chatId=${chatId}`, {
          credentials: 'include'
        });
        if (!mr.ok) return;
        const msgs = await mr.json();
        if (!Array.isArray(msgs)) return;
        setChatMessages(prev => {
          const prevCount = prev.length;
          const newCount = msgs.length;
          if (newCount > prevCount) {
            // New message arrived — scroll to bottom
            setTimeout(() => chatBottomRef.current?.scrollIntoView({
              behavior: 'smooth'
            }), 80);
            // Show banner only if chat is open (user is already inside)
            const newest = msgs[msgs.length - 1];
            const isFromMe = newest?.sender_id === user?.id;
            if (!isFromMe && newest) {
              const preview = newest.type === 'voice' ? '🎤 رسالة صوتية' : newest.type === 'image' ? '🖼 صورة' : newest.type === 'video' ? '🎬 فيديو' : newest.type === 'file' ? '📎 ملف' : (newest.body ?? '').slice(0, 60);
              showScNotif(chatId, activeChat?.name ?? '', newest.sender_name ?? newest.sender_username ?? 'شخص ما', preview);
            }
          }
          return newCount !== prevCount ? msgs : prev;
        });
      } catch {/* silent */}
    }

    // Poll typing every 2 seconds
    async function pollTyping() {
      try {
        const tr = await fetch(`/api/secret-chat/typing?chatId=${chatId}`, {
          credentials: 'include'
        });
        if (!tr.ok) return;
        const data = (await tr.json()) as {
          typing: string[];
        };
        setScTypingNames(data.typing ?? []);
      } catch {/* silent */}
    }
    scPollRef.current = setInterval(pollMessages, 3000);
    scTypingRef.current = setInterval(pollTyping, 2000);
    return () => {
      if (scPollRef.current) clearInterval(scPollRef.current);
      if (scTypingRef.current) clearInterval(scTypingRef.current);
    };
  }, [activeChat?.id]);

  // Signal typing when user types in secret chat input
  const scTypingSignalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleScInputChange(val: string) {
    setChatInput(val);
    if (!activeChat) return;
    // Debounce: send typing signal at most once per 2s
    if (scTypingSignalRef.current) return;
    fetch(`/api/secret-chat/typing?chatId=${activeChat.id}`, {
      method: 'POST',
      credentials: 'include'
    }).catch(() => {});
    scTypingSignalRef.current = setTimeout(() => {
      scTypingSignalRef.current = null;
    }, 2000);
  }
  // ── متابعة/إضافة ناشر منشور نصي مباشرة من الفييد (زر Follow) ──────────────────
  // حساب عام (authorIsPrivate === false/undefined): إضافة فورية بلا انتظار.
  // حساب خاص (authorIsPrivate === true): يُرسل كطلب وينتظر قبول صاحب الحساب.
  async function followAuthorFromPost(post: PostItem) {
    if (guestGuard()) return;
    if (!user || post.authorId === user.id) return;
    const alreadyFriend = friends.some(f => f.friendId === post.authorId);
    if (alreadyFriend || outgoingRequestedIds.has(post.authorId)) return;
    const willBeInstant = !post.authorIsPrivate;
    // تحديث متفائل فوري للواجهة
    if (willBeInstant) {
      setFriends(prev => [...prev, {
        id: -Date.now(),
        friendId: post.authorId,
        name: post.authorName,
        username: post.authorUsername,
        email: null,
        avatarUrl: post.authorAvatarUrl,
        since: new Date().toISOString(),
      }]);
    } else {
      setOutgoingRequestedIds(prev => new Set(prev).add(post.authorId));
    }
    try {
      const r = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ addresseeId: post.authorId }),
      });
      if (r.status === 409) {
        const data = await r.json() as { status?: 'accepted' | 'pending' };
        if (data.status === 'accepted') {
          setFriends(prev => prev.some(friend => friend.friendId === post.authorId) ? prev : [...prev, {
            id: -Date.now(), friendId: post.authorId, name: post.authorName, username: post.authorUsername,
            email: null, avatarUrl: post.authorAvatarUrl, since: new Date().toISOString(),
          }]);
        } else {
          setOutgoingRequestedIds(prev => new Set(prev).add(post.authorId));
        }
        return;
      }
      if (!r.ok) throw new Error('Failed to follow');
      const data = await r.json() as { status?: 'accepted' | 'pending' };
      if (data.status === 'accepted' && !willBeInstant) {
        setOutgoingRequestedIds(prev => { const next = new Set(prev); next.delete(post.authorId); return next; });
        setFriends(prev => prev.some(friend => friend.friendId === post.authorId) ? prev : [...prev, {
          id: -Date.now(), friendId: post.authorId, name: post.authorName, username: post.authorUsername,
          email: null, avatarUrl: post.authorAvatarUrl, since: new Date().toISOString(),
        }]);
      }
    } catch {
      // فشل الطلب فعليًا — نرجّع الحالة كما كانت
      if (willBeInstant) {
        setFriends(prev => prev.filter(f => f.friendId !== post.authorId));
      } else {
        setOutgoingRequestedIds(prev => { const next = new Set(prev); next.delete(post.authorId); return next; });
      }
    }
  }

  async function sendRequest(addresseeId: string) {
    setSending(addresseeId);
    try {
      const response = await fetch('/api/friends', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          addresseeId
        })
      });
      const data = await response.json().catch(() => ({})) as { status?: 'accepted' | 'pending' };
      if (!response.ok && response.status !== 409) return;
      const status = data.status ?? 'pending';
      setResults(prev => prev.map(u => u.id === addresseeId ? {
        ...u,
        friendStatus: status,
        iRequested: true
      } : u));
      await loadFriends();
    } catch {/* silent */} finally {
      setSending(null);
    }
  }
  async function respond(id: number, action: 'accept' | 'reject') {
    setResponding(id);
    try {
      await fetch(`/api/friends/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          action
        })
      });
      setIncoming(prev => prev.filter(r => r.id !== id));
      if (action === 'accept') await loadFriends();
    } catch {/* silent */} finally {
      setResponding(null);
    }
  }
  async function removeFriend(friendUserId: string) {
    setRemovingFriendId(friendUserId);
    try {
      await fetch(`/api/friends/${friendUserId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      setFriends(prev => prev.filter(f => f.friendId !== friendUserId));
    } catch {/* silent */} finally {
      setRemovingFriendId(null);
      setConfirmRemoveFriend(null);
    }
  }
  async function blockFriend(friend: Friend) {
    setBlockingFriendId(friend.friendId);
    try {
      // Remove friend first
      await fetch(`/api/friends/${friend.friendId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      // Then block
      await fetch('/api/users/block', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          targetId: friend.friendId,
          action: 'block'
        })
      });
      setFriends(prev => prev.filter(f => f.friendId !== friend.friendId));
    } catch {/* silent */} finally {
      setBlockingFriendId(null);
      setConfirmBlockFriend(null);
    }
  }
  async function createSecretChat() {
    if (!scName.trim()) return;
    if (!/^\d{4,8}$/.test(scPin)) {
      setScError('الرقم السري يجب أن يكون 4-8 أرقام');
      return;
    }
    setScCreating(true);
    setScError('');
    try {
      const r = await fetch('/api/secret-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          name: scName.trim(),
          pin: scPin,
          memberIds: scSelectedMembers
        })
      });
      const data = await r.json();
      if (!r.ok) {
        setScError(data?.error ?? 'فشل الإنشاء');
        return;
      }
      await loadSecretChats();
      setShowNewSecret(false);
      setScName('');
      setScPin('');
      setScSelectedMembers([]);
      setScError('');
    } catch (e) {
      setScError(String(e));
    } finally {
      setScCreating(false);
    }
  }
  async function verifyAndOpenChat() {
    if (!openingChat || !openPin) return;
    setOpenPinChecking(true);
    setOpenPinError('');
    try {
      const r = await fetch('/api/secret-chat/verify-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          chatId: openingChat.id,
          pin: openPin
        })
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setOpenPinError('رقم سري خاطئ');
        return;
      }
      // Load messages
      const mr = await fetch(`/api/secret-chat/messages?chatId=${openingChat.id}`, {
        credentials: 'include'
      });
      const msgs = await mr.json();
      setChatMessages(Array.isArray(msgs) ? msgs : []);
      // Record current count so polling doesn't re-fire for existing messages
      scLastCountRef.current[openingChat.id] = Array.isArray(msgs) ? msgs.length : 0;
      // Clear unread indicator + mark read on server
      setScUnreadChats(s => {
        const n = new Set(s);
        n.delete(openingChat.id);
        return n;
      });
      fetch('/api/secret-chat/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ chatId: openingChat.id }),
      }).catch(() => {});
      setActiveChat(openingChat);
      setOpeningChat(null);
      setOpenPin('');
      setTimeout(() => chatBottomRef.current?.scrollIntoView({
        behavior: 'smooth'
      }), 100);
    } catch {
      setOpenPinError('حدث خطأ');
    } finally {
      setOpenPinChecking(false);
    }
  }
  async function callActiveSecretChat() {
    if (!activeChat || !user) return;
    try {
      let members: Array<{
        id: string;
        name?: string | null;
        username?: string | null;
        avatarUrl?: string | null;
      }> = [];
      try {
        const mr = await fetch(`/api/secret-chat/members?chatId=${activeChat.id}`, {
          credentials: 'include'
        });
        if (mr.ok) {
          const data = await mr.json();
          members = Array.isArray(data) ? data : data.members ?? [];
        }
      } catch {}

      // Fallback: use the participants already present in the loaded chat messages.
      if (members.length === 0) {
        const seen = new Set<string>();
        members = chatMessages.filter(m => m.sender_id && m.sender_id !== user.id && !seen.has(m.sender_id)).map(m => {
          seen.add(m.sender_id);
          return {
            id: m.sender_id,
            name: m.sender_name ?? null,
            username: m.sender_username ?? null,
            avatarUrl: m.sender_avatar_url ?? null
          };
        });
      }
      const peers = members.filter(m => m.id && m.id !== user.id);
      if (peers.length === 0) return;
      const channel = `secret_${activeChat.id}`;
      peers.forEach(peer => {
        startCall({
          peerId: peer.id,
          peerName: peer.name ?? peer.username ?? 'Secret Chat',
          peerUsername: peer.username ?? undefined,
          peerAvatar: peer.avatarUrl ?? null,
          isConference: peers.length > 1,
          channel
        });
      });
    } catch (error) {
      console.error('[SecretChat] call failed:', error);
    }
  }
  async function sendChatMessage() {
    if (!activeChat || !chatInput.trim()) return;
    setChatSending(true);
    try {
      await fetch('/api/secret-chat/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          chatId: activeChat.id,
          body: chatInput.trim()
        })
      });
      setChatInput('');
      const mr = await fetch(`/api/secret-chat/messages?chatId=${activeChat.id}`, {
        credentials: 'include'
      });
      const msgs = await mr.json();
      setChatMessages(Array.isArray(msgs) ? msgs : []);
      setTimeout(() => chatBottomRef.current?.scrollIntoView({
        behavior: 'smooth'
      }), 80);
    } catch {/* silent */} finally {
      setChatSending(false);
    }
  }
  async function scRefreshMessages() {
    if (!activeChat) return;
    const mr = await fetch(`/api/secret-chat/messages?chatId=${activeChat.id}`, {
      credentials: 'include'
    });
    const msgs = await mr.json();
    setChatMessages(Array.isArray(msgs) ? msgs : []);
    setTimeout(() => chatBottomRef.current?.scrollIntoView({
      behavior: 'smooth'
    }), 80);
  }
  async function scSendImage(file: File) {
    if (!activeChat) return;
    try {
      await fetch(`/api/secret-chat/image?chatId=${activeChat.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': file.type
        },
        credentials: 'include',
        body: file
      });
      await scRefreshMessages();
    } catch {/* silent */}
  }
  async function scSendFile(file: File) {
    if (!activeChat) return;
    try {
      await fetch(`/api/secret-chat/file?chatId=${activeChat.id}&name=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        headers: {
          'Content-Type': file.type
        },
        credentials: 'include',
        body: file
      });
      await scRefreshMessages();
    } catch {/* silent */}
  }
  async function scStartRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/webm';
      const recorder = new MediaRecorder(stream, {
        mimeType
      });
      scAudioChunksRef.current = [];
      recorder.ondataavailable = e => {
        if (e.data.size > 0) scAudioChunksRef.current.push(e.data);
      };
      recorder.start(100);
      scMediaRecorderRef.current = recorder;
      setScIsRecording(true);
      setScRecordSecs(0);
      scRecordTimerRef.current = setInterval(() => setScRecordSecs(s => s + 1), 1000);
    } catch {/* mic denied */}
  }
  async function scStopRecording(send: boolean) {
    if (scRecordTimerRef.current) {
      clearInterval(scRecordTimerRef.current);
      scRecordTimerRef.current = null;
    }
    const recorder = scMediaRecorderRef.current;
    if (!recorder) return;
    recorder.stop();
    recorder.stream.getTracks().forEach(t => t.stop());
    scMediaRecorderRef.current = null;
    setScIsRecording(false);
    if (!send) {
      setScRecordSecs(0);
      return;
    }
    await new Promise<void>(resolve => {
      recorder.onstop = () => resolve();
    });
    const blob = new Blob(scAudioChunksRef.current, {
      type: recorder.mimeType || 'audio/webm'
    });
    if (blob.size < 500 || !activeChat) {
      setScRecordSecs(0);
      return;
    }
    try {
      const duration = scRecordSecs;
      await fetch(`/api/secret-chat/voice?chatId=${activeChat.id}&duration=${duration}`, {
        method: 'POST',
        headers: {
          'Content-Type': blob.type
        },
        credentials: 'include',
        body: blob
      });
      await scRefreshMessages();
    } catch {/* silent */}
    setScRecordSecs(0);
  }
  async function leaveSecretChat(chat: SecretChat) {
    setLeavingChatId(chat.id);
    try {
      await fetch('/api/secret-chat/leave', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          chatId: chat.id
        })
      });
      if (activeChat?.id === chat.id) setActiveChat(null);
      await loadSecretChats();
      setConfirmLeaveChat(null);
    } catch {/* silent */} finally {
      setLeavingChatId(null);
    }
  }
  async function deleteSecretChat(chat: SecretChat) {
    setDeletingChatId(chat.id);
    try {
      const r = await fetch('/api/secret-chat/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          chatId: chat.id
        })
      });
      const data = await r.json();
      if (!r.ok) {
        console.error('[deleteSecretChat]', data?.error);
        return;
      }
      if (activeChat?.id === chat.id) setActiveChat(null);
      await loadSecretChats();
      setConfirmDeleteChat(null);
    } catch {/* silent */} finally {
      setDeletingChatId(null);
    }
  }
  if (isPending) return null;
  // الزوار يرون الصفحة — التفاعل يُوقفه useGuestGuard

  // ── Determine page mode from URL ──────────────────────────────────────────
  // /add-friend?tab=friends  → Friends-only page
  // /add-friend?tab=groups   → Groups-only page
  // /add-friend (no tab)     → Add page: Search + Requests only
  // (pageMode + addTab are derived above near state declarations)

  // Page title
  const pageTitle = 'Chat';

  return <>
      <GlobalCallBanner />
      <GlobalIncomingCallBanner myUserId={user?.id ?? null} myUserName={user?.name ?? user?.email ?? null} />
      <GlobalIncomingCallWatcher myUserId={user?.id ?? null} myUserName={user?.name ?? user?.email ?? null} />
      <Helmet>
        <title>Chat | Stooorna</title>
        <meta name="description" content="Find friends, send requests, and manage your contacts on Stooorna — the real-time voice and whisper app." />
        <link rel="canonical" href="https://stooorna.com/add-friend" />
        <meta property="og:title" content="Chat | Stooorna" />
        <meta property="og:description" content="Find friends, send requests, and manage your contacts on Stooorna." />
        <meta property="og:image" content="https://stooorna.com/og-image.svg" />
        <meta property="og:url" content="https://stooorna.com/add-friend" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://stooorna.com/og-image.svg" />
        <meta name="robots" content="noindex, nofollow" />
        {/* خط "Alexandria" — يستخدم لنص المنشورات النصية العربية (نفس شكل الخط المطلوب) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Alexandria:wght@400;500;600;700&display=swap" />
      </Helmet>
      <h1 className="sr-only">{pageTitle}</h1>

      <div className="flex flex-col" style={{
      minHeight: '100dvh',
      background: PAGE_BG,
      fontFamily: 'var(--font-sans)'
    }}>

        {!isFriendManagement && <>
        {/* ── Header ── */}
        <div className="sticky top-0 z-20" style={{
          position: 'relative',
          paddingTop: 40,
          background: CLR_HEADER_BG,
          backdropFilter: 'blur(14px)',
          borderBottom: `1px solid ${CLR_NAV_BORDER}`,
        }}>
          {/* ── Top hamburger menu — aligned with the username/bio line, and now hides along
              with everything else when the header collapses (fades out + becomes
              non-interactive, matching the fog overlay's own transition). Opens a
              small menu with Music and the Posts-box (shared inbox), keeping those two features
              tucked away instead of taking their own row. ── */}
          {/* قائمة الثلاث خطوط أُزيلت بالكامل من الهوم — الموسيقى في الإعدادات */}

          {/* Animated radar (text posts) button - now in the bottom bar (RootLayout) */}


          {/* ── Everything above the Video|Post|Photo switcher (music button, avatar/stats
              row, stories strip, new-post + inbox icons) collapses together as one shutter,
              toggled only by the grabber bar below — never by scrolling. A dark blurred fog
              overlay covers it first, so nothing is ever seen half-cut mid-collapse — closing
              fogs it over immediately then the space shrinks away behind the fog; opening
              expands the space first, then the fog lifts to reveal everything cleanly. ── */}
          <div style={{
            display: 'grid',
            gridTemplateRows: headerOpen ? '1fr' : '0fr',
            transition: 'grid-template-rows 320ms cubic-bezier(0.22,1,0.36,1)',
          }}>
            <div style={{ overflow: 'hidden', paddingTop: 12, position: 'relative' }}>
              {/* Fog overlay */}
              <div aria-hidden style={{
                position: 'absolute', inset: 0, zIndex: 6,
                background: 'rgba(4,8,8,0.95)',
                backdropFilter: 'blur(22px)',
                WebkitBackdropFilter: 'blur(22px)',
                opacity: headerOpen ? 0 : 1,
                pointerEvents: headerOpen ? 'none' : 'auto',
                transition: headerOpen
                  ? 'opacity 240ms ease-out 200ms'
                  : 'opacity 140ms ease-in',
              }} />

          {/* Row 1 + Row 2: story circle + stats, then the friends' stories strip */}
          {pageTab === 'profile' && (
          <div>
          {/* Row 1: story circle + Post/Followers/Following — restored to its original place. The Inbox
              (shared-posts / my story posts) button now lives in the unified nav row below, always visible.
              The decorative Globe next to "Following" has been removed. */}
          {pageTab === 'profile' && (
            <div className="flex items-center px-5" style={{ paddingBottom: 8, gap: 14 }}>
              {/* ── My story circle — same place as before ── */}
              {user && (() => {
                const myGroup = storyGroups.find(g => g.userId === user?.id);
                const hasStory = !!myGroup && myGroup.items.length > 0;
                const allSeen = hasStory && myGroup!.items.every(i => i.seen);
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, marginTop: -12, marginLeft: -6, flexShrink: 0 }}>
                    <div style={{ width: 76, height: 76, position: 'relative' }}>
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => {
                          if (myGroup) {
                            setViewerGroupIdx(storyGroups.indexOf(myGroup));
                          } else {
                            // بدون قائمة Photo/Video — افتح قائمة النشر (قصة / كاميرا)
                            setPublishMenuOpen(true);
                          }
                        }}
                        disabled={storyUploading}
                        style={{ width: 76, height: 76, borderRadius: '50%', padding: 0, background: 'none', border: 'none', cursor: 'pointer', position: 'relative' }}
                      >
                        {/* One fixed circular frame: the photo is clipped inside it and can never overflow. */}
                        {/* إطار أزرق ثابت + صورة ثابتة */}
                        <div style={{
                          position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden',
                          background: 'hsl(var(--card))',
                          border: hasStory ? '4px solid #0ea5e9' : '3px solid #0ea5e9',
                          boxSizing: 'border-box',
                          boxShadow: hasStory && !allSeen ? '0 0 10px rgba(14,165,233,0.45)' : '0 0 8px rgba(14,165,233,0.25)',
                        }}>
                          <UserAvatar name={user?.name ?? ''} avatarUrl={(user as any)?.avatarUrl ?? null} size={68} style={{ width: '100%', height: '100%', border: 'none', boxShadow: 'none', borderRadius: '50%', display: 'block' }} />
                        </div>
                      </motion.button>
                      {/* + badge — its own button now: always opens the نشر إعلان للقصة/صورة/فيديو
                          menu, whether or not a story already exists. */}
                      <motion.button
                        whileTap={{ scale: 0.88 }}
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
                        onClick={e => { e.stopPropagation(); setQuickPublishError(''); setPublishMenuOpen(true); }}
                        disabled={storyUploading || quickPublishing}
                        aria-label="خيارات النشر"
                        style={{
                          position: 'absolute', bottom: 1, right: 1,
                          width: 22, height: 22, borderRadius: '50%',
                          background: '#ef4444',
                          border: '2.5px solid hsl(var(--background))',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          padding: 0, cursor: 'pointer',
                          boxShadow: '0 0 8px rgba(239,68,68,0.55)',
                        }}
                      >
                        {storyUploading || quickPublishing
                          ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                              style={{ width: 9, height: 9, borderRadius: '50%', border: '2px solid #fff', borderTopColor: 'transparent' }} />
                          : <Plus size={12} strokeWidth={3} color="#fff" />
                        }
                      </motion.button>
                    </div>
                    <span style={{ fontSize: '0.58rem', color: 'hsl(var(--primary)/0.8)', fontWeight: 500 }}>
                      قصتي
                    </span>
                  </div>
                );
              })()}

              {/* ── Username | Bio (same line, spaced apart with a divider) / Post-Followers-Following-Likes (untouched) ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginLeft: 6, flex: 1 }}>
                {/* Pinned track — shown right above my name/username, playable from here too. */}
                {pinnedTrack && <PinnedTrackBar track={pinnedTrack} />}
                {(myUsername || myBio) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {myUsername && (
                      <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#ffffff', lineHeight: 1.2, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        @{myUsername}
                        {businessApproved && (
                          <span style={{
                            fontSize: '0.55rem', fontWeight: 900, color: '#0a0a0a',
                            background: '#eab308', borderRadius: 5, padding: '2px 6px',
                            letterSpacing: '0.03em',
                          }}>Business</span>
                        )}
                      </span>
                    )}
                    {myUsername && myBio && (
                      <span style={{ fontSize: '0.78rem', fontWeight: 400, color: '#ffffff', opacity: 0.5 }}>|</span>
                    )}
                    {myBio && (
                      <span style={{ fontSize: '0.72rem', fontWeight: 500, color: '#ffffff', lineHeight: 1.4 }}>
                        {myBio}
                      </span>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: CLR_TEXT }}>{myMediaPosts.length}</span>
                    <span style={{ fontSize: '0.65rem', color: CLR_TEXT_DIM }}>Post</span>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.94 }}
                    onClick={() => setFollowersModalOpen(true)}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  >
                    {!followersVisible ? (
                      <Lock size={14} strokeWidth={2.2} color={CLR_TEXT_DIM} />
                    ) : (
                      <span style={{ fontSize: '0.95rem', fontWeight: 700, color: CLR_TEXT }}>{friends.length}</span>
                    )}
                    <span style={{ fontSize: '0.65rem', color: CLR_TEXT_DIM }}>Followers</span>
                  </motion.button>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: CLR_TEXT }}>
                      {(() => { void viewsTick; return resolveProfileViewsCount(user as any, [...myMediaPosts, ...posts.filter(p => user && String(p.authorId) === String(user.id))]); })()}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: CLR_TEXT_DIM }}>Views</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: CLR_TEXT }}>{myMediaLikesTotal}</span>
                    <span style={{ fontSize: '0.65rem', color: CLR_TEXT_DIM }}>Likes</span>
                  </div>
                  {businessApproved && (
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.9 }}
                      onClick={() => { setMyAdsHubTab('video'); setMyAdsHubOpen(true); }}
                      aria-label="My Ads"
                      style={{
                        marginLeft: 'auto', width: 28, height: 28, borderRadius: '50%', border: '2px solid #eab308',
                        background: 'rgba(234,179,8,0.2)', color: '#eab308', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                        boxShadow: '0 0 10px rgba(234,179,8,0.45)',
                        flexShrink: 0,
                      }}
                    >
                      <span style={{ fontSize: '0.55rem', fontWeight: 900, letterSpacing: '-0.02em' }}>Ads</span>
                    </motion.button>
                  )}

                </div>
              </div>
            </div>
          )}

          {/* Row 2: Friends' stories strip — shown under the story circle on the PROFILE tab */}
          {pageTab === 'profile' && (
            <>
              <style>{`
                .header-stories::-webkit-scrollbar{display:none}
                @keyframes story-ring-shimmer-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                .story-ring-shimmer { animation: story-ring-shimmer-spin 2.4s linear infinite; }
              `}</style>
              <div
                className="header-stories"
                style={{
                  display: 'flex', flexDirection: 'row', flexWrap: 'nowrap',
                  gap: 10, overflowX: 'auto', overflowY: 'hidden',
                  scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
                  padding: '2px 14px 10px',
                  alignItems: 'center',
                }}
              >
                {/* ستوريات المستخدمين فقط في شريط الهيدر — الشركات في تبويب Company */}
                {storyGroups.filter(g => {
                  if (g.userId === user?.id) return false;
                  return !isCompanyUserAccount({ id: g.userId, username: g.username, name: g.name }, companies);
                }).map((g) => {
                  const realIdx = storyGroups.indexOf(g);
                  const hasUnseen = g.items.some(it => !it.seen);
                  return (
                    <div key={g.userId} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setViewerGroupIdx(realIdx)}
                        style={{ width: 60, height: 60, borderRadius: '50%', padding: 0, background: 'none', border: 'none', cursor: 'pointer', position: 'relative' }}
                      >
                        {/* حلقة بلونين فقط: أصفر كامل ما دام في عنصر غير مُشاهَد،
                            وأزرق كامل (نفس أزرق دائرة "قصتي") بعد مشاهدة كل العناصر */}
                        <div style={{
                          position: 'absolute', inset: 0, borderRadius: '50%',
                          background: storyRingColor(g.items, '#facc15', '#0ea5e9'),
                          padding: 3, boxSizing: 'border-box',
                          boxShadow: hasUnseen ? '0 0 8px rgba(250,204,21,0.45)' : 'none',
                        }}>
                          {/* وميض دوّار يظهر فقط داخل شريط الحلقة الزرقاء (بعد المشاهدة)
                              ليثبت إن فيه ستوري حالي — الحلقة الصفراء تبقى ثابتة بدون حركة */}
                          {!hasUnseen && g.items.length > 0 && (
                            <div
                              className="story-ring-shimmer"
                              style={{
                                position: 'absolute', inset: 0, borderRadius: '50%',
                                background: 'conic-gradient(from 0deg, transparent 0%, transparent 80%, rgba(224,242,254,0.95) 92%, #38bdf8 97%, transparent 100%)',
                              }}
                            />
                          )}
                          <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', background: 'hsl(var(--card))' }}>
                            <UserAvatar name={g.name} avatarUrl={g.avatarUrl} size={53} style={{ width: '100%', height: '100%', border: 'none', boxShadow: 'none', borderRadius: '50%', display: 'block' }} />
                          </div>
                        </div>
                      </motion.button>
                      <span style={{ fontSize: '0.55rem', color: CLR_TEXT_DIM, maxWidth: 60, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {g.username ? `@${g.username}` : g.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          </div>
          )}

          {/* Actions row removed — text-posts button now lives in the header next to the globe. */}
            </div>
          </div>

          {/* ── Header show/hide grabber — sits exactly above the Video|Post|Photo switcher.
              Tapping it toggles the whole header above it open/closed like a shutter.
              It bounces gently up/down on a loop until the user taps it once, to draw the
              eye toward the feature — then it settles down and stays still. ── */}
          <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 4 }}>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => { setHeaderOpen(o => !o); setHeaderHintSeen(true); }}
              aria-label={headerOpen ? 'إخفاء الهيدر' : 'إظهار الهيدر'}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '8px 30px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <motion.span
                animate={headerHintSeen ? { y: 0 } : { y: [0, -5, 0, -5, 0] }}
                transition={headerHintSeen ? { duration: 0.2 } : {
                  duration: 1.6, repeat: Infinity, repeatDelay: 0.9, ease: 'easeInOut',
                }}
                style={{
                  display: 'block',
                  width: 36, height: 4, borderRadius: 2,
                  background: CLR_PRIMARY_BORDER,
                }}
              />
            </motion.button>
          </div>


          {/* Content header — single Post section */}
          {pageTab === 'profile' && (
            <div style={{ padding: '0 0 8px' }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '9px 4px', marginBottom: 8,
                borderTop: `1px solid ${CLR_TAB_BORDER}`, borderBottom: `1px solid ${CLR_TAB_BORDER}`,
                color: CLR_PRIMARY, fontSize: '0.72rem', fontWeight: 800,
                background: CLR_TAB_ACTIVE,
              }}>
                <FileText size={14} strokeWidth={2} />
                {isCompanyPublisher ? 'المنتجات' : 'Post'}
              </div>
              <div style={{ height: 1, background: CLR_NAV_BORDER }} />
            </div>
          )}
        </div>
        </>}

        {/* ── Content ── */}
        <style>{`.profile-content-scroll::-webkit-scrollbar{display:none}`}</style>
        <div className="profile-content-scroll flex flex-col px-0 pt-2 pb-28 flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{
          WebkitOverflowScrolling: 'touch',
          willChange: 'scroll-position',
          contain: 'strict',
          scrollbarWidth: 'none',
        }}>
          <AnimatePresence mode="wait">

            {/* ══ Post page — stories live in the header above; text posts sit directly under the
                stories strip behind the STOOORNA divider, and the personal media grid follows further
                down. The separate FEED tab has been merged into this single page. ══ */}
            {pageTab === 'profile' && <motion.div key="profile-tab" initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} className="flex flex-col">

                {/* Hidden file input for story upload */}
                <input
                  ref={storyFileRef}
                  type="file"
                  accept="image/*,video/*"
                  style={{ display: 'none' }}
                  onChange={async e => {
                    const file = e.target.files?.[0];
                    if (file) await uploadStory(file);
                    e.target.value = '';
                  }}
                />
                {/* Hidden file input for adding extra media from inside viewer */}
                <input
                  ref={storyAddFileRef}
                  type="file"
                  accept="image/*,video/*"
                  style={{ display: 'none' }}
                  onChange={async e => {
                    const file = e.target.files?.[0];
                    if (file) await uploadStory(file);
                    e.target.value = '';
                  }}
                />

                {/* ══ Call rectangle — hidden by default on your own profile; appears here, right
                    above the tab switcher, the moment someone actually opens your profile, and
                    disappears again once they leave. Never shown otherwise. ══ */}
                {profileVisitors.length > 0 && user && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', direction: 'ltr', padding: '6px 16px 2px' }}>
                    <GlobeVoiceControl
                      userId={user.id}
                      userName={user.name ?? user.email ?? 'مستخدم'}
                      avatarUrl={(user as any)?.avatarUrl ?? null}
                      peerId={profileVisitors[0].userId}
                      hasProfileVisitor
                      profileVisitors={profileVisitors}
                    />
                  </div>
                )}


                {/* ── My posts (text posts + publicly-published photos/videos, Video/Photo
                    grids removed — everything I publish lands here). Same as the story/friend
                    profile page: shown three-per-row regardless of type (text+video, text
                    alone, or text+image), pinned post first. Tapping any tile opens the full
                    post page the same way a text post opens (openTextPostDetail). ── */}
                {(() => {
                  let myTextPosts = combinedFeedPosts.filter(p =>
                    !!user && String(p.authorId) === String(user.id)
                  );
                  // Single Post section — show all posts (no Video/Photo split)
                  ;
                  // المنشور المثبّت (إن وُجد) يظهر أولًا، والباقي يتبعه بترتيبه الطبيعي
                  if (pinnedPostId !== null) {
                    const pinnedIndex = myTextPosts.findIndex(p => p.id === pinnedPostId);
                    if (pinnedIndex > 0) {
                      const [pinned] = myTextPosts.splice(pinnedIndex, 1);
                      myTextPosts.unshift(pinned);
                    }
                  }
                  if (myTextPosts.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center gap-3" style={{ paddingTop: 32 }}>
                        <div style={{
                          width: 52, height: 52, borderRadius: '50%',
                          background: CLR_PRIMARY_FAINT, border: `1px solid ${CLR_PRIMARY_BORDER}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', color: CLR_PRIMARY_DIM,
                        }}>
                          <FileText size={20} strokeWidth={1.5} />
                        </div>
                        <p style={{ color: CLR_TEXT_DIM, fontSize: '0.82rem', textAlign: 'center', maxWidth: 220, lineHeight: 1.6 }}>
                          لا توجد منشورات نصية بعد
                        </p>
                      </div>
                    );
                  }
                  const enrichedMyPosts = myTextPosts.map(post => {
                    const rawThumbUrl = post.mediaUrls?.[0] ?? post.mediaUrl;
                    const rawIsVideo = (post.mediaTypes?.[0] ?? post.mediaType) === 'video';
                    // إذا المنشور بدون وسائط مرفقة لكن نصّه يحتوي رابط صورة/فيديو مباشر —
                    // نستخرجه ونعرضه كصورة/فيديو مصغّر بدل ترك الرابط الخام يظهر كنص عادي.
                    const productAd = parseProductAd(post.text);
                    const textEmbed = !rawThumbUrl && post.text && !productAd ? extractTextMediaEmbeds(post.text) : null;
                    const embeddedMedia = textEmbed?.embeds?.[0] ?? null;
                    const thumbUrl = rawThumbUrl ?? embeddedMedia?.url;
                    const isVideo = rawThumbUrl ? rawIsVideo : embeddedMedia?.type === 'video';
                    const displayText = productAd
                      ? [productAd.title, productAd.price].filter(Boolean).join(' · ')
                      : textEmbed ? textEmbed.cleanText : post.text;
                    const isPinnedPost = pinnedPostId === post.id;
                    return { post, thumbUrl, isVideo, displayText, isPinnedPost };
                  });
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
                      {enrichedMyPosts.map(({ post, thumbUrl, isVideo, displayText, isPinnedPost }) => (
                        <button
                          key={post.repostKey ?? post.id}
                          type="button"
                          onClick={() => openSinglePostView(post)}
                          aria-label={thumbUrl ? (isVideo ? 'فتح الفيديو' : 'فتح الصورة') : 'فتح المنشور'}
                          style={{
                            position: 'relative', width: '100%', aspectRatio: '1 / 1', overflow: 'hidden',
                            border: isPinnedPost ? '3px solid #ef4444' : 'none', boxSizing: 'border-box', padding: 0,
                            background: thumbUrl ? '#000' : CLR_CARD_BG, cursor: 'pointer', display: 'block',
                          }}
                        >
                          {thumbUrl ? (
                            <>
                              {isVideo ? (
                                <video src={thumbUrl} muted autoPlay loop playsInline preload="auto" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              ) : (
                                <img src={thumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              )}
                              {isVideo && (
                                <div style={{ position: 'absolute', top: 6, insetInlineEnd: 6 }}>
                                  <Play size={13} strokeWidth={2.4} color="#fff" fill="#fff" />
                                </div>
                              )}
                            </>
                          ) : (
                            <div style={{
                              width: '100%', height: '100%', padding: '8px 7px',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              border: `1px solid ${CLR_CARD_BORDER}`, boxSizing: 'border-box',
                            }}>
                              <p style={{
                                color: CLR_TEXT, fontSize: '0.64rem', lineHeight: 1.45, margin: 0,
                                textAlign: 'center',
                                display: '-webkit-box', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                              }}>
                                {displayText}
                              </p>
                            </div>
                          )}
                          {/* المنشور المثبّت يبين بالأحمر */}
                          {isPinnedPost && (
                            <div style={{
                              position: 'absolute', top: 6, insetInlineStart: 6,
                              color: '#ef4444', filter: thumbUrl ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.7))' : 'none',
                              display: 'flex', alignItems: 'center',
                            }}>
                              <Pin size={15} strokeWidth={2.6} fill="#ef4444" />
                            </div>
                          )}
                          <PostGridTimeFooter createdAt={post.createdAt} onMedia={!!thumbUrl} />
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </motion.div>}

            {/* ══ ADD TAB: Search + Requests ══ */}
            {pageTab === 'add' && <motion.div key="add-tab" initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} className="flex flex-col gap-4">

                {/* Inner sub-tabs: Search | Requests */}
                <div className="flex" style={{
              borderBottom: `1px solid ${CLR_NAV_BORDER}`
            }}>
                  {([{
                key: 'search' as const,
                label: 'Search',
                badge: 0
              }, {
                key: 'requests' as const,
                label: 'Requests',
                badge: incoming.length
              }] as const).map(st => <button key={st.key} onClick={() => setTab(st.key)} style={{
                flex: 1,
                padding: '10px 4px',
                background: 'none',
                border: 'none',
                borderBottom: tab === st.key ? `2px solid ${CLR_PRIMARY}` : '2px solid transparent',
                color: tab === st.key ? CLR_PRIMARY : CLR_TEXT_DIM,
                fontSize: '0.72rem',
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5
              }}>
                      {st.label}
                      {st.badge > 0 && <span style={{
                  background: tab === st.key ? CLR_PRIMARY : CLR_PRIMARY_DIM,
                  color: tab === st.key ? '#060e0e' : CLR_PRIMARY,
                  borderRadius: 10,
                  padding: '1px 6px',
                  fontSize: '0.6rem',
                  fontWeight: 700
                }}>
                          {st.badge}
                        </span>}
                    </button>)}
                </div>

                {/* Search sub-tab */}
                {tab === 'search' && <div className="flex flex-col gap-4">
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{
                  color: CLR_PRIMARY_DIM
                }}>
                        <Search size={16} strokeWidth={2} />
                      </div>
                      <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by username or name…" autoFocus style={{
                  width: '100%',
                  background: CLR_INPUT_BG,
                  border: `1px solid ${CLR_PRIMARY_BORDER}`,
                  borderRadius: 10,
                  padding: '12px 14px 12px 38px',
                  color: CLR_TEXT,
                  fontSize: '0.9rem',
                  outline: 'none',
                  boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.4)'
                }} />
                      {searching && <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <motion.div animate={{
                    rotate: 360
                  }} transition={{
                    duration: 0.8,
                    repeat: Infinity,
                    ease: 'linear'
                  }} style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    border: `2px solid ${CLR_PRIMARY_DIM}`,
                    borderTopColor: CLR_PRIMARY
                  }} />
                        </div>}
                    </div>

                    <AnimatePresence>
                      {results.length > 0 && <motion.div initial={{
                  opacity: 0,
                  y: 8
                }} animate={{
                  opacity: 1,
                  y: 0
                }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} className="flex flex-col gap-2">
                          <p style={{
                    color: CLR_TEXT_DIM,
                    fontSize: '0.65rem',
                    letterSpacing: '0.25em',
                    textTransform: 'uppercase',
                    marginBottom: 4
                  }}>Results</p>
                          {results.map(u => {
                    const isRed = highlightedIds.has(u.id);
                    return <motion.div key={u.id} initial={{
                      opacity: 0,
                      x: -10
                    }} animate={{
                      opacity: 1,
                      x: 0
                    }} className="flex items-center justify-between rounded-xl px-4 py-3" style={{
                      background: isRed ? 'rgba(239,68,68,0.06)' : CLR_CARD_BG,
                      border: `1px solid ${isRed ? 'rgba(239,68,68,0.35)' : CLR_CARD_BORDER}`,
                      transition: 'all 0.2s'
                    }}>
                                <div className="flex items-center gap-3">
                                  <UserAvatar name={u.name ?? u.username ?? u.email} avatarUrl={u.avatarUrl} size={38} red={isRed} online={presence[u.id]?.online} />
                                  <div>
                                    <p style={{
                            color: CLR_TEXT,
                            fontSize: '0.88rem',
                            fontWeight: 500
                          }}>{u.name ?? '—'}</p>
                                    <p style={{
                            color: CLR_TEXT_DIM,
                            fontSize: '0.72rem',
                            fontWeight: 400
                          }}>
                                      {u.username ? <span style={{
                              color: isRed ? '#ef4444' : CLR_TEXT_DIM
                            }}>@{u.username}</span> : u.email}
                                    </p>
                                  </div>
                                </div>
                                {u.friendStatus === 'accepted' ? <motion.button whileTap={{
                        scale: 0.9
                      }} onClick={() => openShareMiniChat({ id: u.id, name: u.name, username: u.username, avatarUrl: u.avatarUrl })} style={{
                        background: 'rgba(0,188,212,0.12)',
                        border: `1px solid ${CLR_PRIMARY_BORDER}`,
                        borderRadius: 8,
                        padding: '6px 12px',
                        color: CLR_PRIMARY,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5
                      }}>
                                    <MessageCircle size={13} strokeWidth={2} />
                                    Chat
                                  </motion.button> : u.friendStatus === 'pending' ? <div style={{
                        color: CLR_PRIMARY_DIM,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}>
                                    <Clock size={14} strokeWidth={1.8} />
                                    <span style={{
                          fontSize: '0.7rem'
                        }}>Pending</span>
                                  </div> : <motion.button whileTap={{
                        scale: 0.9
                      }} onClick={() => sendRequest(u.id)} disabled={sending === u.id} style={{
                        background: sending === u.id ? CLR_PRIMARY_FAINT : 'rgba(0,188,212,0.12)',
                        border: `1px solid ${CLR_PRIMARY_BORDER}`,
                        borderRadius: 8,
                        padding: '6px 12px',
                        color: CLR_PRIMARY,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        opacity: sending === u.id ? 0.6 : 1
                      }}>
                                    <UserPlus size={13} strokeWidth={2} />
                                    Add
                                  </motion.button>}
                              </motion.div>;
                  })}
                        </motion.div>}
                    </AnimatePresence>

                    {query.length >= 2 && !searching && results.length === 0 && <motion.p initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} style={{
                color: CLR_TEXT_DIM,
                fontSize: '0.82rem',
                textAlign: 'center',
                marginTop: 8
              }}>
                        No users found for "{query}"
                      </motion.p>}

                    {query.length < 2 && <motion.div initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} className="flex flex-col items-center justify-center flex-1 gap-3" style={{
                paddingTop: 60
              }}>
                        <div style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: CLR_PRIMARY_FAINT,
                  border: `1px solid ${CLR_PRIMARY_BORDER}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: CLR_PRIMARY_DIM
                }}>
                          <Search size={26} strokeWidth={1.5} />
                        </div>
                        <p style={{
                  color: CLR_TEXT_DIM,
                  fontSize: '0.82rem',
                  textAlign: 'center',
                  maxWidth: 220,
                  lineHeight: 1.6
                }}>
                          Type at least 2 characters to search by username or name
                        </p>
                      </motion.div>}
                  </div>}

                {/* Requests sub-tab */}
                {tab === 'requests' && <div className="flex flex-col gap-2">
                    {incoming.length === 0 ? <div className="flex flex-col items-center justify-center gap-3" style={{
                paddingTop: 80
              }}>
                        <div style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: CLR_PRIMARY_FAINT,
                  border: `1px solid ${CLR_PRIMARY_BORDER}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: CLR_PRIMARY_DIM
                }}>
                          <UserPlus size={26} strokeWidth={1.5} />
                        </div>
                        <p style={{
                  color: CLR_TEXT_DIM,
                  fontSize: '0.82rem',
                  textAlign: 'center',
                  maxWidth: 220,
                  lineHeight: 1.6
                }}>
                          No pending friend requests
                        </p>
                      </div> : incoming.map(req => {
                const label = req.name ?? req.username ?? req.email ?? '??';
                return <motion.div key={req.id} initial={{
                  opacity: 0,
                  x: -10
                }} animate={{
                  opacity: 1,
                  x: 0
                }} className="flex items-center justify-between rounded-xl px-4 py-3" style={{
                  background: 'rgba(0,188,212,0.07)',
                  border: 'rgba(0,188,212,0.18) 1px solid'
                }}>
                            <div className="flex items-center gap-3">
                              <UserAvatar name={label} avatarUrl={req.avatarUrl} size={38} online={presence[req.requesterId]?.online} />
                              <div>
                                <p style={{
                        color: CLR_TEXT,
                        fontSize: '0.88rem',
                        fontWeight: 500
                      }}>{req.name ?? '—'}</p>
                                <p style={{
                        color: CLR_TEXT_DIM,
                        fontSize: '0.72rem'
                      }}>{req.username ? `@${req.username}` : req.email ?? ''}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <motion.button whileTap={{
                      scale: 0.88
                    }} onClick={() => respond(req.id, 'accept')} disabled={responding === req.id} style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: 'rgba(0,188,212,0.15)',
                      border: `1px solid ${CLR_PRIMARY_BORDER}`,
                      color: CLR_PRIMARY,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: responding === req.id ? 0.5 : 1
                    }}>
                                <Check size={14} strokeWidth={2.5} />
                              </motion.button>
                              <motion.button whileTap={{
                      scale: 0.88
                    }} onClick={() => respond(req.id, 'reject')} disabled={responding === req.id} style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: 'rgba(239,68,68,0.08)',
                      border: '1px solid rgba(239,68,68,0.2)',
                      color: 'rgba(239,68,68,0.7)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: responding === req.id ? 0.5 : 1
                    }}>
                                <X size={14} strokeWidth={2.5} />
                              </motion.button>
                            </div>
                          </motion.div>;
              })}
                  </div>}
              </motion.div>}

          </AnimatePresence>
        </div>

        <AnimatePresence>
          {hashtagView && (
            <motion.div initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} style={{ position: 'fixed', inset: 0, zIndex: 10195, background: '#ffffff', overflowY: 'auto', paddingBottom: 28 }}>
              <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', gap: 10, padding: '16px 14px', background: '#ffffff', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                <button onClick={() => setHashtagView(null)} aria-label="Close" style={{ background: 'none', border: 'none', color: '#0f1419', cursor: 'pointer', display: 'flex', width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}><X size={22} strokeWidth={2.2} /></button>
                <Hash size={19} color="#1d9bf0" />
                <strong style={{ color: '#0f1419', fontSize: '1rem' }}>#{hashtagView.tag}</strong>
              </div>
              {hashtagView.posts.length ? hashtagView.posts.map(post => (
                <div key={post.id} style={{ margin: '12px 14px', padding: 14, borderRadius: 14, background: 'transparent', border: 'none' }}>
                  <div
                    role="button"
                    onClick={() => {
                      if (user && String(post.authorId) === String(user.id)) return;
                      setViewingProfile({
                        id: post.authorId, name: post.authorName, username: post.authorUsername, avatarUrl: post.authorAvatarUrl,
                      });
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10, cursor: 'pointer' }}
                  >
                    <UserAvatar name={post.authorName} avatarUrl={post.authorAvatarUrl} size={32} />
                    <div><strong style={{ color: 'hsl(var(--foreground))', fontSize: '0.8rem' }}>{post.authorName}</strong><div style={{ color: 'hsl(var(--primary))', fontSize: '0.7rem' }}>{post.authorUsername ? `@${post.authorUsername}` : ''}</div></div>
                  </div>
                  <PostText text={post.text} color="hsl(var(--primary))" textColor={CLR_TEXT_DIM} onHashtag={openHashtag} />
                </div>
              )) : <p style={{ color: 'hsl(var(--muted-foreground))', textAlign: 'center', padding: 32 }}>لا توجد منشورات لهذا الهاشتاق بعد</p>}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {false && sharePost && (
            <motion.div initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} style={{ position: 'fixed', inset: 0, zIndex: 10450, background: 'hsl(var(--background)/0.9)', display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }} onClick={() => setSharePost(null)}>
              <motion.div initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} onClick={event => event.stopPropagation()} style={{ width: '100%', maxHeight: '78dvh', overflowY: 'auto', borderRadius: '22px 22px 0 0', background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', padding: '18px 16px 28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}><strong style={{ color: 'hsl(var(--foreground))' }}>Send post to friends</strong><button onClick={() => setSharePost(null)} style={{ background: 'none', border: 'none', color: 'hsl(var(--foreground))', cursor: 'pointer' }}><X size={20} /></button></div>
                <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.74rem', margin: '0 0 12px' }}>Choose friends to send this post in a private chat.</p>
                <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.72rem', margin: '0 0 10px' }}>اضغط على صديق لإرسال المنشور مباشرة إلى دردشته (صورة/فيديو + النص في مربع واحد).</p>
                {friends.length ? friends.map(friend => {
                  return <button key={friend.friendId} disabled={sharingPost} onClick={() => void sharePostToFriend(friend.friendId)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', background: 'none', border: 'none', color: 'hsl(var(--foreground))', cursor: sharingPost ? 'wait' : 'pointer', textAlign: 'start', opacity: sharingPost ? 0.6 : 1 }}>
                    <UserAvatar name={friend.name ?? friend.username ?? 'User'} avatarUrl={friend.avatarUrl} size={38} />
                    <span style={{ flex: 1, fontSize: '0.84rem' }}>{friend.name ?? friend.username ?? 'User'}</span>
                    <Send size={16} strokeWidth={2} color="hsl(var(--primary))" />
                  </button>;
                }) : <p style={{ color: 'hsl(var(--muted-foreground))', textAlign: 'center', padding: 20 }}>Add friends first to share posts with them</p>}
                {shareError && <p style={{ color: 'hsl(var(--destructive))', fontSize: '0.75rem' }}>{shareError}</p>}
                {sharingPost && <p style={{ color: 'hsl(var(--primary))', fontSize: '0.75rem', textAlign: 'center', marginTop: 8 }}>جاري الإرسال…</p>}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Friend Action Menu (حظر / حذف) — يفتح في منتصف الشاشة ── */}
      <AnimatePresence>
        {openActionMenu !== null && (() => {
        const menuFriend = friends.find(fr => fr.id === openActionMenu);
        if (!menuFriend) return null;
        return <motion.div key="friend-action-menu-overlay" initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} onClick={() => setOpenActionMenu(null)} style={{
          position: 'fixed',
          inset: 0,
          zIndex: 90,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          overflow: 'hidden',
        }}>
              <motion.div initial={{
            opacity: 0,
            scale: 0.9
          }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{
            opacity: 0,
            scale: 0.9
          }} transition={{
            duration: 0.15
          }} onClick={(e: React.MouseEvent) => e.stopPropagation()} style={{
            background: 'rgba(6,14,14,0.98)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 14,
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            width: '100%',
            maxWidth: 220,
            boxShadow: '0 8px 30px rgba(0,0,0,0.6)'
          }}>
                <motion.button whileTap={{
              scale: 0.96
            }} onClick={() => {
              setOpenActionMenu(null);
              setConfirmBlockFriend(menuFriend);
            }} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 14px',
              background: 'transparent',
              border: 'none',
              borderRadius: 9,
              color: '#ef4444',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
              width: '100%',
              textAlign: 'right',
              justifyContent: 'flex-end'
            }}>
                  حظر
                  <ShieldOff size={16} strokeWidth={2} />
                </motion.button>
                <div style={{
              height: 1,
              background: 'rgba(239,68,68,0.15)',
              margin: '0 6px'
            }} />
                <motion.button whileTap={{
              scale: 0.96
            }} onClick={() => {
              setOpenActionMenu(null);
              setConfirmRemoveFriend(menuFriend);
            }} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 14px',
              background: 'transparent',
              border: 'none',
              borderRadius: 9,
              color: '#ef4444',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
              width: '100%',
              textAlign: 'right',
              justifyContent: 'flex-end'
            }}>
                  حذف
                  <Trash2 size={16} strokeWidth={2} />
                </motion.button>
              </motion.div>
            </motion.div>;
      })()}
      </AnimatePresence>

      {/* ── New Secret Chat Modal ── */}
      <AnimatePresence>
        {false && showNewSecret && <motion.div initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        overflow: 'hidden',
      }} onClick={(e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) setShowNewSecret(false);
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
        }} style={{
          width: '100%',
          maxWidth: 480,
          background: 'hsl(var(--background))',
          border: `1px solid ${CLR_PRIMARY_BORDER}`,
          borderBottom: 'none',
          borderRadius: '20px 20px 0 0',
          padding: '24px 20px 40px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14
        }}>
              <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
                <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7
            }}>
                  <Lock size={15} style={{
                color: CLR_PRIMARY
              }} />
                  <p style={{
                color: CLR_PRIMARY,
                fontSize: '0.8rem',
                fontWeight: 700,
                letterSpacing: '0.2em',
                textTransform: 'uppercase'
              }}>دردشة سرية جديدة</p>
                </div>
                <motion.button whileTap={{
              scale: 0.9
            }} onClick={() => setShowNewSecret(false)} style={{
              background: 'none',
              border: 'none',
              color: CLR_TEXT_DIM,
              cursor: 'pointer'
            }}>
                  <X size={18} />
                </motion.button>
              </div>
              <input type="text" value={scName} onChange={e => setScName(e.target.value)} placeholder="اسم الدردشة السرية…" style={{
            width: '100%',
            background: CLR_INPUT_BG,
            border: `1px solid ${CLR_PRIMARY_BORDER}`,
            borderRadius: 10,
            padding: '11px 14px',
            color: CLR_TEXT,
            fontSize: '0.9rem',
            outline: 'none',
            fontFamily: 'var(--font-sans)',
            direction: 'rtl'
          }} />
              <div style={{
            position: 'relative'
          }}>
                <KeyRound size={13} style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: CLR_PRIMARY_DIM
            }} />
                <input type={scPinVisible ? 'text' : 'password'} inputMode="numeric" maxLength={8} value={scPin} onChange={e => setScPin(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="الرقم السري (4-8 أرقام)" style={{
              width: '100%',
              boxSizing: 'border-box',
              background: CLR_INPUT_BG,
              border: `1px solid ${CLR_PRIMARY_BORDER}`,
              borderRadius: 10,
              padding: '11px 36px 11px 36px',
              color: CLR_TEXT,
              fontSize: '0.9rem',
              outline: 'none',
              letterSpacing: '0.2em',
              direction: 'ltr'
            }} />
                <button onClick={() => setScPinVisible(v => !v)} style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: CLR_TEXT_DIM
            }}>
                  {scPinVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <div>
                <p style={{
              color: CLR_TEXT_DIM,
              fontSize: '0.65rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              marginBottom: 8
            }}>أضف أصدقاء</p>
                <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              maxHeight: 200,
              overflowY: 'auto'
            }}>
                  {friends.map(f => {
                const label = f.name ?? f.username ?? f.email ?? '??';
                const selected = scSelectedMembers.includes(f.friendId);
                return <motion.button key={f.id} whileTap={{
                  scale: 0.97
                }} onClick={() => setScSelectedMembers(prev => selected ? prev.filter(id => id !== f.friendId) : [...prev, f.friendId])} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  background: selected ? CLR_PRIMARY_FAINT : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${selected ? CLR_PRIMARY_BORDER : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: 10,
                  cursor: 'pointer',
                  textAlign: 'left'
                }}>
                        <UserAvatar name={label} avatarUrl={f.avatarUrl} size={32} />
                        <div style={{
                    flex: 1
                  }}>
                          <p style={{
                      color: CLR_TEXT,
                      fontSize: '0.85rem',
                      fontWeight: 500
                    }}>{f.name ?? '—'}</p>
                          {f.username && <p style={{
                      color: CLR_TEXT_DIM,
                      fontSize: '0.7rem'
                    }}>@{f.username}</p>}
                        </div>
                        {selected && <Check size={16} style={{
                    color: CLR_PRIMARY,
                    flexShrink: 0
                  }} strokeWidth={2.5} />}
                      </motion.button>;
              })}
                  {friends.length === 0 && <p style={{
                color: CLR_TEXT_DIM,
                fontSize: '0.8rem',
                textAlign: 'center',
                padding: '16px 0'
              }}>أضف أصدقاء أولاً</p>}
                </div>
              </div>
              <motion.button whileTap={{
            scale: 0.97
          }} onClick={createSecretChat} disabled={!scName.trim() || scCreating} style={{
            padding: '12px',
            background: scName.trim() ? CLR_PRIMARY_FAINT : 'rgba(255,255,255,0.03)',
            border: `1px solid ${CLR_PRIMARY_BORDER}`,
            borderRadius: 12,
            color: scName.trim() ? CLR_PRIMARY : CLR_PRIMARY_DIM,
            fontSize: '0.82rem',
            fontWeight: 700,
            cursor: scName.trim() ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6
          }}>
                <Lock size={14} strokeWidth={2} />
                {scCreating ? 'جاري الإنشاء…' : 'إنشاء الدردشة السرية'}
              </motion.button>
              {scError && <p style={{
            color: 'hsl(var(--destructive))',
            fontSize: '0.78rem',
            textAlign: 'center',
            marginTop: -8
          }}>{scError}</p>}
            </motion.div>
          </motion.div>}
      </AnimatePresence>

      {/* ── PIN Gate Modal ── */}
      <AnimatePresence>
        {false && openingChat && <motion.div initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        overflow: 'hidden',
      }} onClick={() => setOpeningChat(null)}>
            <motion.div initial={{
          scale: 0.9,
          opacity: 0
        }} animate={{
          scale: 1,
          opacity: 1
        }} exit={{
          scale: 0.9,
          opacity: 0
        }} onClick={(e: React.MouseEvent) => e.stopPropagation()} style={{
          background: 'hsl(var(--background))',
          border: `1px solid ${CLR_PRIMARY_BORDER}`,
          borderRadius: 20,
          padding: '28px 24px',
          width: '100%',
          maxWidth: 320,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          alignItems: 'center'
        }}>
              <div style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: CLR_PRIMARY_FAINT,
            border: `1px solid ${CLR_PRIMARY_BORDER}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: CLR_PRIMARY
          }}>
                <Lock size={22} strokeWidth={1.8} />
              </div>
              <p style={{
            color: CLR_TEXT,
            fontSize: '0.95rem',
            fontWeight: 700,
            textAlign: 'center'
          }}>{openingChat.name}</p>
              <p style={{
            color: CLR_TEXT_DIM,
            fontSize: '0.8rem',
            textAlign: 'center'
          }}>أدخل الرقم السري للدخول</p>
              <div style={{
            position: 'relative',
            width: '100%'
          }}>
                <input type={openPinVisible ? 'text' : 'password'} inputMode="numeric" maxLength={8} value={openPin} onChange={e => {
              setOpenPin(e.target.value.replace(/\D/g, '').slice(0, 8));
              setOpenPinError('');
            }} placeholder="الرقم السري" autoFocus style={{
              width: '100%',
              boxSizing: 'border-box',
              background: CLR_INPUT_BG,
              border: `1px solid ${openPinError ? 'hsl(var(--destructive))' : CLR_PRIMARY_BORDER}`,
              borderRadius: 12,
              padding: '12px 36px 12px 14px',
              color: CLR_TEXT,
              fontSize: '1.1rem',
              outline: 'none',
              letterSpacing: '0.3em',
              textAlign: 'center'
            }} onKeyDown={e => {
              if (e.key === 'Enter') void verifyAndOpenChat();
            }} />
                <button onClick={() => setOpenPinVisible(v => !v)} style={{
              position: 'absolute',
              right: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: CLR_TEXT_DIM
            }}>
                  {openPinVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {openPinError && <p style={{
            color: 'hsl(var(--destructive))',
            fontSize: '0.78rem',
            marginTop: -8
          }}>{openPinError}</p>}
              <div style={{
            display: 'flex',
            gap: 10,
            width: '100%'
          }}>
                <motion.button whileTap={{
              scale: 0.95
            }} onClick={() => setOpeningChat(null)} style={{
              flex: 1,
              padding: '11px',
              background: CLR_PRIMARY_FAINT,
              border: `1px solid ${CLR_PRIMARY_BORDER}`,
              borderRadius: 12,
              color: CLR_TEXT,
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}>
                  إلغاء
                </motion.button>
                <motion.button whileTap={{
              scale: 0.95
            }} onClick={() => void verifyAndOpenChat()} disabled={openPinChecking || !openPin} style={{
              flex: 1,
              padding: '11px',
              background: CLR_PRIMARY_FAINT,
              border: `1px solid ${CLR_PRIMARY_BORDER}`,
              borderRadius: 12,
              color: CLR_PRIMARY,
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              opacity: !openPin || openPinChecking ? 0.5 : 1
            }}>
                  {openPinChecking ? '…' : 'دخول'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>}
      </AnimatePresence>

      {/* ── Active Secret Chat ── */}
      <AnimatePresence>
        {false && activeChat && <motion.div initial={{
        opacity: 0,
        y: 40
      }} animate={{
        opacity: 1,
        y: 0
      }} exit={{
        opacity: 0,
        y: 40
      }} style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: 'hsl(var(--background))',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>

            {/* Header */}
            <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '44px 16px 12px',
          background: 'hsl(var(--background))',
          borderBottom: `1px solid ${CLR_PRIMARY_BORDER}`
        }}>
              <motion.button whileTap={{
            scale: 0.88
          }} onClick={() => setActiveChat(null)} style={{
            background: 'none',
            border: 'none',
            color: CLR_PRIMARY,
            cursor: 'pointer',
            padding: 4
          }}>
                <ArrowLeft size={22} strokeWidth={2} />
              </motion.button>
              <Lock size={14} style={{
            color: CLR_PRIMARY_DIM
          }} />
              <p style={{
            color: CLR_PRIMARY,
            fontSize: '0.9rem',
            fontWeight: 700,
            flex: 1
          }}>{activeChat.name}</p>
              <motion.button whileTap={{
            scale: 0.88
          }} onClick={() => void callActiveSecretChat()} aria-label="Call secret chat participants" title="اتصال بأعضاء الدردشة السرية" style={{
            background: CLR_PRIMARY_FAINT,
            border: `1px solid ${CLR_PRIMARY_BORDER}`,
            borderRadius: 10,
            color: CLR_PRIMARY,
            cursor: 'pointer',
            padding: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
                <Phone size={17} strokeWidth={2} />
              </motion.button>
              <motion.button whileTap={{
            scale: 0.88
          }} onClick={() => setConfirmLeaveChat(activeChat)} style={{
            background: 'none',
            border: 'none',
            color: 'hsl(var(--destructive))',
            cursor: 'pointer',
            padding: 4,
            opacity: 0.75
          }}>
                <LogOut size={18} strokeWidth={2} />
              </motion.button>
            </div>

            {/* Messages */}
            <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}>
              {chatMessages.length === 0 && <div style={{
            textAlign: 'center',
            color: CLR_TEXT_DIM,
            fontSize: '0.82rem',
            marginTop: 40
          }}>لا توجد رسائل بعد</div>}
              {chatMessages.map(m => {
            if (m.is_system) {
              return <div key={m.id} style={{
                display: 'flex',
                justifyContent: 'center',
                padding: '4px 0'
              }}>
                      <span style={{
                  background: 'hsl(var(--muted))',
                  color: 'hsl(var(--muted-foreground))',
                  fontSize: '0.7rem',
                  borderRadius: 20,
                  padding: '4px 12px',
                  fontStyle: 'italic'
                }}>
                        {m.body}
                      </span>
                    </div>;
            }
            const isMe = m.sender_id === user?.id;
            const msgType = m.type || 'text';
            let filePayload: {
              url: string;
              name: string;
              ext: string;
            } | null = null;
            if (msgType === 'file' || msgType === 'video') {
              try {
                filePayload = JSON.parse(m.body);
              } catch {
                filePayload = {
                  url: m.body,
                  name: m.body.split('/').pop() ?? 'file',
                  ext: ''
                };
              }
            }

            // Format time
            const timeLabel = m.created_at ? new Date(m.created_at).toLocaleTimeString('ar-KW', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
            }) : '';
            const FILE_ICONS_SC: Record<string, string> = {
              pdf: '📄',
              doc: '📝',
              docx: '📝',
              xls: '📊',
              xlsx: '📊',
              ppt: '📑',
              pptx: '📑',
              zip: '🗜',
              txt: '📃',
              bin: '📦'
            };
            return <div key={m.id} style={{
              display: 'flex',
              flexDirection: isMe ? 'row-reverse' : 'row',
              alignItems: 'flex-end',
              gap: 7
            }}>
                    {/* Avatar */}
                    {!isMe && <div style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                flexShrink: 0,
                overflow: 'hidden',
                border: `1.5px solid ${CLR_PRIMARY_BORDER}`,
                background: CLR_PRIMARY_FAINT,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 18
              }}>
                        {m.sender_avatar_url ? <img src={m.sender_avatar_url} alt="" style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }} /> : <span style={{
                  color: CLR_PRIMARY,
                  fontSize: '0.7rem',
                  fontWeight: 700
                }}>{(m.sender_name ?? m.sender_username ?? '?')[0].toUpperCase()}</span>}
                      </div>}

                    <div style={{
                maxWidth: '72%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: isMe ? 'flex-end' : 'flex-start',
                gap: 3
              }}>
                      {/* Sender name (others only) */}
                      {!isMe && <p style={{
                  color: CLR_PRIMARY_DIM,
                  fontSize: '0.62rem',
                  fontWeight: 600,
                  margin: 0,
                  paddingInline: 4
                }}>
                          {m.sender_name ?? m.sender_username ?? '?'}
                        </p>}

                      {/* Bubble */}
                      <div style={{
                  background: isMe ? CLR_PRIMARY_FAINT : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${isMe ? CLR_PRIMARY_BORDER : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  padding: msgType === 'image' ? 5 : '9px 13px',
                  overflow: 'hidden'
                }}>
                        {msgType === 'post_share' && (() => {
                          let ps: { postId?: number; text?: string; authorName?: string; mediaUrl?: string | null } = {};
                          try { ps = JSON.parse(m.body); } catch { ps = { text: m.body }; }
                          const openSharedPost = () => {
                            if (!ps.postId) return;
                            window.dispatchEvent(new CustomEvent('stooorna:open-post', { detail: { postId: ps.postId } }));
                          };
                          return (
                            <motion.button
                              whileTap={{ scale: 0.97 }}
                              onClick={openSharedPost}
                              style={{
                                display: 'flex', flexDirection: 'column', gap: 6,
                                background: 'none', border: 'none', cursor: 'pointer',
                                padding: 0, textAlign: 'left', maxWidth: 220,
                              }}
                            >
                              <div style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                color: CLR_PRIMARY_DIM, fontSize: '0.62rem', fontWeight: 600,
                              }}>
                                <Repeat2 size={12} strokeWidth={2.2} />
                                <span>Shared a post</span>
                              </div>
                              {ps.mediaUrl && (
                                <img src={ps.mediaUrl} alt="" style={{
                                  width: '100%', maxHeight: 120, objectFit: 'cover',
                                  borderRadius: 8, display: 'block',
                                }} />
                              )}
                              <p style={{
                                color: CLR_TEXT, fontSize: '0.82rem', lineHeight: 1.45,
                                margin: 0, display: '-webkit-box',
                                WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}>
                                {ps.text || '—'}
                              </p>
                              <span style={{
                                color: CLR_PRIMARY, fontSize: '0.68rem', fontWeight: 700,
                              }}>View post →</span>
                            </motion.button>
                          );
                        })()}
                        {msgType === 'text' && <p style={{
                    color: CLR_TEXT,
                    fontSize: '0.88rem',
                    lineHeight: 1.5,
                    margin: 0
                  }}>{m.body}</p>}
                        {msgType === 'image' && <img src={m.body} alt="صورة" style={{
                    maxWidth: 200,
                    maxHeight: 200,
                    borderRadius: 10,
                    display: 'block',
                    objectFit: 'cover'
                  }} />}
                        {msgType === 'voice' && <ScVoiceBubble url={m.body} duration={m.duration} isMe={isMe} primaryColor={CLR_PRIMARY} primaryBorder={CLR_PRIMARY_BORDER} textDim={CLR_TEXT_DIM} />}
                        {msgType === 'video' && filePayload && <video src={filePayload.url} controls playsInline style={{
                    maxWidth: 200,
                    maxHeight: 180,
                    borderRadius: 10,
                    display: 'block'
                  }} />}
                        {msgType === 'file' && filePayload && <a href={filePayload.url} target="_blank" rel="noopener noreferrer" download={filePayload.name} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    color: CLR_PRIMARY,
                    textDecoration: 'none',
                    fontSize: '0.82rem',
                    minWidth: 120
                  }}>
                            <span style={{
                      fontSize: '1.4rem'
                    }}>{FILE_ICONS_SC[filePayload.ext] ?? '📎'}</span>
                            <div style={{
                      overflow: 'hidden'
                    }}>
                              <p style={{
                        color: CLR_PRIMARY,
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        margin: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: 140
                      }}>{filePayload.name}</p>
                              <p style={{
                        color: CLR_TEXT_DIM,
                        fontSize: '0.65rem',
                        margin: 0,
                        textTransform: 'uppercase'
                      }}>{filePayload.ext || 'file'}</p>
                            </div>
                          </a>}
                      </div>

                      {/* Time */}
                      {timeLabel && <p style={{
                  color: CLR_TEXT_DIM,
                  fontSize: '0.6rem',
                  margin: 0,
                  paddingInline: 4
                }}>{timeLabel}</p>}
                    </div>
                  </div>;
          })}
              <div ref={chatBottomRef} />
            </div>

            {/* Input bar */}
            <div style={{
          padding: '10px 14px 32px',
          borderTop: `1px solid ${CLR_PRIMARY_BORDER}`,
          background: 'hsl(var(--background))'
        }}>

              {/* ── Typing indicator ── */}
              <AnimatePresence>
                {scTypingNames.length > 0 && <motion.div key="typing" initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 8,
              paddingInline: 4
            }}>
                    {/* Wave dots */}
                    <div style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 3,
                height: 16
              }}>
                      {[0, 1, 2].map(i => <motion.div key={i} animate={{
                  scaleY: [0.4, 1, 0.4]
                }} transition={{
                  duration: 0.7,
                  repeat: Infinity,
                  delay: i * 0.18,
                  ease: 'easeInOut' as const
                }} style={{
                  width: 4,
                  height: 12,
                  borderRadius: 3,
                  background: CLR_PRIMARY,
                  transformOrigin: 'bottom'
                }} />)}
                    </div>
                    <span style={{
                color: CLR_TEXT_DIM,
                fontSize: '0.72rem'
              }}>
                      {scTypingNames.join('، ')} يكتب...
                    </span>
                  </motion.div>}
              </AnimatePresence>

              {/* Hidden file inputs */}
              <input ref={scFileInputRef} type="file" accept="image/*" style={{
            display: 'none'
          }} onChange={e => {
            const f = e.target.files?.[0];
            if (f) void scSendImage(f);
            e.target.value = '';
          }} />
              <input ref={scVideoInputRef} type="file" accept="video/*" style={{
            display: 'none'
          }} onChange={e => {
            const f = e.target.files?.[0];
            if (f) void scSendFile(f);
            e.target.value = '';
          }} />
              <input ref={scDocInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.7z,.csv,.json,.xml,.mp3,.wav,.ogg,.aac,.flac,.apk,.ipa,.dmg,.exe,.deb" style={{
            display: 'none'
          }} onChange={e => {
            const f = e.target.files?.[0];
            if (f) void scSendFile(f);
            e.target.value = '';
          }} />

              {/* Recording bar */}
              <AnimatePresence>
                {scIsRecording && <motion.div initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 8,
              padding: '9px 12px',
              background: 'hsl(var(--destructive) / 0.1)',
              border: '1px solid hsl(var(--destructive) / 0.3)',
              borderRadius: 12
            }}>
                    <motion.div animate={{
                opacity: [1, 0.3, 1]
              }} transition={{
                duration: 1,
                repeat: Infinity
              }} style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'hsl(var(--destructive))',
                flexShrink: 0
              }} />
                    <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                height: 22
              }}>
                      {Array.from({
                  length: 18
                }, (_, i) => <motion.div key={i} animate={{
                  scaleY: [0.3, 1, 0.3]
                }} transition={{
                  duration: 0.5,
                  repeat: Infinity,
                  delay: i * 0.05,
                  ease: 'easeInOut' as const
                }} style={{
                  flex: 1,
                  height: '100%',
                  borderRadius: 2,
                  background: 'hsl(var(--destructive) / 0.55)',
                  transformOrigin: 'center'
                }} />)}
                    </div>
                    <span style={{
                color: 'hsl(var(--destructive))',
                fontSize: '0.75rem',
                fontWeight: 600,
                flexShrink: 0,
                minWidth: 28
              }}>
                      {Math.floor(scRecordSecs / 60)}:{String(scRecordSecs % 60).padStart(2, '0')}
                    </span>
                    <motion.button whileTap={{
                scale: 0.88
              }} onClick={() => void scStopRecording(false)} style={{
                background: 'none',
                border: 'none',
                color: 'hsl(var(--destructive) / 0.6)',
                cursor: 'pointer',
                padding: 2
              }}>
                      <X size={15} />
                    </motion.button>
                  </motion.div>}
              </AnimatePresence>

              <div style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 8,
            position: 'relative'
          }}>

                {/* زر + */}
                <div style={{
              position: 'relative',
              flexShrink: 0
            }}>
                  <motion.button whileTap={{
                scale: 0.88
              }} onClick={() => setScShowAttach(v => !v)} style={{
                width: 42,
                height: 42,
                borderRadius: '50%',
                background: scShowAttach ? CLR_PRIMARY_FAINT : 'rgba(255,255,255,0.04)',
                border: `1px solid ${scShowAttach ? CLR_PRIMARY : CLR_PRIMARY_BORDER}`,
                color: scShowAttach ? CLR_PRIMARY : CLR_TEXT_DIM,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s'
              }}>
                    <motion.div animate={{
                  rotate: scShowAttach ? 45 : 0
                }} transition={{
                  duration: 0.2
                }}>
                      <Plus size={18} strokeWidth={2} />
                    </motion.div>
                  </motion.button>

                  <AnimatePresence>
                    {scShowAttach && <motion.div initial={{
                  opacity: 0,
                  scale: 0.85,
                  y: 8
                }} animate={{
                  opacity: 1,
                  scale: 1,
                  y: 0
                }} exit={{
                  opacity: 0,
                  scale: 0.85,
                  y: 8
                }} transition={{
                  duration: 0.18,
                  ease: 'easeOut' as const
                }} style={{
                  position: 'absolute',
                  bottom: 52,
                  left: 0,
                  background: 'hsl(var(--card))',
                  border: `1px solid ${CLR_PRIMARY_BORDER}`,
                  borderRadius: 14,
                  padding: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  zIndex: 50,
                  minWidth: 150
                }}>
                        {([{
                    icon: <ImageIcon size={16} />,
                    label: 'صورة',
                    action: () => {
                      scFileInputRef.current?.click();
                      setScShowAttach(false);
                    }
                  }, {
                    icon: <Video size={16} />,
                    label: 'فيديو',
                    action: () => {
                      scVideoInputRef.current?.click();
                      setScShowAttach(false);
                    }
                  }, {
                    icon: <FileText size={16} />,
                    label: 'ملف',
                    action: () => {
                      scDocInputRef.current?.click();
                      setScShowAttach(false);
                    }
                  }] as {
                    icon: React.ReactNode;
                    label: string;
                    action: () => void;
                  }[]).map(item => <motion.button key={item.label} whileTap={{
                    scale: 0.95
                  }} onClick={item.action} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '9px 12px',
                    borderRadius: 10,
                    background: 'transparent',
                    border: 'none',
                    color: CLR_TEXT,
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }} onMouseEnter={e => e.currentTarget.style.background = CLR_PRIMARY_FAINT} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <span style={{
                      color: CLR_PRIMARY
                    }}>{item.icon}</span>
                            <span>{item.label}</span>
                          </motion.button>)}
                      </motion.div>}
                  </AnimatePresence>
                </div>

                {/* Input */}
                <input value={chatInput} onChange={e => handleScInputChange(e.target.value)} placeholder="اكتب رسالة…" onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void sendChatMessage();
              }
            }} style={{
              flex: 1,
              background: CLR_INPUT_BG,
              border: `1px solid ${CLR_PRIMARY_BORDER}`,
              borderRadius: 12,
              padding: '11px 14px',
              color: CLR_TEXT,
              fontSize: '0.9rem',
              outline: 'none',
              direction: 'rtl'
            }} />

                {/* Send / Mic */}
                {chatInput.trim() ? <motion.button whileTap={{
              scale: 0.9
            }} onClick={() => void sendChatMessage()} disabled={chatSending} style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              background: CLR_PRIMARY_FAINT,
              border: `1px solid ${CLR_PRIMARY_BORDER}`,
              color: CLR_PRIMARY,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
                    <Send size={17} strokeWidth={2} />
                  </motion.button> : scIsRecording ? <motion.button whileTap={{
              scale: 0.9
            }} onClick={() => void scStopRecording(true)} style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              background: 'hsl(var(--destructive) / 0.15)',
              border: '1px solid hsl(var(--destructive) / 0.4)',
              color: 'hsl(var(--destructive))',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
                    <Send size={17} strokeWidth={2} />
                  </motion.button> : <motion.button whileTap={{
              scale: 0.9
            }} onPointerDown={() => void scStartRecording()} onPointerUp={() => {
              if (scIsRecording) void scStopRecording(true);
            }} onPointerLeave={() => {
              if (scIsRecording) void scStopRecording(true);
            }} style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              background: CLR_PRIMARY_FAINT,
              border: `1px solid ${CLR_PRIMARY_BORDER}`,
              color: CLR_PRIMARY,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
                    <Mic size={17} strokeWidth={2} />
                  </motion.button>}
              </div>
            </div>
          </motion.div>}
      </AnimatePresence>

      {/* ── Confirm Remove Friend Dialog ── */}
      <AnimatePresence>
        {confirmRemoveFriend !== null && <motion.div initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        overflow: 'hidden',
      }} onClick={() => setConfirmRemoveFriend(null)}>
            <motion.div initial={{
          scale: 0.9,
          opacity: 0
        }} animate={{
          scale: 1,
          opacity: 1
        }} exit={{
          scale: 0.9,
          opacity: 0
        }} onClick={(e: React.MouseEvent) => e.stopPropagation()} style={{
          background: 'rgba(6,14,14,0.98)',
          border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 16,
          padding: '24px 20px',
          width: '100%',
          maxWidth: 300,
          display: 'flex',
          flexDirection: 'column',
          gap: 14
        }}>
              {/* Avatar + name */}
              <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10
          }}>
                <UserAvatar name={confirmRemoveFriend.name ?? confirmRemoveFriend.username ?? '?'} avatarUrl={confirmRemoveFriend.avatarUrl} size={52} />
                <p style={{
              color: CLR_TEXT,
              fontSize: '0.92rem',
              fontWeight: 700,
              margin: 0
            }}>
                  {confirmRemoveFriend.name ?? confirmRemoveFriend.username ?? '—'}
                </p>
                {confirmRemoveFriend.username && <p style={{
              color: CLR_TEXT_DIM,
              fontSize: '0.72rem',
              margin: 0
            }}>@{confirmRemoveFriend.username}</p>}
              </div>
              <p style={{
            color: CLR_TEXT_DIM,
            fontSize: '0.8rem',
            lineHeight: 1.5,
            textAlign: 'center',
            margin: 0
          }}>
                هل تريد حذف هذا الصديق؟ سيُزال من قائمتك ولن تتمكن من مراسلته.
              </p>
              <div style={{
            display: 'flex',
            gap: 10
          }}>
                <motion.button whileTap={{
              scale: 0.95
            }} onClick={() => setConfirmRemoveFriend(null)} style={{
              flex: 1,
              padding: '10px',
              background: CLR_PRIMARY_FAINT,
              border: `1px solid ${CLR_PRIMARY_BORDER}`,
              borderRadius: 10,
              color: CLR_TEXT,
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}>
                  إلغاء
                </motion.button>
                <motion.button whileTap={{
              scale: 0.95
            }} onClick={() => removeFriend(confirmRemoveFriend.friendId)} disabled={removingFriendId === confirmRemoveFriend.friendId} style={{
              flex: 1,
              padding: '10px',
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.35)',
              borderRadius: 10,
              color: '#ef4444',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6
            }}>
                  {removingFriendId === confirmRemoveFriend.friendId ? <motion.div animate={{
                rotate: 360
              }} transition={{
                duration: 0.7,
                repeat: Infinity,
                ease: 'linear'
              }} style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                border: '2px solid rgba(239,68,68,0.3)',
                borderTopColor: '#ef4444'
              }} /> : <><Trash2 size={13} strokeWidth={2} /> حذف</>}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>}
      </AnimatePresence>

      {/* ── Confirm Delete Secret Chat (creator only) ── */}
      <AnimatePresence>
        {confirmDeleteChat && <motion.div initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'hsl(var(--background) / 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        overflow: 'hidden',
      }} onClick={() => setConfirmDeleteChat(null)}>
            <motion.div initial={{
          scale: 0.9,
          opacity: 0
        }} animate={{
          scale: 1,
          opacity: 1
        }} exit={{
          scale: 0.9,
          opacity: 0
        }} onClick={(e: React.MouseEvent) => e.stopPropagation()} style={{
          background: 'hsl(var(--background))',
          border: '1px solid hsl(var(--destructive) / 0.4)',
          borderRadius: 16,
          padding: '24px 20px',
          width: '100%',
          maxWidth: 300,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          alignItems: 'center'
        }}>
              <div style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: 'hsl(var(--destructive) / 0.12)',
            border: '1px solid hsl(var(--destructive) / 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'hsl(var(--destructive))'
          }}>
                <Trash2 size={22} strokeWidth={1.8} />
              </div>
              <p style={{
            color: CLR_TEXT,
            fontSize: '0.92rem',
            fontWeight: 700,
            textAlign: 'center',
            margin: 0
          }}>
                حذف الدردشة السرية
              </p>
              <p style={{
            color: CLR_TEXT_DIM,
            fontSize: '0.8rem',
            lineHeight: 1.5,
            textAlign: 'center',
            margin: 0
          }}>
                هل تريد حذف "{confirmDeleteChat.name}" نهائياً؟ ستُحذف جميع الرسائل والأعضاء ولا يمكن التراجع.
              </p>
              <div style={{
            display: 'flex',
            gap: 10,
            width: '100%'
          }}>
                <motion.button whileTap={{
              scale: 0.95
            }} onClick={() => setConfirmDeleteChat(null)} style={{
              flex: 1,
              padding: '10px',
              background: CLR_PRIMARY_FAINT,
              border: `1px solid ${CLR_PRIMARY_BORDER}`,
              borderRadius: 10,
              color: CLR_TEXT,
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}>
                  إلغاء
                </motion.button>
                <motion.button whileTap={{
              scale: 0.95
            }} onClick={() => void deleteSecretChat(confirmDeleteChat)} disabled={deletingChatId === confirmDeleteChat.id} style={{
              flex: 1,
              padding: '10px',
              background: 'hsl(var(--destructive) / 0.2)',
              border: '1px solid hsl(var(--destructive) / 0.5)',
              borderRadius: 10,
              color: 'hsl(var(--destructive))',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              opacity: deletingChatId === confirmDeleteChat.id ? 0.5 : 1
            }}>
                  {deletingChatId === confirmDeleteChat.id ? '…' : 'حذف نهائي'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>}
      </AnimatePresence>

      {/* ── Confirm Leave Secret Chat ── */}
      <AnimatePresence>
        {confirmLeaveChat && <motion.div initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'hsl(var(--background) / 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        overflow: 'hidden',
      }} onClick={() => setConfirmLeaveChat(null)}>
            <motion.div initial={{
          scale: 0.9,
          opacity: 0
        }} animate={{
          scale: 1,
          opacity: 1
        }} exit={{
          scale: 0.9,
          opacity: 0
        }} onClick={(e: React.MouseEvent) => e.stopPropagation()} style={{
          background: 'hsl(var(--background))',
          border: '1px solid hsl(var(--destructive) / 0.3)',
          borderRadius: 16,
          padding: '24px 20px',
          width: '100%',
          maxWidth: 300,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          alignItems: 'center'
        }}>
              <div style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: 'hsl(var(--destructive) / 0.1)',
            border: '1px solid hsl(var(--destructive) / 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'hsl(var(--destructive))'
          }}>
                <LogOut size={22} strokeWidth={1.8} />
              </div>
              <p style={{
            color: CLR_TEXT,
            fontSize: '0.92rem',
            fontWeight: 700,
            textAlign: 'center',
            margin: 0
          }}>
                مغادرة الغرفة السرية
              </p>
              <p style={{
            color: CLR_TEXT_DIM,
            fontSize: '0.8rem',
            lineHeight: 1.5,
            textAlign: 'center',
            margin: 0
          }}>
                هل تريد مغادرة "{confirmLeaveChat.name}"؟ سيتم إزالتك من الغرفة نهائياً.
              </p>
              <div style={{
            display: 'flex',
            gap: 10,
            width: '100%'
          }}>
                <motion.button whileTap={{
              scale: 0.95
            }} onClick={() => setConfirmLeaveChat(null)} style={{
              flex: 1,
              padding: '10px',
              background: CLR_PRIMARY_FAINT,
              border: `1px solid ${CLR_PRIMARY_BORDER}`,
              borderRadius: 10,
              color: CLR_TEXT,
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}>
                  إلغاء
                </motion.button>
                <motion.button whileTap={{
              scale: 0.95
            }} onClick={() => void leaveSecretChat(confirmLeaveChat)} disabled={leavingChatId === confirmLeaveChat.id} style={{
              flex: 1,
              padding: '10px',
              background: 'hsl(var(--destructive) / 0.15)',
              border: '1px solid hsl(var(--destructive) / 0.4)',
              borderRadius: 10,
              color: 'hsl(var(--destructive))',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              opacity: leavingChatId === confirmLeaveChat.id ? 0.5 : 1
            }}>
                  {leavingChatId === confirmLeaveChat.id ? '…' : 'مغادرة'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>}
      </AnimatePresence>

      {/* ── Confirm Block User Dialog ── */}
      <AnimatePresence>
        {confirmBlockFriend !== null && <motion.div initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        overflow: 'hidden',
      }} onClick={() => setConfirmBlockFriend(null)}>
            <motion.div initial={{
          scale: 0.9,
          opacity: 0
        }} animate={{
          scale: 1,
          opacity: 1
        }} exit={{
          scale: 0.9,
          opacity: 0
        }} onClick={(e: React.MouseEvent) => e.stopPropagation()} style={{
          background: 'rgba(6,14,14,0.98)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 16,
          padding: '24px 20px',
          width: '100%',
          maxWidth: 300,
          display: 'flex',
          flexDirection: 'column',
          gap: 14
        }}>
              {/* Icon + name */}
              <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10
          }}>
                <div style={{
              position: 'relative'
            }}>
                  <UserAvatar name={confirmBlockFriend.name ?? confirmBlockFriend.username ?? '?'} avatarUrl={confirmBlockFriend.avatarUrl} size={52} />
                  <div style={{
                position: 'absolute',
                bottom: -4,
                right: -4,
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: 'rgba(239,68,68,0.9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid rgba(6,14,14,0.98)'
              }}>
                    <ShieldOff size={11} strokeWidth={2.5} color="white" />
                  </div>
                </div>
                <p style={{
              color: CLR_TEXT,
              fontSize: '0.92rem',
              fontWeight: 700,
              margin: 0
            }}>
                  {confirmBlockFriend.name ?? confirmBlockFriend.username ?? '—'}
                </p>
                {confirmBlockFriend.username && <p style={{
              color: CLR_TEXT_DIM,
              fontSize: '0.72rem',
              margin: 0
            }}>@{confirmBlockFriend.username}</p>}
              </div>
              <p style={{
            color: CLR_TEXT_DIM,
            fontSize: '0.8rem',
            lineHeight: 1.5,
            textAlign: 'center',
            margin: 0
          }}>
                هل تريد حظر هذا المستخدم؟ سيُزال من قائمة أصدقائك ولن يتمكن من التواصل معك.
              </p>
              <p style={{
            color: 'rgba(239,68,68,0.6)',
            fontSize: '0.72rem',
            textAlign: 'center',
            margin: 0
          }}>
                يمكنك إلغاء الحظر لاحقاً من إعدادات الخصوصية.
              </p>
              <div style={{
            display: 'flex',
            gap: 10
          }}>
                <motion.button whileTap={{
              scale: 0.95
            }} onClick={() => setConfirmBlockFriend(null)} style={{
              flex: 1,
              padding: '10px',
              background: CLR_PRIMARY_FAINT,
              border: `1px solid ${CLR_PRIMARY_BORDER}`,
              borderRadius: 10,
              color: CLR_TEXT,
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}>
                  إلغاء
                </motion.button>
                <motion.button whileTap={{
              scale: 0.95
            }} onClick={() => blockFriend(confirmBlockFriend)} disabled={blockingFriendId === confirmBlockFriend.friendId} style={{
              flex: 1,
              padding: '10px',
              background: 'rgba(239,68,68,0.18)',
              border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: 10,
              color: '#ef4444',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6
            }}>
                  {blockingFriendId === confirmBlockFriend.friendId ? <motion.div animate={{
                rotate: 360
              }} transition={{
                duration: 0.7,
                repeat: Infinity,
                ease: 'linear'
              }} style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                border: '2px solid rgba(239,68,68,0.3)',
                borderTopColor: '#ef4444'
              }} /> : <><ShieldOff size={13} strokeWidth={2} /> حظر</>}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>}
      </AnimatePresence>

      {/* ── Secret Chat In-App Notification Banner ── */}
      <AnimatePresence>
        {scNotif && <motion.div key={scNotif.id + scNotif.preview} initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }} onClick={() => {
        setScNotif(null);
      }} style={{
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(360px, calc(100vw - 32px))',
        background: 'hsl(var(--card))',
        border: `1px solid ${CLR_PRIMARY_BORDER}`,
        borderRadius: 18,
        padding: '12px 16px',
        zIndex: 9999,
        boxShadow: `0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,188,212,0.1), 0 0 30px rgba(0,188,212,0.12)`,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 12
      }}>
            {/* Icon */}
            <div style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: CLR_PRIMARY_FAINT,
          border: `1.5px solid ${CLR_PRIMARY_BORDER}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
              <Lock size={18} strokeWidth={1.8} color={CLR_PRIMARY} />
            </div>
            {/* Text */}
            <div style={{
          flex: 1,
          minWidth: 0
        }}>
              <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 2
          }}>
                <span style={{
              color: CLR_PRIMARY,
              fontSize: '0.7rem',
              fontWeight: 700,
              letterSpacing: '0.04em'
            }}>
                  {scNotif.chatName}
                </span>
                <span style={{
              color: CLR_TEXT_DIM,
              fontSize: '0.62rem'
            }}>•</span>
                <span style={{
              color: CLR_TEXT_DIM,
              fontSize: '0.62rem'
            }}>{scNotif.senderName}</span>
              </div>
              <p style={{
            color: CLR_TEXT,
            fontSize: '0.82rem',
            margin: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
                {scNotif.preview}
              </p>
            </div>
            {/* Progress bar */}
            <motion.div initial={{
          scaleX: 1
        }} animate={{
          scaleX: 0
        }} transition={{
          duration: 4.5,
          ease: 'linear' as const
        }} style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 2,
          background: CLR_PRIMARY,
          borderRadius: '0 0 18px 18px',
          transformOrigin: 'left'
        }} />
          </motion.div>}
      </AnimatePresence>


      {/* ── New Post Composer — X/Twitter style (white fullscreen) ── */}
      <AnimatePresence>
        {showComposer && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10410,
              background: '#ffffff',
              display: 'flex', flexDirection: 'column',
            }}
          >
            {/* Top bar: X | Post */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: 'max(10px, env(safe-area-inset-top, 0px)) 14px 10px',
              borderBottom: '1px solid rgba(0,0,0,0.06)',
            }}>
              <button
                type="button"
                onClick={() => { if (!composerPosting) { setShowComposer(false); setComposerError(''); } }}
                aria-label="Close"
                style={{
                  width: 36, height: 36, borderRadius: '50%', border: 'none',
                  background: 'transparent', color: '#0f1419', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={22} strokeWidth={2.2} />
              </button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                animate={composerPosting ? { scale: [1, 1.08, 1], boxShadow: ['0 0 0 0 rgba(29,155,240,0.5)', '0 0 0 12px rgba(29,155,240,0)', '0 0 0 0 rgba(29,155,240,0.35)'] } : { scale: 1, boxShadow: '0 0 0 0 rgba(29,155,240,0)' }}
                transition={composerPosting ? { duration: 0.95, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
                disabled={composerPosting || !(composerProductTitle.trim() || composerProductDetails.trim() || composerProductPrice.trim() || composerProductExtras.some(s => s.trim()) || composerLinkInput.trim() || composerMediaFiles.length)}
                onClick={() => void submitPost('text')}
                style={{
                  minWidth: 72, height: 34, padding: '0 18px', borderRadius: 999, border: 'none',
                  background: !(composerProductTitle.trim() || composerProductDetails.trim() || composerProductPrice.trim() || composerProductExtras.some(s => s.trim()) || composerLinkInput.trim() || composerMediaFiles.length)
                    ? 'rgba(29,155,240,0.45)' : '#1d9bf0',
                  color: '#fff', fontWeight: 700, fontSize: '0.88rem',
                  cursor: !(composerProductTitle.trim() || composerProductDetails.trim() || composerProductPrice.trim() || composerProductExtras.some(s => s.trim()) || composerLinkInput.trim() || composerMediaFiles.length) ? 'default' : 'pointer',
                  opacity: composerPosting ? 0.95 : 1,
                }}
              >
                {composerPosting ? '…' : 'نشر'}
              </motion.button>
            </div>

            {/* Body: company keeps title+details; regular user = single text area */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px 8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {isCompanyPublisher ? (
                <>
                <div>
                  <label style={{ display: 'block', color: '#0a0a0a', fontSize: '0.72rem', fontWeight: 800, marginBottom: 6 }}>عنوان المنتج / الموضوع</label>
                  <input
                    value={composerProductTitle}
                    onChange={e => setComposerProductTitle(e.target.value)}
                    placeholder=""
                    style={{
                      width: '100%', boxSizing: 'border-box', border: '1.5px solid rgba(0,0,0,0.12)', borderRadius: 12,
                      padding: '12px 14px', fontSize: '1.05rem', fontWeight: 800, color: '#0a0a0a',
                      background: '#f7f9f9', outline: 'none', fontFamily: 'inherit',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', color: '#0a0a0a', fontSize: '0.72rem', fontWeight: 800, marginBottom: 6 }}>تفاصيل المنتج</label>
                  <textarea
                    value={composerProductDetails}
                    onChange={e => setComposerProductDetails(e.target.value)}
                    placeholder=""
                    rows={5}
                    style={{
                      width: '100%', boxSizing: 'border-box', border: '1.5px solid rgba(0,0,0,0.12)', borderRadius: 12,
                      padding: '12px 14px', fontSize: '0.92rem', color: '#1a1a1a', lineHeight: 1.5,
                      background: '#f7f9f9', outline: 'none', fontFamily: 'inherit', resize: 'vertical', minHeight: 100,
                    }}
                  />
                </div>
                </>
                ) : (
                <div>
                  <textarea
                    value={composerProductDetails}
                    onChange={e => {
                      setComposerProductDetails(e.target.value);
                      setComposerProductTitle('');
                    }}
                    placeholder=""
                    rows={10}
                    autoFocus
                    style={{
                      width: '100%', boxSizing: 'border-box', border: 'none', borderRadius: 0,
                      padding: '8px 4px', fontSize: '1.05rem', color: '#0a0a0a', lineHeight: 1.55,
                      background: 'transparent', outline: 'none', fontFamily: 'inherit', resize: 'none',
                      minHeight: '42vh',
                    }}
                  />
                </div>
                )}
{/* ── مستطيل Paste: رابط صورة أو فيديو (X أو رابط مباشر) — للمستخدمين والشركات ── */}
                <div>
                  <label style={{ display: 'block', color: '#0a0a0a', fontSize: '0.72rem', fontWeight: 800, marginBottom: 6 }}>
                    {isCompanyPublisher ? 'رابط إعلان (صورة أو فيديو)' : 'رابط صورة أو فيديو'}
                  </label>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, minHeight: 48, boxSizing: 'border-box',
                    border: '1.5px dashed rgba(29,155,240,0.55)', background: 'rgba(29,155,240,0.06)',
                    borderRadius: 12, padding: '4px 6px 4px 12px',
                  }}>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.94 }}
                      onClick={() => void pasteLinkFromClipboard()}
                      aria-label="Paste"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                        height: 36, padding: '0 14px', borderRadius: 10, border: 'none',
                        background: '#1d9bf0', color: '#fff', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer',
                      }}
                    >
                      <ClipboardPaste size={16} strokeWidth={2.4} /> Paste
                    </motion.button>
                    <input
                      dir="ltr"
                      inputMode="url"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      value={composerLinkInput}
                      onChange={e => setComposerLinkInput(e.target.value)}
                      onPaste={e => {
                        const link = pickLinkFromText(e.clipboardData?.getData('text'));
                        if (!link) return;
                        e.preventDefault();
                        setComposerError('');
                        setComposerLinkInput(link);
                        setComposerLinkPreviewUrl(link);
                      }}
                      placeholder={isCompanyPublisher ? 'الصق رابط الإعلان (صورة أو فيديو)' : 'الصق رابط صورة أو فيديو'}
                      style={{
                        flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
                        fontSize: '0.85rem', color: '#1a1a1a', fontFamily: 'inherit', textAlign: 'left',
                      }}
                    />
                    {composerLinkInput.trim() && (
                      <button
                        type="button"
                        onClick={() => { setComposerLinkInput(''); setComposerLinkPreviewUrl(''); setComposerError(''); }}
                        aria-label="مسح الرابط"
                        style={{
                          width: 30, height: 30, borderRadius: '50%', border: 'none', flexShrink: 0,
                          background: 'rgba(15,20,25,0.08)', color: '#0f1419', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <X size={15} strokeWidth={2.4} />
                      </button>
                    )}
                  </div>
                  {composerLinkPreviewUrl.includes('.') && (
                    <LinkMediaPreview
                      url={composerLinkPreviewUrl}
                      failedNote="الرابط لا يبدو صورة أو فيديو — الصق رابط X أو رابط ملف مباشر (jpg / png / mp4)"
                    />
                  )}
                </div>
                {/* معاينة فورية لروابط X: الصورة/الفيديو تظهر كاملة بمجرد وضع الرابط (مستخدم أو شركة) */}
                {composerXUrls.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {composerXUrls.map(u => (
                      <LinkMediaPreview key={u} url={u} failedNote="لا توجد صورة أو فيديو في هذا الرابط" />
                    ))}
                  </div>
                )}
{isCompanyPublisher && (
                <div>
                  <label style={{ display: 'block', color: '#0a0a0a', fontSize: '0.72rem', fontWeight: 800, marginBottom: 6 }}>السعر</label>
                  <input
                    value={composerProductPrice}
                    onChange={e => setComposerProductPrice(e.target.value)}
                    placeholder="مثال: 25 د.ك أو مجاني"
                    style={{
                      width: '100%', boxSizing: 'border-box', border: '1.5px solid rgba(0,0,0,0.12)', borderRadius: 12,
                      padding: '12px 14px', fontSize: '0.95rem', fontWeight: 700, color: '#0a0a0a',
                      background: '#f7f9f9', outline: 'none', fontFamily: 'inherit',
                    }}
                  />
                </div>
                )}
                {/* حقول إضافية: للشركات فقط — أُزيلت من نشر المستخدم النصي */}
                {isCompanyPublisher && composerProductExtras.map((extra, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <textarea
                      value={extra}
                      onChange={e => setComposerProductExtras(prev => prev.map((x, i) => i === idx ? e.target.value : x))}
                      placeholder={`حقل إضافي ${idx + 1}`}
                      rows={2}
                      style={{
                        flex: 1, boxSizing: 'border-box', border: '1.5px solid rgba(0,0,0,0.12)', borderRadius: 12,
                        padding: '10px 12px', fontSize: '0.88rem', color: '#1a1a1a',
                        background: '#f7f9f9', outline: 'none', fontFamily: 'inherit', resize: 'vertical',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setComposerProductExtras(prev => prev.filter((_, i) => i !== idx))}
                      aria-label="حذف الحقل"
                      style={{
                        width: 36, height: 36, borderRadius: 10, border: 'none', flexShrink: 0,
                        background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
                {isCompanyPublisher && (
                <button
                  type="button"
                  onClick={() => setComposerProductExtras(prev => [...prev, ''])}
                  style={{
                    alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6,
                    height: 36, padding: '0 14px', borderRadius: 10,
                    border: '1.5px dashed rgba(29,155,240,0.45)', background: 'rgba(29,155,240,0.06)',
                    color: '#1d9bf0', fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer',
                  }}
                >
                  <Plus size={16} strokeWidth={2.6} /> +
                </button>
                )}

                {composerMediaFiles.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {composerMediaFiles.map((item, idx) => (
                      <div key={idx} style={{ position: 'relative', width: 120, height: 120, borderRadius: 14, overflow: 'hidden', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {item.type === 'video' ? (
                          <video src={item.preview} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : item.type === 'pdf' ? (
                          <span style={{ color: '#fff', fontSize: '0.75rem', fontWeight: 700 }}>PDF</span>
                        ) : (
                          <img src={item.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            URL.revokeObjectURL(item.preview);
                            setComposerMediaFiles(prev => prev.filter((_, i) => i !== idx));
                          }}
                          style={{
                            position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: '50%',
                            border: 'none', background: 'rgba(15,20,25,0.75)', color: '#fff', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <X size={14} strokeWidth={2.4} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {composerError && (
                <p style={{ color: '#f4212e', fontSize: '0.8rem', margin: '12px 0 0' }}>{composerError}</p>
              )}
            </div>

            {/* Bottom toolbar — image HQ / video ad / PDF */}
            <div style={{
              borderTop: '1px solid rgba(0,0,0,0.08)',
              padding: '10px 14px calc(12px + env(safe-area-inset-bottom, 0px))',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <label style={{
                width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#1d9bf0',
              }} title="صورة عالية الجودة">
                <ImageIcon size={20} strokeWidth={2} />
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={e => {
                    const files = Array.from(e.target.files ?? []);
                    if (!files.length) return;
                    setComposerMediaFiles(prev => {
                      const existingImageCount = prev.filter(item => item.type === 'image').length;
                      const remainingSlots = MAX_COMPOSER_IMAGES - existingImageCount;
                      if (remainingSlots <= 0) {
                        setComposerError(`Max ${MAX_COMPOSER_IMAGES} images`);
                        return prev;
                      }
                      const accepted = files.slice(0, remainingSlots);
                      return [
                        ...prev,
                        ...accepted.map(file => ({
                          file,
                          type: 'image' as const,
                          preview: URL.createObjectURL(file),
                        })),
                      ];
                    });
                    e.target.value = '';
                  }}
                />
              </label>
              <label style={{
                width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#1d9bf0',
              }} title="فيديو إعلاني">
                <Video size={20} strokeWidth={2} />
                <input
                  type="file"
                  accept="video/*,video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setComposerMediaFiles(prev => [
                      ...prev,
                      { file, type: 'video' as const, preview: URL.createObjectURL(file) },
                    ]);
                    e.target.value = '';
                  }}
                />
              </label>
              <label style={{
                width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#1d9bf0',
              }} title="ملف PDF">
                <FileText size={20} strokeWidth={2} />
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setComposerMediaFiles(prev => [
                      ...prev,
                      { file, type: 'pdf' as const, preview: URL.createObjectURL(file) },
                    ]);
                    e.target.value = '';
                  }}
                />
              </label>
              <div style={{ flex: 1 }} />
              {isBusinessUser && (
                <button
                  type="button"
                  onClick={() => setBusinessAdsOpen(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent',
                    color: '#1d9bf0', fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer', padding: '6px 4px',
                  }}
                >
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%', border: '1.5px solid #1d9bf0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem', lineHeight: 1,
                  }}>+</span>
                  Product Ad
                </button>
              )}
            </div>
            {composerBizHint && isBusinessUser && (
              <p style={{ margin: '0 14px 10px', color: '#1d9bf0', fontSize: '0.72rem', fontWeight: 700 }}>
                Tip: use + Product Ad to place a paid ad between posts (5 KD / month).
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>


      {/* Feed Ad fullscreen viewer (ad-style, not like normal posts) */}
      <AnimatePresence>
        {feedAdViewer && (
          <motion.div
            key="feed-ad-viewer"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10600, background: 'rgba(0,0,0,0.92)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
              paddingTop: 'max(12px, env(safe-area-inset-top))', borderBottom: '1px solid rgba(234,179,8,0.35)',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', border: '2px solid #eab308', flexShrink: 0, background: '#111',
              }}>
                {feedAdViewer.authorAvatarUrl ? (
                  <img src={feedAdViewer.authorAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : null}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#fff', fontWeight: 800, fontSize: '0.9rem' }}>@{String(feedAdViewer.authorUsername || 'business').replace(/^@/, '')}</span>
                  <span style={{ fontSize: '0.6rem', fontWeight: 900, color: '#0a0a0a', background: '#eab308', borderRadius: 4, padding: '2px 6px' }}>Ads</span>
                </div>
                {feedAdViewer.title ? <p style={{ margin: '2px 0 0', color: 'rgba(255,255,255,0.75)', fontSize: '0.75rem' }}>{feedAdViewer.title}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => setFeedAdViewer(null)}
                aria-label="Close"
                style={{
                  border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff',
                  width: 36, height: 36, minWidth: 36, borderRadius: '50%', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0,
                }}
              >
                <X size={18} strokeWidth={2.4} />
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', minHeight: 220 }}>
                {(() => {
                  const src = feedAdViewer.mediaUrl || feedAdViewer.pdfUrl || '';
                  if (feedAdViewer.mediaType === 'video' && src) {
                    return <video src={src} controls autoPlay playsInline style={{ width: '100%', maxHeight: '55vh', background: '#000' }} />;
                  }
                  if (feedAdViewer.mediaType === 'image' && src) {
                    return <img src={src} alt="" style={{ width: '100%', maxHeight: '55vh', objectFit: 'contain' }} />;
                  }
                  if (feedAdViewer.mediaType === 'pdf' || feedAdViewer.pdfUrl) {
                    return (
                      <div style={{ padding: 24, textAlign: 'center' }}>
                        <FileText size={48} color="#eab308" />
                        <p style={{ color: '#fff', marginTop: 12, fontWeight: 700 }}>{feedAdViewer.mediaName || feedAdViewer.pdfName || 'PDF'}</p>
                        {src ? (
                          <a href={src} target="_blank" rel="noopener noreferrer" style={{
                            display: 'inline-block', marginTop: 14, padding: '10px 18px', borderRadius: 10,
                            background: '#eab308', color: '#0a0a0a', fontWeight: 900, textDecoration: 'none',
                          }}>Open PDF</a>
                        ) : null}
                      </div>
                    );
                  }
                  return <p style={{ color: 'rgba(255,255,255,0.5)' }}>No media</p>;
                })()}
              </div>
              {(feedAdViewer.title || feedAdViewer.body) && (
                <div style={{ padding: '16px 18px calc(20px + env(safe-area-inset-bottom))', background: 'linear-gradient(180deg, #111 0%, #0a0a0a 100%)', borderTop: '1px solid rgba(234,179,8,0.3)' }}>
                  {feedAdViewer.title ? <p style={{ margin: '0 0 8px', color: '#eab308', fontWeight: 900, fontSize: '1rem' }}>{feedAdViewer.title}</p> : null}
                  {feedAdViewer.body ? <p style={{ margin: 0, color: 'rgba(255,255,255,0.88)', fontSize: '0.9rem', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{feedAdViewer.body}</p> : null}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Business owner: My Ads hub (bubble center, yellow frame, Video | Photo | PDF) */}
      <AnimatePresence>
        {myAdsHubOpen && (
          <motion.div
            key="my-ads-hub"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10580, background: 'rgba(0,0,0,0.55)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
            }}
            onClick={() => setMyAdsHubOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: 'min(92vw, 380px)', maxHeight: '85vh', overflow: 'hidden',
                background: 'linear-gradient(180deg, #0f1410 0%, #0a0e0c 100%)',
                border: '2px solid #eab308', borderRadius: 18,
                boxShadow: '0 0 0 1px rgba(234,179,8,0.2), 0 20px 50px rgba(0,0,0,0.55)',
                display: 'flex', flexDirection: 'column',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid rgba(234,179,8,0.35)' }}>
                <p style={{ margin: 0, color: '#eab308', fontWeight: 900, fontSize: '0.95rem' }}>Ads</p>
                <button type="button" onClick={() => setMyAdsHubOpen(false)} style={{ border: 'none', background: 'none', color: '#eab308', cursor: 'pointer' }}><X size={18} /></button>
              </div>
              <div style={{ display: 'flex', borderBottom: '1px solid rgba(234,179,8,0.25)' }}>
                {([
                  { id: 'video' as const, label: 'Video' },
                  { id: 'photo' as const, label: 'Photo' },
                  { id: 'pdf' as const, label: 'PDF' },
                ]).map((t, i) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setMyAdsHubTab(t.id)}
                    style={{
                      flex: 1, padding: '10px 4px', border: 'none', cursor: 'pointer',
                      background: myAdsHubTab === t.id ? 'rgba(234,179,8,0.15)' : 'transparent',
                      color: myAdsHubTab === t.id ? '#eab308' : 'rgba(200,190,150,0.7)',
                      fontWeight: 800, fontSize: '0.78rem',
                      borderRight: i < 2 ? '1px solid rgba(234,179,8,0.25)' : 'none',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div style={{
                flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain',
                padding: 12, minHeight: 180, maxHeight: 'min(62vh, 520px)',
                scrollbarWidth: 'thin', scrollbarColor: 'rgba(234,179,8,0.55) transparent',
              }}>
                {(() => {
                  void feedAdsTick;
                  void adClockTick;
                  let list: any[] = [];
                  try { list = loadFeedAdsMeta(); } catch { list = []; }
                  const uid = user?.id ? String(user.id) : '';
                  const mine = list.filter(a => String(a.userId) === uid);
                  const filtered = mine.filter(a => {
                    if (myAdsHubTab === 'video') return a.mediaType === 'video' || (!a.mediaType && !a.pdfUrl && (a.title || a.body));
                    if (myAdsHubTab === 'photo') return a.mediaType === 'image' || (!a.mediaType && !a.pdfUrl && (a.title || a.body));
                    return a.mediaType === 'pdf' || !!a.pdfUrl || (!a.mediaType && !a.mediaUrl && (a.title || a.body));
                  });
                  // Prefer media-matched first; text-only ads still appear so hub is never empty after publish
                  const matched = mine.filter(a => {
                    if (myAdsHubTab === 'video') return a.mediaType === 'video';
                    if (myAdsHubTab === 'photo') return a.mediaType === 'image';
                    return a.mediaType === 'pdf' || !!a.pdfUrl;
                  });
                  const showList = matched.length ? matched : filtered;
                  if (!showList.length) {
                    return (
                      <p style={{ margin: '24px 0', textAlign: 'center', color: 'rgba(200,190,150,0.55)', fontSize: '0.8rem' }}>
                        No {myAdsHubTab} ads yet
                      </p>
                    );
                  }
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {showList.map((a, i) => (
                        <div
                          key={a.id}
                          style={{
                            width: '100%', boxSizing: 'border-box',
                            border: '1px solid rgba(234,179,8,0.4)',
                            background: 'rgba(234,179,8,0.07)', borderRadius: 10,
                            padding: '8px 10px',
                            display: 'flex', alignItems: 'center', gap: 10,
                          }}
                        >
                          <button
                            type="button"
                            onClick={async () => {
                              let full = { ...a };
                              if (!full.mediaUrl && !full.pdfUrl) {
                                const m = await stooornaAdMediaGet(String(a.id));
                                if (m) {
                                  full = { ...full, mediaUrl: m, pdfUrl: full.mediaType === 'pdf' ? m : full.pdfUrl };
                                }
                              }
                              setMyAdsHubOpen(false);
                              setFeedAdViewer(full);
                            }}
                            style={{
                              flex: 1, minWidth: 0, border: 'none', background: 'transparent', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: 0,
                            }}
                          >
                            <span style={{
                              flexShrink: 0, minWidth: 22, height: 22, borderRadius: 6,
                              background: 'rgba(234,179,8,0.25)', border: '1px solid rgba(234,179,8,0.55)',
                              color: '#eab308', fontWeight: 900, fontSize: '0.7rem',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>{i + 1}</span>
                            <div style={{
                              width: 52, height: 40, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
                              background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(234,179,8,0.25)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {a.mediaType === 'image' && a.mediaUrl ? (
                                <img src={a.mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : a.mediaType === 'video' && a.mediaUrl ? (
                                <video src={a.mediaUrl} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <FileText size={16} color="#eab308" />
                              )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ margin: 0, color: '#eab308', fontWeight: 800, fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {a.title || 'Ad'}
                              </p>
                              {(() => {
                                const phase = getAdPhase(a, Date.now());
                                const ms = getAdCountdownMs(a, Date.now());
                                const climbMs = getAdNextClimbMs(a, Date.now());
                                const climbs = getAdClimbCount(a, Date.now());
                                const label = phase === 'live'
                                  ? `Live ${formatCountdown(ms)} · up in ${formatCountdown(climbMs)}`
                                  : phase === 'cooldown'
                                    ? `Next publish ${formatCountdown(ms)}`
                                    : 'Campaign ended';
                                return (
                                  <p style={{ margin: '2px 0 0', color: phase === 'live' ? '#eab308' : 'rgba(220,210,180,0.75)', fontSize: '0.62rem', fontWeight: 700 }}>
                                    {label}{phase === 'live' ? ` · #${climbs}` : ''}
                                  </p>
                                );
                              })()}
                            </div>
                          </button>
                          <button
                            type="button"
                            aria-label="Ad details"
                            onClick={(e) => { e.stopPropagation(); setAdDetailOpen(a); }}
                            style={{
                              flexShrink: 0, width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(234,179,8,0.45)',
                              background: 'rgba(234,179,8,0.12)', color: '#eab308', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.72rem',
                            }}
                          >
                            i
                          </button>
                          <button
                            type="button"
                            aria-label="Delete ad"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const id = String(a.id);
                              await stooornaAdMediaDelete(id);
                              const next = loadFeedAdsMeta().filter((x: any) => String(x.id) !== id);
                              saveFeedAdsMeta(next);
                              setFeedAdsTick(t => t + 1);
                              if (feedAdViewer && String(feedAdViewer.id) === id) setFeedAdViewer(null);
                              if (adDetailOpen && String(adDetailOpen.id) === id) setAdDetailOpen(null);
                            }}
                            style={{
                              flexShrink: 0, width: 32, height: 32, borderRadius: 8, border: 'none',
                              background: 'rgba(239,68,68,0.15)', color: '#ef4444', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Ad details panel (timers + delete) */}
      <AnimatePresence>
        {adDetailOpen && (
          <motion.div
            key="ad-detail"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10620, background: 'rgba(0,0,0,0.6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
            }}
            onClick={() => setAdDetailOpen(null)}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: 'min(92vw, 360px)', background: 'linear-gradient(180deg, #12160e 0%, #0a0e0c 100%)',
                border: '2px solid #eab308', borderRadius: 16, padding: 16,
                boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
              }}
            >
              {(() => {
                void adClockTick;
                const a = adDetailOpen;
                const phase = getAdPhase(a, Date.now());
                const ms = getAdCountdownMs(a, Date.now());
                const phaseLabel = phase === 'live' ? 'Live on feed' : phase === 'cooldown' ? 'Cooldownoldown · auto publish soon' : 'Campaign ended';
                return (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <p style={{ margin: 0, color: '#eab308', fontWeight: 900, fontSize: '0.95rem' }}>Ad details</p>
                      <button type="button" onClick={() => setAdDetailOpen(null)} style={{ border: 'none', background: 'none', color: '#eab308', cursor: 'pointer' }}><X size={18} /></button>
                    </div>
                    <p style={{ margin: '0 0 6px', color: '#fff', fontWeight: 800, fontSize: '0.9rem' }}>{a.title || 'Ad'}</p>
                    {a.body ? <p style={{ margin: '0 0 12px', color: 'rgba(220,210,180,0.8)', fontSize: '0.78rem', lineHeight: 1.4 }}>{a.body}</p> : null}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                      <p style={{ margin: 0, color: '#eab308', fontSize: '0.78rem', fontWeight: 800 }}>{phaseLabel}</p>
                      <p style={{ margin: 0, color: 'rgba(255,255,255,0.85)', fontSize: '1.15rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
                        {phase === 'ended' ? '—' : formatCountdown(ms)}
                      </p>
                      <p style={{ margin: 0, color: 'rgba(200,190,150,0.7)', fontSize: '0.7rem' }}>
                        {phase === 'live' ? 'Until feed ends (24h cycle)' : phase === 'cooldown' ? 'Until auto Publish (4h wait)' : 'No more auto publish'}
                      </p>
                      <p style={{ margin: '6px 0 0', color: 'rgba(200,190,150,0.65)', fontSize: '0.68rem' }}>Ends at: {formatAdEndsAt(a.endsAt || a.expiresAt)}</p>
                      <p style={{ margin: 0, color: 'rgba(200,190,150,0.65)', fontSize: '0.68rem' }}>Next publish: {formatAdEndsAt(a.nextEligibleAt)}</p>
                      <p style={{ margin: 0, color: 'rgba(200,190,150,0.65)', fontSize: '0.68rem' }}>Campaign until: {formatAdEndsAt(a.campaignEndsAt)}</p>
                      <p style={{ margin: 0, color: '#eab308', fontSize: '0.68rem', fontWeight: 800 }}>
                        Next climb up (1 user): {phase === 'live' ? formatCountdown(getAdNextClimbMs(a, Date.now())) : '—'}
                      </p>
                      <p style={{ margin: 0, color: 'rgba(200,190,150,0.65)', fontSize: '0.68rem' }}>Climbs this cycle: {getAdClimbCount(a, Date.now())}</p>
                      <p style={{ margin: 0, color: 'rgba(200,190,150,0.65)', fontSize: '0.68rem' }}>Type: {a.mediaType || 'text'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const id = String(a.id);
                        await stooornaAdMediaDelete(id);
                        const next = loadFeedAdsMeta().filter((x: any) => String(x.id) !== id);
                        saveFeedAdsMeta(next);
                        setFeedAdsTick(t => t + 1);
                        if (feedAdViewer && String(feedAdViewer.id) === id) setFeedAdViewer(null);
                        setAdDetailOpen(null);
                      }}
                      style={{
                        width: '100%', padding: 12, borderRadius: 10, border: 'none',
                        background: '#ef4444', color: '#fff', fontWeight: 900, cursor: 'pointer',
                      }}
                    >
                      Delete ad
                    </button>
                  </>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Business Ads composer sheet */}
      <AnimatePresence>
        {businessAdsOpen && (
          <motion.div
            key="biz-ads"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 10450, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
            onClick={() => setBusinessAdsOpen(false)}
          >
            <motion.div
              initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 60 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto',
                background: '#fff', borderRadius: '18px 18px 0 0', padding: '16px 16px calc(20px + env(safe-area-inset-bottom))',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p style={{ margin: 0, fontWeight: 900, fontSize: '1.05rem', color: '#0a0a0a' }}>Ads</p>
                <button type="button" onClick={() => setBusinessAdsOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={20} /></button>
              </div>
              <p style={{ margin: '0 0 8px', color: '#666', fontSize: '0.75rem', fontWeight: 700 }}>Subject</p>
              <input
                value={businessAdTitle}
                onChange={e => setBusinessAdTitle(e.target.value.slice(0, 120))}
                style={{
                  width: '100%', boxSizing: 'border-box', border: '1px solid rgba(0,0,0,0.18)', borderRadius: 12,
                  padding: '12px 14px', fontSize: '0.95rem', marginBottom: 12, outline: 'none',
                  color: '#0a0a0a', background: '#ffffff', caretColor: '#0a0a0a',
                  WebkitTextFillColor: '#0a0a0a',
                }}
              />
              <p style={{ margin: '0 0 8px', color: '#666', fontSize: '0.75rem', fontWeight: 700 }}>Ad text</p>
              <textarea
                value={businessAdBody}
                onChange={e => setBusinessAdBody(e.target.value.slice(0, 2000))}
                rows={5}
                style={{
                  width: '100%', boxSizing: 'border-box', border: '1px solid rgba(0,0,0,0.18)', borderRadius: 12,
                  padding: '12px 14px', fontSize: '0.85rem', fontWeight: 400, marginBottom: 12, outline: 'none',
                  resize: 'vertical', color: '#0a0a0a', background: '#ffffff', caretColor: '#0a0a0a',
                  WebkitTextFillColor: '#0a0a0a',
                }}
              />
              <p style={{ margin: '0 0 8px', color: '#666', fontSize: '0.75rem', fontWeight: 700 }}>Media attachment</p>
              <p style={{ margin: '0 0 10px', color: '#999', fontSize: '0.68rem', lineHeight: 1.4 }}>
                Video (MP4, MOV) · Image (JPG, PNG, WebP) · PDF
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                <label style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 12,
                  border: '1.5px dashed rgba(29,155,240,0.5)', color: '#1d9bf0', fontWeight: 800, cursor: 'pointer',
                }}>
                  <Video size={18} />
                  Video (MP4, MOV)
                  <input type="file" accept="video/mp4,video/quicktime,video/*,.mp4,.mov,.m4v" hidden onChange={e => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = () => setBusinessAdMedia({ name: f.name, dataUrl: String(reader.result || ''), type: 'video', mime: f.type || 'video/mp4' });
                    reader.readAsDataURL(f);
                  }} />
                </label>
                <label style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 12,
                  border: '1.5px dashed rgba(29,155,240,0.5)', color: '#1d9bf0', fontWeight: 800, cursor: 'pointer',
                }}>
                  <ImageIcon size={18} />
                  Image (JPG, PNG, WebP)
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/*,.jpg,.jpeg,.png,.webp" hidden onChange={e => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = () => setBusinessAdMedia({ name: f.name, dataUrl: String(reader.result || ''), type: 'image', mime: f.type || 'image/jpeg' });
                    reader.readAsDataURL(f);
                  }} />
                </label>
                <label style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 12,
                  border: '1.5px dashed rgba(29,155,240,0.5)', color: '#1d9bf0', fontWeight: 800, cursor: 'pointer',
                }}>
                  <FileText size={18} />
                  PDF file
                  <input type="file" accept="application/pdf,.pdf" hidden onChange={e => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = () => setBusinessAdMedia({ name: f.name, dataUrl: String(reader.result || ''), type: 'pdf', mime: f.type || 'application/pdf' });
                    reader.readAsDataURL(f);
                  }} />
                </label>
              </div>
              {businessAdMedia && (
                <div style={{
                  marginBottom: 12, padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(0,0,0,0.1)',
                  display: 'flex', alignItems: 'center', gap: 10, background: '#f7f9f9',
                }}>
                  {businessAdMedia.type === 'image' && (
                    <img src={businessAdMedia.dataUrl} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }} />
                  )}
                  {businessAdMedia.type === 'video' && (
                    <video src={businessAdMedia.dataUrl} muted style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8 }} />
                  )}
                  {businessAdMedia.type === 'pdf' && <FileText size={22} color="#1d9bf0" />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, color: '#0a0a0a', fontWeight: 700, fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{businessAdMedia.name}</p>
                    <p style={{ margin: '2px 0 0', color: '#888', fontSize: '0.68rem', textTransform: 'uppercase' }}>{businessAdMedia.type}</p>
                  </div>
                  <button type="button" onClick={() => setBusinessAdMedia(null)} style={{ border: 'none', background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 8, width: 32, height: 32, cursor: 'pointer' }}>
                    <X size={16} />
                  </button>
                </div>
              )}
              <p style={{ margin: '0 0 12px', color: '#888', fontSize: '0.72rem', lineHeight: 1.45 }}>
                Paid placement between feed posts · 5 KD / month · deducted from Business balance
              </p>
              <button
                type="button"
                disabled={adPublishing || (!businessAdTitle.trim() && !businessAdBody.trim() && !businessAdMedia)}
                onClick={() => {
                  if (!user?.id || adPublishing) return;
                  const title = businessAdTitle.trim();
                  const body = businessAdBody.trim();
                  if (!title && !body && !businessAdMedia) return;
                  setAdPublishing(true);
                  setAdPublishProgress(0);
                  const steps = [12, 28, 45, 62, 78, 90, 100];
                  let si = 0;
                  const timer = window.setInterval(() => {
                    if (si < steps.length) {
                      setAdPublishProgress(steps[si]);
                      si += 1;
                    } else {
                      window.clearInterval(timer);
                    }
                  }, 90);
                  window.setTimeout(() => {
                    void (async () => {
                      try {
                        const balKey = `stooorna_biz_balance_${user.id}`;
                        let bal = Number(localStorage.getItem(balKey) || '0') || 0;
                        if (bal >= 5) {
                          bal = Math.max(0, bal - 5);
                          localStorage.setItem(balKey, String(bal));
                          window.dispatchEvent(new CustomEvent('stooorna:biz-balance', { detail: { userId: user.id, balance: bal } }));
                        }
                        const list = loadFeedAdsMeta();
                        const uname = String(myUsername || (user as any).username || (user as any).name || 'business').replace(/^@/, '');
                        const now = Date.now();
                        const endsAt = new Date(now + 24 * 3600 * 1000).toISOString();
                        const nextEligibleAt = new Date(now + 24 * 3600 * 1000 + 4 * 3600 * 1000).toISOString();
                        let campaignEndsAt = new Date(now + 30 * 24 * 3600 * 1000).toISOString();
                        try {
                          const ck = `stooorna_ad_campaign_${user.id}`;
                          const existing = localStorage.getItem(ck);
                          if (existing && new Date(existing).getTime() > now) campaignEndsAt = existing;
                          else localStorage.setItem(ck, campaignEndsAt);
                        } catch { /* */ }
                        const adId = `ad-${now}-${Math.random().toString(36).slice(2, 8)}`;
                        const dataUrl = businessAdMedia?.dataUrl || null;
                        if (dataUrl) {
                          await stooornaAdMediaPut(adId, dataUrl);
                        }
                        const ad = {
                          id: adId,
                          userId: String(user.id),
                          authorName: (user as any).name || uname || 'Business',
                          authorUsername: uname,
                          authorAvatarUrl: (user as any).image || (user as any).avatarUrl || null,
                          title, body,
                          mediaUrl: dataUrl,
                          mediaType: businessAdMedia?.type || (businessAdMedia ? 'image' : null),
                          mediaName: businessAdMedia?.name || null,
                          mediaMime: businessAdMedia?.mime || null,
                          pdfUrl: businessAdMedia?.type === 'pdf' ? dataUrl : null,
                          pdfName: businessAdMedia?.type === 'pdf' ? (businessAdMedia.name || null) : null,
                          createdAt: new Date(now).toISOString(),
                          endsAt,
                          expiresAt: endsAt,
                          nextEligibleAt,
                          campaignEndsAt,
                        };
                        const next = [ad, ...list.filter(a => isAdLive(a, now))].slice(0, 80);
                        saveFeedAdsMeta(next);
                        setFeedAdsTick(x => x + 1);
                        setAdPublishProgress(100);
                        setBusinessAdTitle('');
                        setBusinessAdBody('');
                        setBusinessAdMedia(null);
                        window.setTimeout(() => {
                          setBusinessAdsOpen(false);
                          setShowComposer(false);
                          setAdPublishing(false);
                          setAdPublishProgress(0);
                          try { setTextPostsPageOpen(true); } catch { /* */ }
                        }, 280);
                      } catch (err) {
                        console.error('[Ads] publish failed', err);
                        setAdPublishing(false);
                        setAdPublishProgress(0);
                      }
                      window.clearInterval(timer);
                    })();
                  }, 720);
                }}
                style={{
                  position: 'relative', width: '100%', padding: 14, borderRadius: 12, border: 'none',
                  background: '#1d9bf0', color: '#fff', fontWeight: 900, fontSize: '0.92rem',
                  cursor: adPublishing ? 'default' : 'pointer', overflow: 'hidden',
                  opacity: (!businessAdTitle.trim() && !businessAdBody.trim() && !businessAdMedia) ? 0.55 : 1,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: `${adPublishProgress}%`,
                    background: 'linear-gradient(90deg, #eab308 0%, #facc15 100%)',
                    transition: 'width 0.12s linear',
                    borderRadius: 12,
                  }}
                />
                <span style={{ position: 'relative', zIndex: 1, color: adPublishProgress > 45 ? '#0a0a0a' : '#fff' }}>
                  {adPublishing ? (adPublishProgress >= 100 ? 'Published' : 'Publishing…') : 'Publish Ad · 5 KD'}
                </span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Comments sheet (Instagram-style white bottom sheet) — opens only via comment icon ── */}
      <AnimatePresence>
        {openComments && (
          <InstagramCommentsSheet
            key={openComments.id}
            post={openComments}
            comments={postComments[openComments.id] ?? []}
            commentText={commentText}
            commentSending={commentSending}
            onChangeCommentText={setCommentText}
            onSubmitComment={submitComment}
            onClose={closePostDetail}
          />
        )}
      </AnimatePresence>

      {/* ── Full-screen product ad — tap any profile grid post opens this exact-screen page.
          Bottom: Like + external share | Details (three lines) | Comments chat.
          No repost / favorites. Video: autoplay only; tap pauses; leave page stops. ── */}
      <AnimatePresence>
        {singlePostView && (() => {
          const ad = parseProductAd(singlePostView.text);
          const mediaItems = PostMediaItems(singlePostView);
          const xUrls = extractLinkMediaUrls(singlePostView.text);
          const livePost = posts.find(p => p.id === singlePostView.id) ?? singlePostView;
          return (
            <motion.div
              key="single-post-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              style={{
                position: 'fixed', inset: 0,
                // من البروفايل: فوق البروفايل (10420) — من الفيد: تحت البروفايل لو فُتح بروفايل فوقه
                zIndex: singlePostFromProfile ? 10450 : 10380,
                background: '#000', display: 'flex', flexDirection: 'column', overflow: 'hidden',
              }}
            >
              {singlePostChromeVisible && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); closeSinglePostView(); }}
                aria-label="Close"
                style={{
                  position: 'absolute', top: 'max(12px, env(safe-area-inset-top, 0px))', insetInlineStart: 12, zIndex: 6,
                  width: 36, height: 36, borderRadius: '50%', border: 'none',
                  background: 'rgba(0,0,0,0.45)', color: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={18} strokeWidth={2.4} />
              </button>
              )}

              <div
                style={{ flex: 1, minHeight: 0, position: 'relative', background: '#000', touchAction: 'pan-y' }}
                onTouchStart={e => {
                  const t = e.changedTouches[0];
                  if (!t) return;
                  singlePostTouchRef.current = { y: t.clientY, t: Date.now() };
                }}
                onTouchEnd={e => {
                  const start = singlePostTouchRef.current;
                  singlePostTouchRef.current = null;
                  if (!start) return;
                  const t = e.changedTouches[0];
                  if (!t) return;
                  const dy = t.clientY - start.y;
                  const dt = Date.now() - start.t;
                  if (dt < 600 && Math.abs(dy) > 56) {
                    if (dy < 0) goAdjacentAuthorPost(1);
                    else goAdjacentAuthorPost(-1);
                  }
                }}
                onClick={() => setSinglePostChromeVisible(v => !v)}
              >
                {mediaItems.length > 0 ? (
                  <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                    <div
                      ref={singlePostMediaScrollRef}
                      onScroll={e => {
                        if (mediaItems.length <= 1) return;
                        const el = e.currentTarget;
                        if (!el.clientWidth) return;
                        const idx = Math.round(el.scrollLeft / el.clientWidth);
                        setSinglePostMediaPage(prev => (prev === idx ? prev : idx));
                      }}
                      onClick={e => e.stopPropagation()}
                      style={{
                        display: 'flex', flexDirection: 'row', width: '100%', height: '100%',
                        direction: 'ltr',
                        overflowX: mediaItems.length > 1 ? 'auto' : 'hidden',
                        scrollSnapType: mediaItems.length > 1 ? 'x mandatory' : undefined,
                        WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
                      }}
                    >
                      {mediaItems.map((media, index) => {
                        const pdf = /\.pdf(\?|$)/i.test(media.url);
                        return (
                          <div
                            key={`${media.type}-${index}-${media.url.slice(-12)}`}
                            style={{
                              width: '100%', height: '100%', flexShrink: 0,
                              scrollSnapAlign: mediaItems.length > 1 ? 'start' : undefined,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000',
                            }}
                          >
                            {pdf ? (
                              <iframe title="PDF" src={media.url} style={{ width: '100%', height: '100%', border: 'none', background: '#111' }} />
                            ) : media.type === 'video' ? (
                              <video
                                key={media.url}
                                src={media.url}
                                autoPlay={index === singlePostMediaPage}
                                loop
                                playsInline
                                muted={false}
                                controls={false}
                                onClick={e => {
                                  e.stopPropagation();
                                  setSinglePostChromeVisible(v => !v);
                                }}
                                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: '#000', cursor: 'pointer' }}
                              />
                            ) : (
                              <img
                                src={media.url}
                                alt=""
                                onClick={e => {
                                  e.stopPropagation();
                                  setSinglePostChromeVisible(v => !v);
                                }}
                                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: '#000' }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {mediaItems.length > 1 && (
                      <>
                        <div style={{
                          position: 'absolute', top: 'max(14px, env(safe-area-inset-top))', left: '50%', transform: 'translateX(-50%)',
                          padding: '4px 12px', borderRadius: 999, background: 'rgba(0,0,0,0.55)',
                          color: '#fff', fontSize: '0.75rem', fontWeight: 800, zIndex: 4, pointerEvents: 'none',
                        }}>
                          {singlePostMediaPage + 1}/{mediaItems.length}
                        </div>
                        {singlePostMediaPage > 0 && (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              const el = singlePostMediaScrollRef.current;
                              if (!el) return;
                              const next = Math.max(0, singlePostMediaPage - 1);
                              el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
                              setSinglePostMediaPage(next);
                            }}
                            style={{
                              position: 'absolute', top: '50%', left: 10, transform: 'translateY(-50%)',
                              width: 34, height: 34, borderRadius: '50%', border: 'none',
                              background: 'rgba(0,0,0,0.45)', color: '#fff', cursor: 'pointer', zIndex: 4,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            <ChevronLeft size={18} />
                          </button>
                        )}
                        {singlePostMediaPage < mediaItems.length - 1 && (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              const el = singlePostMediaScrollRef.current;
                              if (!el) return;
                              const next = Math.min(mediaItems.length - 1, singlePostMediaPage + 1);
                              el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
                              setSinglePostMediaPage(next);
                            }}
                            style={{
                              position: 'absolute', top: '50%', right: 10, transform: 'translateY(-50%)',
                              width: 34, height: 34, borderRadius: '50%', border: 'none',
                              background: 'rgba(0,0,0,0.45)', color: '#fff', cursor: 'pointer', zIndex: 4,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            <ChevronRight size={18} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                ) : xUrls.length > 0 ? (
                  <div style={{ width: '100%', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: '56px 12px 12px', boxSizing: 'border-box' }}>
                    <div style={{ margin: 'auto 0', width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {xUrls.map(u => <LinkMediaPreview key={u} url={u} />)}
                    </div>
                  </div>
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                    <p style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800, textAlign: 'center', lineHeight: 1.5 }}>
                      {ad?.title || productAdDisplayTitle(singlePostView)}
                    </p>
                  </div>
                )}
              </div>

              {singlePostChromeVisible && (
              <div
                onClick={e => e.stopPropagation()}
                style={{
                flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 20px calc(12px + env(safe-area-inset-bottom, 0px))',
                background: 'linear-gradient(to top, rgba(0,0,0,0.92), rgba(0,0,0,0.55))',
                borderTop: '1px solid rgba(255,255,255,0.08)',
              }}>
                {/* الترتيب: لايك → تعليقات → شير | تفاصيل | بروفايل الشركة */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 88 }}>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => toggleLike(livePost)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: livePost.likedByMe ? '#ef4444' : '#fff' }}
                  >
                    <Heart size={22} strokeWidth={2} fill={livePost.likedByMe ? '#ef4444' : 'none'} />
                    <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>{livePost.likesCount > 0 ? livePost.likesCount : ''}</span>
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => loadComments(livePost)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: '#fff' }}
                  >
                    <MessageCircle size={22} strokeWidth={2} />
                    <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>{livePost.commentsCount > 0 ? livePost.commentsCount : ''}</span>
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => {
                      if (guestGuard()) return;
                      if (productInquiryShareAlert(livePost.id)) {
                        clearProductInquiryReplyFlag(livePost.id);
                        openShareMiniChat({ id: livePost.authorId, name: livePost.authorName, username: livePost.authorUsername, avatarUrl: livePost.authorAvatarUrl, post: livePost });
                        return;
                      }
                      setProductShareMenuPost(livePost);
                    }}
                    aria-label="مشاركة الإعلان"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 4,
                      color: productInquiryShareAlert(livePost.id) ? '#eab308' : '#fff',
                    }}
                  >
                    <Send size={20} strokeWidth={2} color={productInquiryShareAlert(livePost.id) ? '#eab308' : undefined} />
                  </motion.button>
                </div>

                <motion.button
                  whileTap={{ scale: postHasVisibleCaption(livePost) ? 0.92 : 1 }}
                  onClick={() => { if (postHasVisibleCaption(livePost)) setAdDetailsOpen(true); }}
                  aria-label="Details"
                  disabled={!postHasVisibleCaption(livePost)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)',
                    borderRadius: 12, width: 52, height: 44,
                    cursor: postHasVisibleCaption(livePost) ? 'pointer' : 'default',
                    padding: 0, opacity: postHasVisibleCaption(livePost) ? 1 : 0.28,
                  }}
                >
                  <span style={{ width: 18, height: 2, borderRadius: 1, background: '#fff' }} />
                  <span style={{ width: 18, height: 2, borderRadius: 1, background: '#fff' }} />
                  <span style={{ width: 18, height: 2, borderRadius: 1, background: '#fff' }} />
                </motion.button>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 88, justifyContent: 'flex-end' }}>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    type="button"
                    onClick={() => {
                      if (user && String(livePost.authorId) === String(user.id)) return;
                      const isCo = !!(
                        companies.some(c => String(c.id) === String(livePost.authorId))
                        || isCompanyUserAccount({ id: livePost.authorId, username: livePost.authorUsername, name: livePost.authorName }, companies)
                        || (livePost as any).publisherType === 'company'
                        || (livePost as any).authorIsCompany === true
                        || (livePost as any).isCompanyPost === true
                      );
                      setViewingProfile({
                        id: livePost.authorId,
                        name: livePost.authorName,
                        username: livePost.authorUsername,
                        avatarUrl: livePost.authorAvatarUrl,
                        isCompany: isCo,
                      });
                    }}
                    aria-label="Profile"
                    title="Profile"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 36, height: 36, borderRadius: 10,
                      background: 'rgba(0,188,212,0.18)',
                      border: '1px solid rgba(0,188,212,0.45)',
                      color: '#00BCD4', cursor: 'pointer', padding: 0, flexShrink: 0,
                      overflow: 'hidden',
                    }}
                  >
                    {livePost.authorAvatarUrl ? (
                      <img src={livePost.authorAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      (() => {
                        const isCo = !!(
                          companies.some(c => String(c.id) === String(livePost.authorId))
                          || isCompanyUserAccount({ id: livePost.authorId, username: livePost.authorUsername, name: livePost.authorName }, companies)
                          || (livePost as any).publisherType === 'company'
                          || (livePost as any).authorIsCompany === true
                          || (livePost as any).isCompanyPost === true
                        );
                        return isCo
                          ? <Building2 size={18} strokeWidth={2.2} />
                          : <Users size={18} strokeWidth={2.2} />;
                      })()
                    )}
                  </motion.button>
                </div>
              </div>
              )}

              <AnimatePresence>
                {adDetailsOpen && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setAdDetailsOpen(false)}
                    style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}
                  >
                    <motion.div
                      initial={{ y: '100%' }}
                      animate={{ y: 0 }}
                      exit={{ y: '100%' }}
                      transition={{ type: 'spring', stiffness: 420, damping: 38 }}
                      onClick={e => e.stopPropagation()}
                      style={{
                        width: '100%', maxHeight: '70vh', overflowY: 'auto',
                        background: '#fff', borderRadius: '18px 18px 0 0',
                        padding: '14px 18px calc(20px + env(safe-area-inset-bottom, 0px))',
                      }}
                    >
                                            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.15)', margin: '0 auto 14px' }} />
                      {(() => {
                        const isCo = !!(
                          companies.some(c => String(c.id) === String(singlePostView.authorId))
                          || isCompanyUserAccount({ id: singlePostView.authorId, username: singlePostView.authorUsername, name: singlePostView.authorName }, companies)
                          || (singlePostView as any).publisherType === 'company'
                          || (singlePostView as any).authorIsCompany === true
                          || (singlePostView as any).isCompanyPost === true
                        );
                        const plain = (singlePostView.text || '').replace(/\u27E6stooorna-product:[A-Za-z0-9+/=]+\u27E7\s*$/u, '').trim();
                        if (!isCo) {
                          return (
                            <p style={{ margin: 0, color: '#0a0a0a', fontSize: '0.95rem', fontWeight: 600, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                              {plain}
                            </p>
                          );
                        }
                        return (
                          <>
                            <p style={{ margin: 0, color: '#0a0a0a', fontSize: '1.15rem', fontWeight: 800, lineHeight: 1.35 }}>
                              {ad?.title || productAdDisplayTitle(singlePostView)}
                            </p>
                            {ad?.price ? (
                              <p style={{ margin: '8px 0 0', color: CLR_PRIMARY, fontSize: '1rem', fontWeight: 800 }}>{ad.price}</p>
                            ) : null}
                            {ad?.details ? (
                              <p style={{ margin: '14px 0 0', color: '#1a1a1a', fontSize: '0.9rem', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{ad.details}</p>
                            ) : null}
                          </>
                        );
                      })()}
                      <button
                        type="button"
                        onClick={() => setAdDetailsOpen(false)}
                        style={{
                          marginTop: 18, width: '100%', height: 44, borderRadius: 12, border: 'none',
                          background: '#0f1419', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
                        }}
                      >
                        إغلاق
                      </button>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ── Text Posts Page — X أحمر متحرك بالأعلى + New Post تحتها بالمنتصف؛ الشريط السفلي مخفي ── */}
      <AnimatePresence>
      {textPostsPageOpen && (
          <motion.div
            key="text-posts-page"
            initial={textPostsOpenedFromUrl.current ? false : { opacity: 0, y: -36 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0,
              bottom: 0,
              zIndex: 10300,
              background: PAGE_BG,
              transformOrigin: 'center center',
            }}
          >
            {/* Top header: centered STOOORNA with slow shine; wave pulse when new public posts arrive */}
            <div
              ref={postsChromeTopRef}
              style={{
              position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 28,
              paddingTop: 'max(4px, env(safe-area-inset-top, 0px))',
              paddingBottom: 4,
              borderBottom: '1px solid rgba(0,188,212,0.35)',
              background: 'rgba(6,14,14,0.96)',
              transform: 'translate3d(0,0,0)',
              opacity: 1,
              willChange: 'transform, opacity',
              transition: 'transform 0.22s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.18s ease',
              pointerEvents: 'auto',
              backfaceVisibility: 'hidden' as const,
            }}>
              <style>{`
                @keyframes stooornaTitleShine {
                  0% { background-position: 200% center; }
                  100% { background-position: -200% center; }
                }
                @keyframes stooornaTitleWave {
                  0%, 100% { transform: scale(1); letter-spacing: 0.18em; filter: brightness(1); }
                  35% { transform: scale(1.06); letter-spacing: 0.22em; filter: brightness(1.35); }
                  70% { transform: scale(0.98); letter-spacing: 0.16em; filter: brightness(1.1); }
                }
              `}</style>
              <button
                type="button"
                onClick={() => {
                  if (newPostsAvailable > 0) loadPendingNewPosts();
                }}
                aria-label="STOOORNA"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '2px 8px', borderRadius: 8, cursor: newPostsAvailable > 0 ? 'pointer' : 'default',
                  background: 'transparent', border: 'none',
                }}
              >
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    letterSpacing: '0.18em',
                    lineHeight: 1.2,
                    userSelect: 'none',
                    backgroundImage: 'linear-gradient(105deg, #00BCD4 0%, #00BCD4 38%, #e0fbff 48%, #ffffff 52%, #e0fbff 56%, #00BCD4 68%, #00BCD4 100%)',
                    backgroundSize: '220% 100%',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    color: 'transparent',
                    WebkitTextFillColor: 'transparent',
                    animation: newPostsAvailable > 0
                      ? 'stooornaTitleShine 3.8s linear infinite, stooornaTitleWave 1.4s ease-in-out infinite'
                      : 'stooornaTitleShine 5.5s linear infinite',
                  }}
                >
                  STOOORNA
                </span>
              </button>
            </div>
            <div
              ref={textPostsScrollRef}
              onScroll={handleTextPostsScroll}
              className="overflow-y-auto overscroll-contain"
              style={{
                position: 'absolute', inset: 0,
                paddingTop: 'calc(28px + max(4px, env(safe-area-inset-top, 0px)))',
                paddingBottom: 'calc(57.5px + max(8px, env(safe-area-inset-bottom, 0px)))',
                WebkitOverflowScrolling: 'touch', touchAction: 'pan-y',
              }}
            >
              {(() => {
                // فصل صارم: شركات فقط في تبويب الشركات — أفراد في تبويب التطبيق
                // لا نعتمد على parseProductAd وحده (المستخدمون الأفراد ينشرون بنفس صيغة العنوان/التفاصيل)
                const isCompanyPost = (p: PostItem) => {
                  const anyP = p as PostItem & { publisherType?: string; isCompanyPost?: boolean; authorIsCompany?: boolean };
                  if (anyP.publisherType === 'company' || anyP.isCompanyPost === true || anyP.authorIsCompany === true) return true;
                  if (anyP.publisherType === 'user' || anyP.isCompanyPost === false || anyP.authorIsCompany === false) return false;
                  if (companies.some(c => String(c.id) === String(p.authorId))) return true;
                  // حساب الشركة الحالي: منشوراته في قسم الشركات
                  if (user && String(p.authorId) === String(user.id) && isCompanyPublisher) return true;
                  // حساب فردي حالي: منشوراته في قسم المستخدمين
                  if (user && String(p.authorId) === String(user.id) && !isCompanyPublisher) return false;
                  return isCompanyUserAccount({ id: p.authorId, username: p.authorUsername, name: p.authorName }, companies);
                };
                const feedPosts = combinedFeedPosts.filter(p =>
                  textFeedTab === 'companies' ? isCompanyPost(p) : !isCompanyPost(p)
                );
                const feedAds: any[] = (() => {
                  void feedAdsTick;
                  void adClockTick;
                  try {
                    const now = Date.now();
                    return loadFeedAdsMeta().filter((a: any) => isAdLive(a, now));
                  } catch { return []; }
                })();
                const renderFeedAdCard = (ad: any, key: string) => (
                  <div
                    key={key}
                    role="button"
                    tabIndex={0}
                    className="stooorna-feed-ad-card"
                    onClick={() => {
                      void (async () => {
                        let full = { ...ad };
                        if (!full.mediaUrl && !full.pdfUrl) {
                          const m = await stooornaAdMediaGet(String(ad.id));
                          if (m) full = { ...full, mediaUrl: m, pdfUrl: full.mediaType === 'pdf' ? m : full.pdfUrl };
                        }
                        setFeedAdViewer(full);
                      })();
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        void (async () => {
                          let full = { ...ad };
                          if (!full.mediaUrl && !full.pdfUrl) {
                            const m = await stooornaAdMediaGet(String(ad.id));
                            if (m) full = { ...full, mediaUrl: m, pdfUrl: full.mediaType === 'pdf' ? m : full.pdfUrl };
                          }
                          setFeedAdViewer(full);
                        })();
                      }
                    }}
                    style={{
                      position: 'relative',
                      width: 'calc(100% - 20px)',
                      maxWidth: '100%',
                      textAlign: 'left', cursor: 'pointer',
                      padding: '10px 12px',
                      background: 'linear-gradient(180deg, rgba(234,179,8,0.12) 0%, rgba(255,255,255,0.98) 55%)',
                      border: '2px solid #eab308',
                      borderRadius: 14,
                      margin: '8px auto',
                      boxSizing: 'border-box',
                      overflow: 'visible',
                      boxShadow: '0 0 0 1px rgba(234,179,8,0.25), 0 8px 24px rgba(234,179,8,0.12)',
                    }}
                  >
                    <span aria-hidden className="stooorna-ad-side-glow stooorna-ad-side-glow-left" />
                    <span aria-hidden className="stooorna-ad-side-glow stooorna-ad-side-glow-right" />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
                        border: '2px solid #eab308', background: '#111',
                      }}>
                        {ad.authorAvatarUrl ? (
                          <img src={ad.authorAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#eab308', fontWeight: 900, fontSize: '0.85rem' }}>
                            {(ad.authorUsername || ad.authorName || 'A').toString().replace(/^@/, '').slice(0, 1).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ color: '#0a0a0a', fontWeight: 800, fontSize: '0.88rem' }}>
                            @{String(ad.authorUsername || 'business').replace(/^@/, '')}
                          </span>
                          <span style={{
                            fontSize: '0.62rem', fontWeight: 900, color: '#0a0a0a',
                            background: '#eab308', borderRadius: 5, padding: '2px 7px', letterSpacing: '0.04em',
                          }}>Ads</span>
                        </div>
                        {(() => {
                          void adClockTick;
                          const ms = getAdCountdownMs(ad, Date.now());
                          const phase = getAdPhase(ad, Date.now());
                          if (phase !== 'live') return null;
                          return (
                            <p style={{
                              margin: '3px 0 0', color: '#a16207', fontWeight: 800, fontSize: '0.72rem',
                              letterSpacing: '0.02em',
                            }}>
                              Live · {formatCountdown(ms)}
                            </p>
                          );
                        })()}
                      </div>
                    </div>
                    {(ad.title || ad.body) ? (
                      <p style={{
                        margin: '8px 0 0', color: '#222', fontSize: '0.84rem', lineHeight: 1.35,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {String(ad.title || ad.body || '').trim()}
                      </p>
                    ) : null}
                  </div>
                );
                const adGlowStyle = (
                  <style>{`
                    @keyframes stooornaAdSidePulse {
                      0%, 100% { opacity: 0.35; filter: blur(4px); }
                      50% { opacity: 0.95; filter: blur(7px); }
                    }
                    .stooorna-ad-side-glow {
                      position: absolute;
                      top: 10%;
                      bottom: 10%;
                      width: 7px;
                      border-radius: 8px;
                      pointer-events: none;
                      z-index: 2;
                      background: #eab308;
                      box-shadow: 0 0 12px 3px rgba(234,179,8,0.75), 0 0 22px 6px rgba(250,204,21,0.45);
                      animation: stooornaAdSidePulse 1.6s ease-in-out infinite;
                    }
                    .stooorna-ad-side-glow-left { left: -5px; }
                    .stooorna-ad-side-glow-right { right: -5px; animation-delay: 0.8s; }
                    .stooorna-feed-ad-card { isolation: isolate; }
                  `}</style>
                );
                return feedPosts.length > 0 || feedAds.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {adGlowStyle}
                  {(() => {
                    void adClockTick;
                    const mixed = buildFeedWithAds(feedPosts, feedAds, Date.now());
                    return mixed.map((item, idx) => {
                      if (item.type === 'ad') {
                        return renderFeedAdCard(item.ad, `mix-ad-${item.ad.id}-${idx}`);
                      }
                      const post = item.post;
                      return (
                    <PostCard
                      key={post.repostKey ?? post.id}
                      post={post}
                      likeBurstKey={likeBubbleKey[post.id] ?? 0}
                      isMine={!!user && post.authorId === user.id}
                      followStatus={
                        !user || post.authorId === user.id
                          ? null
                          : friends.some(f => f.friendId === post.authorId)
                            ? 'accepted'
                            : outgoingRequestedIds.has(post.authorId)
                              ? 'pending'
                              : 'none'
                      }
                      onFollow={followAuthorFromPost}
                      onToggleLike={toggleLike}
                      onOpenPost={p => {
                        const companyAuthor = !!p.authorId && (
                          companies.some(c => String(c.id) === String(p.authorId)) ||
                          isCompanyUserAccount({ id: p.authorId, username: p.authorUsername, name: p.authorName })
                        );
                        const hasMedia = PostMediaItems(p).length > 0;
                        if (hasMedia || parseProductAd(p.text) || companyAuthor) openSinglePostView(p);
                        else openTextPostDetail(p);
                      }}
                      onOpenComments={loadComments}
                      onRequestDelete={setConfirmDeletePost}
                      onRemoveMedia={removePostMedia}
                      onHashtag={openHashtag}
                      onToggleFavorite={handleToggleFavoritePost}
                      isFavorited={isPostFavorited}
                      onShare={post => {
                        if (guestGuard()) return;
                        const companyAuthor = companies.some(c => String(c.id) === String(post.authorId)) ||
                          isCompanyUserAccount({ id: post.authorId, username: post.authorUsername, name: post.authorName }) ||
                          !!parseProductAd(post.text);
                        if (companyAuthor) {
                          setProductShareMenuPost(post);
                        } else {
                          setProductShareMenuPost(post); // same sheet; second action differs below
                        }
                      }}
                      onProductShareMenu={post => {
                        if (guestGuard()) return;
                        void inquiryAlertTick;
                        if (productInquiryShareAlert(post.id)) {
                          clearProductInquiryReplyFlag(post.id);
                          openShareMiniChat({ id: post.authorId, name: post.authorName, username: post.authorUsername, avatarUrl: post.authorAvatarUrl, post });
                          return;
                        }
                        setProductShareMenuPost(post);
                      }}
                      productShareAlert={productInquiryShareAlert(post.id)}
                      isCompanyAuthor={
                        !!post.authorId && (
                          companies.some(c => String(c.id) === String(post.authorId)) ||
                          isCompanyUserAccount({ id: post.authorId, username: post.authorUsername, name: post.authorName })
                        )
                      }
                      onRepost={toggleRepost}
                      onDownload={handleDownloadPost}
                      onOpenProfile={p => {
                        if (user && String(p.authorId) === String(user.id)) return;
                        setViewingProfile({
                          id: p.authorId, name: p.authorName, username: p.authorUsername, avatarUrl: p.authorAvatarUrl,
                        });
                      }}
                      isPinned={!!user && post.authorId === user.id && pinnedPostId === post.id}
                      onTogglePin={handleTogglePinPost}
                    />
                      );
                    });
                  })()}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3" style={{ paddingTop: 32 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: '50%',
                    background: CLR_PRIMARY_FAINT, border: `1px solid ${CLR_PRIMARY_BORDER}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: CLR_PRIMARY_DIM,
                  }}>
                    <FileText size={20} strokeWidth={1.5} />
                  </div>
                  <p style={{ color: CLR_TEXT_DIM, fontSize: '0.82rem', textAlign: 'center', maxWidth: 220, lineHeight: 1.6 }}>
                    {textFeedTab === 'companies' ? 'لا منشورات شركات بعد' : 'لا منشورات مستخدمين بعد'}
                  </p>
                </div>
              );
              })()}
            </div>

            {/* هيدر سفلي: شركات = New Post بالمنتصف | أفراد = × للإغلاق بالمنتصف فقط */}
            <div
              ref={postsChromeBottomRef}
              style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 2,
              paddingTop: 8,
              paddingBottom: 'max(8px, env(safe-area-inset-bottom, 0px))',
              paddingLeft: 14,
              paddingRight: 14,
              borderTop: `1.5px solid ${CLR_PRIMARY}`,
              background: 'rgba(6,14,14,0.96)',
              minHeight: 48,
              transform: 'translate3d(0,0,0)',
              opacity: 1,
              willChange: 'transform, opacity',
              transition: 'transform 0.22s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.18s ease',
              pointerEvents: 'auto',
              backfaceVisibility: 'hidden' as const,
            }}>
              <>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!user) {
                      navigate('/settings');
                      return;
                    }
                    setComposerDestination('text');
                    setComposerError('');
                    try { clearPostMedia(); } catch { /* */ }
                    try {
                      const uid = user?.id;
                      const isBiz = uid && (() => { try { const list = JSON.parse(localStorage.getItem('stooorna_business_registry') || '[]'); return Array.isArray(list) && list.some((x: any) => String(x.userId) === String(uid) && x.status === 'approved'); } catch { return false; } })();
                      setComposerBizHint(!!isBiz);
                    } catch { setComposerBizHint(false); }
                    window.setTimeout(() => setShowComposer(true), 0);
                  }}
                  aria-label={!user ? 'تسجيل الدخول' : 'Create a text post'}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    height: 40, minWidth: 120, padding: '0 18px', borderRadius: 20,
                    border: `1px solid ${CLR_PRIMARY_BORDER}`,
                    background: CLR_PRIMARY_FAINT,
                    color: CLR_PRIMARY,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                    zIndex: 1,
                  }}
                >
                  {!user ? <LogIn size={16} strokeWidth={2.4} /> : <PenLine size={16} strokeWidth={2.4} />}
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.02em' }}>{!user ? 'تسجيل الدخول' : 'New Post'}</span>
                </motion.button>
                <style>{`@keyframes stooornaRedXSpin { from { transform: translateY(-50%) rotate(0deg); } to { transform: translateY(-50%) rotate(360deg); } }`}</style>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTextPostsMenuOpen(false);
                    setTextPostsPageOpen(false);
                  }}
                  aria-label="إغلاق"
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    width: 36, height: 36,
                    border: 'none', background: 'none',
                    color: '#ef4444', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    animation: 'stooornaRedXSpin 2.4s linear infinite',
                    transformOrigin: 'center',
                  }}
                >
                  <X size={22} strokeWidth={2.6} />
                </button>
              </>
            </div>
          </motion.div>
      )}
      </AnimatePresence>

      {/* ── Shared-Posts Inbox — posts other users sent me via the share sheet ── */}
      <AnimatePresence>
        {sharedInboxOpen && (
          <SharedInboxDrawer
            shares={sharedInbox}
            postInteractions={postInteractions}
            loading={sharedInboxLoading}
            onClose={() => { setSharedInboxOpen(false); setSharedInboxStoryOnly(false); }}
            initialSection="story"
            storyOnly
            onOpenShare={openSharedPost}
            storyThreads={storyCommentThreads}
            storyThreadsLoading={storyCommentThreadsLoading}
            onOpenStoryThread={handleOpenStoryCommentThread}
            onDeleteStoryThread={async (thread) => {
              try {
                await fetch(`/api/status/${thread.storyId}/comments`, { method: 'DELETE' });
                setStoryCommentThreads(prev => prev.filter(t => t.storyId !== thread.storyId));
              } catch { /* ignore */ }
            }}
            postThreads={postCommentThreads}
            postThreadsLoading={postCommentThreadsLoading}
            onOpenPostThread={handleOpenPostCommentThread}
            favoritedPosts={favoritedPosts}
            onOpenFavoritePost={post => { setSharedInboxOpen(false); openTextPostDetail(post); }}
            userShareInbox={userShareInbox}
            onOpenUserShare={(item) => {
              if (!user?.id) return;
              const list = loadUserShareInbox(user.id).map(x => x.id === item.id ? { ...x, read: true } : x);
              saveUserShareInbox(user.id, list);
              setUserShareInbox(list);
              setSharedInboxOpen(false);
              setUserShareChatPeer({
                id: item.fromId,
                name: item.fromName,
                username: item.fromUsername,
                avatarUrl: item.fromAvatar,
                post: item.post,
                note: item.note,
              });
              setShareMiniMsgs(loadShareThread(user.id, item.fromId, item.post?.id ?? item.id));
              setShareMiniText('');
            }}
            onDeleteUserShare={(id) => {
              if (!user?.id) return;
              if (!window.confirm('حذف هذه المشاركة من قائمة Chat؟')) return;
              const list = loadUserShareInbox(user.id).filter(x => x.id !== id);
              saveUserShareInbox(user.id, list);
              setUserShareInbox(list);
            }}
            zIndex={cameraCaptureOpen ? 13000 : 10295}
          />
        )}
      </AnimatePresence>

      {/* ── Story Comment Thread — opened from inside the inbox box above (section 2) ── */}
      <AnimatePresence>
        {openStoryCommentThread && (
          <StoryCommentThreadPage
            thread={storyCommentThreads.find(t => t.storyId === openStoryCommentThread.storyId) ?? openStoryCommentThread}
            comments={storyThreadComments[openStoryCommentThread.storyId] ?? []}
            commentText={storyThreadCommentText}
            commentSending={storyThreadCommentSending}
            onChangeCommentText={setStoryThreadCommentText}
            onSubmitComment={submitStoryThreadComment}
            onToggleLike={toggleStoryCommentLike}
            onClose={() => setOpenStoryCommentThread(null)}
            onChatWithAuthor={(c) => {
              // أغلق الطبقات (تعليقات + صندوق الوارد + الكاميرا) ثم افتح الشات مع صاحب التعليق
              setOpenStoryCommentThread(null);
              setSharedInboxOpen(false);
              setSharedInboxStoryOnly(false);
              setCameraCaptureOpen(false);
              openShareMiniChat({ id: c.authorId, name: c.authorName, avatarUrl: c.authorAvatarUrl });
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Shared Post Thread — opened by tapping an item inside the inbox above ── */}
      <AnimatePresence>
        {openSharedThread && (
          <SharedPostThread
            share={sharedInbox.find(s => s.id === openSharedThread.id) ?? openSharedThread}
            comments={sharedThreadComments[openSharedThread.id] ?? []}
            commentText={sharedCommentText}
            commentSending={sharedCommentSending}
            onChangeCommentText={setSharedCommentText}
            onSubmitComment={submitSharedComment}
            onToggleLike={toggleSharedPostLike}
            onClose={() => setOpenSharedThread(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Delete Post Confirmation ── */}
      <AnimatePresence>
        {confirmDeletePost && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }}
            onClick={() => deletingPostId === null && setConfirmDeletePost(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
              zIndex: 10420, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
            }}
          >
            <motion.div
              onClick={e => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
              style={{
                background: 'hsl(var(--card))',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 16,
                padding: '24px 20px',
                width: '100%',
                maxWidth: 300,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 46, height: 46, borderRadius: '50%',
                  background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Trash2 size={19} strokeWidth={2} color="#ef4444" />
                </div>
                <p style={{ color: CLR_TEXT, fontSize: '0.88rem', fontWeight: 700, margin: 0 }}>حذف المنشور</p>
              </div>
              <p style={{ color: CLR_TEXT_DIM, fontSize: '0.8rem', lineHeight: 1.5, textAlign: 'center', margin: 0 }}>
                هل تريد حذف هذا المنشور نهائياً؟ لا يمكن التراجع عن هذا الإجراء.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setConfirmDeletePost(null)}
                  disabled={deletingPostId !== null}
                  style={{
                    flex: 1, padding: '10px', background: CLR_PRIMARY_FAINT,
                    border: `1px solid ${CLR_PRIMARY_BORDER}`, borderRadius: 10,
                    color: CLR_TEXT, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  إلغاء
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => deletePost(confirmDeletePost)}
                  disabled={deletingPostId !== null}
                  style={{
                    flex: 1, padding: '10px', background: 'rgba(239,68,68,0.18)',
                    border: '1px solid rgba(239,68,68,0.4)', borderRadius: 10,
                    color: '#ef4444', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  {deletingPostId === confirmDeletePost.id ? (
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }} style={{
                      width: 14, height: 14, borderRadius: '50%',
                      border: '2px solid rgba(239,68,68,0.3)', borderTopColor: '#ef4444',
                    }} />
                  ) : <><Trash2 size={13} strokeWidth={2} /> حذف</>}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* قائمة Photo/Video للقصة أُلغيت — الفتح مباشرة من المعرض أو الكاميرا */}

      {/* ── Story Viewer ── */}
      <AnimatePresence>
        {viewerGroupIdx !== null && (
          <StoryViewer
            groups={storyGroups}
            startGroupIdx={viewerGroupIdx}
            myId={user?.id ?? ''}
            onClose={() => setViewerGroupIdx(null)}
            onSeen={markStorySeen}
            onAddMedia={() => { requestAnimationFrame(() => storyAddFileRef.current?.click()); }}
            onPublishPhoto={() => quickImageInputRef.current?.click()}
            onPublishVideo={() => quickVideoInputRef.current?.click()}
            onOpenCamera={() => setCameraCaptureOpen(true)}
            isCompanyPublisher={isCompanyPublisher}
            onSendComment={sendStoryComment}
            onDeleteItem={(storyId) => {
              // نسجّل المعرّف كمحذوف محلياً أولاً حتى لو رجع الريفرش التلقائي
              // (كل ثانيتين) بنسخة كان قد طلبها قبل اكتمال الحذف على السيرفر،
              // ما يخلي الستوري يرجع يظهر بعد ما اختفى.
              deletedStoryIdsRef.current.add(storyId);
              setStoryGroups(prev => prev.map(g => ({
                ...g,
                items: g.items.filter(it => it.id !== storyId),
              })).filter(g => g.items.length > 0));
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Hidden inputs for quick "نشر صورة"/"نشر فيديو" — one-tap post publish ── */}
      <input
        ref={quickImageInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) void quickPublishMedia(file, 'image');
          e.target.value = '';
        }}
      />
      <input
        ref={quickVideoInputRef}
        type="file"
        accept="video/*"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) void quickPublishMedia(file, 'video');
          e.target.value = '';
        }}
      />

      {/* قائمة الثلاث خطوط أُزيلت — الموسيقى في الإعدادات */}


      {/* ── Publish menu — opened from the "+" badge on my story avatar: نشر إعلان للقصة / نشر صورة / نشر فيديو ── */}
      <AnimatePresence>
        {publishMenuOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }}
            onClick={() => setPublishMenuOpen(false)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
              zIndex: 12010, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
            }}
          >
            <motion.div
              onClick={e => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
              style={{
                background: 'hsl(var(--card))',
                border: `1px solid ${CLR_CARD_BORDER}`,
                borderRadius: 14,
                width: 230,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  setPublishMenuOpen(false);
                  // فتح المعرض مباشرة (صورة أو فيديو) بدون قائمة Photo/Video
                  requestAnimationFrame(() => storyFileRef.current?.click());
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px',
                  background: 'transparent', border: 'none', borderBottom: `1px solid ${CLR_CARD_BORDER}`,
                  color: CLR_TEXT, cursor: 'pointer', textAlign: 'right', width: '100%',
                }}
              >
                <Plus size={18} color={CLR_PRIMARY} strokeWidth={2.2} />
                <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{isCompanyPublisher ? 'نشر إعلان للقصة' : 'نشر قصة'}</span>
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => { setPublishMenuOpen(false); setCameraCaptureOpen(true); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px',
                  background: 'transparent', border: 'none',
                  color: CLR_TEXT, cursor: 'pointer', textAlign: 'right', width: '100%',
                }}
              >
                <Camera size={18} color={CLR_PRIMARY} strokeWidth={2.2} />
                <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{isCompanyPublisher ? 'نشر إعلان للقصة عبر' : 'نشر القصة عبر'}</span>
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── الكاميرا المدمجة لنشر القصة مباشرة ── */}
      <AnimatePresence>
        {cameraCaptureOpen && (
          <CameraStoryCapture
            onClose={() => setCameraCaptureOpen(false)}
            onPublish={async file => { await uploadStory(file); }}
            avatarUrl={(user as any)?.avatarUrl ?? (user as any)?.image ?? null}
            userName={user?.name ?? (user as any)?.username ?? null}
            friendRequests={incoming}
            onRespondFriendRequest={respond}
            storyCommentUnread={storyCommentThreads.filter(t => !t.read).length}
            shareChatUnread={userShareInbox.filter(x => !x.read).length}
            allowMusic={!isCompanyPublisher}
            publishLabel={isCompanyPublisher ? 'نشر إعلان للقصة' : 'نشر قصة'}
            onOpenStoryComments={() => {
              // إظهار Story + Chat معاً؛ إن وُجدت مشاركات غير مقروءة يُفضَّل Chat
              setSharedInboxStoryOnly(false);
              setSharedInboxOpen(true);
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Quick-publish error toast ── */}
      <AnimatePresence>
        {quickPublishError && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
            onClick={() => setQuickPublishError('')}
            style={{
              position: 'fixed', top: 50, left: 16, right: 16, zIndex: 10070,
              background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: 10, padding: '10px 14px', color: '#ef4444', fontSize: '0.78rem',
              fontWeight: 600, textAlign: 'center', cursor: 'pointer',
            }}
          >
            {quickPublishError}
          </motion.div>
        )}
      </AnimatePresence>


      {/* Story page Photo/Video composer — independent from text feed */}
      <AnimatePresence>
        {storyMediaOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
            onClick={() => {
              if (storyMediaPosting) return;
              setStoryMediaOpen(false);
              try { window.dispatchEvent(new CustomEvent('stooorna:story-media-closed')); } catch { /* */ }
            }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10090,
              background: 'rgba(0,0,0,0.45)',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
              padding: '0 0 calc(52px + env(safe-area-inset-bottom))',
              boxSizing: 'border-box',
            }}
          >
            <motion.div
              onClick={e => e.stopPropagation()}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 36, mass: 0.85 }}
              style={{
                width: '100%',
                maxWidth: 420,
                maxHeight: 'min(58vh, 480px)',
                display: 'flex', flexDirection: 'column',
                background: 'linear-gradient(180deg, #0a1f22 0%, #061014 100%)',
                border: `1px solid ${CLR_PRIMARY_BORDER}`,
                borderBottom: 'none',
                borderTopLeftRadius: 18,
                borderTopRightRadius: 18,
                boxShadow: '0 -12px 36px rgba(0,0,0,0.45)',
                overflow: 'hidden',
                boxSizing: 'border-box',
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', borderBottom: `1px solid ${CLR_PRIMARY_BORDER}`, flexShrink: 0,
              }}>
                <p style={{ margin: 0, color: CLR_PRIMARY, fontWeight: 800, fontSize: '0.9rem' }}>Photo / Video</p>
                <button type="button" disabled={storyMediaPosting} onClick={() => {
                  setStoryMediaOpen(false);
                  try { window.dispatchEvent(new CustomEvent('stooorna:story-media-closed')); } catch { /* */ }
                }} aria-label="Close" style={{
                  width: 28, height: 28, borderRadius: '50%', border: 'none',
                  background: 'rgba(255,255,255,0.08)', color: CLR_TEXT_DIM, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}><X size={14} /></button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <textarea
                  value={storyMediaText}
                  onChange={e => setStoryMediaText(e.target.value.slice(0, 2000))}
                  placeholder="Write a caption (optional)…"
                  rows={3}
                  style={{
                    width: '100%', boxSizing: 'border-box', borderRadius: 12, padding: '10px 12px',
                    background: CLR_INPUT_BG, border: `1px solid ${CLR_PRIMARY_BORDER}`,
                    color: CLR_TEXT, fontSize: '0.88rem', outline: 'none', fontFamily: 'inherit', resize: 'vertical',
                  }}
                />

                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => storyMediaImageRef.current?.click()} style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '10px 8px', borderRadius: 12, cursor: 'pointer',
                    background: 'rgba(0,188,212,0.1)', border: `1px solid ${CLR_PRIMARY_BORDER}`,
                    color: CLR_PRIMARY, fontWeight: 700, fontSize: '0.78rem',
                  }}>
                    <ImageIcon size={16} /> Photo
                  </button>
                  <button type="button" onClick={() => storyMediaVideoRef.current?.click()} style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '10px 8px', borderRadius: 12, cursor: 'pointer',
                    background: 'rgba(0,188,212,0.1)', border: `1px solid ${CLR_PRIMARY_BORDER}`,
                    color: CLR_PRIMARY, fontWeight: 700, fontSize: '0.78rem',
                  }}>
                    <Video size={16} /> Video
                  </button>
                </div>
                <input ref={storyMediaImageRef} type="file" accept="image/*" hidden onChange={e => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  setStoryMediaFile(f);
                  setStoryMediaUrl('');
                  setStoryMediaPreview({ url: URL.createObjectURL(f), type: 'image' });
                  setStoryMediaError('');
                }} />
                <input ref={storyMediaVideoRef} type="file" accept="video/*" hidden onChange={e => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  setStoryMediaFile(f);
                  setStoryMediaUrl('');
                  setStoryMediaPreview({ url: URL.createObjectURL(f), type: 'video' });
                  setStoryMediaError('');
                }} />

                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={storyMediaUrl}
                    onChange={e => setStoryMediaUrl(e.target.value)}
                    placeholder="Paste image or video URL…"
                    style={{
                      flex: 1, borderRadius: 12, padding: '10px 12px',
                      background: CLR_INPUT_BG, border: `1px solid ${CLR_PRIMARY_BORDER}`,
                      color: CLR_TEXT, fontSize: '0.82rem', outline: 'none',
                    }}
                  />
                  <button type="button" onClick={() => {
                    const raw = storyMediaUrl.trim();
                    if (!raw) return;
                    const isVid = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(raw) || /\/video\//i.test(raw);
                    setStoryMediaFile(null);
                    setStoryMediaPreview({ url: raw, type: isVid ? 'video' : 'image' });
                    setStoryMediaError('');
                  }} style={{
                    padding: '0 14px', borderRadius: 12, border: 'none',
                    background: CLR_PRIMARY, color: '#041018', fontWeight: 800, cursor: 'pointer', fontSize: '0.78rem',
                  }}>Preview</button>
                </div>

                {storyMediaPreview && (
                  <div style={{
                    borderRadius: 12, overflow: 'hidden',
                    border: `1px solid ${CLR_PRIMARY_BORDER}`,
                    background: 'rgba(0,0,0,0.35)',
                    maxHeight: 180,
                  }}>
                    {storyMediaPreview.type === 'video' ? (
                      <video src={storyMediaPreview.url} controls playsInline style={{ width: '100%', maxHeight: 180, display: 'block', background: '#000' }} />
                    ) : (
                      <img src={storyMediaPreview.url} alt="" style={{ width: '100%', maxHeight: 180, objectFit: 'contain', display: 'block' }} />
                    )}
                    <button type="button" onClick={() => {
                      setStoryMediaPreview(null);
                      setStoryMediaFile(null);
                      setStoryMediaUrl('');
                    }} style={{
                      width: '100%', padding: 8, border: 'none', borderTop: `1px solid ${CLR_PRIMARY_BORDER}`,
                      background: 'rgba(239,68,68,0.12)', color: '#ef4444', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem',
                    }}>Remove media</button>
                  </div>
                )}

                {storyMediaError ? (
                  <p style={{ margin: 0, color: '#ef4444', fontSize: '0.78rem', fontWeight: 600 }}>{storyMediaError}</p>
                ) : null}
              </div>

              <div style={{ padding: '10px 14px 14px', flexShrink: 0, borderTop: `1px solid ${CLR_PRIMARY_BORDER}` }}>
                <button
                  type="button"
                  disabled={storyMediaPosting || (!storyMediaPreview && !storyMediaFile)}
                  onClick={async () => {
                    if (!user) return;
                    if (!storyMediaPreview && !storyMediaFile) {
                      setStoryMediaError('Add a photo or video first');
                      return;
                    }
                    setStoryMediaPosting(true);
                    setStoryMediaError('');
                    try {
                      let url = storyMediaPreview?.url || '';
                      let type: 'image' | 'video' = storyMediaPreview?.type || 'image';
                      if (storyMediaFile) {
                        const file = storyMediaFile;
                        type = file.type.startsWith('video') ? 'video' : 'image';
                        const uploadRes = await fetch('/api/posts/media', {
                          method: 'POST',
                          credentials: 'include',
                          headers: {
                            'Content-Type': file.type || (type === 'video' ? 'video/mp4' : 'image/jpeg'),
                            'X-File-Ext': '.' + ((file.name.split('.').pop()) || (type === 'video' ? 'mp4' : 'jpg')),
                          },
                          body: file,
                        });
                        if (!uploadRes.ok) throw new Error('Upload failed');
                        const uploadData = await uploadRes.json();
                        url = uploadData?.url;
                        if (!url) throw new Error('No URL from upload');
                      }
                      const dest = type === 'video' ? 'videos' : 'photos';
                      const r = await fetch('/api/posts', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          text: storyMediaText.trim(),
                          mediaUrl: url,
                          mediaType: type,
                          mediaUrls: [url],
                          mediaTypes: [type],
                          hashtags: [],
                          audience: 'public',
                          destination: dest,
                        }),
                      });
                      if (!r.ok) throw new Error('Publish failed');
                      const d = await r.json();
                      if (!d?.post?.id) throw new Error('Post not saved');
                      const saved: PostItem = {
                        ...d.post,
                        mediaUrl: d.post.mediaUrl || url,
                        mediaType: type,
                        mediaUrls: d.post.mediaUrls?.length ? d.post.mediaUrls : [url],
                        mediaTypes: [type],
                        audience: 'public',
                        destination: dest,
                        text: d.post.text || storyMediaText.trim(),
                        authorId: d.post.authorId || String(user.id),
                      };
                      setMyMediaPosts(prev => {
                        const without = prev.filter(p => p.id !== saved.id);
                        return [saved, ...without];
                      });
                      try { void fetchMyMediaPosts(); } catch { /* */ }
                      try { playNewPostSound(); } catch { /* */ }
                      setStoryMediaText('');
                      setStoryMediaUrl('');
                      setStoryMediaFile(null);
                      setStoryMediaPreview(null);
                      setStoryMediaOpen(false);
                      setProfileContentTab(type === 'video' ? 'videos' : 'photos');
                      try { window.dispatchEvent(new CustomEvent('stooorna:story-media-closed')); } catch { /* */ }
                    } catch (err) {
                      console.error('[story media publish]', err);
                      setStoryMediaError(err instanceof Error ? err.message : 'Publish failed');
                    } finally {
                      setStoryMediaPosting(false);
                    }
                  }}
                  style={{
                    width: '100%', padding: 12, borderRadius: 12, border: 'none',
                    background: (storyMediaPreview || storyMediaFile) && !storyMediaPosting ? CLR_PRIMARY : CLR_PRIMARY_FAINT,
                    color: (storyMediaPreview || storyMediaFile) && !storyMediaPosting ? '#041018' : CLR_TEXT_DIM,
                    fontWeight: 800, cursor: (storyMediaPreview || storyMediaFile) && !storyMediaPosting ? 'pointer' : 'default',
                    fontSize: '0.88rem',
                  }}
                >
                  {storyMediaPosting ? 'Publishing…' : 'Publish to story page'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Friends / Company panel — opened from top friends icon on story page ── */}
      <AnimatePresence>
        {namesBarOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
            onClick={() => {
              setNamesBarOpen(false);
              try { window.dispatchEvent(new CustomEvent('stooorna:friends-panel-closed')); } catch { /* */ }
              const next = new URLSearchParams(searchParams);
              if (next.has('openChats')) { next.delete('openChats'); setSearchParams(next, { replace: true }); }
              if (next.has('openFriendsPanel')) { next.delete('openFriendsPanel'); setSearchParams(next, { replace: true }); }
            }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10080,
              background: 'rgba(0,0,0,0.45)',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
              padding: '12px 16px calc(64px + env(safe-area-inset-bottom))',
              boxSizing: 'border-box',
            }}
          >
            <motion.div
              onClick={e => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }}
              style={{
                position: 'relative',
                width: 'min(92vw, 360px)',
                height: 'min(56vh, 420px)',
                maxHeight: 'min(56vh, 420px)',
                display: 'flex',
                flexDirection: 'column',
                background: 'linear-gradient(180deg, #0a1f22 0%, #061014 100%)',
                border: `1px solid ${CLR_PRIMARY_BORDER}`,
                borderRadius: 18,
                boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
                overflow: 'hidden',
                boxSizing: 'border-box',
              }}
            >
              {/* Header inside card: Friends | Company + close */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '12px 12px 10px',
                flexShrink: 0,
                borderBottom: `1px solid ${CLR_PRIMARY_BORDER}`,
                boxSizing: 'border-box',
                width: '100%',
                minWidth: 0,
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                }}>
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '6px 10px', borderRadius: 999,
                      background: 'rgba(0,188,212,0.18)',
                      border: `1px solid ${CLR_PRIMARY_BORDER}`,
                      color: CLR_PRIMARY,
                      fontSize: '0.72rem', fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    <Users size={13} strokeWidth={2.2} />
                    Friends
                  </div>
                </div>
                <button type="button" onClick={() => {
                  setNamesBarOpen(false);
                  try { window.dispatchEvent(new CustomEvent('stooorna:friends-panel-closed')); } catch { /* */ }
                  const next = new URLSearchParams(searchParams);
                  if (next.has('openChats')) { next.delete('openChats'); setSearchParams(next, { replace: true }); }
                  if (next.has('openFriendsPanel')) { next.delete('openFriendsPanel'); setSearchParams(next, { replace: true }); }
                }} aria-label="Close" style={{
                  width: 28, height: 28, borderRadius: '50%', border: 'none',
                  background: 'rgba(255,255,255,0.08)', color: CLR_TEXT_DIM, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}><X size={14} /></button>
              </div>

              {/* ── Friends tab ── */}
              {true && (
                <>
                  <style>{`.names-bar-strip::-webkit-scrollbar{display:none}`}</style>
                  <div className="names-bar-strip" style={{
                    display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', gap: 14,
                    overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none',
                    WebkitOverflowScrolling: 'touch', padding: '10px 16px 14px', alignItems: 'flex-start',
                  }}>
                    {(() => {
                      const userFriends = friends.filter(f =>
                        !isCompanyUserAccount({ id: f.friendId, username: f.username, name: f.name }, companies)
                      );
                      if (userFriends.length === 0) {
                        return <p style={{ color: CLR_TEXT_DIM, fontSize: '0.75rem', padding: '10px 4px' }}>No friends yet</p>;
                      }
                      return userFriends.map(f => {
                      const label = f.username ? `@${f.username}` : (f.name ?? '??');
                      return (
                        <motion.button key={f.id} whileTap={{ scale: 0.9 }} onClick={() => {
                          setNamesBarOpen(false);
                          setViewingProfile({ id: f.friendId, name: f.name, username: f.username, avatarUrl: f.avatarUrl ?? null });
                        }} style={{
                          flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                          background: 'none', border: 'none', cursor: 'pointer', padding: 0, minWidth: 54, maxWidth: 60,
                        }}>
                          <UserAvatar name={label} avatarUrl={f.avatarUrl} size={46} style={{ border: `2px solid ${CLR_PRIMARY_BORDER}` }} />
                          <span style={{ color: CLR_TEXT, fontSize: '0.58rem', fontWeight: 500, maxWidth: 58, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label.replace('@', '')}</span>
                        </motion.button>
                      );
                      });
                    })()}
                  </div>
                </>
              )}

              {/* ── Company tab — قائمة عمودية: اسم الشركة + الاسم التجاري فقط (بدون إيميل) ── */}
              {false && friendsPanelTab === 'company' && (
                <div style={{
                  overflowY: 'auto',
                  flex: 1,
                  minHeight: 120,
                  maxHeight: 'calc(78vh - 100px)',
                  padding: '6px 12px 14px',
                  WebkitOverflowScrolling: 'touch',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}>
                  {companiesLoading && (
                    <p style={{ color: CLR_TEXT_DIM, fontSize: '0.8rem', textAlign: 'center', padding: '28px 16px' }}>جاري تحميل الشركات…</p>
                  )}
                  {!companiesLoading && companies.length === 0 && (
                    <div style={{ padding: '28px 12px', textAlign: 'center' }}>
                      <Building2 size={28} style={{ color: CLR_PRIMARY_DIM, marginBottom: 10 }} />
                      <p style={{ color: CLR_TEXT, fontSize: '0.85rem', fontWeight: 700, margin: '0 0 6px' }}>لا توجد شركات مسجّلة بعد</p>
                      <p style={{ color: CLR_TEXT_DIM, fontSize: '0.72rem', margin: 0, lineHeight: 1.5 }}>
                        ستظهر هنا كل الشركات المسجّلة في التطبيق.
                      </p>
                    </div>
                  )}
                  {!companiesLoading && companies.map(c => {
                    const companyName = c.name || c.tradeName || c.username || 'شركة';
                    const tradeName = c.tradeName && c.tradeName !== companyName ? c.tradeName : null;
                    const storyG = storyGroups.find(g =>
                      String(g.userId) === String(c.id)
                      || (c.username && g.username && String(c.username).replace(/^@/, '').toLowerCase() === String(g.username).replace(/^@/, '').toLowerCase())
                      || (c.name && g.name && String(c.name).trim().toLowerCase() === String(g.name).trim().toLowerCase())
                    );
                    const storyIdx = storyG ? storyGroups.indexOf(storyG) : -1;
                    const hasStory = !!(storyG && storyG.items && storyG.items.length);
                    const hasUnseen = hasStory && storyG.items.some((it: any) => !it.seen);
                    return (
                      <div
                        key={c.id}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 12px',
                          borderRadius: 14,
                          boxSizing: 'border-box',
                          background: 'rgba(0,188,212,0.06)',
                          border: `1px solid ${CLR_PRIMARY_BORDER}`,
                          textAlign: 'right',
                          direction: 'rtl',
                        }}
                      >
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.98 }}
                        onClick={() => { void openCompanyProfile(c); }}
                        style={{
                          flex: 1, minWidth: 0,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: 0,
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          textAlign: 'right',
                          direction: 'rtl',
                          color: 'inherit',
                        }}
                      >
                        <div style={{
                          width: 46,
                          height: 46,
                          borderRadius: 12,
                          flexShrink: 0,
                          background: 'rgba(0,188,212,0.12)',
                          border: `1.5px solid ${CLR_PRIMARY_BORDER}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                        }}>
                          {c.avatarUrl ? (
                            <img src={c.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <Building2 size={20} color={CLR_PRIMARY} strokeWidth={2} />
                          )}
                        </div>
                        <div style={{ minWidth: 0, flex: 1, textAlign: 'right' }}>
                          {/* اسم الشركة */}
                          <p style={{
                            margin: 0,
                            color: CLR_PRIMARY,
                            fontSize: '0.9rem',
                            fontWeight: 800,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {companyName}
                          </p>
                          {/* الاسم التجاري فقط — بدون إيميل */}
                          {tradeName && (
                            <p style={{
                              margin: '4px 0 0',
                              color: 'rgba(150,200,200,0.75)',
                              fontSize: '0.72rem',
                              fontWeight: 500,
                              lineHeight: 1.4,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              whiteSpace: 'normal',
                            }}>
                              {tradeName}
                            </p>
                          )}
                        </div>
                      </motion.button>
                      {hasStory ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setNamesBarOpen(false);
                            setViewerGroupIdx(storyIdx);
                          }}
                          style={{
                            width: 44, height: 44, borderRadius: '50%', padding: 0, flexShrink: 0,
                            background: 'none', border: 'none', cursor: 'pointer', position: 'relative',
                          }}
                          aria-label="ستوري الشركة"
                        >
                          <div style={{
                            position: 'absolute', inset: 0, borderRadius: '50%',
                            background: storyRingColor(storyG.items, '#facc15', '#0ea5e9'),
                            padding: 2.5, boxSizing: 'border-box',
                            boxShadow: hasUnseen ? '0 0 8px rgba(250,204,21,0.45)' : 'none',
                          }}>
                            <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', background: 'hsl(var(--card))' }}>
                              {(storyG.avatarUrl || c.avatarUrl) ? (
                                <img src={storyG.avatarUrl || c.avatarUrl || ''} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              ) : (
                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <Building2 size={16} color={CLR_PRIMARY} />
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      ) : (
                        <div style={{ width: 44, height: 44, flexShrink: 0 }} />
                      )}
                      </div>
                    );
                  })}
                </div>
              )}

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* ── Friend story profile — opened by tapping any friend in the globe's names bar.
          Shows their posts (text + media alike) three-per-row, same as the profile page.
          onOpenPost uses openSinglePostView so tapping any tile — text or media — opens the
          full post exactly like the general text-posts feed (with like/comment/repost/share). ── */}
      <AnimatePresence>
        {viewingProfile && (
          <>
          <FriendStoryProfile
            authorId={viewingProfile.id}
            authorName={viewingProfile.name}
            authorUsername={viewingProfile.username}
            authorAvatarUrl={viewingProfile.avatarUrl}
            isCompanyProfile={!!viewingProfile.isCompany}
            onClose={() => {
              setViewingProfile(null);
              setUserShareChatPeer(null);
              setShareMiniText('');
              setShareMiniRecording(false);
              setCompanyInboxOpen(false);
              try { window.dispatchEvent(new CustomEvent('stooorna:close-chat-panels')); } catch { /* */ }
    if (isCompanyPublisher) {
      try { localStorage.setItem('stooorna_company_inbox_unread', '0'); } catch { /* */ }
      setCompanyInboxTick(x => x + 1);
    }
              try {
                const u = new URL(window.location.href);
                if (u.searchParams.get('panel') === 'chats') {
                  u.searchParams.delete('panel');
                  window.history.replaceState({}, '', u.pathname + (u.searchParams.toString() ? '?' + u.searchParams.toString() : '') + u.hash);
                }
              } catch { /* */ }
            }}
            onOpenPost={p => openSinglePostView(p, true)}
            onToggleLike={toggleLike}
            onRepost={toggleRepost}
          />
          {!userShareChatPeer && user && String(viewingProfile.id) !== String(user.id) && (!!viewingProfile.isCompany || isCompanyUserAccount(viewingProfile, companies)) && (() => {
            let saved: any = null;
            try {
              const list = JSON.parse(localStorage.getItem(`stooorna_user_product_chats_${user.id}`) || '[]');
              saved = Array.isArray(list) ? list.find((x: any) => String(x.id) === String(viewingProfile.id)) : null;
            } catch { saved = null; }
            if (!saved) return null;
            return (
              <motion.button
                key="company-chat-fab"
                type="button"
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: [1, 1.08, 1], opacity: 1 }}
                transition={{ scale: { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }, opacity: { duration: 0.2 } }}
                onClick={() => {
                  if (user && String(user.id) === String(viewingProfile.id)) {
                    setCompanyInboxOpen(true);
                    return;
                  }
                  openShareMiniChat({
                    id: viewingProfile.id,
                    name: saved.name || viewingProfile.name,
                    username: saved.username || viewingProfile.username,
                    avatarUrl: saved.avatarUrl || viewingProfile.avatarUrl,
                    post: saved.post || (saved.postId ? { id: saved.postId, text: saved.postText, authorId: viewingProfile.id, authorName: viewingProfile.name, authorUsername: viewingProfile.username, authorAvatarUrl: viewingProfile.avatarUrl } as any : undefined),
                    note: saved.note || saved.lastMessage || '',
                  });
                }}
                aria-label="فتح شات الشركة"
                style={{
                  position: 'fixed',
                  top: 'max(10px, env(safe-area-inset-top))',
                  right: 12,
                  zIndex: 10890,
                  width: 34, height: 34, borderRadius: '50%',
                  background: (() => {
                    try {
                      return localStorage.getItem('stooorna_company_inbox_unread') === '1' ? 'linear-gradient(145deg, #facc15 0%, #ca8a04 100%)' : 'linear-gradient(145deg, #00BCD4 0%, #00838f 100%)';
                    } catch { return 'linear-gradient(145deg, #00BCD4 0%, #00838f 100%)'; }
                  })(),
                  border: '1.5px solid rgba(255,255,255,0.18)',
                  color: '#041018', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 14px rgba(0,188,212,0.4)',
                  padding: 0,
                }}
              >
                <MessageCircle size={16} strokeWidth={2.3} />
              </motion.button>
            );
          })()}
          </>
        )}
      </AnimatePresence>

      {/* ── My followers list — opened by tapping "Followers" in my own profile stats row. ── */}
      <AnimatePresence>
        {followersModalOpen && (
          <FollowersListModal
            friends={friends}
            followersVisible={followersVisible}
            onToggleVisible={handleToggleFollowersVisible}
            onClose={() => setFollowersModalOpen(false)}
          />
        )}
      </AnimatePresence>

      

      {companyInboxOpen && user && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10880, background: '#061014', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', paddingTop: 'max(12px, env(safe-area-inset-top))', borderBottom: '1px solid rgba(0,188,212,0.25)' }}>
            <button type="button" onClick={() => {
              try { localStorage.setItem('stooorna_company_inbox_unread', '0'); } catch { /* */ }
              setCompanyInboxTick(x => x + 1);
              setCompanyInboxOpen(false);
            }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><X size={20} /></button>
            <p style={{ margin: 0, color: '#00BCD4', fontWeight: 800 }}>رسائل العملاء</p>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
            {(() => {
              let rows: any[] = [];
              try { rows = JSON.parse(localStorage.getItem(`stooorna_company_inbox_${user.id}`) || '[]'); } catch { rows = []; }
              rows = Array.isArray(rows) ? rows.filter((x: any) => String(x.id) !== String(user.id)) : [];
              if (rows.length === 0) {
                return <p style={{ color: 'rgba(150,200,200,0.6)', textAlign: 'center', padding: 28 }}>لا رسائل بعد</p>;
              }
              return rows.map((row: any) => (
                <div key={row.id} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', marginBottom: 8, borderRadius: 12, border: '1px solid rgba(0,188,212,0.25)', background: row.unread ? 'rgba(250,204,21,0.1)' : 'rgba(0,188,212,0.06)', direction: 'rtl' }}>
                <button type="button" onClick={() => {
                  try { localStorage.setItem('stooorna_company_inbox_unread', '0'); } catch { /* */ }
                  setCompanyInboxOpen(false);
                  if (String(row.id) === String(user.id)) return;
                  openShareMiniChat({
                    id: row.id,
                    name: row.name,
                    username: row.username,
                    avatarUrl: row.avatarUrl,
                    note: row.note || row.lastMessage,
                    post: row.post || undefined,
                  });
                }} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', textAlign: 'right', direction: 'rtl', padding: 0 }}>
                  <UserAvatar name={row.name || row.username || '?'} avatarUrl={row.avatarUrl} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, color: '#00BCD4', fontWeight: 800, fontSize: '0.85rem' }}>{row.name || row.username || 'مستخدم'}</p>
                    <p style={{ margin: 0, color: 'rgba(160,200,200,0.75)', fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.lastMessage}</p>
                  </div>
                </button>
                <button type="button" aria-label="حذف" onClick={() => {
                  try {
                    const key = `stooorna_company_inbox_${user.id}`;
                    const list = JSON.parse(localStorage.getItem(key) || '[]').filter((x: any) => String(x.id) !== String(row.id));
                    localStorage.setItem(key, JSON.stringify(list));
                    window.dispatchEvent(new CustomEvent('stooorna:company-inbox', { detail: { userId: user.id, list } }));
                    setCompanyInboxTick(x => x + 1);
                  } catch { /* */ }
                }} style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 10, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.12)', color: '#ef4444', cursor: 'pointer' }}>
                  <Trash2 size={15} />
                </button>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {/* ── Music player — the <audio> element itself now lives inside musicPlayerStore
          (never attached to the DOM), so it survives this page unmounting; only the
          search modal for the music icon is rendered here. ── */}
      <AnimatePresence>
        {musicModalOpen && (
          <MusicSearchModal
            onClose={() => setMusicModalOpen(false)}
            currentTrack={musicCurrentTrack}
            isPlaying={musicIsPlaying}
            onPlayTrack={handleMusicPlayTrack}
            favorites={musicFavorites}
            onToggleFavorite={handleMusicToggleFavorite}
            pinnedTrackId={pinnedTrack?.id ?? null}
            onPinTrack={handlePinTrack}
            onUnpinTrack={handleUnpinTrack}
          />
        )}
      </AnimatePresence>

      {/* ── شير المنتج: خارجي | استفسار عن المنتج ── */}
      <AnimatePresence>
        {productShareMenuPost && (
          <motion.div
            key="product-share-menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setProductShareMenuPost(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 10650,
              background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            }}
          >
            <motion.div
              initial={{ y: 40 }}
              animate={{ y: 0 }}
              exit={{ y: 60 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 420,
                background: 'linear-gradient(180deg, #0d2a2e 0%, #0a1a1a 100%)',
                borderTopLeftRadius: 18, borderTopRightRadius: 18,
                border: '1px solid rgba(0,188,212,0.25)',
                padding: '16px 16px max(20px, env(safe-area-inset-bottom))',
                boxSizing: 'border-box',
              }}
            >
              <p style={{ margin: '0 0 12px', color: CLR_PRIMARY, fontWeight: 800, fontSize: '0.92rem', textAlign: 'center' }}>
                مشاركة / استفسار
              </p>
              <motion.button
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={() => {
                  const p = productShareMenuPost;
                  setProductShareMenuPost(null);
                  if (p) externalSharePost(p);
                }}
                style={{
                  width: '100%', padding: '14px 16px', borderRadius: 14, marginBottom: 8,
                  background: 'rgba(0,188,212,0.12)', border: `1px solid ${CLR_PRIMARY_BORDER}`,
                  color: CLR_PRIMARY, fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <Send size={16} strokeWidth={2.2} />
                نشر بالخارج
              </motion.button>
              {(() => {
                const p = productShareMenuPost;
                // شركة فقط → استفسار عن المنتج | مستخدم → نشر الى صديق
                const isCo = !!(p && (
                  (p as any).publisherType === 'company'
                  || (p as any).isCompanyPost === true
                  || (p as any).authorIsCompany === true
                  || companies.some(c => String(c.id) === String(p.authorId))
                  || isCompanyUserAccount({ id: p.authorId, username: p.authorUsername, name: p.authorName }, companies)
                ));
                if (isCo) {
                  return (
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      type="button"
                      onClick={() => {
                        setProductShareMenuPost(null);
                        setProductInquiryText('');
                        setProductInquiryError('');
                        setProductInquiryPost(p);
                      }}
                      style={{
                        width: '100%', padding: '14px 16px', borderRadius: 14, marginBottom: 8,
                        background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.4)',
                        color: '#eab308', fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}
                    >
                      <MessageCircle size={16} strokeWidth={2.2} />
                      استفسار عن المنتج
                    </motion.button>
                  );
                }
                return null;
              })()}
              <button
                type="button"
                onClick={() => setProductShareMenuPost(null)}
                style={{
                  width: '100%', padding: '12px', borderRadius: 12, border: 'none',
                  background: 'transparent', color: CLR_TEXT_DIM, fontWeight: 600, cursor: 'pointer',
                }}
              >
                إلغاء
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── نموذج استفسار المنتج → شات الشركة ── */}
      <AnimatePresence>
        {productInquiryPost && (() => {
          const ad = parseProductAd(productInquiryPost.text);
          const media = PostMediaItems(productInquiryPost);
          const img = media.find(m => m.type === 'image')?.url || media[0]?.url || productInquiryPost.mediaUrl;
          return (
            <motion.div
              key="product-inquiry-form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: 'fixed', inset: 0, zIndex: 10660,
                background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)',
                display: 'flex', flexDirection: 'column',
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', paddingTop: 'max(10px, env(safe-area-inset-top))',
                borderBottom: '1px solid rgba(0,188,212,0.25)',
                background: 'linear-gradient(180deg, #0a1f2e 0%, #06141c 100%)',
              }}>
                <button type="button" onClick={() => setProductInquiryPost(null)} style={{ background: 'none', border: 'none', color: CLR_PRIMARY, cursor: 'pointer', padding: 2 }}>
                  <X size={20} />
                </button>
                <p style={{ margin: 0, flex: 1, color: CLR_PRIMARY, fontWeight: 800, fontSize: '0.95rem' }}>
                  استفسار عن المنتج
                </p>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {img && (
                  <img src={img} alt="" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 14, border: `1px solid ${CLR_PRIMARY_BORDER}` }} />
                )}
                <div style={{
                  background: 'rgba(0,188,212,0.08)', border: `1px solid ${CLR_PRIMARY_BORDER}`,
                  borderRadius: 14, padding: '12px 14px',
                }}>
                  <p style={{ margin: 0, color: CLR_PRIMARY, fontWeight: 800, fontSize: '1rem' }}>
                    {ad?.title || productAdDisplayTitle(productInquiryPost)}
                  </p>
                  {ad?.price ? (
                    <p style={{ margin: '6px 0 0', color: '#eab308', fontWeight: 800, fontSize: '0.95rem' }}>{ad.price}</p>
                  ) : null}
                  {ad?.details ? (
                    <p style={{ margin: '8px 0 0', color: CLR_TEXT_DIM, fontSize: '0.8rem', lineHeight: 1.45 }}>{ad.details}</p>
                  ) : null}
                  <p style={{ margin: '10px 0 0', color: CLR_TEXT_DIM, fontSize: '0.72rem' }}>
                    الشركة: {productInquiryPost.authorName || productInquiryPost.authorUsername || '—'}
                  </p>
                </div>
                <textarea
                  value={productInquiryText}
                  onChange={e => setProductInquiryText(e.target.value.slice(0, 500))}
                  placeholder="اكتب سؤالك عن المنتج (مثال: هل السعر نهائي؟ هل متوفر؟)…"
                  rows={4}
                  style={{
                    width: '100%', boxSizing: 'border-box', resize: 'vertical',
                    borderRadius: 14, padding: '12px 14px',
                    background: CLR_INPUT_BG, border: `1px solid ${CLR_PRIMARY_BORDER}`,
                    color: CLR_TEXT, fontSize: '0.88rem', outline: 'none', fontFamily: 'inherit',
                  }}
                />
                {productInquiryError && (
                  <p style={{ margin: 0, color: '#ef4444', fontSize: '0.78rem', textAlign: 'center' }}>{productInquiryError}</p>
                )}
              </div>
              <div style={{
                padding: '12px 16px max(16px, env(safe-area-inset-bottom))',
                borderTop: `1px solid ${CLR_PRIMARY_BORDER}`,
                background: 'rgba(6,14,14,0.96)',
              }}>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  disabled={productInquirySending || !productInquiryText.trim()}
                  onClick={async () => {
                    if (!productInquiryPost || !productInquiryText.trim()) return;
                    setProductInquirySending(true);
                    setProductInquiryError('');
                    try {
                      await sendProductInquiry(productInquiryPost, productInquiryText);
                      setProductInquiryPost(null);
                      setProductInquiryText('');
                      closeSinglePostView();
                    } catch (err) {
                      setProductInquiryError(String(err instanceof Error ? err.message : err));
                    } finally {
                      setProductInquirySending(false);
                    }
                  }}
                  style={{
                    width: '100%', padding: '14px', borderRadius: 14, border: 'none',
                    background: productInquiryText.trim() ? CLR_PRIMARY : CLR_PRIMARY_FAINT,
                    color: productInquiryText.trim() ? '#041018' : CLR_TEXT_DIM,
                    fontWeight: 800, fontSize: '0.9rem',
                    cursor: productInquiryText.trim() ? 'pointer' : 'default',
                    opacity: productInquirySending ? 0.7 : 1,
                  }}
                >
                  {productInquirySending ? 'جاري الإرسال…' : 'إرسال الاستفسار وفتح الشات'}
                </motion.button>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ── نشر الى صديق: اختيار صديق + ملاحظة ── */}
      <AnimatePresence>
        {userSharePickPost && (
          <motion.div
            key="user-share-pick"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10670,
              background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', paddingTop: 'max(10px, env(safe-area-inset-top))',
              borderBottom: `1px solid ${CLR_PRIMARY_BORDER}`,
              background: 'linear-gradient(180deg, #0a1f2e 0%, #06141c 100%)',
            }}>
              <button type="button" onClick={() => { setUserSharePickPost(null); setUserSharePickFriend(null); setUserShareNote(''); }} style={{ background: 'none', border: 'none', color: CLR_PRIMARY, cursor: 'pointer', padding: 2 }}>
                <X size={20} />
              </button>
              <p style={{ margin: 0, flex: 1, color: CLR_PRIMARY, fontWeight: 800, fontSize: '0.95rem' }}>{userSharePickFriend ? 'تعليق على المنشور' : 'نشر الى صديق'}</p>
            </div>
            <div style={{ padding: '12px 14px' }}>
              {userSharePickFriend ? (
                <>
                  <p style={{ margin: '0 0 8px', color: '#eab308', fontWeight: 800, fontSize: '0.85rem', textAlign: 'right' }}>
                    إلى: {userSharePickFriend.name || userSharePickFriend.username || 'صديق'}
                  </p>
                  <div style={{
                    borderRadius: 12, padding: '10px 12px', marginBottom: 10,
                    border: '1px solid rgba(234,179,8,0.4)', background: 'rgba(234,179,8,0.08)',
                    color: CLR_TEXT, fontSize: '0.82rem', whiteSpace: 'pre-wrap', maxHeight: 90, overflow: 'auto', direction: 'rtl',
                  }}>
                    {(userSharePickPost?.text || '').slice(0, 280) || 'منشور'}
                  </div>
                  <textarea
                    value={userShareNote}
                    onChange={e => setUserShareNote(e.target.value.slice(0, 300))}
                    placeholder="اكتب تعليقاً على المنشور ثم أرسل…"
                    rows={3}
                    style={{
                      width: '100%', boxSizing: 'border-box', borderRadius: 12, padding: '10px 12px',
                      background: CLR_INPUT_BG, border: `1px solid ${CLR_PRIMARY_BORDER}`,
                      color: CLR_TEXT, fontSize: '0.85rem', outline: 'none', fontFamily: 'inherit', resize: 'vertical',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button type="button" onClick={() => { setUserSharePickFriend(null); setUserShareNote(''); }}
                      style={{ flex: 1, padding: 12, borderRadius: 12, border: `1px solid ${CLR_PRIMARY_BORDER}`, background: 'transparent', color: CLR_TEXT_DIM, fontWeight: 700, cursor: 'pointer' }}>
                      رجوع
                    </button>
                    <button
                      type="button"
                      disabled={!userShareNote.trim()}
                      onClick={() => {
                        if (!user || !userSharePickPost || !userSharePickFriend) return;
                        const note = userShareNote.trim();
                        const friend = userSharePickFriend;
                        pushUserShareInbox(friend.friendId, {
                          fromId: user.id,
                          fromName: user.name ?? null,
                          fromUsername: (user as any).username ?? null,
                          fromAvatar: (user as any).avatarUrl ?? (user as any).image ?? null,
                          post: userSharePickPost,
                          note,
                        });
                        pushShareThreadMsg(user.id, friend.friendId, userSharePickPost.id, {
                          fromId: user.id, type: 'text', body: note,
                        });
                        try {
                          window.dispatchEvent(new CustomEvent('stooorna:bottom-chat-blink', {
                            detail: { target: 'user', userId: friend.friendId, yellow: true },
                          }));
                        } catch { /* */ }
                        setUserShareChatPeer({
                          id: friend.friendId,
                          name: friend.name,
                          username: friend.username,
                          avatarUrl: friend.avatarUrl,
                          post: userSharePickPost,
                          note,
                        });
                        setShareMiniMsgs(loadShareThread(user.id, friend.friendId, userSharePickPost.id));
                        setUserSharePickPost(null);
                        setUserSharePickFriend(null);
                        setUserShareNote('');
                        try { playShareArrivedSound(); } catch { /* */ }
                      }}
                      style={{
                        flex: 2, padding: 12, borderRadius: 12, border: 'none',
                        background: userShareNote.trim() ? CLR_PRIMARY : CLR_PRIMARY_FAINT,
                        color: userShareNote.trim() ? '#041018' : CLR_TEXT_DIM,
                        fontWeight: 800, cursor: userShareNote.trim() ? 'pointer' : 'default',
                      }}
                    >
                      إرسال المشاركة
                    </button>
                  </div>
                </>
              ) : (
                <p style={{ margin: 0, color: CLR_TEXT_DIM, fontSize: '0.8rem', textAlign: 'right' }}>اختر صديقاً أولاً — لن يُرسل المنشور حتى تكتب تعليقاً</p>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 20px', display: userSharePickFriend ? 'none' : 'flex', flexDirection: 'column', gap: 8 }}>
              {friends.length === 0 && (
                <p style={{ color: CLR_TEXT_DIM, textAlign: 'center', marginTop: 40, fontSize: '0.85rem' }}>لا أصدقاء بعد — أضف أصدقاء للمشاركة معهم</p>
              )}
              {friends.map(f => (
                <button
                  key={f.friendId}
                  type="button"
                  onClick={() => {
                    setUserSharePickFriend(f);
                    setUserShareNote('');
                  }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                    borderRadius: 14, border: `1px solid ${CLR_PRIMARY_BORDER}`, background: CLR_CARD_BG,
                    cursor: 'pointer', textAlign: 'right', direction: 'rtl', color: CLR_TEXT,
                  }}
                >
                  <UserAvatar name={f.name || f.username || '?'} avatarUrl={f.avatarUrl} size={42} style={{ border: `2px solid ${CLR_PRIMARY_BORDER}` }} />
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
                    <p style={{ margin: 0, fontWeight: 800, color: CLR_PRIMARY, fontSize: '0.88rem' }}>{f.name || f.username || '—'}</p>
                    {f.username && <p style={{ margin: '2px 0 0', color: CLR_TEXT_DIM, fontSize: '0.72rem' }}>@{f.username}</p>}
                  </div>
                  <Send size={16} color={CLR_PRIMARY} />
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── ميني شات مشاركة: نفس المربع — نص / صوت / صورة / فيديو فقط — بدون /chat ── */}
      <AnimatePresence>
        {userShareChatPeer && (
          <motion.div
            key="user-share-chat"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10850,
              background: PAGE_BG, display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', paddingTop: 'max(10px, env(safe-area-inset-top))',
              borderBottom: `1px solid ${CLR_PRIMARY_BORDER}`,
              background: 'linear-gradient(180deg, #0a1f2e 0%, #06141c 100%)',
            }}>
              <button type="button" onClick={closeShareMiniChat} style={{ background: 'none', border: 'none', color: CLR_PRIMARY, cursor: 'pointer' }}>
                <X size={20} />
              </button>
              <UserAvatar name={userShareChatPeer.name || userShareChatPeer.username || '?'} avatarUrl={userShareChatPeer.avatarUrl} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, color: '#eab308', fontWeight: 800, fontSize: '0.9rem' }}>
                  {userShareChatPeer.name || userShareChatPeer.username || 'مستخدم'}
                </p>
                <p style={{ margin: 0, color: CLR_TEXT_DIM, fontSize: '0.68rem' }}>شات المشاركة · هذا المربع فقط</p>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{
                borderRadius: 16, overflow: 'hidden',
                border: '1.5px solid rgba(234,179,8,0.55)',
                background: 'linear-gradient(180deg, rgba(234,179,8,0.1) 0%, rgba(0,188,212,0.06) 100%)',
                direction: 'rtl',
              }}>
                <div style={{ padding: '12px 14px' }}>
                  <p style={{ margin: '0 0 8px', color: '#eab308', fontSize: '0.7rem', fontWeight: 800 }}>Shared post</p>
                  {(() => {
                    const post: any = userShareChatPeer.post;
                    const items = post ? PostMediaItems(post) : [];
                    const extra: string[] = [];
                    if (post?.imageUrl) extra.push(post.imageUrl);
                    if (post?.coverUrl) extra.push(post.coverUrl);
                    const seen = new Set(items.map(x => x.url));
                    extra.forEach(u => { if (u && !seen.has(u)) items.push({ url: u, type: /\.(mp4|webm|mov)(\?|$)/i.test(u) ? 'video' : 'image' }); });
                    return items.map((media, i) => {
                      const url = media.url;
                      const ty = String(media.type || '').toLowerCase();
                      const isVid = ty.includes('video') || /\.(mp4|webm|mov)(\?|$)/i.test(url);
                      const isPdf = ty.includes('pdf') || /\.pdf(\?|$)/i.test(url);
                      if (isVid) return <video key={i} src={url} controls playsInline style={{ width: '100%', maxHeight: 260, borderRadius: 10, marginBottom: 8, background: '#000' }} />;
                      if (isPdf) return <a key={i} href={url} target="_blank" rel="noreferrer" style={{ display: 'block', marginBottom: 8, color: CLR_PRIMARY, fontWeight: 800 }}>فتح ملف PDF</a>;
                      return <img key={i} src={url} alt="" style={{ width: '100%', maxHeight: 280, objectFit: 'contain', borderRadius: 10, marginBottom: 8, display: 'block', background: 'rgba(0,0,0,0.25)' }} />;
                    });
                  })()}
                  <p style={{ margin: 0, color: CLR_TEXT, fontSize: '0.88rem', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
                    {(userShareChatPeer.post?.text || '').slice(0, 2000) || ''}
                  </p>
                  {userShareChatPeer.note ? (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed rgba(234,179,8,0.35)' }}>
                      <p style={{ margin: '0 0 4px', color: '#eab308', fontSize: '0.7rem', fontWeight: 700 }}>Comment</p>
                      <p style={{ margin: 0, color: CLR_TEXT, fontSize: '0.88rem', whiteSpace: 'pre-wrap' }}>{userShareChatPeer.note}</p>
                    </div>
                  ) : null}
                </div>
              </div>
              {shareMiniMsgs.map(m => (
                <div key={m.id} style={{
                  alignSelf: user && m.fromId === user.id ? 'flex-end' : 'flex-start',
                  maxWidth: '90%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexDirection: user && m.fromId === user.id ? 'row' : 'row-reverse',
                }}>
                  {user && m.fromId === user.id ? (
                  <button type="button" aria-label="حذف الرسالة" onClick={() => {
                    if (!user || !userShareChatPeer) return;
                    if (m.fromId !== user.id) return;
                    const pid = userShareChatPeer.post?.id ?? 'share';
                    const next = loadShareThread(user.id, userShareChatPeer.id, pid).filter(x => x.id !== m.id);
                    saveShareThread(user.id, userShareChatPeer.id, pid, next);
                    setShareMiniMsgs(next);
                  }} style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 8, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Trash2 size={13} />
                  </button>
                  ) : null}
                  <div style={{
                    padding: '8px 10px',
                    borderRadius: 14,
                    background: user && m.fromId === user.id ? 'rgba(0,188,212,0.18)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${CLR_PRIMARY_BORDER}`,
                    minWidth: 0,
                  }}>
                  {m.type === 'text' && <p style={{ margin: 0, color: CLR_TEXT, fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{m.body}</p>}
                  {m.type === 'voice' && <audio src={m.body} controls style={{ width: 210, height: 36 }} />}
                  {m.type === 'image' && <img src={m.body} alt="" style={{ maxWidth: 220, borderRadius: 10, display: 'block' }} />}
                  {m.type === 'video' && <video src={m.body} controls style={{ maxWidth: 220, borderRadius: 10, display: 'block' }} />}
                  </div>
                </div>
              ))}
            </div>
            <div style={{
              padding: '10px 12px max(12px, env(safe-area-inset-bottom))',
              borderTop: `1px solid ${CLR_PRIMARY_BORDER}`,
              background: 'rgba(6,14,14,0.96)',
              display: 'flex', gap: 8, alignItems: 'center',
            }}>
              <input
                ref={shareMiniFileRef}
                type="file"
                accept="image/*,video/*"
                hidden
                onChange={e => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file || !user || !userShareChatPeer) return;
                  const url = URL.createObjectURL(file);
                  const type = file.type.startsWith('video') ? 'video' as const : 'image' as const;
                  pushShareThreadMsg(user.id, userShareChatPeer.id, userShareChatPeer.post?.id ?? 'share', { fromId: user.id, type, body: url });
                  setShareMiniMsgs(loadShareThread(user.id, userShareChatPeer.id, userShareChatPeer.post?.id ?? 'share'));
                }}
              />
              <button type="button" onClick={() => shareMiniFileRef.current?.click()}
                style={{ width: 40, height: 40, borderRadius: 20, border: `1px solid ${CLR_PRIMARY_BORDER}`, background: CLR_PRIMARY_FAINT, color: CLR_PRIMARY, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }}
                title="صورة أو فيديو">
                <ImageIcon size={16} />
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!user || !userShareChatPeer) return;
                  if (shareMiniRecording) {
                    shareMiniRecRef.current?.stop();
                    setShareMiniRecording(false);
                    return;
                  }
                  try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    const rec = new MediaRecorder(stream);
                    shareMiniChunksRef.current = [];
                    rec.ondataavailable = ev => { if (ev.data.size) shareMiniChunksRef.current.push(ev.data); };
                    rec.onstop = () => {
                      stream.getTracks().forEach(tr => tr.stop());
                      const blob = new Blob(shareMiniChunksRef.current, { type: 'audio/webm' });
                      const url = URL.createObjectURL(blob);
                      pushShareThreadMsg(user.id, userShareChatPeer.id, userShareChatPeer.post?.id ?? 'share', { fromId: user.id, type: 'voice', body: url });
                      setShareMiniMsgs(loadShareThread(user.id, userShareChatPeer.id, userShareChatPeer.post?.id ?? 'share'));
                    };
                    shareMiniRecRef.current = rec;
                    rec.start();
                    setShareMiniRecording(true);
                  } catch { /* mic denied */ }
                }}
                style={{ width: 40, height: 40, borderRadius: 20, border: `1px solid ${shareMiniRecording ? 'rgba(239,68,68,0.5)' : CLR_PRIMARY_BORDER}`, background: shareMiniRecording ? 'rgba(239,68,68,0.15)' : CLR_PRIMARY_FAINT, color: shareMiniRecording ? '#ef4444' : CLR_PRIMARY, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }}
                title="تسجيل صوتي"
              >
                {shareMiniRecording ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
              <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
              <input
                value={shareMiniText}
                onChange={e => setShareMiniText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey && shareMiniText.trim() && user && userShareChatPeer) {
                    e.preventDefault();
                    pushShareThreadMsg(user.id, userShareChatPeer.id, userShareChatPeer.post?.id ?? 'share', { fromId: user.id, type: 'text', body: shareMiniText.trim() });
                    setShareMiniMsgs(loadShareThread(user.id, userShareChatPeer.id, userShareChatPeer.post?.id ?? 'share'));
                    setShareMiniText('');
                  }
                }}
                placeholder="اكتب رسالة…"
                style={{
                  width: '100%', boxSizing: 'border-box', borderRadius: 20, padding: '10px 42px 10px 14px',
                  background: CLR_INPUT_BG, border: `1px solid ${CLR_PRIMARY_BORDER}`,
                  color: CLR_TEXT, fontSize: '0.88rem', outline: 'none',
                }}
              />
              <button
                type="button"
                disabled={!shareMiniText.trim()}
                onClick={() => {
                  if (!user || !userShareChatPeer || !shareMiniText.trim()) return;
                  pushShareThreadMsg(user.id, userShareChatPeer.id, userShareChatPeer.post?.id ?? 'share', { fromId: user.id, type: 'text', body: shareMiniText.trim() });
                  setShareMiniMsgs(loadShareThread(user.id, userShareChatPeer.id, userShareChatPeer.post?.id ?? 'share'));
                  setShareMiniText('');
                }}
                style={{
                  position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
                  width: 32, height: 32, borderRadius: '50%', border: 'none',
                  background: shareMiniText.trim() ? CLR_PRIMARY : 'transparent',
                  color: shareMiniText.trim() ? '#041018' : CLR_TEXT_DIM,
                  cursor: shareMiniText.trim() ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                }}
              >
                <Send size={15} />
              </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Guest guard modal — يظهر عند محاولة الزائر التفاعل ── */}
      {GuestModal}
    </>;
}
