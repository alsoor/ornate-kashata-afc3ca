'use client';
/**
 * src/Video/VideoCallPatch.tsx — باتش خاص بالفيديو فقط.
 *
 * يعرض داخل صفحة البروفايل (تحت المستطيل الأخضر):
 *   1) شاشة مربعة ثابتة = شاشة الشخص المتصل عليه (الفيديو البعيد).
 *   2) شاشة صغيرة للمستخدم نفسه تتحرك بالإصبع في كامل الصفحة (يمين / يسار / أعلى / أسفل).
 *
 * [تحديث التخطيط]
 *  - الشاشة السفلية (الشخص الثاني) تمتد يمين ويسار وتغطي الخلفية البيضاء.
 *  - الشاشة العلوية (كاميرتي) بنفس عرض وطول السفلية تماماً، وتنسحب عمودياً.
 *  - إذا دخل شخص ثالث بصوت فقط: ما يتغير شيء. إذا شغّل الفيديو (thirdVideoOn) تنقسم العلوية نصفين بدون فاصل/إطار.
 *  - السفلية لا تنقسم أبداً.
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
const MX = 14; // هامش أبيض بسيط يمين ويسار الشاشتين
const TOP_Y = 100; // مكان الشاشة العلوية من أعلى الصفحة (كبّر الرقم = تنزل أكثر)

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

/** الشاشة العلوية: بنفس حجم السفلية، تنسحب عمودياً، وتنقسم نصفين عند فيديو الشخص الثالث */
function DraggableSelfView({ localRef, cameraOn, anchorRef, onSwitchCamera, onToggleCamera, size, thirdRef, thirdVideoOn }: { localRef: DivRef; cameraOn: boolean; anchorRef: MutableRefObject<HTMLDivElement | null>; onSwitchCamera?: () => void; onToggleCamera?: () => void; size: { w: number; h: number }; thirdRef?: DivRef; thirdVideoOn?: boolean }) {
  const [posY, setPosY] = useState<number | null>(null);
  const drag = useRef<{ dy: number; id: number; sx: number; sy: number; moved: boolean; px: number } | null>(null);
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
  const W = size.w;
  const H = size.h;
  const maxY = () => Math.max(EDGE, window.innerHeight - H - EDGE);

  useEffect(() => {
    // تبدأ فوق منطقة البروفايل (تحت زر X) ويمكن سحبها عمودياً
    void anchorRef;
    setPosY(clamp(TOP_Y, EDGE, window.innerHeight - H - EDGE));
    const onResize = () => setPosY(p => (p == null ? p : clamp(p, EDGE, window.innerHeight - H - EDGE)));
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (tapTimer.current != null) { window.clearTimeout(tapTimer.current); tapTimer.current = null; }
    };
  }, []);

  if (posY == null || typeof document === 'undefined') return null;
  const split = !!thirdVideoOn;

  return createPortal(
    <div
      onPointerDown={e => {
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        drag.current = { dy: e.clientY - posY, id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false, px: e.clientX - rect.left };
        try { (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId); } catch { /* */ }
      }}
      onPointerMove={e => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        if (Math.abs(e.clientX - d.sx) > 8 || Math.abs(e.clientY - d.sy) > 8) d.moved = true;
        setPosY(clamp(e.clientY - d.dy, EDGE, maxY()));
      }}
      onPointerUp={e => {
        const d = drag.current;
        drag.current = null;
        // النقر على نصف الشخص الثالث (يمين) لا يغيّر كاميرتي
        const onThirdHalf = split && !!d && d.px > W / 2;
        if (d && !d.moved && !onThirdHalf) {
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
        position: 'fixed', left: MX, top: posY, width: W, height: H, zIndex: 99999,
        borderRadius: 18, overflow: 'hidden', background: '#10181b', touchAction: 'none', userSelect: 'none',
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)', border: 0, cursor: 'grab',
      }}
    >
      {/* كاميرتي: كامل العرض، أو النصف الأيسر عند انقسام الشاشة (بدون فاصل) */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: split ? '50%' : '100%', overflow: 'hidden' }}>
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
      </div>
      {/* الشخص الثالث: النصف الأيمن، يظهر فقط إذا شغّل الفيديو */}
      {thirdRef && (
        <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: '50%', overflow: 'hidden', display: split ? 'block' : 'none', background: '#0b1417' }}>
          <div ref={thirdRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
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
  /** عنصر فيديو الشخص الثالث (يلعب فيه Agora) — يظهر في نصف الشاشة العلوية */
  thirdRef?: DivRef;
  /** true فقط عندما الشخص الثالث يشغّل الفيديو (دخوله صوتي لا يقسم الشاشة) */
  thirdVideoOn?: boolean;
  /** أزرار تظهر ثابتة أسفل الشاشة المربعة (Mute / Video Off / End) */
  controls?: ReactNode;
};

export function VideoCallStage({ remoteRef, localRef, cameraOn, peerName, peerAvatarUrl, onLeavePage, onSwitchCamera, onToggleCamera, controls, thirdRef, thirdVideoOn }: VideoCallStageProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const aliveRef = useRef(true);
  const [showControls, setShowControls] = useState(true); // نقرة على الشاشة = إخفاء/إظهار الأزرار
  const [maxH, setMaxH] = useState<number | null>(null); // أقصى ارتفاع للشاشة المربعة كي لا تنزل تحت أزرار الجوال
  const [vw, setVw] = useState<number>(() => (typeof window !== 'undefined' ? window.innerWidth : 360)); // عرض الشاشة كاملاً
  const [shift, setShift] = useState(0); // إزاحة لتغطية الخلفية البيضاء يمين ويسار
  const [stageH, setStageH] = useState(0); // ارتفاع الشاشة السفلية الفعلي (تستخدمه العلوية)
  const shiftRef = useRef(0);
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
      // تمديد الشاشة السفلية لكامل عرض الجهاز (تغطي الخلفية البيضاء)
      // نقرأ الإزاحة المطبّقة فعلياً من العنصر نفسه (بدل ما نراكمها) حتى ما تنجرف الشاشة لليسار
      const applied = parseFloat((el.style.transform.match(/translateX\((-?[\d.]+)px\)/) || [])[1] || '0') || 0;
      const baseLeft = el.getBoundingClientRect().left - applied;
      shiftRef.current = baseLeft;
      setShift(prev => (Math.abs(prev - baseLeft) < 0.5 ? prev : baseLeft));
      setVw(window.innerWidth);
      const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
      const r = el.getBoundingClientRect();
      let sc = window.scrollY || 0;
      for (let p: HTMLElement | null = el.parentElement; p; p = p.parentElement) sc += p.scrollTop || 0;
      // الجهاز اللي يرسم التطبيق تحت أزرار النظام (edge-to-edge) يكون ارتفاع الصفحة = ارتفاع الشاشة
      const edgeToEdge = Math.abs(window.innerHeight - window.screen.height) < 8;
      const reserve = Math.max(safeBottomPx(), 0) + 24 + (edgeToEdge ? 48 : 0);
      const avail = Math.floor(vh - (r.top + sc) - reserve);
      const width = window.innerWidth - MX * 2;
      const next = avail < width ? Math.max(avail, 240) : null;
      setStageH(Math.round(el.getBoundingClientRect().height));
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
          gridColumn: '1 / -1', order: -1, width: vw - MX * 2, height: maxH ?? (vw - MX * 2), transform: `translateX(${MX - shift}px)`, borderRadius: 18,
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
            data-vctl="1"
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', left: 0, right: 0, bottom: 16, zIndex: 3, display: 'flex',
              justifyContent: 'center', alignItems: 'center', gap: 22,
              opacity: showControls ? 1 : 0, pointerEvents: showControls ? 'auto' : 'none', transition: 'opacity 0.18s ease',
            }}
          >
            {/* تصغير أزرار الفيديو الثلاثة (Mute / Video / End) داخل الشاشة فقط */}
            <style>{VIDEO_STAGE_CONTROLS_CSS}</style>
            {controls}
          </div>
        )}
      </div>
      <DraggableSelfView localRef={localRef} cameraOn={cameraOn} anchorRef={stageRef} onSwitchCamera={onSwitchCamera} onToggleCamera={onToggleCamera} size={{ w: vw - MX * 2, h: maxH ?? (vw - MX * 2) }} thirdRef={thirdRef} thirdVideoOn={thirdVideoOn} />
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

/** حجم أزرار الشاشة السفلية (Mute / Video / End) — غيّر 52 و 22 إذا تبي أصغر أو أكبر */
export const VIDEO_STAGE_CONTROLS_CSS = `[data-vctl="1"] button { width: 52px !important; height: 52px !important; min-width: 0 !important; min-height: 0 !important; padding: 0 !important; }
[data-vctl="1"] button svg { width: 22px !important; height: 22px !important; }`;
