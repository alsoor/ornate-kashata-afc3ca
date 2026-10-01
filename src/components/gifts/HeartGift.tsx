/**
 * هدية القلب (Zombie / مقبرة) — 500 Coins — مدتها 20 ثانية
 *
 * استُبدلت أنميشن القلب القديم بأنميشن مقبرة ليلية:
 * - Preview  : داخل مربع الهدايا: مقبرة صغيرة مع قبر يتوهج وزومبي يخرج قليلاً.
 * - Animation (20 ثانية):
 *     0–2s     : البث يظلم ليلاً + أصوات صراصير وذئاب
 *     2–5s     : توابيت وقشور أرض تظهر، شقوق تتوهج
 *     5–9s     : ثلاثة زومبي يخرجون من تحت الأرض
 *                يمين ويسار: يزحفان
 *                الوسط: يخرج ثم يسحب قلباً نابضاً من صدره ويرميه لصاحب البث (أو يأخذ صورة المستخدم المرفوعة)
 *     عند الهدية لمتحدث (رفع الصورة): الزومبي الوسط يأخذ الصورة مع الإطار ويدخلها في جسده وهو يضحك ثم تختفي
 *
 * ملف مستقل. الأصوات مولَّدة بـ Web Audio داخل الملف (بدون ملفات خارجية).
 * يستخدم نفس آلية data-gift-host / data-gift-lift / __stooornaGiftLift مثل البركان.
 */
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { GiftDefinition } from '../../lib/types';

// ── إعدادات الهدية ──────────────────────────────────────────────────────
const PRICE = 500;
const TOTAL_MS = 20000;
const TOTAL_S = TOTAL_MS / 1000;

const DARK_IN = 1.8;
const DARK_MAX = 0.88;
const GRAVES_AT = 2.2;
const ZOMBIE_AT = 5.0;
const HEART_PULL = 9.5;
const HEART_THROW = 11.2;
const HEART_ARRIVE = 13.0;
const LAUGH_AT = 11.5;
const FADE_OUT_AT = 17.5;
const LIGHT_BACK = 18.2;

const MAX_FX = 900;

// ── أدوات ──────────────────────────────────────────────────────────────
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// ── أصوات (Web Audio) ──────────────────────────────────────────────────
let sharedCtx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  try {
    if (!sharedCtx) sharedCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (sharedCtx.state === 'suspended') sharedCtx.resume();
    return sharedCtx;
  } catch { return null; }
}

function playTone(freq: number, dur: number, type: OscillatorType, gain: number, when = 0) {
  const ctx = getCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(ctx.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

function playNoise(dur: number, gain: number, when = 0, filterFreq = 800) {
  const ctx = getCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.4));
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = filterFreq;
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(ctx.destination);
  src.start(t0);
}

function playCrickets(durationS: number) {
  const ctx = getCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  for (let i = 0; i < 18; i++) {
    const t = t0 + rnd(0.2, durationS - 0.5);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(rnd(2800, 4200), t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.035, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + 0.12);
  }
}

function playWolfHowl(when = 0) {
  const ctx = getCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(180, t0);
  o.frequency.linearRampToValueAtTime(320, t0 + 0.8);
  o.frequency.linearRampToValueAtTime(140, t0 + 2.2);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.12, t0 + 0.15);
  g.gain.linearRampToValueAtTime(0.08, t0 + 1.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.6);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 900;
  o.connect(f); f.connect(g); g.connect(ctx.destination);
  o.start(t0); o.stop(t0 + 2.8);
}

function playZombieGroan(when = 0) {
  playNoise(0.7, 0.18, when, 220);
  playTone(80, 0.6, 'sawtooth', 0.08, when);
  playTone(55, 0.5, 'triangle', 0.06, when + 0.1);
}

function playLaugh(when = 0) {
  const ctx = getCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  for (let i = 0; i < 5; i++) {
    const t = t0 + i * 0.18;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(140 + i * 18, t);
    o.frequency.linearRampToValueAtTime(90 + i * 10, t + 0.12);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.11, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + 0.16);
  }
}

function playHeartbeat(when = 0, times = 4) {
  for (let i = 0; i < times; i++) {
    playTone(55, 0.12, 'sine', 0.14, when + i * 0.55);
    playTone(40, 0.18, 'sine', 0.1, when + i * 0.55 + 0.12);
  }
}

function playDirtRumble(when = 0) {
  playNoise(1.4, 0.22, when, 90);
  playTone(35, 1.2, 'triangle', 0.07, when);
}

// ── Preview ─────────────────────────────────────────────────────────────
function HeartPreview({ size = 72 }: { size?: number }) {
  return (
    <motion.div
      style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      animate={{ y: [0, -2, 0] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
    >
      <svg viewBox="0 0 80 80" width={size * 0.92} height={size * 0.92}>
        <defs>
          <radialGradient id="zg-moon" cx="50%" cy="40%" r="50%">
            <stop offset="0%" stopColor="#e8f0ff" />
            <stop offset="100%" stopColor="#6a7a9a" />
          </radialGradient>
          <linearGradient id="zg-dirt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3a2a1a" />
            <stop offset="100%" stopColor="#1a1208" />
          </linearGradient>
        </defs>
        {/* قمر */}
        <circle cx="62" cy="14" r="9" fill="url(#zg-moon)" opacity="0.9" />
        {/* أرض */}
        <path d="M0 58 Q20 52 40 58 T80 58 L80 80 L0 80 Z" fill="url(#zg-dirt)" />
        {/* قبر */}
        <rect x="28" y="38" width="24" height="22" rx="2" fill="#4a4a55" />
        <rect x="26" y="34" width="28" height="6" rx="1" fill="#5a5a68" />
        <text x="40" y="52" textAnchor="middle" fill="#2a2a30" fontSize="10" fontWeight="bold">RIP</text>
        {/* يد زومبي تطلع */}
        <g transform="translate(40 62)">
          <path d="M-4 0 L-3 -10 L0 -14 L3 -10 L4 0" fill="#5a8a4a" stroke="#2a4a2a" strokeWidth="0.8" />
          <circle cx="-2" cy="-8" r="1.2" fill="#3a5a2a" />
          <circle cx="2" cy="-8" r="1.2" fill="#3a5a2a" />
        </g>
        {/* صليب صغير */}
        <path d="M12 48 L12 58 M9 51 L15 51" stroke="#6a5a4a" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </motion.div>
  );
}

// ── Animation helpers ───────────────────────────────────────────────────
interface Lift {
  sx: number; sy: number; sr: number; ex: number; ey: number; R: number;
  img: HTMLImageElement | null; letter: string; name: string;
  restore: () => void; done?: boolean;
}
interface LiftInfo { userId: string; name?: string; avatarUrl?: string | null; }
interface Host { x: number; y: number; w: number; h: number; top: number; lift?: Lift; }

function findHost(W: number): Host {
  try {
    const el = document.querySelector<HTMLElement>('[data-gift-host]');
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0)
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, top: r.top };
    }
  } catch { /* ignore */ }
  return { x: W * 0.5, y: 56, w: 48, h: 48, top: 32 };
}

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

// جزيئات تراب / دخان
interface Pt {
  x: number; y: number; vx: number; vy: number;
  size: number; life: number; age: number; kind: 0 | 1 | 2; // 0 تراب، 1 شرارة، 2 دم
}

function HeartAnimation({ onDone }: { onDone: () => void }) {
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

    let raf = 0;
    let start = 0;
    let finished = false;
    const pts: Pt[] = [];
    let host: Host | null = null;
    let liftPre: HTMLImageElement | null = null;
    let soundsStarted = false;
    let heartThrown = false;
    let laughPlayed = false;
    let zombiesEmerged = false;

    // تحميل صورة المستلم مسبقاً
    const liftInfo0 = getLiftInfo();
    if (liftInfo0?.avatarUrl) {
      try {
        liftPre = new Image();
        liftPre.crossOrigin = 'anonymous';
        liftPre.src = String(liftInfo0.avatarUrl);
      } catch { liftPre = null; }
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.floor(window.innerWidth * dpr);
      cv.height = Math.floor(window.innerHeight * dpr);
      cv.style.width = window.innerWidth + 'px';
      cv.style.height = window.innerHeight + 'px';
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const spawn = (kind: Pt['kind'], x: number, y: number, vx: number, vy: number, size: number, life: number) => {
      if (pts.length > MAX_FX) return;
      pts.push({ x, y, vx, vy, size, life, age: 0, kind });
    };

    const k = Math.min(W, H) / 400;

    // مواقع الزومبي الثلاثة
    const zMidX = W * 0.5;
    const zLeftX = W * 0.22;
    const zRightX = W * 0.78;
    const groundY = H * 0.72;

    const drawGrave = (x: number, y: number, sc: number, alpha: number) => {
      c.save();
      c.globalAlpha = alpha;
      c.translate(x, y);
      c.scale(sc, sc);
      // قاعدة
      c.fillStyle = '#2a2a32';
      c.fillRect(-18, -4, 36, 8);
      // شاهد
      c.fillStyle = '#3a3a45';
      c.beginPath();
      c.moveTo(-14, -4);
      c.lineTo(-14, -38);
      c.quadraticCurveTo(-14, -48, 0, -48);
      c.quadraticCurveTo(14, -48, 14, -38);
      c.lineTo(14, -4);
      c.closePath();
      c.fill();
      c.strokeStyle = '#1a1a22';
      c.lineWidth = 1.5;
      c.stroke();
      // RIP
      c.fillStyle = '#1a1a20';
      c.font = 'bold 9px sans-serif';
      c.textAlign = 'center';
      c.fillText('RIP', 0, -28);
      c.restore();
    };

    const drawZombie = (
      x: number, y: number, sc: number, alpha: number,
      pose: 'crawl' | 'stand' | 'pull' | 'throw' | 'eat',
      t: number, side: -1 | 0 | 1
    ) => {
      c.save();
      c.globalAlpha = alpha;
      c.translate(x, y);
      c.scale(sc * (side === -1 ? -1 : 1), sc);

      const bodyGreen = '#4a7a3a';
      const bodyDark = '#2a4a22';
      const cloth = '#3a2a1a';

      if (pose === 'crawl') {
        // جسم يزحف
        const bob = Math.sin(t * 6 + side * 2) * 3;
        c.fillStyle = bodyGreen;
        c.beginPath();
        c.ellipse(0, bob, 22, 12, 0, 0, Math.PI * 2);
        c.fill();
        // رأس
        c.beginPath();
        c.arc(18, bob - 8, 11, 0, Math.PI * 2);
        c.fill();
        // عين
        c.fillStyle = '#c0ff40';
        c.beginPath();
        c.arc(22, bob - 10, 3, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#111';
        c.beginPath();
        c.arc(23, bob - 10, 1.5, 0, Math.PI * 2);
        c.fill();
        // ذراع أمامية
        c.strokeStyle = bodyDark;
        c.lineWidth = 5;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(8, bob + 2);
        c.lineTo(28 + Math.sin(t * 5) * 4, bob + 6);
        c.stroke();
        // رجل
        c.beginPath();
        c.moveTo(-10, bob + 4);
        c.lineTo(-22, bob + 10 + Math.sin(t * 5 + 1) * 3);
        c.stroke();
      } else {
        // واقف / يسحب قلب / يرمي / يأكل صورة
        const sway = Math.sin(t * 2.2) * 2;
        // أرجل
        c.fillStyle = cloth;
        c.fillRect(-10 + sway * 0.3, 18, 8, 22);
        c.fillRect(2 + sway * 0.3, 18, 8, 22);
        // جسم
        c.fillStyle = bodyGreen;
        c.beginPath();
        c.ellipse(sway, 2, 16, 20, 0, 0, Math.PI * 2);
        c.fill();
        // رأس
        c.beginPath();
        c.arc(sway, -22, 14, 0, Math.PI * 2);
        c.fill();
        // شعر متسخ
        c.fillStyle = bodyDark;
        c.beginPath();
        c.arc(sway - 4, -28, 6, 0, Math.PI * 2);
        c.arc(sway + 5, -30, 5, 0, Math.PI * 2);
        c.fill();
        // عيون متوهجة
        c.fillStyle = '#c0ff40';
        c.shadowColor = '#80ff20';
        c.shadowBlur = 8;
        c.beginPath();
        c.arc(sway - 5, -24, 3.5, 0, Math.PI * 2);
        c.arc(sway + 5, -24, 3.5, 0, Math.PI * 2);
        c.fill();
        c.shadowBlur = 0;
        c.fillStyle = '#111';
        c.beginPath();
        c.arc(sway - 4, -24, 1.6, 0, Math.PI * 2);
        c.arc(sway + 6, -24, 1.6, 0, Math.PI * 2);
        c.fill();
        // فم
        c.strokeStyle = '#1a2a12';
        c.lineWidth = 2;
        c.beginPath();
        if (pose === 'eat' || pose === 'throw') {
          c.arc(sway, -16, 5, 0.2, Math.PI - 0.2);
        } else {
          c.moveTo(sway - 5, -15);
          c.lineTo(sway + 5, -15);
        }
        c.stroke();

        // أذرع حسب الوضعية
        c.strokeStyle = bodyDark;
        c.lineWidth = 6;
        c.lineCap = 'round';
        if (pose === 'pull') {
          // يسحب من الصدر
          c.beginPath();
          c.moveTo(sway - 12, 0);
          c.lineTo(sway - 4, 8);
          c.stroke();
          c.beginPath();
          c.moveTo(sway + 12, 0);
          c.lineTo(sway + 4, 8);
          c.stroke();
        } else if (pose === 'throw') {
          c.beginPath();
          c.moveTo(sway - 10, -2);
          c.lineTo(sway - 28, -30);
          c.stroke();
          c.beginPath();
          c.moveTo(sway + 10, 2);
          c.lineTo(sway + 18, 12);
          c.stroke();
        } else if (pose === 'eat') {
          // يمسك الصورة ويضعها في الصدر
          c.beginPath();
          c.moveTo(sway - 12, -4);
          c.lineTo(sway - 2, 6);
          c.stroke();
          c.beginPath();
          c.moveTo(sway + 12, -4);
          c.lineTo(sway + 2, 6);
          c.stroke();
        } else {
          // stand — أذرع متدلية مع حركة خفيفة
          c.beginPath();
          c.moveTo(sway - 14, -2);
          c.lineTo(sway - 18 + Math.sin(t * 3) * 3, 16);
          c.stroke();
          c.beginPath();
          c.moveTo(sway + 14, -2);
          c.lineTo(sway + 18 + Math.sin(t * 3 + 1) * 3, 16);
          c.stroke();
        }
      }
      c.restore();
    };

    const drawBeatingHeart = (x: number, y: number, sc: number, alpha: number, beat: number) => {
      const pulse = 1 + Math.sin(beat * Math.PI * 2) * 0.12;
      c.save();
      c.globalAlpha = alpha;
      c.translate(x, y);
      c.scale(sc * pulse, sc * pulse);
      c.fillStyle = '#c01030';
      c.shadowColor = '#ff2040';
      c.shadowBlur = 12;
      c.beginPath();
      c.moveTo(0, 6);
      c.bezierCurveTo(-14, -4, -14, -16, 0, -10);
      c.bezierCurveTo(14, -16, 14, -4, 0, 6);
      c.fill();
      c.shadowBlur = 0;
      // لمعان
      c.fillStyle = 'rgba(255,180,180,0.45)';
      c.beginPath();
      c.ellipse(-3, -6, 3, 4, -0.4, 0, Math.PI * 2);
      c.fill();
      c.restore();
    };

    const loop = (now: number) => {
      if (!start) start = now;
      const t = (now - start) / 1000;
      if (t >= TOTAL_S && !finished) {
        finished = true;
        if (host?.lift && !host.lift.done) host.lift.restore();
        doneRef.current();
        return;
      }

      const endFade = t > FADE_OUT_AT ? 1 - smooth((t - FADE_OUT_AT) / (TOTAL_S - FADE_OUT_AT)) : 1;
      const dark = clamp01(t / DARK_IN) * DARK_MAX * (t > LIGHT_BACK ? 1 - smooth((t - LIGHT_BACK) / (TOTAL_S - LIGHT_BACK)) : 1);

      // أصوات
      if (!soundsStarted && t > 0.15) {
        soundsStarted = true;
        playCrickets(16);
        playWolfHowl(0.8);
        playWolfHowl(4.5);
        playDirtRumble(GRAVES_AT);
        playZombieGroan(ZOMBIE_AT + 0.3);
        playZombieGroan(ZOMBIE_AT + 1.1);
        playHeartbeat(HEART_PULL, 5);
      }
      if (t >= LAUGH_AT && !laughPlayed && getLiftInfo()) {
        laughPlayed = true;
        playLaugh(0);
      }

      // خلفية مظلمة
      c.clearRect(0, 0, W, H);
      c.fillStyle = `rgba(4, 6, 14, ${dark * endFade})`;
      c.fillRect(0, 0, W, H);

      // قمر خافت
      if (dark > 0.2) {
        c.save();
        c.globalAlpha = 0.35 * dark * endFade;
        const moonX = W * 0.78, moonY = H * 0.12;
        const gr = c.createRadialGradient(moonX, moonY, 0, moonX, moonY, 40 * k);
        gr.addColorStop(0, '#d0e0ff');
        gr.addColorStop(1, 'transparent');
        c.fillStyle = gr;
        c.beginPath();
        c.arc(moonX, moonY, 40 * k, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }

      // قبور
      if (t >= GRAVES_AT) {
        const gA = easeOut((t - GRAVES_AT) / 1.4) * endFade;
        drawGrave(W * 0.18, groundY - 10 * k, 1.1 * k, gA * 0.95);
        drawGrave(W * 0.5, groundY - 6 * k, 1.35 * k, gA);
        drawGrave(W * 0.82, groundY - 10 * k, 1.1 * k, gA * 0.95);
        // صلبان
        c.save();
        c.globalAlpha = gA * 0.7;
        c.strokeStyle = '#5a4a3a';
        c.lineWidth = 2.5 * k;
        c.lineCap = 'round';
        [[0.32, 0.68], [0.68, 0.66]].forEach(([px, py]) => {
          const cx = W * px, cy = H * py;
          c.beginPath();
          c.moveTo(cx, cy - 18 * k);
          c.lineTo(cx, cy + 8 * k);
          c.moveTo(cx - 8 * k, cy - 8 * k);
          c.lineTo(cx + 8 * k, cy - 8 * k);
          c.stroke();
        });
        c.restore();

        // شقوق أرض
        if (t < ZOMBIE_AT + 2) {
          c.save();
          c.globalAlpha = gA * 0.6;
          c.strokeStyle = '#2a1a0a';
          c.lineWidth = 2 * k;
          for (let i = 0; i < 5; i++) {
            const gx = W * (0.15 + i * 0.18);
            c.beginPath();
            c.moveTo(gx, groundY);
            c.lineTo(gx + rnd(-20, 20) * k, groundY + 30 * k);
            c.stroke();
          }
          c.restore();
        }
      }

      // جزيئات تراب عند الخروج
      if (t >= ZOMBIE_AT - 0.5 && t < ZOMBIE_AT + 2.5 && pts.length < 200) {
        for (let i = 0; i < 3; i++) {
          const zx = [zLeftX, zMidX, zRightX][i % 3];
          spawn(0, zx + rnd(-20, 20) * k, groundY, rnd(-40, 40) * k, -rnd(60, 180) * k, rnd(2, 6) * k, rnd(0.6, 1.4));
        }
      }

      // تحديث ورسم الجزيئات
      for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        p.age += 1 / 60;
        p.x += p.vx / 60;
        p.y += p.vy / 60;
        p.vy += 280 / 60;
        if (p.age >= p.life) { pts.splice(i, 1); continue; }
        const a = (1 - p.age / p.life) * endFade;
        c.globalAlpha = a;
        if (p.kind === 0) c.fillStyle = '#5a3a1a';
        else if (p.kind === 1) c.fillStyle = '#c0ff40';
        else c.fillStyle = '#a01020';
        c.beginPath();
        c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;

      // الزومبي
      if (t >= ZOMBIE_AT) {
        if (!zombiesEmerged) {
          zombiesEmerged = true;
          playZombieGroan(0);
        }
        const emerge = easeOut((t - ZOMBIE_AT) / 1.8);
        const zAlpha = emerge * endFade;

        // يسار يزحف
        const crawlProg = clamp01((t - ZOMBIE_AT) / 3.5);
        const leftX = lerp(zLeftX, zLeftX + 30 * k, crawlProg);
        const leftY = groundY - 8 * k * emerge;
        drawZombie(leftX, leftY, 1.15 * k, zAlpha, 'crawl', t, -1);

        // يمين يزحف
        const rightX = lerp(zRightX, zRightX - 30 * k, crawlProg);
        drawZombie(rightX, leftY, 1.15 * k, zAlpha, 'crawl', t, 1);

        // الوسط
        const midY = groundY - 55 * k * emerge;
        const isLift = !!getLiftInfo();
        let midPose: 'crawl' | 'stand' | 'pull' | 'throw' | 'eat' = 'stand';
        if (t < HEART_PULL) midPose = emerge < 0.9 ? 'crawl' : 'stand';
        else if (isLift) midPose = t < LAUGH_AT + 1.5 ? 'eat' : 'stand';
        else if (t < HEART_THROW) midPose = 'pull';
        else midPose = 'throw';

        drawZombie(zMidX, midY, 1.4 * k, zAlpha, midPose, t, 0);

        // قلب نابض أو صورة المستخدم
        if (!isLift && t >= HEART_PULL && t < HEART_ARRIVE + 1.5) {
          let hx = zMidX, hy = midY - 10 * k;
          if (t >= HEART_THROW) {
            if (!heartThrown) {
              heartThrown = true;
              // تحديد هدف الرمي (صاحب البث)
              if (!host) host = findHost(W);
              playHeartbeat(0, 2);
            }
            if (!host) host = findHost(W);
            const prog = easeOut((t - HEART_THROW) / (HEART_ARRIVE - HEART_THROW));
            hx = lerp(zMidX, host.x, prog);
            hy = lerp(midY - 10 * k, host.y, prog) - Math.sin(prog * Math.PI) * 80 * k;
          }
          const beat = (t - HEART_PULL) * 1.8;
          drawBeatingHeart(hx, hy, 1.1 * k, zAlpha * (t > HEART_ARRIVE ? 1 - smooth((t - HEART_ARRIVE) / 1.2) : 1), beat);
        }

        // عند الرفع: صورة المستخدم ترتفع ثم الزومبي يأخذها
        if (isLift) {
          if (!host) {
            const lf = findLift(W, H, liftPre);
            if (lf) host = lf;
          }
          if (host?.lift) {
            const L = host.lift;
            // صعود الصورة
            const up = easeOut(clamp01((t - (ZOMBIE_AT + 1.5)) / 1.8));
            // بعد الضحك يدخلها في الجسد ثم تختفي
            const absorb = t >= LAUGH_AT + 0.8 ? smooth((t - (LAUGH_AT + 0.8)) / 1.6) : 0;
            const e2 = up * (1 - absorb);
            if (absorb >= 1 && !L.done) { L.done = true; L.restore(); }

            if (e2 > 0.01) {
              const ax = lerp(L.sx, L.ex, e2);
              const ay = lerp(L.sy, L.ey, e2) + Math.sin(t * 2.4) * 4 * k * e2;
              const ar = lerp(L.sr, L.R, e2);

              // توهج أخضر زومبي حول الصورة
              c.save();
              c.globalCompositeOperation = 'lighter';
              c.globalAlpha = 0.35 * e2 * endFade;
              const glow = c.createRadialGradient(ax, ay, 0, ax, ay, ar * 2.2);
              glow.addColorStop(0, 'rgba(120,255,40,0.5)');
              glow.addColorStop(1, 'transparent');
              c.fillStyle = glow;
              c.beginPath();
              c.arc(ax, ay, ar * 2.2, 0, Math.PI * 2);
              c.fill();
              c.restore();

              // رسم الصورة
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
                c.fillStyle = '#1a2a1a';
                c.fillRect(ax - ar, ay - ar, ar * 2, ar * 2);
                c.fillStyle = '#80ff40';
                c.font = `800 ${Math.round(ar * 1.0)}px sans-serif`;
                c.textAlign = 'center';
                c.textBaseline = 'middle';
                c.fillText(L.letter, ax, ay + ar * 0.04);
              }
              c.restore();

              // إطار أخضر
              c.beginPath();
              c.arc(ax, ay, ar, 0, Math.PI * 2);
              c.lineWidth = Math.max(2.5, ar * 0.08);
              c.strokeStyle = 'rgba(140,255,60,0.95)';
              c.shadowColor = 'rgba(80,200,20,0.9)';
              c.shadowBlur = 12 * e2;
              c.stroke();
              c.restore();

              // اسم
              if (e2 > 0.45) {
                c.save();
                c.globalAlpha = clamp01((e2 - 0.45) * 2) * endFade;
                c.font = `800 ${Math.round(Math.max(12, ar * 0.28))}px sans-serif`;
                c.textAlign = 'center';
                c.textBaseline = 'top';
                c.shadowColor = 'rgba(0,0,0,0.9)';
                c.shadowBlur = 6;
                c.fillStyle = '#d0ffb0';
                c.fillText(L.name.length > 18 ? L.name.slice(0, 17) + '…' : L.name, ax, ay + ar + 8 * k);
                c.restore();
              }
              c.globalAlpha = 1;
            }

            // بعد الامتصاص: شرارات خضراء من صدر الزومبي
            if (absorb > 0.3 && absorb < 1) {
              for (let i = 0; i < 2; i++) {
                spawn(1, zMidX + rnd(-15, 15) * k, midY + rnd(-5, 15) * k, rnd(-50, 50) * k, -rnd(20, 80) * k, rnd(2, 5) * k, rnd(0.4, 0.9));
              }
            }
          }
        }
      }

      // ضباب خفيف في الأسفل
      if (dark > 0.3) {
        c.save();
        c.globalAlpha = 0.15 * dark * endFade;
        const fog = c.createLinearGradient(0, H * 0.55, 0, H);
        fog.addColorStop(0, 'transparent');
        fog.addColorStop(1, '#1a2a1a');
        c.fillStyle = fog;
        c.fillRect(0, H * 0.55, W, H * 0.45);
        c.restore();
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      if (host?.lift && !host.lift.done) host.lift.restore();
    };
  }, [W, H]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, pointerEvents: 'none' }}>
      <canvas ref={cvRef} style={{ position: 'absolute', left: 0, top: 0, display: 'block' }} />
    </div>
  );
}

export const HeartGift: GiftDefinition = {
  id: 'heart',
  name: 'Zombie',
  price: PRICE,
  durationMs: TOTAL_MS,
  Preview: HeartPreview,
  Animation: HeartAnimation,
};

export default HeartGift;
