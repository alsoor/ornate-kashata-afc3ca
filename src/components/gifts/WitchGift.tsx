/**
 * هدية الساحرة (Witch) — 250 Coins
 *
 * - Preview  : ساحرة جميلة بمكياج (رموش + ظل عيون بنفسجي + أحمر شفاه + خدود وردية) تتحرك داخل مربع الهدايا:
 *              تطفو، ترمش، قبعتها تتمايل، نجوم تلمع حولها، وبوسة صغيرة تطلع من فمها بين فترة وفترة.
 * - Animation: ساحرة تدخل وتمشي على بوكس الرسائل (مع صوت الحذاء مع كل خطوة)، تتوقف وتنظر للأعلى لصاحب البث،
 *              ترفع يدها وتبوسه (صوت بوسة ناعم)، ثم تخرج من فمها بوسات كثيرة تتناثر في البث وتسقط وتختفي.
 *
 * ملف مستقل: الأصوات في src/lib/witchSounds.ts. غيّر الأرقام تحت (السعر/المدد/التوقيتات/عدد البوسات).
 *
 * ربط الأنميشن بالواجهة (اختياري — يعمل تلقائياً بدونها):
 *   data-gift-walk : ضعه على بوكس الرسائل لو تبي الساحرة تمشي عليه بالتحديد.
 *                    (الافتراضي: أعرض input / textarea ظاهر في النصف السفلي من الشاشة)
 *   data-gift-host : ضعه على صورة/اسم صاحب البث لتنظر له وتوجّه له البوسة.
 *                    (الافتراضي: أعلى منتصف الشاشة)
 */
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { GiftDefinition } from '../../lib/types';
import { playWitchSound } from '../../lib/witchSounds';

// ── إعدادات الهدية ──────────────────────────────────────────────────────
const PRICE = 250;
const TOTAL_MS = 9800;       // مدة الأنميشن الكلية
const STEP_S = 0.42;         // الزمن بين خطوة وخطوة
const WALK_STEPS = 8;        // عدد الخطوات
const WALK_S = STEP_S * WALK_STEPS; // مدة المشي
const LOOK_AT = 3.5;         // تبدأ تنظر للأعلى
const LOOK_END = 6.7;        // ترجع تنظر قدامها
const RAISE_AT = 4.1;        // ترفع يدها
const PUCKER_AT = 4.4;       // تضم شفايفها للبوسة
const KISS_AT = 4.75;        // لحظة البوسة لصاحب البث
const FLY_S = 0.95;          // مدة طيران البوسة لصاحب البث
const ARM_DOWN_AT = 6.2;     // تنزل يدها
const BURST_AT = 5.3;        // تبدأ تطلع بوسات كثيرة من فمها
const BURST_S = 1.3;         // مدة خروجها
const LIPS_END = 6.6;        // ترجع تبتسم
const KISSES = 70;           // عدد البوسات المتناثرة
const GRAVITY = 1300;        // جاذبية سقوط البوسات (px/s² لشاشة ارتفاعها 700px)
const KISS_URL = '';         // مثال: '/sounds/kiss.mp3' (بوسة حقيقية مسجلة بدل المولَّدة)

const STEP_TIMES = Array.from({ length: WALK_STEPS }, (_, i) => 0.21 + i * STEP_S);

const HEART_PATH =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
const LIPS_PATH =
  'M2 12.5 C4.5 8.8 7.6 7.4 9.6 8.2 C10.6 8.6 11.3 9.2 12 9.2 C12.7 9.2 13.4 8.6 14.4 8.2 C16.4 7.4 19.5 8.8 22 12.5 C19.8 16.8 16 19 12 19 C8 19 4.2 16.8 2 12.5 Z';
const LIPS_LINE = 'M2 12.5 C6 13.8 9 13.6 12 12.8 C15 13.6 18 13.8 22 12.5';

const KISS_COLORS = ['#ff2d55', '#e11d48', '#fb7185', '#f43f5e', '#ff5c8a', '#d6336c'];

const WG_CSS = `
@keyframes wg-blink{0%,90%,100%{transform:scaleY(1)}94%{transform:scaleY(.08)}}
@keyframes wg-sway{0%,100%{transform:rotate(-1.6deg)}50%{transform:rotate(1.6deg)}}
.wg-blink{animation:wg-blink 4.2s infinite;transform-box:fill-box;transform-origin:50% 50%}
.wg-sway{animation:wg-sway 3s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 88%}
`;

// ── الرسم: رأس الساحرة (قبعة + شعر + وجه بمكياج) ──────────────────────────
function WitchHead({ uid, bust = false, autoBlink = false, sway = false }: {
  uid: string; bust?: boolean; autoBlink?: boolean; sway?: boolean;
}) {
  const id = (n: string) => `${n}${uid}`;
  const ref = (n: string) => `url(#${id(n)})`;
  const eyeStyle: React.CSSProperties = { transformBox: 'fill-box', transformOrigin: '50% 50%' };
  const blinkCls = autoBlink ? 'wg-blink' : undefined;

  return (
    <g data-r="head" className={sway ? 'wg-sway' : undefined}>
      <defs>
        <linearGradient id={id('hair')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6d28d9" />
          <stop offset="55%" stopColor="#2e1065" />
          <stop offset="100%" stopColor="#1a0b33" />
        </linearGradient>
        <radialGradient id={id('skin')} cx="45%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#fff0e6" />
          <stop offset="55%" stopColor="#ffd9c4" />
          <stop offset="100%" stopColor="#f3b99c" />
        </radialGradient>
        <linearGradient id={id('lip')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff4d79" />
          <stop offset="100%" stopColor="#be123c" />
        </linearGradient>
        <linearGradient id={id('hat')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5b21b6" />
          <stop offset="100%" stopColor="#2e1065" />
        </linearGradient>
        <radialGradient id={id('lid')} cx="50%" cy="60%" r="70%">
          <stop offset="0%" stopColor="#f0abfc" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.5" />
        </radialGradient>
        <radialGradient id={id('iris')} cx="40%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#c4b5fd" />
          <stop offset="100%" stopColor="#6d28d9" />
        </radialGradient>
        <linearGradient id={id('dress')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#4c1d95" />
        </linearGradient>
        <clipPath id={id('clipL')}><ellipse cx="40.5" cy="56.5" rx="5.4" ry="3.9" /></clipPath>
        <clipPath id={id('clipR')}><ellipse cx="59.5" cy="56.5" rx="5.4" ry="3.9" /></clipPath>
      </defs>

      {/* الشعر الخلفي */}
      <path d="M50 28 C24 28 16 52 18 76 C19 92 22 102 28 108 L72 108 C78 102 81 92 82 76 C84 52 76 28 50 28 Z" fill={ref('hair')} />

      {/* الأكتاف (في الـ Preview فقط) */}
      {bust && (
        <>
          <path d="M6 114 C10 97 30 90 50 91 C70 90 90 97 94 114 Z" fill={ref('dress')} />
          <path d="M40 91 Q50 102 60 91" fill="none" stroke="#fbbf24" strokeWidth="1.2" />
        </>
      )}

      {/* الرقبة */}
      <rect x="44" y="74" width="12" height="18" rx="5" fill="#eeb094" />

      {/* الوجه */}
      <path d="M29 52 C29 36 39 31 50 31 C61 31 71 36 71 52 C71 68 62 82 50 83 C38 82 29 68 29 52 Z" fill={ref('skin')} stroke="#e9a98d" strokeWidth="0.4" />

      {/* خدود */}
      <ellipse cx="35.5" cy="67" rx="5.5" ry="3.2" fill="#fb7185" opacity="0.45" />
      <ellipse cx="64.5" cy="67" rx="5.5" ry="3.2" fill="#fb7185" opacity="0.45" />

      {/* أنف */}
      <path d="M50 62 Q51.6 65 49.2 65.6" fill="none" stroke="#e7a98f" strokeWidth="1" strokeLinecap="round" />

      {/* ظل العيون (مكياج) */}
      <ellipse cx="40.5" cy="52.8" rx="6.8" ry="3.5" fill={ref('lid')} opacity="0.85" />
      <ellipse cx="59.5" cy="52.8" rx="6.8" ry="3.5" fill={ref('lid')} opacity="0.85" />

      {/* العين اليسرى */}
      <g data-r="eyeL" className={blinkCls} style={eyeStyle}>
        <ellipse cx="40.5" cy="56.5" rx="5.4" ry="3.9" fill="#fff" />
        <g clipPath={ref('clipL')}>
          <g data-r="iris">
            <circle cx="40.5" cy="56.4" r="3.3" fill={ref('iris')} />
            <circle cx="40.5" cy="56.4" r="1.6" fill="#1e1b4b" />
            <circle cx="41.6" cy="55.2" r="0.9" fill="#fff" />
            <circle cx="39.5" cy="57.6" r="0.45" fill="#fff" opacity="0.8" />
          </g>
        </g>
        <path d="M34.4 56.8 Q40.5 50.6 46.4 56.6" stroke="#1a0b33" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <path d="M34.6 56.6 Q33 55 31.6 53.4" stroke="#1a0b33" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <path d="M36 54.6 L34.6 52.6 M38.6 52.8 L38 50.6" stroke="#1a0b33" strokeWidth="0.9" strokeLinecap="round" />
      </g>

      {/* العين اليمنى */}
      <g data-r="eyeR" className={blinkCls} style={eyeStyle}>
        <ellipse cx="59.5" cy="56.5" rx="5.4" ry="3.9" fill="#fff" />
        <g clipPath={ref('clipR')}>
          <g data-r="iris">
            <circle cx="59.5" cy="56.4" r="3.3" fill={ref('iris')} />
            <circle cx="59.5" cy="56.4" r="1.6" fill="#1e1b4b" />
            <circle cx="60.6" cy="55.2" r="0.9" fill="#fff" />
            <circle cx="58.5" cy="57.6" r="0.45" fill="#fff" opacity="0.8" />
          </g>
        </g>
        <path d="M53.6 56.6 Q59.5 50.6 65.6 56.8" stroke="#1a0b33" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <path d="M65.4 56.6 Q67 55 68.4 53.4" stroke="#1a0b33" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <path d="M64 54.6 L65.4 52.6 M61.4 52.8 L62 50.6" stroke="#1a0b33" strokeWidth="0.9" strokeLinecap="round" />
      </g>

      {/* الحواجب */}
      <g data-r="brows" fill="none" stroke="#2b1245" strokeWidth="1.3" strokeLinecap="round">
        <path d="M34 47 Q40 43.5 46.5 46.5" />
        <path d="M53.5 46.5 Q60 43.5 66 47" />
      </g>

      {/* الشفاه: ابتسامة */}
      <g data-r="lipsSmile">
        <path d="M43.4 72.6 Q46.6 69.8 50 71.4 Q53.4 69.8 56.6 72.6 Q53.6 77.4 50 77.4 Q46.4 77.4 43.4 72.6 Z" fill={ref('lip')} />
        <path d="M43.4 72.6 Q50 74.6 56.6 72.6" fill="none" stroke="#7f1d36" strokeWidth="0.5" />
        <ellipse cx="50" cy="75.6" rx="2.6" ry="0.8" fill="#fff" opacity="0.55" />
      </g>
      {/* الشفاه: بوسة */}
      <g data-r="lipsKiss" style={{ display: 'none', transformBox: 'fill-box', transformOrigin: '50% 50%' }}>
        <path d="M46.2 72.4 Q48 70.4 50 71.4 Q52 70.4 53.8 72.4 Q55.2 74.4 53.8 76.2 Q52 78.2 50 78.2 Q48 78.2 46.2 76.2 Q44.8 74.4 46.2 72.4 Z" fill={ref('lip')} />
        <path d="M46.2 74.3 Q50 75.4 53.8 74.3" fill="none" stroke="#7f1d36" strokeWidth="0.5" />
        <ellipse cx="50" cy="77" rx="1.6" ry="0.7" fill="#fff" opacity="0.55" />
      </g>

      {/* شامة */}
      <circle cx="57.2" cy="70.6" r="0.55" fill="#3b0764" />

      {/* الغرّة + خصل الشعر الأمامية */}
      <path d="M28 54 C26 36 38 29 50 29 C63 29 74 36 72 54 C68 44 60 40 52 37 C46 43 36 47 28 54 Z" fill={ref('hair')} />
      <path d="M28 52 C21 70 21 92 27 106 C33 94 33 74 33 60 Z" fill={ref('hair')} />
      <path d="M72 52 C79 70 79 92 73 106 C67 94 67 74 67 60 Z" fill={ref('hair')} />

      {/* أقراط ذهبية */}
      <circle cx="30" cy="66.5" r="1.3" fill="#fbbf24" />
      <circle cx="30" cy="70" r="1.6" fill="#fbbf24" />
      <circle cx="70" cy="66.5" r="1.3" fill="#fbbf24" />
      <circle cx="70" cy="70" r="1.6" fill="#fbbf24" />

      {/* القبعة */}
      <ellipse cx="50" cy="38" rx="30" ry="3" fill="rgba(0,0,0,0.16)" />
      <ellipse cx="50" cy="32" rx="40" ry="8" fill={ref('hat')} stroke="#7c3aed" strokeWidth="0.8" />
      <path d="M28 31 C34 24 40 14 44 4 C46 -2 52 -8 62 -12 C58 -5 58 2 60 10 C63 18 68 25 72 31 Z" fill={ref('hat')} />
      <path d="M30 24.5 C42 28.5 58 28.5 70 24.5 L72 31 C58 35 42 35 28 31 Z" fill="#d946ef" />
      <rect x="46" y="25.5" width="8" height="7" rx="1.2" fill="none" stroke="#fbbf24" strokeWidth="1.6" />
      <polygon
        points="50,11.4 50.88,13.79 53.42,13.89 51.43,15.46 52.12,17.91 50,16.5 47.88,17.91 48.57,15.46 46.58,13.89 49.12,13.79"
        fill="#fbbf24"
      />
    </g>
  );
}

function LipsIcon({ size, color = '#ff2d55' }: { size: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block', overflow: 'visible' }}>
      <path d={LIPS_PATH} fill={color} />
      <path d={LIPS_LINE} fill="none" stroke="rgba(90,0,30,0.65)" strokeWidth="0.9" />
      <ellipse cx="12" cy="16.2" rx="3.2" ry="1" fill="rgba(255,255,255,0.4)" />
    </svg>
  );
}

function Twinkle({ style, delay }: { style: React.CSSProperties; delay: number }) {
  return (
    <motion.svg
      width="14" height="14" viewBox="-10 -10 20 20"
      animate={{ scale: [0.3, 1, 0.3], opacity: [0, 1, 0], rotate: [0, 45, 90] }}
      transition={{ duration: 1.9, repeat: Infinity, delay, ease: 'easeInOut' }}
      style={{ position: 'absolute', pointerEvents: 'none', ...style }}
    >
      <path d="M0 -9 Q1.5 -1.5 9 0 Q1.5 1.5 0 9 Q-1.5 1.5 -9 0 Q-1.5 -1.5 0 -9 Z" fill="#fde68a" />
    </motion.svg>
  );
}

// ── الشكل داخل مربع الهدايا: ساحرة جميلة تتحرك ─────────────────────────────
function WitchPreview({ size = 72 }: { size?: number }) {
  const uid = React.useId().replace(/:/g, '');
  const h = Math.round(size * 1.35);
  const w = Math.round((h * 100) / 126);
  return (
    <motion.div
      aria-hidden="true"
      animate={{ y: [0, -4, 0] }}
      transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
      style={{ position: 'relative', width: w, height: h, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <style>{WG_CSS}</style>
      <svg width={w} height={h} viewBox="0 -14 100 126" style={{ display: 'block', overflow: 'visible', filter: 'drop-shadow(0 0 8px rgba(192,38,211,0.55))' }}>
        <WitchHead uid={uid} bust autoBlink sway />
      </svg>
      <Twinkle style={{ top: -2, left: -8 }} delay={0} />
      <Twinkle style={{ top: '34%', right: -12 }} delay={0.6} />
      <Twinkle style={{ bottom: '18%', left: -10 }} delay={1.2} />
      <motion.div
        animate={{ y: [0, -32], x: [0, 14], opacity: [0, 1, 1, 0], scale: [0.3, 0.9, 1.1, 1.2], rotate: [0, 12] }}
        transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1.6, times: [0, 0.2, 0.7, 1], ease: 'easeOut' }}
        style={{ position: 'absolute', left: '50%', top: '66%', marginLeft: -8, pointerEvents: 'none' }}
      >
        <LipsIcon size={16} />
      </motion.div>
    </motion.div>
  );
}

// ── الجسم الكامل للأنميشن (واقفة/ماشية) ────────────────────────────────────
const FIG_VB = { x: 0, y: -14, w: 100, h: 224 };

function Leg({ name, px }: { name: 'legL' | 'legR'; px: number }) {
  return (
    <g data-r={name} transform={`translate(${px} 160)`}>
      <rect x="-4" y="0" width="8" height="34" rx="3" fill="#2a1148" />
      {[4, 12, 20, 28].map(y => <rect key={y} x="-4" y={y} width="8" height="3.8" fill="#e879f9" />)}
      <path d="M-6 29 L5.5 29 L6.5 40 C11 40.5 15 43 15 46.5 L-7.5 46.5 C-8.5 41 -7.5 35 -6 29 Z" fill="#14091f" />
      <rect x="-6.4" y="29" width="12.8" height="3" rx="1" fill="#7e22ce" />
      <circle cx="0" cy="36" r="1.6" fill="none" stroke="#fbbf24" strokeWidth="0.9" />
      <rect x="-8" y="46.5" width="6" height="2.5" fill="#0a0510" />
    </g>
  );
}

function Arm({ name, px }: { name: 'armL' | 'armR'; px: number }) {
  return (
    <g data-r={name} transform={`translate(${px} 92)`}>
      <path d="M-4.5 0 L4.5 0 L4 20 C4 24 -4 24 -4 20 Z" fill="#6d28d9" />
      <rect x="-4.4" y="18" width="8.8" height="2.4" rx="1" fill="#fbbf24" />
      <circle cx="0" cy="25" r="4.2" fill="#ffd9c4" stroke="#e9a98d" strokeWidth="0.3" />
      <circle cx="0" cy="0" r="5.5" fill="#7c3aed" />
    </g>
  );
}

function WitchFigure({ uid, svgRef, width, height }: {
  uid: string; svgRef: React.RefObject<SVGSVGElement | null>; width: number; height: number;
}) {
  return (
    <svg
      ref={svgRef}
      width={width} height={height}
      viewBox={`${FIG_VB.x} ${FIG_VB.y} ${FIG_VB.w} ${FIG_VB.h}`}
      style={{ display: 'block', overflow: 'visible', filter: 'drop-shadow(0 0 10px rgba(192,38,211,0.55))' }}
    >
      <defs>
        <linearGradient id={`cape${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5b21b6" />
          <stop offset="100%" stopColor="#2e1065" />
        </linearGradient>
        <linearGradient id={`fdress${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#4c1d95" />
        </linearGradient>
      </defs>

      {/* العباءة */}
      <path d="M28 88 C12 112 6 146 2 172 L98 172 C94 146 88 112 72 88 Z" fill={`url(#cape${uid})`} />
      <path d="M32 92 C20 116 14 146 12 168 L88 168 C86 146 80 116 68 92 Z" fill="#86198f" opacity="0.55" />

      <Leg name="legL" px={42} />
      <Leg name="legR" px={58} />

      {/* التنورة */}
      <path
        d="M31 118 L69 118 C76 132 84 146 90 160 L86 166 L80 160 L74 167 L68 160 L62 167 L56 160 L50 167 L44 160 L38 167 L32 160 L26 167 L20 160 L14 166 L10 160 C16 146 24 132 31 118 Z"
        fill={`url(#fdress${uid})`}
      />
      {[[30, 140], [66, 146], [48, 152], [78, 154], [20, 154]].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill="#fbbf24" />
      ))}

      {/* الصدر والحزام */}
      <path d="M33 88 C40 90 60 90 67 88 L70 120 L30 120 Z" fill={`url(#fdress${uid})`} />
      <path d="M42 88 Q50 98 58 88" fill="none" stroke="#fbbf24" strokeWidth="1.2" />
      <rect x="30" y="116" width="40" height="6" rx="2" fill="#db2777" />
      <rect x="46" y="115.5" width="8" height="7" rx="1.5" fill="none" stroke="#fbbf24" strokeWidth="1.5" />

      <WitchHead uid={uid} />

      <Arm name="armL" px={33} />
      <Arm name="armR" px={67} />
    </svg>
  );
}

// ── إيجاد بوكس الرسائل (الذي تمشي عليه الساحرة) ────────────────────────────
function findWalkBox(W: number, H: number): { left: number; top: number; width: number } {
  const pick = (sel: string): DOMRect[] => {
    const rects: DOMRect[] = [];
    try {
      document.querySelectorAll<HTMLElement>(sel).forEach(el => {
        if (el.closest('[data-gift-overlay]')) return;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return;
        const r = el.getBoundingClientRect();
        if (r.width < 80 || r.height < 24 || r.bottom < H * 0.5 || r.top > H - 8 || r.right < 0 || r.left > W) return;
        rects.push(r);
      });
    } catch { /* ignore */ }
    return rects;
  };
  const widest = (rs: DOMRect[]) => rs.reduce((a, b) => (b.width > a.width ? b : a));

  const explicit = pick('[data-gift-walk]');
  if (explicit.length) { const r = widest(explicit); return { left: r.left, top: r.top, width: r.width }; }
  const inputs = pick('textarea, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]), [contenteditable="true"]');
  if (inputs.length) { const r = widest(inputs); return { left: r.left, top: r.top, width: r.width }; }
  return { left: 12, top: H - 72, width: W - 24 };
}

function findHostPoint(W: number): { x: number; y: number } {
  try {
    const el = document.querySelector<HTMLElement>('[data-gift-host]');
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
  } catch { /* ignore */ }
  return { x: W * 0.5, y: 56 };
}

// ── جسيمات البوسات ─────────────────────────────────────────────────────────
interface P {
  x: number; y: number; vx: number; vy: number;
  size: number; rot: number; vr: number; color: string;
  kind: 0 | 1 | 2; // 0 بوسة، 1 قلب، 2 شرارة
  born: number; life: number; grav: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);

function blinkAmt(t: number): number {
  for (const c of [1.26, 2.56, 3.96, 6.95, 8.3]) {
    const d = Math.abs(t - c);
    if (d < 0.06) return 1 - d / 0.06;
  }
  return 0;
}

// ── أنميشن ملء الشاشة ──────────────────────────────────────────────────────
function WitchAnimation({ onDone }: { onDone: () => void }) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const uid = React.useId().replace(/:/g, '');
  const figRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);

  const [{ W, H }] = useState(() => ({
    W: typeof window !== 'undefined' ? window.innerWidth : 360,
    H: typeof window !== 'undefined' ? window.innerHeight : 640,
  }));
  const figH = Math.round(Math.min(Math.max(H * 0.26, 140), 210));
  const sc = figH / FIG_VB.h;
  const figW = Math.round(FIG_VB.w * sc);

  useEffect(() => {
    const fig = figRef.current;
    const svg = svgRef.current;
    const cv = cvRef.current;
    if (!fig || !svg || !cv) return;
    const c = cv.getContext('2d');
    if (!c) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);

    const q = (n: string) => svg.querySelector<SVGElement>(`[data-r="${n}"]`);
    const head = q('head'), legL = q('legL'), legR = q('legR'), armL = q('armL'), armR = q('armR');
    const eyeL = q('eyeL'), eyeR = q('eyeR'), brows = q('brows'), smile = q('lipsSmile'), kiss = q('lipsKiss');
    const irises = Array.from(svg.querySelectorAll<SVGElement>('[data-r="iris"]'));
    const setT = (el: Element | null, v: string) => { if (el) el.setAttribute('transform', v); };

    const lipsP = new Path2D(LIPS_PATH);
    const lineP = new Path2D(LIPS_LINE);
    const heartP = new Path2D(HEART_PATH);

    // الهندسة
    const box = findWalkBox(W, H);
    const feetY = box.top + 3;
    const topY = feetY - figH * (223 / 224);
    const host = findHostPoint(W);
    const xStart = -figW - 12;
    const xStop = Math.min(Math.max(box.left + box.width / 2 - figW / 2, 8), W - figW - 8);
    const D = xStop - xStart;
    const useR = host.x >= xStop + figW / 2; // أي يد تبوس منها
    const sgn = useR ? 1 : -1;
    const main = useR ? armR : armL;
    const other = useR ? armL : armR;
    const mainPx = useR ? 67 : 33;
    const otherPx = useR ? 33 : 67;

    const k = Math.max(W, H) / 700;
    const g = GRAVITY * (H / 700);
    const TOTAL_S = TOTAL_MS / 1000;

    const mouthPos = () => {
      const r = svg.getBoundingClientRect();
      return {
        x: r.left + ((50 - FIG_VB.x) / FIG_VB.w) * r.width,
        y: r.top + ((74 - FIG_VB.y) / FIG_VB.h) * r.height,
      };
    };

    const ps: P[] = [];
    const spawnKiss = (x: number, y: number, t: number, speed: number, up: number) => {
      const ang = Math.random() * Math.PI * 2;
      const sp = (speed * 0.3 + Math.random() * speed) * k;
      ps.push({
        x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - up * k,
        size: 16 + Math.random() * 24,
        rot: (Math.random() - 0.5) * 1.2,
        vr: (Math.random() - 0.5) * 6,
        color: KISS_COLORS[Math.floor(Math.random() * KISS_COLORS.length)],
        kind: Math.random() < 0.78 ? 0 : 1,
        born: t, life: 2.2 + Math.random() * 1.0, grav: g,
      });
    };
    const spawnSpark = (x: number, y: number, t: number, speed: number) => {
      const ang = Math.random() * Math.PI * 2;
      const sp = Math.random() * speed * k;
      ps.push({
        x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        size: 3 + Math.random() * 4, rot: 0, vr: 0, color: '#fff3b0',
        kind: 2, born: t, life: 0.5 + Math.random() * 0.5, grav: 0,
      });
    };

    const drawLips = (x: number, y: number, size: number, rot: number, color: string, alpha: number) => {
      c.save();
      c.globalAlpha = alpha;
      c.translate(x, y);
      c.rotate(rot);
      const s = size / 24;
      c.scale(s, s);
      c.translate(-12, -12.5);
      c.fillStyle = color;
      c.fill(lipsP);
      c.strokeStyle = 'rgba(90,0,30,0.65)';
      c.lineWidth = 0.9;
      c.stroke(lineP);
      c.fillStyle = 'rgba(255,255,255,0.4)';
      c.beginPath();
      c.ellipse(12, 16.2, 3.2, 1, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    };
    const drawHeart = (x: number, y: number, size: number, rot: number, color: string, alpha: number) => {
      c.save();
      c.globalAlpha = alpha;
      c.translate(x, y);
      c.rotate(rot);
      const s = size / 24;
      c.scale(s, s);
      c.translate(-12, -11.5);
      c.fillStyle = color;
      c.fill(heartP);
      c.restore();
    };
    const drawSpark = (x: number, y: number, size: number, alpha: number) => {
      c.save();
      c.globalAlpha = alpha;
      c.translate(x, y);
      c.fillStyle = '#fff3b0';
      c.shadowColor = '#f0abfc';
      c.shadowBlur = 6;
      const s = size;
      c.beginPath();
      c.moveTo(0, -s);
      c.quadraticCurveTo(s * 0.15, -s * 0.15, s, 0);
      c.quadraticCurveTo(s * 0.15, s * 0.15, 0, s);
      c.quadraticCurveTo(-s * 0.15, s * 0.15, -s, 0);
      c.quadraticCurveTo(-s * 0.15, -s * 0.15, 0, -s);
      c.fill();
      c.restore();
    };

    // حالة البوسة الكبيرة لصاحب البث
    let flyFrom: { x: number; y: number } | null = null;
    let arrived = false;
    const flyCtl = { x: 0, y: 0 };
    let emitted = 0;
    let burstMouth: { x: number; y: number } | null = null;

    const stopSound = playWitchSound({
      stepTimes: STEP_TIMES,
      kissAt: KISS_AT,
      arriveAt: KISS_AT + 0.05 + FLY_S,
      burstAt: BURST_AT,
      burstSpan: BURST_S,
      burstCount: 14,
      kissUrl: KISS_URL || undefined,
    });

    let raf = 0;
    const start = performance.now();
    let last = start;

    const frame = (now: number) => {
      const t = (now - start) / 1000;
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const endFade = t > TOTAL_S - 0.6 ? clamp01((TOTAL_S - t) / 0.6) : 1;

      // ── المشي ──
      const phase = (2 * Math.PI * t) / (STEP_S * 2);
      const amp = t < 0.12 ? t / 0.12 : t < WALK_S ? 1 : Math.max(0, 1 - (t - WALK_S) / 0.28);
      const swing = 22 * amp * Math.sin(phase);
      const x = xStart + D * Math.min(1, t / WALK_S);
      const bob = -3 * amp * Math.abs(Math.cos(phase));
      const hop = Math.sin(Math.PI * clamp01((t - KISS_AT) / 0.3)) * 8;
      fig.style.transform = `translate3d(${x}px, ${topY + bob - hop}px, 0)`;
      fig.style.opacity = String(endFade);

      setT(legL, `translate(42 160) rotate(${swing})`);
      setT(legR, `translate(58 160) rotate(${-swing})`);

      // ── الذراعين ──
      const rise = smooth((t - RAISE_AT) / 0.45);
      const flick = easeOut((t - KISS_AT) / 0.28);
      const back = smooth((t - ARM_DOWN_AT) / 0.6);
      const ang = (139 * rise + 61 * flick) * (1 - back);
      setT(main, `translate(${mainPx} 92) rotate(${sgn * ang + sgn * 0.6 * swing * (1 - rise)})`);
      const hip = sgn * 12 * smooth((t - RAISE_AT) / 0.4) * (1 - back);
      setT(other, `translate(${otherPx} 92) rotate(${-sgn * 0.6 * swing + hip})`);

      // ── الرأس والعيون ──
      const u = smooth((t - LOOK_AT) / 0.5) * (1 - smooth((t - LOOK_END) / 0.5));
      setT(head, `translate(0 ${-1.2 * u}) rotate(${sgn * (7 * u + 1.5 * amp * Math.sin(phase))} 50 84)`);
      irises.forEach(el => el.setAttribute('transform', `translate(0 ${-1.5 * u})`));
      setT(brows, `translate(0 ${-1.2 * u})`);

      const bl = blinkAmt(t);
      const wink = t > KISS_AT - 0.05 && t < KISS_AT + 0.25 ? Math.sin((Math.PI * (t - KISS_AT + 0.05)) / 0.3) : 0;
      eyeL?.style.setProperty('transform', `scaleY(${1 - 0.92 * bl})`);
      eyeR?.style.setProperty('transform', `scaleY(${1 - 0.92 * Math.max(bl, wink)})`);

      // ── الشفاه ──
      const showKiss = t >= PUCKER_AT && t < LIPS_END;
      if (smile) smile.style.display = showKiss ? 'none' : '';
      if (kiss) {
        kiss.style.display = showKiss ? '' : 'none';
        const pulse = t > BURST_AT && t < BURST_AT + BURST_S ? 1 + 0.14 * Math.sin(t * 30) : 1;
        kiss.style.transform = `scale(${pulse})`;
      }

      // ── البوسة الكبيرة لصاحب البث ──
      const flyT0 = KISS_AT + 0.05;
      if (t >= flyT0 && !flyFrom) {
        flyFrom = mouthPos();
        flyCtl.x = (flyFrom.x + host.x) / 2 + (useR ? -1 : 1) * 40 * k;
        flyCtl.y = Math.min(flyFrom.y, host.y) - 60 * k;
      }

      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);

      if (flyFrom && !arrived) {
        const uf = (t - flyT0) / FLY_S;
        if (uf >= 1) {
          arrived = true;
          for (let i = 0; i < 20; i++) spawnKiss(host.x, host.y, t, 520, 160);
          for (let i = 0; i < 14; i++) spawnSpark(host.x, host.y, t, 420);
        } else {
          const e = easeOut(uf * 0.9 + 0.1 * uf);
          const a = 1 - e, b = e;
          const bx = a * a * flyFrom.x + 2 * a * b * flyCtl.x + b * b * host.x;
          const by = a * a * flyFrom.y + 2 * a * b * flyCtl.y + b * b * host.y;
          const alpha = uf > 0.85 ? (1 - uf) / 0.15 : 1;
          drawLips(bx, by, (18 + 34 * e) * Math.max(0.8, k), 0.25 * Math.sin(uf * 9), '#ff2d55', alpha * endFade);
          if (Math.random() < 0.7) spawnSpark(bx, by, t, 60);
        }
      }

      // ── خروج البوسات من فمها ──
      if (t >= BURST_AT && emitted < KISSES) {
        if (!burstMouth) burstMouth = mouthPos();
        const want = Math.min(KISSES, Math.ceil(((t - BURST_AT) / BURST_S) * KISSES));
        while (emitted < want) {
          spawnKiss(burstMouth.x, burstMouth.y, t, 900, 320);
          if (emitted % 3 === 0) spawnSpark(burstMouth.x, burstMouth.y, t, 500);
          emitted++;
        }
      }

      // ── تحديث ورسم الجسيمات ──
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        const age = t - p.born;
        if (age >= p.life || p.y - p.size > H + 30) { ps.splice(i, 1); continue; }
        p.vy += p.grav * dt;
        const d = Math.exp(-(p.kind === 2 ? 2.5 : 0.8) * dt);
        p.vx *= d; p.vy *= d;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.rot += p.vr * dt;
        const left = p.life - age;
        const alpha = (left < 0.5 ? left / 0.5 : 1) * endFade;
        if (p.kind === 0) drawLips(p.x, p.y, p.size, p.rot, p.color, alpha);
        else if (p.kind === 1) drawHeart(p.x, p.y, p.size * 0.8, p.rot, p.color, alpha);
        else drawSpark(p.x, p.y, p.size, alpha);
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const tDone = window.setTimeout(() => doneRef.current(), TOTAL_MS);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(tDone);
      stopSound();
    };
  }, [W, H, figH, figW, sc]);

  return (
    <div
      aria-hidden="true"
      data-gift-overlay="1"
      style={{ position: 'fixed', inset: 0, zIndex: 9400, pointerEvents: 'none', overflow: 'hidden' }}
    >
      {/* تعتيم خفيف يبرز الساحرة والبوسات */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: TOTAL_MS / 1000, times: [0, 0.08, 0.88, 1], ease: 'linear' }}
        style={{ position: 'absolute', inset: 0, background: 'rgba(20,0,35,0.3)' }}
      />
      <div
        ref={figRef}
        style={{ position: 'absolute', left: 0, top: 0, width: figW, height: figH, transform: 'translate3d(-9999px,0,0)', willChange: 'transform' }}
      >
        <WitchFigure uid={uid} svgRef={svgRef} width={figW} height={figH} />
      </div>
      <canvas ref={cvRef} style={{ position: 'absolute', inset: 0, width: W, height: H, pointerEvents: 'none' }} />
    </div>
  );
}

export const WitchGift: GiftDefinition = {
  id: 'witch',
  name: 'Witch',
  price: PRICE,
  durationMs: TOTAL_MS,
  Preview: WitchPreview,
  Animation: WitchAnimation,
};

export default WitchGift;
