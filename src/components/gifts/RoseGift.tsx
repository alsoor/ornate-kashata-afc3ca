/**
 * هدية الوردة (Rose) — 25 Coins — مدتها 6 ثواني
 *
 * - Preview  : داخل مربع الهدايا (المربع الأول بالصف العلوي) وردة حمراء صغيرة متحركة قبل النقر:
 *              تتمايل بنعومة، هالة حمراء تنبض، نجوم صغيرة تلمع، وبتلات تتساقط منها.
 *
 * - Animation (الأرقام بالثواني):
 *     [1] المشاهد → صاحب البث (أو أي هدية بدون مستلم متحدث):
 *         0.0 – 0.75 : وردة حمراء صغيرة تطلع بمنتصف البث (تكبر بقفزة ناعمة) + موجة + شرر
 *         0.75 – 5.1 : تطفو وتتمايل، أشعة ناعمة، بتلات ونجوم تتساقط حولها
 *         5.1 – 6.0  : تكبر شوي وتتلاشى مع انفجار بتلات
 *     [2] صاحب البث → مستخدم (متحدث):
 *         0.0 – 0.8  : صورة المستخدم تصعد بسرعة لمنتصف الشاشة (نفس طريقة البركان) بإطار وردي متوهج
 *         0.45 – 4.9 : ورود تتساقط من فوق على إطار صورته فقط — بعضها يثبت على الإطار ويتزين به
 *                      وبعضها يرتد وينزلق ويسقط (بدون ما تنزل على أزرار البث)
 *         5.0 – 5.9  : الصورة (بورودها) ترجع لمكانها
 *
 * ملف مستقل: الأصوات في src/lib/roseSounds.ts. غيّر الأرقام تحت (السعر/المدد/التوقيتات).
 *
 * ربط الأنميشن بالواجهة (نفس البركان، يعمل تلقائياً):
 *   window.__stooornaGiftLift : (يضعه LiveCoinsDock) بيانات المستلم لو الهدية لمتحدث → وضع [2]
 *   data-gift-user            : على صورة المتحدث بالقائمة → منها تبدأ الصورة بالصعود
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { GiftDefinition } from '../../lib/types';
import { playRoseSound } from '../../lib/roseSounds';

// ── إعدادات الهدية ──────────────────────────────────────────────────────
const PRICE = 25;
const TOTAL_MS = 6000;             // مدة الأنميشن الكلية (6 ثواني)
const TOTAL_S = TOTAL_MS / 1000;

// وضع صاحب البث (الوردة بمنتصف البث)
const HOST_IN_S = 0.75;            // مدة الظهور
const HOST_OUT_S = 0.9;            // مدة التلاشي بالنهاية
const HOST_Y = 0.42;               // ارتفاع الوردة (نسبة من طول الشاشة)

// وضع رفع المستخدم
const RISE_S = 0.8;                // مدة صعود الصورة (سريعة)
const RETURN_AT = 5.0;             // بداية رجوع الصورة
const RETURN_S = 0.9;              // مدة الرجوع
const FALL_START = 0.45;           // بداية تساقط الورود
const FALL_END = 4.9;              // نهاية تساقط الورود
const FALL_RATE = 6.5;             // وردة بالثانية
const MAX_STUCK = 12;              // أقصى عدد ورود تثبت على الإطار
const STICK_CHANCE = 0.7;          // احتمال تثبيت الوردة لما تلمس الإطار
const MIN_GAP = 0.3;               // أقل مسافة زاوية (راديان) بين وردتين ثابتتين

const MAX_FX = 400;                // حد أقصى للجسيمات (للأداء على الجوال)
const PETAL_COL = ['#ff4d6a', '#e0183c', '#c4122f', '#ff7a90'];

// ── أدوات رياضية ────────────────────────────────────────────────────────
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const easeOutBack = (x: number) => { const u = clamp01(x); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); };
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

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

// وردة حمراء (منظر علوي): أوراق خضراء + 3 حلقات بتلات + قلب حلزوني
function makeRoseSprite(px: number): HTMLCanvasElement {
  const s = document.createElement('canvas');
  s.width = px;
  s.height = px;
  const g = s.getContext('2d');
  if (!g) return s;
  const c = px / 2;
  const R = px * 0.42;

  // الأوراق الخضراء
  [2.35, 0.8, -1.57].forEach((ang, i) => {
    g.save();
    g.translate(c, c);
    g.rotate(ang - Math.PI / 2 + Math.PI / 2);
    const gr = g.createLinearGradient(0, 0, 0, R * 1.1);
    gr.addColorStop(0, '#1f7a3a');
    gr.addColorStop(1, '#4cc36c');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(0, R * (i === 2 ? 0.86 : 0.8), R * 0.2, R * 0.34, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(10,70,25,0.55)';
    g.lineWidth = Math.max(1, px * 0.01);
    g.stroke();
    g.restore();
  });

  const petal = (x: number, y: number, r: number, c1: string, c2: string, c3: string) => {
    const gr = g.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r);
    gr.addColorStop(0, c1);
    gr.addColorStop(0.7, c2);
    gr.addColorStop(1, c3);
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = gr;
    g.fill();
    g.lineWidth = Math.max(1, px * 0.012);
    g.strokeStyle = 'rgba(90,0,18,0.55)';
    g.stroke();
  };
  const ring = (n: number, d: number, r: number, off: number, c1: string, c2: string, c3: string) => {
    for (let i = 0; i < n; i++) {
      const a = off + (i * Math.PI * 2) / n;
      petal(c + Math.cos(a) * d, c + Math.sin(a) * d, r, c1, c2, c3);
    }
  };
  ring(7, R * 0.42, R * 0.48, 0, '#e8344f', '#c6112f', '#8e0a20');
  ring(5, R * 0.26, R * 0.38, 0.4, '#f04a62', '#d3203c', '#9a0f27');
  ring(4, R * 0.12, R * 0.28, 0.9, '#ff6b80', '#e02a47', '#a8132c');
  petal(c, c, R * 0.2, '#ff8396', '#e7314e', '#a6112b');

  // حلزون القلب
  g.beginPath();
  for (let a = 0; a <= Math.PI * 4; a += 0.2) {
    const rr = R * 0.03 + (R * 0.17 * a) / (Math.PI * 4);
    const x = c + Math.cos(a) * rr, y = c + Math.sin(a) * rr;
    if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.strokeStyle = 'rgba(100,0,20,0.6)';
  g.lineWidth = Math.max(1, px * 0.012);
  g.stroke();

  // لمعة
  g.fillStyle = 'rgba(255,255,255,0.3)';
  g.beginPath();
  g.ellipse(c - R * 0.32, c - R * 0.4, R * 0.16, R * 0.08, -0.6, 0, Math.PI * 2);
  g.fill();
  return s;
}

let ROSE_URL: string | null = null;
function roseURL(): string {
  if (ROSE_URL) return ROSE_URL;
  if (typeof document === 'undefined') return '';
  try { ROSE_URL = makeRoseSprite(192).toDataURL('image/png'); } catch { ROSE_URL = ''; }
  return ROSE_URL;
}

// ═══════════════════════════════════════════════════════════════════════
//  Preview — وردة صغيرة متحركة داخل مربع الهدايا
// ═══════════════════════════════════════════════════════════════════════
const RG_CSS = `
@keyframes rg-sway{0%,100%{transform:rotate(-7deg) scale(1)}50%{transform:rotate(7deg) scale(1.1)}}
@keyframes rg-glow{0%,100%{opacity:.3;transform:scale(.85)}50%{opacity:.85;transform:scale(1.2)}}
@keyframes rg-twinkle{0%,100%{opacity:0;transform:scale(.2) rotate(0deg)}50%{opacity:1;transform:scale(1) rotate(90deg)}}
@keyframes rg-petal{0%{transform:translate(0,0) rotate(0deg);opacity:0}15%{opacity:.95}100%{transform:translate(var(--dx),var(--dy)) rotate(var(--rot));opacity:0}}
.rg-sway{animation:rg-sway 2.2s ease-in-out infinite;transform-origin:50% 60%}
.rg-glow{animation:rg-glow 1.8s ease-in-out infinite}
.rg-twinkle{animation:rg-twinkle 1.9s ease-in-out infinite}
.rg-petal{animation:rg-petal 3s ease-in infinite}
`;

const STARS: { x: number; y: number; d: number; s: number }[] = [
  { x: 0.1, y: 0.12, d: 0, s: 0.2 },
  { x: 0.88, y: 0.2, d: 0.6, s: 0.16 },
  { x: 0.82, y: 0.82, d: 1.2, s: 0.18 },
  { x: 0.14, y: 0.78, d: 1.6, s: 0.14 },
];
const PETALS: { x: number; dx: number; d: number }[] = [
  { x: 0.42, dx: -0.28, d: 0 },
  { x: 0.56, dx: 0.3, d: 1.0 },
  { x: 0.5, dx: 0.05, d: 2.0 },
];

function RosePreview({ size = 40 }: { size?: number }) {
  const url = useMemo(() => roseURL(), []);
  return (
    <motion.div
      aria-hidden="true"
      animate={{ y: [0, -2, 0] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
      style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
    >
      <style>{RG_CSS}</style>
      {/* الهالة */}
      <span
        className="rg-glow"
        style={{ position: 'absolute', inset: -size * 0.15, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,60,90,0.65) 0%, rgba(255,60,90,0) 70%)' }}
      />
      {/* البتلات المتساقطة */}
      {PETALS.map((p, i) => (
        <span
          key={i}
          className="rg-petal"
          style={{
            position: 'absolute', left: `${p.x * 100}%`, top: '55%',
            width: size * 0.13, height: size * 0.19, borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
            background: i % 2 ? '#ff4d6a' : '#e0183c',
            ['--dx' as string]: `${p.dx * size}px`,
            ['--dy' as string]: `${size * 0.6}px`,
            ['--rot' as string]: `${i % 2 ? 160 : -140}deg`,
            animationDelay: `${p.d}s`,
          } as React.CSSProperties}
        />
      ))}
      {/* الوردة */}
      {url ? (
        <img className="rg-sway" src={url} alt="" draggable={false} style={{ position: 'relative', width: size, height: size, display: 'block', filter: 'drop-shadow(0 0 5px rgba(255,50,80,0.6))' }} />
      ) : (
        <span style={{ fontSize: size * 0.8, lineHeight: 1 }}>🌹</span>
      )}
      {/* نجوم تلمع */}
      {STARS.map((s, i) => (
        <span
          key={i}
          className="rg-twinkle"
          style={{
            position: 'absolute', left: `${s.x * 100}%`, top: `${s.y * 100}%`,
            width: size * s.s, height: size * s.s, background: '#fff',
            clipPath: 'polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%)',
            filter: 'drop-shadow(0 0 3px rgba(255,150,170,0.95))',
            animationDelay: `${s.d}s`,
          }}
        />
      ))}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  Animation — أنميشن ملء الشاشة (Canvas)
// ═══════════════════════════════════════════════════════════════════════
interface Pa {
  k: 0 | 1;                      // 0 بتلة، 1 نجمة
  x: number; y: number; vx: number; vy: number;
  rot: number; vr: number; size: number; life: number; age: number;
  grav: number; seed: number; col: string;
}
interface FRose {
  x: number; y: number; vx: number; vy: number; rot: number; vr: number;
  sf: number;                    // حجم الوردة كنسبة من نصف قطر الصورة
  state: 0 | 1 | 2;              // 0 تسقط، 1 ثابتة على الإطار، 2 ارتدت وتسقط
  a: number; stuckAt: number; age: number;
}
interface Lift { sx: number; sy: number; sr: number; ex: number; ey: number; R: number; img: HTMLImageElement | null; letter: string; name: string; restore: () => void; done?: boolean; }
interface LiftInfo { userId: string; name?: string; avatarUrl?: string | null; }

// وضع الرفع: الهدية لمتحدث → صورته تصعد لمنتصف البث (المعلومات يحطها LiveCoinsDock)
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

function RoseAnimation({ onDone }: { onDone: () => void }) {
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

    const ROSE = makeRoseSprite(160);
    const GLOW = makeGlow('255,50,80', 0.3);
    const GLOW2 = makeGlow('255,170,190', 0.25);
    const blob = (sp: HTMLCanvasElement, x: number, y: number, r: number, a: number) => {
      if (a <= 0.003 || r <= 0.2) return;
      c.globalAlpha = Math.min(1, a);
      c.drawImage(sp, x - r, y - r, r * 2, r * 2);
    };

    const snd = playRoseSound({ mode: L ? 'lift' : 'host', totalS: TOTAL_S });

    // ── الجسيمات (بتلات + نجوم) ──
    const parts: Pa[] = [];
    const addPart = (p: Omit<Pa, 'age' | 'seed' | 'col' | 'rot' | 'vr'> & Partial<Pick<Pa, 'rot' | 'vr'>>) => {
      if (parts.length >= MAX_FX) return;
      parts.push({ rot: rnd(0, 6.28), vr: rnd(-4, 4), ...p, age: 0, seed: rnd(0, 6.28), col: PETAL_COL[Math.floor(Math.random() * PETAL_COL.length)] });
    };
    const burst = (x: number, y: number, nPetal: number, nStar: number, spd: number) => {
      for (let i = 0; i < nPetal; i++) {
        const a = rnd(0, Math.PI * 2), sp = rnd(0.35, 1) * spd;
        addPart({ k: 0, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30 * k, size: rnd(5, 10) * k, life: rnd(1.1, 2), grav: 160 * k });
      }
      for (let i = 0; i < nStar; i++) {
        const a = rnd(0, Math.PI * 2), sp = rnd(0.2, 0.9) * spd;
        addPart({ k: 1, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: rnd(6, 13) * k, life: rnd(0.45, 0.9), grav: 0 });
      }
    };
    const drawPetal = (p: Pa, alpha: number) => {
      const flip = Math.cos(p.age * 5 + p.seed);
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.scale(Math.max(0.2, Math.abs(flip)), 1);
      c.globalAlpha = alpha;
      c.fillStyle = p.col;
      const r = p.size;
      c.beginPath();
      c.moveTo(0, -r);
      c.bezierCurveTo(r * 0.9, -r * 0.4, r * 0.7, r * 0.7, 0, r);
      c.bezierCurveTo(-r * 0.7, r * 0.7, -r * 0.9, -r * 0.4, 0, -r);
      c.fill();
      c.restore();
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
        if (p.age >= p.life || p.y > H + 30) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
        p.vy += p.grav * dt;
        p.vx *= 1 - 0.8 * dt;
        if (p.k === 0) {
          p.x += (p.vx + Math.sin(p.age * 3 + p.seed) * 38 * k) * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          const u = p.age / p.life;
          drawPetal(p, (1 - smooth((u - 0.6) / 0.4)) * fade);
        } else {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          const u = p.age / p.life;
          c.save();
          c.globalCompositeOperation = 'lighter';
          blob(GLOW2, p.x, p.y, p.size * 1.8, 0.5 * Math.sin(Math.PI * u) * fade);
          drawStar(p.x, p.y, p.size * (0.6 + 0.4 * Math.sin(Math.PI * u)), Math.sin(Math.PI * u) * fade, p.rot * 0.3);
          c.restore();
        }
      }
      c.globalAlpha = 1;
    };

    // ── ورود تسقط على إطار الصورة (وضع الرفع) ──
    const roses: FRose[] = [];
    let stuckCount = 0;
    const acc = { fall: 0, petal: 0, spark: 0 };
    let introDone = false;
    let outroDone = false;

    const drawRose = (x: number, y: number, size: number, rot: number, alpha: number) => {
      c.save();
      c.translate(x, y);
      c.rotate(rot);
      c.globalAlpha = alpha;
      c.drawImage(ROSE, -size / 2, -size / 2, size, size);
      c.restore();
    };

    let raf = 0;
    const t0 = performance.now();
    let last = t0;

    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;

      if (!L) {
        // ═══ وضع [1]: وردة بمنتصف البث ═══
        const cx = W * 0.5;
        const S = Math.min(Math.max(W * 0.28, 90), 130);
        const inT = t / HOST_IN_S;
        const outT = clamp01((t - (TOTAL_S - HOST_OUT_S)) / HOST_OUT_S);
        const al = clamp01(t / 0.2) * (1 - smooth(outT));
        const bob = Math.sin(t * 2.2) * 6 * k;
        const cy = H * HOST_Y + bob;
        const sc = easeOutBack(inT) * (1 + outT * 0.35) * (1 + 0.03 * Math.sin(t * 4.5));
        const rot = lerp(-0.6, 0, easeOut(inT)) + Math.sin(t * 1.6) * 0.06;

        // تعتيم خفيف ليركز على الوردة
        const vg = c.createRadialGradient(cx, cy, S * 0.4, cx, cy, Math.max(W, H) * 0.7);
        vg.addColorStop(0, 'rgba(60,0,15,0)');
        vg.addColorStop(1, 'rgba(25,0,8,0.38)');
        c.globalAlpha = al;
        c.fillStyle = vg;
        c.fillRect(0, 0, W, H);

        // أشعة ناعمة + هالة
        c.save();
        c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 10; i++) {
          const a = t * 0.4 + (i * Math.PI * 2) / 10;
          const len = S * 1.7, w = 0.11;
          c.globalAlpha = 0.09 * al;
          c.fillStyle = 'rgba(255,90,110,1)';
          c.beginPath();
          c.moveTo(cx, cy);
          c.lineTo(cx + Math.cos(a - w) * len, cy + Math.sin(a - w) * len);
          c.lineTo(cx + Math.cos(a + w) * len, cy + Math.sin(a + w) * len);
          c.closePath();
          c.fill();
        }
        blob(GLOW, cx, cy, S * 1.7 * (1 + outT * 0.3), 0.6 * al * (0.85 + 0.15 * Math.sin(t * 5)));
        c.restore();
        c.globalAlpha = 1;

        // موجة الظهور
        if (t < 0.9) {
          const u = t / 0.9;
          c.beginPath();
          c.arc(cx, cy, lerp(S * 0.3, S * 2.4, easeOut(u)), 0, Math.PI * 2);
          c.lineWidth = 3 * k;
          c.strokeStyle = `rgba(255,120,140,${(1 - u) * 0.7})`;
          c.stroke();
        }

        // الوردة
        if (al > 0.003) drawRose(cx, cy, S * sc, rot, al);

        // انفجار الظهور/النهاية
        if (!introDone && t >= 0.1) { introDone = true; burst(cx, cy, 14, 10, 260 * k); }
        if (!outroDone && t >= TOTAL_S - HOST_OUT_S) { outroDone = true; burst(cx, cy, 22, 8, 300 * k); }

        // بتلات ونجوم مستمرة
        if (t > 0.35 && t < TOTAL_S - HOST_OUT_S) {
          acc.petal += dt * 7;
          while (acc.petal >= 1) {
            acc.petal--;
            addPart({ k: 0, x: cx + rnd(-0.4, 0.4) * S, y: cy + rnd(-0.2, 0.3) * S, vx: rnd(-30, 30) * k, vy: rnd(10, 50) * k, size: rnd(5, 9) * k, life: rnd(1.6, 2.6), grav: 60 * k });
          }
        }
        if (t > 0.2 && t < TOTAL_S - 0.5) {
          acc.spark += dt * 11;
          while (acc.spark >= 1) {
            acc.spark--;
            const a = rnd(0, Math.PI * 2), rr = S * rnd(0.45, 0.9);
            addPart({ k: 1, x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr, vx: 0, vy: -rnd(5, 20) * k, size: rnd(5, 11) * k, life: rnd(0.5, 1), grav: 0 });
          }
        }
        stepParts(dt, 1);
      } else {
        // ═══ وضع [2]: صورة المستخدم تصعد والورود تسقط على إطارها ═══
        const up = easeOut(t / RISE_S);
        const down = smooth((t - RETURN_AT) / RETURN_S);
        const e2 = up * (1 - down);
        if (down >= 1 && !L.done) { L.done = true; L.restore(); }

        if (e2 > 0.004) {
          const ax = lerp(L.sx, L.ex, e2);
          const ay = lerp(L.sy, L.ey, e2) + Math.sin(t * 2.6) * 3 * k * e2;
          const ar = lerp(L.sr, L.R, e2);
          const rs = ar / L.R;

          // تعتيم وردي خفيف خلف الصورة
          const vg = c.createRadialGradient(ax, ay, ar, ax, ay, Math.max(W, H) * 0.75);
          vg.addColorStop(0, 'rgba(70,0,20,0)');
          vg.addColorStop(1, 'rgba(25,0,8,0.3)');
          c.globalAlpha = e2;
          c.fillStyle = vg;
          c.fillRect(0, 0, W, H);

          // هالة حمراء
          c.save();
          c.globalCompositeOperation = 'lighter';
          blob(GLOW, ax, ay, ar * 2.4, 0.4 * e2 * (0.85 + 0.15 * Math.sin(t * 5)));
          c.restore();

          // الصورة بالدائرة
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
            c.fillStyle = '#3a1220';
            c.fillRect(ax - ar, ay - ar, ar * 2, ar * 2);
            c.fillStyle = '#ff6b84';
            c.font = `800 ${Math.round(ar * 1.0)}px sans-serif`;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(L.letter, ax, ay + ar * 0.04);
          }
          c.restore();
          // الإطار
          c.beginPath();
          c.arc(ax, ay, ar, 0, Math.PI * 2);
          c.lineWidth = Math.max(2, ar * 0.07);
          c.strokeStyle = 'rgba(255,90,120,0.95)';
          c.shadowColor = 'rgba(255,40,80,0.9)';
          c.shadowBlur = 14 * e2;
          c.stroke();
          c.restore();

          // اسم المستلم
          if (e2 > 0.5) {
            c.save();
            c.globalAlpha = clamp01((e2 - 0.5) * 2);
            c.font = `800 ${Math.round(Math.max(12, ar * 0.3))}px sans-serif`;
            c.textAlign = 'center';
            c.textBaseline = 'top';
            c.shadowColor = 'rgba(0,0,0,0.9)';
            c.shadowBlur = 6;
            c.fillStyle = '#ffe3e8';
            c.fillText(L.name.length > 18 ? L.name.slice(0, 17) + '…' : L.name, ax, ay + ar + 10 * k);
            c.restore();
          }

          // تساقط ورود جديدة
          if (t > FALL_START && t < FALL_END && e2 > 0.2) {
            acc.fall += dt * FALL_RATE;
            while (acc.fall >= 1) {
              acc.fall--;
              const sf = rnd(0.42, 0.6);
              roses.push({
                x: L.ex + rnd(-1.05, 1.05) * L.R, y: -sf * L.R,
                vx: rnd(-14, 14) * k, vy: rnd(60, 140) * k,
                rot: rnd(0, 6.28), vr: rnd(-2.5, 2.5), sf, state: 0, a: 0, stuckAt: 0, age: 0,
              });
            }
          }

          // فيزياء الورود
          const GRAV = 520 * k;
          for (let i = roses.length - 1; i >= 0; i--) {
            const r = roses[i];
            r.age += dt;
            if (r.state === 1) {
              // ثابتة على الإطار: تلتصق بمحيط الصورة (تتحرك معها)
              const dd = ar + r.sf * L.R * rs * 0.12;
              const px = ax + Math.cos(r.a) * dd, py = ay + Math.sin(r.a) * dd;
              const pop = 1 + 0.4 * Math.exp(-(t - r.stuckAt) * 9);
              drawRose(px, py, r.sf * L.R * rs * pop, r.a + Math.PI / 2 + r.vr * 0.05, clamp01(e2 * 3));
              continue;
            }
            r.vy += GRAV * dt;
            r.x += r.vx * dt;
            r.y += r.vy * dt;
            r.rot += r.vr * dt;
            if (r.y > H + 60 || r.x < -60 || r.x > W + 60) { roses[i] = roses[roses.length - 1]; roses.pop(); continue; }

            if (r.state === 0 && r.vy > 0) {
              const dx = r.x - ax, dy = r.y - ay;
              const dist = Math.hypot(dx, dy);
              const sz = r.sf * L.R;
              if (dist < ar + sz * 0.35 && dy < ar * 0.35) {
                const a = Math.atan2(dy, dx);
                let gapOk = true;
                for (const o of roses) {
                  if (o.state === 1) {
                    let dA = Math.abs(o.a - a);
                    if (dA > Math.PI) dA = Math.PI * 2 - dA;
                    if (dA < MIN_GAP) { gapOk = false; break; }
                  }
                }
                if (stuckCount < MAX_STUCK && gapOk && Math.random() < STICK_CHANCE) {
                  // تثبت على الإطار
                  r.state = 1;
                  r.a = a;
                  r.stuckAt = t;
                  stuckCount++;
                  const sx2 = ax + Math.cos(a) * ar, sy2 = ay + Math.sin(a) * ar;
                  burst(sx2, sy2, 4, 4, 140 * k);
                  snd.land();
                } else {
                  // ترتد وتنزلق وتسقط
                  const nx = Math.cos(a), ny = Math.sin(a);
                  const vn = r.vx * nx + r.vy * ny;
                  r.vx -= 1.4 * vn * nx;
                  r.vy -= 1.4 * vn * ny;
                  r.vx += (nx >= 0 ? 1 : -1) * rnd(30, 90) * k;
                  r.x = ax + nx * (ar + sz * 0.4);
                  r.y = ay + ny * (ar + sz * 0.4);
                  r.state = 2;
                  burst(r.x, r.y, 2, 2, 100 * k);
                }
              }
            }
            drawRose(r.x, r.y, r.sf * L.R, r.rot, 1);
          }

          // نجوم تلمع حول الإطار
          acc.spark += dt * 9 * e2;
          while (acc.spark >= 1) {
            acc.spark--;
            const a = rnd(0, Math.PI * 2), rr = ar * rnd(1.05, 1.5);
            addPart({ k: 1, x: ax + Math.cos(a) * rr, y: ay + Math.sin(a) * rr, vx: 0, vy: -rnd(5, 18) * k, size: rnd(5, 10) * k, life: rnd(0.5, 1), grav: 0 });
          }
          stepParts(dt, clamp01(e2 * 2));
        } else {
          // الصورة رجعت: ما بقى شي يتحرك
          stepParts(dt, 0);
        }
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

export const RoseGift: GiftDefinition = {
  id: 'rose',
  name: 'Rose',
  price: PRICE,
  durationMs: TOTAL_MS,
  Preview: RosePreview,
  Animation: RoseAnimation,
};

export default RoseGift;
