import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X as XIcon, Plus, Play, Check, Search } from 'lucide-react';

/**
 * CAPCUT-TEMPLATES (ملف مستقل): قوالب مونتاج جاهزة. المستخدم يختار قالب + يضيف صوره / فيديوهاته
 * فيطلع له فيديو مونتاج (انتقالات + تأثيرات + موسيقى) يتم إنشاؤه بالكامل داخل الجهاز (Canvas + WebAudio + MediaRecorder).
 * لا يعتمد على أي ملف آخر في المشروع ولا يغيّر شي فيها.
 * الناتج يرجع عبر onDone(blob, 'video', name) -> يدخل الشات بأزرار Editor / Save / Publish (Publishing To Templates) كالمعتاد.
 */

type Transition = 'fade' | 'slide' | 'zoom' | 'wipe' | 'flash';
type Effect = 'kenburns' | 'bw' | 'warm' | 'vignette';
type Cat = 'trend' | 'occasions' | 'travel' | 'cars' | 'nature';

// التصنيفات (تظهر كأزرار فوق القوالب). 'all' = الكل
const CATS: { id: Cat | 'all'; ar: string; en: string }[] = [
  { id: 'all',       ar: 'الكل',    en: 'All' },
  { id: 'trend',     ar: 'ترند',    en: 'Trending' },
  { id: 'occasions', ar: 'مناسبات', en: 'Occasions' },
  { id: 'travel',    ar: 'سفر',     en: 'Travel' },
  { id: 'cars',      ar: 'سيارات',  en: 'Cars' },
  { id: 'nature',    ar: 'طبيعة',   en: 'Nature' },
];

interface Tpl {
  id: string;
  cat: Cat;
  ar: string;
  en: string;
  grad: [string, string];
  min: number;        // أقل عدد مقاطع (إذا المستخدم أضاف أقل تتكرر)
  per: number;        // مدة المقطع بالثواني
  tr: number;         // مدة الانتقال
  transition: Transition;
  effect: Effect;
  tint?: string;
  bpm: number;
  notes: number[];    // نغمات الموسيقى (نصف نغمة فوق الجذر)
  root: number;
}

const TEMPLATES: Tpl[] = [
  // ── ترند ──
  { id: 'vibe',     cat: 'trend',     ar: 'فايب',       en: 'Vibe',     grad: ['#7c3aed', '#ec4899'], min: 5, per: 2.0, tr: 0.45, transition: 'slide', effect: 'kenburns', tint: 'rgba(236,72,153,0.10)', bpm: 112, notes: [0, 3, 7, 10, 7, 3], root: 220 },
  { id: 'dream',    cat: 'trend',     ar: 'حلم',        en: 'Dream',    grad: ['#a78bfa', '#38bdf8'], min: 4, per: 2.6, tr: 0.7,  transition: 'fade',  effect: 'bw',       tint: 'rgba(120,120,255,0.10)', bpm: 90,  notes: [0, 5, 9, 12, 9, 5], root: 261 },
  { id: 'glow',     cat: 'trend',     ar: 'توهج',       en: 'Glow',     grad: ['#f472b6', '#fb923c'], min: 5, per: 1.9, tr: 0.5,  transition: 'zoom',  effect: 'warm',     tint: 'rgba(255,120,160,0.12)', bpm: 116, notes: [0, 4, 9, 4, 7, 2],  root: 240 },
  // ── مناسبات ──
  { id: 'party',    cat: 'occasions', ar: 'حفلة',       en: 'Party',    grad: ['#d946ef', '#6366f1'], min: 6, per: 1.4, tr: 0.3,  transition: 'flash', effect: 'kenburns', bpm: 126, notes: [0, 4, 7, 4, 9, 7],  root: 262 },
  { id: 'wedding',  cat: 'occasions', ar: 'زفاف',       en: 'Wedding',  grad: ['#fda4af', '#fde68a'], min: 4, per: 3.0, tr: 0.9,  transition: 'fade',  effect: 'warm',     tint: 'rgba(255,200,190,0.14)', bpm: 72,  notes: [0, 7, 4, 12, 9, 7], root: 196 },
  { id: 'birthday', cat: 'occasions', ar: 'عيد ميلاد',  en: 'Birthday', grad: ['#22d3ee', '#f472b6'], min: 5, per: 1.8, tr: 0.4,  transition: 'zoom',  effect: 'kenburns', bpm: 118, notes: [0, 0, 7, 0, 12, 11], root: 294 },
  { id: 'eid',      cat: 'occasions', ar: 'عيد',        en: 'Eid',      grad: ['#059669', '#fbbf24'], min: 5, per: 2.2, tr: 0.5,  transition: 'wipe',  effect: 'warm',     tint: 'rgba(255,200,60,0.12)',  bpm: 100, notes: [0, 3, 5, 7, 5, 3],  root: 220 },
  // ── سفر ──
  { id: 'cinema',   cat: 'travel',    ar: 'سينما',      en: 'Cinema',   grad: ['#0f172a', '#475569'], min: 4, per: 3.0, tr: 0.8,  transition: 'fade',  effect: 'vignette', tint: 'rgba(20,40,70,0.15)',  bpm: 80,  notes: [0, 7, 12, 7, 3, 7], root: 174 },
  { id: 'roadtrip', cat: 'travel',    ar: 'رحلة',       en: 'Road Trip',grad: ['#f97316', '#0ea5e9'], min: 6, per: 1.7, tr: 0.4,  transition: 'slide', effect: 'kenburns', bpm: 108, notes: [0, 5, 7, 5, 9, 7],  root: 208 },
  { id: 'beach',    cat: 'travel',    ar: 'شاطئ',       en: 'Beach',    grad: ['#38bdf8', '#fde047'], min: 5, per: 2.2, tr: 0.5,  transition: 'wipe',  effect: 'warm',     tint: 'rgba(255,220,120,0.12)', bpm: 98,  notes: [0, 4, 7, 9, 7, 4],  root: 247 },
  { id: 'city',     cat: 'travel',    ar: 'مدينة',      en: 'City',     grad: ['#1e293b', '#a855f7'], min: 6, per: 1.5, tr: 0.35, transition: 'zoom',  effect: 'vignette', tint: 'rgba(120,60,200,0.12)',  bpm: 122, notes: [0, 3, 5, 3, 10, 7], root: 185 },
  // ── سيارات ──
  { id: 'flash',    cat: 'cars',      ar: 'فلاش',       en: 'Flash',    grad: ['#f59e0b', '#ef4444'], min: 6, per: 1.5, tr: 0.35, transition: 'flash', effect: 'kenburns', bpm: 128, notes: [0, 0, 7, 5, 3, 5],  root: 196 },
  { id: 'zoomer',   cat: 'cars',      ar: 'زوم',        en: 'Zoomer',   grad: ['#06b6d4', '#3b82f6'], min: 5, per: 1.8, tr: 0.4,  transition: 'zoom',  effect: 'kenburns', bpm: 120, notes: [0, 4, 7, 12, 7, 4], root: 233 },
  { id: 'drift',    cat: 'cars',      ar: 'دريفت',      en: 'Drift',    grad: ['#111827', '#ef4444'], min: 6, per: 1.4, tr: 0.3,  transition: 'slide', effect: 'vignette', tint: 'rgba(200,20,20,0.10)',   bpm: 140, notes: [0, 0, 3, 0, 5, 3],  root: 165 },
  { id: 'speed',    cat: 'cars',      ar: 'سرعة',       en: 'Speed',    grad: ['#facc15', '#0f172a'], min: 7, per: 1.2, tr: 0.25, transition: 'flash', effect: 'bw',       bpm: 150, notes: [0, 7, 0, 5, 0, 3],  root: 147 },
  // ── طبيعة ──
  { id: 'forest',   cat: 'nature',    ar: 'غابة',       en: 'Forest',   grad: ['#14532d', '#84cc16'], min: 4, per: 2.8, tr: 0.8,  transition: 'fade',  effect: 'kenburns', tint: 'rgba(60,160,60,0.10)',   bpm: 76,  notes: [0, 4, 7, 11, 7, 4], root: 196 },
  { id: 'sunset',   cat: 'nature',    ar: 'غروب',       en: 'Sunset',   grad: ['#f97316', '#be185d'], min: 4, per: 2.6, tr: 0.7,  transition: 'wipe',  effect: 'warm',     tint: 'rgba(255,100,60,0.14)',  bpm: 84,  notes: [0, 5, 9, 5, 12, 9], root: 220 },
  { id: 'ocean',    cat: 'nature',    ar: 'بحر',        en: 'Ocean',    grad: ['#0369a1', '#22d3ee'], min: 5, per: 2.4, tr: 0.6,  transition: 'slide', effect: 'kenburns', tint: 'rgba(30,150,220,0.10)',  bpm: 92,  notes: [0, 2, 7, 9, 7, 2],  root: 233 },
  { id: 'mountain', cat: 'nature',    ar: 'جبال',       en: 'Mountain', grad: ['#334155', '#94a3b8'], min: 4, per: 3.0, tr: 0.8,  transition: 'zoom',  effect: 'vignette', bpm: 78,  notes: [0, 7, 12, 7, 5, 7], root: 174 },
];

interface Media { id: string; kind: 'image' | 'video'; url: string; name: string }

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: (blob: Blob, kind: 'video', name: string) => void;
  ar?: boolean;
}

const W = 720;
const H = 1280;

function scheduleMusic(ac: AudioContext, dest: AudioNode, tpl: Tpl, dur: number) {
  const beat = 60 / tpl.bpm;
  const t0 = ac.currentTime + 0.05;
  const master = ac.createGain();
  master.gain.setValueAtTime(0.55, t0);
  master.gain.setValueAtTime(0.55, t0 + Math.max(0, dur - 0.8));
  master.gain.linearRampToValueAtTime(0.0001, t0 + dur);
  master.connect(dest);
  for (let i = 0; i * beat < dur; i++) {
    const t = t0 + i * beat;
    const k = ac.createOscillator();
    const kg = ac.createGain();
    k.type = 'sine';
    k.frequency.setValueAtTime(150, t);
    k.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    kg.gain.setValueAtTime(0.9, t);
    kg.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    k.connect(kg); kg.connect(master);
    k.start(t); k.stop(t + 0.22);
    for (let j = 0; j < 2; j++) {
      const tt = t + (j * beat) / 2;
      const n = tpl.notes[(i * 2 + j) % tpl.notes.length];
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'triangle';
      o.frequency.value = tpl.root * Math.pow(2, n / 12) * 2;
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.28, tt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, tt + beat / 2 - 0.02);
      o.connect(g); g.connect(master);
      o.start(tt); o.stop(tt + beat / 2);
    }
  }
}

function drawCover(ctx: CanvasRenderingContext2D, el: HTMLImageElement | HTMLVideoElement, scale: number) {
  const sw = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
  const sh = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
  if (!sw || !sh) return;
  const r = Math.max(W / sw, H / sh) * scale;
  const dw = sw * r;
  const dh = sh * r;
  ctx.drawImage(el, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

function loadEl(m: Media): Promise<HTMLImageElement | HTMLVideoElement> {
  return new Promise((res, rej) => {
    if (m.kind === 'image') {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('image'));
      im.src = m.url;
    } else {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.loop = true;
      v.onloadeddata = () => res(v);
      v.onerror = () => rej(new Error('video'));
      v.src = m.url;
    }
  });
}

async function renderMontage(media: Media[], tpl: Tpl, onPct: (p: number) => void, dead: () => boolean): Promise<Blob> {
  const els = await Promise.all(media.map(loadEl));
  const n = Math.max(media.length, tpl.min);
  const step = tpl.per - tpl.tr;
  const total = (n - 1) * step + tpl.per;

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const stream = canvas.captureStream(30);

  const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
  let ac: AudioContext | null = null;
  if (AC) {
    try {
      ac = new AC() as AudioContext;
      await ac.resume().catch(() => {});
      const dest = ac.createMediaStreamDestination();
      scheduleMusic(ac, dest, tpl, total);
      dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    } catch { ac = null; }
  }

  let mime = '';
  for (const m of ['video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm']) {
    if ((MediaRecorder as any).isTypeSupported?.(m)) { mime = m; break; }
  }
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 4_000_000 } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise<void>(r => { rec.onstop = () => r(); });
  rec.start(200);

  const started = new Set<number>();
  const ended = new Set<number>();
  const elOf = (i: number) => els[i % els.length];
  const supportsFilter = 'filter' in ctx;

  const drawClip = (i: number, T: number, inc: boolean) => {
    const local = T - i * step;
    const el = elOf(i);
    const p = inc && i > 0 && local < tpl.tr ? Math.max(0, Math.min(1, local / tpl.tr)) : 1;
    if (tpl.transition === 'flash' && p < 0.5) return;
    ctx.save();
    if (tpl.effect === 'bw' && supportsFilter) (ctx as any).filter = 'grayscale(1) contrast(1.1)';
    const zoom = tpl.effect === 'kenburns' ? 1 + 0.1 * (local / tpl.per) : 1.03;
    if (p < 1) {
      if (tpl.transition === 'fade') ctx.globalAlpha = p;
      else if (tpl.transition === 'slide') ctx.translate((1 - p) * W, 0);
      else if (tpl.transition === 'zoom') { ctx.globalAlpha = p; ctx.translate(W / 2, H / 2); const s = 1.4 - 0.4 * p; ctx.scale(s, s); ctx.translate(-W / 2, -H / 2); }
      else if (tpl.transition === 'wipe') { ctx.beginPath(); ctx.rect(0, 0, W * p, H); ctx.clip(); }
    }
    drawCover(ctx, el, zoom);
    ctx.restore();
  };

  await new Promise<void>(resolve => {
    const t0 = performance.now();
    const frame = () => {
      if (dead()) { resolve(); return; }
      const T = (performance.now() - t0) / 1000;
      if (T >= total) { resolve(); return; }
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < n; i++) {
        const s = i * step;
        if (T >= s && T < s + tpl.per) {
          if (!started.has(i)) {
            started.add(i);
            const e = elOf(i);
            if (e instanceof HTMLVideoElement) { try { e.currentTime = 0; } catch { /* */ } void e.play().catch(() => {}); }
          }
          drawClip(i, T, i === n - 1 || T < (i + 1) * step + tpl.tr ? true : true);
        } else if (T >= s + tpl.per && !ended.has(i)) {
          ended.add(i);
          const e = elOf(i);
          if (e instanceof HTMLVideoElement && n === els.length) { try { e.pause(); } catch { /* */ } }
        }
      }
      if (tpl.transition === 'flash') {
        for (let i = 1; i < n; i++) {
          const local = T - i * step;
          if (local >= 0 && local < tpl.tr) {
            const p = local / tpl.tr;
            ctx.fillStyle = `rgba(255,255,255,${(1 - Math.abs(p - 0.5) * 2) * 0.85})`;
            ctx.fillRect(0, 0, W, H);
          }
        }
      }
      if (tpl.tint) { ctx.fillStyle = tpl.tint; ctx.fillRect(0, 0, W, H); }
      if (tpl.effect === 'vignette') {
        const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.7);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.55)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      onPct(Math.min(99, Math.round((T / total) * 100)));
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });

  try { if (rec.state !== 'inactive') rec.stop(); } catch { /* */ }
  await stopped;
  els.forEach(e => { if (e instanceof HTMLVideoElement) { try { e.pause(); e.removeAttribute('src'); e.load(); } catch { /* */ } } });
  try { await ac?.close(); } catch { /* */ }
  stream.getTracks().forEach(t => t.stop());
  if (dead()) throw new Error('aborted');
  const type = (rec.mimeType || mime || 'video/webm').split(';')[0];
  return new Blob(chunks, { type });
}

export default function CapCutTemplates({ open, onClose, onDone, ar = false }: Props) {
  const [tplId, setTplId] = useState<string>(TEMPLATES[0].id);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Cat | 'all'>('all');
  const [media, setMedia] = useState<Media[]>([]);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<{ blob: Blob; url: string } | null>(null);
  const abortRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const tpl = TEMPLATES.find(t => t.id === tplId) || TEMPLATES[0];
  const t = (a: string, e: string) => (ar ? a : e);
  const qn = q.trim().toLowerCase();
  const shown = TEMPLATES.filter(x => {
    if (cat !== 'all' && x.cat !== cat) return false;
    if (!qn) return true;
    const c = CATS.find(k => k.id === x.cat);
    return [x.ar, x.en, c?.ar || '', c?.en || '', x.transition].some(v => v.toLowerCase().includes(qn));
  });

  const reset = () => {
    abortRef.current = true;
    setQ(''); setCat('all');
    media.forEach(m => { try { URL.revokeObjectURL(m.url); } catch { /* */ } });
    if (result) { try { URL.revokeObjectURL(result.url); } catch { /* */ } }
    setMedia([]); setResult(null); setBusy(false); setPct(0); setErr('');
  };

  useEffect(() => { if (!open) reset(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const next: Media[] = [];
    Array.from(files).forEach(f => {
      const isV = f.type.startsWith('video/');
      const isI = f.type.startsWith('image/');
      if (!isV && !isI) return;
      if (f.size > (isV ? 150 : 12) * 1024 * 1024) return;
      next.push({ id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, kind: isV ? 'video' : 'image', url: URL.createObjectURL(f), name: f.name });
    });
    if (next.length) setMedia(p => [...p, ...next].slice(0, 12));
    setResult(null);
  };

  const removeMedia = (id: string) => {
    setMedia(p => { const g = p.find(x => x.id === id); if (g) { try { URL.revokeObjectURL(g.url); } catch { /* */ } } return p.filter(x => x.id !== id); });
    setResult(null);
  };

  const create = async () => {
    if (busy || !media.length) return;
    if (typeof MediaRecorder === 'undefined') { setErr(t('جهازك ما يدعم إنشاء الفيديو', 'This device cannot create videos')); return; }
    abortRef.current = false;
    setBusy(true); setErr(''); setPct(0); setResult(null);
    try {
      const blob = await renderMontage(media, tpl, setPct, () => abortRef.current);
      if (abortRef.current) return;
      if (!blob.size) throw new Error('empty');
      setPct(100);
      setResult({ blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      if (!abortRef.current) { console.error('[CapCutTemplates]', e); setErr(t('ما قدرت أسوي المونتاج، جرّب صور / فيديوهات ثانية.', 'Could not create the montage, try other media.')); }
    } finally { setBusy(false); }
  };

  const useResult = () => {
    if (!result) return;
    const ext = result.blob.type.includes('mp4') ? 'mp4' : 'webm';
    onDone(result.blob, 'video', `template-${tpl.id}-${Date.now()}.${ext}`);
    onClose();
  };

  const close = () => { abortRef.current = true; onClose(); };

  if (!open) return null;

  return createPortal(
    <div
      onClick={e => e.stopPropagation()}
      dir={ar ? 'rtl' : 'ltr'}
      style={{ position: 'fixed', inset: 0, zIndex: 25000, background: '#0b0b0d', color: '#fff', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 16px 10px' }}>
        <span style={{ fontWeight: 800, fontSize: 18 }}>{t('قوالب المونتاج', 'Montage Templates')}</span>
        <button type="button" aria-label="Close" onClick={close} style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <XIcon size={20} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {result ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <video src={result.url} autoPlay loop playsInline controls style={{ width: '100%', maxWidth: 320, maxHeight: '62dvh', borderRadius: 16, background: '#000' }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={useResult} style={{ border: 'none', background: '#ef4444', color: '#fff', borderRadius: 999, padding: '12px 26px', fontWeight: 800, fontSize: 15, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Check size={18} /> {t('استخدم الفيديو', 'Use video')}
              </button>
              <button type="button" onClick={() => { try { URL.revokeObjectURL(result.url); } catch { /* */ } setResult(null); }} style={{ border: '1px solid rgba(255,255,255,0.25)', background: 'transparent', color: '#fff', borderRadius: 999, padding: '12px 22px', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
                {t('تعديل', 'Back')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div>
              <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 14, opacity: 0.8 }}>{t('1) اختر القالب', '1) Pick a template')}</p>
              <div style={{ position: 'sticky', top: 0, zIndex: 2, background: '#0b0b0d', paddingBottom: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.10)', borderRadius: 999, padding: '0 14px', height: 42 }}>
                  <Search size={18} style={{ opacity: 0.7, flexShrink: 0 }} />
                  <input
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    placeholder={t('ابحث عن قالب...', 'Search templates...')}
                    style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 15, fontFamily: 'inherit' }}
                  />
                  {q && (
                    <button type="button" aria-label="Clear" onClick={() => setQ('')} style={{ border: 'none', background: 'transparent', color: '#fff', opacity: 0.7, cursor: 'pointer', padding: 2, display: 'flex' }}>
                      <XIcon size={16} />
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, WebkitOverflowScrolling: 'touch' }}>
                  {CATS.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCat(c.id)}
                      style={{
                        flexShrink: 0, border: 'none', borderRadius: 999, padding: '8px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer',
                        background: cat === c.id ? '#fff' : 'rgba(255,255,255,0.12)', color: cat === c.id ? '#111' : '#fff',
                      }}
                    >
                      {ar ? c.ar : c.en}
                    </button>
                  ))}
                </div>
                {!shown.some(x => x.id === tplId) && (
                  <span style={{ fontSize: 12, opacity: 0.75 }}>{t('القالب المختار:', 'Selected:')} {ar ? tpl.ar : tpl.en}</span>
                )}
              </div>
              {shown.length === 0 && (
                <p style={{ textAlign: 'center', opacity: 0.7, fontSize: 14, margin: '24px 0' }}>{t('ما لقيت قوالب بهالاسم', 'No templates found')}</p>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {shown.map(x => (
                  <button
                    key={x.id}
                    type="button"
                    disabled={busy}
                    onClick={() => setTplId(x.id)}
                    style={{
                      border: x.id === tplId ? '2px solid #fff' : '2px solid transparent', borderRadius: 16, padding: 0, cursor: 'pointer',
                      aspectRatio: '3 / 4', background: `linear-gradient(160deg, ${x.grad[0]}, ${x.grad[1]})`, color: '#fff',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 2, paddingBottom: 10,
                    }}
                  >
                    <Play size={22} fill="#fff" strokeWidth={0} />
                    <span style={{ fontWeight: 800, fontSize: 14 }}>{ar ? x.ar : x.en}</span>
                    <span style={{ fontSize: 11, opacity: 0.85 }}>{x.min} {t('مقاطع', 'clips')}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 14, opacity: 0.8 }}>{t('2) أضف صورك وفيديوهاتك', '2) Add your photos & videos')}</p>
              <input ref={inputRef} type="file" multiple accept="image/*,video/*" style={{ display: 'none' }} onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {media.map(m => (
                  <div key={m.id} style={{ position: 'relative', width: 78, height: 104, borderRadius: 12, overflow: 'hidden', background: '#222' }}>
                    {m.kind === 'image'
                      ? <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <video src={m.url} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                    {!busy && (
                      <button type="button" aria-label="Remove" onClick={() => removeMedia(m.id)} style={{ position: 'absolute', top: 3, right: 3, width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 13, cursor: 'pointer' }}>×</button>
                    )}
                  </div>
                ))}
                {media.length < 12 && (
                  <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} style={{ width: 78, height: 104, borderRadius: 12, border: '2px dashed rgba(255,255,255,0.35)', background: 'transparent', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Plus size={26} />
                  </button>
                )}
              </div>
            </div>
          </>
        )}
        {err && <div style={{ color: '#fca5a5', fontSize: 13, textAlign: 'center' }}>{err}</div>}
      </div>

      {!result && (
        <div style={{ padding: '10px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            disabled={busy || !media.length}
            onClick={() => { void create(); }}
            style={{
              position: 'relative', overflow: 'hidden', width: '100%', maxWidth: 420, border: 'none', borderRadius: 999, padding: '14px 18px', fontSize: 16, fontWeight: 800,
              color: '#fff', cursor: busy || !media.length ? 'default' : 'pointer', background: busy ? '#3a3a3a' : media.length ? '#ef4444' : '#444',
            }}
          >
            {busy && <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: 'linear-gradient(90deg, #f59e0b, #facc15)', transition: 'width 0.25s ease-out' }} />}
            <span style={{ position: 'relative', color: busy && pct > 45 ? '#1a1300' : '#fff' }}>
              {busy ? `${t('جاري صنع المونتاج', 'Creating montage')}  ${pct}%` : t('اصنع المونتاج', 'Create montage')}
            </span>
          </button>
          {busy && (
            <button type="button" onClick={() => { abortRef.current = true; setBusy(false); setPct(0); }} style={{ border: 'none', background: 'transparent', color: '#e5e7eb', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
              {t('إلغاء', 'Cancel')}
            </button>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}
