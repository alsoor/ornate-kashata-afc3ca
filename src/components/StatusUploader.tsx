/**
 * StatusUploader — pick photos/videos → preview carousel → upload as status items
 * Image display: 30s  |  Video display: 60s  |  Status lifetime: 24h
 *
 * iOS/Safari fix: inputs use position:fixed top:-9999 instead of display:none
 * so programmatic .click() works on all browsers.
 */
import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Video, X, Send, ChevronLeft, ChevronRight, Plus, ImageIcon } from 'lucide-react';

interface Props {
  onClose: () => void;
  onUploaded: () => void;
}

type MediaPreview = { url: string; type: 'image' | 'video'; file: File };

const HIDDEN_INPUT: React.CSSProperties = {
  position: 'fixed', top: -9999, left: -9999,
  width: 1, height: 1, opacity: 0, pointerEvents: 'none',
};

export default function StatusUploader({ onClose, onUploaded }: Props) {
  const [previews,  setPreviews]  = useState<MediaPreview[]>([]);
  const [current,   setCurrent]   = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadIdx, setUploadIdx] = useState(0);
  const [failedIdx, setFailedIdx] = useState<number | null>(null);
  const [error,     setError]     = useState('');

  const galleryRef = useRef<HTMLInputElement>(null);  // image/* + video/* from gallery
  const videoRef   = useRef<HTMLInputElement>(null);  // video/* only
  const cameraRef  = useRef<HTMLInputElement>(null);  // capture="environment"

  /* ── add files to preview list ── */
  function addFiles(files: File[]) {
    if (!files.length) return;
    setError('');
    files.forEach(file => {
      if (file.type.startsWith('video/')) {
        // validate duration before adding
        const blobUrl = URL.createObjectURL(file);
        const tmp = document.createElement('video');
        tmp.preload = 'metadata';
        tmp.onloadedmetadata = () => {
          URL.revokeObjectURL(blobUrl);
          if (tmp.duration > 60) { setError('الفيديو يتجاوز دقيقة واحدة'); return; }
          setPreviews(prev => {
            const next = [...prev, { url: URL.createObjectURL(file), type: 'video' as const, file }];
            setCurrent(next.length - 1);
            return next;
          });
        };
        tmp.onerror = () => {
          URL.revokeObjectURL(blobUrl);
          // can't read metadata — add anyway, server will handle
          setPreviews(prev => {
            const next = [...prev, { url: URL.createObjectURL(file), type: 'video' as const, file }];
            setCurrent(next.length - 1);
            return next;
          });
        };
        tmp.src = blobUrl;
      } else {
        // image (including HEIC from iOS)
        setPreviews(prev => {
          const next = [...prev, { url: URL.createObjectURL(file), type: 'image' as const, file }];
          setCurrent(next.length - 1);
          return next;
        });
      }
    });
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // reset so same file can be picked again
    addFiles(files);
  }

  function removeItem(idx: number) {
    URL.revokeObjectURL(previews[idx].url);
    setPreviews(prev => {
      const next = prev.filter((_, i) => i !== idx);
      setCurrent(c => Math.min(c, Math.max(0, next.length - 1)));
      return next;
    });
  }

  /* ── upload previews one by one; failed media stays in memory for retry ── */
  async function uploadAll(startAt = 0) {
    if (!previews.length) return;
    setUploading(true);
    setError('');
    setFailedIdx(null);
    try {
      for (let i = startAt; i < previews.length; i++) {
        setUploadIdx(i);
        const p = previews[i];
        const parts = p.file.name.split('.');
        const rawExt = parts.length > 1 ? parts.pop()!.toLowerCase() : '';
        const ext = rawExt ? `.${rawExt}` : (p.type === 'video' ? '.mp4' : '.jpg');
        let mime = p.file.type;
        if (!mime) {
          if (['.mp4', '.mov', '.m4v', '.avi', '.webm'].includes(ext)) mime = 'video/mp4';
          else if (ext === '.png') mime = 'image/png';
          else if (ext === '.webp') mime = 'image/webp';
          else if (ext === '.gif') mime = 'image/gif';
          else if (['.heic', '.heif'].includes(ext)) mime = 'image/heic';
          else mime = 'image/jpeg';
        }
        const res = await fetch('/api/status', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': mime, 'X-File-Ext': ext }, body: p.file,
        });
        if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      }
      onUploaded();
      onClose();
    } catch (err) {
      console.error('[StatusUploader] error:', err);
      setFailedIdx(uploadIdx);
      setError('فشل الرفع. تم الاحتفاظ بالملف ويمكنك المحاولة مرة أخرى.');
    } finally {
      setUploading(false);
    }
  }

  const hasPreviews = previews.length > 0;
  const cur = previews[current];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', damping: 22, stiffness: 280 }}
        style={{
          width: '100%', maxWidth: 480,
          background: 'linear-gradient(160deg, #0a1a1f 0%, #061014 100%)',
          borderRadius: '20px 20px 0 0',
          border: '1px solid rgba(0,188,212,0.18)',
          borderBottom: 'none',
          padding: '20px 20px 36px',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ color: 'rgba(0,188,212,0.9)', fontSize: '0.72rem', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, margin: 0 }}>
            إضافة ستاتس
          </p>
          <motion.button whileTap={{ scale: 0.85 }} onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: '50%', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.6)' }}>
            <X size={15} />
          </motion.button>
        </div>

        {/* Preview / Picker area */}
        <AnimatePresence mode="wait">
          {hasPreviews ? (
            <motion.div key="preview" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* Main preview */}
              <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', background: '#000', aspectRatio: '9/16', maxHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AnimatePresence mode="wait">
                  <motion.div key={current} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.18 }}
                    style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {cur?.type === 'video'
                      ? <video src={cur.url} controls playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      : <img src={cur?.url} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    }
                  </motion.div>
                </AnimatePresence>

                {/* Counter */}
                <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(0,0,0,0.65)', borderRadius: 20, padding: '3px 10px', color: '#fff', fontSize: '0.68rem', fontWeight: 600, border: '1px solid rgba(255,255,255,0.15)' }}>
                  {current + 1} / {previews.length}
                </div>

                {/* Remove */}
                <motion.button whileTap={{ scale: 0.85 }} onClick={() => removeItem(current)}
                  style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
                  <X size={13} />
                </motion.button>

                {/* Arrows */}
                {previews.length > 1 && (<>
                  <motion.button whileTap={{ scale: 0.85 }} onClick={() => setCurrent(c => Math.max(0, c - 1))}
                    style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: current === 0 ? 'not-allowed' : 'pointer', color: current === 0 ? 'rgba(255,255,255,0.2)' : '#fff', pointerEvents: current === 0 ? 'none' : 'auto' }}>
                    <ChevronLeft size={18} />
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.85 }} onClick={() => setCurrent(c => Math.min(previews.length - 1, c + 1))}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: current === previews.length - 1 ? 'not-allowed' : 'pointer', color: current === previews.length - 1 ? 'rgba(255,255,255,0.2)' : '#fff', pointerEvents: current === previews.length - 1 ? 'none' : 'auto' }}>
                    <ChevronRight size={18} />
                  </motion.button>
                </>)}
              </div>

              {/* Thumbnail strip */}
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                {previews.map((p, i) => (
                  <motion.div key={i} whileTap={{ scale: 0.92 }} onClick={() => setCurrent(i)}
                    style={{ flexShrink: 0, width: 52, height: 52, borderRadius: 8, overflow: 'hidden', border: i === current ? '2px solid #00BCD4' : '2px solid rgba(255,255,255,0.1)', cursor: 'pointer', position: 'relative', background: '#000' }}>
                    {p.type === 'video'
                      ? <video src={p.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    }
                    {uploading && i < uploadIdx && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,188,212,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: '#fff', fontSize: 14 }}>✓</span>
                      </div>
                    )}
                    {uploading && i === uploadIdx && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
                          style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
                      </div>
                    )}
                  </motion.div>
                ))}
                {/* Add more */}
                <motion.button whileTap={{ scale: 0.92 }} onClick={() => galleryRef.current?.click()}
                  style={{ flexShrink: 0, width: 52, height: 52, borderRadius: 8, background: 'rgba(0,188,212,0.08)', border: '2px dashed rgba(0,188,212,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(0,188,212,0.7)' }}>
                  <Plus size={20} />
                </motion.button>
              </div>
            </motion.div>
          ) : (
            /* Empty state — 3 pick buttons */
            <motion.div key="picker" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              <div style={{ display: 'flex', gap: 10 }}>
                {/* Gallery */}
                <motion.button whileTap={{ scale: 0.93 }} onClick={() => galleryRef.current?.click()}
                  style={{ flex: 1, padding: '22px 0', borderRadius: 14, cursor: 'pointer', background: 'rgba(0,188,212,0.07)', border: '1.5px dashed rgba(0,188,212,0.35)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'rgba(0,188,212,0.8)' }}>
                  <ImageIcon size={28} strokeWidth={1.5} />
                  <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>صورة / فيديو</span>
                  <span style={{ fontSize: '0.6rem', color: 'rgba(0,188,212,0.45)' }}>من المعرض</span>
                </motion.button>

                {/* Camera */}
                <motion.button whileTap={{ scale: 0.93 }} onClick={() => cameraRef.current?.click()}
                  style={{ flex: 1, padding: '22px 0', borderRadius: 14, cursor: 'pointer', background: 'rgba(212,24,0,0.07)', border: '1.5px dashed rgba(212,24,0,0.35)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'rgba(212,80,60,0.9)' }}>
                  <Camera size={28} strokeWidth={1.5} />
                  <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>كاميرا</span>
                  <span style={{ fontSize: '0.6rem', color: 'rgba(212,80,60,0.45)' }}>التقط الآن</span>
                </motion.button>
              </div>

              {/* Video only */}
              <motion.button whileTap={{ scale: 0.93 }} onClick={() => videoRef.current?.click()}
                style={{ width: '100%', padding: '14px 0', borderRadius: 14, cursor: 'pointer', background: 'rgba(80,0,212,0.07)', border: '1.5px dashed rgba(80,0,212,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'rgba(130,80,212,0.9)' }}>
                <Video size={22} strokeWidth={1.5} />
                <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>فيديو فقط</span>
                <span style={{ fontSize: '0.6rem', color: 'rgba(130,80,212,0.45)' }}>(حد أقصى دقيقة)</span>
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error and retry */}
        {error && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <p role="alert" style={{ color: '#ff6b6b', fontSize: '0.72rem', textAlign: 'center', margin: 0 }}>{error}</p>
            {failedIdx !== null && (
              <button type="button" onClick={() => void uploadAll(failedIdx)} disabled={uploading}
                className="rounded-lg border border-primary bg-card px-3.5 py-2 text-xs font-bold text-primary"
                style={{ cursor: 'pointer' }}>
                إعادة محاولة الرفع
              </button>
            )}
          </div>
        )}

        {/* Send button */}
        {hasPreviews && (
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => void uploadAll()} disabled={uploading}
            style={{ width: '100%', padding: '13px 0', borderRadius: 12, cursor: uploading ? 'not-allowed' : 'pointer', background: uploading ? 'rgba(0,188,212,0.2)' : 'linear-gradient(90deg, #00BCD4, #0052d4)', border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: uploading ? 0.7 : 1 }}>
            {uploading ? (
              <>
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                  style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
                جاري الرفع {uploadIdx + 1} / {previews.length}...
              </>
            ) : (
              <><Send size={16} /> نشر {previews.length > 1 ? `${previews.length} ستاتس` : 'الستاتس'}</>
            )}
          </motion.button>
        )}

        {/* ── Hidden file inputs (iOS-safe: position:fixed not display:none) ── */}
        {/* Gallery: images + videos, multiple */}
        <input ref={galleryRef} type="file" accept="image/*,video/*" multiple style={HIDDEN_INPUT} onChange={onInputChange} />
        {/* Video only */}
        <input ref={videoRef} type="file" accept="video/*" style={HIDDEN_INPUT} onChange={onInputChange} />
        {/* Camera capture */}
        <input ref={cameraRef} type="file" accept="image/*,video/*" capture="environment" style={HIDDEN_INPUT} onChange={onInputChange} />
      </motion.div>
    </motion.div>
  );
}
