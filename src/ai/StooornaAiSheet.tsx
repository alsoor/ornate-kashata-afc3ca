import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Send, Clock, PenLine, Image as ImageIcon, Camera as CameraIcon, FileUp, ChevronLeft, X as XIcon, RefreshCw, Zap, ZapOff } from 'lucide-react';

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
  type?: 'text' | 'image' | 'table' | 'file';
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

  useEffect(() => {
    let cancelled = false;
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
    width: 66, height: 66, borderRadius: '50%', border: 'none',
    background: 'rgba(40,0,0,0.62)', color: '#fff', cursor: 'pointer',
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
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
            transform: facing === 'user' ? 'scaleX(-1)' : undefined,
          }}
        />
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
          <div style={{ position: 'absolute', right: 26, bottom: 26 + 66 + 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <button type="button" aria-label="Flash" onClick={() => { void toggleFlash(); }} style={{ ...roundBtn, opacity: torchOk ? 1 : 0.7 }}>
              {flashOn ? <Zap size={28} strokeWidth={2.2} /> : <ZapOff size={28} strokeWidth={2.2} />}
            </button>
            <button type="button" aria-label="Flip camera" onClick={() => setFacing(f => (f === 'environment' ? 'user' : 'environment'))} style={roundBtn}>
              <RefreshCw size={28} strokeWidth={2.2} />
            </button>
          </div>
        )}

        {/* bottom row */}
        <div style={{ position: 'absolute', left: 26, right: 26, bottom: 26, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button type="button" aria-label="Back" onClick={onClose} style={roundBtn}>
            <ChevronLeft size={32} strokeWidth={2.2} />
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
              background: recording ? '#7f1d1d' : '#2a0504', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              touchAction: 'none', WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{ width: 94, height: 94, borderRadius: recording ? 26 : '50%', background: recording ? '#ef4444' : '#fff', transition: 'all 0.15s ease', display: 'block' }} />
          </button>

          <button type="button" aria-label={menuOpen ? 'Close options' : 'More'} onClick={() => setMenuOpen(v => !v)} style={roundBtn}>
            {menuOpen ? (
              <XIcon size={30} strokeWidth={2.2} />
            ) : (
              <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[0, 1, 2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', display: 'block' }} />)}
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
