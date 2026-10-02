/**
 * هدية الصقر (Falcon) — 3,500 Coins — مدتها 20 ثانية
 *
 * - Preview  : داخل مربع الهدايا مشهد غابة ليلية صغير متحرك قبل النقر: قمر، أشجار تتمايل، يراعات تلمع،
 *              غراب يعبر، وصقر يحوم بدورات ويرفرف بجناحيه.
 *
 * - Animation (هدية لصاحب البث) — الأرقام بالثواني:
 *     0.0 – 2.0   : البث يتحول لغابة ليلية (أشجار تطلع من الجوانب، ضباب، قمر، يراعات، أوراق تتساقط) + نعيق غربان
 *     1.2 – 6.6   : الصقر يدخل من أعلى الشاشة ويحوم بدورات واسعة في أعلى البث
 *     6.6 – 8.8   : ينقض (يضم أجنحته) نازلاً إلى زر الإرسال بالأسفل
 *     8.8 – 9.7   : يرفرف فوق الزر ويصرخ (kak-kak)
 *     9.7 – 14.5  : يطير بدورات (لفّتين) حول المنطقة مع صرخات الصقر
 *     14.5 – 16.4 : يطير للأعلى ويصغر ويختفي، ثم الغابة تتلاشى والبث يرجع طبيعي
 *
 * - Animation (هدية من صاحب البث إلى مستخدم/متحدث) — نفس الطيران، لكن:
 *     صورة المستخدم تصعد لمنتصف البث بإطار، وبعد الدورات يطير الصقر ويقف فوق إطار صورته
 *     ويطلق صرخة صقر قوية (جناحاه ينفتحان + هزّة + موجة صدمة)، ثم يغادر والغابة تتلاشى.
 *
 * ملف مستقل: الأصوات في src/lib/falconSounds.ts (مو داخل فولدر gifts). غيّر الأرقام تحت (السعر/المدد/التوقيتات).
 *
 * ربط الأنميشن بالواجهة (يعمل تلقائياً، والاختياري يحسّنه):
 *   data-gift-send : (اختياري) ضعه على زر الإرسال في الشات ليهبط عليه الصقر بالضبط.
 *                    إذا ما وُجد: يستخدم الزر اللي بعد حقل data-gift-walk، وإلا زر اسمه Send، وإلا أسفل يمين الشاشة.
 *   data-gift-user + window.__stooornaGiftLift : (يضعها LiveCoinsDock تلقائياً) لما صاحب البث يعطي مستخدم.
 */
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { GiftDefinition } from '../../lib/types';
import { playFalconSound } from '../../lib/falconSounds';
import type { FalconCry, FalconFlap } from '../../lib/falconSounds';

// ── إعدادات الهدية ──────────────────────────────────────────────────────
const PRICE = 3500;
const TOTAL_MS = 20000;            // مدة الأنميشن الكلية (20 ثانية)
const TOTAL_S = TOTAL_MS / 1000;

const DARK_MAX = 0.68;             // قوة تعتيم الغابة (1 = أسود كامل)
const FOREST_IN = 2.0;             // مدة تحول البث لغابة
const TREES_AT = 0.2;              // بداية طلوع الأشجار
const ENTER_AT = 1.2;              // الصقر يظهر
const DIVE_AT = 6.6;               // بداية الانقضاض
const ARRIVE_AT = 8.8;             // يوصل زر الإرسال
const LOOP_AT = 9.7;               // بداية الدورات
const CAW_TIMES = [2.3, 3.7, 5.2, 6.4, 11.9, 17.4];
const OWL_TIMES = [4.5, 17.8];

const MAX_FEATHERS = 60;

/** توقيتات تختلف حسب الهدية: لصاحب البث (يختفي) أو لمستخدم (يقف على إطاره) */
function timeline(lift: boolean) {
  const loopS = lift ? 3.8 : 4.8;                  // مدة الدورات
  const loopEnd = LOOP_AT + loopS;
  const perchAt = loopEnd + 2.0;                   // يوقف على الإطار (لمستخدم)
  const screechAt = perchAt + 0.25;                // الصرخة القوية
  const leaveAt = lift ? screechAt + 2.9 : loopEnd;
  const goneAt = leaveAt + (lift ? 1.0 : 1.9);
  const forestOut = lift ? leaveAt - 1.3 : leaveAt + 0.9;
  const forestEnd = TOTAL_S - 0.5;
  return { loopS, loopEnd, perchAt, screechAt, leaveAt, goneAt, forestOut, forestEnd };
}

// ── أدوات رياضية ────────────────────────────────────────────────────────
const TAU = Math.PI * 2;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const lerpAngle = (a: number, b: number, u: number) => {
  const d = ((((b - a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  return a + d * u;
};

function makeSprite(rgb: string, soft = 0.3): HTMLCanvasElement {
  const s = document.createElement('canvas');
  s.width = 64;
  s.height = 64;
  const g = s.getContext('2d');
  if (g) {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${rgb},1)`);
    gr.addColorStop(soft, `rgba(${rgb},0.55)`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  }
  return s;
}

// ═══════════════════════════════════════════════════════════════════════
//  رسم الصقر (SVG paths) — مشترك بين المعاينة والأنميشن
//  الصقر مرسوم من الأعلى (dorsal) ووجهه لفوق (−y)، المنتصف = وسط الجسم
// ═══════════════════════════════════════════════════════════════════════
function feather(bx: number, by: number, tx: number, ty: number, w: number): string {
  const dx = tx - bx, dy = ty - by, L = Math.hypot(dx, dy);
  const nx = -dy / L, ny = dx / L;
  const mx = bx + dx * 0.78, my = by + dy * 0.78;
  const f = (v: number) => v.toFixed(1);
  return `M${f(bx + nx * w)} ${f(by + ny * w)} L${f(mx + nx * w * 0.85)} ${f(my + ny * w * 0.85)} Q${f(tx + nx * w * 0.35)} ${f(ty + ny * w * 0.35)} ${f(tx)} ${f(ty)} `
    + `Q${f(tx - nx * w * 0.5)} ${f(ty - ny * w * 0.5)} ${f(mx - nx * w * 0.85)} ${f(my - ny * w * 0.85)} L${f(bx - nx * w)} ${f(by - ny * w)}Z`;
}
const PRIM_DEF: [number, number, number, number][] = [
  [42, -30, 104, -3], [43, -24, 102, 6], [44, -18, 97, 15], [45, -12, 90, 24], [46, -6, 82, 31], [47, 0, 73, 36], [48, 5, 63, 38],
];
const PRIM = PRIM_DEF.map(([a, b, c, d]) => feather(a, b, c, d, 4.2));
const RACH = PRIM_DEF.map(([a, b, c, d]) => `M${a} ${b} L${(a + (c - a) * 0.92).toFixed(1)} ${(b + (d - b) * 0.92).toFixed(1)}`).join(' ');
const PRIM_COL = ['#28313a', '#2b343d', '#313a44', '#373f49', '#3c444e', '#434b55', '#4a525c'];
const ARM = 'M8 -24 C18 -30 30 -35 43 -31 L48 -4 C41 9 31 21 21 27 C14 28 9 25 8 17 Z';
const COV = 'M10 -23 C20 -29 31 -33 42 -29 L45 -13 C35 -9 22 -7 11 -5 Z';
const COVLINES = 'M12 -12 Q22 -16 33 -20 M12 -18 Q22 -22 34 -26 M13 -7 Q25 -11 40 -14 M16 -1 Q28 -5 44 -8';
const SEC = 'M21 27 C31 21 41 9 48 -4 L51 6 C45 18 37 30 27 35 C22 36 18 33 17 29 Z';
const SECBARS = 'M24 22 L40 10 M22 27 L36 17 M20 31 L31 24';
const TAIL = 'M-7 22 L-10.5 63 Q0 68 10.5 63 L7 22Z';
const TAILBARS = 'M-8.2 32 Q0 35 8.2 32 M-9 40 Q0 43 9 40 M-9.6 48 Q0 51 9.6 48 M-10 56 Q0 59 10 56';
const BODY = 'M0 -31 C7 -29 10.5 -15 10 -1 C9.5 12 7 24 0 32 C-7 24 -9.5 12 -10 -1 C-10.5 -15 -7 -29 0 -31Z';
const BACKSCALES = 'M-6 -14 Q0 -10 6 -14 M-6 -6 Q0 -2 6 -6 M-6 2 Q0 6 6 2 M-5 10 Q0 14 5 10 M-4 18 Q0 21 4 18';
const BEAK = 'M-3.6 -46 Q0 -57 3.6 -46 Q0 -48 -3.6 -46Z';
const CERE = 'M-3.5 -46.3 Q0 -50.5 3.5 -46.3 Q0 -43.8 -3.5 -46.3Z';

// الصقر الواقف (منظر جانبي، يطل لليمين) — المنتصف = القدمين
const P_TAIL = 'M-8 -30 L-27 5 Q-18 11 -7 6 L4 -26Z';
const P_TAILBARS = 'M-12 -18 L-2 -14 M-16 -10 L-5 -6 M-20 -2 L-8 1';
const P_BODY = 'M-6 -80 C14 -84 26 -62 22 -38 C19 -22 10 -10 -2 -8 C-16 -12 -22 -34 -18 -56 C-16 -70 -11 -78 -6 -80Z';
const P_CHEST = 'M15 -76 C28 -60 23 -34 9 -17 C1 -14 3 -30 6 -46 C8 -60 11 -70 15 -76Z';
const P_WING = 'M-13 -74 C4 -80 17 -62 13 -36 C11 -22 3 -8 -8 5 L-15 -1 C-21 -22 -23 -56 -13 -74Z';
const P_WINGSCALES = 'M-8 -64 Q0 -60 8 -64 M-10 -54 Q0 -50 10 -54 M-11 -44 Q0 -40 10 -44 M-11 -34 Q-1 -30 8 -34 M-10 -24 Q-2 -20 5 -24';
const P_BEAK_UP = 'M18 -95 Q31 -94 31 -83 Q27.5 -89 20 -88Z';
const P_BEAK_LO = 'M20 -88 Q27 -87 28 -83.5 Q23.5 -83.5 19 -85Z';
const P_MOUTH = 'M19 -88 L30 -92 L29 -80Z';
const P_CERE = 'M16.5 -95.5 L21 -96 L20 -88.5 L16.5 -89Z';
const P_MALAR = 'M11.5 -86 Q13 -79 9.5 -72 L15.5 -74 Q17.5 -81 16.5 -87Z';

// ═══════════════════════════════════════════════════════════════════════
//  Preview — مشهد غابة صغير متحرك داخل مربع الهدايا
// ═══════════════════════════════════════════════════════════════════════
const FG_CSS = `
@keyframes fg-sway{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2deg)}}
@keyframes fg-twinkle{0%,100%{opacity:.12}50%{opacity:1}}
@keyframes fg-halo{0%,100%{filter:drop-shadow(0 0 5px rgba(80,230,140,.45))}50%{filter:drop-shadow(0 0 11px rgba(120,255,170,.85))}}
@keyframes fg-moon{0%,100%{opacity:.55}50%{opacity:.95}}
@keyframes fg-fog{0%,100%{transform:translateX(-6px)}50%{transform:translateX(6px)}}
.fg-sway{animation:fg-sway 3.4s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 100%}
.fg-twinkle{animation:fg-twinkle 2.2s ease-in-out infinite}
.fg-halo{animation:fg-halo 2.4s ease-in-out infinite}
.fg-moon{animation:fg-moon 3.6s ease-in-out infinite}
.fg-fog{animation:fg-fog 5s ease-in-out infinite}
`;

const FLIES: { x: number; y: number; d: number }[] = [
  { x: 22, y: 70, d: 0 }, { x: 36, y: 58, d: 0.7 }, { x: 62, y: 74, d: 1.3 }, { x: 78, y: 62, d: 0.4 }, { x: 50, y: 80, d: 1.8 }, { x: 14, y: 48, d: 1.1 },
];

function PreviewFalconArt() {
  return (
    <g>
      {[1, -1].map(side => (
        <g key={side} transform={`scale(${side},1)`}>
          <g transform="translate(8,-18)">
            <g>
              <animateTransform attributeName="transform" type="scale" values="1 1;0.4 1;1 1" keyTimes="0;0.5;1" dur="0.62s" repeatCount="indefinite" />
              <g transform="translate(-8,18)">
                <path d={ARM} fill="#6a7783" stroke="#1d2429" strokeWidth="0.9" />
                <path d={COV} fill="#7a8896" stroke="#2b343b" strokeWidth="0.7" />
                <path d={SEC} fill="#4d5862" stroke="#1d2429" strokeWidth="0.8" />
                {PRIM.map((d, i) => <path key={i} d={d} fill={PRIM_COL[i]} stroke="#14191d" strokeWidth="0.8" />)}
              </g>
            </g>
          </g>
        </g>
      ))}
      <path d={TAIL} fill="#6c7984" stroke="#1d2429" strokeWidth="0.9" />
      <path d={TAILBARS} fill="none" stroke="#2c343c" strokeWidth="2.4" />
      <path d={BODY} fill="#7d8b98" stroke="#1d2429" strokeWidth="0.9" />
      <ellipse cx="0" cy="-38" rx="8.2" ry="9.6" fill="#2d343c" stroke="#14181c" strokeWidth="0.8" />
      <path d={BEAK} fill="#1c1c1e" />
      <path d={CERE} fill="#e6bf3a" />
      <circle cx="-6.8" cy="-40" r="2.3" fill="#e1be3c" />
      <circle cx="6.8" cy="-40" r="2.3" fill="#e1be3c" />
      <circle cx="-6.8" cy="-40" r="1.5" fill="#0a0a0a" />
      <circle cx="6.8" cy="-40" r="1.5" fill="#0a0a0a" />
    </g>
  );
}

function FalconPreview({ size = 72 }: { size?: number }) {
  const uid = React.useId().replace(/:/g, '');
  const w = Math.round(size * 1.12);
  const ref = (n: string) => `url(#${n}${uid})`;
  return (
    <motion.div
      aria-hidden="true"
      animate={{ y: [0, -2, 0] }}
      transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
      style={{ position: 'relative', width: w, height: w, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <style>{FG_CSS}</style>
      <svg width={w} height={w} viewBox="0 0 100 100" className="fg-halo" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <clipPath id={`clip${uid}`}><rect x="4" y="4" width="92" height="92" rx="18" /></clipPath>
          <linearGradient id={`sky${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0b2b30" />
            <stop offset="55%" stopColor="#0a2a1d" />
            <stop offset="100%" stopColor="#03120c" />
          </linearGradient>
          <radialGradient id={`moon${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#e9f7d8" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#9be8b0" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`fog${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#a9d6c4" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#a9d6c4" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g clipPath={ref('clip')}>
          <rect x="0" y="0" width="100" height="100" fill={ref('sky')} />
          <circle cx="75" cy="23" r="24" fill={ref('moon')} className="fg-moon" />
          <circle cx="75" cy="23" r="7.2" fill="#f1f8e4" />
          {/* أشجار بعيدة */}
          <path d="M0 100 L0 70 L7 52 L12 64 L19 44 L26 62 L31 56 L38 72 L38 100Z" fill="#06231a" />
          <path d="M60 100 L60 72 L68 56 L72 64 L80 42 L87 60 L93 50 L100 66 L100 100Z" fill="#06231a" />
          {/* ضباب */}
          <ellipse cx="50" cy="82" rx="44" ry="10" fill={ref('fog')} className="fg-fog" />
          {/* جذوع وأشجار قريبة */}
          <g className="fg-sway" style={{ animationDelay: '-1s' }}>
            <path d="M3 100 L8 100 L9 36 L5 36Z" fill="#150f0a" />
            <path d="M8 56 Q22 50 30 38" stroke="#150f0a" strokeWidth="3" fill="none" strokeLinecap="round" />
            <circle cx="7" cy="30" r="13" fill="#0b3320" />
            <circle cx="22" cy="40" r="9" fill="#0d3b25" />
            <circle cx="30" cy="35" r="7" fill="#0b3320" />
          </g>
          <g className="fg-sway">
            <path d="M92 100 L97 100 L95 32 L91 32Z" fill="#150f0a" />
            <path d="M92 52 Q78 48 70 36" stroke="#150f0a" strokeWidth="3" fill="none" strokeLinecap="round" />
            <circle cx="93" cy="27" r="13" fill="#0b3320" />
            <circle cx="78" cy="38" r="9" fill="#0d3b25" />
            <circle cx="70" cy="33" r="7" fill="#0b3320" />
          </g>
          {/* يراعات */}
          {FLIES.map((f, i) => (
            <circle key={i} cx={f.x} cy={f.y} r="1.3" fill="#d4ff7a" className="fg-twinkle" style={{ animationDelay: `${f.d}s` }} />
          ))}
          {/* غراب يعبر */}
          <g>
            <animateTransform attributeName="transform" type="translate" values="112 20;-14 14" dur="7s" repeatCount="indefinite" />
            <g>
              <path d="M-4 0 Q-1 -4 0 0 Q1 -4 4 0 Q1 -1 0 1 Q-1 -1 -4 0Z" fill="#020405">
                <animate attributeName="d" dur="0.5s" repeatCount="indefinite"
                  values="M-4 0 Q-1 -4 0 0 Q1 -4 4 0 Q1 -1 0 1 Q-1 -1 -4 0Z;M-4 -2 Q-1 2 0 0 Q1 2 4 -2 Q1 0 0 1 Q-1 0 -4 -2Z;M-4 0 Q-1 -4 0 0 Q1 -4 4 0 Q1 -1 0 1 Q-1 -1 -4 0Z" />
              </path>
            </g>
          </g>
          {/* الصقر يحوم */}
          <g>
            <animateMotion dur="6s" repeatCount="indefinite" rotate="auto" path="M20 40 C20 20 80 20 80 40 C80 60 20 60 20 40 Z" />
            <g transform="rotate(90) scale(0.2)">
              <PreviewFalconArt />
            </g>
          </g>
        </g>
        <rect x="4" y="4" width="92" height="92" rx="18" fill="none" stroke="#5ae38d" strokeOpacity="0.8" strokeWidth="2" />
      </svg>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  Animation — أنميشن ملء الشاشة (Canvas)
// ═══════════════════════════════════════════════════════════════════════
interface Lift { sx: number; sy: number; sr: number; ex: number; ey: number; R: number; img: HTMLImageElement | null; letter: string; name: string; restore: () => void; done?: boolean; }
interface LiftInfo { userId: string; name?: string; avatarUrl?: string | null; }
interface Feather { x: number; y: number; vx: number; vy: number; rot: number; vr: number; age: number; life: number; size: number; dark: boolean; }
interface Ring { x: number; y: number; born: number; dur: number; maxR: number; w: number; }
interface Crow { born: number; dir: number; y: number; dur: number; scale: number; ph: number; }
interface TreePart { pts: [number, number][]; w0: number; w1: number; }
interface Leaf { x: number; y: number; r: number; light: boolean; ph: number; }
type Pos = [number, number, number];

// معلومات المستلم يحطها LiveCoinsDock في window.__stooornaGiftLift (لما صاحب البث يعطي مستخدم)
function getLiftInfo(): LiftInfo | null {
  try {
    const d = (window as unknown as { __stooornaGiftLift?: LiftInfo }).__stooornaGiftLift;
    return d && d.userId ? d : null;
  } catch { return null; }
}

function makeLift(info: LiftInfo, W: number, H: number, pre: HTMLImageElement | null): Lift | null {
  try {
    const R = clamp(W * 0.16, 40, 64);
    const ex = W * 0.5;
    const ey = H * 0.44;
    let el: HTMLElement | null = null;
    try { el = document.querySelector<HTMLElement>(`[data-gift-user="${String(info.userId).replace(/["\\]/g, '')}"]`); } catch { /* ignore */ }
    const r = el ? el.getBoundingClientRect() : null;
    const hasEl = !!(el && r && r.width > 0 && r.height > 0);
    const sx = hasEl && r ? r.left + r.width / 2 : W - 52;
    const sy = hasEl && r ? r.top + r.height / 2 : H * 0.55;
    const sr = hasEl && r ? r.width / 2 : 20;
    const elImg = el ? el.querySelector('img') : null;
    const useImg = pre && pre.complete && pre.naturalWidth > 0 ? pre : (elImg && elImg.complete && elImg.naturalWidth > 0 ? elImg : pre);
    const nm = String(info.name || (el?.textContent || '') || '?').trim();
    const prevOp = hasEl && el ? el.style.opacity : '';
    if (hasEl && el) el.style.opacity = '0.12';
    return {
      sx, sy, sr, ex, ey, R,
      img: useImg || null,
      letter: (nm.charAt(0) || '?').toUpperCase(),
      name: nm,
      restore: () => { try { if (hasEl && el) el.style.opacity = prevOp; } catch { /* ignore */ } },
    };
  } catch { return null; }
}

// زر الإرسال: [data-gift-send] ← الزر بعد حقل [data-gift-walk] ← زر نصه Send ← أسفل يمين الشاشة
function findSend(W: number, H: number): { x: number; y: number } {
  try {
    let el: HTMLElement | null = document.querySelector<HTMLElement>('[data-gift-send]');
    if (!el) {
      const inp = document.querySelector<HTMLElement>('[data-gift-walk]');
      const sib = inp ? inp.nextElementSibling : null;
      if (sib instanceof HTMLElement) el = sib;
    }
    if (!el) {
      const btns = Array.from(document.querySelectorAll<HTMLElement>('button'));
      el = btns.find(b => /^\s*(send|إرسال|ارسال)\s*$/i.test(b.textContent || '')) || null;
    }
    if (el && !el.closest('[data-gift-overlay]')) {
      const r = el.getBoundingClientRect();
      if (r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < H) {
        return { x: clamp(r.left + r.width / 2, 30, W - 30), y: clamp(r.top + r.height / 2, H * 0.5, H - 30) };
      }
    }
  } catch { /* ignore */ }
  return { x: W * 0.86, y: H - 70 };
}

function FalconAnimation({ onDone }: { onDone: () => void }) {
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

    // ── وضع الهدية: لصاحب البث، أو لمستخدم (صورته تصعد والصقر يقف فوق إطارها) ──
    const liftInfo = getLiftInfo();
    const isLift = !!liftInfo;
    const T = timeline(isLift);
    let liftPre: HTMLImageElement | null = null;
    if (liftInfo && liftInfo.avatarUrl) {
      try { liftPre = new Image(); liftPre.src = String(liftInfo.avatarUrl); } catch { liftPre = null; }
    }
    const lift: Lift | null = liftInfo ? makeLift(liftInfo, W, H, liftPre) : null;
    const L0: Lift | null = lift;

    // ── سبرايتات ──
    const GLOW = makeSprite('150,255,170', 0.25);
    const FOG = makeSprite('150,190,178', 0.1);
    const FLY = makeSprite('205,255,120', 0.2);
    const LEAF_D = makeSprite('9,40,24', 0.45);
    const LEAF_L = makeSprite('20,68,38', 0.45);
    const MOON = makeSprite('220,245,205', 0.2);
    const blob = (sp: HTMLCanvasElement, x: number, y: number, r: number, a: number) => {
      if (a <= 0.003 || r <= 0.2) return;
      c.globalAlpha = Math.min(1, a);
      c.drawImage(sp, x - r, y - r, r * 2, r * 2);
    };

    // ── مسارات الصقر (Path2D من نفس رسم المعاينة) ──
    const PA = {
      arm: new Path2D(ARM), cov: new Path2D(COV), covL: new Path2D(COVLINES), sec: new Path2D(SEC), secB: new Path2D(SECBARS),
      prim: PRIM.map(d => new Path2D(d)), rach: new Path2D(RACH), tail: new Path2D(TAIL), tailB: new Path2D(TAILBARS),
      body: new Path2D(BODY), scales: new Path2D(BACKSCALES), beak: new Path2D(BEAK), cere: new Path2D(CERE),
    };
    const PP = {
      tail: new Path2D(P_TAIL), tailB: new Path2D(P_TAILBARS), body: new Path2D(P_BODY), chest: new Path2D(P_CHEST),
      wing: new Path2D(P_WING), wingS: new Path2D(P_WINGSCALES), up: new Path2D(P_BEAK_UP), lo: new Path2D(P_BEAK_LO),
      mouth: new Path2D(P_MOUTH), cere: new Path2D(P_CERE), malar: new Path2D(P_MALAR),
    };

    // ── هندسة الغابة (تتولد مرة وحدة) ──
    const trunks: TreePart[] = [];
    const branches: TreePart[] = [];
    const leaves: Leaf[] = [];
    const makeTree = (x0: number, lean: number, wBase: number) => {
      const n = 10;
      const dir = x0 < W / 2 ? 1 : -1;
      const pts: [number, number][] = [];
      for (let i = 0; i <= n; i++) {
        const tt = i / n;
        pts.push([x0 + lean * tt * W * 0.1 + Math.sin(tt * 3 + x0) * 6 * k, H * (1.04 - tt * 1.14)]);
      }
      trunks.push({ pts, w0: wBase, w1: wBase * 0.45 });
      for (let b = 0; b < 4; b++) {
        const st = pts[Math.round((0.38 + b * 0.14) * n)];
        const len = W * rnd(0.18, 0.3);
        const bp: [number, number][] = [];
        for (let j = 0; j <= 6; j++) {
          const u = j / 6;
          bp.push([st[0] + dir * len * u, st[1] - len * 0.35 * Math.sin(u * 1.6) - u * u * 18 * k + rnd(-3, 3)]);
        }
        branches.push({ pts: bp, w0: wBase * 0.42 * (1 - b * 0.12), w1: 2 });
        for (let j = 2; j <= 6; j++) {
          for (let m = 0; m < 3; m++) leaves.push({ x: bp[j][0] + rnd(-16, 16) * k, y: bp[j][1] + rnd(-18, 12) * k, r: rnd(22, 46) * k, light: Math.random() < 0.35, ph: rnd(0, TAU) });
        }
      }
      const top = pts[n];
      for (let m = 0; m < 16; m++) {
        leaves.push({ x: top[0] + dir * rnd(-0.06, 0.34) * W, y: rnd(-0.03, 0.14) * H, r: rnd(40, 80) * k, light: Math.random() < 0.3, ph: rnd(0, TAU) });
      }
    };
    makeTree(W * 0.03, 0.4, W * 0.085);
    makeTree(W * 0.97, -0.4, W * 0.085);

    const pines = Array.from({ length: 16 }, (_, i) => {
      const h = rnd(0.2, 0.4) * H;
      return { x: ((i + rnd(0.1, 0.9)) / 16) * W, h, w: h * 0.34 };
    });
    const flies = Array.from({ length: 24 }, () => ({
      bx: rnd(0, W), by: rnd(0.28, 0.9) * H, a: rnd(0.4, 1.1), b: rnd(0.4, 1.1), ph: rnd(0, TAU), fc: rnd(1.2, 3.2), amp: rnd(24, 60) * k,
    }));
    const fallLeaves = Array.from({ length: 16 }, () => ({
      x0: rnd(0, W), off: rnd(0, H), vy: rnd(24, 52) * k, ph: rnd(0, TAU), size: rnd(3, 6) * k, col: Math.random() < 0.5 ? '#35652f' : '#7a5224',
    }));

    // ── حالة ──
    const feathers: Feather[] = [];
    const rings: Ring[] = [];
    const crows: Crow[] = CAW_TIMES.map(ct => ({
      born: ct - 1.2, dir: Math.random() < 0.5 ? 1 : -1, y: rnd(0.11, 0.3) * H, dur: 2.6, scale: rnd(0.9, 1.3) * k, ph: rnd(0, TAU),
    }));
    let sendPt = { x: W * 0.86, y: H - 70 };
    let sendFound = false;
    let phase = 0;            // طور الرفرفة (يتراكم)
    let flash = 0;
    let shake = 0;
    let arrived = false;
    let screeched = false;
    let leaving = false;
    let accF = 0;

    // ── ثوابت الطيران ──
    const spanPx = clamp(W * 0.44, 140, 250);
    const s0 = spanPx / 208;                                  // مقياس الصقر
    const R0 = clamp(Math.min(W, H) * 0.27, 80, 150);          // نصف قطر الدورات
    const entry: [number, number] = [-W * 0.25, -H * 0.08];

    const orb = (t: number): Pos => {
      const th = Math.PI + 1.05 * (t - ENTER_AT);
      return [W * 0.5 + W * 0.3 * Math.cos(th), H * 0.2 + H * 0.085 * Math.sin(th), 1 + 0.12 * Math.sin(th)];
    };
    const bez = (p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number], u: number): [number, number] => {
      const a = 1 - u;
      return [
        a * a * a * p0[0] + 3 * a * a * u * p1[0] + 3 * a * u * u * p2[0] + u * u * u * p3[0],
        a * a * a * p0[1] + 3 * a * a * u * p1[1] + 3 * a * u * u * p2[1] + u * u * u * p3[1],
      ];
    };
    const hoverPt = (t: number): [number, number] => {
      const amp = smooth((t - ARRIVE_AT) / 0.4);
      return [sendPt.x + Math.sin(t * 4.3) * 9 * k * amp, sendPt.y - 26 * k + Math.cos(t * 3.7) * 6 * k * amp];
    };
    const loopPos = (t: number): Pos => {
      const hp = hoverPt(t);
      const th = Math.PI / 2 + (TAU * (isLift ? 1.5 : 2) / T.loopS) * (t - LOOP_AT);
      const R = R0 * (0.75 + 0.25 * smooth((t - LOOP_AT) / 1.0));
      const cx = clamp(sendPt.x, R0 + 14, W - R0 - 14);
      const cy = sendPt.y - 26 * k - R0 - 6 * k;
      const cp: [number, number] = [cx + R * Math.cos(th), cy + R * Math.sin(th)];
      const b = smooth((t - LOOP_AT) / 0.7);
      return [lerp(hp[0], cp[0], b), lerp(hp[1], cp[1], b), 1.08 + 0.12 * Math.sin(th)];
    };
    const perchQ = (): [number, number] => (L0 ? [L0.ex, L0.ey - L0.R - 22 * k] : [W * 0.5, H * 0.3]);
    const ringTop = (t: number): [number, number] => {
      const bob = Math.sin(t * 2.6) * 3 * k;
      return L0 ? [L0.ex, L0.ey + bob - L0.R * 0.97] : [W * 0.5, H * 0.3];
    };
    const vel = (fn: (t: number) => Pos, t: number): [number, number] => {
      const e = 0.02;
      const a = fn(t - e), b = fn(t + e);
      return [(b[0] - a[0]) / (2 * e), (b[1] - a[1]) / (2 * e)];
    };

    const posAt = (t: number): Pos => {
      if (t < DIVE_AT) {
        const o = orb(t);
        const e = easeOut((t - ENTER_AT) / 1.8);
        return [lerp(entry[0], o[0], e), lerp(entry[1], o[1], e), o[2] * lerp(0.55, 1, e)];
      }
      if (t < ARRIVE_AT) {
        const o = orb(DIVE_AT);
        const v = vel(orb, DIVE_AT);
        const p0: [number, number] = [o[0], o[1]];
        const p1: [number, number] = [o[0] + v[0] * 0.9, o[1] + v[1] * 0.9];
        const p3: [number, number] = [sendPt.x, sendPt.y - 26 * k];
        const p2: [number, number] = [Math.min(p3[0] + W * 0.22, W * 1.05), p3[1] - H * 0.14];
        const u = smooth((t - DIVE_AT) / (ARRIVE_AT - DIVE_AT));
        const b = bez(p0, p1, p2, p3, u);
        return [b[0], b[1], lerp(o[2], 1.2, u)];
      }
      if (t < LOOP_AT) { const h = hoverPt(t); return [h[0], h[1], 1.2]; }
      if (t < T.loopEnd) return loopPos(t);
      // بعد الدورات
      const pe = loopPos(T.loopEnd);
      const ve = vel(loopPos, T.loopEnd - 0.03);
      if (isLift) {
        if (t < T.perchAt) {
          const q = perchQ();
          const u = (t - T.loopEnd) / (T.perchAt - T.loopEnd);
          const uu = 1 - Math.pow(1 - clamp01(u), 2.2);
          const b = bez([pe[0], pe[1]], [pe[0] + ve[0] * 0.8, pe[1] + ve[1] * 0.8], [q[0], q[1] - H * 0.22], q, uu);
          return [b[0], b[1], lerp(pe[2], 0.8, uu)];
        }
        if (t < T.leaveAt) { const q = perchQ(); return [q[0], q[1], 0.8]; }
        const q = perchQ();
        const tau = t - T.leaveAt;
        const sg = q[0] < W * 0.5 ? 1 : -1;
        return [q[0] + sg * (140 * k * tau + 160 * k * tau * tau), q[1] - (250 * k * tau + 700 * k * tau * tau), 0.8 - 0.3 * smooth(tau / 1.0)];
      }
      const tau = t - T.loopEnd;
      const sx = ve[0] >= 0 ? 1 : -1;
      return [
        pe[0] + ve[0] * tau + 0.5 * 400 * k * sx * tau * tau,
        pe[1] + ve[1] * tau - 0.5 * 900 * k * tau * tau,
        pe[2] * (1 - 0.85 * smooth(tau / (T.goneAt - T.loopEnd))),
      ];
    };

    const velHd = (t: number): number => {
      const v = vel(posAt, t);
      return Math.atan2(v[1], v[0]);
    };
    const headingAt = (t: number): number => {
      const UP = -Math.PI / 2;
      if (t >= ARRIVE_AT && t < LOOP_AT) return lerpAngle(velHd(ARRIVE_AT - 0.05), UP, smooth((t - ARRIVE_AT) / 0.5));
      if (t >= LOOP_AT && t < LOOP_AT + 0.7) return lerpAngle(UP, velHd(LOOP_AT + 0.7), smooth((t - LOOP_AT) / 0.7));
      if (isLift && t >= T.perchAt - 0.6 && t < T.perchAt) return lerpAngle(velHd(T.perchAt - 0.62), UP, smooth((t - (T.perchAt - 0.6)) / 0.5));
      if (isLift && t >= T.leaveAt) return lerpAngle(UP, velHd(T.leaveAt + 0.45), smooth((t - T.leaveAt) / 0.4));
      return velHd(t);
    };

    // معاملات الجناح حسب الزمن: amp (قوة الرفرفة) rate (سرعتها) tuck (ضم الأجنحة) spread (فرد الذيل)
    const wingAt = (t: number) => {
      let amp = 0.16, rate = 8, tuck = 0, spread = 0.1;
      if (t < DIVE_AT) {
        const burst = smooth(Math.sin(t * 1.1) * 1.6);
        amp = 0.16 + 0.7 * burst; rate = 8 + 6 * burst;
      } else if (t < ARRIVE_AT) {
        const u = (t - DIVE_AT) / (ARRIVE_AT - DIVE_AT);
        tuck = smooth((u - 0.05) / 0.25) * (1 - smooth((u - 0.78) / 0.2));
        amp = Math.max(0.1, smooth((u - 0.8) / 0.2));
        rate = lerp(9, 16, smooth((u - 0.7) / 0.3));
        spread = smooth((u - 0.8) / 0.2);
      } else if (t < LOOP_AT) {
        amp = 1; rate = 15; spread = 1;
      } else if (t < T.loopEnd) {
        amp = 0.55 + 0.25 * Math.sin(t * 2); rate = 10; spread = 0.3;
      } else if (isLift) {
        if (t < T.perchAt) {
          const u = (t - T.loopEnd) / (T.perchAt - T.loopEnd);
          amp = lerp(0.6, 1, u); rate = lerp(10, 20, u); spread = smooth(u);
        } else {
          amp = 1; rate = 16; spread = 0.8;
        }
      } else {
        const tau = t - T.loopEnd;
        amp = lerp(0.9, 0.25, smooth(tau / 1.2)); rate = lerp(13, 8, smooth(tau / 1.2)); spread = 0.2;
      }
      return { amp, rate, tuck, spread };
    };

    // ═══ رسم الصقر الطائر ═══
    const drawFalcon = (x: number, y: number, s: number, hd: number, fl: number, amp: number, bank: number, tuck: number, spread: number, alpha: number) => {
      if (alpha <= 0.01) return;
      c.save();
      c.translate(x, y);
      c.rotate(hd + Math.PI / 2);
      c.scale(s, s);
      c.globalAlpha = alpha;
      c.lineJoin = 'round';
      const phi = amp * 0.9 * Math.sin(fl) + 0.1 * (1 - amp);
      const lag = Math.sin(fl - 0.9);
      for (const side of [-1, 1]) {
        const bk = 1 + bank * side * 0.28;
        const sf = Math.max(0.3, Math.cos(phi)) * bk * (1 - 0.6 * tuck);
        const sw = (0.08 + 0.28 * tuck - lag * amp * 0.2) * sf;
        c.save();
        c.scale(side, 1);
        c.translate(8, -18);
        c.transform(sf, sw, 0, 1, 0, 0);
        c.translate(-8, 18);
        c.fillStyle = '#5f6b77'; c.strokeStyle = '#1d2429'; c.lineWidth = 0.8;
        c.fill(PA.arm); c.stroke(PA.arm);
        c.fillStyle = '#6d7a87'; c.strokeStyle = '#2b343b';
        c.fill(PA.cov); c.stroke(PA.cov);
        c.strokeStyle = 'rgba(40,50,60,0.9)'; c.lineWidth = 1.2;
        c.stroke(PA.covL);
        c.fillStyle = '#464f59'; c.strokeStyle = '#1d2429'; c.lineWidth = 0.7;
        c.fill(PA.sec); c.stroke(PA.sec);
        c.strokeStyle = '#2a323a'; c.lineWidth = 2;
        c.stroke(PA.secB);
        for (let i = 0; i < PA.prim.length; i++) {
          c.fillStyle = PRIM_COL[i]; c.strokeStyle = '#14191d'; c.lineWidth = 0.7;
          c.fill(PA.prim[i]); c.stroke(PA.prim[i]);
        }
        c.strokeStyle = 'rgba(150,162,174,0.55)'; c.lineWidth = 0.6;
        c.stroke(PA.rach);
        c.restore();
      }
      // الذيل (ينفرد عند الفرملة)
      c.save();
      c.translate(0, 22);
      c.scale(1 + 0.35 * spread, 1 + 0.04 * spread);
      c.translate(0, -22);
      c.fillStyle = '#626e79'; c.strokeStyle = '#1d2429'; c.lineWidth = 0.9;
      c.fill(PA.tail); c.stroke(PA.tail);
      c.strokeStyle = '#2c343c'; c.lineWidth = 2.4;
      c.stroke(PA.tailB);
      c.restore();
      // الجسم
      const bg = c.createLinearGradient(-10, 0, 10, 0);
      bg.addColorStop(0, '#4f5a65'); bg.addColorStop(0.5, '#7d8b98'); bg.addColorStop(1, '#4f5a65');
      c.fillStyle = bg; c.strokeStyle = '#1d2429'; c.lineWidth = 0.9;
      c.fill(PA.body); c.stroke(PA.body);
      c.strokeStyle = 'rgba(60,72,84,0.8)'; c.lineWidth = 1.4;
      c.stroke(PA.scales);
      // الراس
      c.fillStyle = '#2d343c'; c.strokeStyle = '#14181c'; c.lineWidth = 0.8;
      c.beginPath(); c.ellipse(0, -38, 8.2, 9.6, 0, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = '#1c1c1e'; c.fill(PA.beak);
      c.fillStyle = '#e6bf3a'; c.fill(PA.cere);
      for (const ex of [-6.8, 6.8]) {
        c.fillStyle = '#e1be3c'; c.beginPath(); c.arc(ex, -40, 2.3, 0, TAU); c.fill();
        c.fillStyle = '#0a0a0a'; c.beginPath(); c.arc(ex, -40, 1.5, 0, TAU); c.fill();
      }
      c.restore();
    };

    // ═══ رسم الصقر الواقف (يصرخ) ═══
    const drawPerched = (x: number, y: number, s: number, alpha: number, open: number, flare: number, tm: number, face: number) => {
      if (alpha <= 0.01) return;
      c.save();
      c.translate(x + Math.sin(tm * 71) * open * 0.8 * k, y + Math.cos(tm * 63) * open * 0.6 * k);
      c.scale(face * s, s);
      c.globalAlpha = alpha;
      c.lineJoin = 'round';
      c.lineCap = 'round';
      // الأرجل والمخالب
      c.fillStyle = '#dcb532';
      c.fillRect(-3, -13, 4, 13);
      c.fillRect(6, -13, 4, 13);
      c.strokeStyle = '#dcb532'; c.lineWidth = 2.8;
      c.beginPath(); c.moveTo(-1, -1); c.quadraticCurveTo(7, 1, 13, 3); c.moveTo(8, -1); c.quadraticCurveTo(15, 1, 20, 4); c.moveTo(-3, -1); c.quadraticCurveTo(-9, 1, -12, 4); c.stroke();
      c.strokeStyle = '#17171a'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(13, 3); c.lineTo(16, 7); c.moveTo(20, 4); c.lineTo(22, 8.5); c.moveTo(-12, 4); c.lineTo(-14, 8); c.stroke();
      // الذيل
      c.fillStyle = '#505c68'; c.strokeStyle = '#1e262d'; c.lineWidth = 0.9;
      c.fill(PP.tail); c.stroke(PP.tail);
      c.strokeStyle = '#2a323a'; c.lineWidth = 2; c.stroke(PP.tailB);
      // الجسم والصدر
      c.fillStyle = '#566472'; c.strokeStyle = '#1e262d'; c.lineWidth = 0.9;
      c.fill(PP.body); c.stroke(PP.body);
      c.fillStyle = '#e1d2b2';
      c.fill(PP.chest);
      c.fillStyle = 'rgba(110,86,62,0.7)';
      for (const [dx, dy] of [[14, -64], [17, -54], [15, -44], [11, -34], [8, -26], [18, -60], [13, -50]]) { c.beginPath(); c.ellipse(dx, dy, 1.5, 1.1, 0.4, 0, TAU); c.fill(); }
      // الجناح (ينفتح عند الصرخة)
      c.save();
      c.translate(-3, -72);
      c.rotate(flare * 1.15);
      c.scale(1 + 0.18 * flare, 1 + 0.5 * flare);
      c.translate(3, 72);
      c.fillStyle = '#3f4a56'; c.strokeStyle = '#161c21'; c.lineWidth = 0.9;
      c.fill(PP.wing); c.stroke(PP.wing);
      c.strokeStyle = 'rgba(25,32,40,0.9)'; c.lineWidth = 1.3; c.stroke(PP.wingS);
      c.restore();
      // الراس (يميل للخلف عند الصرخة)
      c.save();
      c.translate(2, -80);
      c.rotate(-open * 0.35);
      c.translate(-2, 80);
      c.fillStyle = '#2b323a'; c.strokeStyle = '#14181c'; c.lineWidth = 0.8;
      c.beginPath(); c.ellipse(9, -90, 10.5, 10.5, 0, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = '#d6c7a8';
      c.beginPath(); c.ellipse(14, -89, 5.4, 4.6, 0, 0, TAU); c.fill();
      c.fillStyle = '#12151a'; c.fill(PP.malar);
      if (open > 0.05) { c.globalAlpha = alpha * open; c.fillStyle = '#a8283a'; c.fill(PP.mouth); c.globalAlpha = alpha; }
      c.save();
      c.translate(20, -88); c.rotate(-open * 0.2); c.translate(-20, 88);
      c.fillStyle = '#2c2c30'; c.fill(PP.up);
      c.restore();
      c.save();
      c.translate(20, -88); c.rotate(open * 0.45); c.translate(-20, 88);
      c.fillStyle = '#3a3a40'; c.fill(PP.lo);
      c.restore();
      c.fillStyle = '#e8c23a'; c.fill(PP.cere);
      c.fillStyle = '#e8c23a'; c.beginPath(); c.arc(13, -93, 3, 0, TAU); c.fill();
      c.fillStyle = '#080808'; c.beginPath(); c.arc(13, -93, 2.1, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.arc(12.3, -93.8, 0.7, 0, TAU); c.fill();
      c.restore();
      c.restore();
    };

    // ═══ غراب (ظل) ═══
    const drawCrow = (x: number, y: number, s: number, dir: number, ph: number, alpha: number) => {
      c.save();
      c.translate(x, y);
      c.scale(s * dir, s);
      c.globalAlpha = alpha;
      c.fillStyle = 'rgba(3,5,7,0.95)';
      const fl = Math.sin(ph);
      c.beginPath(); c.ellipse(0, 0, 13, 5.2, 0, 0, TAU); c.fill();
      c.beginPath(); c.arc(13, -1.5, 4, 0, TAU); c.fill();
      c.beginPath(); c.moveTo(16, -2.5); c.lineTo(23, -0.5); c.lineTo(16, 0.8); c.fill();
      c.beginPath(); c.moveTo(-11, -2); c.lineTo(-24, -1); c.lineTo(-23, 3); c.lineTo(-11, 3); c.fill();
      c.beginPath(); c.moveTo(7, -2);
      c.quadraticCurveTo(1, -20 * fl, -16, -30 * fl);
      c.quadraticCurveTo(-4, -7 * fl, -9, 1);
      c.closePath(); c.fill();
      c.restore();
    };

    // ═══ الأصوات ═══
    const cries: FalconCry[] = isLift
      ? [{ at: 9.0, kind: 'chatter' }, { at: 10.6, kind: 'scream' }, { at: 12.2, kind: 'scream' }, { at: T.screechAt, kind: 'screech' }]
      : [{ at: 9.0, kind: 'chatter' }, { at: 10.5, kind: 'scream' }, { at: 12.7, kind: 'scream' }, { at: 14.6, kind: 'scream' }];
    const flaps: FalconFlap[] = [
      { from: ENTER_AT + 0.2, to: DIVE_AT, gap: 0.42, level: 0.35 },
      { from: ARRIVE_AT - 0.6, to: LOOP_AT, gap: 0.25, level: 0.9 },
      { from: LOOP_AT, to: T.loopEnd, gap: 0.34, level: 0.7 },
    ];
    if (isLift) {
      flaps.push({ from: T.loopEnd, to: T.perchAt - 0.6, gap: 0.3, level: 0.8 });
      flaps.push({ from: T.perchAt - 0.6, to: T.perchAt + 0.2, gap: 0.18, level: 1 });
      flaps.push({ from: T.leaveAt, to: T.leaveAt + 0.9, gap: 0.22, level: 0.9 });
    } else {
      flaps.push({ from: T.loopEnd, to: T.goneAt - 0.4, gap: 0.3, level: 0.6 });
    }
    const stopSound = playFalconSound({
      totalS: TOTAL_S,
      forestInS: FOREST_IN,
      forestOutAt: T.forestOut,
      forestEndAt: T.forestEnd,
      cawTimes: CAW_TIMES,
      owlTimes: OWL_TIMES,
      flaps,
      cries,
    });

    // ── ريش يتساقط ──
    const spawnFeathers = (x: number, y: number, n: number, spd: number) => {
      for (let i = 0; i < n; i++) {
        if (feathers.length >= MAX_FEATHERS) return;
        const a = rnd(0, TAU);
        const sp = rnd(0.3, 1) * spd * k;
        feathers.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30 * k, rot: rnd(0, TAU), vr: rnd(-4, 4), age: 0, life: rnd(1.4, 2.6), size: rnd(5, 10) * k, dark: Math.random() < 0.6 });
      }
    };

    // ═══ الحلقة الرئيسية ═══
    let raf = 0;
    const start = performance.now();
    let last = start;

    const frame = (now: number) => {
      const t = (now - start) / 1000;
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const endFade = t > TOTAL_S - 0.5 ? clamp01((TOTAL_S - t) / 0.5) : 1;
      cv.style.opacity = String(endFade);

      if (!sendFound && t >= DIVE_AT - 1.5) { sendPt = findSend(W, H); sendFound = true; }

      const fIn = smooth(t / FOREST_IN);
      const fOut = 1 - smooth((t - T.forestOut) / (T.forestEnd - T.forestOut));
      const forest = fIn * fOut;                     // قوة الغابة الكلية
      const grow = easeOut((t - TREES_AT) / 1.9);
      const flick = 0.9 + 0.1 * Math.sin(t * 7);

      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';

      // ── تعتيم الغابة (أزرق ليلي فوق → أخضر داكن تحت) ──
      const tg = c.createLinearGradient(0, 0, 0, H);
      tg.addColorStop(0, `rgba(3,14,24,${DARK_MAX * forest})`);
      tg.addColorStop(1, `rgba(3,22,12,${DARK_MAX * 0.85 * forest})`);
      c.fillStyle = tg;
      c.fillRect(0, 0, W, H);
      const vg = c.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.3, W / 2, H * 0.5, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, `rgba(0,0,0,${0.5 * forest})`);
      c.fillStyle = vg;
      c.fillRect(0, 0, W, H);

      // هزّة الكاميرا (صرخة الصقر)
      shake *= Math.exp(-dt * 4);
      c.save();
      c.translate(Math.sin(t * 83) * shake * k, Math.cos(t * 71) * shake * 0.7 * k);

      if (forest > 0.01) {
        // القمر + أشعة
        const mx = W * 0.8, my = H * 0.1;
        c.globalCompositeOperation = 'lighter';
        blob(MOON, mx, my, W * 0.34, 0.32 * forest * flick);
        for (let i = 0; i < 4; i++) {
          const a0 = 1.9 + i * 0.22;
          const ln = H * 0.8;
          const g = c.createLinearGradient(mx, my, mx + Math.cos(a0) * ln, my + Math.sin(a0) * ln);
          g.addColorStop(0, `rgba(200,240,215,${0.09 * forest})`);
          g.addColorStop(1, 'rgba(200,240,215,0)');
          c.fillStyle = g;
          c.beginPath();
          c.moveTo(mx - 8, my);
          c.lineTo(mx + 8, my);
          c.lineTo(mx + Math.cos(a0) * ln + 60 * k, my + Math.sin(a0) * ln);
          c.lineTo(mx + Math.cos(a0) * ln - 60 * k, my + Math.sin(a0) * ln);
          c.closePath();
          c.fill();
        }
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = forest;
        c.fillStyle = '#eef7e0';
        c.beginPath(); c.arc(mx, my, W * 0.045, 0, TAU); c.fill();
        c.globalAlpha = 1;

        // أشجار صنوبر بعيدة
        c.fillStyle = `rgba(4,22,18,${0.5 * forest})`;
        for (const p of pines) {
          const base = H;
          const hh = p.h * grow;
          for (let tier = 0; tier < 4; tier++) {
            const ty = base - hh * (tier / 4) * 0.82;
            const tw = p.w * (1 - tier * 0.2);
            c.beginPath();
            c.moveTo(p.x - tw / 2, ty);
            c.lineTo(p.x, ty - hh * 0.36);
            c.lineTo(p.x + tw / 2, ty);
            c.closePath();
            c.fill();
          }
        }

        // ضباب
        for (let i = 0; i < 6; i++) {
          const fx = W * (0.1 + 0.16 * i) + Math.sin(t * 0.22 + i * 1.7) * W * 0.12;
          blob(FOG, fx, H * (0.58 + 0.07 * (i % 3)), W * 0.62, 0.13 * forest);
        }

        // أشجار قريبة على الجوانب (تطلع من تحت)
        c.save();
        c.translate(0, (1 - grow) * H * 0.25);
        c.globalAlpha = clamp01(grow * 1.4) * fOut;
        c.lineCap = 'round';
        c.lineJoin = 'round';
        const strokeTree = (tp: TreePart, col: string, wMul: number, off: number) => {
          c.strokeStyle = col;
          for (let i = 0; i < tp.pts.length - 1; i++) {
            const u = i / (tp.pts.length - 1);
            c.lineWidth = Math.max(1, lerp(tp.w0, tp.w1, u) * wMul);
            c.beginPath();
            c.moveTo(tp.pts[i][0] + off, tp.pts[i][1]);
            c.lineTo(tp.pts[i + 1][0] + off, tp.pts[i + 1][1]);
            c.stroke();
          }
        };
        for (const tr of trunks) { strokeTree(tr, '#1a120c', 1, 0); strokeTree(tr, 'rgba(90,125,105,0.35)', 0.25, tr.pts[0][0] < W / 2 ? 3 * k : -3 * k); }
        for (const br of branches) strokeTree(br, '#1a120c', 1, 0);
        for (const lf of leaves) {
          const sway = Math.sin(t * 0.9 + lf.ph) * 3 * k;
          blob(lf.light ? LEAF_L : LEAF_D, lf.x + sway, lf.y + Math.cos(t * 0.7 + lf.ph) * 2 * k, lf.r, 0.95);
        }
        c.restore();
        c.globalAlpha = 1;

        // أوراق تتساقط
        for (const fl of fallLeaves) {
          const y = ((t * fl.vy + fl.off) % (H + 40)) - 20;
          const x = fl.x0 + Math.sin(t * 1.3 + fl.ph) * 28 * k + t * 6;
          c.save();
          c.translate(((x % (W + 40)) + W + 40) % (W + 40) - 20, y);
          c.rotate(t * 1.8 + fl.ph);
          c.globalAlpha = 0.8 * forest;
          c.fillStyle = fl.col;
          c.beginPath(); c.ellipse(0, 0, fl.size, fl.size * 0.5, 0, 0, TAU); c.fill();
          c.restore();
        }
        c.globalAlpha = 1;

        // يراعات
        const fireIn = smooth((t - 2.2) / 1.2) * fOut;
        if (fireIn > 0.01) {
          c.globalCompositeOperation = 'lighter';
          for (const f of flies) {
            const x = f.bx + Math.sin(t * f.a + f.ph) * f.amp;
            const y = f.by + Math.cos(t * f.b + f.ph) * f.amp * 0.7;
            const tw = Math.max(0, Math.sin(t * f.fc + f.ph));
            blob(FLY, x, y, 9 * k, 0.9 * tw * fireIn);
          }
          c.globalCompositeOperation = 'source-over';
          c.globalAlpha = 1;
        }

        // غربان تعبر
        for (const cr of crows) {
          const u = (t - cr.born) / cr.dur;
          if (u < 0 || u > 1) continue;
          const x0 = cr.dir > 0 ? -50 : W + 50;
          const x1 = cr.dir > 0 ? W + 50 : -50;
          drawCrow(lerp(x0, x1, u), cr.y + Math.sin(u * 7 + cr.ph) * 10 * k, cr.scale, cr.dir, t * 13 + cr.ph, forest);
        }
        c.globalAlpha = 1;
      }

      // ── صورة المستخدم تصعد لمنتصف البث (هدية لمستخدم) ──
      if (L0) {
        const up = easeOut((t - (ARRIVE_AT - 0.4)) / 1.5);
        const down = smooth((t - (T.leaveAt + 0.2)) / 0.9);
        const e2 = up * (1 - down);
        if (down >= 1 && !L0.done) { L0.done = true; L0.restore(); }
        if (e2 > 0.004) {
          const ax = lerp(L0.sx, L0.ex, e2);
          const ay = lerp(L0.sy, L0.ey, e2) + Math.sin(t * 2.6) * 3 * k * e2;
          const ar = lerp(L0.sr, L0.R, e2);
          c.save();
          c.globalCompositeOperation = 'lighter';
          blob(GLOW, ax, ay, ar * 2.4, 0.4 * e2 * endFade);
          c.restore();
          c.save();
          c.globalAlpha = clamp01(e2 * 3) * endFade;
          c.beginPath(); c.arc(ax, ay, ar, 0, TAU); c.closePath();
          c.save();
          c.clip();
          let drawn = false;
          if (!L0.img && liftPre && liftPre.complete && liftPre.naturalWidth > 0) L0.img = liftPre;
          if (L0.img && L0.img.complete && L0.img.naturalWidth > 0) {
            try {
              const sw = L0.img.naturalWidth, sh = L0.img.naturalHeight, ss = Math.min(sw, sh);
              c.drawImage(L0.img, (sw - ss) / 2, (sh - ss) / 2, ss, ss, ax - ar, ay - ar, ar * 2, ar * 2);
              drawn = true;
            } catch { /* ignore */ }
          }
          if (!drawn) {
            c.fillStyle = '#12363a';
            c.fillRect(ax - ar, ay - ar, ar * 2, ar * 2);
            c.fillStyle = '#00BCD4';
            c.font = `800 ${Math.round(ar)}px sans-serif`;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(L0.letter, ax, ay + ar * 0.04);
          }
          c.restore();
          c.beginPath(); c.arc(ax, ay, ar, 0, TAU);
          c.lineWidth = Math.max(2, ar * 0.07);
          c.strokeStyle = 'rgba(150,235,130,0.95)';
          c.shadowColor = 'rgba(90,230,130,0.9)';
          c.shadowBlur = 14 * e2;
          c.stroke();
          c.restore();
          if (e2 > 0.5) {
            c.save();
            c.globalAlpha = clamp01((e2 - 0.5) * 2) * endFade;
            c.font = `800 ${Math.round(Math.max(12, ar * 0.3))}px sans-serif`;
            c.textAlign = 'center';
            c.textBaseline = 'top';
            c.shadowColor = 'rgba(0,0,0,0.9)';
            c.shadowBlur = 6;
            c.fillStyle = '#eaffdc';
            c.fillText(L0.name.length > 18 ? L0.name.slice(0, 17) + '…' : L0.name, ax, ay + ar + 8 * k);
            c.restore();
          }
          c.globalAlpha = 1;
        }
      }

      // ═══ الصقر ═══
      const wa = wingAt(t);
      phase += dt * wa.rate;
      const fp = posAt(t);
      const hd = headingAt(t);
      const dHd = ((((headingAt(t + 0.05) - headingAt(t - 0.05)) + Math.PI) % TAU) + TAU) % TAU - Math.PI;
      const bank = clamp(dHd / 0.1 * 0.22, -1, 1);
      const sc = s0 * fp[2];

      // حضور الصقر الطائر
      let flyA = 1;
      if (t < ENTER_AT) flyA = 0;
      else flyA = smooth((t - ENTER_AT) / 0.5);
      if (isLift) {
        if (t >= T.perchAt - 0.15 && t < T.leaveAt) flyA *= 1 - smooth((t - (T.perchAt - 0.15)) / 0.25);
        if (t >= T.leaveAt) flyA *= 1 - smooth((t - (T.leaveAt + 0.3)) / 0.7);
      } else if (t >= T.loopEnd) {
        flyA *= 1 - smooth((t - T.loopEnd - 0.7) / (T.goneAt - T.loopEnd - 0.7));
      }
      flyA *= endFade;

      // وصول زر الإرسال: وميض + ريش
      if (!arrived && t >= ARRIVE_AT) {
        arrived = true;
        spawnFeathers(sendPt.x, sendPt.y - 26 * k, 14, 260);
        rings.push({ x: sendPt.x, y: sendPt.y, born: t, dur: 0.8, maxR: W * 0.45, w: 4 });
        flash = Math.max(flash, 0.5);
        shake = Math.max(shake, 4);
      }
      // توهج زر الإرسال
      const sg = smooth((t - (ARRIVE_AT - 0.3)) / 0.4) * (1 - smooth((t - (LOOP_AT + 0.8)) / 0.8));
      if (sg > 0.01 && forest > 0.01) {
        c.globalCompositeOperation = 'lighter';
        blob(GLOW, sendPt.x, sendPt.y, 70 * k, 0.55 * sg * flick * endFade);
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = 1;
      }

      // ريش أثناء الدورات
      if (t >= LOOP_AT && t < T.loopEnd) {
        accF += dt * 2.2;
        while (accF >= 1) { accF--; spawnFeathers(fp[0], fp[1], 1, 90); }
      }

      // هالة خلف الصقر
      if (flyA > 0.02) {
        c.globalCompositeOperation = 'lighter';
        blob(GLOW, fp[0], fp[1], 110 * sc, 0.16 * flyA);
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = 1;
      }
      drawFalcon(fp[0], fp[1], sc, hd, phase, wa.amp, bank, wa.tuck, wa.spread, flyA);
      c.globalAlpha = 1;

      // ── الصقر الواقف فوق إطار المستخدم ──
      if (isLift && L0 && t >= T.perchAt - 0.15 && t < T.leaveAt + 0.6) {
        const rt = ringTop(t);
        const sp = (L0.R * 1.3) / 105;
        const inA = smooth((t - (T.perchAt - 0.15)) / 0.25);
        const outA = 1 - smooth((t - T.leaveAt) / 0.3);
        const since = t - T.screechAt;
        // الصرخة: فم يفتح ويغلق ~1.7 ثانية، جناح ينفتح
        const scr = since >= 0 && since < 2.0 ? 1 : 0;
        const openEnv = since >= 0 ? smooth(since / 0.12) * (1 - smooth((since - 1.65) / 0.3)) : 0;
        const open = openEnv * (0.7 + 0.3 * Math.sin(since * 22));
        const flare = since >= 0 ? smooth(since / 0.2) * (1 - smooth((since - 1.7) / 0.5)) : 0;
        if (!screeched && t >= T.screechAt) {
          screeched = true;
          shake = Math.max(shake, 9);
          flash = Math.max(flash, 0.7);
          rings.push({ x: rt[0], y: rt[1] - 40 * sp * 2, born: t, dur: 0.9, maxR: W * 0.7, w: 6 });
          rings.push({ x: rt[0], y: rt[1] - 40 * sp * 2, born: t + 0.18, dur: 1.1, maxR: W * 0.95, w: 3 });
          spawnFeathers(rt[0], rt[1] - 30 * sp * 2, 30, 380);
        }
        if (scr) {
          c.globalCompositeOperation = 'lighter';
          blob(GLOW, rt[0], rt[1] - 45 * sp, 120 * sp * 1.6, 0.3 * openEnv * flick);
          c.globalCompositeOperation = 'source-over';
          c.globalAlpha = 1;
        }
        drawPerched(rt[0], rt[1] + 3 * sp, sp, inA * outA * endFade, open, flare, t, 1);
        c.globalAlpha = 1;
      }
      if (isLift && !leaving && t >= T.leaveAt) {
        leaving = true;
        spawnFeathers(perchQ()[0], perchQ()[1], 16, 240);
      }

      // ── ريش ──
      for (let i = feathers.length - 1; i >= 0; i--) {
        const f = feathers[i];
        f.age += dt;
        if (f.age >= f.life) { feathers[i] = feathers[feathers.length - 1]; feathers.pop(); continue; }
        f.vy += 90 * k * dt;
        f.vx *= Math.exp(-1.2 * dt);
        f.vy *= Math.exp(-0.9 * dt);
        f.x += f.vx * dt + Math.sin(f.age * 4 + f.rot) * 14 * k * dt;
        f.y += f.vy * dt;
        f.rot += f.vr * dt;
        const u = f.age / f.life;
        c.save();
        c.translate(f.x, f.y);
        c.rotate(f.rot);
        c.globalAlpha = (1 - u) * 0.9 * endFade;
        c.fillStyle = f.dark ? '#3a444e' : '#b9a583';
        c.beginPath(); c.ellipse(0, 0, f.size, f.size * 0.22, 0, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(20,24,28,0.7)'; c.lineWidth = 0.8;
        c.beginPath(); c.moveTo(-f.size, 0); c.lineTo(f.size, 0); c.stroke();
        c.restore();
      }
      c.globalAlpha = 1;

      // ── موجات الصدمة ──
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        const u = (t - r.born) / r.dur;
        if (u >= 1) { rings.splice(i, 1); continue; }
        if (u < 0) continue;
        c.strokeStyle = `rgba(170,255,190,${(1 - u) * 0.6 * endFade})`;
        c.lineWidth = r.w * (1 - u) + 1;
        c.beginPath();
        c.ellipse(r.x, r.y, easeOut(u) * r.maxR, easeOut(u) * r.maxR * 0.55, 0, 0, TAU);
        c.stroke();
      }

      c.restore();

      // وميض
      if (flash > 0.01) {
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = `rgba(190,255,205,${flash * 0.22 * endFade})`;
        c.fillRect(0, 0, W, H);
        c.globalCompositeOperation = 'source-over';
        flash *= Math.exp(-dt * 5);
      }
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
      if (L0 && !L0.done) { L0.done = true; L0.restore(); }
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

export const FalconGift: GiftDefinition = {
  id: 'falcon',
  name: 'Falcon',
  price: PRICE,
  durationMs: TOTAL_MS,
  Preview: FalconPreview,
  Animation: FalconAnimation,
};

export default FalconGift;
