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
import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Video, VideoOff } from 'lucide-react';

type DivRef = MutableRefObject<HTMLDivElement | null>;

const SELF_W = 160; // تكبير الشاشة الصغيرة
const SELF_H = 214;
const EDGE = 6;

/** المسافة الآمنة السفلية (شريط النظام / الجسچر) بالبكسل */
function safeBottomPx(): number {
  try {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-bottom:max(env(safe-area-inset-bottom,0px),var(--safe-area-inset-bottom,0px))';
    document.body.appendChild(d);
    const v = parseFloat(getComputedStyle(d).paddingBottom) || 0;
    d.remove();
    return v;
  } catch { return 0; }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), Math.max(min, max));
}

/** الشاشة الصغيرة للمتصل: تتحرك بالإصبع في كامل الشاشة */
function DraggableSelfView({ localRef, cameraOn, anchorRef, onSwitchCamera, onToggleCamera }: { localRef: DivRef; cameraOn: boolean; anchorRef: MutableRefObject<HTMLDivElement | null>; onSwitchCamera?: () => void; onToggleCamera?: () => void }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ dx: number; dy: number; id: number; sx: number; sy: number; moved: boolean } | null>(null);
  // نقرة = فتح/إغلاق الكاميرا ، نقرتين ورا بعض = تبديل الكاميرا (أمامية / خلفية)
  const tapTimer = useRef<number | null>(null);
  const lastToggle = useRef(0);
  const switchRef = useRef(onSwitchCamera);
  switchRef.current = onSwitchCamera;
  const toggleRef = useRef(onToggleCamera);
  toggleRef.current = onToggleCamera;
  const camOnRef = useRef(cameraOn);
  camOnRef.current = cameraOn;
  const fireToggle = () => {
    const now = Date.now();
    if (now - lastToggle.current < 900) return; // حماية من الضغط المتكرر أثناء فتح الكاميرا
    lastToggle.current = now;
    try { toggleRef.current?.(); } catch { /* */ }
  };

  useEffect(() => {
    // تبدأ في الزاوية العلوية (أعلى يمين الصفحة) ويمكن سحبها لأي مكان
    void anchorRef;
    const x = window.innerWidth - SELF_W - 14;
    const y = 64;
    setPos({
      x: clamp(x, EDGE, window.innerWidth - SELF_W - EDGE),
      y: clamp(y, EDGE, window.innerHeight - SELF_H - EDGE),
    });
    const onResize = () => setPos(p => (p ? {
      x: clamp(p.x, EDGE, window.innerWidth - SELF_W - EDGE),
      y: clamp(p.y, EDGE, window.innerHeight - SELF_H - EDGE),
    } : p));
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (tapTimer.current != null) { window.clearTimeout(tapTimer.current); tapTimer.current = null; }
    };
  }, []);

  if (!pos || typeof document === 'undefined') return null;

  return createPortal(
    <div
      onPointerDown={e => {
        drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false };
        try { (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId); } catch { /* */ }
      }}
      onPointerMove={e => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        if (Math.abs(e.clientX - d.sx) > 8 || Math.abs(e.clientY - d.sy) > 8) d.moved = true;
        setPos({
          x: clamp(e.clientX - d.dx, EDGE, window.innerWidth - SELF_W - EDGE),
          y: clamp(e.clientY - d.dy, EDGE, window.innerHeight - SELF_H - EDGE),
        });
      }}
      onPointerUp={e => {
        const d = drag.current;
        drag.current = null;
        if (d && !d.moved) {
          if (!camOnRef.current) {
            // الكاميرا مغلقة: نقرة وحدة تفتحها
            fireToggle();
          } else if (tapTimer.current != null) {
            // نقرتين ورا بعض: تبديل أمامية / خلفية
            window.clearTimeout(tapTimer.current);
            tapTimer.current = null;
            try { switchRef.current?.(); } catch { /* */ }
          } else {
            // نقرة وحدة: ننتظر شوي، إذا ما جت نقرة ثانية نقفل الكاميرا
            tapTimer.current = window.setTimeout(() => { tapTimer.current = null; fireToggle(); }, 300);
          }
        }
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
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Video size={26} strokeWidth={2.2} />
          </div>
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
  /** يُستدعى عند النقر مرتين على الشاشة الصغيرة: تبديل الكاميرا أمامية / خلفية */
  onSwitchCamera?: () => void;
  /** يُستدعى عند نقرة وحدة على الشاشة الصغيرة: فتح / إغلاق الكاميرا */
  onToggleCamera?: () => void;
  /** أزرار تظهر ثابتة أسفل الشاشة المربعة (Mute / Video Off / End) */
  controls?: ReactNode;
};

export function VideoCallStage({ remoteRef, localRef, cameraOn, peerName, peerAvatarUrl, onLeavePage, onSwitchCamera, onToggleCamera, controls }: VideoCallStageProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const aliveRef = useRef(true);
  const [showControls, setShowControls] = useState(true); // نقرة على الشاشة = إخفاء/إظهار الأزرار
  const [maxH, setMaxH] = useState<number | null>(null); // أقصى ارتفاع للشاشة المربعة كي لا تنزل تحت أزرار الجوال
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

  // يضبط ارتفاع الشاشة المربعة على كل الأجهزة (S22+ / S25 Ultra / ...) بحيث تبقى كاملة فوق أزرار النظام
  useEffect(() => {
    const measure = () => {
      const el = stageRef.current;
      if (!el) return;
      const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
      const r = el.getBoundingClientRect();
      let sc = window.scrollY || 0;
      for (let p: HTMLElement | null = el.parentElement; p; p = p.parentElement) sc += p.scrollTop || 0;
      // الجهاز اللي يرسم التطبيق تحت أزرار النظام (edge-to-edge) يكون ارتفاع الصفحة = ارتفاع الشاشة
      const edgeToEdge = Math.abs(window.innerHeight - window.screen.height) < 8;
      const reserve = Math.max(safeBottomPx(), 0) + 24 + (edgeToEdge ? 48 : 0);
      const avail = Math.floor(vh - (r.top + sc) - reserve);
      const width = el.getBoundingClientRect().width;
      const next = avail < width ? Math.max(avail, 240) : null;
      setMaxH(prev => (prev === next || (prev !== null && next !== null && Math.abs(prev - next) < 3) ? prev : next));
    };
    measure();
    const timers = [80, 250, 500, 900].map(ms => window.setTimeout(measure, ms));
    const iv = window.setInterval(measure, 1000);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      timers.forEach(t => window.clearTimeout(t));
      window.clearInterval(iv);
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, []);

  const label = (peerName || '?').trim();
  return (
    <>
      <div
        ref={stageRef}
        data-vstage="1"
        onClick={() => setShowControls(v => !v)}
        style={{
          gridColumn: '1 / -1', order: -1, width: '100%', aspectRatio: '1 / 1', maxHeight: maxH ?? undefined, borderRadius: 22,
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
        {controls && (
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', left: 0, right: 0, bottom: 16, zIndex: 3, display: 'flex',
              justifyContent: 'center', alignItems: 'center', gap: 22,
              opacity: showControls ? 1 : 0, pointerEvents: showControls ? 'auto' : 'none', transition: 'opacity 0.18s ease',
            }}
          >
            {controls}
          </div>
        )}
      </div>
      <DraggableSelfView localRef={localRef} cameraOn={cameraOn} anchorRef={stageRef} onSwitchCamera={onSwitchCamera} onToggleCamera={onToggleCamera} />
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
