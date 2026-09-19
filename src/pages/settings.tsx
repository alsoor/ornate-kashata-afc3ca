import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion, AnimatePresence } from 'motion/react';
import { User, Mail, Lock, Eye, EyeOff, LogOut, Mic, Play, Pause, Trash2, Clock, CheckCircle, Share2, X, AtSign, Edit2, Users, Copy, Check, QrCode, Phone, ShieldCheck, Radio, Headphones, Send, Plus, MessageCircle, Bell, Music, Heart, Search, Link2, ClipboardPaste, Building2, XCircle } from 'lucide-react';
import { useSession, signOut, signIn, signUp } from '@/lib/auth/auth-client';
import { usePresenceQuery } from '@/hooks/usePresence';
type Tab = 'account' | 'live';
/** حساب الدعم الوحيد — له صلاحيات شات الدعم + تحكم المستخدمين */
const SUPPORT_OWNER_EMAIL = 'stooorna@mail.com';
const SUPPORT_OWNER_USERNAME = 'stooorna';
const OWNER_EMAILS = new Set([SUPPORT_OWNER_EMAIL.toLowerCase()]);
const PRIVILEGED_USERNAMES = new Set(['stooorna']);

function isPrivilegedUser(user: { email?: string | null; username?: string | null; name?: string | null } | null | undefined) {
  const username = (user?.username ?? user?.name ?? '').replace(/^@/, '').trim().toLowerCase();
  const email = (user?.email ?? '').trim().toLowerCase();
  return OWNER_EMAILS.has(email) || PRIVILEGED_USERNAMES.has(username);
}

/**
 * حساب الدعم الرسمي فقط (@Stooorna / Stooorna@mail.com).
 * لا نستخدم حقل name لأنه قد يطابق بالخطأ مع مستخدمين عاديين.
 * اختياري: username من الـ DB (profileUsername) أدق من session أحياناً.
 */
function isSupportOwnerAccount(
  user: { email?: string | null; username?: string | null; name?: string | null } | null | undefined,
  profileUsername?: string | null,
) {
  if (!user && !profileUsername) return false;
  const email = (user?.email ?? '').trim().toLowerCase();
  const sessionUsername = (user?.username ?? '').replace(/^@/, '').trim().toLowerCase();
  const dbUsername = (profileUsername ?? '').replace(/^@/, '').trim().toLowerCase();
  const username = dbUsername || sessionUsername;
  // تطابق صارم — إيميل الدعم أو يوزر stooorna فقط
  if (email === SUPPORT_OWNER_EMAIL) return true;
  if (username === SUPPORT_OWNER_USERNAME) return true;
  return false;
}

/** مستخدم عادي مسجّل → يظهر له أيقونة الدعم فوق */
function shouldShowSupportHeaderIcon(
  user: { email?: string | null; username?: string | null; name?: string | null } | null | undefined,
  profileUsername?: string | null,
) {
  // Guests (not logged in) can also open support chat
  if (!user) return true;
  return !isSupportOwnerAccount(user, profileUsername);
}
interface Recording {
  id: number;
  title: string;
  duration: number;
  mode: string;
  fileUrl: string | null;
  createdAt: string;
}

// Theme colors matching the cyan main screen
const T = {
  bg: 'radial-gradient(ellipse 70% 60% at 50% 40%, #0d2a2e 0%, #0a1a1a 50%, #060e0e 100%)',
  primary: '#00BCD4',
  primaryDim: 'rgba(0,188,212,0.7)',
  primaryFaint: 'rgba(0,188,212,0.15)',
  primaryBorder: 'rgba(0,188,212,0.25)',
  primaryGlow: 'rgba(0,188,212,0.3)',
  surface: 'rgba(13,32,32,0.8)',
  surfaceBorder: 'rgba(0,188,212,0.12)',
  text: 'rgba(200,230,230,0.9)',
  textMuted: 'rgba(150,190,190,0.6)',
  inputBg: 'rgba(6,14,14,0.8)',
  inputBorder: 'rgba(0,188,212,0.2)',
  inputFocus: 'rgba(0,188,212,0.5)',
  navBg: 'linear-gradient(180deg, transparent 0%, rgba(6,14,14,0.95) 100%)',
  navBorder: 'rgba(0,188,212,0.08)',
  danger: 'rgba(239,68,68,0.8)',
  dangerBorder: 'rgba(239,68,68,0.3)',
  dangerFaint: 'rgba(239,68,68,0.1)',
  success: '#00BCD4',
  tabActive: 'rgba(0,188,212,0.15)',
  tabBorder: 'rgba(0,188,212,0.4)',
  bronze: 'rgba(205,140,50,0.8)',
  bronzeBorder: 'rgba(205,140,50,0.3)',
  bronzeFaint: 'rgba(205,140,50,0.1)',
  green: 'hsl(var(--accent))',
  greenFaint: 'hsl(var(--accent) / 0.12)',
  greenBorder: 'hsl(var(--accent) / 0.35)',
  bgDeep: 'rgba(6,14,14,0.95)',
  overlay: 'rgba(0,0,0,0.75)',
  modalBg: 'linear-gradient(160deg, #0d2a2e 0%, #0a1a1a 100%)',
  yellowFaint: 'rgba(234,179,8,0.12)',
  yellowBorder: 'rgba(234,179,8,0.5)',
  yellow: '#eab308'
};
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ─── Recording card ───────────────────────────────────────────────────────────
function RecordingCard({
  rec,
  onDelete
}: {
  rec: Recording;
  onDelete: (id: number) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sharing, setSharing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);
  function togglePlay() {
    if (!rec.fileUrl) return;
    if (!audioRef.current) {
      const audio = new Audio(rec.fileUrl);
      audioRef.current = audio;
      audio.ontimeupdate = () => {
        if (audio.duration) setProgress(audio.currentTime / audio.duration);
      };
      audio.onended = () => {
        setPlaying(false);
        setProgress(0);
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
  async function handleShare() {
    if (!rec.fileUrl) return;
    setSharing(true);
    try {
      const fullUrl = window.location.origin + rec.fileUrl;
      if (navigator.share) {
        // Share URL only — file sharing via navigator.share is unreliable in iframes/webviews
        await navigator.share({
          title: rec.title,
          text: `Voice recording: ${rec.title}`,
          url: fullUrl
        });
      } else {
        // Fallback: trigger a direct download
        const a = document.createElement('a');
        a.href = rec.fileUrl;
        a.download = `${rec.title}.mp3`;
        a.click();
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        // Last resort: copy link
        try {
          await navigator.clipboard.writeText(window.location.origin + rec.fileUrl);
        } catch {/* silent */}
      }
    } finally {
      setSharing(false);
    }
  }
  const isBronze = rec.mode === 'whisper';
  const modeColor = isBronze ? T.bronze : T.primary;
  const modeBorder = isBronze ? T.bronzeBorder : T.primaryBorder;
  const modeFaint = isBronze ? T.bronzeFaint : T.primaryFaint;
  return <motion.div initial={{
    opacity: 0,
    scale: 0.96
  }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }} className="rounded-xl overflow-hidden" style={{
    background: T.surface,
    border: `1px solid ${T.surfaceBorder}`
  }}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Play button */}
        <motion.button whileTap={{
        scale: 0.85
      }} onClick={togglePlay} disabled={!rec.fileUrl} className="flex items-center justify-center rounded-full flex-shrink-0" style={{
        width: 38,
        height: 38,
        background: modeFaint,
        border: `1px solid ${modeBorder}`,
        cursor: rec.fileUrl ? 'pointer' : 'default',
        color: modeColor,
        opacity: rec.fileUrl ? 1 : 0.4
      }}>
          {playing ? <Pause size={14} fill={modeColor} /> : <Play size={14} fill={modeColor} style={{
          marginLeft: 2
        }} />}
        </motion.button>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p style={{
          color: T.text,
          fontSize: '0.82rem',
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
            {rec.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <Clock size={10} style={{
            color: T.textMuted
          }} />
            <span style={{
            color: T.textMuted,
            fontSize: '0.65rem'
          }}>{formatDuration(rec.duration)}</span>
            <span style={{
            color: modeColor,
            fontSize: '0.58rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            background: modeFaint,
            border: `1px solid ${modeBorder}`,
            padding: '1px 5px',
            borderRadius: 3
          }}>
              {rec.mode}
            </span>
            <span style={{
            color: T.textMuted,
            fontSize: '0.62rem'
          }}>{formatDate(rec.createdAt)}</span>
          </div>
        </div>

        {/* Share */}
        <motion.button whileTap={{
        scale: 0.85
      }} onClick={handleShare} disabled={!rec.fileUrl || sharing} style={{
        background: 'none',
        border: 'none',
        cursor: rec.fileUrl ? 'pointer' : 'default',
        color: T.primaryDim,
        flexShrink: 0,
        opacity: sharing ? 0.5 : 1
      }}>
          {sharing ? <motion.div animate={{
          rotate: 360
        }} transition={{
          duration: 1,
          repeat: Infinity,
          ease: 'linear'
        }} style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          border: `2px solid ${T.primaryBorder}`,
          borderTopColor: T.primary
        }} /> : <Share2 size={16} />}
        </motion.button>

        {/* Delete / confirm */}
        <AnimatePresence mode="wait">
          {confirmDelete ? <motion.div key="confirm" initial={{
          opacity: 0,
          scale: 0.8
        }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{
          opacity: 0
        }} className="flex items-center gap-1 flex-shrink-0">
              <motion.button whileTap={{
            scale: 0.85
          }} onClick={() => onDelete(rec.id)} style={{
            background: T.dangerFaint,
            border: `1px solid ${T.dangerBorder}`,
            borderRadius: 6,
            padding: '3px 8px',
            color: T.danger,
            fontSize: '0.65rem',
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: '0.05em'
          }}>
                Delete
              </motion.button>
              <motion.button whileTap={{
            scale: 0.85
          }} onClick={() => setConfirmDelete(false)} style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: T.textMuted
          }}>
                <X size={14} />
              </motion.button>
            </motion.div> : <motion.button key="trash" whileTap={{
          scale: 0.85
        }} onClick={() => setConfirmDelete(true)} style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: T.dangerBorder,
          flexShrink: 0
        }}>
              <Trash2 size={16} />
            </motion.button>}
        </AnimatePresence>
      </div>

      {/* Progress bar — only when playing */}
      <AnimatePresence>
        {playing && <motion.div initial={{
        scaleX: 0,
        opacity: 0
      }} animate={{
        scaleX: 1,
        opacity: 1
      }} exit={{
        opacity: 0
      }} style={{
        transformOrigin: 'left',
        height: 2,
        background: `linear-gradient(90deg, ${modeColor} ${progress * 100}%, ${modeBorder} ${progress * 100}%)`
      }} />}
      </AnimatePresence>
    </motion.div>;
}

// ─── Support chat (Settings header → @Stooorna owner/support + AI wait companion) ─
type SupportMsg = {
  id: string;
  from: 'bot' | 'user' | 'support';
  text: string;
  at: number;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'file' | 'audio';
};

type AiPhase = 'pick_lang' | 'idle' | 'waiting' | 'ask_category' | 'ask_title' | 'playing' | 'human';

/** Max playback for song / music / Quran in the support AI player */
const SUPPORT_AUDIO_MAX_SEC = 5 * 60; // 5 minutes

const SUPPORT_COPY = {
  ar: {
    pickLang: 'اختر اللغة / Choose language',
    greeting: 'أرسل مشكلتك أو ما هي مشكلتك بالتطبيق لنتمكن من مساعدتك؟',
    waiting: 'أرجو الانتظار لحين الرد عليكم من قبل الدعم',
    askListen: 'أريد أن أسألك سؤالاً: ماذا تريد أن تسمع؟ أغنية عربية، أغنية إنجليزية، أو قرآن؟',
    askTitle: 'ماذا تحب أن تسمع بالضبط؟ اكتب الاسم أو السورة.',
    unavailable: 'غير متوفر هذا الطلب. اطلب شيء آخر: أغنية عربية، أغنية إنجليزية، موسيقى، أو قرآن.',
    blocked: 'عذراً، لا يمكن تنفيذ هذا الطلب.',
    playing: 'جاري التشغيل (حد أقصى 5 دقائق)…',
    notFound: 'لم أجد هذا المحتوى. جرّب اسماً آخر أو اختر قرآن / أغنية / موسيقى.',
    supportJoined: 'الدعم متصل الآن — يمكنك التحدث معه مباشرة.',
    placeholder: 'اكتب رسالتك…',
    title: 'Stooorna (Support)',
    attach: 'إرفاق صورة / فيديو / ملف',
    nowPlaying: 'يعمل الآن',
    typing: 'Type...',
  },
  en: {
    pickLang: 'Choose language / اختر اللغة',
    greeting: 'Send your problem or what is your issue in the app so we can help you?',
    waiting: 'Please wait until support replies to you.',
    askListen: 'I want to ask you something: what would you like to hear? An Arabic song, an English song, or Quran?',
    askTitle: 'What exactly would you like to hear? Type the name or surah.',
    unavailable: 'This request is not available. Please ask for something else: Arabic song, English song, music, or Quran.',
    blocked: 'Sorry, this request cannot be fulfilled.',
    playing: 'Playing (max 5 minutes)…',
    notFound: 'Could not find that. Try another name, or choose Quran / song / music.',
    supportJoined: 'Support is now connected — you can talk to them directly.',
    placeholder: 'Type your message…',
    title: 'Stooorna (Support)',
    attach: 'Attach image / video / file',
    nowPlaying: 'Now playing',
    typing: 'Type...',
  },
} as const;

const BLOCKED_RE =
  /(sex|porn|xxx|nude|كسم|شرموط|زب|طيز|نيك|سكس|إباحي|اباحي|قتل|انتحار|bomb|terror|hack|دوكس)/i;

/** Resolve @stooorna user id (real chat peer) */
async function resolveSupportUserId(): Promise<string | null> {
  try {
    const r = await fetch('/api/users/by-username/stooorna', { credentials: 'include' });
    if (!r.ok) return null;
    const d = await r.json();
    return (d.id || d.userId || d.user?.id || null) as string | null;
  } catch {
    return null;
  }
}

/**
 * Deliver a message into the real messaging system.
 * /api/support/* does not exist on the server (404) — use /api/messages instead.
 */
async function sendRealChatMessage(opts: {
  toUserId: string;
  text: string;
  mediaUrl?: string;
  mediaType?: string;
  meta?: Record<string, unknown>;
}): Promise<boolean> {
  const bodies: Record<string, unknown>[] = [
    {
      toUserId: opts.toUserId,
      text: opts.text,
      mediaUrl: opts.mediaUrl,
      mediaType: opts.mediaType,
      ...opts.meta,
    },
    {
      recipientId: opts.toUserId,
      content: opts.text,
      mediaUrl: opts.mediaUrl,
      mediaType: opts.mediaType,
      ...opts.meta,
    },
    {
      userId: opts.toUserId,
      message: opts.text,
      text: opts.text,
      mediaUrl: opts.mediaUrl,
      ...opts.meta,
    },
    {
      peerId: opts.toUserId,
      body: opts.text,
      text: opts.text,
      ...opts.meta,
    },
    {
      to: opts.toUserId,
      text: opts.text,
      ...opts.meta,
    },
  ];

  for (const body of bodies) {
    try {
      const r = await fetch('/api/messages', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (r.ok || r.status === 201) return true;
      // 400 = bad shape, try next; 401/403 = auth issue, stop
      if (r.status === 401 || r.status === 403) return false;
    } catch { /* try next shape */ }
  }
  return false;
}

/** Persist ticket locally so owner inbox can still show something if API shape differs */
function queueSupportTicket(ticket: {
  fromUserId?: string;
  fromUsername?: string | null;
  fromName?: string | null;
  fromEmail?: string | null;
  text: string;
  mediaUrl?: string;
  mediaType?: string;
  lang?: string;
}) {
  try {
    const key = 'stooorna_support_tickets';
    const prev = JSON.parse(localStorage.getItem(key) || '[]') as unknown[];
    const next = [
      ...prev,
      {
        id: `t-${Date.now()}`,
        ...ticket,
        at: new Date().toISOString(),
        unread: 1,
      },
    ].slice(-300);
    localStorage.setItem(key, JSON.stringify(next));
    // notify other tabs / owner UI
    window.dispatchEvent(new CustomEvent('stooorna:support-ticket', { detail: next[next.length - 1] }));
  } catch { /* ignore */ }
}

function readLocalSupportTickets(): Array<{
  id: string;
  fromUserId?: string;
  fromUsername?: string | null;
  fromName?: string | null;
  text: string;
  at: string;
  unread?: number;
  mediaUrl?: string;
}> {
  try {
    return JSON.parse(localStorage.getItem('stooorna_support_tickets') || '[]');
  } catch {
    return [];
  }
}

/** Support chat history lives 10 minutes then is wiped (client + optional API) */
const SUPPORT_CHAT_TTL_MS = 10 * 60 * 1000;

const SUPPORT_TASK_DONE_MSG =
  'شكرا للتواصل معنا واذا بغيتنا نساعدك لا تترد بالتواصل مره اخرى\nملاحظه/ سوف يتم حذف المحادثه بعد عشرة دقائق بشكل نهائي  شكرا لتواصلكم';

function supportChatKey(peerId: string) {
  return `stooorna_support_thread_${peerId}`;
}

type StoredSupportThread = {
  messages: Array<{
    id: string;
    from: string;
    text: string;
    at: number;
    mediaUrl?: string;
    mediaType?: string;
  }>;
  expiresAt: number;
  completedAt?: number;
};

function loadSupportThread(peerId: string): StoredSupportThread | null {
  try {
    const raw = localStorage.getItem(supportChatKey(peerId));
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredSupportThread;
    if (!data || !Array.isArray(data.messages)) return null;
    if (data.expiresAt && Date.now() > data.expiresAt) {
      localStorage.removeItem(supportChatKey(peerId));
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function saveSupportThread(peerId: string, messages: StoredSupportThread['messages'], opts?: { completedAt?: number; resetTtl?: boolean }) {
  try {
    const prev = loadSupportThread(peerId);
    const now = Date.now();
    let expiresAt = prev?.expiresAt && prev.expiresAt > now ? prev.expiresAt : now + SUPPORT_CHAT_TTL_MS;
    if (opts?.resetTtl) expiresAt = now + SUPPORT_CHAT_TTL_MS;
    if (opts?.completedAt) expiresAt = opts.completedAt + SUPPORT_CHAT_TTL_MS;
    const payload: StoredSupportThread = {
      messages,
      expiresAt,
      completedAt: opts?.completedAt ?? prev?.completedAt,
    };
    localStorage.setItem(supportChatKey(peerId), JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('stooorna:support-thread', { detail: { peerId, ...payload } }));
  } catch { /* ignore */ }
}

const DELETED_THREADS_KEY = 'stooorna_deleted_support_threads';
function getDeletedThreadIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(DELETED_THREADS_KEY) || '[]')); } catch { return new Set(); }
}
function markThreadDeleted(peerId: string) {
  try {
    const ids = getDeletedThreadIds();
    ids.add(peerId);
    localStorage.setItem(DELETED_THREADS_KEY, JSON.stringify([...ids]));
  } catch { /* ignore */ }
}

function clearSupportThread(peerId: string) {
  try {
    localStorage.removeItem(supportChatKey(peerId));
    // also drop matching local tickets
    const tickets = readLocalSupportTickets().filter(
      t => t.fromUserId !== peerId,
    );
    localStorage.setItem('stooorna_support_tickets', JSON.stringify(tickets));
    // remember this thread was deleted so inbox fetch won't re-show it
    markThreadDeleted(peerId);
    window.dispatchEvent(new CustomEvent('stooorna:support-thread', { detail: { peerId, cleared: true } }));
  } catch { /* ignore */ }
  // Delete from DB (owner-only endpoint — silently ignored for non-owners)
  fetch(`/api/support/thread?userId=${encodeURIComponent(peerId)}`, {
    method: 'DELETE',
    credentials: 'include',
  }).catch(() => { /* optional */ });
}

async function notifySupportThreadComplete(peerId: string) {
  try {
    // Tell server to schedule a WS "support_thread_clear" event to the user after 10 min
    await fetch('/api/support/complete', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: peerId, deleteAfterMs: SUPPORT_CHAT_TTL_MS }),
    });
  } catch { /* optional backend */ }
  try {
    await sendRealChatMessage({
      toUserId: peerId,
      text: SUPPORT_TASK_DONE_MSG,
      meta: { isSupportReply: true, taskComplete: true, deleteAfterMs: SUPPORT_CHAT_TTL_MS },
    });
  } catch { /* */ }
}

function classifyListenIntent(text: string): 'quran' | 'ar_song' | 'en_song' | 'music' | 'other' {
  const t = text.toLowerCase().trim();
  if (/(قرآن|قران|quran|qur.?an|سورة|سوره|تلاوة|مصحف)/i.test(t)) return 'quran';
  if (/(عربي|عربية|arabic)/i.test(t) && /(أغنية|اغنية|أغنيه|اغنيه|song|موسيقى|موسيقي)/i.test(t)) return 'ar_song';
  if (/(إنجليزي|انجليزي|english)/i.test(t) && /(أغنية|اغنية|song|موسيقى)/i.test(t)) return 'en_song';
  if (/(أغنية|اغنية|أغنيه|اغنيه|song)/i.test(t)) {
    if (/(عربي|عربية|arabic)/i.test(t)) return 'ar_song';
    if (/(إنجليزي|انجليزي|english)/i.test(t)) return 'en_song';
    return 'ar_song';
  }
  if (/(موسيقى|موسيقي|music|instrumental)/i.test(t)) return 'music';
  return 'other';
}

/** Curated safe audio sources (audio only). Backend may override via /api/support/audio-search */
const AUDIO_CATALOG: Record<string, { title: string; url: string }[]> = {
  quran: [
    { title: 'الفاتحة — مشاري العفاسي', url: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/1.mp3' },
    { title: 'البقرة (بداية) — مشاري العفاسي', url: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/2.mp3' },
    { title: 'يس — مشاري العفاسي', url: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/36.mp3' },
    { title: 'الرحمن — مشاري العفاسي', url: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/55.mp3' },
    { title: 'الملك — مشاري العفاسي', url: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/67.mp3' },
    { title: 'الإخلاص — مشاري العفاسي', url: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/112.mp3' },
  ],
  ar_song: [
    { title: 'موسيقى هادئة عربية (عينة)', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  ],
  en_song: [
    { title: 'Calm instrumental (sample)', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  ],
  music: [
    { title: 'Instrumental music (sample)', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
  ],
};

async function resolveAudio(category: 'quran' | 'ar_song' | 'en_song' | 'music', query: string): Promise<{ title: string; url: string } | null> {
  // Prefer backend search if available (auto-search for support AI)
  try {
    const r = await fetch('/api/support/audio-search', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, query }),
    });
    if (r.ok) {
      const d = await r.json();
      if (d?.url && typeof d.url === 'string') {
        return { title: d.title || query, url: d.url };
      }
    }
  } catch { /* fallback catalog */ }

  const list = AUDIO_CATALOG[category] || [];
  if (!list.length) return null;
  const q = query.toLowerCase();
  const hit = list.find(x => x.title.toLowerCase().includes(q) || q.includes(x.title.toLowerCase().slice(0, 8)));
  return hit || list[0];
}

function SupportChatOverlay({
  open,
  onClose,
  currentUser,
}: {
  open: boolean;
  onClose: () => void;
  currentUser: { id?: string; name?: string | null; username?: string | null; email?: string | null } | null;
}) {
  const [lang, setLang] = useState<'ar' | 'en' | null>(null);
  const copy = SUPPORT_COPY[lang ?? 'ar'];
  const [messages, setMessages] = useState<SupportMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [userMsgCount, setUserMsgCount] = useState(0);
  const [aiPhase, setAiPhase] = useState<AiPhase>('pick_lang');
  const [listenCategory, setListenCategory] = useState<'quran' | 'ar_song' | 'en_song' | 'music' | null>(null);
  const [nowPlaying, setNowPlaying] = useState<{ title: string; url: string } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [supportOnline, setSupportOnline] = useState(false);
  const [autoMusicPlaying, setAutoMusicPlaying] = useState(false);
  const autoMusicRef = useRef<HTMLAudioElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const aiPhaseRef = useRef<AiPhase>('pick_lang');
  const waitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSupportIdRef = useRef<string | null>(null);
  const typeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const langRef = useRef<'ar' | 'en'>('ar');

  // Calm background music URLs (lofi / ambient)
  const CALM_MUSIC_URLS = [
    'https://www.bensound.com/bensound-music/bensound-slowmotion.mp3',
    'https://www.bensound.com/bensound-music/bensound-relaxing.mp3',
    'https://www.bensound.com/bensound-music/bensound-dreams.mp3',
  ];

  function startAutoMusic() {
    if (autoMusicRef.current) return; // already started
    const url = CALM_MUSIC_URLS[Math.floor(Math.random() * CALM_MUSIC_URLS.length)];
    const a = new Audio(url);
    a.loop = true;
    a.volume = 0.25;
    autoMusicRef.current = a;
    a.play().then(() => setAutoMusicPlaying(true)).catch(() => {});
  }

  function toggleAutoMusic() {
    const a = autoMusicRef.current;
    if (!a) return;
    if (autoMusicPlaying) {
      a.pause();
      setAutoMusicPlaying(false);
    } else {
      a.play().then(() => setAutoMusicPlaying(true)).catch(() => {});
    }
  }

  function stopAutoMusic() {
    const a = autoMusicRef.current;
    if (a) { a.pause(); a.src = ''; }
    autoMusicRef.current = null;
    setAutoMusicPlaying(false);
  }

  const pushBotInstant = (text: string) => {
    setMessages(prev => [...prev, { id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, from: 'bot', text, at: Date.now() }]);
  };

  /** Slow typewriter for AI lines */
  const pushBotTyped = (fullText: string): Promise<void> => {
    return new Promise(resolve => {
      if (typeTimerRef.current) {
        clearInterval(typeTimerRef.current);
        typeTimerRef.current = null;
      }
      setIsTyping(true);
      const id = `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      let i = 0;
      // reveal ~2–3 chars at a time for a natural slow feel
      const step = Math.max(1, Math.ceil(fullText.length / 40));
      const tickMs = 45;
      // small delay so "Type..." is visible first
      setTimeout(() => {
        setMessages(prev => [...prev, { id, from: 'bot', text: '', at: Date.now() }]);
        typeTimerRef.current = setInterval(() => {
          i = Math.min(fullText.length, i + step);
          const slice = fullText.slice(0, i);
          setMessages(prev => prev.map(m => (m.id === id ? { ...m, text: slice } : m)));
          if (i >= fullText.length) {
            if (typeTimerRef.current) clearInterval(typeTimerRef.current);
            typeTimerRef.current = null;
            setIsTyping(false);
            resolve();
          }
        }, tickMs);
      }, 350);
    });
  };

  const stopAudio = () => {
    try {
      audioRef.current?.pause();
      if (audioRef.current) audioRef.current.src = '';
    } catch { /* ignore */ }
    audioRef.current = null;
    if (maxPlayTimerRef.current) {
      clearTimeout(maxPlayTimerRef.current);
      maxPlayTimerRef.current = null;
    }
    setIsPlaying(false);
    setNowPlaying(null);
  };

  const stopAiCompletely = () => {
    aiPhaseRef.current = 'human';
    setAiPhase('human');
    if (waitTimerRef.current) {
      clearInterval(waitTimerRef.current);
      waitTimerRef.current = null;
    }
    if (typeTimerRef.current) {
      clearInterval(typeTimerRef.current);
      typeTimerRef.current = null;
    }
    setIsTyping(false);
    stopAudio();
  };

  const playAudio = (track: { title: string; url: string }) => {
    stopAudio();
    const a = new Audio(track.url);
    audioRef.current = a;
    a.onended = () => setIsPlaying(false);
    a.onerror = () => {
      setIsPlaying(false);
      pushBotInstant(SUPPORT_COPY[langRef.current].notFound);
    };
    // Cap at 5 minutes even if the file is longer
    a.ontimeupdate = () => {
      if (a.currentTime >= SUPPORT_AUDIO_MAX_SEC) {
        a.pause();
        setIsPlaying(false);
      }
    };
    a.play().then(() => {
      setNowPlaying(track);
      setIsPlaying(true);
      setAiPhase('playing');
      aiPhaseRef.current = 'playing';
      pushBotInstant(`${SUPPORT_COPY[langRef.current].playing} ${track.title}`);
      if (maxPlayTimerRef.current) clearTimeout(maxPlayTimerRef.current);
      maxPlayTimerRef.current = setTimeout(() => {
        try { a.pause(); } catch { /* */ }
        setIsPlaying(false);
      }, SUPPORT_AUDIO_MAX_SEC * 1000);
    }).catch(() => {
      pushBotInstant(SUPPORT_COPY[langRef.current].notFound);
    });
  };

  const togglePlayPause = () => {
    const a = audioRef.current;
    if (!a || !nowPlaying) return;
    if (a.paused) {
      a.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      a.pause();
      setIsPlaying(false);
    }
  };

  // Seed: language picker first — restore thread if still within 10 minutes
  useEffect(() => {
    if (!open) {
      stopAiCompletely();
      // do NOT wipe messages from storage on leave — keep 10 min
      return;
    }
    const uid = currentUser?.id || 'anon';
    const stored = loadSupportThread(uid);
    if (stored?.messages?.length) {
      setMessages(stored.messages.map(m => ({
        id: m.id,
        from: (m.from === 'user' ? 'user' : m.from === 'support' ? 'support' : 'bot') as SupportMsg['from'],
        text: m.text,
        at: m.at,
        mediaUrl: m.mediaUrl,
        mediaType: m.mediaType as SupportMsg['mediaType'],
      })));
      // if already had language + history, skip picker
      const hadUser = stored.messages.some(m => m.from === 'user');
      if (hadUser) {
        setLang(langRef.current || 'ar');
        setAiPhase(stored.completedAt ? 'human' : 'waiting');
        aiPhaseRef.current = stored.completedAt ? 'human' : 'waiting';
      } else {
        setLang(null);
        setAiPhase('pick_lang');
        aiPhaseRef.current = 'pick_lang';
      }
      if (stored.completedAt) {
        stopAiCompletely();
      }
    } else {
      setMessages([]);
      setLang(null);
      setAiPhase('pick_lang');
      aiPhaseRef.current = 'pick_lang';
    }
    setInput('');
    setUserMsgCount(stored?.messages?.filter(m => m.from === 'user').length || 0);
    setListenCategory(null);
    lastSupportIdRef.current = null;
    setIsTyping(false);
    stopAudio();
    setSupportOnline(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentUser?.id]);

  // Persist user support chat (10 min TTL, survives leave/re-enter)
  useEffect(() => {
    if (!open || !currentUser?.id || !messages.length) return;
    saveSupportThread(
      currentUser.id,
      messages.map(m => ({
        id: m.id,
        from: m.from,
        text: m.text,
        at: m.at,
        mediaUrl: m.mediaUrl,
        mediaType: m.mediaType,
      })),
      { resetTtl: true },
    );
  }, [messages, open, currentUser?.id]);

  // Auto-delete after expiry
  useEffect(() => {
    if (!open || !currentUser?.id) return;
    const id = setInterval(() => {
      const stored = loadSupportThread(currentUser.id!);
      if (!stored) {
        // already cleared
        return;
      }
      if (stored.expiresAt && Date.now() > stored.expiresAt) {
        clearSupportThread(currentUser.id!);
        setMessages([]);
        setLang(null);
        setAiPhase('pick_lang');
        aiPhaseRef.current = 'pick_lang';
        setUserMsgCount(0);
      }
    }, 2000);
    return () => clearInterval(id);
  }, [open, currentUser?.id]);

  async function selectLang(chosen: 'ar' | 'en') {
    setLang(chosen);
    langRef.current = chosen;
    try { localStorage.setItem('lang', chosen); } catch { /* */ }
    setAiPhase('idle');
    aiPhaseRef.current = 'idle';
    await pushBotTyped(SUPPORT_COPY[chosen].greeting);
  }

  // Auto-scroll
  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, isTyping]);

  // Every 2 minutes: please wait (only while AI is handling wait / listen)
  useEffect(() => {
    if (!open || !lang) return;
    if (waitTimerRef.current) clearInterval(waitTimerRef.current);
    waitTimerRef.current = setInterval(() => {
      const phase = aiPhaseRef.current;
      if (phase === 'human' || phase === 'idle' || phase === 'pick_lang') return;
      void pushBotTyped(SUPPORT_COPY[langRef.current].waiting);
    }, 120_000);
    return () => {
      if (waitTimerRef.current) clearInterval(waitTimerRef.current);
      waitTimerRef.current = null;
    };
  }, [open, lang]);

  // Poll support presence + real agent replies
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const poll = async () => {
      try {
        // presence of support desk
        try {
          const pr = await fetch('/api/users/by-username/stooorna', { credentials: 'include' });
          if (pr.ok) {
            const pd = await pr.json();
            if (!cancelled && typeof pd.online === 'boolean') setSupportOnline(!!pd.online);
            else if (!cancelled) setSupportOnline(true);
          }
        } catch {
          if (!cancelled) setSupportOnline(true);
        }

        const r = await fetch('/api/support/messages?role=user', { credentials: 'include' });
        if (!r.ok || cancelled) return;
        const d = await r.json();
        const list: Array<{ id: string; from: string; text: string; at?: number }> = Array.isArray(d) ? d : (d.messages || []);
        const supportOnes = list.filter(m => m.from === 'support' || m.from === 'agent' || m.from === 'stooorna');
        if (!supportOnes.length) return;
        const latest = supportOnes[supportOnes.length - 1];
        if (latest.id && latest.id !== lastSupportIdRef.current) {
          lastSupportIdRef.current = latest.id;
          if (aiPhaseRef.current !== 'human') {
            stopAiCompletely();
            setMessages(prev => [
              ...prev,
              { id: `s-join-${Date.now()}`, from: 'bot', text: SUPPORT_COPY[langRef.current].supportJoined, at: Date.now() },
              { id: `s-${latest.id}`, from: 'support', text: latest.text, at: latest.at || Date.now() },
            ]);
          } else {
            setMessages(prev => {
              if (prev.some(p => p.id === `s-${latest.id}`)) return prev;
              return [...prev, { id: `s-${latest.id}`, from: 'support', text: latest.text, at: latest.at || Date.now() }];
            });
          }
        }
      } catch { /* silent */ }
    };
    poll();
    const id = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [open]);

  // Cleanup audio on unmount
  useEffect(() => () => {
    stopAudio();
    if (typeTimerRef.current) clearInterval(typeTimerRef.current);
  }, []);

  async function deliverToSupport(payload: {
    text?: string;
    mediaUrl?: string;
    mediaType?: string;
  }) {
    const text = payload.text || '';
    const isGuest = !currentUser;
    const fromUsername = (currentUser as { username?: string })?.username ?? null;
    const fromName = isGuest ? 'Guest' : (currentUser?.name ?? null);
    const fromEmail = currentUser?.email ?? null;
    const fromUserId = currentUser?.id;

    // Always queue locally so owner inbox can pick it up
    queueSupportTicket({
      fromUserId,
      fromUsername,
      fromName,
      fromEmail,
      text,
      mediaUrl: payload.mediaUrl,
      mediaType: payload.mediaType,
      lang: langRef.current,
    });

    // Real delivery into the app messaging system → @stooorna
    try {
      const supportId = await resolveSupportUserId();
      if (supportId) {
        await sendRealChatMessage({
          toUserId: supportId,
          text: text || (payload.mediaType ? `[${payload.mediaType}]` : ''),
          mediaUrl: payload.mediaUrl,
          mediaType: payload.mediaType,
          meta: {
            isSupportTicket: true,
            support: true,
            fromUsername,
            fromName,
            lang: langRef.current,
          },
        });
      }
      // Also try dedicated support route if backend adds it later
      await fetch('/api/support/messages', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          mediaUrl: payload.mediaUrl,
          mediaType: payload.mediaType,
          toUsername: 'stooorna',
          toUserId: supportId,
          fromUserId,
          fromUsername,
          fromName,
          fromEmail,
          lang: langRef.current,
        }),
      }).catch(() => {});
    } catch { /* non-blocking */ }
  }

  async function handleAiTurn(userText: string) {
    if (aiPhaseRef.current === 'human' || aiPhaseRef.current === 'pick_lang') return;
    const L = SUPPORT_COPY[langRef.current];
    if (BLOCKED_RE.test(userText)) {
      await pushBotTyped(L.blocked);
      return;
    }

    const phase = aiPhaseRef.current;

    if (phase === 'waiting') {
      const cat = classifyListenIntent(userText);
      if (cat !== 'other') {
        setListenCategory(cat);
        setAiPhase('ask_title');
        aiPhaseRef.current = 'ask_title';
        await pushBotTyped(L.askTitle);
        return;
      }
      return;
    }

    if (phase === 'ask_category') {
      const cat = classifyListenIntent(userText);
      if (cat === 'other') {
        await pushBotTyped(L.unavailable);
        return;
      }
      setListenCategory(cat);
      setAiPhase('ask_title');
      aiPhaseRef.current = 'ask_title';
      await pushBotTyped(L.askTitle);
      return;
    }

    if (phase === 'ask_title' || phase === 'playing') {
      const cat = listenCategory || classifyListenIntent(userText);
      if (cat === 'other' && !listenCategory) {
        await pushBotTyped(L.unavailable);
        return;
      }
      const finalCat = (cat === 'other' ? listenCategory : cat) || 'music';
      const track = await resolveAudio(finalCat, userText);
      if (!track) {
        await pushBotTyped(L.notFound);
        return;
      }
      playAudio(track);
      return;
    }
  }

  async function handleSend(textOverride?: string, media?: { url: string; type: 'image' | 'video' | 'file' }) {
    if (!lang || aiPhaseRef.current === 'pick_lang') return;
    const text = (textOverride ?? input).trim();
    if (!text && !media) return;
    if (sending || isTyping) return;
    setSending(true);
    const userMsg: SupportMsg = {
      id: `u-${Date.now()}`,
      from: 'user',
      text: text || (media?.type === 'image' ? '📷 Image' : media?.type === 'video' ? '🎬 Video' : '📎 File'),
      at: Date.now(),
      mediaUrl: media?.url,
      mediaType: media?.type,
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    const nextCount = userMsgCount + 1;
    setUserMsgCount(nextCount);

    await deliverToSupport({
      text: text || undefined,
      mediaUrl: media?.url,
      mediaType: media?.type,
    });

    if (aiPhaseRef.current === 'human') {
      setSending(false);
      return;
    }

    // First user message: waiting line → auto-start calm music
    if (nextCount === 1) {
      setAiPhase('waiting');
      (aiPhaseRef as React.MutableRefObject<AiPhase>).current = 'waiting';
      setSending(false);
      const L = SUPPORT_COPY[langRef.current];
      await pushBotTyped(L.waiting);
      if ((aiPhaseRef as React.MutableRefObject<AiPhase>).current === 'human') return;
      // Auto-play calm background music
      startAutoMusic();
      return;
    }

    if (!text) {
      setSending(false);
      return;
    }

    await handleAiTurn(text);
    setSending(false);
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const mediaType: 'image' | 'video' | 'file' = isImage ? 'image' : isVideo ? 'video' : 'file';
    let mediaUrl = '';
    try {
      const r = await fetch('/api/support/upload', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (r.ok) {
        const d = await r.json();
        mediaUrl = d.url || d.mediaUrl || '';
      }
    } catch { /* local preview fallback */ }
    if (!mediaUrl) mediaUrl = URL.createObjectURL(file);
    await handleSend('', { url: mediaUrl, type: mediaType });
  }

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10350,
          background: 'rgba(0,0,0,0.96)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header — slim: avatar + Stooorna (Support) only */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 12px',
            paddingTop: 'max(8px, env(safe-area-inset-top))',
            background: 'linear-gradient(180deg, #0a1f2e 0%, #06141c 100%)',
            borderBottom: '1px solid rgba(0,188,212,0.25)',
            flexShrink: 0,
            minHeight: 52,
          }}
        >
          <button
            onClick={() => {
              stopAiCompletely();
              stopAutoMusic();
              onClose();
            }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#00BCD4', padding: 2, flexShrink: 0 }}
            aria-label="Close"
          >
            <X size={20} />
          </button>
          <div style={{ position: 'relative', width: 34, height: 34, flexShrink: 0 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #00BCD4 0%, #0288D1 100%)',
                border: '2px solid #00BCD4',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#041018',
                fontWeight: 800,
                fontSize: '0.8rem',
                overflow: 'hidden',
              }}
            >
              <img
                src="/api/users/by-username/stooorna/avatar"
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={e => {
                  const el = e.currentTarget;
                  el.style.display = 'none';
                  if (el.parentElement) el.parentElement.textContent = 'S';
                }}
              />
            </div>
            <span
              title={supportOnline ? 'Online' : 'Offline'}
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 11,
                height: 11,
                borderRadius: '50%',
                background: supportOnline ? '#22c55e' : '#64748b',
                border: '2px solid #06141c',
                boxShadow: supportOnline ? '0 0 6px rgba(34,197,94,0.7)' : 'none',
              }}
            />
          </div>
          <p
            style={{
              margin: 0,
              flex: 1,
              minWidth: 0,
              color: '#00BCD4',
              fontWeight: 800,
              fontSize: '0.9rem',
              letterSpacing: '0.01em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            Stooorna (Support)
          </p>
          {/* Auto calm music toggle button */}
          {autoMusicRef.current && (
            <motion.button
              whileTap={{ scale: 0.9 }}
              type="button"
              onClick={toggleAutoMusic}
              title={autoMusicPlaying ? 'إيقاف الموسيقى' : 'تشغيل الموسيقى'}
              style={{
                width: 32, height: 32, borderRadius: 8,
                background: autoMusicPlaying ? 'rgba(0,188,212,0.22)' : 'rgba(0,188,212,0.08)',
                border: `1px solid ${autoMusicPlaying ? 'rgba(0,188,212,0.6)' : 'rgba(0,188,212,0.25)'}`,
                color: 'hsl(var(--primary))', display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
              }}
              aria-label={autoMusicPlaying ? 'Pause music' : 'Play music'}
            >
              {autoMusicPlaying ? <Pause size={14} /> : <Play size={14} style={{ marginLeft: 2 }} />}
            </motion.button>
          )}
          {nowPlaying && aiPhase !== 'human' && (
            <motion.button
              whileTap={{ scale: 0.9 }}
              type="button"
              onClick={togglePlayPause}
              title={nowPlaying.title}
              style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'rgba(0,188,212,0.18)',
                border: '1px solid rgba(0,188,212,0.45)',
                color: 'hsl(var(--primary))', display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
              }}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} style={{ marginLeft: 2 }} />}
            </motion.button>
          )}
        </div>

        {/* Messages */}
        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            background: 'radial-gradient(ellipse 70% 50% at 50% 0%, #0d2a2e 0%, #060e0e 70%)',
          }}
        >
          {/* Language choice — before any AI message */}
          {!lang && (
            <div style={{
              marginTop: 24,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 14,
            }}>
              <p style={{ margin: 0, color: 'rgba(200,230,230,0.85)', fontSize: '0.88rem', fontWeight: 600 }}>
                Choose language · اختر اللغة
              </p>
              <div style={{ display: 'flex', gap: 12, width: '100%', maxWidth: 320 }}>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  type="button"
                  onClick={() => selectLang('en')}
                  style={{
                    flex: 1, padding: '14px 0', borderRadius: 14, cursor: 'pointer',
                    background: 'rgba(0,188,212,0.12)', border: '1.5px solid rgba(0,188,212,0.45)',
                    color: '#00BCD4', fontWeight: 800, fontSize: '0.95rem',
                  }}
                >
                  English
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  type="button"
                  onClick={() => selectLang('ar')}
                  style={{
                    flex: 1, padding: '14px 0', borderRadius: 14, cursor: 'pointer',
                    background: 'rgba(0,188,212,0.12)', border: '1.5px solid rgba(0,188,212,0.45)',
                    color: '#00BCD4', fontWeight: 800, fontSize: '0.95rem',
                  }}
                >
                  العربية
                </motion.button>
              </div>
            </div>
          )}

          {messages.map(m => {
            const isUser = m.from === 'user';
            const isSupport = m.from === 'support';
            return (
              <div
                key={m.id}
                style={{
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  maxWidth: '82%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {isSupport && (
                  <span style={{ fontSize: '0.62rem', color: '#00BCD4', fontWeight: 700, paddingInline: 4 }}>
                    Support
                  </span>
                )}
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    background: isUser
                      ? 'linear-gradient(135deg, rgba(0,188,212,0.28), rgba(0,120,180,0.22))'
                      : isSupport
                        ? 'rgba(34,197,94,0.12)'
                        : 'rgba(0,188,212,0.1)',
                    border: `1px solid ${isUser ? 'rgba(0,188,212,0.45)' : isSupport ? 'rgba(34,197,94,0.4)' : 'rgba(0,188,212,0.22)'}`,
                    color: 'rgba(200,230,230,0.95)',
                    fontSize: '0.84rem',
                    lineHeight: 1.55,
                    direction: (lang ?? 'ar') === 'ar' ? 'rtl' : 'ltr',
                    textAlign: (lang ?? 'ar') === 'ar' ? 'right' : 'left',
                    minHeight: m.from === 'bot' && !m.text ? 20 : undefined,
                  }}
                >
                  {m.mediaUrl && m.mediaType === 'image' && (
                    <img
                      src={m.mediaUrl}
                      alt=""
                      style={{ width: '100%', borderRadius: 10, marginBottom: m.text ? 8 : 0, display: 'block' }}
                    />
                  )}
                  {m.mediaUrl && m.mediaType === 'video' && (
                    <video
                      src={m.mediaUrl}
                      controls
                      playsInline
                      style={{ width: '100%', borderRadius: 10, marginBottom: m.text ? 8 : 0, display: 'block' }}
                    />
                  )}
                  {m.mediaUrl && m.mediaType === 'file' && (
                    <a
                      href={m.mediaUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#00BCD4', fontSize: '0.8rem', display: 'block', marginBottom: m.text ? 6 : 0 }}
                    >
                      📎 Attachment
                    </a>
                  )}
                  {m.text}
                </div>
              </div>
            );
          })}

          {/* Typing indicator above AI stream */}
          {isTyping && (
            <div style={{ alignSelf: 'flex-start', padding: '4px 8px' }}>
              <span style={{
                color: 'rgba(0,188,212,0.85)',
                fontSize: '0.75rem',
                fontWeight: 600,
                fontStyle: 'italic',
                letterSpacing: '0.04em',
              }}>
                Type...
              </span>
            </div>
          )}
        </div>

        {/* Composer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 8,
            padding: '10px 12px',
            paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
            background: 'rgba(6,14,14,0.96)',
            borderTop: '1px solid rgba(0,188,212,0.2)',
            flexShrink: 0,
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*,.pdf,.doc,.docx,.zip,.txt"
            style={{ display: 'none' }}
            onChange={onPickFile}
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            type="button"
            onClick={() => fileRef.current?.click()}
            title={copy.attach}
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              flexShrink: 0,
              background: 'rgba(0,188,212,0.12)',
              border: '1px solid rgba(0,188,212,0.35)',
              color: '#00BCD4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <Plus size={20} strokeWidth={2.4} />
          </motion.button>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value.slice(0, 2000))}
            placeholder={!lang ? 'English / العربية' : copy.placeholder}
            rows={1}
            disabled={!lang || isTyping}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            style={{
              flex: 1,
              resize: 'none',
              minHeight: 40,
              maxHeight: 120,
              padding: '10px 12px',
              borderRadius: 12,
              background: 'rgba(0,188,212,0.06)',
              border: '1px solid rgba(0,188,212,0.22)',
              color: 'rgba(200,230,230,0.95)',
              fontSize: '0.88rem',
              outline: 'none',
              fontFamily: 'var(--font-sans)',
              lineHeight: 1.4,
              direction: (lang ?? 'ar') === 'ar' ? 'rtl' : 'ltr',
              opacity: !lang ? 0.5 : 1,
            }}
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            type="button"
            disabled={!lang || sending || isTyping || !input.trim()}
            onClick={() => handleSend()}
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              flexShrink: 0,
              background: input.trim() ? 'rgba(0,188,212,0.25)' : 'rgba(0,188,212,0.06)',
              border: `1px solid ${input.trim() ? 'rgba(0,188,212,0.55)' : 'rgba(0,188,212,0.15)'}`,
              color: input.trim() ? '#00BCD4' : 'rgba(150,190,190,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: input.trim() ? 'pointer' : 'default',
            }}
          >
            <Send size={18} />
          </motion.button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Owner support thread (Stooorna inbox → chat with a user) ─────────────────
function OwnerSupportThread({
  peer,
  onClose,
  currentUser,
}: {
  peer: {
    id: string;
    name: string | null;
    username: string | null;
    avatarUrl: string | null;
    online?: boolean;
    lastIp?: string | null;
    country?: string | null;
  };
  onClose: () => void;
  currentUser: { id?: string; name?: string | null; username?: string | null; email?: string | null } | null;
}) {
  type Msg = { id: string; from: 'user' | 'support' | 'me'; text: string; at: number; mediaUrl?: string; mediaType?: string };
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [taskDone, setTaskDone] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [ttlLeft, setTtlLeft] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const displayName = peer.name || peer.username || 'User';

  // Persist messages while thread is open (survive leave/re-enter until TTL)
  useEffect(() => {
    if (!messages.length) return;
    saveSupportThread(
      peer.id,
      messages.map(m => ({
        id: m.id,
        from: m.from,
        text: m.text,
        at: m.at,
        mediaUrl: m.mediaUrl,
        mediaType: m.mediaType,
      })),
      taskDone && expiresAt ? { completedAt: expiresAt - SUPPORT_CHAT_TTL_MS } : undefined,
    );
  }, [messages, peer.id, taskDone, expiresAt]);

  // Countdown + auto wipe after 10 minutes
  useEffect(() => {
    const tick = () => {
      const stored = loadSupportThread(peer.id);
      if (stored?.expiresAt) {
        setExpiresAt(stored.expiresAt);
        const left = stored.expiresAt - Date.now();
        setTtlLeft(Math.max(0, left));
        if (left <= 0) {
          clearSupportThread(peer.id);
          setMessages([]);
          setTaskDone(false);
          setExpiresAt(null);
          setTtlLeft(null);
        }
      } else if (!taskDone) {
        // keep a rolling 10-min window from last activity when not completed
        setTtlLeft(null);
      }
    };
    tick();
    const id = setInterval(tick, 1000);

    // Listen for server-pushed clear event (owner marked task done)
    const onClear = (e: Event) => {
      const detail = (e as CustomEvent).detail as { cleared?: boolean; all?: boolean; targetUserId?: string | null };
      // For the user side: detail.all=true, no targetUserId
      // For the owner side: detail.targetUserId matches the peer we're chatting with
      const isForThisThread = detail?.cleared && (detail.all && !detail.targetUserId || detail.targetUserId === peer.id);
      if (isForThisThread) {
        clearSupportThread(peer.id);
        setMessages([]);
        setTaskDone(false);
        setExpiresAt(null);
        setTtlLeft(null);
      }
    };
    window.addEventListener('stooorna:support-thread', onClear);

    return () => {
      clearInterval(id);
      window.removeEventListener('stooorna:support-thread', onClear);
    };
  }, [peer.id, taskDone, messages.length]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // Local persisted thread first (survives leave for up to 10 min)
        const stored = loadSupportThread(peer.id);
        if (stored?.messages?.length) {
          if (!cancelled) {
            setMessages(stored.messages.map(m => ({
              id: m.id,
              from: (m.from === 'me' || m.from === 'support' || m.from === 'agent') ? 'me' : 'user',
              text: m.text,
              at: m.at,
              mediaUrl: m.mediaUrl,
              mediaType: m.mediaType,
            })));
            if (stored.completedAt) setTaskDone(true);
            if (stored.expiresAt) setExpiresAt(stored.expiresAt);
          }
        }

        const endpoints = [
          `/api/messages?with=${encodeURIComponent(peer.id)}`,
          `/api/messages?userId=${encodeURIComponent(peer.id)}`,
          `/api/messages?peerId=${encodeURIComponent(peer.id)}`,
          `/api/support/messages?with=${encodeURIComponent(peer.id)}`,
        ];
        let list: any[] = [];
        for (const url of endpoints) {
          try {
            const r = await fetch(url, { credentials: 'include' });
            if (!r.ok) continue;
            const d = await r.json();
            list = Array.isArray(d) ? d : (d.messages || d.items || []);
            if (list.length) break;
          } catch { /* next */ }
        }
        const local = readLocalSupportTickets().filter(
          t => t.fromUserId === peer.id || t.fromUsername === peer.username,
        );
        if (!list.length && local.length) {
          list = local.map(t => ({
            id: t.id,
            from: 'user',
            text: t.text,
            at: t.at,
            mediaUrl: t.mediaUrl,
          }));
        }
        if (cancelled || !list.length) return;
        const mapped: Msg[] = list.map((m: any) => ({
          id: String(m.id ?? m._id ?? Math.random()),
          from: (m.from === 'support' || m.from === 'agent' || m.fromUserId === currentUser?.id || m.senderId === currentUser?.id || m.me)
            ? 'me'
            : 'user',
          text: m.text || m.content || m.body || m.message || '',
          at: m.at ? new Date(m.at).getTime() : (m.createdAt ? new Date(m.createdAt).getTime() : Date.now()),
          mediaUrl: m.mediaUrl,
          mediaType: m.mediaType,
        }));
        setMessages(prev => {
          // merge by id, prefer longer history
          const byId = new Map<string, Msg>();
          [...prev, ...mapped].forEach(m => byId.set(m.id, m));
          return Array.from(byId.values()).sort((a, b) => a.at - b.at);
        });
      } catch { /* silent */ }
    }
    load();
    const id = setInterval(load, 4000);
    return () => { cancelled = true; clearInterval(id); };
  }, [peer.id, peer.username, currentUser?.id]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function markTaskDone() {
    if (taskDone || sending) return;
    if (!window.confirm('تأكيد: تم تنفيذ الطلب؟ سيُرسل شكر للمستخدم وتُحذف المحادثة بعد 10 دقائق.')) return;
    setSending(true);
    const completedAt = Date.now();
    const doneMsg: Msg = {
      id: `done-${completedAt}`,
      from: 'me',
      text: SUPPORT_TASK_DONE_MSG,
      at: completedAt,
    };
    setMessages(prev => {
      const next = [...prev, doneMsg];
      saveSupportThread(
        peer.id,
        next.map(m => ({ id: m.id, from: m.from, text: m.text, at: m.at, mediaUrl: m.mediaUrl, mediaType: m.mediaType })),
        { completedAt },
      );
      return next;
    });
    setTaskDone(true);
    setExpiresAt(completedAt + SUPPORT_CHAT_TTL_MS);
    await notifySupportThreadComplete(peer.id);
    setSending(false);
  }

  async function send(textOverride?: string, media?: { url: string; type: string }) {
    const text = (textOverride ?? input).trim();
    if (!text && !media) return;
    if (sending) return;
    setSending(true);
    const local: Msg = {
      id: `local-${Date.now()}`,
      from: 'me',
      text: text || (media?.type === 'image' ? '📷' : '📎'),
      at: Date.now(),
      mediaUrl: media?.url,
      mediaType: media?.type,
    };
    setMessages(prev => [...prev, local]);
    setInput('');
    // refresh TTL while conversation is active (unless already marked done)
    if (!taskDone) {
      saveSupportThread(
        peer.id,
        [...messages, local].map(m => ({ id: m.id, from: m.from, text: m.text, at: m.at, mediaUrl: m.mediaUrl, mediaType: m.mediaType })),
        { resetTtl: true },
      );
    }
    try {
      await sendRealChatMessage({
        toUserId: peer.id,
        text: text || (media?.type ? `[${media.type}]` : ''),
        mediaUrl: media?.url,
        mediaType: media?.type,
        meta: { fromRole: 'support', isSupportReply: true },
      });
    } catch { /* silent */ }
    setSending(false);
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const mediaType = isImage ? 'image' : isVideo ? 'video' : 'file';
    let mediaUrl = '';
    try {
      const r = await fetch('/api/support/upload', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (r.ok) {
        const d = await r.json();
        mediaUrl = d.url || d.mediaUrl || '';
      }
    } catch { /* */ }
    if (!mediaUrl) mediaUrl = URL.createObjectURL(file);
    await send('', { url: mediaUrl, type: mediaType });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10360,
        background: 'rgba(0,0,0,0.96)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Slim header: avatar + name + online + open profile */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 12px',
          paddingTop: 'max(8px, env(safe-area-inset-top))',
          background: 'linear-gradient(180deg, #0a1f2e 0%, #06141c 100%)',
          borderBottom: '1px solid rgba(0,188,212,0.25)',
          flexShrink: 0,
          minHeight: 52,
        }}
      >
        <button onClick={() => { onClose(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--primary))', padding: 2 }} aria-label="Close">
          <X size={20} />
        </button>
        <button
          type="button"
          onClick={() => {
            if (peer.username) window.location.href = `/u/${peer.username}`;
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flex: 1,
            minWidth: 0,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            textAlign: 'left',
          }}
        >
          <div style={{ position: 'relative', width: 34, height: 34, flexShrink: 0 }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%', overflow: 'hidden',
              background: 'rgba(0,188,212,0.2)', border: '2px solid rgba(0,188,212,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00BCD4', fontWeight: 700, fontSize: '0.75rem',
            }}>
              {peer.avatarUrl
                ? <img src={peer.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : (displayName[0] || '?').toUpperCase()}
            </div>
            <span style={{
              position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: '50%',
              background: peer.online ? '#22c55e' : '#64748b',
              border: '2px solid #06141c',
            }} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ margin: 0, color: '#00BCD4', fontWeight: 800, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayName}
            </p>
            <p style={{ margin: 0, color: 'rgba(150,190,190,0.7)', fontSize: '0.62rem' }}>
              {peer.online ? 'Online' : 'Offline'}
              {peer.username ? ` · @${peer.username}` : ''}
              {peer.lastIp ? ` · IP ${peer.lastIp}` : ''}
              {peer.country ? ` · ${peer.country}` : ''}
            </p>
          </div>
        </button>
      </div>

      {/* Task complete (red) + 10-min delete timer */}
      <div style={{
        flexShrink: 0,
        padding: '8px 12px',
        borderBottom: '1px solid rgba(239,68,68,0.2)',
        background: 'rgba(20,8,10,0.9)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}>
        <motion.button
          whileTap={{ scale: 0.97 }}
          type="button"
          disabled={taskDone || sending}
          onClick={markTaskDone}
          style={{
            width: '100%',
            padding: '11px 12px',
            borderRadius: 12,
            border: '1.5px solid rgba(239,68,68,0.65)',
            background: taskDone ? 'rgba(239,68,68,0.15)' : 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
            color: '#fff',
            fontWeight: 800,
            fontSize: '0.82rem',
            cursor: taskDone ? 'default' : 'pointer',
            opacity: taskDone ? 0.75 : 1,
            boxShadow: taskDone ? 'none' : '0 0 14px rgba(239,68,68,0.35)',
          }}
        >
          {taskDone ? '✓ تم تنفيذ الطلب — الحذف خلال 10 دقائق' : 'تم تنفيذ الطلب'}
        </motion.button>
        {ttlLeft != null && ttlLeft > 0 && (
          <p style={{ margin: 0, textAlign: 'center', color: 'rgba(252,165,165,0.85)', fontSize: '0.68rem' }}>
            تُحذف المحادثة خلال {Math.floor(ttlLeft / 60000)}:{String(Math.floor((ttlLeft % 60000) / 1000)).padStart(2, '0')}
          </p>
        )}
      </div>

      <div ref={listRef} style={{
        flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 10,
        background: 'radial-gradient(ellipse 70% 50% at 50% 0%, #0d2a2e 0%, #060e0e 70%)',
      }}>
        {messages.map(m => {
          const mine = m.from === 'me' || m.from === 'support';
          return (
            <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
              <div style={{
                padding: '10px 14px',
                borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: mine ? 'linear-gradient(135deg, rgba(0,188,212,0.28), rgba(0,120,180,0.22))' : 'rgba(0,188,212,0.1)',
                border: `1px solid ${mine ? 'rgba(0,188,212,0.45)' : 'rgba(0,188,212,0.22)'}`,
                color: 'rgba(200,230,230,0.95)',
                fontSize: '0.84rem',
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
              }}>
                {m.mediaUrl && m.mediaType === 'image' && (
                  <img src={m.mediaUrl} alt="" style={{ width: '100%', borderRadius: 10, marginBottom: m.text ? 8 : 0, display: 'block' }} />
                )}
                {m.text}
              </div>
            </div>
          );
        })}
        {messages.length === 0 && (
          <p style={{ color: 'rgba(150,190,190,0.5)', fontSize: '0.8rem', textAlign: 'center', marginTop: 40 }}>
            لا رسائل بعد — ابدأ المحادثة مع المستخدم
          </p>
        )}
      </div>

      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 8, padding: '10px 12px',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        background: 'rgba(6,14,14,0.96)', borderTop: '1px solid rgba(0,188,212,0.2)', flexShrink: 0,
      }}>
        <input ref={fileRef} type="file" accept="image/*,video/*,.pdf,.doc,.docx,.zip,.txt" style={{ display: 'none' }} onChange={onPickFile} />
        <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={() => fileRef.current?.click()} style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          background: 'rgba(0,188,212,0.12)', border: '1px solid rgba(0,188,212,0.35)', color: '#00BCD4',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <Plus size={20} strokeWidth={2.4} />
        </motion.button>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value.slice(0, 2000))}
          placeholder="اكتب رد الدعم…"
          rows={1}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          style={{
            flex: 1, resize: 'none', minHeight: 40, maxHeight: 120, padding: '10px 12px', borderRadius: 12,
            background: 'rgba(0,188,212,0.06)', border: '1px solid rgba(0,188,212,0.22)',
            color: 'rgba(200,230,230,0.95)', fontSize: '0.88rem', outline: 'none', fontFamily: 'var(--font-sans)', lineHeight: 1.4,
          }}
        />
        <motion.button whileTap={{ scale: 0.9 }} type="button" disabled={sending || !input.trim()} onClick={() => send()} style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          background: input.trim() ? 'rgba(0,188,212,0.25)' : 'rgba(0,188,212,0.06)',
          border: `1px solid ${input.trim() ? 'rgba(0,188,212,0.55)' : 'rgba(0,188,212,0.15)'}`,
          color: input.trim() ? '#00BCD4' : 'rgba(150,190,190,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() ? 'pointer' : 'default',
        }}>
          <Send size={18} />
        </motion.button>
      </div>
    </motion.div>
  );
}

// ─── Auth screen (shown when not logged in) ───────────────────────────────────
function AuthScreen({ T }: { T: Record<string, string> }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (mode === 'register' && password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await signIn.email({ email, password });
        if ((res as { error?: { message?: string } })?.error) {
          setError((res as { error?: { message?: string } }).error?.message || 'فشل تسجيل الدخول');
        }
      } else {
        const res = await signUp.email({ name, email, password });
        if ((res as { error?: { message?: string } })?.error) {
          setError((res as { error?: { message?: string } }).error?.message || 'فشل إنشاء الحساب');
        }
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  const btnFg = 'hsl(var(--primary-foreground))';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', padding: '24px 16px' }}>
      <div style={{
        width: 80, height: 80, borderRadius: '50%', overflow: 'hidden',
        marginBottom: 20, flexShrink: 0,
        boxShadow: `0 0 28px ${T.primaryFaint}`,
        backgroundImage: 'url(/airo-assets/images/logo/horizontal)',
        backgroundSize: 'cover',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat',
      }} />
      <h2 style={{ color: T.text, fontSize: 22, fontWeight: 700, marginBottom: 4, textAlign: 'center' }}>
        {mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب'}
      </h2>
      <p style={{ color: T.primaryDim, fontSize: 13, marginBottom: 24, textAlign: 'center' }}>
        {mode === 'login' ? 'أهلاً بعودتك إلى Stooorna' : 'انضم إلى Stooorna الآن'}
      </p>
      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {mode === 'register' && (
          <div style={{ position: 'relative' }}>
            <User size={16} color={T.primaryDim} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input type="text" placeholder="الاسم" value={name} onChange={e => setName(e.target.value)} required
              style={{ width: '100%', background: T.surface, border: `1px solid ${T.surfaceBorder}`, borderRadius: 12, padding: '12px 14px 12px 40px', color: T.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
        )}
        <div style={{ position: 'relative' }}>
          <Mail size={16} color={T.primaryDim} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input type="email" placeholder="البريد الإلكتروني" value={email} onChange={e => setEmail(e.target.value)} required
            style={{ width: '100%', background: T.surface, border: `1px solid ${T.surfaceBorder}`, borderRadius: 12, padding: '12px 14px 12px 40px', color: T.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ position: 'relative' }}>
          <Lock size={16} color={T.primaryDim} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input type={showPw ? 'text' : 'password'} placeholder="كلمة المرور" value={password} onChange={e => setPassword(e.target.value)} required
            style={{ width: '100%', background: T.surface, border: `1px solid ${T.surfaceBorder}`, borderRadius: 12, padding: '12px 44px 12px 40px', color: T.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: T.primaryDim }}>
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {mode === 'register' && (
          <div style={{ position: 'relative' }}>
            <ShieldCheck size={16} color={T.primaryDim} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input type={showConfirmPw ? 'text' : 'password'} placeholder="تأكيد كلمة المرور" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required
              style={{ width: '100%', background: T.surface, border: `1px solid ${confirmPassword && confirmPassword !== password ? 'hsl(var(--destructive))' : T.surfaceBorder}`, borderRadius: 12, padding: '12px 44px 12px 40px', color: T.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
            <button type="button" onClick={() => setShowConfirmPw(v => !v)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: T.primaryDim }}>
              {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            {confirmPassword && confirmPassword === password && (
              <Check size={14} color="hsl(var(--primary))" style={{ position: 'absolute', right: 40, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            )}
          </div>
        )}
        {error && (
          <div style={{ background: 'hsl(var(--destructive)/0.15)', border: '1px solid hsl(var(--destructive)/0.4)', borderRadius: 10, padding: '10px 14px', color: 'hsl(var(--destructive))', fontSize: 13, textAlign: 'center' }}>
            {error}
          </div>
        )}
        <button type="submit" disabled={loading}
          style={{ background: loading ? T.primaryFaint : T.primary, color: btnFg, border: 'none', borderRadius: 12, padding: '13px', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', marginTop: 4, transition: 'opacity 0.2s' }}>
          {loading ? '...' : mode === 'login' ? 'دخول' : 'إنشاء الحساب'}
        </button>
      </form>
      <div style={{ marginTop: 20, display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ color: T.primaryDim, fontSize: 13 }}>
          {mode === 'login' ? 'ليس لديك حساب؟' : 'لديك حساب بالفعل؟'}
        </span>
        <button onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setError(''); setConfirmPassword(''); }}
          style={{ background: 'none', border: 'none', color: T.primary, fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
          {mode === 'login' ? 'إنشاء حساب' : 'تسجيل الدخول'}
        </button>
      </div>
    </div>
  );
}

// ─── Music search modal (iTunes free previews) — opened from profile Music button ──
interface SettingsMusicTrack {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  previewUrl: string;
}
function SettingsMusicSearchModal({
  onClose,
  currentTrack,
  isPlaying,
  onPlayTrack,
  favorites,
  onToggleFavorite,
}: {
  onClose: () => void;
  currentTrack: SettingsMusicTrack | null;
  isPlaying: boolean;
  onPlayTrack: (track: SettingsMusicTrack) => void;
  favorites: SettingsMusicTrack[];
  onToggleFavorite: (track: SettingsMusicTrack) => void;
}) {
  const [tabKey, setTabKey] = useState<'search' | 'favorites'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SettingsMusicTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runSearch = useCallback((term: string) => {
    if (!term.trim()) { setResults([]); setError(null); setSearching(false); return; }
    setSearching(true);
    setError(null);
    fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=25`)
      .then(res => res.json())
      .then((data: { results?: Array<{ trackId: number; trackName: string; artistName: string; artworkUrl100?: string; previewUrl?: string }> }) => {
        setResults((data.results ?? [])
          .filter(r => !!r.previewUrl)
          .map(r => ({
            id: String(r.trackId),
            title: r.trackName,
            artist: r.artistName,
            artwork: r.artworkUrl100 ?? '',
            previewUrl: r.previewUrl as string,
          })));
      })
      .catch(() => setError('تعذر البحث، تحقق من الاتصال بالإنترنت'))
      .finally(() => setSearching(false));
  }, []);
  function onQueryChange(v: string) {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(v), 450);
  }
  const isFav = (id: string) => favorites.some(f => f.id === id);
  const list = tabKey === 'search' ? results : favorites;
  return createPortal(
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2147483000,
        background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 18, overflow: 'hidden',
      }}
    >
      <motion.div
        role="presentation"
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
        style={{
          width: '100%', maxWidth: 380, maxHeight: '78vh',
          display: 'flex', flexDirection: 'column',
          background: 'rgba(12,10,8,0.97)',
          border: '1px solid rgba(0,188,212,0.28)',
          borderRadius: 20,
          boxShadow: '0 12px 50px rgba(0,0,0,0.55), 0 0 30px rgba(0,188,212,0.1)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Music size={16} color="#00BCD4" />
              الموسيقى
            </span>
            <button
              type="button"
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
              value={query}
              onChange={e => onQueryChange(e.target.value)}
              placeholder="ابحث عن أغنية أو فنان..."
              style={{
                width: '100%', padding: '9px 36px 9px 12px', borderRadius: 12,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff', fontSize: '0.78rem', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', padding: '8px 14px 0' }}>
          {(['search', 'favorites'] as const).map(k => (
            <button
              key={k}
              type="button"
              onClick={() => setTabKey(k)}
              style={{
                flex: 1, padding: '8px 0', textAlign: 'center', background: 'transparent', border: 'none', cursor: 'pointer',
                color: tabKey === k ? '#00BCD4' : 'rgba(255,255,255,0.4)',
                fontSize: '0.72rem', fontWeight: 700,
                borderBottom: tabKey === k ? '2px solid #00BCD4' : '2px solid transparent',
              }}
            >
              {k === 'search' ? 'بحث' : `المفضلة${favorites.length ? ` (${favorites.length})` : ''}`}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px 14px' }}>
          {tabKey === 'search' && searching && (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', textAlign: 'center', padding: '20px 0' }}>جاري البحث...</p>
          )}
          {tabKey === 'search' && !searching && error && (
            <p style={{ color: 'rgba(239,68,68,0.8)', fontSize: '0.72rem', textAlign: 'center', padding: '20px 0' }}>{error}</p>
          )}
          {tabKey === 'search' && !searching && !error && query.trim() && list.length === 0 && (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', textAlign: 'center', padding: '20px 0' }}>لا توجد نتائج</p>
          )}
          {tabKey === 'search' && !query.trim() && (
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem', textAlign: 'center', padding: '20px 0' }}>اكتب اسم أغنية أو فنان للبحث</p>
          )}
          {tabKey === 'favorites' && favorites.length === 0 && (
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem', textAlign: 'center', padding: '20px 0' }}>لا توجد أغاني في المفضلة بعد</p>
          )}
          {list.map(track => {
            const active = currentTrack?.id === track.id;
            return (
              <div
                key={track.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderRadius: 12,
                  background: active ? 'rgba(0,188,212,0.1)' : 'transparent', marginBottom: 4,
                }}
              >
                {track.artwork ? (
                  <img src={track.artwork} alt="" width={40} height={40} style={{ borderRadius: 8, flexShrink: 0, objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: active ? '#00BCD4' : '#fff', fontSize: '0.74rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.title}</div>
                  <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.64rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.artist}</div>
                </div>
                <button type="button" onClick={() => onToggleFavorite(track)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
                  <Heart size={16} color={isFav(track.id) ? '#ef4444' : 'rgba(255,255,255,0.35)'} fill={isFav(track.id) ? '#ef4444' : 'none'} />
                </button>
                <button
                  type="button"
                  onClick={() => onPlayTrack(track)}
                  style={{
                    background: active && isPlaying ? 'rgba(0,188,212,0.22)' : 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(0,188,212,0.3)', borderRadius: 999, width: 30, height: 30,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
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
    document.body,
  );
}

// ─── Main settings page ───────────────────────────────────────────────────────

// ─── App short links (stooorna.com) — for text posts: paste any URL → short app link ──
const SHORT_LINKS_KEY = 'stooorna_short_links';
type ShortLinkEntry = { code: string; url: string; createdAt: number; shortUrl: string };

function loadShortLinks(): ShortLinkEntry[] {
  try {
    return JSON.parse(localStorage.getItem(SHORT_LINKS_KEY) || '[]') as ShortLinkEntry[];
  } catch {
    return [];
  }
}

function saveShortLink(entry: ShortLinkEntry) {
  try {
    const prev = loadShortLinks().filter(e => e.code !== entry.code);
    localStorage.setItem(SHORT_LINKS_KEY, JSON.stringify([entry, ...prev].slice(0, 100)));
  } catch { /* ignore */ }
}

function makeShortCode(len = 7): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  const arr = new Uint8Array(len);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(arr);
  else for (let i = 0; i < len; i++) arr[i] = Math.floor(Math.random() * 256);
  for (let i = 0; i < len; i++) out += alphabet[arr[i] % alphabet.length];
  return out;
}

function normalizeExternalUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`;
    const u = new URL(withProto);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const {
    user,
    isPending
  } = useSession();
  const [tab, setTab] = useState<Tab>('account');
  const [showSupportChat, setShowSupportChat] = useState(false);

  // ── Music player (profile button) ──
  const [musicModalOpen, setMusicModalOpen] = useState(false);
  const [musicCurrentTrack, setMusicCurrentTrack] = useState<SettingsMusicTrack | null>(null);
  const [musicIsPlaying, setMusicIsPlaying] = useState(false);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const [musicFavorites, setMusicFavorites] = useState<SettingsMusicTrack[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem('stooorna_music_favorites');
      return raw ? (JSON.parse(raw) as SettingsMusicTrack[]) : [];
    } catch { return []; }
  });
  const handleMusicPlayTrack = useCallback((track: SettingsMusicTrack) => {
    if (!musicAudioRef.current) {
      musicAudioRef.current = new Audio();
      musicAudioRef.current.onended = () => setMusicIsPlaying(false);
      musicAudioRef.current.onpause = () => setMusicIsPlaying(false);
      musicAudioRef.current.onplay = () => setMusicIsPlaying(true);
    }
    const a = musicAudioRef.current;
    if (musicCurrentTrack?.id === track.id) {
      if (a.paused) void a.play(); else a.pause();
      return;
    }
    setMusicCurrentTrack(track);
    a.src = track.previewUrl;
    void a.play();
  }, [musicCurrentTrack?.id]);
  const handleMusicToggleFavorite = useCallback((track: SettingsMusicTrack) => {
    setMusicFavorites(prev => {
      const exists = prev.some(f => f.id === track.id);
      const next = exists ? prev.filter(f => f.id !== track.id) : [track, ...prev];
      try { window.localStorage.setItem('stooorna_music_favorites', JSON.stringify(next)); } catch { /* */ }
      return next;
    });
  }, []);

  // ── Short link builder (Settings → text posts) ──
  const [shortLinkInput, setShortLinkInput] = useState('');
  const [shortLinkResult, setShortLinkResult] = useState('');
  const [shortLinkBusy, setShortLinkBusy] = useState(false);
  const [shortLinkError, setShortLinkError] = useState('');
  const [shortLinkCopied, setShortLinkCopied] = useState(false);
  const [shortLinkHistory, setShortLinkHistory] = useState<ShortLinkEntry[]>(() =>
    typeof window !== 'undefined' ? loadShortLinks() : []
  );

  async function pasteIntoShortLink() {
    setShortLinkError('');
    try {
      const text = await navigator.clipboard.readText();
      if (!text?.trim()) {
        setShortLinkError('الحافظة فارغة');
        return;
      }
      setShortLinkInput(text.trim());
    } catch {
      setShortLinkError('تعذر القراءة من الحافظة — الصق يدويًا');
    }
  }

  async function createAppShortLink() {
    setShortLinkError('');
    setShortLinkCopied(false);
    const normalized = normalizeExternalUrl(shortLinkInput);
    if (!normalized) {
      setShortLinkError('أدخل رابطًا صحيحًا (مثال: https://...)');
      return;
    }
    setShortLinkBusy(true);
    try {
      let code: string | null = null;
      let shortUrl: string | null = null;
      // محاولة السيرفر أولًا (إن وُجد endpoint)
      try {
        const r = await fetch('/api/short-links', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: normalized }),
        });
        if (r.ok) {
          const d = await r.json() as { code?: string; shortUrl?: string; url?: string; id?: string };
          code = d.code || d.id || null;
          shortUrl = d.shortUrl || d.url || (code ? `https://stooorna.com/s/${code}` : null);
        }
      } catch { /* fallback محلي */ }

      if (!code || !shortUrl) {
        code = makeShortCode(7);
        shortUrl = `https://stooorna.com/s/${code}`;
      }

      const entry: ShortLinkEntry = {
        code,
        url: normalized,
        createdAt: Date.now(),
        shortUrl,
      };
      saveShortLink(entry);
      setShortLinkHistory(loadShortLinks());
      setShortLinkResult(shortUrl);
    } finally {
      setShortLinkBusy(false);
    }
  }

  async function copyAppShortLink() {
    const value = shortLinkResult.trim();
    if (!value) {
      setShortLinkError('أنشئ الرابط أولًا');
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setShortLinkCopied(true);
      setTimeout(() => setShortLinkCopied(false), 1800);
    } catch {
      setShortLinkError('تعذر النسخ — انسخ يدويًا');
    }
  }

  // Profile username — must be declared before support-owner checks / effects
  const [profileUsername, setProfileUsername] = useState<string>((user as {
    username?: string | null;
  })?.username ?? '');

  // Owner (@Stooorna) support inbox — open thread with a user
  type SupportPeer = {
    id: string;
    name: string | null;
    username: string | null;
    avatarUrl: string | null;
    online?: boolean;
    lastIp?: string | null;
    country?: string | null;
    unread?: number;
    lastMessage?: string | null;
    lastAt?: string | null;
  };
  const [ownerChatUser, setOwnerChatUser] = useState<SupportPeer | null>(null);
  const [showOwnerInbox, setShowOwnerInbox] = useState(false);
  const [supportInbox, setSupportInbox] = useState<SupportPeer[]>([]);
  const [supportInboxLoading, setSupportInboxLoading] = useState(false);
  const [supportUnreadTotal, setSupportUnreadTotal] = useState(0);

  // Support desk — full user control panel (list + detail box)
  type SupportCtrlUser = {
    id: string;
    name: string | null;
    username: string | null;
    email: string;
    isBanned: boolean | null;
    lastIp: string | null;
    country?: string | null;
    phone?: string | null;
    nameColor?: string | null;
    isRoomAdmin?: boolean | null;
    createdAt: string | null;
    online?: boolean;
    avatarUrl?: string | null;
    isCompany?: boolean | null;
  };
  const [showSupportUsers, setShowSupportUsers] = useState(false);
  const [supportCtrlUser, setSupportCtrlUser] = useState<SupportCtrlUser | null>(null);
  const [scEditBox, setScEditBox] = useState<'color' | 'username' | 'password' | null>(null);
  const [scUsername, setScUsername] = useState('');
  const [scPassword, setScPassword] = useState('');
  const [scColor, setScColor] = useState('#00BCD4');
  const [scMsg, setScMsg] = useState('');
  const [scSaving, setScSaving] = useState(false);
  const [supportUsersSearch, setSupportUsersSearch] = useState('');

  // Hide global app bottom tabs while any support chat / inbox overlay is open
  useEffect(() => {
    const hidden = !!(showSupportChat || ownerChatUser || showOwnerInbox || showSupportUsers || supportCtrlUser);
    try {
      document.body.classList.toggle('stooorna-support-chat-open', hidden);
      window.dispatchEvent(new CustomEvent('stooorna:bottom-nav', { detail: { hidden } }));
    } catch { /* ignore */ }
    return () => {
      try {
        document.body.classList.remove('stooorna-support-chat-open');
        window.dispatchEvent(new CustomEvent('stooorna:bottom-nav', { detail: { hidden: false } }));
      } catch { /* ignore */ }
    };
  }, [showSupportChat, ownerChatUser, showOwnerInbox, showSupportUsers, supportCtrlUser]);

  async function patchSupportUser(userId: string, body: Record<string, unknown>) {
    // Prefer owner admin route; fallback to support-specific if added later
    const urls = [`/api/owner/users/${userId}`, `/api/support/users/${userId}`];
    for (const url of urls) {
      try {
        const r = await fetch(url, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (r.ok) return await r.json().catch(() => ({ ok: true }));
      } catch { /* next */ }
    }
    return null;
  }

  async function loadSupportInbox() {
    if (!isSupportOwnerAccount(user as { email?: string | null; username?: string | null }, profileUsername)) return;
    setSupportInboxLoading(true);
    try {
      let list: SupportPeer[] = [];

      // 1) Dedicated inbox if backend adds it
      try {
        const r = await fetch('/api/support/inbox', { credentials: 'include' });
        if (r.ok) {
          const d = await r.json();
          list = Array.isArray(d) ? d : (d.conversations || d.inbox || []);
        }
      } catch { /* */ }

      // 2) Real conversations / messages list
      if (!list.length) {
        for (const url of ['/api/messages', '/api/messages?inbox=1', '/api/conversations', '/api/chats']) {
          try {
            const r = await fetch(url, { credentials: 'include' });
            if (!r.ok) continue;
            const d = await r.json();
            const raw = Array.isArray(d) ? d : (d.conversations || d.messages || d.items || []);
            if (!raw.length) continue;
            list = raw.map((x: any) => ({
              id: String(x.userId || x.peerId || x.fromUserId || x.id || x._id),
              name: x.name || x.fromName || x.user?.name || null,
              username: x.username || x.fromUsername || x.user?.username || null,
              avatarUrl: x.avatarUrl || x.user?.avatarUrl || null,
              online: !!(x.online ?? x.user?.online),
              lastIp: x.lastIp || null,
              country: x.country || null,
              unread: Number(x.unread || x.unreadCount || 0),
              lastMessage: x.lastMessage || x.text || x.content || null,
              lastAt: x.lastAt || x.updatedAt || x.createdAt || null,
            }));
            break;
          } catch { /* next */ }
        }
      }

      // 3) Local tickets queue (same browser) — always merge so nothing is lost
      const localTickets = readLocalSupportTickets();
      const deletedIds = getDeletedThreadIds();
      if (localTickets.length) {
        const byUser = new Map<string, SupportPeer>();
        for (const p of list) byUser.set(p.id, p);
        for (const t of localTickets) {
          const key = t.fromUserId || t.fromUsername || t.id;
          if (!key) continue;
          if (deletedIds.has(key)) continue; // skip deleted threads
          const existing = byUser.get(key);
          if (existing) {
            existing.lastMessage = t.text || existing.lastMessage;
            existing.unread = (existing.unread || 0) + (t.unread || 1);
            existing.lastAt = t.at || existing.lastAt;
          } else {
            byUser.set(key, {
              id: key,
              name: t.fromName || null,
              username: t.fromUsername || null,
              avatarUrl: null,
              online: false,
              unread: t.unread || 1,
              lastMessage: t.text,
              lastAt: t.at,
            });
          }
        }
        list = Array.from(byUser.values());
      }

      setSupportInbox(list.filter(p => !getDeletedThreadIds().has(p.id)));
      setSupportUnreadTotal(list.reduce((s, x) => s + (x.unread || 0), 0));
    } catch { /* silent */ } finally {
      setSupportInboxLoading(false);
    }
  }

  useEffect(() => {
    if (!user || !isSupportOwnerAccount(user as { email?: string | null; username?: string | null }, profileUsername)) return;
    loadSupportInbox();
    const id = setInterval(loadSupportInbox, 8000);
    const onTicket = () => { loadSupportInbox(); };
    window.addEventListener('stooorna:support-ticket', onTicket);
    window.addEventListener('storage', onTicket);
    return () => {
      clearInterval(id);
      window.removeEventListener('stooorna:support-ticket', onTicket);
      window.removeEventListener('storage', onTicket);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profileUsername]);



  // Load recordings when tab changes
  useEffect(() => {
    if (user && tab === 'live') {
      loadRecordings();
      loadLiveRecs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tab]);

  // Username edit state (for logged-in users)
  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [usernameLoading, setUsernameLoading] = useState(false);
  const [usernameMsg, setUsernameMsg] = useState('');

  // Avatar upload state
  const [avatarUrl, setAvatarUrl] = useState<string | null>((user as {
    avatarUrl?: string | null;
    image?: string | null;
  })?.avatarUrl ?? (user as {
    image?: string | null;
  })?.image ?? null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Cover photo state
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Bio state
  const [bio, setBio] = useState('');
  const [editingBio, setEditingBio] = useState(false);
  const [bioInput, setBioInput] = useState('');
  const [bioLoading, setBioLoading] = useState(false);
  const [bioMsg, setBioMsg] = useState('');

  // Display name (nickname) edit state
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameLoading, setNameLoading] = useState(false);
  const [nameMsg, setNameMsg] = useState('');
  const [displayNameState, setDisplayNameState] = useState<string>(user?.name ?? '');

  // Change email state
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailMsg, setEmailMsg] = useState('');
  const [showEmailPw, setShowEmailPw] = useState(false);

  // Change password state
  const [editingPassword, setEditingPassword] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmNewPw, setConfirmNewPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  // Phone state
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneMsg, setPhoneMsg] = useState('');
  const [profilePhone, setProfilePhone] = useState('');

  // Share / QR state
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

  // Sync avatarUrl + profileUsername when user object changes — always fetch fresh from DB
  useEffect(() => {
    if (!user) return;
    fetch('/api/users/me').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.avatarUrl) setAvatarUrl(d.avatarUrl);
      if (d?.username) setProfileUsername(d.username);
      if (d?.phoneNumber) setProfilePhone(d.phoneNumber);
      if (d?.coverUrl) setCoverUrl(d.coverUrl);
      if (d?.name) setDisplayNameState(d.name);
    });
  }, [user]);

  // Load bio when user is available
  useEffect(() => {
    if (!user) return;
    fetch('/api/users/me/bio').then(r => r.ok ? r.json() : null).then(d => {
      if (d) setBio(d.bio ?? '');
    });
  }, [user]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [recLoading, setRecLoading] = useState(false);

  // Live recordings (past broadcasts saved as MP4)
  interface LiveRec {
    id: number;
    title: string | null;
    startedAt: string;
    endedAt: string | null;
    videoUrl: string | null;
    duration: number | null;
    fileSize: number | null;
  }
  const [liveRecs, setLiveRecs] = useState<LiveRec[]>([]);
  const [liveRecsLoading, setLiveRecsLoading] = useState(false);
  const [liveRecDeleting, setLiveRecDeleting] = useState<number | null>(null); // id being deleted
  const [liveRecDeleteConfirm, setLiveRecDeleteConfirm] = useState<number | null>(null); // confirm dialog
  const [liveRecShareId, setLiveRecShareId] = useState<number | null>(null); // share sheet open
  const [liveRecShareCopied, setLiveRecShareCopied] = useState(false);

  // Owner: all users + highlights
  const isOwner = isPrivilegedUser(user as { email?: string | null; username?: string | null; name?: string | null } | null);

  // Load owner data (users list) when logged in as owner
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (user && isOwner) loadOwnerData(); }, [user, isOwner]);
  type OwnerUserRow = {
    id: string;
    name: string | null;
    username: string | null;
    email: string;
    isBanned: boolean | null;
    lastIp: string | null;
    isRoomAdmin: boolean | null;
    createdAt: string | null;
    nameColor?: string | null;
    country?: string | null;
    phone?: string | null;
    avatarUrl?: string | null;
    isCompany?: boolean | null;
  };
  const [allUsers, setAllUsers] = useState<OwnerUserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  // Presence for owner users list
  const ownerUserIds = useMemo(() => allUsers.map(u => u.id), [allUsers]);
  const ownerPresence = usePresenceQuery(isOwner ? ownerUserIds : []);

  // ── User Control tabs: Users / Company / Ban ──
  type UserControlTab = 'users' | 'company' | 'ban';
  const [ucTab, setUcTab] = useState<UserControlTab>('users');

  // Company accounts and regular user accounts both come from the same
  // /api/owner/users list (a company account is just a user record with
  // isCompany = true). Split them client-side instead of calling a
  // separate /api/owner/companies endpoint, which the backend does not
  // expose yet (was returning 404).
  const companyAccounts = useMemo(() => allUsers.filter(u => !!u.isCompany), [allUsers]);
  const regularAccounts = useMemo(() => allUsers.filter(u => !u.isCompany), [allUsers]);

  // Ban history — kept in localStorage so a user who gets unbanned still
  // shows up under the Ban tab (with a Delete account option) until the
  // owner explicitly removes their account, instead of just disappearing.
  const BAN_HISTORY_KEY = 'stooorna_uc_ban_history';
  function readBanHistory(): string[] {
    try {
      const raw = localStorage.getItem(BAN_HISTORY_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  }
  function addToBanHistory(userId: string) {
    try {
      const set = new Set(readBanHistory());
      set.add(userId);
      localStorage.setItem(BAN_HISTORY_KEY, JSON.stringify(Array.from(set)));
      setBanHistoryIds(Array.from(set));
    } catch { /* ignore */ }
  }
  function removeFromBanHistory(userId: string) {
    try {
      const set = new Set(readBanHistory());
      set.delete(userId);
      localStorage.setItem(BAN_HISTORY_KEY, JSON.stringify(Array.from(set)));
      setBanHistoryIds(Array.from(set));
    } catch { /* ignore */ }
  }
  const [banHistoryIds, setBanHistoryIds] = useState<string[]>(() => readBanHistory());
  const banTabAccounts = useMemo(() => {
    const historySet = new Set(banHistoryIds);
    return regularAccounts.filter(u => !!u.isBanned || historySet.has(u.id));
  }, [regularAccounts, banHistoryIds]);

  const [companySavingId, setCompanySavingId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  // Activate / deactivate a company account — reuses the same owner PATCH
  // route already used for user bans, so it works with the existing backend.
  async function setCompanyActive(companyId: string, active: boolean) {
    setCompanySavingId(companyId);
    const ok = await patchSupportUser(companyId, { isBanned: !active, banned: !active });
    if (ok) {
      setAllUsers(prev => prev.map(u => u.id === companyId ? { ...u, isBanned: !active } : u));
    }
    setCompanySavingId(null);
    return ok;
  }

  // Permanently remove an account from the app (used mainly for users who
  // were unbanned but the owner still wants their account gone).
  async function deleteOwnerAccount(userId: string) {
    setDeletingUserId(userId);
    try {
      const res = await fetch(`/api/owner/users/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setAllUsers(prev => prev.filter(u => u.id !== userId));
        removeFromBanHistory(userId);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      setDeletingUserId(null);
    }
  }

  async function loadRecordings() {
    setRecLoading(true);
    try {
      const res = await fetch('/api/recordings', {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setRecordings(data);
      }
    } catch {
      // silent
    } finally {
      setRecLoading(false);
    }
  }
  async function loadLiveRecs() {
    setLiveRecsLoading(true);
    try {
      const res = await fetch('/api/live/recordings', {
        credentials: 'include'
      });
      if (res.ok) setLiveRecs(await res.json());
    } catch {/* silent */} finally {
      setLiveRecsLoading(false);
    }
  }
  async function deleteLiveRec(id: number) {
    setLiveRecDeleting(id);
    try {
      const res = await fetch(`/api/live/recordings/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) setLiveRecs(prev => prev.filter(r => r.id !== id));
    } catch {/* silent */} finally {
      setLiveRecDeleting(null);
      setLiveRecDeleteConfirm(null);
    }
  }
  function shareLiveRec(rec: LiveRec) {
    setLiveRecShareId(rec.id);
    setLiveRecShareCopied(false);
  }
  function copyLiveRecLink(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setLiveRecShareCopied(true);
      setTimeout(() => setLiveRecShareCopied(false), 2000);
    }).catch(() => {});
  }
  async function loadOwnerData() {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const usersRes = await fetch('/api/owner/users', { credentials: 'include' });
      if (usersRes.ok) {
        const data = await usersRes.json();
        // Normalise: handle both array and {rows:[]} shapes
        const rows = Array.isArray(data) ? data : (data?.rows ?? []);
        setAllUsers(rows);
      } else {
        const errText = await usersRes.text().catch(() => String(usersRes.status));
        setUsersError(`خطأ ${usersRes.status}: ${errText}`);
        console.error('[loadOwnerData] status', usersRes.status, errText);
      }
    } catch (e) {
      setUsersError(`خطأ في الشبكة: ${String(e)}`);
      console.error('[loadOwnerData] error', e);
    } finally {
      setUsersLoading(false);
    }
  }
  async function saveEmail() {
    setEmailLoading(true);
    setEmailMsg('');
    try {
      const r = await fetch('/api/users/me/email', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          newEmail,
          currentPassword: emailPassword
        })
      });
      const d = await r.json();
      if (r.ok) {
        setEmailMsg('Email updated!');
        setEditingEmail(false);
        setEmailPassword('');
        setNewEmail('');
      } else setEmailMsg(d.error || 'Failed');
    } catch {
      setEmailMsg('Network error');
    } finally {
      setEmailLoading(false);
    }
  }
  async function savePassword() {
    setPwLoading(true);
    setPwMsg('');
    if (newPw !== confirmNewPw) {
      setPwMsg('New passwords do not match');
      setPwLoading(false);
      return;
    }
    if (newPw.length < 8) {
      setPwMsg('Password must be at least 8 characters');
      setPwLoading(false);
      return;
    }
    try {
      const r = await fetch('/api/users/me/password', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentPassword: currentPw,
          newPassword: newPw
        })
      });
      const d = await r.json();
      if (r.ok) {
        setPwMsg('Password changed!');
        setEditingPassword(false);
        setCurrentPw('');
        setNewPw('');
        setConfirmNewPw('');
      } else setPwMsg(d.error || 'Failed');
    } catch {
      setPwMsg('Network error');
    } finally {
      setPwLoading(false);
    }
  }
  async function savePhone() {
    setPhoneLoading(true);
    setPhoneMsg('');
    try {
      const r = await fetch('/api/users/me/phone', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phone: phoneInput
        })
      });
      const d = await r.json();
      if (r.ok) {
        setPhoneMsg('Saved!');
        setEditingPhone(false);
        setProfilePhone(d.phone ?? '');
      } else setPhoneMsg(d.error || 'Failed');
    } catch {
      setPhoneMsg('Network error');
    } finally {
      setPhoneLoading(false);
    }
  }
  async function saveBio() {
    setBioLoading(true);
    setBioMsg('');
    try {
      const r = await fetch('/api/users/me/bio', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          bio: bioInput
        })
      });
      const d = await r.json();
      if (r.ok) {
        setBio(d.bio);
        setEditingBio(false);
      } else setBioMsg(d.error || 'Failed');
    } catch {
      setBioMsg('Error saving');
    } finally {
      setBioLoading(false);
    }
  }
  async function saveName() {
    setNameLoading(true);
    setNameMsg('');
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setNameMsg('Name cannot be empty');
      setNameLoading(false);
      return;
    }
    if (trimmed.length > 60) {
      setNameMsg('Max 60 characters');
      setNameLoading(false);
      return;
    }
    try {
      const r = await fetch('/api/users/me/name', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          name: trimmed
        })
      });
      const d = await r.json();
      if (r.ok) {
        setDisplayNameState(d.name);
        setEditingName(false);
        setNameMsg('');
      } else {
        setNameMsg(d.error || 'Failed to update name');
      }
    } catch {
      setNameMsg('Error saving');
    } finally {
      setNameLoading(false);
    }
  }
  function copyLink(profileUrl: string) {
    navigator.clipboard.writeText(profileUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  async function saveUsername() {
    setUsernameLoading(true);
    setUsernameMsg('');
    if (!/^[a-zA-Z0-9_]{2,30}$/.test(newUsername)) {
      setUsernameMsg('2–30 chars, letters/numbers/underscores only');
      setUsernameLoading(false);
      return;
    }
    // Check availability (skip if unchanged)
    if (newUsername !== (user as {
      username?: string;
    }).username) {
      try {
        const chk = await fetch(`/api/users/check-username?username=${encodeURIComponent(newUsername)}`);
        const d = await chk.json();
        if (!d.available) {
          setUsernameMsg('Username already taken — choose another');
          setUsernameLoading(false);
          return;
        }
      } catch {/* network error — proceed */}
    }
    try {
      const r = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: newUsername
        })
      });
      const d = await r.json();
      if (!r.ok) setUsernameMsg(d.error || 'Failed');else {
        setUsernameMsg('Saved!');
        setEditingUsername(false);
        setProfileUsername(newUsername);
      }
    } catch {
      setUsernameMsg('Error saving');
    } finally {
      setUsernameLoading(false);
    }
  }
  async function uploadAvatar(file: File) {
    setAvatarUploading(true);
    try {
      const r = await fetch('/api/users/me/avatar', {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'image/jpeg'
        },
        body: file
      });
      const d = await r.json();
      if (r.ok && d.avatarUrl) {
        const fresh = `${d.avatarUrl}?t=${Date.now()}`;
        setAvatarUrl(fresh);
        window.dispatchEvent(new CustomEvent('stooorna:avatar-updated', {
          detail: {
            avatarUrl: fresh
          }
        }));
      }
    } catch {/* silent */} finally {
      setAvatarUploading(false);
    }
  }
  async function uploadCover(file: File) {
    setCoverUploading(true);
    try {
      const r = await fetch('/api/users/me/cover', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': file.type || 'image/jpeg'
        },
        body: file
      });
      const d = await r.json();
      if (r.ok && d.coverUrl) {
        setCoverUrl(`${d.coverUrl}?t=${Date.now()}`);
      }
    } catch {/* silent */} finally {
      setCoverUploading(false);
    }
  }
  async function handleLogout() {
    await signOut();
  }
  function handleDelete(id: number) {
    fetch(`/api/recordings/${id}`, {
      method: 'DELETE'
    }).catch(() => {});
    setRecordings(prev => prev.filter(r => r.id !== id));
  }
  return <>
      <Helmet>
        <title>Settings | Stooorna</title>
        <meta name="description" content="Manage your Stooorna account — update your profile, change your username, manage recordings, and configure your app." />
        <link rel="canonical" href="https://stooorna.com/settings" />
        <meta property="og:title" content="Settings | Stooorna" />
        <meta property="og:description" content="Manage your Stooorna account — profile, username, recordings, and app settings." />
        <meta property="og:image" content="https://stooorna.com/og-image.svg" />
        <meta property="og:url" content="https://stooorna.com/settings" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://stooorna.com/og-image.svg" />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="relative flex flex-col overflow-hidden select-none min-h-0" style={{
      height: '100dvh',
      minHeight: '100dvh',
      background: T.bg,
      fontFamily: 'var(--font-sans)'
    }}>
        <h1 className="sr-only">Settings</h1>

        {/* Background glow */}
        <motion.div className="pointer-events-none absolute" style={{
        width: 400,
        height: 400,
        borderRadius: '50%',
        background: `radial-gradient(circle, rgba(0,188,212,0.1) 0%, transparent 70%)`,
        top: '20%',
        left: '50%',
        transform: 'translate(-50%, -50%)'
      }} animate={{
        opacity: [0.4, 0.7, 0.4]
      }} transition={{
        duration: 4,
        repeat: Infinity,
        ease: 'easeInOut'
      }} />

        {/* Header — Settings title + Support icon on the far right */}
        <div className="flex items-center justify-between px-5 pt-10 pb-4 z-10" style={{
        borderBottom: `1px solid ${T.navBorder}`
      }}>
          <div style={{ width: 36 }} />
          <p style={{
          letterSpacing: '0.3em',
          fontSize: '0.7rem',
          color: T.primaryDim,
          fontWeight: 600,
          textTransform: 'uppercase',
          margin: 0
        }}>
            Settings
          </p>
          {/*
            أيقونة الدعم فوق:
            - مستخدم عادي مسجّل → تظهر
            - حساب الدعم @Stooorna / Stooorna@mail.com فقط → تُخفى (له قسم تحت الأصدقاء)
            - غير مسجّل → تُخفى
          */}
          {shouldShowSupportHeaderIcon(
            user as { email?: string | null; username?: string | null; name?: string | null } | null,
            profileUsername,
          ) ? (
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={() => setShowSupportChat(true)}
              title="Support"
              aria-label="Support chat"
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,188,212,0.12)',
                border: '1px solid rgba(0,188,212,0.4)',
                color: '#00BCD4',
                cursor: 'pointer',
                boxShadow: '0 0 12px rgba(0,188,212,0.25)',
              }}
            >
              <Headphones size={18} strokeWidth={2.2} />
            </motion.button>
          ) : (
            <div style={{ width: 36 }} />
          )}
        </div>

        {/* Tabs — only when logged in */}
        {user && <div className="flex z-10 px-5 pt-4 gap-3">
            {(['account', 'live'] as Tab[]).map(t => <motion.button key={t} whileTap={{
          scale: 0.95
        }} onClick={() => setTab(t)} style={{
          flex: 1,
          padding: '8px 0',
          borderRadius: 8,
          border: `1px solid ${tab === t ? T.tabBorder : T.surfaceBorder}`,
          background: tab === t ? T.tabActive : 'transparent',
          color: tab === t ? T.primary : T.textMuted,
          fontSize: '0.72rem',
          fontWeight: 600,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          transition: 'all 0.2s'
        }}>
                {t === 'account' ? 'Profile' : 'Live'}
              </motion.button>)}
          </div>}

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain z-10 px-5 pt-6 pb-28" style={{
        WebkitOverflowScrolling: 'touch'
      }}>
          <AnimatePresence mode="wait">

            {/* ── LOADING ── */}
            {isPending && <motion.div key="loading" initial={{
            opacity: 0
          }} animate={{
            opacity: 1
          }} exit={{
            opacity: 0
          }} className="flex items-center justify-center pt-20">
                <motion.div animate={{
              rotate: 360
            }} transition={{
              duration: 1,
              repeat: Infinity,
              ease: 'linear'
            }} style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: `2px solid ${T.primaryBorder}`,
              borderTopColor: T.primary
            }} />
              </motion.div>}

            {/* ── NOT LOGGED IN ── */}
            {!isPending && !user && <motion.div key="auth" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
              <AuthScreen T={T} />
            </motion.div>}

            {/* ── LOGGED IN — ACCOUNT (MY PROFILE) TAB ── */}
            {!isPending && user && tab === 'account' && (() => {
            const displayName = displayNameState || user.name || profileUsername || 'User';
            const profileUrl = profileUsername ? `https://stooorna.com/u/${profileUsername}` : '';
            return <motion.div key="account" initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} className="flex flex-col gap-5">
                  {/* ── Hero: Cover + Avatar + Name ── */}
                  <div style={{
                borderRadius: 16,
                overflow: 'hidden',
                background: T.surface,
                border: `1px solid ${T.surfaceBorder}`,
                position: 'relative',
              }}>

                    {/* Cover photo strip */}
                    <div style={{
                  position: 'relative',
                  width: '100%',
                  height: 110,
                  background: coverUrl ? 'transparent' : T.primaryFaint,
                  cursor: 'pointer'
                }} onClick={() => coverInputRef.current?.click()}>
                      {coverUrl ? <img src={coverUrl} alt="cover" style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block'
                  }} /> : <div style={{
                    width: '100%',
                    height: '100%'
                  }} />}
                      {/* dark overlay on hover hint */}
                      <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(0,0,0,0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: coverUploading ? 1 : 0,
                    transition: 'opacity 0.2s',
                    pointerEvents: 'none'
                  }}>
                        {coverUploading && <motion.div animate={{
                      rotate: 360
                    }} transition={{
                      duration: 0.8,
                      repeat: Infinity,
                      ease: 'linear'
                    }} style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      border: `2px solid ${T.primary}`,
                      borderTopColor: 'transparent'
                    }} />}
                      </div>
                      {/* camera badge top-right */}
                      {!coverUploading && <div style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.55)',
                    border: `1.5px solid rgba(255,255,255,0.15)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none'
                  }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                            <circle cx="12" cy="13" r="4" />
                          </svg>
                        </div>}
                      <input ref={coverInputRef} type="file" accept="image/*" style={{
                    display: 'none'
                  }} onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) uploadCover(f);
                    e.target.value = '';
                  }} />
                    </div>

                    {/* Avatar overlapping the cover */}
                    <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  paddingBottom: 18,
                  marginTop: -40
                }}>
                      <div className="relative" style={{
                    flexShrink: 0
                  }}>
                        <motion.button whileTap={{
                      scale: 0.92
                    }} onClick={() => avatarInputRef.current?.click()} style={{
                      width: 80,
                      height: 80,
                      borderRadius: '50%',
                      overflow: 'hidden',
                      background: avatarUrl ? 'transparent' : T.primaryFaint,
                      border: isOwner ? '3px solid #2563eb' : `3px solid rgba(6,14,14,0.95)`,
                      boxShadow: isOwner ? '0 0 0 2px rgba(37,99,235,0.35), 0 0 18px rgba(37,99,235,0.45)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      position: 'relative'
                    }}>
                          {avatarUrl ? <img src={avatarUrl} alt="avatar" style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
                      }} onError={() => setAvatarUrl(null)} /> : <User size={30} style={{
                        color: T.primary
                      }} />}
                          <div style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '50%',
                        background: 'rgba(0,0,0,0.45)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: avatarUploading ? 1 : 0,
                        transition: 'opacity 0.2s'
                      }}>
                            {avatarUploading && <motion.div animate={{
                          rotate: 360
                        }} transition={{
                          duration: 0.8,
                          repeat: Infinity,
                          ease: 'linear'
                        }} style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          border: `2px solid ${T.primary}`,
                          borderTopColor: 'transparent'
                        }} />}
                          </div>
                        </motion.button>
                        {/* camera badge */}
                        <div style={{
                      position: 'absolute',
                      bottom: 2,
                      right: 2,
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: T.primary,
                      border: '2.5px solid rgba(6,14,14,0.95)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      pointerEvents: 'none'
                    }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                            <circle cx="12" cy="13" r="4" />
                          </svg>
                        </div>
                        {/* online dot */}
                        <span style={{
                      position: 'absolute',
                      top: 4,
                      right: 2,
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: '#22c55e',
                      border: '2.5px solid rgba(6,14,14,0.95)',
                      boxShadow: '0 0 8px rgba(34,197,94,0.8)',
                      zIndex: 2
                    }} />
                        <input ref={avatarInputRef} type="file" accept="image/*" style={{
                      display: 'none'
                    }} onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) uploadAvatar(f);
                      e.target.value = '';
                    }} />
                      </div>

                      {/* Name + username + online label */}
                      <div style={{
                    textAlign: 'center',
                    marginTop: 10
                  }}>
                        {/* OWNER badge */}
                        {isOwner && <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 5
                    }}>
                            <span style={{
                        fontSize: '0.6rem',
                        fontWeight: 800,
                        color: '#fff',
                        background: 'linear-gradient(135deg,#2563eb,#1d4ed8)',
                        borderRadius: 6,
                        padding: '2px 8px',
                        boxShadow: '0 0 10px rgba(37,99,235,0.6)',
                        letterSpacing: '0.08em'
                      }}>OWNER</span>
                          </div>}
                        <p style={{
                      color: isOwner ? '#2563eb' : T.text,
                      fontSize: '1.05rem',
                      fontWeight: 700,
                      lineHeight: 1.2,
                      textShadow: isOwner ? '0 0 12px rgba(37,99,235,0.6)' : 'none'
                    }}>{displayName}</p>
                        {profileUsername && <p style={{
                      color: isOwner ? '#2563eb' : T.primaryDim,
                      fontSize: '0.78rem',
                      marginTop: 3,
                      fontWeight: isOwner ? 700 : 400,
                      textShadow: isOwner ? '0 0 8px rgba(37,99,235,0.5)' : 'none'
                    }}>@{profileUsername}</p>}
                        <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 5,
                      marginTop: 7
                    }}>
                          <span style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: '#22c55e',
                        boxShadow: '0 0 6px rgba(34,197,94,0.8)',
                        display: 'inline-block'
                      }} />
                          <span style={{
                        color: '#22c55e',
                        fontSize: '0.68rem',
                        fontWeight: 600
                      }}>Online</span>
                        </div>
                      </div>

                      {/* زر الموسيقى — يمين البطاقة بجانب اليوزر (حجم أصغر) */}
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setMusicModalOpen(true)}
                        aria-label="الموسيقى"
                        title="الموسيقى"
                        style={{
                          position: 'absolute',
                          right: 14,
                          bottom: 18,
                          zIndex: 5,
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: musicIsPlaying ? 'rgba(0,188,212,0.22)' : 'rgba(0,188,212,0.1)',
                          border: `1px solid ${musicIsPlaying ? 'rgba(0,188,212,0.65)' : 'rgba(0,188,212,0.35)'}`,
                          color: '#00BCD4',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: musicIsPlaying
                            ? '0 0 10px rgba(0,188,212,0.4)'
                            : '0 1px 6px rgba(0,0,0,0.2)',
                        }}
                      >
                        <Music size={14} strokeWidth={2.2} />
                      </motion.button>
                    </div>
                  </div>

                  {/* ── شات الدعم + تحكم المستخدمين — فقط المالك والمشرفون ── */}
                  {isPrivilegedUser(
                    user as { email?: string | null; username?: string | null; name?: string | null },
                  ) && (
                    <>
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        type="button"
                        onClick={() => {
                          loadSupportInbox();
                          setShowOwnerInbox(true);
                        }}
                        className="flex items-center justify-between"
                        style={{
                          width: '100%',
                          background: T.surface,
                          border: `1px solid ${supportUnreadTotal > 0 ? T.primaryBorder : T.surfaceBorder}`,
                          borderRadius: 14,
                          padding: '14px 16px',
                          color: T.text,
                          cursor: 'pointer',
                        }}
                        aria-label="Support Chat"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex items-center justify-center" style={{
                            width: 38, height: 38, borderRadius: 12, background: T.primaryFaint,
                            border: `1px solid ${T.primaryBorder}`, color: T.primary, position: 'relative',
                          }}>
                            <MessageCircle size={19} strokeWidth={2.1} />
                            {supportUnreadTotal > 0 && (
                              <span style={{
                                position: 'absolute', top: -4, right: -4,
                                minWidth: 16, height: 16, borderRadius: 8, padding: '0 4px',
                                background: '#ef4444', color: '#fff', fontSize: '0.55rem', fontWeight: 800,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {supportUnreadTotal > 9 ? '9+' : supportUnreadTotal}
                              </span>
                            )}
                          </span>
                          <span style={{ textAlign: 'left' }}>
                            <span style={{ display: 'block', fontSize: '0.86rem', fontWeight: 700 }}>Support Chat</span>
                            <span style={{ display: 'block', marginTop: 2, color: T.textMuted, fontSize: '0.68rem' }}>
                              {supportUnreadTotal > 0
                                ? `${supportUnreadTotal} new message${supportUnreadTotal > 1 ? 's' : ''} from users`
                                : supportInbox.length > 0
                                  ? `${supportInbox.length} conversation${supportInbox.length > 1 ? 's' : ''} — tap to enter`
                                  : 'Click to enter even if there are no messages'}
                            </span>
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {supportUnreadTotal > 0 && (
                            <Bell size={15} style={{ color: '#eab308' }} />
                          )}
                          <span style={{ color: T.primary, fontSize: '1.25rem', lineHeight: 1 }}>‹</span>
                        </div>
                      </motion.button>

                      {/* تحكم المستخدمين — تحت شات الدعم */}
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        type="button"
                        onClick={() => {
                          setUcTab('users');
                          loadOwnerData();
                          setShowSupportUsers(true);
                        }}
                        className="flex items-center justify-between"
                        style={{
                          width: '100%',
                          background: T.surface,
                          border: `1px solid ${T.surfaceBorder}`,
                          borderRadius: 14,
                          padding: '14px 16px',
                          color: T.text,
                          cursor: 'pointer',
                        }}
                        aria-label="User Control"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex items-center justify-center" style={{
                            width: 38, height: 38, borderRadius: 12, background: 'rgba(239,68,68,0.1)',
                            border: '1px solid rgba(239,68,68,0.35)', color: '#ef4444',
                          }}>
                            <Users size={19} strokeWidth={2.1} />
                          </span>
                          <span style={{ textAlign: 'left' }}>
                            <span style={{ display: 'block', fontSize: '0.86rem', fontWeight: 700 }}>User Control</span>
                            <span style={{ display: 'block', marginTop: 2, color: T.textMuted, fontSize: '0.68rem' }}>
                              Username color · Edit username · Password · Ban
                            </span>
                          </span>
                        </div>
                        <span style={{ color: T.primary, fontSize: '1.25rem', lineHeight: 1 }}>‹</span>
                      </motion.button>

                      {/* Companies — activate / deactivate registered company accounts */}
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        type="button"
                        onClick={() => {
                          setUcTab('company');
                          loadOwnerData();
                          setShowSupportUsers(true);
                        }}
                        className="flex items-center justify-between"
                        style={{
                          width: '100%',
                          background: T.surface,
                          border: `1px solid ${T.surfaceBorder}`,
                          borderRadius: 14,
                          padding: '14px 16px',
                          color: T.text,
                          cursor: 'pointer',
                        }}
                        aria-label="Companies"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex items-center justify-center" style={{
                            width: 38, height: 38, borderRadius: 12, background: T.primaryFaint,
                            border: `1px solid ${T.primaryBorder}`, color: T.primary,
                          }}>
                            <Building2 size={19} strokeWidth={2.1} />
                          </span>
                          <span style={{ textAlign: 'left' }}>
                            <span style={{ display: 'block', fontSize: '0.86rem', fontWeight: 700 }}>Companies</span>
                            <span style={{ display: 'block', marginTop: 2, color: T.textMuted, fontSize: '0.68rem' }}>
                              Activate / deactivate registered company accounts
                            </span>
                          </span>
                        </div>
                        <span style={{ color: T.primary, fontSize: '1.25rem', lineHeight: 1 }}>‹</span>
                      </motion.button>
                    </>
                  )}

                  {/* ── Display Name ── */}
                  <div style={{
                background: T.surface,
                border: `1px solid ${T.surfaceBorder}`,
                borderRadius: 14,
                padding: '14px 16px'
              }}>
                    <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8
                }}>
                      <p style={{
                    color: T.textMuted,
                    fontSize: '0.62rem',
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    fontWeight: 500
                  }}>Display Name</p>
                      {!editingName && <motion.button whileTap={{
                    scale: 0.9
                  }} onClick={() => {
                    setEditingName(true);
                    setNameInput(displayName === 'User' ? '' : displayName);
                    setNameMsg('');
                  }} style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: T.primaryDim,
                    padding: 4
                  }}>
                          <Edit2 size={13} />
                        </motion.button>}
                    </div>
                    <AnimatePresence mode="wait">
                      {editingName ? <motion.div key="edit-name" initial={{
                    opacity: 0
                  }} animate={{
                    opacity: 1
                  }} exit={{
                    opacity: 0
                  }}>
                          <input type="text" value={nameInput} onChange={e => setNameInput(e.target.value.slice(0, 60))} placeholder="اكتب اسمك المستعار…" autoFocus style={{
                      width: '100%',
                      padding: '9px 11px',
                      background: T.inputBg,
                      border: `1px solid ${T.inputBorder}`,
                      borderRadius: 9,
                      color: T.text,
                      fontSize: '0.83rem',
                      outline: 'none',
                      fontFamily: 'var(--font-sans)'
                    }} onFocus={e => e.target.style.borderColor = T.inputFocus} onBlur={e => e.target.style.borderColor = T.inputBorder} onKeyDown={e => {
                      if (e.key === 'Enter') saveName();
                      if (e.key === 'Escape') {
                        setEditingName(false);
                        setNameMsg('');
                      }
                    }} />
                          <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: 7
                    }}>
                            <p style={{
                        color: T.textMuted,
                        fontSize: '0.62rem'
                      }}>{nameInput.length}/60</p>
                            <div style={{
                        display: 'flex',
                        gap: 7
                      }}>
                              <motion.button whileTap={{
                          scale: 0.9
                        }} onClick={() => {
                          setEditingName(false);
                          setNameMsg('');
                        }} style={{
                          padding: '5px 9px',
                          background: 'none',
                          border: `1px solid ${T.surfaceBorder}`,
                          borderRadius: 7,
                          color: T.textMuted,
                          cursor: 'pointer'
                        }}>
                                <X size={12} />
                              </motion.button>
                              <motion.button whileTap={{
                          scale: 0.9
                        }} onClick={saveName} disabled={nameLoading} style={{
                          padding: '5px 13px',
                          background: T.primaryFaint,
                          border: `1px solid ${T.primaryBorder}`,
                          borderRadius: 7,
                          color: T.primary,
                          fontSize: '0.73rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}>
                                {nameLoading ? '…' : <Check size={12} />}
                              </motion.button>
                            </div>
                          </div>
                          {nameMsg && <p style={{
                      color: '#ef4444',
                      fontSize: '0.68rem',
                      marginTop: 3
                    }}>{nameMsg}</p>}
                        </motion.div> : <motion.p key="view-name" initial={{
                    opacity: 0
                  }} animate={{
                    opacity: 1
                  }} exit={{
                    opacity: 0
                  }} style={{
                    color: T.text,
                    fontSize: '0.83rem',
                    lineHeight: 1.55
                  }}>
                          {displayName && displayName !== 'User' ? displayName : <span style={{
                      color: T.textMuted,
                      fontStyle: 'italic'
                    }}>لم يتم تعيين اسم — اضغط تعديل</span>}
                        </motion.p>}
                    </AnimatePresence>
                  </div>

                  {/* ── Bio ── */}
                  <div style={{
                background: T.surface,
                border: `1px solid ${T.surfaceBorder}`,
                borderRadius: 14,
                padding: '14px 16px'
              }}>
                    <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8
                }}>
                      <p style={{
                    color: T.textMuted,
                    fontSize: '0.62rem',
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    fontWeight: 500
                  }}>Bio</p>
                      {!editingBio && <motion.button whileTap={{
                    scale: 0.9
                  }} onClick={() => {
                    setEditingBio(true);
                    setBioInput(bio);
                    setBioMsg('');
                  }} style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: T.primaryDim,
                    padding: 4
                  }}>
                          <Edit2 size={13} />
                        </motion.button>}
                    </div>
                    <AnimatePresence mode="wait">
                      {editingBio ? <motion.div key="edit" initial={{
                    opacity: 0
                  }} animate={{
                    opacity: 1
                  }} exit={{
                    opacity: 0
                  }}>
                          <textarea value={bioInput} onChange={e => setBioInput(e.target.value.slice(0, 160))} rows={3} placeholder="Write something about yourself…" style={{
                      width: '100%',
                      resize: 'none',
                      padding: '9px 11px',
                      background: T.inputBg,
                      border: `1px solid ${T.inputBorder}`,
                      borderRadius: 9,
                      color: T.text,
                      fontSize: '0.83rem',
                      outline: 'none',
                      fontFamily: 'var(--font-sans)',
                      lineHeight: 1.5
                    }} onFocus={e => e.target.style.borderColor = T.inputFocus} onBlur={e => e.target.style.borderColor = T.inputBorder} />
                          <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: 7
                    }}>
                            <p style={{
                        color: T.textMuted,
                        fontSize: '0.62rem'
                      }}>{bioInput.length}/160</p>
                            <div style={{
                        display: 'flex',
                        gap: 7
                      }}>
                              <motion.button whileTap={{
                          scale: 0.9
                        }} onClick={() => {
                          setEditingBio(false);
                          setBioMsg('');
                        }} style={{
                          padding: '5px 9px',
                          background: 'none',
                          border: `1px solid ${T.surfaceBorder}`,
                          borderRadius: 7,
                          color: T.textMuted,
                          cursor: 'pointer'
                        }}>
                                <X size={12} />
                              </motion.button>
                              <motion.button whileTap={{
                          scale: 0.9
                        }} onClick={saveBio} disabled={bioLoading} style={{
                          padding: '5px 13px',
                          background: T.primaryFaint,
                          border: `1px solid ${T.primaryBorder}`,
                          borderRadius: 7,
                          color: T.primary,
                          fontSize: '0.73rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}>
                                {bioLoading ? '…' : <Check size={12} />}
                              </motion.button>
                            </div>
                          </div>
                          {bioMsg && <p style={{
                      color: '#ef4444',
                      fontSize: '0.68rem',
                      marginTop: 3
                    }}>{bioMsg}</p>}
                        </motion.div> : <motion.p key="view" initial={{
                    opacity: 0
                  }} animate={{
                    opacity: 1
                  }} exit={{
                    opacity: 0
                  }} style={{
                    color: bio ? T.text : T.textMuted,
                    fontSize: '0.83rem',
                    lineHeight: 1.55,
                    fontStyle: bio ? 'normal' : 'italic'
                  }}>
                          {bio || 'No bio yet — tap the edit icon to add one'}
                        </motion.p>}
                    </AnimatePresence>
                  </div>

                  {/* ── Username ── */}
                  <div style={{
                background: T.surface,
                border: `1px solid ${T.surfaceBorder}`,
                borderRadius: 14,
                padding: '14px 16px'
              }}>
                    <p style={{
                  color: T.textMuted,
                  fontSize: '0.62rem',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  fontWeight: 500,
                  marginBottom: 10
                }}>Username</p>
                    {editingUsername ? <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          <div className="relative flex-1 flex items-center">
                            <AtSign size={13} className="absolute left-3" style={{
                        color: T.primaryDim
                      }} />
                            <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="your_username" style={{
                        width: '100%',
                        paddingLeft: 30,
                        paddingRight: 10,
                        paddingTop: 8,
                        paddingBottom: 8,
                        background: T.inputBg,
                        border: `1px solid ${T.inputBorder}`,
                        borderRadius: 8,
                        color: T.text,
                        fontSize: '0.82rem',
                        outline: 'none',
                        fontFamily: 'var(--font-sans)'
                      }} />
                          </div>
                          <motion.button whileTap={{
                      scale: 0.9
                    }} onClick={saveUsername} disabled={usernameLoading} style={{
                      padding: '8px 14px',
                      background: T.primaryFaint,
                      border: `1px solid ${T.primaryBorder}`,
                      borderRadius: 8,
                      color: T.primary,
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}>
                            {usernameLoading ? '…' : 'Save'}
                          </motion.button>
                          <motion.button whileTap={{
                      scale: 0.9
                    }} onClick={() => {
                      setEditingUsername(false);
                      setUsernameMsg('');
                    }} style={{
                      padding: '8px 10px',
                      background: 'none',
                      border: `1px solid ${T.surfaceBorder}`,
                      borderRadius: 8,
                      color: T.textMuted,
                      cursor: 'pointer'
                    }}>
                            <X size={13} />
                          </motion.button>
                        </div>
                        {usernameMsg && <p style={{
                    color: usernameMsg === 'Saved!' ? T.primary : '#ef4444',
                    fontSize: '0.7rem'
                  }}>{usernameMsg}</p>}
                      </div> : <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AtSign size={14} style={{
                      color: T.primaryDim
                    }} />
                          <p style={{
                      color: T.textMuted,
                      fontSize: '0.78rem'
                    }}>
                            {profileUsername ? <span style={{
                        color: T.text
                      }}>{profileUsername}</span> : <span style={{
                        fontStyle: 'italic'
                      }}>No username set</span>}
                          </p>
                        </div>
                        <motion.button whileTap={{
                    scale: 0.9
                  }} onClick={() => {
                    setEditingUsername(true);
                    setNewUsername(profileUsername ?? '');
                  }} style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: T.primaryDim,
                    padding: 4
                  }}>
                          <Edit2 size={14} />
                        </motion.button>
                      </div>}
                  </div>

                  {/* ── Phone Number ── */}
                  <div style={{
                background: T.surface,
                border: `1px solid ${T.surfaceBorder}`,
                borderRadius: 14,
                padding: '14px 16px'
              }}>
                    <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10
                }}>
                      <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7
                  }}>
                        <Phone size={13} style={{
                      color: T.primaryDim
                    }} />
                        <p style={{
                      color: T.textMuted,
                      fontSize: '0.62rem',
                      letterSpacing: '0.2em',
                      textTransform: 'uppercase',
                      fontWeight: 500
                    }}>Phone Number</p>
                      </div>
                      {!editingPhone && <motion.button whileTap={{
                    scale: 0.9
                  }} onClick={() => {
                    setEditingPhone(true);
                    setPhoneInput(profilePhone);
                    setPhoneMsg('');
                  }} style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: T.primaryDim,
                    padding: 4
                  }}>
                          <Edit2 size={13} />
                        </motion.button>}
                    </div>
                    <AnimatePresence mode="wait">
                      {editingPhone ? <motion.div key="edit-phone" initial={{
                    opacity: 0
                  }} animate={{
                    opacity: 1
                  }} exit={{
                    opacity: 0
                  }} className="flex flex-col gap-2">
                          <div className="relative flex items-center">
                            <Phone size={13} className="absolute left-3" style={{
                        color: T.primaryDim
                      }} />
                            <input type="tel" value={phoneInput} onChange={e => setPhoneInput(e.target.value)} placeholder="+965 XXXX XXXX" style={{
                        width: '100%',
                        paddingLeft: 32,
                        paddingRight: 10,
                        paddingTop: 9,
                        paddingBottom: 9,
                        background: T.inputBg,
                        border: `1px solid ${T.inputBorder}`,
                        borderRadius: 9,
                        color: T.text,
                        fontSize: '0.85rem',
                        outline: 'none',
                        fontFamily: 'var(--font-sans)'
                      }} onFocus={e => e.target.style.borderColor = T.inputFocus} onBlur={e => e.target.style.borderColor = T.inputBorder} />
                          </div>
                          <div style={{
                      display: 'flex',
                      gap: 7
                    }}>
                            <motion.button whileTap={{
                        scale: 0.9
                      }} onClick={() => {
                        setEditingPhone(false);
                        setPhoneMsg('');
                      }} style={{
                        padding: '6px 10px',
                        background: 'none',
                        border: `1px solid ${T.surfaceBorder}`,
                        borderRadius: 7,
                        color: T.textMuted,
                        cursor: 'pointer'
                      }}>
                              <X size={12} />
                            </motion.button>
                            <motion.button whileTap={{
                        scale: 0.9
                      }} onClick={savePhone} disabled={phoneLoading} style={{
                        flex: 1,
                        padding: '6px 0',
                        background: T.primaryFaint,
                        border: `1px solid ${T.primaryBorder}`,
                        borderRadius: 7,
                        color: T.primary,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}>
                              {phoneLoading ? '…' : 'Save'}
                            </motion.button>
                          </div>
                          {phoneMsg && <p style={{
                      color: phoneMsg === 'Saved!' ? T.primary : '#ef4444',
                      fontSize: '0.7rem'
                    }}>{phoneMsg}</p>}
                        </motion.div> : <motion.div key="view-phone" initial={{
                    opacity: 0
                  }} animate={{
                    opacity: 1
                  }} exit={{
                    opacity: 0
                  }} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}>
                          <Phone size={14} style={{
                      color: T.primaryDim
                    }} />
                          <p style={{
                      color: profilePhone ? T.text : T.textMuted,
                      fontSize: '0.82rem',
                      fontStyle: profilePhone ? 'normal' : 'italic'
                    }}>
                            {profilePhone || 'No phone number added'}
                          </p>
                        </motion.div>}
                    </AnimatePresence>
                  </div>

                  {/* ── Change Email ── */}
                  <div style={{
                background: T.surface,
                border: `1px solid ${T.surfaceBorder}`,
                borderRadius: 14,
                padding: '14px 16px'
              }}>
                    <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10
                }}>
                      <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7
                  }}>
                        <Mail size={13} style={{
                      color: T.primaryDim
                    }} />
                        <p style={{
                      color: T.textMuted,
                      fontSize: '0.62rem',
                      letterSpacing: '0.2em',
                      textTransform: 'uppercase',
                      fontWeight: 500
                    }}>Email Address</p>
                      </div>
                      {!editingEmail && <motion.button whileTap={{
                    scale: 0.9
                  }} onClick={() => {
                    setEditingEmail(true);
                    setNewEmail(user?.email ?? '');
                    setEmailMsg('');
                  }} style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: T.primaryDim,
                    padding: 4
                  }}>
                          <Edit2 size={13} />
                        </motion.button>}
                    </div>
                    <AnimatePresence mode="wait">
                      {editingEmail ? <motion.div key="edit-email" initial={{
                    opacity: 0
                  }} animate={{
                    opacity: 1
                  }} exit={{
                    opacity: 0
                  }} className="flex flex-col gap-2">
                          <div className="relative flex items-center">
                            <Mail size={13} className="absolute left-3" style={{
                        color: T.primaryDim
                      }} />
                            <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="new@email.com" style={{
                        width: '100%',
                        paddingLeft: 32,
                        paddingRight: 10,
                        paddingTop: 9,
                        paddingBottom: 9,
                        background: T.inputBg,
                        border: `1px solid ${T.inputBorder}`,
                        borderRadius: 9,
                        color: T.text,
                        fontSize: '0.85rem',
                        outline: 'none',
                        fontFamily: 'var(--font-sans)'
                      }} onFocus={e => e.target.style.borderColor = T.inputFocus} onBlur={e => e.target.style.borderColor = T.inputBorder} />
                          </div>
                          <div className="relative flex items-center">
                            <Lock size={13} className="absolute left-3" style={{
                        color: T.primaryDim
                      }} />
                            <input type={showEmailPw ? 'text' : 'password'} value={emailPassword} onChange={e => setEmailPassword(e.target.value)} placeholder="Current password to confirm" style={{
                        width: '100%',
                        paddingLeft: 32,
                        paddingRight: 36,
                        paddingTop: 9,
                        paddingBottom: 9,
                        background: T.inputBg,
                        border: `1px solid ${T.inputBorder}`,
                        borderRadius: 9,
                        color: T.text,
                        fontSize: '0.85rem',
                        outline: 'none',
                        fontFamily: 'var(--font-sans)'
                      }} onFocus={e => e.target.style.borderColor = T.inputFocus} onBlur={e => e.target.style.borderColor = T.inputBorder} />
                            <button type="button" onClick={() => setShowEmailPw(v => !v)} className="absolute right-3" style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: T.textMuted
                      }}>
                              {showEmailPw ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                          </div>
                          <div style={{
                      display: 'flex',
                      gap: 7
                    }}>
                            <motion.button whileTap={{
                        scale: 0.9
                      }} onClick={() => {
                        setEditingEmail(false);
                        setEmailMsg('');
                      }} style={{
                        padding: '6px 10px',
                        background: 'none',
                        border: `1px solid ${T.surfaceBorder}`,
                        borderRadius: 7,
                        color: T.textMuted,
                        cursor: 'pointer'
                      }}>
                              <X size={12} />
                            </motion.button>
                            <motion.button whileTap={{
                        scale: 0.9
                      }} onClick={saveEmail} disabled={emailLoading || !newEmail || !emailPassword} style={{
                        flex: 1,
                        padding: '6px 0',
                        background: T.primaryFaint,
                        border: `1px solid ${T.primaryBorder}`,
                        borderRadius: 7,
                        color: T.primary,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        opacity: !newEmail || !emailPassword ? 0.5 : 1
                      }}>
                              {emailLoading ? '…' : 'Update Email'}
                            </motion.button>
                          </div>
                          {emailMsg && <p style={{
                      color: emailMsg === 'Email updated!' ? T.primary : '#ef4444',
                      fontSize: '0.7rem'
                    }}>{emailMsg}</p>}
                        </motion.div> : <motion.div key="view-email" initial={{
                    opacity: 0
                  }} animate={{
                    opacity: 1
                  }} exit={{
                    opacity: 0
                  }} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}>
                          <Mail size={14} style={{
                      color: T.primaryDim
                    }} />
                          <p style={{
                      color: T.text,
                      fontSize: '0.82rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                            {user?.email}
                          </p>
                        </motion.div>}
                    </AnimatePresence>
                  </div>

                  {/* ── Change Password ── */}
                  <div style={{
                background: T.surface,
                border: `1px solid ${T.surfaceBorder}`,
                borderRadius: 14,
                padding: '14px 16px'
              }}>
                    <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: editingPassword ? 12 : 0
                }}>
                      <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7
                  }}>
                        <ShieldCheck size={13} style={{
                      color: T.primaryDim
                    }} />
                        <p style={{
                      color: T.textMuted,
                      fontSize: '0.62rem',
                      letterSpacing: '0.2em',
                      textTransform: 'uppercase',
                      fontWeight: 500
                    }}>Password</p>
                      </div>
                      {!editingPassword && <motion.button whileTap={{
                    scale: 0.9
                  }} onClick={() => {
                    setEditingPassword(true);
                    setPwMsg('');
                    setCurrentPw('');
                    setNewPw('');
                    setConfirmNewPw('');
                  }} style={{
                    padding: '5px 12px',
                    background: T.primaryFaint,
                    border: `1px solid ${T.primaryBorder}`,
                    borderRadius: 7,
                    color: T.primary,
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}>
                          Change
                        </motion.button>}
                    </div>
                    <AnimatePresence>
                      {editingPassword && <motion.div key="edit-pw" initial={{
                    opacity: 0,
                    height: 0
                  }} animate={{
                    opacity: 1,
                    height: 'auto'
                  }} exit={{
                    opacity: 0,
                    height: 0
                  }} style={{
                    overflow: 'hidden'
                  }} className="flex flex-col gap-2">
                          {/* Current password */}
                          <div className="relative flex items-center">
                            <Lock size={13} className="absolute left-3" style={{
                        color: T.primaryDim
                      }} />
                            <input type={showCurrentPw ? 'text' : 'password'} value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="Current password" style={{
                        width: '100%',
                        paddingLeft: 32,
                        paddingRight: 36,
                        paddingTop: 9,
                        paddingBottom: 9,
                        background: T.inputBg,
                        border: `1px solid ${T.inputBorder}`,
                        borderRadius: 9,
                        color: T.text,
                        fontSize: '0.85rem',
                        outline: 'none',
                        fontFamily: 'var(--font-sans)'
                      }} onFocus={e => e.target.style.borderColor = T.inputFocus} onBlur={e => e.target.style.borderColor = T.inputBorder} />
                            <button type="button" onClick={() => setShowCurrentPw(v => !v)} className="absolute right-3" style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: T.textMuted
                      }}>
                              {showCurrentPw ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                          </div>
                          {/* New password */}
                          <div className="relative flex items-center">
                            <Lock size={13} className="absolute left-3" style={{
                        color: T.primaryDim
                      }} />
                            <input type={showNewPw ? 'text' : 'password'} value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="New password (min 8 chars)" style={{
                        width: '100%',
                        paddingLeft: 32,
                        paddingRight: 36,
                        paddingTop: 9,
                        paddingBottom: 9,
                        background: T.inputBg,
                        border: `1px solid ${T.inputBorder}`,
                        borderRadius: 9,
                        color: T.text,
                        fontSize: '0.85rem',
                        outline: 'none',
                        fontFamily: 'var(--font-sans)'
                      }} onFocus={e => e.target.style.borderColor = T.inputFocus} onBlur={e => e.target.style.borderColor = T.inputBorder} />
                            <button type="button" onClick={() => setShowNewPw(v => !v)} className="absolute right-3" style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: T.textMuted
                      }}>
                              {showNewPw ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                          </div>
                          {/* Confirm new password */}
                          <div className="relative flex items-center">
                            <Lock size={13} className="absolute left-3" style={{
                        color: T.primaryDim
                      }} />
                            <input type="password" value={confirmNewPw} onChange={e => setConfirmNewPw(e.target.value)} placeholder="Confirm new password" style={{
                        width: '100%',
                        paddingLeft: 32,
                        paddingRight: 10,
                        paddingTop: 9,
                        paddingBottom: 9,
                        background: T.inputBg,
                        border: `1px solid ${confirmNewPw && confirmNewPw !== newPw ? 'rgba(239,68,68,0.5)' : T.inputBorder}`,
                        borderRadius: 9,
                        color: T.text,
                        fontSize: '0.85rem',
                        outline: 'none',
                        fontFamily: 'var(--font-sans)'
                      }} onFocus={e => e.target.style.borderColor = T.inputFocus} onBlur={e => e.target.style.borderColor = confirmNewPw && confirmNewPw !== newPw ? 'rgba(239,68,68,0.5)' : T.inputBorder} />
                          </div>
                          {/* Strength indicator */}
                          {newPw.length > 0 && <div style={{
                      display: 'flex',
                      gap: 4,
                      alignItems: 'center'
                    }}>
                              {[1, 2, 3, 4].map(i => <div key={i} style={{
                        flex: 1,
                        height: 3,
                        borderRadius: 2,
                        background: newPw.length >= i * 3 ? newPw.length >= 12 ? '#22c55e' : newPw.length >= 8 ? T.primary : '#f59e0b' : 'rgba(255,255,255,0.1)',
                        transition: 'background 0.2s'
                      }} />)}
                              <span style={{
                        color: T.textMuted,
                        fontSize: '0.6rem',
                        flexShrink: 0
                      }}>
                                {newPw.length < 8 ? 'Weak' : newPw.length < 12 ? 'Good' : 'Strong'}
                              </span>
                            </div>}
                          <div style={{
                      display: 'flex',
                      gap: 7
                    }}>
                            <motion.button whileTap={{
                        scale: 0.9
                      }} onClick={() => {
                        setEditingPassword(false);
                        setPwMsg('');
                      }} style={{
                        padding: '6px 10px',
                        background: 'none',
                        border: `1px solid ${T.surfaceBorder}`,
                        borderRadius: 7,
                        color: T.textMuted,
                        cursor: 'pointer'
                      }}>
                              <X size={12} />
                            </motion.button>
                            <motion.button whileTap={{
                        scale: 0.9
                      }} onClick={savePassword} disabled={pwLoading || !currentPw || !newPw || !confirmNewPw} style={{
                        flex: 1,
                        padding: '6px 0',
                        background: T.primaryFaint,
                        border: `1px solid ${T.primaryBorder}`,
                        borderRadius: 7,
                        color: T.primary,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        opacity: !currentPw || !newPw || !confirmNewPw ? 0.5 : 1
                      }}>
                              {pwLoading ? '…' : 'Change Password'}
                            </motion.button>
                          </div>
                          {pwMsg && <p style={{
                      color: pwMsg === 'Password changed!' ? T.primary : '#ef4444',
                      fontSize: '0.7rem'
                    }}>{pwMsg}</p>}
                        </motion.div>}
                    </AnimatePresence>
                  </div>

                  {/* ── Share Profile ── */}
                  {profileUsername && <div style={{
                background: T.surface,
                border: `1px solid ${T.surfaceBorder}`,
                borderRadius: 14,
                padding: '14px 16px'
              }}>
                      <p style={{
                  color: T.textMuted,
                  fontSize: '0.62rem',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  fontWeight: 500,
                  marginBottom: 12
                }}>Share Profile</p>

                      {/* Profile link row */}
                      <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '9px 11px',
                  background: T.inputBg,
                  border: `1px solid ${T.inputBorder}`,
                  borderRadius: 9,
                  marginBottom: 10
                }}>
                        <p style={{
                    flex: 1,
                    color: T.primary,
                    fontSize: '0.76rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                          stooorna.com/u/{profileUsername}
                        </p>
                        <motion.button whileTap={{
                    scale: 0.9
                  }} onClick={() => copyLink(profileUrl)} style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: copied ? '#22c55e' : T.primaryDim,
                    flexShrink: 0
                  }}>
                          {copied ? <Check size={15} strokeWidth={2} /> : <Copy size={15} strokeWidth={2} />}
                        </motion.button>
                      </div>

                      {/* QR toggle */}
                      <motion.button whileTap={{
                  scale: 0.97
                }} onClick={() => setShowQR(!showQR)} style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  padding: '9px',
                  background: T.primaryFaint,
                  border: `1px solid ${T.primaryBorder}`,
                  borderRadius: 9,
                  color: T.primary,
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}>
                        <QrCode size={15} strokeWidth={2} />
                        {showQR ? 'Hide QR Code' : 'Show QR Code'}
                      </motion.button>

                      <AnimatePresence>
                        {showQR && <motion.div initial={{
                    opacity: 0,
                    height: 0
                  }} animate={{
                    opacity: 1,
                    height: 'auto'
                  }} exit={{
                    opacity: 0,
                    height: 0
                  }} style={{
                    overflow: 'hidden',
                    display: 'flex',
                    justifyContent: 'center',
                    paddingTop: 14
                  }}>
                            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(profileUrl)}&bgcolor=0a1a1a&color=00BCD4&margin=10`} alt="QR code" width={180} height={180} style={{
                      borderRadius: 12,
                      border: `1px solid ${T.primaryBorder}`
                    }} />
                          </motion.div>}
                      </AnimatePresence>

                      {/* Native share */}
                      {typeof navigator !== 'undefined' && navigator.share && <motion.button whileTap={{
                  scale: 0.97
                }} onClick={async () => {
                  try {
                    await navigator.share({
                      title: `${displayName} on Stooorna`,
                      url: profileUrl
                    });
                  } catch {
                    // Fallback: copy to clipboard if share() is blocked (e.g. iframe)
                    try {
                      await navigator.clipboard.writeText(profileUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch {/* ignore */}
                  }
                }} style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  padding: '9px',
                  marginTop: 8,
                  background: T.primaryFaint,
                  border: `1px solid ${T.primaryBorder}`,
                  borderRadius: 9,
                  color: T.primary,
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}>
                          <Share2 size={15} strokeWidth={2} />
                          Share via…
                        </motion.button>}

                      {/* Full share page */}
                      <motion.button whileTap={{
                  scale: 0.97
                }} onClick={() => navigate(`/share?u=${encodeURIComponent(profileUsername ?? '')}`)} style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  padding: '9px',
                  marginTop: 8,
                  background: 'rgba(0,188,212,0.06)',
                  border: `1px solid ${T.primaryBorder}`,
                  borderRadius: 9,
                  color: T.primaryDim,
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}>
                        <Share2 size={14} strokeWidth={2} />
                        Open Share Page
                      </motion.button>
                    </div>}

                  {/* ── Short link for text posts (stooorna.com) ── */}
                  <div style={{
                    borderRadius: 16,
                    background: T.surface,
                    border: `1px solid ${T.surfaceBorder}`,
                    padding: '14px 14px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 10,
                        background: T.primaryFaint, border: `1px solid ${T.primaryBorder}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.primary,
                      }}>
                        <Link2 size={16} strokeWidth={2.2} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, color: T.text, fontSize: '0.84rem', fontWeight: 800 }}>رابط قصير للتطبيق</p>
                        <p style={{ margin: '2px 0 0', color: T.textMuted, fontSize: '0.68rem', lineHeight: 1.45 }}>
                          الصق أي رابط (فيديو/صورة/صفحة) لتحصل على رابط stooorna.com تستخدمه في البوست النصي
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                      <input
                        value={shortLinkInput}
                        onChange={e => { setShortLinkInput(e.target.value); setShortLinkError(''); setShortLinkCopied(false); }}
                        placeholder="الصق الرابط هنا… https://"
                        dir="ltr"
                        style={{
                          flex: 1, minWidth: 0,
                          background: T.inputBg,
                          border: `1px solid ${T.inputBorder}`,
                          borderRadius: 12,
                          padding: '11px 12px',
                          color: T.text,
                          fontSize: '0.8rem',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') void createAppShortLink(); }}
                      />
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.95 }}
                        onClick={() => void pasteIntoShortLink()}
                        style={{
                          flexShrink: 0, padding: '0 14px', borderRadius: 12, cursor: 'pointer',
                          background: T.primaryFaint, border: `1px solid ${T.primaryBorder}`,
                          color: T.primary, fontWeight: 800, fontSize: '0.75rem',
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}
                      >
                        <ClipboardPaste size={14} strokeWidth={2.2} />
                        Paste
                      </motion.button>
                    </div>

                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      disabled={shortLinkBusy || !shortLinkInput.trim()}
                      onClick={() => void createAppShortLink()}
                      style={{
                        width: '100%', minHeight: 42, borderRadius: 12, border: 'none', cursor: shortLinkInput.trim() ? 'pointer' : 'default',
                        background: shortLinkInput.trim() ? T.primary : T.primaryFaint,
                        color: shortLinkInput.trim() ? '#041018' : T.textMuted,
                        fontWeight: 800, fontSize: '0.8rem',
                        opacity: shortLinkBusy ? 0.7 : 1,
                      }}
                    >
                      {shortLinkBusy ? 'جاري إنشاء الرابط…' : 'إنشاء رابط stooorna.com'}
                    </motion.button>

                    {shortLinkResult && (
                      <div style={{
                        display: 'flex', gap: 8, alignItems: 'center',
                        padding: '10px 10px', borderRadius: 12,
                        background: 'rgba(0,188,212,0.08)', border: `1px solid ${T.primaryBorder}`,
                      }}>
                        <input
                          readOnly
                          value={shortLinkResult}
                          dir="ltr"
                          style={{
                            flex: 1, minWidth: 0, background: 'transparent', border: 'none',
                            color: T.primary, fontSize: '0.78rem', fontWeight: 700, outline: 'none',
                          }}
                          onFocus={e => e.currentTarget.select()}
                        />
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.95 }}
                          onClick={() => void copyAppShortLink()}
                          style={{
                            flexShrink: 0, padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
                            background: shortLinkCopied ? 'rgba(34,197,94,0.18)' : T.primaryFaint,
                            border: `1px solid ${shortLinkCopied ? 'rgba(34,197,94,0.45)' : T.primaryBorder}`,
                            color: shortLinkCopied ? '#22c55e' : T.primary,
                            fontWeight: 800, fontSize: '0.72rem',
                            display: 'flex', alignItems: 'center', gap: 5,
                          }}
                        >
                          {shortLinkCopied ? <Check size={14} /> : <Copy size={14} />}
                          {shortLinkCopied ? 'Copied' : 'Copy'}
                        </motion.button>
                      </div>
                    )}

                    {shortLinkError && (
                      <p style={{ margin: 0, color: T.danger, fontSize: '0.72rem', textAlign: 'center' }}>{shortLinkError}</p>
                    )}

                    {shortLinkHistory.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <p style={{ margin: 0, color: T.textMuted, fontSize: '0.65rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                          آخر الروابط
                        </p>
                        {shortLinkHistory.slice(0, 5).map(item => (
                          <button
                            key={item.code + item.createdAt}
                            type="button"
                            onClick={() => { setShortLinkInput(item.url); setShortLinkResult(item.shortUrl); setShortLinkError(''); setShortLinkCopied(false); }}
                            style={{
                              textAlign: 'left', cursor: 'pointer',
                              background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.surfaceBorder}`,
                              borderRadius: 10, padding: '8px 10px',
                              display: 'flex', flexDirection: 'column', gap: 2,
                            }}
                          >
                            <span style={{ color: T.primary, fontSize: '0.72rem', fontWeight: 700, direction: 'ltr' }}>{item.shortUrl}</span>
                            <span style={{ color: T.textMuted, fontSize: '0.65rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'ltr' }}>{item.url}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── Privacy + Sign Out ── */}
                  <div style={{
                display: 'flex',
                gap: 8
              }}>
                    <motion.button whileTap={{
                  scale: 0.97
                }} onClick={() => navigate('/privacy')} className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3" style={{
                  background: T.primaryFaint,
                  border: `1px solid ${T.primaryBorder}`,
                  color: T.primary,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}>
                      <Eye size={14} />
                      Privacy
                    </motion.button>
                    <motion.button whileTap={{
                  scale: 0.97
                }} onClick={handleLogout} className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3" style={{
                  background: 'transparent',
                  border: `1px solid ${T.dangerBorder}`,
                  color: T.danger,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}>
                      <LogOut size={14} />
                      Sign Out
                    </motion.button>
                  </div>
                </motion.div>;
          })()}

            {/* ── LOGGED IN — LIVE TAB ── */}
            {!isPending && user && tab === 'live' && <motion.div key="live" initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} className="flex flex-col gap-3">
                {/* ── Voice Recordings ── */}
                <div className="flex items-center justify-between mb-1">
                  <p style={{
                color: T.textMuted,
                fontSize: '0.68rem',
                letterSpacing: '0.2em',
                textTransform: 'uppercase'
              }}>
                    Voice Recordings
                  </p>
                  {recordings.length > 0 && <p style={{
                color: T.textMuted,
                fontSize: '0.62rem'
              }}>{recordings.length} saved</p>}
                </div>

                {recLoading && <div className="flex justify-center pt-8">
                    <motion.div animate={{
                rotate: 360
              }} transition={{
                duration: 1,
                repeat: Infinity,
                ease: 'linear'
              }} style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                border: `2px solid ${T.primaryBorder}`,
                borderTopColor: T.primary
              }} />
                  </div>}

                {!recLoading && recordings.length === 0 && <div className="flex flex-col items-center gap-3 rounded-xl py-10" style={{
              background: T.surface,
              border: `1px solid ${T.surfaceBorder}`
            }}>
                    <Mic size={32} style={{
                color: T.primaryBorder
              }} />
                    <p style={{
                color: T.textMuted,
                fontSize: '0.78rem',
                letterSpacing: '0.05em'
              }}>No recordings yet</p>
                    <p style={{
                color: T.textMuted,
                fontSize: '0.68rem',
                opacity: 0.7
              }}>Tap the knob to start recording</p>
                  </div>}

                {!recLoading && recordings.map(rec => <RecordingCard key={rec.id} rec={rec} onDelete={handleDelete} />)}

                {/* ── Live Broadcast Recordings ── */}
                <div className="flex items-center justify-between mt-4 mb-1">
                  <div className="flex items-center gap-2">
                    <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#ef4444',
                  boxShadow: '0 0 6px rgba(239,68,68,0.6)'
                }} />
                    <p style={{
                  color: T.textMuted,
                  fontSize: '0.68rem',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase'
                }}>
                      Live Recordings
                    </p>
                  </div>
                  {liveRecs.length > 0 && <p style={{
                color: T.textMuted,
                fontSize: '0.62rem'
              }}>{liveRecs.length} saved</p>}
                </div>

                {liveRecsLoading && <div className="flex justify-center pt-4">
                    <motion.div animate={{
                rotate: 360
              }} transition={{
                duration: 1,
                repeat: Infinity,
                ease: 'linear'
              }} style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                border: `2px solid ${T.primaryBorder}`,
                borderTopColor: T.primary
              }} />
                  </div>}

                {!liveRecsLoading && liveRecs.length === 0 && <div className="flex flex-col items-center gap-3 rounded-xl py-8" style={{
              background: T.surface,
              border: `1px solid ${T.surfaceBorder}`
            }}>
                    <Radio size={28} style={{
                color: T.primaryBorder
              }} />
                    <p style={{
                color: T.textMuted,
                fontSize: '0.78rem'
              }}>No live recordings yet</p>
                    <p style={{
                color: T.textMuted,
                fontSize: '0.68rem',
                opacity: 0.7
              }}>Your broadcasts will be saved here as MP4</p>
                  </div>}

                {!liveRecsLoading && liveRecs.map(rec => {
              const date = new Date(rec.startedAt).toLocaleDateString('ar-KW', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
              });
              const time = new Date(rec.startedAt).toLocaleTimeString('ar-KW', {
                hour: '2-digit',
                minute: '2-digit'
              });
              const mins = rec.duration ? Math.floor(rec.duration / 60) : null;
              const secs = rec.duration ? rec.duration % 60 : null;
              const durationStr = mins !== null ? `${mins}:${String(secs).padStart(2, '0')}` : null;
              const sizeMB = rec.fileSize ? (rec.fileSize / 1024 / 1024).toFixed(1) : null;
              const isDeleting = liveRecDeleting === rec.id;
              const confirmOpen = liveRecDeleteConfirm === rec.id;
              const shareOpen = liveRecShareId === rec.id;
              return <motion.div key={rec.id} layout initial={{
                opacity: 0,
                scale: 0.9
              }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }} exit={{
                opacity: 0,
                scale: 0.95
              }} className="rounded-xl p-4 flex flex-col gap-3" style={{
                background: T.surface,
                border: `1px solid ${T.surfaceBorder}`
              }}>
                      {/* ── Header row ── */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      flexShrink: 0,
                      background: 'rgba(239,68,68,0.1)',
                      border: '1px solid rgba(239,68,68,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                            <Radio size={14} color="#ef4444" strokeWidth={2} />
                          </div>
                          <div className="min-w-0">
                            <p style={{
                        color: T.text,
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        margin: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                              {rec.title ?? 'بث مباشر'}
                            </p>
                            <p style={{
                        color: T.textMuted,
                        fontSize: '0.65rem',
                        margin: 0
                      }}>
                              {date} · {time}
                            </p>
                          </div>
                        </div>

                        {/* Badges + action icons */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {durationStr && <span style={{
                      background: 'rgba(0,188,212,0.1)',
                      border: `1px solid ${T.primaryBorder}`,
                      borderRadius: 6,
                      padding: '2px 7px',
                      color: T.primary,
                      fontSize: '0.65rem',
                      fontWeight: 700
                    }}>
                              {durationStr}
                            </span>}
                          {sizeMB && <span style={{
                      color: T.textMuted,
                      fontSize: '0.62rem'
                    }}>{sizeMB} MB</span>}

                          {/* Share button */}
                          {rec.videoUrl && <motion.button whileTap={{
                      scale: 0.88
                    }} onClick={() => shareLiveRec(rec)} title="Share" style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      border: 'none',
                      background: 'rgba(0,188,212,0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0
                    }}>
                              <Share2 size={13} color={T.primary} strokeWidth={2} />
                            </motion.button>}

                          {/* Delete button */}
                          <motion.button whileTap={{
                      scale: 0.88
                    }} onClick={() => setLiveRecDeleteConfirm(rec.id)} title="Delete" style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      border: 'none',
                      background: 'rgba(239,68,68,0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0
                    }}>
                            <Trash2 size={13} color="#ef4444" strokeWidth={2} />
                          </motion.button>
                        </div>
                      </div>

                      {/* ── Video player or pending ── */}
                      {rec.videoUrl ? <video src={rec.videoUrl} controls playsInline style={{
                  width: '100%',
                  borderRadius: 10,
                  background: '#000',
                  maxHeight: 220,
                  border: `1px solid ${T.surfaceBorder}`
                }} /> : <div style={{
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: 10,
                  padding: '16px',
                  textAlign: 'center',
                  border: `1px dashed ${T.surfaceBorder}`
                }}>
                          <p style={{
                    color: T.textMuted,
                    fontSize: '0.72rem',
                    margin: 0
                  }}>
                            جاري معالجة الفيديو...
                          </p>
                        </div>}

                      {/* ── Download button ── */}
                      {rec.videoUrl && <a href={rec.videoUrl} download={`live-${rec.id}.mp4`} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  background: 'rgba(0,188,212,0.08)',
                  border: `1px solid ${T.primaryBorder}`,
                  borderRadius: 10,
                  padding: '9px 16px',
                  color: T.primary,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textDecoration: 'none'
                }}>
                          تحميل MP4
                        </a>}

                      {/* ── Delete confirm dialog ── */}
                      <AnimatePresence>
                        {confirmOpen && <motion.div initial={{
                    opacity: 0,
                    scale: 0.94
                  }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }} exit={{
                    opacity: 0,
                    scale: 0.94
                  }} style={{
                    background: 'rgba(239,68,68,0.06)',
                    border: '1px solid rgba(239,68,68,0.22)',
                    borderRadius: 12,
                    padding: '14px 16px'
                  }}>
                            <p style={{
                      color: '#ef4444',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      margin: '0 0 10px'
                    }}>
                              حذف هذا التسجيل؟
                            </p>
                            <p style={{
                      color: T.textMuted,
                      fontSize: '0.7rem',
                      margin: '0 0 14px',
                      lineHeight: 1.5
                    }}>
                              سيتم حذف الفيديو نهائياً ولا يمكن التراجع.
                            </p>
                            <div className="flex gap-2">
                              <motion.button whileTap={{
                        scale: 0.94
                      }} onClick={() => deleteLiveRec(rec.id)} disabled={isDeleting} style={{
                        flex: 1,
                        padding: '9px',
                        borderRadius: 9,
                        border: 'none',
                        background: '#ef4444',
                        color: '#fff',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        opacity: isDeleting ? 0.6 : 1,
                        fontFamily: 'var(--font-sans)'
                      }}>
                                {isDeleting ? '...' : 'حذف'}
                              </motion.button>
                              <motion.button whileTap={{
                        scale: 0.94
                      }} onClick={() => setLiveRecDeleteConfirm(null)} style={{
                        flex: 1,
                        padding: '9px',
                        borderRadius: 9,
                        border: `1px solid ${T.surfaceBorder}`,
                        background: 'transparent',
                        color: T.textMuted,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'var(--font-sans)'
                      }}>
                                إلغاء
                              </motion.button>
                            </div>
                          </motion.div>}
                      </AnimatePresence>

                      {/* ── Share sheet ── */}
                      <AnimatePresence>
                        {shareOpen && rec.videoUrl && <motion.div initial={{
                    opacity: 0,
                    scale: 0.94
                  }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }} exit={{
                    opacity: 0,
                    scale: 0.94
                  }} style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${T.surfaceBorder}`,
                    borderRadius: 12,
                    padding: '14px 16px'
                  }}>
                            {/* Header */}
                            <div className="flex items-center justify-between mb-3">
                              <p style={{
                        color: T.text,
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        margin: 0
                      }}>
                                مشاركة التسجيل
                              </p>
                              <motion.button whileTap={{
                        scale: 0.88
                      }} onClick={() => setLiveRecShareId(null)} style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 2
                      }}>
                                <X size={14} color={T.textMuted} />
                              </motion.button>
                            </div>

                            {/* Link copy row */}
                            <div className="flex gap-2 mb-3">
                              <div style={{
                        flex: 1,
                        background: 'rgba(0,0,0,0.25)',
                        borderRadius: 9,
                        border: `1px solid ${T.surfaceBorder}`,
                        padding: '8px 10px',
                        overflow: 'hidden'
                      }}>
                                <p style={{
                          color: T.textMuted,
                          fontSize: '0.65rem',
                          margin: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                                  {window.location.origin}{rec.videoUrl}
                                </p>
                              </div>
                              <motion.button whileTap={{
                        scale: 0.9
                      }} onClick={() => copyLiveRecLink(`${window.location.origin}${rec.videoUrl}`)} style={{
                        padding: '8px 14px',
                        borderRadius: 9,
                        border: 'none',
                        background: liveRecShareCopied ? 'rgba(34,197,94,0.15)' : `rgba(0,188,212,0.12)`,
                        color: liveRecShareCopied ? '#22c55e' : T.primary,
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        flexShrink: 0,
                        fontFamily: 'var(--font-sans)',
                        transition: 'background 0.2s, color 0.2s'
                      }}>
                                {liveRecShareCopied ? <><CheckCircle size={12} /> تم</> : <><Copy size={12} /> نسخ</>}
                              </motion.button>
                            </div>

                            {/* Native share (mobile) */}
                            {typeof navigator.share === 'function' && <motion.button whileTap={{
                      scale: 0.96
                    }} onClick={() => {
                      navigator.share({
                        title: rec.title ?? 'بث مباشر',
                        url: `${window.location.origin}${rec.videoUrl}`
                      }).catch(() => {});
                    }} style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: 10,
                      border: 'none',
                      background: `rgba(0,188,212,0.1)`,
                      outline: `1px solid ${T.primaryBorder}`,
                      color: T.primary,
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 7,
                      fontFamily: 'var(--font-sans)'
                    } as React.CSSProperties}>
                                <Share2 size={13} />
                                مشاركة عبر التطبيقات
                              </motion.button>}
                          </motion.div>}
                      </AnimatePresence>

                    </motion.div>;
            })}
              </motion.div>}

          </AnimatePresence>
        </div>

        {/* Bottom nav bar — hidden while support overlays are open */}
        {!showSupportChat && !ownerChatUser && !showOwnerInbox && !showSupportUsers && !supportCtrlUser && (
          <div className="w-full flex items-center justify-center px-10 py-4 z-10" style={{
            background: T.navBg,
            borderTop: `1px solid ${T.navBorder}`
          }}>
            <p style={{
              color: T.textMuted,
              fontSize: '0.6rem',
              letterSpacing: '0.25em',
              textTransform: 'uppercase'
            }}>
              Stooorna
            </p>
          </div>
        )}
      </div>

      {/* Support chat — regular users only → @stooorna */}
      <SupportChatOverlay
        open={showSupportChat}
        onClose={() => setShowSupportChat(false)}
        currentUser={user as { id?: string; name?: string | null; username?: string | null; email?: string | null } | null}
      />

      {/* Owner: full inbox list — opens even when empty */}
      <AnimatePresence>
        {showOwnerInbox && !ownerChatUser && (
          <motion.div
            key="owner-inbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10340,
              background: 'rgba(0,0,0,0.96)',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', paddingTop: 'max(10px, env(safe-area-inset-top))',
              borderBottom: '1px solid rgba(0,188,212,0.25)',
              background: 'linear-gradient(180deg, #0a1f2e 0%, #06141c 100%)',
              minHeight: 52, flexShrink: 0,
            }}>
              <button
                type="button"
                onClick={() => setShowOwnerInbox(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#00BCD4', padding: 2 }}
                aria-label="Close"
              >
                <X size={20} />
              </button>
              <div style={{
                width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, #00BCD4 0%, #0288D1 100%)',
                border: '2px solid #00BCD4', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#041018', fontWeight: 800, fontSize: '0.75rem',
              }}>S</div>
              <p style={{ margin: 0, flex: 1, color: '#00BCD4', fontWeight: 800, fontSize: '0.9rem' }}>
                Stooorna (Support)
              </p>
              {supportUnreadTotal > 0 && (
                <span style={{
                  minWidth: 20, height: 20, borderRadius: 10, padding: '0 6px',
                  background: '#ef4444', color: '#fff', fontSize: '0.65rem', fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {supportUnreadTotal > 99 ? '99+' : supportUnreadTotal}
                </span>
              )}
            </div>

            <div style={{
              flex: 1, overflowY: 'auto', padding: '12px 14px',
              background: 'radial-gradient(ellipse 70% 50% at 50% 0%, #0d2a2e 0%, #060e0e 70%)',
            }}>
              {supportInboxLoading && supportInbox.length === 0 && (
                <p style={{ color: 'rgba(150,190,190,0.55)', fontSize: '0.8rem', textAlign: 'center', marginTop: 48 }}>
                  جاري التحميل…
                </p>
              )}
              {!supportInboxLoading && supportInbox.length === 0 && (
                <div style={{ textAlign: 'center', marginTop: 56, padding: '0 20px' }}>
                  <MessageCircle size={36} style={{ color: 'rgba(0,188,212,0.35)', marginBottom: 12 }} />
                  <p style={{ color: 'rgba(200,230,230,0.85)', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 6px' }}>
                    شات الدعم جاهز
                  </p>
                  <p style={{ color: 'rgba(150,190,190,0.55)', fontSize: '0.75rem', margin: 0, lineHeight: 1.5 }}>
                    لا رسائل حالياً. عند إرسال أي مستخدم لرسالة دعم ستظهر هنا ويمكنك الدخول والرد مباشرة.
                  </p>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {supportInbox.map(peer => (
                  <div key={peer.id} style={{ position: 'relative', display: 'flex', alignItems: 'stretch', gap: 0 }}>
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      type="button"
                      onClick={() => setOwnerChatUser(peer)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, flex: 1,
                        padding: '12px 14px', borderRadius: '14px 0 0 14px', cursor: 'pointer', textAlign: 'left',
                        background: peer.unread ? 'rgba(0,188,212,0.12)' : 'rgba(0,188,212,0.05)',
                        border: `1px solid ${peer.unread ? 'rgba(0,188,212,0.4)' : 'rgba(0,188,212,0.15)'}`,
                        borderRight: 'none',
                        color: 'rgba(200,230,230,0.95)',
                      }}
                    >
                      <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
                        <div style={{
                          width: 44, height: 44, borderRadius: '50%', overflow: 'hidden',
                          background: 'rgba(0,188,212,0.15)', border: '1.5px solid rgba(0,188,212,0.35)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#00BCD4', fontWeight: 700, fontSize: '0.85rem',
                        }}>
                          {peer.avatarUrl
                            ? <img src={peer.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : ((peer.name || peer.username || '?')[0] || '?').toUpperCase()}
                        </div>
                        <span style={{
                          position: 'absolute', bottom: 1, right: 1, width: 11, height: 11, borderRadius: '50%',
                          background: peer.online ? '#22c55e' : '#64748b',
                          border: '2px solid #06141c',
                        }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {peer.name || peer.username || 'User'}
                          {peer.username ? <span style={{ color: 'rgba(0,188,212,0.7)', fontWeight: 500, fontSize: '0.72rem' }}> @{peer.username}</span> : null}
                        </p>
                        <p style={{
                          margin: '3px 0 0', color: 'rgba(150,190,190,0.65)', fontSize: '0.72rem',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {peer.lastMessage || 'فتح المحادثة'}
                        </p>
                      </div>
                      {!!peer.unread && peer.unread > 0 && (
                        <span style={{
                          minWidth: 20, height: 20, borderRadius: 10, padding: '0 6px',
                          background: '#00BCD4', color: '#041018', fontSize: '0.65rem', fontWeight: 800,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          {peer.unread}
                        </span>
                      )}
                    </motion.button>
                    {/* Profile button — navigate to user's public profile */}
                    {peer.username && (
                      <motion.button
                        whileTap={{ scale: 0.92 }}
                        type="button"
                        title="عرض البروفايل"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowOwnerInbox(false);
                          navigate(`/u/${encodeURIComponent(peer.username!)}`);
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 40, flexShrink: 0,
                          borderRadius: 0,
                          background: 'hsl(var(--primary) / 0.08)',
                          border: `1px solid ${peer.unread ? 'rgba(0,188,212,0.4)' : 'rgba(0,188,212,0.15)'}`,
                          borderLeft: '1px solid hsl(var(--primary) / 0.25)',
                          borderRight: 'none',
                          cursor: 'pointer',
                          color: 'hsl(var(--primary))',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'hsl(var(--primary) / 0.18)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'hsl(var(--primary) / 0.08)')}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                          <circle cx="12" cy="7" r="4"/>
                        </svg>
                      </motion.button>
                    )}
                    {/* Delete thread button — owner only */}
                    <motion.button
                      whileTap={{ scale: 0.92 }}
                      type="button"
                      title="حذف المحادثة"
                      data-peerid={peer.id}
                      data-peername={peer.name || peer.username || ''}
                      onClick={(e) => {
                        e.stopPropagation();
                        const btn = e.currentTarget as HTMLButtonElement;
                        const pid = btn.dataset.peerid || '';
                        const pname = btn.dataset.peername || 'هذا المستخدم';
                        if (!window.confirm(`حذف محادثة ${pname}؟`)) return;
                        clearSupportThread(pid);
                        const tickets = readLocalSupportTickets().filter((t: { fromUserId?: string }) => t.fromUserId !== pid);
                        try { localStorage.setItem('stooorna_support_tickets', JSON.stringify(tickets)); } catch { /* */ }
                        setSupportInbox(prev => prev.filter(x => x.id !== pid));
                        setOwnerChatUser(prev => (prev && (prev as { id?: string }).id === pid ? null : prev));
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 44, flexShrink: 0,
                        borderRadius: '0 14px 14px 0',
                        background: 'hsl(var(--destructive) / 0.08)',
                        border: `1px solid ${peer.unread ? 'rgba(0,188,212,0.4)' : 'rgba(0,188,212,0.15)'}`,
                        borderLeft: '1px solid hsl(var(--destructive) / 0.3)',
                        cursor: 'pointer',
                        color: 'hsl(var(--destructive))',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'hsl(var(--destructive) / 0.18)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'hsl(var(--destructive) / 0.08)')}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    </motion.button>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Owner support thread with a specific user */}
      {ownerChatUser && (
        <OwnerSupportThread
          peer={ownerChatUser}
          onClose={() => {
            setOwnerChatUser(null);
            // stay in inbox list after closing a thread
            setShowOwnerInbox(true);
            loadSupportInbox();
          }}
          currentUser={user as { id?: string; name?: string | null; username?: string | null; email?: string | null } | null}
        />
      )}

      {/* ══ Support: full users control list ══ */}
      <AnimatePresence>
        {showSupportUsers && !supportCtrlUser && (
          <motion.div
            key="support-users"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10370,
              background: 'rgba(0,0,0,0.96)', backdropFilter: 'blur(10px)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', paddingTop: 'max(10px, env(safe-area-inset-top))',
              borderBottom: '1px solid rgba(239,68,68,0.3)',
              background: 'linear-gradient(180deg, #1a0a0e 0%, #0c0608 100%)',
              minHeight: 52, flexShrink: 0,
            }}>
              <button
                type="button"
                onClick={() => { setShowSupportUsers(false); setSupportUsersSearch(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}
                aria-label="Close"
              >
                <X size={20} />
              </button>
              <Users size={18} style={{ color: '#ef4444' }} />
              <p style={{ margin: 0, flex: 1, color: '#fca5a5', fontWeight: 800, fontSize: '0.9rem' }}>
                تحكم المستخدمين
              </p>
              <button
                type="button"
                onClick={() => loadOwnerData()}
                disabled={usersLoading}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--primary))', padding: 4, opacity: usersLoading ? 0.4 : 1, fontSize: '1.1rem', fontWeight: 700 }}
                title="إعادة تحميل"
              >
                {usersLoading ? '…' : '↻'}
              </button>
              <span style={{ color: 'rgba(200,180,180,0.6)', fontSize: '0.7rem' }}>
                {ucTab === 'company' ? companyAccounts.length : ucTab === 'ban' ? banTabAccounts.length : regularAccounts.length}
              </span>
            </div>

            {/* ── Users / Companies / Ban tab switcher ── */}
            <div style={{ display: 'flex', gap: 8, padding: '10px 14px 0', flexShrink: 0 }}>
              {([
                { key: 'users' as UserControlTab, label: 'Users', count: regularAccounts.length },
                { key: 'company' as UserControlTab, label: 'Company', count: companyAccounts.length },
                { key: 'ban' as UserControlTab, label: 'Ban', count: banTabAccounts.length },
              ]).map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setUcTab(tab.key)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '10px 8px', borderRadius: 12, cursor: 'pointer',
                    background: ucTab === tab.key ? 'rgba(239,68,68,0.14)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${ucTab === tab.key ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'}`,
                    color: ucTab === tab.key ? '#fca5a5' : 'rgba(220,200,200,0.75)',
                    fontWeight: 800, fontSize: '0.78rem',
                  }}
                >
                  {tab.label}
                  <span style={{
                    minWidth: 18, height: 18, borderRadius: 9, padding: '0 5px',
                    background: ucTab === tab.key ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem',
                  }}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {ucTab !== 'company' && (
              <div style={{ padding: '10px 14px', flexShrink: 0 }}>
                <input
                  value={supportUsersSearch}
                  onChange={e => setSupportUsersSearch(e.target.value)}
                  placeholder="بحث باليوزر / الإيميل / الاسم…"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '10px 12px', borderRadius: 12,
                    background: 'rgba(239,68,68,0.06)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    color: 'rgba(240,220,220,0.95)', fontSize: '0.85rem', outline: 'none',
                  }}
                />
              </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ucTab === 'company' ? (
                <>
                  {usersLoading && (
                    <p style={{ textAlign: 'center', color: 'rgba(180,150,150,0.55)', marginTop: 40, fontSize: '0.8rem' }}>Loading…</p>
                  )}
                  {!usersLoading && !usersError && companyAccounts.length === 0 && (
                    <p style={{ textAlign: 'center', color: 'rgba(180,150,150,0.5)', marginTop: 40, fontSize: '0.8rem' }}>No registered companies</p>
                  )}
                  {!usersLoading && companyAccounts
                    .filter(c => {
                      const q = supportUsersSearch.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        (c.username || '').toLowerCase().includes(q) ||
                        (c.name || '').toLowerCase().includes(q) ||
                        (c.email || '').toLowerCase().includes(q)
                      );
                    })
                    .map(c => {
                    const active = !c.isBanned;
                    return (
                      <div key={c.id} style={{
                        padding: '12px 14px', borderRadius: 14,
                        background: 'rgba(255,255,255,0.03)',
                        border: `1px solid ${active ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}`,
                        display: 'flex', flexDirection: 'column', gap: 8,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{
                            width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                            background: 'rgba(0,188,212,0.1)', border: '1px solid rgba(0,188,212,0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00BCD4',
                          }}>
                            <Building2 size={18} />
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: 'rgba(230,220,220,0.95)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              @{c.username || c.name || '—'}
                            </p>
                            <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: 'rgba(180,160,160,0.65)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {c.email || '—'}
                            </p>
                          </div>
                          <span style={{
                            fontSize: '0.62rem', fontWeight: 800, padding: '3px 8px', borderRadius: 8,
                            color: active ? '#22c55e' : '#ef4444',
                            background: active ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                          }}>
                            {active ? 'ACTIVE' : 'DEACTIVATED'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: 8 }}>
                          <motion.button
                            whileTap={{ scale: 0.97 }}
                            type="button"
                            disabled={companySavingId === c.id || active}
                            onClick={() => setCompanyActive(c.id, true)}
                            style={{
                              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                              padding: '9px', borderRadius: 10, cursor: 'pointer', border: '1px solid rgba(34,197,94,0.4)',
                              background: 'rgba(34,197,94,0.12)', color: '#22c55e', fontWeight: 800, fontSize: '0.74rem',
                              opacity: (companySavingId === c.id || active) ? 0.5 : 1,
                            }}
                          >
                            <CheckCircle size={14} /> Activate
                          </motion.button>
                          <motion.button
                            whileTap={{ scale: 0.97 }}
                            type="button"
                            disabled={companySavingId === c.id || !active}
                            onClick={() => setCompanyActive(c.id, false)}
                            style={{
                              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                              padding: '9px', borderRadius: 10, cursor: 'pointer', border: '1px solid rgba(239,68,68,0.4)',
                              background: 'rgba(239,68,68,0.12)', color: '#ef4444', fontWeight: 800, fontSize: '0.74rem',
                              opacity: (companySavingId === c.id || !active) ? 0.5 : 1,
                            }}
                          >
                            <XCircle size={14} /> Deactivate
                          </motion.button>
                        </div>
                      </div>
                    );
                  })}
                </>
              ) : (
              <>
              {usersLoading && (
                <p style={{ textAlign: 'center', color: 'rgba(180,150,150,0.55)', marginTop: 40, fontSize: '0.8rem' }}>جاري التحميل…</p>
              )}
              {!usersLoading && usersError && (
                <div style={{ margin: '20px 0', padding: '14px', borderRadius: 12, background: 'hsl(var(--destructive)/0.1)', border: '1px solid hsl(var(--destructive)/0.35)', color: 'hsl(var(--destructive))', fontSize: '0.78rem', textAlign: 'center' }}>
                  <p style={{ margin: '0 0 8px', fontWeight: 700 }}>فشل تحميل المستخدمين</p>
                  <p style={{ margin: '0 0 10px', opacity: 0.8, wordBreak: 'break-all' }}>{usersError}</p>
                  <button type="button" onClick={() => loadOwnerData()} style={{ background: 'hsl(var(--destructive)/0.2)', border: '1px solid hsl(var(--destructive)/0.4)', borderRadius: 8, padding: '6px 14px', color: 'hsl(var(--destructive))', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}>
                    إعادة المحاولة
                  </button>
                </div>
              )}
              {!usersLoading && !usersError && (ucTab === 'ban' ? banTabAccounts : regularAccounts)
                .filter(u => {
                  const q = supportUsersSearch.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    (u.username || '').toLowerCase().includes(q) ||
                    (u.name || '').toLowerCase().includes(q) ||
                    (u.email || '').toLowerCase().includes(q) ||
                    (u.lastIp || '').includes(q)
                  );
                })
                .map(u => {
                  const online = ownerPresence[u.id]?.online ?? false;
                  const color = (u as SupportCtrlUser).nameColor || '#00BCD4';
                  return (
                    <motion.button
                      key={u.id}
                      whileTap={{ scale: 0.98 }}
                      type="button"
                      onClick={() => {
                        setSupportCtrlUser({
                          ...u,
                          country: (u as SupportCtrlUser).country ?? null,
                          phone: (u as SupportCtrlUser).phone ?? null,
                          nameColor: (u as SupportCtrlUser).nameColor ?? null,
                          avatarUrl: (u as SupportCtrlUser).avatarUrl ?? null,
                          online,
                        });
                        setScUsername(u.username || '');
                        setScPassword('');
                        setScColor((u as SupportCtrlUser).nameColor || '#00BCD4');
                        setScMsg('');
                        setScEditBox(null);
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                        padding: '12px 14px', borderRadius: 14, cursor: 'pointer', textAlign: 'left',
                        background: u.isBanned ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${u.isBanned ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.08)'}`,
                        color: 'rgba(230,220,220,0.95)',
                      }}
                    >
                      <div style={{ position: 'relative', width: 42, height: 42, flexShrink: 0 }}>
                        <div style={{
                          width: 42, height: 42, borderRadius: '50%',
                          background: 'rgba(0,0,0,0.35)',
                          border: `2px solid ${color}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color, fontWeight: 800, fontSize: '0.8rem',
                          overflow: 'hidden',
                        }}>
                          {(u as SupportCtrlUser).avatarUrl
                            ? <img src={(u as SupportCtrlUser).avatarUrl!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : (u.username || u.name || u.email || '?')[0].toUpperCase()}
                        </div>
                        <span style={{
                          position: 'absolute', bottom: 0, right: 0, width: 11, height: 11, borderRadius: '50%',
                          background: online ? '#22c55e' : '#64748b',
                          border: '2px solid #0c0608',
                        }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          margin: 0, fontSize: '0.88rem', fontWeight: 700,
                          color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          @{u.username || '—'}
                        </p>
                        <p style={{
                          margin: '2px 0 0', color: 'rgba(180,160,160,0.65)', fontSize: '0.68rem',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {u.email}{u.lastIp ? ` · ${u.lastIp}` : ''}
                        </p>
                      </div>
                      {u.isBanned && (
                        <span style={{
                          fontSize: '0.6rem', fontWeight: 800, color: '#ef4444',
                          background: 'rgba(239,68,68,0.15)', padding: '3px 7px', borderRadius: 8,
                        }}>BAN</span>
                      )}
                    </motion.button>
                  );
                })}
              </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ Support: user detail + actions box ══ */}
      <AnimatePresence>
        {supportCtrlUser && (
          <motion.div
            key="support-ctrl-detail"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10380,
              background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            }}
            onClick={() => { setSupportCtrlUser(null); setScEditBox(null); }}
          >
            <motion.div
              initial={{ y: 40 }}
              animate={{ y: 0 }}
              exit={{ y: 60 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 480, maxHeight: '92dvh',
                overflowY: 'auto',
                background: 'linear-gradient(180deg, #1a1014 0%, #0c080a 100%)',
                borderTopLeftRadius: 22, borderTopRightRadius: 22,
                border: '1px solid rgba(239,68,68,0.3)',
                padding: '16px 16px max(20px, env(safe-area-inset-bottom))',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${supportCtrlUser.nameColor || 'hsl(var(--primary))'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: supportCtrlUser.nameColor || 'hsl(var(--primary))', fontWeight: 800, fontSize: '1rem',
                  background: 'rgba(0,0,0,0.35)',
                  overflow: 'hidden',
                }}>
                  {supportCtrlUser.avatarUrl
                    ? <img src={supportCtrlUser.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : (supportCtrlUser.username || supportCtrlUser.name || '?')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    margin: 0, fontWeight: 800, fontSize: '1rem',
                    color: supportCtrlUser.nameColor || 'hsl(var(--primary))',
                  }}>
                    @{supportCtrlUser.username || '—'}
                  </p>
                  <p style={{ margin: '2px 0 0', color: 'hsl(var(--muted-foreground))', fontSize: '0.72rem' }}>
                    {supportCtrlUser.name || 'بدون اسم'}
                  </p>
                </div>
                {/* View profile button */}
                {supportCtrlUser.username && (
                  <button
                    type="button"
                    title="عرض البروفايل"
                    onClick={() => {
                      setSupportCtrlUser(null);
                      setScEditBox(null);
                      navigate(`/u/${encodeURIComponent(supportCtrlUser.username!)}`);
                    }}
                    style={{
                      background: 'hsl(var(--primary) / 0.12)', border: '1px solid hsl(var(--primary) / 0.35)',
                      borderRadius: 10, padding: '6px 10px', cursor: 'pointer',
                      color: 'hsl(var(--primary))', display: 'flex', alignItems: 'center', gap: 5,
                      fontSize: '0.72rem', fontWeight: 700, flexShrink: 0,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                    بروفايل
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setSupportCtrlUser(null); setScEditBox(null); }}
                  style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', padding: 4 }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Info card */}
              <div style={{
                background: 'rgba(255,255,255,0.04)', borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.08)', padding: '12px 14px',
                display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14,
                fontSize: '0.78rem', color: 'rgba(220,200,200,0.9)',
              }}>
                {[
                  ['المعرّف', supportCtrlUser.id],
                  ['الإيميل', supportCtrlUser.email],
                  ['IP', supportCtrlUser.lastIp || '—'],
                  ['الدولة', supportCtrlUser.country || '—'],
                  ['الهاتف', supportCtrlUser.phone || '—'],
                  ['محظور', supportCtrlUser.isBanned ? 'نعم' : 'لا'],
                  ['تاريخ التسجيل', supportCtrlUser.createdAt ? new Date(supportCtrlUser.createdAt).toLocaleString('ar-KW') : '—'],
                  ['الحالة', supportCtrlUser.online ? '🟢 أونلاين' : '⚫ أوفلاين'],
                ].map(([k, v]) => (
                  <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: 'rgba(180,150,150,0.65)', flexShrink: 0 }}>{k}</span>
                    <span style={{ textAlign: 'right', wordBreak: 'break-all', fontWeight: 600 }}>{v as string}</span>
                  </div>
                ))}
              </div>

              {scMsg && (
                <p style={{
                  margin: '0 0 12px', textAlign: 'center', fontSize: '0.78rem', fontWeight: 600,
                  color: scMsg.includes('تم') || scMsg.toLowerCase().includes('ok') ? '#22c55e' : '#ef4444',
                }}>
                  {scMsg}
                </p>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <motion.button whileTap={{ scale: 0.98 }} type="button"
                  onClick={() => { setScEditBox(scEditBox === 'color' ? null : 'color'); setScMsg(''); }}
                  style={{
                    padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    background: 'rgba(0,188,212,0.1)', border: '1px solid rgba(0,188,212,0.35)',
                    color: '#00BCD4', fontWeight: 700, fontSize: '0.85rem',
                  }}>
                  🎨 تغيير لون اليوزر
                </motion.button>
                {scEditBox === 'color' && (
                  <div style={{
                    padding: 12, borderRadius: 12, background: 'rgba(0,0,0,0.35)',
                    border: '1px solid rgba(0,188,212,0.2)', display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    {/* Quick color swatches — each with instant activate button */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {([
                        ['#00BCD4','سماوي'],['#22c55e','أخضر'],['#eab308','ذهبي'],['#ef4444','أحمر'],
                        ['#a855f7','بنفسجي'],['#f97316','برتقالي'],['#ec4899','وردي'],['#3b82f6','أزرق'],
                        ['#ffffff','أبيض'],['#94a3b8','رمادي'],['#14b8a6','زمردي'],['#f43f5e','قرمزي'],
                      ] as [string, string][]).map(([c, label]) => (
                        <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => setScColor(c)}
                            style={{
                              width: 26, height: 26, borderRadius: '50%', background: c, cursor: 'pointer', flexShrink: 0,
                              border: scColor === c ? '2px solid #fff' : '2px solid transparent',
                              boxShadow: scColor === c ? '0 0 0 2px rgba(0,188,212,0.6)' : 'none',
                            }}
                          />
                          <span style={{ fontSize: '0.78rem', color: c, fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {label} — @{supportCtrlUser.username || 'user'}
                          </span>
                          <motion.button
                            whileTap={{ scale: 0.93 }}
                            type="button"
                            disabled={scSaving}
                            onClick={async () => {
                              setScColor(c);
                              setScSaving(true); setScMsg('');
                              const res = await patchSupportUser(supportCtrlUser.id, { nameColor: c, usernameColor: c, color: c });
                              setScSaving(false);
                              if (res) {
                                setScMsg('تم تفعيل اللون ✓');
                                setSupportCtrlUser(prev => prev ? { ...prev, nameColor: c } : prev);
                                setAllUsers(prev => prev.map(x => x.id === supportCtrlUser.id ? { ...x, nameColor: c } as typeof x & { nameColor?: string } : x));
                                setScEditBox(null);
                              } else setScMsg('فشل التفعيل');
                            }}
                            style={{
                              padding: '4px 10px', borderRadius: 8, border: `1px solid ${c}`,
                              background: `${c}22`, color: c, fontSize: '0.72rem', fontWeight: 700,
                              cursor: 'pointer', flexShrink: 0,
                            }}
                          >
                            {scSaving ? '…' : 'تفعيل'}
                          </motion.button>
                        </div>
                      ))}
                    </div>

                    {/* Custom color picker */}
                    <div style={{ borderTop: '1px solid hsl(var(--border))', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', fontWeight: 600 }}>لون مخصص</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <input type="color" value={scColor} onChange={e => setScColor(e.target.value)}
                          style={{ width: 44, height: 36, border: 'none', background: 'none', cursor: 'pointer' }} />
                        <input
                          value={scColor}
                          onChange={e => setScColor(e.target.value)}
                          placeholder="#00BCD4"
                          style={{
                            flex: 1, padding: '8px 10px', borderRadius: 8, outline: 'none',
                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                            color: '#fff', fontSize: '0.85rem',
                          }}
                        />
                      </div>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: scColor, fontWeight: 700 }}>
                        معاينة: @{supportCtrlUser.username || 'user'}
                      </p>
                      <motion.button whileTap={{ scale: 0.97 }} type="button" disabled={scSaving}
                        onClick={async () => {
                          setScSaving(true); setScMsg('');
                          const res = await patchSupportUser(supportCtrlUser.id, { nameColor: scColor, usernameColor: scColor, color: scColor });
                          setScSaving(false);
                          if (res) {
                            setScMsg('تم تفعيل اللون ✓');
                            setSupportCtrlUser(prev => prev ? { ...prev, nameColor: scColor } : prev);
                            setAllUsers(prev => prev.map(x => x.id === supportCtrlUser.id ? { ...x, nameColor: scColor } as typeof x & { nameColor?: string } : x));
                            setScEditBox(null);
                          } else setScMsg('فشل الحفظ — تحقق من صلاحيات السيرفر');
                        }}
                        style={{
                          padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                          background: scColor, color: '#041018', fontWeight: 800, fontSize: '0.85rem',
                        }}>
                        {scSaving ? '…' : 'تفعيل اللون المخصص'}
                      </motion.button>
                    </div>
                  </div>
                )}

                <motion.button whileTap={{ scale: 0.98 }} type="button"
                  onClick={() => { setScEditBox(scEditBox === 'username' ? null : 'username'); setScMsg(''); setScUsername(supportCtrlUser.username || ''); }}
                  style={{
                    padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.35)',
                    color: '#c084fc', fontWeight: 700, fontSize: '0.85rem',
                  }}>
                  ✏️ تعديل اليوزر
                </motion.button>
                {scEditBox === 'username' && (
                  <div style={{
                    padding: 12, borderRadius: 12, background: 'rgba(0,0,0,0.35)',
                    border: '1px solid rgba(168,85,247,0.2)', display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    <input
                      value={scUsername}
                      onChange={e => setScUsername(e.target.value)}
                      placeholder="اليوزر الجديد (حرف واحد فأكثر)"
                      style={{
                        padding: '10px 12px', borderRadius: 10, outline: 'none',
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                        color: '#fff', fontSize: '0.9rem',
                      }}
                    />
                    <motion.button whileTap={{ scale: 0.97 }} type="button" disabled={scSaving || !scUsername.trim()}
                      onClick={async () => {
                        const next = scUsername.trim().replace(/^@/, '');
                        if (!next) return;
                        setScSaving(true); setScMsg('');
                        const res = await patchSupportUser(supportCtrlUser.id, { username: next });
                        setScSaving(false);
                        if (res) {
                          setScMsg('تم حفظ اليوزر');
                          setSupportCtrlUser(prev => prev ? { ...prev, username: next } : prev);
                          setAllUsers(prev => prev.map(x => x.id === supportCtrlUser.id ? { ...x, username: next } : x));
                          setScEditBox(null);
                        } else setScMsg('فشل الحفظ — قد يكون اليوزر مستخدماً');
                      }}
                      style={{
                        padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                        background: '#a855f7', color: '#fff', fontWeight: 800, fontSize: '0.85rem',
                        opacity: !scUsername.trim() ? 0.5 : 1,
                      }}>
                      {scSaving ? '…' : 'حفظ اليوزر'}
                    </motion.button>
                  </div>
                )}

                <motion.button whileTap={{ scale: 0.98 }} type="button"
                  onClick={() => { setScEditBox(scEditBox === 'password' ? null : 'password'); setScMsg(''); setScPassword(''); }}
                  style={{
                    padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.35)',
                    color: '#eab308', fontWeight: 700, fontSize: '0.85rem',
                  }}>
                  🔑 تغيير كلمة المرور (بدون معرفة القديمة)
                </motion.button>
                {scEditBox === 'password' && (
                  <div style={{
                    padding: 12, borderRadius: 12, background: 'rgba(0,0,0,0.35)',
                    border: '1px solid rgba(234,179,8,0.2)', display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    <input
                      type="text"
                      value={scPassword}
                      onChange={e => setScPassword(e.target.value)}
                      placeholder="كلمة المرور الجديدة"
                      style={{
                        padding: '10px 12px', borderRadius: 10, outline: 'none',
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                        color: '#fff', fontSize: '0.9rem',
                      }}
                    />
                    <motion.button whileTap={{ scale: 0.97 }} type="button" disabled={scSaving || scPassword.length < 1}
                      onClick={async () => {
                        if (!scPassword) return;
                        setScSaving(true); setScMsg('');
                        const res = await patchSupportUser(supportCtrlUser.id, {
                          password: scPassword,
                          newPassword: scPassword,
                          forcePassword: scPassword,
                        });
                        setScSaving(false);
                        if (res) {
                          setScMsg('تم تغيير كلمة المرور');
                          setScPassword('');
                          setScEditBox(null);
                        } else setScMsg('فشل الحفظ — تحقق من صلاحيات السيرفر');
                      }}
                      style={{
                        padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                        background: '#eab308', color: '#1a1400', fontWeight: 800, fontSize: '0.85rem',
                        opacity: scPassword.length < 1 ? 0.5 : 1,
                      }}>
                      {scSaving ? '…' : 'حفظ كلمة المرور'}
                    </motion.button>
                  </div>
                )}

                <motion.button whileTap={{ scale: 0.98 }} type="button" disabled={scSaving}
                  onClick={async () => {
                    const next = !supportCtrlUser.isBanned;
                    if (next && !window.confirm(`حظر @${supportCtrlUser.username || supportCtrlUser.email} وطرده من التطبيق؟`)) return;
                    setScSaving(true); setScMsg('');
                    const res = await patchSupportUser(supportCtrlUser.id, { isBanned: next, banned: next });
                    setScSaving(false);
                    if (res) {
                      setScMsg(next ? 'تم الحظر' : 'تم رفع الحظر');
                      setSupportCtrlUser(prev => prev ? { ...prev, isBanned: next } : prev);
                      setAllUsers(prev => prev.map(x => x.id === supportCtrlUser.id ? { ...x, isBanned: next } : x));
                      if (next) addToBanHistory(supportCtrlUser.id);
                    } else setScMsg('فشل تنفيذ الحظر');
                  }}
                  style={{
                    padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    background: supportCtrlUser.isBanned ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                    border: `1px solid ${supportCtrlUser.isBanned ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
                    color: supportCtrlUser.isBanned ? '#22c55e' : '#ef4444',
                    fontWeight: 800, fontSize: '0.85rem',
                  }}>
                  {supportCtrlUser.isBanned ? '✅ رفع الحظر' : '🚫 حظر / طرد من التطبيق'}
                </motion.button>

                {banHistoryIds.includes(supportCtrlUser.id) && (
                  <motion.button whileTap={{ scale: 0.98 }} type="button" disabled={deletingUserId === supportCtrlUser.id}
                    onClick={async () => {
                      if (!window.confirm(`حذف حساب @${supportCtrlUser.username || supportCtrlUser.email} نهائيًا من التطبيق؟`)) return;
                      setScMsg('');
                      const ok = await deleteOwnerAccount(supportCtrlUser.id);
                      if (ok) {
                        setScMsg('تم حذف الحساب');
                        setSupportCtrlUser(null);
                      } else setScMsg('فشل حذف الحساب');
                    }}
                    style={{
                      padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                      background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.5)',
                      color: '#ef4444', fontWeight: 800, fontSize: '0.85rem',
                      opacity: deletingUserId === supportCtrlUser.id ? 0.6 : 1,
                    }}>
                    {deletingUserId === supportCtrlUser.id ? '…' : '🗑️ حذف الحساب نهائيًا من التطبيق'}
                  </motion.button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Music modal — from profile Music button ── */}
      <AnimatePresence>
        {musicModalOpen && (
          <SettingsMusicSearchModal
            onClose={() => setMusicModalOpen(false)}
            currentTrack={musicCurrentTrack}
            isPlaying={musicIsPlaying}
            onPlayTrack={handleMusicPlayTrack}
            favorites={musicFavorites}
            onToggleFavorite={handleMusicToggleFavorite}
          />
        )}
      </AnimatePresence>
    </>;
}