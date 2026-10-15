/**
 * IMAGE-MARKUP  (ملف مستقل — يُستخدم من friendChatPatch.tsx قبل إرسال الصورة في شات الأصدقاء)
 *
 * يفتح الصورة بملء الشاشة ويتيح: قلم حر · سهم · دائرة · مستطيل · نص ، مع 6 ألوان وتراجع ومسح الكل.
 * الإحداثيات محفوظة نسبية (0..1) فيطابق الناتج ما تراه على الشاشة بأي مقاس.
 * بدون أي علامة => تُرسل الصورة الأصلية كما هي (بدون إعادة ضغط).
 * معها علامات => تُصدَّر JPEG (حد أقصى 2048px) وتُرسل بنفس مسار الرفع الحالي.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, ArrowUpRight, Circle, Square, Type, Undo2, Trash2, Send } from 'lucide-react';

type Tool = 'pen' | 'arrow' | 'circle' | 'rect' | 'text';
interface Pt { x: number; y: number }
interface Shape { tool: Tool; color: string; w: number; pts: Pt[]; text?: string }

const COLORS = ['#ef4444', '#facc15', '#22c55e', '#3b82f6', '#ffffff', '#000000'];
const STROKE = 0.006; // سماكة الخط نسبة إلى عرض الصورة
const TOOLS: { id: Tool; icon: React.ReactNode; label: string }[] = [
  { id: 'pen', icon: <Pencil size={20} />, label: 'قلم' },
  { id: 'arrow', icon: <ArrowUpRight size={22} />, label: 'سهم' },
  { id: 'circle', icon: <Circle size={20} />, label: 'دائرة' },
  { id: 'rect', icon: <Square size={19} />, label: 'مربع' },
  { id: 'text', icon: <Type size={20} />, label: 'نص' },
];

type Src = ImageBitmap | HTMLImageElement;
const srcW = (s: Src) => ('naturalWidth' in s ? s.naturalWidth : s.width);
const srcH = (s: Src) => ('naturalHeight' in s ? s.naturalHeight : s.height);

async function loadSrc(file: File): Promise<Src> {
  try {
    if (typeof createImageBitmap === 'function') return await createImageBitmap(file, { imageOrientation: 'from-image' } as any);
  } catch { /* fall back to <img> */ }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('img')); i.src = url; });
  } finally { window.setTimeout(() => URL.revokeObjectURL(url), 30000); }
}

function paint(ctx: CanvasRenderingContext2D, cw: number, ch: number, src: Src | null, shapes: Shape[]) {
  ctx.clearRect(0, 0, cw, ch);
  if (src) ctx.drawImage(src, 0, 0, cw, ch);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const s of shapes) {
    const lw = Math.max(2, s.w * cw);
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = lw;
    const p = s.pts.map(q => ({ x: q.x * cw, y: q.y * ch }));
    if (!p.length) continue;
    if (s.tool === 'pen') {
      ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y);
      if (p.length === 1) ctx.lineTo(p[0].x + 0.01, p[0].y);
      for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
      ctx.stroke();
    } else if (s.tool === 'text') {
      const size = Math.max(16, s.w * cw * 8);
      ctx.font = `800 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`; ctx.textBaseline = 'middle';
      ctx.lineWidth = size * 0.14; ctx.strokeStyle = s.color === '#000000' ? '#ffffff' : '#000000';
      ctx.strokeText(s.text || '', p[0].x, p[0].y); ctx.fillText(s.text || '', p[0].x, p[0].y);
    } else if (p.length > 1) {
      const a = p[0], b = p[p.length - 1];
      if (s.tool === 'arrow') {
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        const ang = Math.atan2(b.y - a.y, b.x - a.x), hl = Math.max(14, lw * 5);
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - hl * Math.cos(ang - Math.PI / 7), b.y - hl * Math.sin(ang - Math.PI / 7));
        ctx.lineTo(b.x - hl * Math.cos(ang + Math.PI / 7), b.y - hl * Math.sin(ang + Math.PI / 7));
        ctx.closePath(); ctx.fill();
      } else if (s.tool === 'circle') {
        ctx.beginPath(); ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (s.tool === 'rect') {
        ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      }
    }
  }
}

export interface ImageMarkupProps {
  file: File;
  onCancel: () => void;
  /** الصورة الأصلية إذا ما فيه علامات، أو نسخة JPEG عليها العلامات */
  onDone: (file: File) => void;
}

export default function ImageMarkup({ file, onCancel, onDone }: ImageMarkupProps) {
  const [src, setSrc] = useState<Src | null>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [tool, setTool] = useState<Tool>('arrow');
  const [color, setColor] = useState(COLORS[0]);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [txt, setTxt] = useState<{ x: number; y: number; v: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let alive = true;
    loadSrc(file).then(s => { if (alive) setSrc(s); }).catch(() => { if (alive) onDone(file); });
    return () => { alive = false; };
  }, [file]); // eslint-disable-line react-hooks/exhaustive-deps

  const fit = useCallback(() => {
    const el = wrapRef.current; if (!el || !src) return;
    const cw = el.clientWidth - 16, chh = el.clientHeight - 16;
    const iw = srcW(src), ih = srcH(src);
    const k = Math.min(cw / iw, chh / ih);
    if (k > 0) setBox({ w: Math.floor(iw * k), h: Math.floor(ih * k) });
  }, [src]);
  useEffect(() => {
    fit();
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  const all = useMemo(() => (draft ? [...shapes, draft] : shapes), [shapes, draft]);
  useEffect(() => {
    const cv = cvRef.current; if (!cv || !src || !box.w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(box.w * dpr); cv.height = Math.round(box.h * dpr);
    const ctx = cv.getContext('2d'); if (!ctx) return;
    paint(ctx, cv.width, cv.height, src, all);
  }, [src, box, all]);

  const posOf = (e: React.PointerEvent): Pt => {
    const r = cvRef.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const down = (e: React.PointerEvent) => {
    if (!src || busy) return;
    if (txt) { commitText(); return; }
    const p = posOf(e);
    if (tool === 'text') { setTxt({ x: p.x, y: p.y, v: '' }); return; }
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* */ }
    setDraft({ tool, color, w: STROKE, pts: [p] });
  };
  const move = (e: React.PointerEvent) => {
    if (!draft) return;
    const p = posOf(e);
    setDraft(d => (d ? { ...d, pts: d.tool === 'pen' ? [...d.pts, p] : [d.pts[0], p] } : d));
  };
  const up = () => {
    if (!draft) return;
    const a = draft.pts[0], b = draft.pts[draft.pts.length - 1];
    const ok = draft.tool === 'pen' || Math.hypot(b.x - a.x, b.y - a.y) > 0.012;
    if (ok) setShapes(s => [...s, draft]);
    setDraft(null);
  };
  const commitText = () => {
    if (txt && txt.v.trim()) setShapes(s => [...s, { tool: 'text', color, w: STROKE, pts: [{ x: txt.x, y: txt.y }], text: txt.v.trim() }]);
    setTxt(null);
  };

  const done = async () => {
    if (busy) return;
    if (txt) commitText();
    if (!shapes.length && !(txt && txt.v.trim())) { onDone(file); return; }
    if (!src) return;
    setBusy(true);
    try {
      const sc = Math.min(1, 2048 / Math.max(srcW(src), srcH(src)));
      const W = Math.round(srcW(src) * sc), H = Math.round(srcH(src) * sc);
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const ctx = c.getContext('2d'); if (!ctx) { onDone(file); return; }
      const extra: Shape[] = txt && txt.v.trim() ? [{ tool: 'text', color, w: STROKE, pts: [{ x: txt.x, y: txt.y }], text: txt.v.trim() }] : [];
      paint(ctx, W, H, src, [...shapes, ...extra]);
      const blob: Blob | null = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.9));
      if (!blob) { onDone(file); return; }
      const base = (file.name || 'photo').replace(/\.[^.]+$/, '');
      onDone(new File([blob], `${base}-marked.jpg`, { type: 'image/jpeg' }));
    } finally { setBusy(false); }
  };

  const bar: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '8px 10px' };
  const btn = (on: boolean): React.CSSProperties => ({
    width: 44, height: 44, borderRadius: 14, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
    background: on ? '#3b82f6' : 'rgba(255,255,255,0.12)', color: '#fff', flexShrink: 0,
  });

  return (
    <div dir="ltr" style={{ position: 'absolute', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', userSelect: 'none', WebkitUserSelect: 'none' }}>
      {/* الشريط العلوي: ترك مساحة لزر الإغلاق الأصلي على اليسار */}
      <div style={{ ...bar, paddingTop: 'max(10px, env(safe-area-inset-top))', paddingLeft: 56, justifyContent: 'flex-end' }}>
        {TOOLS.map(t => (
          <button key={t.id} type="button" aria-label={t.label} title={t.label} onClick={() => { if (txt) commitText(); setTool(t.id); }} style={btn(tool === t.id)}>{t.icon}</button>
        ))}
        <button type="button" aria-label="Undo" onClick={() => setShapes(s => s.slice(0, -1))} disabled={!shapes.length} style={{ ...btn(false), opacity: shapes.length ? 1 : 0.35 }}><Undo2 size={20} /></button>
        <button type="button" aria-label="Clear" onClick={() => setShapes([])} disabled={!shapes.length} style={{ ...btn(false), opacity: shapes.length ? 1 : 0.35 }}><Trash2 size={19} /></button>
      </div>

      <div ref={wrapRef} style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {!src && <span style={{ color: '#9ca3af', fontSize: 14 }}>…</span>}
        {src && (
          <div style={{ position: 'relative', width: box.w, height: box.h }}>
            <canvas
              ref={cvRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
              style={{ width: box.w, height: box.h, display: 'block', touchAction: 'none', borderRadius: 4 }}
            />
            {txt && (
              <input
                autoFocus value={txt.v} dir="auto" placeholder="اكتب…"
                onChange={e => setTxt(t => (t ? { ...t, v: e.target.value } : t))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitText(); } else if (e.key === 'Escape') setTxt(null); }}
                style={{
                  position: 'absolute', left: `${Math.min(60, txt.x * 100)}%`, top: `${txt.y * 100}%`, transform: 'translateY(-50%)', minWidth: 120, maxWidth: '60%',
                  background: 'rgba(0,0,0,0.55)', color, border: `2px solid ${color}`, borderRadius: 10, padding: '6px 10px', fontSize: 17, fontWeight: 800, outline: 'none',
                }}
              />
            )}
          </div>
        )}
      </div>

      <div style={{ ...bar, justifyContent: 'space-between', paddingBottom: 'max(14px, env(safe-area-inset-bottom))', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {COLORS.map(c => (
            <button
              key={c} type="button" aria-label={c} onClick={() => setColor(c)}
              style={{ width: 30, height: 30, borderRadius: '50%', background: c, cursor: 'pointer', padding: 0, border: color === c ? '3px solid #3b82f6' : '2px solid rgba(255,255,255,0.45)', boxSizing: 'border-box' }}
            />
          ))}
        </div>
        <button
          type="button" onClick={() => void done()} disabled={busy || !src}
          style={{ display: 'flex', alignItems: 'center', gap: 8, height: 46, padding: '0 22px', borderRadius: 23, border: 'none', background: '#22c55e', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', opacity: busy || !src ? 0.6 : 1 }}
        >{busy ? '…' : <><span dir="auto">إرسال</span><Send size={17} /></>}</button>
      </div>
    </div>
  );
}
