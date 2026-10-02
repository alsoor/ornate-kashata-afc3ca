/**
 * هدية الذئب (Wolf) — 6,000 Coins — مدتها ~24 ثانية
 *
 * - Preview  : داخل مربع الهدايا ذئب أسود يعوي للقمر قبل النقر: رأسه يرتفع ويهبط، موجات صوت تخرج من فمه،
 *              نجوم تلمع، القمر يتوهج، برق خفيف يومض، وضباب يمر عند الأرض.
 * - Animation: (الأرقام بالثواني)
 *     0.0 – 1.8  : البث يغرق بالظلام + رياح ليل + نجوم تظهر واحدة واحدة + قمر ومجرّات خافتة + شهب
 *     1.6 – 2.8  : نبض قلب منخفض (توتر) وضباب يزحف من الأرض
 *     3.0        : الذئب يدخل من الضباب (ملف الفيديو يشتغل بصوته الأصلي كما هو — الصرخة تطلع واضحة)
 *     3.0 – 19.7 : رعد وبرق بالسماء + ذرات نور باردة وغبار نجوم ينزل على أزرار البث (تتوهج بالجليد)
 *     13.4 – 18  : موجات صدمة باردة مع كل صرخة + اهتزاز خفيف للشاشة
 *     بعد نهاية الفيديو : الذئب يذوب بالضباب، الإضاءة ترجع طبيعية
 *                  • لو الهدية من صاحب البث إلى مستخدم: إطار صورة المستخدم يرتفع لمنتصف الشاشة
 *                  • لو الهدية لصاحب البث: هالة قمر وشرارات ذهبية على صورته
 *
 * إخفاء أن الذئب فيديو: الفيديو ما يظهر نهائياً كمستطيل؛ نقرأ كل إطار ونفصل الذئب الأسود عن سماء الفيديو
 * (قناع حسب العتمة + أكبر كتلة متصلة + سد الفجوات للعيون والأنياب)، ونرسمه فقط فوق سماء/ضباب/برق من رسمنا.
 * صوت الفيديو يشتغل كما هو من عنصر الفيديو نفسه.
 *
 * ⚠️ لازم تحط ملف الفيديو في:  public/gifts/wolf-howl.mp4   (أو غيّر WOLF_VIDEO_SRC تحت)
 *
 * ملف مستقل: الأصوات المساندة في src/lib/wolfSounds.ts. غيّر الأرقام تحت (السعر/المدد/التوقيتات).
 *
 * ربط الأنميشن بالواجهة (يعمل تلقائياً بدونها — نفس نظام البركان):
 *   data-gift-host : على صورة/بروفايل صاحب البث → الهالة الذهبية تنزل عليه. (الافتراضي: أعلى منتصف الشاشة)
 *   data-gift-user : (موجود بصور المتحدثين) + window.__stooornaGiftLift يضعه LiveCoinsDock لما الهدية لمتحدث
 *   الغبار النجمي ينزل تلقائياً على: button, [role=button], a[href], input, textarea, select
 */
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { GiftDefinition } from '../../lib/types';
import { createWolfSound } from '../../lib/wolfSounds';

// ── إعدادات الهدية ──────────────────────────────────────────────────────
const PRICE = 6000;
const TOTAL_MS = 24500;               // مدة الهدية الكلية التقريبية (التوقيت الفعلي يتبع طول الفيديو)
const WOLF_VIDEO_SRC = '/gifts/wolf-howl.mp4';   // مسار الفيديو (داخل public)

const DARK_IN = 1.8;                  // مدة الغرق بالظلام
const DARK_MAX = 0.93;                // قوة الظلام (1 = أسود كامل)
const VIDEO_AT = 3.0;                 // دخول الذئب
const VIDEO_LEN = 16.75;              // طول الفيديو الافتراضي (يُقرأ من الفيديو نفسه إذا توفر)
const WAIT_MAX = 4.0;                 // أقصى انتظار لتحميل الفيديو قبل الاستمرار بدونه
const POST_UP = 1.8;                  // مدة صعود إطار المستخدم لمنتصف الشاشة بعد نهاية الفيديو
const POST_DOWN_AT = 3.5;             // بداية اختفاء الإطار
const POST_END = 4.3;                 // نهاية الهدية بعد نهاية الفيديو
const HOWL_RINGS = [10.4, 12.0, 13.6, 15.2];       // (بالثواني داخل الفيديو) موجات الصرخة
const LIGHTNING_REL = [1.4, 4.2, 7.0, 9.6, 12.4, 14.8]; // (نسبة لبداية الفيديو) برق السماء
const INTRO_SPARKLES = [0.7, 1.1, 1.5, 1.9, 2.2, 2.5, 2.8];
const INTRO_HEARTBEATS = [1.6, 2.4];

const MAX_FX = 900;                   // حد أقصى للجسيمات (للأداء على الجوال)
const HOT_SEL = 'button, [role="button"], a[href], input, textarea, select, [data-gift-host], [data-gift-walk], [data-gift-hot]';

const ICE_RGB = ['255,255,255', '206,232,255', '146,196,255', '92,136,236', '48,70,172'];
const GOLD_RGB = ['255,250,214', '255,224,124', '255,190,64', '214,138,24'];

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

// <MASK> ═════════════════════════════════════════════════════════════════
//  فصل الذئب عن سماء الفيديو (يعمل على نسخة صغيرة من الإطار — خفيف على الجوال)
// ═══════════════════════════════════════════════════════════════════════
const MASK_THRESH = 52;   // الأقل من هذه العتمة = جسم الذئب (السماء أفتح بكثير)
const MASK_CLOSE_R = 2;   // سد الفجوات الصغيرة (عيون/أنياب)

interface MaskWork {
  bin: Uint8Array; tmp: Uint8Array; lab: Uint16Array; stack: Int32Array; sizes: Uint32Array; soft: Uint8Array;
}
function makeMaskWork(w: number, h: number): MaskWork {
  return {
    bin: new Uint8Array(w * h), tmp: new Uint8Array(w * h), lab: new Uint16Array(w * h),
    stack: new Int32Array(w * h), sizes: new Uint32Array(4096), soft: new Uint8Array(w * h),
  };
}
// تمدد/انكماش (نافذة مربعة r) — خارج الحدود: التمدد يعتبرها 0 والانكماش يعتبرها 1 (عشان الحواف ما تأكل)
function morph(src: Uint8Array, dst: Uint8Array, tmp: Uint8Array, w: number, h: number, r: number, dilate: boolean) {
  const edge = dilate ? 0 : 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let v = dilate ? 0 : 1;
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        const s = xx < 0 || xx >= w ? edge : src[row + xx];
        if (dilate ? s > v : s < v) v = s;
      }
      tmp[row + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = dilate ? 0 : 1;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        const s = yy < 0 || yy >= h ? edge : tmp[yy * w + x];
        if (dilate ? s > v : s < v) v = s;
      }
      dst[y * w + x] = v;
    }
  }
}
/** rgba: بيانات الإطار المصغّر — out: RGBA بقناة ألفا فقط (الذئب = 255) */
function buildWolfMask(rgba: Uint8ClampedArray, w: number, h: number, ws: MaskWork, out: Uint8ClampedArray) {
  const n = w * h;
  const { bin, tmp, lab, stack, sizes, soft } = ws;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    bin[i] = ((rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8) < MASK_THRESH ? 1 : 0;
  }
  morph(bin, bin, tmp, w, h, MASK_CLOSE_R, true);    // closing = تمدد ثم انكماش
  morph(bin, bin, tmp, w, h, MASK_CLOSE_R, false);

  // أكبر كتلة متصلة (جسم الذئب) — نتجاهل بقع الغيوم الداكنة المنفصلة
  lab.fill(0);
  let nl = 0;
  let best = 0;
  let bestSize = 0;
  for (let i = 0; i < n; i++) {
    if (!bin[i] || lab[i]) continue;
    if (nl >= 4094) break;
    nl++;
    let sp = 0;
    let size = 0;
    stack[sp++] = i;
    lab[i] = nl;
    while (sp > 0) {
      const j = stack[--sp];
      size++;
      const x = j % w;
      if (x > 0 && bin[j - 1] && !lab[j - 1]) { lab[j - 1] = nl; stack[sp++] = j - 1; }
      if (x < w - 1 && bin[j + 1] && !lab[j + 1]) { lab[j + 1] = nl; stack[sp++] = j + 1; }
      if (j >= w && bin[j - w] && !lab[j - w]) { lab[j - w] = nl; stack[sp++] = j - w; }
      if (j < n - w && bin[j + w] && !lab[j + w]) { lab[j + w] = nl; stack[sp++] = j + w; }
    }
    sizes[nl] = size;
    if (size > bestSize) { bestSize = size; best = nl; }
  }
  for (let i = 0; i < n; i++) soft[i] = best && lab[i] === best ? 255 : 0;

  // تنعيم الحواف [1 2 1] أفقي ثم عمودي
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const a = x > 0 ? soft[i - 1] : soft[i];
      const b = x < w - 1 ? soft[i + 1] : soft[i];
      tmp[i] = (a + 2 * soft[i] + b) >> 2;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const a = y > 0 ? tmp[i - w] : tmp[i];
      const b = y < h - 1 ? tmp[i + w] : tmp[i];
      const o = i * 4;
      out[o] = 0;
      out[o + 1] = 0;
      out[o + 2] = 0;
      out[o + 3] = (a + 2 * tmp[i] + b) >> 2;
    }
  }
}
// </MASK> ════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
//  Preview — ذئب يعوي للقمر داخل مربع الهدايا
// ═══════════════════════════════════════════════════════════════════════
const WG_CSS = `
@keyframes wg-howl{0%,12%{transform:rotate(-5deg)}34%,68%{transform:rotate(5deg)}90%,100%{transform:rotate(-5deg)}}
@keyframes wg-tw{0%,100%{opacity:.25;transform:scale(.7)}50%{opacity:1;transform:scale(1.25)}}
@keyframes wg-moon{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:.95;transform:scale(1.12)}}
@keyframes wg-wave{0%,28%{opacity:0;transform:scale(.35)}40%{opacity:.85}78%{opacity:0;transform:scale(1.7)}100%{opacity:0;transform:scale(1.7)}}
@keyframes wg-bolt{0%,86%,100%{opacity:0}88%{opacity:1}90%{opacity:.15}92%{opacity:.95}96%{opacity:0}}
@keyframes wg-mist{0%{transform:translateX(-8px);opacity:.25}50%{opacity:.6}100%{transform:translateX(8px);opacity:.25}}
@keyframes wg-eye{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes wg-rim{0%,100%{filter:drop-shadow(0 0 2px rgba(130,190,255,.35))}50%{filter:drop-shadow(0 0 6px rgba(160,210,255,.95))}}
.wg-howl{animation:wg-howl 5s ease-in-out infinite;transform-box:view-box;transform-origin:30px 108px}
.wg-tw{animation:wg-tw 2.2s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}
.wg-moon{animation:wg-moon 3.4s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}
.wg-wave{animation:wg-wave 5s ease-out infinite;transform-box:fill-box;transform-origin:0% 100%}
.wg-bolt{animation:wg-bolt 4.6s linear infinite}
.wg-mist{animation:wg-mist 4s ease-in-out infinite alternate}
.wg-eye{animation:wg-eye 1.6s ease-in-out infinite}
.wg-rim{animation:wg-rim 2.4s ease-in-out infinite}
`;

const WOLF_PATH =
  'M16 112 C18 98 22 86 27 76 C31 68 33 62 34 55 L31 40 L38 46 L40 34 L45 30 L48 38 L47 22 L54 30 L57 38 ' +
  'C62 34 67 28 72 22 C76 17 80 12 83 8 L87 6 C89 8 89 11 87 14 L85 18 C83 21 80 24 78 27 L82 29 ' +
  'C79 32 75 34 72 37 C71 42 69 48 65 52 C61 56 59 60 59 65 L62 71 L57 75 L62 83 L58 89 L64 97 L60 104 L66 112 Z';

const PREVIEW_STARS: { x: number; y: number; r: number; d: number }[] = [
  { x: 10, y: 14, r: 1.3, d: 0 }, { x: 24, y: 8, r: 1, d: 0.6 }, { x: 40, y: 16, r: 1.1, d: 1.2 },
  { x: 58, y: 6, r: 1.2, d: 0.3 }, { x: 92, y: 40, r: 1, d: 0.9 }, { x: 8, y: 40, r: 0.9, d: 1.5 },
  { x: 66, y: 52, r: 0.8, d: 0.2 }, { x: 94, y: 14, r: 1.1, d: 1.8 },
];

function WolfPreview({ size = 72 }: { size?: number }) {
  const uid = React.useId().replace(/:/g, '');
  const h = Math.round(size * 1.3);
  const w = Math.round((h * 100) / 112);
  const ref = (n: string) => `url(#${n}${uid})`;
  // مزامنة الفيديو المسبق مع أول عرض للمربع (يجهّز الفيديو بالكاش قبل ما ينقر المستخدم)
  useEffect(() => { warmWolfVideo(); }, []);
  return (
    <motion.div
      aria-hidden="true"
      animate={{ y: [0, -2, 0] }}
      transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
      style={{ position: 'relative', width: w, height: h, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <style>{WG_CSS}</style>
      <svg width={w} height={h} viewBox="0 0 100 112" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <radialGradient id={`sky${uid}`} cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#2a3f8f" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#0a1030" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`moon${uid}`} cx="40%" cy="38%" r="70%">
            <stop offset="0%" stopColor="#fffbe8" />
            <stop offset="100%" stopColor="#c9dcf5" />
          </radialGradient>
          <radialGradient id={`halo${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#bcd8ff" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#6a8cff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`fur${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1b2236" />
            <stop offset="100%" stopColor="#05060b" />
          </linearGradient>
        </defs>

        <circle cx="50" cy="52" r="46" fill={ref('sky')} />

        {PREVIEW_STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#e8f0ff" className="wg-tw" style={{ animationDelay: `${s.d}s` }} />
        ))}

        {/* القمر */}
        <circle cx="78" cy="22" r="22" fill={ref('halo')} className="wg-moon" />
        <circle cx="78" cy="22" r="12.5" fill={ref('moon')} />
        <circle cx="74" cy="19" r="2.2" fill="#9fb3d6" fillOpacity="0.35" />
        <circle cx="81" cy="26" r="1.6" fill="#9fb3d6" fillOpacity="0.3" />

        {/* برق خفيف */}
        <polyline className="wg-bolt" points="14,2 10,16 15,16 8,34" fill="none" stroke="#e6f0ff" strokeWidth="1.4" strokeLinejoin="round" />

        {/* موجات الصوت من الفم */}
        <g transform="translate(88 8)">
          {[0, 0.35, 0.7].map((d, i) => (
            <path key={i} d={`M-6 -2 A ${8 + i * 4} ${8 + i * 4} 0 0 1 ${2 + i * 2} ${6 + i * 3}`} fill="none" stroke="#cfe3ff" strokeWidth="1.2" strokeLinecap="round"
              className="wg-wave" style={{ animationDelay: `${d}s` }} />
          ))}
        </g>

        {/* الذئب */}
        <g className="wg-howl">
          <path d={WOLF_PATH} fill={ref('fur')} className="wg-rim" />
          <ellipse cx="67" cy="29.5" rx="1.7" ry="1" fill="#d6f2ff" className="wg-eye" />
        </g>

        {/* ضباب عند الأرض */}
        <ellipse cx="40" cy="108" rx="40" ry="6" fill="#9db6e6" className="wg-mist" />
        <ellipse cx="70" cy="111" rx="30" ry="5" fill="#b8ccf2" className="wg-mist" style={{ animationDelay: '1.3s' }} />
      </svg>
    </motion.div>
  );
}

// ── فيديو مشترك يُفتح (unlock) من أول لمسة بالتطبيق، عشان يشتغل أوتوماتك بصوته بدون أي منع من المتصفح ──
let sharedVideo: HTMLVideoElement | null = null;
let primed = false;
function getWolfVideo(): HTMLVideoElement {
  if (!sharedVideo) {
    const v = document.createElement('video');
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.preload = 'auto';
    v.muted = true;
    v.src = WOLF_VIDEO_SRC;
    v.style.cssText = 'position:absolute;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    sharedVideo = v;
  }
  return sharedVideo;
}
function primeWolfVideo() {
  if (primed) return;
  primed = true;
  try {
    const v = getWolfVideo();
    v.muted = true;
    const p = v.play();
    const reset = () => { try { v.pause(); v.currentTime = 0; } catch { /* ignore */ } };
    if (p && typeof p.then === 'function') p.then(reset).catch(() => { primed = false; });
    else reset();
  } catch { primed = false; }
}
let warmed = false;
function warmWolfVideo() {
  if (warmed || typeof window === 'undefined') return;
  warmed = true;
  try { getWolfVideo().load(); } catch { /* ignore */ }
  // أول لمسة بأي مكان بالتطبيق تجهّز الفيديو والصوت — بعدها الهدية تشتغل تلقائياً بدون منع
  const unlock = () => {
    primeWolfVideo();
    if (primed) {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('touchend', unlock, true);
      window.removeEventListener('click', unlock, true);
    }
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('touchend', unlock, true);
  window.addEventListener('click', unlock, true);
}
// يشتغل من تحميل الملف نفسه (قبل ما يفتح المستخدم نافذة الهدايا)
if (typeof window !== 'undefined') warmWolfVideo();

// ═══════════════════════════════════════════════════════════════════════
//  Animation — أنميشن ملء الشاشة (Canvas + الفيديو مفصول عن خلفيته)
// ═══════════════════════════════════════════════════════════════════════
interface Pt {
  k: 0 | 2 | 3;                // 0 ذرة نور باردة، 2 غبار نجمي (ينزل على الأزرار)، 3 شرارة ذهبية
  x: number; y: number; px: number; py: number; vx: number; vy: number;
  size: number; grow: number; life: number; age: number;
  grav: number; drag: number; wind: number; seed: number; stuck: number;
}
interface Hot { el: Element; x: number; y: number; w: number; h: number; rad: number; heat: number; }
interface Lift { sx: number; sy: number; sr: number; ex: number; ey: number; R: number; img: HTMLImageElement | null; letter: string; name: string; restore: () => void; done?: boolean; }
interface LiftInfo { userId: string; name?: string; avatarUrl?: string | null; }
interface Host { x: number; y: number; w: number; h: number; top: number; lift?: Lift; }
interface Ring { x: number; y: number; born: number; dur: number; maxR: number; w: number; }
interface Shoot { x: number; y: number; vx: number; vy: number; age: number; life: number; len: number; }

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

// وضع الرفع: الهدية لمتحدث (مو لصاحب البث) → إطار صورته يرتفع لمنتصف الشاشة بعد نهاية الفيديو
// معلومات المستلم يحطها LiveCoinsDock في window.__stooornaGiftLift
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
    const ey = H * 0.45;                       // منتصف الشاشة
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

function WolfAnimation({ onDone }: { onDone: () => void }) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const cvRef = useRef<HTMLCanvasElement>(null);
  const holdRef = useRef<HTMLDivElement>(null);

  const [{ W, H }] = useState(() => ({
    W: typeof window !== 'undefined' ? window.innerWidth : 360,
    H: typeof window !== 'undefined' ? window.innerHeight : 640,
  }));

  useEffect(() => {
    const cv = cvRef.current;
    const hold = holdRef.current;
    if (!cv || !hold) return;
    const vid = getWolfVideo();
    try { hold.appendChild(vid); } catch { /* ignore */ }
    const c = cv.getContext('2d');
    if (!c) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    const k = Math.max(0.75, H / 700);

    // ── الفيديو (يُحمّل من الآن، ويشتغل بصوته الأصلي عند VIDEO_AT) ──
    vid.setAttribute('playsinline', '');
    vid.setAttribute('webkit-playsinline', '');
    vid.preload = 'auto';
    vid.muted = false;
    vid.volume = 1;
    if (vid.getAttribute('src') !== WOLF_VIDEO_SRC) vid.src = WOLF_VIDEO_SRC;
    let started = false;
    let vFailed = false;
    let vEnded = false;
    const onVidErr = () => { vFailed = true; };
    const onVidEnd = () => { vEnded = true; };
    vid.addEventListener('error', onVidErr);
    vid.addEventListener('ended', onVidEnd);
    try { vid.load(); } catch { /* ignore */ }

    const startVideo = () => {
      started = true;
      try { vid.currentTime = 0; } catch { /* ignore */ }
      const p = vid.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          // المتصفح منع الصوت التلقائي: نشغّل صامت ونرجّع الصوت عند أول لمسة
          vid.muted = true;
          vid.play().catch(() => { vFailed = true; });
          const unmute = () => { try { vid.muted = false; } catch { /* ignore */ } };
          window.addEventListener('pointerdown', unmute, { once: true });
          window.addEventListener('touchstart', unmute, { once: true });
        });
      }
    };

    // ── فصل الذئب عن سماء الفيديو ──
    const WV_W = 540, WV_H = 960;
    const MW = 144, MH = 256;
    const wolfCv = document.createElement('canvas');
    wolfCv.width = WV_W;
    wolfCv.height = WV_H;
    const wc = wolfCv.getContext('2d');
    const lowCv = document.createElement('canvas');
    lowCv.width = MW;
    lowCv.height = MH;
    const lc = lowCv.getContext('2d', { willReadFrequently: true });
    const maskCv = document.createElement('canvas');
    maskCv.width = MW;
    maskCv.height = MH;
    const mc = maskCv.getContext('2d');
    const maskImg = mc ? mc.createImageData(MW, MH) : null;
    const work = makeMaskWork(MW, MH);
    const canFilter = !!wc && 'filter' in wc;
    let noMask = false;       // لو القراءة ممنوعة (فيديو من دومين ثاني بدون CORS) نستعمل قناع بيضاوي ناعم
    let lastVT = -1;
    let haveFrame = false;

    const updateWolf = () => {
      if (!wc || !lc || !mc || !maskImg) return;
      let ok = !noMask;
      if (ok) {
        try {
          lc.drawImage(vid, 0, 0, MW, MH);
          const id = lc.getImageData(0, 0, MW, MH);
          buildWolfMask(id.data, MW, MH, work, maskImg.data);
          mc.putImageData(maskImg, 0, 0);
        } catch { ok = false; noMask = true; }
      }
      wc.globalCompositeOperation = 'source-over';
      wc.globalAlpha = 1;
      wc.clearRect(0, 0, WV_W, WV_H);
      try { wc.drawImage(vid, 0, 0, WV_W, WV_H); } catch { return; }
      wc.globalCompositeOperation = 'destination-in';
      if (ok) {
        wc.imageSmoothingEnabled = true;
        wc.imageSmoothingQuality = 'high';
        if (canFilter) wc.filter = 'blur(2px)';
        wc.drawImage(maskCv, 0, 0, WV_W, WV_H);
        if (canFilter) wc.filter = 'none';
      } else {
        wc.save();
        wc.translate(WV_W / 2, WV_H * 0.64);
        wc.scale(1, 1.15);
        const rg = wc.createRadialGradient(0, 0, 0, 0, 0, WV_W * 0.5);
        rg.addColorStop(0, 'rgba(0,0,0,1)');
        rg.addColorStop(0.7, 'rgba(0,0,0,0.9)');
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        wc.fillStyle = rg;
        wc.fillRect(-WV_W, -WV_H, WV_W * 2, WV_H * 2);
        wc.restore();
      }
      // لون بارد داكن يطابق المشهد
      wc.globalCompositeOperation = 'source-atop';
      wc.fillStyle = 'rgba(4,8,26,0.28)';
      wc.fillRect(0, 0, WV_W, WV_H);
      // الأرض بالأسفل تذوب بالضباب
      wc.globalCompositeOperation = 'destination-out';
      const bg = wc.createLinearGradient(0, WV_H * 0.8, 0, WV_H * 0.98);
      bg.addColorStop(0, 'rgba(0,0,0,0)');
      bg.addColorStop(1, 'rgba(0,0,0,1)');
      wc.fillStyle = bg;
      wc.fillRect(0, WV_H * 0.8, WV_W, WV_H * 0.2);
      wc.globalCompositeOperation = 'source-over';
      haveFrame = true;
    };

    // تحميل صورة المستلم مسبقاً (لو الهدية لمتحدث)
    let liftPre: HTMLImageElement | null = null;
    const liftInfo0 = getLiftInfo();
    if (liftInfo0 && liftInfo0.avatarUrl) {
      try { liftPre = new Image(); liftPre.src = String(liftInfo0.avatarUrl); } catch { liftPre = null; }
    }

    // ── السبرايتات ──
    const ICE = ICE_RGB.map(rgb => makeSprite(rgb, 0.3));
    const GOLD = GOLD_RGB.map(rgb => makeSprite(rgb, 0.3));
    const FOG = makeSprite('128,150,190', 0.12);
    const NEB = [makeSprite('74,62,176', 0.1), makeSprite('30,100,170', 0.1), makeSprite('116,44,150', 0.1)];
    const blob = (sp: HTMLCanvasElement, x: number, y: number, r: number, a: number) => {
      if (a <= 0.003 || r <= 0.2) return;
      c.globalAlpha = Math.min(1, a);
      c.drawImage(sp, x - r, y - r, r * 2, r * 2);
    };

    // ── السماء ──
    const stars = Array.from({ length: 170 }, () => ({
      x: Math.random(), y: Math.pow(Math.random(), 1.35) * 0.88, r: rnd(0.5, 1.7) * k,
      ph: rnd(0, 6.28), sp: rnd(1.2, 3.6), ap: rnd(0.2, 2.8), flare: Math.random() < 0.1, warm: Math.random() < 0.18,
    }));
    const moonX = W * 0.77, moonY = H * 0.15, moonR = Math.max(24, Math.min(W * 0.085, 46)) * Math.max(1, k * 0.9);
    const nebs = NEB.map((_, i) => ({ x: [0.2, 0.7, 0.45][i], y: [0.22, 0.4, 0.12][i], r: [0.85, 0.75, 0.7][i], sp: [0.05, -0.04, 0.03][i] }));
    const mists = Array.from({ length: 16 }, () => ({ x: rnd(-0.1, 1.1), y: rnd(0.8, 1.02), r: rnd(0.3, 0.6), sp: rnd(-0.03, 0.03) * (Math.random() < 0.5 ? 1 : -1), ph: rnd(0, 6.28) }));

    // ── حالة ──
    const fx: Pt[] = [];
    const rings: Ring[] = [];
    const shoots: Shoot[] = [];
    let hot: Hot[] = [];
    let hotAt = -9;
    const acc = { mote: 0, dust: 0, gold: 0 };
    let host: Host | null = null;
    let endT = -1;           // لحظة نهاية الفيديو (بزمن الأنميشن)
    let flash2 = 0;
    let bolt: { segs: number[][]; born: number } | null = null;
    let boltIdx = 0;
    let ringIdx = 0;
    let sparkIdx = 0;
    let beatIdx = 0;
    let nextShoot = 1.6;
    let dissolved = false;
    let risen = false;
    let finished = false;
    let q = 1;
    let emaDt = 0.016;

    const spawn = (kind: Pt['k'], x: number, y: number, vx: number, vy: number, size: number, life: number, o: Partial<Pt> = {}) => {
      if (fx.length >= MAX_FX) return;
      fx.push({ k: kind, x, y, px: x, py: y, vx, vy, size, grow: 0, life, age: 0, grav: 0, drag: 0, wind: 0, seed: Math.random() * 6.28, stuck: 0, ...o });
    };

    const sound = createWolfSound();

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

    const makeBolt = (x0: number, y0: number, x1: number, y1: number, disp: number, depth: number, out: number[][]) => {
      if (depth === 0) { out.push([x0, y0, x1, y1]); return; }
      const mx = (x0 + x1) / 2 + (Math.random() - 0.5) * disp;
      const my = (y0 + y1) / 2 + (Math.random() - 0.5) * disp;
      makeBolt(x0, y0, mx, my, disp / 2, depth - 1, out);
      makeBolt(mx, my, x1, y1, disp / 2, depth - 1, out);
      if (depth > 2 && Math.random() < 0.28) makeBolt(mx, my, mx + (Math.random() - 0.5) * disp * 3, my + Math.random() * disp * 2, disp / 2, depth - 2, out);
    };

    // ── الحلقة الرئيسية ──
    let raf = 0;
    const start = performance.now();
    let last = start;

    const finish = () => {
      if (finished) return;
      finished = true;
      doneRef.current();
    };

    const frame = (now: number) => {
      const t = (now - start) / 1000;
      const raw = (now - last) / 1000;
      const dt = Math.min(0.033, raw);
      last = now;
      emaDt += (raw - emaDt) * 0.05;
      if (emaDt > 0.036) q = Math.max(0.45, q - 0.015);
      else if (emaDt < 0.024) q = Math.min(1, q + 0.008);

      // ── الفيديو: بدء / متابعة / نهاية ──
      if (!started && !vFailed && t >= VIDEO_AT && (vid.readyState >= 3 || t >= VIDEO_AT + WAIT_MAX)) {
        if (vid.readyState >= 1 || t < VIDEO_AT + WAIT_MAX) startVideo();
        else vFailed = true;
        sound.duck(true);
      }
      if (!started && !vFailed && t >= VIDEO_AT + WAIT_MAX + 4) vFailed = true;   // ما حمّل نهائياً: نكمل بالمؤثرات فقط
      const vdur = isFinite(vid.duration) && vid.duration > 0 ? vid.duration : VIDEO_LEN;
      const vt = started && !vFailed ? vid.currentTime : -1;
      if (endT < 0) {
        if (vFailed && t >= VIDEO_AT) { endT = t + 4; sound.duck(false); }
        else if (started && (vEnded || vid.ended || (vt >= vdur - 0.04 && vid.paused))) { endT = t; sound.duck(false); }
      }
      const postT = endT >= 0 ? t - endT : -1;
      if (postT >= POST_END) { finish(); return; }
      const endFade = postT >= 0 ? clamp01((POST_END - postT) / 0.5) : 1;
      cv.style.opacity = String(endFade);

      if (started && !vFailed && vid.readyState >= 2 && vt !== lastVT && endT < 0) {
        lastVT = vt;
        updateWolf();
      } else if (started && !vFailed && !haveFrame && vid.readyState >= 2) {
        updateWolf();
      }

      // ── عوامل المشهد ──
      const lightBack = postT >= 0 ? smooth((postT - 0.8) / 2.8) : 0;
      const dk = DARK_MAX * smooth(t / DARK_IN) * (1 - lightBack);
      const skyA = smooth((t - 0.3) / 1.8) * (1 - lightBack);
      const mistA = smooth((t - 1.2) / 2) * (1 - smooth((postT - 0.6) / 2.4));
      const wolfFade = postT >= 0 ? smooth((postT - 0.2) / 1.4) : 0;
      const wolfA = (vt >= 0 && haveFrame ? smooth(vt / 1.0) : 0) * (1 - wolfFade);
      const howl = vt >= 10.2 && vt <= 16.4 ? smooth((vt - 10.2) / 0.6) * (1 - smooth((vt - 15.8) / 0.6)) : 0;

      // ── أحداث ──
      while (sparkIdx < INTRO_SPARKLES.length && t >= INTRO_SPARKLES[sparkIdx]) { sparkIdx++; sound.sparkle(); }
      while (beatIdx < INTRO_HEARTBEATS.length && t >= INTRO_HEARTBEATS[beatIdx]) { beatIdx++; sound.heartbeat(); }
      if (started && vt >= 0 && boltIdx < LIGHTNING_REL.length && vt >= LIGHTNING_REL[boltIdx]) {
        boltIdx++;
        const segs: number[][] = [];
        const bx = rnd(0.12, 0.88) * W;
        makeBolt(bx, -10, bx + rnd(-0.25, 0.25) * W, H * rnd(0.42, 0.6), H * 0.12, 5, segs);
        bolt = { segs, born: t };
        flash2 = Math.max(flash2, 0.55);
        sound.thunder(0.5);
      }
      if (started && vt >= 0 && ringIdx < HOWL_RINGS.length && vt >= HOWL_RINGS[ringIdx]) {
        ringIdx++;
        rings.push({ x: W * 0.5, y: H * 0.34, born: t, dur: 1.5, maxR: Math.max(W, H * 0.6), w: 5 });
        rings.push({ x: W * 0.5, y: H * 0.34, born: t + 0.18, dur: 1.7, maxR: Math.max(W, H * 0.6) * 1.2, w: 3 });
        flash2 = Math.max(flash2, 0.3);
        sound.boom(0.7);
        for (let i = 0; i < 26; i++) {
          const a = rnd(0, Math.PI * 2);
          const sp = rnd(120, 460) * k;
          spawn(0, W * 0.5, H * 0.34, Math.cos(a) * sp, Math.sin(a) * sp, rnd(3, 7) * k, rnd(0.8, 1.6), { grow: -0.4, drag: 1.4 });
        }
      }
      if (postT >= 0.3 && !dissolved) {
        dissolved = true;
        for (let i = 0; i < 60; i++) spawn(0, rnd(0.2, 0.8) * W, rnd(0.25, 0.9) * H, rnd(-40, 40) * k, -rnd(30, 140) * k, rnd(4, 10) * k, rnd(1, 2.2), { grow: -0.3, drag: 0.8 });
      }
      if (postT >= 0 && !risen) {
        risen = true;
        sound.rise();
        const lf = findLift(W, H, liftPre);
        host = lf || findHost(W);
      }
      if (t >= nextShoot && skyA > 0.3 && postT < 0) {
        nextShoot = t + rnd(1.6, 3.4);
        const ang = rnd(0.35, 0.7);
        const sp = rnd(700, 1100) * k;
        shoots.push({ x: rnd(0.1, 0.8) * W, y: rnd(0.02, 0.3) * H, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, age: 0, life: rnd(0.5, 0.8), len: rnd(90, 170) * k });
      }

      // ── مواضع الأزرار ──
      if (t >= 1.5 && t - hotAt > 0.45) { hot = collectHot(hot); hotAt = t; }
      for (const h of hot) h.heat = Math.max(0, h.heat - dt * 0.35);

      // ── الإصدار ──
      if (wolfA > 0.05) {
        acc.mote += dt * 26 * wolfA * q;
        while (acc.mote >= 1) {
          acc.mote--;
          spawn(0, rnd(0, 1) * W, H * rnd(0.72, 1.0), rnd(-16, 16), -rnd(20, 80) * k, rnd(2, 5) * k, rnd(3, 5), { grav: -8 * k, drag: 0.25, wind: 0.2 });
        }
      }
      if (skyA > 0.2 && postT < 2) {
        acc.dust += dt * 20 * skyA * q;
        while (acc.dust >= 1) {
          acc.dust--;
          spawn(2, rnd(-0.1, 1.1) * W, -10, rnd(-14, 24), rnd(60, 150) * k, rnd(1.6, 3.4) * k, rnd(6, 8), { grav: 90 * k, drag: 0.3, wind: 0.3 });
        }
      }

      // ═══ رسم ═══
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';

      // الظلام (سماء ليلية متدرجة)
      if (dk > 0.003) {
        const sg = c.createLinearGradient(0, 0, 0, H);
        sg.addColorStop(0, `rgba(3,6,20,${dk})`);
        sg.addColorStop(0.6, `rgba(2,3,12,${dk})`);
        sg.addColorStop(1, `rgba(1,2,7,${dk})`);
        c.fillStyle = sg;
        c.fillRect(0, 0, W, H);
      }

      // اهتزاز خفيف مع الصرخة
      const sa = howl * 3.2 * k * (0.7 + 0.3 * Math.sin(t * 9));
      const shx = sa * (Math.sin(t * 61) * 0.6 + Math.sin(t * 37 + 1) * 0.4);
      const shy = sa * (Math.sin(t * 53 + 2) * 0.6 + Math.sin(t * 29) * 0.4) * 0.7;
      c.save();
      c.translate(shx, shy);

      // المجرّات الخافتة
      c.globalCompositeOperation = 'lighter';
      nebs.forEach((n, i) => {
        const nx = (n.x + Math.sin(t * n.sp + i) * 0.08) * W;
        blob(NEB[i], nx, n.y * H, n.r * W, 0.2 * skyA);
      });

      // القمر
      blob(ICE[2], moonX, moonY, moonR * 4.2, 0.28 * skyA * (0.85 + 0.15 * Math.sin(t * 1.3)));
      blob(ICE[1], moonX, moonY, moonR * 2.1, 0.3 * skyA);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
      if (skyA > 0.02) {
        c.globalAlpha = skyA;
        const mg = c.createRadialGradient(moonX - moonR * 0.3, moonY - moonR * 0.3, moonR * 0.1, moonX, moonY, moonR);
        mg.addColorStop(0, '#fffbe8');
        mg.addColorStop(1, '#bcd0ec');
        c.fillStyle = mg;
        c.beginPath();
        c.arc(moonX, moonY, moonR, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = 'rgba(120,140,176,0.28)';
        [[-0.35, -0.25, 0.2], [0.3, 0.2, 0.16], [-0.1, 0.4, 0.12]].forEach(([dx, dy, rr]) => {
          c.beginPath();
          c.arc(moonX + dx * moonR, moonY + dy * moonR, rr * moonR, 0, Math.PI * 2);
          c.fill();
        });
        c.globalAlpha = 1;
      }

      // النجوم
      if (skyA > 0.02) {
        for (const s of stars) {
          const ap = smooth((t - s.ap) / 0.6);
          if (ap <= 0) continue;
          const tw = 0.55 + 0.45 * Math.sin(t * s.sp + s.ph);
          const a = ap * tw * skyA;
          const sx = s.x * W, sy = s.y * H;
          c.globalAlpha = a;
          c.fillStyle = s.warm ? '#ffe9b8' : '#e8f0ff';
          c.beginPath();
          c.arc(sx, sy, s.r, 0, Math.PI * 2);
          c.fill();
          if (s.flare && a > 0.3) {
            c.strokeStyle = s.warm ? '#ffe9b8' : '#dbe8ff';
            c.lineWidth = Math.max(0.6, s.r * 0.5);
            c.globalAlpha = a * 0.7;
            const L = s.r * 5 * (0.7 + 0.3 * tw);
            c.beginPath();
            c.moveTo(sx - L, sy); c.lineTo(sx + L, sy);
            c.moveTo(sx, sy - L); c.lineTo(sx, sy + L);
            c.stroke();
          }
        }
        c.globalAlpha = 1;
      }

      // الشهب
      for (let i = shoots.length - 1; i >= 0; i--) {
        const s = shoots[i];
        s.age += dt;
        if (s.age >= s.life) { shoots[i] = shoots[shoots.length - 1]; shoots.pop(); continue; }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const u = s.age / s.life;
        const a = Math.sin(Math.PI * u) * skyA;
        const mag = Math.hypot(s.vx, s.vy) || 1;
        const tx = s.x - (s.vx / mag) * s.len, ty = s.y - (s.vy / mag) * s.len;
        const g = c.createLinearGradient(tx, ty, s.x, s.y);
        g.addColorStop(0, 'rgba(180,210,255,0)');
        g.addColorStop(1, `rgba(255,255,255,${a})`);
        c.strokeStyle = g;
        c.lineWidth = 2 * k;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(tx, ty);
        c.lineTo(s.x, s.y);
        c.stroke();
      }

      // برق السماء (خلف الذئب)
      if (bolt) {
        const u = (t - bolt.born) / 0.3;
        if (u >= 1) bolt = null;
        else {
          const fl = Math.random() < 0.3 ? 0.5 : 1;
          const a = (1 - u) * fl * endFade;
          c.lineCap = 'round';
          c.strokeStyle = `rgba(140,170,255,${0.45 * a})`;
          c.lineWidth = 7 * k;
          c.beginPath();
          bolt.segs.forEach(s => { c.moveTo(s[0], s[1]); c.lineTo(s[2], s[3]); });
          c.stroke();
          c.strokeStyle = `rgba(245,248,255,${a})`;
          c.lineWidth = 2.2 * k;
          c.beginPath();
          bolt.segs.forEach(s => { c.moveTo(s[0], s[1]); c.lineTo(s[2], s[3]); });
          c.stroke();
        }
      }

      // هالة خلف الذئب (تنبض مع الصرخة)
      if (wolfA > 0.02) {
        c.globalCompositeOperation = 'lighter';
        blob(ICE[3], W * 0.5, H * 0.46, H * 0.5, (0.1 + 0.16 * howl * (0.8 + 0.2 * Math.sin(t * 14))) * wolfA);
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';
      }

      // ── الذئب (إطارات الفيديو بعد فصلها عن سمائها) ──
      if (wolfA > 0.003 && haveFrame) {
        const sc = Math.max(W / WV_W, H / WV_H);
        const dw = WV_W * sc, dh = WV_H * sc;
        c.globalAlpha = wolfA * endFade;
        c.drawImage(wolfCv, (W - dw) / 2, H - dh, dw, dh);
        c.globalAlpha = 1;
      }

      // الضباب (يخفي قاعدة الذئب ويطلّعه من الأرض)
      if (mistA > 0.01) {
        for (const m of mists) {
          const mx = (m.x + Math.sin(t * m.sp * 6 + m.ph) * 0.06) * W;
          blob(FOG, mx, m.y * H, m.r * W, 0.2 * mistA * endFade);
        }
        c.globalAlpha = 1;
      }

      // ── الجسيمات ──
      c.globalCompositeOperation = 'lighter';
      for (let i = fx.length - 1; i >= 0; i--) {
        const p = fx[i];
        p.age += dt;
        if (p.age >= p.life) { fx[i] = fx[fx.length - 1]; fx.pop(); continue; }
        const u = p.age / p.life;

        if (p.stuck > 0) {
          p.stuck -= dt;
          const fl = 0.6 + 0.4 * Math.sin(p.age * 24 + p.seed);
          blob(ICE[2], p.x, p.y, p.size * 3.6 * fl, 0.6 * (1 - u * 0.5) * endFade);
          blob(ICE[0], p.x, p.y, p.size * 1.3, 0.8 * endFade);
          continue;
        }

        p.px = p.x;
        p.py = p.y;
        p.vy += p.grav * dt;
        p.vx += Math.sin(t * 0.8 + p.seed) * 30 * k * p.wind * dt;
        const dm = Math.exp(-p.drag * dt);
        p.vx *= dm;
        p.vy *= dm;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y > H + 70 || p.x < -140 || p.x > W + 140 || (p.y < -300 && p.vy < 0)) { fx[i] = fx[fx.length - 1]; fx.pop(); continue; }

        // الغبار النجمي ينزل على الأزرار ويتجمد عليها
        if (p.k === 2 && p.vy > 0 && p.age > 0.15) {
          let gone = false;
          for (const h of hot) {
            const top = topAt(h, p.x);
            if (top === null || !(p.py <= top + 1 && p.y >= top)) continue;
            h.heat = Math.min(1.2, h.heat + 0.22);
            for (let j = 0; j < 2; j++) spawn(0, p.x, top, rnd(-70, 70) * k, -rnd(30, 120) * k, rnd(1.2, 2.4) * k, rnd(0.4, 0.9), { grav: 300 * k, drag: 0.8 });
            if (Math.random() < 0.4) {
              p.y = top - 1; p.vx = 0; p.vy = 0; p.stuck = rnd(0.6, 1.5); p.life = p.age + p.stuck;
            } else {
              fx[i] = fx[fx.length - 1];
              fx.pop();
              gone = true;
            }
            break;
          }
          if (gone) continue;
        }

        if (p.k === 0) {
          const idx = Math.min(4, Math.floor(u * 4.5));
          const tw = 0.65 + 0.35 * Math.sin(p.age * 12 + p.seed);
          blob(ICE[idx], p.x, p.y, p.size * (1 + p.grow * u) * 2.2, (1 - u) * 0.6 * tw * endFade);
          blob(ICE[0], p.x, p.y, p.size * 0.8, (1 - u) * 0.7 * endFade);
        } else if (p.k === 2) {
          const fl = 0.6 + 0.4 * Math.sin(p.age * 20 + p.seed);
          const fade = u > 0.75 ? (1 - u) / 0.25 : 1;
          blob(ICE[1], p.x, p.y, p.size * 3, 0.5 * fl * fade * endFade);
          blob(ICE[0], p.x, p.y, p.size * 1.1, 0.85 * fade * endFade);
        } else {
          const idx = Math.min(3, Math.floor(u * 3.6));
          const tw = 0.6 + 0.4 * Math.sin(p.age * 26 + p.seed);
          blob(GOLD[idx], p.x, p.y, p.size * 2.8, (1 - u) * 0.75 * tw * endFade);
          blob(GOLD[0], p.x, p.y, p.size * 0.9, (1 - u) * 0.9 * endFade);
        }
      }
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';

      // ── توهج الأزرار بالجليد ──
      for (const h of hot) {
        if (h.heat < 0.03) continue;
        const a = Math.min(1, h.heat) * endFade;
        rrPath(h.x, h.y, h.w, h.h, h.rad);
        c.fillStyle = `rgba(150,200,255,${0.12 * a})`;
        c.fill();
        c.lineWidth = 2;
        c.strokeStyle = `rgba(200,228,255,${0.85 * a})`;
        c.shadowColor = 'rgba(130,180,255,0.9)';
        c.shadowBlur = 12 * a;
        c.stroke();
        c.shadowBlur = 0;
      }

      // ── موجات الصرخة ──
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        const u = (t - r.born) / r.dur;
        if (u >= 1) { rings.splice(i, 1); continue; }
        if (u < 0) continue;
        const rr = easeOut(u) * r.maxR;
        c.strokeStyle = `rgba(190,220,255,${(1 - u) * 0.6})`;
        c.lineWidth = r.w * (1 - u) + 1;
        c.beginPath();
        c.arc(r.x, r.y, rr, 0, Math.PI * 2);
        c.stroke();
      }

      // ── وميض البرق/الصرخة ──
      if (flash2 > 0.01) {
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = `rgba(160,195,255,${flash2 * 0.28})`;
        c.fillRect(0, 0, W, H);
        c.globalCompositeOperation = 'source-over';
        flash2 *= Math.exp(-dt * 5);
      }

      // ═══ ما بعد الفيديو ═══
      if (host && postT >= 0) {
        if (host.lift) {
          // إطار المستخدم يرتفع لمنتصف الشاشة
          const L = host.lift;
          const up = easeOut(postT / POST_UP);
          const down = smooth((postT - POST_DOWN_AT) / (POST_END - 0.5 - POST_DOWN_AT));
          const e2 = up * (1 - down);
          if (down >= 1 && !L.done) { L.done = true; L.restore(); }
          if (e2 > 0.004) {
            const ax = lerp(L.sx, L.ex, e2);
            const ay = lerp(L.sy, L.ey, e2) + Math.sin(t * 2.6) * 3 * k * e2;
            const ar = lerp(L.sr, L.R, e2);
            c.save();
            c.globalCompositeOperation = 'lighter';
            blob(ICE[2], ax, ay, ar * 2.6, 0.4 * e2 * endFade);
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
            c.strokeStyle = 'rgba(205,230,255,0.97)';
            c.shadowColor = 'rgba(120,170,255,0.95)';
            c.shadowBlur = 16 * e2;
            c.stroke();
            c.restore();
            // نجوم تدور حول الإطار
            c.save();
            c.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 4; i++) {
              const an = t * 1.8 + (i * Math.PI) / 2;
              const rx = ax + Math.cos(an) * ar * 1.28, ry = ay + Math.sin(an) * ar * 1.28;
              blob(GOLD[1], rx, ry, 8 * k, 0.85 * e2 * endFade);
              blob(GOLD[0], rx, ry, 3 * k, 0.95 * e2 * endFade);
            }
            c.restore();
            c.globalAlpha = 1;
            acc.gold += dt * 30 * e2 * q;
            while (acc.gold >= 1) {
              acc.gold--;
              const an = rnd(0, Math.PI * 2);
              spawn(3, ax + Math.cos(an) * ar, ay + Math.sin(an) * ar, Math.cos(an) * 40 * k, Math.sin(an) * 40 * k - 30 * k, rnd(2, 4) * k, rnd(0.7, 1.4), { grav: 40 * k, drag: 0.9 });
            }
            if (e2 > 0.5) {
              c.save();
              c.globalAlpha = clamp01((e2 - 0.5) * 2) * endFade;
              c.font = `800 ${Math.round(Math.max(12, ar * 0.3))}px sans-serif`;
              c.textAlign = 'center';
              c.textBaseline = 'top';
              c.shadowColor = 'rgba(0,0,0,0.9)';
              c.shadowBlur = 6;
              c.fillStyle = '#eaf3ff';
              c.fillText(L.name.length > 18 ? L.name.slice(0, 17) + '…' : L.name, ax, ay + ar + 8 * k);
              c.restore();
            }
          }
        } else {
          // الهدية لصاحب البث: هالة قمر وشرارات ذهبية حول صورته
          const a = smooth(postT / 0.7) * (1 - smooth((postT - 3.2) / 0.9)) * endFade;
          if (a > 0.01) {
            const pulse = 1 + 0.08 * Math.sin(t * 5);
            c.save();
            c.globalCompositeOperation = 'lighter';
            blob(ICE[2], host.x, host.y, host.w * 2.4 * pulse, 0.45 * a);
            blob(GOLD[1], host.x, host.y, host.w * 1.5 * pulse, 0.3 * a);
            c.restore();
            c.globalAlpha = a;
            c.lineWidth = 3;
            c.strokeStyle = 'rgba(205,230,255,0.95)';
            c.shadowColor = 'rgba(120,170,255,0.95)';
            c.shadowBlur = 14;
            c.beginPath();
            c.arc(host.x, host.y, host.w * 0.62 * pulse, 0, Math.PI * 2);
            c.stroke();
            c.shadowBlur = 0;
            c.globalAlpha = 1;
            acc.gold += dt * 40 * a * q;
            while (acc.gold >= 1) {
              acc.gold--;
              const an = rnd(0, Math.PI * 2);
              spawn(3, host.x + Math.cos(an) * host.w * 0.6, host.y + Math.sin(an) * host.w * 0.6, Math.cos(an) * 50 * k, Math.sin(an) * 50 * k - 20 * k, rnd(2, 4.5) * k, rnd(0.8, 1.6), { grav: 50 * k, drag: 0.9 });
            }
          }
        }
      }

      c.restore();
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // شبكة أمان: لو صار شي غير متوقع، الهدية ما تعلق للأبد
    const tSafe = window.setTimeout(finish, TOTAL_MS + 14000);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(tSafe);
      sound.stop();
      try {
        vid.removeEventListener('error', onVidErr);
        vid.removeEventListener('ended', onVidEnd);
        vid.pause();
        vid.muted = true;
        vid.currentTime = 0;
        if (vid.parentNode) vid.parentNode.removeChild(vid);
      } catch { /* ignore */ }
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
      {/* عنصر الفيديو (المشترك) يندرج هنا مخفي تماماً — مصدر للإطارات والصوت الأصلي فقط */}
      <div ref={holdRef} style={{ position: 'absolute', left: 0, top: 0, width: 2, height: 2, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }} />
    </div>
  );
}

export const WolfGift: GiftDefinition = {
  id: 'wolf',
  name: 'Wolf',
  price: PRICE,
  durationMs: TOTAL_MS,
  Preview: WolfPreview,
  Animation: WolfAnimation,
};

export default WolfGift;
