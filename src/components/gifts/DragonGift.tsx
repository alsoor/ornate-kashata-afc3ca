/**
 * هدية التنين (Dragon) — 6,000 Coins — مدتها 16 ثانية
 *
 * - Preview  : داخل مربع الهدايا تنين صغير متحرك قبل النقر: يرفرف بجناحه، فكّه يفتح وتطلع من فمه نار،
 *              وعليه امرأة بشعر أحمر يتطاير، وشرارات وجمرات تتطاير حوله.
 * - Animation: (الأرقام بالثواني)
 *     0.0 – 1.2  : البث يغرق بالسواد المحمرّ + رياح ودخان
 *     1.0 – 3.6  : تنين ضخم يدخل من أعلى اليمين بجناحين ينفردان ورقبة طويلة وفوقه امرأة
 *     3.5 – 4.9  : زئير! فكّه يفتح، موجات صدمة، البث كله يهتز
 *     4.8 – 13.2 : نار تخرج من فمه وتكتسح البث، وجدار لهب يصعد من كل الحواف ويحرق الشاشة بالكامل
 *                  (الأزرار تسخن وتتوهج وتطلع منها ألسنة نار)
 *     هدية صاحب البث لمستخدم (متحدث) — بنفس المشهد، وبالنهاية:
 *     2.6 – 4.1  : صورة المستخدم (إطاره) تصعد لمنتصف البث
 *     10.2       : التنين يلتفت ويرش النار من فمه على الإطار
 *     10.9 – 13.5: الإطار يتفحّم ويحترق بالكامل حتى يتحول رماد ويختفي
 *     13.4 – 15.4: التنين يغادر، النار تهدأ، والإضاءة ترجع طبيعية
 *
 * ملف مستقل: الأصوات والموسيقى في src/lib/dragonSounds.ts (فيه خانة DRAGON_MUSIC_URL لموسيقاك).
 * غيّر الأرقام تحت (السعر/المدد/التوقيتات) كما تبي.
 *
 * ربط الأنميشن بالواجهة (يعمل تلقائياً بدونها، نفس البركان):
 *   data-gift-host : صورة صاحب البث (اختياري هنا).
 *   data-gift-lift : (يضعه LiveCoinsDock تلقائياً) لما صاحب البث يعطي متحدث: صورة المتحدث تصعد ثم تنحرق.
 *   data-gift-hot  : (اختياري) ضعه على أي عنصر تبي النار تحرقه غير الأزرار والـ inputs.
 */
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { GiftDefinition } from '../../lib/types';
import { playDragonSound } from '../../lib/dragonSounds';

// ── إعدادات الهدية ──────────────────────────────────────────────────────
const PRICE = 6000;
const TOTAL_MS = 16000;            // مدة الأنميشن الكلية (16 ثانية)
const TOTAL_S = TOTAL_MS / 1000;

const DARK_IN = 1.2;               // مدة الغرق بالسواد
const DARK_MAX = 0.82;             // قوة السواد (1 = أسود كامل)
const WIND_END = 4.5;              // نهاية الرياح
const FLY_AT = 1.0;                // بداية دخول التنين
const FLY_S = 2.6;                 // مدة الدخول
const ROAR_AT = 3.5;               // الزئير
const ROAR_END = 4.9;
const BREATH_AT = 4.8;             // بداية النار
const BREATH_END = 13.2;           // نهاية النار
const LIFT_AT = 2.6;               // صورة المستخدم تصعد (هدية لمستخدم)
const SPRAY_AT = 10.2;             // التنين يلتفت ويرش النار على الإطار
const BURN_AT = 10.9;              // بداية احتراق الإطار
const BURN_S = 2.6;                // مدة احتراقه
const LEAVE_AT = 13.4;             // التنين يغادر
const LEAVE_S = 2.0;
const LIGHT_BACK_AT = 13.6;        // الإضاءة ترجع
const LIGHT_BACK_END = 15.8;

const MAX_FX = 1600;               // حد أقصى للجسيمات (للأداء على الجوال)
const HOT_SEL = 'button, [role="button"], a[href], input, textarea, select, [data-gift-host], [data-gift-walk], [data-gift-hot]';
const FIRE_RGB = ['255,252,230', '255,236,150', '255,190,64', '255,124,24', '230,62,10', '150,28,6', '70,12,6'];

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

type V2 = [number, number];
const bez = (a: V2, b: V2, c: V2, d: V2, u: number): V2 => {
  const m = 1 - u;
  return [
    m * m * m * a[0] + 3 * m * m * u * b[0] + 3 * m * u * u * c[0] + u * u * u * d[0],
    m * m * m * a[1] + 3 * m * m * u * b[1] + 3 * m * u * u * c[1] + u * u * u * d[1],
  ];
};
const bezD = (a: V2, b: V2, c: V2, d: V2, u: number): V2 => {
  const m = 1 - u;
  return [
    3 * m * m * (b[0] - a[0]) + 6 * m * u * (c[0] - b[0]) + 3 * u * u * (d[0] - c[0]),
    3 * m * m * (b[1] - a[1]) + 6 * m * u * (c[1] - b[1]) + 3 * u * u * (d[1] - c[1]),
  ];
};

// ═══════════════════════════════════════════════════════════════════════
//  Preview — تنين صغير متحرك داخل مربع الهدايا
// ═══════════════════════════════════════════════════════════════════════
const DG_CSS = `
@keyframes dg-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
@keyframes dg-wing{0%,100%{transform:rotate(8deg)}50%{transform:rotate(-16deg)}}
@keyframes dg-jaw{0%,18%{transform:rotate(0deg)}34%,72%{transform:rotate(15deg)}88%,100%{transform:rotate(0deg)}}
@keyframes dg-fire{0%,22%{opacity:0;transform:scale(.2,.5)}36%{opacity:1;transform:scale(1,1)}48%{transform:scale(1.15,.9)}60%{transform:scale(.95,1.1)}72%{opacity:1;transform:scale(1.1,.95)}86%,100%{opacity:0;transform:scale(.3,.6)}}
@keyframes dg-flick{0%,100%{transform:scale(1,1)}33%{transform:scale(1.1,.88)}66%{transform:scale(.92,1.12)}}
@keyframes dg-eye{0%,100%{opacity:.75}50%{opacity:1}}
@keyframes dg-hair{0%,100%{transform:skewX(0deg)}50%{transform:skewX(-9deg)}}
@keyframes dg-spark{0%{transform:translate(0,0) scale(1);opacity:0}15%{opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(.2);opacity:0}}
@keyframes dg-halo{0%,100%{filter:drop-shadow(0 0 4px rgba(255,80,20,.5))}50%{filter:drop-shadow(0 0 10px rgba(255,150,30,.95))}}
.dg-bob{animation:dg-bob 2.6s ease-in-out infinite}
.dg-wing{animation:dg-wing 1.3s ease-in-out infinite;transform-box:view-box;transform-origin:68px 66px}
.dg-wing2{animation:dg-wing 1.3s ease-in-out infinite;animation-delay:-.35s;transform-box:view-box;transform-origin:68px 66px}
.dg-jaw{animation:dg-jaw 2.8s ease-in-out infinite;transform-box:view-box;transform-origin:64px 62px}
.dg-fire{animation:dg-fire 2.8s ease-in-out infinite;transform-box:view-box;transform-origin:14px 60px}
.dg-flick{animation:dg-flick .38s ease-in-out infinite;transform-box:fill-box;transform-origin:100% 50%}
.dg-eye{animation:dg-eye 1.2s ease-in-out infinite}
.dg-hair{animation:dg-hair 1.1s ease-in-out infinite;transform-box:fill-box;transform-origin:0% 100%}
.dg-spark{animation:dg-spark 2.8s ease-out infinite}
.dg-halo{animation:dg-halo 1.6s ease-in-out infinite}
`;

const DG_SPARKS: { x: number; y: number; dx: number; dy: number; d: number; r: number }[] = [
  { x: 12, y: 58, dx: -10, dy: -14, d: 1.0, r: 1.3 },
  { x: 12, y: 60, dx: -14, dy: 8, d: 1.2, r: 1.1 },
  { x: 14, y: 59, dx: -18, dy: -2, d: 1.4, r: 1.5 },
  { x: 13, y: 61, dx: -8, dy: 14, d: 1.55, r: 1.0 },
  { x: 12, y: 58, dx: -20, dy: -10, d: 1.7, r: 1.2 },
  { x: 86, y: 70, dx: 8, dy: -22, d: 0.2, r: 1.0 },
  { x: 92, y: 80, dx: 5, dy: -26, d: 1.3, r: 1.1 },
];

function DragonPreview({ size = 72 }: { size?: number }) {
  const uid = React.useId().replace(/:/g, '');
  const h = Math.round(size * 1.3);
  const w = Math.round((h * 100) / 112);
  const ref = (n: string) => `url(#${n}${uid})`;
  return (
    <motion.div
      aria-hidden="true"
      animate={{ y: [0, -2, 0] }}
      transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
      style={{ position: 'relative', width: w, height: h, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <style>{DG_CSS}</style>
      <svg width={w} height={h} viewBox="0 0 100 112" className="dg-halo" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <radialGradient id={`glow${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff8a2a" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#ff3a0a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`scale${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6a2418" />
            <stop offset="55%" stopColor="#32130e" />
            <stop offset="100%" stopColor="#170807" />
          </linearGradient>
          <linearGradient id={`wing${uid}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#2a0a0a" />
            <stop offset="100%" stopColor="#b02418" />
          </linearGradient>
          <linearGradient id={`fire${uid}`} x1="1" y1="0" x2="0" y2="0">
            <stop offset="0%" stopColor="#fff3b0" />
            <stop offset="35%" stopColor="#ffb02e" />
            <stop offset="75%" stopColor="#ff5a10" />
            <stop offset="100%" stopColor="#c21500" stopOpacity="0.15" />
          </linearGradient>
          <linearGradient id={`dress${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d6283a" />
            <stop offset="100%" stopColor="#5a0814" />
          </linearGradient>
        </defs>

        <circle cx="52" cy="52" r="46" fill={ref('glow')} />

        <g className="dg-bob">
          {/* الأجنحة */}
          <path className="dg-wing2" d="M70 68 L84 18 L80 42 L94 30 L86 54 L100 50 L78 76 Z" fill={ref('wing')} opacity="0.7" />
          <path className="dg-wing" d="M66 66 L74 8 L74 36 L90 14 L84 44 L100 32 L88 62 L72 78 Z" fill={ref('wing')} />
          <path className="dg-wing" d="M66 66 L74 8 M66 66 L90 14 M66 66 L100 32" stroke="#12090a" strokeWidth="1.1" fill="none" strokeLinecap="round" />

          {/* الرقبة والجسم */}
          <path d="M68 60 C84 62 94 80 92 112 L58 112 C66 94 62 76 62 66 Z" fill={ref('scale')} />
          <path d="M70 62 C84 66 90 84 88 108" fill="none" stroke="#a24a2a" strokeOpacity="0.35" strokeWidth="2" strokeLinecap="round" />
          {[0, 1, 2, 3].map(i => (
            <path key={i} d={`M${72 + i * 5} ${58 + i * 7} l3 -5 l2 6 z`} fill="#1a0a08" />
          ))}

          {/* المرأة */}
          <g transform="translate(79 56)">
            <path className="dg-hair" d="M0 -17 C6 -19 12 -14 14 -6 C10 -10 6 -8 3 -11 C8 -3 5 2 2 4 C3 -4 0 -8 -2 -10 Z" fill="#c4161e" />
            <path d="M-4 -2 L-5 -12 Q0 -16 5 -12 L4 -2 Q7 4 9 8 L-9 8 Q-6 4 -4 -2 Z" fill={ref('dress')} />
            <circle cx="0" cy="-15" r="3.3" fill="#f2cba6" />
            <path d="M3 -10 L9 -22" stroke="#f2cba6" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M9 -22 L11 -33" stroke="#e8f4ff" strokeWidth="1.2" strokeLinecap="round" />
            <circle cx="11" cy="-33" r="1.6" fill="#ffd36a" />
          </g>

          {/* الجمرات */}
          {DG_SPARKS.slice(5).map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#ffd37a" className="dg-spark" style={{ animationDelay: `${s.d}s`, ['--dx' as string]: `${s.dx}px`, ['--dy' as string]: `${s.dy}px` } as React.CSSProperties} />
          ))}

          {/* نار الفم */}
          <g className="dg-fire">
            <path className="dg-flick" d="M14 60 C4 50 -6 54 -16 48 C-8 56 -10 62 -20 66 C-8 66 2 70 14 62 Z" fill={ref('fire')} />
            <path className="dg-flick" style={{ animationDelay: '.12s' }} d="M14 60 C6 56 -2 58 -9 55 C-3 60 -4 63 -10 65 C-2 64 6 66 14 61 Z" fill="#fff0b0" opacity="0.9" />
          </g>
          {DG_SPARKS.slice(0, 5).map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#ffd37a" className="dg-spark" style={{ animationDelay: `${s.d}s`, ['--dx' as string]: `${s.dx}px`, ['--dy' as string]: `${s.dy}px` } as React.CSSProperties} />
          ))}

          {/* الفك السفلي */}
          <g className="dg-jaw">
            <path d="M64 62 L36 62 L14 62 L16 67 L36 71 L58 72 Z" fill={ref('scale')} />
            <path d="M18 62 l2 -3 l2 3 M26 62 l2 -3 l2 3 M34 62 l2 -3 l2 3" stroke="#f4ead6" strokeWidth="0.9" fill="#f4ead6" strokeLinejoin="round" />
          </g>
          {/* الرأس */}
          <path d="M72 50 C66 40 54 42 40 46 C28 49 18 53 10 57 L12 61 C26 62 44 62 66 64 L74 62 Z" fill={ref('scale')} />
          <path d="M16 61 l2 3 l2 -3 M24 61 l2 3 l2 -3 M32 61 l2 3 l2 -3 M40 62 l2 3 l2 -3" stroke="#f4ead6" strokeWidth="0.9" fill="#f4ead6" strokeLinejoin="round" />
          <path d="M62 46 C64 34 76 28 86 30 C78 33 72 40 70 50 Z" fill="#3a2418" />
          <path d="M66 46 C68 38 76 34 82 35" fill="none" stroke="#e8d3ae" strokeWidth="0.8" strokeLinecap="round" />
          <ellipse cx="47" cy="51" rx="4.2" ry="2.2" fill="#ffc02a" className="dg-eye" transform="rotate(8 47 51)" />
          <ellipse cx="47" cy="51" rx="0.9" ry="2" fill="#120606" />
          <circle cx="12.5" cy="56.5" r="1" fill="#0a0404" />
        </g>
      </svg>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  Animation — أنميشن ملء الشاشة (Canvas)
// ═══════════════════════════════════════════════════════════════════════
interface Pt {
  k: 0 | 2 | 3;               // 0 نار، 2 جمرة، 3 رماد/دخان داكن
  x: number; y: number; vx: number; vy: number;
  size: number; grow: number; life: number; age: number;
  grav: number; drag: number; wind: number; seed: number;
}
interface Smoke { x: number; y: number; vx: number; vy: number; size: number; grow: number; life: number; age: number; }
interface Hot { el: Element; x: number; y: number; w: number; h: number; rad: number; heat: number; }
interface Lift { sx: number; sy: number; sr: number; ex: number; ey: number; R: number; img: HTMLImageElement | null; letter: string; name: string; restore: () => void; done?: boolean; }
interface LiftInfo { userId: string; name?: string; avatarUrl?: string | null; }
interface Ring { x: number; y: number; born: number; dur: number; maxR: number; w: number; }

// وضع الرفع: الهدية لمتحدث (مو لصاحب البث) → صورته تصعد لمنتصف البث ثم التنين يحرقها
// معلومات المستلم يحطها LiveCoinsDock في window.__stooornaGiftLift
function getLiftInfo(): LiftInfo | null {
  try {
    const d = (window as unknown as { __stooornaGiftLift?: LiftInfo }).__stooornaGiftLift;
    return d && d.userId ? d : null;
  } catch { return null; }
}
function findLift(W: number, H: number, pre: HTMLImageElement | null): Lift | null {
  try {
    const info = getLiftInfo();
    if (!info) return null;
    const R = Math.max(40, Math.min(64, W * 0.16));
    const ex = W * 0.5;
    const ey = H * 0.46;
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
      sx, sy, sr, ex, ey, R,
      img: useImg || null,
      letter: (nm.charAt(0) || '?').toUpperCase(),
      name: nm,
      restore: () => { try { if (hasEl) el!.style.opacity = prevOp; } catch { /* ignore */ } },
    };
  } catch { return null; }
}

function DragonAnimation({ onDone }: { onDone: () => void }) {
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
    const U = Math.min(W, H * 0.62);       // وحدة القياس
    const hs = U * 0.0021;                  // مقياس الرأس (الرأس 300 وحدة)

    // صورة المستلم (لو الهدية لمتحدث)
    let liftPre: HTMLImageElement | null = null;
    const liftInfo0 = getLiftInfo();
    if (liftInfo0 && liftInfo0.avatarUrl) {
      try { liftPre = new Image(); liftPre.src = String(liftInfo0.avatarUrl); } catch { liftPre = null; }
    }

    const FIRE = FIRE_RGB.map(rgb => makeSprite(rgb, 0.3));
    const SMOKE = makeSprite('44,32,30', 0.15);
    const blob = (sp: HTMLCanvasElement, x: number, y: number, r: number, a: number) => {
      if (a <= 0.003 || r <= 0.2) return;
      c.globalAlpha = Math.min(1, a);
      c.drawImage(sp, x - r, y - r, r * 2, r * 2);
    };

    // ── حالة ──
    const fx: Pt[] = [];
    const smokes: Smoke[] = [];
    const rings: Ring[] = [];
    let hot: Hot[] = [];
    let hotAt = -9;
    const acc = { jet: 0, wall: 0, edge: 0, ember: 0, smoke: 0, av: 0, ash: 0, nose: 0 };
    let roared = false;
    let breathed = false;
    let lift: Lift | null = null;
    let liftTried = false;
    let flash = 0;
    let q = 1;
    let emaDt = 0.016;
    const cracks = Array.from({ length: 9 }, () => ({ a: rnd(0, 6.28), len: rnd(0.4, 0.95), ph: rnd(0, 6.28) }));

    const spawn = (kind: Pt['k'], x: number, y: number, vx: number, vy: number, size: number, life: number, o: Partial<Pt> = {}) => {
      if (fx.length >= MAX_FX) return;
      fx.push({ k: kind, x, y, vx, vy, size, grow: 0, life, age: 0, grav: 0, drag: 0, wind: 0, seed: Math.random() * 6.28, ...o });
    };
    const addSmoke = (x: number, y: number, vx: number, vy: number, size: number, life: number) => {
      if (smokes.length < 110) smokes.push({ x, y, vx, vy, size, grow: rnd(2, 3.2), life, age: 0 });
    };

    // ── الأزرار (للنار اللي تحرقها) ──
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
    const topAt = (h: Hot, x: number): number | null => {
      const lx = x - h.x;
      if (lx < 0 || lx > h.w) return null;
      const r = h.rad;
      if (r > 0 && lx < r) { const dx = r - lx; return h.y + r - Math.sqrt(Math.max(0, r * r - dx * dx)); }
      if (r > 0 && lx > h.w - r) { const dx = lx - (h.w - r); return h.y + r - Math.sqrt(Math.max(0, r * r - dx * dx)); }
      return h.y;
    };
    const hole = (x: number, y: number, r: number, a: number) => {
      if (a <= 0.01 || r < 2) return;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${Math.min(1, a)})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const distSeg = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
      const dx = bx - ax, dy = by - ay;
      const l2 = dx * dx + dy * dy || 1;
      const u = clamp01(((px - ax) * dx + (py - ay) * dy) / l2);
      return Math.hypot(px - (ax + dx * u), py - (ay + dy * u));
    };

    // ── التوقيتات: الصوت ──
    const stopSound = playDragonSound({
      windEnd: WIND_END,
      flyInAt: FLY_AT,
      roarAt: ROAR_AT,
      breathAt: BREATH_AT,
      breathEnd: BREATH_END,
      burnAt: BURN_AT,
      leaveAt: LEAVE_AT,
      total: TOTAL_S,
    });

    // ═══ رسم التنين ═══
    // الرأس: يواجه اليسار، الأصل (0,0) = منتصف الجمجمة. الأطوال بوحدات محلية (الخطم ≈ 300).
    const headPath = () => {
      c.beginPath();
      c.moveTo(70, -58);
      c.bezierCurveTo(40, -100, -10, -96, -50, -80);
      c.bezierCurveTo(-110, -70, -200, -60, -290, -38);
      c.lineTo(-306, -22);
      c.bezierCurveTo(-300, -8, -290, 2, -280, 6);
      c.lineTo(-240, 0); c.lineTo(-225, 12); c.lineTo(-205, 2); c.lineTo(-185, 14); c.lineTo(-165, 4);
      c.lineTo(-140, 12); c.lineTo(-120, 5); c.lineTo(-90, 12); c.lineTo(-60, 6);
      c.lineTo(20, 26);
      c.bezierCurveTo(70, 30, 100, 0, 100, -30);
      c.bezierCurveTo(100, -45, 90, -52, 70, -58);
      c.closePath();
    };
    const teeth = (xs: number[], y0: number, dir: 1 | -1, len: number) => {
      c.fillStyle = '#efe4cc';
      xs.forEach(x => {
        c.beginPath();
        c.moveTo(x - 6, y0);
        c.lineTo(x, y0 + dir * len);
        c.lineTo(x + 6, y0);
        c.closePath();
        c.fill();
      });
    };
    const drawHead = (x: number, y: number, rot: number, jaw: number, lit: number, t: number, fireOn: number) => {
      c.save();
      c.translate(x, y);
      c.rotate(rot);
      c.scale(hs, hs);

      // توهج داخل الفم
      if (fireOn > 0.02) {
        const mg = c.createRadialGradient(-270, 18, 0, -270, 18, 160);
        mg.addColorStop(0, `rgba(255,240,170,${0.95 * fireOn})`);
        mg.addColorStop(0.45, `rgba(255,140,30,${0.8 * fireOn})`);
        mg.addColorStop(1, 'rgba(120,20,0,0)');
        c.fillStyle = mg;
        c.beginPath();
        c.moveTo(-290, 4); c.lineTo(25, 22); c.lineTo(25, 70); c.lineTo(-290, 60);
        c.closePath();
        c.fill();
      } else if (jaw > 0.05) {
        c.fillStyle = `rgba(70,8,8,${0.9 * jaw})`;
        c.beginPath();
        c.moveTo(-285, 4); c.lineTo(25, 22); c.lineTo(25, 60); c.lineTo(-285, 50);
        c.closePath();
        c.fill();
      }

      // الفك السفلي (مفصل عند 30,22)
      c.save();
      c.translate(30, 22);
      c.rotate(-jaw * 0.5);
      c.beginPath();
      c.moveTo(0, -6); c.lineTo(-100, -4); c.lineTo(-200, -4); c.lineTo(-270, -6); c.lineTo(-292, 2);
      c.lineTo(-285, 16); c.lineTo(-200, 36); c.lineTo(-100, 48); c.lineTo(-20, 52); c.lineTo(10, 32);
      c.closePath();
      const jg = c.createLinearGradient(0, -6, 0, 52);
      jg.addColorStop(0, '#3a140e');
      jg.addColorStop(1, '#150706');
      c.fillStyle = jg;
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.6)';
      c.lineWidth = 2;
      c.stroke();
      teeth([-250, -215, -180, -145, -110, -75], -5, -1, 17);
      if (lit > 0.02) {
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = `rgba(255,110,30,${0.32 * lit})`;
        c.fill();
        c.globalCompositeOperation = 'source-over';
      }
      c.restore();

      // الجمجمة
      headPath();
      const hg = c.createLinearGradient(0, -100, 0, 30);
      hg.addColorStop(0, '#5b2217');
      hg.addColorStop(0.5, '#2c110c');
      hg.addColorStop(1, '#150706');
      c.fillStyle = hg;
      c.fill();
      c.save();
      headPath();
      c.clip();
      // حراشف
      c.strokeStyle = 'rgba(0,0,0,0.38)';
      c.lineWidth = 1.6;
      for (let row = 0; row < 9; row++) {
        for (let col = -3; col < 17; col++) {
          const sx = -300 + col * 22 + (row % 2) * 11;
          const sy = -92 + row * 14;
          c.beginPath();
          c.arc(sx, sy, 10, 0.15 * Math.PI, 0.85 * Math.PI);
          c.stroke();
        }
      }
      // توهج النار على الخطم + ضوء حافة
      if (lit > 0.02) {
        c.globalCompositeOperation = 'lighter';
        const lg = c.createRadialGradient(-300, 0, 0, -300, 0, 330);
        lg.addColorStop(0, `rgba(255,150,50,${0.6 * lit})`);
        lg.addColorStop(1, 'rgba(255,60,10,0)');
        c.fillStyle = lg;
        c.fillRect(-340, -120, 460, 180);
        c.globalCompositeOperation = 'source-over';
      }
      c.restore();
      c.lineWidth = 2.4;
      c.strokeStyle = `rgba(255,${Math.round(110 + 60 * lit)},40,${0.18 + 0.4 * lit})`;
      headPath();
      c.stroke();

      // أسنان العلوية
      teeth([-262, -228, -195, -160, -128, -96, -66], 5, 1, 19);

      // القرون
      const horn = (ox: number, oy: number, s: number) => {
        c.save();
        c.translate(ox, oy);
        c.scale(s, s);
        c.beginPath();
        c.moveTo(0, 0);
        c.bezierCurveTo(30, -70, 100, -112, 170, -92);
        c.bezierCurveTo(118, -84, 74, -52, 48, 10);
        c.closePath();
        const gg = c.createLinearGradient(0, 0, 170, -100);
        gg.addColorStop(0, '#2a1a14');
        gg.addColorStop(0.7, '#6a4a34');
        gg.addColorStop(1, '#e0cfae');
        c.fillStyle = gg;
        c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.5)';
        c.lineWidth = 2;
        c.stroke();
        c.restore();
      };
      horn(36, -82, 1);
      horn(6, -92, 0.7);

      // أشواك الجبهة
      c.fillStyle = '#1a0a08';
      for (let i = 0; i < 6; i++) {
        const sx = -30 - i * 38;
        const sy = -82 + i * 5;
        c.beginPath();
        c.moveTo(sx, sy); c.lineTo(sx + 12, sy - 22 + i * 2); c.lineTo(sx + 24, sy + 2);
        c.closePath();
        c.fill();
      }

      // العين
      c.save();
      c.translate(-82, -60);
      c.rotate(0.14);
      c.globalCompositeOperation = 'lighter';
      blob(FIRE[3], 0, 0, 44, 0.4 + 0.3 * lit);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
      const eg = c.createRadialGradient(0, 0, 0, 0, 0, 20);
      eg.addColorStop(0, '#fff6b0');
      eg.addColorStop(0.5, '#ffb41e');
      eg.addColorStop(1, '#c43a08');
      c.fillStyle = eg;
      c.beginPath();
      c.ellipse(0, 0, 20, 9, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#0a0404';
      c.beginPath();
      c.ellipse(0, 0, 3.4, 8, 0, 0, Math.PI * 2);
      c.fill();
      // جفن غاضب
      c.fillStyle = '#1e0b08';
      c.beginPath();
      c.moveTo(-24, -12); c.lineTo(22, -2); c.lineTo(24, -12); c.lineTo(-8, -20); c.closePath();
      c.fill();
      c.restore();

      // المنخار
      c.fillStyle = '#080303';
      c.beginPath();
      c.ellipse(-288, -24, 7, 4, -0.5, 0, Math.PI * 2);
      c.fill();
      if (fireOn > 0.02 || jaw > 0.3) {
        c.globalCompositeOperation = 'lighter';
        blob(FIRE[3], -288, -24, 26, 0.5 * Math.max(fireOn, jaw * 0.4) * (0.7 + 0.3 * Math.sin(t * 20)));
        c.globalCompositeOperation = 'source-over';
      }
      c.globalAlpha = 1;
      c.restore();
    };

    // الجناح: جذر S، كل المواضع بالشاشة
    const drawWing = (S: V2, flap: number, scale: number, dark: number, alpha: number) => {
      const rotV = (vx: number, vy: number, a: number): V2 => [vx * Math.cos(a) - vy * Math.sin(a), vx * Math.sin(a) + vy * Math.cos(a)];
      const e0 = rotV(-0.10 * U * scale, -0.52 * U * scale, flap);
      const E: V2 = [S[0] + e0[0], S[1] + e0[1]];
      const w0 = rotV(-0.40 * U * scale, -0.26 * U * scale, flap * 1.25);
      const Wr: V2 = [E[0] + w0[0], E[1] + w0[1]];
      const base = [1.06, 1.38, 1.72, 2.06, 2.4];   // زوايا الأصابع (راديان، 0 = يمين)
      const lens = [0.9, 0.96, 0.86, 0.7, 0.5];
      const tips: V2[] = base.map((a, j) => {
        const ang = Math.PI * 0.5 + (a - 1.06) * 0.0 + (j - 2) * 0.46 + flap * 0.9 + 0.2;
        const dir = Math.PI + ang - Math.PI * 0.5 + 0.3;
        return [Wr[0] + Math.cos(dir) * U * lens[j] * scale, Wr[1] + Math.sin(dir) * U * lens[j] * scale * 0.9 + U * 0.1 * scale];
      });
      c.save();
      c.globalAlpha = alpha;
      c.beginPath();
      c.moveTo(S[0], S[1]);
      c.lineTo(E[0], E[1]);
      c.lineTo(Wr[0], Wr[1]);
      c.lineTo(tips[0][0], tips[0][1]);
      for (let j = 1; j < tips.length; j++) {
        const a = tips[j - 1], b = tips[j];
        const mx = (a[0] + b[0]) / 2 + (S[0] - (a[0] + b[0]) / 2) * 0.22;
        const my = (a[1] + b[1]) / 2 + (S[1] - (a[1] + b[1]) / 2) * 0.22;
        c.quadraticCurveTo(mx, my, b[0], b[1]);
      }
      c.quadraticCurveTo(S[0] - U * 0.2 * scale, S[1] - U * 0.05 * scale, S[0], S[1] + U * 0.12 * scale);
      c.closePath();
      const mg = c.createLinearGradient(Wr[0], Wr[1], S[0], S[1] + U * 0.2);
      mg.addColorStop(0, `rgba(${Math.round(120 * dark)},${Math.round(22 * dark)},${Math.round(20 * dark)},0.94)`);
      mg.addColorStop(1, `rgba(${Math.round(36 * dark)},${Math.round(8 * dark)},${Math.round(10 * dark)},0.97)`);
      c.fillStyle = mg;
      c.fill();
      c.lineJoin = 'round';
      c.lineCap = 'round';
      // عروق وعظام
      c.strokeStyle = `rgba(14,6,6,0.95)`;
      c.lineWidth = Math.max(2.5, U * 0.016 * scale);
      c.beginPath();
      c.moveTo(S[0], S[1]); c.lineTo(E[0], E[1]); c.lineTo(Wr[0], Wr[1]);
      tips.forEach(tp => { c.moveTo(Wr[0], Wr[1]); c.lineTo(tp[0], tp[1]); });
      c.stroke();
      c.strokeStyle = 'rgba(255,110,50,0.22)';
      c.lineWidth = Math.max(1, U * 0.004);
      c.stroke();
      c.restore();
    };

    // المرأة (أصل الإحداثيات عند مقعدها على الرقبة، الاتجاه للأعلى = y سالب)
    const drawWoman = (x: number, y: number, s: number, t: number, tilt: number, lit: number) => {
      c.save();
      c.translate(x, y);
      c.rotate(tilt);
      c.scale(s, s);
      // العباءة
      const fl = Math.sin(t * 5) * 6;
      c.beginPath();
      c.moveTo(-8, -70);
      c.bezierCurveTo(30, -66 + fl, 66, -48, 96, -20 + fl);
      c.bezierCurveTo(70, -30, 40, -14, 12, -8);
      c.closePath();
      const cg = c.createLinearGradient(0, -70, 96, -20);
      cg.addColorStop(0, '#7a0a18');
      cg.addColorStop(1, 'rgba(90,6,16,0.2)');
      c.fillStyle = cg;
      c.fill();
      // الثوب
      c.beginPath();
      c.moveTo(-10, -66);
      c.lineTo(10, -66);
      c.bezierCurveTo(14, -46, 18, -30, 34, -4);
      c.bezierCurveTo(10, 4, -14, 4, -34, -4);
      c.bezierCurveTo(-18, -30, -12, -46, -10, -66);
      c.closePath();
      const dg = c.createLinearGradient(0, -66, 0, 4);
      dg.addColorStop(0, '#d12a3c');
      dg.addColorStop(1, '#4e0713');
      c.fillStyle = dg;
      c.fill();
      c.strokeStyle = '#e7b94a';
      c.lineWidth = 2.2;
      c.beginPath();
      c.moveTo(-9, -52); c.lineTo(9, -52);
      c.stroke();
      // الذراع المرفوعة + السيف
      c.lineCap = 'round';
      c.strokeStyle = '#f0c9a6';
      c.lineWidth = 7;
      c.beginPath();
      c.moveTo(8, -64);
      c.quadraticCurveTo(26, -84, 30, -112);
      c.stroke();
      c.strokeStyle = '#eaf4ff';
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(30, -112); c.lineTo(40, -178);
      c.stroke();
      c.globalCompositeOperation = 'lighter';
      blob(FIRE[3], 40, -178, 28, 0.55 * (0.7 + 0.3 * lit));
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
      // الذراع الثانية (اللجام)
      c.strokeStyle = '#f0c9a6';
      c.lineWidth = 7;
      c.beginPath();
      c.moveTo(-8, -64);
      c.quadraticCurveTo(-24, -50, -18, -22);
      c.stroke();
      // الرأس
      c.fillStyle = '#f2cba6';
      c.beginPath();
      c.arc(0, -80, 12, 0, Math.PI * 2);
      c.fill();
      // الشعر الأحمر المتطاير
      c.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const ph = i * 0.7;
        const sw = Math.sin(t * 6 + ph) * 8;
        c.strokeStyle = i % 2 ? '#d4181f' : '#a3101a';
        c.lineWidth = 6 - i * 0.35;
        c.beginPath();
        c.moveTo(-4, -90 + i * 2);
        c.bezierCurveTo(14, -96 + sw, 38 + i * 3, -80 + sw * 1.4 + i * 3, 66 + i * 5, -64 + sw * 2 + i * 6);
        c.stroke();
      }
      c.fillStyle = '#a3101a';
      c.beginPath();
      c.arc(0, -86, 12.5, Math.PI, Math.PI * 2);
      c.fill();
      // تاج صغير
      c.fillStyle = '#ffcf5a';
      c.beginPath();
      c.moveTo(-8, -93); c.lineTo(-6, -102); c.lineTo(-2, -95); c.lineTo(0, -104); c.lineTo(2, -95); c.lineTo(6, -102); c.lineTo(8, -93);
      c.closePath();
      c.fill();
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
      emaDt += (raw - emaDt) * 0.05;
      if (emaDt > 0.036) q = Math.max(0.45, q - 0.015);
      else if (emaDt < 0.024) q = Math.min(1, q + 0.008);
      const endFade = t > TOTAL_S - 0.5 ? clamp01((TOTAL_S - t) / 0.5) : 1;
      cv.style.opacity = String(endFade);

      // ── مراحل ──
      const enter = easeOut((t - FLY_AT) / FLY_S);
      const leave = smooth((t - LEAVE_AT) / LEAVE_S);
      const breathOn = smooth((t - (BREATH_AT - 0.3)) / 0.5) * (1 - smooth((t - BREATH_END) / 0.5));
      const roarK = t >= ROAR_AT && t < ROAR_END ? Math.sin(Math.PI * clamp01((t - ROAR_AT) / (ROAR_END - ROAR_AT))) : 0;
      const wall = smooth((t - (BREATH_AT + 0.6)) / 5.5) * (1 - smooth((t - BREATH_END) / 2.2));
      const burnB = clamp01((t - BURN_AT) / BURN_S);

      // ── اهتزاز ──
      let sa = 0;
      if (t >= FLY_AT) sa = 1.5 * enter;
      sa += 12 * roarK + 4.2 * breathOn + 2 * wall;
      sa *= k * (1 - smooth((t - LEAVE_AT) / 1.8));
      const shx = sa * (Math.sin(t * 61) * 0.6 + Math.sin(t * 37 + 1) * 0.4);
      const shy = sa * (Math.sin(t * 53 + 2) * 0.6 + Math.sin(t * 29) * 0.4) * 0.7;

      // ── وضع التنين ──
      const offX = (1 - enter) * W * 0.95 + leave * W * 0.95;
      const offY = -(1 - enter) * H * 0.55 - leave * H * 0.6;
      const HX = W * 0.74 + offX + Math.sin(t * 1.3) * 7 * k;
      const HY = H * 0.27 + offY + Math.sin(t * 1.9) * 9 * k;

      // اتجاه النار (θ: الزاوية على الشاشة، y لتحت موجب)
      let theta = Math.PI * 0.72 + 0.3 * Math.sin((t - BREATH_AT) * 0.75) + 0.07 * Math.sin(t * 2.3);
      let aimTarget: V2 | null = null;
      if (t >= LIFT_AT - 0.5 && !liftTried) {
        liftTried = true;
        lift = findLift(W, H, liftPre);
      }
      if (lift && t >= SPRAY_AT) {
        const tx = lift.ex, ty = lift.ey;
        aimTarget = [tx, ty];
        const aim = Math.atan2(ty - HY, tx - HX);
        theta = lerp(theta, aim, smooth((t - SPRAY_AT) / 0.6));
      } else if (!lift && t >= SPRAY_AT) {
        // هدية صاحب البث: موجة اللهب الكبرى على كل البث
        theta = Math.PI * 0.62 + 0.4 * Math.sin((t - SPRAY_AT) * 1.5);
      }
      theta = Math.min(Math.PI * 1.1, Math.max(Math.PI * 0.46, theta));
      const idleRot = -0.32 + Math.sin(t * 1.6) * 0.04 - roarK * 0.22;
      const rot = lerp(idleRot, theta - Math.PI, breathOn);
      const jaw = Math.max(0.12 + 0.05 * Math.sin(t * 2), roarK, breathOn * (0.8 + 0.2 * Math.sin(t * 9)));
      const lit = clamp01(breathOn + 0.4 * roarK);

      // موضع الفم
      const mLX = -296 * hs, mLY = 12 * hs;
      const mX = HX + mLX * Math.cos(rot) - mLY * Math.sin(rot);
      const mY = HY + mLX * Math.sin(rot) + mLY * Math.cos(rot);

      // ── أحداث لمرة وحدة ──
      if (!roared && t >= ROAR_AT) {
        roared = true;
        rings.push({ x: mX, y: mY, born: t, dur: 1.3, maxR: W * 1.4, w: 6 });
        rings.push({ x: mX, y: mY, born: t + 0.18, dur: 1.6, maxR: W * 1.8, w: 3.5 });
        flash = 0.5;
      }
      if (!breathed && t >= BREATH_AT) {
        breathed = true;
        flash = 1;
        rings.push({ x: mX, y: mY, born: t, dur: 1.0, maxR: W * 1.2, w: 5 });
      }
      if (lift && t >= SPRAY_AT - 0.05 && t < SPRAY_AT + 0.1) flash = Math.max(flash, 0.35);

      // أزرار
      if (t >= BREATH_AT - 0.6 && t - hotAt > 0.45) { hot = collectHot(hot); hotAt = t; }
      const wallTop = H - H * 1.08 * wall;
      const jdx = Math.cos(theta), jdy = Math.sin(theta);
      for (const h of hot) {
        const cx0 = h.x + h.w / 2, cy0 = h.y + h.h / 2;
        let inc = -dt * 0.12;
        if (wall > 0.02 && cy0 > wallTop) inc += dt * 1.1;
        if (breathOn > 0.3 && distSeg(cx0, cy0, mX, mY, mX + jdx * W * 1.4, mY + jdy * W * 1.4) < 60 * k + Math.max(h.w, h.h) * 0.4) inc += dt * 1.7;
        h.heat = Math.min(1.3, Math.max(0, h.heat + inc));
      }

      // ── المنبعثات ──
      // نفخة النار من الفم
      if (breathOn > 0.02) {
        acc.jet += dt * 340 * breathOn * q;
        while (acc.jet >= 1) {
          acc.jet--;
          const a = theta + (Math.random() - 0.5) * 0.3;
          const sp = rnd(900, 2000) * k;
          spawn(0, mX + rnd(-6, 6) * k, mY + rnd(-6, 6) * k, Math.cos(a) * sp, Math.sin(a) * sp, rnd(18, 46) * k, rnd(0.55, 1.15), { grow: -0.3, grav: -60 * k, drag: 0.8, wind: 0 });
          if (Math.random() < 0.35) spawn(2, mX, mY, Math.cos(a) * sp * 0.8 + rnd(-120, 120), Math.sin(a) * sp * 0.8 + rnd(-120, 120), rnd(1.8, 3.6) * k, rnd(1.2, 2.6), { grav: 380 * k, drag: 0.35 });
        }
      } else if (t > 1.6 && t < BREATH_AT && enter > 0.3) {
        // دخان من المنخار
        acc.nose += dt * 8;
        while (acc.nose >= 1) { acc.nose--; addSmoke(mX, mY - 10 * hs, rnd(-60, -10), -rnd(30, 90) * k, rnd(10, 22) * k, rnd(1.5, 2.6)); }
      }
      // جدار لهب من الحواف (يحرق البث بالكامل)
      if (wall > 0.02) {
        acc.wall += dt * 260 * wall * q;
        while (acc.wall >= 1) {
          acc.wall--;
          spawn(0, rnd(-0.06, 1.06) * W, H + 12, rnd(-30, 30), -rnd(260, 820) * k, rnd(30, 76) * k, rnd(0.8, 1.6), { grow: -0.35, grav: -80 * k, drag: 0.9 });
        }
        acc.edge += dt * 150 * wall * q;
        while (acc.edge >= 1) {
          acc.edge--;
          const r = Math.random();
          if (r < 0.34) spawn(0, -10, rnd(0.2, 1) * H, rnd(60, 260) * k, -rnd(120, 380) * k, rnd(26, 60) * k, rnd(0.7, 1.4), { grow: -0.35, grav: -90 * k, drag: 0.9 });
          else if (r < 0.68) spawn(0, W + 10, rnd(0.2, 1) * H, -rnd(60, 260) * k, -rnd(120, 380) * k, rnd(26, 60) * k, rnd(0.7, 1.4), { grow: -0.35, grav: -90 * k, drag: 0.9 });
          else if (wall > 0.55) spawn(0, rnd(0, 1) * W, -10, rnd(-40, 40), rnd(100, 320) * k, rnd(26, 60) * k, rnd(0.7, 1.4), { grow: -0.35, grav: 120 * k, drag: 0.9 });
        }
        acc.ember += dt * 60 * wall * q;
        while (acc.ember >= 1) {
          acc.ember--;
          spawn(2, rnd(0, 1) * W, H + 6, rnd(-80, 80), -rnd(300, 900) * k, rnd(1.6, 3.4) * k, rnd(1.5, 3.2), { grav: 260 * k, drag: 0.3, wind: 0.2 });
        }
        acc.smoke += dt * 8 * wall;
        while (acc.smoke >= 1) { acc.smoke--; addSmoke(rnd(0, 1) * W, H * rnd(0.45, 0.95), rnd(-30, 30), -rnd(60, 160) * k, rnd(30, 60) * k, rnd(3, 5)); }
      }

      // ═══ رسم ═══
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';

      // السواد المحمرّ
      const dk = DARK_MAX * smooth(t / DARK_IN) * (1 - smooth((t - LIGHT_BACK_AT) / (LIGHT_BACK_END - LIGHT_BACK_AT)));
      c.fillStyle = `rgba(8,2,3,${dk})`;
      c.fillRect(0, 0, W, H);
      // إضاءة النار تخفف السواد حول الفم والحواف
      c.globalCompositeOperation = 'destination-out';
      const flick = 0.9 + 0.1 * Math.sin(t * 17) + 0.05 * Math.sin(t * 41);
      if (breathOn > 0.02) hole(mX, mY, H * 0.55, 0.62 * breathOn * flick);
      if (wall > 0.02) {
        const gb = c.createLinearGradient(0, H, 0, wallTop);
        gb.addColorStop(0, `rgba(0,0,0,${0.75 * Math.min(1, wall * 1.4)})`);
        gb.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = gb;
        c.fillRect(0, 0, W, H);
      }
      for (const h of hot) if (h.heat > 0.08) hole(h.x + h.w / 2, h.y + h.h / 2, 40 + Math.max(h.w, h.h) * 0.6, 0.65 * Math.min(1, h.heat));
      c.globalCompositeOperation = 'source-over';

      // وميض
      if (flash > 0.01) {
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = `rgba(255,190,120,${flash * 0.5})`;
        c.fillRect(0, 0, W, H);
        c.globalCompositeOperation = 'source-over';
        flash *= Math.exp(-dt * 4.5);
      }

      c.save();
      c.translate(shx, shy);

      // ── الجناحان + الجسم + الرقبة ──
      const dragonA = endFade;
      const hbX = HX + (80 * hs) * Math.cos(rot) - (6 * hs) * Math.sin(rot);
      const hbY = HY + (80 * hs) * Math.sin(rot) + (6 * hs) * Math.cos(rot);
      const P0: V2 = [hbX, hbY];
      const fwdX = Math.cos(rot), fwdY = Math.sin(rot);             // اتجاه "الخلف" للرأس (عكس الخطم)
      const B: V2 = [W * 1.08 + offX * 0.4, H * 1.08 + offY * 0.25];
      const P1: V2 = [P0[0] + fwdX * 190 * hs, P0[1] + fwdY * 190 * hs];
      const P2: V2 = [B[0] - W * 0.34, B[1] - H * 0.34];
      const flapA = Math.sin(t * 2.4) * 0.34 - 0.1;
      const S: V2 = bez(P0, P1, P2, B, 0.8);
      const lightWing = lit * 0.25;
      drawWing([S[0] - 0.06 * U, S[1] + 0.04 * U], flapA - 0.18 + Math.sin(t * 2.4 + 0.9) * 0.05, 0.84, 0.55 + lightWing, 0.92 * dragonA);
      drawWing(S, flapA, 1.0, 0.8 + lightWing, dragonA);

      // جسم ضخم
      {
        const bg = c.createRadialGradient(B[0] - 0.08 * U, B[1] - 0.12 * U, 0, B[0], B[1], 0.55 * U);
        bg.addColorStop(0, '#4a1a12');
        bg.addColorStop(0.6, '#21100c');
        bg.addColorStop(1, '#0c0605');
        c.globalAlpha = dragonA;
        c.fillStyle = bg;
        c.beginPath();
        c.arc(B[0], B[1], 0.52 * U, 0, Math.PI * 2);
        c.fill();
        c.globalAlpha = 1;
      }

      // الرقبة: سلسلة دوائر + أشواك
      const N = 38;
      let womanPos: V2 = [0, 0];
      for (let i = N; i >= 0; i--) {
        const u = i / N;
        const p = bez(P0, P1, P2, B, u);
        const d = bezD(P0, P1, P2, B, u);
        const dl = Math.hypot(d[0], d[1]) || 1;
        const tx = d[0] / dl, ty = d[1] / dl;
        let nx = -ty, ny = tx;
        if (ny > 0) { nx = -nx; ny = -ny; }       // الجهة العلوية
        const r = lerp(60 * hs, 118 * hs, Math.pow(u, 0.85));
        const fall = Math.exp(-Math.hypot(p[0] - mX, p[1] - mY) / (0.55 * U));
        const li = clamp01(lit * fall);
        const rr = Math.round(52 + (u < 0.5 ? 6 : 0) + li * 120);
        const gg = Math.round(20 + li * 46);
        const bb = Math.round(15 + li * 10);
        c.globalAlpha = dragonA;
        c.fillStyle = `rgb(${rr},${gg},${bb})`;
        c.beginPath();
        c.arc(p[0], p[1], r, 0, Math.PI * 2);
        c.fill();
        // بطن فاتح
        c.fillStyle = `rgba(150,78,44,${0.34 + li * 0.2})`;
        c.beginPath();
        c.arc(p[0] - nx * r * 0.58, p[1] - ny * r * 0.58, r * 0.46, 0, Math.PI * 2);
        c.fill();
        // حراشف
        if (i % 2 === 0) {
          c.strokeStyle = 'rgba(0,0,0,0.34)';
          c.lineWidth = 1.6;
          c.beginPath();
          c.arc(p[0], p[1], r * 0.78, Math.atan2(ny, nx) - 1.1, Math.atan2(ny, nx) + 1.1);
          c.stroke();
        }
        // أشواك
        if (i % 3 === 0 && i > 1) {
          c.fillStyle = '#1a0a08';
          c.beginPath();
          c.moveTo(p[0] + nx * r * 0.85 - tx * r * 0.34, p[1] + ny * r * 0.85 - ty * r * 0.34);
          c.lineTo(p[0] + nx * r * 1.55, p[1] + ny * r * 1.55);
          c.lineTo(p[0] + nx * r * 0.85 + tx * r * 0.34, p[1] + ny * r * 0.85 + ty * r * 0.34);
          c.closePath();
          c.fill();
        }
        if (i === Math.round(N * 0.3)) { womanPos = [p[0] + nx * r * 0.78, p[1] + ny * r * 0.78] }
      }
      c.globalAlpha = 1;

      // المرأة فوق الرقبة
      drawWoman(womanPos[0], womanPos[1], hs * 0.95, t, -0.1 + Math.sin(t * 1.4) * 0.03, lit);

      // الرأس
      c.globalAlpha = dragonA;
      drawHead(HX, HY, rot, jaw, lit, t, breathOn);
      c.globalAlpha = 1;

      // ── دخان ──
      for (let i = smokes.length - 1; i >= 0; i--) {
        const s = smokes[i];
        s.age += dt;
        if (s.age >= s.life) { smokes[i] = smokes[smokes.length - 1]; smokes.pop(); continue; }
        s.vy *= Math.exp(-0.3 * dt);
        s.x += s.vx * dt;
        s.y += s.vy * dt;
      }
      for (const s of smokes) {
        const u = s.age / s.life;
        blob(SMOKE, s.x, s.y, s.size * (1 + s.grow * u), Math.min(u / 0.12, 1) * (1 - u) * 0.5 * endFade);
      }
      c.globalAlpha = 1;

      // ── إطار المستخدم يصعد ثم يحترق بالكامل ──
      if (lift) {
        const L = lift;
        const up = easeOut((t - LIFT_AT) / 1.5);
        const gone = burnB >= 1 ? smooth((t - (BURN_AT + BURN_S + 0.4)) / 0.4) : 0;
        if (burnB >= 1 && !L.done && t >= BURN_AT + BURN_S + 0.8) { L.done = true; L.restore(); }
        const e2 = up;
        const vis = 1 - smooth((burnB - 0.72) / 0.28);
        if (e2 > 0.004 && vis > 0.01 && gone < 1) {
          const ax = lerp(L.sx, L.ex, e2) + (burnB > 0 ? Math.sin(t * 38) * 2.2 * k * burnB : 0);
          const ay = lerp(L.sy, L.ey, e2) + Math.sin(t * 2.6) * 3 * k * e2;
          const ar = lerp(L.sr, L.R, e2) * (1 - 0.18 * smooth((burnB - 0.6) / 0.4));
          // هالة سخونة
          c.save();
          c.globalCompositeOperation = 'lighter';
          blob(FIRE[3], ax, ay, ar * (2.2 + 1.2 * burnB), (0.3 + 0.5 * burnB) * e2 * endFade * vis);
          c.restore();
          c.save();
          c.globalAlpha = clamp01(e2 * 3) * endFade * vis;
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
          // تفحّم يزحف من الأطراف للمنتصف
          if (burnB > 0) {
            const cr = ar * (1.45 - 1.35 * smooth(burnB * 1.15));
            const cg2 = c.createRadialGradient(ax, ay, Math.max(1, cr * 0.55), ax, ay, ar * 1.05);
            cg2.addColorStop(0, 'rgba(14,6,3,0)');
            cg2.addColorStop(0.55, `rgba(14,6,3,${0.78 * smooth(burnB * 1.6)})`);
            cg2.addColorStop(1, `rgba(8,3,2,${0.97 * smooth(burnB * 1.3)})`);
            c.fillStyle = cg2;
            c.fillRect(ax - ar, ay - ar, ar * 2, ar * 2);
            c.fillStyle = `rgba(14,6,3,${0.7 * smooth((burnB - 0.5) * 2)})`;
            c.fillRect(ax - ar, ay - ar, ar * 2, ar * 2);
            // شقوق جمر متوهجة
            c.globalCompositeOperation = 'lighter';
            c.lineCap = 'round';
            for (const cr2 of cracks) {
              const pulse = 0.55 + 0.45 * Math.sin(t * 9 + cr2.ph);
              c.strokeStyle = `rgba(255,${Math.round(110 + 80 * pulse)},30,${0.75 * burnB * pulse})`;
              c.lineWidth = Math.max(1, ar * 0.035);
              c.beginPath();
              c.moveTo(ax + Math.cos(cr2.a) * ar * 0.12, ay + Math.sin(cr2.a) * ar * 0.12);
              c.lineTo(ax + Math.cos(cr2.a + 0.25 * Math.sin(cr2.ph)) * ar * cr2.len, ay + Math.sin(cr2.a + 0.25 * Math.sin(cr2.ph)) * ar * cr2.len);
              c.stroke();
            }
            c.globalCompositeOperation = 'source-over';
          }
          c.restore();
          // الإطار الذهبي → فحم متوهج
          c.beginPath();
          c.arc(ax, ay, ar, 0, Math.PI * 2);
          c.lineWidth = Math.max(2, ar * 0.07);
          c.strokeStyle = `rgba(${Math.round(lerp(255, 70, burnB))},${Math.round(lerp(190, 24, burnB))},${Math.round(lerp(70, 12, burnB))},0.95)`;
          c.shadowColor = 'rgba(255,100,20,0.95)';
          c.shadowBlur = 14 + 22 * burnB;
          c.stroke();
          c.restore();
          // الاسم
          if (e2 > 0.5 && burnB < 0.5) {
            c.save();
            c.globalAlpha = clamp01((e2 - 0.5) * 2) * (1 - burnB * 2) * endFade;
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

          // ألسنة نار + رماد من الإطار أثناء الاحتراق
          if (t >= SPRAY_AT + 0.3) {
            const heat = 0.3 + 0.7 * burnB;
            acc.av += dt * (60 + 260 * burnB) * q;
            while (acc.av >= 1) {
              acc.av--;
              const a = rnd(0, Math.PI * 2);
              const rr2 = ar * Math.sqrt(Math.random()) * 1.02;
              spawn(0, ax + Math.cos(a) * rr2, ay + Math.sin(a) * rr2, rnd(-30, 30), -rnd(140, 360) * k * heat, rnd(12, 30) * k, rnd(0.45, 0.95), { grow: -0.45, grav: -110 * k, drag: 1.2 });
            }
            if (burnB > 0.45) {
              acc.ash += dt * 90 * burnB * q;
              while (acc.ash >= 1) {
                acc.ash--;
                const a = rnd(0, Math.PI * 2);
                const rr2 = ar * Math.sqrt(Math.random());
                spawn(3, ax + Math.cos(a) * rr2, ay + Math.sin(a) * rr2, rnd(-60, 60), -rnd(20, 140) * k, rnd(1.5, 3.2) * k, rnd(1.2, 2.4), { grav: 90 * k, drag: 0.6, wind: 0.2 });
              }
            }
          }
        }
      }

      // ── جسيمات النار / الجمر / الرماد (additive) ──
      c.globalCompositeOperation = 'lighter';
      for (let i = fx.length - 1; i >= 0; i--) {
        const p = fx[i];
        p.age += dt;
        if (p.age >= p.life) { fx[i] = fx[fx.length - 1]; fx.pop(); continue; }
        const u = p.age / p.life;
        p.vy += p.grav * dt;
        const dm = Math.exp(-p.drag * dt);
        p.vx *= dm;
        p.vy *= dm;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y > H + 90 || p.y < -420 || p.x < -180 || p.x > W + 180) { fx[i] = fx[fx.length - 1]; fx.pop(); continue; }
        if (p.k === 0) {
          const sz = p.size * (1 + p.grow * u);
          const idx = Math.min(6, Math.floor(Math.pow(u, 0.8) * 6.5));
          blob(FIRE[idx], p.x, p.y, sz, (1 - u) * 0.9 * endFade);
        } else if (p.k === 2) {
          const fl = 0.6 + 0.4 * Math.sin(p.age * 30 + p.seed);
          const fade = u > 0.7 ? (1 - u) / 0.3 : 1;
          blob(FIRE[u > 0.6 ? 2 : 1], p.x, p.y, p.size * 3.2, 0.8 * fl * fade * endFade);
          blob(FIRE[0], p.x, p.y, p.size * 1.2, 0.9 * fade * endFade);
        } else {
          c.globalCompositeOperation = 'source-over';
          c.globalAlpha = (1 - u) * 0.6 * endFade;
          c.fillStyle = u < 0.3 ? 'rgb(255,150,50)' : 'rgb(60,50,48)';
          c.fillRect(p.x, p.y, p.size, p.size);
          c.globalCompositeOperation = 'lighter';
        }
      }
      c.globalAlpha = 1;

      // وهج الحريق العام على الشاشة (حرق كامل)
      if (wall > 0.02) {
        const ov = c.createLinearGradient(0, H, 0, 0);
        ov.addColorStop(0, `rgba(255,110,24,${0.5 * wall * flick})`);
        ov.addColorStop(0.55, `rgba(255,70,12,${0.26 * wall * flick})`);
        ov.addColorStop(1, `rgba(200,40,8,${0.16 * wall * flick})`);
        c.fillStyle = ov;
        c.fillRect(0, 0, W, H);
        const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
        vg.addColorStop(0, 'rgba(255,60,10,0)');
        vg.addColorStop(1, `rgba(255,90,20,${0.34 * wall * flick})`);
        c.fillStyle = vg;
        c.fillRect(0, 0, W, H);
      }
      // توهج حول الفم
      if (breathOn > 0.02) {
        blob(FIRE[2], mX, mY, 150 * k * (0.9 + 0.2 * Math.sin(t * 25)), 0.6 * breathOn);
        blob(FIRE[0], mX, mY, 60 * k, 0.7 * breathOn);
        c.globalAlpha = 1;
      }
      // لهب موجَّه على الإطار أثناء الرش
      if (aimTarget && lift) {
        const jb = breathOn * smooth((t - SPRAY_AT) / 0.6) * (1 - smooth((burnB - 0.9) / 0.1));
        if (jb > 0.02) {
          blob(FIRE[3], aimTarget[0], aimTarget[1], lift.R * 2.6, 0.5 * jb * flick);
          blob(FIRE[1], aimTarget[0], aimTarget[1], lift.R * 1.4, 0.45 * jb);
          c.globalAlpha = 1;
        }
      }

      // سخونة الأزرار: ألسنة نار + توهج
      c.globalCompositeOperation = 'source-over';
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

      // موجات الصدمة
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        const u = (t - r.born) / r.dur;
        if (u >= 1) { rings.splice(i, 1); continue; }
        if (u < 0) continue;
        const rr = easeOut(u) * r.maxR;
        c.strokeStyle = `rgba(255,205,130,${(1 - u) * 0.6})`;
        c.lineWidth = r.w * (1 - u) + 1;
        c.beginPath();
        c.ellipse(r.x, r.y, rr, rr * 0.7, 0, 0, Math.PI * 2);
        c.stroke();
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
      if (lift && !lift.done) { lift.done = true; lift.restore(); }
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

export const DragonGift: GiftDefinition = {
  id: 'dragon',
  name: 'Dragon',
  price: PRICE,
  durationMs: TOTAL_MS,
  Preview: DragonPreview,
  Animation: DragonAnimation,
};

export default DragonGift;
