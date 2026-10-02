/**
 * هدية القلعة (Castle) — 3,500 Coins — مدتها 20 ثانية — تستبدل هدية الصقر (نفس المربع)
 *
 * - Preview  : داخل مربع الهدايا قلعة صغيرة متحركة قبل النقر: أبراج بأسقف حمراء وأعلام تتحرك،
 *              نوافذ تلمع، بوابة متوهجة، سجادة حمراء، مشاعل نار تتراقص، ونجوم تلمع،
 *              وبلورة لامعة تطفو على السجادة وتدور حولها الأشعة والشرارات.
 *
 * - Animation (هدية لصاحب البث) — الأرقام بالثواني:
 *     0.0 – 1.4   : البث يتحول لليل ملكي وتظهر قلعة كبيرة بأبراجها وأعلامها ونوافذها المضيئة + أجواء قاعة ملكية
 *     0.9 – 2.4   : بوابة القلعة الكبيرة تنفتح ويخرج منها نور ذهبي
 *     1.8 – 3.4   : السجادة الحمراء تنفرد من البوابة حتى أسفل البث وتشتعل المشاعل على جانبيها
 *     2.0 – 5.0   : صوت الدخول الملكي (بوق + طبول)
 *     3.4 – 4.6   : البلورة اللامعة تنزل من السماء وتستقر بمنتصف السجادة (موجة ضوء + ارتداد)
 *     5.6 – 13.8  : ألعاب نارية بالسماء، قصاصات ذهبية وحمراء تتساقط، لمعان دوري، لمعات على أزرار البث
 *     9.0         : بوق ملكي ثاني
 *     15.4        : البلورة تتلاشى بانفجار شرر ذهبي
 *     16.0 – 19.3 : القلعة تتلاشى والبث يرجع طبيعي
 *
 * - Animation (هدية من صاحب البث إلى مستخدم/متحدث) — نفس المشهد بالضبط، لكن عند النهاية:
 *     9.4  – 10.9 : إطار صورة المستخدم يرتفع للأعلى (لمنتصف البث)
 *     10.6 – 12.9 : البلورة تطير من السجادة بمسار حلزوني وتصعد فوق الإطار + بوق وأجراس عند الوصول
 *     12.9 – 17.0 : البلورة تحوم فوق إطار صورته بضوء ذهبي ينزل على الإطار
 *     17.0        : البلورة تتلاشى بشرر ذهبي، ثم الإطار يرجع لمكانه والقلعة تتلاشى
 *
 * ملف مستقل: الأصوات في src/lib/castleSounds.ts (مو داخل فولدر gifts). غيّر الأرقام تحت (السعر/المدد/التوقيتات).
 *
 * ربط الأنميشن بالواجهة (يعمل تلقائياً بدونها):
 *   data-gift-user + window.__stooornaGiftLift : (يضعها LiveCoinsDock تلقائياً) لما صاحب البث يعطي مستخدم/متحدث:
 *                    صورته تصعد للأعلى وتطير البلورة فوق إطارها.
 *   data-gift-host / data-gift-hot : (اختياري) عناصر تظهر فوق القلعة وتلمع عليها لمعات ذهبية.
 *   الأزرار والحقول (button, [role=button], a[href], input, textarea, select) تبقى ظاهرة فوق القلعة بإطار ذهبي.
 */
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { GiftDefinition } from '../../lib/types';
import { playCastleSound } from '../../lib/castleSounds';

// ── إعدادات الهدية ──────────────────────────────────────────────────────
const PRICE = 3500;
const TOTAL_MS = 20000;            // مدة الأنميشن الكلية (20 ثانية)
const TOTAL_S = TOTAL_MS / 1000;

const DARK_IN = 1.4;               // مدة تحول البث لقلعة
const DOORS_AT = 0.9;              // بداية انفتاح البوابة
const DOORS_S = 1.5;               // مدة الانفتاح
const CARPET_AT = 1.8;             // بداية فرد السجادة
const CARPET_S = 1.6;              // مدة فرد السجادة
const FANFARE_AT = 2.0;            // الدخول الملكي (الصوت)
const ORB_DROP_AT = 3.4;           // البلورة تبدأ تنزل
const ORB_LAND_AT = 4.6;           // البلورة تستقر بمنتصف السجادة
const SHINE_TIMES = [6.4, 8.6, 10.8, 13.0];
const FIREWORK_TIMES = [5.6, 6.9, 8.2, 9.6, 11.0, 12.4, 13.8];

const MAX_FX = 900;                // حد أقصى للجسيمات (للأداء على الجوال)
const HOT_SEL = 'button, [role="button"], a[href], input, textarea, select, [data-gift-host], [data-gift-hot]';

/** توقيتات تختلف حسب الهدية: لصاحب البث (البلورة تبقى بالسجادة) أو لمستخدم (البلورة تطير فوق إطاره) */
function timeline(lift: boolean) {
  return lift
    ? { liftUpAt: 9.4, orbFlyAt: 10.6, orbArriveAt: 12.9, orbOutAt: 17.0, liftBackAt: 17.2, liftBackEnd: 18.5, castleOutAt: 16.6, castleOutEnd: 19.4, fanfare2At: 12.9 }
    : { liftUpAt: 0, orbFlyAt: 0, orbArriveAt: 0, orbOutAt: 15.4, liftBackAt: 0, liftBackEnd: 0, castleOutAt: 16.0, castleOutEnd: 19.3, fanfare2At: 9.0 };
}

// ألوان السبرايتات: 0 ذهبي، 1 أبيض دافئ، 2 أحمر، 3 لهب، 4 لهب فاتح، 5 أزرق، 6 بنفسجي، 7 سحاب داكن
const SPR_RGB = ['255,206,84', '255,250,232', '232,38,64', '255,148,40', '255,222,130', '150,200,255', '192,142,255', '60,34,104'];
const CONF = ['#f2c14e', '#d9163a', '#fff1c1', '#7fb8ff', '#c08bff'];

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
//  Preview — قلعة صغيرة متحركة داخل مربع الهدايا
// ═══════════════════════════════════════════════════════════════════════
const CG_CSS = `
@keyframes cg-flick{0%,100%{transform:scale(1,1)}30%{transform:scale(.84,1.24)}60%{transform:scale(1.12,.88)}}
@keyframes cg-pulse{0%,100%{opacity:.8;transform:scale(1)}50%{opacity:1;transform:scale(1.2)}}
@keyframes cg-twinkle{0%,100%{opacity:.1;transform:scale(.4)}50%{opacity:1;transform:scale(1.25)}}
@keyframes cg-flag{0%,100%{transform:scaleX(1) skewY(0deg)}50%{transform:scaleX(.7) skewY(9deg)}}
@keyframes cg-glow{0%,100%{opacity:.4}50%{opacity:.95}}
@keyframes cg-gate{0%,100%{opacity:.72}50%{opacity:1}}
@keyframes cg-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-2.6px)}}
@keyframes cg-ray{to{transform:rotate(360deg)}}
@keyframes cg-halo{0%,100%{filter:drop-shadow(0 0 5px rgba(255,190,70,.5))}50%{filter:drop-shadow(0 0 11px rgba(255,214,110,.95))}}
.cg-flick{animation:cg-flick .5s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 100%}
.cg-pulse{animation:cg-pulse 1.6s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}
.cg-twinkle{animation:cg-twinkle 1.9s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}
.cg-flag{animation:cg-flag 1.1s ease-in-out infinite;transform-box:fill-box;transform-origin:0% 50%}
.cg-glow{animation:cg-glow 1.8s ease-in-out infinite}
.cg-gate{animation:cg-gate 1.3s ease-in-out infinite}
.cg-float{animation:cg-float 2.2s ease-in-out infinite}
.cg-ray{animation:cg-ray 7s linear infinite;transform-box:fill-box;transform-origin:50% 50%}
.cg-halo{animation:cg-halo 1.8s ease-in-out infinite}
`;

const WALL_MERLONS = Array.from({ length: 14 }, (_, i) => 8 + i * 6.4);
const KEEP_MERLONS = Array.from({ length: 6 }, (_, i) => 33 + i * 6);
const STARS: { x: number; y: number; r: number; d: number }[] = [
  { x: 12, y: 12, r: 0.9, d: 0 }, { x: 28, y: 6, r: 0.7, d: 0.6 }, { x: 70, y: 8, r: 0.8, d: 1.1 },
  { x: 90, y: 28, r: 0.7, d: 0.3 }, { x: 6, y: 34, r: 0.6, d: 1.4 }, { x: 62, y: 16, r: 0.6, d: 0.9 },
];

function CastlePreview({ size = 72 }: { size?: number }) {
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
      <style>{CG_CSS}</style>
      <svg width={w} height={h} viewBox="0 0 100 112" className="cg-halo" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <radialGradient id={`glow${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffd36a" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#ff8a1a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`stone${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5a5280" />
            <stop offset="55%" stopColor="#2f2950" />
            <stop offset="100%" stopColor="#171028" />
          </linearGradient>
          <linearGradient id={`roof${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#5a0f2a" />
            <stop offset="50%" stopColor="#c01f42" />
            <stop offset="100%" stopColor="#4a0c24" />
          </linearGradient>
          <linearGradient id={`gate${uid}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#fff3b8" />
            <stop offset="60%" stopColor="#ffae3a" />
            <stop offset="100%" stopColor="#7a2440" />
          </linearGradient>
          <linearGradient id={`carpet${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#6a0a1c" />
            <stop offset="50%" stopColor="#d0152f" />
            <stop offset="100%" stopColor="#6a0a1c" />
          </linearGradient>
          <radialGradient id={`orb${uid}`} cx="38%" cy="32%" r="70%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="30%" stopColor="#c9ecff" />
            <stop offset="60%" stopColor="#7fb8ff" />
            <stop offset="88%" stopColor="#6a4fd6" />
            <stop offset="100%" stopColor="#2b1a6e" />
          </radialGradient>
          <radialGradient id={`orbglow${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#d6f0ff" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#8fb8ff" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx="50" cy="52" r="46" fill={ref('glow')} className="cg-glow" />

        {/* نجوم + قمر */}
        {STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff6d0" className="cg-twinkle" style={{ animationDelay: `${s.d}s` }} />
        ))}
        <circle cx="84" cy="14" r="5" fill="#fff3c8" opacity="0.9" />

        {/* القلعة */}
        <rect x="8" y="58" width="84" height="26" fill={ref('stone')} />
        {WALL_MERLONS.map((x, i) => <rect key={i} x={x} y="55" width="3.6" height="3.4" fill="#3a3458" />)}
        <rect x="33" y="40" width="34" height="44" fill={ref('stone')} />
        {KEEP_MERLONS.map((x, i) => <rect key={i} x={x} y="37.4" width="3.4" height="2.8" fill="#3a3458" />)}
        <rect x="12" y="36" width="15" height="48" fill={ref('stone')} />
        <rect x="73" y="36" width="15" height="48" fill={ref('stone')} />
        <rect x="43" y="22" width="14" height="20" fill={ref('stone')} />
        <polygon points="10,36 29,36 19.5,20" fill={ref('roof')} />
        <polygon points="71,36 90,36 80.5,20" fill={ref('roof')} />
        <polygon points="40,22 60,22 50,5" fill={ref('roof')} />
        <g stroke="#e8b648" strokeWidth="0.6">
          <line x1="50" y1="5" x2="50" y2="0" />
          <line x1="19.5" y1="20" x2="19.5" y2="15" />
          <line x1="80.5" y1="20" x2="80.5" y2="15" />
        </g>
        <polygon points="50,0.4 58,2.8 50,5.2" fill="#d0152f" className="cg-flag" />
        <polygon points="19.5,15 26,17 19.5,19" fill="#d0152f" className="cg-flag" style={{ animationDelay: '0.3s' }} />
        <polygon points="80.5,15 87,17 80.5,19" fill="#d0152f" className="cg-flag" style={{ animationDelay: '0.6s' }} />

        {/* النوافذ */}
        {[[17.8, 42], [78.8, 42], [48.3, 27], [37.2, 48], [59.4, 48]].map(([x, y], i) => (
          <rect key={i} x={x} y={y} width="3.4" height="6" rx="1.7" fill="#ffd56a" className="cg-glow" style={{ animationDelay: `${i * 0.35}s` }} />
        ))}

        {/* البوابة */}
        <path d="M42 84 V74 A8 8 0 0 1 58 74 V84 Z" fill={ref('gate')} className="cg-gate" />
        <rect x="42" y="66" width="2.6" height="18" fill="#3b2316" />
        <rect x="55.4" y="66" width="2.6" height="18" fill="#3b2316" />

        {/* السجادة الحمراء */}
        <polygon points="45,84 55,84 74,110 26,110" fill={ref('carpet')} />
        <g stroke="#f2c14e" strokeWidth="1" fill="none">
          <line x1="45" y1="84" x2="26" y2="110" />
          <line x1="55" y1="84" x2="74" y2="110" />
        </g>
        <polygon points="50,87.4 52.4,89.4 50,91.4 47.6,89.4" fill="#e9b94a" />
        <polygon points="50,103 53.4,105.6 50,108.2 46.6,105.6" fill="#e9b94a" />

        {/* المشاعل */}
        {[27, 73].map((x, i) => (
          <g key={i}>
            <circle cx={x} cy="97.6" r="5.5" fill="#ff9a2a" opacity="0.28" className="cg-glow" style={{ animationDelay: `${i * 0.4}s` }} />
            <rect x={x - 0.7} y="100" width="1.4" height="6" fill="#e8b648" />
            <ellipse cx={x} cy="98.4" rx="2.2" ry="3.4" fill="#ffb02e" className="cg-flick" style={{ animationDelay: `${i * 0.2}s` }} />
            <ellipse cx={x} cy="99" rx="1.1" ry="2" fill="#fff3b0" className="cg-flick" style={{ animationDelay: `${i * 0.2 + 0.1}s` }} />
          </g>
        ))}

        {/* البلورة اللامعة */}
        <g className="cg-float">
          <circle cx="50" cy="96" r="12" fill={ref('orbglow')} className="cg-pulse" />
          <g className="cg-ray" stroke="#ffffff" strokeWidth="0.5" opacity="0.5">
            {[0, 45, 90, 135].map(a => (
              <line key={a} x1="50" y1="84.5" x2="50" y2="107.5" transform={`rotate(${a} 50 96)`} />
            ))}
          </g>
          <circle cx="50" cy="96" r="6.4" fill={ref('orb')} />
          <ellipse cx="47.6" cy="93.6" rx="1.8" ry="1.2" fill="#ffffff" opacity="0.9" />
          <path d="M44 99.5 Q50 102.4 56 99.5" stroke="#ffe08a" strokeWidth="0.6" fill="none" opacity="0.8" />
        </g>
        <ellipse cx="50" cy="103.2" rx="6" ry="1.6" fill="#e8b648" />
        {[[40, 91, 0], [60, 92, 0.7], [44, 102, 1.2], [57, 101, 0.4]].map(([x, y, d], i) => (
          <path key={i} d={`M${x} ${y - 2.2} L${x + 0.6} ${y - 0.6} L${x + 2.2} ${y} L${x + 0.6} ${y + 0.6} L${x} ${y + 2.2} L${x - 0.6} ${y + 0.6} L${x - 2.2} ${y} L${x - 0.6} ${y - 0.6} Z`} fill="#fff6c8" className="cg-twinkle" style={{ animationDelay: `${d}s` }} />
        ))}
      </svg>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  القلعة الثابتة (تُرسم مرة وحدة على canvas جانبي ثم تُنسخ كل إطار)
// ═══════════════════════════════════════════════════════════════════════
interface CastleGeo {
  cx: number; gy: number; S: number;
  gate: { x: number; w: number; h: number };
  windows: { x: number; y: number; w: number; h: number }[];
  flags: { x: number; y: number; s: number }[];
  torches: { x: number; y: number }[];
}

function archPath(c: CanvasRenderingContext2D, x: number, w: number, h: number, gy: number, grow: number) {
  c.beginPath();
  c.moveTo(x - grow, gy);
  c.lineTo(x - grow, gy - h + w / 2);
  c.arc(x + w / 2, gy - h + w / 2, w / 2 + grow, Math.PI, 0);
  c.lineTo(x + w + grow, gy);
  c.closePath();
}

function buildCastle(W: number, H: number, dpr: number): { cv: HTMLCanvasElement; geo: CastleGeo } {
  const cv = document.createElement('canvas');
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  const S = Math.min(W, H * 0.62);
  const cx = W / 2;
  const gy = H * 0.6;
  const gw = S * 0.17;
  const gh = S * 0.27;
  const geo: CastleGeo = { cx, gy, S, gate: { x: cx - gw / 2, w: gw, h: gh }, windows: [], flags: [], torches: [] };
  const g = cv.getContext('2d');
  if (!g) return { cv, geo };
  g.scale(dpr, dpr);

  let seed = 7;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  // السماء
  const sky = g.createLinearGradient(0, 0, 0, gy);
  sky.addColorStop(0, '#060a24');
  sky.addColorStop(0.45, '#1c1047');
  sky.addColorStop(0.8, '#5a1f5e');
  sky.addColorStop(1, '#a8465a');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);

  // نجوم
  for (let i = 0; i < 80; i++) {
    g.fillStyle = `rgba(255,248,225,${0.35 + r() * 0.55})`;
    g.beginPath();
    g.arc(r() * W, r() * gy * 0.62, 0.5 + r() * 0.9, 0, Math.PI * 2);
    g.fill();
  }
  // قمر
  const mx = W * 0.82, my = H * 0.1, mr = S * 0.045;
  const mg = g.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 4);
  mg.addColorStop(0, 'rgba(255,244,205,0.55)');
  mg.addColorStop(1, 'rgba(255,244,205,0)');
  g.fillStyle = mg;
  g.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
  g.fillStyle = '#fff4d0';
  g.beginPath();
  g.arc(mx, my, mr, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(190,170,130,0.25)';
  [[-0.3, -0.2, 0.25], [0.3, 0.25, 0.2], [0.1, -0.4, 0.14]].forEach(([dx, dy, s]) => {
    g.beginPath();
    g.arc(mx + dx * mr, my + dy * mr, s * mr, 0, Math.PI * 2);
    g.fill();
  });

  // جبال بعيدة
  g.fillStyle = '#190e38';
  g.beginPath();
  g.moveTo(0, gy);
  for (let x = 0; x <= W + W / 8; x += W / 8) g.lineTo(x, gy - S * (0.1 + 0.09 * r()));
  g.lineTo(W, gy);
  g.closePath();
  g.fill();

  // ── عناصر القلعة ──
  const stone = (x: number, y: number, w: number, h: number) => {
    const gr = g.createLinearGradient(x, 0, x + w, 0);
    gr.addColorStop(0, '#2c2744');
    gr.addColorStop(0.45, '#554d78');
    gr.addColorStop(1, '#221e38');
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(10,6,24,0.28)';
    g.lineWidth = 1;
    const row = S * 0.032;
    const step = S * 0.05;
    g.beginPath();
    let ri = 0;
    for (let yy = y + row; yy < y + h; yy += row, ri++) {
      g.moveTo(x, yy);
      g.lineTo(x + w, yy);
      for (let xx = x + (ri % 2 ? step / 2 : 0); xx < x + w; xx += step) { g.moveTo(xx, yy - row); g.lineTo(xx, yy); }
    }
    g.stroke();
  };
  const merl = (x: number, y: number, w: number) => {
    const m = S * 0.026;
    g.fillStyle = '#3d3658';
    for (let xx = x; xx < x + w - m * 0.5; xx += m * 2) g.fillRect(xx, y - m, Math.min(m, x + w - xx), m);
  };
  const win = (x: number, y: number, w: number, h: number) => {
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, '#fff3b8');
    gr.addColorStop(1, '#ff9d3a');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(x - w / 2, y + h);
    g.lineTo(x - w / 2, y + w / 2);
    g.arc(x, y + w / 2, w / 2, Math.PI, 0);
    g.lineTo(x + w / 2, y + h);
    g.closePath();
    g.fill();
    g.strokeStyle = '#1a1230';
    g.lineWidth = Math.max(1, S * 0.004);
    g.stroke();
    g.fillStyle = '#1a1230';
    g.fillRect(x - 0.5, y, 1, h);
    geo.windows.push({ x, y: y + h / 2, w, h });
  };
  const roof = (x: number, w: number, yBase: number, h: number) => {
    const ov = w * 0.14;
    const gr = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    gr.addColorStop(0, '#5a0f2a');
    gr.addColorStop(0.5, '#b01c3c');
    gr.addColorStop(1, '#4a0c24');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(x - w / 2 - ov, yBase);
    g.lineTo(x, yBase - h);
    g.lineTo(x + w / 2 + ov, yBase);
    g.closePath();
    g.fill();
    g.fillStyle = '#e8b648';
    g.fillRect(x - w / 2 - ov, yBase - S * 0.006, w + ov * 2, S * 0.012);
    g.beginPath();
    g.arc(x, yBase - h, S * 0.008, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#e8b648';
    g.lineWidth = Math.max(1, S * 0.004);
    g.beginPath();
    g.moveTo(x, yBase - h);
    g.lineTo(x, yBase - h - S * 0.05);
    g.stroke();
    geo.flags.push({ x, y: yBase - h - S * 0.05, s: S * 0.05 });
  };
  const tower = (x: number, w: number, top: number, roofH: number, wins: number[]) => {
    stone(x - w / 2, top, w, gy - top);
    g.fillStyle = '#3a3454';
    g.fillRect(x - w * 0.58, top - S * 0.012, w * 1.16, S * 0.03);
    roof(x, w, top - S * 0.012, roofH);
    wins.forEach(o => win(x, top + o, S * 0.022, S * 0.045));
  };

  const wallTop = H * 0.4;
  stone(0, wallTop, W, gy - wallTop);
  merl(0, wallTop, W);
  tower(cx - S * 0.44, S * 0.1, H * 0.32, S * 0.11, [S * 0.07]);
  tower(cx + S * 0.44, S * 0.1, H * 0.32, S * 0.11, [S * 0.07]);
  const keepTop = H * 0.3;
  stone(cx - S * 0.17, keepTop, S * 0.34, gy - keepTop);
  merl(cx - S * 0.17, keepTop, S * 0.34);
  win(cx - S * 0.1, keepTop + S * 0.07, S * 0.024, S * 0.05);
  win(cx + S * 0.1, keepTop + S * 0.07, S * 0.024, S * 0.05);
  tower(cx - S * 0.29, S * 0.12, H * 0.24, S * 0.14, [S * 0.07, S * 0.2]);
  tower(cx + S * 0.29, S * 0.12, H * 0.24, S * 0.14, [S * 0.07, S * 0.2]);
  tower(cx, S * 0.15, H * 0.19, S * 0.17, [S * 0.06]);

  // البوابة: إطار حجري + داخل مظلم + حجر القفل الذهبي
  g.fillStyle = '#2a2442';
  archPath(g, geo.gate.x, gw, gh, gy, S * 0.02);
  g.fill();
  g.fillStyle = '#07040f';
  archPath(g, geo.gate.x, gw, gh, gy, 0);
  g.fill();
  g.fillStyle = '#e8b648';
  g.beginPath();
  g.moveTo(cx - S * 0.016, gy - gh - S * 0.02);
  g.lineTo(cx + S * 0.016, gy - gh - S * 0.02);
  g.lineTo(cx + S * 0.011, gy - gh + S * 0.012);
  g.lineTo(cx - S * 0.011, gy - gh + S * 0.012);
  g.closePath();
  g.fill();

  // رايات حمراء على واجهة القلعة
  [-1, 1].forEach(sd => {
    const bx = cx + sd * S * 0.115;
    const by = gy - S * 0.34;
    const bw = S * 0.045;
    const bh = S * 0.16;
    g.strokeStyle = '#e8b648';
    g.lineWidth = Math.max(1.5, S * 0.006);
    g.beginPath();
    g.moveTo(bx - bw * 0.7, by);
    g.lineTo(bx + bw * 0.7, by);
    g.stroke();
    const bg = g.createLinearGradient(bx - bw / 2, 0, bx + bw / 2, 0);
    bg.addColorStop(0, '#7a0f26');
    bg.addColorStop(0.5, '#d0152f');
    bg.addColorStop(1, '#7a0f26');
    g.fillStyle = bg;
    g.beginPath();
    g.moveTo(bx - bw / 2, by);
    g.lineTo(bx + bw / 2, by);
    g.lineTo(bx + bw / 2, by + bh);
    g.lineTo(bx, by + bh - S * 0.03);
    g.lineTo(bx - bw / 2, by + bh);
    g.closePath();
    g.fill();
    g.fillStyle = '#f2c14e';
    g.beginPath();
    g.arc(bx, by + bh * 0.38, S * 0.011, 0, Math.PI * 2);
    g.fill();
  });

  // حوامل مشاعل بجانب البوابة
  [-1, 1].forEach(sd => {
    const tx = cx + sd * (gw / 2 + S * 0.06);
    const ty = gy - S * 0.1;
    g.fillStyle = '#e8b648';
    g.fillRect(tx - S * 0.004, ty, S * 0.008, S * 0.06);
    g.beginPath();
    g.moveTo(tx - S * 0.014, ty - S * 0.012);
    g.lineTo(tx + S * 0.014, ty - S * 0.012);
    g.lineTo(tx + S * 0.008, ty + S * 0.006);
    g.lineTo(tx - S * 0.008, ty + S * 0.006);
    g.closePath();
    g.fill();
    geo.torches.push({ x: tx, y: ty - S * 0.012 });
  });

  // ضباب عند الأفق
  const fog = g.createLinearGradient(0, gy - S * 0.12, 0, gy + S * 0.02);
  fog.addColorStop(0, 'rgba(255,170,130,0)');
  fog.addColorStop(1, 'rgba(255,170,130,0.2)');
  g.fillStyle = fog;
  g.fillRect(0, gy - S * 0.12, W, S * 0.14);

  // ساحة القلعة (أرضية حجرية بمنظور)
  const gg = g.createLinearGradient(0, gy, 0, H);
  gg.addColorStop(0, '#3a2c4c');
  gg.addColorStop(1, '#120b1e');
  g.fillStyle = gg;
  g.fillRect(0, gy, W, H - gy);
  g.strokeStyle = 'rgba(150,130,190,0.09)';
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 1; i < 10; i++) {
    const yy = gy + Math.pow(i / 10, 1.7) * (H - gy);
    g.moveTo(0, yy);
    g.lineTo(W, yy);
  }
  for (let j = -8; j <= 8; j++) {
    g.moveTo(cx, gy);
    g.lineTo(cx + j * (W / 7), H);
  }
  g.stroke();

  // تعتيم الأطراف
  const vg = g.createRadialGradient(cx, H * 0.5, H * 0.28, cx, H * 0.5, H * 0.86);
  vg.addColorStop(0, 'rgba(4,2,14,0)');
  vg.addColorStop(1, 'rgba(4,2,14,0.55)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);

  return { cv, geo };
}

// ═══════════════════════════════════════════════════════════════════════
//  Animation — أنميشن ملء الشاشة (Canvas)
// ═══════════════════════════════════════════════════════════════════════
interface Pt {
  k: 0 | 1 | 2;                // 0 توهج، 1 قصاصة، 2 نجمة لامعة
  x: number; y: number; vx: number; vy: number;
  size: number; life: number; age: number;
  grav: number; drag: number; col: number; rot: number; vr: number;
}
interface Hot { x: number; y: number; w: number; h: number; rad: number; }
interface Ring { x: number; y: number; born: number; dur: number; maxR: number; w: number; }
interface Lift { sx: number; sy: number; sr: number; ex: number; ey: number; R: number; img: HTMLImageElement | null; letter: string; name: string; restore: () => void; done?: boolean; }
interface LiftInfo { userId: string; name?: string; avatarUrl?: string | null; }
interface Torch { x: number; y: number; s: number; stand: number; at: number; }

// وضع الرفع: الهدية لمستخدم/متحدث (مو لصاحب البث) → صورته تصعد للأعلى والبلورة تطير فوق إطاره
// معلومات المستلم يحطها LiveCoinsDock في window.__stooornaGiftLift (تشتغل حتى لو صورته مو ظاهرة بالقائمة الجانبية)
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
    const ey = H * 0.33;                       // أعلى منتصف البث
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

function CastleAnimation({ onDone }: { onDone: () => void }) {
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

    // هدية لمستخدم؟ (يحدّدها LiveCoinsDock قبل التشغيل)
    const liftInfo0 = getLiftInfo();
    const lift = !!liftInfo0;
    const TL = timeline(lift);
    let liftPre: HTMLImageElement | null = null;
    if (liftInfo0 && liftInfo0.avatarUrl) {
      try { liftPre = new Image(); liftPre.src = String(liftInfo0.avatarUrl); } catch { liftPre = null; }
    }

    // ── السبرايتات ──
    const SPR = SPR_RGB.map(rgb => makeSprite(rgb, 0.3));
    const blob = (sp: HTMLCanvasElement, x: number, y: number, r: number, a: number) => {
      if (a <= 0.003 || r <= 0.2) return;
      c.globalAlpha = Math.min(1, a);
      c.drawImage(sp, x - r, y - r, r * 2, r * 2);
    };
    const glow = (i: number, x: number, y: number, r: number, a: number) => {
      c.globalCompositeOperation = 'lighter';
      blob(SPR[i], x, y, r, a);
      c.globalCompositeOperation = 'source-over';
    };

    // ── هندسة القلعة ──
    const castle = buildCastle(W, H, dpr);
    const { cx, gy, S, gate } = castle.geo;
    const orbR = Math.max(24, Math.min(S * 0.085, 44));
    const hwAt = (y: number) => lerp(S * 0.055, S * 0.3, clamp01((y - gy) / (H - gy)));
    const orbRestY = gy + (H - gy) * 0.42 - orbR * 1.2;

    // المشاعل: اثنين على جانبي البوابة + أربعة على جانبي السجادة
    const torches: Torch[] = [];
    castle.geo.torches.forEach(tp => torches.push({ x: tp.x, y: tp.y, s: S * 0.03, stand: 0, at: DOORS_AT + 0.2 }));
    [0.16, 0.5].forEach(d => {
      const y = gy + (H - gy) * d;
      [-1, 1].forEach(sd => {
        const sT = S * (0.025 + 0.03 * d);
        const hS = S * (0.05 + 0.07 * d);
        torches.push({ x: cx + sd * (hwAt(y) + S * 0.05 * (0.5 + d)), y: y - hS, s: sT, stand: hS, at: CARPET_AT + CARPET_S * 0.7 });
      });
    });

    // ── حالة ──
    const fx: Pt[] = [];
    const rings: Ring[] = [];
    let hot: Hot[] = [];
    let hotAt = -9;
    const acc = { conf: 0, dust: 0, torch: 0, glint: 0, hot: 0 };
    let landed = false;
    let arrived = false;
    let orbGone = false;
    let shineIdx = 0;
    let fwIdx = 0;
    let flash = 0;
    let lastOrbX = cx;
    let lastOrbY = orbRestY;
    let L: Lift | null = null;
    let q = 1;
    let emaDt = 0.016;

    const spawn = (kind: Pt['k'], x: number, y: number, vx: number, vy: number, size: number, life: number, col: number, o: Partial<Pt> = {}) => {
      if (fx.length >= MAX_FX) return;
      fx.push({ k: kind, x, y, vx, vy, size, life, age: 0, grav: 0, drag: 0, col, rot: Math.random() * 6.28, vr: rnd(-6, 6), ...o });
    };
    const burst = (x: number, y: number, n: number, spd: number, cols: number[], size = 6) => {
      const cnt = Math.floor(n * q);
      for (let i = 0; i < cnt; i++) {
        const a = rnd(0, Math.PI * 2);
        const sp = rnd(0.3, 1) * spd * k;
        spawn(i % 5 === 0 ? 2 : 0, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 30 * k, rnd(0.6, 1.2) * size * k, rnd(0.7, 1.5), cols[i % cols.length], { drag: 1.5, grav: 120 * k });
      }
    };

    const rrPath = (x: number, y: number, w: number, h: number, r: number) => {
      const rr = Math.max(0, Math.min(r, w / 2, h / 2));
      c.beginPath();
      c.moveTo(x + rr, y);
      c.arcTo(x + w, y, x + w, y + h, rr);
      c.arcTo(x + w, y + h, x, y + h, rr);
      c.arcTo(x, y + h, x, y, rr);
      c.arcTo(x, y, x + w, y, rr);
      c.closePath();
    };
    const collectHot = (): Hot[] => {
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
          out.push({ x: r.left, y: r.top, w: r.width, h: r.height, rad: Math.min(rad, r.width / 2, r.height / 2) });
        });
      } catch { /* ignore */ }
      return out;
    };

    // ── الصوت ──
    const stopSound = playCastleSound({
      totalS: TOTAL_S,
      doorsAt: DOORS_AT,
      carpetAt: CARPET_AT,
      fanfareAt: FANFARE_AT,
      orbDropAt: ORB_DROP_AT,
      orbLandAt: ORB_LAND_AT,
      shineTimes: SHINE_TIMES,
      popTimes: FIREWORK_TIMES.filter(x => x < TL.castleOutAt - 0.5),
      fanfare2At: TL.fanfare2At,
      lift,
      orbFlyAt: TL.orbFlyAt,
      orbArriveAt: TL.orbArriveAt,
      endFadeAt: TL.castleOutAt,
    });

    // ── رسم السجادة الحمراء (تنفرد من البوابة نحو الشاشة) ──
    const drawCarpet = (p: number, ca: number) => {
      if (p <= 0.002) return;
      const yF = lerp(gy, H + 6, p);
      const hw0 = hwAt(gy);
      const hwF = hwAt(yF);
      c.globalAlpha = ca;
      const cg = c.createLinearGradient(cx - hwF, 0, cx + hwF, 0);
      cg.addColorStop(0, '#6a0a1c');
      cg.addColorStop(0.5, '#c8132f');
      cg.addColorStop(1, '#6a0a1c');
      c.fillStyle = cg;
      c.beginPath();
      c.moveTo(cx - hw0, gy);
      c.lineTo(cx + hw0, gy);
      c.lineTo(cx + hwF, yF);
      c.lineTo(cx - hwF, yF);
      c.closePath();
      c.fill();
      [[1, 2.4 * k], [0.86, 1.2 * k]].forEach(([f, lw]) => {
        c.strokeStyle = '#f2c14e';
        c.lineWidth = lw;
        [-1, 1].forEach(sd => {
          c.beginPath();
          c.moveTo(cx + sd * hw0 * f, gy);
          c.lineTo(cx + sd * hwF * f, yF);
          c.stroke();
        });
      });
      for (let i = 0; i < 9; i++) {
        const d = Math.pow((i + 0.6) / 9, 1.5);
        const y = gy + (H - gy) * d;
        if (y > yF) break;
        const s = hwAt(y) * 0.26;
        c.fillStyle = '#e9b94a';
        c.beginPath();
        c.moveTo(cx, y - s * 0.6);
        c.lineTo(cx + s, y);
        c.lineTo(cx, y + s * 0.6);
        c.lineTo(cx - s, y);
        c.closePath();
        c.fill();
        c.fillStyle = '#a30f27';
        c.beginPath();
        c.moveTo(cx, y - s * 0.3);
        c.lineTo(cx + s * 0.5, y);
        c.lineTo(cx, y + s * 0.3);
        c.lineTo(cx - s * 0.5, y);
        c.closePath();
        c.fill();
      }
      if (p < 0.995) {
        const rh = 8 * k + hwF * 0.08;
        const rg = c.createLinearGradient(0, yF - rh / 2, 0, yF + rh / 2);
        rg.addColorStop(0, '#f0506a');
        rg.addColorStop(0.5, '#b8122c');
        rg.addColorStop(1, '#5a0818');
        c.fillStyle = rg;
        rrPath(cx - hwF, yF - rh / 2, hwF * 2, rh, rh / 2);
        c.fill();
        c.fillStyle = '#e8b648';
        c.fillRect(cx - hwF - 2, yF - rh / 2, 3, rh);
        c.fillRect(cx + hwF - 1, yF - rh / 2, 3, rh);
      }
      c.globalAlpha = 1;
    };

    // ── رسم البلورة اللامعة ──
    const drawOrb = (x: number, y: number, r: number, a: number, t: number, inten: number) => {
      if (a <= 0.01) return;
      const pulse = 0.85 + 0.15 * Math.sin(t * 4.2);
      glow(0, x, y, r * 4.2, 0.4 * a * inten * pulse);
      glow(5, x, y, r * 2.6, 0.5 * a * inten);
      glow(1, x, y, r * 1.7, 0.7 * a * pulse);
      // أشعة دوّارة
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.translate(x, y);
      c.rotate(t * 0.5);
      c.strokeStyle = 'rgba(255,248,220,1)';
      c.globalAlpha = 0.2 * a * inten;
      for (let i = 0; i < 8; i++) {
        c.rotate(Math.PI / 4);
        c.lineWidth = i % 2 ? 1.5 * k : 3 * k;
        c.beginPath();
        c.moveTo(0, r * 0.9);
        c.lineTo(0, r * (i % 2 ? 3.2 : 4.6));
        c.stroke();
      }
      c.restore();
      c.globalCompositeOperation = 'source-over';
      // الكرة
      c.globalAlpha = a;
      const og = c.createRadialGradient(x - r * 0.32, y - r * 0.38, r * 0.08, x, y, r);
      og.addColorStop(0, '#ffffff');
      og.addColorStop(0.3, '#d6f2ff');
      og.addColorStop(0.62, '#7fb8ff');
      og.addColorStop(0.9, '#6a4fd6');
      og.addColorStop(1, '#2b1a6e');
      c.fillStyle = og;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
      // دوامة سحرية داخلها
      c.save();
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.clip();
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = 'rgba(255,255,255,0.35)';
      c.lineWidth = Math.max(1.5, r * 0.07);
      for (let i = 0; i < 2; i++) {
        c.beginPath();
        c.ellipse(x, y, r * 0.78, r * 0.3, t * (i ? -1.2 : 1.1) + i, 0, Math.PI * 2);
        c.stroke();
      }
      c.restore();
      // لمعة + حافة
      c.globalAlpha = a;
      c.fillStyle = 'rgba(255,255,255,0.92)';
      c.beginPath();
      c.ellipse(x - r * 0.36, y - r * 0.42, r * 0.22, r * 0.13, -0.6, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(255,230,150,0.7)';
      c.lineWidth = Math.max(1.5, r * 0.06);
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.stroke();
      // نجمة لامعة تنبض
      c.save();
      c.globalCompositeOperation = 'lighter';
      const sf = (0.6 + 0.4 * Math.sin(t * 5.3)) * a;
      c.globalAlpha = 0.85 * sf;
      c.fillStyle = '#fff6d0';
      const sx = x - r * 0.36, sy = y - r * 0.42, sl = r * 0.9;
      c.fillRect(sx - sl, sy - 0.8, sl * 2, 1.6);
      c.fillRect(sx - 0.8, sy - sl, 1.6, sl * 2);
      c.restore();
      c.globalAlpha = 1;
    };

    const start = performance.now();
    let last = start;
    let raf = 0;

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

      const ca = smooth(t / DARK_IN) * (1 - smooth((t - TL.castleOutAt) / (TL.castleOutEnd - TL.castleOutAt)));
      const doorsOpen = smooth((t - DOORS_AT) / DOORS_S);
      const carpetP = easeOut((t - CARPET_AT) / CARPET_S);

      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);

      // ── حالة البلورة ──
      let orbA = 0, orbX = cx, orbY = orbRestY, orbSc = 1, flyS = 0;
      if (lift && !L && t >= TL.liftUpAt - 0.8) L = findLift(W, H, liftPre);
      if (t >= ORB_DROP_AT && t < TL.orbOutAt + 1) {
        if (t < ORB_LAND_AT) {
          const d = clamp01((t - ORB_DROP_AT) / (ORB_LAND_AT - ORB_DROP_AT));
          orbY = lerp(-orbR * 3, orbRestY, d * d);
          orbA = smooth(d * 3);
        } else {
          const bt = t - ORB_LAND_AT;
          orbY = orbRestY - Math.exp(-bt * 4.5) * Math.abs(Math.sin(bt * 8)) * 34 * k + Math.sin(t * 2.1) * 4 * k * smooth(bt / 1.2);
          orbA = 1;
        }
        if (lift && t >= TL.orbFlyAt) {
          const u = clamp01((t - TL.orbFlyAt) / (TL.orbArriveAt - TL.orbFlyAt));
          flyS = smooth(u);
          const tx = L ? L.ex : cx;
          const ty = L ? L.ey - L.R - orbR * 0.8 - 14 * k : H * 0.12;
          orbX = lerp(cx, tx, flyS) + Math.sin(flyS * Math.PI * 2) * W * 0.14 * (1 - flyS * 0.4);
          orbY = lerp(orbRestY, ty, flyS) - Math.sin(Math.PI * flyS) * H * 0.05 + (u >= 1 ? Math.sin(t * 2.4) * 4 * k : 0);
          orbSc = lerp(1, 0.8, flyS);
        }
        const fo = smooth((t - TL.orbOutAt) / 0.8);
        orbA *= 1 - fo;
        orbSc *= 1 + fo * 0.5;
      }
      lastOrbX = orbX;
      lastOrbY = orbY;
      const onCarpet = orbA * (1 - flyS);

      // ── أحداث لمرة وحدة ──
      if (!landed && t >= ORB_LAND_AT) {
        landed = true;
        burst(cx, orbRestY + orbR, 90, 520, [0, 1, 0, 3], 7);
        rings.push({ x: cx, y: orbRestY + orbR * 0.8, born: t, dur: 1.0, maxR: W * 0.9, w: 5 });
        rings.push({ x: cx, y: orbRestY + orbR * 0.8, born: t + 0.12, dur: 1.3, maxR: W * 1.2, w: 3 });
        flash = 1;
      }
      while (shineIdx < SHINE_TIMES.length && t >= SHINE_TIMES[shineIdx]) {
        shineIdx++;
        if (orbA > 0.3) {
          burst(lastOrbX, lastOrbY, 26, 260, [0, 1, 4], 5);
          rings.push({ x: lastOrbX, y: lastOrbY, born: t, dur: 0.9, maxR: orbR * 5, w: 3 });
        }
      }
      while (fwIdx < FIREWORK_TIMES.length && t >= FIREWORK_TIMES[fwIdx]) {
        const ft = FIREWORK_TIMES[fwIdx];
        fwIdx++;
        if (ft >= TL.castleOutAt - 0.5) continue;
        const fxp = rnd(0.12, 0.88) * W;
        const fyp = rnd(0.08, 0.3) * H;
        const pals = [[0, 1], [2, 0], [5, 1], [6, 1], [0, 2]];
        const pal = pals[Math.floor(Math.random() * pals.length)];
        const n = Math.floor(46 * q);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rnd(-0.05, 0.05);
          const sp = rnd(130, 260) * k;
          spawn(i % 6 === 0 ? 2 : 0, fxp, fyp, Math.cos(a) * sp, Math.sin(a) * sp, rnd(5, 8) * k, rnd(1.0, 1.6), pal[i % 2], { drag: 1.3, grav: 70 * k });
        }
        spawn(0, fxp, fyp, 0, 0, 120 * k, 0.28, pal[1]);
      }
      if (lift && !arrived && t >= TL.orbArriveAt) {
        arrived = true;
        burst(orbX, orbY, 70, 420, [0, 1, 5], 6);
        rings.push({ x: orbX, y: orbY, born: t, dur: 1.0, maxR: W * 0.7, w: 4 });
        flash = Math.max(flash, 0.5);
      }
      if (!orbGone && t >= TL.orbOutAt) {
        orbGone = true;
        burst(lastOrbX, lastOrbY, 110, 560, [0, 1, 0, 3], 7);
        rings.push({ x: lastOrbX, y: lastOrbY, born: t, dur: 1.1, maxR: W * 0.9, w: 5 });
      }
      flash = Math.max(0, flash - dt * 2.2);

      // ── أزرار البث (تظهر فوق القلعة بإطار ذهبي) ──
      if (t >= 0.3 && t < TL.castleOutEnd && t - hotAt > 0.5) { hot = collectHot(); hotAt = t; }

      // ═══ المشهد (قلعة + سجادة + مشاعل) مع هزّة خفيفة عند وصول البلورة ═══
      const sa = t >= ORB_LAND_AT ? 5 * k * Math.exp(-(t - ORB_LAND_AT) * 5) : 0;
      const shx = sa * Math.sin(t * 61);
      const shy = sa * Math.sin(t * 53 + 2) * 0.7;
      c.save();
      c.translate(shx, shy);

      c.globalAlpha = ca * 0.97;
      c.drawImage(castle.cv, 0, 0, W, H);

      // سحب تتحرك
      for (let i = 0; i < 3; i++) {
        const cxp = ((t * (8 + i * 4) + i * W * 0.45) % (W + 300)) - 150;
        blob(SPR[7], cxp, H * (0.1 + i * 0.07), S * (0.3 + i * 0.06), 0.4 * ca);
      }
      // نوافذ تلمع
      const winLit = smooth((t - 0.6) / 1.2);
      castle.geo.windows.forEach((wn, i) => {
        glow(0, wn.x, wn.y, S * 0.06, (0.34 + 0.12 * Math.sin(t * 3 + i * 1.7)) * ca * winLit);
      });
      // أعلام تتحرك
      c.globalAlpha = ca;
      castle.geo.flags.forEach(f => {
        c.fillStyle = '#d0152f';
        c.beginPath();
        c.moveTo(f.x, f.y);
        for (let i = 0; i <= 6; i++) c.lineTo(f.x + (i / 6) * f.s * 1.6, f.y + Math.sin(t * 5 + i * 0.9 + f.x) * f.s * 0.12 * (i / 6));
        for (let i = 6; i >= 0; i--) c.lineTo(f.x + (i / 6) * f.s * 1.6, f.y + f.s * 0.6 * (1 - 0.35 * (i / 6)) + Math.sin(t * 5 + i * 0.9 + f.x) * f.s * 0.12 * (i / 6));
        c.closePath();
        c.fill();
      });

      // بوابة القلعة: النور الذهبي + الأبواب تنزلق للجانبين
      if (ca > 0.01) {
        c.save();
        archPath(c, gate.x, gate.w, gate.h, gy, 0);
        c.clip();
        const gl = c.createRadialGradient(cx, gy, 0, cx, gy, gate.h);
        gl.addColorStop(0, '#fff7d0');
        gl.addColorStop(0.45, '#ffb347');
        gl.addColorStop(1, '#7a2440');
        c.globalAlpha = ca * doorsOpen * (0.9 + 0.08 * Math.sin(t * 6));
        c.fillStyle = gl;
        c.fillRect(gate.x, gy - gate.h, gate.w, gate.h);
        const lw = (gate.w / 2) * (1 - doorsOpen * 0.88);
        c.globalAlpha = ca;
        c.fillStyle = '#3b2316';
        c.fillRect(gate.x, gy - gate.h, lw, gate.h);
        c.fillRect(gate.x + gate.w - lw, gy - gate.h, lw, gate.h);
        c.fillStyle = '#e8b648';
        c.fillRect(gate.x + lw - 1.5, gy - gate.h, 1.5, gate.h);
        c.fillRect(gate.x + gate.w - lw, gy - gate.h, 1.5, gate.h);
        c.restore();
        glow(4, cx, gy - gate.h * 0.3, gate.h * 1.1, 0.5 * ca * doorsOpen);
        c.save();
        c.translate(cx, gy + S * 0.03);
        c.scale(1, 0.4);
        glow(4, 0, 0, S * 0.5, 0.6 * ca * doorsOpen);
        c.restore();
      }

      drawCarpet(carpetP, ca);

      // حوامل المشاعل + ضوء اللهب
      torches.forEach((tc, i) => {
        const ta = smooth((t - tc.at) / 0.6) * ca;
        if (ta <= 0.01) return;
        if (tc.stand > 0) {
          c.globalAlpha = ta;
          c.fillStyle = '#e8b648';
          c.fillRect(tc.x - S * 0.004, tc.y, S * 0.008, tc.stand);
          c.beginPath();
          c.moveTo(tc.x - tc.s * 0.5, tc.y - tc.s * 0.15);
          c.lineTo(tc.x + tc.s * 0.5, tc.y - tc.s * 0.15);
          c.lineTo(tc.x + tc.s * 0.3, tc.y + tc.s * 0.2);
          c.lineTo(tc.x - tc.s * 0.3, tc.y + tc.s * 0.2);
          c.closePath();
          c.fill();
        }
        const fl = 0.8 + 0.2 * Math.sin(t * 17 + i * 2.3) + 0.1 * Math.sin(t * 31 + i);
        glow(3, tc.x, tc.y - tc.s * 0.5, tc.s * 4.2 * fl, 0.4 * ta);
        glow(3, tc.x, tc.y - tc.s * 0.5, tc.s * 1.9 * fl, 0.75 * ta);
        glow(4, tc.x, tc.y - tc.s * 0.35, tc.s * 0.95 * fl, 0.95 * ta);
      });

      // نور البلورة على الأرض والقلعة + عمود نور
      if (onCarpet > 0.02) {
        c.save();
        c.translate(cx, orbRestY + orbR * 1.5);
        c.scale(1, 0.35);
        glow(0, 0, 0, S * 0.55, 0.55 * onCarpet * ca);
        c.restore();
        glow(1, cx, orbY, S * 0.8, 0.12 * onCarpet * ca * (0.85 + 0.15 * Math.sin(t * 3)));
        c.save();
        c.globalCompositeOperation = 'lighter';
        const bg = c.createLinearGradient(0, orbY, 0, 0);
        bg.addColorStop(0, 'rgba(255,240,190,0.22)');
        bg.addColorStop(1, 'rgba(255,240,190,0)');
        c.globalAlpha = onCarpet * ca * (0.8 + 0.2 * Math.sin(t * 2.6));
        c.fillStyle = bg;
        c.fillRect(cx - orbR * 0.7, 0, orbR * 1.4, orbY);
        c.restore();
      }
      // قاعدة ذهبية تحت البلورة
      if (orbA > 0.02 && !lift) {
        c.globalAlpha = orbA * ca;
        c.fillStyle = '#e8b648';
        c.beginPath();
        c.ellipse(cx, orbRestY + orbR * 1.18, orbR * 0.95, orbR * 0.26, 0, 0, Math.PI * 2);
        c.fill();
      } else if (orbA > 0.02 && lift) {
        c.globalAlpha = ca * clamp01(1 - flyS * 1.2) * orbA;
        c.fillStyle = '#e8b648';
        c.beginPath();
        c.ellipse(cx, orbRestY + orbR * 1.18, orbR * 0.95, orbR * 0.26, 0, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
      c.globalAlpha = 1;

      // ── أزرار البث فوق القلعة (نثقب القلعة حولها ونحيطها بإطار ذهبي) ──
      if (ca > 0.02 && hot.length) {
        c.save();
        c.globalCompositeOperation = 'destination-out';
        c.fillStyle = `rgba(0,0,0,${0.9 * ca})`;
        for (const h of hot) { rrPath(h.x - 2, h.y - 2, h.w + 4, h.h + 4, h.rad + 2); c.fill(); }
        c.restore();
        c.strokeStyle = `rgba(255,205,90,${0.5 * ca})`;
        c.lineWidth = 1.4;
        for (const h of hot) { rrPath(h.x - 1, h.y - 1, h.w + 2, h.h + 2, h.rad + 1); c.stroke(); }
      }

      // ── الإصدار (Emitters) ──
      // قصاصات ذهبية وحمراء
      if (t >= ORB_LAND_AT && t < TL.castleOutAt - 0.8) {
        acc.conf += dt * 30 * q;
        while (acc.conf >= 1) {
          acc.conf--;
          spawn(1, rnd(0, W), -10, rnd(-30, 30) * k, rnd(80, 170) * k, rnd(5, 9) * k, rnd(5, 8), Math.floor(Math.random() * CONF.length), { vr: rnd(-5, 5), drag: 0.2 });
        }
      }
      // غبار ذهبي حول البلورة
      if (orbA > 0.2) {
        acc.dust += dt * 38 * q * orbA;
        while (acc.dust >= 1) {
          acc.dust--;
          const a = rnd(0, Math.PI * 2);
          const rr = orbR * orbSc * rnd(1.0, 1.5);
          spawn(0, orbX + Math.cos(a) * rr, orbY + Math.sin(a) * rr, Math.cos(a) * rnd(10, 50) * k, Math.sin(a) * rnd(10, 50) * k - 20 * k, rnd(4, 8) * k, rnd(0.8, 1.4), Math.random() < 0.5 ? 0 : 1, { drag: 1, grav: -20 * k });
        }
      }
      // أثر البلورة وهي تطير
      if (lift && t >= TL.orbFlyAt && t < TL.orbArriveAt) {
        for (let i = 0; i < 3; i++) spawn(0, orbX + rnd(-1, 1) * orbR * 0.5, orbY + rnd(-1, 1) * orbR * 0.5, rnd(-30, 30) * k, rnd(-10, 40) * k, rnd(5, 10) * k, rnd(0.5, 1.0), i % 2 ? 0 : 5, { drag: 1.2 });
      }
      // ألسنة المشاعل
      if (t >= DOORS_AT + 0.2 && t < TL.castleOutAt) {
        acc.torch += dt * 26 * q;
        while (acc.torch >= 1) {
          acc.torch--;
          for (const tc of torches) {
            if (t < tc.at + 0.4) continue;
            spawn(0, tc.x + rnd(-0.3, 0.3) * tc.s, tc.y - tc.s * 0.6, rnd(-10, 10), -rnd(40, 90) * k, rnd(0.5, 0.9) * tc.s, rnd(0.35, 0.7), Math.random() < 0.7 ? 3 : 4, { grav: -60 * k, drag: 1.2 });
          }
        }
      }
      // لمعات على السجادة
      if (carpetP > 0.5 && t < TL.castleOutAt) {
        acc.glint += dt * 10 * q;
        while (acc.glint >= 1) {
          acc.glint--;
          const d = rnd(0.1, 0.8);
          const y = gy + (H - gy) * d;
          spawn(2, cx + rnd(-1, 1) * hwAt(y) * 0.9, y, 0, -rnd(5, 20) * k, rnd(3, 6) * k, rnd(0.6, 1.1), 1);
        }
      }
      // لمعات على أزرار البث
      if (t >= ORB_LAND_AT && t < TL.castleOutAt && hot.length) {
        acc.hot += dt * 12 * q;
        while (acc.hot >= 1) {
          acc.hot--;
          const h = hot[Math.floor(Math.random() * hot.length)];
          spawn(2, h.x + rnd(0.1, 0.9) * h.w, h.y + rnd(0, 0.3) * h.h, 0, -rnd(5, 25) * k, rnd(4, 8) * k, rnd(0.5, 0.9), Math.random() < 0.5 ? 0 : 1);
        }
      }

      // ── الجسيمات ──
      let additive = false;
      for (let i = fx.length - 1; i >= 0; i--) {
        const p = fx[i];
        p.age += dt;
        if (p.age >= p.life || p.y > H + 24) { fx[i] = fx[fx.length - 1]; fx.pop(); continue; }
        if (p.grav) p.vy += p.grav * dt;
        if (p.drag) { const dr = Math.exp(-p.drag * dt); p.vx *= dr; p.vy *= dr; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        const u = p.age / p.life;
        const al = Math.min(1, u * 10) * (1 - u);
        if (p.k === 1) {
          if (additive) { c.globalCompositeOperation = 'source-over'; additive = false; }
          c.globalAlpha = Math.min(1, (1 - u) * 1.6) * 0.95 * ca;
          c.save();
          c.translate(p.x, p.y);
          c.rotate(p.rot);
          c.scale(1, 0.15 + 0.85 * Math.abs(Math.sin(p.age * 5 + p.col)));
          c.fillStyle = CONF[p.col % CONF.length];
          c.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
          c.restore();
        } else {
          if (!additive) { c.globalCompositeOperation = 'lighter'; additive = true; }
          if (p.k === 0) {
            blob(SPR[p.col], p.x, p.y, p.size * (0.6 + 0.4 * (1 - u)) * 1.6, al);
          } else {
            c.globalAlpha = al;
            c.fillStyle = 'rgba(255,244,200,1)';
            c.save();
            c.translate(p.x, p.y);
            c.rotate(p.rot * 0.3);
            c.fillRect(-p.size, -0.8, p.size * 2, 1.6);
            c.fillRect(-0.8, -p.size, 1.6, p.size * 2);
            c.restore();
            blob(SPR[1], p.x, p.y, p.size * 1.3, al * 0.5);
          }
        }
      }
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;

      // ── موجات الضوء (حلقات) + وميض ──
      c.globalCompositeOperation = 'lighter';
      for (let i = rings.length - 1; i >= 0; i--) {
        const rg = rings[i];
        const u = (t - rg.born) / rg.dur;
        if (u < 0) continue;
        if (u >= 1) { rings.splice(i, 1); continue; }
        c.globalAlpha = (1 - u) * 0.8;
        c.strokeStyle = 'rgba(255,214,110,1)';
        c.lineWidth = rg.w * (1 - u) + 1;
        c.beginPath();
        c.arc(rg.x, rg.y, easeOut(u) * rg.maxR, 0, Math.PI * 2);
        c.stroke();
      }
      if (flash > 0.01) {
        c.globalAlpha = flash * 0.4;
        c.fillStyle = 'rgba(255,240,200,1)';
        c.fillRect(0, 0, W, H);
      }
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;

      // ── إطار صورة المستخدم يرتفع للأعلى (هدية لمستخدم) ──
      let ax = 0, ay = 0, ar = 0, e2 = 0;
      if (lift && L) {
        const up = easeOut((t - TL.liftUpAt) / 1.5);
        const down = smooth((t - TL.liftBackAt) / (TL.liftBackEnd - TL.liftBackAt));
        e2 = up * (1 - down);
        if (down >= 1 && !L.done) { L.done = true; L.restore(); }
        if (e2 > 0.004) {
          ax = lerp(L.sx, L.ex, e2);
          ay = lerp(L.sy, L.ey, e2) + Math.sin(t * 2.6) * 3 * k * e2;
          ar = lerp(L.sr, L.R, e2);
          glow(0, ax, ay, ar * 2.4, 0.38 * e2);
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
          c.strokeStyle = 'rgba(255,205,90,0.97)';
          c.shadowColor = 'rgba(255,190,60,0.95)';
          c.shadowBlur = 14 * e2;
          c.stroke();
          c.restore();
          if (e2 > 0.5) {
            c.save();
            c.globalAlpha = clamp01((e2 - 0.5) * 2);
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
          // نور ذهبي ينزل من البلورة على الإطار
          const bm = smooth((t - (TL.orbArriveAt - 0.3)) / 0.8) * orbA;
          if (bm > 0.01) {
            c.save();
            c.globalCompositeOperation = 'lighter';
            const bg2 = c.createLinearGradient(0, orbY, 0, ay);
            bg2.addColorStop(0, 'rgba(255,230,150,0.3)');
            bg2.addColorStop(1, 'rgba(255,230,150,0.04)');
            c.globalAlpha = bm * e2;
            c.fillStyle = bg2;
            c.beginPath();
            c.moveTo(orbX - orbR * 0.4, orbY);
            c.lineTo(orbX + orbR * 0.4, orbY);
            c.lineTo(ax + ar * 0.9, ay);
            c.lineTo(ax - ar * 0.9, ay);
            c.closePath();
            c.fill();
            c.restore();
          }
        }
      }

      // ── البلورة (فوق كل شي) ──
      drawOrb(orbX, orbY, orbR * orbSc, orbA, t, 1);

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

export const CastleGift: GiftDefinition = {
  id: 'castle',
  name: 'Castle',
  price: PRICE,
  durationMs: TOTAL_MS,
  Preview: CastlePreview,
  Animation: CastleAnimation,
};

export default CastleGift;
