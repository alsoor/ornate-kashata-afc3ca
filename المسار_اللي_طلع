import { add_friend } from 'virtual:content';
import { useState, useEffect, useRef, useMemo, useCallback, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import React from 'react';
import { useNavigate, useSearchParams } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import UserAvatar from '@/components/UserAvatar';
import { Search, UserPlus, Clock, Check, X, MessageCircle, Plus, Trash2, ShieldOff, Lock, LockKeyhole, Eye, EyeOff, Send, KeyRound, LogOut, Mic, MicOff, Image as ImageIcon, Images, Video, FileText, Play, Pause, Phone, PhoneOff, ArrowLeft, MoreVertical, Heart, Users, Repeat2, Hash, Inbox, Smile, Music, Camera, Zap, ZapOff, SlidersHorizontal, Download, Bookmark, Menu, Bell, PenLine } from 'lucide-react';
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
const C = {
  bg: 'radial-gradient(ellipse 70% 60% at 50% 30%, #0d2a2e 0%, #0a1a1a 50%, #060e0e 100%)',
  headerBg: 'hsl(var(--background)/0.95)',
  primary: '#00BCD4',
  primaryDim: 'rgba(0,188,212,0.35)',
  primaryFaint: 'rgba(0,188,212,0.08)',
  primaryBorder: 'rgba(0,188,212,0.2)',
  text: 'rgba(200,230,230,0.9)',
  textDim: 'rgba(150,200,200,0.5)',
  cardBg: 'rgba(0,188,212,0.05)',
  cardBorder: 'rgba(0,188,212,0.12)',
  inputBg: 'rgba(0,30,35,0.8)',
  navBorder: 'rgba(0,188,212,0.08)',
  tabActive: 'rgba(0,188,212,0.15)',
  tabBorder: 'rgba(0,188,212,0.3)',
  postBorder: '#0d3d33',
  paper: '#f7f6f2'
};

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

function CameraStoryCapture({ onClose, onPublish, avatarUrl, userName, friendRequests = [], onRespondFriendRequest, onOpenStoryComments }: {
  onClose: () => void;
  onPublish: (file: File) => Promise<void> | void;
  avatarUrl?: string | null;
  userName?: string | null;
  friendRequests?: IncomingRequest[];
  onRespondFriendRequest?: (id: number, action: 'accept' | 'reject') => void | Promise<void>;
  onOpenStoryComments?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRecordingRef = useRef(false);

  const [facingMode, _setFacingMode] = useState<'user' | 'environment'>('user');
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
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [captured, setCaptured] = useState<{ url: string; blob: Blob; type: 'image' | 'video' } | null>(null);
  const [closing, setClosing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');

  const activeFilterCss = CAMERA_FILTERS.find(f => f.id === filter)?.css ?? 'none';

  // البحث عن عدسة واسعة (Ultra-Wide) فعلية على الجهاز — هذه غالبًا كاميرا فيزيائية
  // منفصلة عن العدسة الرئيسية (deviceId مختلف)، وليست مجرد رقم "زوم" على نفس العدسة.
  // نعتمد على تسمية الجهاز (label) التي تظهر بعد إذن الوصول للكاميرا — لا يوجد معيار
  // ويب موحّد لتحديد "أي عدسة هي الواسعة"، فهذا أفضل تقريب متاح في المتصفح.
  useEffect(() => {
    let cancelled = false;
    async function findUltraWide() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter(d => d.kind === 'videoinput');
        const wanted = facingMode === 'user' ? /front|user|face/i : /back|rear|environment/i;
        const ultra = cams.find(d => /ultra.?wide|0\.5x|wide angle/i.test(d.label) && wanted.test(d.label))
          ?? cams.find(d => /ultra.?wide|0\.5x/i.test(d.label));
        if (!cancelled) setUltraWideDeviceId(ultra?.deviceId ?? null);
      } catch { if (!cancelled) setUltraWideDeviceId(null); }
    }
    void findUltraWide();
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
        // exact أولاً لضمان التبديل الحقيقي أمامي↔خلفي، ثم fallback لـ ideal
        let stream: MediaStream | null = null;
        const attempts: MediaTrackConstraints[] = wantUltraWide
          ? [{ deviceId: { exact: ultraWideDeviceId! } }]
          : [
              { facingMode: { exact: facingMode } },
              { facingMode: { ideal: facingMode } },
              { facingMode },
            ];
        for (const video of attempts) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video, audio: true });
            break;
          } catch { /* جرّب القيد التالي */ }
        }
        if (!stream) {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        }
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        const previousStream = streamRef.current;
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // المرآة فقط للكاميرا الأمامية
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
  }, [facingMode, wantUltraWide, ultraWideDeviceId]);

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
          // cover: ملء الإطار 9:16 بدون أشرطة سوداء كبيرة (نفس معاينة objectFit:cover)
          const scale = Math.max(targetW / vw, targetH / vh);
          const dw = vw * scale;
          const dh = vh * scale;
          const dx = (targetW - dw) / 2;
          const dy = (targetH - dh) / 2;
          // إن كانت الكاميرا أمامية نرسم مرآة أفقية لتطابق المعاينة
          if (facingMode === 'user') {
            ctx.translate(targetW, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(video, 0, 0, vw, vh, targetW - dx - dw, dy, dw, dh);
          } else {
            ctx.drawImage(video, 0, 0, vw, vh, dx, dy, dw, dh);
          }
          ctx.restore();
        }
      }
      rafRef.current = requestAnimationFrame(draw);
    }
    rafRef.current = requestAnimationFrame(draw);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [activeFilterCss, facingMode]);

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
      const file = new File([captured.blob], `story-camera-${Date.now()}.${ext}`, {
        type: captured.type === 'video' ? 'video/webm' : 'image/jpeg',
      });
      await onPublish(file);
      requestClose();
    } catch {
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
        position: 'fixed', inset: 0, zIndex: 10200, background: '#000',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      <div
        style={{ position: 'relative', flex: 1, overflow: 'hidden', display: captured ? 'none' : 'block', background: '#000' }}
      >
        {/* معاينة مباشرة — cover يملأ الشاشة ويقلّل الإطار الأسود الكبير */}
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
            transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
            filter: activeFilterCss === 'none' ? 'none' : activeFilterCss,
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
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => onOpenStoryComments?.()}
              style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.35)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative' }}>
              <Bell size={16} color="#fff" strokeWidth={2.2} />
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setRequestsBoxOpen(true)}
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

        {/* دائرة التصوير + زر إغلاق الكاميرا بجانبها (ينزلق للأسفل ويختفي) */}
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
          {/* موازنة بصرية لنفس عرض زر الإغلاق */}
          <div style={{ width: 46, height: 46, flexShrink: 0 }} />
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

      {/* معاينة بعد التصوير — أزرار النشر ثابتة وواضحة فوق الشريط السفلي */}
      {captured && (
        <div style={{
          position: 'relative', flex: 1, background: '#000',
          display: 'flex', flexDirection: 'column', minHeight: 0,
        }}>
          <div style={{
            flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0,
            /* مساحة للأزرار السفلية حتى لا تُغطّي المعاينة الأزرار */
            marginBottom: 0,
          }}>
            {captured.type === 'image' ? (
              <img src={captured.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            ) : (
              <video src={captured.url} autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            )}
            <motion.button whileTap={{ scale: 0.9 }} onClick={requestClose} aria-label="إغلاق"
              style={{
                position: 'absolute', top: 'max(env(safe-area-inset-top,0px),10px)', right: 12,
                width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 6,
              }}>
              <X size={18} color="#fff" strokeWidth={2.4} />
            </motion.button>
          </div>

          {error && (
            <p style={{
              color: '#ef4444', fontSize: '0.78rem', textAlign: 'center', margin: 0,
              padding: '8px 16px', background: 'rgba(0,0,0,0.85)', flexShrink: 0,
            }}>{error}</p>
          )}

          {/* شريط أزرار ثابت وواضح — لا يختفي تحت الشاشة */}
          <div style={{
            flexShrink: 0,
            display: 'flex', flexDirection: 'column', gap: 8,
            padding: '12px 16px',
            paddingBottom: 'max(env(safe-area-inset-bottom,0px), 16px)',
            background: 'rgba(6,14,14,0.97)',
            borderTop: '1px solid rgba(0,188,212,0.2)',
            zIndex: 8,
          }}>
            <motion.button
              whileTap={{ scale: 0.97 }}
              disabled={publishing}
              onClick={() => void publish()}
              style={{
                width: '100%', minHeight: 48, padding: '12px 0', borderRadius: 14, border: 'none',
                background: '#00BCD4', color: '#001417', fontWeight: 800, fontSize: '0.92rem',
                cursor: publishing ? 'default' : 'pointer', opacity: publishing ? 0.7 : 1,
                boxShadow: '0 4px 16px rgba(0,188,212,0.35)',
              }}
            >
              {publishing ? 'جارِ النشر…' : 'نشر القصة'}
            </motion.button>
            <div style={{ display: 'flex', gap: 8 }}>
              <motion.button whileTap={{ scale: 0.97 }} onClick={retake} disabled={publishing}
                style={{
                  flex: 1, minHeight: 44, padding: '10px 0', borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.3)',
                  background: 'rgba(255,255,255,0.12)', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                }}>
                إعادة التصوير
              </motion.button>
              <motion.button whileTap={{ scale: 0.97 }} onClick={requestClose} disabled={publishing}
                style={{
                  flex: 1, minHeight: 44, padding: '10px 0', borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.3)',
                  background: 'rgba(255,255,255,0.12)', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                }}>
                إغلاق الكاميرا
              </motion.button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ── StoryViewer — fullscreen viewer ───────────────────────────────────────────
function StoryViewer({ groups, startGroupIdx, myId, onClose, onSeen, onAddMedia, onPublishPhoto, onPublishVideo, onOpenCamera, onDeleteItem, onSendComment }: {
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
}) {
  const [gIdx, setGIdx] = useState(startGroupIdx);
  const [iIdx, setIIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [storyMenuOpen, setStoryMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
    try {
      const res = await fetch(`/api/status/${item.id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        // نطبع تفاصيل الفشل في الكونسول ونعرض رسالة للمستخدم بدل الفشل الصامت —
        // هذا هو سبب "الحذف ما يشتغل أبداً": الطلب يفشل من السيرفر (401/403/404/500)
        // ولازم نعرف رمز الخطأ بالضبط لتحديد سبب الفشل الحقيقي في الـ API.
        let detail = '';
        try { detail = await res.text(); } catch {/* ignore */}
        console.error('[StoryViewer] فشل حذف الستوري', { id: item.id, status: res.status, statusText: res.statusText, body: detail });
        setDeleteError(`تعذّر حذف الستوري (رمز الخطأ ${res.status}). راجع الكونسول للتفاصيل.`);
        setDeleting(false);
        return;
      }
      onDeleteItem(item.id);
      // انتقال فوري وسلس للعنصر التالي/الإغلاق. هذا تخمين متفائل بناءً على الحالة
      // الحالية فقط لتفادي أي وميض؛ التموضع الصحيح النهائي تتكفّل به المزامنة
      // بالمعرّف أعلاه (تعمل بشكل صحيح حتى لو تغيّر ترتيب groups بفعل الريفرش
      // التلقائي كل ثانيتين أثناء الحذف).
      if (group.items.length <= 1) {
        onClose();
      } else if (iIdx >= group.items.length - 1) {
        setIIdx(group.items.length - 2);
      }
      setConfirmDelete(false);
      setDeleting(false);
    } catch (err) {
      console.error('[StoryViewer] خطأ شبكة أثناء حذف الستوري', err);
      setDeleteError('تعذّر الاتصال بالسيرفر لحذف الستوري. تحقق من الإنترنت وحاول مجدداً.');
      setDeleting(false);
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
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'hsl(var(--background))', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
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
                  <Plus size={16} color="hsl(var(--primary))" /> نشر للقصة
                </button>
                <button onClick={() => { setStoryMenuOpen(false); onPublishPhoto(); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', border: 'none', borderRadius: 8, background: 'transparent', color: 'hsl(var(--foreground))', cursor: 'pointer', fontSize: '0.8rem', textAlign: 'right' }}>
                  <ImageIcon size={16} color="hsl(var(--primary))" /> Photo
                </button>
                <button onClick={() => { setStoryMenuOpen(false); onPublishVideo(); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', border: 'none', borderRadius: 8, background: 'transparent', color: 'hsl(var(--foreground))', cursor: 'pointer', fontSize: '0.8rem', textAlign: 'right' }}>
                  <Video size={16} color="hsl(var(--primary))" /> Video
                </button>
                <button onClick={() => { setStoryMenuOpen(false); onOpenCamera(); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', border: 'none', borderRadius: 8, background: 'transparent', color: 'hsl(var(--foreground))', cursor: 'pointer', fontSize: '0.8rem', textAlign: 'right' }}>
                  <Camera size={16} color="hsl(var(--primary))" /> نشر القصة عبر
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

// ── PostText — renders post text with #hashtags highlighted ──────────────────
function PostText({ text, color, textColor, onHashtag }: { text: string; color: string; textColor: string; onHashtag?: (tag: string) => void }) {
  if (!text) return null;
  const parts = text.split(/(#[\p{L}\p{N}_]+|@[\p{L}\p{N}_]+)/gu);
  return (
    <p style={{ color: textColor, fontSize: '0.78rem', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: "'Alexandria', var(--font-sans), sans-serif" }}>
      {parts.map((part, i) => {
        if (part.startsWith('#')) {
          return <button key={i} onClick={event => { event.stopPropagation(); onHashtag?.(part.slice(1)); }} style={{ color, fontWeight: 700, background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}>{part}</button>;
        }
        if (part.startsWith('@')) {
          return <span key={i} style={{ color: 'hsl(var(--primary))', fontWeight: 700 }}>{part}</span>;
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </p>
  );
}

// ── PostCard — a single feed post: one card, paper-style text area, small expandable media ──
function PostMediaItems(post: PostItem): { url: string; type: 'image' | 'video' }[] {
  if (post.mediaUrls?.length) {
    return post.mediaUrls.map((url, index) => ({
      url,
      type: post.mediaTypes?.[index] === 'video' ? 'video' : 'image',
    }));
  }
  return post.mediaUrl ? [{ url: post.mediaUrl, type: post.mediaType ?? 'image' }] : [];
}

function PostCard({
  post,
  isMine,
  followStatus,
  onFollow,
  onToggleLike,
  onOpenPost,
  onRequestDelete,
  onRemoveMedia,
  onHashtag,
  onToggleFavorite,
  isFavorited,
  onShare,
  onRepost,
  onDownload,
  onOpenProfile,
}: {
  post: PostItem;
  isMine: boolean;
  // null لصاحب المنشور نفسه (ما نعرض له زر متابعة على منشوره)، وإلا حالة العلاقة
  // الحالية بين المستخدم الحالي وناشر هذا المنشور.
  followStatus: 'accepted' | 'pending' | 'none' | null;
  onFollow: (post: PostItem) => void;
  onToggleLike: (post: PostItem) => void;
  onOpenPost: (post: PostItem) => void;
  onRequestDelete: (post: PostItem) => void;
  onRemoveMedia: (post: PostItem) => void;
  onHashtag: (tag: string) => void;
  onToggleFavorite: (post: PostItem) => void;
  isFavorited: (postId: number) => boolean;
  onShare: (post: PostItem) => void;
  onRepost: (post: PostItem) => void;
  onDownload: (post: PostItem) => void;
  // فتح صورة الملف الشخصي الآن يفتح مربع البروفايل الكامل (بيانات + شات + مكالمة) بدل
  // معاينة الصورة وحدها — لا يُستدعى لمنشورك أنت (isMine).
  onOpenProfile: (post: PostItem) => void;
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
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => onOpenPost(post)}
        style={{
          border: 'none',
          borderBottom: `1px solid ${C.postBorder}`,
          background: 'transparent',
          borderRadius: 0,
          padding: '14px 14px',
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          cursor: 'pointer',
        }}
      >
        {/* Repost attribution ribbon — only present on a feed entry created by a repost */}
        {post.repostedBy && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.textDim, fontSize: '0.68rem', fontWeight: 600 }}>
            <Repeat2 size={13} strokeWidth={2.2} />
            <span>أعاد {post.repostedBy.name || post.repostedBy.username || '—'} نشر هذا المنشور</span>
          </div>
        )}
        {/* Header: publisher avatar + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={e => { e.stopPropagation(); if (!isMine) onOpenProfile(post); }}
            aria-label="عرض الملف الشخصي"
            style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', borderRadius: '50%', flexShrink: 0 }}
          >
            <UserAvatar name={post.authorName} avatarUrl={post.authorAvatarUrl} size={38} />
          </motion.button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: 'hsl(var(--foreground))', fontSize: '0.82rem', fontWeight: 700, margin: 0 }}>
              {post.authorName || post.authorUsername || '—'}
              <span style={{ color: 'hsl(var(--foreground))', fontSize: '0.66rem', fontWeight: 500, marginInlineStart: 7 }}>
                {publishedDate}
              </span>
            </p>
            <p style={{ color: 'hsl(var(--foreground))', fontSize: '0.68rem', margin: 0 }}>
              {post.authorUsername && <span style={{ color: 'hsl(var(--primary))', fontWeight: 700 }}>@{post.authorUsername}</span>}
              {post.authorUsername && <span style={{ color: 'hsl(var(--foreground))' }}> · </span>}
              {timeAgo}
            </p>
          </div>

          {/* زر المتابعة/الإضافة — لا يظهر على منشورك أنت (followStatus === null) */}
          {followStatus === 'pending' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
              padding: '5px 10px', borderRadius: 20, background: C.cardBg, border: `1px solid ${C.cardBorder}`,
            }}>
              <Clock size={12} strokeWidth={2} color={C.textDim} />
              <span style={{ fontSize: '0.66rem', color: C.textDim, fontWeight: 600, whiteSpace: 'nowrap' }}>بانتظار القبول</span>
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
        </div>

        {/* Text-post area — no longer white paper: dark card background + border matching
            the app's hashtag-page card style. Layout (radius, padding, margin) untouched,
            just the color. */}
        {post.text && (
          <div style={{
            background: 'transparent',
            border: 'none',
            borderRadius: 0,
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
          }}>
            <PostText text={post.text} color="hsl(var(--primary))" textColor={C.textDim} onHashtag={onHashtag} />
          </div>
        )}

        {/* Media — small thumbnail inside the same card, tap to expand */}
        {PostMediaItems(post).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignSelf: 'flex-start' }}>
            {PostMediaItems(post).map((media, index) => (
              <div key={`${media.type}-${index}`} style={{ position: 'relative' }}>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={e => { e.stopPropagation(); onOpenPost(post); }}
                  aria-label={media.type === 'video' ? 'فتح الفيديو' : 'فتح الصورة'}
                  style={{
                    position: 'relative', width: 130, height: 130,
                    borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.postBorder}`,
                    padding: 0, background: '#000', cursor: 'pointer', display: 'block',
                  }}
                >
                  {media.type === 'video' ? (
                    <video src={media.url} muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <img src={media.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  )}
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {media.type === 'video' ? <Play size={22} strokeWidth={2} color="#fff" fill="#fff" /> : <Eye size={18} strokeWidth={2} color="#fff" />}
                  </div>
                </motion.button>
                {isMine && index === 0 && (
                  <motion.button whileTap={{ scale: 0.88 }} onClick={e => { e.stopPropagation(); onRemoveMedia(post); }} aria-label="حذف الوسائط" style={{
                    position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: '50%',
                    background: 'rgba(20,20,20,0.85)', border: `1px solid ${C.postBorder}`, color: '#fff', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <X size={13} strokeWidth={2.6} />
                  </motion.button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Actions: likes, downloads, and comments. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, paddingTop: 2 }}>
          <motion.button whileTap={{ scale: 0.88 }} onClick={e => { e.stopPropagation(); onToggleLike(post); }} style={{
            display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer',
            color: post.likedByMe ? '#ef4444' : C.textDim,
          }}>
            <Heart size={16} strokeWidth={2} fill={post.likedByMe ? '#ef4444' : 'none'} />
            <span style={{ fontSize: '0.7rem', fontWeight: 600 }}>{post.likesCount > 0 ? post.likesCount : ''}</span>
          </motion.button>
          {/* زر التنزيل — يظهر فقط على المنشورات التي فيها صورة أو فيديو (مو النصية)،
              بجانب زر اللايك مباشرة، ويظهر لصاحب المنشور وللمستخدمين الآخرين على حدٍ سواء. */}
          {PostMediaItems(post).length > 0 && (
            <motion.button whileTap={{ scale: 0.88 }} onClick={e => { e.stopPropagation(); onDownload(post); }} style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: C.textDim }} aria-label="تنزيل">
              <Download size={15} strokeWidth={2} />
            </motion.button>
          )}
          <motion.button whileTap={{ scale: 0.88 }} onClick={e => { e.stopPropagation(); onOpenPost(post); }} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: C.textDim }}>
            <MessageCircle size={15} strokeWidth={2} />
            <span style={{ fontSize: '0.7rem', fontWeight: 600 }}>{post.commentsCount > 0 ? post.commentsCount : ''}</span>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={e => { e.stopPropagation(); onRepost(post); }}
            aria-label="إعادة نشر"
            title="إعادة نشر"
            style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: post.repostedByMe ? 'hsl(var(--primary))' : C.textDim }}
          >
            <Repeat2 size={15} strokeWidth={2} />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={e => { e.stopPropagation(); onToggleFavorite(post); }}
            aria-label="إضافة إلى المفضلة"
            title="إضافة إلى المفضلة"
            style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: isFavorited(post.id) ? '#22c55e' : C.textDim }}
          >
            <Bookmark size={15} strokeWidth={2} fill={isFavorited(post.id) ? '#22c55e' : 'none'} />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={e => { e.stopPropagation(); onShare(post); }}
            aria-label="إرسال المنشور للأصدقاء"
            title="إرسال المنشور للأصدقاء"
            style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: C.textDim }}
          >
            <Send size={15} strokeWidth={2} />
          </motion.button>
          {followStatus === 'accepted' && (
            <span title="متابَع" style={{ display: 'flex', alignItems: 'center' }}>
              <Check size={14} strokeWidth={3} color={C.textDim} />
            </span>
          )}
        </div>
      </motion.div>
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
}
// ── FollowersListModal — centered box listing accepted friends vertically, with a
// switch to hide the list from other users (independent from the private-account rule,
// which always hides it regardless of this switch). Shared between the owner's own
// profile and any other profile-view component that has a friends list to show. ──
function FollowersListModal({
  friends,
  followersVisible,
  onToggleVisible,
  onClose,
}: {
  friends: Friend[];
  followersVisible: boolean;
  onToggleVisible: (next: boolean) => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)',
        zIndex: 10300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <motion.div
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
        style={{
          width: '100%', maxWidth: 380,
          background: 'hsl(var(--card))',
          borderRadius: 18,
          overflow: 'hidden',
          maxHeight: '78dvh',
          display: 'flex', flexDirection: 'column',
          border: '1px solid hsl(var(--border))',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid hsl(var(--border))' }}>
          <p style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: 'hsl(var(--foreground))' }}>المتابعون</p>
          <button onClick={onClose} aria-label="إغلاق" style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'hsl(var(--muted))', color: 'hsl(var(--foreground))', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={14} strokeWidth={2.4} />
          </button>
        </div>

        {/* Privacy switch — "إخفاء متابعيني عن الآخرين". Off = visible to others (unless
            the account itself is private, which always wins). On = hidden even on a
            public account. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', gap: 10, borderBottom: '1px solid hsl(var(--border))' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>إخفاء متابعيني عن الآخرين</span>
            <span style={{ fontSize: '0.66rem', color: 'hsl(var(--muted-foreground))', lineHeight: 1.5 }}>
              لو فعّلته، ما أحد يقدر يشوف قائمة متابعيني حتى لو حسابي عام
            </span>
          </div>
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => onToggleVisible(!followersVisible)}
            aria-label="تبديل إخفاء المتابعين"
            aria-pressed={!followersVisible}
            style={{
              width: 44, height: 26, borderRadius: 999, padding: 2, border: 'none', cursor: 'pointer', flexShrink: 0,
              background: !followersVisible ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
              display: 'flex', alignItems: 'center', justifyContent: !followersVisible ? 'flex-end' : 'flex-start',
              transition: 'background 0.2s ease',
            }}
          >
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#fff', display: 'block', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
          </motion.button>
        </div>

        {/* List — friends stacked vertically, one under another */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', padding: '6px 8px', display: 'flex', flexDirection: 'column' }}>
          {friends.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '32px 12px' }}>
              <Users size={26} strokeWidth={1.6} color="hsl(var(--muted-foreground))" />
              <p style={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))', margin: 0 }}>لا يوجد متابعون بعد</p>
            </div>
          ) : (
            friends.map(f => (
              <div
                key={f.id}
                style={{
                  width: '100%', boxSizing: 'border-box', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px',
                  borderRadius: 10, textAlign: 'right',
                }}
              >
                <UserAvatar name={f.name ?? ''} avatarUrl={f.avatarUrl ?? null} size={38} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'hsl(var(--foreground))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name || f.username || '—'}</span>
                  {f.username && <span style={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))' }}>@{f.username}</span>}
                </div>
              </div>
            ))
          )}
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
  const avatarUrl = profile?.avatarUrl ?? authorAvatarUrl;
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
        <p style={{ color: C.textDim, fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', margin: 0, fontWeight: 600 }}>
          {label}
        </p>
        <p style={{ color: C.text, fontSize: '0.84rem', margin: 0, lineHeight: 1.5 }}>
          {value || <span style={{ color: C.textDim, fontStyle: 'italic' }}>—</span>}
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
              background: coverUrl ? 'transparent' : C.primaryFaint,
            }}>
              {coverUrl && <img src={coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.35) 100%)', pointerEvents: 'none' }} />
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: C.text }}>{profile?.postsCount ?? 0}</span>
                  <span style={{ fontSize: '0.6rem', color: C.textDim }}>Post</span>
                </div>
                <motion.button
                  whileTap={isOwnProfile ? { scale: 0.94 } : undefined}
                  onClick={() => { if (isOwnProfile) setFollowersModalOpen(true); }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, background: 'none', border: 'none', padding: 0, cursor: isOwnProfile ? 'pointer' : 'default' }}
                >
                  {(!isOwnProfile && (!!profile?.isPrivate || profile?.followersVisible === false)) ? (
                    <Lock size={13} strokeWidth={2.2} color={C.textDim} />
                  ) : (
                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: C.text }}>{profile?.followersCount ?? 0}</span>
                  )}
                  <span style={{ fontSize: '0.6rem', color: C.textDim }}>Followers</span>
                </motion.button>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: C.text }}>{profile?.repostsCount ?? 0}</span>
                  <span style={{ fontSize: '0.6rem', color: C.textDim }}>Repost</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: C.text }}>{profile?.likesCount ?? 0}</span>
                  <span style={{ fontSize: '0.6rem', color: C.textDim }}>Likes</span>
                </div>
              </div>

              {/* Chat + friend-menu row — never shown on your own profile */}
              {!isOwnProfile && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {friendState === 'accepted' ? <>
                  {/* Chat — only ever seen by the visitor, never by the profile's own owner */}
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      onClose();
                      navigate(`/chat?with=${authorId}&name=${encodeURIComponent(name ?? '')}&username=${encodeURIComponent(username ?? '')}&avatarUrl=${encodeURIComponent(avatarUrl ?? '')}`);
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: C.primary, border: 'none', borderRadius: 20, color: '#06171a', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    <MessageCircle size={15} strokeWidth={2.4} />
                    شات
                  </motion.button>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ padding: '8px 14px', borderRadius: 20, background: C.primaryFaint, color: C.primary, fontSize: '0.78rem', fontWeight: 700 }}>صديق</span>
                    <button onClick={() => setFriendMenuOpen(open => !open)} aria-label="خيارات الصديق" aria-expanded={friendMenuOpen} style={{ width: 32, height: 32, borderRadius: '50%', border: `1px solid ${C.primaryBorder}`, background: 'transparent', color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                      <MoreVertical size={17} />
                    </button>
                    {friendMenuOpen && <div style={{ position: 'absolute', top: 38, insetInlineEnd: 0, zIndex: 280, minWidth: 142, padding: 6, borderRadius: 12, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', boxShadow: 'var(--shadow-lg)' }}>
                      <button onClick={removeFriendship} disabled={friendLoading} style={{ width: '100%', padding: '9px 10px', border: 'none', borderRadius: 8, background: 'transparent', color: 'hsl(var(--foreground))', cursor: friendLoading ? 'default' : 'pointer', textAlign: 'right', fontSize: '0.78rem' }}>حذف صديق</button>
                      <button onClick={blockUser} disabled={friendLoading} style={{ width: '100%', padding: '9px 10px', border: 'none', borderRadius: 8, background: 'transparent', color: 'hsl(var(--destructive))', cursor: friendLoading ? 'default' : 'pointer', textAlign: 'right', fontSize: '0.78rem' }}>حظر</button>
                    </div>}
                  </div>
                </> : <>
                  {friendState === 'none' && (
                    <motion.button whileTap={{ scale: 0.95 }} onClick={requestFriendship} disabled={friendLoading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'transparent', border: `1px solid ${C.primary}`, borderRadius: 20, color: C.primary, fontSize: '0.78rem', fontWeight: 700, cursor: friendLoading ? 'default' : 'pointer', opacity: friendLoading ? 0.6 : 1 }}>
                      <UserPlus size={15} strokeWidth={2.4} />
                      طلب صداقة
                    </motion.button>
                  )}
                  {friendState === 'pending' && <span style={{ padding: '8px 16px', borderRadius: 20, background: C.primaryFaint, color: C.primary, fontSize: '0.78rem', fontWeight: 700 }}>بانتظار القبول</span>}
                </>}
              </div>}

              {/* Call rectangle — its own row, directly under the chat/friend row, never on your
                  own profile, only visible here when you're the visitor viewing an accepted friend. */}
              {!isOwnProfile && friendState === 'accepted' && user && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
                  <GlobeVoiceControl
                    userId={user.id}
                    userName={user.name ?? user.email ?? 'مستخدم'}
                    avatarUrl={(user as any)?.avatarUrl ?? null}
                    peerId={authorId}
                  />
                </div>
              )}

            </div>

            {/* Fields */}
            {loading ? (
              <div className="flex items-center justify-center" style={{ padding: '24px 0' }}>
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} style={{
                  width: 20, height: 20, borderRadius: '50%', border: `2px solid ${C.primaryBorder}`, borderTopColor: C.primary,
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

// ── FriendStoryProfile — the actual "story page" for another user opened from the globe's
//    names bar: avatar, follow stats, chat/friend actions, and ONLY their Videos/Photos grids.
//    Their text posts are never shown here — those already live in the public feed. ──
export interface FriendStoryProfileProps {
  authorId: string;
  authorName: string | null;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  onClose: () => void;
  onOpenPost: (post: PostItem) => void;
}
export function FriendStoryProfile({ authorId, authorName, authorUsername, authorAvatarUrl, onClose, onOpenPost }: FriendStoryProfileProps) {
  const navigate = useNavigate();
  const { user } = useSession();
  const [profile, setProfile] = useState<MiniProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [avatarExpanded, setAvatarExpanded] = useState(false);
  const [friendState, setFriendState] = useState<'none' | 'pending' | 'accepted'>('none');
  const [friendLoading, setFriendLoading] = useState(false);
  const [friendMenuOpen, setFriendMenuOpen] = useState(false);
  const [contentTab, setContentTab] = useState<'videos' | 'photos'>('videos');
  const [authorPosts, setAuthorPosts] = useState<PostItem[]>([]);
  const [selectedPost, setSelectedPost] = useState<PostItem | null>(null);

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

  // ── This user's video/photo posts only — their text posts already live in the public feed. ──
  useEffect(() => {
    let cancelled = false;
    async function loadMedia() {
      try {
        const r = await fetch('/api/posts', { credentials: 'include' });
        if (!r.ok) return;
        const data = await r.json() as { posts: PostItem[] };
        if (cancelled) return;
        const theirs = (data.posts ?? []).filter(p =>
          String(p.authorId) === String(authorId) && (p.mediaType === 'image' || p.mediaType === 'video')
        );
        setAuthorPosts(theirs);
      } catch {/* silent — grid simply stays empty */}
    }
    loadMedia();
    return () => { cancelled = true; };
  }, [authorId]);

  const name = profile?.name ?? authorName;
  const username = profile?.username ?? authorUsername;
  const avatarUrl = profile?.avatarUrl ?? authorAvatarUrl;
  const coverUrl = profile?.coverUrl ?? null;
  const pinnedTrack = pinnedTrackFromProfile(profile);

  const getPostThumbType = (post: PostItem) =>
    post.mediaTypes && post.mediaTypes.length > 0 ? post.mediaTypes[0] : post.mediaType;
  const videoPosts = authorPosts.filter(p => getPostThumbType(p) === 'video');
  const photoPosts = authorPosts.filter(p => getPostThumbType(p) === 'image');
  const activePosts = contentTab === 'videos' ? videoPosts : photoPosts;
  // Private accounts only show their videos/photos to accepted friends.
  const isHiddenPrivate = !!profile?.isPrivate && friendState !== 'accepted';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }}
      transition={{ type: 'tween', duration: 0.32, ease: 'easeIn' }}
      style={{ position: 'fixed', inset: 0, zIndex: 10250, background: C.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
        {/* Cover photo + close button + pinned music (above avatar, center of cover) */}
        <div style={{ width: '100%', height: 130, position: 'relative', background: coverUrl ? 'transparent' : C.primaryFaint }}>
          {coverUrl && <img src={coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.35) 100%)', pointerEvents: 'none' }} />
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={onClose}
            aria-label="إغلاق"
            style={{
              position: 'absolute', top: 10, insetInlineStart: 10, width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(0,0,0,0.4)', border: 'none', color: '#fff', cursor: 'pointer',
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
            style={{ width: 80, height: 80, borderRadius: '50%', overflow: 'hidden', padding: 0, border: `3px solid ${C.bg}`, cursor: 'pointer', background: '#000' }}
          >
            <UserAvatar name={name || ''} avatarUrl={avatarUrl} size={80} style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
          </motion.button>

          <p style={{ color: C.text, fontSize: '0.9rem', fontWeight: 700, margin: '8px 0 0' }}>{name || username || '—'}</p>
          {username && <p style={{ color: C.primary, fontSize: '0.75rem', fontWeight: 600, margin: '2px 0 0' }}>@{username}</p>}
          {profile?.bio && (
            <p style={{ color: C.text, opacity: 0.85, fontSize: '0.72rem', fontWeight: 500, margin: '6px 20px 0', textAlign: 'center', lineHeight: 1.5 }}>
              {profile.bio}
            </p>
          )}

          {/* Post / Followers / Following / Likes — same stats shown on your own profile */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: C.text }}>{profile?.postsCount ?? authorPosts.length}</span>
              <span style={{ fontSize: '0.6rem', color: C.textDim }}>Post</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              {(!!profile?.isPrivate || profile?.followersVisible === false) ? (
                <Lock size={13} strokeWidth={2.2} color={C.textDim} />
              ) : (
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: C.text }}>{profile?.followersCount ?? 0}</span>
              )}
              <span style={{ fontSize: '0.6rem', color: C.textDim }}>Followers</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: C.text }}>
                {profile?.repostsCount ?? authorPosts.reduce((sum, p) => sum + (p.repostsCount ?? 0), 0)}
              </span>
              <span style={{ fontSize: '0.6rem', color: C.textDim }}>Repost</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: C.text }}>
                {profile?.likesCount ?? authorPosts.reduce((sum, p) => sum + (p.likesCount ?? 0), 0)}
              </span>
              <span style={{ fontSize: '0.6rem', color: C.textDim }}>Likes</span>
            </div>
          </div>

          {/* Chat (square icon) + friend check + call-control row — call control pinned to the right */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            {friendState === 'accepted' ? <>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  onClose();
                  // نستبدل موقعنا الحالي في history بنسخة تحمل علامة "افتح نفس بروفايل
                  // هالصديق"، عشان لما نرجع من الشات بزر السهم/الرجوع (navigate(-1))
                  // نطلع بنفس البروفايل بدل ما نرجع للقائمة الرئيسية الفاضية أو لصفحة
                  // البوستات النصية (تلك العلامة تخص الشات اللي يُفتح من داخل صفحة
                  // البوستات النصية بالعام، مش من البروفايل).
                  navigate(`/add-friend?openProfile=${authorId}&openProfileName=${encodeURIComponent(name ?? '')}&openProfileUsername=${encodeURIComponent(username ?? '')}&openProfileAvatar=${encodeURIComponent(avatarUrl ?? '')}`, { replace: true });
                  navigate(`/chat?with=${authorId}&name=${encodeURIComponent(name ?? '')}&username=${encodeURIComponent(username ?? '')}&avatarUrl=${encodeURIComponent(avatarUrl ?? '')}`);
                }}
                aria-label="شات"
                title="شات"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, padding: 0, background: 'transparent', border: 'none', color: C.primary, cursor: 'pointer' }}
              >
                <MessageCircle size={22} strokeWidth={2.2} />
              </motion.button>
              <span
                aria-label="صديق"
                title="صديق"
                style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Check size={20} strokeWidth={3} color="#22c55e" />
              </span>
            </> : <>
              {friendState === 'none' && (
                <motion.button whileTap={{ scale: 0.95 }} onClick={requestFriendship} disabled={friendLoading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'transparent', border: `1px solid ${C.primary}`, borderRadius: 20, color: C.primary, fontSize: '0.78rem', fontWeight: 700, cursor: friendLoading ? 'default' : 'pointer', opacity: friendLoading ? 0.6 : 1 }}>
                  <UserPlus size={15} strokeWidth={2.4} />
                  طلب صداقة
                </motion.button>
              )}
              {friendState === 'pending' && <span style={{ padding: '8px 16px', borderRadius: 20, background: C.primaryFaint, color: C.primary, fontSize: '0.78rem', fontWeight: 700 }}>بانتظار القبول</span>}
            </>}
          </div>
        </div>

        {/* ── صف الزوايا: نقاط الحظر بالزاوية اليسرى العلوية، ونقاط الاتصال بنفس الطريقة بالزاوية
            اليمنى العلوية (عامودي، ملوّنة بلون المايك) — والمايك الأحمر بالمنتصف بينهم، بنفس
            مستوى خط النقاط — فوق شريط فيديوهات/صور مباشرة، بدل النص ── */}
        {friendState === 'accepted' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', direction: 'ltr', padding: '4px 12px 0' }}>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setFriendMenuOpen(open => !open)} aria-label="خيارات الصديق" aria-expanded={friendMenuOpen} style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'transparent', color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <MoreVertical size={18} strokeWidth={2} style={{ display: 'block' }} />
              </button>
              {friendMenuOpen && <div style={{ position: 'absolute', top: 34, left: 0, zIndex: 30, minWidth: 142, padding: 6, borderRadius: 12, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', boxShadow: 'var(--shadow-lg)', direction: 'rtl' }}>
                <button onClick={removeFriendship} disabled={friendLoading} style={{ width: '100%', padding: '9px 10px', border: 'none', borderRadius: 8, background: 'transparent', color: 'hsl(var(--foreground))', cursor: friendLoading ? 'default' : 'pointer', textAlign: 'right', fontSize: '0.78rem' }}>حذف صديق</button>
                <button onClick={blockUser} disabled={friendLoading} style={{ width: '100%', padding: '9px 10px', border: 'none', borderRadius: 8, background: 'transparent', color: 'hsl(var(--destructive))', cursor: friendLoading ? 'default' : 'pointer', textAlign: 'right', fontSize: '0.78rem' }}>حظر</button>
              </div>}
            </div>
            {user && (
              <GlobeVoiceControl
                userId={user.id}
                userName={user.name ?? user.email ?? 'مستخدم'}
                avatarUrl={(user as any)?.avatarUrl ?? null}
                peerId={authorId}
                layout="split"
                renderSplit={({ dotsButton, micButton }) => (
                  <>
                    {micButton}
                    {dotsButton}
                  </>
                )}
              />
            )}
          </div>
        )}
        {isHiddenPrivate ? (
          <div className="flex flex-col items-center justify-center gap-3" style={{ paddingTop: 40, paddingBottom: 48, borderTop: `1px solid ${C.navBorder}`, marginTop: 8 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.primaryFaint, border: `1px solid ${C.primaryBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.primaryDim }}>
              <LockKeyhole size={22} strokeWidth={1.6} />
            </div>
            <p style={{ color: C.text, fontSize: '0.85rem', fontWeight: 600, textAlign: 'center' }}>هذا الحساب خاص</p>
            <p style={{ color: C.textDim, fontSize: '0.78rem', textAlign: 'center', maxWidth: 240, lineHeight: 1.6 }}>
                  Add {name ?? 'this user'} as a friend to see their videos and photos
            </p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', borderTop: `1px solid ${C.navBorder}`, borderBottom: `1px solid ${C.navBorder}`, marginTop: 8 }}>
              <button
                onClick={() => setContentTab('videos')}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px 0', border: 'none', background: contentTab === 'videos' ? C.tabActive : 'transparent', color: contentTab === 'videos' ? C.primary : C.textDim, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
              >
                <Video size={15} strokeWidth={2} /> Video
              </button>
              <button
                onClick={() => setContentTab('photos')}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px 0', border: 'none', background: contentTab === 'photos' ? C.tabActive : 'transparent', color: contentTab === 'photos' ? C.primary : C.textDim, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
              >
                <ImageIcon size={15} strokeWidth={2} /> Photo
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center" style={{ padding: '24px 0' }}>
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${C.primaryBorder}`, borderTopColor: C.primary }} />
              </div>
            ) : activePosts.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '10px 2px 24px' }}>
                {activePosts.map(post => {
                  const thumbUrl = post.mediaUrls && post.mediaUrls.length > 0 ? post.mediaUrls[0] : post.mediaUrl;
                  return (
                    <motion.button
                      key={post.id}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setSelectedPost(post)}
                      style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', padding: 0, border: 'none', background: '#000', cursor: 'pointer', overflow: 'hidden' }}
                    >
                      {contentTab === 'videos' ? (
                        <video src={thumbUrl ?? ''} muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      ) : (
                        <img src={thumbUrl ?? ''} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      )}
                      {contentTab === 'videos' && (
                        <div style={{ position: 'absolute', top: 6, insetInlineEnd: 6 }}>
                          <Play size={13} strokeWidth={2.4} color="#fff" fill="#fff" />
                        </div>
                      )}
                      {(post.mediaUrls?.length ?? 0) > 1 && (
                        <div style={{ position: 'absolute', top: 6, insetInlineStart: 6 }}>
                          <Images size={13} strokeWidth={2.4} color="#fff" />
                        </div>
                      )}
                      <div style={{ position: 'absolute', bottom: 4, insetInlineStart: 6, display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Heart size={11} strokeWidth={2.4} color="#fff" fill={post.likedByMe ? '#fff' : 'none'} />
                        <span style={{ color: '#fff', fontSize: '0.62rem', fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>{post.likesCount}</span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3" style={{ paddingTop: 32, paddingBottom: 40 }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: C.primaryFaint, border: `1px solid ${C.primaryBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.primaryDim }}>
                  {contentTab === 'videos' ? <Video size={20} strokeWidth={1.5} /> : <ImageIcon size={20} strokeWidth={1.5} />}
                </div>
                <p style={{ color: C.textDim, fontSize: '0.82rem', textAlign: 'center', maxWidth: 220, lineHeight: 1.6 }}>
                  {contentTab === 'videos' ? 'No videos yet' : 'No photos yet'}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <AnimatePresence>
        {selectedPost && (
          <PostDetailPage
            key={selectedPost.id}
            post={selectedPost}
            isMine={!!user && selectedPost.authorId === user.id}
            comments={[]}
            commentText=""
            commentSending={false}
            onChangeCommentText={() => undefined}
            onSubmitComment={() => undefined}
            onToggleLike={() => undefined}
            onRemoveMedia={() => undefined}
            onRequestDelete={() => undefined}
            onSaveMediaText={async () => undefined}
            onClose={() => setSelectedPost(null)}
          />
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
        position: 'fixed', inset: 0, zIndex: 10200,
        background: C.bg,
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
        background: hasMedia ? 'linear-gradient(to bottom, rgba(0,0,0,0.68), rgba(0,0,0,0.32) 60%, transparent)' : C.headerBg,
        backdropFilter: hasMedia ? undefined : 'blur(14px)',
        borderBottom: hasMedia ? undefined : `1px solid ${C.navBorder}`,
      }}>
        <button onClick={onClose} aria-label="إغلاق" style={{
          background: 'none', border: 'none', color: hasMedia ? '#fff' : C.text, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, flexShrink: 0,
        }}>
          <X size={20} strokeWidth={2.2} />
        </button>
        <UserAvatar name={post.authorName} avatarUrl={post.authorAvatarUrl} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: hasMedia ? '#fff' : C.text, fontSize: '0.82rem', fontWeight: 700, margin: 0, textShadow: hasMedia ? '0 1px 3px rgba(0,0,0,0.5)' : undefined }}>
            {post.authorName || post.authorUsername || '—'}
          </p>
          <p style={{ color: hasMedia ? 'rgba(255,255,255,0.82)' : C.textDim, fontSize: '0.66rem', margin: '1px 0 0', textShadow: hasMedia ? '0 1px 3px rgba(0,0,0,0.5)' : undefined }}>
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
          style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', display: 'flex', flexDirection: 'column', minHeight: 180, flexGrow: 1 }}
        >
          {isMine && isMediaPost && (
            <div style={{ margin: '14px 14px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <textarea
                value={mediaText}
                onChange={event => setMediaText(event.target.value)}
                placeholder="اكتب منشوراً نصياً للصورة أو الفيديو"
                rows={3}
                style={{ width: '100%', resize: 'vertical', borderRadius: 12, border: `1px solid ${C.postBorder}`, background: C.inputBg, color: C.text, padding: '10px 12px', fontFamily: 'inherit', fontSize: '0.82rem', boxSizing: 'border-box' }}
              />
              <button type="button" onClick={saveMediaText} disabled={savingMediaText} style={{ alignSelf: 'flex-end', border: 'none', borderRadius: 10, background: C.primary, color: 'hsl(var(--primary-foreground))', padding: '8px 14px', fontSize: '0.76rem', fontWeight: 700, cursor: savingMediaText ? 'wait' : 'pointer' }}>
                {savingMediaText ? 'جارٍ الحفظ...' : 'نشر النص'}
              </button>
            </div>
          )}
          {/* نص البوست يظهر دائماً إن وُجد */}
          {!!post.text && (
            <div style={{ background: 'transparent', border: 'none', borderRadius: 0, padding: '16px 16px', margin: '14px 14px 0' }}>
              <PostText text={post.text} color="hsl(var(--primary))" textColor={C.text} />
            </div>
          )}

          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            margin: '12px 14px 0', padding: '10px 14px',
            border: `1px solid ${C.postBorder}`, borderRadius: 14,
            background: 'hsl(var(--muted))',
          }}>
            <motion.button whileTap={{ scale: 0.88 }} onClick={() => onToggleLike(post)} style={{
              display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer',
              color: post.likedByMe ? '#ef4444' : C.textDim,
            }}>
              <Heart size={17} strokeWidth={2} fill={post.likedByMe ? '#ef4444' : 'none'} />
              <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>{post.likesCount > 0 ? post.likesCount : 'إعجاب'}</span>
            </motion.button>
          </div>

          <div style={{ padding: '14px 14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ color: C.textDim, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '4px 0' }}>
              الردود {comments.length > 0 ? `(${comments.length})` : ''}
            </p>
            {comments.length === 0 && (
              <p style={{ color: C.textDim, fontSize: '0.78rem', textAlign: 'center', padding: '24px 0' }}>
                لا توجد ردود بعد — كن أول من يعلّق
              </p>
            )}
              {comments.map(c => (
                <div key={c.id} style={{ display: 'flex', gap: 8, marginLeft: c.parentCommentId ? 22 : 0 }}>
                  <UserAvatar name={c.authorName} avatarUrl={c.authorAvatarUrl} size={30} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: C.text, fontSize: '0.76rem', fontWeight: 700, margin: 0 }}>{c.authorName}</p>
                    <p style={{ color: C.text, fontSize: '0.8rem', margin: '2px 0 0', lineHeight: 1.5, wordBreak: 'break-word' }}>{c.text}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                      <time dateTime={c.createdAt} style={{ color: C.textDim, fontSize: '0.62rem' }}>{formatCommentDate(c.createdAt)}</time>
                      <button onClick={() => setReplyingTo(c)} style={{ background: 'none', border: 'none', padding: 0, color: C.primary, cursor: 'pointer', fontSize: '0.66rem', fontWeight: 700 }}>رد</button>
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
          borderTop: `1px solid ${C.navBorder}`,
          background: C.headerBg, backdropFilter: 'blur(14px)',
        }}>
          {replyingTo && (
            <div style={{ position: 'absolute', bottom: 58, left: 14, right: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 10, background: C.inputBg, border: `1px solid ${C.primaryBorder}` }}>
              <span style={{ color: C.textDim, fontSize: '0.68rem' }}>رد على {replyingTo.authorName}</span>
              <button onClick={() => setReplyingTo(null)} aria-label="إلغاء الرد" style={{ background: 'none', border: 'none', color: C.textDim, cursor: 'pointer', padding: 0 }}><X size={14} /></button>
            </div>
          )}
          <input
            value={commentText}
            onChange={e => onChangeCommentText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !commentSending) submitWithReply(); }}
            placeholder="اكتب ردّاً على هذا المنشور..."
            style={hasMedia ? {
              flex: 1, background: C.inputBg, border: `1px solid ${C.primaryBorder}`,
              borderRadius: 20, padding: '10px 14px', color: C.text, fontSize: '0.82rem', outline: 'none',
            } : {
              flex: 1, background: C.headerBg, border: 'none', boxShadow: 'none',
              borderRadius: 0, padding: '14px 14px', color: C.text, fontSize: '0.82rem',
              outline: 'none', WebkitAppearance: 'none', appearance: 'none',
            }}
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            disabled={commentSending || !commentText.trim()}
            onClick={submitWithReply}
            style={hasMedia ? {
              width: 38, height: 38, borderRadius: '50%',
              background: commentText.trim() ? C.primary : C.primaryFaint,
              border: 'none', color: commentText.trim() ? '#06171a' : C.textDim,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            } : {
              width: 52, height: 52, borderRadius: 0,
              background: C.headerBg,
              border: 'none', borderInlineStart: `1px solid ${C.navBorder}`,
              color: commentText.trim() ? C.primary : C.textDim,
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

              <motion.button whileTap={{ scale: 0.96 }} onClick={() => { const m = memberMenuFor; setMemberMenuFor(null); void toggleMuteMember(m); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'transparent', border: 'none', borderRadius: 9, color: C.text, fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', width: '100%', textAlign: 'right', justifyContent: 'flex-end' }}>
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
                <p style={{ color: C.text, fontSize: '0.88rem', fontWeight: 700, margin: 0 }}>حذف {confirmDeleteMember.username ? `@${confirmDeleteMember.username}` : confirmDeleteMember.name ?? 'المستخدم'}</p>
              </div>
              <p style={{ color: C.textDim, fontSize: '0.8rem', lineHeight: 1.5, textAlign: 'center', margin: 0 }}>
                سيتم حذفه من قائمة إضافاتك بشكل نهائي. لا يمكن التراجع عن هذا الإجراء.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => setConfirmDeleteMember(null)} disabled={memberActionBusy} style={{ flex: 1, padding: '10px', background: C.primaryFaint, border: `1px solid ${C.primaryBorder}`, borderRadius: 10, color: C.text, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
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
                <p style={{ color: C.text, fontSize: '0.88rem', fontWeight: 700, margin: 0 }}>{confirmBlockMember.name ?? confirmBlockMember.username ?? '—'}</p>
                {confirmBlockMember.username && <p style={{ color: C.textDim, fontSize: '0.72rem', margin: 0 }}>@{confirmBlockMember.username}</p>}
              </div>
              <p style={{ color: C.textDim, fontSize: '0.8rem', lineHeight: 1.5, textAlign: 'center', margin: 0 }}>
                هل تريد حظر هذا المستخدم؟ لن يتمكن من إيجاد يوزرك حتى لو بحث عنه، ويُزال من قائمة أصدقائك، إلى أن ترفع الحظر بنفسك.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => setConfirmBlockMember(null)} disabled={memberActionBusy} style={{ flex: 1, padding: '10px', background: C.primaryFaint, border: `1px solid ${C.primaryBorder}`, borderRadius: 10, color: C.text, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
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
  initialSection = 'favorites',
  storyOnly = false,
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
  initialSection?: SharedInboxSection;
  /** عند true: قسم تعليقات القصص فقط بدون المفضلة */
  storyOnly?: boolean;
}) {
  const [activeSection, setActiveSection] = useState<SharedInboxSection>(storyOnly ? 'story' : initialSection);
  const formatDate = (value: string) => new Intl.DateTimeFormat('ar-KW', {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value));

  const storyUnread = storyThreads.filter(t => !t.read).length;
  const tiles: { key: Exclude<SharedInboxSection, 'grid'>; label: string; caption: string; Icon: typeof Camera; count: number; unread: number }[] = [
    { key: 'story', label: 'Story', caption: 'تعليقات على قصتك', Icon: Camera, count: storyThreads.length, unread: storyUnread },
    ...(!storyOnly ? [{ key: 'favorites' as const, label: 'Favorites', caption: 'منشورات ثبّتها', Icon: Bookmark, count: favoritedPosts.length, unread: 0 }] : []),
  ];
  const activeTile = tiles.find(t => t.key === activeSection) ?? null;

  const EmptyState = ({ icon, text }: { icon: React.ReactNode; text: string }) => (
    <div className="flex flex-col items-center justify-center gap-3" style={{ paddingTop: 40, paddingBottom: 8 }}>
      <div style={{
        width: 52, height: 52, borderRadius: '50%',
        background: C.primaryFaint, border: `1px solid ${C.primaryBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.primaryDim,
      }}>
        {icon}
      </div>
      <p style={{ color: C.textDim, fontSize: '0.82rem', textAlign: 'center', maxWidth: 220, lineHeight: 1.6 }}>
        {text}
      </p>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 10295,
        background: C.bg,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '40px 14px 12px',
        borderBottom: `1px solid ${C.navBorder}`,
        background: C.headerBg, backdropFilter: 'blur(14px)',
      }}>
        <button onClick={onClose} aria-label="إغلاق" style={{
          background: 'none', border: 'none', color: C.text, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4,
        }}>
          <X size={20} strokeWidth={2.2} />
        </button>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          {activeTile && <activeTile.Icon size={16} strokeWidth={2.2} color={C.primary} />}
          <p style={{ color: C.text, fontSize: '0.9rem', fontWeight: 700, margin: 0 }}>
            {activeTile?.label}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${C.navBorder}`, background: C.headerBg }}>
        {tiles.map(tile => (
          <button
            key={tile.key}
            onClick={() => setActiveSection(tile.key)}
            style={{
              position: 'relative', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '9px 8px', borderRadius: 10, cursor: 'pointer',
              border: `1px solid ${activeSection === tile.key ? C.primary : C.cardBorder}`,
              background: activeSection === tile.key ? C.primaryFaint : C.cardBg,
              color: activeSection === tile.key ? C.primary : C.textDim, fontSize: '0.76rem', fontWeight: 700,
            }}
          >
            <tile.Icon size={15} strokeWidth={2} />
            {tile.label}
            {tile.unread > 0 && (
              <span style={{ minWidth: 16, height: 16, borderRadius: 8, padding: '0 4px', background: C.primary, color: '#06171a', fontSize: '0.58rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
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
            <p style={{ color: C.textDim, fontSize: '0.78rem', textAlign: 'center', padding: '24px 0' }}>جارٍ التحميل...</p>
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
                border: `2px solid ${thread.read ? C.postBorder : 'hsl(var(--destructive))'}`,
                background: thread.read ? 'hsl(var(--muted))' : 'hsl(var(--destructive))',
                color: thread.read ? C.text : 'hsl(var(--destructive-foreground))',
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

                  <span style={{ color: C.textDim, fontSize: '0.64rem', fontWeight: 500, marginInlineStart: 7 }}>
                    {formatDate(thread.createdAt)}
                  </span>
                </p>
                <p style={{
                  color: thread.read ? C.textDim : 'hsl(var(--destructive-foreground))', fontSize: '0.74rem', margin: '3px 0 0',
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
            <p style={{ color: C.textDim, fontSize: '0.66rem', textAlign: 'center', margin: '10px 0 0', lineHeight: 1.6 }}>
              تختفي التعليقات تلقائياً بعد 24 ساعة من نشر القصة
            </p>
          )}
        </div>
      )}

      {/* ── Repost: comments on your posts — retained for compatibility, not shown in the two-section inbox. ── */}
      {false && (
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', padding: '14px 14px 20px' }}>
          {postThreadsLoading && postThreads.length === 0 && (
            <p style={{ color: C.textDim, fontSize: '0.78rem', textAlign: 'center', padding: '24px 0' }}>جارٍ التحميل...</p>
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
                  border: `2px solid ${thread.read ? C.postBorder : C.primary}`,
                  background: thread.read ? 'hsl(var(--muted))' : C.primaryFaint,
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
                    <span style={{ color: C.textDim, fontSize: '0.64rem', fontWeight: 500, marginInlineStart: 7 }}>
                      {formatDate(thread.post.createdAt)}
                    </span>
                  </p>
                  <p style={{
                    color: C.textDim, fontSize: '0.74rem', margin: '3px 0 0',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {thread.lastComment ? `${thread.lastComment.authorName}: ${thread.lastComment.text}` : `${thread.commentsCount} تعليق`}
                  </p>
                </div>
                {!thread.read && (
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: C.primary, flexShrink: 0 }} />
                )}
              </motion.button>
            );
          })}
          {postInteractions.filter(item => item.type === 'repost').map(item => (
            <div key={`repost-${item.id}`} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, border: `2px solid ${item.read ? C.postBorder : C.primary}`, background: item.read ? 'hsl(var(--muted))' : C.primaryFaint, borderRadius: 14, padding: 10, marginBottom: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, display: 'grid', placeItems: 'center', flexShrink: 0, background: 'hsl(var(--muted))', color: 'hsl(var(--primary))' }}><Repeat2 size={19} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: 'hsl(var(--foreground))', fontSize: '0.8rem', fontWeight: 700, margin: 0 }}>{item.title}<span style={{ color: C.textDim, fontSize: '0.64rem', fontWeight: 500, marginInlineStart: 7 }}>{formatDate(item.createdAt)}</span></p>
                <p style={{ color: C.textDim, fontSize: '0.74rem', margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.body}</p>
              </div>
              {!item.read && <span style={{ width: 9, height: 9, borderRadius: '50%', background: C.primary, flexShrink: 0 }} />}
            </div>
          ))}
          {(postThreads.length > 0 || postInteractions.some(item => item.type === 'repost')) && (
            <p style={{ color: C.textDim, fontSize: '0.66rem', textAlign: 'center', margin: '10px 0 0', lineHeight: 1.6 }}>
              تختفي التعليقات تلقائياً بعد 24 ساعة من نشر المنشور
            </p>
          )}
        </div>
      )}

      {/* ── Share: retained for compatibility, not shown in the two-section inbox. ── */}
      {false && (
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', padding: '14px 14px 20px' }}>
          {loading && shares.length === 0 && (
            <p style={{ color: C.textDim, fontSize: '0.78rem', textAlign: 'center', padding: '24px 0' }}>جارٍ التحميل...</p>
          )}
          {!loading && shares.length === 0 && postInteractions.filter(item => item.type === 'share').length === 0 && (
            <EmptyState icon={<Inbox size={20} strokeWidth={1.5} />} text="لا توجد منشورات مُرسلة إليك بعد" />
          )}
          {postInteractions.filter(item => item.type === 'share').map(item => (
            <div key={`share-${item.id}`} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, border: `2px solid ${item.read ? C.postBorder : C.primary}`, background: item.read ? 'hsl(var(--muted))' : C.primaryFaint, borderRadius: 14, padding: 10, marginBottom: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, display: 'grid', placeItems: 'center', flexShrink: 0, background: 'hsl(var(--muted))', color: 'hsl(var(--primary))' }}><Send size={19} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: 'hsl(var(--foreground))', fontSize: '0.8rem', fontWeight: 700, margin: 0 }}>{item.title}<span style={{ color: C.textDim, fontSize: '0.64rem', fontWeight: 500, marginInlineStart: 7 }}>{formatDate(item.createdAt)}</span></p>
                <p style={{ color: C.textDim, fontSize: '0.74rem', margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.body}</p>
              </div>
              {!item.read && <span style={{ width: 9, height: 9, borderRadius: '50%', background: C.primary, flexShrink: 0 }} />}
            </div>
          ))}
          {shares.map(share => (
            <motion.button
              key={share.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => onOpenShare(share)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                border: `2px solid ${share.read ? C.postBorder : C.primary}`,
                background: share.read ? 'hsl(var(--muted))' : C.primaryFaint,
                borderRadius: 14, padding: 10, marginBottom: 10, cursor: 'pointer', textAlign: 'right',
              }}
            >
              <UserAvatar name={share.senderName} avatarUrl={share.senderAvatarUrl} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: 'hsl(var(--foreground))', fontSize: '0.8rem', fontWeight: 700, margin: 0 }}>
                  {share.senderName || share.senderUsername || '—'}
                  <span style={{ color: C.textDim, fontSize: '0.64rem', fontWeight: 500, marginInlineStart: 7 }}>
                    {formatDate(share.createdAt)}
                  </span>
                </p>
                <p style={{
                  color: C.textDim, fontSize: '0.74rem', margin: '3px 0 0',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {share.post.text || (share.post.mediaType === 'video' ? 'أرسل لك مقطع فيديو' : share.post.mediaType === 'image' ? 'أرسل لك صورة' : 'أرسل لك منشوراً')}
                </p>
              </div>
              {!share.read && (
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: C.primary, flexShrink: 0 }} />
              )}
            </motion.button>
          ))}
        </div>
      )}

      {/* ── Favorites: posts pinned via the ⭐ icon — full page, own scroll (this is the
          section that used to be unreachable once the list above it grew long) ── */}
      {activeSection === 'favorites' && (
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
                  border: `2px solid ${C.postBorder}`,
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
                  <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: C.primaryFaint, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.primary }}>
                    <FileText size={17} strokeWidth={2} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: 'hsl(var(--foreground))', fontSize: '0.8rem', fontWeight: 700, margin: 0 }}>
                    {post.authorName || post.authorUsername || '—'}
                    <span style={{ color: C.textDim, fontSize: '0.64rem', fontWeight: 500, marginInlineStart: 7 }}>
                      {formatDate(post.createdAt)}
                    </span>
                  </p>
                  <p style={{
                    color: C.textDim, fontSize: '0.74rem', margin: '3px 0 0',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {post.text || (media?.type === 'video' ? 'فيديو' : media ? 'صورة' : '')}
                  </p>
                </div>
                <Bookmark size={15} strokeWidth={2} color={C.primary} fill={C.primary} style={{ flexShrink: 0 }} />
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
        background: C.bg,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '40px 14px 12px',
        borderBottom: `1px solid ${C.navBorder}`,
        background: C.headerBg, backdropFilter: 'blur(14px)',
      }}>
        <button onClick={onClose} aria-label="رجوع" style={{
          background: 'none', border: 'none', color: C.text, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4,
        }}>
          <ArrowLeft size={20} strokeWidth={2.2} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: C.text, fontSize: '0.86rem', fontWeight: 700, margin: 0 }}>منشور مُرسل</p>
          <p style={{ color: C.textDim, fontSize: '0.68rem', margin: 0 }}>مع {share.senderName || share.senderUsername || '—'}</p>
        </div>
      </div>
      {/* Scrollable content: the post itself + the private thread with the sender */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div style={{
          border: `2px solid ${C.postBorder}`,
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
              <PostText text={post.text} color="hsl(var(--primary))" textColor={C.textDim} />
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
                      border: `1px solid ${C.postBorder}`, background: '#000', display: 'block',
                    }}
                  />)
                ) : (
                  <motion.button key={`${media.type}-${index}`} whileTap={{ scale: 0.97 }} onClick={() => setExpanded(true)} aria-label="تكبير الوسائط" style={{
                    position: 'relative', width: 160, height: 160, borderRadius: 10, overflow: 'hidden',
                    border: `1px solid ${C.postBorder}`, padding: 0, background: '#000', cursor: 'pointer', display: 'block',
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
              color: post.likedByMe ? '#ef4444' : C.textDim,
            }}>
              <Heart size={16} strokeWidth={2} fill={post.likedByMe ? '#ef4444' : 'none'} />
              <span style={{ fontSize: '0.7rem', fontWeight: 600 }}>{post.likesCount > 0 ? post.likesCount : ''}</span>
            </motion.button>
          </div>
        </div>

        {/* Private reply thread — only between me and the sender */}
        <div style={{ padding: '10px 14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ color: C.textDim, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '4px 0' }}>
            المحادثة مع {share.senderName || share.senderUsername || '—'} {comments.length > 0 ? `(${comments.length})` : ''}
          </p>
          {comments.length === 0 && (
            <p style={{ color: C.textDim, fontSize: '0.78rem', textAlign: 'center', padding: '24px 0' }}>
              لا توجد ردود بعد — علّق على المنشور المُرسل إليك
            </p>
          )}
          {comments.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 8, marginLeft: c.parentCommentId ? 22 : 0 }}>
              <UserAvatar name={c.authorName} avatarUrl={c.authorAvatarUrl} size={30} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: C.text, fontSize: '0.76rem', fontWeight: 700, margin: 0 }}>{c.authorName}</p>
                <p style={{ color: C.text, fontSize: '0.8rem', margin: '2px 0 0', lineHeight: 1.5, wordBreak: 'break-word' }}>{c.text}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                  <time dateTime={c.createdAt} style={{ color: C.textDim, fontSize: '0.62rem' }}>{formatCommentDate(c.createdAt)}</time>
                  <button onClick={() => setReplyingTo(c)} style={{ background: 'none', border: 'none', padding: 0, color: C.primary, cursor: 'pointer', fontSize: '0.66rem', fontWeight: 700 }}>رد</button>
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
        borderTop: `1px solid ${C.navBorder}`,
        background: C.headerBg, backdropFilter: 'blur(14px)',
        position: 'relative',
      }}>
        {replyingTo && (
          <div style={{ position: 'absolute', bottom: 58, left: 14, right: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 10, background: C.inputBg, border: `1px solid ${C.primaryBorder}` }}>
            <span style={{ color: C.textDim, fontSize: '0.68rem' }}>رد على {replyingTo.authorName}</span>
            <button onClick={() => setReplyingTo(null)} aria-label="إلغاء الرد" style={{ background: 'none', border: 'none', color: C.textDim, cursor: 'pointer', padding: 0 }}><X size={14} /></button>
          </div>
        )}
        <input
          value={commentText}
          onChange={e => onChangeCommentText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !commentSending) submitWithReply(); }}
          placeholder="اكتب ردّاً..."
          style={{
            flex: 1, background: C.inputBg, border: `1px solid ${C.primaryBorder}`,
            borderRadius: 20, padding: '10px 14px', color: C.text, fontSize: '0.82rem', outline: 'none',
          }}
        />
        <motion.button
          whileTap={{ scale: 0.9 }}
          disabled={commentSending || !commentText.trim()}
          onClick={submitWithReply}
          style={{
            width: 38, height: 38, borderRadius: '50%',
            background: commentText.trim() ? C.primary : C.primaryFaint,
            border: 'none', color: commentText.trim() ? '#06171a' : C.textDim,
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
        background: C.bg,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '40px 14px 12px',
        borderBottom: `1px solid ${C.navBorder}`,
        background: C.headerBg, backdropFilter: 'blur(14px)',
      }}>
        <button onClick={onClose} aria-label="رجوع" style={{
          background: 'none', border: 'none', color: C.text, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4,
        }}>
          <ArrowLeft size={20} strokeWidth={2.2} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: C.text, fontSize: '0.86rem', fontWeight: 700, margin: 0 }}>تعليقات على قصتك</p>
          <p style={{ color: C.textDim, fontSize: '0.66rem', margin: '2px 0 0' }}>تختفي هذه المحادثة في {expiresLabel}</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
        {/* Story preview */}
        <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ position: 'relative', alignSelf: 'flex-start', width: 130, height: 130, borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.postBorder}`, background: '#000' }}>
            {thread.mediaType === 'video' ? (
              <video src={thread.mediaUrl} muted controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <img src={thread.mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
          </div>
        </div>

        {/* Comments */}
        <div style={{ padding: '0 14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ color: C.textDim, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '4px 0' }}>
            التعليقات {comments.length > 0 ? `(${comments.length})` : ''}
          </p>
          {comments.length === 0 && (
            <p style={{ color: C.textDim, fontSize: '0.78rem', textAlign: 'center', padding: '24px 0' }}>
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
                <p style={{ color: C.text, fontSize: '0.76rem', fontWeight: 700, margin: 0 }}>{c.authorName}</p>
                <p style={{ color: C.text, fontSize: '0.8rem', margin: '2px 0 0', lineHeight: 1.5, wordBreak: 'break-word' }}>{c.text}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 }} onClick={e => e.stopPropagation()}>
                  <time dateTime={c.createdAt} style={{ color: C.textDim, fontSize: '0.62rem' }}>{formatCommentDate(c.createdAt)}</time>
                  <button onClick={() => setReplyingTo(c)} style={{ background: 'none', border: 'none', padding: 0, color: C.primary, cursor: 'pointer', fontSize: '0.66rem', fontWeight: 700 }}>رد</button>
                  <motion.button whileTap={{ scale: 0.88 }} onClick={() => onToggleLike(c)} style={{
                    display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    color: c.likedByMe ? '#ef4444' : C.textDim,
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
                        color: C.primary, cursor: 'pointer', fontSize: '0.66rem', fontWeight: 700,
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
        borderTop: `1px solid ${C.navBorder}`,
        background: C.headerBg, backdropFilter: 'blur(14px)',
        position: 'relative',
      }}>
        {replyingTo && (
          <div style={{ position: 'absolute', bottom: 58, left: 14, right: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 10, background: C.inputBg, border: `1px solid ${C.primaryBorder}` }}>
            <span style={{ color: C.textDim, fontSize: '0.68rem' }}>رد على {replyingTo.authorName}</span>
            <button onClick={() => setReplyingTo(null)} aria-label="إلغاء الرد" style={{ background: 'none', border: 'none', color: C.textDim, cursor: 'pointer', padding: 0 }}><X size={14} /></button>
          </div>
        )}
        <input
          value={commentText}
          onChange={e => onChangeCommentText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !commentSending) submitWithReply(); }}
          placeholder="اكتب ردّاً..."
          style={{
            flex: 1, background: C.inputBg, border: `1px solid ${C.primaryBorder}`,
            borderRadius: 20, padding: '10px 14px', color: C.text, fontSize: '0.82rem', outline: 'none',
          }}
        />
        <motion.button
          whileTap={{ scale: 0.9 }}
          disabled={commentSending || !commentText.trim()}
          onClick={submitWithReply}
          style={{
            width: 38, height: 38, borderRadius: '50%',
            background: commentText.trim() ? C.primary : C.primaryFaint,
            border: 'none', color: commentText.trim() ? '#06171a' : C.textDim,
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
  // 4-option menu opened from the "+" badge on my story avatar: نشر للقصة / نشر صورة / نشر فيديو / نشر القصة عبر الكاميرا
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
  function openStoryPicker(kind: 'image' | 'video', target: 'main' | 'add') {
  useEffect(() => {
    const openStoryCamera = () => {
      setPublishMenuOpen(false);
      setStoryPickerOpen(null);
      setCameraCaptureOpen(true);
    };
    window.addEventListener('stooorna:open-story-camera', openStoryCamera);
    return () => window.removeEventListener('stooorna:open-story-camera', openStoryCamera);
  }, []);
    const ref = target === 'main' ? storyFileRef : storyAddFileRef;
    if (ref.current) ref.current.accept = kind === 'image' ? 'image/*' : 'video/*';
    ref.current?.click();
    setStoryPickerOpen(null);
  }

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
    setStoryUploading(true);
    try {
      await fetch('/api/status', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': file.type, 'X-File-Ext': `.${file.name.split('.').pop() ?? 'jpg'}` },
        body: file,
      });
      await fetchStories();
    } catch {/* silent */} finally {
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
  const [composerDestination, setComposerDestination] = useState<'text' | 'photos' | 'videos'>('text');
  const [composerDestinationNotice] = useState('');
  const [composerText, setComposerText] = useState('');
  const [composerMediaFiles, setComposerMediaFiles] = useState<{ file: File; type: 'image' | 'video'; preview: string }[]>([]);
  const [composerPosting, setComposerPosting] = useState(false);
  const [composerError, setComposerError] = useState('');
  const postImageRef = useRef<HTMLInputElement>(null);
  const postVideoRef = useRef<HTMLInputElement>(null);
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
  const [postComments, setPostComments] = useState<Record<number, PostComment[]>>({});
  const [commentText, setCommentText] = useState('');
  const [commentSending, setCommentSending] = useState(false);
  const [confirmDeletePost, setConfirmDeletePost] = useState<PostItem | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<number | null>(null);
  const [hashtagView, setHashtagView] = useState<{ tag: string; posts: PostItem[] } | null>(null);
  const [sharePost, setSharePost] = useState<PostItem | null>(null);

  // إخفاء شريط التنقل السفلي (العام) أثناء فتح شيت "إرسال المنشور"، ورجوعه تلقائيًا عند الإغلاق
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('stooorna:share-sheet-state', { detail: { open: !!sharePost } }));
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
  const sharedInboxUnreadCount = sharedInbox.filter(s => !s.read).length;
  const postInteractionsUnreadCount = postInteractions.filter(item => !item.read).length;
  const knownShareIdsRef = useRef<Set<number> | null>(null);

  // ── Story-comment inbox — comments friends left on my stories (section 2 of the FEED-row box) ──
  const [storyCommentThreads, setStoryCommentThreads] = useState<StoryCommentThread[]>([]);
  const [storyCommentThreadsLoading, setStoryCommentThreadsLoading] = useState(false);
  const [openStoryCommentThread, setOpenStoryCommentThread] = useState<StoryCommentThread | null>(null);
  const [storyThreadComments, setStoryThreadComments] = useState<Record<number, StoryComment[]>>({});
  const [storyThreadCommentText, setStoryThreadCommentText] = useState('');
  const [storyThreadCommentSending, setStoryThreadCommentSending] = useState(false);
  const storyCommentThreadsUnreadCount = storyCommentThreads.filter(t => !t.read).length;
  const knownStoryThreadIdsRef = useRef<Set<number> | null>(null);

  // ── Post-comment inbox — comments friends left on my video/photo posts (section 2 of the
  //    inbox box, right under the story-comment threads, same 24h auto-expiry) ──
  const [postCommentThreads, setPostCommentThreads] = useState<PostCommentThread[]>([]);
  const [postCommentThreadsLoading, setPostCommentThreadsLoading] = useState(false);
  const postCommentThreadsUnreadCount = postCommentThreads.filter(t => !t.read).length;
  const knownPostThreadIdsRef = useRef<Set<number> | null>(null);

  const totalInboxUnreadCount = sharedInboxUnreadCount + storyCommentThreadsUnreadCount + postCommentThreadsUnreadCount + postInteractionsUnreadCount;

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
      const r = await fetch('/api/posts?audience=text', { credentials: 'include' });
      if (!r.ok) return;
      const data = await r.json() as { posts: PostItem[] };
      setPosts(data.posts ?? []);
    } catch {/* silent — feed simply stays empty/local */}
  }, []);
  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  // ── My media posts (video/photo) — recorded via the camera and now shown in my profile's
  //    Post grid instead of the old ephemeral home feed. Own posts only, media ones only. ──
  const [myMediaPosts, setMyMediaPosts] = useState<PostItem[]>([]);
  const fetchMyMediaPosts = useCallback(async () => {
    if (!user) return;
    try {
      const r = await fetch('/api/posts', { credentials: 'include' });
      if (!r.ok) return;
      const data = await r.json() as { posts: PostItem[] };
      const mine = (data.posts ?? []).filter(p =>
        String(p.authorId) === String(user.id) && (p.mediaType === 'image' || p.mediaType === 'video')
      );
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
  const myVideoPosts = useMemo(() => myMediaPosts.filter(p => getPostThumbType(p) === 'video'), [myMediaPosts]);
  const myPhotoPosts = useMemo(() => myMediaPosts.filter(p => getPostThumbType(p) === 'image'), [myMediaPosts]);

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
        const r = await fetch('/api/posts?audience=text', { credentials: 'include' });
        if (!r.ok) return;
        const data = await r.json() as { posts: PostItem[] };
        const fresh = data.posts ?? [];
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
    if (pendingNewPostsRef.current.length) setPosts(pendingNewPostsRef.current);
    setNewPostsAvailable(0);
    newPostsSoundPlayedRef.current = false;
  }

  function pickPostMedia(file: File, type: 'image' | 'video') {
    const url = URL.createObjectURL(file);
    setComposerMediaFiles(prev => [...prev, { file, type, preview: url }]);
  }


  function removePostMediaAt(index: number) {
    setComposerMediaFiles(prev => {
      const item = prev[index];
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter((_, itemIndex) => itemIndex !== index);
    });
  }

  function clearPostMedia() {
    composerMediaFiles.forEach(item => URL.revokeObjectURL(item.preview));
    setComposerMediaFiles([]);
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
      const uploadRes = await fetch('/api/posts/media', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': file.type, 'X-File-Ext': `.${file.name.split('.').pop() ?? (type === 'video' ? 'mp4' : 'jpg')}` },
        body: file,
      });
      if (!uploadRes.ok) throw new Error('Failed to upload media');
      const uploadData = await uploadRes.json();
      const url: string | undefined = uploadData?.url;
      if (!url) throw new Error('Upload did not return a URL');
      const r = await fetch('/api/posts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '', mediaUrl: url, mediaType: type, mediaUrls: [url], mediaTypes: [type], hashtags: [], audience: 'public', destination: type === 'video' ? 'videos' : 'photos' }),
      });
      if (!r.ok) throw new Error('Failed to publish post');
      const d = await r.json();
      if (!d?.post?.id) throw new Error('Post was not saved');
      const saved: PostItem = d.post;
      setPosts(prev => [saved, ...prev]);
      setMyMediaPosts(prev => [saved, ...prev]);
      playNewPostSound();
    } catch (error) {
      console.error('[Quick media publish]', error);
      setQuickPublishError(type === 'video' ? 'تعذر نشر الفيديو — حاول مرة ثانية' : 'تعذر نشر الصورة — حاول مرة ثانية');
    } finally {
      setQuickPublishing(false);
    }
  }

  async function submitPost(destination: 'text' | 'photos' | 'videos' = composerDestination === 'text' ? 'text' : (composerMediaFiles[0]?.type === 'video' ? 'videos' : 'photos')) {
    const trimmed = composerText.trim();
    if (destination === 'text' && !trimmed) {
      setComposerError('أضف نصاً قبل نشر صورة أو فيديو في قسم الكتابة');
      return;
    }
    if (destination !== 'text' && composerMediaFiles.length === 0) {
      setComposerError('اختر صورة أو فيديو للنشر');
      return;
    }
    setComposerPosting(true);
    setComposerError('');
    try {
      const hashtags = Array.from(trimmed.matchAll(/#([\p{L}\p{N}_]+)/gu)).map(m => m[1]);
      const uploadedMedia: { url: string; type: 'image' | 'video' }[] = [];

      for (const item of composerMediaFiles) {
        try {
          const r = await fetch('/api/posts/media', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': item.file.type, 'X-File-Ext': `.${item.file.name.split('.').pop() ?? (item.type === 'video' ? 'mp4' : 'jpg')}` },
            body: item.file,
          });
          if (r.ok) {
            const d = await r.json();
            if (d.url) uploadedMedia.push({ url: d.url, type: item.type });
          }
        } catch {/* fall back to no uploaded item */}
      }

      try {
        const mediaUrls = uploadedMedia.map(item => item.url);
        const mediaTypes = uploadedMedia.map(item => item.type);
        const mediaUrl = mediaUrls[0] ?? null;
        const mediaType = mediaTypes[0] ?? null;
        const r = await fetch('/api/posts', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: trimmed, mediaUrl, mediaType, mediaUrls, mediaTypes, hashtags, audience: destination === 'text' ? 'text' : 'public', destination }),
        });
        if (!r.ok) {
          const failure = await r.json().catch(() => ({})) as { error?: string };
          throw new Error(failure.error || 'Failed to publish post');
        }
        const d = await r.json();
        if (!d?.post?.id) throw new Error('Post was not saved');
        const saved: PostItem = d.post;
        if (destination === 'text') setPosts(prev => [saved, ...prev]);
        else setMyMediaPosts(prev => [saved, ...prev]);
        playNewPostSound();
        if (!mediaUrl) playNotificationSound();
        setComposerText('');
        clearPostMedia();
        setShowComposer(false);
      } catch (error) {
        console.error('[Text post publish]', error);
        setComposerError('تعذر نشر المنشور — حاول مرة ثانية');
      }
    } finally {
      setComposerPosting(false);
    }
  }

  async function toggleLike(post: PostItem) {
    if (guestGuard()) return;
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

  async function sendPostShare() {
    if (guestGuard()) return;
    if (!sharePost || !shareRecipients.length) return;
    setSharingPost(true);
    setShareError('');
    try {
      const response = await fetch(`/api/posts/${sharePost.id}/share`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientIds: shareRecipients }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? 'Failed to share');
      }
      setSharePost(null);
      setShareRecipients([]);
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

  // Keep the bottom navigation label in sync with the text-posts page.
  // لا نرسل open:false في cleanup هذا الـ effect — كان يسبب ثبات Home بدل ×
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('stooorna:text-posts-state', { detail: { open: textPostsPageOpen } }));
  }, [textPostsPageOpen]);
  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent('stooorna:text-posts-state', { detail: { open: false } }));
    };
  }, []);

  // فتح من الشريط السفلي (أيقونة البوست) بدون أخطاء تنقّل
  useEffect(() => {
    if (searchParams.get('openTextPosts') === '1') {
      setTextPostsPageOpen(true);
      textPostsOpenedFromUrl.current = true;
    }
    // ضغط مطوّل من الشريط السفلي → فتح بكس نشر بوست نصي
    // openTextComposer=1 (الرسمي) أو compose=1 (توافق قديم)
    if (searchParams.get('openTextComposer') === '1' || searchParams.get('compose') === '1') {
      setTextPostsPageOpen(true);
      setComposerDestination('text');
      setComposerError('');
      try { clearPostMedia(); } catch { /* */ }
      // تأخير بسيط حتى تُركَّب طبقة الصفحة ثم تفتح الشيت فوقها
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
      setTextPostsPageOpen(true);
      setTextPostsMenuOpen(false);
      setComposerDestination('text');
      setComposerError('');
      try { clearPostMedia(); } catch { /* */ }
      // ضمان فتح الشيت حتى لو وصلت الأحداث قبل اكتمال الرندر
      window.setTimeout(() => setShowComposer(true), 0);
      window.setTimeout(() => setShowComposer(true), 80);
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
  // Also auto-reopens when returning from the chat page's back button after chatting
  // from a friend's profile (see FriendStoryProfile's chat button), via the
  // ?openProfile=<id> marker (+ name/username/avatar) left in the URL before
  // navigating to /chat — mirrors the ?openTextPosts=1 pattern above.
  const [viewingProfile, setViewingProfile] = useState<{
    id: string; name: string | null; username: string | null; avatarUrl: string | null;
  } | null>(() => {
    const openProfileId = searchParams.get('openProfile');
    if (!openProfileId) return null;
    return {
      id: openProfileId,
      name: searchParams.get('openProfileName') || null,
      username: searchParams.get('openProfileUsername') || null,
      avatarUrl: searchParams.get('openProfileAvatar') || null,
    };
  });
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
      background: C.bg,
      fontFamily: 'var(--font-sans)'
    }}>

        {!isFriendManagement && <>
        {/* ── Header ── */}
        <div className="sticky top-0 z-20" style={{
          position: 'relative',
          paddingTop: 40,
          background: C.headerBg,
          backdropFilter: 'blur(14px)',
          borderBottom: `1px solid ${C.navBorder}`,
        }}>
          {/* ── Top hamburger menu — aligned with the username/bio line, and now hides along
              with everything else when the header collapses (fades out + becomes
              non-interactive, matching the fog overlay's own transition). Opens a
              small menu with Music and the Posts-box (shared inbox), keeping those two features
              tucked away instead of taking their own row. ── */}
          {/* قائمة الثلاث خطوط أُزيلت بالكامل من الهوم — الموسيقى في الإعدادات */}

          {/* ── Globe (search-friends) button — hidden for guests ── */}
          {user && (
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => {
              if (textPostsPageOpen) {
                setTextPostsPageOpen(false);
                setTextPostsMenuOpen(false);
              } else {
                textPostsOpenedFromUrl.current = false;
                setTextPostsPageOpen(true);
              }
            }}
            aria-label={textPostsPageOpen ? "Close text posts" : newPostsAvailable > 0 ? "New text posts available" : "Text posts"}
            style={{
              position: 'absolute', top: 84, right: 14, zIndex: 7,
              width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(255,255,255,0.05)',
              border: `1px solid ${!textPostsPageOpen && newPostsAvailable > 0 ? 'rgba(239,68,68,0.55)' : 'rgba(255,255,255,0.1)'}`,
              color: C.primary, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: headerOpen ? 1 : 0,
              pointerEvents: headerOpen ? 'auto' : 'none',
              transition: headerOpen
                ? 'opacity 240ms ease-out 200ms'
                : 'opacity 140ms ease-in',
            }}
          >
            <style>{`
              @keyframes stooornaTextPostSpin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}</style>
            <AnimatePresence mode="wait" initial={false}>
              {textPostsPageOpen ? (
                <motion.span
                  key="close-text-posts"
                  initial={{ opacity: 0, rotate: -90, scale: 0.65 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, rotate: 90, scale: 0.65 }}
                  transition={{ duration: 0.2 }}
                  style={{ display: 'flex' }}
                >
                  <X size={19} strokeWidth={2.1} />
                </motion.span>
              ) : (
                <motion.span
                  key="open-text-posts"
                  initial={{ opacity: 0, scale: 0.65 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.65 }}
                  transition={{ duration: 0.2 }}
                  style={{ display: 'flex', width: 18, height: 18 }}
                >
                  <span
                    aria-hidden
                    style={{
                      position: 'relative',
                      width: 18,
                      height: 18,
                      display: 'block',
                      animation: 'stooornaTextPostSpin 7s linear infinite',
                    }}
                  >
                    <span style={{
                      position: 'absolute', inset: 0, borderRadius: '50%',
                      border: `1.5px solid ${newPostsAvailable > 0 ? 'rgba(239,68,68,0.7)' : 'rgba(0,188,212,0.45)'}`,
                      boxSizing: 'border-box',
                    }} />
                    <span style={{
                      position: 'absolute',
                      inset: 3.2,
                      borderRadius: '50%',
                      background: newPostsAvailable > 0 ? '#ef4444' : 'rgba(0,188,212,0.28)',
                      boxShadow: newPostsAvailable > 0
                        ? '0 0 8px rgba(239,68,68,0.55)'
                        : '0 0 6px rgba(0,188,212,0.25)',
                      transition: 'background 0.25s, box-shadow 0.25s',
                    }} />
                    <span style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      width: 11,
                      height: 2,
                      marginLeft: -1.5,
                      marginTop: -1,
                      borderRadius: 2,
                      background: newPostsAvailable > 0 ? '#ffffff' : '#00BCD4',
                      transformOrigin: '1.5px 50%',
                      boxShadow: newPostsAvailable > 0
                        ? '0 0 4px rgba(255,255,255,0.7)'
                        : '0 0 4px rgba(0,188,212,0.6)',
                      transition: 'background 0.25s, box-shadow 0.25s',
                    }} />
                    <span style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      width: 4,
                      height: 4,
                      marginLeft: 7,
                      marginTop: -2,
                      borderRadius: '50%',
                      background: newPostsAvailable > 0 ? '#ffffff' : '#00BCD4',
                      boxShadow: newPostsAvailable > 0
                        ? '0 0 5px rgba(255,255,255,0.85)'
                        : '0 0 5px rgba(0,188,212,0.8)',
                      transition: 'background 0.25s, box-shadow 0.25s',
                    }} />
                  </span>
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
          )}


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
                            setStoryPickerOpen('main');
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
                      {/* + badge — its own button now: always opens the نشر للقصة/صورة/فيديو
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
                      <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#ffffff', lineHeight: 1.2 }}>
                        @{myUsername}
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

                <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: C.text }}>{myMediaPosts.length}</span>
                    <span style={{ fontSize: '0.65rem', color: C.textDim }}>Post</span>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.94 }}
                    onClick={() => setFollowersModalOpen(true)}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  >
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: C.text }}>{friends.length}</span>
                    <span style={{ fontSize: '0.65rem', color: C.textDim }}>Followers</span>
                  </motion.button>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: C.text }}>{myMediaRepostsTotal}</span>
                    <span style={{ fontSize: '0.65rem', color: C.textDim }}>Repost</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: C.text }}>{myMediaLikesTotal}</span>
                    <span style={{ fontSize: '0.65rem', color: C.textDim }}>Likes</span>
                  </div>
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
                {storyGroups.filter(g => g.userId !== user?.id).map((g) => {
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
                      <span style={{ fontSize: '0.55rem', color: C.textDim, maxWidth: 60, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                  background: C.primaryBorder,
                }}
              />
            </motion.button>
          </div>


          {/* ══ Content switcher — Videos | Photos. Lives in the sticky header, right
              below the grabber, so it never moves when the feed below is scrolled and stays
              visible even when the grabber collapses everything above it (music button,
              avatar/stats row, stories strip). Text posts moved to their own fullscreen
              page, opened via the pen icon next to the compose button. ══ */}
          {pageTab === 'profile' && (
            <div style={{ padding: '0 0 8px' }}>
              {/* direction: 'ltr' forces this row to read left→right regardless of the page's
                  own text direction, so the on-screen order is always exactly: Video - Photo */}
              <div style={{ display: 'flex', width: '100%', marginBottom: 8, borderRadius: 0, overflow: 'hidden', borderTop: `1px solid ${C.tabBorder}`, borderBottom: `1px solid ${C.tabBorder}`, direction: 'ltr' }}>
                {([
                  { id: 'videos' as const, label: 'Video', icon: <Video size={14} strokeWidth={2} /> },
                  { id: 'photos' as const, label: 'Photo', icon: <ImageIcon size={14} strokeWidth={2} /> },
                ]).map((tab, index) => (
                  <React.Fragment key={tab.id}>
                    {index > 0 && <div style={{ width: 1, background: C.tabBorder }} />}
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setProfileContentTab(tab.id)}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        padding: '9px 4px', border: 'none', cursor: 'pointer',
                        background: profileContentTab === tab.id ? C.tabActive : 'transparent',
                        color: profileContentTab === tab.id ? C.primary : C.textDim,
                        fontSize: '0.72rem', fontWeight: 700,
                      }}
                    >
                      {tab.icon}
                      {tab.label}
                    </motion.button>
                  </React.Fragment>
                ))}
              </div>
              <div style={{ height: 1, background: C.navBorder }} />
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


                {/* ── My Videos grid — video posts recorded via the camera. Three squares per row,
                {profileContentTab === 'text' && (
                  <div style={{ padding: '10px 12px 4px' }}>
                    <button
                      type="button"
                      onClick={() => setTextPostsPageOpen(true)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        padding: '16px 12px', borderRadius: 14, cursor: 'pointer',
                        border: `1px solid ${C.primaryBorder}`, background: C.primaryFaint, color: C.primary,
                        fontSize: '0.82rem', fontWeight: 700,
                      }}
                    >
                      <FileText size={18} strokeWidth={2} />
                      عرض منشورات الكتابة
                    </button>
                  </div>
                )}

                     same as Instagram's profile grid. Shown only on the "فيديوهات" tab. ── */}
                
                {profileContentTab === 'videos' && (myVideoPosts.length > 0 ? (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 2,
                    padding: '10px 2px 4px',
                  }}>
                    {myVideoPosts.map(post => {
                      const thumbUrl = post.mediaUrls && post.mediaUrls.length > 0 ? post.mediaUrls[0] : post.mediaUrl;
                      return (
                        <motion.button
                          key={post.id}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => openMediaPostDetail(post)}
                          style={{
                            position: 'relative',
                            width: '100%',
                            aspectRatio: '1 / 1',
                            padding: 0,
                            border: 'none',
                            background: '#000',
                            cursor: 'pointer',
                            overflow: 'hidden',
                          }}
                        >
                          <video src={thumbUrl ?? ''} muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          <div style={{ position: 'absolute', top: 6, insetInlineEnd: 6 }}>
                            <Play size={13} strokeWidth={2.4} color="#fff" fill="#fff" />
                          </div>
                          {(post.mediaUrls?.length ?? 0) > 1 && (
                            <div style={{ position: 'absolute', top: 6, insetInlineStart: 6 }}>
                              <Images size={13} strokeWidth={2.4} color="#fff" />
                            </div>
                          )}
                          <div style={{
                            position: 'absolute', bottom: 4, insetInlineStart: 6,
                            display: 'flex', alignItems: 'center', gap: 3,
                          }}>
                            <Heart size={11} strokeWidth={2.4} color="#fff" fill={post.likedByMe ? '#fff' : 'none'} />
                            <span style={{ color: '#fff', fontSize: '0.62rem', fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>
                              {post.likesCount}
                            </span>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3" style={{ paddingTop: 32 }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: '50%',
                      background: C.primaryFaint, border: `1px solid ${C.primaryBorder}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.primaryDim,
                    }}>
                      <Video size={20} strokeWidth={1.5} />
                    </div>
                    <p style={{ color: C.textDim, fontSize: '0.82rem', textAlign: 'center', maxWidth: 220, lineHeight: 1.6 }}>
                      لا توجد فيديوهات بعد
                    </p>
                  </div>
                ))}

                {/* ── My Photos grid — image posts recorded via the camera. Shown only on the
                     "صور" tab, kept completely separate from the videos grid above. ── */}
                
                {profileContentTab === 'photos' && (myPhotoPosts.length > 0 ? (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 2,
                    padding: '10px 2px 4px',
                  }}>
                    {myPhotoPosts.map(post => {
                      const thumbUrl = post.mediaUrls && post.mediaUrls.length > 0 ? post.mediaUrls[0] : post.mediaUrl;
                      return (
                        <motion.button
                          key={post.id}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => openMediaPostDetail(post)}
                          style={{
                            position: 'relative',
                            width: '100%',
                            aspectRatio: '1 / 1',
                            padding: 0,
                            border: 'none',
                            background: '#000',
                            cursor: 'pointer',
                            overflow: 'hidden',
                          }}
                        >
                          <img src={thumbUrl ?? ''} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          {(post.mediaUrls?.length ?? 0) > 1 && (
                            <div style={{ position: 'absolute', top: 6, insetInlineStart: 6 }}>
                              <Images size={13} strokeWidth={2.4} color="#fff" />
                            </div>
                          )}
                          <div style={{
                            position: 'absolute', bottom: 4, insetInlineStart: 6,
                            display: 'flex', alignItems: 'center', gap: 3,
                          }}>
                            <Heart size={11} strokeWidth={2.4} color="#fff" fill={post.likedByMe ? '#fff' : 'none'} />
                            <span style={{ color: '#fff', fontSize: '0.62rem', fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>
                              {post.likesCount}
                            </span>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3" style={{ paddingTop: 32 }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: '50%',
                      background: C.primaryFaint, border: `1px solid ${C.primaryBorder}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.primaryDim,
                    }}>
                      <ImageIcon size={20} strokeWidth={1.5} />
                    </div>
                    <p style={{ color: C.textDim, fontSize: '0.82rem', textAlign: 'center', maxWidth: 220, lineHeight: 1.6 }}>
                      لا توجد صور بعد
                    </p>
                  </div>
                ))}
              </motion.div>}

            {/* ══ ADD TAB: Search + Requests ══ */}
            {pageTab === 'add' && <motion.div key="add-tab" initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} className="flex flex-col gap-4">

                {/* Inner sub-tabs: Search | Requests */}
                <div className="flex" style={{
              borderBottom: `1px solid ${C.navBorder}`
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
                borderBottom: tab === st.key ? `2px solid ${C.primary}` : '2px solid transparent',
                color: tab === st.key ? C.primary : C.textDim,
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
                  background: tab === st.key ? C.primary : C.primaryDim,
                  color: tab === st.key ? '#060e0e' : C.primary,
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
                  color: C.primaryDim
                }}>
                        <Search size={16} strokeWidth={2} />
                      </div>
                      <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by username or name…" autoFocus style={{
                  width: '100%',
                  background: C.inputBg,
                  border: `1px solid ${C.primaryBorder}`,
                  borderRadius: 10,
                  padding: '12px 14px 12px 38px',
                  color: C.text,
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
                    border: `2px solid ${C.primaryDim}`,
                    borderTopColor: C.primary
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
                    color: C.textDim,
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
                      background: isRed ? 'rgba(239,68,68,0.06)' : C.cardBg,
                      border: `1px solid ${isRed ? 'rgba(239,68,68,0.35)' : C.cardBorder}`,
                      transition: 'all 0.2s'
                    }}>
                                <div className="flex items-center gap-3">
                                  <UserAvatar name={u.name ?? u.username ?? u.email} avatarUrl={u.avatarUrl} size={38} red={isRed} online={presence[u.id]?.online} />
                                  <div>
                                    <p style={{
                            color: C.text,
                            fontSize: '0.88rem',
                            fontWeight: 500
                          }}>{u.name ?? '—'}</p>
                                    <p style={{
                            color: C.textDim,
                            fontSize: '0.72rem',
                            fontWeight: 400
                          }}>
                                      {u.username ? <span style={{
                              color: isRed ? '#ef4444' : C.textDim
                            }}>@{u.username}</span> : u.email}
                                    </p>
                                  </div>
                                </div>
                                {u.friendStatus === 'accepted' ? <motion.button whileTap={{
                        scale: 0.9
                      }} onClick={() => navigate(`/chat?with=${u.id}&name=${encodeURIComponent(u.name ?? '')}&username=${encodeURIComponent(u.username ?? '')}&avatarUrl=${encodeURIComponent(u.avatarUrl ?? '')}`)} style={{
                        background: 'rgba(0,188,212,0.12)',
                        border: `1px solid ${C.primaryBorder}`,
                        borderRadius: 8,
                        padding: '6px 12px',
                        color: C.primary,
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
                        color: C.primaryDim,
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
                        background: sending === u.id ? C.primaryFaint : 'rgba(0,188,212,0.12)',
                        border: `1px solid ${C.primaryBorder}`,
                        borderRadius: 8,
                        padding: '6px 12px',
                        color: C.primary,
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
                color: C.textDim,
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
                  background: C.primaryFaint,
                  border: `1px solid ${C.primaryBorder}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: C.primaryDim
                }}>
                          <Search size={26} strokeWidth={1.5} />
                        </div>
                        <p style={{
                  color: C.textDim,
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
                  background: C.primaryFaint,
                  border: `1px solid ${C.primaryBorder}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: C.primaryDim
                }}>
                          <UserPlus size={26} strokeWidth={1.5} />
                        </div>
                        <p style={{
                  color: C.textDim,
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
                        color: C.text,
                        fontSize: '0.88rem',
                        fontWeight: 500
                      }}>{req.name ?? '—'}</p>
                                <p style={{
                        color: C.textDim,
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
                      border: `1px solid ${C.primaryBorder}`,
                      color: C.primary,
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
            <motion.div initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} style={{ position: 'fixed', inset: 0, zIndex: 10195, background: 'hsl(var(--background))', overflowY: 'auto', paddingBottom: 28 }}>
              <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', gap: 10, padding: '16px 14px', background: 'hsl(var(--background))', borderBottom: '1px solid hsl(var(--border))' }}>
                <button onClick={() => setHashtagView(null)} aria-label="رجوع" style={{ background: 'none', border: 'none', color: 'hsl(var(--foreground))', cursor: 'pointer', display: 'flex' }}><ArrowLeft size={22} /></button>
                <Hash size={19} color="hsl(var(--primary))" />
                <strong style={{ color: 'hsl(var(--foreground))', fontSize: '1rem' }}>{hashtagView.tag}</strong>
              </div>
              {hashtagView.posts.length ? hashtagView.posts.map(post => (
                <div key={post.id} style={{ margin: '12px 14px', padding: 14, borderRadius: 14, background: 'transparent', border: 'none' }}>
                  <div
                    role="button"
                    onClick={() => setViewingProfile({
                      id: post.authorId, name: post.authorName, username: post.authorUsername, avatarUrl: post.authorAvatarUrl,
                    })}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10, cursor: 'pointer' }}
                  >
                    <UserAvatar name={post.authorName} avatarUrl={post.authorAvatarUrl} size={32} />
                    <div><strong style={{ color: 'hsl(var(--foreground))', fontSize: '0.8rem' }}>{post.authorName}</strong><div style={{ color: 'hsl(var(--primary))', fontSize: '0.7rem' }}>{post.authorUsername ? `@${post.authorUsername}` : ''}</div></div>
                  </div>
                  <PostText text={post.text} color="hsl(var(--primary))" textColor={C.textDim} onHashtag={openHashtag} />
                </div>
              )) : <p style={{ color: 'hsl(var(--muted-foreground))', textAlign: 'center', padding: 32 }}>لا توجد منشورات لهذا الهاشتاق بعد</p>}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {sharePost && (
            <motion.div initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} style={{ position: 'fixed', inset: 0, zIndex: 10280, background: 'hsl(var(--background)/0.9)', display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }} onClick={() => setSharePost(null)}>
              <motion.div initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} onClick={event => event.stopPropagation()} style={{ width: '100%', maxHeight: '78dvh', overflowY: 'auto', borderRadius: '22px 22px 0 0', background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', padding: '18px 16px 28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}><strong style={{ color: 'hsl(var(--foreground))' }}>Send post to friends</strong><button onClick={() => setSharePost(null)} style={{ background: 'none', border: 'none', color: 'hsl(var(--foreground))', cursor: 'pointer' }}><X size={20} /></button></div>
                <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.74rem', margin: '0 0 12px' }}>Choose friends to send this post in a private chat.</p>
                {friends.length ? friends.map(friend => {
                  const selected = shareRecipients.includes(friend.friendId);
                  return <button key={friend.friendId} onClick={() => setShareRecipients(current => selected ? current.filter(id => id !== friend.friendId) : [...current, friend.friendId])} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', background: 'none', border: 'none', color: 'hsl(var(--foreground))', cursor: 'pointer', textAlign: 'start' }}>
                    <UserAvatar name={friend.name ?? friend.username ?? 'User'} avatarUrl={friend.avatarUrl} size={38} />
                    <span style={{ flex: 1, fontSize: '0.84rem' }}>{friend.name ?? friend.username ?? 'User'}</span>
                    <span style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${selected ? 'hsl(var(--primary))' : 'hsl(var(--border))'}`, background: selected ? 'hsl(var(--primary))' : 'transparent', display: 'grid', placeItems: 'center' }}>{selected && <Check size={13} color="hsl(var(--primary-foreground))" />}</span>
                  </button>;
                }) : <p style={{ color: 'hsl(var(--muted-foreground))', textAlign: 'center', padding: 20 }}>Add friends first to share posts with them</p>}
                {shareError && <p style={{ color: 'hsl(var(--destructive))', fontSize: '0.75rem' }}>{shareError}</p>}
                <button disabled={!shareRecipients.length || sharingPost} onClick={sendPostShare} style={{ width: '100%', marginTop: 14, padding: '12px', borderRadius: 12, border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 700, cursor: shareRecipients.length ? 'pointer' : 'not-allowed', opacity: shareRecipients.length ? 1 : 0.5 }}>{sharingPost ? 'Sending…' : 'Send'}</button>
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
        {showNewSecret && <motion.div initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} style={{
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
          border: `1px solid ${C.primaryBorder}`,
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
                color: C.primary
              }} />
                  <p style={{
                color: C.primary,
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
              color: C.textDim,
              cursor: 'pointer'
            }}>
                  <X size={18} />
                </motion.button>
              </div>
              <input type="text" value={scName} onChange={e => setScName(e.target.value)} placeholder="اسم الدردشة السرية…" style={{
            width: '100%',
            background: C.inputBg,
            border: `1px solid ${C.primaryBorder}`,
            borderRadius: 10,
            padding: '11px 14px',
            color: C.text,
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
              color: C.primaryDim
            }} />
                <input type={scPinVisible ? 'text' : 'password'} inputMode="numeric" maxLength={8} value={scPin} onChange={e => setScPin(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="الرقم السري (4-8 أرقام)" style={{
              width: '100%',
              boxSizing: 'border-box',
              background: C.inputBg,
              border: `1px solid ${C.primaryBorder}`,
              borderRadius: 10,
              padding: '11px 36px 11px 36px',
              color: C.text,
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
              color: C.textDim
            }}>
                  {scPinVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <div>
                <p style={{
              color: C.textDim,
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
                  background: selected ? C.primaryFaint : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${selected ? C.primaryBorder : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: 10,
                  cursor: 'pointer',
                  textAlign: 'left'
                }}>
                        <UserAvatar name={label} avatarUrl={f.avatarUrl} size={32} />
                        <div style={{
                    flex: 1
                  }}>
                          <p style={{
                      color: C.text,
                      fontSize: '0.85rem',
                      fontWeight: 500
                    }}>{f.name ?? '—'}</p>
                          {f.username && <p style={{
                      color: C.textDim,
                      fontSize: '0.7rem'
                    }}>@{f.username}</p>}
                        </div>
                        {selected && <Check size={16} style={{
                    color: C.primary,
                    flexShrink: 0
                  }} strokeWidth={2.5} />}
                      </motion.button>;
              })}
                  {friends.length === 0 && <p style={{
                color: C.textDim,
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
            background: scName.trim() ? C.primaryFaint : 'rgba(255,255,255,0.03)',
            border: `1px solid ${C.primaryBorder}`,
            borderRadius: 12,
            color: scName.trim() ? C.primary : C.primaryDim,
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
        {openingChat && <motion.div initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} style={{
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
          border: `1px solid ${C.primaryBorder}`,
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
            background: C.primaryFaint,
            border: `1px solid ${C.primaryBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: C.primary
          }}>
                <Lock size={22} strokeWidth={1.8} />
              </div>
              <p style={{
            color: C.text,
            fontSize: '0.95rem',
            fontWeight: 700,
            textAlign: 'center'
          }}>{openingChat.name}</p>
              <p style={{
            color: C.textDim,
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
              background: C.inputBg,
              border: `1px solid ${openPinError ? 'hsl(var(--destructive))' : C.primaryBorder}`,
              borderRadius: 12,
              padding: '12px 36px 12px 14px',
              color: C.text,
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
              color: C.textDim
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
              background: C.primaryFaint,
              border: `1px solid ${C.primaryBorder}`,
              borderRadius: 12,
              color: C.text,
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
              background: C.primaryFaint,
              border: `1px solid ${C.primaryBorder}`,
              borderRadius: 12,
              color: C.primary,
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
        {activeChat && <motion.div initial={{
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
          borderBottom: `1px solid ${C.primaryBorder}`
        }}>
              <motion.button whileTap={{
            scale: 0.88
          }} onClick={() => setActiveChat(null)} style={{
            background: 'none',
            border: 'none',
            color: C.primary,
            cursor: 'pointer',
            padding: 4
          }}>
                <ArrowLeft size={22} strokeWidth={2} />
              </motion.button>
              <Lock size={14} style={{
            color: C.primaryDim
          }} />
              <p style={{
            color: C.primary,
            fontSize: '0.9rem',
            fontWeight: 700,
            flex: 1
          }}>{activeChat.name}</p>
              <motion.button whileTap={{
            scale: 0.88
          }} onClick={() => void callActiveSecretChat()} aria-label="Call secret chat participants" title="اتصال بأعضاء الدردشة السرية" style={{
            background: C.primaryFaint,
            border: `1px solid ${C.primaryBorder}`,
            borderRadius: 10,
            color: C.primary,
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
            color: C.textDim,
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
                border: `1.5px solid ${C.primaryBorder}`,
                background: C.primaryFaint,
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
                  color: C.primary,
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
                  color: C.primaryDim,
                  fontSize: '0.62rem',
                  fontWeight: 600,
                  margin: 0,
                  paddingInline: 4
                }}>
                          {m.sender_name ?? m.sender_username ?? '?'}
                        </p>}

                      {/* Bubble */}
                      <div style={{
                  background: isMe ? C.primaryFaint : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${isMe ? C.primaryBorder : 'rgba(255,255,255,0.08)'}`,
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
                                color: C.primaryDim, fontSize: '0.62rem', fontWeight: 600,
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
                                color: C.text, fontSize: '0.82rem', lineHeight: 1.45,
                                margin: 0, display: '-webkit-box',
                                WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}>
                                {ps.text || '—'}
                              </p>
                              <span style={{
                                color: C.primary, fontSize: '0.68rem', fontWeight: 700,
                              }}>View post →</span>
                            </motion.button>
                          );
                        })()}
                        {msgType === 'text' && <p style={{
                    color: C.text,
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
                        {msgType === 'voice' && <ScVoiceBubble url={m.body} duration={m.duration} isMe={isMe} primaryColor={C.primary} primaryBorder={C.primaryBorder} textDim={C.textDim} />}
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
                    color: C.primary,
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
                        color: C.primary,
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        margin: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: 140
                      }}>{filePayload.name}</p>
                              <p style={{
                        color: C.textDim,
                        fontSize: '0.65rem',
                        margin: 0,
                        textTransform: 'uppercase'
                      }}>{filePayload.ext || 'file'}</p>
                            </div>
                          </a>}
                      </div>

                      {/* Time */}
                      {timeLabel && <p style={{
                  color: C.textDim,
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
          borderTop: `1px solid ${C.primaryBorder}`,
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
                  background: C.primary,
                  transformOrigin: 'bottom'
                }} />)}
                    </div>
                    <span style={{
                color: C.textDim,
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
                background: scShowAttach ? C.primaryFaint : 'rgba(255,255,255,0.04)',
                border: `1px solid ${scShowAttach ? C.primary : C.primaryBorder}`,
                color: scShowAttach ? C.primary : C.textDim,
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
                  border: `1px solid ${C.primaryBorder}`,
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
                    color: C.text,
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }} onMouseEnter={e => e.currentTarget.style.background = C.primaryFaint} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <span style={{
                      color: C.primary
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
              background: C.inputBg,
              border: `1px solid ${C.primaryBorder}`,
              borderRadius: 12,
              padding: '11px 14px',
              color: C.text,
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
              background: C.primaryFaint,
              border: `1px solid ${C.primaryBorder}`,
              color: C.primary,
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
              background: C.primaryFaint,
              border: `1px solid ${C.primaryBorder}`,
              color: C.primary,
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
              color: C.text,
              fontSize: '0.92rem',
              fontWeight: 700,
              margin: 0
            }}>
                  {confirmRemoveFriend.name ?? confirmRemoveFriend.username ?? '—'}
                </p>
                {confirmRemoveFriend.username && <p style={{
              color: C.textDim,
              fontSize: '0.72rem',
              margin: 0
            }}>@{confirmRemoveFriend.username}</p>}
              </div>
              <p style={{
            color: C.textDim,
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
              background: C.primaryFaint,
              border: `1px solid ${C.primaryBorder}`,
              borderRadius: 10,
              color: C.text,
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
            color: C.text,
            fontSize: '0.92rem',
            fontWeight: 700,
            textAlign: 'center',
            margin: 0
          }}>
                حذف الدردشة السرية
              </p>
              <p style={{
            color: C.textDim,
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
              background: C.primaryFaint,
              border: `1px solid ${C.primaryBorder}`,
              borderRadius: 10,
              color: C.text,
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
            color: C.text,
            fontSize: '0.92rem',
            fontWeight: 700,
            textAlign: 'center',
            margin: 0
          }}>
                مغادرة الغرفة السرية
              </p>
              <p style={{
            color: C.textDim,
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
              background: C.primaryFaint,
              border: `1px solid ${C.primaryBorder}`,
              borderRadius: 10,
              color: C.text,
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
              color: C.text,
              fontSize: '0.92rem',
              fontWeight: 700,
              margin: 0
            }}>
                  {confirmBlockFriend.name ?? confirmBlockFriend.username ?? '—'}
                </p>
                {confirmBlockFriend.username && <p style={{
              color: C.textDim,
              fontSize: '0.72rem',
              margin: 0
            }}>@{confirmBlockFriend.username}</p>}
              </div>
              <p style={{
            color: C.textDim,
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
              background: C.primaryFaint,
              border: `1px solid ${C.primaryBorder}`,
              borderRadius: 10,
              color: C.text,
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
        border: `1px solid ${C.primaryBorder}`,
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
          background: C.primaryFaint,
          border: `1.5px solid ${C.primaryBorder}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
              <Lock size={18} strokeWidth={1.8} color={C.primary} />
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
              color: C.primary,
              fontSize: '0.7rem',
              fontWeight: 700,
              letterSpacing: '0.04em'
            }}>
                  {scNotif.chatName}
                </span>
                <span style={{
              color: C.textDim,
              fontSize: '0.62rem'
            }}>•</span>
                <span style={{
              color: C.textDim,
              fontSize: '0.62rem'
            }}>{scNotif.senderName}</span>
              </div>
              <p style={{
            color: C.text,
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
          background: C.primary,
          borderRadius: '0 0 18px 18px',
          transformOrigin: 'left'
        }} />
          </motion.div>}
      </AnimatePresence>


      {/* ── New Post Composer ── */}
      <AnimatePresence>
        {showComposer && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }}
            onClick={() => !composerPosting && setShowComposer(false)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
              zIndex: 10295, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            }}
          >
            <motion.div
              onClick={e => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
              style={{
                width: '100%', maxWidth: 480,
                background: 'hsl(var(--card))',
                border: `1px solid ${C.primaryBorder}`,
                borderBottom: 'none',
                borderRadius: '20px 20px 0 0',
                padding: '16px 16px calc(16px + env(safe-area-inset-bottom))',
                display: 'flex', flexDirection: 'column', gap: 12,
                maxHeight: '85dvh',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                <p style={{ color: C.text, fontSize: '0.9rem', fontWeight: 700, margin: 0, flex: 1 }}>{composerDestination === 'text' ? 'منشور نصي جديد' : 'نشر صورة أو فيديو'}</p>
                <button onClick={() => !composerPosting && setShowComposer(false)} style={{
                  background: 'none', border: 'none', color: C.textDim, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, marginLeft: 'auto',
                }}>
                  <X size={20} strokeWidth={2} />
                </button>
              </div>

              {/* Composer row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ width: 76, height: 76, flexShrink: 0, borderRadius: '50%', overflow: 'hidden', border: `3px solid ${C.primary}`, boxShadow: `0 0 12px ${C.primaryFaint}` }}>
                  <UserAvatar name={user?.name ?? ''} avatarUrl={(user as any)?.avatarUrl ?? null} size={76} style={{ width: '100%', height: '100%', border: 'none', borderRadius: '50%', display: 'block' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <p style={{ color: C.text, fontSize: '0.8rem', fontWeight: 600, margin: 0 }}>Me</p>
                  {composerDestination === 'text' ? (
                    <textarea value={composerText} onChange={e => setComposerText(e.target.value)} placeholder="بماذا تفكر؟ استخدم # لإضافة هاشتاق..." rows={4} style={{ width: '100%', resize: 'none', background: C.inputBg, border: `1px solid ${C.primaryBorder}`, borderRadius: 14, padding: 12, color: C.text, fontSize: '0.86rem', fontFamily: 'inherit', lineHeight: 1.6, outline: 'none', boxSizing: 'border-box' }} />
                  ) : (
                    <p style={{ color: C.textDim, fontSize: '0.78rem', lineHeight: 1.6, margin: 0, padding: '12px 0' }}>{composerDestinationNotice}</p>
                  )}
                </div>
              </div>

              {/* Detected hashtags preview */}
              {(() => {
                const tags = Array.from(composerText.matchAll(/#([\p{L}\p{N}_]+)/gu)).map(m => m[1]);
                return tags.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {tags.map((t, i) => (
                      <span key={i} style={{
                        color: C.primary, background: C.primaryFaint, border: `1px solid ${C.primaryBorder}`,
                        borderRadius: 20, padding: '3px 10px', fontSize: '0.68rem', fontWeight: 600,
                      }}>#{t}</span>
                    ))}
                  </div>
                ) : null;
              })()}

              {/* Media preview */}
              {composerMediaFiles.length > 0 && (
                <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.primaryBorder}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6 }}>
                    {composerMediaFiles.map((item, index) => (
                      <div key={`${item.type}-${index}`} style={{ position: 'relative', minHeight: 120 }}>
                        {item.type === 'video' ? (
                          <video src={item.preview} controls style={{ width: '100%', height: 180, display: 'block', background: '#000', objectFit: 'cover' }} />
                        ) : (
                          <img src={item.preview} alt="" style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }} />
                        )}
                        <button type="button" onClick={() => removePostMediaAt(index)} aria-label="حذف الوسائط" style={{
                          position: 'absolute', top: 7, right: 7, width: 28, height: 28, borderRadius: '50%',
                          background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}><X size={14} strokeWidth={2.4} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {composerMediaFiles.length > 0 && (
                <p style={{ color: C.textDim, fontSize: '0.72rem', margin: 0, textAlign: 'center' }}>
                  {composerDestination === 'text' ? 'سيتم نشر المرفق في الشات العام النصي' : 'سيتم نشر المرفق في قسم الصور أو الفيديو'}
                </p>
              )}

              {/* Publish error — shown when the post failed to save so nothing disappears silently */}
              {composerError && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 10, padding: '8px 12px',
                }}>
                  <p style={{ color: '#ef4444', fontSize: '0.75rem', margin: 0 }}>{composerError}</p>
                </div>
              )}

              {/* Hidden file inputs */}
              {/* Text-feed media inputs: photos and videos stay attached to the text post. */}
              <input
                ref={postImageRef}
                type="file"
                accept="image/*"
                multiple={composerDestination === 'text'}
                style={{ display: 'none' }}
                onChange={e => {
                  Array.from(e.target.files ?? []).forEach(file => pickPostMedia(file, 'image'));
                  e.target.value = '';
                }}
              />
              <input
                ref={postVideoRef}
                type="file"
                accept="video/*"
                multiple={composerDestination === 'text'}
                style={{ display: 'none' }}
                onChange={e => {
                  Array.from(e.target.files ?? []).forEach(file => pickPostMedia(file, 'video'));
                  e.target.value = '';
                }}
              />

              {composerDestination !== 'text' && (
                <motion.button type="button" whileTap={{ scale: 0.98 }} onClick={() => (composerDestination === 'photos' ? postImageRef : postVideoRef).current?.click()} aria-label={composerDestination === 'photos' ? 'اختيار صورة' : 'اختيار فيديو'} style={{ width: '100%', height: 46, borderRadius: 12, background: C.primaryFaint, border: `1px solid ${C.primaryBorder}`, color: C.primary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: '0.8rem', fontWeight: 700 }}>
                  {composerDestination === 'photos' ? <ImageIcon size={18} strokeWidth={2} /> : <Video size={18} strokeWidth={2} />}
                  {composerDestination === 'photos' ? 'اختيار صورة' : 'اختيار فيديو'}
                </motion.button>
              )}

              {/* Text-post attachments */}
              {composerDestination === 'text' ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {user && <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={() => postImageRef.current?.click()} aria-label="Attach image" style={{ height: 38, padding: '0 12px', borderRadius: 19, background: C.primaryFaint, border: `1px solid ${C.primaryBorder}`, color: C.primary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: '0.72rem', fontWeight: 700 }}><ImageIcon size={16} strokeWidth={2} />Photo</motion.button>}
                    {user && <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={() => postVideoRef.current?.click()} aria-label="Attach video" style={{ height: 38, padding: '0 12px', borderRadius: 19, background: C.primaryFaint, border: `1px solid ${C.primaryBorder}`, color: C.primary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: '0.72rem', fontWeight: 700 }}><Video size={16} strokeWidth={2} />Video</motion.button>}
                  </div>
                  <motion.button whileTap={{ scale: 0.95 }} disabled={composerPosting || !composerText.trim()} onClick={() => void submitPost('text')} style={{ padding: '9px 22px', background: !composerText.trim() ? C.primaryFaint : C.primary, border: 'none', borderRadius: 20, color: !composerText.trim() ? C.textDim : 'hsl(var(--primary-foreground))', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {composerPosting ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }} style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid hsl(var(--primary-foreground))', borderTopColor: 'transparent' }} /> : <Send size={14} strokeWidth={2.4} />}
                    نشر
                  </motion.button>
                </div>
              ) : (
                <motion.button type="button" whileTap={{ scale: 0.98 }} onClick={() => void submitPost(composerDestination)} disabled={composerPosting || composerMediaFiles.length === 0} style={{ width: '100%', minHeight: 50, borderRadius: 12, border: 'none', background: composerMediaFiles.length === 0 ? C.primaryFaint : C.primary, color: composerMediaFiles.length === 0 ? C.textDim : 'hsl(var(--primary-foreground))', cursor: composerMediaFiles.length === 0 ? 'not-allowed' : 'pointer', fontSize: '0.86rem', fontWeight: 700 }}>
                  {composerPosting ? 'جارٍ النشر...' : 'نشر'}
                </motion.button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Post Detail Page — opened by tapping any post; comments live only here ── */}
      <AnimatePresence>
        {openComments && (
          <PostDetailPage
            key={openComments.id}
            post={(() => {
              const fromFeed = posts.find(p => p.id === openComments.id);
              const fromMedia = myMediaPosts.find(p => p.id === openComments.id);
              // ادمج أحدث بيانات مع المنشور المفتوح حتى لا يضيع النص أو الوسائط
              const base = fromFeed ?? fromMedia ?? openComments;
              return {
                ...openComments,
                ...base,
                text: base.text || openComments.text || '',
                mediaUrl: base.mediaUrl ?? openComments.mediaUrl,
                mediaType: base.mediaType ?? openComments.mediaType,
                mediaUrls: (base.mediaUrls?.length ? base.mediaUrls : openComments.mediaUrls) ?? [],
                mediaTypes: (base.mediaTypes?.length ? base.mediaTypes : openComments.mediaTypes) ?? [],
              };
            })()}
            isMine={!!user && openComments.authorId === user.id}
            comments={postComments[openComments.id] ?? []}
            commentText={commentText}
            commentSending={commentSending}
            onChangeCommentText={setCommentText}
            onSubmitComment={submitComment}
            onToggleLike={toggleLike}
            onRemoveMedia={removePostMedia}
            onRequestDelete={post => setConfirmDeletePost(post)}
            onSaveMediaText={saveMediaPostText}
            onClose={closePostDetail}
            enterFromSide={postDetailEnterSide}
          />
        )}
      </AnimatePresence>

      {/* ── Text Posts Page — هيدر نحيف: STOOORNA ثابتة مع وميض لامع يمر على الأحرف ── */}
      <AnimatePresence>
      {textPostsPageOpen && (
          <motion.div
            key="text-posts-page"
            initial={textPostsOpenedFromUrl.current ? false : { opacity: 0, y: -36 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 56 }}
            transition={{ duration: 0.34, ease: 'easeInOut' }}
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0,
              bottom: 'calc(52px + env(safe-area-inset-bottom, 0px))',
              zIndex: 10190,
              background: C.bg, display: 'flex', flexDirection: 'column',
              transformOrigin: 'center center',
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px 14px',
              paddingTop: 'max(8px, env(safe-area-inset-top, 0px))',
              flexShrink: 0,
              borderBottom: `1px solid ${C.navBorder}`,
              background: 'rgba(6,14,14,0.96)',
              minHeight: 46,
            }}>
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => {
                  setComposerDestination('text');
                  setComposerError('');
                  try { clearPostMedia(); } catch { /* */ }
                  window.setTimeout(() => setShowComposer(true), 0);
                }}
                aria-label="Create a text post"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  height: 38, padding: '0 14px', borderRadius: 19,
                  border: `1px solid ${C.primaryBorder}`,
                  background: C.primaryFaint,
                  color: C.primary,
                  cursor: 'pointer',
                }}
              >
                <PenLine size={17} strokeWidth={2.4} />
                <span style={{ fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.02em' }}>New Post</span>
              </motion.button>
            </div>
            <div
              ref={textPostsScrollRef}
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
              style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
            >
              <AnimatePresence>
                {newPostsAvailable > 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
                    style={{ display: 'flex', justifyContent: 'center', padding: '4px 14px 10px' }}
                  >
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={loadPendingNewPosts}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: C.primary, border: 'none', borderRadius: 20,
                        padding: '7px 16px', color: '#06171a', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer',
                        boxShadow: '0 2px 10px rgba(0,188,212,0.35)',
                      }}
                    >
                      <Repeat2 size={13} strokeWidth={2.6} />
                      New Post{newPostsAvailable > 1 ? `s (${newPostsAvailable})` : ''}
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
              {posts.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {posts.map(post => (
                    <PostCard
                      key={post.repostKey ?? post.id}
                      post={post}
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
                      onOpenPost={openTextPostDetail}
                      onRequestDelete={setConfirmDeletePost}
                      onRemoveMedia={removePostMedia}
                      onHashtag={openHashtag}
                      onToggleFavorite={handleToggleFavoritePost}
                      isFavorited={isPostFavorited}
                      onShare={post => { if (guestGuard()) return; setShareRecipients([]); setShareError(''); setSharePost(post); }}
                      onRepost={toggleRepost}
                      onDownload={handleDownloadPost}
                      onOpenProfile={p => setViewingProfile({
                        id: p.authorId, name: p.authorName, username: p.authorUsername, avatarUrl: p.authorAvatarUrl,
                      })}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3" style={{ paddingTop: 32 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: '50%',
                    background: C.primaryFaint, border: `1px solid ${C.primaryBorder}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.primaryDim,
                  }}>
                    <FileText size={20} strokeWidth={1.5} />
                  </div>
                  <p style={{ color: C.textDim, fontSize: '0.82rem', textAlign: 'center', maxWidth: 220, lineHeight: 1.6 }}>
                    لا توجد منشورات بعد — اضغط مطولاً على أيقونة البوستات بالشريط السفلي للنشر
                  </p>
                </div>
              )}
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
            initialSection={sharedInboxStoryOnly ? 'story' : 'favorites'}
            storyOnly={sharedInboxStoryOnly}
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
              navigate(`/chat?with=${encodeURIComponent(c.authorId)}&name=${encodeURIComponent(c.authorName ?? '')}&avatarUrl=${encodeURIComponent(c.authorAvatarUrl ?? '')}`);
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
              zIndex: 10290, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
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
                <p style={{ color: C.text, fontSize: '0.88rem', fontWeight: 700, margin: 0 }}>حذف المنشور</p>
              </div>
              <p style={{ color: C.textDim, fontSize: '0.8rem', lineHeight: 1.5, textAlign: 'center', margin: 0 }}>
                هل تريد حذف هذا المنشور نهائياً؟ لا يمكن التراجع عن هذا الإجراء.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setConfirmDeletePost(null)}
                  disabled={deletingPostId !== null}
                  style={{
                    flex: 1, padding: '10px', background: C.primaryFaint,
                    border: `1px solid ${C.primaryBorder}`, borderRadius: 10,
                    color: C.text, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
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

      {/* ── اختيار نوع الستوري: مستطيل بسيط بحجم الصورة/الفيديو، بنفس المكان دائماً ── */}
      <AnimatePresence>
        {storyPickerOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }}
            onClick={() => setStoryPickerOpen(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
              zIndex: 10050, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
            }}
          >
            <motion.div
              onClick={e => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
              style={{
                background: 'hsl(var(--card))',
                border: `1px solid ${C.cardBorder}`,
                borderRadius: 14,
                width: 150,
                aspectRatio: '9 / 16',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => openStoryPicker('image', storyPickerOpen)}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 6,
                  background: C.primaryFaint, border: 'none', borderBottom: `1px solid ${C.cardBorder}`,
                  color: C.text, cursor: 'pointer',
                }}
              >
                <ImageIcon size={20} color={C.primary} strokeWidth={2} />
                <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>Photo</span>
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => openStoryPicker('video', storyPickerOpen)}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 6,
                  background: C.primaryFaint, border: 'none',
                  color: C.text, cursor: 'pointer',
                }}
              >
                <Video size={20} color={C.primary} strokeWidth={2} />
                <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>Video</span>
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Story Viewer ── */}
      <AnimatePresence>
        {viewerGroupIdx !== null && (
          <StoryViewer
            groups={storyGroups}
            startGroupIdx={viewerGroupIdx}
            myId={user?.id ?? ''}
            onClose={() => setViewerGroupIdx(null)}
            onSeen={markStorySeen}
            onAddMedia={() => setStoryPickerOpen('add')}
            onPublishPhoto={() => quickImageInputRef.current?.click()}
            onPublishVideo={() => quickVideoInputRef.current?.click()}
            onOpenCamera={() => setCameraCaptureOpen(true)}
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


      {/* ── Publish menu — opened from the "+" badge on my story avatar: نشر للقصة / نشر صورة / نشر فيديو ── */}
      <AnimatePresence>
        {publishMenuOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }}
            onClick={() => setPublishMenuOpen(false)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
              zIndex: 10060, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
            }}
          >
            <motion.div
              onClick={e => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
              style={{
                background: 'hsl(var(--card))',
                border: `1px solid ${C.cardBorder}`,
                borderRadius: 14,
                width: 230,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => { setPublishMenuOpen(false); setStoryPickerOpen('main'); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px',
                  background: 'transparent', border: 'none', borderBottom: `1px solid ${C.cardBorder}`,
                  color: C.text, cursor: 'pointer', textAlign: 'right', width: '100%',
                }}
              >
                <Plus size={18} color={C.primary} strokeWidth={2.2} />
                <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>نشر للقصة</span>
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => { setPublishMenuOpen(false); quickImageInputRef.current?.click(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px',
                  background: 'transparent', border: 'none', borderBottom: `1px solid ${C.cardBorder}`,
                  color: C.text, cursor: 'pointer', textAlign: 'right', width: '100%',
                }}
              >
                <ImageIcon size={18} color={C.primary} strokeWidth={2.2} />
                <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>نشر صورة</span>
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => { setPublishMenuOpen(false); quickVideoInputRef.current?.click(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px',
                  background: 'transparent', border: 'none', borderBottom: `1px solid ${C.cardBorder}`,
                  color: C.text, cursor: 'pointer', textAlign: 'right', width: '100%',
                }}
              >
                <Video size={18} color={C.primary} strokeWidth={2.2} />
                <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>نشر فيديو</span>
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => { setPublishMenuOpen(false); setCameraCaptureOpen(true); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px',
                  background: 'transparent', border: 'none',
                  color: C.text, cursor: 'pointer', textAlign: 'right', width: '100%',
                }}
              >
                <Camera size={18} color={C.primary} strokeWidth={2.2} />
                <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>نشر القصة عبر</span>
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
            onOpenStoryComments={() => {
              // لا نغلق الكاميرا — صندوق التعليقات فوقها (z أعلى)، وعند إغلاق X تبقى الكاميرا مفتوحة
              setSharedInboxStoryOnly(true);
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

      {/* ── Floating friends names bar — opened by tapping the animated globe next to "Likes".
          Moved here from RecorderScreen (was the always-visible strip under STOOORNA). Floats
          above everything, scrolls left/right, and closes itself once a friend is tapped. ── */}
      <AnimatePresence>
        {namesBarOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }}
            onClick={() => setNamesBarOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 10080,
              background: 'rgba(0,0,0,0.45)',
        overflow: 'hidden',
      }}
          >
            <motion.div
              onClick={e => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              style={{
                position: 'absolute', top: 'env(safe-area-inset-top, 0px)', left: 0, right: 0,
                background: C.bg, borderBottom: `1px solid ${C.navBorder}`,
                paddingTop: 10,
              }}
            >
              <style>{`.names-bar-strip::-webkit-scrollbar{display:none}`}</style>
              <div
                className="names-bar-strip"
                style={{
                  display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', gap: 14,
                  overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none',
                  WebkitOverflowScrolling: 'touch', padding: '4px 16px 14px', alignItems: 'flex-start',
                }}
              >
                {friends.length === 0 ? (
                  <p style={{ color: C.textDim, fontSize: '0.75rem', padding: '10px 4px' }}>لا يوجد أصدقاء بعد</p>
                ) : friends.map(f => {
                  const label = f.username ? `@${f.username}` : (f.name ?? '??');
                  return (
                    <motion.button
                      key={f.id}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => {
                        setNamesBarOpen(false);
                        setViewingProfile({ id: f.friendId, name: f.name, username: f.username, avatarUrl: f.avatarUrl ?? null });
                      }}
                      style={{
                        flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                        minWidth: 54, maxWidth: 60,
                      }}
                    >
                      <UserAvatar name={label} avatarUrl={f.avatarUrl} size={46} style={{ border: `2px solid ${C.primaryBorder}` }} />
                      <span style={{
                        color: C.text, fontSize: '0.58rem', fontWeight: 500,
                        maxWidth: 58, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {label.replace('@', '')}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Friend story profile — opened by tapping any friend in the globe's names bar.
          Shows their Videos/Photos grid and follow stats, never their text posts. ── */}
      <AnimatePresence>
        {viewingProfile && (
          <FriendStoryProfile
            authorId={viewingProfile.id}
            authorName={viewingProfile.name}
            authorUsername={viewingProfile.username}
            authorAvatarUrl={viewingProfile.avatarUrl}
            onClose={() => setViewingProfile(null)}
            onOpenPost={openMediaPostDetail}
          />
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

      {/* ── Guest guard modal — يظهر عند محاولة الزائر التفاعل ── */}
      {GuestModal}
    </>;
}