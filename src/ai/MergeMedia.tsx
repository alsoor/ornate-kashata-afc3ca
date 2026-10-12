import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X as XIcon, Plus, Check, Search, ChevronLeft, ChevronRight, Music, Play, Square } from 'lucide-react';

/**
 * MERGE-MEDIA (ملف مستقل): دمج عدة صور وفيديوهات في فيديو واحد مع موسيقى.
 * - المستخدم يضيف صور / فيديوهات (حتى 30) ويرتبها.
 * - يختار الموسيقى: بدون / من مكتبة مدمجة (مع بحث) / ملف صوت من جهازه.
 * - الدمج يتم داخل الجهاز (Canvas + WebAudio + MediaRecorder) بدون سيرفر.
 * - الناتج يرجع عبر onDone(blob, 'video', name) فيدخل الشات بأزرار Editor / Save / Publish.
 * لا يعتمد على أي ملف آخر في المشروع.
 */

export interface MergeItem { url: string; kind: 'image' | 'video'; name: string }
interface Item extends MergeItem { id: string; own: boolean }
type Trans = 'fade' | 'slide' | 'zoom' | 'wipe' | 'flash' | 'up' | 'left' | 'spin' | 'zoomout' | 'circle' | 'split' | 'none';
type Music = { type: 'none' } | { type: 'track'; id: string } | { type: 'file'; file: File } | { type: 'video'; file: File };

interface Track { id: string; ar: string; en: string; tags: string; bpm: number; notes: number[]; root: number }

// مكتبة الموسيقى المدمجة (تتولد داخل الجهاز، بدون حقوق). البحث يشتغل على الاسم والوسوم.
const TRACKS: Track[] = [
  { id: 'chill',   ar: 'هادئ',     en: 'Chill',     tags: 'هادي relax calm lofi',          bpm: 78,  notes: [0, 7, 4, 12, 9, 7],  root: 196 },
  { id: 'happy',   ar: 'فرح',      en: 'Happy',     tags: 'سعيد حماس fun joy',             bpm: 118, notes: [0, 4, 7, 12, 7, 4],  root: 262 },
  { id: 'party',   ar: 'حفلة',     en: 'Party',     tags: 'مناسبات ميلاد dance club',      bpm: 126, notes: [0, 4, 7, 4, 9, 7],   root: 247 },
  { id: 'epic',    ar: 'ملحمي',    en: 'Epic',      tags: 'قوي سينما cinema trailer',      bpm: 90,  notes: [0, 7, 12, 7, 3, 7],  root: 174 },
  { id: 'love',    ar: 'حب',       en: 'Love',      tags: 'رومانسي زفاف wedding romantic', bpm: 72,  notes: [0, 4, 9, 7, 12, 9],  root: 220 },
  { id: 'cars',    ar: 'سيارات',   en: 'Cars',      tags: 'سرعة دريفت speed drift',        bpm: 140, notes: [0, 0, 3, 0, 5, 3],   root: 165 },
  { id: 'travel',  ar: 'سفر',      en: 'Travel',    tags: 'رحلة road trip adventure',      bpm: 108, notes: [0, 5, 7, 5, 9, 7],   root: 208 },
  { id: 'nature',  ar: 'طبيعة',    en: 'Nature',    tags: 'غابة بحر جبال forest ocean',    bpm: 76,  notes: [0, 4, 7, 11, 7, 4],  root: 196 },
  { id: 'sunset',  ar: 'غروب',     en: 'Sunset',    tags: 'شاطئ دافي beach warm',          bpm: 92,  notes: [0, 5, 9, 5, 12, 9],  root: 233 },
  { id: 'sad',     ar: 'حزين',     en: 'Sad',       tags: 'شجن emotional slow',            bpm: 66,  notes: [0, 3, 7, 3, 10, 7],  root: 185 },
  { id: 'trap',    ar: 'تراب',     en: 'Trap',      tags: 'ترند hiphop beat',              bpm: 132, notes: [0, 0, 7, 0, 5, 3],   root: 147 },
  { id: 'eid',     ar: 'عيد',      en: 'Eid',       tags: 'مناسبات فرحة celebration',      bpm: 100, notes: [0, 3, 5, 7, 5, 3],   root: 220 },
];

const W = 720;
const H = 1280;

function scheduleMusic(ac: AudioContext, dest: AudioNode, tr: Track, dur: number, vol = 0.55) {
  const beat = 60 / tr.bpm;
  const t0 = ac.currentTime + 0.05;
  const master = ac.createGain();
  master.gain.setValueAtTime(vol, t0);
  master.gain.setValueAtTime(vol, t0 + Math.max(0, dur - 0.8));
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
      const n = tr.notes[(i * 2 + j) % tr.notes.length];
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'triangle';
      o.frequency.value = tr.root * Math.pow(2, n / 12) * 2;
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

function loadEl(m: Item): Promise<HTMLImageElement | HTMLVideoElement> {
  return new Promise((res, rej) => {
    if (m.kind === 'image') {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('image'));
      im.src = m.url;
    } else {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      v.onloadeddata = () => res(v);
      v.onerror = () => rej(new Error('video'));
      v.src = m.url;
    }
  });
}

interface Opts { per: number; trans: Trans; music: Music; keepAudio: boolean }

async function renderMerge(items: Item[], opts: Opts, onPct: (p: number) => void, dead: () => boolean): Promise<Blob> {
  const els = await Promise.all(items.map(loadEl));
  const n = els.length;
  const dur = els.map(e => (e instanceof HTMLVideoElement ? Math.max(1, Math.min(isFinite(e.duration) ? e.duration : 5, 120)) : opts.per));
  const tr = opts.trans === 'none' ? 0 : Math.min(0.45, Math.min(...dur) * 0.4);
  const start: number[] = [];
  dur.forEach((d, i) => { start.push(i === 0 ? 0 : start[i - 1] + dur[i - 1] - tr); });
  const total = start[n - 1] + dur[n - 1];

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const stream = canvas.captureStream(30);

  const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
  let ac: AudioContext | null = null;
  let musicVid: { el: HTMLVideoElement; gain: GainNode; url: string; vol: number } | null = null; // song taken from a video file (sound only)
  const hasVideo = els.some(e => e instanceof HTMLVideoElement);
  const wantAudio = opts.music.type !== 'none' || (opts.keepAudio && hasVideo);
  if (AC && wantAudio) {
    try {
      ac = new AC() as AudioContext;
      await ac.resume().catch(() => {});
      const dest = ac.createMediaStreamDestination();
      const vol = opts.keepAudio && hasVideo ? 0.4 : 0.6;
      if (opts.music.type === 'track') {
        const track = TRACKS.find(x => x.id === (opts.music as any).id);
        if (track) scheduleMusic(ac, dest, track, total, vol);
      } else if (opts.music.type === 'file') {
        const buf = await ac.decodeAudioData(await (opts.music as any).file.arrayBuffer());
        const src = ac.createBufferSource();
        src.buffer = buf; src.loop = true;
        const g = ac.createGain();
        const t0 = ac.currentTime + 0.05;
        g.gain.setValueAtTime(vol, t0);
        g.gain.setValueAtTime(vol, t0 + Math.max(0, total - 0.8));
        g.gain.linearRampToValueAtTime(0.0001, t0 + total);
        src.connect(g); g.connect(dest);
        src.start(t0); src.stop(t0 + total + 0.1);
      } else if (opts.music.type === 'video') {
        // sound of a chosen video plays over the whole merge (its picture is NOT shown)
        const mv = document.createElement('video');
        const mUrl = URL.createObjectURL((opts.music as any).file);
        mv.playsInline = true; mv.loop = true; mv.preload = 'auto'; mv.muted = false; mv.volume = 1;
        mv.src = mUrl;
        await new Promise<void>((res, rej) => { mv.onloadeddata = () => res(); mv.onerror = () => rej(new Error('audio-decode')); });
        const ms = ac.createMediaElementSource(mv);
        const mg = ac.createGain();
        mg.gain.value = vol;
        ms.connect(mg); mg.connect(dest);
        musicVid = { el: mv, gain: mg, url: mUrl, vol };
      }
      if (opts.keepAudio) {
        els.forEach(e => {
          if (!(e instanceof HTMLVideoElement)) return;
          try {
            e.muted = false; e.volume = 1;
            const s = ac!.createMediaElementSource(e);
            s.connect(dest);
          } catch { /* */ }
        });
      }
      dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    } catch (e) {
      if ((e as any)?.name === 'EncodingError' || /decode/i.test(String((e as any)?.message))) { try { await ac?.close(); } catch { /* */ } throw new Error('audio-decode'); }
      ac = null;
    }
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

  const drawClip = (i: number, T: number) => {
    const local = T - start[i];
    const el = els[i];
    const p = i > 0 && tr > 0 && local < tr ? Math.max(0, Math.min(1, local / tr)) : 1;
    if (opts.trans === 'flash' && p < 0.5) return; // flash: the new clip appears after the white peak
    ctx.save();
    if (p < 1) {
      if (opts.trans === 'fade') ctx.globalAlpha = p;
      else if (opts.trans === 'slide') ctx.translate((1 - p) * W, 0);
      else if (opts.trans === 'zoom') { ctx.globalAlpha = p; ctx.translate(W / 2, H / 2); const s = 1.4 - 0.4 * p; ctx.scale(s, s); ctx.translate(-W / 2, -H / 2); }
      else if (opts.trans === 'wipe') { ctx.beginPath(); ctx.rect(0, 0, W * p, H); ctx.clip(); }
      else if (opts.trans === 'up') ctx.translate(0, (1 - p) * H);
      else if (opts.trans === 'left') ctx.translate(-(1 - p) * W, 0);
      else if (opts.trans === 'spin') { ctx.globalAlpha = p; ctx.translate(W / 2, H / 2); ctx.rotate((1 - p) * -Math.PI / 3); const s = 0.6 + 0.4 * p; ctx.scale(s, s); ctx.translate(-W / 2, -H / 2); }
      else if (opts.trans === 'zoomout') { ctx.globalAlpha = p; ctx.translate(W / 2, H / 2); const s = 0.6 + 0.4 * p; ctx.scale(s, s); ctx.translate(-W / 2, -H / 2); }
      else if (opts.trans === 'circle') { ctx.beginPath(); ctx.arc(W / 2, H / 2, p * Math.hypot(W, H) / 2, 0, Math.PI * 2); ctx.clip(); }
      else if (opts.trans === 'split') { ctx.beginPath(); ctx.rect((W / 2) * (1 - p), 0, W * p, H); ctx.clip(); }
    }
    const zoom = el instanceof HTMLVideoElement ? 1 : 1 + 0.06 * (local / dur[i]);
    drawCover(ctx, el, zoom);
    ctx.restore();
  };

  if (musicVid) { try { musicVid.el.currentTime = 0; } catch { /* */ } void musicVid.el.play().catch(() => {}); }
  await new Promise<void>(resolve => {
    const t0 = performance.now();
    const frame = () => {
      if (dead()) { resolve(); return; }
      const T = (performance.now() - t0) / 1000;
      if (T >= total) { resolve(); return; }
      if (musicVid && T > total - 0.8) musicVid.gain.gain.value = musicVid.vol * Math.max(0, (total - T) / 0.8);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < n; i++) {
        const s = start[i];
        if (T >= s && T < s + dur[i]) {
          if (!started.has(i)) {
            started.add(i);
            const e = els[i];
            if (e instanceof HTMLVideoElement) { try { e.currentTime = 0; } catch { /* */ } void e.play().catch(() => {}); }
          }
          drawClip(i, T);
        } else if (T >= s + dur[i] && !ended.has(i)) {
          ended.add(i);
          const e = els[i];
          if (e instanceof HTMLVideoElement) { try { e.pause(); } catch { /* */ } }
        }
      }
      if (opts.trans === 'flash' && tr > 0) {
        for (let i = 1; i < n; i++) {
          const lc = T - start[i];
          if (lc >= 0 && lc < tr) {
            const pp = lc / tr;
            ctx.fillStyle = `rgba(255,255,255,${(1 - Math.abs(pp - 0.5) * 2) * 0.9})`;
            ctx.fillRect(0, 0, W, H);
          }
        }
      }
      onPct(Math.min(99, Math.round((T / total) * 100)));
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });

  try { if (rec.state !== 'inactive') rec.stop(); } catch { /* */ }
  await stopped;
  els.forEach(e => { if (e instanceof HTMLVideoElement) { try { e.pause(); e.removeAttribute('src'); e.load(); } catch { /* */ } } });
  if (musicVid) { try { musicVid.el.pause(); musicVid.el.removeAttribute('src'); musicVid.el.load(); URL.revokeObjectURL(musicVid.url); } catch { /* */ } }
  try { await ac?.close(); } catch { /* */ }
  stream.getTracks().forEach(t => t.stop());
  if (dead()) throw new Error('aborted');
  const type = (rec.mimeType || mime || 'video/webm').split(';')[0];
  return new Blob(chunks, { type });
}

interface Props {
  open: boolean;
  items?: MergeItem[];
  onClose: () => void;
  onDone: (blob: Blob, kind: 'video', name: string) => void;
  ar?: boolean;
}

const TRANS: { id: Trans; ar: string; en: string }[] = [
  { id: 'fade', ar: 'تلاشي', en: 'Fade' },
  { id: 'slide', ar: 'انزلاق', en: 'Slide' },
  { id: 'zoom', ar: 'زوم', en: 'Zoom' },
  { id: 'wipe', ar: 'سحب', en: 'Wipe' },
  { id: 'flash', ar: 'فلاش', en: 'Flash' },
  { id: 'up', ar: 'للأعلى', en: 'Up' },
  { id: 'left', ar: 'من اليسار', en: 'Left' },
  { id: 'spin', ar: 'دوران', en: 'Spin' },
  { id: 'zoomout', ar: 'تصغير', en: 'Zoom out' },
  { id: 'circle', ar: 'دائرة', en: 'Circle' },
  { id: 'split', ar: 'فتح', en: 'Split' },
  { id: 'none', ar: 'بدون', en: 'None' },
];

export default function MergeMedia({ open, items: initial = [], onClose, onDone, ar = false }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [per, setPer] = useState(3);
  const [trans, setTrans] = useState<Trans>('fade');
  const [music, setMusic] = useState<Music>({ type: 'none' });
  const [keepAudio, setKeepAudio] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<{ blob: Blob; url: string } | null>(null);
  const [playing, setPlaying] = useState('');
  const abortRef = useRef(false);
  const mediaInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const videoAudioInput = useRef<HTMLInputElement>(null);
  const prevRef = useRef<AudioContext | null>(null);
  const t = (a: string, e: string) => (ar ? a : e);
  const qn = q.trim().toLowerCase();
  const shown = TRACKS.filter(x => !qn || `${x.ar} ${x.en} ${x.tags}`.toLowerCase().includes(qn));
  const hasVideo = items.some(x => x.kind === 'video');

  const stopPrev = () => {
    try { prevRef.current?.close(); } catch { /* */ }
    prevRef.current = null;
    setPlaying('');
  };

  const preview = (tk: Track) => {
    if (playing === tk.id) { stopPrev(); return; }
    stopPrev();
    const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    try {
      const ac = new AC() as AudioContext;
      scheduleMusic(ac, ac.destination, tk, 8, 0.5);
      prevRef.current = ac;
      setPlaying(tk.id);
      window.setTimeout(() => { if (prevRef.current === ac) stopPrev(); }, 8200);
    } catch { /* */ }
  };

  const reset = () => {
    abortRef.current = true;
    stopPrev();
    setItems(prev => { prev.forEach(m => { if (m.own) { try { URL.revokeObjectURL(m.url); } catch { /* */ } } }); return []; });
    setResult(r => { if (r) { try { URL.revokeObjectURL(r.url); } catch { /* */ } } return null; });
    setMusic({ type: 'none' }); setQ(''); setBusy(false); setPct(0); setErr(''); setKeepAudio(false);
  };

  useEffect(() => {
    if (open) {
      abortRef.current = false;
      setItems(initial.map((m, i) => ({ ...m, id: `i-${Date.now()}-${i}`, own: false })));
    } else {
      reset();
    }
    return () => { try { prevRef.current?.close(); } catch { /* */ } };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const addMedia = (files: FileList | null) => {
    if (!files) return;
    const next: Item[] = [];
    Array.from(files).forEach(f => {
      const isV = f.type.startsWith('video/');
      const isI = f.type.startsWith('image/');
      if (!isV && !isI) return;
      if (f.size > (isV ? 150 : 12) * 1024 * 1024) return;
      next.push({ id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, kind: isV ? 'video' : 'image', url: URL.createObjectURL(f), name: f.name, own: true });
    });
    if (next.length) setItems(p => [...p, ...next].slice(0, 30)); // MAX-ITEMS: was 12
    setResult(null);
  };

  const removeItem = (id: string) => {
    setItems(p => { const g = p.find(x => x.id === id); if (g?.own) { try { URL.revokeObjectURL(g.url); } catch { /* */ } } return p.filter(x => x.id !== id); });
    setResult(null);
  };

  const move = (id: string, d: -1 | 1) => {
    setItems(p => {
      const i = p.findIndex(x => x.id === id);
      const j = i + d;
      if (i < 0 || j < 0 || j >= p.length) return p;
      const c = p.slice();
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
    setResult(null);
  };

  const create = async () => {
    if (busy || !items.length) return;
    if (typeof MediaRecorder === 'undefined') { setErr(t('جهازك ما يدعم إنشاء الفيديو', 'This device cannot create videos')); return; }
    stopPrev();
    abortRef.current = false;
    setBusy(true); setErr(''); setPct(0); setResult(null);
    try {
      const blob = await renderMerge(items, { per, trans, music, keepAudio: keepAudio && hasVideo }, setPct, () => abortRef.current);
      if (abortRef.current) return;
      if (!blob.size) throw new Error('empty');
      setPct(100);
      setResult({ blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      if (!abortRef.current) {
        console.error('[MergeMedia]', e);
        setErr(String((e as any)?.message) === 'audio-decode'
          ? t('ما قدرت أقرأ ملف الصوت، جرّب ملف ثاني.', 'Could not read the audio file, try another one.')
          : t('ما قدرت أدمج، جرّب ملفات ثانية.', 'Could not merge, try other files.'));
      }
    } finally { setBusy(false); }
  };

  const useResult = () => {
    if (!result) return;
    const ext = result.blob.type.includes('mp4') ? 'mp4' : 'webm';
    onDone(result.blob, 'video', `merge-${Date.now()}.${ext}`);
    onClose();
  };

  const close = () => { abortRef.current = true; stopPrev(); onClose(); };

  if (!open) return null;

  const chip = (on: boolean): React.CSSProperties => ({
    flexShrink: 0, border: 'none', borderRadius: 999, padding: '8px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer',
    background: on ? '#fff' : 'rgba(255,255,255,0.12)', color: on ? '#111' : '#fff',
  });
  const label: React.CSSProperties = { margin: '0 0 8px', fontWeight: 700, fontSize: 14, opacity: 0.8 };
  const arrowBtn: React.CSSProperties = { width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.7)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 };

  return createPortal(
    <div
      onClick={e => e.stopPropagation()}
      dir={ar ? 'rtl' : 'ltr'}
      style={{ position: 'fixed', inset: 0, zIndex: 25000, background: '#0b0b0d', color: '#fff', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 16px 10px' }}>
        <span style={{ fontWeight: 800, fontSize: 18 }}>{t('دمج الصور والفيديوهات', 'Merge photos & videos')}</span>
        <button type="button" aria-label="Close" onClick={close} style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <XIcon size={20} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {result ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <video src={result.url} autoPlay loop playsInline controls controlsList="nofullscreen nodownload noplaybackrate noremoteplayback" disablePictureInPicture disableRemotePlayback onContextMenu={e => e.preventDefault()} style={{ width: '100%', maxWidth: 320, maxHeight: '62dvh', borderRadius: 16, background: '#000' }} />
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
            {/* 1) الملفات */}
            <div>
              <p style={label}>{t('1) الصور والفيديوهات (بالترتيب)', '1) Photos & videos (in order)')}</p>
              <input ref={mediaInput} type="file" multiple accept="image/*,video/*" style={{ display: 'none' }} onChange={e => { addMedia(e.target.files); e.target.value = ''; }} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {items.map((m, i) => (
                  <div key={m.id} style={{ position: 'relative', width: 84, height: 112, borderRadius: 12, overflow: 'hidden', background: '#222' }}>
                    {m.kind === 'image'
                      ? <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <video src={m.url} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                    <span style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(0,0,0,0.7)', borderRadius: 999, fontSize: 11, fontWeight: 800, padding: '2px 7px' }}>{i + 1}{m.kind === 'video' ? ' ▶' : ''}</span>
                    {!busy && (
                      <>
                        <button type="button" aria-label="Remove" onClick={() => removeItem(m.id)} style={{ position: 'absolute', top: 3, right: 3, width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 13, cursor: 'pointer' }}>×</button>
                        <div style={{ position: 'absolute', bottom: 4, left: 4, right: 4, display: 'flex', justifyContent: 'space-between' }} dir="ltr">
                          <button type="button" aria-label="Move earlier" onClick={() => move(m.id, -1)} style={{ ...arrowBtn, opacity: i === 0 ? 0.3 : 1 }}><ChevronLeft size={15} /></button>
                          <button type="button" aria-label="Move later" onClick={() => move(m.id, 1)} style={{ ...arrowBtn, opacity: i === items.length - 1 ? 0.3 : 1 }}><ChevronRight size={15} /></button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {items.length < 30 && (
                  <button type="button" disabled={busy} onClick={() => mediaInput.current?.click()} style={{ width: 84, height: 112, borderRadius: 12, border: '2px dashed rgba(255,255,255,0.35)', background: 'transparent', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Plus size={26} />
                  </button>
                )}
              </div>
            </div>

            {/* 2) الإعدادات */}
            <div>
              <p style={label}>{t('2) مدة كل صورة', '2) Seconds per photo')}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[2, 3, 4, 5, 7, 10, 15, 20].map(s => <button key={s} type="button" onClick={() => setPer(s)} style={chip(per === s)}>{s} {t('ث', 's')}</button>)}
              </div>
              <p style={{ ...label, marginTop: 14 }}>{t('الانتقال بين المقاطع', 'Transition')}</p>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 4 }}>
                {TRANS.map(x => <button key={x.id} type="button" onClick={() => setTrans(x.id)} style={chip(trans === x.id)}>{ar ? x.ar : x.en}</button>)}
              </div>
              {hasVideo && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  <input type="checkbox" checked={keepAudio} onChange={e => setKeepAudio(e.target.checked)} style={{ width: 18, height: 18 }} />
                  {t('أبقي صوت الفيديو الأصلي', 'Keep the original video sound')}
                </label>
              )}
            </div>

            {/* 3) الموسيقى */}
            <div>
              <p style={label}>{t('3) الموسيقى', '3) Music')}</p>
              <input ref={audioInput} type="file" accept="audio/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { stopPrev(); setMusic({ type: 'file', file: f }); } e.target.value = ''; }} />
              <input ref={videoAudioInput} type="file" accept="video/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { stopPrev(); setMusic({ type: 'video', file: f }); } e.target.value = ''; }} />
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, overflowX: 'auto' }}>
                <button type="button" onClick={() => { stopPrev(); setMusic({ type: 'none' }); }} style={chip(music.type === 'none')}>{t('بدون موسيقى', 'No music')}</button>
                <button type="button" onClick={() => audioInput.current?.click()} style={chip(music.type === 'file')}>
                  {music.type === 'file' ? `🎵 ${music.file.name.length > 18 ? music.file.name.slice(0, 16) + '…' : music.file.name}` : t('🎵 من جهازي', '🎵 From my device')}
                </button>
                <button type="button" onClick={() => videoAudioInput.current?.click()} style={chip(music.type === 'video')}>
                  {music.type === 'video' ? `🎬 ${music.file.name.length > 18 ? music.file.name.slice(0, 16) + '…' : music.file.name}` : t('🎬 من فيديو', '🎬 From video')}
                </button>
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
            disabled={busy || !items.length}
            onClick={() => { void create(); }}
            style={{
              position: 'relative', overflow: 'hidden', width: '100%', maxWidth: 420, border: 'none', borderRadius: 999, padding: '14px 18px', fontSize: 16, fontWeight: 800,
              color: '#fff', cursor: busy || !items.length ? 'default' : 'pointer', background: busy ? '#3a3a3a' : items.length ? '#ef4444' : '#444',
            }}
          >
            {busy && <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: 'linear-gradient(90deg, #f59e0b, #facc15)', transition: 'width 0.25s ease-out' }} />}
            <span style={{ position: 'relative', color: busy && pct > 45 ? '#1a1300' : '#fff' }}>
              {busy ? `${t('جاري الدمج', 'Merging')}  ${pct}%` : t('دمج', 'Merge')}
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
