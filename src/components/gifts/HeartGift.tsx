/**
 * هدية القلب (Heart) — 25 Coins
 *
 * - Preview  : داخل مربع الهدايا (قبل النقر) أنميشن متكرر: قلب بشري واقعي ينتفخ بنفخات ثم ينفجر بقلوب واقعية صغيرة.
 * - Animation: قلب بشري واقعي (تشريحي: بطينان + أذينان + أورطي + شرايين وأوردة) ينتفخ بنفَس شخص ينفخ بالونة
 *              (صوت نفخ/شهيق/صرير مطاط) ثم ينفجر بفرقعة وصوت امرأة يقول "I love you"،
 *              وتتناثر قلوب واقعية صغيرة (بنفس الأحجام) في كل الشاشة.
 *              القلوب تسقط بفيزياء حقيقية (جاذبية + ارتداد) وتصطدم بأزرار البث السفلية
 *              (أي button / رابط / input في أسفل الصفحة) ثم تنزلق وتسقط وتختفي.
 *
 * هذا الملف مستقل: غيّر الأرقام تحت (السعر/المدد/عدد القطع/الجاذبية).
 * الأصوات في ملف منفصل: src/lib/heartSounds.ts (playHeartSound / playHeartTick) بجانب audio.ts.
 * شكل القلب الواقعي مرسوم SVG داخل هذا الملف (دالة heartInner) وتُنسخ منه صور القطع الصغيرة تلقائياً.
 *
 * أصوات حقيقية (اختياري — الأفضل للواقعية):
 *   ضع ملفاتك في public/sounds ثم اكتب مسارها في BLOW_URL و VOICE_URL تحت.
 *   إذا تركتها فاضية: النفخ يُولَّد بالكود، وصوت المرأة يُنطق بصوت نسائي من الجهاز (speechSynthesis).
 *
 * لإجبار عنصر معيّن أن تصطدم به القلوب أضف عليه: data-gift-obstacle
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { GiftDefinition } from '../../lib/types';
import { playHeartSound, playHeartTick } from '../../lib/heartSounds';

// ── إعدادات الهدية ──────────────────────────────────────────────────────
const PRICE = 25;
const TOTAL_MS = 7500;      // مدة الأنميشن الكلية
const INFLATE_S = 3.4;      // مدة النفخ قبل الانفجار
const FRAGMENTS = 110;      // عدد القلوب الصغيرة بعد الانفجار
const RAIN = 36;            // قلوب إضافية تنزل من أعلى الشاشة بعد الانفجار
const SPARKS = 36;          // عدد الشرارات الصغيرة
const GRAVITY = 1700;       // الجاذبية (px/s² لشاشة ارتفاعها 700px)
const BOUNCE = 0.5;         // قوة الارتداد عند الاصطدام بالأزرار (0..1)

// الصوت
const VOICE_TEXT = 'I love you';
const VOICE_URL = '';       // مثال: '/sounds/i-love-you.mp3'  (صوت امرأة حقيقي مسجّل)
const BLOW_URL = '';        // مثال: '/sounds/balloon-blow.mp3' (نفخ بالونة حقيقي)

// أنفاس النفخ: t = وقت بداية النفخة بالثواني، d = مدتها. الصوت والحركة يتزامنون عليها.
const PUMPS: { t: number; d: number }[] = [
  { t: 0.10, d: 0.44 },
  { t: 0.74, d: 0.42 },
  { t: 1.34, d: 0.40 },
  { t: 1.92, d: 0.38 },
  { t: 2.48, d: 0.36 },
  { t: 3.02, d: 0.34 },
];

// ── القلب الواقعي (SVG تشريحي) ────────────────────────────────────────────
// مصدر واحد للرسم: يُستخدم للقلب الكبير والمعاينة، ومنه تُولَّد صور القلوب الصغيرة المتساقطة (canvas).
const HEART_VB = { x: -4, y: -2, w: 108, h: 126 };
const HEART_ASPECT = HEART_VB.h / HEART_VB.w;

interface HeartPalette {
  dark: string; mid: string; light: string; hi: string;
  fat: string; fatDark: string;
  aorta: string; aortaDark: string;
  vein: string; veinDark: string;
  vessel: string; atriumLight: string; atriumDark: string;
}

// 3 درجات لون (عادي / داكن / فاتح) لتنوّع القلوب المتساقطة
const HEART_PALETTES: HeartPalette[] = [
  { dark: '#4a0512', mid: '#b1112b', light: '#e53a52', hi: '#ff9aa8', fat: '#f4cf72', fatDark: '#c8962c', aorta: '#d9444f', aortaDark: '#8a1226', vein: '#6277c0', veinDark: '#2f3d84', vessel: '#7d0a1d', atriumLight: '#c9253d', atriumDark: '#6d0a1e' },
  { dark: '#35030d', mid: '#8f0d22', light: '#c42a42', hi: '#f5808f', fat: '#e9c066', fatDark: '#b3841f', aorta: '#bd333f', aortaDark: '#6e0d1e', vein: '#5468b0', veinDark: '#26336f', vessel: '#650818', atriumLight: '#a81e34', atriumDark: '#560818' },
  { dark: '#6a0a1c', mid: '#d3203c', light: '#f2566c', hi: '#ffb3bd', fat: '#f8d98a', fatDark: '#d3a43d', aorta: '#ec5a65', aortaDark: '#a41c32', vein: '#7a8fd4', veinDark: '#3d4c98', vessel: '#8f1126', atriumLight: '#df3a52', atriumDark: '#8a1028' },
];
const HEART_VARIANTS = HEART_PALETTES.length;

function heartInner(p: string, pal: HeartPalette, knot: boolean): string {
  const id = (n: string) => `${p}${n}`;
  return `
<defs>
  <radialGradient id="${id('b')}" cx="38%" cy="30%" r="85%">
    <stop offset="0%" stop-color="${pal.light}"/>
    <stop offset="50%" stop-color="${pal.mid}"/>
    <stop offset="100%" stop-color="${pal.dark}"/>
  </radialGradient>
  <linearGradient id="${id('a')}" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="${pal.aortaDark}"/>
    <stop offset="45%" stop-color="${pal.aorta}"/>
    <stop offset="100%" stop-color="${pal.aortaDark}"/>
  </linearGradient>
  <linearGradient id="${id('v')}" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="${pal.veinDark}"/>
    <stop offset="50%" stop-color="${pal.vein}"/>
    <stop offset="100%" stop-color="${pal.veinDark}"/>
  </linearGradient>
  <radialGradient id="${id('at')}" cx="40%" cy="30%" r="80%">
    <stop offset="0%" stop-color="${pal.atriumLight}"/>
    <stop offset="100%" stop-color="${pal.atriumDark}"/>
  </radialGradient>
</defs>
<g stroke-linecap="round" stroke-linejoin="round" fill="none">
  <!-- aorta branches -->
  <path d="M52 22 L49 6" stroke="${pal.aortaDark}" stroke-width="6.4"/>
  <path d="M52 22 L49 6" stroke="${pal.aorta}" stroke-width="4.2"/>
  <path d="M61 14 L61 2" stroke="${pal.aortaDark}" stroke-width="6.4"/>
  <path d="M61 14 L61 2" stroke="${pal.aorta}" stroke-width="4.2"/>
  <path d="M69 16 L74 5" stroke="${pal.aortaDark}" stroke-width="6.4"/>
  <path d="M69 16 L74 5" stroke="${pal.aorta}" stroke-width="4.2"/>
  <!-- aortic arch -->
  <path d="M47 52 C44 30 50 15 63 15 C75 15 81 27 80 46" stroke="${pal.aortaDark}" stroke-width="14.5"/>
  <path d="M47 52 C44 30 50 15 63 15 C75 15 81 27 80 46" stroke="url(#${id('a')})" stroke-width="12"/>
  <path d="M49 40 C48 28 53 19 62 18.5" stroke="${pal.hi}" stroke-opacity=".5" stroke-width="2.2"/>
  <!-- vena cava superior -->
  <path d="M29 56 C26 40 27 25 33 13" stroke="${pal.veinDark}" stroke-width="11.5"/>
  <path d="M29 56 C26 40 27 25 33 13" stroke="url(#${id('v')})" stroke-width="9"/>
  <path d="M30.5 46 C29 36 30 27 33.5 19" stroke="#b9c6ff" stroke-opacity=".45" stroke-width="1.8"/>
</g>
<!-- right atrium -->
<path d="M19 52 C8 60 9 80 24 90 C34 88 40 74 40 58 C40 47 29 42 19 52 Z" fill="url(#${id('at')})"/>
<path d="M17 62 C14 70 16 79 22 85" fill="none" stroke="${pal.hi}" stroke-opacity=".35" stroke-width="2.2" stroke-linecap="round"/>
<!-- ventricles -->
<path d="M26 47 C15 58 17 82 35 101 C42 109 52 115 58 112 C65 108 79 88 83 68 C86 51 78 41 66 40 C55 36 36 36 26 47 Z" fill="url(#${id('b')})"/>
<!-- muscle fibres -->
<g fill="none" stroke="${pal.dark}" stroke-opacity=".22" stroke-width="1.3" stroke-linecap="round">
  <path d="M30 56 C42 62 54 74 62 100"/>
  <path d="M26 66 C38 72 48 84 54 106"/>
  <path d="M60 50 C72 58 78 70 72 86"/>
  <path d="M66 44 C78 52 82 62 80 72"/>
  <path d="M38 50 C50 54 60 64 68 80"/>
</g>
<!-- left auricle -->
<path d="M67 44 C78 38 91 46 88 58 C86 65 76 64 70 57 Z" fill="url(#${id('at')})"/>
<!-- pulmonary trunk -->
<g fill="none" stroke-linecap="round" stroke-linejoin="round">
  <path d="M59 56 C57 41 63 33 74 30" stroke="${pal.veinDark}" stroke-width="11.5"/>
  <path d="M59 56 C57 41 63 33 74 30" stroke="url(#${id('v')})" stroke-width="9"/>
  <path d="M74 30 C80 27 87 27 92 31" stroke="${pal.veinDark}" stroke-width="8"/>
  <path d="M74 30 C80 27 87 27 92 31" stroke="${pal.vein}" stroke-width="5.8"/>
  <path d="M60 46 C60 40 63 36 68 34" stroke="#b9c6ff" stroke-opacity=".4" stroke-width="1.8"/>
</g>
<!-- grooves with fat + coronary vessels -->
<g fill="none" stroke-linecap="round" stroke-linejoin="round">
  <path d="M49 44 C46 62 51 88 58 110" stroke="${pal.fatDark}" stroke-opacity=".85" stroke-width="4"/>
  <path d="M49 44 C46 62 51 88 58 110" stroke="${pal.fat}" stroke-width="2.6"/>
  <path d="M49 44 C46 62 51 88 58 110" stroke="${pal.vessel}" stroke-width="1.3"/>
  <path d="M46 48 C36 54 27 62 25 74 C24 82 27 88 32 91" stroke="${pal.fatDark}" stroke-opacity=".85" stroke-width="3.8"/>
  <path d="M46 48 C36 54 27 62 25 74 C24 82 27 88 32 91" stroke="${pal.fat}" stroke-width="2.4"/>
  <path d="M46 48 C36 54 27 62 25 74 C24 82 27 88 32 91" stroke="${pal.vessel}" stroke-width="1.2"/>
  <path d="M52 46 C64 46 75 53 80 66" stroke="${pal.fatDark}" stroke-opacity=".85" stroke-width="3.6"/>
  <path d="M52 46 C64 46 75 53 80 66" stroke="${pal.fat}" stroke-width="2.2"/>
  <path d="M52 46 C64 46 75 53 80 66" stroke="${pal.vessel}" stroke-width="1.1"/>
  <!-- small branches -->
  <path d="M50 62 C58 62 66 66 70 74" stroke="${pal.vessel}" stroke-width="1.2" stroke-opacity=".9"/>
  <path d="M51 78 C58 80 64 86 66 94" stroke="${pal.vessel}" stroke-width="1.1" stroke-opacity=".9"/>
  <path d="M48 66 C42 68 36 74 34 82" stroke="${pal.vessel}" stroke-width="1.1" stroke-opacity=".9"/>
  <path d="M30 70 C38 70 44 74 47 80" stroke="${pal.vessel}" stroke-width="1.1" stroke-opacity=".9"/>
  <path d="M74 56 C74 64 72 72 66 78" stroke="${pal.vessel}" stroke-width="1.1" stroke-opacity=".9"/>
</g>
<!-- fat blobs near the top groove -->
<g fill="${pal.fat}" fill-opacity=".8">
  <ellipse cx="45" cy="50" rx="4" ry="2.6" transform="rotate(-30 45 50)"/>
  <ellipse cx="56" cy="47" rx="3.6" ry="2.2" transform="rotate(20 56 47)"/>
  <ellipse cx="33" cy="60" rx="2.6" ry="1.8" transform="rotate(-50 33 60)"/>
  <ellipse cx="74" cy="56" rx="2.6" ry="1.8" transform="rotate(50 74 56)"/>
</g>
<!-- glossy highlights -->
<ellipse cx="33" cy="64" rx="3.6" ry="9" transform="rotate(-20 33 64)" fill="#fff" fill-opacity=".30"/>
<ellipse cx="72" cy="62" rx="2.2" ry="6" transform="rotate(18 72 62)" fill="#fff" fill-opacity=".18"/>
${knot ? `<path d="M58 111 C55 114 53.5 116.5 54 118.5 L62.5 118.5 C62.5 116 61 114 58 111 Z" fill="${pal.dark}"/>` : ''}
`;
}

function heartSvgString(prefix: string, variant: number, knot: boolean, w: number): string {
  const pal = HEART_PALETTES[variant % HEART_VARIANTS];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${HEART_VB.x} ${HEART_VB.y} ${HEART_VB.w} ${HEART_VB.h}" width="${w}" height="${Math.round(w * HEART_ASPECT)}">${heartInner(prefix, pal, knot)}</svg>`;
}

// صور جاهزة للقلوب الصغيرة (تُرسم مرة واحدة ثم تُنسخ بسرعة داخل الـ canvas)
const SPRITE_W = 128;
const SPRITE_H = Math.round(SPRITE_W * HEART_ASPECT);
const spriteCache: (HTMLCanvasElement | null)[] = [];
const spriteLoading: boolean[] = [];

function loadHeartSprite(v: number) {
  if (typeof document === 'undefined' || spriteCache[v] || spriteLoading[v]) return;
  spriteLoading[v] = true;
  try {
    const img = new Image();
    img.onload = () => {
      try {
        const cv = document.createElement('canvas');
        cv.width = SPRITE_W;
        cv.height = SPRITE_H;
        const cx = cv.getContext('2d');
        if (!cx) return;
        cx.imageSmoothingQuality = 'high';
        cx.drawImage(img, 0, 0, SPRITE_W, SPRITE_H);
        spriteCache[v] = cv;
      } catch { /* ignore */ }
    };
    img.onerror = () => { spriteLoading[v] = false; };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(heartSvgString(`s${v}`, v, false, SPRITE_W));
  } catch { spriteLoading[v] = false; }
}
function preloadHeartSprites() {
  for (let v = 0; v < HEART_VARIANTS; v++) loadHeartSprite(v);
}
function getHeartSprite(v: number): HTMLCanvasElement | null {
  const c = spriteCache[v % HEART_VARIANTS];
  if (!c) loadHeartSprite(v % HEART_VARIANTS);
  return c || null;
}

// size = عرض القلب بالبكسل (الارتفاع يتبع النسبة)
function RealisticHeart({ size, knot = false, variant = 0, glow = true }: { size: number; knot?: boolean; variant?: number; glow?: boolean }) {
  const gid = React.useId().replace(/:/g, '');
  const html = useMemo(
    () => heartInner(`hg${gid}`, HEART_PALETTES[variant % HEART_VARIANTS], knot),
    [gid, variant, knot],
  );
  return (
    <svg
      width={size}
      height={size * HEART_ASPECT}
      viewBox={`${HEART_VB.x} ${HEART_VB.y} ${HEART_VB.w} ${HEART_VB.h}`}
      style={{ display: 'block', overflow: 'visible', filter: glow ? 'drop-shadow(0 0 10px rgba(255,45,85,0.65))' : undefined }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ── الشكل داخل مربع الهدايا (قبل النقر): قلب واقعي ينتفخ بنفخات ثم ينفجر بقلوب صغيرة، وتتكرر الحركة ──
const PREVIEW_LOOP_S = 3.6;
const PREVIEW_MINIS = 7;

function HeartPreview({ size = 72 }: { size?: number }) {
  // القلب: ينتفخ على 4 نفخات ثم "بوب" ويختفي لحظة قبل أن يبدأ من جديد
  const T = [0, 0.1, 0.17, 0.27, 0.34, 0.44, 0.51, 0.6, 0.65, 0.655, 0.8, 0.92, 1];
  const SC = [0.4, 0.58, 0.54, 0.74, 0.7, 0.9, 0.86, 1.04, 1.16, 0, 0, 0.2, 0.4];
  const OP = [1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1];
  const mini = size * 0.2;

  useEffect(() => { preloadHeartSprites(); }, []);

  return (
    <div
      aria-hidden="true"
      style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <motion.div
        animate={{ scale: SC, opacity: OP }}
        transition={{ duration: PREVIEW_LOOP_S, repeat: Infinity, ease: 'easeInOut', times: T }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', willChange: 'transform' }}
      >
        <RealisticHeart size={size * 0.72} knot />
      </motion.div>

      {/* وميض الانفجار */}
      <motion.div
        animate={{ scale: [0.2, 0.2, 1.1], opacity: [0, 0.6, 0] }}
        transition={{ duration: PREVIEW_LOOP_S, repeat: Infinity, ease: 'easeOut', times: [0, 0.65, 0.78] }}
        style={{
          position: 'absolute', left: '50%', top: '50%', width: size * 0.9, height: size * 0.9, marginLeft: -size * 0.45, marginTop: -size * 0.45,
          borderRadius: '50%', background: 'radial-gradient(circle, #ffffff 0%, #ff7a95 35%, rgba(255,45,85,0) 70%)', pointerEvents: 'none',
        }}
      />

      {/* قلوب واقعية صغيرة تتناثر عند الانفجار */}
      {Array.from({ length: PREVIEW_MINIS }, (_, i) => {
        const ang = (i / PREVIEW_MINIS) * Math.PI * 2 + 0.4;
        const dist = size * (0.38 + (i % 3) * 0.06);
        const tx = Math.cos(ang) * dist;
        const ty = Math.sin(ang) * dist;
        return (
          <motion.div
            key={i}
            animate={{
              x: [0, 0, 0, tx, tx * 1.08, tx * 1.08],
              y: [0, 0, 0, ty, ty * 1.08 + size * 0.1, ty * 1.08 + size * 0.1],
              scale: [0, 0, 0.9, 0.9, 0.6, 0],
              opacity: [0, 0, 1, 1, 0, 0],
              rotate: [0, 0, 0, (i % 2 ? 1 : -1) * 25, (i % 2 ? 1 : -1) * 40, 0],
            }}
            transition={{ duration: PREVIEW_LOOP_S, repeat: Infinity, ease: 'easeOut', times: [0, 0.65, 0.66, 0.78, 0.94, 1] }}
            style={{ position: 'absolute', left: '50%', top: '50%', marginLeft: -mini / 2, marginTop: -(mini * HEART_ASPECT) / 2, pointerEvents: 'none' }}
          >
            <RealisticHeart size={mini} variant={i} glow={false} />
          </motion.div>
        );
      })}
    </div>
  );
}

// ── الفيزياء: قلوب تسقط وتصطدم بأزرار البث ─────────────────────────────────
interface Obstacle { x: number; y: number; w: number; h: number; r: number }

// يجمع الأزرار الظاهرة في النصف السفلي من الشاشة (أزرار البث) لتصطدم بها القلوب
function collectObstacles(W: number, H: number): Obstacle[] {
  const out: Obstacle[] = [];
  try {
    const nodes = document.querySelectorAll<HTMLElement>(
      'button, [role="button"], a[href], input, textarea, select, [data-gift-obstacle]',
    );
    nodes.forEach(el => {
      if (el.closest('[data-gift-overlay]')) return;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return;

      // زر شفاف بدون إطار (مثل النقاط الملوّنة): نصطدم بالشكل الظاهر داخله لا بمنطقة اللمس
      const transparent = cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'transparent';
      const noBorder = !parseFloat(cs.borderTopWidth) || cs.borderTopStyle === 'none';
      const box: Element = transparent && noBorder && el.firstElementChild ? el.firstElementChild : el;
      const rect = box.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return;
      if (rect.height > 160 || rect.width > W * 0.98) return;
      if (rect.bottom < H * 0.5 || rect.top > H || rect.right < 0 || rect.left > W) return;

      const bcs = box === el ? cs : getComputedStyle(box);
      const raw = bcs.borderTopLeftRadius || '0';
      const m = Math.min(rect.width, rect.height);
      const val = parseFloat(raw) || 0;
      const rad = raw.includes('%') ? (val / 100) * m : val;
      out.push({ x: rect.left, y: rect.top, w: rect.width, h: rect.height, r: Math.min(rad, rect.width / 2, rect.height / 2) });
    });
  } catch { /* ignore */ }
  return out;
}

interface Piece {
  x: number; y: number; vx: number; vy: number;
  size: number; rad: number; rot: number; vr: number;
  v: number; delay: number; e: number;
  active: boolean; dead: boolean; fadeAt: number | null;
}
interface Spark { x: number; y: number; vx: number; vy: number; size: number; delay: number }

function BurstLayer({ W, H, seconds }: { W: number; H: number; seconds: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const c = cv.getContext('2d');
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);

    preloadHeartSprites();
    c.imageSmoothingQuality = 'high';
    const k = Math.max(W, H) / 700;
    const g = GRAVITY * (H / 700);
    const cx = W / 2;
    const cy = H / 2;
    const hs = Math.min(W * 0.85, H * 0.55);

    const pieces: Piece[] = [];
    for (let i = 0; i < FRAGMENTS; i++) {
      const size = 16 + Math.random() * 32;
      const ang = Math.random() * Math.PI * 2;
      const sp = (200 + Math.random() * 900) * k;
      pieces.push({
        x: cx + (Math.random() - 0.5) * hs * 0.5,
        y: cy + (Math.random() - 0.5) * hs * 0.5,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 220 * k,
        size, rad: size * 0.42,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 9,
        v: i % HEART_VARIANTS,
        delay: Math.random() * 0.12,
        e: BOUNCE * (0.75 + Math.random() * 0.5),
        active: false, dead: false, fadeAt: null,
      });
    }
    // قلوب تنزل من فوق الشاشة لتملأها وتسقط على الأزرار
    for (let i = 0; i < RAIN; i++) {
      const size = 18 + Math.random() * 24;
      pieces.push({
        x: Math.random() * W, y: -size,
        vx: (Math.random() - 0.5) * 90 * k,
        vy: (80 + Math.random() * 220) * k,
        size, rad: size * 0.42,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 6,
        v: (i + 1) % HEART_VARIANTS,
        delay: 0.15 + Math.random() * 1.5,
        e: BOUNCE * (0.75 + Math.random() * 0.5),
        active: false, dead: false, fadeAt: null,
      });
    }

    const sparks: Spark[] = Array.from({ length: SPARKS }, () => {
      const ang = Math.random() * Math.PI * 2;
      const sp = (250 + Math.random() * 800) * k;
      return {
        x: cx, y: cy,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        size: 2 + Math.random() * 3.5,
        delay: Math.random() * 0.15,
      };
    });

    let obstacles = collectObstacles(W, H);
    let lastScan = performance.now();
    let lastTick = 0;
    let raf = 0;
    const start = performance.now();
    let last = start;

    const loop = (now: number) => {
      const t = (now - start) / 1000;
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (now - lastScan > 300) { obstacles = collectObstacles(W, H); lastScan = now; }

      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);

      const steps = 3;
      const h = dt / steps;
      const drag = Math.exp(-0.7 * h);
      const endFade = t > seconds - 0.45 ? Math.max(0, (seconds - t) / 0.45) : 1;

      for (const p of pieces) {
        if (p.dead) continue;
        if (!p.active) {
          if (t < p.delay) continue;
          p.active = true;
        }

        for (let s = 0; s < steps; s++) {
          p.vy += g * h;
          p.vx *= drag; p.vy *= drag;
          p.x += p.vx * h;
          p.y += p.vy * h;
          p.rot += p.vr * h;

          if (p.y + p.rad > H * 0.4) {
            for (const o of obstacles) {
              const ix0 = o.x + o.r, ix1 = o.x + o.w - o.r;
              const iy0 = o.y + o.r, iy1 = o.y + o.h - o.r;
              const qx = Math.min(Math.max(p.x, ix0), ix1);
              const qy = Math.min(Math.max(p.y, iy0), iy1);
              const dx = p.x - qx, dy = p.y - qy;
              const R = p.rad + o.r;
              const d2 = dx * dx + dy * dy;
              if (d2 >= R * R) continue;

              let nx = 0, ny = -1;
              const d = Math.sqrt(d2);
              if (d > 1e-4) {
                nx = dx / d; ny = dy / d;
                p.x = qx + nx * R; p.y = qy + ny * R;
              } else {
                p.y = o.y - p.rad; // وصل لداخل الزر: ندفعه لفوق
              }
              const vn = p.vx * nx + p.vy * ny;
              if (vn < 0) {
                p.vx -= (1 + p.e) * vn * nx;
                p.vy -= (1 + p.e) * vn * ny;
                const tx = -ny, ty = nx;
                const vt = p.vx * tx + p.vy * ty;
                p.vx -= vt * 0.12 * tx;
                p.vy -= vt * 0.12 * ty;
                p.vx += (Math.random() - 0.5) * 160; // دفعة جانبية تخليه ينزلق ويسقط
                p.vr = p.vr * 0.5 + (vt / Math.max(8, p.rad)) * 0.4;
                if (p.fadeAt === null) p.fadeAt = t + 0.7 + Math.random() * 0.7;
                const impact = -vn;
                if (impact > 180 && now - lastTick > 45) {
                  lastTick = now;
                  playHeartTick(impact / 9000);
                }
              }
            }
          }
        }

        if (p.y - p.rad > H + 20) { p.dead = true; continue; }

        let alpha = endFade;
        if (p.fadeAt !== null && t > p.fadeAt) {
          alpha *= 1 - (t - p.fadeAt) / 0.35;
          if (alpha <= 0) { p.dead = true; continue; }
        }

        // قلب واقعي صغير (صورة جاهزة من الرسم التشريحي)
        const sprite = getHeartSprite(p.v);
        if (sprite) {
          const pw = p.size;
          const ph = p.size * HEART_ASPECT;
          c.save();
          c.globalAlpha = Math.max(0, alpha);
          c.translate(p.x, p.y);
          c.rotate(p.rot);
          c.drawImage(sprite, -pw / 2, -ph * 0.5, pw, ph);
          c.restore();
        }
      }

      // الشرارات
      const sd = Math.exp(-2.2 * dt);
      for (const s of sparks) {
        if (t < s.delay) continue;
        s.vx *= sd; s.vy *= sd;
        s.x += s.vx * dt; s.y += s.vy * dt;
        const life = (t - s.delay) / 1.4;
        if (life >= 1) continue;
        c.globalAlpha = (1 - life) * endFade;
        c.fillStyle = '#ffd1dc';
        c.shadowColor = '#ff5c7a';
        c.shadowBlur = 8;
        c.beginPath();
        c.arc(s.x, s.y, s.size * (1 - life * 0.6), 0, Math.PI * 2);
        c.fill();
        c.shadowBlur = 0;
      }
      c.globalAlpha = 1;

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [W, H, seconds]);

  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: W, height: H, pointerEvents: 'none' }} />;
}

// ── أنميشن ملء الشاشة: ينتفخ كبالونة → ينفجر → قلوب تتناثر وتسقط على الأزرار ──
function HeartAnimation({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<'inflate' | 'burst'>('inflate');
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const [{ W, H }] = useState(() => ({
    W: typeof window !== 'undefined' ? window.innerWidth : 360,
    H: typeof window !== 'undefined' ? window.innerHeight : 640,
  }));
  const heartSize = Math.round(Math.min(W * 0.78, H * 0.5)); // عرض القلب الواقعي

  // مفاتيح الحركة: القلب يكبر أثناء كل نفخة ويستقر قليلاً أثناء الشهيق
  const { times, scales, rotates } = useMemo(() => {
    const ts: number[] = [0];
    const ss: number[] = [0.05];
    const rs: number[] = [0];
    const n = PUMPS.length;
    let prev = 0.05;
    PUMPS.forEach((b, i) => {
      const s = 0.05 + 0.95 * Math.pow((i + 1) / n, 0.9);
      ts.push(b.t / INFLATE_S); ss.push(prev); rs.push(0);
      ts.push((b.t + b.d) / INFLATE_S); ss.push(s * 1.05); rs.push(i % 2 ? -3 : 3);
      prev = s;
    });
    ts.push(1); ss.push(1.18); rs.push(0);
    return { times: ts, scales: ss, rotates: rs };
  }, []);

  useEffect(() => {
    preloadHeartSprites();
    const stopSound = playHeartSound({
      inflateS: INFLATE_S,
      pumps: PUMPS,
      voiceText: VOICE_TEXT,
      voiceUrl: VOICE_URL,
      blowUrl: BLOW_URL,
    });
    const t1 = window.setTimeout(() => setPhase('burst'), INFLATE_S * 1000);
    const t2 = window.setTimeout(() => doneRef.current(), TOTAL_MS);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      stopSound();
    };
  }, []);

  const burstSeconds = (TOTAL_MS / 1000) - INFLATE_S;

  return (
    <div
      aria-hidden="true"
      data-gift-overlay="1"
      style={{ position: 'fixed', inset: 0, zIndex: 9400, pointerEvents: 'none', overflow: 'hidden' }}
    >
      {/* تعتيم خفيف يبرز القلوب */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: TOTAL_MS / 1000, times: [0, 0.1, 0.85, 1], ease: 'linear' }}
        style={{ position: 'absolute', inset: 0, background: 'rgba(24,0,10,0.38)' }}
      />

      {phase === 'inflate' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <motion.div
            initial={{ scale: 0.05 }}
            animate={{ scale: scales, rotate: rotates }}
            transition={{ duration: INFLATE_S, times, ease: 'easeInOut' }}
            style={{ willChange: 'transform' }}
          >
            <RealisticHeart size={heartSize} knot />
          </motion.div>
        </div>
      )}

      {phase === 'burst' && (
        <>
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 }}>
            {/* وميض + موجة الانفجار */}
            <motion.div
              initial={{ opacity: 0.95, scale: 0.15 }}
              animate={{ opacity: 0, scale: 3 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              style={{
                position: 'absolute', left: '-45vmin', top: '-45vmin', width: '90vmin', height: '90vmin', borderRadius: '50%',
                background: 'radial-gradient(circle, #ffffff 0%, #ff7a95 30%, rgba(255,45,85,0) 70%)',
              }}
            />
            <motion.div
              initial={{ opacity: 0.85, scale: 0.2 }}
              animate={{ opacity: 0, scale: 3.6 }}
              transition={{ duration: 0.85, ease: 'easeOut' }}
              style={{
                position: 'absolute', left: '-30vmin', top: '-30vmin', width: '60vmin', height: '60vmin', borderRadius: '50%',
                border: '4px solid rgba(255,140,165,0.9)',
              }}
            />
          </div>

          {/* القلوب والشرارات: محرك فيزياء (جاذبية + اصطدام بالأزرار) */}
          <BurstLayer W={W} H={H} seconds={burstSeconds} />
        </>
      )}
    </div>
  );
}

export const HeartGift: GiftDefinition = {
  id: 'heart',
  name: 'Heart',
  price: PRICE,
  durationMs: TOTAL_MS,
  Preview: HeartPreview,
  Animation: HeartAnimation,
};

export default HeartGift;
