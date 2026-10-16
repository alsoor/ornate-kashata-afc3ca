'use client';
/**
 * src/Video/VideoCallPatch.tsx — باتش خاص بالفيديو فقط.
 *
 * يعرض داخل صفحة البروفايل (تحت المستطيل الأخضر):
 *   1) شاشة مربعة ثابتة = شاشة الشخص المتصل عليه (الفيديو البعيد).
 *   2) شاشة صغيرة للمستخدم نفسه تتحرك بالإصبع في كامل الصفحة (يمين / يسار / أعلى / أسفل).
 *
 * الفيديو يعيش في هذه الصفحة فقط: عند الضغط على X ونزول الصفحة يتفكك المكوّن
 * ويُستدعى onLeavePage فتتحول الكاميرا إلى Off.
 *
 * الاستخدام في RootLayout:
 *   import { VideoCallStage } from '@/Video/VideoCallPatch';
 *   <VideoCallStage remoteRef={remoteVideoRef} localRef={localVideoRef} cameraOn={homeCallIsVideo} ... />
 *
 * زر الفيديو (كان غير مرئي) — ضعه مع بقية أزرار اللوحة (Speaker / Members / Mute / Add / Wave / End):
 *   import { VideoCallButton } from '@/Video/VideoCallPatch';
 *   <VideoCallButton cameraOn={homeCallIsVideo} onToggle={toggleCamera} />
 */
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import { Video, VideoOff } from 'lucide-react';

type DivRef = MutableRefObject<HTMLDivElement | null>;

const SELF_W = 104;
const SELF_H = 140;
const EDGE = 6;

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), Math.max(min, max));
}

/** الشاشة الصغيرة للمتصل: تتحرك بالإصبع في كامل الشاشة */
function DraggableSelfView({ localRef, cameraOn, anchorRef }: { localRef: DivRef; cameraOn: boolean; anchorRef: MutableRefObject<HTMLDivElement | null> }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ dx: number; dy: number; id: number } | null>(null);

  useEffect(() => {
    const r = anchorRef.current?.getBoundingClientRect();
    const x = r ? r.right - SELF_W - 10 : window.innerWidth - SELF_W - 14;
    const y = r ? r.top + 10 : 80;
    setPos({
      x: clamp(x, EDGE, window.innerWidth - SELF_W - EDGE),
      y: clamp(y, EDGE, window.innerHeight - SELF_H - EDGE),
    });
    const onResize = () => setPos(p => (p ? {
      x: clamp(p.x, EDGE, window.innerWidth - SELF_W - EDGE),
      y: clamp(p.y, EDGE, window.innerHeight - SELF_H - EDGE),
    } : p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!pos || typeof document === 'undefined') return null;

  return createPortal(
    <div
      onPointerDown={e => {
        drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, id: e.pointerId };
        try { (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId); } catch { /* */ }
      }}
      onPointerMove={e => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        setPos({
          x: clamp(e.clientX - d.dx, EDGE, window.innerWidth - SELF_W - EDGE),
          y: clamp(e.clientY - d.dy, EDGE, window.innerHeight - SELF_H - EDGE),
        });
      }}
      onPointerUp={e => {
        drag.current = null;
        try { (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId); } catch { /* */ }
      }}
      onPointerCancel={() => { drag.current = null; }}
      style={{
        position: 'fixed', left: pos.x, top: pos.y, width: SELF_W, height: SELF_H, zIndex: 99999,
        borderRadius: 16, overflow: 'hidden', background: '#10181b', touchAction: 'none', userSelect: 'none',
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)', border: '2px solid rgba(255,255,255,0.9)', cursor: 'grab',
      }}
    >
      <div ref={localRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      {!cameraOn && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 6, background: '#10181b', color: '#fff', pointerEvents: 'none',
        }}>
          <VideoOff size={22} strokeWidth={2.2} />
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5 }}>Off</span>
        </div>
      )}
    </div>,
    document.body,
  );
}

export type VideoCallStageProps = {
  /** عنصر الفيديو البعيد (يلعب فيه Agora فيديو الشخص المتصل عليه) */
  remoteRef: DivRef;
  /** عنصر الكاميرا المحلية (الشاشة الصغيرة المتحركة) */
  localRef: DivRef;
  /** هل كاميرتي شغالة */
  cameraOn: boolean;
  /** صورة واسم الطرف الآخر (تظهر قبل وصول الفيديو) */
  peerName?: string | null;
  peerAvatarUrl?: string | null;
  /** يُستدعى عند إغلاق الصفحة (X): أطفئ الكاميرا */
  onLeavePage: () => void;
};

export function VideoCallStage({ remoteRef, localRef, cameraOn, peerName, peerAvatarUrl, onLeavePage }: VideoCallStageProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const aliveRef = useRef(true);
  const leaveRef = useRef(onLeavePage);
  leaveRef.current = onLeavePage;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      // تأجيل بسيط حتى لا تُطفأ الكاميرا بالخطأ عند إعادة التركيب السريعة
      window.setTimeout(() => { if (!aliveRef.current) leaveRef.current(); }, 0);
    };
  }, []);

  const label = (peerName || '?').trim();
  return (
    <>
      <div
        ref={stageRef}
        style={{
          gridColumn: '1 / -1', order: -1, width: '100%', aspectRatio: '1 / 1', borderRadius: 22,
          overflow: 'hidden', background: '#0b1417', position: 'relative', boxSizing: 'border-box',
        }}
      >
        {/* خلفية قبل وصول الفيديو */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {peerAvatarUrl
            ? <img src={peerAvatarUrl} alt="" style={{ width: 84, height: 84, borderRadius: '50%', objectFit: 'cover', opacity: 0.9 }} />
            : <span style={{ width: 84, height: 84, borderRadius: '50%', background: '#0e7490', color: '#fff', fontWeight: 800, fontSize: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{label[0]}</span>}
        </div>
        {/* شاشة الشخص المتصل عليه — ثابتة */}
        <div ref={remoteRef} style={{ position: 'absolute', inset: 0 }} />
      </div>
      <DraggableSelfView localRef={localRef} cameraOn={cameraOn} anchorRef={stageRef} />
    </>
  );
}

/** زر Video — ظاهر دائماً، بنفس شكل أزرار اللوحة (دائرة داكنة + اسم تحتها) */
export function VideoCallButton({ cameraOn, onToggle, disabled, showLabel = true }: { cameraOn: boolean; onToggle: () => void; disabled?: boolean; showLabel?: boolean }) {
  const label = cameraOn ? 'Video' : 'Video off';
  const Icon = cameraOn ? Video : VideoOff;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, visibility: 'visible', opacity: 1 }}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onToggle}
        style={{
          width: 88, height: 88, borderRadius: '50%', border: 0, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: cameraOn ? '#23282b' : '#3a4348', color: '#fff',
          visibility: 'visible', opacity: disabled ? 0.5 : 1,
        }}
      >
        <Icon size={34} strokeWidth={2.2} color="#fff" />
      </button>
      {showLabel && <span style={{ fontSize: 17, fontWeight: 600, color: '#111' }}>{label}</span>}
    </div>
  );
}

/** CSS خاص بزر Video (يضاف داخل <style> الخاص بلوحة المكالمة) — يضمن أن الزر يظهر دائماً */
export const VIDEO_CALL_BUTTON_CSS = `.stooorna-call-light [data-scl="inner"] button[aria-label="Video off"] { background: #3a4348 !important; }
.stooorna-call-light [data-scl="inner"] button[aria-label^="Video"] { display: flex !important; visibility: visible !important; opacity: 1 !important; color: #fff !important; }
.stooorna-call-light [data-scl="inner"] button[aria-label^="Video"] svg { display: block !important; stroke: currentColor !important; }`;
