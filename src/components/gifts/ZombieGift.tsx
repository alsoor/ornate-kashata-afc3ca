/**
 * هدية الزومبي (Zombie) — 500 Coins — مدتها 20 ثانية   (تستبدل هدية القلب Heart)
 *
 * - Preview  : داخل مربع الهدايا (قبل النقر) أنميشن متكرر: ليل + قمر + مقبرة، زومبي يطلع من الأرض
 *              ويمسك قلب ينبض وفي الجانبين أيدي زومبي تزحف، وخفاش يعبر.
 * - Animation: (الأرقام بالثواني)
 *     0.0 – 1.5  : البث يتحول لليل بارد (تأثير على البث نفسه) + عواء ذئاب + صراصير الليل
 *     1.0 – 3.4  : مقبرة بتوابيت وشواهد وأشجار ميتة تطلع من أسفل الشاشة + ضباب + أرواح تطير + خفافيش
 *     3.4        : الأرض تهتز وتتشقق
 *     4.0 – 6.2  : زومبي على اليمين وزومبي على اليسار يخرجون من القبر ويزحفون على الأرض
 *     5.2 – 7.6  : الزومبي الثالث (المنتصف) يطلع من القبر واقفاً
 *   ▸ الوضع العادي (الهدية لصاحب البث):
 *     7.9 – 9.5  : الزومبي المنتصف يمزّق صدره ويسحب قلبه وهو ينبض
 *     9.9 – 11.2 : يرمي القلب للأعلى لصاحب البث ← القلب يوصل لصورته وينبض عندها ثم يختفي
 *   ▸ وضع "الهدية لمستخدم" (صاحب البث يهدي متحدث — نفس طريقة الشبح/التاج):
 *     5.6 – 7.2  : صورة المستخدم ترتفع لمنتصف البث (ويختفي مكانها الأصلي طول مدة الهدية)
 *     7.7 – 8.6  : الزومبي يمسك الصورة مع الإطار بيديه
 *     8.7 – 10.6 : يدخلها داخل جسده
 *     10.6 – 15  : يضحك بصوت عالٍ (ضحكة شريرة) ثم تختفي الصورة نهائياً حتى تنتهي الهدية وترجع لمكانها
 *     15.2 – 19.5: الزومبي يغوص بالأرض، المقبرة تنزل، والبث يرجع طبيعي
 *
 * ملف مستقل: الأصوات في src/lib/zombieSounds.ts (بجانب audio.ts). غيّر الأرقام تحت (السعر/المدد/التوقيتات).
 * لا يحتاج أي ملف صوت. لو تبي تسجيلات حقيقية ضعها في public/sounds واكتب مساراتها في HOWL_URL / CRICKETS_URL / LAUGH_URL.
 *
 * ربط الأنميشن بالواجهة (يعمل تلقائياً بدونها):
 *   data-gift-host : على صورة صاحب البث → القلب المرمي يوصل لصورته. (الافتراضي: أعلى منتصف الشاشة)
 *   data-gift-user : على صورة المتحدث (يضعه live.tsx) + window.__stooornaGiftLift (يضعه LiveCoinsDock) → وضع ابتلاع الصورة
 */
import React, { useEffect, useRef, useState } from 'react';
import type { GiftDefinition } from '../../lib/types';
import { playZombieSound } from '../../lib/zombieSounds';

// ── إعدادات الهدية ──────────────────────────────────────────────────────
const PRICE = 500;
const TOTAL_MS = 20000;            // مدة الأنميشن الكلية (20 ثانية)
const TOTAL_S = TOTAL_MS / 1000;

const NIGHT_IN = 1.5;              // مدة تحول البث لليل
const NIGHT_OUT_AT = 17.5;         // يبدأ يرجع النهار
const NIGHT_OUT_S = 2.2;
const GRAVE_AT = 1.0;              // المقبرة تبدأ تطلع
const GRAVE_S = 2.4;
const GRAVE_OUT_AT = 17.3;         // المقبرة تنزل
const GRAVE_OUT_S = 2.2;
const CRACK_AT = 3.4;              // تشقق الأرض
const SIDE_AT = 4.0;               // زومبي اليمين واليسار يخرجون
const SIDE_S = 2.2;
const MID_AT = 5.2;                // زومبي المنتصف يخرج
const MID_S = 2.4;
const SINK_AT = 15.2;              // الزومبي يغوص
const SINK_S = 2.0;
const HOWLS = [0.6, 4.6, 9.2, 14.0];       // أوقات عواء الذئاب
const FLASHES = [2.3, 6.4, 9.6, 13.7];     // وميض برق بعيد

// وضع القلب
const RIP_AT = 7.9;                // يمدّ يده لصدره
const PULL_AT = 8.6;               // يسحب القلب
const SHOW_S = 0.9;                // يرفع القلب أمامه وهو ينبض
const THROW_AT = 9.9;              // يبدأ حركة الرمي
const TR = 10.1;                   // لحظة إطلاق القلب
const FLY_S = 1.1;                 // مدة طيران القلب
const ARRIVE = TR + FLY_S;         // يوصل لصاحب البث
const HEART_STAY = 1.9;            // مدة بقائه ينبض عند صاحب البث

// وضع الصورة (الهدية لمستخدم)
const AV_UP_AT = 5.6;              // الصورة تبدأ ترتفع
const AV_UP_S = 1.6;
const GRAB_AT = 7.7;               // الزومبي يمسك الصورة
const GRAB_S = 0.9;
const BRING_AT = 8.7;              // يجيبها لصدره
const BRING_S = 1.1;
const STUFF_AT = 9.8;              // يدخلها بجسده
const STUFF_S = 0.9;
const LAUGH_AT = 10.6;             // يضحك
const LAUGH_S = 4.4;

const HOWL_URL: string | undefined = undefined;     // مثال: '/sounds/zombie-howl.mp3'
const CRICKETS_URL: string | undefined = undefined; // مثال: '/sounds/zombie-crickets.mp3'
const LAUGH_URL: string | undefined = undefined;    // مثال: '/sounds/zombie-laugh.mp3'

// نبضات القلب (تتسارع بعد سحبه)
const BEATS: number[] = (() => {
  const a: number[] = [];
  let b = 6.9;
  while (b < ARRIVE + HEART_STAY) { a.push(b); b += b < PULL_AT ? 0.72 : 0.62; }
  return a;
})();

const GREEN = '#9dff6a';
const BD_FILTER = 'grayscale(0.55) sepia(0.3) hue-rotate(62deg) saturate(1.15) brightness(0.78) contrast(1.1)';

// ── أدوات رياضية ────────────────────────────────────────────────────────
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const easeIn = (x: number) => { const u = clamp01(x); return u * u; };
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const hash = (i: number, n: number) => { const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453; return x - Math.floor(x); };
const riseOf = (t: number, at: number, s: number, sinkAt: number) => smooth((t - at) / s) * (1 - smooth((t - sinkAt) / SINK_S));

type Ctx = CanvasRenderingContext2D;
interface Pt2 { x: number; y: number }

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
//  Preview — داخل مربع الهدايا (قبل النقر)
// ═══════════════════════════════════════════════════════════════════════
const ZG_CSS = `
@keyframes zg-rise{0%,6%{transform:translateY(44px)}26%{transform:translateY(0)}72%{transform:translateY(0)}92%,100%{transform:translateY(44px)}}
@keyframes zg-fly{0%,24%{transform:translate(0,12px);opacity:0}30%{opacity:1}52%{transform:translate(0,-12px)}64%{transform:translate(0,-22px);opacity:1}78%,100%{transform:translate(0,-30px);opacity:0}}
@keyframes zg-beat{0%,100%{transform:scale(1)}12%{transform:scale(1.28)}24%{transform:scale(1)}36%{transform:scale(1.18)}48%{transform:scale(1)}}
@keyframes zg-handL{0%,12%{transform:translate(-14px,12px)}34%{transform:translate(0,0)}46%{transform:translate(5px,-1px)}58%{transform:translate(0,0)}72%{transform:translate(5px,-1px)}88%,100%{transform:translate(-14px,12px)}}
@keyframes zg-handR{0%,12%{transform:translate(14px,12px)}34%{transform:translate(0,0)}46%{transform:translate(-5px,-1px)}58%{transform:translate(0,0)}72%{transform:translate(-5px,-1px)}88%,100%{transform:translate(14px,12px)}}
@keyframes zg-eye{0%,100%{opacity:.75}50%{opacity:1}}
@keyframes zg-moon{0%,100%{opacity:.7}50%{opacity:1}}
@keyframes zg-fog{from{transform:translateX(-18px)}to{transform:translateX(18px)}}
@keyframes zg-bat{0%,40%{transform:translate(-24px,8px);opacity:0}48%{opacity:1}70%{transform:translate(34px,-6px);opacity:1}78%,100%{transform:translate(46px,-8px);opacity:0}}
@keyframes zg-flap{0%,100%{transform:scaleY(1)}50%{transform:scaleY(.45)}}
.zg-rise{animation:zg-rise 5.2s ease-in-out infinite}
.zg-fly{animation:zg-fly 5.2s ease-in-out infinite}
.zg-beat{animation:zg-beat .95s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 55%}
.zg-handL{animation:zg-handL 5.2s ease-in-out infinite}
.zg-handR{animation:zg-handR 5.2s ease-in-out infinite}
.zg-eye{animation:zg-eye 1.1s ease-in-out infinite}
.zg-moon{animation:zg-moon 3.4s ease-in-out infinite}
.zg-fog{animation:zg-fog 5s ease-in-out infinite alternate}
.zg-bat{animation:zg-bat 5.2s linear infinite}
.zg-flap{animation:zg-flap .22s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}
@media (prefers-reduced-motion: reduce){.zg-rise,.zg-fly,.zg-beat,.zg-handL,.zg-handR,.zg-eye,.zg-moon,.zg-fog,.zg-bat,.zg-flap{animation:none!important}}
`;

function ZombiePreview({ size = 72 }: { size?: number }) {
  const s = Math.round(size * 1.2);
  const uid = React.useId().replace(/:/g, '');
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'relative', width: s, height: s, borderRadius: 16, overflow: 'hidden',
        boxShadow: `0 0 0 1.5px ${GREEN}, 0 0 12px rgba(120,255,110,0.45)`,
        background: 'linear-gradient(180deg,#030a0c 0%,#0a1f1d 62%,#10130c 100%)',
      }}
    >
      <style>{ZG_CSS}</style>
      <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <radialGradient id={`mg${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#d9f5b8" stopOpacity=".55" />
            <stop offset="100%" stopColor="#d9f5b8" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`hg${uid}`} cx="38%" cy="30%" r="85%">
            <stop offset="0%" stopColor="#e5404f" />
            <stop offset="55%" stopColor="#a30f22" />
            <stop offset="100%" stopColor="#4a0610" />
          </radialGradient>
          <linearGradient id={`sk${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a9bd8d" />
            <stop offset="100%" stopColor="#566749" />
          </linearGradient>
          <clipPath id={`cp${uid}`}><rect x="0" y="0" width="100" height="77" /></clipPath>
        </defs>

        {/* القمر */}
        <circle className="zg-moon" cx="79" cy="19" r="15" fill={`url(#mg${uid})`} />
        <circle cx="79" cy="19" r="7.5" fill="#eaf6cf" />
        <circle cx="76.5" cy="17" r="1.4" fill="#c3d6a6" />
        <circle cx="81" cy="21.5" r="1" fill="#c3d6a6" />

        {/* شجرة ميتة + شواهد */}
        <path d="M9 77 L9 58 M9 66 L2 58 M9 62 L15 54 M9 70 L16 66" stroke="#020605" strokeWidth="2" strokeLinecap="round" fill="none" />
        <g fill="#18262a">
          <path d="M20 77 V62 a5 5 0 0 1 10 0 V77 Z" />
          <path d="M70 77 V64 a4.5 4.5 0 0 1 9 0 V77 Z" />
          <rect x="85" y="56" width="2.6" height="21" />
          <rect x="81.4" y="60" width="9.8" height="2.6" />
        </g>
        <text x="25" y="70" fontSize="4.2" fontWeight="800" textAnchor="middle" fill="rgba(0,0,0,.55)">RIP</text>

        {/* خفاش */}
        <g className="zg-bat">
          <g className="zg-flap">
            <path d="M40 30 q-6 -5 -11 0 q4 -1 6 2 q2 -1 5 -2 Z M40 30 q6 -5 11 0 q-4 -1 -6 2 q-2 -1 -5 -2 Z" fill="#050807" />
          </g>
        </g>

        {/* أيدي الزومبي الزاحفين يمين ويسار */}
        <g clipPath={`url(#cp${uid})`}>
          <g className="zg-handL">
            <path d="M16 84 Q22 70 30 74" stroke="#6f8259" strokeWidth="4.6" fill="none" strokeLinecap="round" />
            <circle cx="31" cy="74" r="3" fill="#8aa073" />
            <path d="M33 72 l3 -2 M33 74 l4 0 M33 76 l3 2" stroke="#d9d3b4" strokeWidth="1.1" strokeLinecap="round" />
          </g>
          <g className="zg-handR">
            <path d="M84 84 Q78 70 70 74" stroke="#6f8259" strokeWidth="4.6" fill="none" strokeLinecap="round" />
            <circle cx="69" cy="74" r="3" fill="#8aa073" />
            <path d="M67 72 l-3 -2 M67 74 l-4 0 M67 76 l-3 2" stroke="#d9d3b4" strokeWidth="1.1" strokeLinecap="round" />
          </g>

          {/* زومبي المنتصف يطلع من الأرض */}
          <g className="zg-rise">
            <path d="M37 100 L39 67 Q50 61 61 67 L63 100 Z" fill="#3c4148" />
            <path d="M40 70 Q31 63 31 52" stroke="#7c9166" strokeWidth="5" fill="none" strokeLinecap="round" />
            <path d="M60 70 Q69 63 69 52" stroke="#7c9166" strokeWidth="5" fill="none" strokeLinecap="round" />
            <circle cx="31" cy="50" r="3" fill="#8aa073" />
            <circle cx="69" cy="50" r="3" fill="#8aa073" />
            <ellipse cx="50" cy="75" rx="5.5" ry="6.5" fill="#2a0508" />
            <g className="zg-beat"><path d="M50 79 C45 76 46 72 50 73.6 C54 72 55 76 50 79 Z" fill={`url(#hg${uid})`} /></g>
            <ellipse cx="50" cy="55" rx="9.4" ry="10.6" fill={`url(#sk${uid})`} />
            <path d="M42 48 q3 -6 8 -5 q5 -1 8 5" stroke="#10150f" strokeWidth="1.6" fill="none" strokeLinecap="round" />
            <ellipse cx="46" cy="54" rx="2.7" ry="3.1" fill="#06100a" />
            <ellipse cx="54" cy="54" rx="2.7" ry="3.1" fill="#06100a" />
            <circle className="zg-eye" cx="46" cy="54.3" r="1.2" fill="#e6ff6a" />
            <circle className="zg-eye" cx="54" cy="54.3" r="1.2" fill="#e6ff6a" />
            <path d="M44.5 61.5 Q50 67 55.5 61.5 Z" fill="#240608" />
            <path d="M46 61.6 h1.6 v1.6 h-1.6 Z M48.6 61.6 h1.6 v1.8 h-1.6 Z M51.2 61.6 h1.6 v1.8 h-1.6 Z" fill="#d6cfa8" />
          </g>

          {/* القلب يطلع منه وينبض */}
          <g className="zg-fly">
            <g className="zg-beat">
              <path d="M50 49 C41 43 42 33 50 37 C58 33 59 43 50 49 Z" fill={`url(#hg${uid})`} />
              <path d="M47 37 l-1.5 -4 M53 37 l1.8 -4" stroke="#7a1520" strokeWidth="2" strokeLinecap="round" />
            </g>
          </g>
        </g>

        {/* الأرض + الضباب */}
        <path d="M0 77 Q12 73 24 77 T48 77 T72 77 T100 77 V100 H0 Z" fill="#150e09" />
        <path d="M0 77 Q12 73 24 77 T48 77 T72 77 T100 77" stroke="#233a1f" strokeWidth="1.2" fill="none" />
        <ellipse className="zg-fog" cx="50" cy="76" rx="42" ry="5" fill="rgba(160,200,185,.2)" />
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  رسم الزومبي (canvas) — واقف / زاحف / قلب
// ═══════════════════════════════════════════════════════════════════════
const seg = (c: Ctx, a: Pt2, b: Pt2, w: number, col: string) => {
  c.strokeStyle = col;
  c.lineWidth = w;
  c.beginPath();
  c.moveTo(a.x, a.y);
  c.lineTo(b.x, b.y);
  c.stroke();
};

// ذراع بمفصلين: الكتف → المرفق → اليد (اليد تحاول توصل للهدف، وتتوقف عند أقصى طول الذراع)
function ik(s: Pt2, tg: Pt2, l1: number, l2: number, dir: number): { e: Pt2; h: Pt2 } {
  const dx = tg.x - s.x, dy = tg.y - s.y;
  const d = Math.hypot(dx, dy);
  const ux = d > 1e-3 ? dx / d : 0;
  const uy = d > 1e-3 ? dy / d : 1;
  const dd = Math.min((l1 + l2) * 0.985, Math.max(Math.abs(l1 - l2) + 0.5, d));
  const h = { x: s.x + ux * dd, y: s.y + uy * dd };
  const a = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd);
  const hh = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  return { e: { x: s.x + ux * a - uy * hh * dir, y: s.y + uy * a + ux * hh * dir }, h };
}

function drawHand(c: Ctx, h: Pt2, ang: number, size: number, grip: number, col: string) {
  c.save();
  c.translate(h.x, h.y);
  c.rotate(ang);
  c.fillStyle = col;
  c.beginPath();
  c.ellipse(0, 0, size * 0.9, size * 0.75, 0, 0, TAU);
  c.fill();
  c.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const a = (i - 1.5) * 0.34 * (1 - grip * 0.5) + grip * (i - 1.5) * 0.05;
    const len = size * (1.5 + (i === 1 || i === 2 ? 0.35 : 0)) * (1 - grip * 0.38);
    const y0 = (i - 1.5) * size * 0.42;
    const x1 = size * 0.6 + Math.cos(a) * len;
    const y1 = y0 + Math.sin(a) * len;
    c.strokeStyle = col;
    c.lineWidth = size * 0.42;
    c.beginPath(); c.moveTo(size * 0.6, y0); c.lineTo(x1, y1); c.stroke();
    c.strokeStyle = '#d9d3b4';
    c.lineWidth = size * 0.2;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x1 + Math.cos(a + 0.2) * size * 0.5, y1 + Math.sin(a + 0.2) * size * 0.5); c.stroke();
  }
  c.restore();
}

function drawArm(c: Ctx, s: Pt2, tg: Pt2, l1: number, l2: number, dir: number, wUp: number, wLow: number, cloth: string, skin: string, grip: number): Pt2 {
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const { e, h } = ik(s, tg, l1, l2, dir);
  seg(c, s, e, wUp + 2, '#0e120d');
  seg(c, e, h, wLow + 2, '#0e120d');
  seg(c, s, e, wUp, cloth);
  seg(c, { x: lerp(s.x, e.x, 0.72), y: lerp(s.y, e.y, 0.72) }, e, wUp * 0.82, skin);
  seg(c, e, h, wLow, skin);
  c.fillStyle = skin;
  c.beginPath(); c.arc(e.x, e.y, wLow * 0.62, 0, TAU); c.fill();
  drawHand(c, h, Math.atan2(h.y - e.y, h.x - e.x), wLow * 0.78, grip, skin);
  return h;
}

// وجه الزومبي (أمامي) — الإحداثيات بوحدات الزومبي: العنق عند (0,0) ومركز الرأس عند (0,-13)
function drawHeadFront(c: Ctx, mouth: number, eye: number) {
  const drop = mouth * 6;
  // الفك السفلي (خلف الجمجمة)
  c.fillStyle = '#5f7250';
  c.beginPath(); c.ellipse(0, -2.5 + drop, 6.8, 4.6, 0, 0, TAU); c.fill();
  // العنق
  c.fillStyle = '#4c5c40';
  c.fillRect(-3.4, -4, 6.8, 5);
  // الشعر المتساقط
  c.strokeStyle = '#0d110c';
  c.lineWidth = 1.5;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(-8, -20); c.quadraticCurveTo(-11, -27, -5, -26);
  c.moveTo(-2, -25.2); c.quadraticCurveTo(0, -30, 3, -25.4);
  c.moveTo(7, -22); c.quadraticCurveTo(11, -26, 9.4, -19);
  c.stroke();
  // الجمجمة
  const g = c.createRadialGradient(-3, -17, 1, 0, -13, 14);
  g.addColorStop(0, '#aabe8d');
  g.addColorStop(0.6, '#7d9266');
  g.addColorStop(1, '#4b5a41');
  c.fillStyle = g;
  c.beginPath(); c.ellipse(0, -13, 10.5, 12.5, 0, 0, TAU); c.fill();
  // خدود غائرة
  c.fillStyle = 'rgba(20,30,18,.34)';
  c.beginPath(); c.ellipse(-6.6, -8.4, 2.8, 4, 0.2, 0, TAU); c.fill();
  c.beginPath(); c.ellipse(6.6, -8.4, 2.8, 4, -0.2, 0, TAU); c.fill();
  // جرح على الجبهة + غرز
  c.strokeStyle = '#4a0a0e';
  c.lineWidth = 0.9;
  c.beginPath(); c.moveTo(2, -24); c.lineTo(7, -20); c.stroke();
  c.strokeStyle = '#1d1010';
  for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(3 + i * 1.6, -23 + i * 1.3); c.lineTo(5 + i * 1.6, -21 + i * 1.3); c.stroke(); }
  // العيون
  c.fillStyle = '#080d09';
  c.beginPath(); c.ellipse(-4.4, -15, 3.2, 3.6, 0, 0, TAU); c.fill();
  c.beginPath(); c.ellipse(4.4, -15, 3.2, 3.6, 0, 0, TAU); c.fill();
  c.save();
  c.shadowColor = '#d4ff4a';
  c.shadowBlur = 5 + 7 * eye;
  c.fillStyle = `rgba(232,255,110,${0.72 + 0.28 * eye})`;
  c.beginPath(); c.arc(-4.2, -14.6, 1.25 + 0.5 * eye, 0, TAU); c.fill();
  c.beginPath(); c.arc(4.6, -14.6, 1.5 + 0.5 * eye, 0, TAU); c.fill();
  c.restore();
  // الأنف
  c.fillStyle = '#26301f';
  c.beginPath(); c.moveTo(-1.6, -10.4); c.lineTo(1.6, -10.4); c.lineTo(0, -8); c.closePath(); c.fill();
  // الفم المفتوح
  const cy = -5.4 + drop * 0.5;
  const ry = 0.9 + drop * 0.55;
  c.fillStyle = '#1b0507';
  c.beginPath(); c.ellipse(0, cy, 5.2 + mouth * 1.2, ry, 0, 0, TAU); c.fill();
  if (mouth > 0.25) {
    c.fillStyle = '#6a0f16';
    c.beginPath(); c.ellipse(0, cy + ry * 0.35, 2.8, ry * 0.5, 0, 0, TAU); c.fill();
  }
  c.fillStyle = '#d6cfa8';
  for (let i = -2; i <= 2; i++) c.fillRect(i * 2 - 0.8, cy - ry, 1.6, 1.7 + mouth * 0.5);
  for (let i = -2; i <= 2; i++) c.fillRect(i * 2 - 0.8, cy + ry - 1.5 - mouth * 0.3, 1.6, 1.6 + mouth * 0.3);
  // دم يسيل من الفم
  c.strokeStyle = '#7a0c10';
  c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(2.6, cy + ry); c.lineTo(2.9, cy + ry + 3 + mouth * 3); c.stroke();
}

interface Stand {
  x: number; gy: number; sz: number; rise: number; t: number;
  hL: Pt2 | null; hR: Pt2 | null;      // أهداف اليدين (إحداثيات الشاشة) — null = وضع الراحة
  tilt: number; mouth: number; shake: number; bob: number;
  chest: number;                       // تمزق الصدر 0..1
  heartIn: number | null;              // قلب داخل الصدر (قيمة النبض 0..1) أو null
  eye: number; grip: number;
}

function drawStanding(c: Ctx, z: Stand, glowR: HTMLCanvasElement): { hL: Pt2; hR: Pt2 } {
  const { x, gy, sz, t } = z;
  const sink = (1 - z.rise) * 120;
  const bx = x + z.shake;
  const P = (lx: number, ly: number): Pt2 => ({ x: bx + lx * sz, y: gy + z.bob + (ly + sink) * sz });
  c.save();
  c.beginPath();
  c.rect(-3000, -3000, 9000, gy + 3000);
  c.clip();
  c.lineCap = 'round';
  c.lineJoin = 'round';

  // الأرجل
  for (const s of [-1, 1]) {
    const a = P(s * 6, -46), b = P(s * 8, -24), d = P(s * 9.5, 0);
    seg(c, a, b, 9.4 * sz, '#17191d');
    seg(c, b, d, 8 * sz, '#1f2227');
    seg(c, P(s * 8, -31), P(s * 8.6, -16), 3.2 * sz, '#667853');
  }

  // الجذع (قميص ممزق)
  c.beginPath();
  const pts: [number, number][] = [[-15, -80], [15, -80], [12.5, -60], [13.5, -46], [10, -43], [7, -47], [3, -42], [-1, -47], [-5, -42], [-9, -46], [-13.5, -44], [-12.5, -60]];
  pts.forEach(([lx, ly], i) => { const p = P(lx, ly); if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); });
  c.closePath();
  const tg = c.createLinearGradient(0, P(0, -80).y, 0, P(0, -42).y);
  tg.addColorStop(0, '#585e66');
  tg.addColorStop(1, '#22252a');
  c.fillStyle = tg;
  c.fill();
  c.strokeStyle = '#0c0e0c';
  c.lineWidth = 1.4;
  c.stroke();
  // جلد ظاهر من تمزق القميص + أضلاع
  const sk = P(8, -53);
  c.fillStyle = 'rgba(122,141,99,.92)';
  c.beginPath(); c.ellipse(sk.x, sk.y, 5 * sz, 7 * sz, 0.2, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(36,44,30,.7)';
  c.lineWidth = 1.1 * sz;
  for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(sk.x - 4 * sz, sk.y + i * 3.4 * sz); c.quadraticCurveTo(sk.x, sk.y + i * 3.4 * sz + 1.6 * sz, sk.x + 4 * sz, sk.y + i * 3.4 * sz); c.stroke(); }
  // بقع دم
  c.fillStyle = 'rgba(90,10,14,.55)';
  const b1 = P(-8, -70); c.beginPath(); c.ellipse(b1.x, b1.y, 4.2 * sz, 6 * sz, 0.3, 0, TAU); c.fill();
  const b2 = P(-6, -52); c.beginPath(); c.ellipse(b2.x, b2.y, 3 * sz, 4 * sz, -0.2, 0, TAU); c.fill();

  // جرح الصدر
  const w0 = P(0, -66);
  const rx = (5.5 + 6.5 * z.chest) * sz, ry = (7 + 8 * z.chest) * sz;
  c.fillStyle = '#2b0609';
  c.beginPath(); c.ellipse(w0.x, w0.y, rx, ry, 0, 0, TAU); c.fill();
  c.fillStyle = '#100203';
  c.beginPath(); c.ellipse(w0.x, w0.y, rx * 0.78, ry * 0.8, 0, 0, TAU); c.fill();
  if (z.heartIn !== null) {
    drawHeart(c, glowR, w0.x, w0.y + 1.2 * sz, 4.4 * sz, z.heartIn, 0, 1);
  } else if (z.chest > 0.3) {
    c.strokeStyle = 'rgba(203,191,152,.85)';
    c.lineWidth = 1.3 * sz;
    for (let i = -1; i <= 1; i++) {
      c.beginPath();
      c.moveTo(w0.x - rx * 0.7, w0.y + i * ry * 0.46);
      c.quadraticCurveTo(w0.x, w0.y + i * ry * 0.46 + ry * 0.2, w0.x + rx * 0.7, w0.y + i * ry * 0.46);
      c.stroke();
    }
  }
  c.strokeStyle = '#8a1318';
  c.lineWidth = 2 * sz;
  c.beginPath(); c.ellipse(w0.x, w0.y, rx, ry, 0, 0, TAU); c.stroke();
  // دم يسيل من الجرح
  c.strokeStyle = '#6e0b10';
  c.lineWidth = 1.6 * sz;
  c.beginPath(); c.moveTo(w0.x - 2 * sz, w0.y + ry); c.lineTo(w0.x - 2.6 * sz, w0.y + ry + (8 + 6 * z.chest) * sz); c.stroke();
  c.beginPath(); c.moveTo(w0.x + 3 * sz, w0.y + ry * 0.9); c.lineTo(w0.x + 3.4 * sz, w0.y + ry + 5 * sz); c.stroke();

  // الأذرع
  const sw = Math.sin(t * 1.7);
  const idleL = P(-23, -55 + sw * 1.6);
  const idleR = P(23, -55 - sw * 1.6);
  const l1 = 30 * sz, l2 = 30 * sz;
  const hl = drawArm(c, P(-14, -77), z.hL || idleL, l1, l2, 1, 8.6 * sz, 6.8 * sz, '#3a3f46', '#72865b', z.grip);
  const hr = drawArm(c, P(14, -77), z.hR || idleR, l1, l2, -1, 8.6 * sz, 6.8 * sz, '#3a3f46', '#72865b', z.grip);

  // الرأس
  const neck = P(0, -80);
  c.save();
  c.translate(neck.x, neck.y);
  c.rotate(z.tilt);
  c.scale(sz, sz);
  drawHeadFront(c, z.mouth, z.eye);
  c.restore();

  c.restore();
  return { hL: hl, hR: hr };
}

interface Crawl { x: number; gy: number; sc: number; dir: number; emerge: number; ph: number; mouth: number }

function drawCrawler(c: Ctx, z: Crawl) {
  const { x, gy, sc, dir, emerge, ph, mouth } = z;
  const sink = (1 - emerge) * 42;
  c.save();
  c.beginPath();
  c.rect(-3000, -3000, 9000, gy + 3000);
  c.clip();
  c.translate(x, gy + sink * sc);
  c.scale(dir * sc, sc);
  c.lineCap = 'round';
  c.lineJoin = 'round';

  const hip: Pt2 = { x: -4, y: -10 };
  const shoulder: Pt2 = { x: 32, y: -15 };
  const lw = Math.sin(ph);

  // الأرجل تُسحب خلفه
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1;
    const knee = { x: -16 + s * 2, y: -7 - 3 * Math.max(0, Math.sin(ph + (i ? Math.PI : 0))) };
    const foot = { x: -33 + 4 * lw * s, y: -2 + (i ? -2 : 0) };
    seg(c, hip, knee, 9, '#111317');
    seg(c, knee, foot, 8, '#1d2025');
    seg(c, { x: knee.x - 2, y: knee.y }, { x: foot.x + 2, y: foot.y }, 3, '#667853');
    c.fillStyle = '#7b8f65';
    c.beginPath(); c.ellipse(foot.x - 2, foot.y, 3.4, 2.2, 0, 0, TAU); c.fill();
  }

  // الذراع الخلفية
  const handB = { x: 52 + 18 * Math.sin(ph + Math.PI), y: -2 - 9 * Math.max(0, Math.cos(ph + Math.PI)) };
  drawArm(c, { x: shoulder.x - 3, y: shoulder.y + 1 }, handB, 22, 22, -1, 7, 5.6, '#2e3238', '#5d6f4b', 0.3);

  // الجذع
  seg(c, { x: -6, y: -11 }, { x: 32, y: -14 }, 17, '#0e100f');
  seg(c, { x: -6, y: -11 }, { x: 32, y: -14 }, 15, '#4a4f57');
  seg(c, { x: 0, y: -15 }, { x: 24, y: -17 }, 5, '#3a3f46');
  c.fillStyle = 'rgba(122,141,99,.9)';
  c.beginPath(); c.ellipse(14, -10, 6, 3.6, 0.05, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(36,44,30,.7)';
  c.lineWidth = 0.9;
  for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(9 + i * 4, -12.4); c.lineTo(10 + i * 4, -7.8); c.stroke(); }
  c.fillStyle = 'rgba(90,10,14,.6)';
  c.beginPath(); c.ellipse(4, -14, 4, 2.4, 0.2, 0, TAU); c.fill();
  // العمود الفقري
  c.fillStyle = 'rgba(207,199,160,.55)';
  for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(-2 + i * 7, -19.4 - (i % 2 ? 0.4 : 0), 1.3, 0, TAU); c.fill(); }

  // الذراع الأمامية
  const handA = { x: 52 + 18 * Math.sin(ph), y: -2 - 9 * Math.max(0, Math.cos(ph)) };
  drawArm(c, shoulder, handA, 22, 22, -1, 7.6, 6, '#3a3f46', '#72865b', 0.2);

  // الرأس (جانبي)
  c.save();
  c.translate(44, -23);
  c.rotate(-0.28 + 0.1 * Math.sin(ph * 0.5));
  const drop = mouth * 5;
  c.fillStyle = '#5a6c4b';
  c.beginPath(); c.ellipse(5, 6.4 + drop, 5.6, 3.4, 0.1, 0, TAU); c.fill();
  c.strokeStyle = '#0d110c';
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(-6, -8); c.quadraticCurveTo(-12, -9, -10, -3);
  c.moveTo(-1, -10.6); c.quadraticCurveTo(-3, -15, 2, -12);
  c.stroke();
  const hg = c.createRadialGradient(-1, -4, 1, 0, 0, 12);
  hg.addColorStop(0, '#aabe8d');
  hg.addColorStop(0.6, '#7d9266');
  hg.addColorStop(1, '#4b5a41');
  c.fillStyle = hg;
  c.beginPath(); c.ellipse(0, 0, 9.5, 10.5, 0, 0, TAU); c.fill();
  c.fillStyle = 'rgba(20,30,18,.32)';
  c.beginPath(); c.ellipse(1, 6, 3.2, 3.4, 0, 0, TAU); c.fill();
  c.fillStyle = '#080d09';
  c.beginPath(); c.ellipse(4.2, -2.6, 3.1, 3.4, 0, 0, TAU); c.fill();
  c.save();
  c.shadowColor = '#d4ff4a';
  c.shadowBlur = 8;
  c.fillStyle = '#e8ff6e';
  c.beginPath(); c.arc(4.8, -2.4, 1.4, 0, TAU); c.fill();
  c.restore();
  c.fillStyle = '#26301f';
  c.beginPath(); c.moveTo(8.6, 0); c.lineTo(11.4, 2.6); c.lineTo(8, 3); c.closePath(); c.fill();
  c.fillStyle = '#1b0507';
  c.beginPath(); c.ellipse(6.6, 5.6 + drop * 0.5, 3.4, 1 + drop * 0.6, 0.1, 0, TAU); c.fill();
  c.fillStyle = '#d6cfa8';
  for (let i = 0; i < 3; i++) c.fillRect(4.6 + i * 1.8, 4.6 + drop * 0.1, 1.2, 1.4 + mouth);
  c.strokeStyle = '#7a0c10';
  c.lineWidth = 1;
  c.beginPath(); c.moveTo(8, 6.4 + drop); c.lineTo(8.4, 9.6 + drop); c.stroke();
  c.fillStyle = '#4b5a41';
  c.beginPath(); c.ellipse(-3.4, 1.6, 1.8, 2.6, 0, 0, TAU); c.fill();
  c.restore();

  c.restore();
}

// قلب بشري ينبض (بدم وأوعية) — الحجم r والنبض pulse 0..1
function drawHeart(c: Ctx, glow: HTMLCanvasElement, x: number, y: number, r: number, pulse: number, rot: number, alpha: number) {
  if (alpha <= 0.01 || r < 1) return;
  const s = 1 + pulse * 0.2;
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(s, s);
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = alpha * (0.3 + pulse * 0.4);
  c.drawImage(glow, -r * 2.6, -r * 2.6, r * 5.2, r * 5.2);
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = alpha;
  c.lineCap = 'round';
  // الأوعية
  seg(c, { x: -r * 0.3, y: -r * 0.5 }, { x: -r * 0.55, y: -r * 1.25 }, r * 0.52, '#5e0d16');
  seg(c, { x: -r * 0.3, y: -r * 0.5 }, { x: -r * 0.55, y: -r * 1.25 }, r * 0.32, '#d4505a');
  seg(c, { x: r * 0.28, y: -r * 0.55 }, { x: r * 0.55, y: -r * 1.2 }, r * 0.48, '#2c3880');
  seg(c, { x: r * 0.28, y: -r * 0.55 }, { x: r * 0.55, y: -r * 1.2 }, r * 0.28, '#6679c9');
  // الجسم
  c.beginPath();
  c.moveTo(0, r * 0.95);
  c.bezierCurveTo(-r * 1.55, r * 0.15, -r * 1.15, -r * 1.0, 0, -r * 0.45);
  c.bezierCurveTo(r * 1.15, -r * 1.0, r * 1.55, r * 0.15, 0, r * 0.95);
  c.closePath();
  const g = c.createRadialGradient(-r * 0.35, -r * 0.25, r * 0.1, 0, 0, r * 1.4);
  g.addColorStop(0, '#e5404f');
  g.addColorStop(0.55, '#a30f22');
  g.addColorStop(1, '#4a0610');
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = 'rgba(40,0,6,.75)';
  c.lineWidth = r * 0.08;
  c.stroke();
  // عروق ودهن
  c.strokeStyle = 'rgba(70,0,12,.6)';
  c.lineWidth = r * 0.07;
  c.beginPath(); c.moveTo(-r * 0.1, -r * 0.3); c.quadraticCurveTo(-r * 0.2, r * 0.2, r * 0.05, r * 0.75); c.stroke();
  c.beginPath(); c.moveTo(-r * 0.1, -r * 0.2); c.quadraticCurveTo(-r * 0.7, 0, -r * 0.85, r * 0.3); c.stroke();
  c.beginPath(); c.moveTo(0, -r * 0.2); c.quadraticCurveTo(r * 0.6, -r * 0.1, r * 0.9, r * 0.2); c.stroke();
  c.fillStyle = 'rgba(244,207,114,.75)';
  c.beginPath(); c.ellipse(-r * 0.25, -r * 0.3, r * 0.2, r * 0.1, -0.5, 0, TAU); c.fill();
  c.beginPath(); c.ellipse(r * 0.3, -r * 0.28, r * 0.17, r * 0.09, 0.4, 0, TAU); c.fill();
  c.fillStyle = 'rgba(255,255,255,.3)';
  c.beginPath(); c.ellipse(-r * 0.55, -r * 0.15, r * 0.16, r * 0.34, -0.5, 0, TAU); c.fill();
  c.restore();
}

function drawBat(c: Ctx, x: number, y: number, s: number, flap: number, dir: number) {
  const f = Math.sin(flap);
  c.save();
  c.translate(x, y);
  c.scale(s * dir, s);
  c.fillStyle = '#040706';
  c.beginPath(); c.ellipse(0, 0, 3, 4.2, 0, 0, TAU); c.fill();
  c.beginPath(); c.moveTo(-2, -3.4); c.lineTo(-1.2, -6.2); c.lineTo(0, -3.8); c.lineTo(1.2, -6.2); c.lineTo(2, -3.4); c.closePath(); c.fill();
  for (const m of [-1, 1]) {
    c.save();
    c.scale(m, 1);
    c.beginPath();
    c.moveTo(1, -1);
    c.quadraticCurveTo(8, -7 * f - 3, 17, -4 * f + 1);
    c.quadraticCurveTo(12, 1, 9, 4);
    c.quadraticCurveTo(6, 1, 1, 3.4);
    c.closePath();
    c.fill();
    c.restore();
  }
  c.restore();
}

// ═══════════════════════════════════════════════════════════════════════
//  طبقات المقبرة (تُرسم مرة واحدة ثم تُنسخ كل فريم)
// ═══════════════════════════════════════════════════════════════════════
function buildLayers(W: number, H: number, GY: number, dpr: number): { back: HTMLCanvasElement; front: HTMLCanvasElement } | null {
  const mk = () => {
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    const g = cv.getContext('2d');
    if (g) g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { cv, g };
  };
  const B = mk();
  const F = mk();
  const g = B.g;
  const f = F.g;
  if (!g || !f) return null;

  // تلال بعيدة
  const hill = (base: number, a1: number, a2: number, col: string, ph: number) => {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W + 10; x += 10) {
      g.lineTo(x, GY - H * base + Math.sin(x * 0.013 + ph) * H * a1 + Math.sin(x * 0.031 + ph * 2) * H * a2);
    }
    g.lineTo(W, H);
    g.closePath();
    g.fill();
  };
  hill(0.13, 0.03, 0.012, '#06110f', 1);
  hill(0.07, 0.022, 0.01, '#091a15', 3);

  // أشجار ميتة
  g.strokeStyle = '#020605';
  g.lineCap = 'round';
  const tree = (x: number, y: number, len: number, ang: number, w: number, d: number) => {
    if (d <= 0 || len < 3) return;
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    g.lineWidth = w;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
    tree(x2, y2, len * (0.7 + hash(d, x) * 0.08), ang - 0.5 + hash(d, x + 1) * 0.25, w * 0.68, d - 1);
    tree(x2, y2, len * (0.68 + hash(d, x + 2) * 0.08), ang + 0.45 + hash(d, x + 3) * 0.25, w * 0.68, d - 1);
  };
  tree(W * 0.07, GY - H * 0.05, H * 0.075, -Math.PI / 2 + 0.1, 7, 6);
  tree(W * 0.93, GY - H * 0.05, H * 0.08, -Math.PI / 2 - 0.12, 7, 6);
  tree(W * 0.66, GY - H * 0.06, H * 0.05, -Math.PI / 2 + 0.2, 4, 5);

  // سياج حديد
  const fy = GY - H * 0.055;
  g.strokeStyle = '#040a08';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, fy); g.lineTo(W, fy); g.moveTo(0, fy + H * 0.03); g.lineTo(W, fy + H * 0.03); g.stroke();
  g.fillStyle = '#040a08';
  for (let x = 4; x < W; x += 15) {
    g.fillRect(x - 1, fy - H * 0.035, 2, H * 0.085);
    g.beginPath(); g.moveTo(x - 3, fy - H * 0.035); g.lineTo(x, fy - H * 0.05); g.lineTo(x + 3, fy - H * 0.035); g.closePath(); g.fill();
  }

  // شواهد القبور
  const stone = (x: number, y: number, w: number, h: number, type: number, dark: number) => {
    const gr = g.createLinearGradient(x - w / 2, y - h, x + w / 2, y);
    gr.addColorStop(0, dark ? '#2c3834' : '#4b5a54');
    gr.addColorStop(1, dark ? '#131a18' : '#222c28');
    g.fillStyle = gr;
    if (type === 0) {
      g.beginPath();
      g.moveTo(x - w / 2, y);
      g.lineTo(x - w / 2, y - h + w / 2);
      g.arc(x, y - h + w / 2, w / 2, Math.PI, 0);
      g.lineTo(x + w / 2, y);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.font = `800 ${Math.max(7, w * 0.26)}px sans-serif`;
      g.textAlign = 'center';
      g.fillText('R.I.P', x, y - h * 0.52);
    } else {
      g.fillRect(x - w * 0.14, y - h, w * 0.28, h);
      g.fillRect(x - w * 0.5, y - h * 0.72, w, w * 0.26);
    }
    g.fillStyle = 'rgba(40,74,36,.65)';
    g.beginPath(); g.ellipse(x - w * 0.2, y - 1, w * 0.3, 3, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.5)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(x + w * 0.1, y - h * 0.9); g.lineTo(x - w * 0.05, y - h * 0.7); g.lineTo(x + w * 0.08, y - h * 0.55); g.stroke();
  };
  const sw = Math.max(26, W * 0.085);
  stone(W * 0.08, GY - H * 0.012, sw, H * 0.11, 0, 1);
  stone(W * 0.3, GY - H * 0.02, sw * 0.9, H * 0.12, 1, 1);
  stone(W * 0.38, GY - H * 0.008, sw * 0.8, H * 0.085, 0, 1);
  stone(W * 0.64, GY - H * 0.012, sw * 0.85, H * 0.1, 0, 1);
  stone(W * 0.72, GY - H * 0.02, sw * 0.95, H * 0.125, 1, 1);
  stone(W * 0.93, GY - H * 0.008, sw, H * 0.1, 0, 0);

  // توابيت واقفة (غطاؤها مفتوح قليلاً)
  const coffin = (x: number, y: number, tilt: number, w: number, h: number, open: number) => {
    g.save();
    g.translate(x, y);
    g.rotate(tilt);
    const poly: [number, number][] = [[-0.3, -1], [0.3, -1], [0.5, -0.68], [0.36, 0], [-0.36, 0], [-0.5, -0.68]];
    const path = () => { g.beginPath(); poly.forEach(([px, py], i) => { if (i) g.lineTo(px * w, py * h); else g.moveTo(px * w, py * h); }); g.closePath(); };
    path(); g.fillStyle = '#030201'; g.fill();
    g.save();
    g.translate(-0.36 * w, 0);
    g.rotate(open);
    g.translate(0.36 * w, 0);
    path();
    const wg = g.createLinearGradient(-w / 2, -h, w / 2, 0);
    wg.addColorStop(0, '#5a361f');
    wg.addColorStop(1, '#2b180c');
    g.fillStyle = wg;
    g.fill();
    g.strokeStyle = '#1a0e07';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = '#c9a24a';
    g.fillRect(-w * 0.04, -h * 0.82, w * 0.08, h * 0.42);
    g.fillRect(-w * 0.15, -h * 0.72, w * 0.3, h * 0.07);
    g.beginPath(); g.arc(-w * 0.28, -h * 0.5, 2.4, 0, TAU); g.arc(w * 0.28, -h * 0.5, 2.4, 0, TAU); g.fill();
    g.restore();
    g.restore();
  };
  coffin(W * 0.2, GY + H * 0.004, -0.13, Math.max(40, W * 0.12), H * 0.2, -0.1);
  coffin(W * 0.82, GY + H * 0.004, 0.12, Math.max(40, W * 0.12), H * 0.19, 0.1);

  // جماجم وعظام عند الأسفل
  const skull = (x: number, y: number, r: number) => {
    g.fillStyle = '#d6cfb0';
    g.beginPath(); g.arc(x, y - r, r, 0, TAU); g.fill();
    g.fillRect(x - r * 0.55, y - r * 0.4, r * 1.1, r * 0.7);
    g.fillStyle = '#0a0d0b';
    g.beginPath(); g.arc(x - r * 0.38, y - r * 1.05, r * 0.26, 0, TAU); g.arc(x + r * 0.38, y - r * 1.05, r * 0.26, 0, TAU); g.fill();
  };
  skull(W * 0.34, GY + 2, Math.max(5, W * 0.016));
  skull(W * 0.67, GY + 3, Math.max(4, W * 0.013));

  // الطبقة الأمامية: تراب المقبرة
  const gg = f.createLinearGradient(0, GY, 0, H);
  gg.addColorStop(0, '#2a1a11');
  gg.addColorStop(0.35, '#1b100a');
  gg.addColorStop(1, '#060303');
  f.fillStyle = gg;
  f.beginPath();
  f.moveTo(0, H);
  for (let x = 0; x <= W + 8; x += 8) f.lineTo(x, GY + Math.sin(x * 0.05) * 2.5 + hash(x, 7) * 3);
  f.lineTo(W, H);
  f.closePath();
  f.fill();
  // عشب ميت
  f.strokeStyle = '#17301a';
  f.lineWidth = 1.4;
  f.lineCap = 'round';
  for (let x = 2; x < W; x += 7) {
    const hh = 3 + hash(x, 3) * 7;
    f.beginPath(); f.moveTo(x, GY + 1); f.quadraticCurveTo(x + 1, GY - hh * 0.6, x + (hash(x, 4) - 0.5) * 6, GY - hh); f.stroke();
  }
  // عظام وحصى وجذور
  for (let i = 0; i < 26; i++) {
    const x = hash(i, 11) * W;
    const y = GY + H * 0.012 + hash(i, 12) * (H - GY - H * 0.02);
    if (i % 4 === 0) {
      f.fillStyle = 'rgba(214,207,176,.6)';
      f.save(); f.translate(x, y); f.rotate(hash(i, 13) * 3);
      f.fillRect(-7, -1.2, 14, 2.4);
      f.beginPath(); f.arc(-7, 0, 2.2, 0, TAU); f.arc(7, 0, 2.2, 0, TAU); f.fill();
      f.restore();
    } else {
      f.fillStyle = `rgba(70,52,38,${0.4 + hash(i, 14) * 0.4})`;
      f.beginPath(); f.ellipse(x, y, 2 + hash(i, 15) * 3, 1.4 + hash(i, 16) * 2, 0, 0, TAU); f.fill();
    }
  }
  f.strokeStyle = 'rgba(70,46,28,.7)';
  f.lineWidth = 1.6;
  for (let i = 0; i < 7; i++) {
    const x = hash(i, 21) * W;
    f.beginPath(); f.moveTo(x, GY + 4); f.bezierCurveTo(x + 14, GY + 22, x - 10, GY + 40, x + 12, GY + 60); f.stroke();
  }
  return { back: B.cv, front: F.cv };
}

// ═══════════════════════════════════════════════════════════════════════
//  مواقع صاحب البث / المستخدم المستلم
// ═══════════════════════════════════════════════════════════════════════
interface Host { x: number; y: number; w: number; h: number; top: number }
interface LiftAv {
  sx: number; sy: number; sr: number;
  img: HTMLImageElement | null; letter: string; name: string;
  restore: () => void; done?: boolean;
}
interface LiftInfo { userId: string; name?: string; avatarUrl?: string | null }

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

// وضع الصورة: الهدية لمتحدث → معلوماته يحطها LiveCoinsDock في window.__stooornaGiftLift
function getLiftInfo(): LiftInfo | null {
  try {
    const d = (window as unknown as { __stooornaGiftLift?: LiftInfo }).__stooornaGiftLift;
    return d && d.userId ? d : null;
  } catch { return null; }
}

function findLiftAv(W: number, H: number, pre: HTMLImageElement | null): LiftAv | null {
  try {
    const info = getLiftInfo();
    if (!info) return null;
    let el: HTMLElement | null = null;
    try { el = document.querySelector<HTMLElement>(`[data-gift-user="${String(info.userId).replace(/["\\]/g, '')}"]`); } catch { /* ignore */ }
    const r = el ? el.getBoundingClientRect() : null;
    const hasEl = !!(el && r && r.width > 0 && r.height > 0);
    const elImg = el ? el.querySelector('img') : null;
    const useImg = pre && pre.complete && pre.naturalWidth > 0 ? pre : (elImg && elImg.complete && elImg.naturalWidth > 0 ? elImg : pre);
    const nm = String(info.name || (el?.textContent || '') || '?').trim();
    const prevOp = hasEl ? el!.style.opacity : '';
    if (hasEl) el!.style.opacity = '0';     // تختفي صورته الأصلية طول مدة الهدية
    return {
      sx: hasEl ? r!.left + r!.width / 2 : W - 52,
      sy: hasEl ? r!.top + r!.height / 2 : H * 0.55,
      sr: hasEl ? r!.width / 2 : 20,
      img: useImg || null,
      letter: (nm.charAt(0) || '?').toUpperCase(),
      name: nm,
      restore: () => { try { if (hasEl) el!.style.opacity = prevOp; } catch { /* ignore */ } },
    };
  } catch { return null; }
}

function drawAvatar(c: Ctx, L: LiftAv, glow: HTMLCanvasElement, x: number, y: number, r: number, alpha: number, pre: HTMLImageElement | null) {
  if (alpha <= 0.01 || r < 1) return;
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = 0.5 * alpha;
  c.drawImage(glow, x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
  c.restore();
  c.save();
  c.globalAlpha = alpha;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.closePath();
  c.save();
  c.clip();
  let drawn = false;
  if (!L.img && pre && pre.complete && pre.naturalWidth > 0) L.img = pre;
  if (L.img && L.img.complete && L.img.naturalWidth > 0) {
    try {
      const sw = L.img.naturalWidth, sh = L.img.naturalHeight, ss = Math.min(sw, sh);
      c.drawImage(L.img, (sw - ss) / 2, (sh - ss) / 2, ss, ss, x - r, y - r, r * 2, r * 2);
      drawn = true;
    } catch { /* ignore */ }
  }
  if (!drawn) {
    c.fillStyle = '#12363a';
    c.fillRect(x - r, y - r, r * 2, r * 2);
    c.fillStyle = '#00BCD4';
    c.font = `800 ${Math.round(r * 1.0)}px sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(L.letter, x, y + r * 0.04);
  }
  c.restore();
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.lineWidth = Math.max(2.4, r * 0.08);
  c.strokeStyle = 'rgba(176,255,120,0.95)';
  c.shadowColor = 'rgba(120,255,90,0.95)';
  c.shadowBlur = 14;
  c.stroke();
  c.restore();
}

// ═══════════════════════════════════════════════════════════════════════
//  الأنميشن الكامل (ملء الشاشة)
// ═══════════════════════════════════════════════════════════════════════
interface Part { k: 0 | 1 | 2 | 3 | 4; x: number; y: number; vx: number; vy: number; g: number; size: number; life: number; age: number; rot: number; vr: number; col: string }
interface Fog { x: number; y: number; r: number; v: number; a: number; front: boolean }

function ZombieAnimation({ onDone }: { onDone: () => void }) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const cvRef = useRef<HTMLCanvasElement>(null);
  const bdRef = useRef<HTMLDivElement>(null);

  const [{ W, H }] = useState(() => ({
    W: typeof window !== 'undefined' ? window.innerWidth : 360,
    H: typeof window !== 'undefined' ? window.innerHeight : 640,
  }));

  useEffect(() => {
    const cv = cvRef.current;
    const bd = bdRef.current;
    if (!cv || !bd) return;
    const c = cv.getContext('2d');
    if (!c) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);

    const U = clamp(Math.min(W / 390, H / 760), 0.7, 1.5);
    const GY = H * 0.84;                    // خط الأرض (زومبي المنتصف)
    const GYC = H * 0.885;                  // خط أرض الزاحفين (أقرب للكاميرا)
    const sz = Math.min(H * 0.0035, W * 0.0085);
    const sc = sz * 0.55;
    const cx = W / 2;
    const R = Math.max(38, Math.min(58, W * 0.14));
    const PM = (lx: number, ly: number): Pt2 => ({ x: cx + lx * sz, y: GY + ly * sz });

    // الوضع: هدية لمستخدم (صورة) أو لصاحب البث (قلب)
    const liftInfo0 = getLiftInfo();
    const mode: 'heart' | 'avatar' = liftInfo0 ? 'avatar' : 'heart';
    let liftPre: HTMLImageElement | null = null;
    if (liftInfo0 && liftInfo0.avatarUrl) {
      try { liftPre = new Image(); liftPre.src = String(liftInfo0.avatarUrl); } catch { liftPre = null; }
    }
    let lift: LiftAv | null = null;

    const layers = buildLayers(W, H, GY, dpr);

    // سبرايتات التوهج
    const GL_G = makeSprite('150,255,120', 0.25);
    const GL_R = makeSprite('255,50,50', 0.25);
    const GL_Y = makeSprite('230,255,110', 0.2);
    const GL_M = makeSprite('214,238,200', 0.2);
    const FOG = makeSprite('150,182,170', 0.1);
    const blob = (sp: HTMLCanvasElement, x: number, y: number, r: number, a: number) => {
      if (a <= 0.003 || r <= 0.2) return;
      c.globalAlpha = Math.min(1, a);
      c.drawImage(sp, x - r, y - r, r * 2, r * 2);
    };

    // تدرج التعتيم
    const vig = c.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.25, W / 2, H * 0.5, Math.max(W, H) * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.72)');

    // الضباب
    const fogs: Fog[] = Array.from({ length: 13 }, (_, i) => ({
      x: hash(i, 1) * W * 1.4,
      y: GY + (hash(i, 2) - 0.72) * H * 0.12,
      r: W * (0.24 + hash(i, 3) * 0.26),
      v: (hash(i, 4) > 0.5 ? 1 : -1) * (8 + hash(i, 5) * 14) * U,
      a: 0.1 + hash(i, 6) * 0.1,
      front: i >= 8,
    }));
    // أرواح تطير
    const wisps = Array.from({ length: 9 }, (_, i) => ({
      x: W * (0.08 + hash(i, 7) * 0.84), y: GY - H * (0.02 + hash(i, 8) * 0.2), ph: hash(i, 9) * TAU, sp: 0.5 + hash(i, 10),
    }));
    // عيون مضيئة بالظلام
    const eyes = [
      { x: W * 0.27, y: GY - H * 0.115, ph: 0 }, { x: W * 0.71, y: GY - H * 0.1, ph: 2 }, { x: W * 0.05, y: GY - H * 0.07, ph: 4 },
    ];
    // خفافيش
    const bats = [
      { t: 1.8, dur: 4.6, y: H * 0.2, amp: H * 0.04, dir: 1, s: 1.1 },
      { t: 7.4, dur: 4.2, y: H * 0.27, amp: H * 0.05, dir: -1, s: 1.3 },
      { t: 12.6, dur: 4.4, y: H * 0.17, amp: H * 0.04, dir: 1, s: 1 },
    ];
    // شقوق الأرض
    const jag = (x0: number, y0: number, x1: number, n: number): Pt2[] => {
      const pts: Pt2[] = [{ x: x0, y: y0 }];
      for (let i = 1; i <= n; i++) pts.push({ x: lerp(x0, x1, i / n), y: y0 + (Math.random() - 0.5) * 9 * U });
      return pts;
    };
    const cracks: Pt2[][] = [
      jag(cx - W * 0.3, GY + 2, cx + W * 0.3, 18),
      jag(W * 0.02, GYC + 2, W * 0.34, 12),
      jag(W * 0.66, GYC + 2, W * 0.98, 12),
    ];

    const parts: Part[] = [];
    const MAXP = 360;
    const addPart = (p: Part) => { if (parts.length < MAXP) parts.push(p); };
    const soil = (x: number, y: number, n: number, spread: number, power: number) => {
      const cols = ['#2b1a10', '#3d2616', '#1b100a', '#4f3320'];
      for (let i = 0; i < n; i++) {
        addPart({ k: 0, x: x + rnd(-spread, spread), y, vx: rnd(-1, 1) * power * 0.6, vy: -rnd(0.4, 1) * power, g: 1500 * U, size: rnd(2, 6) * U, life: rnd(0.7, 1.4), age: 0, rot: rnd(0, TAU), vr: rnd(-8, 8), col: cols[(Math.random() * cols.length) | 0] });
      }
    };
    const planks = (x: number, y: number, n: number) => {
      for (let i = 0; i < n; i++) {
        addPart({ k: 1, x: x + rnd(-14, 14) * U, y, vx: rnd(-1, 1) * 260 * U, vy: -rnd(0.6, 1) * 620 * U, g: 1500 * U, size: rnd(14, 26) * U, life: rnd(1, 1.6), age: 0, rot: rnd(0, TAU), vr: rnd(-9, 9), col: '#4a2d1c' });
      }
    };
    const blood = (x: number, y: number, n: number, power: number) => {
      for (let i = 0; i < n; i++) {
        const a = rnd(0, TAU);
        addPart({ k: 2, x, y, vx: Math.cos(a) * power * rnd(0.3, 1), vy: Math.sin(a) * power * rnd(0.3, 1) - 80 * U, g: 1100 * U, size: rnd(1.6, 3.6) * U, life: rnd(0.5, 1.0), age: 0, rot: 0, vr: 0, col: '#8a0d14' });
      }
    };
    const spores = (x: number, y: number, n: number, sp: number) => {
      for (let i = 0; i < n; i++) {
        const a = rnd(0, TAU);
        addPart({ k: 3, x, y, vx: Math.cos(a) * sp * rnd(0.3, 1), vy: Math.sin(a) * sp * rnd(0.3, 1) - 30 * U, g: -60 * U, size: rnd(8, 18) * U, life: rnd(0.8, 1.5), age: 0, rot: 0, vr: 0, col: '' });
      }
    };
    const sparks = (x: number, y: number, n: number, sp: number) => {
      for (let i = 0; i < n; i++) {
        const a = rnd(0, TAU);
        addPart({ k: 4, x, y, vx: Math.cos(a) * sp * rnd(0.3, 1), vy: Math.sin(a) * sp * rnd(0.3, 1), g: 200 * U, size: rnd(6, 14) * U, life: rnd(0.5, 1.1), age: 0, rot: 0, vr: 0, col: '' });
      }
    };

    // الصوت
    const stopSound = playZombieSound({
      totalS: TOTAL_S,
      mode,
      howls: HOWLS,
      crackAt: CRACK_AT,
      sideAt: SIDE_AT,
      midAt: MID_AT,
      ripAt: mode === 'heart' ? RIP_AT : GRAB_AT,
      beats: mode === 'heart' ? BEATS : [],
      throwAt: TR - 0.15,
      arriveAt: ARRIVE,
      gulpAt: STUFF_AT + 0.35,
      laughAt: LAUGH_AT,
      laughS: mode === 'avatar' ? LAUGH_S : 0,
      roarAt: mode === 'heart' ? PULL_AT + 0.4 : -1,
      sinkAt: SINK_AT,
      howlUrl: HOWL_URL,
      cricketsUrl: CRICKETS_URL,
      laughUrl: LAUGH_URL,
    });

    // نبض القلب (لَب-دَب) من أوقات النبضات
    const beatAt = (t: number): number => {
      let bt = -1;
      for (let i = 0; i < BEATS.length; i++) { if (BEATS[i] <= t) bt = BEATS[i]; else break; }
      if (bt < 0) return 0;
      const d = t - bt;
      return clamp01(Math.exp(-d * 10) + 0.7 * Math.exp(-Math.max(0, d - 0.17) * 11) * (d > 0.17 ? 1 : 0));
    };

    const fired: Record<string, boolean> = {};
    const once = (key: string, cond: boolean, fn: () => void) => { if (cond && !fired[key]) { fired[key] = true; fn(); } };

    let host: Host | null = null;
    let fly: { p0: Pt2; p1: Pt2; p2: Pt2 } | null = null;
    let rel: Pt2 | null = null;      // نقطة إطلاق القلب
    let hand: { hL: Pt2; hR: Pt2 } | null = null;

    let raf = 0;
    const t0 = performance.now();
    let last = t0;

    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const nightI = smooth(t / NIGHT_IN) * (1 - smooth((t - NIGHT_OUT_AT) / NIGHT_OUT_S));
      bd.style.opacity = String(nightI * 0.9);

      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
      c.clearRect(0, 0, W, H);

      // اهتزاز الأرض
      const rum = clamp01((t - CRACK_AT) / 0.4) * (1 - smooth((t - (MID_AT + 2.2)) / 1.2)) + 0.25 * (1 - smooth((t - SINK_AT - 0.6) / 1.4)) * smooth((t - SINK_AT + 0.4) / 0.4);
      if (rum > 0.01) c.translate((Math.random() - 0.5) * 3.2 * U * rum, (Math.random() - 0.5) * 3.2 * U * rum);

      // ليل بارد على البث
      c.fillStyle = `rgba(2,9,11,${0.62 * nightI})`;
      c.fillRect(-10, -10, W + 20, H + 20);
      c.globalAlpha = nightI;
      c.fillStyle = vig;
      c.fillRect(-10, -10, W + 20, H + 20);
      c.globalAlpha = 1;

      // وميض برق بعيد
      for (const ft of FLASHES) {
        const e = t - ft;
        if (e < 0 || e > 0.7) continue;
        const f = e < 0.06 ? 1 : e < 0.12 ? 0.15 : e < 0.2 ? 0.85 : Math.max(0, 0.4 * (1 - (e - 0.2) / 0.5));
        c.fillStyle = `rgba(170,235,205,${0.26 * f * nightI})`;
        c.fillRect(-10, -10, W + 20, H + 20);
      }

      // القمر
      const moonY = lerp(H * 0.24, H * 0.15, easeOut(t / 3));
      const moonX = W * 0.8;
      const moonR = Math.max(16, W * 0.055);
      blob(GL_M, moonX, moonY, moonR * 4.2, 0.42 * nightI);
      c.globalAlpha = nightI;
      c.fillStyle = '#e4f2c8';
      c.beginPath(); c.arc(moonX, moonY, moonR, 0, TAU); c.fill();
      c.fillStyle = 'rgba(150,170,125,.55)';
      c.beginPath(); c.arc(moonX - moonR * 0.3, moonY - moonR * 0.2, moonR * 0.22, 0, TAU); c.fill();
      c.beginPath(); c.arc(moonX + moonR * 0.35, moonY + moonR * 0.25, moonR * 0.16, 0, TAU); c.fill();
      c.globalAlpha = 1;

      // المقبرة تطلع من تحت وتنزل بنهاية الهدية
      const gE = easeOut((t - GRAVE_AT) / GRAVE_S) * (1 - smooth((t - GRAVE_OUT_AT) / GRAVE_OUT_S));
      const off = (1 - gE) * H * 0.62;
      const fogI = smooth((t - GRAVE_AT) / 1.5) * (1 - smooth((t - GRAVE_OUT_AT) / 1.8));

      // ضباب خلفي
      const drawFog = (front: boolean) => {
        for (const f of fogs) {
          if (f.front !== front) continue;
          const fx = ((f.x + t * f.v) % (W * 1.5) + W * 1.5) % (W * 1.5) - W * 0.25;
          blob(FOG, fx, f.y + off * 0.3, f.r, f.a * fogI * (front ? 1.1 : 1));
        }
        c.globalAlpha = 1;
      };

      if (layers) { c.globalAlpha = 0.97; c.drawImage(layers.back, 0, off, W, H); c.globalAlpha = 1; }
      drawFog(false);

      // عيون بالظلام + أرواح
      if (gE > 0.3) {
        for (const e of eyes) {
          const bl = 0.5 + 0.5 * Math.sin(t * 1.3 + e.ph);
          if (bl > 0.3) {
            c.globalCompositeOperation = 'lighter';
            blob(GL_Y, e.x - 4 * U, e.y + off, 4 * U, 0.8 * gE * bl);
            blob(GL_Y, e.x + 4 * U, e.y + off, 4 * U, 0.8 * gE * bl);
            c.globalCompositeOperation = 'source-over';
          }
        }
        c.globalCompositeOperation = 'lighter';
        for (const w of wisps) {
          const a = (0.35 + 0.35 * Math.sin(t * w.sp + w.ph)) * gE;
          blob(GL_G, w.x + Math.sin(t * 0.7 * w.sp + w.ph) * 18 * U, w.y + off + Math.cos(t * 0.9 * w.sp + w.ph) * 10 * U, 9 * U, a);
        }
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = 1;
      }

      // ── الزومبي المنتصف ──
      const riseM = riseOf(t, MID_AT, MID_S, SINK_AT);
      // فتح الصدر / القلب داخل الصدر
      const chest = mode === 'heart' ? smooth((t - (RIP_AT - 0.2)) / 0.6) : smooth((t - STUFF_AT) / 0.5) * 0.8;
      const heartIn = mode === 'heart' && t < PULL_AT && t > MID_AT + 1 ? beatAt(t) : null;
      const sw = Math.sin(t * 1.7);
      const idleL = PM(-23, -55 + sw * 1.6);
      const idleR = PM(23, -55 - sw * 1.6);
      let tL: Pt2 | null = null;
      let tR: Pt2 | null = null;
      let tilt = Math.sin(t * 0.9) * 0.06;
      let mouth = 0.22 + 0.14 * Math.sin(t * 2.1);
      let shake = 0;
      let bob = Math.sin(t * 1.4) * 1.2 * U;
      let eye = 0.3;
      let grip = 0.15;
      let held: Pt2 | null = null;     // قلب بيد الزومبي
      let av: { x: number; y: number; r: number; a: number; name: boolean } | null = null;

      if (mode === 'heart') {
        const wc = PM(1, -66);
        if (t >= RIP_AT && t < PULL_AT) {
          const u = smooth((t - RIP_AT) / (PULL_AT - RIP_AT));
          tR = { x: lerp(idleR.x, wc.x, u), y: lerp(idleR.y, wc.y, u) };
          grip = 0.2 + 0.7 * u;
          mouth = 0.5 + 0.4 * u;
          shake = (Math.random() - 0.5) * 2 * u * U;
          tilt = -0.15 * u;
        } else if (t >= PULL_AT && t < PULL_AT + SHOW_S) {
          const u = smooth((t - PULL_AT) / SHOW_S);
          const e = PM(20, -86);
          tR = { x: lerp(wc.x, e.x, u), y: lerp(wc.y, e.y, u) };
          grip = 0.9;
          mouth = 1;
          tilt = -0.3 * u - 0.15 * (1 - u);
          shake = Math.sin(t * 40) * 1.4 * U;
          eye = 1;
          held = tR;
        } else if (t >= PULL_AT + SHOW_S && t < THROW_AT) {
          const u = smooth((t - (PULL_AT + SHOW_S)) / (THROW_AT - PULL_AT - SHOW_S));
          const a = PM(20, -86), b = PM(30, -60);
          tR = { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) };
          grip = 0.9;
          mouth = 0.8;
          tilt = -0.3 + 0.3 * u;
          eye = 1;
          held = tR;
        } else if (t >= THROW_AT && t < TR) {
          const u = easeIn((t - THROW_AT) / (TR - THROW_AT));
          const a = PM(30, -60), b = PM(6, -128);
          tR = { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) };
          grip = 0.9 - 0.7 * u;
          mouth = 0.9;
          tilt = -0.1 - 0.35 * u;
          eye = 1;
          held = tR;
        } else if (t >= TR) {
          const u = smooth((t - TR) / 0.9);
          const a = PM(6, -128);
          tR = { x: lerp(a.x, idleR.x, u), y: lerp(a.y, idleR.y, u) };
          grip = 0.2;
          // يتابع القلب بعينيه ويزأر
          const look = 1 - smooth((t - (ARRIVE + 0.4)) / 0.8);
          tilt = -0.42 * look;
          mouth = 0.4 + 0.6 * look * (0.6 + 0.4 * Math.abs(Math.sin(t * 9)));
          eye = 0.6 + 0.4 * look;
        }
      } else {
        // وضع الصورة: يمسك الصورة بيديه → يدخلها بجسده → يضحك
        const hoverY = Math.max(R + 90, (GY - 77 * sz) - 58 * sz - R * 0.15);
        if (!lift && t >= AV_UP_AT - 0.4) lift = findLiftAv(W, H, liftPre);
        if (lift && t >= AV_UP_AT) {
          const up = easeOut((t - AV_UP_AT) / AV_UP_S);
          const gk = smooth((t - GRAB_AT) / GRAB_S);
          const bk = smooth((t - BRING_AT) / BRING_S);
          const st = smooth((t - STUFF_AT) / STUFF_S);
          const chestP = PM(0, -66);
          let ax = lerp(lift.sx, cx, up);
          let ay = lerp(lift.sy, hoverY, up) + Math.sin(t * 2.4) * 3 * U * up * (1 - gk);
          let ar = lerp(lift.sr, R, up);
          ax = lerp(ax, chestP.x, bk);
          ay = lerp(ay, chestP.y, bk);
          ar = lerp(ar, R * 0.62, bk) * (1 - 0.85 * st);
          av = { x: ax, y: ay, r: ar, a: 1 - smooth((st - 0.35) / 0.65), name: t < GRAB_AT };
          // اليدان تمسكان الصورة من جانبيها
          const sideL: Pt2 = { x: ax - ar * 0.9, y: ay + ar * 0.25 };
          const sideR: Pt2 = { x: ax + ar * 0.9, y: ay + ar * 0.25 };
          const relK = smooth((t - (STUFF_AT + STUFF_S)) / 0.5);
          const bellyL = PM(-9, -52), bellyR = PM(9, -52);
          tL = { x: lerp(lerp(idleL.x, sideL.x, gk), bellyL.x, relK), y: lerp(lerp(idleL.y, sideL.y, gk), bellyL.y, relK) };
          tR = { x: lerp(lerp(idleR.x, sideR.x, gk), bellyR.x, relK), y: lerp(lerp(idleR.y, sideR.y, gk), bellyR.y, relK) };
          grip = 0.3 + 0.6 * gk * (1 - relK);
          mouth = 0.3 + 0.5 * gk;
          eye = 0.5 + 0.5 * gk;
          if (t < STUFF_AT + STUFF_S) tilt = -0.12 * gk;
        }
        const lau = smooth((t - LAUGH_AT) / 0.3) * (1 - smooth((t - (LAUGH_AT + LAUGH_S)) / 0.5));
        if (lau > 0.001) {
          const hh = Math.abs(Math.sin(t * 17));
          tilt = -0.46 * lau + Math.sin(t * 17) * 0.06 * lau + tilt * (1 - lau);
          mouth = lau * (0.65 + 0.35 * hh) + mouth * (1 - lau);
          shake = Math.sin(t * 34) * 1.7 * U * lau;
          bob = Math.sin(t * 34) * 2.4 * U * lau + bob * (1 - lau);
          eye = 1;
        }
      }

      if (riseM > 0.003) {
        hand = drawStanding(c, {
          x: cx, gy: GY, sz, rise: riseM, t,
          hL: tL, hR: tR, tilt, mouth, shake, bob, chest, heartIn, eye, grip,
        }, GL_R);
      }

      // طبقة التراب الأمامية
      if (layers) { c.globalAlpha = 0.93; c.drawImage(layers.front, 0, off, W, H); c.globalAlpha = 1; }

      // ── الزاحفان (يمين ويسار) ──
      for (let i = 0; i < 2; i++) {
        const dir = i === 0 ? 1 : -1;
        const emerge = riseOf(t, SIDE_AT + i * 0.35, SIDE_S, SINK_AT + i * 0.4);
        if (emerge <= 0.003) continue;
        const cp = smooth((t - (SIDE_AT + 0.8 + i * 0.35)) / 4.5);
        const x0 = i === 0 ? W * 0.13 : W * 0.87;
        const x1 = i === 0 ? W * 0.22 : W * 0.78;
        drawCrawler(c, {
          x: lerp(x0, x1, cp), gy: GYC, sc, dir, emerge,
          ph: (t - SIDE_AT) * 5.4 * (0.3 + 0.7 * emerge) + i * 1.7,
          mouth: 0.45 + 0.4 * Math.sin(t * 3.1 + i),
        });
      }

      // ── التراب حول القبور + الشقوق ──
      const crack = smooth((t - CRACK_AT) / 0.6) * (1 - smooth((t - SINK_AT - 1.5) / 1.5));
      if (crack > 0.01) {
        c.lineJoin = 'round';
        for (const pl of cracks) {
          c.strokeStyle = `rgba(120,255,100,${0.18 * crack})`;
          c.lineWidth = 6 * U;
          c.beginPath(); pl.forEach((p, k) => { if (k) c.lineTo(p.x, p.y + off); else c.moveTo(p.x, p.y + off); }); c.stroke();
          c.strokeStyle = `rgba(190,255,150,${0.6 * crack})`;
          c.lineWidth = 1.6 * U;
          c.beginPath(); pl.forEach((p, k) => { if (k) c.lineTo(p.x, p.y + off); else c.moveTo(p.x, p.y + off); }); c.stroke();
        }
      }
      const mound = (x: number, y: number, rx: number, grow: number, seed: number) => {
        if (grow <= 0.01) return;
        c.fillStyle = '#050302';
        c.beginPath(); c.ellipse(x, y, rx * 0.8 * grow, rx * 0.15 * grow, 0, 0, TAU); c.fill();
        for (let k = 0; k < 11; k++) {
          const a = (k / 11) * TAU;
          const lr = rx * (0.13 + hash(k, seed) * 0.1) * grow;
          const lx = x + Math.cos(a) * rx * 0.92 * grow;
          const ly = y + Math.sin(a) * rx * 0.13 * grow + (Math.sin(a) > 0 ? 2 : -lr * 0.35);
          c.fillStyle = hash(k, seed + 5) > 0.5 ? '#2d1c11' : '#1d110a';
          c.beginPath(); c.ellipse(lx, ly, lr, lr * 0.62, 0, 0, TAU); c.fill();
          c.fillStyle = 'rgba(88,58,36,.5)';
          c.beginPath(); c.ellipse(lx - lr * 0.2, ly - lr * 0.2, lr * 0.55, lr * 0.28, 0, 0, TAU); c.fill();
        }
      };
      const mg = (at: number) => smooth((t - at) / 1.2) * (1 - smooth((t - SINK_AT - 1.0) / 1.6));
      mound(cx, GY + off, sz * 22, mg(MID_AT - 0.4), 3);
      mound(W * 0.15, GYC + off, 48 * U, mg(SIDE_AT - 0.3), 5);
      mound(W * 0.85, GYC + off, 48 * U, mg(SIDE_AT - 0.3), 8);

      // ── القلب (وضع القلب) ──
      if (mode === 'heart') {
        if (held && t < TR) {
          const hr = 5.4 * sz;
          drawHeart(c, GL_R, held.x + 2 * sz, held.y - hr * 0.55, hr, beatAt(t), Math.sin(t * 3) * 0.12, 1);
        }
        once('rip', t >= PULL_AT, () => { const wc = PM(0, -66); blood(wc.x, wc.y, 26, 280 * U); });
        once('release', t >= TR, () => {
          const hp = hand ? hand.hR : PM(6, -128);
          rel = { x: hp.x, y: hp.y - 4 * sz };
        });
        if (t >= TR - 1 && !fired.hostFound) { fired.hostFound = true; host = findHost(W); }
        if (t >= TR && rel) {
          host = findHost(W);
          const hr = clamp(host.w * 0.42, 16, 30);
          const target: Pt2 = { x: host.x, y: Math.max(hr + 4, host.top - hr * 0.1) };
          if (!fly) fly = { p0: rel, p1: { x: rel.x + (target.x < rel.x ? -1 : 1) * W * 0.28, y: rel.y - H * 0.3 }, p2: { x: target.x + (target.x < rel.x ? 1 : -1) * W * 0.12, y: target.y + H * 0.18 } };
          const u = easeIn(clamp01((t - TR) / FLY_S)) * 0.35 + smooth(clamp01((t - TR) / FLY_S)) * 0.65;
          const q = 1 - u;
          const bx = q * q * q * fly.p0.x + 3 * q * q * u * fly.p1.x + 3 * q * u * u * fly.p2.x + u * u * u * target.x;
          const by = q * q * q * fly.p0.y + 3 * q * q * u * fly.p1.y + 3 * q * u * u * fly.p2.y + u * u * u * target.y;
          const flying = t < ARRIVE;
          const rr = flying ? lerp(5.4 * sz, hr, u) : hr * 1.05;
          const out = 1 - smooth((t - (ARRIVE + HEART_STAY)) / 0.45);
          if (out > 0.01) {
            if (flying) {
              blood(bx, by, 1, 70 * U);
              if (Math.random() < 0.5) sparks(bx, by, 1, 30 * U);
            }
            drawHeart(c, GL_R, bx, by, rr, flying ? beatAt(t) * 0.6 : beatAt(t), u * TAU * 1.5 * (flying ? 1 : 0) , out);
            // موجات النبض عند صاحب البث
            if (!flying) {
              for (const b of BEATS) {
                const age = t - b;
                if (b < ARRIVE || age < 0 || age > 0.7) continue;
                c.strokeStyle = `rgba(255,70,90,${0.7 * (1 - age / 0.7) * out})`;
                c.lineWidth = 2.4 * U;
                c.beginPath(); c.arc(bx, by, rr * (1.1 + 2.2 * (age / 0.7)), 0, TAU); c.stroke();
              }
            }
          }
          once('arrive', t >= ARRIVE, () => { sparks(bx, by, 22, 240 * U); blood(bx, by, 14, 200 * U); });
          once('vanish', t >= ARRIVE + HEART_STAY, () => { sparks(bx, by, 30, 320 * U); });
        }
      }

      // ── صورة المستخدم (وضع الصورة) ──
      if (mode === 'avatar' && lift && av) {
        // توهج سام داخل الصدر عند الابتلاع
        const glowK = smooth((t - STUFF_AT) / 0.4) * (1 - smooth((t - (LAUGH_AT + 1.5)) / 1.5));
        if (glowK > 0.01) {
          const wc = PM(0, -66);
          c.globalCompositeOperation = 'lighter';
          blob(GL_G, wc.x, wc.y, 30 * sz * (0.8 + 0.2 * Math.sin(t * 9)), 0.65 * glowK);
          c.globalCompositeOperation = 'source-over';
          c.globalAlpha = 1;
        }
        drawAvatar(c, lift, GL_G, av.x, av.y, av.r, av.a, liftPre);
        if (av.name) {
          c.save();
          c.globalAlpha = clamp01(1 - smooth((t - (GRAB_AT - 0.4)) / 0.4));
          c.font = `800 ${Math.round(Math.max(12, av.r * 0.3))}px sans-serif`;
          c.textAlign = 'center';
          c.textBaseline = 'top';
          c.shadowColor = 'rgba(0,0,0,0.9)';
          c.shadowBlur = 6;
          c.fillStyle = '#e8ffd0';
          c.fillText(lift.name.length > 18 ? lift.name.slice(0, 17) + '…' : lift.name, av.x, av.y + av.r + 8 * U);
          c.restore();
        }
        once('stuff', t >= STUFF_AT + 0.35, () => { const wc = PM(0, -66); spores(wc.x, wc.y, 26, 160 * U); });
      }

      // ── أحداث التراب ──
      once('crackSoil', t >= CRACK_AT, () => { soil(cx, GY, 12, 60 * U, 260 * U); soil(W * 0.15, GYC, 8, 30 * U, 220 * U); soil(W * 0.85, GYC, 8, 30 * U, 220 * U); });
      once('sideSoil', t >= SIDE_AT, () => { soil(W * 0.15, GYC, 34, 34 * U, 520 * U); soil(W * 0.85, GYC, 34, 34 * U, 520 * U); });
      once('midSoil', t >= MID_AT, () => { soil(cx, GY, 48, 46 * U, 620 * U); planks(cx, GY - 10 * U, 7); });
      once('sinkSoil', t >= SINK_AT + 0.4, () => { soil(cx, GY, 26, 46 * U, 300 * U); soil(W * 0.2, GYC, 14, 30 * U, 240 * U); soil(W * 0.8, GYC, 14, 30 * U, 240 * U); });

      // ── الجسيمات ──
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.age += dt;
        if (p.age >= p.life || p.y > H + 30) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        const a = 1 - p.age / p.life;
        if (p.k === 0 || p.k === 1) {
          c.save();
          c.globalAlpha = Math.min(1, a * 1.6);
          c.translate(p.x, p.y);
          c.rotate(p.rot);
          c.fillStyle = p.col;
          if (p.k === 0) c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.8);
          else { c.fillRect(-p.size / 2, -p.size * 0.12, p.size, p.size * 0.24); c.fillStyle = '#2a170c'; c.fillRect(-p.size / 2, p.size * 0.04, p.size, p.size * 0.08); }
          c.restore();
        } else if (p.k === 2) {
          c.globalAlpha = Math.min(1, a * 1.5);
          c.fillStyle = p.col;
          c.beginPath(); c.ellipse(p.x, p.y, p.size * 0.8, p.size * 1.15, 0, 0, TAU); c.fill();
        } else {
          c.globalCompositeOperation = 'lighter';
          blob(p.k === 3 ? GL_G : GL_R, p.x, p.y, p.size, a * 0.8);
          c.globalCompositeOperation = 'source-over';
        }
      }
      c.globalAlpha = 1;

      // ضباب أمامي
      drawFog(true);

      // خفافيش
      for (const b of bats) {
        const u = (t - b.t) / b.dur;
        if (u < 0 || u > 1) continue;
        const bx = b.dir > 0 ? lerp(-W * 0.1, W * 1.1, u) : lerp(W * 1.1, -W * 0.1, u);
        drawBat(c, bx, b.y + Math.sin(u * 9) * b.amp, b.s * U * 1.2, t * 22, b.dir);
      }

      // نهاية الهدية: يرجع كل شيء لطبيعته
      if (lift && !lift.done && t >= TOTAL_S - 0.5) { lift.done = true; lift.restore(); }

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
      {/* تأثير على البث نفسه: ألوان باهتة خضراء باردة (يطبق على الفيديو والواجهة اللي خلفه) */}
      <div
        ref={bdRef}
        style={{ position: 'absolute', inset: 0, opacity: 0, backdropFilter: BD_FILTER, WebkitBackdropFilter: BD_FILTER }}
      />
      <canvas ref={cvRef} style={{ position: 'absolute', inset: 0, width: W, height: H, pointerEvents: 'none' }} />
    </div>
  );
}

export const ZombieGift: GiftDefinition = {
  id: 'zombie',
  name: 'Zombie',
  price: PRICE,
  durationMs: TOTAL_MS,
  Preview: ZombiePreview,
  Animation: ZombieAnimation,
};

export default ZombieGift;
