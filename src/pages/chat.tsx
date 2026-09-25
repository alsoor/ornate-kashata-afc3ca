import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'motion/react';
import { Send, Play, X, Reply, Copy, Trash2, Check, LogOut, ChevronDown, UserPlus, UserMinus, Search, Mic, MicOff, Volume2, VolumeX, Lock, Camera, Phone, PhoneOff, Pencil, MoreVertical, Images, FileText, Link2, ArrowLeft, ExternalLink, RotateCcw, Zap, ZapOff, Image as ImageIcon, MapPin, Smile, Paperclip } from 'lucide-react';
import { useSession } from '@/lib/auth/auth-client';
import { useHeartbeat, usePresenceQuery, formatLastSeen, useTypingPublisher, usePeerTyping } from '@/hooks/usePresence';
import InAppNotification, { type AppNotification } from '@/components/InAppNotification';
import UserAvatar from '@/components/UserAvatar';
import { playNotificationSound } from '@/lib/notificationSound';
import LiveVoiceBanner from '@/components/LiveVoiceBanner';
import GroupVoiceBar from '@/components/GroupVoiceBar';
import { useGlobalCall } from '@/components/GlobalCallProvider';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Message {
  id: number;
  senderId: string;
  type: 'text' | 'voice' | 'image' | 'video' | 'file' | 'call';
  body: string | null;
  duration: number | null;
  createdAt: string | null;
  senderName?: string | null;
  senderUsername?: string | null;
  senderAvatarUrl?: string | null;
  senderNameColor?: string | null;
  isSystem?: boolean;
  // Delivery / read receipts (server may send readAt or read)
  read?: boolean;
  readAt?: string | null;
  delivered?: boolean;
  // Streak fields
  isStreak?: boolean;
  streakOpenedAt?: string | null;
  streakDuration?: number | null;
  streakMediaType?: 'photo' | 'video' | null;
}

// ─── Edit window ──────────────────────────────────────────────────────────────
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
function isWithinEditWindow(createdAt: string | null): boolean {
  if (!createdAt) return false;
  return Date.now() - new Date(createdAt).getTime() < EDIT_WINDOW_MS;
}

// ─── Call duration formatter (mm:ss) ───────────────────────────────────────────
function fmtCallDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ─── Theme ────────────────────────────────────────────────────────────────────
const T = {
  bg: '#ffffff',
  primary: '#111111',
  primaryDim: 'rgba(0,0,0,0.35)',
  primaryBorder: 'rgba(0,0,0,0.22)',
  primaryFaint: 'rgba(0,0,0,0.08)',
  text: '#111b21',
  textDim: '#667781',
  bubbleMe: '#efe6d6',
  bubbleThem: '#ffffff',
  inputBg: '#ffffff',
  navBorder: 'rgba(0,0,0,0.08)',
  red: '#e53935',
  redFaint: 'rgba(229,57,53,0.1)',
  redBorder: 'rgba(229,57,53,0.3)',
  redBar: 'rgba(229,57,53,0.55)',
  popupBg: '#ffffff'
};


// ─── Incoming/outgoing call ring (Web Audio, no asset) ────────────────────────
let chatSfxCtx: AudioContext | null = null;
function getChatSfxCtx(): AudioContext | null {
  try {
    if (!chatSfxCtx) {
      const Ctx: typeof AudioContext | undefined = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return null;
      chatSfxCtx = new Ctx();
    }
    if (chatSfxCtx.state === 'suspended') void chatSfxCtx.resume();
    return chatSfxCtx;
  } catch { return null; }
}
function playChatCallRing() { /* call feature removed */ }

function playBubblePop(kind: 'send' | 'recv') {
  const ctx = getChatSfxCtx();
  if (!ctx) return;
  try {
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    osc.type = 'sine';
    if (kind === 'send') {
      osc.frequency.setValueAtTime(920, t0);
      osc.frequency.exponentialRampToValueAtTime(540, t0 + 0.09);
      filter.frequency.value = 1400;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
    } else {
      osc.frequency.setValueAtTime(640, t0);
      osc.frequency.exponentialRampToValueAtTime(420, t0 + 0.12);
      filter.frequency.value = 900;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.016);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
    }
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.16);
  } catch {
    /* ignore */
  }
}

function buzzChat() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(18);
    }
  } catch {
    /* ignore */
  }
}

// ─── Voice bubble player ──────────────────────────────────────────────────────
const WAVEFORM_BARS = 28;
const SPEEDS = [1, 1.5, 2];
function VoiceBubble({
  url,
  duration,
  isMe,
  avatarUrl,
}: {
  url: string;
  duration: number | null;
  isMe: boolean;
  avatarUrl?: string | null;
}) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  function toggle() {
    buzzChat();
    playBubblePop('send');
    if (!audioRef.current) {
      audioRef.current = new Audio(url);
      audioRef.current.setAttribute('playsinline', 'true');
      audioRef.current.setAttribute('webkit-playsinline', 'true');
      audioRef.current.playbackRate = SPEEDS[speedIndex];
      const elAny = audioRef.current as HTMLAudioElement & {
        setSinkId?: (id: string) => Promise<void>;
      };
      if (typeof elAny.setSinkId === 'function') elAny.setSinkId('speaker').catch(() => {});
      audioRef.current.ontimeupdate = () => {
        const a = audioRef.current!;
        const p = a.duration ? a.currentTime / a.duration : 0;
        setProgress(p);
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
  function cycleSpeed(e: React.MouseEvent) {
    e.stopPropagation();
    const next = (speedIndex + 1) % SPEEDS.length;
    setSpeedIndex(next);
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next];
  }
  const totalSecs = duration ?? 0;
  const displaySecs = playing ? currentTime : totalSecs;
  const label = `${Math.floor(displaySecs / 60)}:${String(Math.floor(displaySecs % 60)).padStart(2, '0')}`;

  // Static waveform heights — deterministic from URL hash
  const barHeights = useMemo(() => {
    let seed = 0;
    for (let i = 0; i < url.length; i++) seed = seed * 31 + url.charCodeAt(i) & 0xffff;
    return Array.from({
      length: WAVEFORM_BARS
    }, (_, i) => {
      seed = seed * 1664525 + 1013904223 & 0xffff;
      const base = 0.25 + seed / 0xffff * 0.75;
      // taper edges
      const edge = Math.min(i, WAVEFORM_BARS - 1 - i) / (WAVEFORM_BARS / 4);
      return Math.max(0.2, base * Math.min(1, edge));
    });
  }, [url]);
  return <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: 250,
    minHeight: 52,
    padding: '6px 8px',
    background: 'transparent',
    border: 'none',
    boxSizing: 'border-box',
    color: '#111b21',
  }}>
      <div style={{
        width: 42, height: 42, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#ccc', position: 'relative',
      }}>
        {avatarUrl ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : null}
        <span style={{ position: 'absolute', right: -1, bottom: -1, width: 16, height: 16, borderRadius: '50%', background: '#d9fdd3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Mic size={9} color="#111" />
        </span>
      </div>
      <motion.button
        type="button"
        aria-label={playing ? 'Stop voice message' : 'Play voice message'}
        whileTap={{ scale: 0.9 }}
        onClick={toggle}
        style={{
          width: 28,
          height: 28,
          padding: 0,
          borderRadius: '50%',
          border: `1.5px solid ${T.primaryBorder}`,
          background: 'rgba(0,188,212,0.08)',
          color: T.primary,
          cursor: 'pointer',
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
        }}
      >
        {playing ? <div style={{ display: 'flex', gap: 2 }}>
          <span style={{ width: 2.5, height: 10, background: T.primary, borderRadius: 1 }} />
          <span style={{ width: 2.5, height: 10, background: T.primary, borderRadius: 1 }} />
        </div> : <Play size={12} fill="currentColor" strokeWidth={0} style={{ marginLeft: 1 }} />}
      </motion.button>

      <div onClick={toggle} style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        height: 20,
        cursor: 'pointer',
      }}>
        {barHeights.map((height, index) => {
          const isPlayed = index / WAVEFORM_BARS <= progress;
          return <span key={index} style={{
            width: 2.5,
            height: 4 + height * 14,
            borderRadius: 99,
            background: isPlayed ? T.primary : T.primaryBorder,
            flexShrink: 0,
          }} />;
        })}
      </div>

      <button type="button" onClick={cycleSpeed} style={{
        fontSize: '0.6rem',
        fontWeight: 700,
        color: T.primary,
        background: T.primaryFaint,
        border: `1px solid ${T.primaryBorder}`,
        borderRadius: 20,
        padding: '2px 6px',
        cursor: 'pointer',
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}>
        {SPEEDS[speedIndex]}x
      </button>

      <span style={{ fontSize: '0.68rem', color: '#111111', fontWeight: 700, minWidth: 26, textAlign: 'right', flexShrink: 0 }}>
        {label}
      </span>
      {null}
    </div>;
}


// ─── Image bubble ─────────────────────────────────────────────────────────────
/** Story reply — media + comment + time in ONE image frame (comment beside time) */
const STORY_REPLY_PREFIX = '__STORY_REPLY__';
const POST_SHARE_PREFIX = '__POST_SHARE__';
const PRODUCT_INQUIRY_PREFIX = '__PRODUCT_INQUIRY__';
type ProductInquiryData = {
  postId: number;
  title: string;
  price: string;
  details: string;
  imageUrl: string;
  question: string;
  companyId: string;
  companyName: string;
};
function parseProductInquiry(body: string | null | undefined): ProductInquiryData | null {
  if (!body || typeof body !== 'string' || !body.startsWith(PRODUCT_INQUIRY_PREFIX)) return null;
  try {
    const o = JSON.parse(body.slice(PRODUCT_INQUIRY_PREFIX.length)) as ProductInquiryData;
    if (o && o.postId) return o;
  } catch { /* ignore */ }
  return null;
}
function ProductInquiryBubble({ data }: { data: ProductInquiryData }) {
  return (
    <div style={{
      maxWidth: 280, borderRadius: 14, overflow: 'hidden',
      border: '1px solid rgba(0,188,212,0.3)', background: 'rgba(0,20,24,0.9)',
    }}>
      {data.imageUrl ? (
        <img src={data.imageUrl} alt="" style={{ width: '100%', maxHeight: 180, objectFit: 'cover', display: 'block' }} />
      ) : null}
      <div style={{ padding: '10px 12px' }}>
        <p style={{ margin: 0, color: '#00BCD4', fontWeight: 800, fontSize: '0.88rem' }}>{data.title || 'منتج'}</p>
        {data.price ? (
          <p style={{ margin: '4px 0 0', color: '#eab308', fontWeight: 800, fontSize: '0.82rem' }}>{data.price}</p>
        ) : null}
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(0,188,212,0.2)' }}>
          <p style={{ margin: 0, color: 'rgba(150,200,200,0.65)', fontSize: '0.68rem', fontWeight: 600 }}>الاستفسار</p>
          <p style={{ margin: '4px 0 0', color: 'rgba(200,230,230,0.95)', fontSize: '0.84rem', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
            {data.question}
          </p>
        </div>
      </div>
    </div>
  );
}
function parseStoryReply(body: string | null | undefined): { mediaUrl: string; mediaType: string; comment: string } | null {
  if (!body || typeof body !== 'string') return null;
  const isStory = body.startsWith(STORY_REPLY_PREFIX);
  const isShare = body.startsWith(POST_SHARE_PREFIX);
  if (!isStory && !isShare) return null;
  const raw = body.slice(isStory ? STORY_REPLY_PREFIX.length : POST_SHARE_PREFIX.length);
  try {
    let data: {
      mediaUrl?: string;
      mediaType?: string;
      comment?: string;
      url?: string;
      src?: string;
      imageUrl?: string;
      videoUrl?: string;
      mediaUrls?: string[];
    };
    try {
      data = JSON.parse(raw);
    } catch {
      try {
        data = JSON.parse(decodeURIComponent(escape(atob(raw))));
      } catch {
        return null;
      }
    }
    const mediaUrl = String(
      data.mediaUrl || data.url || data.src || data.imageUrl || data.videoUrl || (data.mediaUrls && data.mediaUrls[0]) || ''
    ).trim();
    if (!mediaUrl && !(data?.comment)) return null;
    const looksVideo = /\.(mp4|webm|mov|m4v|mkv|avi|3gp|ogv)(\?|$)/i.test(mediaUrl)
      || String(data.mediaType || '').toLowerCase().includes('video');
    return {
      mediaUrl,
      mediaType: (data.mediaType || (mediaUrl ? (looksVideo ? 'video' : 'image') : 'text')).toLowerCase(),
      comment: data.comment || '',
    };
  } catch {
    return null;
  }
}

function StoryReplyBubble({
  mediaUrl,
  mediaType,
  comment,
  timeLabel,
  isMe,
}: {
  mediaUrl: string;
  mediaType: string;
  comment: string;
  timeLabel: string;
  isMe: boolean;
}) {
  const [open, setOpen] = useState(false);
  const resolved = resolveMediaUrl(mediaUrl) || (mediaUrl || '').trim();
  const isVideo = (mediaType || '').includes('video') || /\.(mp4|webm|mov|m4v|mkv|avi|3gp|ogv)(\?|$)/i.test(resolved);
  const hasMedia = !!(resolved && (resolved.startsWith('http') || resolved.startsWith('/') || resolved.startsWith('blob:') || resolved.startsWith('data:')));
  return (
    <div style={{
      position: 'relative',
      width: '100%',
      maxWidth: 260,
      overflow: 'hidden',
      borderRadius: 12,
      background: '#0a1212',
      border: '1px solid rgba(0,188,212,0.2)',
    }}>
      {/* الوسائط — صورة أو فيديو إن وُجدت؛ وإلا نص فقط في نفس المربع */}
      {!hasMedia ? null : isVideo ? (
        <video
          src={resolved}
          controls
          playsInline
          style={{ display: 'block', width: '100%', maxHeight: 320, objectFit: 'cover', background: '#000' }}
        />
      ) : (
        <>
          <img
            src={resolved}
            alt="Story"
            onClick={() => setOpen(true)}
            style={{
              display: 'block', width: '100%', maxHeight: 320, objectFit: 'cover', cursor: 'pointer',
            }}
            loading="lazy"
          />
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setOpen(false)}
                style={{
                  position: 'fixed', inset: 0, zIndex: 200,
                  background: 'hsl(var(--background)/0.95)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', color: 'hsl(var(--foreground))', cursor: 'pointer' }}
                >
                  <X size={28} />
                </button>
                <img src={resolved} alt="Full size" style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: 12 }} />
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* شريط سفلي داخل نفس إطار الصورة: التعليق يسار + الوقت يمين */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 8,
        padding: hasMedia ? '8px 10px 9px' : '12px 12px 10px',
        background: hasMedia
          ? 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0.72) 100%)'
          : 'rgba(0,188,212,0.08)',
        marginTop: hasMedia ? -36 : 0,
        position: 'relative',
        zIndex: 1,
        minHeight: hasMedia ? undefined : 48,
      }}>
        <p style={{
          flex: 1,
          margin: 0,
          color: '#fff',
          fontSize: '0.84rem',
          lineHeight: 1.35,
          fontWeight: 600,
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
          textShadow: '0 1px 3px rgba(0,0,0,0.65)',
        }}>
          {comment}
        </p>
        <span style={{
          flexShrink: 0,
          color: 'rgba(255,255,255,0.78)',
          fontSize: '0.62rem',
          fontWeight: 600,
          paddingBottom: 1,
          whiteSpace: 'nowrap',
        }}>
          {timeLabel}
        </span>
      </div>
    </div>
  );
}

function resolveMediaUrl(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = String(raw).trim();
  if (!s) return '';
  if (s.startsWith(POST_SHARE_PREFIX) || s.startsWith(STORY_REPLY_PREFIX)) {
    const parsed = parseStoryReply(s);
    if (parsed?.mediaUrl) s = parsed.mediaUrl;
  }
  if ((s.startsWith('{') && s.includes('}')) || s.startsWith('[')) {
    try {
      const p = JSON.parse(s);
      if (p && typeof p === 'object') {
        const u = p.url || p.src || p.mediaUrl || p.imageUrl || p.videoUrl || p.path || p.href
          || p.fileUrl || p.publicUrl || p.downloadUrl
          || (Array.isArray(p.mediaUrls) ? p.mediaUrls[0] : null);
        if (u) s = String(u);
      }
    } catch { /* plain */ }
  }
  const quoted = s.match(/https?:\/\/[^\s"'<>]+/i);
  if (quoted && !s.startsWith('http') && !s.startsWith('/') && !s.startsWith('blob:') && !s.startsWith('data:')) {
    s = quoted[0];
  }
  s = String(s).trim().replace(/^"+|"+$/g, '');
  if (s.startsWith('//')) return `https:${s}`;
  if (s.startsWith('uploads/') || s.startsWith('media/') || s.startsWith('files/')) return `/${s}`;
  return s;
}

function isLikelyImageUrl(url: string): boolean {
  const u = url.toLowerCase().split('?')[0];
  return /\.(jpg|jpeg|png|gif|webp|bmp|heic|heif|avif|svg)$/i.test(u)
    || u.includes('/image') || u.includes('/images/') || u.includes('secret-chat/image');
}

function isLikelyVideoUrl(url: string): boolean {
  const u = url.toLowerCase().split('?')[0];
  return /\.(mp4|webm|mov|m4v|mkv|avi|3gp|ogv)$/i.test(u)
    || u.includes('/video') || u.includes('video-note');
}

const LOCATION_PREFIX = '__LOCATION__';

function parseLocationBody(body: string | null | undefined): { lat: number; lng: number; label?: string; live?: boolean } | null {
  if (!body || typeof body !== 'string' || !body.startsWith(LOCATION_PREFIX)) return null;
  try {
    const loc = JSON.parse(body.slice(LOCATION_PREFIX.length)) as { lat?: number; lng?: number; label?: string; live?: boolean };
    const lat = Number(loc?.lat);
    const lng = Number(loc?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, label: loc.label, live: !!loc.live };
  } catch {
    return null;
  }
}

function googleEmbedSrc(lat: number, lng: number): string {
  return `https://maps.google.com/maps?q=${lat},${lng}&z=16&output=embed`;
}

function osmEmbedSrc(lat: number, lng: number, _zoomDelta = 0.012): string {
  return googleEmbedSrc(lat, lng);
}

function MapPanZoom({ lat, lng, children }: { lat: number; lng: number; children?: React.ReactNode }) {
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; dist?: number; z?: number } | null>(null);
  const span = Math.max(0.004, 0.018 / zoom);
  const src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/export?bbox=${lng-span},${lat-span},${lng+span},${lat+span}&bboxSR=4326&imageSR=3857&size=900,1600&format=png&f=image`;
  return (
    <div
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', touchAction: 'none' }}
      onPointerDown={e => {
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y };
      }}
      onPointerMove={e => {
        if (!drag.current) return;
        setOff({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) });
      }}
      onPointerUp={() => { drag.current = null; }}
      onWheel={e => {
        e.preventDefault();
        setZoom(z => Math.min(4, Math.max(0.6, z + (e.deltaY < 0 ? 0.12 : -0.12))));
      }}
      onTouchStart={e => {
        if (e.touches.length === 2) {
          const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
          drag.current = { x: 0, y: 0, ox: off.x, oy: off.y, dist: d, z: zoom };
        }
      }}
      onTouchMove={e => {
        if (e.touches.length === 2 && drag.current?.dist) {
          const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
          setZoom(Math.min(4, Math.max(0.6, (drag.current.z || 1) * (d / drag.current.dist))));
        }
      }}
    >
      <img alt="" src={src} draggable={false} style={{
        position: 'absolute', left: '50%', top: '50%',
        width: '140%', height: '140%', objectFit: 'cover',
        transform: `translate(calc(-50% + ${off.x}px), calc(-50% + ${off.y}px)) scale(${zoom})`,
        transformOrigin: 'center center', pointerEvents: 'none', userSelect: 'none',
      }} />
      {children}
    </div>
  );
}

function LocationMapBubble({
  lat,
  lng,
  label,
  live,
  name,
  username,
  avatarUrl,
}: {
  lat: number;
  lng: number;
  label?: string;
  live?: boolean;
  name?: string;
  username?: string | null;
  avatarUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [them, setThem] = useState({ lat, lng });
  useEffect(() => {
    if (!open) return;
    let watch = 0;
    if (navigator.geolocation) {
      watch = navigator.geolocation.watchPosition(
        pos => setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { enableHighAccuracy: true },
      );
    }
    const id = window.setInterval(() => {
      if (!live) return;
      setThem(t => ({ lat: t.lat + (Math.random() - 0.5) * 0.00015, lng: t.lng + (Math.random() - 0.5) * 0.00015 }));
    }, 2500);
    return () => {
      if (watch) navigator.geolocation.clearWatch(watch);
      window.clearInterval(id);
    };
  }, [open, live]);
  const distKm = me
    ? Math.max(0.1, Math.hypot((them.lat - me.lat) * 111, (them.lng - me.lng) * 85))
    : 0;
  const etaMin = Math.max(1, Math.round((distKm / 30) * 60));
  const embed = `https://maps.google.com/maps?q=${them.lat},${them.lng}&z=15&output=embed`;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: 250, height: 52,
          borderRadius: 16, overflow: 'hidden', background: '#fff',
          border: '1px solid rgba(0,0,0,0.08)', padding: '0 8px', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{ position: 'relative', width: 52, height: 40, borderRadius: 10, overflow: 'hidden', background: '#e8f4f8', flexShrink: 0 }}>
          <iframe title="preview" src={embed} style={{ width: '160%', height: '160%', border: 0, pointerEvents: 'none', transform: 'scale(0.72)', transformOrigin: '0 0' }} />
          {live && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
            }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', overflow: 'hidden', border: '2px solid #22c55e', background: '#eee' }}>
                {avatarUrl ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
              </div>
            </div>
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          {live ? (
            <p style={{ margin: 0, fontSize: 12, color: '#111', fontWeight: 600 }}>Live location</p>
          ) : (
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#111' }}>{label || 'Location'}</p>
          )}
          <p style={{ margin: 0, fontSize: 10, color: '#667781' }}>{username ? `@${String(username).replace(/^@/, '')}` : ''}</p>
        </div>
      </button>
      {open && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 40000, background: '#0a1a1c' }}>
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{
              position: 'absolute', top: 14, left: 12, zIndex: 3, width: 36, height: 36, borderRadius: '50%',
              border: '1px solid rgba(0,0,0,0.12)', background: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1,
            }}
          >
            <X size={18} color="#111" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (me) setThem({ lat: me.lat, lng: me.lng });
            }}
            style={{
              position: 'absolute', bottom: 28, right: 14, zIndex: 4, width: 44, height: 44, borderRadius: '50%',
              border: '1px solid rgba(0,0,0,0.12)', background: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            }}
          >
            <MapPin size={18} color="#111" />
          </button>
          <MapPanZoom lat={them.lat} lng={them.lng} />
          <div style={{
            position: 'absolute', left: '50%', top: '46%', transform: 'translate(-50%, -50%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none', zIndex: 3,
          }}>
            <div style={{
              width: 58, height: 58, borderRadius: '50%', overflow: 'hidden',
              border: '3px solid #22c55e', background: '#eee', boxShadow: '0 6px 16px rgba(0,0,0,0.28)',
            }}>
              {avatarUrl ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
            </div>
            <span style={{
              marginTop: 6, padding: '3px 10px', borderRadius: 999,
              background: '#06261f', color: '#fff', fontWeight: 800, fontSize: 12,
            }}>
              {username ? `@${String(username).replace(/^@/, '')}` : (name || 'User')}
            </span>
          </div>
        </div>
      , document.body)}
    </>
  );
}

const nudgeBtnStyle: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 10,
  border: '1px solid rgba(0,188,212,0.35)',
  background: 'rgba(6,20,22,0.88)',
  color: '#00BCD4',
  fontWeight: 800,
  cursor: 'pointer',
};

function LocationPickerOverlay({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (lat: number, lng: number, live?: boolean) => void;
}) {
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const applyPosition = useCallback((la: number, ln: number) => {
    setLat(la);
    setLng(ln);
    setLoading(false);
    setErr('');
  }, []);

  const readGps = useCallback(() => {
    if (!navigator.geolocation) {
      setErr('Location is not available on this device.');
      setLoading(false);
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => applyPosition(pos.coords.latitude, pos.coords.longitude),
      () => {
        setErr('Could not get location. Check permission settings.');
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 8000 },
    );
  }, [applyPosition]);

  useEffect(() => { readGps(); }, [readGps]);

  const nudge = (dLat: number, dLng: number) => {
    if (lat == null || lng == null) return;
    setLat(lat + dLat);
    setLng(lng + dLng);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1400,
        background: 'rgba(4,12,14,0.96)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', paddingTop: 'max(10px, env(safe-area-inset-top))',
        borderBottom: `1px solid ${T.primaryBorder}`,
      }}>
        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: T.primary, cursor: 'pointer', padding: 2 }}>
          <X size={22} />
        </button>
        <p style={{ margin: 0, flex: 1, color: T.primary, fontWeight: 800, fontSize: '0.95rem' }}>Pick location</p>
      </div>
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {lat != null && lng != null ? (
          <MapPanZoom lat={lat} lng={lng} />
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textDim }}>
            {loading ? 'Locating…' : (err || 'No location')}
          </div>
        )}
        {lat != null && lng != null && (
          <div style={{
            position: 'absolute', left: '50%', top: '46%', transform: 'translate(-50%, -100%)',
            pointerEvents: 'none',
          }}>
            <MapPin size={36} color="#ea4335" fill="#ea4335" />
          </div>
        )}
      </div>
      <div style={{
        padding: '8px 14px max(14px, env(safe-area-inset-bottom))',
        borderTop: '1px solid #eee',
        display: 'flex', flexDirection: 'column', gap: 2,
        background: '#fff',
      }}>
        {err ? <p style={{ margin: '6px 0', color: T.red, fontSize: '0.75rem' }}>{err}</p> : null}
        <button
          type="button"
          disabled={lat == null || lng == null}
          onClick={() => { if (lat != null && lng != null) onConfirm(lat, lng, true); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px',
            background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', color: '#111',
          }}
        >
          <span style={{ width: 36, height: 36, borderRadius: '50%', background: '#111', color: '#fff', display: 'grid', placeItems: 'center' }}>
            <MapPin size={16} />
          </span>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Share live location</span>
        </button>
        <button
          type="button"
          disabled={lat == null || lng == null}
          onClick={() => { if (lat != null && lng != null) onConfirm(lat, lng, false); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px',
            background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', color: '#111',
          }}
        >
          <span style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid #111', display: 'grid', placeItems: 'center' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#111' }} />
          </span>
          <span>
            <span style={{ display: 'block', fontWeight: 600, fontSize: 15 }}>Send your current location</span>
            <span style={{ display: 'block', color: '#667781', fontSize: 12 }}>{loading ? 'Locating…' : 'Accurate to GPS'}</span>
          </span>
        </button>
      </div>
    </motion.div>
  );
}

function ImageBubble({
  url
}: {
  url: string;
}) {
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  const src = resolveMediaUrl(url);
  const looksLikeUrl = !!src && (src.startsWith('http') || src.startsWith('/') || src.startsWith('blob:') || src.startsWith('data:'));
  if (!src || !looksLikeUrl || broken) {
    return (
      <div style={{
        padding: '12px 14px', maxWidth: 220,
        display: 'flex', alignItems: 'center', gap: 8, color: T.textDim, fontSize: '0.82rem',
      }}>
        <ImageIcon size={18} />
        <span>Shared image</span>
      </div>
    );
  }
  return <>
      <img src={src} alt="" onClick={() => setOpen(true)} onError={() => setBroken(true)} style={{
      display: 'block',
      width: '100%',
      maxWidth: 240,
      height: 'auto',
      maxHeight: 300,
      borderRadius: 8,
      cursor: 'pointer',
      objectFit: 'cover',
    }} loading="lazy" />
      <AnimatePresence>
        {open && <motion.div initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} exit={{
        opacity: 0
      }} onClick={() => setOpen(false)} style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'hsl(var(--background)/0.95)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }}>
            <button onClick={() => setOpen(false)} style={{
          position: 'absolute',
          top: 20,
          right: 20,
          background: 'none',
          border: 'none',
          color: 'hsl(var(--foreground))',
          cursor: 'pointer'
        }}>
              <X size={28} />
            </button>
            <img src={src} alt="" style={{
          maxWidth: '100%',
          maxHeight: '90vh',
          objectFit: 'contain',
          borderRadius: 12
        }} />
          </motion.div>}
      </AnimatePresence>
    </>;
}

// ─── Call Bubble (logged "missed" / "answered" call messages) ─────────────────
function CallBubble({
  body,
  duration,
  isMe
}: {
  body: string | null;
  duration: number | null;
  isMe: boolean;
}) {
  const missed = body === 'missed';
  const label = missed ? 'Missed call' : duration ? `Call · ${fmtCallDuration(duration)}` : 'Call';
  return <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
  }}>
      <Phone size={15} strokeWidth={2.2} style={{ color: missed ? T.red : T.primary, flexShrink: 0 }} />
      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: missed ? T.red : T.text }}>
        {label}
      </span>
    </div>;
}

// ─── Swipeable message row ────────────────────────────────────────────────────

// ─── Video / Video-note helpers ───────────────────────────────────────────────
function parseVideoBody(body: string): { url: string; isNote: boolean; duration: number | null; name: string } {
  let url = resolveMediaUrl(body) || body;
  let isNote = false;
  let duration: number | null = null;
  let name = '';
  try {
    const p = JSON.parse(body);
    if (p?.url) url = resolveMediaUrl(String(p.url)) || String(p.url);
    if (p?.name) name = String(p.name);
    if (p?.duration != null) duration = Number(p.duration) || null;
    if (p?.isVideoNote || p?.videoNote || p?.note) isNote = true;
  } catch {/* plain URL */}
  if (!isNote) {
    isNote = /video-note/i.test(url) || /video-note/i.test(name) || /video-note/i.test(body);
  }
  return { url, isNote, duration, name };
}

/** Video note — فقاعة دائرية: اضغط للتشغيل، تنتهي وتتوقف (بدون عناصر الفيديو العادي) */
function VideoNoteBubble({
  body,
  duration,
}: {
  body: string;
  duration: number | null;
}) {
  const { url, duration: bodyDur } = parseVideoBody(body);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(duration ?? bodyDur ?? 0);
  const [current, setCurrent] = useState(0);

  function toggle() {
    buzzChat();
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }

  const displaySecs = playing ? current : (total || duration || bodyDur || 0);
  const label = `${Math.floor(displaySecs / 60)}:${String(Math.floor(displaySecs % 60)).padStart(2, '0')}`;
  const ring = `conic-gradient(#86efac ${progress * 360}deg, rgba(255,255,255,0.22) 0deg)`;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={playing ? 'إيقاف' : 'تشغيل Video note'}
      style={{
        position: 'relative',
        width: 220,
        height: 220,
        padding: 0,
        border: 'none',
        borderRadius: '50%',
        background: 'transparent',
        cursor: 'pointer',
        display: 'block',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* progress ring */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: ring,
        padding: 3,
      }}>
        <div style={{
          width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden',
          background: '#2a2420', position: 'relative',
        }}>
          <video
            ref={videoRef}
            src={url}
            playsInline
            preload="metadata"
            onLoadedMetadata={e => {
              const d = e.currentTarget.duration;
              if (Number.isFinite(d) && d > 0) setTotal(d);
            }}
            onTimeUpdate={e => {
              const a = e.currentTarget;
              const d = a.duration || total || 1;
              setProgress(d ? a.currentTime / d : 0);
              setCurrent(a.currentTime);
            }}
            onEnded={() => {
              setPlaying(false);
              setProgress(0);
              setCurrent(0);
              if (videoRef.current) videoRef.current.currentTime = 0;
            }}
            onPause={() => setPlaying(false)}
            onPlay={() => setPlaying(true)}
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              display: 'block', pointerEvents: 'none',
            }}
          />
          {/* duration badge */}
          <span style={{
            position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
            color: '#fff', fontSize: '0.78rem', fontWeight: 700,
            textShadow: '0 1px 4px rgba(0,0,0,0.7)',
            fontVariantNumeric: 'tabular-nums',
            pointerEvents: 'none',
          }}>
            {label}
          </span>
        </div>
      </div>
    </button>
  );
}

// ─── Video Bubble ─────────────────────────────────────────────────────────────
function ChatVideoBubble({
  body,
  duration,
}: {
  body: string;
  duration?: number | null;
}) {
  const meta = parseVideoBody(body);
  if (meta.isNote) {
    return <VideoNoteBubble body={body} duration={duration ?? meta.duration} />;
  }
  return <ChatInlineVideoPlayer src={meta.url} knownDuration={duration ?? meta.duration} />;
}

/** In-frame video: play/pause, seek, time — controls inside the frame (post-style). */
function ChatInlineVideoPlayer({
  src,
  knownDuration,
}: {
  src: string;
  knownDuration?: number | null;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(Number(knownDuration) > 0 ? Number(knownDuration) : 0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const seekingRef = useRef(false);

  useEffect(() => {
    setControlsVisible(true);
    const t = window.setTimeout(() => setControlsVisible(false), 2200);
    return () => window.clearTimeout(t);
  }, [src]);

  useEffect(() => {
    if (!controlsVisible) return;
    const t = window.setTimeout(() => setControlsVisible(false), 2200);
    return () => window.clearTimeout(t);
  }, [controlsVisible]);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      v.pause();
      setPlaying(false);
    }
  }

  function onSeek(val: number) {
    const v = videoRef.current;
    if (!v || !Number.isFinite(val)) return;
    v.currentTime = val;
    setCurrent(val);
  }

  const clock = (sec: number) => {
    const s = Math.max(0, Math.floor(sec || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  return (
    <div style={{
      position: 'relative', width: '100%', maxWidth: 240, borderRadius: 8, overflow: 'hidden',
      background: '#000',
    }}>
      <video
        ref={videoRef}
        src={src}
        playsInline
        preload="metadata"
        controls={false}
        onClick={(e) => {
          e.stopPropagation();
          if (!controlsVisible) {
            setControlsVisible(true);
            return;
          }
          togglePlay();
        }}
        onTimeUpdate={() => {
          const v = videoRef.current;
          if (!v || seekingRef.current) return;
          setCurrent(v.currentTime || 0);
        }}
        onLoadedMetadata={() => {
          const v = videoRef.current;
          if (v && Number.isFinite(v.duration) && v.duration > 0) setDuration(v.duration);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        style={{
          display: 'block', width: '100%', maxHeight: 280, objectFit: 'cover',
          background: '#000', cursor: 'pointer',
        }}
      />
      {!playing && (
        <div
          onClick={(e) => { e.stopPropagation(); togglePlay(); setControlsVisible(true); }}
          style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.25)', pointerEvents: 'auto',
          }}
        >
          <div style={{
            width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,188,212,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Play size={18} color="#041018" fill="#041018" style={{ marginLeft: 2 }} />
          </div>
        </div>
      )}
      {controlsVisible && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 3,
            padding: '8px 10px 10px',
            background: 'linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.3) 70%, transparent 100%)',
            display: 'flex', flexDirection: 'column', gap: 6,
          }}
        >
          <input
            type="range"
            min={0}
            max={duration > 0 ? duration : 0}
            step={0.05}
            value={Math.min(current, duration || 0)}
            onChange={(e) => onSeek(Number(e.target.value))}
            onMouseDown={() => { seekingRef.current = true; }}
            onMouseUp={(e) => { seekingRef.current = false; onSeek(Number((e.target as HTMLInputElement).value)); }}
            onTouchStart={() => { seekingRef.current = true; }}
            onTouchEnd={(e) => { seekingRef.current = false; onSeek(Number((e.target as HTMLInputElement).value)); }}
            aria-label="Seek"
            style={{ width: '100%', height: 4, margin: 0, padding: 0, cursor: 'pointer', accentColor: '#00BCD4' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={() => togglePlay()}
              style={{
                width: 28, height: 28, borderRadius: '50%', border: 'none',
                background: 'rgba(0,188,212,0.25)', color: '#00BCD4', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
              }}
            >
              {playing ? (
                <span style={{ display: 'flex', gap: 2 }}>
                  <span style={{ width: 3, height: 10, background: '#00BCD4', borderRadius: 1 }} />
                  <span style={{ width: 3, height: 10, background: '#00BCD4', borderRadius: 1 }} />
                </span>
              ) : (
                <Play size={12} fill="currentColor" strokeWidth={0} style={{ marginLeft: 1 }} />
              )}
            </button>
            <span style={{ color: '#fff', fontSize: '0.68rem', fontWeight: 700, textShadow: '0 1px 2px #000' }}>
              {clock(current)} / {clock(duration)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Streak Bubble ────────────────────────────────────────────────────────────
/**
 * StreakBubble — one-view ephemeral photo/video.
 * Snapchat-style streak bubble — rectangle, filled when unopened.
 * Yellow = photo  |  Purple = video
 */
function StreakBubble({ msg, isMe }: { msg: Message; isMe: boolean }) {
  const isPhoto     = msg.streakMediaType !== 'video';
  const accentColor = isPhoto ? '#facc15' : '#a855f7';
  const accentGlow  = isPhoto
    ? '0 0 18px rgba(250,204,21,0.65)'
    : '0 0 18px rgba(168,85,247,0.65)';
  const label = isPhoto ? 'صورة' : 'فيديو';

  const [opened,    setOpened]    = useState(!!msg.streakOpenedAt);
  const [viewing,   setViewing]   = useState(false);
  const [mediaUrl,  setMediaUrl]  = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function handleOpen() {
    if (isMe || opened || viewing) return;
    try {
      const r    = await fetch('/api/secret-chat/streak-open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ msgId: msg.id }),
      });
      const data = await r.json();
      if (data.alreadyOpened) { setOpened(true); return; }
      if (!data.url) return;
      setMediaUrl(data.url);
      const dur = data.duration ?? (isPhoto ? 5 : 15);
      setCountdown(dur);
      setViewing(true);
      timerRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            setViewing(false);
            setOpened(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch { /* silent */ }
  }

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // ── Full-screen viewing overlay ──
  if (viewing && mediaUrl) {
    return (
      <>
        <div style={{ width: 180, height: 60 }} />
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'hsl(var(--background))',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            position: 'absolute', top: 24, right: 24,
            background: accentColor, borderRadius: '50%',
            width: 40, height: 40,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: 17,
            color: 'hsl(var(--background))', boxShadow: accentGlow,
          }}>
            {countdown}
          </div>
          {isPhoto
            ? <img src={mediaUrl} alt="streak" style={{ maxWidth: '100%', maxHeight: '88vh', objectFit: 'contain' }} />
            : <video src={mediaUrl} autoPlay playsInline style={{ maxWidth: '100%', maxHeight: '88vh' }} />
          }
          <p style={{ color: accentColor, marginTop: 14, fontSize: '0.78rem', fontWeight: 700 }}>
            {isPhoto ? 'ستُغلق الصورة خلال' : 'سيُغلق الفيديو خلال'} {countdown}ث
          </p>
        </div>
      </>
    );
  }

  // ── Snapchat-style filled rectangle ──
  const isFilled = !isMe && !opened;

  return (
    <div
      onClick={handleOpen}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 20px',
        borderRadius: 14,
        border: `2.5px solid ${opened ? 'hsl(var(--border))' : accentColor}`,
        background: isFilled ? accentColor : 'transparent',
        boxShadow: isFilled ? accentGlow : 'none',
        cursor: isMe || opened ? 'default' : 'pointer',
        minWidth: 170,
        maxWidth: 230,
        transition: 'all 0.2s',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {isFilled && <span className="streak-rect-shimmer" />}

      <span style={{
        width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
        background: isFilled
          ? 'rgba(0,0,0,0.18)'
          : opened ? 'hsl(var(--muted))' : `${accentColor}22`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Camera size={18} strokeWidth={2.2}
          color={isFilled
            ? 'hsl(var(--background))'
            : opened ? 'hsl(var(--muted-foreground))' : accentColor}
        />
      </span>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{
          fontWeight: 800, fontSize: '0.9rem', lineHeight: 1,
          color: isFilled
            ? 'hsl(var(--background))'
            : opened ? 'hsl(var(--muted-foreground))' : accentColor,
        }}>
          {label}
        </span>
        <span style={{
          fontSize: '0.68rem', lineHeight: 1,
          color: 'hsl(var(--muted-foreground))',
        }}>
          {isMe ? 'أرسلت ستريك' : opened ? 'تم الفتح ✓' : 'اضغط للفتح'}
        </span>
      </div>
    </div>
  );
}

// ─── File Bubble ──────────────────────────────────────────────────────────────
const FILE_ICONS: Record<string, string> = {
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
function ChatFileBubble({
  body,
  isMe
}: {
  body: string;
  isMe: boolean;
}) {
  let url = body;
  let name = body.split('/').pop() ?? 'file';
  let ext = '';
  try {
    const p = JSON.parse(body);
    if (p?.url) {
      url = p.url;
      name = p.name || name;
      ext = p.ext || '';
    }
  } catch {/* plain URL */}
  const icon = FILE_ICONS[ext] ?? '📎';
  return <a href={url} target="_blank" rel="noopener noreferrer" download={name} style={{
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    textDecoration: 'none',
    minWidth: 140,
    maxWidth: 220
  }}>
      <span style={{
      fontSize: '1.5rem',
      flexShrink: 0
    }}>{icon}</span>
      <div style={{
      overflow: 'hidden'
    }}>
        <p style={{
        color: isMe ? 'hsl(var(--primary))' : 'hsl(var(--foreground))',
        fontSize: '0.82rem',
        fontWeight: 600,
        margin: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: 160
      }}>{name}</p>
        <p style={{
        color: 'hsl(var(--muted-foreground))',
        fontSize: '0.68rem',
        margin: 0,
        textTransform: 'uppercase'
      }}>{ext || 'file'}</p>
      </div>
    </a>;
}
interface SwipeRowProps {
  isMe: boolean;
  onReply: () => void;
  children: React.ReactNode;
}
function SwipeRow({
  isMe,
  onReply,
  children
}: SwipeRowProps) {
  const x = useMotionValue(0);
  const replyOpacity = useTransform(x, isMe ? [-60, -20] : [20, 60], [1, 0]);
  const replyScale = useTransform(x, isMe ? [-60, -20] : [20, 60], [1, 0.5]);
  const triggered = useRef(false);
  function handleDragEnd() {
    const val = x.get();
    const threshold = isMe ? -50 : 50;
    if (isMe && val < threshold || !isMe && val > threshold) {
      if (!triggered.current) {
        triggered.current = true;
        onReply();
      }
    }
    triggered.current = false;
    x.set(0);
  }
  const replyIcon = <motion.div style={{
    position: 'absolute',
    [isMe ? 'left' : 'right']: -36,
    top: '50%',
    translateY: '-50%',
    opacity: replyOpacity,
    scale: replyScale,
    color: T.primary,
    pointerEvents: 'none'
  }}>
      <Reply size={18} strokeWidth={2} />
    </motion.div>;
  return (
    // touchAction: 'pan-y' lets the browser's native vertical scroll pass through
    // this row untouched — without it, Framer Motion's horizontal drag gesture
    // below can swallow vertical touch scrolling on mobile/WebView, which is what
    // made the whole chat feel unscrollable.
    <div style={{
      position: 'relative',
      overflow: 'hidden',
      touchAction: 'pan-y'
    }}>
      {replyIcon}
      <motion.div drag="x"
      // dragDirectionLock makes Framer Motion look at the very first bit of
      // pointer movement and decide "this is a vertical scroll" vs "this is a
      // horizontal swipe" — once locked to vertical it releases the gesture to
      // the browser instead of capturing it as a drag.
      dragDirectionLock dragConstraints={{
        left: isMe ? -70 : 0,
        right: isMe ? 0 : 70
      }} dragElastic={0.2} style={{
        x,
        touchAction: 'pan-y'
      }} onDragEnd={handleDragEnd}>
        {children}
      </motion.div>
    </div>
  );
}

// ─── Message action menu ──────────────────────────────────────────────────────
interface ActionMenuProps {
  isMe: boolean;
  msgType: 'text' | 'voice' | 'image' | 'video' | 'file' | 'call';
  msgBody: string | null;
  canEdit: boolean;
  onReply: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}
function ActionMenu({
  isMe,
  msgType,
  msgBody,
  canEdit,
  onReply,
  onCopy,
  onEdit,
  onDelete,
  onClose
}: ActionMenuProps) {
  return <motion.div initial={{
    opacity: 0,
    scale: 0.9,
    y: -6
  }} animate={{
    opacity: 1,
    scale: 1,
    y: 0
  }} exit={{
    opacity: 0,
    scale: 0.9,
    y: -6
  }} transition={{
    duration: 0.12
  }} style={{
    position: 'absolute',
    [isMe ? 'right' : 'left']: 0,
    bottom: '110%',
    zIndex: 50,
    background: 'rgba(6,14,14,0.97)',
    border: `1px solid ${T.primaryBorder}`,
    borderRadius: 12,
    padding: '4px 0',
    minWidth: 150,
    backdropFilter: 'blur(16px)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)'
  }} onClick={e => e.stopPropagation()}>
      <ActionBtn icon={<Reply size={14} />} label="Reply" onClick={() => {
      onReply();
      onClose();
    }} />
      {msgType === 'text' && msgBody && <ActionBtn icon={<Copy size={14} />} label="Copy" onClick={() => {
      onCopy();
      onClose();
    }} />}
      {isMe && msgType === 'text' && canEdit && <ActionBtn icon={<Pencil size={14} />} label="Edit" onClick={() => {
      onEdit();
      onClose();
    }} />}
      {isMe && <ActionBtn icon={<Trash2 size={14} />} label="Delete" onClick={() => {
      onDelete();
      onClose();
    }} danger />}
    </motion.div>;
}
function ActionBtn({
  icon,
  label,
  onClick,
  danger
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return <motion.button whileTap={{
    scale: 0.95
  }} onClick={onClick} style={{
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '10px 14px',
    background: 'none',
    border: 'none',
    color: danger ? T.red : T.text,
    fontSize: '0.82rem',
    cursor: 'pointer',
    transition: 'background 0.1s'
  }} onMouseEnter={e => {
    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
  }} onMouseLeave={e => {
    (e.currentTarget as HTMLButtonElement).style.background = 'none';
  }}>
      <span style={{
      color: danger ? T.red : T.primaryDim
    }}>{icon}</span>
      {label}
    </motion.button>;
}

// ─── Group Info Modal ─────────────────────────────────────────────────────────
interface GroupInfo {
  id: number;
  name: string;
  avatarUrl: string | null;
  createdBy: string;
  members: {
    id: string | null;
    name: string | null;
    username: string | null;
    avatarUrl: string | null;
  }[];
}
interface FriendOption {
  friendId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
}
function GroupInfoModal({
  groupId,
  currentUserId,
  onClose,
  onNameChanged
}: {
  groupId: string;
  currentUserId: string;
  onClose: () => void;
  onNameChanged: (name: string, avatarUrl: string | null) => void;
}) {
  const [info, setInfo] = useState<GroupInfo | null>(null);
  const [editName, setEditName] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Add member panel
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [friendSearch, setFriendSearch] = useState('');
  const [friendOptions, setFriendOptions] = useState<FriendOption[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);

  // Remove member confirm
  const [confirmRemove, setConfirmRemove] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/groups/${groupId}`, {
      credentials: 'include'
    }).then(r => r.ok ? r.json() : null).then(d => {
      if (d) {
        setInfo(d);
        setEditName(d.name);
      }
    }).catch(() => {});
  }, [groupId]);

  // Load friends when add panel opens
  useEffect(() => {
    if (!showAddPanel) return;
    fetch('/api/friends', {
      credentials: 'include'
    }).then(r => r.ok ? r.json() : {
      accepted: []
    }).then((data: unknown) => {
      const list = (data as {
        accepted?: FriendOption[];
      })?.accepted;
      setFriendOptions(Array.isArray(list) ? list : []);
    }).catch(() => {});
  }, [showAddPanel]);
  const isCreator = info?.createdBy === currentUserId;
  const memberIds = new Set((info?.members ?? []).map(m => m.id));
  const filteredFriends = friendOptions.filter(f => {
    if (memberIds.has(f.friendId)) return false;
    if (!friendSearch.trim()) return true;
    const q = friendSearch.toLowerCase();
    return (f.name ?? '').toLowerCase().includes(q) || (f.username ?? '').toLowerCase().includes(q);
  });
  async function saveName() {
    if (!editName.trim() || !info) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/groups/${groupId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          name: editName.trim()
        })
      });
      if (r.ok) {
        const updated = await r.json();
        setInfo(prev => prev ? {
          ...prev,
          name: updated.name
        } : prev);
        onNameChanged(updated.name, info.avatarUrl);
        setEditing(false);
      }
    } catch {/* silent */} finally {
      setSaving(false);
    }
  }
  async function uploadAvatar(file: File) {
    try {
      const r = await fetch(`/api/groups/${groupId}/avatar`, {
        method: 'POST',
        headers: {
          'Content-Type': file.type
        },
        credentials: 'include',
        body: file
      });
      if (r.ok) {
        const {
          avatarUrl
        } = await r.json();
        setInfo(prev => prev ? {
          ...prev,
          avatarUrl
        } : prev);
        onNameChanged(info?.name ?? '', avatarUrl);
      }
    } catch {/* silent */}
  }
  async function addMember(friend: FriendOption) {
    setAddingId(friend.friendId);
    try {
      const r = await fetch(`/api/groups/${groupId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          userId: friend.friendId
        })
      });
      if (r.ok) {
        setInfo(prev => prev ? {
          ...prev,
          members: [...prev.members, {
            id: friend.friendId,
            name: friend.name,
            username: friend.username,
            avatarUrl: friend.avatarUrl
          }]
        } : prev);
        setShowAddPanel(false);
        setFriendSearch('');
      }
    } catch {/* silent */} finally {
      setAddingId(null);
    }
  }
  async function removeMember(userId: string) {
    setRemovingId(userId);
    try {
      const r = await fetch(`/api/groups/${groupId}/members/${userId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (r.ok) {
        setInfo(prev => prev ? {
          ...prev,
          members: prev.members.filter(m => m.id !== userId)
        } : prev);
        setConfirmRemove(null);
      }
    } catch {/* silent */} finally {
      setRemovingId(null);
    }
  }
  const avatarUrl = info?.avatarUrl ?? null;
  return <AnimatePresence>
      {/* Lightbox */}
      {lightbox && avatarUrl && <motion.div key="grp-lightbox" initial={{
      opacity: 0
    }} animate={{
      opacity: 1
    }} exit={{
      opacity: 0
    }} onClick={() => setLightbox(false)} style={{
      position: 'fixed',
      inset: 0,
      zIndex: 310,
      background: 'rgba(0,0,0,0.92)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'zoom-out'
    }}>
          <motion.img src={avatarUrl} alt="group" initial={{
        scale: 0.8,
        opacity: 0
      }} animate={{
        scale: 1,
        opacity: 1
      }} exit={{
        scale: 0.8,
        opacity: 0
      }} transition={{
        type: 'spring',
        stiffness: 300,
        damping: 26
      }} style={{
        maxWidth: '90vw',
        maxHeight: '90vh',
        borderRadius: 16,
        objectFit: 'contain',
        boxShadow: '0 0 60px rgba(0,188,212,0.3)'
      }} onClick={e => e.stopPropagation()} />
          <button onClick={() => setLightbox(false)} style={{
        position: 'fixed',
        top: 20,
        right: 20,
        background: 'rgba(255,255,255,0.1)',
        border: 'none',
        borderRadius: '50%',
        width: 36,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        color: '#fff'
      }}>
            <X size={18} />
          </button>
        </motion.div>}

      {/* Confirm remove dialog */}
      {confirmRemove && <motion.div key="grp-confirm-remove" initial={{
      opacity: 0
    }} animate={{
      opacity: 1
    }} exit={{
      opacity: 0
    }} style={{
      position: 'fixed',
      inset: 0,
      zIndex: 320,
      background: 'rgba(0,0,0,0.8)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24
    }} onClick={() => setConfirmRemove(null)}>
          <motion.div initial={{
        scale: 0.9,
        opacity: 0
      }} animate={{
        scale: 1,
        opacity: 1
      }} exit={{
        scale: 0.9,
        opacity: 0
      }} onClick={e => e.stopPropagation()} style={{
        background: 'rgba(6,14,14,0.98)',
        border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 16,
        padding: '22px 20px',
        width: '100%',
        maxWidth: 280,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        alignItems: 'center'
      }}>
            <div style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: 'rgba(239,68,68,0.12)',
          border: '1px solid rgba(239,68,68,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
              <UserMinus size={20} color="#ef4444" strokeWidth={2} />
            </div>
            <p style={{
          color: T.text,
          fontSize: '0.88rem',
          fontWeight: 700,
          margin: 0,
          textAlign: 'center'
        }}>
              إزالة {confirmRemove.name}؟
            </p>
            <p style={{
          color: T.textDim,
          fontSize: '0.75rem',
          margin: 0,
          textAlign: 'center',
          lineHeight: 1.5
        }}>
              سيُزال هذا العضو من القروب ولن يتمكن من رؤية الرسائل الجديدة.
            </p>
            <div style={{
          display: 'flex',
          gap: 10,
          width: '100%'
        }}>
              <motion.button whileTap={{
            scale: 0.95
          }} onClick={() => setConfirmRemove(null)} style={{
            flex: 1,
            padding: '9px',
            background: 'rgba(0,188,212,0.08)',
            border: '1px solid rgba(0,188,212,0.2)',
            borderRadius: 10,
            color: T.text,
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer'
          }}>
                إلغاء
              </motion.button>
              <motion.button whileTap={{
            scale: 0.95
          }} onClick={() => removeMember(confirmRemove.id)} disabled={removingId === confirmRemove.id} style={{
            flex: 1,
            padding: '9px',
            background: 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(239,68,68,0.35)',
            borderRadius: 10,
            color: '#ef4444',
            fontSize: '0.8rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5
          }}>
                {removingId === confirmRemove.id ? <motion.div animate={{
              rotate: 360
            }} transition={{
              duration: 0.7,
              repeat: Infinity,
              ease: 'linear'
            }} style={{
              width: 13,
              height: 13,
              borderRadius: '50%',
              border: '2px solid rgba(239,68,68,0.3)',
              borderTopColor: '#ef4444'
            }} /> : <><UserMinus size={13} strokeWidth={2} /> إزالة</>}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>}

      {/* Backdrop */}
      <motion.div key="grp-backdrop" initial={{
      opacity: 0
    }} animate={{
      opacity: 1
    }} exit={{
      opacity: 0
    }} onClick={onClose} style={{
      position: 'fixed',
      inset: 0,
      zIndex: 200,
      background: 'rgba(0,0,0,0.72)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
        <motion.div key="grp-card" initial={{
        opacity: 0,
        scale: 0.85,
        y: 30
      }} animate={{
        opacity: 1,
        scale: 1,
        y: 0
      }} exit={{
        opacity: 0,
        scale: 0.85,
        y: 30
      }} transition={{
        type: 'spring',
        stiffness: 320,
        damping: 28
      }} onClick={e => e.stopPropagation()} style={{
        width: 300,
        maxHeight: '82vh',
        overflowY: 'auto',
        background: 'linear-gradient(160deg, #0d2a2e 0%, #0a1a1a 100%)',
        border: '1px solid rgba(0,188,212,0.2)',
        borderRadius: 20,
        padding: '28px 20px 20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 0 40px rgba(0,188,212,0.15)',
        position: 'relative'
      }}>
          {/* Close */}
          <button onClick={onClose} style={{
          position: 'absolute',
          top: 12,
          right: 12,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'rgba(150,200,200,0.5)',
          padding: 4
        }}>
            <X size={16} />
          </button>

          {/* Group avatar */}
          <div style={{
          position: 'relative'
        }}>
            <div onClick={() => avatarUrl && setLightbox(true)} style={{
            width: 90,
            height: 90,
            borderRadius: '50%',
            border: '3px solid #00BCD4',
            boxShadow: '0 0 20px rgba(0,188,212,0.3)',
            overflow: 'hidden',
            cursor: avatarUrl ? 'zoom-in' : 'default',
            background: 'rgba(0,188,212,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
              {avatarUrl ? <img src={avatarUrl} alt="group" style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }} /> : <span style={{
              fontSize: '2rem',
              fontWeight: 700,
              color: '#00BCD4'
            }}>
                  {(info?.name ?? 'G').charAt(0).toUpperCase()}
                </span>}
            </div>
            {/* Camera button for creator */}
            {isCreator && <>
                <input ref={fileRef} type="file" accept="image/*,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.bmp,.svg" style={{
              display: 'none'
            }} onChange={e => {
              const f = e.target.files?.[0];
              if (f) uploadAvatar(f);
              e.target.value = '';
            }} />
                <motion.button whileTap={{
              scale: 0.88
            }} onClick={() => fileRef.current?.click()} style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: '#00BCD4',
              border: '2px solid #0a1a1a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#000'
            }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </motion.button>
              </>}
          </div>

          {/* Group name — editable for creator */}
          {editing ? <div style={{
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          width: '100%'
        }}>
              <input autoFocus value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => {
            if (e.key === 'Enter') saveName();
            if (e.key === 'Escape') setEditing(false);
          }} style={{
            flex: 1,
            background: 'rgba(0,188,212,0.08)',
            border: '1px solid rgba(0,188,212,0.3)',
            borderRadius: 8,
            padding: '6px 10px',
            color: T.text,
            fontSize: '0.9rem',
            outline: 'none'
          }} />
              <motion.button whileTap={{
            scale: 0.88
          }} onClick={saveName} disabled={saving} style={{
            background: '#00BCD4',
            border: 'none',
            borderRadius: 8,
            padding: '6px 12px',
            color: '#000',
            fontWeight: 600,
            fontSize: '0.8rem',
            cursor: 'pointer'
          }}>
                {saving ? '...' : 'Save'}
              </motion.button>
              <motion.button whileTap={{
            scale: 0.88
          }} onClick={() => setEditing(false)} style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            padding: '6px 10px',
            color: T.textDim,
            fontSize: '0.8rem',
            cursor: 'pointer'
          }}>
                <X size={14} />
              </motion.button>
            </div> : <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}>
              <p style={{
            color: T.text,
            fontSize: '1rem',
            fontWeight: 700,
            textAlign: 'center'
          }}>
                {info?.name ?? '...'}
              </p>
              {isCreator && <motion.button whileTap={{
            scale: 0.88
          }} onClick={() => setEditing(true)} style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: T.textDim,
            padding: 2
          }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </motion.button>}
            </div>}

          <p style={{
          color: T.textDim,
          fontSize: '0.7rem',
          marginTop: -6
        }}>
            {info ? `${info.members.length} members` : ''}
          </p>

          {/* Members list */}
          {info && info.members.length > 0 && <div style={{
          width: '100%',
          borderTop: '1px solid rgba(0,188,212,0.1)',
          paddingTop: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}>
              {/* Header row: Members label + Add button for admin */}
              <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
                <p style={{
              color: T.textDim,
              fontSize: '0.68rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              margin: 0
            }}>Members</p>
                {isCreator && <motion.button whileTap={{
              scale: 0.88
            }} onClick={() => {
              setShowAddPanel(v => !v);
              setFriendSearch('');
            }} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              background: showAddPanel ? 'rgba(0,188,212,0.15)' : 'rgba(0,188,212,0.08)',
              border: '1px solid rgba(0,188,212,0.25)',
              borderRadius: 8,
              padding: '4px 10px',
              color: '#00BCD4',
              fontSize: '0.7rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}>
                    <UserPlus size={12} strokeWidth={2.5} />
                    إضافة
                  </motion.button>}
              </div>

              {/* Add member panel */}
              <AnimatePresence>
                {showAddPanel && isCreator && <motion.div initial={{
              opacity: 0,
              height: 0
            }} animate={{
              opacity: 1,
              height: 'auto'
            }} exit={{
              opacity: 0,
              height: 0
            }} transition={{
              duration: 0.2
            }} style={{
              overflow: 'hidden'
            }}>
                    <div style={{
                background: 'rgba(0,188,212,0.04)',
                border: '1px solid rgba(0,188,212,0.15)',
                borderRadius: 10,
                padding: '10px 10px 6px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                marginBottom: 4
              }}>
                      {/* Search input */}
                      <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(0,188,212,0.07)',
                  border: '1px solid rgba(0,188,212,0.2)',
                  borderRadius: 8,
                  padding: '6px 10px'
                }}>
                        <Search size={13} color={T.textDim} strokeWidth={2} />
                        <input autoFocus value={friendSearch} onChange={e => setFriendSearch(e.target.value)} placeholder="ابحث عن صديق..." style={{
                    flex: 1,
                    background: 'none',
                    border: 'none',
                    outline: 'none',
                    color: T.text,
                    fontSize: '0.78rem'
                  }} />
                      </div>
                      {/* Friend list */}
                      <div style={{
                  maxHeight: 160,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4
                }}>
                        {filteredFriends.length === 0 ? <p style={{
                    color: T.textDim,
                    fontSize: '0.72rem',
                    textAlign: 'center',
                    padding: '8px 0',
                    fontStyle: 'italic'
                  }}>
                            {friendOptions.length === 0 ? 'لا يوجد أصدقاء' : 'لا توجد نتائج'}
                          </p> : filteredFriends.map(f => <div key={f.friendId} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}>
                            <UserAvatar name={f.name ?? f.username ?? 'U'} avatarUrl={f.avatarUrl} size={28} />
                            <div style={{
                      flex: 1,
                      minWidth: 0
                    }}>
                              <p style={{
                        color: T.text,
                        fontSize: '0.78rem',
                        fontWeight: 500,
                        margin: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>{f.name ?? f.username ?? 'User'}</p>
                              {f.username && <p style={{
                        color: T.textDim,
                        fontSize: '0.62rem',
                        margin: 0
                      }}>@{f.username}</p>}
                            </div>
                            <motion.button whileTap={{
                      scale: 0.88
                    }} onClick={() => addMember(f)} disabled={addingId === f.friendId} style={{
                      background: 'rgba(0,188,212,0.12)',
                      border: '1px solid rgba(0,188,212,0.3)',
                      borderRadius: 7,
                      padding: '4px 9px',
                      color: '#00BCD4',
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      flexShrink: 0
                    }}>
                              {addingId === f.friendId ? <motion.div animate={{
                        rotate: 360
                      }} transition={{
                        duration: 0.7,
                        repeat: Infinity,
                        ease: 'linear'
                      }} style={{
                        width: 11,
                        height: 11,
                        borderRadius: '50%',
                        border: '2px solid rgba(0,188,212,0.3)',
                        borderTopColor: '#00BCD4'
                      }} /> : <><UserPlus size={11} strokeWidth={2.5} /> إضافة</>}
                            </motion.button>
                          </div>)}
                      </div>
                    </div>
                  </motion.div>}
              </AnimatePresence>

              {/* Members rows */}
              {info.members.map(m => {
            const isMemberOwner = m.username === 'Q8' || m.username === 'Stooorna';
            return <div key={m.id ?? m.name} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10
            }}>
                  <UserAvatar name={m.name ?? m.username ?? 'U'} avatarUrl={m.avatarUrl} size={32} blue={isMemberOwner} />
                  <div style={{
                flex: 1,
                minWidth: 0
              }}>
                    <p style={{
                  color: isMemberOwner ? '#2563eb' : T.text,
                  fontSize: '0.8rem',
                  fontWeight: isMemberOwner ? 700 : 500,
                  margin: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textShadow: isMemberOwner ? '0 0 8px rgba(37,99,235,0.4)' : 'none'
                }}>
                      {m.name ?? m.username ?? 'User'}
                      {isMemberOwner && <span style={{
                    marginRight: 5,
                    fontSize: '0.52rem',
                    fontWeight: 800,
                    color: '#fff',
                    background: 'linear-gradient(135deg,#2563eb,#1d4ed8)',
                    borderRadius: 4,
                    padding: '1px 4px',
                    boxShadow: '0 0 5px rgba(37,99,235,0.5)',
                    verticalAlign: 'middle'
                  }}>OWNER</span>}
                    </p>
                    {m.username && <p style={{
                  color: isMemberOwner ? '#2563eb' : T.textDim,
                  fontSize: '0.65rem',
                  margin: 0
                }}>@{m.username}</p>}
                  </div>
                  {m.id === info.createdBy ? <span style={{
                fontSize: '0.6rem',
                color: T.primary,
                background: 'rgba(0,188,212,0.1)',
                padding: '2px 7px',
                borderRadius: 10,
                border: '1px solid rgba(0,188,212,0.2)',
                flexShrink: 0
              }}>
                      Admin
                    </span> : isCreator && m.id ? <motion.button whileTap={{
                scale: 0.88
              }} onClick={() => setConfirmRemove({
                id: m.id!,
                name: m.name ?? m.username ?? 'User'
              })} title="إزالة من القروب" style={{
                background: 'rgba(239,68,68,0.07)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 7,
                padding: '5px 7px',
                color: 'rgba(239,68,68,0.7)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0
              }}>
                      <UserMinus size={13} strokeWidth={2} />
                    </motion.button> : null}
                </div>;
          })}
            </div>}
        </motion.div>
      </motion.div>
    </AnimatePresence>;
}

// ─── Main page ────────────────────────────────────────────────────────────────


// ─── Media, links & docs (من قائمة ⋮) ─────────────────────────────────────────
type MediaLibTab = 'media' | 'docs' | 'links';

function extractHttpUrls(text: string): string[] {
  if (!text) return [];
  const re = /https?:\/\/[^\s<>"']+/gi;
  return text.match(re) ?? [];
}

function MediaLibraryModal({
  messages,
  onClose,
}: {
  messages: Message[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<MediaLibTab>('media');

  const mediaItems = useMemo(() => {
    const items: { id: number; kind: 'image' | 'video'; url: string; at: string }[] = [];
    for (const m of messages) {
      if (m.type === 'image' && m.body) {
        let url = m.body;
        try { const p = JSON.parse(m.body); if (p?.url) url = p.url; } catch { /* */ }
        items.push({ id: m.id, kind: 'image', url, at: m.createdAt ?? '' });
      } else if (m.type === 'video' && m.body) {
        let url = m.body;
        try { const p = JSON.parse(m.body); if (p?.url) url = p.url; } catch { /* */ }
        // استثناء video note من شبكة الوسائط العادية اختياري — نعرضها كوسائط أيضاً
        items.push({ id: m.id, kind: 'video', url, at: m.createdAt ?? '' });
      }
    }
    return items.reverse();
  }, [messages]);

  const docItems = useMemo(() => {
    const items: { id: number; name: string; url: string; size?: number; at: string }[] = [];
    for (const m of messages) {
      if (m.type !== 'file' || !m.body) continue;
      try {
        const p = JSON.parse(m.body);
        items.push({
          id: m.id,
          name: p?.name || p?.filename || 'ملف',
          url: p?.url || m.body,
          size: p?.size,
          at: m.createdAt ?? '',
        });
      } catch {
        items.push({ id: m.id, name: 'ملف', url: m.body, at: m.createdAt ?? '' });
      }
    }
    return items.reverse();
  }, [messages]);

  const linkItems = useMemo(() => {
    const items: { id: number; url: string; at: string }[] = [];
    const seen = new Set<string>();
    for (const m of messages) {
      if (m.type !== 'text' || !m.body) continue;
      for (const u of extractHttpUrls(m.body)) {
        if (seen.has(u)) continue;
        seen.add(u);
        items.push({ id: m.id, url: u, at: m.createdAt ?? '' });
      }
    }
    return items.reverse();
  }, [messages]);

  const tabs: { key: MediaLibTab; label: string }[] = [
    { key: 'media', label: 'Media' },
    { key: 'docs', label: 'Docs' },
    { key: 'links', label: 'Links' },
  ];

  const empty =
    (tab === 'media' && mediaItems.length === 0)
    || (tab === 'docs' && docItems.length === 0)
    || (tab === 'links' && linkItems.length === 0);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1400,
        background: 'hsl(var(--background))',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: 'max(12px, env(safe-area-inset-top)) 14px 10px',
        borderBottom: '1px solid hsl(var(--border))',
      }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="رجوع"
          style={{
            width: 36, height: 36, borderRadius: '50%', border: 'none',
            background: 'hsl(var(--muted))', color: 'hsl(var(--foreground))',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 800, fontSize: '1rem', color: 'hsl(var(--foreground))' }}>
            Media, links, and docs
          </p>
          <p style={{ margin: 0, fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))' }}>
            All media
          </p>
        </div>
      </div>

      <div style={{
        display: 'flex', gap: 6, padding: '10px 14px',
        borderBottom: '1px solid hsl(var(--border))',
      }}>
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            style={{
              flex: 1, padding: '8px 6px', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: '0.8rem',
              background: tab === t.key ? 'hsl(var(--primary) / 0.18)' : 'hsl(var(--muted))',
              color: tab === t.key ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12, WebkitOverflowScrolling: 'touch' }}>
        {empty && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 10, paddingTop: 80, color: 'hsl(var(--muted-foreground))',
          }}>
            {tab === 'media' && <Images size={40} strokeWidth={1.5} />}
            {tab === 'docs' && <FileText size={40} strokeWidth={1.5} />}
            {tab === 'links' && <Link2 size={40} strokeWidth={1.5} />}
            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}>
              {tab === 'media' ? 'No media found' : tab === 'docs' ? 'No documents found' : 'No links found'}
            </p>
            <p style={{ margin: 0, fontSize: '0.78rem', opacity: 0.75, textAlign: 'center' }}>
              {tab === 'media'
                ? 'الصور والفيديوهات المشتركة في هذه المحادثة ستظهر هنا'
                : tab === 'docs'
                  ? 'الملفات والمستندات المشتركة ستظهر هنا'
                  : 'الروابط المرسلة في الرسائل ستظهر هنا'}
            </p>
          </div>
        )}

        {tab === 'media' && mediaItems.length > 0 && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4,
          }}>
            {mediaItems.map(item => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  aspectRatio: '1', borderRadius: 8, overflow: 'hidden',
                  background: 'hsl(var(--muted))', position: 'relative', display: 'block',
                }}
              >
                {item.kind === 'video' ? (
                  <>
                    <video src={item.url} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <span style={{
                      position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
                      background: 'rgba(0,0,0,0.25)',
                    }}>
                      <Play size={18} color="#fff" fill="#fff" />
                    </span>
                  </>
                ) : (
                  <img src={item.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
              </a>
            ))}
          </div>
        )}

        {tab === 'docs' && docItems.map(item => (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 10px', borderRadius: 12, marginBottom: 8,
              background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
              textDecoration: 'none', color: 'hsl(var(--foreground))',
            }}
          >
            <div style={{
              width: 42, height: 42, borderRadius: 10,
              background: 'hsl(var(--primary) / 0.12)', color: 'hsl(var(--primary))',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <FileText size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.name}
              </p>
              <p style={{ margin: 0, fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))' }}>
                {item.at ? new Date(item.at).toLocaleString() : ''}
              </p>
            </div>
            <ExternalLink size={16} color="hsl(var(--muted-foreground))" />
          </a>
        ))}

        {tab === 'links' && linkItems.map(item => (
          <a
            key={`${item.id}-${item.url}`}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 10px', borderRadius: 12, marginBottom: 8,
              background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))',
              textDecoration: 'none', color: 'hsl(var(--foreground))',
            }}
          >
            <div style={{
              width: 42, height: 42, borderRadius: 10,
              background: 'hsl(var(--primary) / 0.12)', color: 'hsl(var(--primary))',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Link2 size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'ltr', textAlign: 'left' }}>
                {item.url}
              </p>
              <p style={{ margin: 0, fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))' }}>
                {item.at ? new Date(item.at).toLocaleString() : ''}
              </p>
            </div>
            <ExternalLink size={16} color="hsl(var(--muted-foreground))" />
          </a>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Chat camera (WhatsApp-style): Video / Photo / Video Note / File ──────────
type ChatCamMode = 'video' | 'photo' | 'videonote' | 'file';

function ChatCameraCapture({
  onClose,
  onSendImage,
  onSendVideo,
  onSendVideoNote,
  onSendFile,
}: {
  onClose: () => void;
  onSendImage: (file: File) => void | Promise<void>;
  onSendVideo: (file: File) => void | Promise<void>;
  onSendVideoNote: (file: File, durationSec: number) => void | Promise<void>;
  onSendFile: (file: File) => void | Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const notePreviewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const noteStartRef = useRef<number>(0);

  const [mode, setMode] = useState<ChatCamMode>('photo');
  const [facing, setFacing] = useState<'user' | 'environment'>('environment');
  const [flashOn, setFlashOn] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [sending, setSending] = useState(false);
  const [galleryThumbs, setGalleryThumbs] = useState<{ id: string; url: string; file: File; kind: 'image' | 'video' }[]>([]);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoPreviewBlob, setPhotoPreviewBlob] = useState<Blob | null>(null);
  // Video note: after stop → circular preview before send
  const [notePreviewUrl, setNotePreviewUrl] = useState<string | null>(null);
  const [noteBlob, setNoteBlob] = useState<Blob | null>(null);
  const [notePlaying, setNotePlaying] = useState(false);
  const [noteDuration, setNoteDuration] = useState(0);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const clearRecTimer = () => {
    if (recTimerRef.current) {
      clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
  };

  const startCamera = useCallback(async (face: 'user' | 'environment') => {
    if (mode === 'file' || notePreviewUrl || photoPreviewUrl) return;
    setError(null);
    setReady(false);
    stopStream();
    try {
      let stream: MediaStream | null = null;
      const needAudio = mode === 'video' || mode === 'videonote';
      const attempts: MediaTrackConstraints[] = [
        { facingMode: { exact: face }, width: { ideal: 1280 }, height: { ideal: 720 } },
        { facingMode: { ideal: face } },
        { facingMode: face },
      ];
      for (const video of attempts) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video, audio: needAudio });
          break;
        } catch { /* next */ }
      }
      if (!stream) stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: needAudio });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setReady(true);
    } catch {
      setError('تعذّر فتح الكاميرا. تأكد من السماح بالوصول.');
    }
  }, [mode, stopStream, notePreviewUrl]);

  // Default facing for video note = front camera
  useEffect(() => {
    if (mode === 'videonote' && !notePreviewUrl) {
      setFacing('user');
    }
  }, [mode, notePreviewUrl]);

  useEffect(() => {
    if ((mode === 'photo' || mode === 'video' || mode === 'videonote') && !notePreviewUrl && !photoPreviewUrl) {
      void startCamera(facing);
    } else if (mode === 'file') {
      stopStream();
      setReady(false);
    }
  }, [mode, facing, startCamera, stopStream, notePreviewUrl, photoPreviewUrl]);

  useEffect(() => () => {
    stopStream();
    clearRecTimer();
    try { recorderRef.current?.stop(); } catch { /* */ }
    if (notePreviewUrl) URL.revokeObjectURL(notePreviewUrl);
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    galleryThumbs.forEach(t => URL.revokeObjectURL(t.url));
  }, [stopStream]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const track = streamRef.current?.getVideoTracks()?.[0];
    if (!track) return;
    const caps = track.getCapabilities?.() as { torch?: boolean } | undefined;
    if (!caps?.torch) return;
    track.applyConstraints({ advanced: [{ torch: flashOn } as MediaTrackConstraintSet] }).catch(() => {});
  }, [flashOn, ready]);

  async function capturePhoto() {
    const video = videoRef.current;
    if (!video || !ready || sending || photoPreviewUrl) return;
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (facing === 'user') {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.92));
    if (!blob) return;
    // معاينة قبل الإرسال — ✕ / إرسال في شريط الغالق
    stopStream();
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    const url = URL.createObjectURL(blob);
    setPhotoPreviewBlob(blob);
    setPhotoPreviewUrl(url);
  }

  function discardPhotoPreview() {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoPreviewUrl(null);
    setPhotoPreviewBlob(null);
    void startCamera(facing);
  }

  async function sendPhotoPreview() {
    if (!photoPreviewBlob || sending) return;
    setSending(true);
    try {
      const file = new File([photoPreviewBlob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
      await onSendImage(file);
      onClose();
    } finally {
      setSending(false);
    }
  }

  function startLinearVideoRecording() {
    const stream = streamRef.current;
    if (!stream || recording || sending) return;
    chunksRef.current = [];
    let mime = 'video/webm;codecs=vp8,opus';
    if (typeof MediaRecorder !== 'undefined' && !MediaRecorder.isTypeSupported(mime)) mime = 'video/webm';
    if (typeof MediaRecorder !== 'undefined' && !MediaRecorder.isTypeSupported(mime)) mime = '';
    try {
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = rec;
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        clearRecTimer();
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'video/webm' });
        if (blob.size < 500) return;
        setSending(true);
        try {
          const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
          const file = new File([blob], `video-${Date.now()}.${ext}`, { type: blob.type || 'video/webm' });
          await onSendVideo(file);
          onClose();
        } finally {
          setSending(false);
        }
      };
      rec.start(200);
      setRecording(true);
      setRecSeconds(0);
      recTimerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
    } catch {
      setError('تعذّر بدء تسجيل الفيديو');
    }
  }

  function stopLinearVideoRecording() {
    if (recorderRef.current && recording) {
      try { recorderRef.current.stop(); } catch { /* */ }
      recorderRef.current = null;
    }
  }

  function cancelLinearVideoRecording() {
    clearRecTimer();
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (rec) {
      rec.ondataavailable = null;
      rec.onstop = null;
      try { if (rec.state !== 'inactive') rec.stop(); } catch { /* */ }
    }
    chunksRef.current = [];
    setRecording(false);
    setRecSeconds(0);
  }

  function startVideoNote() {
    const stream = streamRef.current;
    if (!stream || recording || sending || notePreviewUrl) return;
    chunksRef.current = [];
    let mime = 'video/webm;codecs=vp8,opus';
    if (typeof MediaRecorder !== 'undefined' && !MediaRecorder.isTypeSupported(mime)) mime = 'video/webm';
    if (typeof MediaRecorder !== 'undefined' && !MediaRecorder.isTypeSupported(mime)) mime = '';
    try {
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = rec;
      noteStartRef.current = Date.now();
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        clearRecTimer();
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'video/webm' });
        const dur = Math.max(1, Math.round((Date.now() - noteStartRef.current) / 1000));
        setNoteDuration(dur);
        if (blob.size < 400) {
          setError('التسجيل قصير جداً');
          return;
        }
        // أوقف البث المباشر واعرض المعاينة الدائرية
        stopStream();
        const url = URL.createObjectURL(blob);
        setNoteBlob(blob);
        setNotePreviewUrl(url);
        setNotePlaying(false);
      };
      rec.start(150);
      setRecording(true);
      setRecSeconds(0);
      recTimerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
    } catch {
      setError('تعذّر بدء Video note');
    }
  }

  function stopVideoNote() {
    if (recorderRef.current && recording) {
      try { recorderRef.current.stop(); } catch { /* */ }
      recorderRef.current = null;
    }
  }

  function cancelVideoNote() {
    clearRecTimer();
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (rec) {
      rec.ondataavailable = null;
      rec.onstop = null;
      try { if (rec.state !== 'inactive') rec.stop(); } catch { /* */ }
    }
    chunksRef.current = [];
    setRecording(false);
    setRecSeconds(0);
  }

  function discardNotePreview() {
    if (notePreviewUrl) URL.revokeObjectURL(notePreviewUrl);
    setNotePreviewUrl(null);
    setNoteBlob(null);
    setNotePlaying(false);
    setNoteDuration(0);
    setRecSeconds(0);
    // أعد تشغيل الكاميرا لنوت جديد
    void startCamera(facing);
  }

  async function sendNotePreview() {
    if (!noteBlob || sending) return;
    setSending(true);
    try {
      const ext = noteBlob.type.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([noteBlob], `video-note-${Date.now()}.${ext}`, { type: noteBlob.type || 'video/webm' });
      await onSendVideoNote(file, noteDuration || recSeconds || 1);
      onClose();
    } finally {
      setSending(false);
    }
  }

  function toggleNotePlay() {
    const el = notePreviewRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      setNotePlaying(true);
    } else {
      el.pause();
      setNotePlaying(false);
    }
  }

  function handleShutter() {
    if (sending || notePreviewUrl) return;
    if (mode === 'photo') void capturePhoto();
    else if (mode === 'video') {
      if (recording) stopLinearVideoRecording();
      else startLinearVideoRecording();
    } else if (mode === 'videonote') {
      if (recording) stopVideoNote();
      else startVideoNote();
    } else if (mode === 'file') {
      fileInputRef.current?.click();
    }
  }

  function onGalleryPicked(files: FileList | null) {
    if (!files?.length) return;
    const next: typeof galleryThumbs = [];
    Array.from(files).slice(0, 24).forEach((file, i) => {
      const kind = file.type.startsWith('video/') ? 'video' as const : 'image' as const;
      next.push({ id: `${Date.now()}-${i}`, url: URL.createObjectURL(file), file, kind });
    });
    setGalleryThumbs(prev => {
      prev.forEach(t => URL.revokeObjectURL(t.url));
      return next;
    });
  }

  async function sendGalleryItem(item: { file: File; kind: 'image' | 'video' }) {
    if (sending) return;
    setSending(true);
    try {
      if (item.kind === 'video') await onSendVideo(item.file);
      else await onSendImage(item.file);
      onClose();
    } finally {
      setSending(false);
    }
  }

  const modes: { key: ChatCamMode; label: string }[] = [
    { key: 'video', label: 'Video' },
    { key: 'photo', label: 'Photo' },
    { key: 'videonote', label: 'Video note' },
    { key: 'file', label: 'File' },
  ];

  const fmtRec = `${Math.floor(recSeconds / 60)}:${String(recSeconds % 60).padStart(2, '0')}`;
  const fmtNote = `${Math.floor(noteDuration / 60)}:${String(noteDuration % 60).padStart(2, '0')}`;
  const isNote = mode === 'videonote';
  const showLiveVideo = (mode === 'photo' || mode === 'video' || mode === 'videonote') && !notePreviewUrl && !photoPreviewUrl;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1600, background: '#000',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      {/* Top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 'max(12px, env(safe-area-inset-top)) 14px 12px',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)',
      }}>
        <button
          type="button"
          onClick={() => {
            if (recording) {
              if (mode === 'video') cancelLinearVideoRecording();
              if (mode === 'videonote') cancelVideoNote();
            }
            if (notePreviewUrl) discardNotePreview();
            if (photoPreviewUrl) discardPhotoPreview();
            onClose();
          }}
          aria-label="إغلاق"
          style={{
            width: 40, height: 40, borderRadius: '50%', border: 'none',
            background: 'rgba(30,30,30,0.75)', color: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <X size={20} strokeWidth={2.2} />
        </button>

        {/* Timer for video note recording / preview */}
        {(isNote && (recording || notePreviewUrl)) && (
          <div style={{
            position: 'absolute', left: '50%', transform: 'translateX(-50%)',
            background: recording ? '#ef4444' : 'transparent',
            color: '#fff', fontWeight: 700, fontSize: '0.85rem',
            padding: recording ? '6px 14px' : '6px 10px',
            borderRadius: 999, fontVariantNumeric: 'tabular-nums',
          }}>
            {recording ? fmtRec : fmtNote}
          </div>
        )}

        {(mode === 'photo' || mode === 'video') && !notePreviewUrl && (
          <button
            type="button"
            onClick={() => setFlashOn(v => !v)}
            aria-label="الفلاش"
            style={{
              width: 40, height: 40, borderRadius: '50%', border: 'none',
              background: 'rgba(30,30,30,0.75)', color: flashOn ? '#facc15' : '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {flashOn ? <Zap size={18} fill="#facc15" /> : <ZapOff size={18} />}
          </button>
        )}
        {isNote && <div style={{ width: 40 }} />}
      </div>

      {/* Preview area */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0, background: '#000' }}>
        {/* Live camera — full screen for photo/video, circular crop for video note */}
        {showLiveVideo && (
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            style={isNote ? {
              position: 'absolute',
              top: '50%', left: '50%',
              transform: `translate(-50%, -50%)${facing === 'user' ? ' scaleX(-1)' : ''}`,
              width: 'min(92vw, 420px)',
              height: 'min(92vw, 420px)',
              objectFit: 'cover',
              borderRadius: '50%',
              background: '#1a1a1a',
            } : {
              position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
              transform: facing === 'user' ? 'scaleX(-1)' : 'none',
            }}
          />
        )}

        {/* Video note circular preview after recording */}
        {notePreviewUrl && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              position: 'relative',
              width: 'min(92vw, 420px)', height: 'min(92vw, 420px)',
              borderRadius: '50%', overflow: 'hidden', background: '#1a1a1a',
            }}>
              <video
                ref={notePreviewRef}
                src={notePreviewUrl}
                playsInline
                loop
                onPlay={() => setNotePlaying(true)}
                onPause={() => setNotePlaying(false)}
                onEnded={() => setNotePlaying(false)}
                style={{
                  width: '100%', height: '100%', objectFit: 'cover',
                  transform: facing === 'user' ? 'scaleX(-1)' : 'none',
                }}
              />
              <button
                type="button"
                onClick={toggleNotePlay}
                aria-label={notePlaying ? 'إيقاف' : 'تشغيل'}
                style={{
                  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  width: 64, height: 64, borderRadius: '50%', border: 'none',
                  background: 'rgba(0,0,0,0.45)', color: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {notePlaying ? (
                  <span style={{ display: 'flex', gap: 5 }}>
                    <span style={{ width: 5, height: 18, background: '#fff', borderRadius: 2 }} />
                    <span style={{ width: 5, height: 18, background: '#fff', borderRadius: 2 }} />
                  </span>
                ) : (
                  <Play size={28} fill="#fff" color="#fff" style={{ marginLeft: 3 }} />
                )}
              </button>
            </div>
          </div>
        )}


        {/* معاينة الصورة قبل الإرسال */}
        {photoPreviewUrl && (
          <div style={{ position: 'absolute', inset: 0 }}>
            <img
              src={photoPreviewUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        )}

        {mode === 'file' && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 14, color: '#fff', padding: 24,
          }}>
            <FileText size={48} color="rgba(255,255,255,0.7)" />
            <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>اختر ملفاً لإرساله</p>
            <p style={{ margin: 0, fontSize: '0.78rem', opacity: 0.55, textAlign: 'center' }}>PDF، مستندات، أرشيف، صوت…</p>
          </div>
        )}

        {error && (
          <div style={{
            position: 'absolute', left: 16, right: 16, top: '40%', textAlign: 'center',
            color: '#fff', background: 'rgba(0,0,0,0.55)', borderRadius: 12, padding: 14, fontSize: '0.85rem',
          }}>
            {error}
          </div>
        )}

        {/* مؤقت الفيديو فقط في الأعلى — الإلغاء/الإرسال في شريط الغالق */}
        {recording && mode === 'video' && (
          <div style={{
            position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 4,
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(0,0,0,0.55)', borderRadius: 20, padding: '6px 14px',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
            <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.82rem', fontVariantNumeric: 'tabular-nums' }}>{fmtRec}</span>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div style={{
        position: 'relative', zIndex: 5,
        padding: '8px 0 max(16px, env(safe-area-inset-bottom))',
        background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.55))',
      }}>
        {/* Gallery selection uses shutter-row thumb + Send only */}


        {/* شريط الغالق: أثناء التسجيل/معاينة النوت — ✕ مكان المعرض · إرسال مكان قلب الكاميرا */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 36, padding: '4px 20px 10px',
        }}>
          {/* Left: cancel while recording/preview, else gallery (shows selected thumb when picked) */}
          {(recording || notePreviewUrl || photoPreviewUrl) ? (
            <button
              type="button"
              onClick={() => {
                if (photoPreviewUrl) discardPhotoPreview();
                else if (notePreviewUrl) discardNotePreview();
                else if (mode === 'videonote') cancelVideoNote();
                else if (mode === 'video') cancelLinearVideoRecording();
              }}
              aria-label="Cancel"
              style={{
                width: 44, height: 44, borderRadius: '50%', border: 'none',
                background: 'rgba(239,68,68,0.22)', color: '#ef4444', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={22} strokeWidth={2.4} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              aria-label="Gallery"
              style={{
                width: 48, height: 48, borderRadius: 12, border: galleryThumbs.length ? '2px solid #22c55e' : 'none',
                background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                visibility: mode === 'file' ? 'hidden' : 'visible',
                padding: 0, overflow: 'hidden', flexShrink: 0,
              }}
            >
              {galleryThumbs[0] ? (
                galleryThumbs[0].kind === 'video' ? (
                  <video src={galleryThumbs[0].url} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <img src={galleryThumbs[0].url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )
              ) : (
                <ImageIcon size={20} />
              )}
            </button>
          )}

          {/* وسط — غالق / مؤشر تسجيل */}
          <button
            type="button"
            onClick={() => {
              if (notePreviewUrl || photoPreviewUrl) return;
              handleShutter();
            }}
            disabled={
              sending
              || !!notePreviewUrl
              || !!photoPreviewUrl
              || ((mode === 'photo' || mode === 'video' || mode === 'videonote') && !ready)
            }
            aria-label={recording ? 'إيقاف' : 'التقاط'}
            style={{
              width: 76, height: 76, borderRadius: '50%',
              border: `4px solid ${recording ? '#ef4444' : '#fff'}`,
              background: recording
                ? '#111'
                : mode === 'photo' ? '#fff' : 'transparent',
              cursor: (notePreviewUrl || photoPreviewUrl) ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: sending || notePreviewUrl || photoPreviewUrl ? 0.55 : 1,
              transition: 'border-color 0.15s, background 0.15s',
            }}
          >
            {mode === 'videonote' && !recording && !notePreviewUrl && (
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#ef4444' }} />
            )}
            {mode === 'file' && <FileText size={28} color="#fff" />}
            {recording && (
              <span style={{ width: 22, height: 22, borderRadius: 5, background: '#ef4444' }} />
            )}
          </button>

          {/* Right: Send when gallery picked or after capture; else flip camera */}
          {(recording || notePreviewUrl || photoPreviewUrl || galleryThumbs.length > 0) ? (
            <button
              type="button"
              onClick={() => {
                if (galleryThumbs.length > 0 && !recording && !notePreviewUrl && !photoPreviewUrl) {
                  void sendGalleryItem(galleryThumbs[0]);
                  return;
                }
                if (photoPreviewUrl) void sendPhotoPreview();
                else if (notePreviewUrl) void sendNotePreview();
                else if (mode === 'videonote') stopVideoNote();
                else if (mode === 'video') stopLinearVideoRecording();
              }}
              disabled={sending}
              aria-label="Send"
              style={{
                minWidth: 64, height: 48, borderRadius: 24, border: 'none',
                padding: '0 16px',
                background: '#22c55e', color: '#041018', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                opacity: sending ? 0.6 : 1, fontWeight: 800, fontSize: '0.88rem',
                boxShadow: '0 4px 14px rgba(34,197,94,0.4)',
                flexShrink: 0,
              }}
            >
              <Send size={16} strokeWidth={2.4} />
              Send
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setFacing(f => f === 'user' ? 'environment' : 'user')}
              disabled={mode === 'file' || recording}
              aria-label="Flip camera"
              style={{
                width: 44, height: 44, borderRadius: '50%', border: 'none',
                background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: mode === 'file' ? 0.35 : 1,
              }}
            >
              <RotateCcw size={20} />
            </button>
          )}
        </div>

        {/* Mode tabs — hide while note preview */}
        {!notePreviewUrl && !photoPreviewUrl && (
          <div style={{
            display: 'flex', justifyContent: 'center', gap: 4, padding: '4px 8px 0',
          }}>
            {modes.map(m => (
              <button
                key={m.key}
                type="button"
                disabled={recording}
                onClick={() => {
                  if (recording) return;
                  setMode(m.key);
                  if (m.key === 'file') setTimeout(() => fileInputRef.current?.click(), 120);
                }}
                style={{
                  padding: '8px 12px', border: 'none', borderRadius: 20, cursor: 'pointer',
                  background: mode === m.key ? 'rgba(255,255,255,0.95)' : 'transparent',
                  color: mode === m.key ? '#111' : 'rgba(255,255,255,0.65)',
                  fontSize: '0.78rem', fontWeight: 700,
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*,video/*,.mp4,.webm,.mov,.m4v,.mkv,.avi,.3gp,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.bmp"
        multiple
        style={{ display: 'none' }}
        onChange={e => {
          onGalleryPicked(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="*/*"
        style={{ display: 'none' }}
        onChange={async e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f || sending) return;
          setSending(true);
          try {
            await onSendFile(f);
            onClose();
          } finally {
            setSending(false);
          }
        }}
      />
    </motion.div>
  );
}

export default function ChatPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const {
    user,
    isPending
  } = useSession();
  const tick = useAutoRefresh();
  const peerId = params.get('with') ?? '';
  const peerName = params.get('name') ?? '';
  const peerUsername = params.get('username') ?? '';
  const peerAvatarParam = params.get('avatarUrl') ?? '';
  const groupId = params.get('group') ?? '';
  const groupName = params.get('name') ?? '';
  const isGroup = !!groupId;

  // chatId ثابت لكل محادثة — يُستخدم في إشارات البث الصوتي
  const chatId = isGroup ? `grp:${groupId}` : (() => {
    const [a, b] = [user?.id ?? '', peerId].sort();
    return `dm:${a}:${b}`;
  })();

  // ── Secret chat DM state ─────────────────────────────────────────────────────
  const [scChatId, setScChatId] = useState<number | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const prevMsgCountRef = useRef(-1); // -1 = first load, skip notification

  // ── Show messages only when there's at least one new message ──────────────────
  const [hasNewMsg, setHasNewMsg] = useState(false);
  void hasNewMsg;

  // ── Typing indicator (SC) ────────────────────────────────────────────────────
  const [scTypingNames, setScTypingNames] = useState<string[]>([]);
  const scTypingSignalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // In-app notifications (toast from top)
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  function pushNotif(n: AppNotification) {
    setNotifications(prev => [...prev.slice(-2), n]); // max 3 at once
  }
  function dismissNotif(id: string) {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }

  // ── Join toasts — who just entered the group chat ─────────────────────────
  interface JoinToast {
    id: string;
    name: string;
    avatarUrl?: string | null;
    type: 'chat' | 'voice';
  }
  const [joinToasts, setJoinToasts] = useState<JoinToast[]>([]);
  const knownMemberIdsRef = useRef<Set<string> | null>(null); // null = not yet initialised
  const knownVoiceMembersRef = useRef<Set<string>>(new Set()); // who is currently in voice

  function pushJoinToast(t: JoinToast) {
    setJoinToasts(prev => [...prev.slice(-2), t]);
    setTimeout(() => setJoinToasts(prev => prev.filter(j => j.id !== t.id)), 4000);
  }

  // Reply state
  const [replyTo, setReplyTo] = useState<Message | null>(null);

  // Action menu
  const [menuMsgId, setMenuMsgId] = useState<number | null>(null);

  // Multi-select mode
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // Server allows any member to delete any message in the chat — no ownership
  // restriction here on purpose (matches /api/secret-chat/message/:id and
  // /api/groups/:id/messages/:id, both of which permit deleting any message).
  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelectedIds(prev => prev.size === msgs.length ? new Set() : new Set(msgs.map(m => m.id)));
  }
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  async function deleteSelected() {
    const ids = Array.from(selectedIds);
    setIsBulkDeleting(true); // pauses the 3s poll below so it can't race the deletes and re-add messages mid-flight
    try {
      // Delete one by one (not parallel) to avoid race conditions on the server
      for (const id of ids) {
        await deleteMessage(id);
      }
      // Reconcile with the server once everything is done, in case any single
      // delete silently failed (e.g. transient network error).
      await fetchMsgs();
    } finally {
      setIsBulkDeleting(false);
    }
    setSelectedIds(new Set());
    setSelectMode(false);
  }

  /** Clear History — deletes ALL messages in this conversation (both sides) */
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  async function clearMyHistory() {
    if (!user?.id || isClearingHistory) return;
    setIsClearingHistory(true);
    setIsBulkDeleting(true);
    setHeaderMenuOpen(false);
    const ids = msgs.map(m => m.id);
    setMsgs([]);
    try {
      const key = `stooorna_chat_cleared_${isGroup ? `g_${groupId}` : (scChatId || peerId || 'x')}`;
      localStorage.setItem(key, String(Date.now()));
    } catch { /* ignore */ }
    try {
      const { clearChatHistory } = await import('@/lib/chatClearHistoryPatch');
      await clearChatHistory({
        messageIds: ids,
        peerId,
        groupId: groupId || null,
        chatId: scChatId || null,
      });
    } catch {
      /* local already cleared */
    } finally {
      setIsBulkDeleting(false);
      setIsClearingHistory(false);
      setShowClearConfirm(false);
    }
  }

  // ── Edit message ────────────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [editedIds, setEditedIds] = useState<Set<number>>(new Set());
  function startEdit(m: Message) {
    setEditingId(m.id);
    setEditText(m.body ?? '');
    setMenuMsgId(null);
  }
  function cancelEdit() {
    setEditingId(null);
    setEditText('');
  }
  async function saveEdit(msgId: number) {
    const trimmed = editText.trim();
    if (!trimmed) return;
    // Optimistic local update so edit always feels instant
    setMsgs(prev => prev.map(m => m.id === msgId ? { ...m, body: trimmed } : m));
    setEditedIds(prev => new Set(prev).add(msgId));
    setEditingId(null);
    setEditText('');
    const body = JSON.stringify({ body: trimmed, text: trimmed, messageId: msgId });
    const headers = { 'Content-Type': 'application/json' };
    const urls: string[] = [];
    if (isGroup && groupId) {
      urls.push(`/api/groups/${groupId}/messages/${msgId}`);
    } else if (scChatId) {
      urls.push(`/api/secret-chat/message/${msgId}`);
      urls.push(`/api/secret-chat/messages/${msgId}`);
    } else if (peerId) {
      urls.push(`/api/messages/${msgId}`);
      urls.push(`/api/chat/message/${msgId}`);
      urls.push(`/api/secret-chat/message/${msgId}`);
    } else {
      urls.push(`/api/secret-chat/message/${msgId}`);
    }
    try {
      for (const url of urls) {
        try {
          const res = await fetch(url, {
            method: 'PATCH',
            credentials: 'include',
            headers,
            body,
          });
          if (res.ok) return;
          // some APIs use PUT
          const res2 = await fetch(url, {
            method: 'PUT',
            credentials: 'include',
            headers,
            body,
          });
          if (res2.ok) return;
        } catch {
          /* try next */
        }
      }
    } catch (e) {
      console.error('[editMessage] error', e);
    }
  }

  // Profile peek modal
  // Tapping a profile picture inside the chat now only ever shows that picture full-screen —
  // it never opens the full profile box (that box moved to the home feed's text-post avatars).
  const [avatarLightboxUrl, setAvatarLightboxUrl] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  // Group info modal
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [liveGroupName, setLiveGroupName] = useState(groupName);
  const [liveGroupAvatar, setLiveGroupAvatar] = useState<string | null>(null);

  // Fetch group avatar on mount so it shows immediately without opening GroupInfoModal
  useEffect(() => {
    if (!isGroup || !groupId || !user) return;
    fetch(`/api/groups/${groupId}`, {
      credentials: 'include'
    }).then(r => r.ok ? r.json() : null).then(d => {
      if (d?.avatarUrl) setLiveGroupAvatar(d.avatarUrl);
      if (d?.name) setLiveGroupName(d.name);
    }).catch(() => {});
  }, [isGroup, groupId, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Poll group members every 4s — detect new joins and show toast + chime ──
  useEffect(() => {
    if (!isGroup || !groupId || !user) return;
    const poll = async () => {
      try {
        const r = await fetch(`/api/groups/${groupId}`, {
          credentials: 'include'
        });
        if (!r.ok) return;
        const d = (await r.json()) as {
          members?: {
            id: string | null;
            name: string | null;
            avatarUrl?: string | null;
          }[];
        };
        const members = (d.members ?? []).filter(m => m.id);
        const ids = new Set(members.map(m => m.id as string));
        if (knownMemberIdsRef.current === null) {
          // First load — just record who's here, no toasts
          knownMemberIdsRef.current = ids;
          return;
        }

        // Detect new arrivals (not ourselves)
        for (const m of members) {
          if (!m.id || m.id === user.id) continue;
          if (!knownMemberIdsRef.current.has(m.id)) {
            playNotificationSound('join');
            pushJoinToast({
              id: `join-${m.id}-${Date.now()}`,
              name: m.name ?? 'Someone',
              avatarUrl: m.avatarUrl,
              type: 'chat'
            });
          }
        }
        knownMemberIdsRef.current = ids;
      } catch {/* silent */}
    };
    poll();
    const id = setInterval(poll, 4_000);
    return () => {
      clearInterval(id);
      knownMemberIdsRef.current = null;
    };
  }, [isGroup, groupId, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Poll voice room every 3s — detect new voice joins ──────────────────────
  useEffect(() => {
    if (!isGroup || !groupId || !user) return;
    const roomId = `group-${groupId}`;
    const poll = async () => {
      try {
        const r = await fetch(`/api/room?id=${encodeURIComponent(roomId)}`, {
          credentials: 'include'
        });
        if (!r.ok) return;
        const d = (await r.json()) as {
          members?: {
            userId: string;
            name: string | null;
          }[];
        };
        const members = d.members ?? [];
        const ids = new Set(members.map(m => m.userId));

        // Detect new voice joiners (not ourselves)
        for (const m of members) {
          if (m.userId === user.id) continue;
          if (!knownVoiceMembersRef.current.has(m.userId)) {
            playNotificationSound('voice-join');
            pushJoinToast({
              id: `voice-${m.userId}-${Date.now()}`,
              name: m.name ?? 'Someone',
              type: 'voice'
            });
          }
        }
        knownVoiceMembersRef.current = ids;
      } catch {/* silent */}
    };
    poll();
    const id = setInterval(poll, 3_000);
    return () => {
      clearInterval(id);
      knownVoiceMembersRef.current = new Set();
    };
  }, [isGroup, groupId, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leave group confirm
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // ── Speaker volume (used by both group and DM voice bars) ─────────────────
  const [speakerVol, setSpeakerVol] = useState(1);
  const [showVolSlider, setShowVolSlider] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // ── Live call (DM) — role-aware UI:
  //   caller while ringing  → red PhoneOff (line)
  //   callee while ringing  → green PhoneOff (line) + "رد"
  //   after answer          → green Phone (no line) + duration
  //   after hangup          → red PhoneOff again
  const globalCall = useGlobalCall() as {
    startCall?: (opts: {
      peerId: string;
      peerName: string;
      peerUsername?: string;
      peerAvatar?: string | null;
      isConference?: boolean;
      channel?: string;
    }) => void;
    endCall?: () => void;
    hangUp?: () => void;
    answerCall?: () => void;
  };
  // idle | ringing | active
  const [callPhase, setCallPhase] = useState<'idle' | 'ringing' | 'active'>('idle');
  // who am I in this call?
  const [callRole, setCallRole] = useState<'none' | 'caller' | 'callee'>('none');
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [callElapsed, setCallElapsed] = useState(0);
  const [callMuted, setCallMuted] = useState(false);
  const ringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callChannelRef = useRef<string | null>(null);
  const lastCallSignalTsRef = useRef<number>(0);
  const callPhaseRef = useRef(callPhase);
  const callRoleRef = useRef(callRole);
  callPhaseRef.current = callPhase;
  callRoleRef.current = callRole;
  const callPeerLabel = isGroup
    ? (liveGroupName || groupName || 'Group')
    : (peerName || peerUsername || 'User');

  function chatCallStorageKey(channel: string) {
    return `stooorna_chat_call:${channel}`;
  }
  function buildDmCallChannel() {
    if (!user) return null;
    if (!isGroup && peerId) {
      const [a, b] = [user.id, peerId].sort();
      return `dm_${a}_${b}`;
    }
    if (isGroup && groupId) return `grp_call_${groupId}`;
    return null;
  }
  function publishCallSignal(status: 'ringing' | 'answered' | 'ended', channel: string) {
    if (!user) return;
    const payload = {
      status,
      channel,
      from: user.id,
      to: isGroup ? groupId : peerId,
      ts: Date.now(),
      peerLabel: callPeerLabel,
    };
    try {
      localStorage.setItem(chatCallStorageKey(channel), JSON.stringify(payload));
    } catch {/* private mode */}
    try {
      window.dispatchEvent(new CustomEvent('stooorna:chat-call', { detail: payload }));
    } catch {/* ignore */}
  }

  useEffect(() => {
    if (callPhase !== 'active' || !callStartedAt) {
      setCallElapsed(0);
      return;
    }
    const id = setInterval(() => {
      setCallElapsed(Math.floor((Date.now() - callStartedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [callPhase, callStartedAt]);

  useEffect(() => {
    return () => {
      if (ringIntervalRef.current) clearInterval(ringIntervalRef.current);
    };
  }, []);

  function stopChatRing() {
    if (ringIntervalRef.current) {
      clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
  }
  /** يبدأ رنة موحّدة — يوقف أي رنة سابقة أولًا حتى لا تتراكب الأصوات */
  function startChatRing() {
    stopChatRing();
    playChatCallRing();
    try { navigator.vibrate?.([300, 200, 300, 200]); } catch {}
    ringIntervalRef.current = setInterval(() => {
      playChatCallRing();
      try { navigator.vibrate?.([300, 200, 300, 200]); } catch {}
    }, 2200);
  }

  // Listen for peer call signals (incoming ring / answer / end)
  useEffect(() => {
    if (!user) return;
    const channel = buildDmCallChannel();
    if (!channel) return;

    const applySignal = (raw: any) => {
      if (!raw || raw.channel !== channel) return;
      const ts = Number(raw.ts) || 0;
      if (ts && ts <= lastCallSignalTsRef.current) return;
      if (ts) lastCallSignalTsRef.current = ts;

      if (raw.status === 'ringing' && raw.from && raw.from !== user.id) {
        // Incoming call for me — only enter ringing once
        if (callPhaseRef.current === 'idle') {
          setCallRole('callee');
          setCallPhase('ringing');
          callChannelRef.current = channel;
          startChatRing();
          // إشعار داخل التطبيق + إشعار نظام إن أمكن
          pushNotif({
            id: `call-in-${Date.now()}`,
            type: 'message',
            senderName: 'Incoming call',
            preview: `${raw.peerLabel || 'مستخدم'} يتصل بك — اضغط رد`,
            onTap: () => { try { answerChatCall(); } catch {} },
          });
          try {
            if (typeof Notification !== 'undefined') {
              const show = () => {
                if (Notification.permission !== 'granted') return;
                const n = new Notification('Incoming call', {
                  body: `${raw.peerLabel || 'مستخدم'} يتصل بك الآن`,
                  tag: 'stooorna-chat-incoming-call',
                });
                n.onclick = () => { try { window.focus(); answerChatCall(); } catch {} };
              };
              if (Notification.permission === 'granted') show();
              else if (Notification.permission !== 'denied') {
                void Notification.requestPermission().then(p => { if (p === 'granted') show(); });
              }
            }
          } catch {/* optional */}
        }
      } else if (raw.status === 'answered') {
        // الطرف الثاني رد — أوقف الرنة فورًا عند الطرفين (المتصل + المتصل عليه)
        stopChatRing();
        if (callPhaseRef.current === 'active') return;
        setCallPhase('active');
        setCallStartedAt(prev => prev ?? Date.now());
        if (callRoleRef.current === 'none') {
          setCallRole(raw.from === user.id ? 'callee' : 'caller');
        }
        try {
          if (callRoleRef.current === 'caller' && !isGroup && peerId && globalCall?.startCall) {
            globalCall.startCall({
              peerId,
              peerName: peerName || peerUsername || 'User',
              peerUsername: peerUsername || undefined,
              peerAvatar: peerAvatarUrl ?? null,
              isConference: false,
              channel,
            });
          }
        } catch { /* optional */ }
      } else if (raw.status === 'ended') {
        if (callPhaseRef.current === 'idle' && callRoleRef.current === 'none') return;
        stopChatRing();
        setCallPhase('idle');
        setCallRole('none');
        setCallStartedAt(null);
        setCallElapsed(0);
        setCallMuted(false);
        callChannelRef.current = null;
      }
    };

    const onStorage = (e: StorageEvent) => {
      if (!e.key || !e.key.startsWith('stooorna_chat_call:') || !e.newValue) return;
      try { applySignal(JSON.parse(e.newValue)); } catch {/* ignore */}
    };
    const onCustom = (e: Event) => {
      applySignal((e as CustomEvent).detail);
    };
    // Poll storage in case storage event doesn't fire same-tab (we use CustomEvent for same tab)
    const poll = window.setInterval(() => {
      try {
        const raw = localStorage.getItem(chatCallStorageKey(channel));
        if (raw) applySignal(JSON.parse(raw));
      } catch {/* ignore */}
    }, 1200);

    window.addEventListener('storage', onStorage);
    window.addEventListener('stooorna:chat-call', onCustom as EventListener);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('stooorna:chat-call', onCustom as EventListener);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, peerId, groupId, isGroup]);

  function answerChatCall() {
    // نستخدم الـ refs حتى يعمل الزر من البانر/الإشعار حتى لو كان الـ closure قديمًا
    if (!user || callPhaseRef.current !== 'ringing' || callRoleRef.current !== 'callee') return;
    const channel = callChannelRef.current || buildDmCallChannel();
    if (!channel) return;
    stopChatRing(); // يوقف الرنة فورًا عند الطرف المتلقي
    setCallPhase('active');
    setCallRole('callee');
    setCallStartedAt(Date.now());
    setCallElapsed(0);
    publishCallSignal('answered', channel); // يوقف الرنة عند المتصل أيضًا عبر الإشارة
    try {
      globalCall?.answerCall?.();
      // Ensure we're joined on the real media path as well
      if (!isGroup && peerId && globalCall?.startCall) {
        globalCall.startCall({
          peerId,
          peerName: peerName || peerUsername || 'User',
          peerUsername: peerUsername || undefined,
          peerAvatar: peerAvatarUrl ?? null,
          isConference: false,
          channel,
        });
      }
    } catch {/* optional */}
    pushNotif({
      id: `call-active-${Date.now()}`,
      type: 'message',
      senderName: 'مكالمة',
      preview: `متصل مع ${callPeerLabel}`,
      onTap: () => {},
    });
  }

  function endChatCall() {
    return; // call feature removed
    const channel = callChannelRef.current || buildDmCallChannel();
    stopChatRing();
    setCallPhase('idle');
    setCallRole('none');
    setCallStartedAt(null);
    setCallElapsed(0);
    setCallMuted(false);
    if (channel) publishCallSignal('ended', channel);
    callChannelRef.current = null;
    try {
      globalCall?.endCall?.();
      globalCall?.hangUp?.();
    } catch {/* optional API */}
    pushNotif({
      id: `call-end-${Date.now()}`,
      type: 'message',
      senderName: 'مكالمة',
      preview: `انتهت المكالمة مع ${callPeerLabel}`,
      onTap: () => {},
    });
  }

  // ── Header overflow menu (⋮) — call / speaker / select / leave-group ──
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  const [chatCameraOpen, setChatCameraOpen] = useState(false);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [hideChatChrome, setHideChatChrome] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!headerMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setHeaderMenuOpen(false);
        setShowVolSlider(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [headerMenuOpen]);
  const [leaving, setLeaving] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Voice recording state ────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserFrameRef = useRef<number | null>(null);
  const [recordLevel, setRecordLevel] = useState(0.08);
  const [recPaused, setRecPaused] = useState(false);

  // ── Streak camera state REMOVED ─────────────────────────────────────────────

  // Track whether user has scrolled up to read old messages
  const userScrolledUp = useRef(false);
  const prevMsgCount = useRef(0);
  const isInitialLoad = useRef(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // ── Typing indicator (SC) ────────────────────────────────────────────────────
  useEffect(() => {
    if (!scChatId) return;
    const poll = async () => {
      try {
        const r = await fetch(`/api/secret-chat/typing?chatId=${scChatId}`, { credentials: 'include' });
        if (r.ok) {
          const data = await r.json() as { typing: string[] };
          setScTypingNames(data.typing ?? []);
        }
      } catch {/* silent */}
    };
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [scChatId]);

  function handleScTyping(val: string) {
    setText(val);
    if (!scChatId) return;
    if (scTypingSignalRef.current) return;
    fetch(`/api/secret-chat/typing?chatId=${scChatId}`, { method: 'POST', credentials: 'include' }).catch(() => {});
    scTypingSignalRef.current = setTimeout(() => { scTypingSignalRef.current = null; }, 2000);
  }

  // ── Typing indicator (old — kept for group chats) ────────────────────────────
  const [_typers, setTypers] = useState<{ name: string; avatarUrl: string }[]>([]);
  const lastTypingSentRef = useRef(0);

  // Poll for who's typing every 1.5s (group only)
  useEffect(() => {
    if (!user || !isGroup) return;
    const poll = async () => {
      try {
        const r = await fetch(`/api/typing?groupId=${groupId}`, { credentials: 'include' });
        if (r.ok) {
          const data = await r.json();
          setTypers(data.typers ?? []);
        }
      } catch {/* silent */}
    };
    poll();
    const id = setInterval(poll, 1500);
    return () => clearInterval(id);
  }, [user, isGroup, groupId]);

  const dmTypeRef = useRef<() => void>(() => {});
  const sendTyping = useCallback(() => {
    if (!isGroup) {
      try { dmTypeRef.current(); } catch { /* */ }
      return;
    }
    const now = Date.now();
    if (now - lastTypingSentRef.current < 2000) return;
    lastTypingSentRef.current = now;
    fetch('/api/typing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ groupId })
    }).catch(() => {});
  }, [isGroup, groupId]);

  // Presence + DM typing
  useHeartbeat(!!user, {
    userId: user?.id,
    name: user?.name ?? null,
    username: (user as any)?.username ?? null,
  });
  const presenceMap = usePresenceQuery(peerId ? [peerId] : []);
  const peerPresence = peerId ? presenceMap[peerId] : null;
  const onDmType = useTypingPublisher(!isGroup ? peerId : null, user?.id);
  const peerIsTyping = usePeerTyping(user?.id, !isGroup ? peerId : null);
  dmTypeRef.current = onDmType;

  // Highlighted (red) user IDs
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const r = await fetch('/api/highlights');
        if (r.ok) setHighlightedIds(new Set(await r.json()));
      } catch {/* silent */}
    };
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [user]);

  // Peer avatar (DM only)
  const [peerAvatarUrl, setPeerAvatarUrl] = useState<string | null>(peerAvatarParam || null);
  const [peerUsernameDb, setPeerUsernameDb] = useState<string | null>(null);
  useEffect(() => {
    if (!user || !peerId) return;
    fetch(`/api/users/${peerId}`).then(r => r.ok ? r.json() : null).then(d => {
      if (d) {
        setPeerAvatarUrl(d.avatarUrl ?? null);
        setPeerUsernameDb(d.username ?? null);
      }
    }).catch(() => {});
  }, [user, peerId]);

  // هل الـ peer هو الأونر @Q8؟
  const peerIsOwner = !isGroup && (peerUsernameDb === 'Q8' || peerUsername === 'Q8' || peerUsernameDb === 'Stooorna' || peerUsername === 'Stooorna');

  // إذا كان الـ peer هو الأونر نفسه (المستخدم الحالي) — استمع لتحديث الصورة
  useEffect(() => {
    if (!peerId || peerId !== user?.id) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{
        avatarUrl: string;
      }>).detail;
      if (detail?.avatarUrl) setPeerAvatarUrl(detail.avatarUrl);
    };
    window.addEventListener('stooorna:avatar-updated', handler);
    return () => window.removeEventListener('stooorna:avatar-updated', handler);
  }, [peerId, user?.id]);

  // My own profile — name, @username, avatar for showing on my own messages
  const [myProfile, setMyProfile] = useState<{
    name?: string | null;
    username?: string | null;
    avatarUrl?: string | null;
  } | null>(null);
  useEffect(() => {
    if (!user) return;
    fetch('/api/users/me', {
      credentials: 'include'
    }).then(r => r.ok ? r.json() : null).then(d => {
      if (d) setMyProfile(d);
    }).catch(() => {});
  }, [user]);


  // ── Auto-init SC DM chat ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !peerId || isGroup) return;
    fetch('/api/secret-chat/dm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ peerId })
    }).then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.chatId) setScChatId(d.chatId); })
      .catch(() => {});
  }, [user, peerId, isGroup]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch messages ──────────────────────────────────────────────────────────
  const fetchMsgs = useCallback(async () => {
    try {
      let url: string;
      let raw: unknown = [];
      if (isGroup) {
        const r = await fetch(`/api/groups/${groupId}/messages`, { credentials: 'include' });
        if (r.ok) raw = await r.json();
      } else {
        const urls = [
          scChatId ? `/api/secret-chat/messages?chatId=${scChatId}` : '',
          peerId ? `/api/messages?peerId=${encodeURIComponent(peerId)}` : '',
          peerId ? `/api/chat/messages?with=${encodeURIComponent(peerId)}` : '',
        ].filter(Boolean);
        for (const url of urls) {
          try {
            const r = await fetch(url, { credentials: 'include' });
            if (!r.ok) continue;
            const data = await r.json();
            const list = Array.isArray(data) ? data : (data?.messages || data?.items || []);
            if (Array.isArray(list) && list.length >= 0) { raw = list; break; }
          } catch { /* next */ }
        }
      }
      if (!Array.isArray(raw)) return;
      let clearedAt = 0;
      try {
        const key = `stooorna_chat_cleared_${isGroup ? `g_${groupId}` : (scChatId || peerId || 'x')}`;
        clearedAt = Number(localStorage.getItem(key) || 0);
      } catch { clearedAt = 0; }

      // Normalise SC messages (sender_id → senderId etc.) so the existing Message type works
      const newMsgs: Message[] = raw.map((m: Record<string, unknown>) => ({
        id: m.id as number,
        senderId: (m.senderId ?? m.sender_id) as string,
        type: (m.type ?? 'text') as Message['type'],
        body: (m.body ?? null) as string | null,
        duration: (m.duration ?? null) as number | null,
        createdAt: (m.createdAt ?? m.created_at ?? null) as string | null,
        read: !!(m.read ?? m.isRead ?? m.seen),
        readAt: (m.readAt ?? m.read_at ?? null) as string | null,
        delivered: !!(m.delivered ?? m.isDelivered),
        senderName: (m.senderName ?? m.sender_name ?? null) as string | null,
        senderUsername: (m.senderUsername ?? m.sender_username ?? null) as string | null,
        senderAvatarUrl: (m.senderAvatarUrl ?? m.sender_avatar_url ?? null) as string | null,
        senderNameColor: (m.senderNameColor ?? m.sender_name_color ?? null) as string | null,
        isSystem: !!(m.is_system),
        isStreak: !!(m.is_streak),
        streakOpenedAt: (m.streak_opened_at ?? null) as string | null,
        streakDuration: (m.streak_duration ?? null) as number | null,
        streakMediaType: (m.streak_media_type ?? null) as 'photo' | 'video' | null,
      })).filter(m => {
        if (!clearedAt) return true;
        const t = m.createdAt ? Date.parse(m.createdAt) : 0;
        return !t || t > clearedAt;
      });

      // Detect new incoming messages
      if (prevMsgCountRef.current >= 0 && newMsgs.length > prevMsgCountRef.current) {
        const incoming = newMsgs.slice(prevMsgCountRef.current).filter(m => m.senderId !== user?.id && !m.isSystem);
        if (incoming.length > 0) {
          setHasNewMsg(true);
          playBubblePop('recv');
          playNotificationSound('message');
          const last = incoming[incoming.length - 1];
          const senderName = last.senderName ?? last.senderUsername ?? 'Someone';
          const preview = last.type === 'text'
            ? (parseProductInquiry(last.body) ? '🛒 استفسار منتج' : (last.body ?? '🎤 Voice message'))
            : last.type === 'voice'
              ? '🎤 Voice message'
              : last.type === 'call'
                ? (last.body === 'missed' ? '📞 Missed call' : `📞 Call${last.duration ? ' · ' + fmtCallDuration(last.duration) : ''}`)
                : last.type === 'video'
                  ? '🎥 Video'
                  : last.type === 'file'
                    ? '📎 File'
                    : '🖼️ Image';
          pushNotif({ id: `msg-${Date.now()}`, type: 'message', senderName, senderAvatar: last.senderAvatarUrl, preview, onTap: () => {} });
          // رد الشركة على استفسار منتج → شير أصفر + أيقونة شات المستخدم صفراء
          try {
            const hasInquiry = newMsgs.some(m => m.senderId === user?.id && parseProductInquiry(m.body));
            if (hasInquiry) {
              const inquiryMsg = [...newMsgs].reverse().find(m => m.senderId === user?.id && parseProductInquiry(m.body));
              const inq = inquiryMsg ? parseProductInquiry(inquiryMsg.body) : null;
              if (inq) {
                const threadsKey = 'stooorna_product_inquiry_threads';
                const threads = JSON.parse(localStorage.getItem(threadsKey) || '{}');
                threads[String(inq.postId)] = { companyId: inq.companyId || peerId, hasReply: true, postId: inq.postId };
                localStorage.setItem(threadsKey, JSON.stringify(threads));
                window.dispatchEvent(new CustomEvent('stooorna:product-inquiry', { detail: threads }));
              }
            }
            // أيقونة الشات السفلية للمستخدم (بين الهوم والمايك)
            if (user?.id && peerId && incoming.length > 0) {
              const lastIn = incoming[incoming.length - 1];
              const preview =
                lastIn.type === 'text'
                  ? (parseProductInquiry(lastIn.body)?.question || lastIn.body || 'رد من الشركة')
                  : lastIn.type === 'voice'
                    ? '🎤 رسالة صوتية'
                    : 'رسالة جديدة';
              const ukey = `stooorna_user_product_chats_${user.id}`;
              const ulist = JSON.parse(localStorage.getItem(ukey) || '[]');
              const arr = Array.isArray(ulist) ? ulist : [];
              const idx = arr.findIndex((x: { id?: string }) => x.id === peerId);
              const companyName = lastIn.senderName || lastIn.senderUsername || (idx >= 0 ? arr[idx].name : null);
              const next = {
                id: peerId,
                name: companyName,
                username: lastIn.senderUsername || (idx >= 0 ? arr[idx].username : null),
                avatarUrl: lastIn.senderAvatarUrl || (idx >= 0 ? arr[idx].avatarUrl : null),
                lastMessage: preview,
                at: Date.now(),
                unread: (idx >= 0 ? (arr[idx].unread || 0) : 0) + 1,
              };
              const umerged = [next, ...arr.filter((x: { id?: string }) => x.id !== peerId)].slice(0, 200);
              localStorage.setItem(ukey, JSON.stringify(umerged));
              localStorage.setItem(`stooorna_user_chat_blink_${user.id}`, String(Date.now()));
              window.dispatchEvent(new CustomEvent('stooorna:user-product-chats', { detail: { userId: user.id, list: umerged, yellowBlink: true } }));
              window.dispatchEvent(new CustomEvent('stooorna:bottom-chat-blink', { detail: { target: 'user', userId: user.id, yellow: true } }));
            }
          } catch { /* */ }
        }
      }
      if (prevMsgCountRef.current === -1 && newMsgs.length > 0) setHasNewMsg(true);
      prevMsgCountRef.current = Math.max(prevMsgCountRef.current, newMsgs.length);
      setMsgs(prev => {
        const temps = prev.filter(m => typeof m.id === 'number' && m.id < 0);
        if (newMsgs.length > 0) return newMsgs;
        return temps.length ? temps : newMsgs;
      });
    } catch {/* silent */}
  }, [isGroup, groupId, scChatId, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    fetchMsgs();
    const id = setInterval(() => {
      // Skip polling while a bulk delete is in flight — otherwise a poll
      // response can land mid-delete with stale data and make a message
      // that was just deleted server-side reappear in the UI.
      if (isBulkDeleting) return;
      fetchMsgs();
    }, 3000);
    return () => clearInterval(id);
  }, [user, fetchMsgs, tick, isBulkDeleting]);

  // Smart auto-scroll:
  // - First load → always jump to bottom instantly
  // - New message arrives → scroll only if user is NOT scrolled up
  // - User scrolled up → NEVER force scroll down
  // Reset scroll state whenever the chat changes (new scChatId or groupId)
  useEffect(() => {
    isInitialLoad.current = true;
    prevMsgCount.current = 0;
    userScrolledUp.current = false;
    setShowScrollBtn(false);
  }, [scChatId, groupId]);

  useEffect(() => {
    if (msgs.length === 0) return;
    if (isInitialLoad.current) {
      // First batch of messages — jump to bottom immediately, no animation
      isInitialLoad.current = false;
      prevMsgCount.current = msgs.length;
      userScrolledUp.current = false;
      // Use scrollTop directly so we don't rely on bottomRef visibility
      requestAnimationFrame(() => {
        const box = scrollBoxRef.current;
        if (box) box.scrollTop = box.scrollHeight;
      });
      return;
    }
    const newMessages = msgs.length > prevMsgCount.current;
    prevMsgCount.current = msgs.length;

    // If user is reading old messages, never interrupt them
    if (userScrolledUp.current) return;

    // Only scroll if new messages arrived
    if (newMessages) {
      requestAnimationFrame(() => {
        const box = scrollBoxRef.current;
        if (box) box.scrollTop = box.scrollHeight;
      });
    }
  }, [msgs]);

  // Close action menu on outside tap
  useEffect(() => {
    if (menuMsgId === null) return;
    const close = () => setMenuMsgId(null);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menuMsgId]);

  async function sendLocation(lat: number, lng: number, live = false) {
    if (sending) return;
    playBubblePop('send');
    setSending(true);
    try {
      if (live && user?.id) {
        const { startChatLiveShare } = await import('@/lib/chatLiveMapPatch');
        startChatLiveShare(user.id);
      }
      const body = `${LOCATION_PREFIX}${JSON.stringify({ lat, lng, label: live ? 'Live location' : 'Location', live })}`;
      if (isGroup) {
        await fetch(`/api/groups/${groupId}/messages`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        });
      } else {
        if (!scChatId) return;
        await fetch('/api/secret-chat/messages', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: scChatId, body }),
        });
      }
      await fetchMsgs();
    } catch { /* silent */ } finally {
      setSending(false);
    }
  }

  // ── Send text ───────────────────────────────────────────────────────────────
  async function sendText() {
    if (!text.trim() || sending) return;
    playBubblePop('send');
    setSending(true);
    const body = text.trim();
    setText('');
    setReplyTo(null);
    const tempId = -Date.now();
    if (user?.id) {
      setMsgs(prev => [...prev, {
        id: tempId,
        senderId: user.id,
        type: 'text',
        body,
        duration: null,
        createdAt: new Date().toISOString(),
        read: false,
        readAt: null,
        delivered: false,
        senderName: (user as any).name ?? null,
        senderUsername: (user as any).username ?? null,
        senderAvatarUrl: (user as any).avatarUrl ?? (user as any).image ?? null,
        senderNameColor: null,
        isSystem: false,
        isStreak: false,
        streakOpenedAt: null,
        streakDuration: null,
        streakMediaType: null,
      } as Message]);
    }
    try {
      if (isGroup) {
        await fetch(`/api/groups/${groupId}/messages`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body })
        });
      } else {
        const posts = [
          scChatId ? { url: '/api/secret-chat/messages', payload: { chatId: scChatId, body } } : null,
          { url: '/api/messages', payload: { peerId, body, text: body } },
          { url: '/api/chat/messages', payload: { with: peerId, peerId, body } },
        ].filter(Boolean) as Array<{ url: string; payload: Record<string, unknown> }>;
        for (const ep of posts) {
          try {
            const r = await fetch(ep.url, {
              method: 'POST', credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(ep.payload),
            });
            if (r.ok || r.status === 201) break;
          } catch { /* next */ }
        }
        // تنبيهات الشريط السفلي: استفسار/رد منتج بين المستخدم والشركة
        try {
          const inquiry = parseProductInquiry(body);
          if (inquiry && user?.id && peerId) {
            // مستخدم يرسل استفسار → صندوق الشركة + وميض أصفر
            const key = `stooorna_company_inbox_${peerId}`;
            const prev = JSON.parse(localStorage.getItem(key) || '[]');
            const list = Array.isArray(prev) ? prev : [];
            const next = {
              id: user.id,
              name: user.name ?? null,
              username: (user as any).username ?? null,
              avatarUrl: (user as any).avatarUrl ?? (user as any).image ?? null,
              lastMessage: body.slice(0, 120),
              at: Date.now(),
              unread: 1,
            };
            const merged = [next, ...list.filter((x: any) => x.id !== user.id)].slice(0, 200);
            localStorage.setItem(key, JSON.stringify(merged));
            localStorage.setItem(`stooorna_company_chat_blink_${peerId}`, String(Date.now()));
            window.dispatchEvent(new CustomEvent('stooorna:company-inbox', { detail: { userId: peerId, list: merged } }));
            window.dispatchEvent(new CustomEvent('stooorna:bottom-chat-blink', { detail: { target: 'company', userId: peerId, yellow: true } }));
          } else if (user?.id && peerId) {
            // أي رد نصي (مثلاً من الشركة) → أيقونة شات المستخدم صفراء
            const ukey = `stooorna_user_product_chats_${peerId}`;
            // peerId هنا الطرف الآخر؛ نخزّن على مفتاح الطرف المستلم عندما نكون نحن الشركة
            const recipientKey = `stooorna_user_product_chats_${peerId}`;
            const uprev = JSON.parse(localStorage.getItem(recipientKey) || '[]');
            const ulist = Array.isArray(uprev) ? uprev : [];
            // أيضاً حدث عام للوميض الأصفر على أيقونة الشات السفلية
            localStorage.setItem(`stooorna_user_chat_blink_${peerId}`, String(Date.now()));
            window.dispatchEvent(new CustomEvent('stooorna:user-product-chats', {
              detail: { userId: peerId, list: ulist, yellowBlink: true, lastMessage: body.slice(0, 120) },
            }));
            window.dispatchEvent(new CustomEvent('stooorna:bottom-chat-blink', {
              detail: { target: 'user', userId: peerId, yellow: true },
            }));
            // تحديث خيوط الاستفسار hasReply عند رد الشركة
            try {
              const threadsKey = 'stooorna_product_inquiry_threads';
              const threads = JSON.parse(localStorage.getItem(threadsKey) || '{}');
              let changed = false;
              for (const k of Object.keys(threads)) {
                const t = threads[k];
                if (t && (String(t.companyId) === String(user.id) || String(t.companyId) === String(peerId))) {
                  threads[k] = { ...t, hasReply: true };
                  changed = true;
                }
              }
              if (changed) {
                localStorage.setItem(threadsKey, JSON.stringify(threads));
                window.dispatchEvent(new CustomEvent('stooorna:product-inquiry', { detail: threads }));
              }
            } catch { /* */ }
          }
        } catch { /* non-blocking */ }
      }
      await fetchMsgs();
    } catch {/* silent */} finally {
      setSending(false);
    }
  }

  // ── Send image ──────────────────────────────────────────────────────────────

  async function sendImage(file: File) {
    playBubblePop('send');
    try {
      const { makeOptimisticMedia, postChatMedia } = await import('@/lib/chatMediaSendPatch');
      if (user?.id) setMsgs(prev => [...prev, makeOptimisticMedia(file, user.id) as any]);
      await postChatMedia({ file, groupId: groupId || null, chatId: scChatId || null, peerId });
      const ct = file.type || 'image/jpeg';
      const fd = new FormData();
      fd.append('file', file, file.name || 'image.jpg');
      fd.append('image', file, file.name || 'image.jpg');
      let res: Response | null = null;
      if (isGroup) {
        res = await fetch(`/api/groups/${groupId}/messages/image`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': ct }, body: file
        });
        if (!res.ok) {
          res = await fetch(`/api/groups/${groupId}/messages/image`, {
            method: 'POST', credentials: 'include', body: fd
          });
        }
      } else {
        if (!scChatId) return;
        res = await fetch(`/api/secret-chat/image?chatId=${scChatId}`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': ct }, body: file
        });
        if (!res.ok) {
          res = await fetch(`/api/secret-chat/image?chatId=${scChatId}`, {
            method: 'POST', credentials: 'include', body: fd
          });
        }
      }
      await fetchMsgs();
    } catch {/* silent */}
  }

  // ── Send video / document file ───────────────────────────────────────────────
  async function sendFile(file: File) {
    playBubblePop('send');
    try {
      const ct = file.type || 'application/octet-stream';
      const isVid = ct.startsWith('video/') || isLikelyVideoUrl(file.name);
      const isImg = ct.startsWith('image/') || isLikelyImageUrl(file.name);
      if (isImg && !isGroup) {
        await sendImage(file);
        return;
      }
      if (isGroup) {
        await fetch(`/api/groups/${groupId}/messages/file?name=${encodeURIComponent(file.name)}`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': ct }, body: file
        });
      } else {
        if (!scChatId) return;
        // Prefer dedicated image endpoint when mime is image
        if (isImg) {
          await fetch(`/api/secret-chat/image?chatId=${scChatId}`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': ct }, body: file
          });
        } else {
          await fetch(`/api/secret-chat/file?chatId=${scChatId}&name=${encodeURIComponent(file.name)}`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': ct }, body: file
          });
        }
      }
      await fetchMsgs();
    } catch {/* silent */}
  }

  /** Video note — اسم الملف video-note-* ليُعرض كفقاعة دائرية في الشات */
  async function sendVideoNote(file: File, durationSec?: number) {
    playBubblePop('send');
    const safeName = file.name.startsWith('video-note-')
      ? file.name
      : `video-note-${Date.now()}.${file.name.split('.').pop() || 'webm'}`;
    const named = new File([file], safeName, { type: file.type || 'video/webm' });
    try {
      const q = durationSec && durationSec > 0 ? `&duration=${Math.round(durationSec)}` : '';
      if (isGroup) {
        await fetch(`/api/groups/${groupId}/messages/file?name=${encodeURIComponent(safeName)}${q}`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': named.type }, body: named
        });
      } else {
        if (!scChatId) return;
        await fetch(`/api/secret-chat/file?chatId=${scChatId}&name=${encodeURIComponent(safeName)}${q}`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': named.type }, body: named
        });
      }
      await fetchMsgs();
    } catch {/* silent */}
  }

  // ── Voice recording ──────────────────────────────────────────────────────────
  async function startRecording() {
    try {
      try { inputRef.current?.blur(); } catch { /* ignore */ }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/webm';
      const recorder = new MediaRecorder(stream, {
        mimeType
      });
      audioChunksRef.current = [];
      recorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.start(100);
      mediaRecorderRef.current = recorder;
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      const samples = new Uint8Array(analyser.fftSize);
      const updateLevel = () => {
        analyser.getByteTimeDomainData(samples);
        const average = samples.reduce((sum, value) => sum + Math.abs(value - 128), 0) / samples.length;
        setRecordLevel(Math.min(1, Math.max(0.06, average / 28)));
        analyserFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
      setIsRecording(true);
      setRecPaused(false);
      setRecordSecs(0);
      recordTimerRef.current = setInterval(() => setRecordSecs(s => s + 1), 1000);
    } catch {/* mic denied */}
  }
  async function stopRecording(send: boolean) {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (analyserFrameRef.current) cancelAnimationFrame(analyserFrameRef.current);
    analyserFrameRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    setRecordLevel(0.08);
    recorder.stop();
    recorder.stream.getTracks().forEach(t => t.stop());
    mediaRecorderRef.current = null;
    setIsRecording(false);
    setRecPaused(false);
    if (send) playBubblePop('send');
    if (!send) {
      setRecordSecs(0);
      return;
    }
    await new Promise<void>(resolve => {
      recorder.onstop = () => resolve();
    });
    const blob = new Blob(audioChunksRef.current, {
      type: recorder.mimeType || 'audio/webm'
    });
    if (blob.size < 500) {
      setRecordSecs(0);
      return;
    }
    try {
      const duration = recordSecs;
      if (isGroup) {
        await fetch(`/api/groups/${groupId}/messages/voice?duration=${duration}`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': blob.type }, body: blob
        });
      } else {
        const voiceUrls = [
          scChatId ? `/api/secret-chat/voice?chatId=${scChatId}&duration=${duration}` : '',
          peerId ? `/api/messages/voice?peerId=${encodeURIComponent(peerId)}&duration=${duration}` : '',
        ].filter(Boolean);
        for (const vurl of voiceUrls) {
          try {
            const vr = await fetch(vurl, {
              method: 'POST', credentials: 'include',
              headers: { 'Content-Type': blob.type }, body: blob
            });
            if (vr.ok || vr.status === 201) break;
          } catch { /* next */ }
        }
      }
      await fetchMsgs();
    } catch {/* silent */}
    setRecordSecs(0);
  }
  async function deleteMessage(msgId: number) {
    const target = msgs.find(m => m.id === msgId);
    if (target && user?.id && target.senderId !== user.id) return;
    const inquiry = target ? parseProductInquiry(target.body) : null;
    // تنبيه: حذف الاستفسار يلغيه من الطرفين (المستخدم + شات الشركة)
    if (inquiry || target) {
      const ok = window.confirm(
        inquiry
          ? 'سيتم حذف الاستفسار والمحادثة المرتبطة به بشكل كامل من الطرفين (أنت والشركة). هل تريد المتابعة؟'
          : 'حذف الرسالة؟ قد تُحذف لدى الطرفين إن سمح السيرفر بذلك.',
      );
      if (!ok) return;
    }
    try {
      const url = isGroup
        ? `/api/groups/${groupId}/messages/${msgId}`
        : `/api/secret-chat/message/${msgId}`;
      const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
      if (res.ok || res.status === 404) {
        setMsgs(prev => prev.map(m => m.id === msgId ? { ...m, body: '', type: 'text' as const } : m).filter(m => m.id !== msgId));
        // إزالة من صندوق شات الشركة عند حذف استفسار منتج
        if (inquiry && user?.id) {
          try {
            const companyId = inquiry.companyId || peerId;
            const key = `stooorna_company_inbox_${companyId}`;
            const list = JSON.parse(localStorage.getItem(key) || '[]');
            if (Array.isArray(list)) {
              const next = list.filter((x: { id?: string }) => x.id !== user.id);
              localStorage.setItem(key, JSON.stringify(next));
              window.dispatchEvent(new CustomEvent('stooorna:company-inbox', { detail: { userId: companyId, list: next } }));
            }
            // إزالة علم الشير الأصفر
            const threadsKey = 'stooorna_product_inquiry_threads';
            const threads = JSON.parse(localStorage.getItem(threadsKey) || '{}');
            if (threads[String(inquiry.postId)]) {
              delete threads[String(inquiry.postId)];
              localStorage.setItem(threadsKey, JSON.stringify(threads));
              window.dispatchEvent(new CustomEvent('stooorna:product-inquiry', { detail: threads }));
            }
          } catch { /* */ }
        }
      } else {
        console.error('[deleteMessage] failed', res.status, await res.text());
      }
    } catch (e) {
      console.error('[deleteMessage] error', e);
    }
  }

  // ── Leave group ─────────────────────────────────────────────────────────────
  async function leaveGroup() {
    setLeaving(true);
    try {
      await fetch(`/api/groups/${groupId}/leave`, {
        method: 'DELETE'
      });
      navigate('/add-friend');
    } catch {/* silent */} finally {
      setLeaving(false);
    }
  }

  // ── Reply helper ─────────────────────────────────────────────────────────────
  function startReply(msg: Message) {
    setReplyTo(msg);
    setTimeout(() => inputRef.current?.focus(), 80);
  }

  // Hide the global Friends / Call / Settings navigation while inside a chat.
  // IMPORTANT: this must run BEFORE the early `return`s below — React requires every
  // hook (useState/useEffect/etc.) to run in the exact same order on every render.
  // It used to sit after `if (isPending) return null;` / `if (!user) {...}`, so on the
  // very first render (isPending === true) this hook was skipped entirely, and once
  // isPending flipped to false a *new* hook suddenly appeared in the middle of the
  // hook list. That mismatch corrupts React's internal hook bookkeeping for this
  // component and is exactly what was causing the header (and other bits of UI) to
  // silently fail to render.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('stooorna:chat-state', {
      detail: {
        open: true
      }
    }));
    return () => {
      window.dispatchEvent(new CustomEvent('stooorna:chat-state', {
        detail: {
          open: false
        }
      }));
    };
  }, []);
  if (isPending) return null;
  if (!user) {
    return <div style={{
      minHeight: '100dvh',
      background: T.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
        <button onClick={() => navigate('/settings')} style={{
        color: T.primary,
        background: 'none',
        border: 'none',
        cursor: 'pointer'
      }}>Sign in first</button>
      </div>;
  }
  const displayName = isGroup ? liveGroupName || groupName : peerName || peerUsername || 'User';
  const peerIsRed = !isGroup && highlightedIds.has(peerId);
  return <>
      <Helmet>
        <title>{isGroup ? `${displayName} — Group Chat` : `Chat with ${displayName}`} | Stooorna</title>
        <meta name="description" content={isGroup ? `Group voice and text chat in ${displayName} on Stooorna.` : `Voice and text conversation with ${displayName} on Stooorna.`} />
        <link rel="canonical" href="https://stooorna.com/chat" />
        <meta property="og:title" content={isGroup ? `${displayName} — Group Chat | Stooorna` : `Chat with ${displayName} | Stooorna`} />
        <meta property="og:description" content="Real-time voice and text messaging on Stooorna." />
        <meta property="og:image" content="https://stooorna.com/og-image.svg" />
        <meta property="og:url" content="https://stooorna.com/chat" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://stooorna.com/og-image.svg" />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <h1 className="sr-only">{isGroup ? `Group chat: ${displayName}` : `Chat with ${displayName}`}</h1>

      <motion.div
        initial={false}
        animate={{ y: closing ? '100%' : 0, opacity: closing ? 0 : 1 }}
        transition={{ type: 'tween', duration: 0.32, ease: 'easeIn' }}
        onAnimationComplete={() => { if (closing) navigate(-1); }}
        style={{
      height: '100dvh',
      maxHeight: '100dvh',
      overflow: 'hidden',
      background: T.bg,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'var(--font-sans)',
      position: 'relative'
    }} onClick={() => { setMenuMsgId(null); setHeaderMenuOpen(false); setShowVolSlider(false); }}>

        {/* ── LiveVoiceBanner — إشعار البث الصوتي المباشر ── */}
        {user && <LiveVoiceBanner chatId={chatId} myId={user.id} />}

        {/* مستطيل المكالمة النشطة فقط: إنهاء + ذبذبات + كتم — بدون واجهة كبيرة */}
        <AnimatePresence>
          {false && (callPhase === 'ringing' || callPhase === 'active') && ( // call feature removed
            <motion.div
              key="active-call-bar"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              style={{
                flexShrink: 0,
                margin: '0 12px 0',
                padding: '8px 12px',
                borderRadius: 12,
                background: 'rgba(0,188,212,0.1)',
                border: '1px solid rgba(0,188,212,0.28)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                zIndex: 15,
              }}
            >
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={() => endChatCall()}
                aria-label="End call"
                style={{
                  width: 36, height: 36, borderRadius: '50%', border: 'none',
                  background: 'rgba(239,68,68,0.2)', color: '#ef4444', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}
              >
                <PhoneOff size={16} strokeWidth={2.4} />
              </motion.button>

              {/* ذبذبات صوت بسيطة */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, height: 28 }}>
                {[0.35, 0.7, 1, 0.55, 0.85, 0.45, 0.95, 0.6].map((h, i) => (
                  <motion.span
                    key={i}
                    animate={callMuted ? { scaleY: 0.25 } : { scaleY: [0.35, h, 0.4, h * 0.8, 0.35] }}
                    transition={{ duration: 0.9 + i * 0.05, repeat: Infinity, ease: 'easeInOut' }}
                    style={{
                      width: 3, height: 22, borderRadius: 2,
                      background: callMuted ? 'rgba(239,68,68,0.5)' : '#22c55e',
                      transformOrigin: 'center',
                      display: 'inline-block',
                    }}
                  />
                ))}
              </div>

              <span style={{
                fontSize: '0.72rem', fontWeight: 700,
                color: callPhase === 'ringing' ? '#facc15' : '#22c55e',
                fontVariantNumeric: 'tabular-nums', flexShrink: 0, minWidth: 52, textAlign: 'center',
              }}>
                {callPhase === 'ringing' ? 'Calling…' : fmtCallDuration(callElapsed)}
              </span>

              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={() => setCallMuted(m => !m)}
                aria-label={callMuted ? 'Unmute' : 'Mute'}
                style={{
                  width: 36, height: 36, borderRadius: '50%', border: 'none',
                  background: callMuted ? 'rgba(239,68,68,0.2)' : 'rgba(0,188,212,0.15)',
                  color: callMuted ? '#ef4444' : T.primary, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}
              >
                {callMuted ? <MicOff size={16} strokeWidth={2.3} /> : <Mic size={16} strokeWidth={2.3} />}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Header ── */}
        <div
          style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: 'max(10px, env(safe-area-inset-top)) 14px 10px',
          background: '#ffffff',
          backdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${T.navBorder}`,
          position: 'sticky',
          top: 0,
          zIndex: 20,
          flexShrink: 0,
          transform: hideChatChrome ? 'translateY(-110%)' : 'translateY(0)',
          transition: 'transform 0.22s ease',
        }}>
          <motion.button whileTap={{
          scale: 0.85
        }} onClick={() => setClosing(true)} style={{
          color: T.primary,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 4
        }}>
            <X size={22} strokeWidth={2} />
          </motion.button>
          <div style={{
          cursor: 'pointer'
        }} onClick={() => {
          if (isGroup) {
            setShowGroupInfo(true);
          } else if (peerAvatarUrl) {
            setAvatarLightboxUrl(peerAvatarUrl);
          }
        }}>
            {isGroup
              ? <UserAvatar name={displayName} avatarUrl={liveGroupAvatar} size={36} red={peerIsRed} blue={peerIsOwner} online={undefined} />
              : (
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'hsl(var(--primary)/0.12)',
                  border: '1.5px solid hsl(var(--primary)/0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 0 10px hsl(var(--primary)/0.2)',
                }}>
                  <Lock size={13} style={{ color: 'hsl(var(--primary))' }} strokeWidth={2} />
                </div>
              )
            }
          </div>
          <div style={{
          flex: 1
        }}>
            <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5
          }}>
              <p style={{
              color: T.text,
              fontSize: '0.9rem',
              fontWeight: 600,
              lineHeight: 1.2
            }}>{displayName}</p>
              {peerIsOwner && <span style={{
              fontSize: '0.58rem',
              fontWeight: 800,
              letterSpacing: '0.06em',
              color: '#fff',
              background: 'linear-gradient(135deg,#2563eb,#1d4ed8)',
              borderRadius: 5,
              padding: '1px 5px',
              boxShadow: '0 0 8px rgba(37,99,235,0.55)',
              lineHeight: 1.6
            }}>OWNER</span>}
            </div>
            {!isGroup && (peerUsername || peerPresence) && <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 1
          }}>
                {peerUsername && <span style={{
              fontSize: '0.68rem',
              fontWeight: 400,
              lineHeight: 1.2,
              color: peerIsOwner ? '#2563eb' : peerIsRed ? '#ef4444' : T.textDim
            }}>@{peerUsername}</span>}
                <span style={{
              fontSize: '0.68rem',
              lineHeight: 1.2
            }}>
                  {peerIsTyping ? <span style={{
                color: '#22c55e',
                fontWeight: 700
              }}>Type....</span> : peerPresence?.online ? <span style={{
                color: '#22c55e',
                fontWeight: 600
              }}>● Online</span> : peerPresence?.lastSeenAt ? <span style={{
                color: T.textDim
              }}>{formatLastSeen(peerPresence.lastSeenAt)}</span> : <span style={{
                color: '#111111',
                fontWeight: 400,
                opacity: 1,
              }}>Offline</span>}
                </span>
              </div>}
            {isGroup && <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5
          }}>
                <p style={{
              color: T.textDim,
              fontSize: '0.68rem'
            }}>Group</p>

              </div>}
          </div>


          {/* ── اتصال + قائمة ⋮ (الاتصال نُقل من البروفايل إلى هنا) ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          {false && !isGroup && peerId && ( // call feature removed
            <motion.button
              type="button"
              whileTap={{ scale: 0.88 }}
              onClick={e => {
                e.stopPropagation();
                // idle → بدء رنين (أصفر) بدون واجهة كبيرة
                if (callPhase === 'idle') {
                  const channel = buildDmCallChannel();
                  if (!channel || !user) return;
                  callChannelRef.current = channel;
                  setCallRole('caller');
                  setCallPhase('ringing');
                  startChatRing();
                  publishCallSignal('ringing', channel);
                  // لا نستدعي globalCall.startCall هنا — يفتح واجهة اتصال كاملة الشاشة.
                  pushNotif({
                    id: `call-out-${Date.now()}`,
                    type: 'message',
                    senderName: 'Calling',
                    preview: `رنين لـ ${callPeerLabel}…`,
                    onTap: () => {},
                  });
                  return;
                }
                // ringing + callee → الرد (يتحول أخضر عند الطرفين)
                if (callPhase === 'ringing' && callRole === 'callee') {
                  answerChatCall();
                  return;
                }
                // ringing + caller → إلغاء الرنين بصمت
                if (callPhase === 'ringing' && callRole === 'caller') {
                  endChatCall();
                  return;
                }
                // active → إنهاء من أيقونة الهاتف فقط
                if (callPhase === 'active') {
                  endChatCall();
                }
              }}
              aria-label={
                callPhase === 'idle' ? 'Start call'
                  : callPhase === 'ringing' && callRole === 'callee' ? 'Answer call'
                  : callPhase === 'ringing' ? 'Cancel ring'
                  : 'End call'
              }
              style={{
                width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                background: 'transparent', border: 'none',
                // أحمر = idle | أصفر = رنين/انتظار | أخضر = متصل
                color: callPhase === 'active' ? '#22c55e' : callPhase === 'ringing' ? '#facc15' : '#ef4444',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                filter: callPhase !== 'idle' ? 'drop-shadow(0 0 8px currentColor)' : 'none',
                animation: callPhase === 'ringing' ? 'stooornaCallIconPulse 1.1s ease-in-out infinite' : 'none',
              }}
            >
              <PhoneOff size={18} strokeWidth={2.3} />
            </motion.button>
          )}
          <div ref={headerMenuRef} style={{ position: 'relative' }}>
            <motion.button whileTap={{ scale: 0.88 }} onClick={e => {
              e.stopPropagation();
              setHeaderMenuOpen(v => !v);
            }} aria-label="More options" style={{
              width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
              background: 'transparent', border: 'none', color: T.primary, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0,
            }}>
              {(callPhase === 'ringing' || callPhase === 'active') ? (
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3.5 }} aria-hidden>
                  <span style={{ width: 4.5, height: 4.5, borderRadius: '50%', background: '#facc15', boxShadow: '0 0 6px rgba(250,204,21,0.7)' }} />
                  <span style={{ width: 4.5, height: 4.5, borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 6px rgba(59,130,246,0.7)' }} />
                  <span style={{ width: 4.5, height: 4.5, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px rgba(34,197,94,0.7)' }} />
                </span>
              ) : (
                <MoreVertical size={20} strokeWidth={2} />
              )}
            </motion.button>

            <AnimatePresence>
              {headerMenuOpen && <motion.div initial={{
              opacity: 0,
              scale: 0.9,
              y: -6
            }} animate={{
              opacity: 1,
              scale: 1,
              y: 0
            }} exit={{
              opacity: 0,
              scale: 0.9,
              y: -6
            }} transition={{
              duration: 0.15
            }} style={{
              position: 'absolute',
              top: 40,
              right: 0,
              zIndex: 500,
              background: 'rgba(6,14,14,0.97)',
              border: '1px solid rgba(0,188,212,0.25)',
              borderRadius: 14,
              padding: 6,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              minWidth: 200
            }} onClick={e => e.stopPropagation()}>

                  {/* Speaker volume — tap to expand the slider inline */}
                  <button onClick={() => setShowVolSlider(v => !v)} style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '10px 10px', background: 'transparent', border: 'none', borderRadius: 9,
                color: '#fff', fontSize: '0.8rem', fontWeight: 400, cursor: 'pointer', textAlign: 'left'
              }}>
                    {speakerVol === 0 ? <VolumeX size={16} strokeWidth={2} color="#ef4444" /> : <Volume2 size={16} strokeWidth={2} color={isSpeaking ? '#22c55e' : '#fff'} />}
                    Speaker
                    <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.7)', fontSize: '0.7rem', fontWeight: 400 }}>{Math.round(speakerVol * 100)}%</span>
                  </button>
                  {showVolSlider && <div style={{ padding: '2px 10px 10px' }}>
                    <div style={{
                position: 'relative',
                height: 24,
                display: 'flex',
                alignItems: 'center'
              }}>
                      <div style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  height: 4,
                  borderRadius: 4,
                  background: 'rgba(255,255,255,0.08)'
                }} />
                      <div style={{
                  position: 'absolute',
                  left: 0,
                  height: 4,
                  width: `${speakerVol * 100}%`,
                  borderRadius: 4,
                  background: speakerVol === 0 ? '#ef4444' : 'linear-gradient(90deg, #00BCD4, #0097a7)',
                  transition: 'width 0.05s'
                }} />
                      <input type="range" min={0} max={1} step={0.02} value={speakerVol} onChange={e => setSpeakerVol(Number(e.target.value))} style={{
                  position: 'relative',
                  width: '100%',
                  height: 24,
                  appearance: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  zIndex: 1
                }} />
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      {[0, 0.5, 1].map(v => <motion.button key={v} whileTap={{
                    scale: 0.9
                  }} onClick={() => setSpeakerVol(v)} style={{
                    flex: 1,
                    padding: '5px 0',
                    background: Math.abs(speakerVol - v) < 0.05 ? 'rgba(0,188,212,0.2)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${Math.abs(speakerVol - v) < 0.05 ? 'rgba(0,188,212,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: 8,
                    color: Math.abs(speakerVol - v) < 0.05 ? '#00BCD4' : 'rgba(255,255,255,0.5)',
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}>
                          {v === 0 ? 'Mute' : v === 0.5 ? '50%' : '100%'}
                        </motion.button>)}
                    </div>
                  </div>}

                  {/* Clear History — wipes ALL messages in this conversation */}
                  <button
                    type="button"
                    disabled={isClearingHistory}
                    onClick={() => { setHeaderMenuOpen(false); setShowClearConfirm(true); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '10px 10px', background: 'transparent', border: 'none', borderRadius: 9,
                      color: '#fff', fontSize: '0.8rem', fontWeight: 400, cursor: isClearingHistory ? 'default' : 'pointer',
                      textAlign: 'left', opacity: isClearingHistory ? 0.6 : 1,
                    }}
                  >
                    <Trash2 size={16} strokeWidth={2} color="#ef4444" />
                    {isClearingHistory ? 'Clearing…' : 'Clear History'}
                  </button>

                  {/* Leave group — group chats only */}
                  {isGroup && <button onClick={() => { setHeaderMenuOpen(false); setShowLeaveConfirm(true); }} style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '10px 10px', background: 'transparent', border: 'none', borderRadius: 9,
                color: 'rgba(239,68,68,0.85)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', textAlign: 'right'
              }}>
                    <LogOut size={16} strokeWidth={2} />
                    Leave group
                  </button>}

                  {/* Media, links, and docs */}
                  <button
                    type="button"
                    onClick={() => { setHeaderMenuOpen(false); setMediaLibraryOpen(true); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '10px 10px', background: 'transparent', border: 'none', borderRadius: 9,
                      color: '#fff', fontSize: '0.8rem', fontWeight: 400, cursor: 'pointer', textAlign: 'left'
                    }}
                  >
                    <Images size={16} strokeWidth={2} color={T.primary} />
                    Media, links, and docs
                  </button>

                  {/* قائمة من دخلوا المحادثة الصوتية فقط — بدون رنين/إنهاء */}
                  {false && (callPhase === 'ringing' || callPhase === 'active') && ( // call feature removed
                    <>
                      <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '6px 6px 4px' }} />
                      <p style={{ margin: '4px 10px 6px', color: T.textDim, fontSize: '0.68rem', fontWeight: 700 }}>In voice</p>
                      {/* أنا */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px' }}>
                        <div style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: callPhase === 'active' ? '#22c55e' : '#facc15',
                          boxShadow: callPhase === 'active' ? '0 0 6px #22c55e' : '0 0 6px #facc15',
                        }} />
                        <span style={{ color: T.text, fontSize: '0.8rem', fontWeight: 600 }}>You</span>
                      </div>
                      {/* الطرف الآخر */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px' }}>
                        <div style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: callPhase === 'active' ? '#22c55e' : 'rgba(255,255,255,0.25)',
                          boxShadow: callPhase === 'active' ? '0 0 6px #22c55e' : 'none',
                        }} />
                        <span style={{ color: T.text, fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {callPeerLabel}
                        </span>
                      </div>
                    </>
                  )}

                </motion.div>}
            </AnimatePresence>
          </div>
          </div>

        </div>

        {/* ── Messages ── */}
        <div ref={scrollBoxRef} onScroll={() => {
        const box = scrollBoxRef.current;
        if (!box) return;
        // Consider "at bottom" if within 200px of the end
        const distFromBottom = box.scrollHeight - box.scrollTop - box.clientHeight;
        const scrolledUp = distFromBottom > 200;
        userScrolledUp.current = scrolledUp;
        setShowScrollBtn(scrolledUp);
        const prev = Number(box.dataset.prevScroll || 0);
        box.dataset.prevScroll = String(box.scrollTop);
        setHideChatChrome(box.scrollTop > 24 && box.scrollTop > prev);
        try {
          window.dispatchEvent(new CustomEvent('stooorna:bottom-nav', { detail: { hidden: box.scrollTop > 24 && box.scrollTop > prev } }));
        } catch { /* ignore */ }
      }} style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
        padding: '12px 12px 8px',
        // contain:strict tells the browser this box is a scroll boundary —
        // prevents the parent from being scrolled when the user swipes inside
        contain: 'strict' as React.CSSProperties['contain'],
      }}>
          {/* Inner flex column — keeps gap between messages without affecting scroll */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: '100%' }}>
          {msgs.length === 0 && <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 80
        }}>
              <p style={{
            color: T.textDim,
            fontSize: '0.82rem',
            textAlign: 'center'
          }}>
                Say hello — send a text, voice message, or photo
              </p>
            </div>}
          {msgs.length > 0 && msgs.map((m, idx) => {
          // ── System message (SC join/leave) ──
          if (m.isSystem) {
            return <div key={m.id} style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
              <span style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))', fontSize: '0.7rem', borderRadius: 20, padding: '4px 12px', fontStyle: 'italic' }}>
                {m.body}
              </span>
            </div>;
          }
          const isMe = m.senderId === user.id;
          const senderIsRed = highlightedIds.has(m.senderId);
          const senderIsOwner = m.senderUsername === 'Q8' || m.senderUsername === 'Stooorna';
          const isMenuOpen = menuMsgId === m.id;

          // Group consecutive messages — show sender header only when sender changes
          const prevMsg = idx > 0 ? msgs[idx - 1] : null;
          const showHeader = !prevMsg || prevMsg.senderId !== m.senderId;

          // Resolve sender info — my own messages use myProfile
          const senderName = isMe ? myProfile?.name ?? user.name ?? 'Me' : m.senderName ?? m.senderUsername ?? 'User';
          const senderUser = isMe ? myProfile?.username ?? null : m.senderUsername ?? null;
          const senderAvatar = isMe ? myProfile?.avatarUrl ?? null : m.senderAvatarUrl ?? null;
          const senderNameColor = isMe ? null : m.senderNameColor ?? null;

          // Time label — e.g. "02:45 PM"
          const msgDate = m.createdAt ? new Date(m.createdAt) : null;
          const timeLabel = msgDate ? msgDate.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          }) : '';

          // Day divider — show when date changes between messages
          const prevDate = prevMsg?.createdAt ? new Date(prevMsg.createdAt) : null;
          const showDivider = msgDate && (!prevDate || prevDate.getFullYear() !== msgDate.getFullYear() || prevDate.getMonth() !== msgDate.getMonth() || prevDate.getDate() !== msgDate.getDate());
          const now = new Date();
          const yesterday = new Date(now);
          yesterday.setDate(now.getDate() - 1);
          const dividerLabel = msgDate ? msgDate.toDateString() === now.toDateString() ? 'Today' : msgDate.toDateString() === yesterday.toDateString() ? 'Yesterday' : msgDate.toLocaleDateString([], {
            weekday: 'long',
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          }) : '';
          return <React.Fragment key={m.id}>
                {/* ── Day divider ── */}
                {showDivider && <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              margin: '12px 0 4px'
            }}>
                    <div style={{
                flex: 1,
                height: 1,
                background: 'rgba(255,255,255,0.07)'
              }} />
                    <span style={{
                color: T.textDim,
                fontSize: '0.7rem',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                padding: '2px 10px',
                background: 'rgba(0,188,212,0.07)',
                borderRadius: 20,
                border: '1px solid rgba(0,188,212,0.15)'
              }}>
                      {dividerLabel}
                    </span>
                    <div style={{
                flex: 1,
                height: 1,
                background: 'rgba(255,255,255,0.07)'
              }} />
                  </div>}
              <SwipeRow isMe={isMe} onReply={() => !selectMode && startReply(m)}>
                <motion.div initial={{
                opacity: 0,
                y: 6
              }} animate={{
                opacity: 1,
                y: 0
              }} style={{
                display: 'flex',
                flexDirection: isMe ? 'row-reverse' : 'row',
                alignItems: 'flex-end',
                gap: 6,
                marginTop: showHeader ? 10 : 2,
                // highlight selected
                background: selectedIds.has(m.id) ? 'rgba(0,188,212,0.07)' : 'transparent',
                borderRadius: 10,
                padding: selectMode ? '2px 4px' : 0,
                transition: 'background 0.15s'
              }} onClick={selectMode ? () => toggleSelect(m.id) : undefined}>
                  {/* ── Select checkbox (left side always, regardless of isMe) ── */}
                  {selectMode && <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  flexShrink: 0,
                  alignSelf: 'center',
                  order: isMe ? 1 : -1
                }}>
                      <motion.div whileTap={{
                    scale: 0.85
                  }} style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    border: `2px solid ${selectedIds.has(m.id) ? T.primary : 'rgba(255,255,255,0.25)'}`,
                    background: selectedIds.has(m.id) ? T.primary : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                    transition: 'all 0.15s'
                  }}>
                        {selectedIds.has(m.id) && <Check size={12} strokeWidth={3} color="#000" />}
                      </motion.div>
                    </div>}
                  {/* ── Avatar column — shown only on first message of a group ── */}
                  <div style={{
                  width: 34,
                  flexShrink: 0,
                  alignSelf: 'flex-end'
                }}>
                    {showHeader ? <div style={{
                    cursor: 'pointer'
                  }} onClick={() => senderAvatar && setAvatarLightboxUrl(senderAvatar)}>
                        <UserAvatar name={senderName} avatarUrl={senderAvatar} size={34} red={!isMe && senderIsRed} blue={senderIsOwner} isSelf={isMe} />
                      </div> : (/* spacer so bubble stays aligned when no avatar */
                  <div style={{
                    width: 34
                  }} />)}
                  </div>

                  {/* ── Bubble column ── */}
                  <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isMe ? 'flex-end' : 'flex-start',
                  maxWidth: 'calc(100% - 46px)',
                  minWidth: 0,
                }}>

                    {/* Name + @username row — only on first message of a group */}
                    {showHeader && <div style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 5,
                    marginBottom: 3,
                    flexDirection: isMe ? 'row-reverse' : 'row'
                  }}>
                        {senderIsOwner && <span style={{
                      fontSize: '0.55rem',
                      fontWeight: 800,
                      color: '#fff',
                      background: 'linear-gradient(135deg,#2563eb,#1d4ed8)',
                      borderRadius: 4,
                      padding: '1px 4px',
                      boxShadow: '0 0 6px rgba(37,99,235,0.55)',
                      lineHeight: 1.6
                    }}>OWNER</span>}
                        <span style={{
                      color: '#111111',
                      fontSize: '0.72rem',
                      fontWeight: 600
                    }}>
                          @{String(senderUser || senderName || 'user').replace(/^@/, '')}
                        </span>
                      </div>}

                    {/* Bubble + action menu */}
                    <div style={{
                    position: 'relative',
                    maxWidth: '100%',
                    minWidth: 0,
                  }}>
                      <motion.div whileTap={{
                      scale: 0.98
                    }} onContextMenu={e => {
                      e.preventDefault();
                      setMenuMsgId(m.id);
                    }} style={{
                      background: isMe ? T.bubbleMe : T.bubbleThem,
                      border: `1px solid ${isMe ? T.primaryBorder : 'rgba(255,255,255,0.06)'}`,
                      borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      padding: (m.type === 'image' || m.type === 'video' || (m.type === 'text' && !!parseStoryReply(m.body))) ? 0 : m.type === 'voice' ? '8px 10px' : '8px 12px',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      maxWidth: '100%',
                    }}>
                        {/* Reply preview inside bubble */}
                        {m.type === 'text' && m.body?.startsWith('↩ ') && <div style={{
                        borderLeft: `2px solid ${T.primaryDim}`,
                        paddingLeft: 8,
                        marginBottom: 6,
                        color: T.textDim,
                        fontSize: '0.72rem',
                        lineHeight: 1.4,
                        maxWidth: 200,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                            {m.body.split('\n')[0].replace('↩ ', '')}
                          </div>}

                        {/* ── Bubble content by type ── */}
                        {editingId === m.id ? (
                          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }}>
                            <textarea
                              autoFocus
                              value={editText}
                              onChange={e => setEditText(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(m.id); }
                                if (e.key === 'Escape') cancelEdit();
                              }}
                              rows={Math.min(6, Math.max(1, editText.split('\n').length))}
                              style={{
                                width: '100%',
                                resize: 'none',
                                background: 'rgba(0,0,0,0.25)',
                                border: `1px solid ${T.primaryBorder}`,
                                borderRadius: 8,
                                color: T.text,
                                fontSize: '0.89rem',
                                lineHeight: 1.4,
                                padding: '6px 8px',
                                fontFamily: 'inherit',
                              }}
                            />
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                              <button type="button" onClick={cancelEdit} style={{
                                fontSize: '0.72rem', fontWeight: 600, color: T.textDim,
                                background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px',
                              }}>Cancel</button>
                              <button type="button" onClick={() => saveEdit(m.id)} style={{
                                fontSize: '0.72rem', fontWeight: 700, color: T.primary,
                                background: T.primaryFaint, border: `1px solid ${T.primaryBorder}`,
                                borderRadius: 8, cursor: 'pointer', padding: '4px 10px',
                              }}>Save</button>
                            </div>
                          </div>
                                                ) : (() => {
                          const productInquiry = m.type === 'text' ? parseProductInquiry(m.body) : null;
                          if (productInquiry) {
                            return <ProductInquiryBubble data={productInquiry} />;
                          }
                          const storyReply = m.type === 'text' ? parseStoryReply(m.body) : null;
                          if (storyReply) {
                            return (
                              <StoryReplyBubble
                                mediaUrl={storyReply.mediaUrl}
                                mediaType={storyReply.mediaType}
                                comment={storyReply.comment}
                                timeLabel={timeLabel}
                                isMe={isMe}
                              />
                            );
                          }
                          if (m.isStreak) return <StreakBubble msg={m} isMe={isMe} />;
                          if (m.type === 'voice' && m.body) return <VoiceBubble url={resolveMediaUrl(m.body) || m.body} duration={m.duration} isMe={isMe} avatarUrl={isMe ? (user as any)?.image || (user as any)?.avatarUrl : peerAvatarUrl} />;
                          if (m.type === 'image' && m.body) return <ImageBubble url={m.body} />;
                          if (m.type === 'video' && m.body) return <ChatVideoBubble body={m.body} duration={m.duration} />;
                          if (m.type === 'file' && m.body) {
                            const fu = resolveMediaUrl(m.body);
                            const lower = `${fu} ${m.body}`.toLowerCase();
                            if (isLikelyImageUrl(fu) || isLikelyImageUrl(m.body) || lower.includes('shared image') || lower.includes('image/')) {
                              return <ImageBubble url={fu || m.body} />;
                            }
                            if (isLikelyVideoUrl(fu) || isLikelyVideoUrl(m.body) || lower.includes('video/')) {
                              return <ChatVideoBubble body={m.body} duration={m.duration} />;
                            }
                            return <ChatFileBubble body={m.body} isMe={isMe} />;
                          }
                          if (m.type === 'text' && m.body) {
                            const tu = resolveMediaUrl(m.body);
                            if (tu && isLikelyImageUrl(tu) && (tu.startsWith('http') || tu.startsWith('/'))) return <ImageBubble url={tu} />;
                            if (tu && isLikelyVideoUrl(tu) && (tu.startsWith('http') || tu.startsWith('/'))) return <ChatVideoBubble body={m.body} duration={m.duration} />;
                            const loc = parseLocationBody(m.body);
                            if (loc) return <LocationMapBubble lat={loc.lat} lng={loc.lng} label={loc.label} live={loc.live} name={isMe ? (user as any)?.name : displayName} username={isMe ? (user as any)?.username : peerUsername} avatarUrl={isMe ? (user as any)?.image || (user as any)?.avatarUrl : peerAvatarUrl} />;
                          }
                          if (m.type === 'call') return null;
                          return (
                            <p style={{
                              color: T.text,
                              fontSize: '0.89rem',
                              lineHeight: 1.4,
                              margin: 0,
                              wordBreak: 'break-word',
                              whiteSpace: 'pre-wrap',
                            }}>
                              {m.type === 'text' && m.body?.startsWith('↩ ')
                                ? m.body.split('\n').slice(1).join('\n')
                                : (m.body ?? '')}
                            </p>
                          );
                        })()
                        }{/* Time below bubble (+ edit pencil + edited tag) */}
                        {editingId !== m.id && !(m.type === 'text' && parseStoryReply(m.body)) && <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: isMe ? 'flex-end' : 'flex-start',
                        gap: 5,
                        marginTop: (m.type === 'image' || m.type === 'video') ? 0 : 2,
                        padding: (m.type === 'image' || m.type === 'video') ? '3px 8px 5px' : '0 2px',
                      }}>
                          {isMe && m.type === 'text' && !m.isStreak && isWithinEditWindow(m.createdAt) && <button
                            type="button"
                            aria-label="Edit message"
                            onClick={e => { e.stopPropagation(); startEdit(m); }}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              width: 16, height: 16, padding: 0, background: 'transparent',
                              border: 'none', color: T.textDim, cursor: 'pointer', flexShrink: 0,
                            }}
                          >
                            <Pencil size={11} strokeWidth={2} />
                          </button>}
                          {editedIds.has(m.id) && <span style={{ color: T.textDim, fontSize: '0.62rem', fontStyle: 'italic' }}>edited</span>}
                          <p style={{
                            color: '#111111',
                            fontSize: '0.62rem',
                            margin: 0,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                          }}>
                            {timeLabel}
                            {isMe && (
                              <span
                                aria-label={(m.read || m.readAt) ? 'Read' : 'Sent'}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  marginInlineStart: 2,
                                  color: (m.read || m.readAt) ? '#00BCD4' : '#9ca3af',
                                  lineHeight: 1,
                                }}
                              >
                                {(m.read || m.readAt) ? (
                                  <>
                                    <Check size={11} strokeWidth={2.8} style={{ marginInlineEnd: -5 }} />
                                    <Check size={11} strokeWidth={2.8} />
                                  </>
                                ) : (
                                  <Check size={11} strokeWidth={2.8} />
                                )}
                              </span>
                            )}
                          </p>
                        </div>}
                      </motion.div>

                      {/* Action menu */}
                      <AnimatePresence>
                        {isMenuOpen && <ActionMenu isMe={isMe} msgType={m.type} msgBody={m.body} canEdit={isWithinEditWindow(m.createdAt) && !m.isStreak} onReply={() => startReply(m)} onCopy={() => {
                        if (m.body) navigator.clipboard.writeText(m.body).catch(() => {});
                      }} onEdit={() => startEdit(m)} onDelete={() => deleteMessage(m.id)} onClose={() => setMenuMsgId(null)} />}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              </SwipeRow>
              </React.Fragment>;
        })}
          <div ref={bottomRef} />
          </div>{/* end inner flex column */}
        </div>

        {/* ── Scroll-to-bottom button ── */}
        <AnimatePresence>
          {showScrollBtn && <motion.button initial={{
          opacity: 0,
          scale: 0.8,
          y: 8
        }} animate={{
          opacity: 1,
          scale: 1,
          y: 0
        }} exit={{
          opacity: 0,
          scale: 0.8,
          y: 8
        }} transition={{
          duration: 0.18
        }} onClick={() => {
          userScrolledUp.current = false;
          setShowScrollBtn(false);
          const box = scrollBoxRef.current;
          if (box) box.scrollTop = box.scrollHeight;
        }} style={{
          position: 'absolute',
          bottom: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 30,
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: 20,
          padding: '6px 16px',
          color: '#111111',
          fontWeight: 400,
          fontSize: '0.75rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        }}>
              <ChevronDown size={14} color="#111" />
              New messages
            </motion.button>}
        </AnimatePresence>

        {/* ── Select-mode delete bar ── */}
        <AnimatePresence>
          {selectMode && <motion.div initial={{
          opacity: 0,
          y: 20
        }} animate={{
          opacity: 1,
          y: 0
        }} exit={{
          opacity: 0,
          y: 20
        }} style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          background: 'rgba(6,14,14,0.97)',
          borderTop: `1px solid ${T.navBorder}`,
          backdropFilter: 'blur(12px)'
        }}>
              <span style={{
            color: T.textDim,
            fontSize: '0.8rem'
          }}>
                {selectedIds.size === 0 ? 'Tap messages to select' : `${selectedIds.size} selected`}
              </span>
              <div style={{
            display: 'flex',
            gap: 10
          }}>
                {/* Select all */}
                <motion.button whileTap={{
              scale: 0.88
            }} onClick={toggleSelectAll} style={{
              padding: '6px 14px',
              borderRadius: 20,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: T.text,
              fontSize: '0.78rem',
              cursor: 'pointer'
            }}>
                  {selectedIds.size === msgs.length && msgs.length > 0 ? 'Deselect all' : 'Select all'}
                </motion.button>
                {/* Delete selected */}
                <motion.button whileTap={{
              scale: 0.88
            }} disabled={selectedIds.size === 0 || isBulkDeleting} onClick={deleteSelected} style={{
              padding: '6px 16px',
              borderRadius: 20,
              background: selectedIds.size > 0 ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.05)',
              border: `1px solid ${selectedIds.size > 0 ? 'rgba(239,68,68,0.4)' : 'rgba(239,68,68,0.1)'}`,
              color: selectedIds.size > 0 ? '#ef4444' : 'rgba(239,68,68,0.3)',
              fontSize: '0.78rem',
              cursor: selectedIds.size > 0 && !isBulkDeleting ? 'pointer' : 'default',
              opacity: isBulkDeleting ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}>
                  <Trash2 size={13} strokeWidth={2} />
                  {isBulkDeleting ? 'Deleting…' : 'Delete'}
                </motion.button>
              </div>
            </motion.div>}
        </AnimatePresence>

        {/* ── Input bar ── */}
        <div style={{
        padding: '10px 12px 24px',
        background: '#ffffff',
        backdropFilter: 'blur(12px)',
        borderTop: `1px solid ${T.navBorder}`,
        position: 'sticky',
        bottom: 0,
        zIndex: 21,
        flexShrink: 0,
        transform: hideChatChrome ? 'translateY(110%)' : 'translateY(0)',
        transition: 'transform 0.22s ease',
      }}>

          {/* ── Typing indicator (SC) ── */}
          <AnimatePresence>
            {scTypingNames.length > 0 && <motion.div key="sc-typing" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingInline: 4 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 16 }}>
                  {[0, 1, 2].map(i => <motion.div key={i} animate={{ scaleY: [0.4, 1, 0.4] }} transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' as const }} style={{ width: 4, height: 12, borderRadius: 3, background: T.primary, transformOrigin: 'bottom' }} />)}
                </div>
                <span style={{ color: T.textDim, fontSize: '0.72rem' }}>{scTypingNames.length ? `${scTypingNames.join(', ')} ` : ''}Type....</span>
              </motion.div>}
          </AnimatePresence>

          {/* DM typing */}
          <AnimatePresence>
            {!isGroup && peerIsTyping && (
              <motion.div key="dm-typing" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingInline: 4 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 16 }}>
                  {[0, 1, 2].map(i => <motion.div key={i} animate={{ scaleY: [0.4, 1, 0.4] }} transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' as const }} style={{ width: 4, height: 12, borderRadius: 3, background: T.primary, transformOrigin: 'bottom' }} />)}
                </div>
                <span style={{ color: T.textDim, fontSize: '0.72rem' }}>Type....</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Group typing */}
          <AnimatePresence>
            {isGroup && _typers.length > 0 && (
              <motion.div key="g-typing" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingInline: 4 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 16 }}>
                  {[0, 1, 2].map(i => <motion.div key={i} animate={{ scaleY: [0.4, 1, 0.4] }} transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' as const }} style={{ width: 4, height: 12, borderRadius: 3, background: T.primary, transformOrigin: 'bottom' }} />)}
                </div>
                <span style={{ color: T.textDim, fontSize: '0.72rem' }}>{_typers.map(x => x.name).filter(Boolean).join(', ') || 'Someone'} Type....</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Group voice bar */}
          {isGroup && user && <div style={{
          marginBottom: 8
        }}>
              <GroupVoiceBar groupId={groupId} userId={user.id} userName={user.name ?? user.email ?? 'User'} avatarUrl={(user as Record<string, unknown>).avatarUrl as string ?? ''} onJoinVoice={() => playNotificationSound('voice-join')} externalVolume={speakerVol} onSpeaking={setIsSpeaking} autoJoin={false} />
            </div>}

          {/* Reply preview bar */}
          <AnimatePresence>
            {replyTo && <motion.div initial={{
            opacity: 0,
            height: 0
          }} animate={{
            opacity: 1,
            height: 'auto'
          }} exit={{
            opacity: 0,
            height: 0
          }} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            marginBottom: 8,
            background: T.primaryFaint,
            borderRadius: 8,
            borderLeft: `2px solid ${T.primary}`
          }}>
                <Reply size={13} style={{
              color: T.primary,
              flexShrink: 0
            }} />
                <p style={{
              flex: 1,
              color: T.textDim,
              fontSize: '0.75rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
                  <span style={{
                color: T.primary
              }}>{replyTo.senderName ?? replyTo.senderUsername ?? 'User'}</span>
                  {': '}
                  {replyTo.type === 'voice' ? '🎤 Voice message' : replyTo.type === 'image' ? '🖼 Image' : replyTo.type === 'call' ? (replyTo.body === 'missed' ? '📞 Missed call' : '📞 Call') : (replyTo.body ?? '').slice(0, 60)}
                </p>
                <motion.button whileTap={{
              scale: 0.9
            }} onClick={() => setReplyTo(null)} style={{
              background: 'none',
              border: 'none',
              color: T.textDim,
              cursor: 'pointer',
              padding: 2
            }}>
                  <X size={14} />
                </motion.button>
              </motion.div>}
          </AnimatePresence>

          {/* ── Hidden file inputs ── */}
          <input ref={fileInputRef} type="file" accept="image/*" style={{
          display: 'none'
        }} onChange={e => {
          const f = e.target.files?.[0];
          if (f) sendImage(f);
          e.target.value = '';
        }} />
          <input ref={videoInputRef} type="file" accept="video/*,.mp4,.webm,.mov,.m4v,.mkv,.avi,.3gp" style={{
          display: 'none'
        }} onChange={e => {
          const f = e.target.files?.[0];
          if (f) sendFile(f);
          e.target.value = '';
        }} />
          <input ref={docInputRef} type="file" accept="*/*" style={{
          display: 'none'
        }} onChange={e => {
          const f = e.target.files?.[0];
          if (f) sendFile(f);
          e.target.value = '';
        }} />

          {/* ── Input row ── */}
          <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          position: 'relative'
        }}>

            {isRecording ? (
              <div style={{ flex: 1, background: '#fff', borderRadius: 22, padding: '10px 12px 12px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#111', fontVariantNumeric: 'tabular-nums' }}>
                    {`${Math.floor(recordSecs / 60)}:${String(recordSecs % 60).padStart(2, '0')}`}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 28, overflow: 'hidden', width: 140 }}>
                    {Array.from({ length: 28 }, (_, i) => (
                      <span key={i} style={{
                        width: 3, borderRadius: 99, background: '#111',
                        height: recPaused ? 6 : 6 + Math.abs(Math.sin((i + recordSecs) * 0.7)) * 18 * recordLevel,
                      }} />
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button type="button" onClick={() => stopRecording(false)} style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', background: '#fde8ef', color: '#e11d48', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }}>
                    <Trash2 size={18} />
                  </button>
                  <button type="button" onClick={() => {
                    const rec = mediaRecorderRef.current;
                    if (!rec) return;
                    if (recPaused) {
                      try { rec.resume(); } catch { /* ignore */ }
                      setRecPaused(false);
                      recordTimerRef.current = setInterval(() => setRecordSecs(s => s + 1), 1000);
                    } else {
                      try { rec.pause(); } catch { /* ignore */ }
                      setRecPaused(true);
                      if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
                    }
                  }} style={{ flex: 1, height: 44, borderRadius: 22, border: 'none', background: '#f3f4f6', color: '#111', fontWeight: 700, cursor: 'pointer' }}>
                    {recPaused ? 'Resume' : '00  Pause'}
                  </button>
                </div>
              </div>
            ) : (
            <div style={{
            position: 'relative',
            flex: 1
          }}>
              <textarea ref={inputRef} value={text} onChange={e => {
              const val = e.target.value;
              if (scChatId) {
                handleScTyping(val);
              } else {
                setText(val);
                sendTyping();
              }
            }} onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendText();
              }
            }} placeholder={replyTo ? 'Reply…' : 'Message'} rows={1} style={{
              width: '100%',
              boxSizing: 'border-box',
              resize: 'none',
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 22,
              padding: '10px 78px 10px 40px',
              color: '#111',
              fontSize: '0.95rem',
              outline: 'none',
              lineHeight: 1.4,
              maxHeight: 100,
              overflowY: 'auto',
              fontFamily: 'var(--font-sans)',
            }} />
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#667781' }}>
                <Smile size={20} />
              </span>
              {!text.trim() && (
                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 10, color: '#667781' }}>
                  <button type="button" onClick={() => setLocationPickerOpen(true)} style={{ background: 'none', border: 'none', padding: 0, color: '#667781', cursor: 'pointer' }}><Paperclip size={20} /></button>
                  <button type="button" onClick={() => setChatCameraOpen(true)} style={{ background: 'none', border: 'none', padding: 0, color: '#667781', cursor: 'pointer' }}><Camera size={20} /></button>
                </span>
              )}
              {!!text.trim() && (
                <button type="button" onClick={() => setLocationPickerOpen(true)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', padding: 0, color: '#667781', cursor: 'pointer' }}>
                  <Paperclip size={20} />
                </button>
              )}

            </div>
            )}

            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={() => {
                if (isRecording) { void stopRecording(true); return; }
                if (text.trim()) { void sendText(); return; }
                void startRecording();
              }}
              disabled={sending}
              style={{
                width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
                background: '#111b21', border: 'none', color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
              }}
            >
              {isRecording || text.trim() ? <Play size={18} fill="#fff" /> : <Mic size={20} strokeWidth={2.2} />}
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* ── Chat camera overlay ── */}
      <AnimatePresence>
        {chatCameraOpen && (
          <ChatCameraCapture
            onClose={() => setChatCameraOpen(false)}
            onSendImage={async (file) => { await sendImage(file); }}
            onSendVideo={async (file) => { await sendFile(file); }}
            onSendVideoNote={async (file, dur) => { await sendVideoNote(file, dur); }}
            onSendFile={async (file) => { await sendFile(file); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {locationPickerOpen && (
          <LocationPickerOverlay
            onClose={() => setLocationPickerOpen(false)}
            onConfirm={(lat, lng, live) => {
              setLocationPickerOpen(false);
              void sendLocation(lat, lng, live);
            }}
          />
        )}
      </AnimatePresence>

      {/* Incoming: لا واجهة كبيرة — الأيقونة صفراء، والنقر عليها يرد. تنبيه خفيف فقط. */}
      <AnimatePresence>
        {false && callPhase === 'ringing' && callRole === 'callee' && ( // call feature removed
          <motion.div
            key="incoming-call-chip"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            onClick={() => answerChatCall()}
            style={{
              position: 'fixed',
              top: 'max(10px, env(safe-area-inset-top))',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1200,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              borderRadius: 999,
              background: 'rgba(6,18,14,0.94)',
              border: '1px solid rgba(250,204,21,0.45)',
              boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
              cursor: 'pointer',
              maxWidth: 'calc(100vw - 32px)',
            }}
          >
            <PhoneOff size={14} color="#facc15" strokeWidth={2.4} />
            <span style={{ color: '#facc15', fontSize: '0.78rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {callPeerLabel}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── In-App Notifications (toast from top) ── */}
      <InAppNotification notifications={notifications} onDismiss={dismissNotif} />

      {/* ── Join Toasts — member joined chat or voice ── */}
      <AnimatePresence>
        {joinToasts.map((jt, i) => <motion.div key={jt.id} initial={{
        opacity: 0,
        y: -20,
        scale: 0.92
      }} animate={{
        opacity: 1,
        y: 0,
        scale: 1
      }} exit={{
        opacity: 0,
        y: -14,
        scale: 0.94
      }} transition={{
        duration: 0.28,
        ease: 'easeOut'
      }} style={{
        position: 'fixed',
        top: 72 + i * 56,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 999,
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '8px 14px 8px 10px',
        borderRadius: 24,
        background: jt.type === 'voice' ? 'rgba(34,197,94,0.18)' : 'rgba(0,188,212,0.16)',
        border: `1px solid ${jt.type === 'voice' ? 'rgba(34,197,94,0.4)' : 'rgba(0,188,212,0.35)'}`,
        backdropFilter: 'blur(14px)',
        boxShadow: jt.type === 'voice' ? '0 4px 20px rgba(34,197,94,0.2)' : '0 4px 20px rgba(0,188,212,0.18)',
        pointerEvents: 'none',
        whiteSpace: 'nowrap'
      }}>
            {/* Avatar or icon */}
            {jt.type === 'chat' ? jt.avatarUrl ? <img src={jt.avatarUrl} alt="" style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0
        }} /> : <div style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: 'rgba(0,188,212,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
                    <span style={{
            color: '#00BCD4',
            fontSize: '0.65rem',
            fontWeight: 700
          }}>{jt.name.charAt(0).toUpperCase()}</span>
                  </div> : <motion.div animate={{
          scale: [1, 1.2, 1]
        }} transition={{
          duration: 0.6,
          repeat: 2
        }} style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: 'rgba(34,197,94,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
                <Mic size={13} style={{
            color: '#22c55e'
          }} />
              </motion.div>}
            <span style={{
          fontSize: '0.78rem',
          fontWeight: 600,
          color: jt.type === 'voice' ? '#22c55e' : '#00BCD4'
        }}>
              {jt.name}
            </span>
            <span style={{
          fontSize: '0.72rem',
          color: 'rgba(255,255,255,0.6)',
          fontWeight: 400
        }}>
              {jt.type === 'voice' ? 'joined voice' : 'joined the chat'}
            </span>
          </motion.div>)}
      </AnimatePresence>

      {/* ── Avatar Lightbox — shows only the profile picture, full-screen. The full profile
          box (bio, stats, friend actions, call icon) no longer opens from the chat; it now
          only opens from a user's text posts on the home feed. ── */}
      <AnimatePresence>
        {avatarLightboxUrl && (
          <motion.div
            key="chat-avatar-lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setAvatarLightboxUrl(null)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 500,
              background: 'rgba(0,0,0,0.92)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20
            }}
          >
            <motion.img
              src={avatarLightboxUrl}
              alt=""
              onClick={e => e.stopPropagation()}
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              style={{ maxWidth: '100%', maxHeight: '90dvh', borderRadius: 16, objectFit: 'contain' }}
            />
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={() => setAvatarLightboxUrl(null)}
              aria-label="إغلاق"
              style={{
                position: 'absolute',
                top: 'max(16px, env(safe-area-inset-top))',
                insetInlineEnd: 16,
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.12)',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={18} strokeWidth={2.4} />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Group Info Modal */}
      {mediaLibraryOpen && (
        <MediaLibraryModal
          messages={msgs}
          onClose={() => setMediaLibraryOpen(false)}
        />
      )}
      {showGroupInfo && isGroup && <GroupInfoModal groupId={groupId} currentUserId={user?.id ?? ''} onClose={() => setShowGroupInfo(false)} onNameChanged={(name, avatarUrl) => {
      setLiveGroupName(name);
      setLiveGroupAvatar(avatarUrl);
    }} />}

      {/* ── Leave Group Confirm ── */}
      <AnimatePresence>
        {showLeaveConfirm && <motion.div initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} exit={{
        opacity: 0
      }} style={{
        position: 'fixed',
        inset: 0,
        zIndex: 150,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24
      }} onClick={() => setShowLeaveConfirm(false)}>
            <motion.div initial={{
          scale: 0.9,
          opacity: 0
        }} animate={{
          scale: 1,
          opacity: 1
        }} exit={{
          scale: 0.9,
          opacity: 0
        }} onClick={e => e.stopPropagation()} style={{
          background: 'rgba(6,14,14,0.98)',
          border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 16,
          padding: '24px 20px',
          width: '100%',
          maxWidth: 320,
          display: 'flex',
          flexDirection: 'column',
          gap: 16
        }}>
              <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}>
                <div style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: T.red
            }}>
                  <LogOut size={18} strokeWidth={2} />
                </div>
                <div>
                  <p style={{
                color: T.text,
                fontSize: '0.9rem',
                fontWeight: 600
              }}>Leave group?</p>
                  <p style={{
                color: T.textDim,
                fontSize: '0.75rem'
              }}>{groupName}</p>
                </div>
              </div>
              <p style={{
            color: T.textDim,
            fontSize: '0.8rem',
            lineHeight: 1.5
          }}>
                You will no longer receive messages from this group. You can be re-added by a member.
              </p>
              <div style={{
            display: 'flex',
            gap: 10
          }}>
                <motion.button whileTap={{
              scale: 0.95
            }} onClick={() => setShowLeaveConfirm(false)} style={{
              flex: 1,
              padding: '10px',
              background: T.primaryFaint,
              border: `1px solid ${T.primaryBorder}`,
              borderRadius: 10,
              color: T.text,
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}>
                  Cancel
                </motion.button>
                <motion.button whileTap={{
              scale: 0.95
            }} onClick={leaveGroup} disabled={leaving} style={{
              flex: 1,
              padding: '10px',
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.35)',
              borderRadius: 10,
              color: T.red,
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6
            }}>
                  {leaving ? '…' : <><Check size={14} strokeWidth={2.5} /> Leave</>}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>}

        {/* ── Clear History confirmation dialog ── */}
        {showClearConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 160,
              background: 'hsl(var(--background)/0.85)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
            }}
            onClick={() => !isClearingHistory && setShowClearConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--destructive)/0.3)',
                borderRadius: 16, padding: '24px 20px',
                width: '100%', maxWidth: 320,
                display: 'flex', flexDirection: 'column', gap: 16,
              }}
            >
              {/* Icon + title */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: '50%',
                  background: 'hsl(var(--destructive)/0.12)',
                  border: '1px solid hsl(var(--destructive)/0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Trash2 size={18} strokeWidth={2} color="hsl(var(--destructive))" />
                </div>
                <div>
                  <p style={{ color: '#ffffff', fontSize: '0.95rem', fontWeight: 800, margin: 0 }}>
                    Clear History?
                  </p>
                  <p style={{ color: T.textDim, fontSize: '0.73rem', margin: 0 }}>
                    {isGroup ? (groupName ?? 'Group') : 'This conversation'}
                  </p>
                </div>
              </div>

              {/* Warning text */}
              <p style={{ color: T.textDim, fontSize: '0.8rem', lineHeight: 1.55, margin: 0 }}>
                All messages, images, videos, and voice notes in this conversation will be permanently deleted for both sides. This cannot be undone.
              </p>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: 10 }}>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  disabled={isClearingHistory}
                  onClick={() => setShowClearConfirm(false)}
                  style={{
                    flex: 1, padding: '10px',
                    background: T.primaryFaint,
                    border: `1px solid ${T.primaryBorder}`,
                    borderRadius: 10, color: T.text,
                    fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  disabled={isClearingHistory}
                  onClick={() => void clearMyHistory()}
                  style={{
                    flex: 1, padding: '10px',
                    background: 'hsl(var(--destructive)/0.15)',
                    border: '1px solid hsl(var(--destructive)/0.4)',
                    borderRadius: 10, color: 'hsl(var(--destructive))',
                    fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  {isClearingHistory
                    ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                        style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid hsl(var(--destructive))', borderTopColor: 'transparent' }} />
                    : <><Trash2 size={14} strokeWidth={2.5} /> Clear All</>
                  }
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </>;
}