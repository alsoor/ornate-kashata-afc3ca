import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Send, Clock, PenLine, Image as ImageIcon, Camera as CameraIcon, FileUp, ChevronLeft, X as XIcon, RefreshCw, Zap, ZapOff } from 'lucide-react';
import { detectWallpaperIntent, searchWallpapers } from './wallpaperSearch'; // PHOTO-SEARCH

interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  previewUrl: string;
  kind: 'image' | 'file';
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type?: 'text' | 'image' | 'table' | 'file' | 'gallery';
  data?: any;
  attachments?: Attachment[];
  timestamp: number;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
}

interface StooornaAiSheetProps {
  open: boolean;
  onClose: () => void;
  user?: {
    id?: string;
    name?: string | null;
    username?: string | null;
    avatarUrl?: string | null;
    image?: string | null;
  } | null;
}

const DARK_GREEN = '#0a1f1a';
const DARKER_GREEN = '#04120f';
const RED = '#ef4444';
const CHATS_KEY = 'stooorna_ai_chats_v1';

function loadChats(): ChatSession[] {
  try {
    const raw = localStorage.getItem(CHATS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveChats(chats: ChatSession[]) {
  try {
    const slim = chats.slice(0, 50).map(c => ({
      ...c,
      messages: (c.messages || []).map(m => ({
        ...m,
        data: m.data && typeof m.data.url === 'string' && m.data.url.startsWith('data:') ? { ...m.data, url: '' } : m.data,
        attachments: m.attachments?.map(a => ({
          ...a,
          previewUrl: a.kind === 'image' ? '' : a.previewUrl,
        })),
      })),
    }));
    localStorage.setItem(CHATS_KEY, JSON.stringify(slim));
  } catch { /* */ }
}


/**
 * Where the Ai backend lives.
 * Priority: window.__STOOORNA_AI_API__  >  VITE_AI_API_URL  >  localhost (dev)  >  same-origin /ai (production)
 */
const DEFAULT_AI_API = 'https://welcoming-heart-production.up.railway.app/ai';

function getAiApiBase(): string {
  try {
    const w: any = typeof window !== 'undefined' ? window : {};
    if (w.__STOOORNA_AI_API__) return String(w.__STOOORNA_AI_API__).replace(/\/+$/, '');
    const envUrl = (import.meta as any)?.env?.VITE_AI_API_URL;
    if (envUrl) return String(envUrl).replace(/\/+$/, '');
    const host = w.location?.hostname || '';
    const port = w.location?.port || '';
    // Local dev server only (has a port). Mobile app shells use localhost without a port.
    if ((host === 'localhost' || host === '127.0.0.1') && port) return 'http://127.0.0.1:8000/ai';
  } catch { /* */ }
  return DEFAULT_AI_API;
}

function pickReply(data: any): string {
  if (!data) return '';
  const v = data.reply ?? data.response ?? data.answer ?? data.message ?? data.text ?? data.content ?? '';
  return (typeof v === 'string' ? v : JSON.stringify(v)).trim();
}

export function buildLocalReply(userText: string, hasFiles: boolean): string {
  const t = userText.toLowerCase().trim();
  const ar = /[\u0600-\u06FF]/.test(userText);

  if (hasFiles) {
    return ar
      ? 'تم استلام المرفق. اكتب ماذا تريد: وصف، تلخيص، أو أفكار.'
      : 'Attachment received. Tell me what you need: describe, summarize, or ideas.';
  }
  if (!t) {
    return ar ? 'اكتب سؤالك وسأجيبك.' : 'Type your question and I will answer.';
  }
  if (/^(hi|hello|hey)\b/.test(t) || /^(السلام|مرحبا|مرحباً|هلا|اهلا|أهلا|هاي)/.test(t)) {
    return ar
      ? 'مرحباً! أنا Stooorna Ai. اسألني أي شيء أو أرفق صورة/ملف.'
      : 'Hi! I am Stooorna Ai. Ask me anything or attach a photo/file.';
  }
  if (t.includes('من انت') || t.includes('من أنت') || t.includes('who are you')) {
    return ar
      ? 'أنا Stooorna Ai، مساعدك داخل Stooorna.'
      : 'I am Stooorna Ai, your assistant inside Stooorna.';
  }
  if (t.includes('شكرا') || t.includes('thank')) {
    return ar ? 'العفو! جاهز لأي طلب.' : 'You are welcome!';
  }
  if (t.includes('جدول') || t.includes('table')) {
    return ar
      ? 'جدول سريع:\n\n| العنصر | الحالة |\n| --- | --- |\n| البث | نشط |\n| Ai | يعمل |'
      : 'Quick table:\n\n| Item | Status |\n| --- | --- |\n| Live | Active |\n| Ai | On |';
  }
  if (t.includes('؟') || t.includes('?') || /^(how|what|why|when|where|هل|كيف|لماذا|متى|وين|وش)/.test(t)) {
    return ar
      ? `بخصوص: «${userText.slice(0, 200)}»\n\nأقدر أساعدك بشرح مبسط وخطوات عملية. أضف تفاصيل أكثر للجواب الأدق.`
      : `About: "${userText.slice(0, 200)}"\n\nI can explain simply and give practical steps. Add more detail for a sharper answer.`;
  }
  return ar
    ? `فهمت: «${userText.slice(0, 280)}»\n\nتم تسجيل طلبك. أكمل التفاصيل أو اطلب الخطوة التالية وسأكمل.`
    : `Got it: "${userText.slice(0, 280)}"\n\nRequest noted. Add detail or the next step and I will continue.`;
}

/** Stooorna Ai logo (round, transparent background). */
const AI_LOGO_SRC = 'data:image/png;base64,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';

/** Small Ai logo shown above each reply. Animates (shrinks / grows) while the Ai is answering. */
function AiMark({ size = 24, animate = false }: { size?: number; animate?: boolean }) {
  return (
    <img
      src={AI_LOGO_SRC}
      alt=""
      aria-hidden="true"
      draggable={false}
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'block',
        objectFit: 'contain',
        userSelect: 'none',
        animation: animate ? 'stooornaAiMarkPulse 1.4s ease-in-out infinite' : undefined,
        transformOrigin: '50% 50%',
      }}
    />
  );
}

/** Removes the repeated "Stooorna" / "Stooorna Ai" name from replies (unless the user asked about it). */
function cleanReply(reply: string, userText: string): string {
  const nameRe = /stoo+rna(\s*ai)?/i;
  if (!reply || !nameRe.test(reply)) return reply;
  if (nameRe.test(userText || '')) return reply;
  if (/(من\s*(انت|أنت|إنت)|مين\s*(انت|أنت)|وش\s*اسمك|ما\s*اسمك|اسمك|who\s*are\s*you|your\s*name|what\s*are\s*you)/i.test(userText || '')) return reply;
  // 1) leading labels like "Stooorna Ai:" / "[Stooorna]"
  let out = reply
    .replace(/^\s*[\[\(*_]*\s*stoo+rna(\s*ai)?\s*[\]\)*_]*\s*[:：\-–—]\s*/gim, '');
  // 2) drop sentences that only introduce the name
  if (nameRe.test(out)) {
    const parts = out.split(/(?<=[.!?؟…\n])\s+/);
    const kept = parts.filter(x => !nameRe.test(x));
    if (kept.join('').trim()) out = kept.join(' ');
    else out = out.replace(/stoo+rna(\s*ai)?/gi, '').replace(/\s{2,}/g, ' ');
  }
  return out.replace(/[ \t]+\n/g, '\n').trim() || reply;
}

/** Camera card (same look as the reference): back / shutter / 3-dots; dots open flash + flip + close. */
function CameraCapture({ onClose, onCapture }: { onClose: () => void; onCapture: (file: File) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const holdTimer = useRef<number>(0);
  const recTick = useRef<number>(0);
  const holdFired = useRef(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [menuOpen, setMenuOpen] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [torchOk, setTorchOk] = useState(false);
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [error, setError] = useState('');
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setVideoReady(false);
    setFlashOn(false);
    setTorchOk(false);
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera');
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing } }, audio: true });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing } }, audio: false });
        }
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) { v.srcObject = stream; void v.play().catch(() => {}); }
        try {
          const caps: any = (stream.getVideoTracks()[0] as any)?.getCapabilities?.() || {};
          setTorchOk(!!caps.torch);
        } catch { /* */ }
      } catch {
        if (!cancelled) setError('Camera not available');
      }
    };
    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, [facing]);

  useEffect(() => () => {
    window.clearTimeout(holdTimer.current);
    window.clearInterval(recTick.current);
    try { if (recRef.current && recRef.current.state === 'recording') { recRef.current.onstop = null; recRef.current.stop(); } } catch { /* */ }
  }, []);

  const toggleFlash = async () => {
    const next = !flashOn;
    try {
      const track: any = streamRef.current?.getVideoTracks()[0];
      if (track && torchOk) {
        await track.applyConstraints({ advanced: [{ torch: next }] });
        setFlashOn(next);
      }
    } catch { /* */ }
  };

  const takePhoto = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height);
    c.toBlob(b => {
      if (b) onCapture(new File([b], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      onClose();
    }, 'image/jpeg', 0.9);
  };

  const stopRec = () => {
    window.clearInterval(recTick.current);
    setRecording(false);
    try { if (recRef.current && recRef.current.state === 'recording') recRef.current.stop(); } catch { /* */ }
  };

  const startRec = () => {
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === 'undefined') return;
    let mime = '';
    for (const m of ['video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm']) {
      if ((MediaRecorder as any).isTypeSupported?.(m)) { mime = m; break; }
    }
    try {
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const type = rec.mimeType || 'video/webm';
        const blob = new Blob(chunksRef.current, { type });
        const ext = type.includes('mp4') ? 'mp4' : 'webm';
        if (blob.size) onCapture(new File([blob], `video-${Date.now()}.${ext}`, { type }));
        onClose();
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
      setSecs(0);
      let n = 0;
      recTick.current = window.setInterval(() => {
        n += 1;
        setSecs(n);
        if (n >= 30) stopRec();
      }, 1000);
    } catch { /* */ }
  };

  const onShutterDown = () => {
    holdFired.current = false;
    window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => { holdFired.current = true; startRec(); }, 450);
  };
  const onShutterUp = () => {
    window.clearTimeout(holdTimer.current);
    if (holdFired.current) { holdFired.current = false; stopRec(); return; }
    takePhoto();
  };

  const roundBtn: React.CSSProperties = {
    width: 52, height: 52, borderRadius: '50%', border: 'none',
    background: '#0a0a0a', color: '#fff', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    WebkitTapHighlightColor: 'transparent',
  };

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 24500, background: 'rgba(0,0,0,0.18)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute', left: 12, right: 12,
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
          height: '58dvh', maxWidth: 560, margin: '0 auto',
          borderRadius: 44, overflow: 'hidden',
          background: 'radial-gradient(circle at 50% 72%, #7c0a00 0%, #4a0807 55%, #2e0614 100%)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
          animation: 'stooornaAiAttachUp 0.3s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          controls={false}
          disablePictureInPicture
          disableRemotePlayback
          poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
          onPlaying={() => setVideoReady(true)}
          onLoadedData={() => setVideoReady(true)}
          className="stooorna-ai-cam-video"
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
            transform: facing === 'user' ? 'scaleX(-1)' : undefined,
            opacity: videoReady ? 1 : 0,
            pointerEvents: 'none',
          }}
        />
        <style>{`
          .stooorna-ai-cam-video::-webkit-media-controls,
          .stooorna-ai-cam-video::-webkit-media-controls-panel,
          .stooorna-ai-cam-video::-webkit-media-controls-start-playback-button,
          .stooorna-ai-cam-video::-webkit-media-controls-overlay-play-button,
          .stooorna-ai-cam-video::-webkit-media-controls-enclosure {
            display: none !important;
            -webkit-appearance: none !important;
            opacity: 0 !important;
          }
        `}</style>
        {error && (
          <p style={{ position: 'absolute', top: '42%', left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.8)', fontSize: 14, margin: 0 }}>{error}</p>
        )}
        {recording && (
          <div style={{ position: 'absolute', top: 18, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
            <span style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', borderRadius: 999, padding: '5px 12px', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
              {`0:${String(secs).padStart(2, '0')}`}
            </span>
          </div>
        )}

        {/* flash + flip (shown after tapping the three dots) */}
        {menuOpen && (
          <div style={{ position: 'absolute', right: 26, bottom: 130, display: 'flex', flexDirection: 'column', gap: 22 }}>
            <button type="button" aria-label="Flash" onClick={() => { void toggleFlash(); }} style={{ ...roundBtn, opacity: torchOk ? 1 : 0.7 }}>
              {flashOn ? <Zap size={22} strokeWidth={2.2} /> : <ZapOff size={22} strokeWidth={2.2} />}
            </button>
            <button type="button" aria-label="Flip camera" onClick={() => setFacing(f => (f === 'environment' ? 'user' : 'environment'))} style={roundBtn}>
              <RefreshCw size={22} strokeWidth={2.2} />
            </button>
          </div>
        )}

        {/* bottom row */}
        <div style={{ position: 'absolute', left: 26, right: 26, bottom: 26, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button type="button" aria-label="Back" onClick={onClose} style={roundBtn}>
            <ChevronLeft size={26} strokeWidth={2.2} />
          </button>

          <button
            type="button"
            aria-label="Capture"
            onPointerDown={onShutterDown}
            onPointerUp={onShutterUp}
            onPointerCancel={() => { window.clearTimeout(holdTimer.current); if (holdFired.current) { holdFired.current = false; stopRec(); } }}
            onContextMenu={e => e.preventDefault()}
            style={{
              width: 112, height: 112, borderRadius: '50%', border: 'none', padding: 0,
              background: recording ? '#7f1d1d' : '#0a0a0a', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              touchAction: 'none', WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{ width: 94, height: 94, borderRadius: recording ? 26 : '50%', background: recording ? '#ef4444' : '#fff', transition: 'all 0.15s ease', display: 'block' }} />
          </button>

          <button type="button" aria-label={menuOpen ? 'Close options' : 'More'} onClick={() => setMenuOpen(v => !v)} style={roundBtn}>
            {menuOpen ? (
              <XIcon size={24} strokeWidth={2.2} />
            ) : (
              <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[0, 1, 2].map(i => <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff', display: 'block' }} />)}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function StooornaAiSheet({ open, onClose, user }: StooornaAiSheetProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [photoViewer, setPhotoViewer] = useState<{ thumb: string; full: string; credit?: string } | null>(null); // PHOTO-VIEWER
  const [showHistory, setShowHistory] = useState(false);
  const [chats, setChats] = useState<ChatSession[]>(() => loadChats());
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachMenu, setAttachMenu] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const avatar = user?.avatarUrl || user?.image || null;
  const displayName = user?.name || user?.username || 'You';

  useEffect(() => {
    saveChats(chats);
  }, [chats]);

  useEffect(() => {
    // Keyboard no longer opens automatically; it opens only when the user taps the input.
    if (!open) { setShowHistory(false); setAttachMenu(false); setCameraOpen(false); }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const syncChat = useCallback((chatId: string, msgs: Message[]) => {
    const title = (msgs[0]?.content || 'Chat').slice(0, 40);
    setChats(prev => {
      const exists = prev.find(c => c.id === chatId);
      if (exists) return prev.map(c => (c.id === chatId ? { ...c, messages: msgs, title } : c));
      return [{ id: chatId, title, messages: msgs }, ...prev];
    });
  }, []);

  const createNewChat = () => {
    if (messages.length > 0 && currentChatId) {
      syncChat(currentChatId, messages);
    }
    setCurrentChatId(`chat-${Date.now()}`);
    setMessages([]);
    setShowHistory(false);
    setAttachments([]);
  };

  const loadChat = (chat: ChatSession) => {
    setCurrentChatId(chat.id);
    setMessages(chat.messages || []);
    setShowHistory(false);
  };

  const deleteChat = (chatId: string) => {
    setChats(prev => prev.filter(c => c.id !== chatId));
    if (currentChatId === chatId) {
      setMessages([]);
      setCurrentChatId(null);
    }
  };

  const clearAllHistory = () => {
    setChats([]);
    try { localStorage.removeItem(CHATS_KEY); } catch { /* */ }
  };

  const deleteCurrentConversation = () => {
    if (currentChatId) deleteChat(currentChatId);
    else setMessages([]);
    setShowHistory(false);
  };

  const closePopups = () => {
    setShowHistory(false);
    setAttachMenu(false);
  };

  const addFiles = (files: FileList | File[] | null) => {
    if (!files || !files.length) return;
    const next: Attachment[] = [];
    Array.from(files).forEach(file => {
      if (file.size > 12 * 1024 * 1024) return;
      const isImage = file.type.startsWith('image/');
      next.push({
        id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        mime: file.type || 'application/octet-stream',
        size: file.size,
        previewUrl: URL.createObjectURL(file),
        kind: isImage ? 'image' : 'file',
      });
    });
    if (next.length) setAttachments(prev => [...prev, ...next].slice(0, 8));
  };

  /** Put a generated image back into the input so the user can edit it again. */
  const reuseImage = async (url: string) => {
    try {
      const blob = await (await fetch(url)).blob();
      addFiles([new File([blob], `edit-${Date.now()}.png`, { type: blob.type || 'image/png' })]);
      inputRef.current?.focus();
    } catch { /* */ }
  };

  const downloadImage = (url: string) => {
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = `stooorna-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch { /* */ }
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => {
      const gone = prev.find(a => a.id === id);
      if (gone?.previewUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(gone.previewUrl); } catch { /* */ }
      }
      return prev.filter(a => a.id !== id);
    });
  };

  const sendMessage = (text: string) => {
    const trimmed = (text || '').trim();
    const pending = attachments;
    if (!trimmed && pending.length === 0) return;
    if (isTyping) return;

    closePopups();

    const content =
      trimmed ||
      pending.map(a => (a.kind === 'image' ? `[Image: ${a.name}]` : `[File: ${a.name}]`)).join(' ');

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content,
      type: pending.some(a => a.kind === 'image') ? 'image' : pending.length ? 'file' : 'text',
      attachments: pending.length ? [...pending] : undefined,
      timestamp: Date.now(),
    };

    const chatId = currentChatId || `chat-${Date.now()}`;
    if (!currentChatId) setCurrentChatId(chatId);

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    syncChat(chatId, nextMessages);
    setInput('');
    setAttachments([]);
    setIsTyping(true);

    // Real answer from the Stooorna Ai backend (no fake canned replies)
    const apiBase = getAiApiBase();
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? window.setTimeout(() => controller.abort(), 90000) : 0;
    const ar = /[\u0600-\u06FF]/.test(content);

    const pushAi = (text: string, imageUrl?: string) => {
      const aiMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: text,
        type: imageUrl ? 'image' : 'text',
        data: imageUrl ? { url: imageUrl } : undefined,
        timestamp: Date.now(),
      };
      setMessages(prev => {
        const withAi = [...prev, aiMsg];
        syncChat(chatId, withAi);
        return withAi;
      });
    };

    // PHOTO-SEARCH: "ابي صور سيارات" -> photos from Pixabay shown inside the chat
    const photoIntent = pending.length === 0 ? detectWallpaperIntent(trimmed) : null;
    if (photoIntent) {
      void (async () => {
        try {
          const { hits } = await searchWallpapers(photoIntent);
          const aiMsg: Message = {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: ar ? `هذي صور «${photoIntent.display}»:` : `Here are photos of "${photoIntent.display}":`,
            type: 'gallery',
            data: { photos: hits.slice(0, 8) },
            timestamp: Date.now(),
          };
          setMessages(prev => {
            const withAi = [...prev, aiMsg];
            syncChat(chatId, withAi);
            return withAi;
          });
        } catch (err) {
          console.error('[Stooorna Ai] photo search error:', err);
          pushAi(ar ? '⚠️ ما لقيت صور لهالطلب. جرّب كلمات ثانية.' : '⚠️ No photos found. Try different words.');
        } finally {
          if (timer) window.clearTimeout(timer);
          setIsTyping(false);
        }
      })();
      return;
    }

    // Photos attached → image edit / image question (Gemini image model on the backend)
    const imgAtts = pending.filter(a => a.kind === 'image' && a.previewUrl);
    if (imgAtts.length) {
      void (async () => {
        try {
          const fd = new FormData();
          fd.append('prompt', trimmed);
          for (const a of imgAtts.slice(0, 3)) {
            const blob = await (await fetch(a.previewUrl)).blob();
            fd.append('images', new File([blob], a.name || 'image.jpg', { type: a.mime && a.mime.startsWith('image/') ? a.mime : blob.type || 'image/jpeg' }));
          }
          const r = await fetch(`${apiBase}/image-edit`, { method: 'POST', body: fd, signal: controller?.signal });
          if (!r.ok) {
            let detail = '';
            try { detail = (await r.text()).slice(0, 200); } catch { /* */ }
            throw new Error(`HTTP ${r.status} ${detail}`);
          }
          const data = await r.json();
          const text = cleanReply(String(data?.reply || '').trim(), content);
          const url = data?.image_base64 ? `data:${data.image_mime || 'image/png'};base64,${data.image_base64}` : '';
          if (!text && !url) throw new Error('empty reply');
          pushAi(text, url || undefined);
        } catch (err) {
          console.error('[Stooorna Ai] image error:', err);
          const why = String((err && (err as any).message) || err).slice(0, 120);
          pushAi(
            (ar
              ? '⚠️ تعذر تعديل الصورة حالياً. حاول مرة ثانية بعد شوي.'
              : '⚠️ Could not process the image right now. Please try again shortly.') + ` [${why}]`
          );
        } finally {
          if (timer) window.clearTimeout(timer);
          setIsTyping(false);
        }
      })();
      return;
    }

    fetch(`${apiBase}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: content,
        history: nextMessages.slice(-12, -1).map(m => ({ role: m.role, content: m.content })),
      }),
      signal: controller?.signal,
    })
      .then(async r => {
        if (!r.ok) {
          let detail = '';
          try { detail = (await r.text()).slice(0, 200); } catch { /* */ }
          throw new Error(`HTTP ${r.status} ${detail}`);
        }
        return r.json();
      })
      .then(data => {
        const reply = cleanReply(pickReply(data), content);
        if (!reply) throw new Error('empty reply');
        pushAi(reply);
      })
      .catch(err => {
        console.error('[Stooorna Ai] backend error:', err);
        const why = String((err && (err as any).message) || err).slice(0, 80);
        pushAi(
          (ar
            ? '⚠️ تعذر الاتصال بخادم Stooorna Ai حالياً. حاول مرة ثانية بعد شوي.'
            : '⚠️ Could not reach the Stooorna Ai server right now. Please try again shortly.') + ` [${why}]`
        );
      })
      .finally(() => {
        if (timer) window.clearTimeout(timer);
        setIsTyping(false);
      });
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    sendMessage(input);
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 24000,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          height: '92dvh',
          background: '#ffffff',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 -12px 40px rgba(0,0,0,0.35)',
          animation: 'stooornaAiSheetUp 0.38s cubic-bezier(0.22,1,0.36,1)',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            paddingTop: 'max(12px, env(safe-area-inset-top))',
            borderBottom: '1px solid rgba(0,0,0,0.06)',
            background: '#fff',
            position: 'relative',
            zIndex: 5,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative' }}>
              {avatar ? (
                <img
                  src={avatar}
                  alt={displayName}
                  style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                <div
                  style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: DARK_GREEN, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 14,
                  }}
                >
                  {(displayName[0] || 'S').toUpperCase()}
                </div>
              )}
              <span
                style={{
                  position: 'absolute', bottom: 0, right: 0, width: 10, height: 10,
                  background: '#22c55e', borderRadius: '50%', border: '2px solid #fff',
                }}
              />
            </div>
          </div>

          <div
            style={{
              position: 'relative',
              background: '#0a0a0a',
              color: '#fff',
              padding: '6px 16px',
              borderRadius: 20,
              fontWeight: 800,
              fontSize: 14,
              letterSpacing: '0.02em',
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
            }}
          >
            <span style={{ position: 'relative', zIndex: 1, color: '#e8eaed' }}>Stooorna Ai</span>
            <span
              aria-hidden="true"
              style={{
                position: 'absolute', top: 0, bottom: 0, left: 0, width: '60%',
                zIndex: 2, pointerEvents: 'none',
                background:
                  'linear-gradient(105deg, rgba(255,255,255,0) 0%, rgba(210,215,222,0.55) 45%, rgba(255,255,255,0.85) 50%, rgba(210,215,222,0.55) 55%, rgba(255,255,255,0) 100%)',
                transform: 'translateX(-120%) skewX(-18deg)',
                animation: 'stooornaAiShine 2.8s ease-in-out infinite',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => setShowHistory(v => !v)}
              aria-label="History"
              style={{
                width: 34, height: 34, borderRadius: 10, border: 'none',
                background: showHistory ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.04)',
                color: '#333', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Clock size={18} />
            </button>
            <button
              type="button"
              onClick={createNewChat}
              aria-label="New chat"
              style={{
                width: 34, height: 34, borderRadius: 10, border: 'none',
                background: 'rgba(0,0,0,0.04)', color: '#333', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <PenLine size={18} />
            </button>
          </div>
        </div>

        {/* Full-sheet dim layer: tap anywhere closes history */}
        {showHistory && (
          <div
            role="presentation"
            onClick={closePopups}
            onTouchEnd={e => { e.preventDefault(); closePopups(); }}
            style={{
              position: 'absolute',
              left: 0, right: 0, top: 0, bottom: 0,
              zIndex: 20,
              background: 'rgba(0,0,0,0.25)',
            }}
          />
        )}

        {/* History panel */}
        {showHistory && (
          <div
            style={{
              position: 'absolute',
              top: 58, right: 10, zIndex: 30,
              width: 280, maxHeight: '55%', overflowY: 'auto',
              background: '#fff', borderRadius: 14,
              boxShadow: '0 10px 28px rgba(0,0,0,0.2)',
              border: '1px solid rgba(0,0,0,0.08)',
              padding: 10,
            }}
            onClick={e => e.stopPropagation()}
            onTouchEnd={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 14, color: '#222' }}>Previous chats</p>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {chats.length > 0 && (
                  <button
                    type="button"
                    onClick={clearAllHistory}
                    style={{
                      border: 'none', background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                      fontSize: 11, fontWeight: 800, cursor: 'pointer',
                      padding: '5px 8px', borderRadius: 8,
                    }}
                  >
                    Delete all
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Close"
                  onClick={closePopups}
                  style={{
                    width: 28, height: 28, border: 'none', borderRadius: 8,
                    background: 'rgba(0,0,0,0.06)', color: '#333', cursor: 'pointer',
                    fontSize: 16, lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            {chats.length === 0 && (
              <p style={{ margin: '10px 4px', color: '#888', fontSize: 13 }}>No history yet</p>
            )}

            {chats.map(c => (
              <div
                key={c.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  borderRadius: 10, padding: 2,
                  background: c.id === currentChatId ? 'rgba(0,0,0,0.05)' : 'transparent',
                }}
              >
                <button
                  type="button"
                  onClick={() => loadChat(c)}
                  style={{
                    flex: 1, textAlign: 'left', padding: '10px 10px',
                    border: 'none', background: 'transparent', borderRadius: 8,
                    cursor: 'pointer', fontSize: 13, color: '#222',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {c.title || 'Chat'}
                </button>
                <button
                  type="button"
                  aria-label="Delete chat"
                  onClick={() => deleteChat(c.id)}
                  style={{
                    width: 32, height: 32, border: 'none', borderRadius: 8,
                    background: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer',
                    fontSize: 18, lineHeight: 1, flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </div>
            ))}

            {messages.length > 0 && (
              <button
                type="button"
                onClick={deleteCurrentConversation}
                style={{
                  width: '100%', marginTop: 10, padding: '10px',
                  border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10,
                  background: 'rgba(239,68,68,0.06)', color: '#ef4444',
                  fontSize: 12, fontWeight: 800, cursor: 'pointer',
                }}
              >
                Delete current chat
              </button>
            )}
          </div>
        )}

        {/* Messages — tap also closes history */}
        <div
          onClick={closePopups}
          style={{
            flex: 1, overflowY: 'auto', padding: '24px 16px',
            display: 'flex', flexDirection: 'column', gap: 16,
          }}
        >
          {messages.length === 0 && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', textAlign: 'center' }}>
                How can I help you?
              </p>
            </div>
          )}

          {messages.map(m => (
            <div
              key={m.id}
              style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
                gap: 6,
              }}
            >
              {m.role === 'assistant' && <AiMark size={24} />}
            <div
              style={{
                maxWidth: '100%',
                padding: '10px 14px',
                borderRadius: 16,
                background: m.role === 'user' ? DARK_GREEN : '#f4f4f5',
                color: m.role === 'user' ? '#fff' : '#1a1a1a',
                fontSize: 15,
                lineHeight: 1.45,
                whiteSpace: 'pre-wrap',
              }}
            >
              {m.content}
              {m.attachments && m.attachments.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {m.attachments.map(a =>
                    a.kind === 'image' && a.previewUrl ? (
                      <img
                        key={a.id}
                        src={a.previewUrl}
                        alt={a.name}
                        style={{ maxWidth: 180, maxHeight: 160, borderRadius: 10, objectFit: 'cover' }}
                      />
                    ) : (
                      <span
                        key={a.id}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '8px 10px', borderRadius: 10,
                          background: m.role === 'user' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)',
                          fontSize: 13,
                        }}
                      >
                        📎 {a.name}
                      </span>
                    )
                  )}
                </div>
              )}
              {m.type === 'image' && m.data?.url && (
                <>
                  <img
                    src={m.data.url}
                    alt="generated"
                    style={{ width: '100%', borderRadius: 10, marginTop: 8, display: 'block' }}
                  />
                  {m.role === 'assistant' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={() => { void reuseImage(m.data.url); }}
                        style={{ border: 'none', background: '#0a1f1a', color: '#fff', borderRadius: 999, padding: '6px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadImage(m.data.url)}
                        style={{ border: '1px solid rgba(0,0,0,0.15)', background: '#fff', color: '#111', borderRadius: 999, padding: '6px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                      >
                        Save
                      </button>
                    </div>
                  )}
                </>
              )}
              {m.type === 'gallery' && Array.isArray(m.data?.photos) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 8 }}>
                  {m.data.photos.map((ph: any) => (
                    <div key={ph.id} style={{ position: 'relative' }}>
                      <img
                        src={ph.thumb}
                        alt={ph.credit}
                        loading="lazy"
                        onClick={() => setPhotoViewer({ thumb: ph.thumb, full: ph.full, credit: ph.credit })}
                        style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', borderRadius: 10, display: 'block', cursor: 'pointer', background: '#e5e7eb' }}
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const blob = await (await fetch(ph.full)).blob();
                            downloadImage(URL.createObjectURL(blob));
                          } catch { setPhotoViewer({ thumb: ph.thumb, full: ph.full, credit: ph.credit }); }
                        }}
                        style={{ position: 'absolute', bottom: 6, right: 6, border: 'none', background: 'rgba(10,31,26,0.85)', color: '#fff', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                      >
                        Save
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {m.type === 'table' && m.data && (
                <div style={{ marginTop: 8, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        {m.data.headers.map((h: string) => (
                          <th key={h} style={{ border: '1px solid #ddd', padding: 6, background: '#eee', textAlign: 'left' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {m.data.rows.map((row: string[], i: number) => (
                        <tr key={i}>
                          {row.map((cell, j) => (
                            <td key={j} style={{ border: '1px solid #ddd', padding: 6 }}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            </div>
          ))}

          {isTyping && (
            <div style={{ alignSelf: 'flex-start', padding: '2px 4px' }}>
              <AiMark size={24} animate />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form
          onSubmit={handleSubmit}
          style={{
            padding: '10px 12px max(12px, env(safe-area-inset-bottom))',
            background: '#fff',
            borderTop: '1px solid rgba(0,0,0,0.06)',
            position: 'relative',
            zIndex: 5,
          }}
        >
          {/* Files picker (+ button): documents / any file */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={e => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          {/* Photos picker (image button): images only */}
          <input
            ref={imageInputRef}
            type="file"
            multiple
            accept="image/*"
            style={{ display: 'none' }}
            onChange={e => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />

          {attachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              {attachments.map(a => (
                <div
                  key={a.id}
                  style={{
                    position: 'relative', borderRadius: 12, overflow: 'hidden',
                    border: '1px solid rgba(0,0,0,0.08)', background: '#f4f4f5', maxWidth: 120,
                  }}
                >
                  {a.kind === 'image' ? (
                    <img src={a.previewUrl} alt={a.name} style={{ width: 120, height: 80, objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <div style={{ padding: '10px 12px', fontSize: 12, color: '#333' }}>
                      📎 {a.name.length > 18 ? a.name.slice(0, 16) + '…' : a.name}
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label="Remove"
                    onClick={() => removeAttachment(a.id)}
                    style={{
                      position: 'absolute', top: 4, right: 4,
                      width: 22, height: 22, borderRadius: '50%', border: 'none',
                      background: 'rgba(0,0,0,0.65)', color: '#fff', cursor: 'pointer', fontSize: 12,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: `linear-gradient(180deg, ${DARK_GREEN} 0%, ${DARKER_GREEN} 100%)`,
              borderRadius: 24, padding: '6px 6px 6px 10px',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <button
              type="button"
              aria-label="Attach"
              onClick={() => { setShowHistory(false); setAttachMenu(v => !v); }}
              style={{
                width: 36, height: 36, borderRadius: '50%', border: 'none',
                background: 'transparent', color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Plus size={20} strokeWidth={2.2} />
            </button>

            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask anything"
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: '#fff', fontSize: 15, padding: '8px 0',
              }}
            />

            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, marginRight: 4 }}>Fast</span>

            <button
              type="button"
              disabled={(!input.trim() && attachments.length === 0) || isTyping}
              aria-label="Send"
              onClick={() => sendMessage(input)}
              style={{
                width: 38, height: 38, borderRadius: '50%', border: 'none',
                background: (input.trim() || attachments.length) && !isTyping ? RED : 'rgba(239,68,68,0.4)',
                color: '#fff',
                cursor: (input.trim() || attachments.length) && !isTyping ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}
            >
              <Send size={16} strokeWidth={2.4} />
            </button>
          </div>
        </form>
        {/* Add to chat — slides up from the bottom: Camera / Photos / Files */}
        {attachMenu && (
          <>
            <div
              role="presentation"
              onClick={() => setAttachMenu(false)}
              style={{ position: 'absolute', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.28)' }}
            />
            <div
              style={{
                position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 41,
                background: '#f7f7f5', borderTopLeftRadius: 30, borderTopRightRadius: 30,
                padding: '10px 16px max(22px, env(safe-area-inset-bottom))',
                animation: 'stooornaAiAttachUp 0.3s cubic-bezier(0.22,1,0.36,1)',
                boxShadow: '0 -10px 30px rgba(0,0,0,0.18)',
              }}
            >
              <div style={{ width: 44, height: 5, borderRadius: 999, background: '#d4d4d2', margin: '0 auto 12px' }} />
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 40, marginBottom: 14 }}>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setAttachMenu(false)}
                  style={{ position: 'absolute', left: 4, top: 0, width: 40, height: 40, border: 'none', background: 'transparent', color: '#111', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <XIcon size={26} strokeWidth={2} />
                </button>
                <span style={{ fontWeight: 800, fontSize: 20, color: '#111' }}>Add to chat</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {[
                  { key: 'camera', label: 'Camera', icon: <CameraIcon size={28} strokeWidth={1.8} />, run: () => { setAttachMenu(false); setCameraOpen(true); } },
                  { key: 'photos', label: 'Photos', icon: <ImageIcon size={28} strokeWidth={1.8} />, run: () => { setAttachMenu(false); imageInputRef.current?.click(); } },
                  { key: 'files', label: 'Files', icon: <FileUp size={28} strokeWidth={1.8} />, run: () => { setAttachMenu(false); fileInputRef.current?.click(); } },
                ].map(t => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={t.run}
                    style={{
                      border: 'none', background: '#fff', borderRadius: 26, padding: '22px 6px 18px',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, cursor: 'pointer', color: '#111',
                    }}
                  >
                    <span style={{ width: 62, height: 62, borderRadius: '50%', background: '#e8e8e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t.icon}</span>
                    <span style={{ fontWeight: 800, fontSize: 16 }}>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {cameraOpen && (
        <CameraCapture
          onClose={() => setCameraOpen(false)}
          onCapture={file => addFiles([file])}
        />
      )}

      {/* PHOTO-VIEWER: search photos open inside the app */}
      {photoViewer && (
        <div
          onClick={e => { e.stopPropagation(); setPhotoViewer(null); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 24500, background: 'rgba(0,0,0,0.94)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
          }}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={e => { e.stopPropagation(); setPhotoViewer(null); }}
            style={{
              position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 14px)', right: 14,
              width: 40, height: 40, borderRadius: '50%', border: 'none',
              background: 'rgba(255,255,255,0.16)', color: '#fff', display: 'flex',
              alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >
            <XIcon size={22} />
          </button>
          <img
            src={photoViewer.full}
            onError={e => { const el = e.currentTarget; if (el.src !== photoViewer.thumb) el.src = photoViewer.thumb; }}
            alt={photoViewer.credit || ''}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '82dvh', objectFit: 'contain', display: 'block' }}
          />
          <button
            type="button"
            onClick={async e => {
              e.stopPropagation();
              try {
                const blob = await (await fetch(photoViewer.full)).blob();
                downloadImage(URL.createObjectURL(blob));
              } catch { /* */ }
            }}
            style={{
              marginTop: 16, border: 'none', background: '#fff', color: '#111', borderRadius: 999,
              padding: '10px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Save
          </button>
        </div>
      )}

      <style>{`
        @keyframes stooornaAiSheetUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes stooornaAiShine {
          0% { transform: translateX(-120%) skewX(-18deg); }
          55%, 100% { transform: translateX(260%) skewX(-18deg); }
        }
        @keyframes stooornaAiAttachUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes stooornaAiMarkPulse {
          0%   { transform: scale(0.55) rotate(0deg);   opacity: 0.7; }
          50%  { transform: scale(1.15) rotate(180deg); opacity: 1; }
          100% { transform: scale(0.55) rotate(360deg); opacity: 0.7; }
        }
        @keyframes stooornaAiDot {
          0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
          40% { opacity: 1; transform: translateY(-3px); }
        }
      `}</style>
    </div>
  );
}
