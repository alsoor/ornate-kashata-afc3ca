/**
 * StatusViewer — fullscreen story viewer (WhatsApp / Snapchat style)
 * - Progress bars at top (one per item)
 * - Tap left half → previous, tap right half → next
 * - Auto-advance after duration
 * - Marks each item as viewed via POST /api/status/:id/view
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Trash2, Eye } from 'lucide-react';

export interface StatusItem {
  id: number;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  duration: number;
  seen: boolean;
}

export interface StatusGroup {
  userId: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  bio?: string | null;
  items: StatusItem[];
}

interface Props {
  groups: StatusGroup[];
  startGroupIndex: number;
  myId: string;
  onClose: () => void;
  onDeleted?: (statusId: number) => void;
  onSeen?: (userId: string, statusId: number) => void;
}

export default function StatusViewer({ groups, startGroupIndex, myId, onClose, onDeleted, onSeen }: Props) {
  const [groupIdx, setGroupIdx] = useState(startGroupIndex);
  const [itemIdx,  setItemIdx]  = useState(0);
  const [progress, setProgress] = useState(0);   // 0–100

  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef    = useRef<HTMLVideoElement>(null);
  const startedRef  = useRef<Set<number>>(new Set());

  const group   = groups[groupIdx];
  const item    = group?.items[itemIdx];
  const isOwner = group?.userId === myId;

  // Mark viewed
  useEffect(() => {
    if (!item || startedRef.current.has(item.id)) return;
    startedRef.current.add(item.id);
    fetch(`/api/status/${item.id}/view`, { method: 'POST', credentials: 'include' }).catch(() => {});
    // Notify parent so it can update seen state → stops the glow animation
    if (onSeen && group) onSeen(group.userId, item.id);
  }, [item]); // eslint-disable-line react-hooks/exhaustive-deps

  // Progress timer
  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setProgress(0);
    const duration = item?.duration ?? 5;
    const step     = 100 / (duration * 20); // 50ms ticks
    timerRef.current = setInterval(() => {
      setProgress(p => {
        if (p + step >= 100) {
          clearInterval(timerRef.current!);
          return 100;
        }
        return p + step;
      });
    }, 50);
  }, [item]);

  useEffect(() => {
    if (!item) return;
    // For video, wait for canplay
    if (item.mediaType === 'video') {
      setProgress(0);
      return; // timer started by onCanPlay
    }
    startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [item, startTimer]);

  // Auto-advance when progress hits 100
  useEffect(() => {
    if (progress < 100) return;
    goNext();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  function goNext() {
    if (!group) return;
    if (itemIdx < group.items.length - 1) {
      setItemIdx(i => i + 1);
    } else if (groupIdx < groups.length - 1) {
      setGroupIdx(g => g + 1);
      setItemIdx(0);
    } else {
      onClose();
    }
  }

  function goPrev() {
    if (itemIdx > 0) {
      setItemIdx(i => i - 1);
    } else if (groupIdx > 0) {
      setGroupIdx(g => g - 1);
      setItemIdx(0);
    }
  }

  async function handleDelete() {
    if (!item) return;
    await fetch(`/api/status/${item.id}`, { method: 'DELETE', credentials: 'include' });
    onDeleted?.(item.id);
    goNext();
  }

  if (!group || !item) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#000',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* ── Progress bars ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        display: 'flex', gap: 3, padding: '10px 10px 0',
      }}>
        {group.items.map((it, i) => (
          <div key={it.id} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: 'rgba(255,255,255,0.25)',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              background: '#fff',
              width: i < itemIdx ? '100%' : i === itemIdx ? `${progress}%` : '0%',
              transition: i === itemIdx ? 'none' : undefined,
              borderRadius: 2,
            }} />
          </div>
        ))}
      </div>

      {/* ── Header ── */}
      <div style={{
        position: 'absolute', top: 20, left: 0, right: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
      }}>
        {group.avatarUrl ? (
          <img src={group.avatarUrl} alt={group.name}
            style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.6)' }} />
        ) : (
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'rgba(0,188,212,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, fontWeight: 700, color: '#00bcd4',
            border: '2px solid rgba(255,255,255,0.4)',
          }}>
            {group.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div style={{ flex: 1 }}>
          <p style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>
            <span>{group.name}</span>
            {group.bio ? <><span className="text-muted-foreground" style={{ margin: '0 6px' }}>|</span><span className="text-foreground" style={{ fontWeight: 500 }}>{group.bio}</span></> : null}
          </p>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.68rem', margin: 0 }}>
            {item.mediaType === 'video' ? `فيديو · ${item.duration}s` : `صورة · ${item.duration}s`}
          </p>
        </div>

        {/* Views count (owner only) */}
        {isOwner && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}>
            <Eye size={14} />
          </div>
        )}

        {/* Delete (owner only) */}
        {isOwner && (
          <motion.button whileTap={{ scale: 0.85 }} onClick={handleDelete}
            style={{ background: 'rgba(255,60,60,0.25)', border: '1px solid rgba(255,60,60,0.4)', borderRadius: 8, padding: '5px 8px', color: '#ff6b6b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem' }}>
            <Trash2 size={13} />
          </motion.button>
        )}

        <motion.button whileTap={{ scale: 0.85 }} onClick={onClose}
          style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
          <X size={16} />
        </motion.button>
      </div>

      {/* ── Media ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${groupIdx}-${itemIdx}`}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.18 }}
          style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {item.mediaType === 'video' ? (
            <video
              ref={videoRef}
              src={item.mediaUrl}
              autoPlay
              playsInline
              muted={false}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              onCanPlay={() => { startTimer(); videoRef.current?.play(); }}
              onTimeUpdate={() => {
                const v = videoRef.current;
                if (!v || !v.duration) return;
                setProgress((v.currentTime / v.duration) * 100);
              }}
            />
          ) : (
            <img
              src={item.mediaUrl}
              alt="status"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── Tap zones (left = prev, right = next) — tap only, no hold/pause ── */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 5, display: 'flex' }}>
        {/* Left half → previous */}
        <div
          style={{ flex: 1, cursor: 'pointer' }}
          onClick={goPrev}
        />
        {/* Right half → next */}
        <div
          style={{ flex: 1, cursor: 'pointer' }}
          onClick={goNext}
        />
      </div>
    </motion.div>
  );
}
