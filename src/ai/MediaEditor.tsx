import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X as XIcon, Check, Type, Square, Crop as CropIcon, Scissors, Trash2, Play, Pause } from 'lucide-react';

/**
 * Stooorna Ai — Media Editor (v1.0.0)
 * Place at: src/ai/MediaEditor.tsx
 *
 * Full-screen editor that opens a photo or a video at full size with edit buttons underneath:
 *   - Text   : add text, drag it, change colour / size
 *   - Box    : add a frame (square) around any part, drag + resize, optional fill
 *   - Crop   : cut the picture / video to a smaller area
 *   - Trim   : (video only) cut the start / end of the clip
 * Works 100% inside the app (no server needed), so it can never give a 404.
 */

type Kind = 'image' | 'video';
interface Rect { x: number; y: number; w: number; h: number }
interface TextItem { id: string; type: 'text'; x: number; y: number; text: string; color: string; size: number }
interface BoxItem { id: string; type: 'box'; x: number; y: number; w: number; h: number; color: string; stroke: number; fill: boolean }
type Item = TextItem | BoxItem;
type Tool = 'none' | 'text' | 'box' | 'crop' | 'trim';

export interface MediaEditorProps {
  url: string;
  kind: Kind;
  name?: string;
  ar?: boolean;
  onClose: () => void;
  onDone: (blob: Blob, kind: Kind, name: string) => void;
}

const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };
const COLORS = ['#ffffff', '#000000', '#ef4444', '#facc15', '#22c55e', '#3b82f6'];
const RED = '#ef4444';
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const uid = () => `i-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const isFull = (r: Rect) => r.x <= 0.001 && r.y <= 0.001 && r.w >= 0.999 && r.h >= 0.999;

function drawOverlays(ctx: CanvasRenderingContext2D, items: Item[], c: Rect, outW: number, outH: number) {
  const k = outH / c.h; // pixels per "full media height"
  items.forEach(it => {
    if (it.type === 'box') {
      const x = ((it.x - c.x) / c.w) * outW;
      const y = ((it.y - c.y) / c.h) * outH;
      const w = (it.w / c.w) * outW;
      const h = (it.h / c.h) * outH;
      if (it.fill) { ctx.fillStyle = it.color + '55'; ctx.fillRect(x, y, w, h); }
      ctx.lineWidth = Math.max(2, it.stroke * k);
      ctx.strokeStyle = it.color;
      ctx.strokeRect(x, y, w, h);
    } else {
      const px = Math.max(8, it.size * k);
      ctx.font = `800 ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      const x = ((it.x - c.x) / c.w) * outW;
      const y = ((it.y - c.y) / c.h) * outH;
      ctx.lineWidth = px * 0.16;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(it.text, x, y);
      ctx.fillStyle = it.color;
      ctx.fillText(it.text, x, y);
    }
  });
}

export default function MediaEditor({ url, kind, name, ar = true, onClose, onDone }: MediaEditorProps) {
  const T = ar
    ? { text: 'نص', box: 'مربع', crop: 'قص', trim: 'اقتطاع', apply: 'تطبيق', reset: 'إعادة', size: 'الحجم', fill: 'تعبئة', start: 'البداية', end: 'النهاية', def: 'اكتب هنا', saving: 'جاري التجهيز…', fail: 'تعذر حفظ التعديل، حاول مرة ثانية.' }
    : { text: 'Text', box: 'Box', crop: 'Crop', trim: 'Trim', apply: 'Apply', reset: 'Reset', size: 'Size', fill: 'Fill', start: 'Start', end: 'End', def: 'Type here', saving: 'Preparing…', fail: 'Could not save the edit, please try again.' };

  const stageRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [avail, setAvail] = useState({ w: 300, h: 400 });
  const [items, setItems] = useState<Item[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('none');
  const [crop, setCrop] = useState<Rect>(FULL);
  const [draft, setDraft] = useState<Rect>(FULL);
  const [duration, setDuration] = useState(0);
  const [trim, setTrim] = useState<[number, number]>([0, 0]);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState('');

  // measure the free area for the picture
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setAvail({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  const view = tool === 'crop' ? FULL : crop;
  const nw = nat?.w || 1;
  const nh = nat?.h || 1;
  const sc = Math.max(0.01, Math.min((avail.w - 16) / (nw * view.w), (avail.h - 16) / (nh * view.h)));
  const vpW = nw * view.w * sc;
  const vpH = nh * view.h * sc;
  const innerW = nw * sc;
  const innerH = nh * sc;

  const selected = items.find(i => i.id === sel) || null;
  const hasEdits = items.length > 0 || !isFull(crop) || (kind === 'video' && (trim[0] > 0.05 || trim[1] < duration - 0.05));

  const patchItem = (id: string, p: Partial<TextItem> & Partial<BoxItem>) =>
    setItems(prev => prev.map(i => (i.id === id ? ({ ...i, ...p } as Item) : i)));

  const addText = () => {
    const it: TextItem = { id: uid(), type: 'text', x: 0.5, y: 0.5, text: T.def, color: '#ffffff', size: 0.07 };
    setItems(p => [...p, it]); setSel(it.id); setTool('text');
  };
  const addBox = () => {
    const it: BoxItem = { id: uid(), type: 'box', x: 0.25, y: 0.25, w: 0.5, h: 0.5, color: RED, stroke: 0.006, fill: false };
    setItems(p => [...p, it]); setSel(it.id); setTool('box');
  };
  const toggleTool = (t: Tool) => {
    if (t === 'crop' && tool !== 'crop') { setDraft(crop); setSel(null); }
    setTool(prev => (prev === t ? 'none' : t));
  };
  const removeSel = () => {
    if (!sel) return;
    setItems(p => p.filter(i => i.id !== sel));
    setSel(null);
  };

  // ---------- dragging (items + crop frame) ----------
  const startDrag = (e: React.PointerEvent, target: { kind: 'item' | 'crop'; id?: string; mode: string }) => {
    e.stopPropagation();
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const W = innerW, H = innerH;
    const origItem = target.kind === 'item' ? items.find(i => i.id === target.id) : undefined;
    const o = { ...draft };
    if (target.kind === 'item' && target.id) setSel(target.id);
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / W;
      const dy = (ev.clientY - sy) / H;
      if (target.kind === 'item' && origItem && target.id) {
        if (target.mode === 'move') {
          patchItem(target.id, { x: clamp(origItem.x + dx, 0, 1), y: clamp(origItem.y + dy, 0, 1) });
        } else if (origItem.type === 'box') {
          patchItem(target.id, { w: clamp(origItem.w + dx, 0.03, 1 - origItem.x), h: clamp(origItem.h + dy, 0.03, 1 - origItem.y) });
        }
      } else if (target.kind === 'crop') {
        const m = target.mode;
        if (m === 'move') {
          setDraft({ ...o, x: clamp(o.x + dx, 0, 1 - o.w), y: clamp(o.y + dy, 0, 1 - o.h) });
        } else {
          let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
          if (m.includes('l')) x1 = clamp(o.x + dx, 0, x2 - 0.08);
          if (m.includes('r')) x2 = clamp(o.x + o.w + dx, x1 + 0.08, 1);
          if (m.includes('t')) y1 = clamp(o.y + dy, 0, y2 - 0.08);
          if (m.includes('b')) y2 = clamp(o.y + o.h + dy, y1 + 0.08, 1);
          setDraft({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
        }
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  // ---------- video preview ----------
  const togglePlay = () => {
    const v = mediaRef.current as HTMLVideoElement | null;
    if (!v) return;
    if (!v.paused) { v.pause(); return; }
    if (v.currentTime < trim[0] || v.currentTime >= trim[1] - 0.05) v.currentTime = trim[0];
    void v.play().catch(() => { /* */ });
  };
  const onTime = () => {
    const v = mediaRef.current as HTMLVideoElement | null;
    if (v && !v.paused && v.currentTime >= trim[1]) v.pause();
  };

  // ---------- export ----------
  const exportImage = async (): Promise<Blob> => {
    const img = mediaRef.current as HTMLImageElement;
    const W = img.naturalWidth, H = img.naturalHeight;
    const sw = W * crop.w, sh = H * crop.h;
    const s = Math.min(1, 4096 / Math.max(sw, sh));
    const outW = Math.max(1, Math.round(sw * s)), outH = Math.max(1, Math.round(sh * s));
    const c = document.createElement('canvas');
    c.width = outW; c.height = outH;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    ctx.drawImage(img, W * crop.x, H * crop.y, sw, sh, 0, 0, outW, outH);
    drawOverlays(ctx, items, crop, outW, outH);
    const blob: Blob | null = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.92));
    if (!blob) throw new Error('encode failed');
    return blob;
  };

  const exportVideo = async (): Promise<Blob> => {
    const W = nat?.w || 640, H = nat?.h || 360;
    const sx = W * crop.x, sy = H * crop.y, sw = W * crop.w, sh = H * crop.h;
    const s = Math.min(1, 1280 / Math.max(sw, sh));
    const outW = Math.max(2, Math.round((sw * s) / 2) * 2), outH = Math.max(2, Math.round((sh * s) / 2) * 2);
    const c = document.createElement('canvas');
    c.width = outW; c.height = outH;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('no canvas');

    const v = document.createElement('video');
    v.src = url; v.playsInline = true; v.preload = 'auto';
    v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    document.body.appendChild(v);
    let actx: AudioContext | null = null;
    try {
      await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error('video load')); v.load(); });
      const [from, to] = trim;
      if (Math.abs(v.currentTime - from) > 0.02) {
        await new Promise<void>(res => { v.onseeked = () => res(); v.currentTime = from; });
      }
      const stream = (c as any).captureStream(30) as MediaStream;
      try {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
        actx = new AC();
        const srcNode = actx!.createMediaElementSource(v);
        const dest = actx!.createMediaStreamDestination();
        srcNode.connect(dest); // not connected to speakers -> silent while exporting
        dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
        if (actx!.state === 'suspended') await actx!.resume();
      } catch { /* video without sound is better than no video */ }

      const mime = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
        .find(m => (window as any).MediaRecorder?.isTypeSupported?.(m));
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 4_000_000 } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      const finished = new Promise<Blob>(res => {
        rec.onstop = () => res(new Blob(chunks, { type: rec.mimeType || 'video/webm' }));
      });

      rec.start(250);
      await v.play();
      const deadline = Date.now() + (to - from) * 2000 + 8000;
      await new Promise<void>(resolve => {
        const tick = () => {
          ctx.drawImage(v, sx, sy, sw, sh, 0, 0, outW, outH);
          drawOverlays(ctx, items, crop, outW, outH);
          setBusy(Math.min(99, Math.round(((v.currentTime - from) / Math.max(0.1, to - from)) * 100)));
          if (v.ended || v.currentTime >= to - 0.03 || Date.now() > deadline) { resolve(); return; }
          requestAnimationFrame(tick);
        };
        tick();
      });
      v.pause();
      rec.stop();
      return await finished;
    } finally {
      try { actx?.close(); } catch { /* */ }
      v.remove();
    }
  };

  const finish = async () => {
    if (busy !== null) return;
    if (!hasEdits) { onClose(); return; }
    setErr('');
    setBusy(0);
    try {
      const blob = kind === 'image' ? await exportImage() : await exportVideo();
      const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('webm') ? 'webm' : 'jpg';
      const base = (name || 'edited').replace(/\.\w+$/, '');
      onDone(blob, kind, `${base}-edited.${ext}`);
    } catch (e) {
      console.error('[Stooorna Ai] editor export error:', e);
      setErr(T.fail);
    } finally {
      setBusy(null);
    }
  };

  const btn = (active: boolean): React.CSSProperties => ({
    flex: 1, minWidth: 0, border: 'none', borderRadius: 14, padding: '10px 4px',
    background: active ? RED : 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700,
  });
  const chip: React.CSSProperties = { border: 'none', borderRadius: 999, padding: '7px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#fff', background: 'rgba(255,255,255,0.14)' };

  const handle = (mode: string, pos: React.CSSProperties) => (
    <div
      onPointerDown={e => startDrag(e, { kind: 'crop', mode })}
      style={{ position: 'absolute', width: 30, height: 30, background: '#fff', borderRadius: 8, touchAction: 'none', ...pos }}
    />
  );

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 31000, background: '#0b0b0c', color: '#fff', display: 'flex', flexDirection: 'column', direction: 'ltr' }}>
      {/* top bar */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'max(10px, env(safe-area-inset-top)) 12px 10px' }}>
        <button type="button" aria-label="Close" onClick={onClose} style={{ width: 42, height: 42, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <XIcon size={22} />
        </button>
        <button type="button" aria-label="Done" onClick={() => { void finish(); }} style={{ height: 42, padding: '0 18px', borderRadius: 999, border: 'none', background: RED, color: '#fff', fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <Check size={20} /> {ar ? 'تم' : 'Done'}
        </button>
      </div>

      {/* stage: the photo / video opens here at full size */}
      <div
        ref={stageRef}
        onPointerDown={() => setSel(null)}
        style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none', position: 'relative' }}
      >
        <div style={{ position: 'relative', width: vpW, height: vpH, overflow: 'hidden', borderRadius: 4, background: '#000' }}>
          <div style={{ position: 'absolute', width: innerW, height: innerH, left: -view.x * innerW, top: -view.y * innerH }}>
            {kind === 'image' ? (
              <img
                ref={el => { mediaRef.current = el; }}
                src={url}
                alt=""
                draggable={false}
                onLoad={e => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none', userSelect: 'none' }}
              />
            ) : (
              <video
                ref={el => { mediaRef.current = el; }}
                src={url}
                playsInline
                preload="auto"
                onLoadedMetadata={e => {
                  const v = e.currentTarget;
                  setNat({ w: v.videoWidth || 640, h: v.videoHeight || 360 });
                  const d = isFinite(v.duration) ? v.duration : 0;
                  setDuration(d); setTrim([0, d]);
                  v.currentTime = 0.01;
                }}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                onTimeUpdate={onTime}
                style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none', background: '#000' }}
              />
            )}

            {items.map(it =>
              it.type === 'box' ? (
                <div
                  key={it.id}
                  onPointerDown={e => tool !== 'crop' && startDrag(e, { kind: 'item', id: it.id, mode: 'move' })}
                  style={{
                    position: 'absolute', left: `${it.x * 100}%`, top: `${it.y * 100}%`, width: `${it.w * 100}%`, height: `${it.h * 100}%`,
                    border: `${Math.max(2, it.stroke * innerH)}px solid ${it.color}`, background: it.fill ? it.color + '55' : 'transparent',
                    boxSizing: 'border-box', touchAction: 'none', pointerEvents: tool === 'crop' ? 'none' : 'auto',
                    outline: sel === it.id ? '1.5px dashed #fff' : 'none', outlineOffset: 3,
                  }}
                >
                  {sel === it.id && (
                    <div
                      onPointerDown={e => startDrag(e, { kind: 'item', id: it.id, mode: 'resize' })}
                      style={{ position: 'absolute', right: -14, bottom: -14, width: 28, height: 28, borderRadius: '50%', background: '#fff', border: `3px solid ${RED}`, touchAction: 'none' }}
                    />
                  )}
                </div>
              ) : (
                <div
                  key={it.id}
                  onPointerDown={e => tool !== 'crop' && startDrag(e, { kind: 'item', id: it.id, mode: 'move' })}
                  style={{
                    position: 'absolute', left: `${it.x * 100}%`, top: `${it.y * 100}%`, transform: 'translate(-50%,-50%)',
                    whiteSpace: 'nowrap', fontWeight: 800, fontSize: Math.max(8, it.size * innerH), color: it.color, lineHeight: 1.1,
                    textShadow: '0 0 4px rgba(0,0,0,0.85), 0 1px 2px rgba(0,0,0,0.85)', padding: '2px 6px', touchAction: 'none',
                    pointerEvents: tool === 'crop' ? 'none' : 'auto', cursor: 'move', userSelect: 'none',
                    outline: sel === it.id ? '1.5px dashed #fff' : 'none', outlineOffset: 2,
                  }}
                >
                  {it.text || ' '}
                </div>
              )
            )}

            {tool === 'crop' && (
              <div
                onPointerDown={e => startDrag(e, { kind: 'crop', mode: 'move' })}
                style={{
                  position: 'absolute', left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.w * 100}%`, height: `${draft.h * 100}%`,
                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)', border: '2px solid #fff', boxSizing: 'border-box', touchAction: 'none',
                }}
              >
                {handle('tl', { left: -8, top: -8 })}
                {handle('tr', { right: -8, top: -8 })}
                {handle('bl', { left: -8, bottom: -8 })}
                {handle('br', { right: -8, bottom: -8 })}
              </div>
            )}
          </div>
        </div>

        {kind === 'video' && tool !== 'crop' && (
          <button
            type="button"
            aria-label={playing ? 'Pause' : 'Play'}
            onPointerDown={e => e.stopPropagation()}
            onClick={togglePlay}
            style={{ position: 'absolute', left: 14, bottom: 10, width: 46, height: 46, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            {playing ? <Pause size={22} /> : <Play size={22} />}
          </button>
        )}
      </div>

      {/* bottom: context panel + edit buttons */}
      <div style={{ flexShrink: 0, padding: '10px 12px max(14px, env(safe-area-inset-bottom))', background: '#141416', borderTopLeftRadius: 22, borderTopRightRadius: 22 }}>
        {err && <div style={{ color: '#fca5a5', fontSize: 13, textAlign: 'center', marginBottom: 8 }}>{err}</div>}

        {selected && tool !== 'crop' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            {selected.type === 'text' && (
              <input
                value={selected.text}
                onChange={e => patchItem(selected.id, { text: e.target.value })}
                dir="auto"
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 16, outline: 'none' }}
              />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8, flex: 1, minWidth: 0 }}>
                {COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    onClick={() => patchItem(selected.id, { color: c })}
                    style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: selected.color === c ? `3px solid ${RED}` : '2px solid rgba(255,255,255,0.4)', cursor: 'pointer', padding: 0 }}
                  />
                ))}
              </div>
              {selected.type === 'box' && (
                <button type="button" onClick={() => patchItem(selected.id, { fill: !selected.fill })} style={{ ...chip, background: selected.fill ? RED : chip.background }}>{T.fill}</button>
              )}
              <button type="button" aria-label="Delete" onClick={removeSel} style={{ ...chip, padding: '7px 12px', display: 'flex', alignItems: 'center' }}>
                <Trash2 size={17} />
              </button>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#bbb' }}>
              {T.size}
              {selected.type === 'text' ? (
                <input type="range" min={0.03} max={0.2} step={0.005} value={selected.size} onChange={e => patchItem(selected.id, { size: Number(e.target.value) })} style={{ flex: 1, accentColor: RED }} />
              ) : (
                <input type="range" min={0.002} max={0.02} step={0.001} value={selected.stroke} onChange={e => patchItem(selected.id, { stroke: Number(e.target.value) })} style={{ flex: 1, accentColor: RED }} />
              )}
            </label>
          </div>
        )}

        {tool === 'crop' && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 12 }}>
            <button type="button" style={{ ...chip, background: RED }} onClick={() => { setCrop(draft); setTool('none'); }}>{T.apply}</button>
            <button type="button" style={chip} onClick={() => { setDraft(FULL); setCrop(FULL); }}>{T.reset}</button>
          </div>
        )}

        {tool === 'trim' && kind === 'video' && duration > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, fontSize: 12, color: '#bbb' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 56 }}>{T.start} {trim[0].toFixed(1)}s</span>
              <input type="range" min={0} max={duration} step={0.1} value={trim[0]} style={{ flex: 1, accentColor: RED }}
                onChange={e => {
                  const val = Math.min(Number(e.target.value), trim[1] - 0.3);
                  setTrim([Math.max(0, val), trim[1]]);
                  const v = mediaRef.current as HTMLVideoElement | null; if (v) v.currentTime = Math.max(0, val);
                }} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 56 }}>{T.end} {trim[1].toFixed(1)}s</span>
              <input type="range" min={0} max={duration} step={0.1} value={trim[1]} style={{ flex: 1, accentColor: RED }}
                onChange={e => {
                  const val = Math.max(Number(e.target.value), trim[0] + 0.3);
                  setTrim([trim[0], Math.min(duration, val)]);
                  const v = mediaRef.current as HTMLVideoElement | null; if (v) v.currentTime = Math.min(duration, val);
                }} />
            </label>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={btn(tool === 'text')} onClick={addText}><Type size={22} />{T.text}</button>
          <button type="button" style={btn(tool === 'box')} onClick={addBox}><Square size={22} />{T.box}</button>
          <button type="button" style={btn(tool === 'crop')} onClick={() => toggleTool('crop')}><CropIcon size={22} />{T.crop}</button>
          {kind === 'video' && (
            <button type="button" style={btn(tool === 'trim')} onClick={() => toggleTool('trim')}><Scissors size={22} />{T.trim}</button>
          )}
        </div>
      </div>

      {busy !== null && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.72)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, zIndex: 5 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{T.saving}</div>
          {kind === 'video' && <div style={{ fontSize: 22, fontWeight: 800 }}>{busy}%</div>}
        </div>
      )}
    </div>,
    document.body,
  );
}
