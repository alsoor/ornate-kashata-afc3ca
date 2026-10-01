/**
 * هدية الحديقة (Garden) — 500 Coins — مدتها 20 ثانية   (تستبدل هدية الزومبي Zombie)
 *
 * - Preview  : داخل مربع الهدايا (قبل النقر) أنميشن متكرر: حديقة بسماء وشمس وشجرة وعصافير،
 *              وقلوب بشرية حقيقية (أحمر / أصفر / أزرق / أخضر) تتساقط وتنزل على زر وتنبض ثم تختفي.
 * - Animation: (الأرقام بالثواني)
 *     0.2 – 2.1  : البث يتحول لحديقة مشمسة (ألوان زاهية) + عشب وزهور وأشجار تطلع من الأطراف
 *                  + عصافير تغرّد + فراشات + أوراق وبتلات تتطاير
 *     2.0 – 15.6 : قلوب بشرية حقيقية (بأوعية وشرايين) ملونة تتساقط من الأعلى وتنزل على أزرار البث
 *                  (الزر يتوهج بلون القلب، والقلب ينبض عليه ثم يختفي بشرارات) والباقي ينزل على العشب
 *     17.2 – 19.6: الحديقة تنزل وتختفي، والبث يرجع طبيعي
 *   ▸ الوضع العادي (الدعم لصاحب البث): حديقة + قلوب تتساقط على الأزرار.
 *   ▸ وضع "الدعم لمستخدم" (صاحب البث يدعم متحدث — نفس طريقة البركان):
 *     2.2 – 3.8  : صورة المستخدم تصعد من مكانها لمنتصف البث (ويخفت مكانها الأصلي طول مدة الهدية)
 *     4.2 – 5.7  : إطار الصورة يتحول من دائرة إلى قلب بشري ملون (أوعية وشرايين من أعلاه) وينبض
 *     5.7        : انفجار قلوب صغيرة وموجات ملونة
 *     15.8 – 16.9: الإطار يرجع دائرة ثم الصورة تنزل لمكانها الأصلي
 *
 * ملف مستقل: ضعه في components/gifts بجانب VolcanoGift.tsx. الأصوات في src/lib/gardenSounds.ts (بجانب audio.ts).
 * لا يحتاج أي ملف صوت أو صورة. غيّر الأرقام تحت (السعر/المدد/التوقيتات).
 *
 * ربط الأنميشن بالواجهة (يعمل تلقائياً بدونها، نفس ربط البركان):
 *   data-gift-host : على صورة صاحب البث → تنزل عليها القلوب كما تنزل على الأزرار.
 *   data-gift-user : على صورة المتحدث (يضعه live.tsx) + window.__stooornaGiftLift (يضعه LiveCoinsDock) → وضع رفع الإطار
 *   data-gift-hot  : (اختياري) ضعه على أي عنصر تبي القلوب تنزل عليه غير الأزرار والـ inputs.
 *   القلوب تنزل تلقائياً على: button, [role=button], a[href], input, textarea, select
 */
import React, { useEffect, useRef, useState } from 'react';
import type { GiftDefinition } from '../../lib/types';
import { playGardenSound } from '../../lib/gardenSounds';

// ── إعدادات الهدية ──────────────────────────────────────────────────────
const PRICE = 500;
const TOTAL_MS = 20000;            // مدة الأنميشن الكلية (20 ثانية)
const TOTAL_S = TOTAL_MS / 1000;

const GARDEN_IN_AT = 0.2;          // الحديقة تبدأ تظهر
const GARDEN_IN_S = 1.9;
const GARDEN_OUT_AT = 17.2;        // الحديقة تبدأ تختفي
const GARDEN_OUT_S = 2.4;
const RAIN_START = 2.0;            // بداية تساقط القلوب
const RAIN_END = 15.6;             // نهاية تساقط القلوب
const RAIN_RATE = 8.5;             // أقصى عدد قلوب بالثانية
const WAVES = [4.6, 9.4, 13.0];    // دفعات قلوب كثيفة
const MAX_HEARTS = 64;             // حد أقصى للقلوب على الشاشة (للأداء)
const MAX_PARTS = 320;             // حد أقصى للجسيمات
const HEART_STAY_MIN = 2.4;        // أقل وقت يبقى القلب على الزر (ثانية)
const HEART_STAY_MAX = 3.8;

// وضع المستخدم (الإطار يصعد ويتحول لقلب)
const LIFT_AT = 2.2;               // الصورة تبدأ ترتفع
const LIFT_S = 1.6;
const MORPH_AT = 4.2;              // الإطار يتحول لقلب
const MORPH_S = 1.5;
const DOWN_AT = 15.8;              // الإطار يرجع دائرة والصورة تنزل
const DOWN_S = 1.1;
const BEAT_PERIOD = 0.95;          // نبضة قلب الإطار

const HOT_SEL = 'button, [role="button"], a[href], input, textarea, select, [data-gift-host], [data-gift-hot]';
const BD_FILTER = 'saturate(1.35) brightness(1.07) contrast(1.05) sepia(0.08)';

// ── ألوان القلوب ────────────────────────────────────────────────────────
interface Pal {
  hi: string; mid: string; lo: string;       // تدرج جسم القلب
  vA: string; vAd: string;                   // الشريان الأورطي (فاتح / غامق)
  vB: string; vBd: string;                   // الوريد (فاتح / غامق)
  glow: string;                              // rgb للتوهج
  css: string;                               // لون الإطار
}
const PALS: Pal[] = [
  { hi: '#ff6b78', mid: '#c8142c', lo: '#5a0612', vA: '#f06a74', vAd: '#7a1220', vB: '#6f86e0', vBd: '#27357f', glow: '255,60,80', css: '#ff3b55' },    // أحمر
  { hi: '#fff08a', mid: '#f2b705', lo: '#7a4d00', vA: '#ffd24d', vAd: '#8a5a00', vB: '#ff9f43', vBd: '#8a4310', glow: '255,214,60', css: '#ffd93b' },   // أصفر
  { hi: '#8fc6ff', mid: '#2a6fe0', lo: '#0a2a70', vA: '#6fb0ff', vAd: '#143c8c', vB: '#7fe0ff', vBd: '#0f5a7a', glow: '70,150,255', css: '#3d8bff' },   // أزرق
  { hi: '#9bff9f', mid: '#1fae45', lo: '#0a4a1c', vA: '#6fe07f', vAd: '#146b2c', vB: '#d4f36a', vBd: '#5a7a10', glow: '80,230,110', css: '#3fe26a' },   // أخضر
];
const PETAL_COLS = ['#ff9ec4', '#ffffff', '#ffe27a', '#ffb3d1', '#c9a8ff'];
const BIRD_COLS = [
  { col: '#4aa3ff', belly: '#fff3d6', wing: '#2a73c9' },
  { col: '#ff6b6b', belly: '#ffe9d0', wing: '#c93c3c' },
  { col: '#ffd23f', belly: '#fff6d0', wing: '#d9a400' },
  { col: '#3ed07a', belly: '#f2ffe0', wing: '#1f9a52' },
];
const FLOWER_COLS = ['#ff4d6d', '#ffd93b', '#5aa9ff', '#ffffff', '#ff9ad5', '#b388ff'];

// ── أدوات رياضية ────────────────────────────────────────────────────────
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const hash = (i: number, n: number) => { const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453; return x - Math.floor(x); };
// نبضة قلب (لَب-دَب): d = الزمن بالثواني منذ بداية النبضة
const beatC = (d: number) => clamp01(Math.exp(-d * 10) + (d > 0.17 ? 0.7 * Math.exp(-(d - 0.17) * 11) : 0));

type Ctx = CanvasRenderingContext2D;

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
//  القلب البشري الحقيقي — يُرسم مرة واحدة لكل لون (sprite) ثم يُنسخ كل فريم
//  الإحداثيات بوحدة r: جسم القلب + الشريان الأورطي + الشريان الرئوي + الوريد الأجوف + الشرايين التاجية
// ═══════════════════════════════════════════════════════════════════════
const SP_R = 44, SP_W = 160, SP_H = 160, SP_OX = 80, SP_OY = 98;

function renderHeartSprite(p: Pal): HTMLCanvasElement {
  const dpr = 2;
  const cv = document.createElement('canvas');
  cv.width = SP_W * dpr;
  cv.height = SP_H * dpr;
  const g = cv.getContext('2d');
  if (!g) return cv;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.translate(SP_OX, SP_OY);
  const r = SP_R;
  g.lineCap = 'round';
  g.lineJoin = 'round';

  const tube = (path: () => void, w: number, dark: string, light: string) => {
    g.beginPath(); path(); g.strokeStyle = 'rgba(20,0,5,.85)'; g.lineWidth = w + r * 0.1; g.stroke();
    g.beginPath(); path(); g.strokeStyle = dark; g.lineWidth = w; g.stroke();
    g.beginPath(); path(); g.strokeStyle = light; g.lineWidth = w * 0.62; g.stroke();
    g.beginPath(); path(); g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = w * 0.14; g.stroke();
  };
  // الوريد الأجوف العلوي (يمين)
  tube(() => { g.moveTo(r * 0.72, -r * 0.4); g.lineTo(r * 0.8, -r * 1.42); }, r * 0.34, p.vBd, p.vB);
  // الشريان الأورطي (قوس للأعلى)
  tube(() => { g.moveTo(r * 0.2, -r * 0.45); g.bezierCurveTo(r * 0.3, -r * 1.55, -r * 0.55, -r * 1.8, -r * 0.75, -r * 0.95); }, r * 0.44, p.vAd, p.vA);
  // الشريان الرئوي (يسار)
  tube(() => { g.moveTo(-r * 0.3, -r * 0.45); g.bezierCurveTo(-r * 0.4, -r * 0.95, -r * 0.85, -r * 1.0, -r * 1.12, -r * 0.62); }, r * 0.34, p.vBd, p.vB);

  // جسم القلب (مائل قليلاً: القمة تتجه لليسار)
  g.save();
  g.rotate(0.28);
  const body = () => {
    g.beginPath();
    g.moveTo(0, r * 0.95);
    g.bezierCurveTo(-r * 1.55, r * 0.15, -r * 1.15, -r * 1.0, 0, -r * 0.45);
    g.bezierCurveTo(r * 1.15, -r * 1.0, r * 1.55, r * 0.15, 0, r * 0.95);
    g.closePath();
  };
  body();
  const gr = g.createRadialGradient(-r * 0.35, -r * 0.25, r * 0.1, 0, 0, r * 1.45);
  gr.addColorStop(0, p.hi);
  gr.addColorStop(0.55, p.mid);
  gr.addColorStop(1, p.lo);
  g.fillStyle = gr;
  g.fill();
  g.strokeStyle = 'rgba(30,0,6,.8)';
  g.lineWidth = r * 0.08;
  g.stroke();

  g.save();
  body();
  g.clip();
  // ظل البطين السفلي
  const sh = g.createLinearGradient(0, -r * 0.2, r * 0.5, r);
  sh.addColorStop(0, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(0,0,0,.34)');
  g.fillStyle = sh;
  g.fillRect(-r * 2, -r * 2, r * 4, r * 4);
  // الأخدود بين البطينين
  g.strokeStyle = 'rgba(30,0,8,.55)';
  g.lineWidth = r * 0.09;
  g.beginPath(); g.moveTo(r * 0.02, -r * 0.4); g.quadraticCurveTo(r * 0.14, r * 0.3, 0, r * 0.92); g.stroke();
  // الشرايين التاجية
  g.strokeStyle = p.vA;
  g.lineWidth = r * 0.075;
  g.beginPath(); g.moveTo(-r * 0.08, -r * 0.3); g.quadraticCurveTo(-r * 0.22, r * 0.22, r * 0.02, r * 0.74); g.stroke();
  g.beginPath(); g.moveTo(-r * 0.1, -r * 0.2); g.quadraticCurveTo(-r * 0.7, 0, -r * 0.86, r * 0.3); g.stroke();
  g.beginPath(); g.moveTo(-r * 0.4, -r * 0.05); g.quadraticCurveTo(-r * 0.5, r * 0.3, -r * 0.46, r * 0.55); g.stroke();
  g.strokeStyle = p.vB;
  g.lineWidth = r * 0.065;
  g.beginPath(); g.moveTo(r * 0.06, -r * 0.25); g.quadraticCurveTo(r * 0.62, -r * 0.1, r * 0.92, r * 0.22); g.stroke();
  g.beginPath(); g.moveTo(r * 0.5, -r * 0.1); g.quadraticCurveTo(r * 0.55, r * 0.3, r * 0.36, r * 0.58); g.stroke();
  // دهن حول الأخدود
  g.fillStyle = 'rgba(255,236,160,.7)';
  g.beginPath(); g.ellipse(-r * 0.22, -r * 0.3, r * 0.2, r * 0.1, -0.5, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(r * 0.3, -r * 0.28, r * 0.17, r * 0.09, 0.4, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(r * 0.04, r * 0.35, r * 0.1, r * 0.06, 1.2, 0, TAU); g.fill();
  g.restore();

  // لمعة
  g.fillStyle = 'rgba(255,255,255,.34)';
  g.beginPath(); g.ellipse(-r * 0.58, -r * 0.14, r * 0.16, r * 0.36, -0.5, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,.55)';
  g.beginPath(); g.arc(-r * 0.72, -r * 0.4, r * 0.06, 0, TAU); g.fill();
  g.restore();
  return cv;
}

// ═══════════════════════════════════════════════════════════════════════
//  Preview — داخل مربع الهدايا (قبل النقر)
// ═══════════════════════════════════════════════════════════════════════
const GG_CSS = `
@keyframes gg-sun{0%,100%{opacity:.75;transform:scale(1)}50%{opacity:1;transform:scale(1.1)}}
@keyframes gg-cloud{from{transform:translateX(-14px)}to{transform:translateX(16px)}}
@keyframes gg-tree{0%,100%{transform:rotate(-1.4deg)}50%{transform:rotate(1.4deg)}}
@keyframes gg-sway{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}
@keyframes gg-bird{0%{transform:translate(-14px,6px);opacity:0}10%{opacity:1}50%{transform:translate(40px,-4px);opacity:1}88%{opacity:1}100%{transform:translate(104px,8px);opacity:0}}
@keyframes gg-flap{0%,100%{transform:scaleY(1)}50%{transform:scaleY(-.5)}}
@keyframes gg-fall{0%,6%{transform:translateY(-70px);opacity:0}14%{opacity:1}42%{transform:translateY(0);opacity:1}45%{transform:translateY(-4px)}48%,76%{transform:translateY(0);opacity:1}90%,100%{transform:translateY(-6px) scale(1.25);opacity:0}}
@keyframes gg-beat{0%,100%{transform:scale(1)}12%{transform:scale(1.22)}24%{transform:scale(1)}36%{transform:scale(1.14)}48%{transform:scale(1)}}
@keyframes gg-btn{0%,100%{opacity:.35}50%{opacity:.95}}
@keyframes gg-bfly{0%{transform:translate(0,0)}25%{transform:translate(10px,-8px)}50%{transform:translate(22px,2px)}75%{transform:translate(8px,6px)}100%{transform:translate(0,0)}}
.gg-sun{animation:gg-sun 3s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}
.gg-cloud{animation:gg-cloud 7s ease-in-out infinite alternate}
.gg-tree{animation:gg-tree 3.4s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 100%}
.gg-sway{animation:gg-sway 2.2s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 100%}
.gg-bird{animation:gg-bird 6s linear infinite}
.gg-flap{animation:gg-flap .26s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 100%}
.gg-fall{animation:gg-fall 5.2s ease-in infinite}
.gg-beat{animation:gg-beat .95s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}
.gg-btn{animation:gg-btn 1.3s ease-in-out infinite}
.gg-bfly{animation:gg-bfly 4.5s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){.gg-sun,.gg-cloud,.gg-tree,.gg-sway,.gg-bird,.gg-flap,.gg-fall,.gg-beat,.gg-btn,.gg-bfly{animation:none!important}}
`;

function HeartSvg({ ci, uid, r }: { ci: number; uid: string; r: number }) {
  const p = PALS[ci];
  const tube = (k: string, d: string, w: number, dark: string, light: string) => (
    <g key={k} fill="none" strokeLinecap="round">
      <path d={d} stroke="rgba(20,0,5,.85)" strokeWidth={w + 0.1} />
      <path d={d} stroke={dark} strokeWidth={w} />
      <path d={d} stroke={light} strokeWidth={w * 0.62} />
    </g>
  );
  return (
    <g transform={`scale(${r})`}>
      {tube('c', 'M.72 -.4 L.8 -1.42', 0.34, p.vBd, p.vB)}
      {tube('a', 'M.2 -.45 C.3 -1.55 -.55 -1.8 -.75 -.95', 0.44, p.vAd, p.vA)}
      {tube('p', 'M-.3 -.45 C-.4 -.95 -.85 -1 -1.12 -.62', 0.34, p.vBd, p.vB)}
      <g transform="rotate(16)">
        <path d="M0 .95 C-1.55 .15 -1.15 -1 0 -.45 C1.15 -1 1.55 .15 0 .95 Z" fill={`url(#gh${ci}${uid})`} stroke="rgba(30,0,6,.8)" strokeWidth={0.08} />
        <path d="M.02 -.4 Q.14 .3 0 .92" fill="none" stroke="rgba(30,0,8,.55)" strokeWidth={0.09} strokeLinecap="round" />
        <path d="M-.08 -.3 Q-.22 .22 .02 .74 M-.1 -.2 Q-.7 0 -.86 .3" fill="none" stroke={p.vA} strokeWidth={0.07} strokeLinecap="round" />
        <path d="M.06 -.25 Q.62 -.1 .92 .22" fill="none" stroke={p.vB} strokeWidth={0.065} strokeLinecap="round" />
        <ellipse cx={-0.58} cy={-0.14} rx={0.16} ry={0.36} transform="rotate(-29 -.58 -.14)" fill="rgba(255,255,255,.34)" />
      </g>
    </g>
  );
}

function GardenPreview({ size = 72 }: { size?: number }) {
  const s = Math.round(size * 1.2);
  const uid = React.useId().replace(/:/g, '');
  // مواضع نزول القلوب على الزر (x) واللون والتأخير
  const drops = [
    { x: 36, ci: 0, d: 0 },
    { x: 62, ci: 1, d: 1.3 },
    { x: 48, ci: 2, d: 2.6 },
    { x: 70, ci: 3, d: 3.9 },
    { x: 30, ci: 3, d: 2.0 },
  ];
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'relative', width: s, height: s, borderRadius: 16, overflow: 'hidden',
        boxShadow: '0 0 0 1.5px #7be37a, 0 0 12px rgba(120,235,120,0.45)',
        background: 'linear-gradient(180deg,#7fd0ff 0%,#cdeeff 52%,#b8ec9a 53%,#5fbf4b 100%)',
      }}
    >
      <style>{GG_CSS}</style>
      <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          {PALS.map((p, ci) => (
            <radialGradient key={ci} id={`gh${ci}${uid}`} cx="38%" cy="30%" r="85%">
              <stop offset="0%" stopColor={p.hi} />
              <stop offset="55%" stopColor={p.mid} />
              <stop offset="100%" stopColor={p.lo} />
            </radialGradient>
          ))}
          <radialGradient id={`sun${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff7c2" stopOpacity="1" />
            <stop offset="100%" stopColor="#fff7c2" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* شمس + غيمة */}
        <circle className="gg-sun" cx="80" cy="17" r="15" fill={`url(#sun${uid})`} />
        <circle cx="80" cy="17" r="6.5" fill="#fff3a8" />
        <g className="gg-cloud"><ellipse cx="28" cy="20" rx="10" ry="3.6" fill="rgba(255,255,255,.9)" /><ellipse cx="34" cy="17.5" rx="6" ry="3.6" fill="rgba(255,255,255,.9)" /></g>

        {/* تلال */}
        <path d="M0 62 Q22 48 46 60 T100 56 V100 H0 Z" fill="#8fdc6f" />
        <path d="M0 70 Q30 60 60 69 T100 66 V100 H0 Z" fill="#63c458" />

        {/* شجرة يسار */}
        <g className="gg-tree">
          <rect x="9" y="42" width="4.4" height="30" rx="1.6" fill="#6b4426" />
          <circle cx="11" cy="36" r="11" fill="#2f9a3c" />
          <circle cx="4" cy="42" r="7" fill="#43b64a" />
          <circle cx="18" cy="42" r="7.5" fill="#43b64a" />
          <circle cx="9" cy="31" r="6" fill="#74d35a" />
          <circle cx="15" cy="35" r="1.5" fill="#ffc2d9" /><circle cx="6" cy="38" r="1.4" fill="#fff" /><circle cx="12" cy="29" r="1.3" fill="#ffc2d9" />
        </g>
        {/* شجرة يمين صغيرة */}
        <g className="gg-tree" style={{ animationDelay: '-1.4s' }}>
          <rect x="90" y="52" width="3.2" height="20" rx="1.2" fill="#6b4426" />
          <circle cx="91.6" cy="48" r="8" fill="#2f9a3c" />
          <circle cx="86" cy="52" r="5" fill="#43b64a" />
          <circle cx="97" cy="52" r="5" fill="#43b64a" />
        </g>

        {/* عصافير تعبر */}
        <g className="gg-bird" style={{ animationDelay: '0s' }}>
          <g transform="translate(0,24)">
            <ellipse cx="0" cy="0" rx="3.4" ry="2" fill="#4aa3ff" />
            <circle cx="3" cy="-1" r="1.6" fill="#4aa3ff" />
            <path d="M4.4 -1.2 L6.4 -0.6 L4.4 -0.2 Z" fill="#ffb02e" />
            <path d="M-3 0 L-6.4 -1.2 L-6 1 Z" fill="#2a73c9" />
            <g className="gg-flap"><path d="M-1 -.4 Q0 -6 3 -3.4 Q1.4 -1 -1 -.4 Z" fill="#2a73c9" /></g>
          </g>
        </g>
        <g className="gg-bird" style={{ animationDelay: '-3s' }}>
          <g transform="translate(0,34)">
            <ellipse cx="0" cy="0" rx="3" ry="1.8" fill="#ff6b6b" />
            <circle cx="2.7" cy="-.9" r="1.4" fill="#ff6b6b" />
            <path d="M4 -1 L5.8 -.5 L4 -.2 Z" fill="#ffb02e" />
            <path d="M-2.6 0 L-5.6 -1 L-5.2 .9 Z" fill="#c93c3c" />
            <g className="gg-flap"><path d="M-1 -.4 Q0 -5.4 2.6 -3 Q1.2 -1 -1 -.4 Z" fill="#c93c3c" /></g>
          </g>
        </g>

        {/* فراشة */}
        <g className="gg-bfly">
          <g transform="translate(40,50)">
            <ellipse cx="-1.6" cy="-1" rx="2.2" ry="2.8" fill="#ff9ad5" /><ellipse cx="1.6" cy="-1" rx="2.2" ry="2.8" fill="#ff9ad5" />
            <ellipse cx="-1.2" cy="1.8" rx="1.5" ry="1.8" fill="#ffd93b" /><ellipse cx="1.2" cy="1.8" rx="1.5" ry="1.8" fill="#ffd93b" />
          </g>
        </g>

        {/* الأرض */}
        <path d="M0 80 Q25 74 50 80 T100 79 V100 H0 Z" fill="#46ad44" />

        {/* الزر الذي تنزل عليه القلوب */}
        <rect className="gg-btn" x="22" y="70" width="56" height="20" rx="10" fill="none" stroke="#ffd2e4" strokeWidth="2.4" />
        <rect x="24" y="72" width="52" height="16" rx="8" fill="rgba(255,255,255,.93)" />
        <circle cx="34" cy="80" r="3.2" fill="#e9eef2" /><rect x="41" y="77.6" width="26" height="4.8" rx="2.4" fill="#e1e8ee" />

        {/* القلوب */}
        {drops.map((d, i) => (
          <g key={i} transform={`translate(${d.x},${72 - 4.6 * 0.88})`}>
            <g className="gg-fall" style={{ animationDelay: `${d.d}s` }}>
              <g className="gg-beat" style={{ animationDelay: `${d.d * 0.3}s` }}>
                <HeartSvg ci={d.ci} uid={uid} r={4.6} />
              </g>
            </g>
          </g>
        ))}

        {/* عشب وزهور أمامية */}
        <g className="gg-sway"><path d="M8 100 Q9 90 7 84" stroke="#2e8b3a" strokeWidth="1.2" fill="none" strokeLinecap="round" /><circle cx="7" cy="83" r="2.4" fill="#ff4d6d" /><circle cx="7" cy="83" r="1" fill="#ffd23f" /></g>
        <g className="gg-sway" style={{ animationDelay: '-.8s' }}><path d="M92 100 Q91 91 93 85" stroke="#2e8b3a" strokeWidth="1.2" fill="none" strokeLinecap="round" /><circle cx="93" cy="84" r="2.4" fill="#ffd93b" /><circle cx="93" cy="84" r="1" fill="#ff8a3d" /></g>
        <path d="M0 100 L2 93 L4 100 M12 100 L14 94 L16 100 M84 100 L86 94 L88 100 M96 100 L98 93 L100 100" stroke="#2f9a3c" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  طبقات الحديقة (تُرسم مرة واحدة ثم تُنسخ كل فريم)
// ═══════════════════════════════════════════════════════════════════════
function makeLayer(W: number, H: number, dpr: number): { cv: HTMLCanvasElement; g: Ctx | null } {
  const cv = document.createElement('canvas');
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  const g = cv.getContext('2d');
  if (g) g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { cv, g };
}

// شجرة بجذع وأغصان وأوراق وزهر
function buildTree(tw: number, th: number, seed: number, dpr: number): HTMLCanvasElement {
  const L = makeLayer(tw, th, dpr);
  const g = L.g;
  if (!g) return L.cv;
  const hs = (i: number, n = 0) => hash(i, seed + n);
  const bx = tw * 0.5, by = th;

  const tg = g.createLinearGradient(bx - tw * 0.08, 0, bx + tw * 0.08, 0);
  tg.addColorStop(0, '#3b2414');
  tg.addColorStop(0.5, '#70482a');
  tg.addColorStop(1, '#2e1b0f');
  g.fillStyle = tg;
  g.beginPath();
  g.moveTo(bx - tw * 0.075, by);
  g.bezierCurveTo(bx - tw * 0.05, th * 0.8, bx - tw * 0.035, th * 0.66, bx - tw * 0.03, th * 0.5);
  g.lineTo(bx + tw * 0.03, th * 0.5);
  g.bezierCurveTo(bx + tw * 0.04, th * 0.66, bx + tw * 0.06, th * 0.8, bx + tw * 0.08, by);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(30,16,8,.35)';
  g.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const yy = th * (0.55 + i * 0.07);
    g.beginPath(); g.moveTo(bx - tw * 0.02, yy); g.quadraticCurveTo(bx, yy + 5, bx + tw * 0.03, yy - 2); g.stroke();
  }
  g.strokeStyle = '#4a2f1a';
  g.lineCap = 'round';
  const br: [number, number, number][] = [[-0.28, 0.3, 0.034], [0.3, 0.28, 0.034], [-0.12, 0.17, 0.03], [0.14, 0.15, 0.028]];
  br.forEach(([dx, dy, w]) => {
    g.lineWidth = tw * w;
    g.beginPath(); g.moveTo(bx, th * 0.54); g.quadraticCurveTo(bx + tw * dx * 0.4, th * 0.46, bx + tw * dx, th * dy); g.stroke();
  });

  const cx = tw * 0.5, cy = th * 0.3, Rc = tw * 0.44;
  const greens: [string, string, string][] = [
    ['#a6e86a', '#4cb43e', '#1f6b2a'],
    ['#8fdc5a', '#3fa63a', '#1a5f26'],
    ['#b6ee72', '#58bd44', '#24762f'],
  ];
  const NB = 36;
  for (let i = 0; i < NB; i++) {
    const a = hs(i, 1) * TAU;
    const d = Math.sqrt(hs(i, 2)) * Rc * (i < NB * 0.45 ? 0.55 : 0.88);
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d * 0.82;
    const rr = Rc * (0.2 + hs(i, 3) * 0.17);
    const pal = greens[(i + (hs(i, 4) > 0.5 ? 1 : 0)) % greens.length];
    const gr = g.createRadialGradient(x - rr * 0.3, y - rr * 0.35, rr * 0.1, x, y, rr);
    gr.addColorStop(0, pal[0]);
    gr.addColorStop(0.55, pal[1]);
    gr.addColorStop(1, pal[2]);
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
  }
  // ورق فاتح متفرق
  for (let i = 0; i < 150; i++) {
    const a = hs(i, 6) * TAU;
    const d = Math.sqrt(hs(i, 7)) * Rc * 0.95;
    g.fillStyle = `rgba(${150 + hs(i, 8) * 60},${220 + hs(i, 9) * 30},${80 + hs(i, 10) * 40},${0.35 + hs(i, 11) * 0.4})`;
    g.beginPath(); g.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.82, 2 + hs(i, 12) * 3, 1.2 + hs(i, 13) * 2, hs(i, 14) * 3, 0, TAU); g.fill();
  }
  // زهر على الشجرة
  const bl = ['#ffc2d9', '#ffffff', '#ffe27a', '#ffa3c7'];
  for (let i = 0; i < 26; i++) {
    const a = hs(i, 16) * TAU;
    const d = Math.sqrt(hs(i, 17)) * Rc * 0.92;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.82;
    g.fillStyle = bl[i % bl.length];
    g.beginPath(); g.arc(x, y, 2.4 + hs(i, 18) * 2.4, 0, TAU); g.fill();
    g.fillStyle = '#ffd23f';
    g.beginPath(); g.arc(x, y, 1, 0, TAU); g.fill();
  }
  return L.cv;
}

// خلفية الحديقة: تلال وشجيرات بعيدة
function buildBack(W: number, H: number, GY: number, dpr: number): HTMLCanvasElement {
  const L = makeLayer(W, H, dpr);
  const g = L.g;
  if (!g) return L.cv;
  const hill = (base: number, a1: number, a2: number, c1: string, c2: string, ph: number) => {
    const gr = g.createLinearGradient(0, GY - H * base - H * a1, 0, GY + H * 0.05);
    gr.addColorStop(0, c1);
    gr.addColorStop(1, c2);
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W + 10; x += 10) {
      g.lineTo(x, GY - H * base + Math.sin(x * 0.011 + ph) * H * a1 + Math.sin(x * 0.027 + ph * 2) * H * a2);
    }
    g.lineTo(W, H);
    g.closePath();
    g.fill();
  };
  hill(0.12, 0.03, 0.01, 'rgba(150,226,120,.85)', 'rgba(96,190,84,.85)', 1.2);
  hill(0.06, 0.022, 0.008, 'rgba(98,196,86,.95)', 'rgba(60,160,62,.95)', 3.4);
  // شجيرات
  for (let i = 0; i < 9; i++) {
    const x = hash(i, 31) * W;
    const y = GY - H * (0.02 + hash(i, 32) * 0.03);
    const rr = Math.max(14, W * (0.04 + hash(i, 33) * 0.04));
    for (let k = 0; k < 4; k++) {
      const gr = g.createRadialGradient(x + (k - 1.5) * rr * 0.7 - rr * 0.2, y - rr * 0.5, rr * 0.1, x + (k - 1.5) * rr * 0.7, y - rr * 0.3, rr);
      gr.addColorStop(0, '#8ee05a');
      gr.addColorStop(1, '#2f8f35');
      g.fillStyle = gr;
      g.beginPath(); g.arc(x + (k - 1.5) * rr * 0.7, y - rr * 0.3 - (k % 2) * rr * 0.2, rr * (0.75 + (k % 2) * 0.15), 0, TAU); g.fill();
    }
    for (let k = 0; k < 5; k++) {
      g.fillStyle = FLOWER_COLS[(i + k) % FLOWER_COLS.length];
      g.beginPath(); g.arc(x + (hash(i * 7 + k, 34) - 0.5) * rr * 3, y - rr * (0.2 + hash(i * 7 + k, 35) * 0.8), 2.2, 0, TAU); g.fill();
    }
  }
  return L.cv;
}

// أرض العشب الأمامية
function buildFront(W: number, H: number, GY: number, dpr: number): HTMLCanvasElement {
  const L = makeLayer(W, H, dpr);
  const g = L.g;
  if (!g) return L.cv;
  const gr = g.createLinearGradient(0, GY - 6, 0, H);
  gr.addColorStop(0, '#5fc24c');
  gr.addColorStop(0.3, '#3f9d3b');
  gr.addColorStop(1, '#1f6428');
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(0, H);
  for (let x = 0; x <= W + 8; x += 8) g.lineTo(x, GY + Math.sin(x * 0.035) * 3 + hash(x, 7) * 2);
  g.lineTo(W, H);
  g.closePath();
  g.fill();
  // بقع ضوء وظل
  for (let i = 0; i < 22; i++) {
    const x = hash(i, 41) * W;
    const y = GY + 8 + hash(i, 42) * (H - GY);
    g.fillStyle = i % 2 ? 'rgba(160,240,110,.18)' : 'rgba(10,70,20,.18)';
    g.beginPath(); g.ellipse(x, y, 16 + hash(i, 43) * 26, 3 + hash(i, 44) * 5, 0, 0, TAU); g.fill();
  }
  return L.cv;
}

// ═══════════════════════════════════════════════════════════════════════
//  رسم عصفور / فراشة
// ═══════════════════════════════════════════════════════════════════════
function drawBird(c: Ctx, x: number, y: number, s: number, flap: number, dir: number, pal: { col: string; belly: string; wing: string }) {
  const f = Math.sin(flap);
  c.save();
  c.translate(x, y);
  c.scale(s * dir, s);
  c.fillStyle = pal.wing;
  c.beginPath(); c.moveTo(-8, 0); c.lineTo(-17, -3); c.lineTo(-16, 2); c.closePath(); c.fill();
  c.fillStyle = pal.col;
  c.beginPath(); c.ellipse(0, 0, 9, 5.2, 0, 0, TAU); c.fill();
  c.fillStyle = pal.belly;
  c.beginPath(); c.ellipse(1, 2, 6.5, 3, 0, 0, TAU); c.fill();
  c.fillStyle = pal.col;
  c.beginPath(); c.arc(8, -2.6, 4.2, 0, TAU); c.fill();
  c.fillStyle = '#ffb02e';
  c.beginPath(); c.moveTo(11.6, -3.2); c.lineTo(16, -2); c.lineTo(11.6, -1); c.closePath(); c.fill();
  c.fillStyle = '#10151a';
  c.beginPath(); c.arc(9.4, -3.2, 0.9, 0, TAU); c.fill();
  c.fillStyle = pal.wing;
  c.beginPath();
  c.moveTo(-4, -1);
  c.quadraticCurveTo(-2, -16 * f, 8, -9 * f - 1);
  c.quadraticCurveTo(4, -2, 2, 1);
  c.closePath();
  c.fill();
  c.restore();
}

function drawButterfly(c: Ctx, x: number, y: number, s: number, flap: number, c1: string, c2: string) {
  const w = Math.abs(Math.sin(flap)) * 0.9 + 0.1;
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  for (const m of [-1, 1]) {
    c.save();
    c.scale(m * w, 1);
    c.fillStyle = c1;
    c.beginPath(); c.ellipse(5, -4, 6, 8, -0.5, 0, TAU); c.fill();
    c.fillStyle = c2;
    c.beginPath(); c.ellipse(4, 5, 4.5, 5.5, 0.5, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,.55)';
    c.beginPath(); c.arc(6, -5, 1.6, 0, TAU); c.fill();
    c.restore();
  }
  c.strokeStyle = '#3a2a22';
  c.lineWidth = 1.6;
  c.lineCap = 'round';
  c.beginPath(); c.moveTo(0, -7); c.lineTo(0, 8); c.stroke();
  c.beginPath(); c.moveTo(0, -7); c.lineTo(-3, -11); c.moveTo(0, -7); c.lineTo(3, -11); c.stroke();
  c.restore();
}

function rrect(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

// ═══════════════════════════════════════════════════════════════════════
//  مواقع صاحب البث / المستخدم المستلم
// ═══════════════════════════════════════════════════════════════════════
interface LiftAv {
  sx: number; sy: number; sr: number;
  img: HTMLImageElement | null; letter: string; name: string;
  restore: () => void; done?: boolean;
}
interface LiftInfo { userId: string; name?: string; avatarUrl?: string | null }
interface Hot { el: Element; x: number; y: number; w: number; h: number; rad: number; heat: number; ci: number }

// وضع المستخدم: الهدية لمتحدث → معلوماته يحطها LiveCoinsDock في window.__stooornaGiftLift
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
    if (hasEl) el!.style.opacity = '0.12';      // تخفت صورته الأصلية طول مدة الهدية (مثل البركان)
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

// ═══════════════════════════════════════════════════════════════════════
//  الأنميشن الكامل (ملء الشاشة)
// ═══════════════════════════════════════════════════════════════════════
interface Heart {
  c: number; x: number; y: number; r: number;
  x0: number; vx: number; vy: number;
  rot: number; swA: number; swF: number; ph: number;
  st: 0 | 1 | 2;                 // 0 يسقط ، 1 نازل على زر/عشب ، 2 يختفي
  el: Element | null; offX: number;
  landT: number; stay: number; fadeT: number;
  skip: Element | null; bounced: boolean; gOff: number;
  beatPh: number; age: number;
}
interface Part { k: 0 | 1 | 2; x: number; y: number; vx: number; vy: number; g: number; size: number; life: number; age: number; rot: number; vr: number; ci: number }
interface Ring { x: number; y: number; born: number; dur: number; maxR: number; ci: number }

function GardenAnimation({ onDone }: { onDone: () => void }) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const cvRef = useRef<HTMLCanvasElement>(null);
  const bdRef = useRef<HTMLDivElement>(null);
  const tintRef = useRef<HTMLDivElement>(null);

  const [{ W, H }] = useState(() => ({
    W: typeof window !== 'undefined' ? window.innerWidth : 360,
    H: typeof window !== 'undefined' ? window.innerHeight : 640,
  }));

  useEffect(() => {
    const cv = cvRef.current;
    const bd = bdRef.current;
    const tint = tintRef.current;
    if (!cv || !bd || !tint) return;
    const c = cv.getContext('2d');
    if (!c) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);

    const U = clamp(Math.min(W / 390, H / 760), 0.7, 1.5);
    const GY = H * 0.9;                          // خط العشب
    const cx = W / 2;
    const R = clamp(W * 0.16, 40, 66);

    // الوضع: دعم لمستخدم (إطار يصعد ويتحول لقلب) أو لصاحب البث
    const liftInfo0 = getLiftInfo();
    const mode: 'host' | 'user' = liftInfo0 ? 'user' : 'host';
    let liftPre: HTMLImageElement | null = null;
    if (liftInfo0 && liftInfo0.avatarUrl) {
      try { liftPre = new Image(); liftPre.src = String(liftInfo0.avatarUrl); } catch { liftPre = null; }
    }
    let lift: LiftAv | null = null;

    // ── الأصول (تُبنى مرة واحدة) ──
    const SPR = PALS.map(renderHeartSprite);
    const GLW = PALS.map(p => makeSprite(p.glow, 0.25));
    const GL_SUN = makeSprite('255,240,170', 0.2);
    const tw = W * 0.46, th = H * 0.62;
    const treeL = buildTree(tw, th, 3, dpr);
    const treeR = buildTree(tw * 0.9, th * 0.9, 9, dpr);
    const back = buildBack(W, H, GY, dpr);
    const front = buildFront(W, H, GY, dpr);

    const blob = (sp: HTMLCanvasElement, x: number, y: number, r: number, a: number) => {
      if (a <= 0.003 || r <= 0.2) return;
      c.globalAlpha = Math.min(1, a);
      c.drawImage(sp, x - r, y - r, r * 2, r * 2);
    };
    const drawHeart = (ci: number, x: number, y: number, r: number, rot: number, pulse: number, alpha: number) => {
      if (alpha <= 0.01 || r < 1) return;
      const k = (r / SP_R) * (1 + pulse * 0.16);
      c.save();
      c.translate(x, y);
      c.rotate(rot);
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = alpha * (0.2 + pulse * 0.4);
      const gr = r * 2.6;
      c.drawImage(GLW[ci], -gr, -gr, gr * 2, gr * 2);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = alpha;
      c.drawImage(SPR[ci], -SP_OX * k, -SP_OY * k, SP_W * k, SP_H * k);
      c.restore();
    };

    // ── عناصر الحديقة ──
    const blades = Array.from({ length: 150 }, (_, i) => ({
      x: (i / 150) * (W + 20) - 10 + (hash(i, 51) - 0.5) * 8,
      h: (8 + hash(i, 52) * 20) * U,
      ph: hash(i, 53) * TAU,
      row: i % 3 === 0 ? 1 : 0,
      shade: (hash(i, 54) * 3) | 0,
    }));
    const bladeCols = ['#2f9a3c', '#48b84a', '#79d85a'];
    const flowers = Array.from({ length: 26 }, (_, i) => ({
      x: hash(i, 61) * W,
      dy: (3 + hash(i, 62) * (H - GY) * 0.85),
      h: (14 + hash(i, 63) * 20) * U,
      s: (4 + hash(i, 64) * 3.2) * U,
      col: FLOWER_COLS[i % FLOWER_COLS.length],
      ph: hash(i, 65) * TAU,
      pet: 5 + ((hash(i, 66) * 3) | 0),
    }));
    const leaves = Array.from({ length: 30 }, (_, i) => ({
      x0: hash(i, 71) * W, y0: hash(i, 72) * H, sp: (14 + hash(i, 73) * 26) * U,
      f: 0.6 + hash(i, 74) * 1.2, amp: (10 + hash(i, 75) * 26) * U, ph: hash(i, 76) * TAU,
      s: (2.6 + hash(i, 77) * 3.2) * U, leaf: hash(i, 78) > 0.55, col: PETAL_COLS[i % PETAL_COLS.length],
    }));
    const flyers = [
      { t: 1.4, dur: 5.2, y: H * 0.16, amp: H * 0.03, dir: 1, s: 1.15, p: 0 },
      { t: 4.4, dur: 5.6, y: H * 0.24, amp: H * 0.04, dir: -1, s: 1.3, p: 1 },
      { t: 7.8, dur: 5.0, y: H * 0.12, amp: H * 0.03, dir: 1, s: 1.0, p: 2 },
      { t: 10.8, dur: 5.4, y: H * 0.2, amp: H * 0.05, dir: -1, s: 1.2, p: 3 },
      { t: 13.2, dur: 4.6, y: H * 0.15, amp: H * 0.03, dir: 1, s: 1.1, p: 1 },
    ];
    const butter = [
      { cx: W * 0.28, cy: H * 0.64, rx: W * 0.14, ry: H * 0.05, sp: 0.5, ph: 0, c1: '#ff9ad5', c2: '#ffd93b' },
      { cx: W * 0.72, cy: H * 0.55, rx: W * 0.16, ry: H * 0.06, sp: 0.42, ph: 2, c1: '#8fc6ff', c2: '#ffffff' },
      { cx: W * 0.5, cy: H * 0.7, rx: W * 0.2, ry: H * 0.04, sp: 0.36, ph: 4, c1: '#ffd93b', c2: '#ff9a3d' },
    ];

    // ── الحالة ──
    const hearts: Heart[] = [];
    const parts: Part[] = [];
    const rings: Ring[] = [];
    let hot: Hot[] = [];
    let hotMap = new Map<Element, Hot>();
    let hotAt = -10;
    let bag: number[] = [];
    let acc = 0;
    const fired: Record<string, boolean> = {};
    const once = (key: string, cond: boolean, fn: () => void) => { if (cond && !fired[key]) { fired[key] = true; fn(); } };
    const nextColor = () => {
      if (!bag.length) bag = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
      return bag.pop() as number;
    };

    // الصوت
    const snd = playGardenSound({
      totalS: TOTAL_S,
      mode,
      fadeInS: GARDEN_IN_S + 0.4,
      fadeOutAt: GARDEN_OUT_AT,
      liftAt: LIFT_AT,
      morphAt: MORPH_AT,
      downAt: DOWN_AT,
    });

    // ── جسيمات ──
    const addPart = (p: Part) => { if (parts.length < MAX_PARTS) parts.push(p); };
    const sparkle = (x: number, y: number, n: number, ci: number, sp: number) => {
      for (let i = 0; i < n; i++) {
        const a = rnd(0, TAU);
        addPart({ k: 0, x, y, vx: Math.cos(a) * sp * rnd(0.3, 1), vy: Math.sin(a) * sp * rnd(0.3, 1) - 30 * U, g: 120 * U, size: rnd(5, 11) * U, life: rnd(0.45, 0.95), age: 0, rot: 0, vr: 0, ci });
      }
    };
    const petals = (x: number, y: number, n: number, sp: number) => {
      for (let i = 0; i < n; i++) {
        const a = rnd(-Math.PI, 0);
        addPart({ k: 1, x, y, vx: Math.cos(a) * sp * rnd(0.3, 1), vy: Math.sin(a) * sp * rnd(0.4, 1), g: 260 * U, size: rnd(2.4, 4.6) * U, life: rnd(0.8, 1.5), age: 0, rot: rnd(0, TAU), vr: rnd(-6, 6), ci: (Math.random() * PETAL_COLS.length) | 0 });
      }
    };
    const miniHearts = (x: number, y: number, n: number, sp: number) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rnd(-0.2, 0.2);
        addPart({ k: 2, x, y, vx: Math.cos(a) * sp * rnd(0.6, 1), vy: Math.sin(a) * sp * rnd(0.6, 1) - 60 * U, g: 520 * U, size: rnd(5, 9) * U, life: rnd(1.1, 1.8), age: 0, rot: rnd(-0.4, 0.4), vr: rnd(-3, 3), ci: i % 4 });
      }
    };

    // ── تجميع الأزرار التي تنزل عليها القلوب ──
    const topAt = (h: Hot, x: number): number | null => {
      const lx = x - h.x;
      if (lx < 0 || lx > h.w) return null;
      const r = h.rad;
      if (r > 0 && lx < r) { const dx = r - lx; return h.y + r - Math.sqrt(Math.max(0, r * r - dx * dx)); }
      if (r > 0 && lx > h.w - r) { const dx = lx - (h.w - r); return h.y + r - Math.sqrt(Math.max(0, r * r - dx * dx)); }
      return h.y;
    };
    const collectHot = (prev: Hot[]): Hot[] => {
      const old = new Map<Element, Hot>();
      prev.forEach(p => old.set(p.el, p));
      const out: Hot[] = [];
      try {
        document.querySelectorAll<HTMLElement>(HOT_SEL).forEach(el => {
          if (out.length >= 90 || el.closest('[data-gift-overlay]') || el.hasAttribute('data-gift-lift')) return;
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return;
          const r = el.getBoundingClientRect();
          if (r.width < 14 || r.height < 14 || r.bottom < 0 || r.top > H - 4 || r.right < 0 || r.left > W) return;
          if (r.width > W * 0.92 && r.height > H * 0.3) return;
          let rad = parseFloat(cs.borderTopLeftRadius) || 0;
          if (cs.borderTopLeftRadius.endsWith('%')) rad = (rad / 100) * Math.min(r.width, r.height);
          rad = Math.min(rad, r.width / 2, r.height / 2);
          const o = old.get(el);
          out.push({ el, x: r.left, y: r.top, w: r.width, h: r.height, rad, heat: o ? o.heat : 0, ci: o ? o.ci : 0 });
        });
      } catch { /* ignore */ }
      return out;
    };

    // ── قلب جديد ──
    const spawnHeart = (yStagger = 0) => {
      if (hearts.length >= MAX_HEARTS) return;
      const r = rnd(10, 18) * U;
      const x0 = rnd(W * 0.04, W * 0.96);
      hearts.push({
        c: nextColor(), x: x0, y: -r * 2 - yStagger, r,
        x0, vx: 0, vy: rnd(40, 110) * U,
        rot: 0, swA: rnd(8, 26) * U, swF: rnd(1.2, 2.4), ph: rnd(0, TAU),
        st: 0, el: null, offX: 0,
        landT: 0, stay: 0, fadeT: 0,
        skip: null, bounced: false, gOff: rnd(-2, 14) * U,
        beatPh: rnd(0, 1), age: 0,
      });
    };

    let raf = 0;
    const t0 = performance.now();
    let last = t0;

    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const outK = 1 - smooth((t - GARDEN_OUT_AT) / GARDEN_OUT_S);
      const gI = smooth((t - GARDEN_IN_AT) / GARDEN_IN_S) * outK;
      const gE = easeOut((t - GARDEN_IN_AT) / GARDEN_IN_S) * outK;
      bd.style.opacity = String(gI * 0.9);
      tint.style.opacity = String(gI);
      const off = (1 - gE) * H * 0.5;
      const offTop = (1 - gE) * H * 0.2;

      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
      c.clearRect(0, 0, W, H);

      // ── شمس وأشعة ──
      if (gI > 0.01) {
        c.globalCompositeOperation = 'lighter';
        blob(GL_SUN, W * 0.1, -H * 0.02 - offTop, W * 0.85, 0.5 * gI);
        c.globalAlpha = 0.07 * gI;
        c.fillStyle = '#fff2b0';
        for (let i = 0; i < 6; i++) {
          const a = 0.35 + i * 0.2 + Math.sin(t * 0.3 + i) * 0.03;
          c.beginPath();
          c.moveTo(W * 0.1, -H * 0.02 - offTop);
          c.lineTo(W * 0.1 + Math.cos(a - 0.05) * H * 1.3, -H * 0.02 - offTop + Math.sin(a - 0.05) * H * 1.3);
          c.lineTo(W * 0.1 + Math.cos(a + 0.05) * H * 1.3, -H * 0.02 - offTop + Math.sin(a + 0.05) * H * 1.3);
          c.closePath();
          c.fill();
        }
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = 1;
      }

      // ── خلفية (تلال) + أشجار ──
      c.globalAlpha = gI;
      c.drawImage(back, 0, off * 0.9, W, H);
      c.globalAlpha = 1;
      if (gE > 0.01) {
        const sw = Math.sin(t * 0.9) * 0.012;
        c.save();
        c.globalAlpha = Math.min(1, gE * 1.2);
        c.translate(-tw * 0.26 + tw * 0.5, GY + H * 0.03 + off);
        c.rotate(sw);
        c.drawImage(treeL, -tw * 0.5, -th, tw, th);
        c.restore();
        c.save();
        c.globalAlpha = Math.min(1, gE * 1.2);
        c.translate(W + tw * 0.2 - tw * 0.45 + tw * 0.45, GY + H * 0.025 + off);
        c.scale(-1, 1);
        c.rotate(Math.sin(t * 0.8 + 1.7) * 0.012);
        c.drawImage(treeR, -tw * 0.45, -th * 0.9, tw * 0.9, th * 0.9);
        c.restore();
        c.globalAlpha = 1;
      }

      // ── فراشات ──
      if (gE > 0.3) {
        for (const b of butter) {
          const px = b.cx + Math.sin(t * b.sp + b.ph) * b.rx;
          const py = b.cy + Math.sin(t * b.sp * 1.7 + b.ph) * b.ry;
          c.globalAlpha = clamp01((gE - 0.3) * 2);
          drawButterfly(c, px, py + off * 0.2, 0.9 * U, t * 14 + b.ph, b.c1, b.c2);
        }
        c.globalAlpha = 1;
      }

      // ── عصافير تعبر ──
      for (const b of flyers) {
        const u = (t - b.t) / b.dur;
        if (u < 0 || u > 1) continue;
        const bx = b.dir > 0 ? lerp(-W * 0.1, W * 1.1, u) : lerp(W * 1.1, -W * 0.1, u);
        drawBird(c, bx, b.y + Math.sin(u * 9) * b.amp, b.s * U * 0.95, t * 20 + b.p, b.dir, BIRD_COLS[b.p % BIRD_COLS.length]);
      }

      // ── تحديث الأزرار ──
      if (t >= RAIN_START - 0.4 && t - hotAt > 0.3 && (t < RAIN_END + 4 || hearts.length > 0)) {
        hot = collectHot(hot);
        hotMap = new Map(hot.map(h => [h.el, h]));
        hotAt = t;
      }

      // ── صورة المتحدث تصعد وإطارها يتحول لقلب ──
      if (mode === 'user') {
        if (!lift && t >= LIFT_AT - 0.5) lift = findLiftAv(W, H, liftPre);
        if (lift) {
          const L = lift;
          const ex = cx, ey = H * 0.42;
          const up = easeOut((t - LIFT_AT) / LIFT_S);
          const down = smooth((t - DOWN_AT) / DOWN_S);
          const e2 = up * (1 - down);
          if (down >= 1 && !L.done) { L.done = true; L.restore(); }
          if (e2 > 0.004) {
            const m = smooth((t - MORPH_AT) / MORPH_S) * (1 - smooth((t - (DOWN_AT - 0.3)) / 0.8));
            const ax = lerp(L.sx, ex, e2);
            const ay = lerp(L.sy, ey, e2) + Math.sin(t * 2.4) * 3 * U * e2;
            const ar = lerp(L.sr, R, e2);
            const beatD = ((t - MORPH_AT) % BEAT_PERIOD + BEAT_PERIOD) % BEAT_PERIOD;
            const beat = m > 0.05 ? beatC(beatD) : 0;
            const sc = 1 + beat * 0.06 * m;

            // توهج ملون يدور حول الإطار
            c.globalCompositeOperation = 'lighter';
            for (let k = 0; k < 4; k++) {
              const a = t * 0.8 + (k * TAU) / 4;
              blob(GLW[k], ax + Math.cos(a) * ar * 1.3 * m, ay + Math.sin(a) * ar * 1.1 * m - ar * 0.2 * m, ar * (1.2 + 0.5 * m), (0.2 + 0.12 * beat) * e2 * (0.4 + 0.6 * m));
            }
            blob(GLW[0], ax, ay, ar * 2.4, 0.2 * e2);
            c.globalCompositeOperation = 'source-over';
            c.globalAlpha = 1;

            // أوعية القلب الكبيرة تطلع من أعلى الإطار
            if (m > 0.35) {
              const va = clamp01((m - 0.35) / 0.5) * e2;
              c.save();
              c.globalAlpha = va;
              c.lineCap = 'round';
              const tubeP = (path: () => void, w: number, dark: string, light: string) => {
                c.beginPath(); path(); c.strokeStyle = 'rgba(20,0,5,.85)'; c.lineWidth = w + 3; c.stroke();
                c.beginPath(); path(); c.strokeStyle = dark; c.lineWidth = w; c.stroke();
                c.beginPath(); path(); c.strokeStyle = light; c.lineWidth = w * 0.6; c.stroke();
              };
              const sy0 = ay - 0.8 * ar * sc;
              tubeP(() => { c.moveTo(ax + 0.5 * ar, sy0 + 0.1 * ar); c.lineTo(ax + 0.54 * ar, ay - 1.9 * ar * sc); }, ar * 0.22, PALS[2].vBd, PALS[2].vB);
              tubeP(() => { c.moveTo(ax + 0.12 * ar, sy0); c.bezierCurveTo(ax + 0.2 * ar, ay - 2.1 * ar * sc, ax - 0.55 * ar, ay - 2.2 * ar * sc, ax - 0.62 * ar, ay - 1.55 * ar * sc); }, ar * 0.3, PALS[0].vAd, PALS[0].vA);
              tubeP(() => { c.moveTo(ax - 0.2 * ar, sy0); c.bezierCurveTo(ax - 0.3 * ar, ay - 1.5 * ar * sc, ax - 0.9 * ar, ay - 1.65 * ar * sc, ax - 1.1 * ar, ay - 1.3 * ar * sc); }, ar * 0.22, PALS[2].vBd, PALS[2].vB);
              c.restore();
            }

            // الإطار: دائرة ← قلب بشري
            {
              const N = 120;
              const sH = ar / 9.5;
              const e = smooth(m);
              const px: number[] = [];
              const py: number[] = [];
              for (let i = 0; i <= N; i++) {
                const a = (i / N) * TAU;
                const rc = ar * 1.14;
                const cxp = Math.sin(a) * rc;
                const cyp = -Math.cos(a) * rc;
                const sn = Math.sin(a);
                const hxp = 16 * sn * sn * sn * sH;
                const hyp = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) * sH - 2 * sH;
                px.push(ax + lerp(cxp, hxp, e) * sc);
                py.push(ay + lerp(cyp, hyp, e) * sc);
              }
              const path = () => { c.beginPath(); for (let i = 0; i <= N; i++) { if (i) c.lineTo(px[i], py[i]); else c.moveTo(px[i], py[i]); } c.closePath(); };
              const lw = Math.max(3, ar * 0.14);
              c.save();
              c.lineJoin = 'round';
              c.lineCap = 'round';
              c.globalAlpha = e2;
              c.globalCompositeOperation = 'lighter';
              path(); c.strokeStyle = `rgba(255,170,200,${0.22 + 0.2 * beat})`; c.lineWidth = lw * 2.6; c.stroke();
              c.globalCompositeOperation = 'source-over';
              path(); c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = lw + 3; c.stroke();
              for (let i = 0; i < N; i++) {
                const idx = Math.floor((i / N) * 8 + t * 1.3) & 3;
                c.beginPath(); c.moveTo(px[i], py[i]); c.lineTo(px[i + 1], py[i + 1]);
                c.strokeStyle = PALS[idx].css; c.lineWidth = lw; c.stroke();
              }
              path(); c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = Math.max(1, lw * 0.18); c.stroke();
              c.restore();
            }

            // الصورة نفسها داخل الإطار
            c.save();
            c.globalAlpha = clamp01(e2 * 3);
            c.beginPath();
            c.arc(ax, ay, ar, 0, TAU);
            c.closePath();
            c.save();
            c.clip();
            let drawn = false;
            if (!L.img && liftPre && liftPre.complete && liftPre.naturalWidth > 0) L.img = liftPre;
            if (L.img && L.img.complete && L.img.naturalWidth > 0) {
              try {
                const iw = L.img.naturalWidth, ih = L.img.naturalHeight, ss = Math.min(iw, ih);
                c.drawImage(L.img, (iw - ss) / 2, (ih - ss) / 2, ss, ss, ax - ar, ay - ar, ar * 2, ar * 2);
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
            c.arc(ax, ay, ar, 0, TAU);
            c.lineWidth = Math.max(2, ar * 0.06);
            c.strokeStyle = 'rgba(255,255,255,0.9)';
            c.stroke();
            c.restore();

            // اسم المستلم تحت القلب
            if (e2 > 0.5) {
              c.save();
              c.globalAlpha = clamp01((e2 - 0.5) * 2);
              c.font = `800 ${Math.round(Math.max(12, ar * 0.3))}px sans-serif`;
              c.textAlign = 'center';
              c.textBaseline = 'top';
              c.shadowColor = 'rgba(0,0,0,0.9)';
              c.shadowBlur = 6;
              c.fillStyle = '#fff4f8';
              c.fillText(L.name.length > 18 ? L.name.slice(0, 17) + '…' : L.name, ax, ay + ar * (1.2 + 0.45 * m) + 8 * U);
              c.restore();
            }
            c.globalAlpha = 1;

            // انفجار قلوب صغيرة + موجات عند اكتمال التحول
            once('morphBurst', t >= MORPH_AT + MORPH_S * 0.7, () => {
              miniHearts(ax, ay - ar * 0.2, 16, 260 * U);
              sparkle(ax, ay, 26, 0, 240 * U);
              for (let k = 0; k < 4; k++) rings.push({ x: ax, y: ay, born: t + k * 0.12, dur: 1.0, maxR: ar * 3.2, ci: k });
              snd.burst();
            });
            // موجة ملونة مع كل نبضة
            if (m > 0.9 && beatD < dt + 0.001) rings.push({ x: ax, y: ay, born: t, dur: 0.8, maxR: ar * 2.4, ci: Math.floor(t / BEAT_PERIOD) & 3 });
          }
        }
      }

      // ── تساقط القلوب ──
      if (t >= RAIN_START && t <= RAIN_END) {
        const env = smooth((t - RAIN_START) / 2.5) * (1 - smooth((t - (RAIN_END - 2.5)) / 2.5));
        acc += RAIN_RATE * env * dt;
        while (acc >= 1) { acc -= 1; spawnHeart(); }
      }
      WAVES.forEach((w, wi) => once(`wave${wi}`, t >= w, () => { for (let i = 0; i < 8; i++) spawnHeart(i * rnd(18, 46) * U); }));

      // ── تحديث القلوب ──
      for (let i = hearts.length - 1; i >= 0; i--) {
        const h = hearts[i];
        h.age += dt;
        if (h.st === 0) {
          const prevB = h.y + h.r * 0.92;
          h.vy = Math.min(h.vy + 520 * U * dt, 340 * U);
          h.y += h.vy * dt;
          h.x0 += h.vx * dt;
          h.vx *= Math.max(0, 1 - 1.6 * dt);
          h.x = h.x0 + Math.sin(h.age * h.swF + h.ph) * h.swA;
          h.rot = Math.sin(h.age * h.swF * 0.8 + h.ph) * 0.35;
          const bot = h.y + h.r * 0.92;

          // هل نزل على زر؟
          let best: Hot | null = null;
          let bestTop = 1e9;
          for (const ho of hot) {
            if (ho.el === h.skip) continue;
            if (h.x < ho.x + 2 || h.x > ho.x + ho.w - 2) continue;
            const tp = topAt(ho, h.x);
            if (tp === null) continue;
            if (prevB <= tp + 2 && bot >= tp && tp < bestTop) { best = ho; bestTop = tp; }
          }
          const groundY = GY + off + h.gOff;
          if (best) {
            let cnt = 0;
            for (const o of hearts) if (o.st === 1 && o.el === best.el) cnt++;
            const cap = Math.max(1, Math.min(5, Math.floor(best.w / (h.r * 1.7))));
            if (cnt >= cap) {
              h.skip = best.el;
              h.vx += (h.x < best.x + best.w / 2 ? -1 : 1) * rnd(90, 160) * U;
            } else {
              h.st = 1;
              h.el = best.el;
              h.offX = clamp(h.x - best.x, Math.min(h.r * 0.6, best.w / 2), Math.max(best.w - h.r * 0.6, best.w / 2));
              h.x = best.x + h.offX;
              h.y = bestTop - h.r * 0.88;
              h.rot = rnd(-0.15, 0.15);
              h.landT = t;
              h.stay = rnd(HEART_STAY_MIN, HEART_STAY_MAX);
              best.heat = 1;
              best.ci = h.c;
              sparkle(h.x, bestTop, 7, h.c, 140 * U);
              petals(h.x, bestTop, 3, 120 * U);
              snd.land(h.c, h.r / (18 * U));
            }
          } else if (bot >= groundY) {
            if (!h.bounced) {
              h.bounced = true;
              h.vy = -Math.abs(h.vy) * 0.35;
              h.vx += rnd(-40, 40) * U;
              h.y = groundY - h.r * 0.92;
              snd.land(h.c, h.r / (18 * U));
              sparkle(h.x, groundY, 4, h.c, 100 * U);
            } else if (h.vy > 0) {
              h.st = 1;
              h.el = null;
              h.rot = rnd(-0.3, 0.3);
              h.landT = t;
              h.stay = rnd(1.5, 2.6);
              h.y = groundY - h.r * 0.6;
            }
          }
        } else if (h.st === 1) {
          if (h.el) {
            const ho = hotMap.get(h.el);
            if (!ho) { h.st = 0; h.el = null; h.vy = 0; h.skip = null; }
            else {
              h.x = ho.x + h.offX;
              const tp = topAt(ho, h.x);
              h.y = (tp === null ? ho.y : tp) - h.r * 0.88;
            }
          } else {
            h.y = GY + off + h.gOff - h.r * 0.6;
          }
          if (h.st === 1 && t - h.landT > h.stay) {
            h.st = 2;
            h.fadeT = t;
            sparkle(h.x, h.y, 9, h.c, 170 * U);
          }
        } else if (t - h.fadeT > 0.55) {
          hearts[i] = hearts[hearts.length - 1];
          hearts.pop();
        }
      }

      // ── توهج الأزرار التي نزل عليها قلب ──
      for (const ho of hot) {
        if (ho.heat <= 0.01) continue;
        ho.heat = Math.max(0, ho.heat - dt * 0.6);
        c.save();
        rrect(c, ho.x - 1, ho.y - 1, ho.w + 2, ho.h + 2, ho.rad + 1);
        c.strokeStyle = `rgba(${PALS[ho.ci].glow},${0.9 * ho.heat})`;
        c.lineWidth = 2.6 * U;
        c.shadowColor = `rgba(${PALS[ho.ci].glow},${ho.heat})`;
        c.shadowBlur = 14 * U * ho.heat;
        c.stroke();
        c.restore();
      }

      // ── رسم القلوب ──
      for (const h of hearts) {
        if (h.st === 0) {
          drawHeart(h.c, h.x, h.y, h.r, h.rot, beatC(((h.age * 1.1 + h.beatPh) % 1)) * 0.5, 1);
        } else if (h.st === 1) {
          drawHeart(h.c, h.x, h.y, h.r, h.rot, beatC((((t - h.landT) + h.beatPh) % 1)), 1);
        } else {
          const u = smooth((t - h.fadeT) / 0.55);
          drawHeart(h.c, h.x, h.y - u * 8 * U, h.r * (1 + 0.25 * u), h.rot, beatC((((t - h.landT) + h.beatPh) % 1)), 1 - u);
        }
      }
      c.globalAlpha = 1;

      // ── عشب وزهور أمامية ──
      c.globalAlpha = gI;
      c.drawImage(front, 0, off, W, H);
      c.globalAlpha = 1;
      if (gE > 0.02) {
        c.lineCap = 'round';
        for (let row = 0; row < 2; row++) {
          for (let sh = 0; sh < 3; sh++) {
            c.strokeStyle = bladeCols[sh];
            c.lineWidth = (row ? 2.8 : 2.2) * U;
            c.beginPath();
            for (const b of blades) {
              if (b.row !== row || b.shade !== sh) continue;
              const by = GY + off + (row ? (H - GY) * 0.16 : 3 * U);
              const hh = b.h * (row ? 1.5 : 1) * gE;
              const sway = Math.sin(t * 1.6 + b.x * 0.02 + b.ph) * 4.5 * U;
              c.moveTo(b.x, by);
              c.quadraticCurveTo(b.x + sway * 0.4, by - hh * 0.6, b.x + sway, by - hh);
            }
            c.stroke();
          }
        }
        for (const f of flowers) {
          const bx = f.x, by = GY + off + f.dy;
          const hh = f.h * gE;
          const sway = Math.sin(t * 1.3 + f.ph) * 3.5 * U;
          const tx = bx + sway, ty = by - hh;
          c.strokeStyle = '#2e8b3a';
          c.lineWidth = 2 * U;
          c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(bx + sway * 0.2, by - hh * 0.6, tx, ty); c.stroke();
          c.fillStyle = '#3aa845';
          c.beginPath(); c.ellipse(bx + sway * 0.2 + 3 * U, by - hh * 0.4, 4 * U, 1.8 * U, -0.6, 0, TAU); c.fill();
          c.fillStyle = f.col;
          for (let k = 0; k < f.pet; k++) {
            const a = (k / f.pet) * TAU + t * 0.1;
            c.beginPath(); c.ellipse(tx + Math.cos(a) * f.s * 0.8, ty + Math.sin(a) * f.s * 0.8, f.s * 0.62, f.s * 0.4, a, 0, TAU); c.fill();
          }
          c.fillStyle = f.col === '#ffd93b' ? '#ff8a3d' : '#ffd23f';
          c.beginPath(); c.arc(tx, ty, f.s * 0.42, 0, TAU); c.fill();
        }
      }

      // ── أوراق وبتلات تتطاير ──
      if (gI > 0.02) {
        for (const l of leaves) {
          const y = ((l.y0 + t * l.sp) % (H + 40)) - 20;
          const x = l.x0 + Math.sin(t * l.f + l.ph) * l.amp;
          c.globalAlpha = 0.85 * gI;
          c.fillStyle = l.leaf ? '#7fd957' : l.col;
          c.beginPath(); c.ellipse(x, y, l.s * 1.5, l.s * 0.8, t * l.f + l.ph, 0, TAU); c.fill();
        }
        c.globalAlpha = 1;
      }

      // ── موجات الإطار ──
      for (let i = rings.length - 1; i >= 0; i--) {
        const rg = rings[i];
        const u = (t - rg.born) / rg.dur;
        if (u < 0) continue;
        if (u >= 1) { rings.splice(i, 1); continue; }
        c.strokeStyle = `rgba(${PALS[rg.ci].glow},${0.7 * (1 - u)})`;
        c.lineWidth = 3 * U * (1 - u) + 1;
        c.beginPath(); c.arc(rg.x, rg.y, rg.maxR * easeOut(u), 0, TAU); c.stroke();
      }

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
        if (p.k === 0) {
          c.globalCompositeOperation = 'lighter';
          blob(GLW[p.ci], p.x, p.y, p.size, a * 0.9);
          c.globalCompositeOperation = 'source-over';
        } else if (p.k === 1) {
          c.globalAlpha = Math.min(1, a * 1.6);
          c.fillStyle = PETAL_COLS[p.ci % PETAL_COLS.length];
          c.beginPath(); c.ellipse(p.x, p.y, p.size * 1.4, p.size * 0.8, p.rot, 0, TAU); c.fill();
        } else {
          drawHeart(p.ci, p.x, p.y, p.size, p.rot, 0, Math.min(1, a * 1.5));
        }
      }
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';

      // نهاية الهدية: يرجع كل شيء لطبيعته
      if (lift && !lift.done && t >= TOTAL_S - 0.5) { lift.done = true; lift.restore(); }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const tDone = window.setTimeout(() => doneRef.current(), TOTAL_MS);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(tDone);
      snd.stop();
      if (lift && !lift.done) { lift.done = true; lift.restore(); }
    };
  }, [W, H]);

  return (
    <div
      aria-hidden="true"
      data-gift-overlay="1"
      style={{ position: 'fixed', inset: 0, zIndex: 9400, pointerEvents: 'none', overflow: 'hidden' }}
    >
      {/* تأثير على البث نفسه: ألوان زاهية مشمسة (يطبق على الفيديو والواجهة اللي خلفه) */}
      <div
        ref={bdRef}
        style={{ position: 'absolute', inset: 0, opacity: 0, backdropFilter: BD_FILTER, WebkitBackdropFilter: BD_FILTER }}
      />
      <div
        ref={tintRef}
        style={{
          position: 'absolute', inset: 0, opacity: 0,
          background: 'linear-gradient(180deg, rgba(255,246,190,0.22) 0%, rgba(140,235,150,0.07) 55%, rgba(40,150,70,0.16) 100%)',
        }}
      />
      <canvas ref={cvRef} style={{ position: 'absolute', inset: 0, width: W, height: H, pointerEvents: 'none' }} />
    </div>
  );
}

export const GardenGift: GiftDefinition = {
  id: 'garden',
  name: 'Garden',
  price: PRICE,
  durationMs: TOTAL_MS,
  Preview: GardenPreview,
  Animation: GardenAnimation,
};

export default GardenGift;
