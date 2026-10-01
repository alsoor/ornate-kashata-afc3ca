/**
 * هدية البركان (Volcano) — 1,000 Coins — مدتها 20 ثانية
 *
 * - Preview  : داخل مربع الهدايا بركان صغير متحرك قبل النقر: فوهة تتوهج، نار تتراقص، شرارات تتطاير،
 *              دخان يطلع، حمم تسيل على الجوانب، وشبح صغير بتاج نار يطلع من الفوهة بين فترة وفترة.
 * - Animation: (الأرقام بالثواني)
 *     0.0 – 1.6  : البث يغرق بالسواد + صوت رياح قوية وغبار يطير
 *     3.2 – 5.6  : هزّة أرضية، شقوق تتوهج، البركان يطلع من تحت
 *     5.6        : انفجار! وميض + موجة صدمة + نافورة نار وقنابل بركانية تتناثر على كل البث
 *     6 – 16     : جمرات ورماد تتساقط من فوق وتنزل على أزرار البث (الأزرار تسخن وتتوهج وتطلع منها ألسنة نار)
 *                  + صواعق داخل عمود الدخان + حمم تسيل على جوانب البركان
 *     9.4 – 12.9 : شبح يطلع من فتحة البركان ويطير لصاحب البث
 *     13.5 – 15.5: تاج من نار على راس صاحب البث (بروفايله) ثانيتين بالضبط ثم يختفي
 *     16.4 – 19.4: البركان يهدأ ويغوص، والإضاءة ترجع طبيعية
 *
 * ملف مستقل: الأصوات في src/lib/volcanoSounds.ts. غيّر الأرقام تحت (السعر/المدد/التوقيتات).
 *
 * ربط الأنميشن بالواجهة (يعمل تلقائياً بدونها):
 *   data-gift-host : على صورة/بروفايل صاحب البث → التاج ينزل على رأسه. (الافتراضي: أعلى منتصف الشاشة)
 *   data-gift-lift : (يضعه LiveCoinsDock تلقائياً) لما صاحب البث يعطي متحدث: صورة المتحدث تصعد للأعلى والشبح يلبسه التاج
 *   data-gift-walk : (غير مستخدم هنا، محفوظ للتوافق مع بقية الهدايا)
 *   data-gift-hot  : (اختياري) ضعه على أي عنصر تبي النار تنزل عليه غير الأزرار والـ inputs.
 *   الجمرات تنزل تلقائياً على: button, [role=button], a[href], input, textarea, select
 */
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { GiftDefinition } from '../../lib/types';
import { playVolcanoSound } from '../../lib/volcanoSounds';

// ── إعدادات الهدية ──────────────────────────────────────────────────────
const PRICE = 1000;
const TOTAL_MS = 20000;            // مدة الأنميشن الكلية (20 ثانية)
const TOTAL_S = TOTAL_MS / 1000;

const DARK_IN = 1.6;               // مدة الغرق بالسواد
const DARK_MAX = 0.92;             // قوة السواد (1 = أسود كامل)
const WIND_END = 16.5;             // نهاية الرياح
const RUMBLE_AT = 3.2;             // بداية الهزّة
const RISE_AT = 4.0;               // بداية طلوع البركان
const RISE_S = 1.5;                // مدة الطلوع
const ERUPT_AT = 5.6;              // الانفجار
const ERUPT_HOLD_END = 13.6;       // بداية هدوء الثوران
const ERUPT_END = 16.6;            // نهاية الثوران
const GHOST_AT = 9.4;              // الشبح يطلع من الفوهة
const GHOST_ARRIVE = 12.9;         // الشبح يوصل لصاحب البث
const CROWN_TOSS = 13.1;           // الشبح يرمي التاج
const CROWN_ON = 13.5;             // التاج على الرأس
const CROWN_S = 2.0;               // مدة بقاء التاج على الرأس (ثانيتين)
const CROWN_OFF = CROWN_ON + CROWN_S;
const CROWN_FADE = 0.35;
const SINK_AT = 17.2;              // البركان يغوص
const LIGHT_BACK_AT = 16.4;        // الإضاءة ترجع
const LIGHT_BACK_END = 19.4;
const LIGHTNING_TIMES = [7.4, 8.9, 10.6, 12.1, 14.2];

const MAX_FX = 1500;               // حد أقصى للجسيمات (للأداء على الجوال)
const HOT_SEL = 'button, [role="button"], a[href], input, textarea, select, [data-gift-host], [data-gift-walk], [data-gift-hot]';

const FIRE_RGB = ['255,250,225', '255,232,140', '255,186,60', '255,120,22', '228,60,10', '150,26,6', '70,12,6'];
const GHOST_RGB = ['240,252,255', '176,226,255', '112,172,255', '72,112,232', '40,60,160'];

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

// ═══════════════════════════════════════════════════════════════════════
//  Preview — بركان صغير متحرك داخل مربع الهدايا
// ═══════════════════════════════════════════════════════════════════════
const VG_CSS = `
@keyframes vg-flick{0%,100%{transform:scale(1,1)}25%{transform:scale(.9,1.25)}50%{transform:scale(1.1,.85)}75%{transform:scale(.95,1.15)}}
@keyframes vg-glow{0%,100%{opacity:.5}50%{opacity:1}}
@keyframes vg-spark{0%{transform:translate(0,0) scale(1);opacity:0}12%{opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(.2);opacity:0}}
@keyframes vg-smoke{0%{transform:translate(0,0) scale(.5);opacity:0}25%{opacity:.5}100%{transform:translate(var(--dx),-30px) scale(1.8);opacity:0}}
@keyframes vg-lava{to{stroke-dashoffset:-24}}
@keyframes vg-ghost{0%,6%{transform:translate(0,8px) scale(.35);opacity:0}22%{opacity:.95}58%{transform:translate(9px,-30px) scale(1);opacity:.95}78%{transform:translate(15px,-42px) scale(1);opacity:0}100%{transform:translate(15px,-42px);opacity:0}}
@keyframes vg-shake{0%,100%{transform:translate(0,0)}20%{transform:translate(-.6px,.4px)}40%{transform:translate(.7px,-.3px)}60%{transform:translate(-.4px,-.5px)}80%{transform:translate(.5px,.5px)}}
@keyframes vg-halo{0%,100%{filter:drop-shadow(0 0 5px rgba(255,90,20,.55))}50%{filter:drop-shadow(0 0 11px rgba(255,140,30,.95))}}
.vg-flick{animation:vg-flick .55s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 100%}
.vg-glow{animation:vg-glow 1.4s ease-in-out infinite}
.vg-spark{animation:vg-spark 1.7s ease-out infinite}
.vg-smoke{animation:vg-smoke 3.2s ease-out infinite;transform-box:fill-box;transform-origin:50% 50%}
.vg-lava{animation:vg-lava 1.1s linear infinite}
.vg-ghost{animation:vg-ghost 5.4s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 100%}
.vg-shake{animation:vg-shake .25s linear infinite}
.vg-halo{animation:vg-halo 1.4s ease-in-out infinite}
`;

const SPARKS: { x: number; dx: number; dy: number; d: number; r: number }[] = [
  { x: 48, dx: -16, dy: -36, d: 0, r: 1.5 },
  { x: 52, dx: 14, dy: -40, d: 0.25, r: 1.3 },
  { x: 50, dx: -4, dy: -46, d: 0.5, r: 1.8 },
  { x: 46, dx: -24, dy: -26, d: 0.75, r: 1.2 },
  { x: 54, dx: 22, dy: -30, d: 1.0, r: 1.4 },
  { x: 50, dx: 8, dy: -50, d: 1.2, r: 1.1 },
  { x: 49, dx: -10, dy: -42, d: 1.4, r: 1.6 },
  { x: 51, dx: 18, dy: -22, d: 0.4, r: 1.2 },
  { x: 47, dx: -20, dy: -18, d: 0.95, r: 1.0 },
];

function VolcanoPreview({ size = 72 }: { size?: number }) {
  const uid = React.useId().replace(/:/g, '');
  const h = Math.round(size * 1.3);
  const w = Math.round((h * 100) / 112);
  const ref = (n: string) => `url(#${n}${uid})`;
  return (
    <motion.div
      aria-hidden="true"
      animate={{ y: [0, -2, 0] }}
      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      style={{ position: 'relative', width: w, height: h, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <style>{VG_CSS}</style>
      <svg width={w} height={h} viewBox="0 0 100 112" className="vg-halo" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <radialGradient id={`glow${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff9a2a" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ff4a0a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`fire${uid}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#fff3b0" />
            <stop offset="35%" stopColor="#ffb02e" />
            <stop offset="75%" stopColor="#ff5a10" />
            <stop offset="100%" stopColor="#c21500" stopOpacity="0.2" />
          </linearGradient>
          <linearGradient id={`rock${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4a2418" />
            <stop offset="45%" stopColor="#24120d" />
            <stop offset="100%" stopColor="#0d0605" />
          </linearGradient>
          <radialGradient id={`lava${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff6c8" />
            <stop offset="45%" stopColor="#ffb02e" />
            <stop offset="100%" stopColor="#ff4a0a" />
          </radialGradient>
        </defs>

        <circle cx="50" cy="46" r="42" fill={ref('glow')} className="vg-glow" />

        <g className="vg-shake">
          {/* الدخان */}
          {[
            { dx: -10, d: 0 },
            { dx: 6, d: 1.0 },
            { dx: 14, d: 2.0 },
          ].map((s, i) => (
            <circle
              key={i} cx={46 + i * 3} cy="38" r="7" fill="#7a6a66"
              className="vg-smoke"
              style={{ animationDelay: `${s.d}s`, ['--dx' as string]: `${s.dx}px` } as React.CSSProperties}
            />
          ))}

          {/* ألسنة النار */}
          <path d="M42 48 C36 42 38 34 42 26 C46 34 47 42 42 48 Z" fill={ref('fire')} className="vg-flick" style={{ animationDelay: '.15s' }} />
          <path d="M58 48 C64 42 62 34 58 26 C54 34 53 42 58 48 Z" fill={ref('fire')} className="vg-flick" style={{ animationDelay: '.3s' }} />
          <path d="M50 48 C42 40 44 26 50 10 C56 26 58 40 50 48 Z" fill={ref('fire')} className="vg-flick" />

          {/* شرارات */}
          {SPARKS.map((s, i) => (
            <circle
              key={i} cx={s.x} cy="40" r={s.r} fill="#ffd37a"
              className="vg-spark"
              style={{ animationDelay: `${s.d}s`, ['--dx' as string]: `${s.dx}px`, ['--dy' as string]: `${s.dy}px` } as React.CSSProperties}
            />
          ))}

          {/* الجبل */}
          <path d="M2 108 L35 52 Q50 45 65 52 L98 108 Z" fill={ref('rock')} />
          <path d="M35 52 L24 72 L30 74 L20 96 M65 52 L76 70 L70 74 L80 98" fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth="1.2" />

          {/* حمم تسيل */}
          {['M45 52 C42 62 49 70 43 84 S40 98 37 106', 'M55 52 C58 63 52 72 58 86 S61 99 63 106', 'M50 54 C48 66 53 74 50 90'].map((d, i) => (
            <g key={i}>
              <path d={d} fill="none" stroke="#ff4a0a" strokeOpacity="0.5" strokeWidth="4" strokeLinecap="round" />
              <path
                d={d} fill="none" stroke="#ffc060" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="5 7"
                className="vg-lava" style={{ animationDelay: `${i * 0.25}s` }}
              />
            </g>
          ))}

          {/* الفوهة */}
          <ellipse cx="50" cy="50" rx="15" ry="4.6" fill={ref('lava')} className="vg-glow" />
          <path d="M35 52 Q50 44 65 52" fill="none" stroke="#2a130c" strokeWidth="2.2" strokeLinecap="round" />
        </g>

        {/* شبح بتاج نار يطلع من الفوهة */}
        <g transform="translate(50 46)">
          <g className="vg-ghost">
            <path d="M-6 0 C-6 -9 6 -9 6 0 L6 10 L3 7.5 L0 11 L-3 7.5 L-6 10 Z" fill="#e6f5ff" fillOpacity="0.95" />
            <ellipse cx="-2.2" cy="-1.6" rx="1.1" ry="1.7" fill="#14081f" />
            <ellipse cx="2.2" cy="-1.6" rx="1.1" ry="1.7" fill="#14081f" />
            <ellipse cx="0" cy="3" rx="1" ry="1.5" fill="#14081f" />
            <path d="M-5 -10 L-5 -14.5 L-2.5 -12 L0 -16 L2.5 -12 L5 -14.5 L5 -10 Z" fill="#ffb02e" />
            <path d="M0 -15 C-2.5 -18 -1.5 -21 0 -24 C1.5 -21 2.5 -18 0 -15 Z" fill={ref('fire')} className="vg-flick" />
          </g>
        </g>
      </svg>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  Animation — أنميشن ملء الشاشة (Canvas)
// ═══════════════════════════════════════════════════════════════════════
interface Pt {
  k: 0 | 1 | 2 | 5;            // 0 نار، 1 قنبلة بركانية، 2 جمرة، 5 شرارة شبحية
  x: number; y: number; px: number; py: number; vx: number; vy: number;
  size: number; grow: number; life: number; age: number;
  grav: number; drag: number; wind: number; seed: number; stuck: number; trail: number;
}
interface Smoke { x: number; y: number; vx: number; vy: number; size: number; grow: number; life: number; age: number; }
interface Ash { x: number; y: number; vx: number; vy: number; size: number; age: number; life: number; }
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

// وضع الرفع: الهدية لمتحدث (مو لصاحب البث) → صورته تصعد لمنتصف البث والشبح يلبسه التاج
// معلومات المستلم يحطها LiveCoinsDock في window.__stooornaGiftLift (تشتغل حتى لو صورته مو ظاهرة بالقائمة الجانبية)
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
    const R = Math.max(40, Math.min(64, W * 0.16));
    const ex = W * 0.5;
    const ey = H * 0.44;                       // منتصف البث
    let el: HTMLElement | null = null;
    try { el = document.querySelector<HTMLElement>(`[data-gift-user="${String(info.userId).replace(/["\\]/g, '')}"]`); } catch { /* ignore */ }
    const r = el ? el.getBoundingClientRect() : null;
    const hasEl = !!(el && r && r.width > 0 && r.height > 0);
    const sx = hasEl ? r!.left + r!.width / 2 : W - 52;     // نقطة البداية: مكان صورته بالقائمة، وإلا من يمين الشاشة
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

function VolcanoAnimation({ onDone }: { onDone: () => void }) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const cvRef = useRef<HTMLCanvasElement>(null);

  const [{ W, H }] = useState(() => ({
    W: typeof window !== 'undefined' ? window.innerWidth : 360,
    H: typeof window !== 'undefined' ? window.innerHeight : 640,
  }));

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const c = cv.getContext('2d');
    if (!c) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);

    const k = Math.max(0.75, H / 700);

    // تحميل صورة المستلم مسبقاً (لو الهدية لمتحدث)
    let liftPre: HTMLImageElement | null = null;
    const liftInfo0 = getLiftInfo();
    if (liftInfo0 && liftInfo0.avatarUrl) {
      try { liftPre = new Image(); liftPre.src = String(liftInfo0.avatarUrl); } catch { liftPre = null; }
    }

    // ── السبرايتات (توهج جاهز بدل بناء gradient لكل جسيمة) ──
    const FIRE = FIRE_RGB.map(rgb => makeSprite(rgb, 0.3));
    const GHOSTS = GHOST_RGB.map(rgb => makeSprite(rgb, 0.3));
    const SMOKE = makeSprite('62,52,50', 0.15);
    const blob = (sp: HTMLCanvasElement, x: number, y: number, r: number, a: number) => {
      if (a <= 0.003 || r <= 0.2) return;
      c.globalAlpha = Math.min(1, a);
      c.drawImage(sp, x - r, y - r, r * 2, r * 2);
    };

    // ── هندسة البركان ──
    const cx = W * 0.5;
    const craterY0 = H * 0.6;
    const vh = H * 1.08 - craterY0;
    const cw = Math.max(34, W * 0.1);
    const bw = Math.max(W * 0.95, 260);
    const NJ = 40;
    const flankL: [number, number][] = [];
    const flankR: [number, number][] = [];
    for (let i = 0; i <= NJ; i++) {
      const tt = i / NJ;
      const d = Math.pow(tt, 0.55);
      const edge = i > 0 && i < NJ ? 1 : 0;
      flankL.push([-(cw + (bw - cw) * tt + (Math.random() - 0.5) * 16 * k * edge), d * vh]);
      flankR.push([cw + (bw - cw) * tt + (Math.random() - 0.5) * 16 * k * edge, d * vh]);
    }
    const halfW = (d: number) => cw + (bw - cw) * Math.pow(clamp01(d), 1.818);
    const rivers = Array.from({ length: 8 }, (_, i) => ({
      side: i % 2 ? 1 : -1,
      f0: rnd(0.55, 0.95),
      f1: rnd(0.35, 0.9),
      ph: rnd(0, 6.28),
      len: rnd(0.55, 1.0),
      delay: rnd(0, 1.6),
      wid: rnd(2.5, 6) * k,
    }));
    const ridges = Array.from({ length: 7 }, () => ({ side: Math.random() < 0.5 ? -1 : 1, f: rnd(0.2, 0.95), len: rnd(0.4, 0.9) }));

    // ── حالة ──
    const fx: Pt[] = [];
    const smokes: Smoke[] = [];
    const ashes: Ash[] = [];
    const streaks: Streak[] = [];
    const rings: Ring[] = [];
    let hot: Hot[] = [];
    let hotAt = -9;
    const acc = { fire: 0, ember: 0, sky: 0, bomb: 0, smoke: 0, ash: 0, streak: 0, ground: 0, crown: 0, ghost: 0 };
    let blasted = false;
    let ghostPuff = false;
    let crownLit = false;
    let crownGone = false;
    let host: Host | null = null;
    let nextPulse = ERUPT_AT + 2.2;
    let flash2 = 0;
    let bolt: { segs: number[][]; born: number } | null = null;
    let boltIdx = 0;
    let lastGX = 0;
    let lean = 0;
    let q = 1;       // معامل الجودة (1 = كامل)
    let emaDt = 0.016;

    const spawn = (kind: Pt['k'], x: number, y: number, vx: number, vy: number, size: number, life: number, o: Partial<Pt> = {}) => {
      if (fx.length >= MAX_FX && kind !== 1) return;
      fx.push({
        k: kind, x, y, px: x, py: y, vx, vy, size, grow: 0, life, age: 0,
        grav: 0, drag: 0, wind: 0, seed: Math.random() * 6.28, stuck: 0, trail: 0, ...o,
      });
    };
    const addSmoke = (x: number, y: number, vx: number, vy: number, size: number, life: number) => {
      if (smokes.length < 130) smokes.push({ x, y, vx, vy, size, grow: rnd(2, 3.2), life, age: 0 });
    };

    // ── الدوال المساعدة ──
    const erupt = (t: number) => {
      if (t < ERUPT_AT) return 0;
      const up = smooth((t - ERUPT_AT) / 0.5);
      const down = 1 - smooth((t - ERUPT_HOLD_END) / (ERUPT_END - ERUPT_HOLD_END));
      return up * down * (0.88 + 0.12 * Math.sin(t * 2.1));
    };
    const lavaHeat = (t: number) => smooth((t - ERUPT_AT) / 1.2) * (1 - 0.7 * smooth((t - ERUPT_END) / 3));
    const windX = (t: number) => {
      const env = smooth(t / 1.2) * (1 - 0.6 * smooth((t - ERUPT_AT) / 1)) * (1 - smooth((t - 15) / 3));
      return 160 * k * env * (0.75 + 0.3 * Math.sin(t * 0.9) + 0.35 * Math.sin(t * 2.3 + 1));
    };
    const shakeAmp = (t: number) => {
      let a = 0;
      if (t >= RUMBLE_AT) a = 1.2 * smooth((t - RUMBLE_AT) / 1.2);
      if (t >= RISE_AT) a = 2.5 + 3 * smooth((t - RISE_AT) / RISE_S);
      if (t >= ERUPT_AT) a = 2 + 14 * Math.exp(-(t - ERUPT_AT) * 2.2) + 1.6 * erupt(t);
      return a * k * (1 - smooth((t - ERUPT_END) / 1.5));
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

    const hole = (x: number, y: number, r: number, a: number) => {
      if (a <= 0.01 || r < 2) return;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${Math.min(1, a)})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    };

    const makeBolt = (x0: number, y0: number, x1: number, y1: number, disp: number, depth: number, out: number[][]) => {
      if (depth === 0) { out.push([x0, y0, x1, y1]); return; }
      const mx = (x0 + x1) / 2 + (Math.random() - 0.5) * disp;
      const my = (y0 + y1) / 2 + (Math.random() - 0.5) * disp;
      makeBolt(x0, y0, mx, my, disp / 2, depth - 1, out);
      makeBolt(mx, my, x1, y1, disp / 2, depth - 1, out);
      if (depth > 2 && Math.random() < 0.28) makeBolt(mx, my, mx + (Math.random() - 0.5) * disp * 3, my + Math.random() * disp * 2, disp / 2, depth - 2, out);
    };

    // ── انفجارات ──
    const craterNow = { x: cx, y: craterY0 };
    const blast = (big: boolean) => {
      const nF = big ? 150 : 70;
      for (let i = 0; i < nF; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * (big ? 1.6 : 1.1);
        const sp = rnd(400, big ? 1300 : 900) * k;
        spawn(0, craterNow.x + rnd(-0.5, 0.5) * cw, craterNow.y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(14, 34) * k, rnd(0.9, 2), { grow: -0.4, grav: 500 * k, drag: 0.6, wind: 0.2 });
      }
      const nB = big ? 16 : 5;
      for (let i = 0; i < nB; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.1;
        const sp = rnd(700, 1500) * k;
        spawn(1, craterNow.x + rnd(-0.4, 0.4) * cw, craterNow.y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(7, 16) * k, 5, { grav: 880 * k, drag: 0.04, wind: 0.02 });
      }
      const nE = big ? 90 : 30;
      for (let i = 0; i < nE; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
        const sp = rnd(500, 1400) * k;
        spawn(2, craterNow.x + rnd(-0.5, 0.5) * cw, craterNow.y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(1.6, 3.6) * k, rnd(3.5, 6), { grav: 420 * k, drag: 0.35, wind: 0.5 });
      }
      for (let i = 0; i < (big ? 14 : 4); i++) addSmoke(craterNow.x + rnd(-1, 1) * cw * 0.8, craterNow.y, rnd(-40, 40), -rnd(120, 280) * k, rnd(26, 56) * k, rnd(4, 7));
    };

    const stopSound = playVolcanoSound({
      windEnd: WIND_END,
      rumbleAt: RUMBLE_AT,
      riseAt: RISE_AT,
      eruptAt: ERUPT_AT,
      eruptFadeAt: ERUPT_HOLD_END,
      eruptEnd: ERUPT_END,
      ghostAt: GHOST_AT,
      ghostArriveAt: GHOST_ARRIVE,
      crownAt: CROWN_ON,
      crownEndAt: CROWN_OFF,
      lightningTimes: LIGHTNING_TIMES,
    });

    // ── الشبح والتاج ──
    const ghostH = Math.max(110, Math.min(190, H * 0.19));
    const gsc = ghostH / 120; // بكسل لكل وحدة محلية
    let gp: { p1: [number, number]; p2: [number, number]; p3: [number, number]; headX: number; headY: number; headW: number } | null = null;

    const drawCrown = (x: number, y: number, w: number, alpha: number, rot: number) => {
      const h = w * 0.46;
      const tips = [0.85, 1.0, 1.25, 1.0, 0.85];
      c.save();
      c.translate(x, y);
      c.rotate(rot);
      c.globalAlpha = alpha;
      c.beginPath();
      c.moveTo(-w / 2, 0);
      for (let i = 0; i < 5; i++) {
        const tx = -w / 2 + (i * w) / 4;
        c.lineTo(tx, -tips[i] * h);
        if (i < 4) c.lineTo(tx + w / 8, -0.45 * h);
      }
      c.lineTo(w / 2, 0);
      c.closePath();
      const gr = c.createLinearGradient(0, -h * 1.25, 0, 0);
      gr.addColorStop(0, '#fff2b0');
      gr.addColorStop(0.35, '#ffc23a');
      gr.addColorStop(0.75, '#ff7a14');
      gr.addColorStop(1, '#b12a00');
      c.fillStyle = gr;
      c.fill();
      c.lineWidth = Math.max(1, w * 0.03);
      c.strokeStyle = 'rgba(120,30,0,0.85)';
      c.stroke();
      const bd = c.createLinearGradient(0, -h * 0.22, 0, 0);
      bd.addColorStop(0, '#ffd66b');
      bd.addColorStop(1, '#a23300');
      c.fillStyle = bd;
      c.fillRect(-w / 2, -h * 0.22, w, h * 0.22);
      c.fillStyle = '#ff3b3b';
      [-0.3, 0, 0.3].forEach(jx => { c.beginPath(); c.arc(w * jx, -h * 0.11, Math.max(1.2, w * 0.035), 0, Math.PI * 2); c.fill(); });
      c.restore();
    };

    const drawGhost = (x: number, y: number, s: number, alpha: number, ang: number, time: number, near: number) => {
      c.save();
      c.translate(x, y);
      c.rotate(ang);
      c.scale(s, s);
      c.globalCompositeOperation = 'lighter';
      blob(GHOSTS[2], 0, -4, 92, alpha * 0.55);
      blob(GHOSTS[1], 0, -22, 54, alpha * 0.4);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = alpha;
      c.beginPath();
      c.moveTo(-26, -24);
      c.bezierCurveTo(-26, -66, 26, -66, 26, -24);
      c.bezierCurveTo(30, -2, 34, 28, 36, 56);
      for (let hx = 36; hx >= -36; hx -= 6) c.lineTo(hx, 56 + Math.sin(hx * 0.3 + time * 6) * 6 + Math.abs(Math.sin(hx * 0.18)) * 10);
      c.bezierCurveTo(-34, 28, -30, -2, -26, -24);
      c.closePath();
      const gr = c.createLinearGradient(0, -66, 0, 66);
      gr.addColorStop(0, 'rgba(244,252,255,0.96)');
      gr.addColorStop(0.55, 'rgba(188,216,245,0.78)');
      gr.addColorStop(1, 'rgba(120,160,230,0.08)');
      c.fillStyle = gr;
      c.fill();
      // إضاءة الحمم من تحت
      c.globalCompositeOperation = 'lighter';
      blob(FIRE[3], 0, 34, 70, alpha * 0.35 * near);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = alpha;
      c.fillStyle = 'rgba(8,4,16,0.92)';
      c.beginPath(); c.ellipse(-10, -34, 6, 9.5, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(10, -34, 6, 9.5, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(0, -13, 5, 7 + Math.sin(time * 5) * 1.6, 0, 0, Math.PI * 2); c.fill();
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = '#ffa63a';
      c.beginPath(); c.arc(-10, -33, 2.3, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(10, -33, 2.3, 0, Math.PI * 2); c.fill();
      c.restore();
    };

    // ── الحلقة الرئيسية ──
    let raf = 0;
    const start = performance.now();
    let last = start;

    const frame = (now: number) => {
      const t = (now - start) / 1000;
      const raw = (now - last) / 1000;
      const dt = Math.min(0.033, raw);
      last = now;
      // حماية الأداء: لو الجهاز بطيء نخفف عدد الجسيمات تلقائياً
      emaDt += (raw - emaDt) * 0.05;
      if (emaDt > 0.036) q = Math.max(0.45, q - 0.015);
      else if (emaDt < 0.024) q = Math.min(1, q + 0.008);
      const endFade = t > TOTAL_S - 0.5 ? clamp01((TOTAL_S - t) / 0.5) : 1;
      cv.style.opacity = String(endFade);

      const e = erupt(t);
      const wx = windX(t);
      const lh = lavaHeat(t);
      const pre = smooth((t - RUMBLE_AT) / 2.4) * (1 - smooth((t - ERUPT_AT) / 0.3));
      const rise = easeOut((t - RISE_AT) / RISE_S);
      const sink = smooth((t - SINK_AT) / 2);
      const yOff = vh * 1.02 * (1 - rise) + vh * 1.02 * sink;
      const craterY = craterY0 + yOff;
      craterNow.x = cx;
      craterNow.y = craterY;
      const volcanoVisible = yOff < vh * 1.0;
      const sa = shakeAmp(t);
      const shx = sa * (Math.sin(t * 61) * 0.6 + Math.sin(t * 37 + 1) * 0.4);
      const shy = sa * (Math.sin(t * 53 + 2) * 0.6 + Math.sin(t * 29) * 0.4) * 0.7;

      // ── أحداث لمرة وحدة ──
      if (!blasted && t >= ERUPT_AT) {
        blasted = true;
        blast(true);
        rings.push({ x: cx, y: craterY, born: t, dur: 1.2, maxR: W * 1.5, w: 7 });
        rings.push({ x: cx, y: craterY, born: t + 0.15, dur: 1.5, maxR: W * 1.9, w: 4 });
        flash2 = 1;
      }
      if (t >= ERUPT_AT && t < ERUPT_HOLD_END && t >= nextPulse) {
        nextPulse = t + rnd(1.6, 2.8);
        blast(false);
        rings.push({ x: cx, y: craterY, born: t, dur: 0.9, maxR: W * 0.9, w: 3 });
        flash2 = Math.max(flash2, 0.35);
      }
      if (t >= LIGHTNING_TIMES[boltIdx] && boltIdx < LIGHTNING_TIMES.length) {
        boltIdx++;
        const segs: number[][] = [];
        const bx = cx + rnd(-1, 1) * cw * 2;
        makeBolt(bx, craterY - H * 0.36, bx + rnd(-0.35, 0.35) * W, craterY - H * 0.1, H * 0.12, 5, segs);
        bolt = { segs, born: t };
      }

      // ── تحديث مواضع الأزرار (للنار اللي تنزل عليها) ──
      if (t >= ERUPT_AT - 0.5 && t - hotAt > 0.45) { hot = collectHot(hot); hotAt = t; }
      for (const h of hot) h.heat = Math.max(0, h.heat - dt * 0.4);

      // ── الإصدار (Emitters) ──
      // شرر يتسرب من الأرض قبل الانفجار
      if (t >= RUMBLE_AT && t < ERUPT_AT) {
        acc.ground += dt * 34 * pre * q;
        while (acc.ground >= 1) {
          acc.ground--;
          spawn(2, cx + rnd(-0.45, 0.45) * W, H + 4, rnd(-30, 30), -rnd(120, 340) * k, rnd(1.4, 2.8) * k, rnd(1, 2), { grav: 260 * k, drag: 0.4, wind: 0.4 });
        }
      }
      if (e > 0) {
        // نافورة النار
        acc.fire += dt * 230 * e * q;
        while (acc.fire >= 1) {
          acc.fire--;
          const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.9;
          const sp = rnd(380, 1000) * k;
          spawn(0, cx + rnd(-0.6, 0.6) * cw, craterY, Math.cos(a) * sp, Math.sin(a) * sp, rnd(14, 34) * k, rnd(0.9, 2), { grow: -0.4, grav: 500 * k, drag: 0.6, wind: 0.2 });
        }
        // جمرات من الفوهة
        acc.ember += dt * 70 * e * q;
        while (acc.ember >= 1) {
          acc.ember--;
          const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.1;
          const sp = rnd(500, 1400) * k;
          spawn(2, cx + rnd(-0.5, 0.5) * cw, craterY, Math.cos(a) * sp, Math.sin(a) * sp, rnd(1.6, 3.6) * k, rnd(3.5, 6), { grav: 420 * k, drag: 0.35, wind: 0.5 });
        }
        // مطر جمرات من السماء (ينزل على الأزرار)
        acc.sky += dt * 58 * e * q;
        while (acc.sky >= 1) {
          acc.sky--;
          spawn(2, rnd(-0.15, 1.05) * W, -10, rnd(-20, 40), rnd(60, 170) * k, rnd(1.8, 3.8) * k, rnd(6, 8), { grav: 120 * k, drag: 0.3, wind: 0.5 });
        }
        // قنابل بركانية
        acc.bomb += dt * 5.5 * e * q;
        while (acc.bomb >= 1) {
          acc.bomb--;
          const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
          const sp = rnd(700, 1500) * k;
          spawn(1, cx + rnd(-0.4, 0.4) * cw, craterY, Math.cos(a) * sp, Math.sin(a) * sp, rnd(7, 16) * k, 5, { grav: 880 * k, drag: 0.04, wind: 0.02 });
        }
        // رماد
        acc.ash += dt * 26 * e * q;
        while (acc.ash >= 1) {
          acc.ash--;
          ashes.push({ x: rnd(-0.1, 1.1) * W, y: -8, vx: rnd(-10, 30), vy: rnd(40, 90) * k, size: rnd(1, 2.2), age: 0, life: 8 });
        }
      }
      // دخان
      if (t >= ERUPT_AT) {
        acc.smoke += dt * (10 * e + 2 * (1 - smooth((t - 17.5) / 2)));
        while (acc.smoke >= 1) {
          acc.smoke--;
          addSmoke(cx + rnd(-0.8, 0.8) * cw, craterY, rnd(-30, 30), -rnd(110, 250) * k, rnd(26, 56) * k, rnd(4, 7));
        }
      }
      // رياح وغبار
      const wEnv = smooth(t / 1.2) * (1 - 0.5 * smooth((t - ERUPT_AT) / 1)) * (1 - smooth((t - 14.5) / 2));
      if (wEnv > 0.02) {
        acc.streak += dt * 20 * wEnv * q;
        while (acc.streak >= 1) {
          acc.streak--;
          streaks.push({ x: -rnd(40, 200), y: rnd(0, H), len: rnd(80, 240) * k, vx: rnd(700, 1600) * k, a: rnd(0.08, 0.3), w: rnd(0.6, 1.8), ph: rnd(0, 6.28) });
        }
      }

      // ═══ رسم ═══
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';

      // السواد
      const dk = DARK_MAX * smooth(t / DARK_IN) * (1 - smooth((t - LIGHT_BACK_AT) / (LIGHT_BACK_END - LIGHT_BACK_AT)));
      c.fillStyle = `rgba(2,1,5,${dk})`;
      c.fillRect(0, 0, W, H);

      // إضاءة من الحمم (نقص السواد حول الفوهة والجمرات)
      c.globalCompositeOperation = 'destination-out';
      const flick = 0.9 + 0.1 * Math.sin(t * 17) + 0.05 * Math.sin(t * 41);
      if (volcanoVisible) hole(cx, craterY, H * 0.5, 0.58 * Math.max(lh, pre * 0.5) * flick);
      if (pre > 0) hole(cx, H, W * 0.6, 0.35 * pre * flick);
      for (const h of hot) if (h.heat > 0.08) hole(h.x + h.w / 2, h.y + h.h / 2, 40 + Math.max(h.w, h.h) * 0.6, 0.7 * Math.min(1, h.heat));
      for (const p of fx) if (p.k === 1) hole(p.x, p.y, 70 * k, 0.22);
      c.globalCompositeOperation = 'source-over';

      // وميض الانفجار
      if (flash2 > 0.01) {
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = `rgba(255,214,150,${flash2 * 0.55})`;
        c.fillRect(0, 0, W, H);
        c.globalCompositeOperation = 'source-over';
        flash2 *= Math.exp(-dt * 5);
      }

      // خطوط الرياح
      if (streaks.length) {
        c.lineCap = 'round';
        for (let i = streaks.length - 1; i >= 0; i--) {
          const s = streaks[i];
          s.x += s.vx * dt;
          if (s.x - s.len > W) { streaks[i] = streaks[streaks.length - 1]; streaks.pop(); continue; }
          c.strokeStyle = `rgba(190,200,222,${s.a * wEnv})`;
          c.lineWidth = s.w;
          c.beginPath();
          c.moveTo(s.x - s.len, s.y + Math.sin(s.ph + t * 3) * 4);
          c.quadraticCurveTo(s.x - s.len * 0.5, s.y + Math.sin(s.ph + t * 3 + 1.5) * 9, s.x, s.y);
          c.stroke();
        }
      }

      c.save();
      c.translate(shx, shy);

      // توهج الأرض قبل الانفجار
      if (pre > 0.01) {
        c.globalCompositeOperation = 'lighter';
        blob(FIRE[4], cx, H + 10, W * 0.75, 0.35 * pre * flick);
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';
      }

      // ── البركان ──
      if (volcanoVisible) {
        c.save();
        c.translate(cx, craterY);
        c.beginPath();
        c.moveTo(-cw, 0);
        for (let i = 1; i <= NJ; i++) c.lineTo(flankL[i][0], flankL[i][1]);
        c.lineTo(bw + 30, vh);
        for (let i = NJ; i >= 0; i--) c.lineTo(flankR[i][0], flankR[i][1]);
        c.closePath();
        const rg = c.createLinearGradient(0, 0, 0, vh);
        rg.addColorStop(0, '#2c1710');
        rg.addColorStop(0.16, '#150a07');
        rg.addColorStop(0.55, 'rgba(8,4,3,0.88)');
        rg.addColorStop(1, 'rgba(4,2,2,0.4)');
        c.fillStyle = rg;
        c.fill();

        // تضاريس
        c.strokeStyle = 'rgba(0,0,0,0.45)';
        c.lineWidth = 2 * k;
        for (const r of ridges) {
          c.beginPath();
          for (let j = 0; j <= 10; j++) {
            const d = (j / 10) * r.len;
            const x = r.side * (cw * 0.8 + (halfW(d) - cw * 0.8) * r.f);
            if (j === 0) c.moveTo(x, d * vh); else c.lineTo(x, d * vh);
          }
          c.stroke();
        }

        // أنهار الحمم
        if (lh > 0.01) {
          c.globalCompositeOperation = 'lighter';
          c.lineCap = 'round';
          c.lineJoin = 'round';
          for (const r of rivers) {
            const reach = clamp01((t - ERUPT_AT - 0.2 - r.delay) / 3.8) * r.len;
            if (reach <= 0.01) continue;
            const pulse = 0.75 + 0.25 * Math.sin(t * 3 + r.ph);
            c.beginPath();
            for (let j = 0; j <= 28; j++) {
              const d = (j / 28) * reach;
              const x = r.side * (cw * r.f0 + (halfW(d) - cw) * r.f1) + Math.sin(d * 16 + r.ph) * 6 * k * d;
              if (j === 0) c.moveTo(x, d * vh); else c.lineTo(x, d * vh);
            }
            c.setLineDash([]);
            c.strokeStyle = `rgba(255,70,10,${0.32 * lh})`;
            c.lineWidth = r.wid * 2.6;
            c.stroke();
            c.strokeStyle = `rgba(255,140,30,${0.8 * lh * pulse})`;
            c.lineWidth = r.wid * 1.3;
            c.stroke();
            c.setLineDash([14 * k, 10 * k]);
            c.lineDashOffset = -t * 60;
            c.strokeStyle = `rgba(255,236,170,${0.85 * lh * pulse})`;
            c.lineWidth = r.wid * 0.5;
            c.stroke();
            c.setLineDash([]);
          }
          // حمم الفوهة
          c.save();
          c.scale(1, 0.26);
          const pg = c.createRadialGradient(0, 0, 0, 0, 0, cw * 1.15);
          pg.addColorStop(0, `rgba(255,246,200,${Math.min(1, lh * flick)})`);
          pg.addColorStop(0.4, `rgba(255,176,46,${0.9 * lh})`);
          pg.addColorStop(0.75, `rgba(255,90,16,${0.6 * lh})`);
          pg.addColorStop(1, 'rgba(120,20,0,0)');
          c.fillStyle = pg;
          c.beginPath();
          c.arc(0, 0, cw * 1.15, 0, Math.PI * 2);
          c.fill();
          c.restore();
          c.globalAlpha = 1;
          c.globalCompositeOperation = 'source-over';
        } else if (pre > 0.05 || rise > 0.02) {
          // شقوق متوهجة قبل الانفجار
          c.globalCompositeOperation = 'lighter';
          blob(FIRE[4], 0, 0, cw * 1.4, 0.5 * Math.max(pre, 0.2) * flick);
          c.globalAlpha = 1;
          c.globalCompositeOperation = 'source-over';
        }
        c.restore();

        // عمود الضوء فوق الفوهة
        if (e > 0.02) {
          c.globalCompositeOperation = 'lighter';
          blob(FIRE[3], cx, craterY - H * 0.08, H * 0.5, 0.2 * e * flick);
          c.globalAlpha = 1;
          c.globalCompositeOperation = 'source-over';
        }
      }

      // ── الدخان ──
      for (let i = smokes.length - 1; i >= 0; i--) {
        const s = smokes[i];
        s.age += dt;
        if (s.age >= s.life) { smokes[i] = smokes[smokes.length - 1]; smokes.pop(); continue; }
        s.vx += wx * 0.6 * dt;
        s.vy *= Math.exp(-0.3 * dt);
        s.x += s.vx * dt;
        s.y += s.vy * dt;
      }
      for (const s of smokes) {
        const u = s.age / s.life;
        blob(SMOKE, s.x, s.y, s.size * (1 + s.grow * u), Math.min(u / 0.12, 1) * (1 - u) * 0.55 * endFade);
      }
      c.globalAlpha = 1;
      // إضاءة الدخان القريب من الفوهة
      c.globalCompositeOperation = 'lighter';
      for (const s of smokes) {
        if (s.age < 2.4) blob(FIRE[4], s.x, s.y + s.size * 0.3, s.size * (1 + s.grow * (s.age / s.life)) * 0.9, 0.16 * (1 - s.age / 2.4) * Math.max(lh, 0.3));
      }
      c.globalAlpha = 1;

      // ── جسيمات النار / القنابل / الجمرات (additive) ──
      c.globalCompositeOperation = 'lighter';
      for (let i = fx.length - 1; i >= 0; i--) {
        const p = fx[i];
        p.age += dt;
        if (p.age >= p.life) { fx[i] = fx[fx.length - 1]; fx.pop(); continue; }
        const u = p.age / p.life;

        if (p.stuck > 0) {
          p.stuck -= dt;
          const fl = 0.7 + 0.3 * Math.sin(p.age * 38 + p.seed);
          blob(FIRE[2], p.x, p.y, p.size * 3.6 * fl, 0.7 * (1 - u * 0.5) * endFade);
          blob(FIRE[0], p.x, p.y, p.size * 1.4, 0.6 * endFade);
          continue;
        }

        p.px = p.x;
        p.py = p.y;
        p.vy += p.grav * dt;
        p.vx += wx * p.wind * dt;
        const dm = Math.exp(-p.drag * dt);
        p.vx *= dm;
        p.vy *= dm;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        if (p.y > H + 70 || p.x < -140 || p.x > W + 140 || (p.y < -400 && p.vy < 0)) { fx[i] = fx[fx.length - 1]; fx.pop(); continue; }

        // القنابل تترك ذيل نار
        if (p.k === 1) {
          p.trail += dt;
          while (p.trail > 0.03) {
            p.trail -= 0.03;
            spawn(0, p.x, p.y, rnd(-30, 30), rnd(-30, 30) - 20 * k, p.size * 0.95, rnd(0.5, 0.9), { grow: -0.5, grav: -40 * k, drag: 2 });
          }
        }

        // النزول على الأزرار
        let gone = false;
        if ((p.k === 1 || p.k === 2) && p.vy > 0 && p.age > 0.15) {
          for (const h of hot) {
            const top = topAt(h, p.x);
            if (top === null || !(p.py <= top + 1 && p.y >= top)) continue;
            if (p.k === 1) {
              h.heat = Math.min(1.3, h.heat + 0.9);
              for (let j = 0; j < 10; j++) spawn(2, p.x, top, rnd(-260, 260) * k, -rnd(80, 380) * k, rnd(1.4, 3) * k, rnd(0.6, 1.4), { grav: 700 * k, drag: 0.5 });
              fx[i] = fx[fx.length - 1];
              fx.pop();
              gone = true;
            } else {
              h.heat = Math.min(1.3, h.heat + 0.28);
              for (let j = 0; j < 3; j++) spawn(2, p.x, top, rnd(-90, 90) * k, -rnd(40, 160) * k, rnd(1, 1.8) * k, rnd(0.3, 0.7), { grav: 600 * k, drag: 0.6 });
              if (Math.random() < 0.4) {
                p.y = top - 1;
                p.vx = 0;
                p.vy = 0;
                p.stuck = rnd(0.5, 1.4);
                p.life = p.age + p.stuck;
              } else {
                p.y = top - 1;
                p.vy *= -0.3;
                p.vx *= 0.6;
              }
            }
            break;
          }
        }
        if (gone) continue;

        // الرسم
        if (p.k === 0) {
          const sz = p.size * (1 + p.grow * u);
          const idx = Math.min(6, Math.floor(Math.pow(u, 0.8) * 6.5));
          blob(FIRE[idx], p.x, p.y, sz, (1 - u) * 0.9 * endFade);
        } else if (p.k === 1) {
          const idx = 1 + Math.min(3, Math.floor(u * 4));
          blob(FIRE[idx], p.x, p.y, p.size * 2.4, 0.85 * endFade);
          blob(FIRE[0], p.x, p.y, p.size * 1.05, 0.95 * endFade);
        } else if (p.k === 2) {
          const fl = 0.6 + 0.4 * Math.sin(p.age * 30 + p.seed);
          const fade = u > 0.7 ? (1 - u) / 0.3 : 1;
          blob(FIRE[u > 0.6 ? 2 : 1], p.x, p.y, p.size * 3.2, 0.8 * fl * fade * endFade);
          blob(FIRE[0], p.x, p.y, p.size * 1.2, 0.9 * fade * endFade);
          const sp2 = Math.abs(p.vx) + Math.abs(p.vy);
          if (sp2 > 220) {
            c.globalAlpha = 0.6 * fade * endFade;
            c.strokeStyle = 'rgb(255,170,60)';
            c.lineWidth = Math.max(1, p.size * 0.7);
            c.beginPath();
            c.moveTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
            c.lineTo(p.x, p.y);
            c.stroke();
          }
        } else {
          const idx = Math.min(4, Math.floor(u * 4.5));
          blob(GHOSTS[idx], p.x, p.y, p.size * (1 + p.grow * u), (1 - u) * 0.9 * endFade);
        }
      }
      c.globalAlpha = 1;

      // ── سخونة الأزرار: ألسنة نار + توهج ──
      for (const h of hot) {
        if (h.heat > 0.45 && Math.random() < dt * 22 * h.heat) {
          const lx = h.x + rnd(0.12, 0.88) * h.w;
          const top = topAt(h, lx);
          if (top !== null) spawn(0, lx, top, rnd(-12, 12), -rnd(40, 100) * k, rnd(5, 10) * k, rnd(0.35, 0.7), { grow: -0.5, grav: -70 * k, drag: 1.6 });
        }
      }
      for (const h of hot) {
        if (h.heat < 0.03) continue;
        const a = Math.min(1, h.heat) * endFade;
        rrPath(h.x, h.y, h.w, h.h, h.rad);
        c.fillStyle = `rgba(255,90,20,${0.16 * a})`;
        c.fill();
        c.lineWidth = 2;
        c.strokeStyle = `rgba(255,${Math.round(120 + 60 * (1 - a))},40,${0.85 * a})`;
        c.shadowColor = 'rgba(255,100,20,0.9)';
        c.shadowBlur = 12 * a;
        c.stroke();
        c.shadowBlur = 0;
      }

      // ── موجات الصدمة ──
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        const u = (t - r.born) / r.dur;
        if (u >= 1) { rings.splice(i, 1); continue; }
        if (u < 0) continue;
        const rr = easeOut(u) * r.maxR;
        c.strokeStyle = `rgba(255,205,130,${(1 - u) * 0.65})`;
        c.lineWidth = r.w * (1 - u) + 1;
        c.beginPath();
        c.ellipse(r.x, r.y, rr, rr * 0.3, 0, 0, Math.PI * 2);
        c.stroke();
      }

      // ── الصاعقة ──
      if (bolt) {
        const u = (t - bolt.born) / 0.28;
        if (u >= 1) bolt = null;
        else {
          const fl = Math.random() < 0.3 ? 0.5 : 1;
          const a = (1 - u) * fl * endFade;
          c.lineCap = 'round';
          c.strokeStyle = `rgba(150,170,255,${0.45 * a})`;
          c.lineWidth = 7 * k;
          c.beginPath();
          bolt.segs.forEach(s => { c.moveTo(s[0], s[1]); c.lineTo(s[2], s[3]); });
          c.stroke();
          c.strokeStyle = `rgba(245,248,255,${a})`;
          c.lineWidth = 2.2 * k;
          c.beginPath();
          bolt.segs.forEach(s => { c.moveTo(s[0], s[1]); c.lineTo(s[2], s[3]); });
          c.stroke();
          c.fillStyle = `rgba(190,200,255,${0.1 * a})`;
          c.fillRect(0, 0, W, H);
        }
      }
      c.globalCompositeOperation = 'source-over';

      // ── الرماد ──
      c.fillStyle = 'rgba(205,195,190,0.5)';
      for (let i = ashes.length - 1; i >= 0; i--) {
        const a = ashes[i];
        a.age += dt;
        if (a.age >= a.life || a.y > H + 10) { ashes[i] = ashes[ashes.length - 1]; ashes.pop(); continue; }
        a.vx += wx * 0.4 * dt;
        a.x += a.vx * dt;
        a.y += a.vy * dt;
        c.globalAlpha = 0.5 * endFade;
        c.fillRect(a.x, a.y, a.size, a.size);
      }
      c.globalAlpha = 1;

      // ═══ الشبح + التاج ═══
      if (!host && t >= GHOST_AT - 1.3) {
        const lf = findLift(W, H, liftPre);
        if (lf) host = lf;
        else if (t >= GHOST_AT - 0.3) host = findHost(W);
      }
      if (host && !gp) {
        const dir = host.x < W * 0.5 ? 1 : -1;
        const hoverX = Math.min(Math.max(host.x + dir * (host.w / 2 + 38 * gsc), 40 * gsc), W - 40 * gsc);
        const hoverY = Math.min(Math.max(host.y + 20 * gsc, 100 * gsc + 4), H * 0.5);
        const headW = Math.min(Math.max(host.w * 0.95, 38), 92);
        const headY = Math.max(host.top + host.h * 0.16, headW * 0.46 * 1.3 + 4);
        gp = {
          p1: [cx - dir * W * 0.35, craterY0 - H * 0.3],
          p2: [hoverX + dir * W * 0.25, hoverY + H * 0.3],
          p3: [hoverX, hoverY],
          headX: host.x,
          headY,
          headW,
        };
      }

      // ── صورة المتحدث تصعد للأعلى (هدية صاحب البث للمتحدث) ──
      if (host && host.lift) {
        const L = host.lift;
        const up = easeOut((t - (GHOST_AT - 1.0)) / 1.5);
        const down = smooth((t - (CROWN_OFF + CROWN_FADE)) / 0.9);
        const e2 = up * (1 - down);
        if (down >= 1 && !L.done) { L.done = true; L.restore(); }
        if (e2 > 0.004) {
          const ax = lerp(L.sx, L.ex, e2);
          const ay = lerp(L.sy, L.ey, e2) + Math.sin(t * 2.6) * 3 * k * e2;
          const ar = lerp(L.sr, L.R, e2);
          c.save();
          c.globalCompositeOperation = 'lighter';
          blob(FIRE[3], ax, ay, ar * 2.4, 0.38 * e2 * endFade);
          c.restore();
          c.save();
          c.globalAlpha = clamp01(e2 * 3) * endFade;
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
            c.fillStyle = '#12363a';
            c.fillRect(ax - ar, ay - ar, ar * 2, ar * 2);
            c.fillStyle = '#00BCD4';
            c.font = `800 ${Math.round(ar * 1.0)}px sans-serif`;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(L.letter, ax, ay + ar * 0.04);
          }
          c.restore();
          c.beginPath();
          c.arc(ax, ay, ar, 0, Math.PI * 2);
          c.lineWidth = Math.max(2, ar * 0.07);
          c.strokeStyle = 'rgba(255,190,70,0.95)';
          c.shadowColor = 'rgba(255,120,20,0.9)';
          c.shadowBlur = 14 * e2;
          c.stroke();
          c.restore();
          // اسم المستلم تحت الصورة
          if (e2 > 0.5) {
            c.save();
            c.globalAlpha = clamp01((e2 - 0.5) * 2) * endFade;
            c.font = `800 ${Math.round(Math.max(12, ar * 0.3))}px sans-serif`;
            c.textAlign = 'center';
            c.textBaseline = 'top';
            c.shadowColor = 'rgba(0,0,0,0.9)';
            c.shadowBlur = 6;
            c.fillStyle = '#fff4d6';
            c.fillText(L.name.length > 18 ? L.name.slice(0, 17) + '…' : L.name, ax, ay + ar + 8 * k);
            c.restore();
          }
          c.globalAlpha = 1;
        }
      }

      if (gp && t >= GHOST_AT && t < CROWN_ON + 1.1) {
        if (!ghostPuff) {
          ghostPuff = true;
          for (let i = 0; i < 40; i++) spawn(5, cx + rnd(-0.5, 0.5) * cw, craterY0, rnd(-120, 120) * k, -rnd(80, 360) * k, rnd(6, 14) * k, rnd(0.8, 1.6), { grow: -0.3, drag: 1.2 });
          for (let i = 0; i < 6; i++) addSmoke(cx + rnd(-0.5, 0.5) * cw, craterY0, rnd(-30, 30), -rnd(120, 260) * k, rnd(30, 60) * k, rnd(3, 5));
          rings.push({ x: cx, y: craterY0, born: t, dur: 0.9, maxR: W * 0.7, w: 3 });
        }
        const u = clamp01((t - GHOST_AT) / (GHOST_ARRIVE - GHOST_AT));
        const s = smooth(u);
        const a1 = 1 - s;
        const P0: [number, number] = [cx, craterY0 - 10 * k];
        let gx = a1 * a1 * a1 * P0[0] + 3 * a1 * a1 * s * gp.p1[0] + 3 * a1 * s * s * gp.p2[0] + s * s * s * gp.p3[0];
        let gy = a1 * a1 * a1 * P0[1] + 3 * a1 * a1 * s * gp.p1[1] + 3 * a1 * s * s * gp.p2[1] + s * s * s * gp.p3[1];
        gx += Math.sin(t * 3.1) * 9 * k * (1 - s * 0.7);
        gy += Math.cos(t * 2.3) * 7 * k * (1 - s * 0.7) + (u >= 1 ? Math.sin(t * 3) * 4 * k : 0);
        const dissolve = smooth((t - CROWN_ON) / 0.9);
        gy -= dissolve * 24 * k;
        const emerge = smooth((t - GHOST_AT) / 0.8);
        const gScale = lerp(0.25, 1, easeOut((t - GHOST_AT) / 0.9)) * (1 + dissolve * 0.08);
        const gAlpha = emerge * (1 - dissolve) * 0.92 * endFade;
        const sc = gsc * gScale;

        lean += (clamp01(Math.abs(gx - lastGX) / (dt * 900 + 1e-6)) * Math.sign(gx - lastGX) * 0.45 - lean) * 0.12;
        lastGX = gx;
        const near = clamp01(1 - (craterY - gy) / (H * 0.5)) * lh;

        // أثر الشبح
        acc.ghost += dt * 60 * (1 - dissolve * 0.5);
        while (acc.ghost >= 1) {
          acc.ghost--;
          spawn(5, gx + rnd(-12, 12) * sc, gy + rnd(0, 44) * sc, rnd(-20, 20), rnd(10, 60), rnd(5, 11) * sc, rnd(0.6, 1.5), { grow: -0.3, drag: 1 });
          if (Math.random() < 0.3) spawn(0, gx + rnd(-10, 10) * sc, gy + rnd(10, 50) * sc, rnd(-15, 15), -rnd(10, 50) * k, rnd(5, 10) * sc, rnd(0.5, 0.9), { grow: -0.5, grav: -50 * k, drag: 1.4 });
        }
        // موضع التاج
        const heldX = gx;
        const heldY = gy - 74 * sc;
        const heldW = 38 * sc;
        let crX = heldX, crY = heldY, crW = heldW, crAlpha = 0, crRot = Math.sin(t * 2) * 0.08;
        if (t >= GHOST_AT + 0.5 && t < CROWN_TOSS) {
          crAlpha = smooth((t - GHOST_AT - 0.5) / 0.5);
        } else if (t >= CROWN_TOSS && t < CROWN_ON) {
          const ue = easeOut((t - CROWN_TOSS) / (CROWN_ON - CROWN_TOSS));
          crX = lerp(heldX, gp.headX, ue);
          crY = lerp(heldY, gp.headY, ue) - Math.sin(Math.PI * ue) * 40 * k;
          crW = lerp(heldW, gp.headW, ue);
          crAlpha = 1;
          crRot = lerp(crRot, -0.1, ue);
        }
        crY = Math.max(crY, crW * 0.6 + 4);
        if (crAlpha > 0.01 && t < CROWN_ON) {
          // الذراعين (من الكتفين للتاج)
          const sh = (sx: number) => {
            const cs = Math.cos(lean), sn = Math.sin(lean);
            return { x: gx + (sx * cs + 8 * sn) * sc, y: gy + (sx * sn - 8 * cs) * sc };
          };
          const toss = clamp01((t - CROWN_TOSS) / (CROWN_ON - CROWN_TOSS));
          const reach = 0.55 * Math.sin(Math.PI * toss);
          [-1, 1].forEach(sd => {
            const S = sh(sd * 24);
            const hx0 = heldX + sd * heldW * 0.4;
            const hy0 = heldY + heldW * 0.1;
            const hx = lerp(hx0, crX + sd * crW * 0.4, reach);
            const hy = lerp(hy0, crY, reach);
            c.globalAlpha = gAlpha * 0.75;
            c.strokeStyle = 'rgba(225,240,255,1)';
            c.lineCap = 'round';
            c.lineWidth = 9 * sc;
            c.beginPath();
            c.moveTo(S.x, S.y);
            c.quadraticCurveTo(S.x + sd * 16 * sc, (S.y + hy) / 2, hx, hy);
            c.stroke();
            c.fillStyle = 'rgba(235,246,255,1)';
            c.beginPath();
            c.arc(hx, hy, 6 * sc, 0, Math.PI * 2);
            c.fill();
          });
          c.globalAlpha = 1;
        }

        drawGhost(gx, gy, sc, gAlpha, lean, t, near);

        // هالة ونور حول الشبح
        c.save();
        c.globalCompositeOperation = 'lighter';
        blob(GHOSTS[2], gx, gy, 120 * sc, 0.25 * gAlpha);
        c.restore();
        c.globalAlpha = 1;

        // التاج الممسوك/الطائر
        if (crAlpha > 0.01 && t < CROWN_ON) {
          c.save();
          c.globalCompositeOperation = 'lighter';
          blob(FIRE[3], crX, crY - crW * 0.3, crW * 1.5, 0.55 * crAlpha * (0.8 + 0.2 * Math.sin(t * 20)));
          c.restore();
          c.globalAlpha = 1;
          drawCrown(crX, crY, crW, crAlpha * endFade, crRot);
          acc.crown += dt * 70 * crAlpha;
          while (acc.crown >= 1) {
            acc.crown--;
            const i = Math.floor(Math.random() * 5);
            const tipH = [0.85, 1.0, 1.25, 1.0, 0.85][i] * crW * 0.46;
            spawn(0, crX + (-crW / 2 + (i * crW) / 4), crY - tipH, rnd(-14, 14), -rnd(70, 150) * k, rnd(5, 9) * (crW / 50), rnd(0.35, 0.7), { grow: -0.6, grav: -80 * k, drag: 1.5 });
          }
        }
      }

      // ── التاج على راس صاحب البث (ثانيتين بالضبط) ──
      if (gp && t >= CROWN_ON && t < CROWN_OFF + CROWN_FADE) {
        if (!crownLit) {
          crownLit = true;
          for (let i = 0; i < 40; i++) {
            const a = rnd(0, Math.PI * 2);
            const sp = rnd(120, 520) * k;
            spawn(i % 2 ? 0 : 2, gp.headX, gp.headY - gp.headW * 0.25, Math.cos(a) * sp, Math.sin(a) * sp - 60 * k, rnd(3, 8) * k, rnd(0.5, 1.1), { grow: -0.4, grav: i % 2 ? -40 * k : 500 * k, drag: 1.6 });
          }
          rings.push({ x: gp.headX, y: gp.headY - gp.headW * 0.2, born: t, dur: 0.6, maxR: gp.headW * 2.4, w: 4 });
        }
        const off = clamp01((t - CROWN_OFF) / CROWN_FADE);
        if (off > 0 && !crownGone) {
          crownGone = true;
          for (let i = 0; i < 60; i++) {
            const a = rnd(0, Math.PI * 2);
            const sp = rnd(160, 640) * k;
            spawn(i % 3 ? 2 : 0, gp.headX, gp.headY - gp.headW * 0.3, Math.cos(a) * sp, Math.sin(a) * sp - 80 * k, rnd(3, 9) * k, rnd(0.5, 1.2), { grow: -0.4, grav: i % 3 ? 450 * k : -30 * k, drag: 1.4 });
          }
          rings.push({ x: gp.headX, y: gp.headY - gp.headW * 0.2, born: t, dur: 0.7, maxR: gp.headW * 3, w: 4 });
        }
        const pop = 1 + 0.3 * Math.exp(-(t - CROWN_ON) * 9);
        const cw2 = gp.headW * pop * (1 + off * 0.25);
        const al = (1 - off) * endFade;
        const wob = Math.sin(t * 9) * 0.03;

        // نور التاج على الشاشة
        c.save();
        c.globalCompositeOperation = 'destination-out';
        hole(gp.headX, gp.headY - cw2 * 0.3, cw2 * 3.2, 0.75 * al);
        c.globalCompositeOperation = 'lighter';
        blob(FIRE[3], gp.headX, gp.headY - cw2 * 0.35, cw2 * 1.9, 0.5 * al * (0.8 + 0.2 * Math.sin(t * 22)));
        blob(FIRE[1], gp.headX, gp.headY - cw2 * 0.25, cw2 * 1.0, 0.45 * al);
        c.restore();
        c.globalAlpha = 1;

        drawCrown(gp.headX, gp.headY, cw2, al, -0.04 + wob);

        // ألسنة لهب التاج
        acc.crown += dt * 150 * al;
        while (acc.crown >= 1) {
          acc.crown--;
          const i = Math.floor(Math.random() * 5);
          const tipH = [0.85, 1.0, 1.25, 1.0, 0.85][i] * cw2 * 0.46;
          const tx = gp.headX + (-cw2 / 2 + (i * cw2) / 4);
          spawn(0, tx, gp.headY - tipH, rnd(-16, 16), -rnd(80, 190) * k, rnd(6, 12) * (cw2 / 50), rnd(0.35, 0.75), { grow: -0.6, grav: -90 * k, drag: 1.5 });
          if (Math.random() < 0.25) spawn(2, tx, gp.headY - tipH, rnd(-40, 40), -rnd(100, 220) * k, rnd(1.2, 2.2) * k, rnd(0.5, 1), { grav: -20 * k, drag: 1 });
        }
      }

      c.restore();
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const tDone = window.setTimeout(() => doneRef.current(), TOTAL_MS);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(tDone);
      stopSound();
      if (host && host.lift && !host.lift.done) { host.lift.done = true; host.lift.restore(); }
    };
  }, [W, H]);

  return (
    <div
      aria-hidden="true"
      data-gift-overlay="1"
      style={{ position: 'fixed', inset: 0, zIndex: 9400, pointerEvents: 'none', overflow: 'hidden' }}
    >
      <canvas ref={cvRef} style={{ position: 'absolute', inset: 0, width: W, height: H, pointerEvents: 'none' }} />
    </div>
  );
}

export const VolcanoGift: GiftDefinition = {
  id: 'volcano',
  name: 'Volcano',
  price: PRICE,
  durationMs: TOTAL_MS,
  Preview: VolcanoPreview,
  Animation: VolcanoAnimation,
};

export default VolcanoGift;
