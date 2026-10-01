/**
 * هدية البالونات والدببة (Balloons) — 150 Coins — مدتها 9 ثواني
 *
 * - Preview  : داخل مربع الهدايا (المربع الثاني بالصف العلوي) دبدوب صغير يمسك حبال 3 بالونات ملونة،
 *              البالونات تتمايل وتنضغط بنعومة، والدبدوب يطلع وينزل، ونجوم تلمع حولهم — قبل النقر.
 *
 * - Animation (الأرقام بالثواني):
 *     [1] المشاهد → صاحب البث (أو أي هدية بدون مستلم متحدث):
 *         0 – 9      : بالونات ملونة تتصاعد للأعلى من حبالها اللي تحت، وصاحب البث يتحول بثه لدببة صغيرة
 *                      تتساقط من فوق وترتطم بالبالونات المتطايرة (البالونة تنضغط وترتد)
 *                      وتنزل على أزرار البث وتجلس عليها شوي ثم تنط وتكمل نزول
 *     [2] صاحب البث → مستخدم (متحدث): نفس كل شي فوق + :
 *         0.0 – 1.2  : بالونة (بحبلها) تطلع من تحت وحبلها يمسك إطار صورة المستخدم
 *         1.2 – 2.8  : البالونة الأولى تسحب الإطار لمنتصف البث
 *         2.8 – 4.6  : البالونة الأولى تفلت وتطلع بعيد، والإطار ينزل شوي بمنتصف البث
 *         3.2 – 4.6  : بالونة ثانية تطلع من تحت وحبلها يمسك الإطار
 *         4.6 – 6.5  : البالونة الثانية تاخذ الإطار للأعلى
 *         7.3 – 8.4  : البالونة الثانية تفلت، والإطار يرجع لمكانه
 *         طوال الوقت : دببة صغيرة تنزل على الإطار (بعضها يثبت عليه وبعضها يرتد) وعلى البالونات
 *
 * ملف مستقل: الأصوات في src/lib/balloonSounds.ts. غيّر الأرقام تحت (السعر/المدد/التوقيتات).
 *
 * ربط الأنميشن بالواجهة (نفس البركان، يعمل تلقائياً بدونها):
 *   window.__stooornaGiftLift : (يضعه LiveCoinsDock) بيانات المستلم لو الهدية لمتحدث → وضع [2]
 *   data-gift-user            : على صورة المتحدث بالقائمة → منها تبدأ الصورة بالصعود
 *   data-gift-host / data-gift-hot : (اختياري) أي عنصر تبي الدببة تنزل عليه غير الأزرار والـ inputs.
 *   الدببة تنزل تلقائياً على: button, [role=button], a[href], input, textarea, select
 */
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { GiftDefinition } from '../../lib/types';
import { playBalloonSound } from '../../lib/balloonSounds';

// ── إعدادات الهدية ──────────────────────────────────────────────────────
const PRICE = 150;
const TOTAL_MS = 9000;             // مدة الأنميشن الكلية (9 ثواني)
const TOTAL_S = TOTAL_MS / 1000;

const FADE_IN = 0.6;               // ظهور اللون الخفيف بالخلفية
const FADE_OUT = 0.8;              // اختفاء كل شي بالنهاية

// تساقط الدببة
const BEAR_START = 0.35;           // بداية التساقط
const BEAR_END = 7.7;              // نهاية التساقط
const BEAR_RATE = 6.5;             // دبدوب بالثانية
const MAX_BEARS = 90;              // حد أقصى للدببة (للأداء على الجوال)
const GRAV = 460;                  // الجاذبية (بكسل/ث² × k)

// البالونات المتطايرة
const BAL_END = 7.4;               // آخر وقت يطلع فيه بالون جديد
const BAL_RATE = 2.4;              // بالون بالثانية
const MAX_BALLOONS = 16;

// وضع رفع المستخدم (بالونتين تحمل الإطار)
const A_GRAB = 1.2;                // حبل البالونة الأولى يمسك الإطار
const A_CENTER = 2.8;              // الإطار وصل لمنتصف البث
const A_OFF_S = 1.8;               // مدة ابتعاد البالونة الأولى
const B_START = 3.2;               // البالونة الثانية تبدأ تطلع من تحت
const B_GRAB = 4.6;                // حبلها يمسك الإطار
const B_TOP = 6.5;                 // وصلت للأعلى
const RET_AT = 7.3;                // البالونة الثانية تفلت والإطار يرجع
const RET_END = 8.4;               // الإطار وصل مكانه
const B_OFF_S = 1.4;               // مدة ابتعاد البالونة الثانية
const SAG = 36;                    // نزول الإطار بين البالونتين (بكسل × k)
const MAX_STUCK = 7;               // أقصى عدد دببة تثبت على الإطار
const STICK_CHANCE = 0.65;
const MIN_GAP = 0.62;              // أقل مسافة زاوية بين دبدوبين ثابتين (راديان)

const HOT_SEL = 'button, [role="button"], a[href], input, textarea, select, [data-gift-host], [data-gift-hot]';

// (فاتح، أساسي، غامق)
const BALLOON_COLS: [string, string, string][] = [
  ['#ff9aa6', '#e11d3a', '#8f0e24'],   // أحمر
  ['#fff3a0', '#ffc21a', '#b87d00'],   // أصفر
  ['#a6dcff', '#2a8be8', '#14509e'],   // أزرق
  ['#a8f0b4', '#2ec45a', '#13803a'],   // أخضر
  ['#ffc2e6', '#f04fb4', '#a01c76'],   // وردي
  ['#d9b8ff', '#8a4be8', '#4d1f9e'],   // بنفسجي
  ['#ffcf9a', '#ff8a1f', '#b24c00'],   // برتقالي
];
// (فرو، فرو غامق، فاتح، فيونكة)
const BEAR_COLS: [string, string, string, string][] = [
  ['#b87a45', '#8a5530', '#f0d3a8', '#e11d3a'],
  ['#dca66a', '#b07a3e', '#fbe9c8', '#2ea8ff'],
  ['#f4a6c4', '#cc7799', '#ffe3ee', '#ffc21a'],
  ['#f6e6c8', '#c9b184', '#fffaf0', '#43c86b'],
  ['#8fc9f2', '#5a98c8', '#e6f5ff', '#a855f7'],
];
const CONFETTI = ['#ff4d6a', '#ffc21a', '#2ea8ff', '#43c86b', '#f04fb4', '#a06bff'];

// ── أدوات رياضية ────────────────────────────────────────────────────────
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pickI = (n: number) => Math.floor(Math.random() * n);

function makeGlow(rgb: string, soft = 0.3): HTMLCanvasElement {
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

// بالونة: الجسم مركزه (40,40) نصف قطر 34×40، والعقدة تحته. الحجم 80×104
function makeBalloonSprite(col: [string, string, string]): HTMLCanvasElement {
  const s = document.createElement('canvas');
  s.width = 80;
  s.height = 104;
  const g = s.getContext('2d');
  if (!g) return s;
  // العقدة
  g.fillStyle = col[2];
  g.beginPath();
  g.moveTo(40, 79);
  g.lineTo(34.5, 89);
  g.quadraticCurveTo(40, 86, 45.5, 89);
  g.closePath();
  g.fill();
  // الجسم
  const gr = g.createRadialGradient(28, 24, 4, 40, 42, 52);
  gr.addColorStop(0, col[0]);
  gr.addColorStop(0.45, col[1]);
  gr.addColorStop(1, col[2]);
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(40, 80);
  g.bezierCurveTo(14, 70, 5, 52, 6, 38);
  g.bezierCurveTo(7, 14, 24, 0, 40, 0);
  g.bezierCurveTo(56, 0, 73, 14, 74, 38);
  g.bezierCurveTo(75, 52, 66, 70, 40, 80);
  g.closePath();
  g.fill();
  // لمعة
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.beginPath();
  g.ellipse(26, 22, 6.5, 11, -0.5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath();
  g.arc(35, 10, 2.4, 0, Math.PI * 2);
  g.fill();
  return s;
}

// دبدوب صغير (جالس، 120×120): مركزه (60,60)، الأرجل تحت عند y≈110
function makeBearSprite(col: [string, string, string, string]): HTMLCanvasElement {
  const s = document.createElement('canvas');
  s.width = 120;
  s.height = 120;
  const g = s.getContext('2d');
  if (!g) return s;
  const [fur, dark, light, bow] = col;
  const line = 'rgba(70,35,20,0.45)';
  const ell = (x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient, rot = 0, stroke = true) => {
    g.beginPath();
    g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
    if (stroke) { g.lineWidth = 1.6; g.strokeStyle = line; g.stroke(); }
  };
  const furGrad = (x: number, y: number, r: number) => {
    const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r * 1.1);
    gr.addColorStop(0, light === '#fffaf0' ? '#ffffff' : fur);
    gr.addColorStop(1, dark);
    return gr;
  };
  // الأرجل
  ell(42, 100, 13, 11, fur);
  ell(78, 100, 13, 11, fur);
  ell(42, 102, 6.5, 5, light, 0, false);
  ell(78, 102, 6.5, 5, light, 0, false);
  // الجسم
  ell(60, 82, 26, 26, furGrad(60, 82, 26));
  ell(60, 87, 15, 16, light, 0, false);
  // الأذرع
  ell(33, 76, 10, 15, fur, -0.5);
  ell(87, 76, 10, 15, fur, 0.5);
  // الأذنين
  ell(36, 26, 12, 12, furGrad(36, 26, 12));
  ell(84, 26, 12, 12, furGrad(84, 26, 12));
  ell(36, 27, 6.5, 6.5, light, 0, false);
  ell(84, 27, 6.5, 6.5, light, 0, false);
  // الرأس
  ell(60, 44, 28, 27, furGrad(60, 44, 28));
  // الفيونكة
  g.fillStyle = bow;
  g.beginPath();
  g.moveTo(60, 70);
  g.lineTo(46, 63);
  g.lineTo(46, 77);
  g.closePath();
  g.fill();
  g.beginPath();
  g.moveTo(60, 70);
  g.lineTo(74, 63);
  g.lineTo(74, 77);
  g.closePath();
  g.fill();
  g.beginPath();
  g.arc(60, 70, 4.5, 0, Math.PI * 2);
  g.fill();
  // الوجه
  ell(60, 54, 13, 10, light, 0, false);
  ell(43, 53, 4.2, 3.2, 'rgba(255,120,150,0.4)', 0, false);
  ell(77, 53, 4.2, 3.2, 'rgba(255,120,150,0.4)', 0, false);
  ell(49, 42, 3.6, 4.2, '#2b1a14', 0, false);
  ell(71, 42, 3.6, 4.2, '#2b1a14', 0, false);
  ell(50, 40.6, 1.2, 1.2, '#ffffff', 0, false);
  ell(72, 40.6, 1.2, 1.2, '#ffffff', 0, false);
  ell(60, 50, 4.8, 3.4, '#2b1a14', 0, false);
  g.strokeStyle = '#2b1a14';
  g.lineWidth = 1.8;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(60, 53);
  g.quadraticCurveTo(60, 59, 55, 58);
  g.moveTo(60, 53);
  g.quadraticCurveTo(60, 59, 65, 58);
  g.stroke();
  return s;
}

// ═══════════════════════════════════════════════════════════════════════
//  Preview — دبدوب يمسك 3 بالونات ملونة داخل مربع الهدايا
// ═══════════════════════════════════════════════════════════════════════
const BG_CSS = `
@keyframes bg-swing{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}
@keyframes bg-squish{0%,84%,100%{transform:scale(1,1)}91%{transform:scale(1.12,.88)}96%{transform:scale(.97,1.04)}}
@keyframes bg-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.6px)}}
@keyframes bg-twinkle{0%,100%{opacity:0;transform:scale(.2) rotate(0deg)}50%{opacity:1;transform:scale(1) rotate(90deg)}}
.bg-swing{animation:bg-swing 2.8s ease-in-out infinite;transform-box:view-box;transform-origin:50.5px 65px}
.bg-squish{animation:bg-squish 3.1s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 100%}
.bg-bob{animation:bg-bob 1.4s ease-in-out infinite}
.bg-twinkle{animation:bg-twinkle 2s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}
`;

function BalloonPreview({ size = 40 }: { size?: number }) {
  const uid = React.useId().replace(/:/g, '');
  const h = size;
  const w = Math.round(size * 0.9);
  const ref = (n: string) => `url(#${n}${uid})`;
  const star = 'M0 -5 L1.4 -1.4 L5 0 L1.4 1.4 L0 5 L-1.4 1.4 L-5 0 L-1.4 -1.4 Z';
  return (
    <motion.div
      aria-hidden="true"
      animate={{ y: [0, -1.5, 0] }}
      transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
      style={{ position: 'relative', width: w, height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
    >
      <style>{BG_CSS}</style>
      <svg width={w} height={h} viewBox="0 0 90 100" style={{ display: 'block', overflow: 'visible', filter: 'drop-shadow(0 0 4px rgba(255,120,170,0.45))' }}>
        <defs>
          {BALLOON_COLS.slice(0, 3).map((col, i) => (
            <radialGradient key={i} id={`b${i}${uid}`} cx="35%" cy="28%" r="80%">
              <stop offset="0%" stopColor={col[0]} />
              <stop offset="48%" stopColor={col[1]} />
              <stop offset="100%" stopColor={col[2]} />
            </radialGradient>
          ))}
          <radialGradient id={`fur${uid}`} cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#e2a96c" />
            <stop offset="100%" stopColor="#a56a3a" />
          </radialGradient>
        </defs>

        {/* البالونات + حبالها */}
        <g className="bg-swing">
          <path d="M27 49 Q36 60 50.5 65" fill="none" stroke="rgba(235,235,245,0.9)" strokeWidth="0.9" />
          <path d="M63 48 Q58 60 50.5 65" fill="none" stroke="rgba(235,235,245,0.9)" strokeWidth="0.9" />
          <path d="M45 31 Q47 50 50.5 65" fill="none" stroke="rgba(235,235,245,0.9)" strokeWidth="0.9" />
          {[
            { cx: 45, cy: 17, rx: 12, ry: 15, g: 1, d: 0.5 },
            { cx: 27, cy: 33, rx: 14, ry: 17, g: 0, d: 0 },
            { cx: 63, cy: 32, rx: 13, ry: 16, g: 2, d: 1.1 },
          ].map((b, i) => (
            <g key={i} className="bg-squish" style={{ animationDelay: `${b.d}s` }}>
              <polygon points={`${b.cx},${b.cy + b.ry - 1} ${b.cx - 3},${b.cy + b.ry + 4} ${b.cx + 3},${b.cy + b.ry + 4}`} fill={BALLOON_COLS[b.g][2]} />
              <ellipse cx={b.cx} cy={b.cy} rx={b.rx} ry={b.ry} fill={ref(`b${b.g}`)} />
              <ellipse cx={b.cx - b.rx * 0.38} cy={b.cy - b.ry * 0.38} rx={b.rx * 0.2} ry={b.ry * 0.3} fill="#fff" fillOpacity="0.5" transform={`rotate(-25 ${b.cx - b.rx * 0.38} ${b.cy - b.ry * 0.38})`} />
            </g>
          ))}
        </g>

        {/* الدبدوب */}
        <g className="bg-bob">
          <circle cx="37.5" cy="70" r="4.2" fill={ref('fur')} />
          <circle cx="52.5" cy="70" r="4.2" fill={ref('fur')} />
          <circle cx="37.5" cy="70.3" r="2" fill="#f0d3a8" />
          <circle cx="52.5" cy="70.3" r="2" fill="#f0d3a8" />
          <ellipse cx="45" cy="92" rx="11" ry="8" fill={ref('fur')} />
          <ellipse cx="45" cy="93" rx="6" ry="5.5" fill="#f0d3a8" />
          <ellipse cx="35" cy="90" rx="3.6" ry="5.2" fill="#b87a45" transform="rotate(-20 35 90)" />
          <path d="M55 89 Q56 76 50.5 66" fill="none" stroke="#b87a45" strokeWidth="5" strokeLinecap="round" />
          <circle cx="50.5" cy="65.5" r="3.2" fill="#c78a52" />
          <circle cx="45" cy="77" r="10" fill={ref('fur')} />
          <ellipse cx="45" cy="81" rx="4.6" ry="3.5" fill="#f0d3a8" />
          <circle cx="41.3" cy="75.5" r="1.4" fill="#2b1a14" />
          <circle cx="48.7" cy="75.5" r="1.4" fill="#2b1a14" />
          <ellipse cx="45" cy="79.6" rx="1.7" ry="1.2" fill="#2b1a14" />
          <polygon points="45,86 40,84.2 40,88.4" fill="#e11d3a" />
          <polygon points="45,86 50,84.2 50,88.4" fill="#e11d3a" />
        </g>

        {/* نجوم تلمع */}
        {[
          { x: 9, y: 12, d: 0 },
          { x: 82, y: 14, d: 0.7 },
          { x: 85, y: 56, d: 1.3 },
          { x: 6, y: 58, d: 1.7 },
        ].map((s, i) => (
          <g key={i} transform={`translate(${s.x} ${s.y})`}>
            <path className="bg-twinkle" d={star} fill="#fff" style={{ animationDelay: `${s.d}s`, filter: 'drop-shadow(0 0 2px rgba(255,170,200,0.95))' }} />
          </g>
        ))}
      </svg>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  Animation — أنميشن ملء الشاشة (Canvas)
// ═══════════════════════════════════════════════════════════════════════
interface Balloon {
  x: number; y: number; bx: number;       // مركز الجسم (bx = مركز التمايل)
  rx: number; ry: number;
  vx: number; vy: number;
  col: number; ph: number; amp: number; sl: number;
  sq: number; sqv: number;                // ضغط (spring)
}
interface Bear {
  x: number; y: number; vx: number; vy: number;
  rot: number; vr: number; s: number; spr: number;
  state: 0 | 1 | 2;                        // 0 يسقط، 1 ثابت على الإطار، 2 جالس على زر
  a: number; cd: number; bnc: number; sqz: number; seed: number;
  hotEl: Element | null; ox: number; until: number;
  ignore: Element | null; ignoreUntil: number;
}
interface Pa { k: 0 | 1; x: number; y: number; vx: number; vy: number; rot: number; vr: number; size: number; life: number; age: number; grav: number; col: string; }
interface Hot { el: Element; x: number; y: number; w: number; h: number; rad: number; heat: number; }
interface Lift { sx: number; sy: number; sr: number; ex: number; ey: number; R: number; img: HTMLImageElement | null; letter: string; name: string; restore: () => void; done?: boolean; }
interface LiftInfo { userId: string; name?: string; avatarUrl?: string | null; }

// وضع الرفع: الهدية لمتحدث → صورته تنرفع بحبل بالونة (المعلومات يحطها LiveCoinsDock)
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
    const ey = H * 0.44;
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

function BalloonAnimation({ onDone }: { onDone: () => void }) {
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

    // صورة المستلم (لو الهدية لمتحدث)
    let liftPre: HTMLImageElement | null = null;
    const info0 = getLiftInfo();
    if (info0 && info0.avatarUrl) {
      try { liftPre = new Image(); liftPre.src = String(info0.avatarUrl); } catch { liftPre = null; }
    }
    const L = findLift(W, H, liftPre);
    const R = L ? L.R : 0;

    // ── السبرايتات ──
    const BAL = BALLOON_COLS.map(makeBalloonSprite);
    const BEAR = BEAR_COLS.map(makeBearSprite);
    const GLOW = makeGlow('255,200,230', 0.3);
    const GLOW2 = makeGlow('255,236,170', 0.25);
    const blob = (sp: HTMLCanvasElement, x: number, y: number, r: number, a: number) => {
      if (a <= 0.003 || r <= 0.2) return;
      c.globalAlpha = Math.min(1, a);
      c.drawImage(sp, x - r, y - r, r * 2, r * 2);
    };

    // ── الأصوات ──
    const snd = playBalloonSound({
      mode: L ? 'lift' : 'host',
      totalS: TOTAL_S,
      whooshAt: L ? [0.1, 1.0, A_CENTER, B_START, RET_AT] : [0.1, 1.2, 2.5, 3.9, 5.3],
      tingAt: L ? [A_GRAB, B_GRAB] : [],
    });

    // ── أنظمة ──
    const bals: Balloon[] = [];
    const bears: Bear[] = [];
    const parts: Pa[] = [];
    const acc = { bal: 0, bear: 0, conf: 0, spark: 0 };
    let hots: Hot[] = [];
    let hotMap = new Map<Element, Hot>();
    let nextHotAt = 0;
    let stuckCount = 0;
    let grabAFx = false;
    let grabBFx = false;

    const newBalloon = (extraBelow = 0): Balloon => {
      const rx = rnd(24, 38) * k;
      const ry = (rx * 40) / 34;
      const sl = rnd(60, 110) * k;
      const x = rnd(0.07, 0.93) * W;
      return {
        x, bx: x, y: H + ry + 12 + extraBelow, rx, ry, vx: 0, vy: -rnd(90, 150) * k,
        col: pickI(BALLOON_COLS.length), ph: rnd(0, 6.28), amp: rnd(8, 20) * k, sl, sq: 0, sqv: 0,
      };
    };
    // أول 6 بالونات تدخل متتابعة
    for (let i = 0; i < 6; i++) bals.push(newBalloon(i * 55 * k));

    // بالونات الرفع (A: أولى، B: ثانية) — تُستخدم كحاجز للدببة أيضاً
    const mkLiftBalloon = (col: number): Balloon => {
      const rx = Math.max(34, R * 0.78) * (L ? 1 : 0);
      return { x: -999, y: -999, bx: 0, rx, ry: (rx * 40) / 34, vx: 0, vy: 0, col, ph: rnd(0, 6.28), amp: 0, sl: Math.max(60, 0.16 * H) * 0.9, sq: 0, sqv: 0 };
    };
    const balA = mkLiftBalloon(0);
    const balB = mkLiftBalloon(2);
    const liftBals: { b: Balloon; on: boolean }[] = [{ b: balA, on: false }, { b: balB, on: false }];

    // ── DOM: العناصر اللي الدببة تنزل عليها ──
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
          // عنصر الصورة المرفوعة (وأي شي فيه/حواليه) ما تنزل عليه الدببة
          if (L && (el.hasAttribute('data-gift-lift') || el.closest('[data-gift-lift]') || el.querySelector('[data-gift-lift]'))) return;
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
    const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
      const rr = Math.min(r, w / 2, h / 2);
      c.beginPath();
      c.moveTo(x + rr, y);
      c.arcTo(x + w, y, x + w, y + h, rr);
      c.arcTo(x + w, y + h, x, y + h, rr);
      c.arcTo(x, y + h, x, y, rr);
      c.arcTo(x, y, x + w, y, rr);
      c.closePath();
    };

    // ── جسيمات (نجوم + قصاصات) ──
    const addPart = (p: Omit<Pa, 'age'>) => { if (parts.length < 320) parts.push({ ...p, age: 0 }); };
    const pop = (x: number, y: number, nStar: number, nConf: number, spd: number) => {
      for (let i = 0; i < nStar; i++) {
        const a = rnd(0, Math.PI * 2), sp = rnd(0.2, 1) * spd;
        addPart({ k: 0, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: rnd(0, 6.28), vr: rnd(-3, 3), size: rnd(5, 11) * k, life: rnd(0.4, 0.85), grav: 0, col: '#fff' });
      }
      for (let i = 0; i < nConf; i++) {
        const a = rnd(0, Math.PI * 2), sp = rnd(0.3, 1) * spd;
        addPart({ k: 1, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 50 * k, rot: rnd(0, 6.28), vr: rnd(-8, 8), size: rnd(3, 6) * k, life: rnd(0.9, 1.7), grav: 240 * k, col: CONFETTI[pickI(CONFETTI.length)] });
      }
    };
    const drawStar = (x: number, y: number, r: number, alpha: number, rot: number) => {
      c.save();
      c.translate(x, y);
      c.rotate(rot);
      c.globalAlpha = alpha;
      c.fillStyle = '#fff';
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI) / 4;
        const rad = i % 2 === 0 ? r : r * 0.22;
        const px = Math.cos(ang) * rad, py = Math.sin(ang) * rad;
        if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath();
      c.fill();
      c.restore();
    };
    const stepParts = (dt: number, fade: number) => {
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.age += dt;
        if (p.age >= p.life || p.y > H + 20) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
        p.vy += p.grav * dt;
        p.vx *= 1 - 0.9 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        const u = p.age / p.life;
        if (p.k === 0) {
          const e = Math.sin(Math.PI * u) * fade;
          c.save();
          c.globalCompositeOperation = 'lighter';
          blob(GLOW2, p.x, p.y, p.size * 1.8, 0.5 * e);
          c.restore();
          drawStar(p.x, p.y, p.size * (0.6 + 0.4 * Math.sin(Math.PI * u)), e, p.rot * 0.3);
        } else {
          c.save();
          c.translate(p.x, p.y);
          c.rotate(p.rot);
          c.scale(1, Math.max(0.15, Math.abs(Math.cos(p.age * 7 + p.rot))));
          c.globalAlpha = (1 - smooth((u - 0.65) / 0.35)) * fade;
          c.fillStyle = p.col;
          c.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2);
          c.restore();
        }
      }
      c.globalAlpha = 1;
    };

    // ── رسم بالونة بحبلها ──
    const drawBalloon = (b: Balloon, fx: number, fy: number, alpha: number, t: number, slack: number) => {
      const sc = b.rx / 34;
      const kx = b.x;
      const ky = b.y + b.ry + 6 * sc;
      c.globalAlpha = alpha * 0.85;
      c.strokeStyle = 'rgba(236,236,248,0.9)';
      c.lineWidth = Math.max(1, 1.3 * k);
      c.beginPath();
      c.moveTo(kx, ky);
      c.quadraticCurveTo((kx + fx) / 2 + Math.sin(t * 2.1 + b.ph) * 10 * k * slack, (ky + fy) / 2, fx, fy);
      c.stroke();
      c.save();
      c.translate(b.x, b.y);
      c.scale(1 + b.sq * 0.32, 1 - b.sq * 0.42);
      c.globalAlpha = alpha;
      c.drawImage(BAL[b.col], -40 * sc, -40 * sc, 80 * sc, 104 * sc);
      c.restore();
    };

    // ── مسار الإطار (وضع الرفع) ──
    const topY = L ? Math.max(R + 100 * k, H * 0.24) : 0;
    const sagY = L ? L.ey + SAG * k : 0;
    const avatarAt = (t: number) => {
      if (!L) return { ax: 0, ay: 0, ar: 0 };
      let ax = L.sx, ay = L.sy, ar = L.sr;
      if (t >= A_GRAB && t < A_CENTER) {
        const p = smooth((t - A_GRAB) / (A_CENTER - A_GRAB));
        ax = lerp(L.sx, L.ex, p); ay = lerp(L.sy, L.ey, p); ar = lerp(L.sr, R, p);
      } else if (t >= A_CENTER && t < B_GRAB) {
        const p = smooth((t - A_CENTER - 0.25) / (B_GRAB - A_CENTER - 0.25));
        ax = L.ex; ay = lerp(L.ey, sagY, p); ar = R;
      } else if (t >= B_GRAB && t < B_TOP) {
        const p = smooth((t - B_GRAB) / (B_TOP - B_GRAB));
        ax = L.ex; ay = lerp(sagY, topY, p); ar = R;
      } else if (t >= B_TOP && t < RET_AT) {
        ax = L.ex; ay = topY; ar = R;
      } else if (t >= RET_AT && t < RET_END) {
        const p = smooth((t - RET_AT) / (RET_END - RET_AT));
        ax = lerp(L.ex, L.sx, p); ay = lerp(topY, L.sy, p); ar = lerp(R, L.sr, p);
      }
      if (t >= A_CENTER && t < RET_AT) ay += Math.sin(t * 2.6) * 3 * k;
      return { ax, ay, ar };
    };
    // نقطة طرف الحبل لكل بالونة رفع (K)
    const kA = (t: number, av: { ax: number; ay: number; ar: number }) => {
      if (t < A_GRAB) {
        const u = smooth(t / A_GRAB);
        const y0 = H + balA.sl + balA.ry * 2 + 30;
        return { x: L!.sx, y: lerp(y0, L!.sy - L!.sr, u), on: true, attached: false };
      }
      if (t < A_CENTER) return { x: av.ax, y: av.ay - av.ar, on: true, attached: true };
      const u = clamp01((t - A_CENTER) / A_OFF_S);
      const yTop = L!.ey - R;
      return { x: L!.ex + Math.sin(u * 3) * 24 * k, y: yTop - (yTop + balA.sl + balA.ry * 2 + 60) * u * u, on: u < 1, attached: false };
    };
    const kB = (t: number, av: { ax: number; ay: number; ar: number }) => {
      if (t < B_START) return { x: L!.ex, y: H + 999, on: false, attached: false };
      if (t < B_GRAB) {
        const u = smooth((t - B_START) / (B_GRAB - B_START));
        const y0 = H + balB.sl + balB.ry * 2 + 30;
        return { x: L!.ex, y: lerp(y0, sagY - R, u), on: true, attached: false };
      }
      if (t < RET_AT) return { x: av.ax, y: av.ay - av.ar, on: true, attached: true };
      const u = clamp01((t - RET_AT) / B_OFF_S);
      const yTop = topY - R;
      return { x: L!.ex + Math.sin(u * 3) * 20 * k, y: yTop - (yTop + balB.sl + balB.ry * 2 + 60) * u * u, on: u < 1, attached: false };
    };

    // ── فيزياء الدببة ──
    const newBear = (t: number, ax: number, ar: number): Bear => {
      const s = rnd(30, 42) * k;
      const near = L && t > A_GRAB - 0.5 && t < RET_AT && Math.random() < 0.55;
      const x = near ? ax + rnd(-1.1, 1.1) * ar : rnd(0.04, 0.96) * W;
      return {
        x, y: -s, vx: rnd(-25, 25) * k, vy: rnd(40, 120) * k, rot: rnd(-0.5, 0.5), vr: rnd(-3, 3), s, spr: pickI(BEAR.length),
        state: 0, a: 0, cd: 0, bnc: 0, sqz: 0, seed: rnd(0, 6.28), hotEl: null, ox: 0, until: 0, ignore: null, ignoreUntil: 0,
      };
    };
    let lastBoingFx = 0;

    // ── الحلقة ──
    let raf = 0;
    const t0 = performance.now();
    let last = t0;

    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const endFade = 1 - smooth((t - (TOTAL_S - FADE_OUT)) / FADE_OUT);
      const inFade = smooth(t / FADE_IN);

      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;

      if (t >= nextHotAt) {
        hots = collectHot(hots);
        hotMap = new Map<Element, Hot>(hots.map(h => [h.el, h] as [Element, Hot]));
        nextHotAt = t + 0.5;
      }

      // خلفية ملونة خفيفة (وردي ← أزرق)
      {
        const g = c.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, 'rgba(255,120,200,0.12)');
        g.addColorStop(0.55, 'rgba(120,120,255,0.06)');
        g.addColorStop(1, 'rgba(70,190,255,0.14)');
        c.globalAlpha = inFade * endFade;
        c.fillStyle = g;
        c.fillRect(0, 0, W, H);
        c.globalAlpha = 1;
      }

      // ═══ البالونات المتطايرة ═══
      if (t < BAL_END) {
        acc.bal += dt * BAL_RATE;
        while (acc.bal >= 1) { acc.bal--; if (bals.length < MAX_BALLOONS) bals.push(newBalloon()); }
      }
      for (let i = bals.length - 1; i >= 0; i--) {
        const b = bals[i];
        b.y += b.vy * dt;
        b.x = b.bx + Math.sin(t * 1.2 + b.ph) * b.amp;
        b.vx = Math.cos(t * 1.2 + b.ph) * b.amp * 1.2;
        b.sqv += (-130 * b.sq - 7 * b.sqv) * dt;
        b.sq = Math.max(-0.4, Math.min(0.9, b.sq + b.sqv * dt));
        if (b.y < -b.ry - 30) { bals[i] = bals[bals.length - 1]; bals.pop(); continue; }
        const sc = b.rx / 34;
        const kx = b.x, ky = b.y + b.ry + 6 * sc;
        drawBalloon(b, kx + Math.sin(t * 1.8 + b.ph) * 12 * k, ky + b.sl, endFade, t, 1);
      }

      // ═══ الإطار + بالونتي الرفع ═══
      let av = { ax: 0, ay: 0, ar: 0 };
      let avActive = false;
      if (L) {
        av = avatarAt(t);
        const showAv = t < RET_END + 0.2;
        const kAv = kA(t, av);
        const kBv = kB(t, av);

        // تأثير لحظة الإمساك
        if (!grabAFx && t >= A_GRAB) { grabAFx = true; pop(av.ax, av.ay - av.ar, 8, 8, 200 * k); }
        if (!grabBFx && t >= B_GRAB) { grabBFx = true; pop(av.ax, av.ay - av.ar, 8, 8, 200 * k); }

        // موضع بالونتي الرفع من طرف الحبل
        const place = (b: Balloon, K: { x: number; y: number }, attached: boolean, idx: number) => {
          const sc = b.rx / 34;
          const swayX = Math.sin(t * 2.4 + b.ph) * (attached ? 5 : 14) * k;
          const nx = K.x + swayX;
          const ny = K.y - b.sl - b.ry - 6 * sc;
          if (dt > 0) { b.vy = (ny - b.y) / dt; b.vx = (nx - b.x) / dt; }
          if (b.y === -999) { b.vy = 0; b.vx = 0; }
          b.x = nx; b.y = ny;
          b.sqv += (-130 * b.sq - 7 * b.sqv) * dt;
          b.sq = Math.max(-0.4, Math.min(0.9, b.sq + b.sqv * dt));
          liftBals[idx].on = true;
        };
        liftBals[0].on = false; liftBals[1].on = false;
        if (kAv.on) place(balA, kAv, kAv.attached, 0);
        if (kBv.on) place(balB, kBv, kBv.attached, 1);

        // الإطار
        if (showAv) {
          const { ax, ay, ar } = av;
          const grabbed = t >= A_GRAB;
          c.save();
          c.globalCompositeOperation = 'lighter';
          blob(GLOW, ax, ay, ar * 2.3, (grabbed ? 0.35 : 0.1) * endFade * (0.85 + 0.15 * Math.sin(t * 5)));
          c.restore();
          const aAl = clamp01(t / 0.25) * (t > RET_END ? 1 - clamp01((t - RET_END) / 0.2) : 1);
          c.save();
          c.globalAlpha = aAl;
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
            c.fillStyle = '#1d2f4a';
            c.fillRect(ax - ar, ay - ar, ar * 2, ar * 2);
            c.fillStyle = '#7cc8ff';
            c.font = `800 ${Math.round(ar * 1.0)}px sans-serif`;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(L.letter, ax, ay + ar * 0.04);
          }
          c.restore();
          c.beginPath();
          c.arc(ax, ay, ar, 0, Math.PI * 2);
          c.lineWidth = Math.max(2, ar * 0.07);
          c.strokeStyle = 'rgba(255,205,90,0.97)';
          c.shadowColor = 'rgba(255,120,190,0.9)';
          c.shadowBlur = 14;
          c.stroke();
          c.restore();
          // الاسم
          if (grabbed && t < RET_AT + 0.3) {
            c.save();
            c.globalAlpha = clamp01((t - A_GRAB) * 2) * (1 - clamp01((t - RET_AT) / 0.3)) * endFade;
            c.font = `800 ${Math.round(Math.max(12, ar * 0.3))}px sans-serif`;
            c.textAlign = 'center';
            c.textBaseline = 'top';
            c.shadowColor = 'rgba(0,0,0,0.9)';
            c.shadowBlur = 6;
            c.fillStyle = '#fff4d6';
            c.fillText(L.name.length > 18 ? L.name.slice(0, 17) + '…' : L.name, ax, ay + ar + 10 * k);
            c.restore();
          }
        }
        avActive = t >= A_GRAB && t < RET_AT;
        if (t >= RET_END && !L.done) { L.done = true; L.restore(); }

        // رسم بالونتي الرفع (فوق الإطار)
        if (liftBals[0].on) drawBalloon(balA, kAv.x, kAv.y, endFade, t, kAv.attached ? 0.15 : 1);
        if (liftBals[1].on) drawBalloon(balB, kBv.x, kBv.y, endFade, t, kBv.attached ? 0.15 : 1);
      }

      // ═══ توهج الأزرار اللي نزل عليها دبدوب ═══
      for (const h of hots) {
        if (h.heat > 0.02) {
          c.save();
          roundRect(h.x, h.y, h.w, h.h, h.rad);
          c.globalAlpha = Math.min(1, h.heat) * 0.7 * endFade;
          c.lineWidth = 2.5;
          c.strokeStyle = 'rgba(255,200,230,0.95)';
          c.shadowColor = 'rgba(255,110,190,0.95)';
          c.shadowBlur = 14;
          c.stroke();
          c.restore();
          h.heat = Math.max(0, h.heat - dt * 1.8);
        }
      }

      // ═══ قصاصات ملونة من فوق ═══
      if (t > 0.2 && t < TOTAL_S - 1.2) {
        acc.conf += dt * 7;
        while (acc.conf >= 1) {
          acc.conf--;
          addPart({ k: 1, x: rnd(0, W), y: -6, vx: rnd(-25, 25) * k, vy: rnd(40, 110) * k, rot: rnd(0, 6.28), vr: rnd(-6, 6), size: rnd(3, 5.5) * k, life: rnd(2.2, 3.6), grav: 30 * k, col: CONFETTI[pickI(CONFETTI.length)] });
        }
      }

      // ═══ الدببة ═══
      if (t > BEAR_START && t < BEAR_END) {
        acc.bear += dt * BEAR_RATE;
        while (acc.bear >= 1) { acc.bear--; if (bears.length < MAX_BEARS) bears.push(newBear(t, av.ax, av.ar)); }
      }
      // البالونات القابلة للاصطدام
      const colls: Balloon[] = bals.slice();
      if (L) { if (liftBals[0].on) colls.push(balA); if (liftBals[1].on) colls.push(balB); }

      for (let i = bears.length - 1; i >= 0; i--) {
        const b = bears[i];
        const feetOff = b.s * 0.43;
        b.cd -= dt;
        b.sqz = Math.max(0, b.sqz - dt * 4);

        // تحرير الدببة الثابتة على الإطار لما يرجع
        if (b.state === 1 && (!L || t >= RET_AT)) {
          b.state = 0;
          b.vx = rnd(-120, 120) * k;
          b.vy = -rnd(120, 220) * k;
          b.vr = rnd(-4, 4);
          stuckCount = Math.max(0, stuckCount - 1);
        }

        if (b.state === 1) {
          // ثابت على الإطار
          const dd = av.ar + b.s * 0.36;
          b.x = av.ax + Math.cos(b.a) * dd;
          b.y = av.ay + Math.sin(b.a) * dd;
          b.rot = b.a + Math.PI / 2;
        } else if (b.state === 2) {
          // جالس على زر
          const hh = b.hotEl ? hotMap.get(b.hotEl) : undefined;
          const top = hh ? topAt(hh, b.x) : null;
          if (!hh || top === null || t >= b.until) {
            b.state = 0;
            b.vx = (Math.random() < 0.5 ? -1 : 1) * rnd(60, 140) * k;
            b.vy = -rnd(140, 240) * k;
            b.vr = rnd(-4, 4);
            b.ignore = b.hotEl;
            b.ignoreUntil = t + 0.6;
            b.hotEl = null;
          } else {
            b.x = Math.min(hh.x + hh.w, Math.max(hh.x, hh.x + b.ox));
            b.y = (topAt(hh, b.x) ?? top) - feetOff * (1 - b.sqz * 0.25);
            let da = ((b.rot % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
            da = -da;
            b.rot += da * Math.min(1, dt * 10) + Math.sin(t * 6 + b.seed) * 0.002;
          }
        } else {
          // يسقط
          const pfeet = b.y + feetOff;
          b.vy += GRAV * k * dt;
          b.x += (b.vx + Math.sin(t * 2 + b.seed) * 14 * k) * dt;
          b.y += b.vy * dt;
          b.rot += b.vr * dt;
          if (b.y > H + b.s * 2 || b.x < -b.s * 2 || b.x > W + b.s * 2) { bears[i] = bears[bears.length - 1]; bears.pop(); continue; }

          // اصطدام بالبالونات
          const tr = b.s * 0.33;
          for (let j = 0; j < colls.length; j++) {
            const bl = colls[j];
            if (b.cd > 0) break;
            if (bl.y < -bl.ry * 2 || bl.y > H + bl.ry * 2) continue;
            const ex = bl.rx + tr * 0.7, ey = bl.ry + tr * 0.7;
            const dx = b.x - bl.x, dy = b.y - bl.y;
            const q = (dx * dx) / (ex * ex) + (dy * dy) / (ey * ey);
            if (q < 1) {
              let nx = dx / (ex * ex), ny = dy / (ey * ey);
              const nl = Math.hypot(nx, ny) || 1;
              nx /= nl; ny /= nl;
              const vn = (b.vx - bl.vx) * nx + (b.vy - bl.vy) * ny;
              if (vn < 0) {
                const e = 0.62;
                b.vx += -(1 + e) * vn * nx + nx * rnd(10, 60) * k;
                b.vy += -(1 + e) * vn * ny;
                b.vr += nx * 3 + rnd(-1, 1);
                b.cd = 0.12;
                const f = 1.01 / Math.sqrt(Math.max(q, 0.01));
                b.x = bl.x + dx * f;
                b.y = bl.y + dy * f;
                bl.sqv += Math.min(5, -vn / 180);
                b.sqz = 1;
                const speed = -vn;
                if (speed > 120 * k) {
                  if (t - lastBoingFx > 0.09) { lastBoingFx = t; pop(b.x, b.y, 2, 1, 120 * k); }
                  snd.boing(Math.min(1, speed / (600 * k)));
                }
              }
            }
          }

          // اصطدام بالإطار (وضع الرفع)
          if (L && avActive && b.state === 0 && b.vy > 0) {
            const dx = b.x - av.ax, dy = b.y - av.ay;
            const dist = Math.hypot(dx, dy);
            if (dist < av.ar + b.s * 0.3 && dy < av.ar * 0.35) {
              const a = Math.atan2(dy, dx);
              let gapOk = true;
              for (const o of bears) {
                if (o.state === 1) {
                  let dA = Math.abs(o.a - a);
                  if (dA > Math.PI) dA = Math.PI * 2 - dA;
                  if (dA < MIN_GAP) { gapOk = false; break; }
                }
              }
              if (stuckCount < MAX_STUCK && gapOk && Math.random() < STICK_CHANCE) {
                b.state = 1; b.a = a; b.sqz = 1; stuckCount++;
                pop(av.ax + Math.cos(a) * av.ar, av.ay + Math.sin(a) * av.ar, 4, 4, 140 * k);
                snd.land();
              } else {
                const nx = Math.cos(a), ny = Math.sin(a);
                const vn = b.vx * nx + b.vy * ny;
                b.vx -= 1.5 * vn * nx;
                b.vy -= 1.5 * vn * ny;
                b.vx += (nx >= 0 ? 1 : -1) * rnd(40, 100) * k;
                b.x = av.ax + nx * (av.ar + b.s * 0.4);
                b.y = av.ay + ny * (av.ar + b.s * 0.4);
                b.sqz = 1;
                snd.boing(0.4);
              }
            }
          }

          // نزول على الأزرار
          if (b.state === 0 && b.vy > 0) {
            const feet = b.y + feetOff;
            for (const h of hots) {
              if (b.ignore === h.el && t < b.ignoreUntil) continue;
              const top = topAt(h, b.x);
              if (top === null) continue;
              if (pfeet <= top + 3 && feet >= top && b.y < top) {
                b.y = top - feetOff;
                h.heat = 1;
                b.sqz = 1;
                pop(b.x, top, 3, 3, 130 * k);
                snd.land();
                if (b.bnc < 2 && b.vy > 140 * k) {
                  b.vy = -b.vy * 0.38;
                  b.vx *= 0.6;
                  b.bnc++;
                } else {
                  b.state = 2;
                  b.hotEl = h.el;
                  b.ox = b.x - h.x;
                  b.until = t + rnd(1.1, 2.3);
                  b.vx = 0; b.vy = 0; b.vr = 0;
                }
                break;
              }
            }
          }
        }

        // رسم الدبدوب
        const al = endFade;
        if (al > 0.003) {
          c.save();
          c.translate(b.x, b.y);
          c.rotate(b.rot);
          c.scale(1 + b.sqz * 0.12, 1 - b.sqz * 0.18);
          c.globalAlpha = al;
          c.drawImage(BEAR[b.spr], -b.s / 2, -b.s / 2, b.s, b.s);
          c.restore();
        }
      }

      // نجوم تلمع حول الإطار
      if (L && avActive) {
        acc.spark += dt * 8;
        while (acc.spark >= 1) {
          acc.spark--;
          const a = rnd(0, Math.PI * 2), rr = av.ar * rnd(1.05, 1.5);
          addPart({ k: 0, x: av.ax + Math.cos(a) * rr, y: av.ay + Math.sin(a) * rr, vx: 0, vy: -rnd(5, 18) * k, rot: rnd(0, 6.28), vr: rnd(-2, 2), size: rnd(5, 10) * k, life: rnd(0.5, 1), grav: 0, col: '#fff' });
        }
      }
      stepParts(dt, endFade);

      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const tDone = window.setTimeout(() => doneRef.current(), TOTAL_MS);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(tDone);
      snd.stop();
      if (L && !L.done) { L.done = true; L.restore(); }
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

export const BalloonGift: GiftDefinition = {
  id: 'balloons',
  name: 'Balloons',
  price: PRICE,
  durationMs: TOTAL_MS,
  Preview: BalloonPreview,
  Animation: BalloonAnimation,
};

export default BalloonGift;
