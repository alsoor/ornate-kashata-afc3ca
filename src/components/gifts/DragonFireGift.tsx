/**
 * هدية التنين الناري (DragonFire) — 10,000 Coins — الهدية التاسعة
 *
 * - Preview  : داخل مربع الهدايا (قبل النقر) تنين صغير متحرك ينفث نار: الجناح يرفرف، الفك يتحرك، العين تتوهج،
 *              ألسنة النار تتراقص، جمرات تتصاعد، ودخان خفيف — كله حركة مستمرة على المربع.
 * - Animation: (الأرقام بالثواني، ساعة الهدية)
 *     0.0 – 2.0  : البث يغرق بالظلام + سماء حمراء متوهجة، غيوم نار، برق أحمر، رياح وجمرات تصعد من الأسفل
 *     2.0        : يدخل مشهد التنين (ملف الفيديو) ممزوج بالمؤثرات بحيث لا يظهر أنه فيديو أبداً:
 *                  الفيديو يُدمج بوضع screen فوق السماء الحمراء (السواد يصير شفاف) وبدون أي واجهة/حواف.
 *                  صوت الفيديو يشتغل تلقائياً بكامل مستواه (الصرخة الأصلية كما هي).
 *     مع الفيديو : كل صرخة (≈2.7 / 6.6 / 11.6 ث من الفيديو) تضرب موجة صدمة + هزة + برق،
 *                  ولما ينفث التنين النار (≈14.5 ث) وميض + هزة قوية + عاصفة جمر على كل الشاشة
 *                  (الجمرات تنزل على أزرار البث وتسخّنها وتطلع منها ألسنة نار)
 *     بعد الفيديو: - لو الهدية لصاحب البث (من مستخدم): هالة نار على صورته أثناء النفث، ثم الإضاءة ترجع طبيعية.
 *                  - لو الهدية من صاحب البث لمستخدم: نفس المشهد، وعند نهاية الفيديو إطار صورة المستخدم
 *                    يرتفع لمنتصف الشاشة محاط بحلقة نار وجمرات تدور، يبقى قليلاً ثم ينزل وترجع الإضاءة.
 *
 * ملف مستقل: الأصوات في src/lib/dragonFireSounds.ts — الفيديو: public/gifts/dragon-roar.mp4
 * غيّر الأرقام تحت (السعر / التوقيتات).
 *
 * ربط الأنميشن بالواجهة (يعمل تلقائياً بدونها — نفس مفاتيح هدية البركان):
 *   data-gift-host : على صورة صاحب البث → هالة النار تنزل عليه.
 *   data-gift-user / window.__stooornaGiftLift : (يضعها LiveCoinsDock) لما الهدية لمتحدث: إطاره يرتفع لمنتصف الشاشة.
 *   الجمرات تنزل تلقائياً على: button, [role=button], a[href], input, textarea, select
 */
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { GiftDefinition } from '../../lib/types';
import { playDragonFireSound } from '../../lib/dragonFireSounds';

// ── إعدادات الهدية ──────────────────────────────────────────────────────
const PRICE = 10000;
const VIDEO_SRC = '/gifts/dragon-roar.mp4';   // ضع الفيديو في public/gifts/
const VIDEO_DUR = 18.87;                      // مدة الفيديو (يتحدّث تلقائياً من الملف)
const VIDEO_AT = 2.0;                         // ثانية دخول الفيديو
const VIDEO_FADE_IN = 0.9;
const VIDEO_FADE_OUT = 0.8;

const DARK_IN = 1.6;                          // مدة الغرق بالظلام
const DARK_MAX = 0.94;                        // قوة الظلام (1 = أسود كامل)
const THUNDER = [0.9, 1.6, 6.0, 12.6];        // برق أحمر (ساعة الهدية)

// صرخات التنين (بزمن الفيديو): s = قوة الهزة والموجة
const ROARS = [
  { vt: 2.7, s: 0.55 },
  { vt: 6.6, s: 0.8 },
  { vt: 11.6, s: 0.85 },
  { vt: 14.5, s: 1.5 },   // نفث النار
];
const BREATH_VT = 14.5;
const BREATH_END_VT = 17.2;

// بعد الفيديو: صعود إطار المستخدم لمنتصف الشاشة (فقط لو الهدية من صاحب البث لمستخدم)
const LIFT_LEAD = 0.3;      // يبدأ الصعود قبل نهاية الفيديو بهالمقدار
const LIFT_RISE_S = 1.6;
const LIFT_HOLD_S = 3.6;
const LIFT_DOWN_S = 1.0;
const TAIL_HOST_S = 1.6;    // ذيل نهاية الهدية لصاحب البث
const TAIL_LIFT_S = 0.7;

const END_VIDEO_S = VIDEO_AT + VIDEO_DUR;
const TOTAL_HOST_S = END_VIDEO_S + TAIL_HOST_S;
const TOTAL_LIFT_S = END_VIDEO_S - LIFT_LEAD + LIFT_RISE_S + LIFT_HOLD_S + LIFT_DOWN_S + TAIL_LIFT_S;
const TOTAL_MS = Math.ceil(TOTAL_LIFT_S * 1000);   // أطول حالة (لو الهدية لمستخدم)

const MAX_FX = 1200;        // حد أقصى للجسيمات (للأداء على الجوال)
const HOT_SEL = 'button, [role="button"], a[href], input, textarea, select, [data-gift-host], [data-gift-walk], [data-gift-hot]';
const FIRE_RGB = ['255,250,225', '255,232,140', '255,186,60', '255,120,22', '228,60,10', '150,26,6', '70,12,6'];

// ── أدوات رياضية ────────────────────────────────────────────────────────
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function makeSprite(rgb: string, soft = 0.3): HTMLCanvasElement {
  const s = document.createElement('canvas');
  s.width = 64;
  s.height = 64;
  const g = s.getContext('2d');
  if (g) {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${rgb},1)`);
    gr.addColorStop(soft, `rgba(${rgb},0.5)`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  }
  return s;
}

// تحميل الفيديو مسبقاً من لحظة ظهور مربع الهدية (عشان يشتغل فوراً عند الإرسال)
let preloadedVideo: HTMLVideoElement | null = null;
function preloadDragonVideo() {
  if (typeof document === 'undefined' || preloadedVideo) return;
  try {
    const v = document.createElement('video');
    v.preload = 'auto';
    v.muted = true;
    v.playsInline = true;
    v.src = VIDEO_SRC;
    v.load();
    preloadedVideo = v;
  } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════════════════
//  Preview — تنين صغير ينفث نار داخل مربع الهدايا
// ═══════════════════════════════════════════════════════════════════════
const DF_CSS = `
@keyframes df-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.6px)}}
@keyframes df-wing{0%,100%{transform:rotate(5deg)}50%{transform:rotate(-9deg)}}
@keyframes df-jaw{0%,100%{transform:rotate(0)}50%{transform:rotate(9deg)}}
@keyframes df-flick{0%,100%{transform:scale(1,1);opacity:.95}30%{transform:scale(1.18,.9);opacity:1}60%{transform:scale(.88,1.1);opacity:.85}}
@keyframes df-glow{0%,100%{opacity:.45}50%{opacity:.95}}
@keyframes df-eye{0%,100%{opacity:.75}50%{opacity:1}}
@keyframes df-ember{0%{transform:translate(0,0) scale(1);opacity:0}15%{opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(.2);opacity:0}}
@keyframes df-smoke{0%{transform:translate(0,0) scale(.5);opacity:0}30%{opacity:.4}100%{transform:translate(var(--dx),-14px) scale(1.6);opacity:0}}
@keyframes df-halo{0%,100%{filter:drop-shadow(0 0 5px rgba(255,70,20,.55))}50%{filter:drop-shadow(0 0 12px rgba(255,130,30,.95))}}
.df-bob{animation:df-bob 2.2s ease-in-out infinite}
.df-wing{animation:df-wing 1.1s ease-in-out infinite;transform-box:fill-box;transform-origin:85% 100%}
.df-jaw{animation:df-jaw 1.1s ease-in-out infinite;transform-box:fill-box;transform-origin:15% 30%}
.df-flick{animation:df-flick .5s ease-in-out infinite;transform-box:fill-box;transform-origin:0% 50%}
.df-glow{animation:df-glow 1.3s ease-in-out infinite}
.df-eye{animation:df-eye .9s ease-in-out infinite}
.df-ember{animation:df-ember 1.9s ease-out infinite}
.df-smoke{animation:df-smoke 3s ease-out infinite;transform-box:fill-box;transform-origin:50% 50%}
.df-halo{animation:df-halo 1.3s ease-in-out infinite}
`;

const EMBERS: { x: number; y: number; dx: number; dy: number; d: number; r: number }[] = [
  { x: 92, y: 50, dx: 6, dy: -30, d: 0, r: 1.3 },
  { x: 96, y: 46, dx: -4, dy: -38, d: 0.3, r: 1.1 },
  { x: 90, y: 54, dx: 10, dy: -26, d: 0.6, r: 1.5 },
  { x: 98, y: 52, dx: 2, dy: -42, d: 0.9, r: 1.0 },
  { x: 60, y: 96, dx: -10, dy: -44, d: 0.4, r: 1.2 },
  { x: 30, y: 98, dx: 8, dy: -40, d: 1.1, r: 1.4 },
  { x: 74, y: 92, dx: 12, dy: -36, d: 1.5, r: 1.1 },
  { x: 48, y: 100, dx: -6, dy: -48, d: 0.7, r: 1.2 },
];

function DragonFirePreview({ size = 72 }: { size?: number }) {
  const uid = React.useId().replace(/:/g, '');
  useEffect(() => { preloadDragonVideo(); }, []);
  const h = Math.round(size * 1.3);
  const w = Math.round((h * 110) / 112);
  const ref = (n: string) => `url(#${n}${uid})`;
  return (
    <motion.div
      aria-hidden="true"
      animate={{ y: [0, -2, 0] }}
      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      style={{ position: 'relative', width: w, height: h, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <style>{DF_CSS}</style>
      <svg width={w} height={h} viewBox="0 0 110 112" className="df-halo" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <radialGradient id={`glow${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff7a1a" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#c01000" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`body${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d23a1a" />
            <stop offset="50%" stopColor="#8e1608" />
            <stop offset="100%" stopColor="#3a0804" />
          </linearGradient>
          <linearGradient id={`wing${uid}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#5a0c06" />
            <stop offset="100%" stopColor="#e0541a" />
          </linearGradient>
          <linearGradient id={`fire${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fff3b0" />
            <stop offset="40%" stopColor="#ffb02e" />
            <stop offset="80%" stopColor="#ff4a10" />
            <stop offset="100%" stopColor="#c21500" stopOpacity="0.2" />
          </linearGradient>
        </defs>

        <circle cx="52" cy="52" r="48" fill={ref('glow')} className="df-glow" />

        {/* دخان */}
        {[{ dx: -8, d: 0, x: 54 }, { dx: 6, d: 1.0, x: 60 }, { dx: 12, d: 2.0, x: 66 }].map((s, i) => (
          <circle
            key={i} cx={s.x} cy="34" r="6" fill="#6a5a58" className="df-smoke"
            style={{ animationDelay: `${s.d}s`, ['--dx' as string]: `${s.dx}px` } as React.CSSProperties}
          />
        ))}

        <g className="df-bob">
          {/* الجناح */}
          <g className="df-wing">
            <path d="M40 76 L6 34 L20 40 L16 20 L32 34 L34 12 L46 36 L50 70 Z" fill={ref('wing')} stroke="#2a0502" strokeWidth="1" strokeLinejoin="round" />
            <path d="M40 76 L16 20 M40 76 L34 12 M40 76 L6 34" stroke="#2a0502" strokeWidth="0.9" fill="none" />
          </g>

          {/* العنق والجسم */}
          <path d="M14 112 C14 92 26 80 38 70 C46 62 44 54 50 46 L66 50 C64 60 62 66 58 74 C70 84 74 98 72 112 Z" fill={ref('body')} stroke="#2a0502" strokeWidth="1" strokeLinejoin="round" />
          <path d="M30 96 L36 90 M34 106 L42 100 M46 88 L52 82 M54 100 L60 94" stroke="#ffb02e" strokeWidth="1.4" strokeLinecap="round" className="df-glow" />
          <path d="M38 68 L33 62 L42 64 L38 56 L47 60 L45 50 L52 56" fill="#4a0a05" stroke="#2a0502" strokeWidth="0.8" strokeLinejoin="round" />

          {/* الرأس */}
          <path d="M46 50 C46 40 54 34 64 35 L82 40 C88 42 90 46 86 49 L72 50 L72 54 C64 58 52 58 46 50 Z" fill={ref('body')} stroke="#2a0502" strokeWidth="1" strokeLinejoin="round" />
          <path d="M52 37 C46 30 40 28 34 20 C44 24 54 28 60 35 Z" fill="#f0c070" stroke="#2a0502" strokeWidth="0.8" />
          <path d="M60 35 C58 28 54 22 52 14 C60 20 66 26 68 36 Z" fill="#f0c070" stroke="#2a0502" strokeWidth="0.8" />
          <g className="df-jaw">
            <path d="M58 54 C64 62 76 62 84 53 L72 52 Z" fill="#7a1206" stroke="#2a0502" strokeWidth="0.8" />
          </g>
          <g className="df-eye">
            <ellipse cx="64" cy="42" rx="3" ry="1.8" fill="#ffd24a" />
            <ellipse cx="64.5" cy="42" rx="1" ry="1.5" fill="#1a0000" />
          </g>
          <path d="M82 44 l-4 1 M84 48 l-5 .5" stroke="#1a0000" strokeWidth="1" strokeLinecap="round" />

          {/* النار */}
          <g className="df-flick">
            <path d="M84 50 C92 42 100 44 106 36 C104 46 108 52 100 56 C108 60 100 66 90 58 Z" fill={ref('fire')} />
            <path d="M84 51 C92 48 98 50 102 46 C100 52 98 54 90 55 Z" fill="#fff6c8" opacity="0.9" />
          </g>
        </g>

        {/* جمرات */}
        {EMBERS.map((s, i) => (
          <circle
            key={i} cx={s.x} cy={s.y} r={s.r} fill="#ffc060" className="df-ember"
            style={{ animationDelay: `${s.d}s`, ['--dx' as string]: `${s.dx}px`, ['--dy' as string]: `${s.dy}px` } as React.CSSProperties}
          />
        ))}
      </svg>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  Animation — أنميشن ملء الشاشة (Canvas + الفيديو الممزوج)
// ═══════════════════════════════════════════════════════════════════════
interface Pt {
  k: 0 | 2;                    // 0 نار، 2 جمرة
  x: number; y: number; px: number; py: number; vx: number; vy: number;
  size: number; grow: number; life: number; age: number;
  grav: number; drag: number; wind: number; seed: number; stuck: number;
}
interface Streak { x: number; y: number; len: number; vx: number; a: number; w: number; ph: number; }
interface Hot { el: Element; x: number; y: number; w: number; h: number; rad: number; heat: number; }
interface Lift { sx: number; sy: number; sr: number; ex: number; ey: number; R: number; img: HTMLImageElement | null; letter: string; name: string; restore: () => void; done?: boolean; }
interface LiftInfo { userId: string; name?: string; avatarUrl?: string | null; }
interface Host { x: number; y: number; w: number; h: number; top: number; lift?: Lift; }
interface Ring { x: number; y: number; born: number; dur: number; maxR: number; w: number; }

function findHost(W: number): Host {
  try {
    const el = document.querySelector<HTMLElement>('[data-gift-host]');
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, top: r.top };
    }
  } catch { /* ignore */ }
  return { x: W * 0.5, y: 56, w: 48, h: 48, top: 32 };
}

// وضع الرفع: الهدية من صاحب البث لمتحدث/مستخدم → إطاره يرتفع لمنتصف الشاشة بعد الفيديو
// معلومات المستلم يحطها LiveCoinsDock في window.__stooornaGiftLift
function getLiftInfo(): LiftInfo | null {
  try {
    const d = (window as unknown as { __stooornaGiftLift?: LiftInfo }).__stooornaGiftLift;
    return d && d.userId ? d : null;
  } catch { return null; }
}
function findLift(W: number, H: number, pre: HTMLImageElement | null): Host | null {
  try {
    const info = getLiftInfo();
    if (!info) return null;
    const R = Math.max(44, Math.min(70, W * 0.17));
    const ex = W * 0.5;
    const ey = H * 0.46;                         // منتصف الشاشة
    let el: HTMLElement | null = null;
    try { el = document.querySelector<HTMLElement>(`[data-gift-user="${String(info.userId).replace(/["\\]/g, '')}"]`); } catch { /* ignore */ }
    const r = el ? el.getBoundingClientRect() : null;
    const hasEl = !!(el && r && r.width > 0 && r.height > 0);
    const sx = hasEl ? r!.left + r!.width / 2 : W - 52;
    const sy = hasEl ? r!.top + r!.height / 2 : H * 0.55;
    const sr = hasEl ? r!.width / 2 : 20;
    const elImg = el ? el.querySelector('img') : null;
    const useImg = pre && pre.complete && pre.naturalWidth > 0 ? pre : (elImg && elImg.complete && elImg.naturalWidth > 0 ? elImg : pre);
    const nm = String(info.name || (el?.textContent || '') || '?').trim();
    const prevOp = hasEl ? el!.style.opacity : '';
    if (hasEl) el!.style.opacity = '0.12';
    return {
      x: ex, y: ey, w: R * 2, h: R * 2, top: ey - R,
      lift: {
        sx, sy, sr, ex, ey, R,
        img: useImg || null,
        letter: (nm.charAt(0) || '?').toUpperCase(),
        name: nm,
        restore: () => { try { if (hasEl) el!.style.opacity = prevOp; } catch { /* ignore */ } },
      },
    };
  } catch { return null; }
}

function DragonFireAnimation({ onDone }: { onDone: () => void }) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const bgRef = useRef<HTMLCanvasElement>(null);
  const fgRef = useRef<HTMLCanvasElement>(null);
  const vidRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const [{ W, H }] = useState(() => ({
    W: typeof window !== 'undefined' ? window.innerWidth : 360,
    H: typeof window !== 'undefined' ? window.innerHeight : 640,
  }));
  const wide = W / H > 0.75;     // شاشة عريضة (كمبيوتر): الفيديو يتوسّط بحواف مذابة بدل التكبير

  useEffect(() => {
    const bgc = bgRef.current;
    const fgc = fgRef.current;
    const box = boxRef.current;
    const vid = vidRef.current;
    if (!bgc || !fgc || !box) return;
    const b = bgc.getContext('2d');
    const c = fgc.getContext('2d');
    if (!b || !c) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    bgc.width = Math.round(W * dpr); bgc.height = Math.round(H * dpr);
    fgc.width = Math.round(W * dpr); fgc.height = Math.round(H * dpr);
    const k = Math.max(0.75, H / 700);

    // الوضع: لصاحب البث، أو من صاحب البث لمستخدم (إطاره يرتفع بعد الفيديو)
    const liftInfo0 = getLiftInfo();
    const isLift = !!liftInfo0;
    let liftPre: HTMLImageElement | null = null;
    if (liftInfo0 && liftInfo0.avatarUrl) {
      try { liftPre = new Image(); liftPre.src = String(liftInfo0.avatarUrl); } catch { liftPre = null; }
    }

    // ── سبرايتات ──
    const FIRE = FIRE_RGB.map(rgb => makeSprite(rgb, 0.3));
    const SMOKE = makeSprite('40,10,12', 0.15);
    const blob = (g: CanvasRenderingContext2D, sp: HTMLCanvasElement, x: number, y: number, r: number, a: number) => {
      if (a <= 0.003 || r <= 0.2) return;
      g.globalAlpha = Math.min(1, a);
      g.drawImage(sp, x - r, y - r, r * 2, r * 2);
    };

    // ── حالة ──
    const fx: Pt[] = [];
    const streaks: Streak[] = [];
    const rings: Ring[] = [];
    let hot: Hot[] = [];
    let hotAt = -9;
    const acc = { up: 0, sky: 0, ring: 0, orbit: 0, aura: 0 };
    let host: Host | null = null;
    let flash2 = 0;        // وميض برتقالي (نفث النار)
    let redFlash = 0;      // نبضة حمراء بالسماء (الصرخات)
    let shakeE = 0;
    let bolt: { segs: number[][]; born: number } | null = null;
    let q = 1;
    let emaDt = 0.016;
    let arrived = false;
    let finished = false;
    const roarDone = ROARS.map(() => false);
    const thunderDone = THUNDER.map(() => false);
    const headX = W * 0.5;
    const headY = H * 0.36;

    // ── الفيديو ──
    let vCalled = false;
    let vStarted = false;
    let vEnded = false;
    let videoFailed = false;
    let vDur = VIDEO_DUR;
    let vEndT = VIDEO_AT + VIDEO_DUR;       // ساعة الهدية اللي ينتهي فيها الفيديو (تتعدل حسب التشغيل الفعلي)
    let nowT = 0;
    const cleanups: (() => void)[] = [];

    if (vid) {
      try {
        vid.disablePictureInPicture = true;
        vid.disableRemotePlayback = true;
        vid.setAttribute('x-webkit-airplay', 'deny');
        vid.setAttribute('webkit-playsinline', 'true');
        vid.setAttribute('controlsList', 'nodownload noremoteplayback nofullscreen');
        vid.controls = false;
        vid.loop = false;
        vid.volume = 1;
        vid.muted = false;
      } catch { /* ignore */ }
      const onMeta = () => { if (isFinite(vid.duration) && vid.duration > 1) vDur = vid.duration; };
      const onPlaying = () => { vStarted = true; vEndT = nowT - vid.currentTime + vDur; };
      const onEnded = () => { vEnded = true; vEndT = nowT; };
      const onErr = () => { if (!vStarted && !videoFailed) { videoFailed = true; vEndT = Math.max(nowT, VIDEO_AT) + 7; } };
      vid.addEventListener('loadedmetadata', onMeta);
      vid.addEventListener('playing', onPlaying);
      vid.addEventListener('ended', onEnded);
      vid.addEventListener('error', onErr);
      cleanups.push(() => {
        vid.removeEventListener('loadedmetadata', onMeta);
        vid.removeEventListener('playing', onPlaying);
        vid.removeEventListener('ended', onEnded);
        vid.removeEventListener('error', onErr);
        try { vid.pause(); } catch { /* ignore */ }
      });
      try { vid.load(); } catch { /* ignore */ }
    }

    // تشغيل الفيديو بصوته الكامل تلقائياً؛ لو المتصفح منع الصوت يشتغل صامتاً ثم يفتح الصوت عند أول لمسة
    const startVideo = () => {
      if (!vid) { videoFailed = true; vEndT = Math.max(nowT, VIDEO_AT) + 7; return; }
      try { vid.currentTime = 0; vid.muted = false; vid.volume = 1; } catch { /* ignore */ }
      const p = vid.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          try {
            vid.muted = true;
            vid.play().catch(() => { if (!vStarted) { videoFailed = true; vEndT = Math.max(nowT, VIDEO_AT) + 7; } });
          } catch { /* ignore */ }
          const unmute = () => {
            try { vid.muted = false; vid.volume = 1; } catch { /* ignore */ }
            ['pointerdown', 'touchstart', 'click', 'keydown'].forEach(ev => window.removeEventListener(ev, unmute, true));
          };
          ['pointerdown', 'touchstart', 'click', 'keydown'].forEach(ev => window.addEventListener(ev, unmute, true));
          cleanups.push(() => ['pointerdown', 'touchstart', 'click', 'keydown'].forEach(ev => window.removeEventListener(ev, unmute, true)));
        });
      }
    };

    const stopSound = playDragonFireSound({
      videoAt: VIDEO_AT,
      videoEnd: END_VIDEO_S,
      thunderTimes: THUNDER,
      liftAt: isLift ? END_VIDEO_S - LIFT_LEAD : null,
      liftArriveAt: isLift ? END_VIDEO_S - LIFT_LEAD + LIFT_RISE_S : null,
      endAt: isLift ? TOTAL_LIFT_S : TOTAL_HOST_S,
    });

    // ── جسيمات ──
    const spawn = (kind: Pt['k'], x: number, y: number, vx: number, vy: number, size: number, life: number, o: Partial<Pt> = {}) => {
      if (fx.length >= MAX_FX) return;
      fx.push({ k: kind, x, y, px: x, py: y, vx, vy, size, grow: 0, life, age: 0, grav: 0, drag: 0, wind: 0, seed: Math.random() * 6.28, stuck: 0, ...o });
    };

    const rrPath = (x: number, y: number, w: number, h: number, r: number) => {
      const rr = Math.min(r, w / 2, h / 2);
      c.beginPath();
      c.moveTo(x + rr, y);
      c.arcTo(x + w, y, x + w, y + h, rr);
      c.arcTo(x + w, y + h, x, y + h, rr);
      c.arcTo(x, y + h, x, y, rr);
      c.arcTo(x, y, x + w, y, rr);
      c.closePath();
    };
    const topAt = (h: Hot, x: number): number | null => {
      const lx = x - h.x;
      if (lx < 0 || lx > h.w) return null;
      const r = h.rad;
      if (r > 0 && lx < r) { const dx = r - lx; return h.y + r - Math.sqrt(Math.max(0, r * r - dx * dx)); }
      if (r > 0 && lx > h.w - r) { const dx = lx - (h.w - r); return h.y + r - Math.sqrt(Math.max(0, r * r - dx * dx)); }
      return h.y;
    };
    const collectHot = (prev: Hot[]): Hot[] => {
      const old = new Map<Element, number>();
      prev.forEach(p => old.set(p.el, p.heat));
      const out: Hot[] = [];
      try {
        document.querySelectorAll<HTMLElement>(HOT_SEL).forEach(el => {
          if (out.length >= 90 || el.closest('[data-gift-overlay]')) return;
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return;
          const r = el.getBoundingClientRect();
          if (r.width < 14 || r.height < 14 || r.bottom < 0 || r.top > H - 4 || r.right < 0 || r.left > W) return;
          if (r.width > W * 0.92 && r.height > H * 0.3) return;
          let rad = parseFloat(cs.borderTopLeftRadius) || 0;
          if (cs.borderTopLeftRadius.endsWith('%')) rad = (rad / 100) * Math.min(r.width, r.height);
          rad = Math.min(rad, r.width / 2, r.height / 2);
          out.push({ el, x: r.left, y: r.top, w: r.width, h: r.height, rad, heat: old.get(el) || 0 });
        });
      } catch { /* ignore */ }
      return out;
    };

    const makeBolt = (x0: number, y0: number, x1: number, y1: number, disp: number, depth: number, out: number[][]) => {
      if (depth === 0) { out.push([x0, y0, x1, y1]); return; }
      const mx = (x0 + x1) / 2 + (Math.random() - 0.5) * disp;
      const my = (y0 + y1) / 2 + (Math.random() - 0.5) * disp;
      makeBolt(x0, y0, mx, my, disp / 2, depth - 1, out);
      makeBolt(mx, my, x1, y1, disp / 2, depth - 1, out);
      if (depth > 2 && Math.random() < 0.28) makeBolt(mx, my, mx + (Math.random() - 0.5) * disp * 3, my + Math.random() * disp * 2, disp / 2, depth - 2, out);
    };
    const strike = (t: number) => {
      const segs: number[][] = [];
      const bx = rnd(0.15, 0.85) * W;
      makeBolt(bx, -10, bx + rnd(-0.3, 0.3) * W, H * rnd(0.34, 0.5), H * 0.12, 5, segs);
      bolt = { segs, born: t };
      redFlash = Math.max(redFlash, 0.7);
    };

    // غيوم السماء الحمراء
    const clouds = Array.from({ length: 9 }, (_, i) => ({
      y: rnd(0.02, 0.5) * H, r: rnd(0.38, 0.8) * Math.max(W, 320), sp: rnd(8, 26) * (i % 2 ? 1 : -1),
      x0: rnd(0, W * 1.4), a: rnd(0.16, 0.32), tone: i % 3,
    }));
    const vignette = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.78);
    vignette.addColorStop(0, 'rgba(10,0,0,0)');
    vignette.addColorStop(1, 'rgba(10,0,0,0.6)');

    const onRoar = (r: { vt: number; s: number }, t: number) => {
      const big = r.s > 1;
      shakeE = Math.max(shakeE, r.s * 10 * k);
      redFlash = Math.max(redFlash, 0.5 * r.s);
      rings.push({ x: headX, y: headY, born: t, dur: 1.1, maxR: W * (big ? 1.7 : 1.1), w: big ? 8 : 5 });
      rings.push({ x: headX, y: headY, born: t + 0.14, dur: 1.4, maxR: W * (big ? 2.1 : 1.4), w: 3 });
      if (r.s >= 0.8) strike(t);
      const n = Math.round((big ? 170 : 50) * r.s * q);
      for (let i = 0; i < n; i++) {
        const a = rnd(0, Math.PI * 2);
        const sp = rnd(180, big ? 1100 : 700) * k;
        spawn(i % 3 ? 2 : 0, headX + rnd(-0.2, 0.2) * W, headY, Math.cos(a) * sp, Math.sin(a) * sp - 120 * k, rnd(big ? 10 : 6, big ? 26 : 16) * k * (i % 3 ? 0.15 : 1), rnd(0.7, 1.8), { grav: i % 3 ? 400 * k : -60 * k, drag: 0.7, wind: 0.2 });
      }
      if (big) flash2 = 1;
    };

    // ── الحلقة الرئيسية ──
    let raf = 0;
    const start = performance.now();
    let last = start;

    const frame = (now: number) => {
      const t = (now - start) / 1000;
      nowT = t;
      const raw = (now - last) / 1000;
      const dt = Math.min(0.033, raw);
      last = now;
      emaDt += (raw - emaDt) * 0.05;
      if (emaDt > 0.036) q = Math.max(0.45, q - 0.015);
      else if (emaDt < 0.024) q = Math.min(1, q + 0.008);

      // الفيديو: يبدأ بساعة الهدية
      if (!vCalled && t >= VIDEO_AT) { vCalled = true; startVideo(); }
      if (vCalled && !vStarted && !videoFailed && t > VIDEO_AT + 9) { videoFailed = true; vEndT = t + 7; }
      const vt = videoFailed
        ? clamp01((t - VIDEO_AT) / vDur) * vDur
        : vStarted ? (vEnded ? vDur : (vid ? vid.currentTime : 0)) : 0;
      const inVideo = (vStarted || videoFailed) && !vEnded && vt < vDur;

      // مواعيد ما بعد الفيديو
      const liftT0 = vEndT - LIFT_LEAD;
      const liftArrive = liftT0 + LIFT_RISE_S;
      const liftHoldEnd = liftArrive + LIFT_HOLD_S;
      const liftDownEnd = liftHoldEnd + LIFT_DOWN_S;
      const endT = isLift ? liftDownEnd + TAIL_LIFT_S : vEndT + TAIL_HOST_S;
      const lbS = isLift ? liftHoldEnd - 0.2 : vEndT - 0.6;
      const lbE = isLift ? liftDownEnd + 0.5 : vEndT + 1.2;
      const lb = smooth((t - lbS) / (lbE - lbS));            // رجوع الإضاءة
      const endFade = t > endT - 0.5 ? clamp01((endT - t) / 0.5) : 1;
      bgc.style.opacity = String(endFade);
      fgc.style.opacity = String(endFade);

      // الفيديو يظهر بمزج (opacity على نفس العنصر عشان ما ينكسر المزج)
      if (vid) {
        const vo = (vStarted || videoFailed)
          ? smooth(vt / VIDEO_FADE_IN) * (1 - smooth((vt - (vDur - VIDEO_FADE_OUT)) / VIDEO_FADE_OUT))
          : 0;
        vid.style.opacity = videoFailed ? '0' : String(vo * endFade);
      }

      // ── أحداث ──
      THUNDER.forEach((tt, i) => { if (!thunderDone[i] && t >= tt) { thunderDone[i] = true; strike(t); } });
      ROARS.forEach((r, i) => { if (!roarDone[i] && inVideo && vt >= r.vt) { roarDone[i] = true; onRoar(r, t); } });

      if (t >= 1.2 && t - hotAt > 0.45) { hot = collectHot(hot); hotAt = t; }
      for (const h of hot) h.heat = Math.max(0, h.heat - dt * 0.4);

      const breath = inVideo ? smooth((vt - BREATH_VT) / 0.5) * (1 - smooth((vt - BREATH_END_VT) / 1.2)) : 0;
      if (breath > 0) shakeE = Math.max(shakeE, 5.5 * k * breath);
      shakeE *= Math.exp(-dt * 3.5);
      if (shakeE > 0.06) {
        const sx = shakeE * (Math.sin(t * 61) * 0.6 + Math.sin(t * 37 + 1) * 0.4);
        const sy = shakeE * (Math.sin(t * 53 + 2) * 0.6 + Math.sin(t * 29) * 0.4) * 0.7;
        box.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) scale(${(1 + Math.min(0.05, shakeE * 0.0035)).toFixed(4)})`;
      } else if (box.style.transform) box.style.transform = '';

      // ── الإصدار ──
      const flick = 0.9 + 0.1 * Math.sin(t * 17) + 0.05 * Math.sin(t * 41);
      const skyAmt = smooth((t - 0.3) / 1.8) * (1 - lb);
      const stormy = smooth((t - 0.8) / 1.5) * (1 - lb);
      if (stormy > 0.02) {
        // جمرات تصعد من الأسفل
        acc.up += dt * (34 + 150 * breath) * stormy * q;
        while (acc.up >= 1) {
          acc.up--;
          spawn(2, rnd(-0.05, 1.05) * W, H + 6, rnd(-40, 70) * k, -rnd(90, 320) * k, rnd(1.4, 3.2) * k, rnd(2.5, 5), { grav: -20 * k, drag: 0.25, wind: 0.8 });
        }
        // مطر جمرات ينزل على الأزرار
        acc.sky += dt * (10 + 70 * breath) * stormy * q;
        while (acc.sky >= 1) {
          acc.sky--;
          spawn(2, rnd(-0.15, 1.05) * W, -10, rnd(-20, 60), rnd(80, 200) * k, rnd(1.8, 3.6) * k, rnd(6, 8), { grav: 130 * k, drag: 0.3, wind: 0.5 });
        }
        // رياح
        acc.ring += dt * 14 * stormy * q;
        while (acc.ring >= 1) {
          acc.ring--;
          streaks.push({ x: -rnd(40, 200), y: rnd(0, H), len: rnd(80, 220) * k, vx: rnd(700, 1500) * k, a: rnd(0.06, 0.2), w: rnd(0.6, 1.6), ph: rnd(0, 6.28) });
        }
      }

      // ═══ رسم الخلفية (ظلام + سماء حمراء) ═══
      b.setTransform(dpr, 0, 0, dpr, 0, 0);
      b.clearRect(0, 0, W, H);
      b.globalAlpha = 1;
      b.globalCompositeOperation = 'source-over';
      const dk = DARK_MAX * smooth(t / DARK_IN) * (1 - lb);
      b.fillStyle = `rgba(4,0,2,${dk})`;
      b.fillRect(0, 0, W, H);

      if (skyAmt > 0.01) {
        const pulse = 0.88 + 0.12 * Math.sin(t * 2.2) + redFlash * 0.5;
        const sg = b.createLinearGradient(0, 0, 0, H);
        sg.addColorStop(0, `rgba(190,14,12,${Math.min(1, 0.85 * skyAmt * pulse)})`);
        sg.addColorStop(0.45, `rgba(105,6,10,${0.6 * skyAmt * pulse})`);
        sg.addColorStop(1, `rgba(40,0,2,${0.2 * skyAmt})`);
        b.fillStyle = sg;
        b.fillRect(0, 0, W, H);
        // غيوم نار وغيوم دخان داكنة
        for (const cl of clouds) {
          const span = W + cl.r * 2;
          const x = (((cl.x0 + t * cl.sp) % span) + span) % span - cl.r;
          b.globalCompositeOperation = 'lighter';
          blob(b, FIRE[cl.tone === 0 ? 4 : cl.tone === 1 ? 3 : 5], x, cl.y, cl.r, cl.a * skyAmt * pulse);
          b.globalCompositeOperation = 'source-over';
          blob(b, SMOKE, x + cl.r * 0.3, cl.y + cl.r * 0.15, cl.r * 0.8, 0.35 * skyAmt);
        }
        b.globalAlpha = 1;
        // توهج الحمم من الأفق
        b.globalCompositeOperation = 'lighter';
        blob(b, FIRE[3], W * 0.5, H, W * 0.95, 0.3 * skyAmt * flick);
        blob(b, FIRE[4], W * 0.5, H * 0.08, W * 0.7, 0.18 * skyAmt * pulse);
        b.globalAlpha = 1;
        b.globalCompositeOperation = 'source-over';
      }
      // نبضة حمراء + صاعقة
      if (redFlash > 0.01) {
        b.globalCompositeOperation = 'lighter';
        b.fillStyle = `rgba(255,50,30,${redFlash * 0.28})`;
        b.fillRect(0, 0, W, H);
        b.globalCompositeOperation = 'source-over';
        redFlash *= Math.exp(-dt * 4.5);
      }
      if (bolt) {
        const u = (t - bolt.born) / 0.3;
        if (u >= 1) bolt = null;
        else {
          const fl = Math.random() < 0.3 ? 0.5 : 1;
          const a = (1 - u) * fl;
          b.lineCap = 'round';
          b.strokeStyle = `rgba(255,70,50,${0.5 * a})`;
          b.lineWidth = 8 * k;
          b.beginPath();
          bolt.segs.forEach(s => { b.moveTo(s[0], s[1]); b.lineTo(s[2], s[3]); });
          b.stroke();
          b.strokeStyle = `rgba(255,235,225,${a})`;
          b.lineWidth = 2.2 * k;
          b.beginPath();
          bolt.segs.forEach(s => { b.moveTo(s[0], s[1]); b.lineTo(s[2], s[3]); });
          b.stroke();
        }
      }

      // ═══ رسم الواجهة الأمامية (جمرات ونار وإطار المستخدم) ═══
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';

      // خطوط الرياح
      if (streaks.length) {
        c.lineCap = 'round';
        for (let i = streaks.length - 1; i >= 0; i--) {
          const s = streaks[i];
          s.x += s.vx * dt;
          if (s.x - s.len > W) { streaks[i] = streaks[streaks.length - 1]; streaks.pop(); continue; }
          c.strokeStyle = `rgba(255,150,120,${s.a * stormy})`;
          c.lineWidth = s.w;
          c.beginPath();
          c.moveTo(s.x - s.len, s.y + Math.sin(s.ph + t * 3) * 4);
          c.quadraticCurveTo(s.x - s.len * 0.5, s.y + Math.sin(s.ph + t * 3 + 1.5) * 9, s.x, s.y);
          c.stroke();
        }
      }

      // وميض النفث
      if (flash2 > 0.01) {
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = `rgba(255,170,90,${flash2 * 0.5})`;
        c.fillRect(0, 0, W, H);
        c.globalCompositeOperation = 'source-over';
        flash2 *= Math.exp(-dt * 4);
      }

      // الجسيمات
      const wx = 90 * k * stormy * (0.7 + 0.3 * Math.sin(t * 0.9));
      c.globalCompositeOperation = 'lighter';
      for (let i = fx.length - 1; i >= 0; i--) {
        const p = fx[i];
        p.age += dt;
        if (p.age >= p.life) { fx[i] = fx[fx.length - 1]; fx.pop(); continue; }
        const u = p.age / p.life;

        if (p.stuck > 0) {
          p.stuck -= dt;
          const fl = 0.7 + 0.3 * Math.sin(p.age * 38 + p.seed);
          blob(c, FIRE[2], p.x, p.y, p.size * 3.6 * fl, 0.7 * (1 - u * 0.5));
          blob(c, FIRE[0], p.x, p.y, p.size * 1.4, 0.6);
          continue;
        }

        p.px = p.x; p.py = p.y;
        p.vy += p.grav * dt;
        p.vx += wx * p.wind * dt;
        const dm = Math.exp(-p.drag * dt);
        p.vx *= dm; p.vy *= dm;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y > H + 70 || p.x < -140 || p.x > W + 140 || (p.y < -400 && p.vy < 0)) { fx[i] = fx[fx.length - 1]; fx.pop(); continue; }

        // الجمرات النازلة تحط على الأزرار وتسخّنها
        if (p.k === 2 && p.vy > 0 && p.age > 0.15) {
          for (const h of hot) {
            const top = topAt(h, p.x);
            if (top === null || !(p.py <= top + 1 && p.y >= top)) continue;
            h.heat = Math.min(1.3, h.heat + 0.28);
            for (let j = 0; j < 3; j++) spawn(2, p.x, top, rnd(-90, 90) * k, -rnd(40, 160) * k, rnd(1, 1.8) * k, rnd(0.3, 0.7), { grav: 600 * k, drag: 0.6 });
            if (Math.random() < 0.4) { p.y = top - 1; p.vx = 0; p.vy = 0; p.stuck = rnd(0.5, 1.4); p.life = p.age + p.stuck; }
            else { p.y = top - 1; p.vy *= -0.3; p.vx *= 0.6; }
            break;
          }
        }

        if (p.k === 0) {
          const sz = p.size * (1 + p.grow * u);
          const idx = Math.min(6, Math.floor(Math.pow(u, 0.8) * 6.5));
          blob(c, FIRE[idx], p.x, p.y, sz, (1 - u) * 0.9);
        } else {
          const fl = 0.6 + 0.4 * Math.sin(p.age * 30 + p.seed);
          const fade = u > 0.7 ? (1 - u) / 0.3 : 1;
          blob(c, FIRE[u > 0.6 ? 2 : 1], p.x, p.y, p.size * 3.2, 0.8 * fl * fade);
          blob(c, FIRE[0], p.x, p.y, p.size * 1.2, 0.9 * fade);
          if (Math.abs(p.vx) + Math.abs(p.vy) > 220) {
            c.globalAlpha = 0.55 * fade;
            c.strokeStyle = 'rgb(255,150,60)';
            c.lineWidth = Math.max(1, p.size * 0.7);
            c.beginPath();
            c.moveTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
            c.lineTo(p.x, p.y);
            c.stroke();
          }
        }
      }
      c.globalAlpha = 1;

      // سخونة الأزرار: ألسنة نار + توهج
      for (const h of hot) {
        if (h.heat > 0.45 && Math.random() < dt * 22 * h.heat) {
          const lx = h.x + rnd(0.12, 0.88) * h.w;
          const top = topAt(h, lx);
          if (top !== null) spawn(0, lx, top, rnd(-12, 12), -rnd(40, 100) * k, rnd(5, 10) * k, rnd(0.35, 0.7), { grow: -0.5, grav: -70 * k, drag: 1.6 });
        }
      }
      c.globalCompositeOperation = 'source-over';
      for (const h of hot) {
        if (h.heat < 0.03) continue;
        const a = Math.min(1, h.heat);
        rrPath(h.x, h.y, h.w, h.h, h.rad);
        c.fillStyle = `rgba(255,70,20,${0.18 * a})`;
        c.fill();
        c.lineWidth = 2;
        c.strokeStyle = `rgba(255,${Math.round(110 + 60 * (1 - a))},40,${0.85 * a})`;
        c.shadowColor = 'rgba(255,80,20,0.9)';
        c.shadowBlur = 12 * a;
        c.stroke();
        c.shadowBlur = 0;
      }

      // موجات الصدمة (الصرخات)
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        const u = (t - r.born) / r.dur;
        if (u >= 1) { rings.splice(i, 1); continue; }
        if (u < 0) continue;
        const rr = easeOut(u) * r.maxR;
        c.strokeStyle = `rgba(255,120,70,${(1 - u) * 0.7})`;
        c.lineWidth = r.w * (1 - u) + 1;
        c.beginPath();
        c.ellipse(r.x, r.y, rr, rr * 0.34, 0, 0, Math.PI * 2);
        c.stroke();
      }

      // ═══ المستلم ═══
      if (!host) {
        if (isLift) { if (t >= liftT0 - 1.2) host = findLift(W, H, liftPre) || findHost(W); }
        else if (vt >= BREATH_VT - 1) host = findHost(W);
      }

      // (1) لصاحب البث: هالة نار على صورته أثناء النفث وبعده
      if (host && !host.lift && !isLift) {
        const aOn = smooth((vt - (BREATH_VT - 0.3)) / 0.7) * (1 - smooth((t - (vEndT - 0.3)) / 1.0));
        if (aOn > 0.01) {
          const R = Math.max(host.w, host.h) * 0.6;
          c.save();
          c.globalCompositeOperation = 'lighter';
          blob(c, FIRE[3], host.x, host.y, R * 2.6, 0.5 * aOn * flick);
          blob(c, FIRE[1], host.x, host.y, R * 1.4, 0.35 * aOn);
          c.restore();
          c.globalAlpha = 1;
          c.beginPath();
          c.arc(host.x, host.y, R, 0, Math.PI * 2);
          c.lineWidth = Math.max(2, R * 0.12);
          c.strokeStyle = `rgba(255,170,60,${0.9 * aOn})`;
          c.shadowColor = 'rgba(255,90,20,0.95)';
          c.shadowBlur = 16 * aOn;
          c.stroke();
          c.shadowBlur = 0;
          acc.aura += dt * 70 * aOn * q;
          while (acc.aura >= 1) {
            acc.aura--;
            const a = rnd(0, Math.PI * 2);
            spawn(0, host.x + Math.cos(a) * R, host.y + Math.sin(a) * R, Math.cos(a) * 30, -rnd(40, 110) * k, rnd(5, 10) * k * (R / 28), rnd(0.35, 0.7), { grow: -0.5, grav: -70 * k, drag: 1.5 });
          }
        }
      }

      // (2) من صاحب البث لمستخدم: عند نهاية الفيديو إطاره يرتفع لمنتصف الشاشة
      if (host && host.lift) {
        const L = host.lift;
        const up = easeOut((t - liftT0) / LIFT_RISE_S);
        const down = smooth((t - liftHoldEnd) / LIFT_DOWN_S);
        const e2 = up * (1 - down);
        if (down >= 1 && !L.done) { L.done = true; L.restore(); }
        if (e2 > 0.004) {
          const ax = lerp(L.sx, L.ex, e2);
          const ay = lerp(L.sy, L.ey, e2) + Math.sin(t * 2.6) * 3 * k * e2;
          const ar = lerp(L.sr, L.R, e2);
          if (!arrived && up >= 0.98) {
            arrived = true;
            rings.push({ x: ax, y: ay, born: t, dur: 0.9, maxR: ar * 5, w: 5 });
            rings.push({ x: ax, y: ay, born: t + 0.12, dur: 1.2, maxR: ar * 7, w: 3 });
            for (let i = 0; i < 70; i++) {
              const a = rnd(0, Math.PI * 2);
              const sp = rnd(160, 620) * k;
              spawn(i % 2 ? 0 : 2, ax, ay, Math.cos(a) * sp, Math.sin(a) * sp, rnd(3, 9) * k, rnd(0.5, 1.2), { grow: -0.4, grav: i % 2 ? -40 * k : 450 * k, drag: 1.5 });
            }
          }
          // توهج الإطار
          c.save();
          c.globalCompositeOperation = 'lighter';
          blob(c, FIRE[3], ax, ay, ar * 2.8, 0.45 * e2 * flick);
          blob(c, FIRE[4], ax, ay, ar * 4.2, 0.22 * e2);
          c.restore();
          c.globalAlpha = 1;
          // الصورة
          c.save();
          c.globalAlpha = clamp01(e2 * 3);
          c.beginPath();
          c.arc(ax, ay, ar, 0, Math.PI * 2);
          c.closePath();
          c.save();
          c.clip();
          let drawn = false;
          if (!L.img && liftPre && liftPre.complete && liftPre.naturalWidth > 0) L.img = liftPre;
          if (L.img && L.img.complete && L.img.naturalWidth > 0) {
            try {
              const sw = L.img.naturalWidth, sh = L.img.naturalHeight, ss = Math.min(sw, sh);
              c.drawImage(L.img, (sw - ss) / 2, (sh - ss) / 2, ss, ss, ax - ar, ay - ar, ar * 2, ar * 2);
              drawn = true;
            } catch { /* ignore */ }
          }
          if (!drawn) {
            c.fillStyle = '#3a0c0a';
            c.fillRect(ax - ar, ay - ar, ar * 2, ar * 2);
            c.fillStyle = '#ff9a3a';
            c.font = `800 ${Math.round(ar * 1.0)}px sans-serif`;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(L.letter, ax, ay + ar * 0.04);
          }
          c.restore();
          // حلقة النار
          c.beginPath();
          c.arc(ax, ay, ar, 0, Math.PI * 2);
          c.lineWidth = Math.max(3, ar * 0.1);
          const rg = c.createLinearGradient(ax - ar, ay - ar, ax + ar, ay + ar);
          rg.addColorStop(0, '#fff0a0');
          rg.addColorStop(0.5, '#ff8a1e');
          rg.addColorStop(1, '#d4260a');
          c.strokeStyle = rg;
          c.shadowColor = 'rgba(255,90,20,0.95)';
          c.shadowBlur = 18 * e2;
          c.stroke();
          c.shadowBlur = 0;
          c.restore();

          // ألسنة نار تحيط بالإطار + جمرات تدور حوله
          acc.orbit += dt * 80 * e2 * q;
          while (acc.orbit >= 1) {
            acc.orbit--;
            const a = rnd(0, Math.PI * 2);
            spawn(0, ax + Math.cos(a) * ar, ay + Math.sin(a) * ar, Math.cos(a) * 40 * k, Math.sin(a) * 40 * k - 70 * k, rnd(6, 12) * k * (ar / 50), rnd(0.4, 0.8), { grow: -0.55, grav: -80 * k, drag: 1.5 });
          }
          c.save();
          c.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 10; i++) {
            const a = t * 2.2 + (i * Math.PI * 2) / 10;
            const rr = ar * (1.28 + 0.08 * Math.sin(t * 3 + i));
            blob(c, FIRE[2], ax + Math.cos(a) * rr, ay + Math.sin(a) * rr * 0.92, ar * 0.16, 0.85 * e2);
            blob(c, FIRE[0], ax + Math.cos(a) * rr, ay + Math.sin(a) * rr * 0.92, ar * 0.07, 0.95 * e2);
          }
          c.restore();
          c.globalAlpha = 1;

          // اسم المستلم تحت الصورة
          if (e2 > 0.5) {
            c.save();
            c.globalAlpha = clamp01((e2 - 0.5) * 2);
            c.font = `800 ${Math.round(Math.max(12, ar * 0.3))}px sans-serif`;
            c.textAlign = 'center';
            c.textBaseline = 'top';
            c.shadowColor = 'rgba(0,0,0,0.9)';
            c.shadowBlur = 6;
            c.fillStyle = '#fff1d0';
            c.fillText(L.name.length > 18 ? L.name.slice(0, 17) + '…' : L.name, ax, ay + ar * 1.5 + 8 * k);
            c.restore();
          }
          c.globalAlpha = 1;
        }
      }

      // تعتيم الأطراف (يوحّد المشهد كله بإحساس سينمائي)
      if (dk > 0.05) {
        c.globalAlpha = (0.9 * dk / DARK_MAX);
        c.fillStyle = vignette;
        c.fillRect(0, 0, W, H);
        c.globalAlpha = 1;
      }
      c.globalCompositeOperation = 'source-over';

      // النهاية
      if (!finished && t >= endT) { finished = true; doneRef.current(); return; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // أمان: لو صار أي تعليق، لا نترك الأنميشن للأبد
    const tFail = window.setTimeout(() => { if (!finished) { finished = true; doneRef.current(); } }, 60000);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(tFail);
      stopSound();
      cleanups.forEach(fn => { try { fn(); } catch { /* ignore */ } });
      if (host && host.lift && !host.lift.done) { host.lift.done = true; host.lift.restore(); }
    };
  }, [W, H]);

  // الفيديو يندمج بوضع screen: السواد يصير شفاف فيظهر الظلام والسماء الحمراء تحته، والنار والتنين يتوهجون فوقها.
  // (opacity و mix-blend-mode على نفس العنصر — لا تضع wrapper بـ opacity/filter حوله وإلا ينكسر المزج)
  const videoStyle: React.CSSProperties = {
    position: 'absolute', inset: 0, width: '100%', height: '100%',
    objectFit: wide ? 'contain' : 'cover',
    opacity: 0, pointerEvents: 'none', background: 'transparent',
    mixBlendMode: 'screen',
    filter: 'saturate(1.2) contrast(1.1)',
    ...(wide ? {
      WebkitMaskImage: 'linear-gradient(90deg, transparent 0, #000 24%, #000 76%, transparent 100%)',
      maskImage: 'linear-gradient(90deg, transparent 0, #000 24%, #000 76%, transparent 100%)',
    } : null),
  };

  return (
    <div
      aria-hidden="true"
      data-gift-overlay="1"
      style={{ position: 'fixed', inset: 0, zIndex: 9400, pointerEvents: 'none', overflow: 'hidden' }}
    >
      <style>{'.df-vid::-webkit-media-controls,.df-vid::-webkit-media-controls-panel,.df-vid::-webkit-media-controls-start-playback-button{display:none!important;-webkit-appearance:none}'}</style>
      <div ref={boxRef} style={{ position: 'absolute', inset: 0, willChange: 'transform', isolation: 'isolate' }}>
        <canvas ref={bgRef} style={{ position: 'absolute', inset: 0, width: W, height: H, pointerEvents: 'none' }} />
        <video
          ref={vidRef}
          className="df-vid"
          src={VIDEO_SRC}
          preload="auto"
          playsInline
          style={videoStyle}
        />
        <canvas ref={fgRef} style={{ position: 'absolute', inset: 0, width: W, height: H, pointerEvents: 'none' }} />
      </div>
    </div>
  );
}

export const DragonFireGift: GiftDefinition = {
  id: 'dragonfire',
  name: 'Dragon Fire',
  price: PRICE,
  durationMs: TOTAL_MS,
  Preview: DragonFirePreview,
  Animation: DragonFireAnimation,
};

export default DragonFireGift;
