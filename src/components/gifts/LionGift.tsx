/**
 * هدية الأسد (Lion) — 2,000 Coins — مدتها ~5.2 ثانية
 *
 * - Preview  : داخل مربع الهدايا أسد متحرك قبل النقر: يتنفس، يحرّك ذيله، عيون تتوهج،
 *              شعر اللبدة يتموج، غبار خفيف تحت الأقدام.
 * - Animation: (الأرقام بالثواني)
 *     0.0 – 2.0  : الأسد يركض من الخلفية باتجاه الشاشة (يكبُر ويقترب) + غبار/شرار تحت الأقدام
 *     2.0 – 2.35 : يقف بثبات، يغرس أقدامه
 *     2.35 – 4.2 : يفتح فكه ويزأر — هزة شاشة + هزة جهاز (Haptic) + جسيمات صوت/غبار
 *     4.2 – 5.2  : اختفاء سلس (Fade-out)
 *
 * ملف مستقل: الأصوات في src/lib/lionSounds.ts
 * ضع هذا الملف في: src/components/gifts/LionGift.tsx
 *
 * ربط الأنميشن بالواجهة (اختياري، يعمل بدونها):
 *   data-gift-host : على صورة/بروفايل صاحب البث
 *   data-gift-lift : لما الهدية لمتحدث (صورة المتحدث)
 *   data-gift-hot  : عناصر تسخن بالجسيمات
 */
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { GiftDefinition } from '../../lib/types';
import { playLionSound } from '../../lib/lionSounds';

// ── إعدادات الهدية ──────────────────────────────────────────────────────
const PRICE = 2000;
const TOTAL_MS = 5200;
const TOTAL_S = TOTAL_MS / 1000;

const RUN_END = 2.0;
const PLANT_END = 2.35;
const ROAR_AT = 2.35;
const ROAR_END = 4.2;
const FADE_AT = 4.2;
const FADE_END = 5.2;

const MAX_FX = 400;
const HOT_SEL = 'button, [role="button"], a[href], input, textarea, select, [data-gift-host], [data-gift-walk], [data-gift-hot]';

// ── أدوات رياضية ────────────────────────────────────────────────────────
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const easeInOut = (x: number) => { const u = clamp01(x); return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; };
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// ═══════════════════════════════════════════════════════════════════════
//  Preview — أسد صغير متحرك داخل مربع الهدايا
// ═══════════════════════════════════════════════════════════════════════
const LG_CSS = `
@keyframes lg-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.03,0.97)}}
@keyframes lg-tail{0%,100%{transform:rotate(-12deg)}50%{transform:rotate(18deg)}}
@keyframes lg-mane{0%,100%{transform:scale(1) rotate(0deg)}50%{transform:scale(1.04) rotate(2deg)}}
@keyframes lg-eye{0%,90%,100%{opacity:1}93%{opacity:0.15}96%{opacity:1}}
@keyframes lg-dust{0%{transform:translate(0,0) scale(.6);opacity:0}20%{opacity:.7}100%{transform:translate(var(--dx),var(--dy)) scale(1.4);opacity:0}}
@keyframes lg-paw{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
.lg-breathe{animation:lg-breathe 2.2s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 70%}
.lg-tail{animation:lg-tail 1.8s ease-in-out infinite;transform-box:fill-box;transform-origin:0% 50%}
.lg-mane{animation:lg-mane 2.6s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}
.lg-eye{animation:lg-eye 3.5s ease-in-out infinite}
.lg-dust{animation:lg-dust 1.4s ease-out infinite}
.lg-paw{animation:lg-paw 0.9s ease-in-out infinite}
`;

function LionPreview({ size = 72 }: { size?: number }) {
  const uid = React.useId().replace(/:/g, '');
  const h = Math.round(size * 1.15);
  const w = Math.round((h * 100) / 100);
  const ref = (n: string) => `url(#${n}${uid})`;
  return (
    <motion.div
      aria-hidden="true"
      animate={{ y: [0, -1.5, 0] }}
      transition={{ duration: 2.0, repeat: Infinity, ease: 'easeInOut' }}
      style={{ position: 'relative', width: w, height: h, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <style>{LG_CSS}</style>
      <svg width={w} height={h} viewBox="0 0 100 100" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <radialGradient id={`glow${uid}`} cx="50%" cy="45%" r="50%">
            <stop offset="0%" stopColor="#f5c842" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#c47820" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`fur${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e8a838" />
            <stop offset="55%" stopColor="#c47820" />
            <stop offset="100%" stopColor="#8a4a12" />
          </linearGradient>
          <linearGradient id={`mane${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#9a3a0a" />
            <stop offset="40%" stopColor="#c45a18" />
            <stop offset="100%" stopColor="#6a2808" />
          </linearGradient>
          <radialGradient id={`eye${uid}`} cx="40%" cy="40%" r="55%">
            <stop offset="0%" stopColor="#ffe566" />
            <stop offset="70%" stopColor="#c9a000" />
            <stop offset="100%" stopColor="#5a3a00" />
          </radialGradient>
        </defs>

        {/* هالة */}
        <circle cx="50" cy="48" r="40" fill={ref('glow')} />

        {/* غبار تحت الأقدام */}
        {[
          { x: 38, dx: -8, dy: -6, d: 0 },
          { x: 55, dx: 6, dy: -5, d: 0.4 },
          { x: 48, dx: -2, dy: -8, d: 0.8 },
        ].map((s, i) => (
          <circle
            key={i}
            cx={s.x}
            cy="88"
            r="3"
            fill="#c4a070"
            className="lg-dust"
            style={{ animationDelay: `${s.d}s`, ['--dx' as string]: `${s.dx}px`, ['--dy' as string]: `${s.dy}px` } as React.CSSProperties}
          />
        ))}

        {/* ذيل */}
        <g transform="translate(78 58)">
          <path
            d="M0 0 Q12 -8 16 6 Q18 14 10 12"
            fill="none"
            stroke="#a86020"
            strokeWidth="5"
            strokeLinecap="round"
            className="lg-tail"
          />
          <ellipse cx="12" cy="12" rx="4" ry="3.2" fill="#8a4a12" className="lg-tail" />
        </g>

        {/* جسم */}
        <g className="lg-breathe">
          {/* أرجل خلفية */}
          <ellipse cx="42" cy="78" rx="7" ry="10" fill="#a86828" className="lg-paw" style={{ animationDelay: '0.15s' }} />
          <ellipse cx="62" cy="78" rx="7" ry="10" fill="#a86828" className="lg-paw" style={{ animationDelay: '0.6s' }} />
          {/* جسم */}
          <ellipse cx="52" cy="62" rx="22" ry="14" fill={ref('fur')} />
          {/* أرجل أمامية */}
          <ellipse cx="40" cy="80" rx="6.5" ry="9" fill="#c47820" className="lg-paw" />
          <ellipse cx="58" cy="80" rx="6.5" ry="9" fill="#c47820" className="lg-paw" style={{ animationDelay: '0.45s' }} />
          {/* مخالب */}
          <path d="M36 86 L34 90 M40 87 L40 91 M44 86 L46 90" stroke="#5a3010" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M54 86 L52 90 M58 87 L58 91 M62 86 L64 90" stroke="#5a3010" strokeWidth="1.2" strokeLinecap="round" />

          {/* لبدة */}
          <g className="lg-mane">
            {[
              'M28 42 Q18 28 32 22 Q40 18 42 28',
              'M36 24 Q42 10 52 18 Q56 24 50 32',
              'M52 20 Q62 8 72 20 Q74 28 64 34',
              'M68 28 Q82 32 76 46 Q70 52 62 44',
              'M72 44 Q80 54 68 58 Q60 56 62 48',
              'M30 48 Q18 52 24 62 Q32 66 36 56',
            ].map((d, i) => (
              <path key={i} d={d} fill={ref('mane')} opacity={0.92 - i * 0.04} />
            ))}
            <circle cx="50" cy="40" r="16" fill={ref('mane')} />
          </g>

          {/* رأس */}
          <ellipse cx="50" cy="42" rx="13" ry="12" fill={ref('fur')} />
          {/* خطم */}
          <ellipse cx="50" cy="48" rx="7" ry="5.5" fill="#e8c070" />
          {/* أنف */}
          <path d="M47 46 Q50 44 53 46 Q50 49 47 46" fill="#3a2010" />
          {/* فم مغلق */}
          <path d="M46 50 Q50 53 54 50" fill="none" stroke="#5a3010" strokeWidth="1.3" strokeLinecap="round" />

          {/* عيون */}
          <ellipse cx="44" cy="40" rx="3.2" ry="3.6" fill={ref('eye')} className="lg-eye" />
          <ellipse cx="56" cy="40" rx="3.2" ry="3.6" fill={ref('eye')} className="lg-eye" style={{ animationDelay: '0.1s' }} />
          <circle cx="44.5" cy="40.5" r="1.3" fill="#1a1008" />
          <circle cx="56.5" cy="40.5" r="1.3" fill="#1a1008" />
          <circle cx="43.6" cy="39.4" r="0.55" fill="#fff" opacity="0.85" />
          <circle cx="55.6" cy="39.4" r="0.55" fill="#fff" opacity="0.85" />

          {/* أذنان */}
          <ellipse cx="38" cy="30" rx="4" ry="5" fill="#c47820" transform="rotate(-20 38 30)" />
          <ellipse cx="38" cy="30" rx="2.2" ry="3" fill="#e8a060" transform="rotate(-20 38 30)" />
          <ellipse cx="62" cy="30" rx="4" ry="5" fill="#c47820" transform="rotate(20 62 30)" />
          <ellipse cx="62" cy="30" rx="2.2" ry="3" fill="#e8a060" transform="rotate(20 62 30)" />
        </g>
      </svg>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  Animation — أنميشن ملء الشاشة (Canvas 2D)
// ═══════════════════════════════════════════════════════════════════════
interface Pt {
  x: number; y: number; vx: number; vy: number;
  size: number; life: number; age: number; kind: 0 | 1; // 0 غبار، 1 شرارة
}
interface Host {
  x: number; y: number; w: number; h: number; top: number;
}

function findHost(W: number): Host {
  try {
    const el = document.querySelector<HTMLElement>('[data-gift-host]');
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, top: r.top };
      }
    }
  } catch { /* ignore */ }
  return { x: W * 0.5, y: 56, w: 48, h: 48, top: 32 };
}

function triggerHaptic() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([40, 30, 80, 30, 120, 40, 60]);
    }
  } catch { /* ignore */ }
}

function LionAnimation({ onDone }: { onDone?: () => void }) {
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const [size, setSize] = useState({ W: 0, H: 0 });
  const W = size.W;
  const H = size.H;

  useEffect(() => {
    const measure = () => setSize({ W: window.innerWidth, H: window.innerHeight });
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    if (!W || !H) return;
    const canvas = cvRef.current;
    if (!canvas) return;
    canvas.width = W * (window.devicePixelRatio > 1.5 ? 1.5 : window.devicePixelRatio || 1);
    canvas.height = H * (window.devicePixelRatio > 1.5 ? 1.5 : window.devicePixelRatio || 1);
    const c = canvas.getContext('2d');
    if (!c) return;
    const dpr = canvas.width / W;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    const k = Math.min(W, H) / 390;
    const pts: Pt[] = [];
    let host = findHost(W);
    let roarTriggered = false;
    let raf = 0;
    const t0 = performance.now();
    let last = t0;

    const stopSound = playLionSound({
      runEnd: RUN_END,
      roarAt: ROAR_AT,
      roarEnd: ROAR_END,
      total: TOTAL_S,
    });

    const spawn = (x: number, y: number, kind: 0 | 1) => {
      if (pts.length >= MAX_FX) return;
      pts.push({
        x, y,
        vx: rnd(-80, 80) * k * (kind === 1 ? 1.4 : 1),
        vy: rnd(-120, -20) * k * (kind === 1 ? 1.6 : 1),
        size: rnd(2, kind === 1 ? 5 : 7) * k,
        life: rnd(0.4, 1.1),
        age: 0,
        kind,
      });
    };

    /** رسم أسد stylized ثلاثي الأبعاد تقريبي (تظليل + حجم) */
    const drawLion = (
      cx: number,
      cy: number,
      scale: number,
      phase: 'run' | 'plant' | 'roar' | 'fade',
      t: number,
      jawOpen: number,
      legPhase: number,
      alpha: number,
    ) => {
      c.save();
      c.globalAlpha = alpha;
      c.translate(cx, cy);
      c.scale(scale, scale);

      // ظل تحت الأقدام
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.beginPath();
      c.ellipse(0, 78, 48 + jawOpen * 4, 10, 0, 0, Math.PI * 2);
      c.fill();

      // ذيل
      c.save();
      const tailSwing = phase === 'run' ? Math.sin(t * 10) * 0.35 : Math.sin(t * 2.5) * 0.12;
      c.translate(55, 10);
      c.rotate(tailSwing);
      c.strokeStyle = '#8a4a12';
      c.lineWidth = 7;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(0, 0);
      c.quadraticCurveTo(28, -18, 36, 8);
      c.stroke();
      c.fillStyle = '#6a3010';
      c.beginPath();
      c.ellipse(36, 10, 7, 5, 0.3, 0, Math.PI * 2);
      c.fill();
      c.restore();

      // أرجل خلفية
      const legA = phase === 'run' ? Math.sin(legPhase) * 18 : 0;
      const legB = phase === 'run' ? Math.sin(legPhase + Math.PI) * 18 : 0;
      const drawLeg = (lx: number, bounce: number, front: boolean) => {
        c.fillStyle = front ? '#c47820' : '#a06020';
        c.beginPath();
        c.ellipse(lx, 55 + bounce * 0.15, front ? 11 : 12, 22, 0, 0, Math.PI * 2);
        c.fill();
        // قدم
        c.fillStyle = '#6a3a10';
        c.beginPath();
        c.ellipse(lx + 2, 74 + bounce * 0.05, 10, 5, 0, 0, Math.PI * 2);
        c.fill();
      };
      drawLeg(-22, legA, false);
      drawLeg(18, legB, false);

      // جسم (بيضاوي مع تدرج)
      const bodyGrad = c.createLinearGradient(0, -20, 0, 50);
      bodyGrad.addColorStop(0, '#e8a838');
      bodyGrad.addColorStop(0.5, '#c47820');
      bodyGrad.addColorStop(1, '#8a4a12');
      c.fillStyle = bodyGrad;
      c.beginPath();
      c.ellipse(0, 20, 42, 28, 0, 0, Math.PI * 2);
      c.fill();
      // بطن أفتح
      c.fillStyle = 'rgba(232, 200, 120, 0.45)';
      c.beginPath();
      c.ellipse(0, 28, 28, 16, 0, 0, Math.PI * 2);
      c.fill();

      // أرجل أمامية
      drawLeg(-18, legB, true);
      drawLeg(22, legA, true);

      // لبدة (طبقات دوائر/أقواس لإحساس الحجم)
      const manePulse = phase === 'roar' ? 1 + Math.sin(t * 18) * 0.04 : 1;
      c.save();
      c.scale(manePulse, manePulse);
      const maneColors = ['#5a2008', '#8a3a10', '#b05018', '#9a4010'];
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const rx = 38 + (i % 3) * 4;
        const ry = 34 + (i % 2) * 5;
        c.fillStyle = maneColors[i % maneColors.length];
        c.beginPath();
        c.ellipse(
          Math.cos(ang) * 8 - 2,
          Math.sin(ang) * 6 - 28,
          rx * 0.55,
          ry * 0.5,
          ang * 0.3,
          0,
          Math.PI * 2,
        );
        c.fill();
      }
      c.fillStyle = '#a84812';
      c.beginPath();
      c.ellipse(-2, -26, 30, 26, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();

      // رأس
      const headY = -28;
      const headGrad = c.createRadialGradient(-4, headY - 4, 4, 0, headY, 22);
      headGrad.addColorStop(0, '#f0b848');
      headGrad.addColorStop(1, '#c07020');
      c.fillStyle = headGrad;
      c.beginPath();
      c.ellipse(0, headY, 22, 20, 0, 0, Math.PI * 2);
      c.fill();

      // أذنان
      c.fillStyle = '#c47820';
      c.beginPath();
      c.ellipse(-16, headY - 16, 7, 9, -0.4, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.ellipse(16, headY - 16, 7, 9, 0.4, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#e8a060';
      c.beginPath();
      c.ellipse(-16, headY - 16, 3.5, 5, -0.4, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.ellipse(16, headY - 16, 3.5, 5, 0.4, 0, Math.PI * 2);
      c.fill();

      // عيون
      const eyeGlow = phase === 'roar' ? 1.15 : 1;
      c.fillStyle = '#1a1208';
      c.beginPath();
      c.ellipse(-8, headY - 2, 4.2 * eyeGlow, 5 * eyeGlow, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.ellipse(8, headY - 2, 4.2 * eyeGlow, 5 * eyeGlow, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#f0d020';
      c.beginPath();
      c.ellipse(-8, headY - 2, 2.4, 3.2, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.ellipse(8, headY - 2, 2.4, 3.2, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#0a0804';
      c.beginPath();
      c.ellipse(-7.5, headY - 1.5, 1.2, 1.8, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.ellipse(8.5, headY - 1.5, 1.2, 1.8, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.beginPath();
      c.arc(-9, headY - 3.5, 0.9, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.arc(7, headY - 3.5, 0.9, 0, Math.PI * 2);
      c.fill();

      // خطم
      c.fillStyle = '#e8c878';
      c.beginPath();
      c.ellipse(0, headY + 8, 11, 8, 0, 0, Math.PI * 2);
      c.fill();

      // أنف
      c.fillStyle = '#2a180c';
      c.beginPath();
      c.moveTo(-4, headY + 5);
      c.quadraticCurveTo(0, headY + 2, 4, headY + 5);
      c.quadraticCurveTo(0, headY + 9, -4, headY + 5);
      c.fill();

      // فك / زئير
      if (jawOpen > 0.02) {
        // فم مفتوح
        c.fillStyle = '#4a1010';
        c.beginPath();
        c.ellipse(0, headY + 12 + jawOpen * 10, 9 + jawOpen * 2, 4 + jawOpen * 12, 0, 0, Math.PI * 2);
        c.fill();
        // لسان
        c.fillStyle = '#c04040';
        c.beginPath();
        c.ellipse(0, headY + 14 + jawOpen * 12, 5, 3 + jawOpen * 5, 0, 0, Math.PI * 2);
        c.fill();
        // أسنان
        c.fillStyle = '#f5f0e0';
        for (const tx of [-5, -2, 2, 5]) {
          c.beginPath();
          c.moveTo(tx - 1.2, headY + 8);
          c.lineTo(tx, headY + 8 + jawOpen * 6);
          c.lineTo(tx + 1.2, headY + 8);
          c.closePath();
          c.fill();
        }
        // الفك السفلي
        c.fillStyle = '#c47820';
        c.beginPath();
        c.ellipse(0, headY + 16 + jawOpen * 14, 10, 5, 0, 0, Math.PI * 2);
        c.fill();
      } else {
        c.strokeStyle = '#5a3010';
        c.lineWidth = 1.8;
        c.beginPath();
        c.moveTo(-6, headY + 12);
        c.quadraticCurveTo(0, headY + 15, 6, headY + 12);
        c.stroke();
      }

      // شوارب
      c.strokeStyle = 'rgba(40,20,8,0.7)';
      c.lineWidth = 1.2;
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          c.beginPath();
          c.moveTo(side * 8, headY + 8 + i * 2);
          c.quadraticCurveTo(side * 22, headY + 6 + i * 3, side * 28, headY + 4 + i * 4);
          c.stroke();
        }
      }

      c.restore();
    };

    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // هزة الشاشة أثناء الزئير
      let shakeX = 0;
      let shakeY = 0;
      if (t >= ROAR_AT && t < ROAR_END) {
        const strength = 6 * k * (1 - clamp01((t - ROAR_AT) / (ROAR_END - ROAR_AT)) * 0.4);
        shakeX = Math.sin(t * 48) * strength;
        shakeY = Math.cos(t * 52) * strength * 0.7;
      }

      c.clearRect(0, 0, W, H);
      c.save();
      c.translate(shakeX, shakeY);

      // خلفية خفيفة داكنة أثناء الاقتراب والزئير
      const dark =
        t < RUN_END
          ? smooth(t / RUN_END) * 0.25
          : t < FADE_AT
            ? 0.35
            : 0.35 * (1 - smooth((t - FADE_AT) / (FADE_END - FADE_AT)));
      if (dark > 0.01) {
        c.fillStyle = `rgba(0,0,0,${dark})`;
        c.fillRect(-20, -20, W + 40, H + 40);
      }

      // موضع ومقياس الأسد
      let phase: 'run' | 'plant' | 'roar' | 'fade' = 'run';
      let lionScale = 0.35;
      let lionX = W * 0.5;
      let lionY = H * 0.62;
      let jawOpen = 0;
      let legPhase = t * 14;
      let alpha = 1;

      if (t < RUN_END) {
        phase = 'run';
        const u = easeOut(t / RUN_END);
        // من بعيد (صغير، أسفل/وسط) إلى كبير أمام الشاشة
        lionScale = lerp(0.22, 1.05 * Math.min(1.15, k * 1.05 / k), u);
        // تصحيح المقياس بالنسبة لحجم الشاشة
        lionScale = lerp(0.25, Math.min(1.35, (Math.min(W, H) / 420) * 1.15), u);
        lionY = lerp(H * 0.72, H * 0.58, u);
        lionX = W * 0.5 + Math.sin(t * 6) * 8 * k * (1 - u);
        // غبار تحت الأقدام أثناء الركض
        if (Math.random() < 0.55) {
          spawn(lionX + rnd(-30, 30) * lionScale, lionY + 70 * lionScale, 0);
        }
        if (Math.random() < 0.2) {
          spawn(lionX + rnd(-20, 20) * lionScale, lionY + 65 * lionScale, 1);
        }
      } else if (t < PLANT_END) {
        phase = 'plant';
        lionScale = Math.min(1.35, (Math.min(W, H) / 420) * 1.15);
        lionY = H * 0.58;
        legPhase = 0;
        // غبار عند الغرس
        if (t < PLANT_END - 0.1) {
          for (let i = 0; i < 2; i++) spawn(lionX + rnd(-40, 40) * lionScale, lionY + 72 * lionScale, 0);
        }
      } else if (t < ROAR_END) {
        phase = 'roar';
        lionScale = Math.min(1.35, (Math.min(W, H) / 420) * 1.15);
        lionY = H * 0.58;
        legPhase = 0;
        const roarU = clamp01((t - ROAR_AT) / 0.25);
        jawOpen = easeOut(roarU) * (0.85 + 0.15 * Math.sin((t - ROAR_AT) * 12));
        if (!roarTriggered) {
          roarTriggered = true;
          triggerHaptic();
          // انفجار جسيمات عند بداية الزئير
          for (let i = 0; i < 28; i++) {
            spawn(lionX + rnd(-25, 25), lionY - 20 + rnd(-10, 10), i % 3 === 0 ? 1 : 0);
          }
        }
        if (Math.random() < 0.35) {
          spawn(lionX + rnd(-50, 50) * lionScale, lionY + 70 * lionScale, 0);
        }
      } else {
        phase = 'fade';
        lionScale = Math.min(1.35, (Math.min(W, H) / 420) * 1.15);
        lionY = H * 0.58;
        legPhase = 0;
        jawOpen = Math.max(0, 0.5 * (1 - smooth((t - ROAR_END) / 0.3)));
        alpha = 1 - smooth((t - FADE_AT) / (FADE_END - FADE_AT));
      }

      // جسيمات
      for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        p.age += dt;
        if (p.age >= p.life) {
          pts[i] = pts[pts.length - 1];
          pts.pop();
          continue;
        }
        p.vy += 180 * k * dt;
        p.vx *= 0.98;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const a = (1 - p.age / p.life) * alpha;
        if (p.kind === 1) {
          c.fillStyle = `rgba(255,200,80,${0.85 * a})`;
        } else {
          c.fillStyle = `rgba(180,150,110,${0.55 * a})`;
        }
        c.beginPath();
        c.arc(p.x, p.y, p.size * (1 - p.age / p.life * 0.4), 0, Math.PI * 2);
        c.fill();
      }

      // هالة ضوء خلف الأسد أثناء الزئير
      if (phase === 'roar' || (phase === 'fade' && jawOpen > 0.1)) {
        const glow = c.createRadialGradient(lionX, lionY - 10, 10, lionX, lionY, 160 * lionScale);
        glow.addColorStop(0, `rgba(255,180,40,${0.22 * alpha})`);
        glow.addColorStop(0.5, `rgba(200,100,20,${0.1 * alpha})`);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = glow;
        c.fillRect(lionX - 200 * lionScale, lionY - 200 * lionScale, 400 * lionScale, 400 * lionScale);
      }

      drawLion(lionX, lionY, lionScale, phase, t, jawOpen, legPhase, alpha);

      // موجة صدمة خفيفة عند الزئير
      if (t >= ROAR_AT && t < ROAR_AT + 0.6) {
        const ru = (t - ROAR_AT) / 0.6;
        const rr = easeOut(ru) * Math.min(W, H) * 0.55;
        c.strokeStyle = `rgba(255,200,80,${(1 - ru) * 0.35 * alpha})`;
        c.lineWidth = 3 * (1 - ru);
        c.beginPath();
        c.arc(lionX, lionY - 10, rr, 0, Math.PI * 2);
        c.stroke();
      }

      c.restore();

      if (t < TOTAL_S + 0.15) {
        raf = requestAnimationFrame(frame);
      }
    };

    raf = requestAnimationFrame(frame);
    const tDone = window.setTimeout(() => {
      try { doneRef.current?.(); } catch { /* ignore */ }
    }, TOTAL_MS);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(tDone);
      stopSound();
    };
  }, [W, H]);

  return (
    <div
      aria-hidden="true"
      data-gift-overlay="1"
      style={{ position: 'fixed', inset: 0, zIndex: 9400, pointerEvents: 'none', overflow: 'hidden' }}
    >
      <canvas ref={cvRef} style={{ position: 'absolute', inset: 0, width: W || '100%', height: H || '100%', pointerEvents: 'none' }} />
    </div>
  );
}

export const LionGift: GiftDefinition = {
  id: 'lion',
  name: 'Lion',
  price: PRICE,
  durationMs: TOTAL_MS,
  Preview: LionPreview,
  Animation: LionAnimation,
};

export default LionGift;
