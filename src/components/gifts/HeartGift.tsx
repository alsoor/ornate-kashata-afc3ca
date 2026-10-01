/**
 * هدية القلب (Heart) — 25 Coins
 *
 * - Preview  : قلب أحمر ينبض داخل مربع الهدايا.
 * - Animation: قلب (بالونة) ينتفخ بنفَس شخص ينفخ بالونة (صوت نفخ/شهيق/صرير مطاط) ثم ينفجر بفرقعة
 *              وصوت امرأة يقول "I love you"، وتتناثر قلوب كثيرة في كل الشاشة.
 *              القلوب تسقط بفيزياء حقيقية (جاذبية + ارتداد) وتصطدم بأزرار البث السفلية
 *              (أي button / رابط / input في أسفل الصفحة) ثم تنزلق وتسقط وتختفي.
 *
 * هذا الملف مستقل بالكامل: غيّر الأرقام تحت (السعر/المدد/عدد القطع/الجاذبية) أو الصوت من دالة playHeartSound.
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
import { getAudioCtx, noiseBuffer } from '../../lib/audio';

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

const HEART_PATH =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';

function GlossyHeart({ size, knot = false }: { size: number; knot?: boolean }) {
  const gid = React.useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block', overflow: 'visible', filter: 'drop-shadow(0 0 10px rgba(255,45,85,0.65))' }}>
      <defs>
        <radialGradient id={`hg${gid}`} cx="35%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#ff8aa0" />
          <stop offset="45%" stopColor="#ff2d55" />
          <stop offset="100%" stopColor="#b3002a" />
        </radialGradient>
      </defs>
      {/* عقدة البالونة */}
      {knot && <path d="M12 20.6 L10.3 23.2 L13.7 23.2 Z" fill="#b3002a" />}
      <path d={HEART_PATH} fill={`url(#hg${gid})`} />
      <ellipse cx="8" cy="7.2" rx="2.4" ry="1.4" transform="rotate(-35 8 7.2)" fill="rgba(255,255,255,0.55)" />
    </svg>
  );
}

// ── الصوت ──────────────────────────────────────────────────────────────

const FEMALE_RE = /female|woman|samantha|victoria|karen|moira|tessa|zira|susan|hazel|aria|jenny|ava|allison|serena|fiona|nicky|google us english|google uk english female/i;
const MALE_RE = /\bmale\b|david|mark|daniel|alex|fred|george|james|guy|ravi|rishi|arthur|oliver/i;

function pickWomanVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const en = voices.filter(v => /^en/i.test(v.lang));
  return (
    en.find(v => FEMALE_RE.test(v.name) && !MALE_RE.test(v.name)) ||
    en.find(v => !MALE_RE.test(v.name)) ||
    null
  );
}

// صوت امرأة تقول I love you
function speakILoveYou(audios: HTMLAudioElement[]) {
  if (VOICE_URL) {
    try {
      const a = new Audio(VOICE_URL);
      a.volume = 1;
      audios.push(a);
      void a.play().catch(() => { /* ignore */ });
    } catch { /* ignore */ }
    return;
  }
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const u = new SpeechSynthesisUtterance(VOICE_TEXT);
    u.lang = 'en-US';
    u.rate = 0.88;
    u.pitch = 1.3; // نبرة أنثوية
    u.volume = 1;
    const v = pickWomanVoice(synth.getVoices());
    if (v) { u.voice = v; u.lang = v.lang; }
    synth.cancel();
    synth.speak(u);
  } catch { /* ignore */ }
}

// نفخ بالونة حقيقي (نفَس + شهيق + صرير مطاط) ثم فرقعة + صوت المرأة
function playHeartSound(): () => void {
  const ctx = getAudioCtx();
  const sources: AudioScheduledSourceNode[] = [];
  const timers: number[] = [];
  const audios: HTMLAudioElement[] = [];
  let master: GainNode | null = null;

  // تجهيز أصوات الجهاز مبكراً (تتحمل بشكل متأخر في بعض المتصفحات)
  try {
    if (!VOICE_URL && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      const prime = new SpeechSynthesisUtterance(' ');
      prime.volume = 0;
      window.speechSynthesis.speak(prime);
    }
  } catch { /* ignore */ }

  if (BLOW_URL) {
    try {
      const a = new Audio(BLOW_URL);
      a.volume = 1;
      audios.push(a);
      void a.play().catch(() => { /* ignore */ });
    } catch { /* ignore */ }
  }

  if (ctx) {
    const t0 = ctx.currentTime + 0.02;
    const tb = t0 + INFLATE_S;

    master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);
    const out = master;

    const noise = (dur: number) => {
      const s = ctx.createBufferSource();
      s.buffer = noiseBuffer(ctx, dur);
      sources.push(s);
      return s;
    };

    if (!BLOW_URL) {
      PUMPS.forEach((b, i) => {
        const t = t0 + b.t;
        const te = t + b.d;
        const k = i / (PUMPS.length - 1);

        // 1) الزفير: هواء ينفخه الفم داخل البالونة
        const n = noise(b.d + 0.1);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 380;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 0.8;
        bp.frequency.setValueAtTime(850 + k * 500, t);
        bp.frequency.linearRampToValueAtTime(1100 + k * 700, te);
        const g = ctx.createGain();
        const peak = 0.2 + k * 0.08;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(peak, t + 0.07);
        g.gain.setValueAtTime(peak, te - 0.1);
        g.gain.exponentialRampToValueAtTime(0.0001, te);
        // اضطراب خفيف في الهواء
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 9 + Math.random() * 6;
        const lg = ctx.createGain();
        lg.gain.value = 0.05;
        lfo.connect(lg); lg.connect(g.gain);
        n.connect(hp); hp.connect(bp); bp.connect(g); g.connect(out);
        n.start(t); n.stop(te + 0.1);
        lfo.start(t); lfo.stop(te + 0.1);
        sources.push(lfo);

        // 2) "بف" الشفاه عند بداية النفخة
        const lip = ctx.createOscillator();
        const lipG = ctx.createGain();
        lip.type = 'sine';
        lip.frequency.setValueAtTime(140, t);
        lip.frequency.exponentialRampToValueAtTime(60, t + 0.07);
        lipG.gain.setValueAtTime(0.0001, t);
        lipG.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
        lipG.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        lip.connect(lipG); lipG.connect(out);
        lip.start(t); lip.stop(t + 0.1);
        sources.push(lip);

        // 3) صرير المطاط وهو يتمدد (يزيد مع امتلاء البالونة)
        if (i >= 1) {
          const sq = ctx.createOscillator();
          sq.type = 'sawtooth';
          const f0 = 700 + i * 120;
          sq.frequency.setValueAtTime(f0, t + 0.05);
          sq.frequency.linearRampToValueAtTime(f0 + 350 + i * 40, te);
          const vib = ctx.createOscillator();
          vib.frequency.value = 28 + Math.random() * 10;
          const vibG = ctx.createGain();
          vibG.gain.value = 35;
          vib.connect(vibG); vibG.connect(sq.frequency);
          const sbp = ctx.createBiquadFilter();
          sbp.type = 'bandpass';
          sbp.Q.value = 7;
          sbp.frequency.value = 1700 + i * 150;
          const sg = ctx.createGain();
          const sp = 0.02 + k * 0.03;
          sg.gain.setValueAtTime(0.0001, t + 0.05);
          sg.gain.linearRampToValueAtTime(sp, t + 0.18);
          sg.gain.exponentialRampToValueAtTime(0.0001, te);
          sq.connect(sbp); sbp.connect(sg); sg.connect(out);
          sq.start(t + 0.05); sq.stop(te + 0.02);
          vib.start(t + 0.05); vib.stop(te + 0.02);
          sources.push(sq, vib);
        }

        // 4) الشهيق بين النفخات
        if (i < PUMPS.length - 1) {
          const ti = te + 0.02;
          const di = PUMPS[i + 1].t - b.t - b.d - 0.04;
          if (di > 0.05) {
            const inh = noise(di + 0.05);
            const ibp = ctx.createBiquadFilter();
            ibp.type = 'bandpass';
            ibp.Q.value = 0.6;
            ibp.frequency.setValueAtTime(900, ti);
            ibp.frequency.linearRampToValueAtTime(1500, ti + di);
            const ig = ctx.createGain();
            ig.gain.setValueAtTime(0.0001, ti);
            ig.gain.linearRampToValueAtTime(0.07, ti + di * 0.5);
            ig.gain.linearRampToValueAtTime(0.0001, ti + di);
            inh.connect(ibp); ibp.connect(ig); ig.connect(out);
            inh.start(ti); inh.stop(ti + di + 0.05);
          }
        }
      });

      // توتر المطاط قبل الانفجار: صرير متقطع
      const tn = noise(0.9);
      const tbp = ctx.createBiquadFilter();
      tbp.type = 'bandpass';
      tbp.Q.value = 6;
      tbp.frequency.setValueAtTime(2800, tb - 0.8);
      tbp.frequency.linearRampToValueAtTime(4200, tb);
      const tg = ctx.createGain();
      tg.gain.setValueAtTime(0.03, tb - 0.8);
      const tl = ctx.createOscillator();
      tl.type = 'square';
      tl.frequency.value = 22;
      const tlg = ctx.createGain();
      tlg.gain.value = 0.03;
      tl.connect(tlg); tlg.connect(tg.gain);
      tn.connect(tbp); tbp.connect(tg); tg.connect(out);
      tg.gain.setValueAtTime(0.0001, tb - 0.001);
      tn.start(tb - 0.8); tn.stop(tb);
      tl.start(tb - 0.8); tl.stop(tb);
      sources.push(tl);
    }

    // الانفجار: طقة بالونة حادة + ضربة هواء قصيرة
    const crack = noise(0.2);
    const chp = ctx.createBiquadFilter();
    chp.type = 'highpass';
    chp.frequency.value = 900;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(1.0, tb);
    cg.gain.exponentialRampToValueAtTime(0.0001, tb + 0.12);
    crack.connect(chp); chp.connect(cg); cg.connect(out);
    crack.start(tb); crack.stop(tb + 0.2);

    const boom = noise(0.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3500, tb);
    lp.frequency.exponentialRampToValueAtTime(200, tb + 0.4);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.55, tb);
    bg.gain.exponentialRampToValueAtTime(0.0001, tb + 0.4);
    boom.connect(lp); lp.connect(bg); bg.connect(out);
    boom.start(tb); boom.stop(tb + 0.5);

    const thump = ctx.createOscillator();
    const thg = ctx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(170, tb);
    thump.frequency.exponentialRampToValueAtTime(40, tb + 0.35);
    thg.gain.setValueAtTime(0.8, tb);
    thg.gain.exponentialRampToValueAtTime(0.0001, tb + 0.4);
    thump.connect(thg); thg.connect(out);
    thump.start(tb); thump.stop(tb + 0.45);
    sources.push(thump);

    // طقطقة قطع القلب المتفتتة
    for (let i = 0; i < 12; i++) {
      const t = tb + 0.08 + Math.random() * 0.9;
      const n = noise(0.05);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2500 + Math.random() * 2500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      n.connect(hp); hp.connect(g); g.connect(out);
      n.start(t); n.stop(t + 0.06);
    }
  }

  // صوت المرأة "I love you" مع لحظة الانفجار
  timers.push(window.setTimeout(() => speakILoveYou(audios), (INFLATE_S + 0.12) * 1000));

  return () => {
    timers.forEach(t => window.clearTimeout(t));
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    audios.forEach(a => { try { a.pause(); } catch { /* ignore */ } });
    if (ctx && master) {
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
        sources.forEach(s => { try { s.stop(ctx.currentTime + 0.1); } catch { /* ignore */ } });
      } catch { /* ignore */ }
    }
  };
}

// نقرة خفيفة عند ارتطام قلب بزر
function playTick(vol: number) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(600 + Math.random() * 500, t);
    o.frequency.exponentialRampToValueAtTime(260, t + 0.05);
    g.gain.setValueAtTime(Math.min(0.07, vol), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + 0.07);
  } catch { /* ignore */ }
}

// ── الشكل داخل مربع الهدايا: قلب ينبض ─────────────────────────────────────
function HeartPreview({ size = 72 }: { size?: number }) {
  return (
    <motion.div
      aria-hidden="true"
      animate={{ scale: [1, 1.16, 1, 1.1, 1] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', times: [0, 0.18, 0.36, 0.5, 1] }}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <GlossyHeart size={size} />
    </motion.div>
  );
}

// ── الفيزياء: قلوب تسقط وتصطدم بأزرار البث ─────────────────────────────────
const FRAG_COLORS = ['#ff2d55', '#ff5c7a', '#e11d48', '#ff8fa3', '#ffd1dc', '#ff3b6b'];

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
  color: string; delay: number; e: number;
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

    const heart = new Path2D(HEART_PATH);
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
        color: FRAG_COLORS[i % FRAG_COLORS.length],
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
        color: FRAG_COLORS[(i + 2) % FRAG_COLORS.length],
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
                  playTick(impact / 9000);
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

        const sc = p.size / 24;
        c.save();
        c.globalAlpha = Math.max(0, alpha);
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        c.scale(sc, sc);
        c.translate(-12, -11.5);
        c.fillStyle = p.color;
        c.fill(heart);
        c.fillStyle = 'rgba(255,255,255,0.35)';
        c.beginPath();
        c.ellipse(8, 7.2, 2.2, 1.2, -0.6, 0, Math.PI * 2);
        c.fill();
        c.restore();
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
  const heartSize = Math.round(Math.min(W * 0.85, H * 0.55));

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
    const stopSound = playHeartSound();
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
            <GlossyHeart size={heartSize} knot />
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
