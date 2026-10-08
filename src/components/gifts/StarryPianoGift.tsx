/**
 * Starry Piano gift — 400 Coins — 15 seconds
 *
 * - Preview  : inside the gift square (top row, 3rd slot) a tiny night scene is animated BEFORE tapping:
 *              twinkling stars, a woman at a grand piano whose arm plays, keys that light up one by one,
 *              floating music notes and glowing crystals along the bottom.
 * - Animation: (seconds)
 *     0.0 – 1.8  : the live sky fades into a deep night full of glowing, twinkling stars (+ moon, aurora, shooting stars)
 *     0.5 – 1.8  : a woman sits down at a grand piano at the bottom of the live
 *     1.4 – 14.0 : romantic piano music (src/lib/starryPianoSounds.ts); her hands follow the real notes, keys glow,
 *                  music notes and little hearts float up
 *     3.0 – 13.0 : glowing crystals grow on top of every button / frame (and along the floor), pulsing with the music
 *     13.0 – 15.0: crystals fade, the piano dissolves into sparkles, the sky returns to normal
 *
 *   Gift to the HOST   : a starlight aura with a vibrating spectrum ring pulses around the host's profile.
 *   Gift to a USER     : the user's profile frame rises to the middle of the live and VIBRATES with the music
 *                        (radial equalizer bars + ripples + frame pulse), then returns to its place.
 *
 * Standalone file. Sounds live in src/lib/starryPianoSounds.ts. Change the numbers below (price / duration / timings).
 *
 * UI hooks (all optional, same as the other gifts):
 *   data-gift-host : on the host's profile picture
 *   data-gift-user : on each speaker's picture (LiveCoinsDock sets the lift info automatically)
 *   Crystals grow on: button, [role=button], a[href], input, textarea, select, [data-gift-host], [data-gift-walk], [data-gift-hot]
 */
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { GiftDefinition } from '../../lib/types';
import { playStarryPianoSound, STARRY_SCORE, STARRY_LEAD_S } from '../../lib/starryPianoSounds';
import type { ScoreEvent } from '../../lib/starryPianoSounds';

// ── gift settings ───────────────────────────────────────────────────────
const PRICE = 400;
// GIFTS-9S-V2: every gift lasts 9 seconds
const TOTAL_MS = 9000;            // real duration (9 seconds)
const TOTAL_S = 15;               // internal timeline length (original story)
const TIME_K = TOTAL_S / (TOTAL_MS / 1000); // playback speed so the whole story fits in 9 s

const NIGHT_IN = 1.8;            // sky fades to night
const NIGHT_MAX = 0.74;          // darkness strength (1 = black)
const NIGHT_OUT_AT = 13.4;
const NIGHT_OUT_END = 14.9;
const PIANO_IN_AT = 0.5;
const PIANO_IN_S = 1.3;
const PIANO_OUT_AT = 13.2;
const PIANO_OUT_S = 1.3;
const CRYSTAL_AT = 3.0;
const CRYSTAL_OUT_AT = 13.0;
const CRYSTAL_OUT_S = 1.6;
const LIFT_AT = 0.9;             // user's frame starts rising
const LIFT_S = 1.6;
const LIFT_BACK_AT = 13.0;       // user's frame goes back
const LIFT_BACK_S = 1.2;

const MAX_FX = 700;
const MAX_CRYSTALS = 320;
const HOT_SEL = 'button, [role="button"], a[href], input, textarea, select, [data-gift-host], [data-gift-walk], [data-gift-hot]';

// sprite colors: 0 white, 1 blue, 2 gold, 3 pink, 4 violet, 5 cyan
const SPR_LIST = ['255,255,255', '170,205,255', '255,226,160', '255,150,215', '176,140,255', '130,235,255'];
const NOTE_COL = ['#ffb3de', '#9ff0ff', '#ffe9a0', '#d2b6ff'];
const NOTE_SPR = [3, 5, 2, 4];
// crystal palettes: light facet, mid, dark facet, glow sprite
const PALS = [
  { l: '#d9fbff', m: '#5fd8ff', d: '#2a6fd6', spr: 5 },
  { l: '#ffe3f3', m: '#ff8fd0', d: '#a63ad0', spr: 3 },
  { l: '#efe3ff', m: '#a98cff', d: '#4a2fb8', spr: 4 },
  { l: '#fff6d2', m: '#ffd36e', d: '#c9822a', spr: 2 },
];

// ── math helpers ────────────────────────────────────────────────────────
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
//  Preview — animated mini night scene inside the gift square
// ═══════════════════════════════════════════════════════════════════════
const SPG_CSS = `
@keyframes spg-twinkle{0%,100%{opacity:.25;transform:scale(.6)}50%{opacity:1;transform:scale(1.2)}}
@keyframes spg-note{0%{transform:translate(0,0) scale(.6) rotate(-8deg);opacity:0}15%{opacity:1}100%{transform:translate(var(--dx),-26px) scale(1) rotate(12deg);opacity:0}}
@keyframes spg-key{0%,22%,100%{fill:#f4f1ff}6%,14%{fill:#ff8fd0}}
@keyframes spg-hair{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(5deg)}}
@keyframes spg-arm{0%,100%{transform:rotate(0deg)}25%{transform:rotate(-6deg)}50%{transform:rotate(3deg)}75%{transform:rotate(-4deg)}}
@keyframes spg-sway{0%,100%{transform:rotate(-1.5deg)}50%{transform:rotate(2deg)}}
@keyframes spg-crystal{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes spg-halo{0%,100%{filter:drop-shadow(0 0 3px rgba(150,120,255,.55))}50%{filter:drop-shadow(0 0 8px rgba(120,220,255,.95))}}
.spg-tw{animation:spg-twinkle 2.2s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}
.spg-note{animation:spg-note 3.2s ease-out infinite;transform-box:fill-box;transform-origin:50% 50%}
.spg-key{animation:spg-key 2.4s linear infinite}
.spg-hair{animation:spg-hair 2.4s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 0%}
.spg-arm{animation:spg-arm 1.2s ease-in-out infinite;transform-box:view-box;transform-origin:10px 27px}
.spg-sway{animation:spg-sway 2.8s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 100%}
.spg-crystal{animation:spg-crystal 1.6s ease-in-out infinite}
.spg-halo{animation:spg-halo 2.4s ease-in-out infinite}
`;

const PV_STARS: { x: number; y: number; r: number; d: number }[] = [
  { x: 9, y: 9, r: 0.9, d: 0 }, { x: 19, y: 15, r: 0.6, d: 0.5 }, { x: 27, y: 7, r: 0.8, d: 1.1 },
  { x: 38, y: 12, r: 0.6, d: 0.3 }, { x: 46, y: 6, r: 0.9, d: 0.9 }, { x: 55, y: 16, r: 0.7, d: 0.2 },
  { x: 14, y: 24, r: 0.5, d: 1.4 }, { x: 57, y: 27, r: 0.5, d: 0.7 }, { x: 33, y: 22, r: 0.5, d: 1.7 },
];

function StarryPianoPreview({ size = 40 }: { size?: number }) {
  const uid = React.useId().replace(/:/g, '');
  const box = Math.round(size * 1.12);
  const ref = (n: string) => `url(#${n}${uid})`;
  return (
    <motion.div
      aria-hidden="true"
      animate={{ y: [0, -1.5, 0] }}
      transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
      style={{ position: 'relative', width: box, height: box, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <style>{SPG_CSS}</style>
      <svg width={box} height={box} viewBox="0 0 64 64" className="spg-halo" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id={`sky${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#060a30" />
            <stop offset="55%" stopColor="#1a1262" />
            <stop offset="100%" stopColor="#40207a" />
          </linearGradient>
          <linearGradient id={`dress${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b58cff" />
            <stop offset="100%" stopColor="#4a2a9a" />
          </linearGradient>
          <linearGradient id={`lid${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#32277a" />
            <stop offset="100%" stopColor="#0e0a24" />
          </linearGradient>
          <radialGradient id={`moon${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fffbe0" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#ffe9a0" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect x="1.5" y="1.5" width="61" height="61" rx="12" fill={ref('sky')} stroke="rgba(170,150,255,.6)" strokeWidth="1" />

        {/* stars */}
        {PV_STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" className="spg-tw" style={{ animationDelay: `${s.d}s` }} />
        ))}
        <circle cx="50" cy="13" r="6" fill={ref('moon')} className="spg-tw" />
        <circle cx="50" cy="13" r="2.4" fill="#fff6d0" />

        {/* crystals on the floor */}
        {[6, 14, 22, 30, 38, 47, 55].map((x, i) => {
          const h = 5 + ((i * 3) % 5);
          const col = ['#5fd8ff', '#ff8fd0', '#a98cff', '#5fd8ff', '#ffd36e', '#ff8fd0', '#a98cff'][i];
          return (
            <polygon
              key={i} points={`${x - 2},60 ${x - 2.2},${60 - h * 0.6} ${x},${60 - h} ${x + 2.2},${60 - h * 0.6} ${x + 2},60`}
              fill={col} fillOpacity="0.85" stroke="#fff" strokeOpacity="0.6" strokeWidth="0.3"
              className="spg-crystal" style={{ animationDelay: `${i * 0.23}s` }}
            />
          );
        })}

        {/* piano */}
        <g>
          <rect x="29" y="43" width="1.6" height="12" fill="#0a0818" />
          <rect x="43" y="43" width="1.6" height="12" fill="#0a0818" />
          <rect x="55" y="43" width="1.6" height="12" fill="#0a0818" />
          <path d="M26 38 L58 37.5 Q61 38 60 41 Q58 44 52 44 L26 44 Z" fill="#14102e" stroke="#8f7bff" strokeWidth="0.4" />
          <polygon points="28,37.5 58,37 54,24 33,28" fill={ref('lid')} stroke="#9a86ff" strokeWidth="0.5" />
          <polygon points="33,36.5 37,36.5 42,27 39,27.4" fill="#c8bfff" fillOpacity="0.2" />
          {/* keyboard */}
          <rect x="13" y="36" width="14" height="5" fill="#0b0820" />
          {[0, 1, 2, 3, 4].map(i => (
            <rect key={i} x={13.3 + i * 2.8} y="36.4" width="2.5" height="3.6" fill="#f4f1ff" className="spg-key" style={{ animationDelay: `${i * 0.48}s` }} />
          ))}
          {[1, 2, 4].map(i => (<rect key={i} x={13.3 + i * 2.8 - 0.8} y="36.4" width="1.6" height="2.2" fill="#120d28" />))}
        </g>

        {/* woman */}
        <g>
          <g className="spg-hair">
            <path d="M8 19 Q2 22 3.4 33 Q4.4 40 7 44 Q6.6 36 9.4 28 Z" fill="#241426" />
          </g>
          <g className="spg-sway">
            <path d="M7 36 L14 36 Q20 41 22 55 L1 55 Q4 44 7 36 Z" fill={ref('dress')} />
          </g>
          <path d="M6 27 L12.4 27 L12.6 37 L6.6 37.4 Z" fill="#8a63ff" />
          <circle cx="10.6" cy="21.6" r="3.6" fill="#f3d6c8" />
          <path d="M7.2 21.5 Q7.4 17.2 11 17.6 Q13.6 18 14 21 Q10.6 19 7.2 21.5 Z" fill="#241426" />
          <path d="M11.8 21.6 q1 .8 2 0" fill="none" stroke="#3a2433" strokeWidth="0.45" strokeLinecap="round" />
          <g className="spg-arm">
            <path d="M10 27.4 L16 33.4 L21 36.6" fill="none" stroke="#f3d6c8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="21.4" cy="36.8" r="1.2" fill="#f3d6c8" />
          </g>
        </g>

        {/* floating notes */}
        {[
          { x: 18, c: '#ffb3de', d: 0, dx: 2 },
          { x: 24, c: '#9ff0ff', d: 1.0, dx: 8 },
          { x: 14, c: '#ffe9a0', d: 2.0, dx: -2 },
        ].map((n, i) => (
          <g key={i} className="spg-note" style={{ animationDelay: `${n.d}s`, ['--dx' as string]: `${n.dx}px` } as React.CSSProperties}>
            <ellipse cx={n.x} cy="34" rx="1.7" ry="1.2" fill={n.c} transform={`rotate(-20 ${n.x} 34)`} />
            <path d={`M${n.x + 1.5} 33.8 V27.6 q2 .6 2.2 3`} fill="none" stroke={n.c} strokeWidth="0.6" strokeLinecap="round" />
          </g>
        ))}
      </svg>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  Animation — full-screen canvas
// ═══════════════════════════════════════════════════════════════════════
interface Star { x: number; y: number; r: number; spr: number; ph: number; sp: number; delay: number; big: boolean }
interface Fx { x: number; y: number; vx: number; vy: number; size: number; life: number; age: number; spr: number; grav: number; drag: number; star: boolean; ph: number }
interface Note { x: number; y: number; vx: number; vy: number; rot: number; vr: number; size: number; life: number; age: number; col: number; heart: boolean; ph: number }
interface Shot { x: number; y: number; vx: number; vy: number; age: number; life: number }
interface Ring { x: number; y: number; born: number; dur: number; r0: number; r1: number; w: number; col: number }
interface Hot { el: Element; x: number; y: number; w: number; h: number; rad: number }
interface Crystal { f: number; off: number; hgt: number; wid: number; pal: number; delay: number; tilt: number }
interface Lift { sx: number; sy: number; sr: number; ex: number; ey: number; R: number; img: HTMLImageElement | null; letter: string; name: string; restore: () => void; done?: boolean }
interface LiftInfo { userId: string; name?: string; avatarUrl?: string | null }
interface Host { x: number; y: number; w: number; h: number; top: number; lift?: Lift }

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

// Gift to a speaker (not the host): LiveCoinsDock stores the receiver in window.__stooornaGiftLift
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
    const ey = H * 0.4;
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

// piano geometry (local units; origin = floor, x grows right, y grows up as negative)
const KX0 = 30;
const KX1 = 84;
const NK = 14;
const KW = (KX1 - KX0) / NK;
const KY = -52;
const WHITE_OF_PC = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
const BLACK_AFTER = [0, 1, 3, 4, 5, 7, 8, 10, 11, 12];
const keyIndexOf = (midi: number) => {
  let m = midi;
  while (m < 60) m += 12;
  while (m > 83) m -= 12;
  return Math.floor((m - 60) / 12) * 7 + WHITE_OF_PC[(m - 60) % 12];
};
const keyXOf = (midi: number) => KX0 + clamp01((midi - 40) / 48) * (KX1 - KX0 - 6) + 3;

function StarryPianoAnimation({ onDone }: { onDone: () => void }) {
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

    // preload the receiver's picture (gift to a speaker)
    let liftPre: HTMLImageElement | null = null;
    const liftInfo0 = getLiftInfo();
    if (liftInfo0 && liftInfo0.avatarUrl) {
      try { liftPre = new Image(); liftPre.src = String(liftInfo0.avatarUrl); } catch { liftPre = null; }
    }

    const SP = SPR_LIST.map(rgb => makeSprite(rgb, 0.3));
    const blob = (sp: HTMLCanvasElement, x: number, y: number, r: number, a: number) => {
      if (a <= 0.003 || r <= 0.2) return;
      c.globalAlpha = Math.min(1, a);
      c.drawImage(sp, x - r, y - r, r * 2, r * 2);
    };

    // ── sky ──
    const nStars = Math.round(Math.min(340, Math.max(140, (W * H) / 1500)));
    const stars: Star[] = [];
    const SPR_PICK = [0, 0, 0, 1, 1, 2, 3, 5];
    for (let i = 0; i < nStars; i++) {
      let x: number, y: number;
      if (i % 3 === 0) {
        const u = Math.random();
        const off = (Math.random() + Math.random() + Math.random() - 1.5) * H * 0.09;
        x = lerp(-0.05 * W, 1.05 * W, u);
        y = lerp(0.58 * H, 0.06 * H, u) + off;
      } else {
        x = Math.random() * W;
        y = Math.pow(Math.random(), 1.25) * H * 0.9;
      }
      const big = Math.random() < 0.09;
      stars.push({ x, y, r: (big ? rnd(1.6, 2.4) : rnd(0.5, 1.5)) * k, spr: SPR_PICK[Math.floor(Math.random() * SPR_PICK.length)], ph: rnd(0, 6.28), sp: rnd(1.2, 4), delay: rnd(0.1, 2.6), big });
    }
    const AURORA = [
      { y: 0.16, amp: 0.05, f: 0.012, sp: 0.5, ph: 0, rgb: '90,255,190' },
      { y: 0.24, amp: 0.06, f: 0.009, sp: 0.38, ph: 2, rgb: '150,110,255' },
      { y: 0.31, amp: 0.05, f: 0.011, sp: 0.6, ph: 4, rgb: '255,120,210' },
    ];

    // ── scene placement ──
    const ps = Math.min(2.4, (W * 0.97) / 244);
    const gx = W * 0.5 - 94 * ps;
    const gy = H * 0.8;
    let riseNow = 0;

    // ── state ──
    const score: ScoreEvent[] = [...STARRY_SCORE].sort((a, b) => a.t - b.t);
    let si = 0;
    const NB = 28;
    const bands = new Float32Array(NB);
    const keyGlow = new Float32Array(NK);
    let lvl = 0;
    let pulse = 0;
    let hRx = 64, hLx = 44, tRx = 64, tLx = 44, dipR = 0, dipL = 0;

    const fx: Fx[] = [];
    const notes: Note[] = [];
    const shots: Shot[] = [];
    const rings: Ring[] = [];
    const tips: [number, number][] = [];
    let shootT = 2.2;
    let hot: Hot[] = [];
    let hotAt = -9;
    const cMap = new WeakMap<Element, Crystal[]>();
    const floorCr: Crystal[] = [];
    {
      const n = Math.round(W / 20);
      for (let i = 0; i < n; i++) {
        const hgt = rnd(16, 46) * k;
        floorCr.push({ f: (i + rnd(0.1, 0.9)) / n, off: 0, hgt, wid: hgt * rnd(0.3, 0.42), pal: Math.floor(Math.random() * 4), delay: CRYSTAL_AT + rnd(0, 2.8), tilt: rnd(-0.35, 0.35) });
      }
    }
    let arrived = false;
    let host: Host | null = null;
    let emaDt = 0.016;
    let q = 1;
    let focus: { x: number; y: number; r: number } | null = null;

    const spawnFx = (x: number, y: number, vx: number, vy: number, size: number, life: number, spr: number, o: Partial<Fx> = {}) => {
      if (fx.length >= MAX_FX) return;
      fx.push({ x, y, vx, vy, size, life, age: 0, spr, grav: 0, drag: 0.6, star: Math.random() < 0.4, ph: rnd(0, 6.28), ...o });
    };
    const sparkBurst = (x: number, y: number, n: number, spd: number) => {
      for (let i = 0; i < n; i++) {
        const a = rnd(0, Math.PI * 2);
        const sp = rnd(0.3, 1) * spd * k;
        spawnFx(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 20 * k, rnd(2.2, 4.6) * k, rnd(0.7, 1.4), [0, 2, 3, 5][i % 4], { grav: 40 * k });
      }
    };
    const bandHit = (midi: number, v: number) => {
      const b = Math.round(clamp01((midi - 34) / 62) * (NB - 1));
      bands[b] = Math.min(1, bands[b] + v);
      if (b > 0) bands[b - 1] = Math.min(1, bands[b - 1] + v * 0.55);
      if (b < NB - 1) bands[b + 1] = Math.min(1, bands[b + 1] + v * 0.55);
    };
    const spawnNote = (x: number, y: number, vel: number) => {
      if (notes.length > 60) return;
      notes.push({
        x, y, vx: rnd(-14, 26) * k, vy: -rnd(46, 92) * k, rot: rnd(-0.4, 0.4), vr: rnd(-0.6, 0.6),
        size: rnd(10, 17) * k * (0.8 + vel * 0.5), life: rnd(2.6, 3.8), age: 0, col: Math.floor(Math.random() * 4), heart: Math.random() < 0.22, ph: rnd(0, 6.28),
      });
    };
    const keyWorld = (ki: number) => ({ x: gx + (KX0 + (ki + 0.5) * KW) * ps, y: gy + riseNow + (KY - 4) * ps });

    const onEvent = (ev: ScoreEvent, t: number) => {
      if (ev.kind === 'chime') {
        pulse = Math.min(1.2, pulse + 0.9);
        lvl = Math.min(1, lvl + 0.18);
        bandHit(ev.midi, ev.vel * 0.8);
        const pick = Math.min(7, tips.length);
        for (let i = 0; i < pick; i++) {
          const tp = tips[Math.floor(Math.random() * tips.length)];
          if (tp) sparkBurst(tp[0], tp[1], 7, 120);
        }
        return;
      }
      const ki = keyIndexOf(ev.midi);
      keyGlow[ki] = Math.min(1.2, keyGlow[ki] + 0.5 + ev.vel);
      if (ev.midi >= 58) { tRx = keyXOf(ev.midi); dipR = 1; } else { tLx = keyXOf(ev.midi); dipL = 1; }
      lvl = Math.min(1, lvl + ev.vel * 0.5);
      pulse = Math.min(1.2, pulse + 0.35 * ev.vel);
      bandHit(ev.midi, ev.vel * 1.1);
      const kp = keyWorld(ki);
      if (ev.kind === 'piano' || Math.random() < 0.5) spawnNote(kp.x, kp.y, ev.vel);
      if (ev.vel > 0.45 && focus) rings.push({ x: focus.x, y: focus.y, born: t, dur: 1.1, r0: focus.r, r1: focus.r * 2.3, w: 2.4 * k, col: ev.midi > 70 ? 5 : 3 });
    };

    // ── drawing helpers ──
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
    const collectHot = (): Hot[] => {
      const out: Hot[] = [];
      try {
        document.querySelectorAll<HTMLElement>(HOT_SEL).forEach(el => {
          if (out.length >= 60 || el.closest('[data-gift-overlay]')) return;
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return;
          const r = el.getBoundingClientRect();
          if (r.width < 14 || r.height < 14 || r.bottom < 0 || r.top > H - 4 || r.right < 0 || r.left > W) return;
          if (r.width > W * 0.92 && r.height > H * 0.3) return;
          let rad = parseFloat(cs.borderTopLeftRadius) || 0;
          if (cs.borderTopLeftRadius.endsWith('%')) rad = (rad / 100) * Math.min(r.width, r.height);
          rad = Math.min(rad, r.width / 2, r.height / 2);
          out.push({ el, x: r.left, y: r.top, w: r.width, h: r.height, rad });
        });
      } catch { /* ignore */ }
      return out;
    };
    const crystalsFor = (h: Hot): Crystal[] => {
      let arr = cMap.get(h.el);
      if (arr) return arr;
      arr = [];
      const n = Math.max(2, Math.min(5, Math.round(h.w / 20)));
      const sizeK = Math.min(1.25, 0.6 + h.w / 160);
      for (let i = 0; i < n; i++) {
        const f = (i + rnd(0.2, 0.8)) / n;
        const hgt = rnd(9, 22) * k * sizeK;
        const pal = Math.floor(Math.random() * 4);
        const delay = CRYSTAL_AT + (1 - h.y / H) * 3.0 + rnd(0, 1.4);
        const wid = hgt * rnd(0.3, 0.42);
        arr.push({ f, off: 0, hgt, wid, pal, delay, tilt: rnd(-0.35, 0.35) });
        if (Math.random() < 0.7) arr.push({ f, off: (Math.random() < 0.5 ? -1 : 1) * wid * 0.95, hgt: hgt * rnd(0.4, 0.6), wid: wid * 0.7, pal: (pal + 1) % 4, delay: delay + 0.25, tilt: rnd(-0.6, 0.6) });
      }
      cMap.set(h.el, arr);
      return arr;
    };

    // one faceted crystal (bx,by = base center)
    const drawCrystal = (bx: number, by: number, w: number, h: number, pal: number, tilt: number, a: number) => {
      const P = PALS[pal];
      const tipX = bx + tilt * w;
      const shY = by - h * 0.62;
      c.globalAlpha = a;
      c.fillStyle = P.l;
      c.beginPath(); c.moveTo(bx - w / 2, by); c.lineTo(bx - w * 0.5, shY); c.lineTo(tipX, by - h); c.lineTo(bx, by); c.closePath(); c.fill();
      c.fillStyle = P.d;
      c.beginPath(); c.moveTo(bx + w / 2, by); c.lineTo(bx + w * 0.5, shY); c.lineTo(tipX, by - h); c.lineTo(bx, by); c.closePath(); c.fill();
      c.fillStyle = P.m;
      c.beginPath(); c.moveTo(bx, by); c.lineTo(bx - w * 0.5, shY); c.lineTo(tipX, by - h); c.lineTo(bx + w * 0.5, shY); c.closePath(); c.globalAlpha = a * 0.55; c.fill();
      c.globalAlpha = a * 0.7;
      c.strokeStyle = 'rgba(255,255,255,0.75)';
      c.lineWidth = Math.max(0.6, w * 0.06);
      c.beginPath(); c.moveTo(bx - w / 2, by); c.lineTo(bx - w * 0.5, shY); c.lineTo(tipX, by - h); c.lineTo(bx + w * 0.5, shY); c.lineTo(bx + w / 2, by); c.stroke();
      c.beginPath(); c.moveTo(bx, by); c.lineTo(tipX, by - h); c.stroke();
    };

    const drawNote = (n: Note, a: number) => {
      c.save();
      c.translate(n.x, n.y);
      c.rotate(n.rot);
      c.globalAlpha = a;
      c.fillStyle = NOTE_COL[n.col];
      c.strokeStyle = NOTE_COL[n.col];
      const sz = n.size;
      if (n.heart) {
        const h = sz * 0.7;
        c.beginPath();
        c.moveTo(0, h * 0.35);
        c.bezierCurveTo(-h, -h * 0.4, -h * 0.4, -h * 1.1, 0, -h * 0.45);
        c.bezierCurveTo(h * 0.4, -h * 1.1, h, -h * 0.4, 0, h * 0.35);
        c.fill();
      } else {
        c.beginPath(); c.ellipse(0, 0, sz * 0.5, sz * 0.36, -0.45, 0, Math.PI * 2); c.fill();
        c.lineWidth = Math.max(1, sz * 0.12);
        c.lineCap = 'round';
        c.beginPath(); c.moveTo(sz * 0.42, -sz * 0.1); c.lineTo(sz * 0.42, -sz * 1.5); c.stroke();
        c.beginPath(); c.moveTo(sz * 0.42, -sz * 1.5); c.quadraticCurveTo(sz * 1.0, -sz * 1.2, sz * 0.85, -sz * 0.65); c.stroke();
      }
      c.restore();
    };

    // vibrating spectrum ring around a profile picture (radial equalizer driven by the real notes)
    const drawVibe = (cx0: number, cy0: number, r: number, a: number, t: number) => {
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.lineCap = 'round';
      const NBR = 56;
      for (let i = 0; i < NBR; i++) {
        const ang = (i / NBR) * Math.PI * 2 - Math.PI / 2;
        const m = Math.min(i, NBR - i);
        const bi = Math.min(NB - 1, Math.round((m / (NBR / 2)) * (NB - 1)));
        const e = Math.min(1, bands[bi] * 1.1 + lvl * 0.25);
        const len = r * (0.05 + 0.5 * e) + 1.5 * k;
        const r0 = r * 1.1;
        const hue = 320 - (bi / (NB - 1)) * 130;
        c.strokeStyle = `hsla(${hue},100%,74%,${(0.35 + 0.6 * e) * a})`;
        c.lineWidth = Math.max(2, r * 0.05);
        c.beginPath();
        c.moveTo(cx0 + Math.cos(ang) * r0, cy0 + Math.sin(ang) * r0);
        c.lineTo(cx0 + Math.cos(ang) * (r0 + len), cy0 + Math.sin(ang) * (r0 + len));
        c.stroke();
      }
      blob(SP[4], cx0, cy0, r * (2.2 + lvl * 0.6), 0.28 * a * (0.6 + 0.4 * lvl));
      blob(SP[5], cx0, cy0, r * (1.5 + lvl * 0.4), 0.18 * a);
      c.restore();
      c.globalAlpha = 1;
    };

    const stopSound = playStarryPianoSound();

    // ── pianist + grand piano (drawn in local units, scaled by ps) ──
    const arm = (P: { x: number; y: number }, T: { x: number; y: number }) => {
      const L1 = 30, L2 = 30;
      const dx = T.x - P.x, dy = T.y - P.y;
      const dd = Math.min(Math.max(Math.hypot(dx, dy), 10), L1 + L2 - 0.6);
      const base = Math.atan2(dy, dx);
      const a = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + dd * dd - L2 * L2) / (2 * L1 * dd))));
      const ang = base + a;
      return { E: { x: P.x + Math.cos(ang) * L1, y: P.y + Math.sin(ang) * L1 }, Hd: { x: P.x + Math.cos(base) * dd, y: P.y + Math.sin(base) * dd } };
    };

    const drawScene = (A: number, t: number) => {
      if (A <= 0.003) return;
      c.save();
      c.translate(gx, gy + riseNow);
      c.scale(ps, ps);
      c.globalCompositeOperation = 'lighter';
      blob(SP[4], 94, 0, 125, 0.34 * A);
      blob(SP[3], 94, -2, 80, 0.16 * A);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = A;

      // legs
      for (const lx of [96, 158, 204]) {
        c.fillStyle = '#0a0818';
        c.beginPath(); c.moveTo(lx - 2.2, -44); c.lineTo(lx + 2.2, -44); c.lineTo(lx + 1.3, -1); c.lineTo(lx - 1.3, -1); c.closePath(); c.fill();
        c.fillStyle = '#c9a85a';
        c.beginPath(); c.arc(lx, -1, 1.6, 0, Math.PI * 2); c.fill();
      }
      // body
      const bg = c.createLinearGradient(0, -64, 0, -42);
      bg.addColorStop(0, '#2b2358'); bg.addColorStop(0.5, '#120d2e'); bg.addColorStop(1, '#07051a');
      c.fillStyle = bg;
      c.beginPath(); c.moveTo(78, -62); c.lineTo(206, -63); c.quadraticCurveTo(220, -62, 214, -52); c.quadraticCurveTo(206, -43, 190, -43); c.lineTo(80, -43); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(170,150,255,0.55)'; c.lineWidth = 0.9;
      c.beginPath(); c.moveTo(78, -62); c.lineTo(206, -63); c.quadraticCurveTo(220, -62, 214, -52); c.stroke();
      // open lid
      const lg = c.createLinearGradient(90, -62, 200, -118);
      lg.addColorStop(0, '#241c52'); lg.addColorStop(0.55, '#0f0a2a'); lg.addColorStop(1, '#32277a');
      c.fillStyle = lg;
      c.beginPath(); c.moveTo(86, -63); c.lineTo(208, -64); c.lineTo(196, -120); c.lineTo(98, -104); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(190,170,255,0.6)'; c.stroke();
      c.fillStyle = 'rgba(200,190,255,0.14)';
      c.beginPath(); c.moveTo(112, -67); c.lineTo(124, -67); c.lineTo(146, -110); c.lineTo(136, -109); c.closePath(); c.fill();
      // stars reflected on the lid
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * (1.3 + i * 0.37) + i * 2));
        blob(SP[i % 2 ? 1 : 0], 110 + i * 15 + (i % 2) * 5, -72 - i * 7 - (i % 3) * 4, 3.6, 0.7 * tw * A);
      }
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = A;

      // keyboard
      c.fillStyle = '#0b0820';
      c.fillRect(KX0 - 3, KY - 1.5, KX1 - KX0 + 6, 9);
      for (let i = 0; i < NK; i++) {
        c.fillStyle = '#f6f3ff';
        c.fillRect(KX0 + i * KW + 0.25, KY, KW - 0.5, 5.2);
        const g = Math.min(1, keyGlow[i]);
        if (g > 0.03) { c.fillStyle = `rgba(255,140,215,${0.85 * g})`; c.fillRect(KX0 + i * KW + 0.25, KY, KW - 0.5, 5.2); }
      }
      for (const bi of BLACK_AFTER) {
        c.fillStyle = '#120d28';
        c.fillRect(KX0 + (bi + 1) * KW - KW * 0.3, KY, KW * 0.6, 3.2);
      }
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < NK; i++) {
        const g = Math.min(1, keyGlow[i]);
        if (g > 0.04) blob(SP[i % 2 ? 3 : 5], KX0 + (i + 0.5) * KW, KY - 3, 7 + 6 * g, 0.6 * g * A);
      }
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = A;

      // ── pianist ──
      const sway = Math.sin(t * 1.9);
      const avgX = (hRx + hLx) / 2;
      const lean = 0.05 + clamp01((avgX - 38) / 40) * 0.27 + 0.015 * sway + 0.02 * lvl * Math.sin(t * 6);
      const sl = Math.sin(lean), cl = Math.cos(lean);
      const S = { x: 14 + 50 * sl, y: -36 - 50 * cl };
      const Wp = { x: 14 + 22 * sl, y: -36 - 22 * cl };
      const nod = Math.sin(t * 2.2) * 0.8 + lvl * Math.sin(t * 7) * 0.7;
      const hd = { x: S.x + 6 + nod * 0.5, y: S.y - 15 + nod * 0.3 };
      const hsw = Math.sin(t * 2.1) * 3 + lvl * Math.sin(t * 9) * 1.2;
      const wv = Math.sin(t * 2.6) * 1.6 + lvl * Math.sin(t * 8) * 0.8;

      // hair (behind)
      c.fillStyle = '#241426';
      c.beginPath();
      c.moveTo(hd.x + 2, hd.y - 9);
      c.bezierCurveTo(hd.x - 14, hd.y - 12, hd.x - 18, hd.y + 10, hd.x - 14 + hsw, hd.y + 52);
      c.bezierCurveTo(hd.x - 6, hd.y + 30, hd.x - 4, hd.y + 12, hd.x + 2, hd.y + 8);
      c.closePath(); c.fill();
      c.strokeStyle = 'rgba(160,140,255,0.45)'; c.lineWidth = 0.7;
      c.beginPath(); c.moveTo(hd.x - 6, hd.y - 8); c.bezierCurveTo(hd.x - 15, hd.y - 2, hd.x - 16, hd.y + 20, hd.x - 12 + hsw, hd.y + 40); c.stroke();

      const drawArm = (sh: { x: number; y: number }, tg: { x: number; y: number }, col: string) => {
        const r = arm(sh, tg);
        c.strokeStyle = col; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = 5.2;
        c.beginPath(); c.moveTo(sh.x, sh.y); c.lineTo(r.E.x, r.E.y); c.lineTo(r.Hd.x, r.Hd.y); c.stroke();
        c.fillStyle = col;
        c.beginPath(); c.ellipse(r.Hd.x + 0.8, r.Hd.y, 3.2, 2.0, 0.1, 0, Math.PI * 2); c.fill();
      };
      // back (left) arm
      drawArm({ x: S.x - 2, y: S.y + 2 }, { x: hLx, y: KY - 2.4 + dipL * 2.6 }, '#c9a7a0');

      // skirt
      const sg = c.createLinearGradient(0, -60, 0, 0);
      sg.addColorStop(0, '#7b5cff'); sg.addColorStop(0.5, '#3b2290'); sg.addColorStop(1, '#1d0f55');
      c.fillStyle = sg;
      c.beginPath();
      c.moveTo(Wp.x - 6, Wp.y);
      c.bezierCurveTo(Wp.x - 16, -30, -14, -12, -26, 0);
      c.quadraticCurveTo(-10, 4 + wv, 10, 0);
      c.quadraticCurveTo(30, -3 - wv, 46, 2);
      c.quadraticCurveTo(56, 0, 60, -4);
      c.bezierCurveTo(58, -20, 56, -36, 48, -42);
      c.bezierCurveTo(36, -46, 26, -50, Wp.x + 6, Wp.y + 2);
      c.closePath(); c.fill();
      c.strokeStyle = 'rgba(200,180,255,0.4)'; c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(Wp.x + 6, Wp.y + 2); c.bezierCurveTo(26, -50, 36, -46, 48, -42); c.stroke();
      // bodice
      const bgd = c.createLinearGradient(S.x, S.y, Wp.x, Wp.y);
      bgd.addColorStop(0, '#b08cff'); bgd.addColorStop(1, '#6a46d8');
      c.fillStyle = bgd;
      c.beginPath(); c.moveTo(S.x - 6, S.y + 1); c.lineTo(S.x + 6, S.y + 2); c.lineTo(Wp.x + 6, Wp.y); c.lineTo(Wp.x - 6, Wp.y); c.closePath(); c.fill();
      // front arm
      drawArm({ x: S.x + 1, y: S.y + 3 }, { x: hRx, y: KY - 2.4 + dipR * 2.6 }, '#f2d3c6');

      // neck + head
      c.fillStyle = '#f2d3c6';
      c.fillRect(S.x + 0.5, S.y - 9, 4.2, 9);
      c.beginPath(); c.ellipse(hd.x, hd.y, 9.2, 9.6, 0.1, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(hd.x + 8.6, hd.y - 0.5); c.lineTo(hd.x + 11, hd.y + 2); c.lineTo(hd.x + 8.6, hd.y + 3); c.closePath(); c.fill();
      c.strokeStyle = '#3a2433'; c.lineWidth = 0.9; c.lineCap = 'round';
      c.beginPath(); c.arc(hd.x + 4.5, hd.y - 0.6, 1.9, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
      c.strokeStyle = '#d9728f'; c.lineWidth = 1;
      c.beginPath(); c.arc(hd.x + 6.4, hd.y + 4.6, 1.8, 0.1 * Math.PI, 0.8 * Math.PI); c.stroke();
      // hair top / fringe
      c.fillStyle = '#241426';
      c.beginPath(); c.arc(hd.x, hd.y, 9.8, Math.PI * 0.75, Math.PI * 1.95); c.lineTo(hd.x + 3, hd.y - 2); c.closePath(); c.fill();
      // glow: blush, earring and a tiny star in her hair
      c.globalCompositeOperation = 'lighter';
      blob(SP[3], hd.x + 3.6, hd.y + 3, 4, 0.35 * A);
      blob(SP[2], hd.x + 0.5, hd.y + 4.2, 2.6, 0.8 * A);
      blob(SP[2], hd.x + 1, hd.y - 8.5, 6, (0.4 + 0.3 * Math.sin(t * 5)) * A);
      // soft glow on her hands when notes hit
      blob(SP[5], hRx + 1, KY - 3, 7, 0.4 * Math.min(1, dipR) * A);
      blob(SP[3], hLx + 1, KY - 3, 7, 0.4 * Math.min(1, dipL) * A);
      c.restore();
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
    };

    // ── main loop ──
    let raf = 0;
    const start = performance.now();
    let last = start;

    const frame = (now: number) => {
      const t = ((now - start) / 1000) * TIME_K;
      const raw = (now - last) / 1000;
      const dt = Math.min(0.033, raw) * TIME_K;
      last = now;
      emaDt += (raw - emaDt) * 0.05;
      if (emaDt > 0.036) q = Math.max(0.45, q - 0.015);
      else if (emaDt < 0.024) q = Math.min(1, q + 0.008);
      const endFade = t > TOTAL_S - 0.5 ? clamp01((TOTAL_S - t) / 0.5) : 1;
      cv.style.opacity = String(endFade);

      if (!host) host = findLift(W, H, liftPre) || findHost(W);

      const night = smooth(t / NIGHT_IN) * (1 - smooth((t - NIGHT_OUT_AT) / (NIGHT_OUT_END - NIGHT_OUT_AT)));
      const pA = smooth((t - PIANO_IN_AT) / PIANO_IN_S) * (1 - smooth((t - PIANO_OUT_AT) / PIANO_OUT_S));
      riseNow = (1 - easeOut((t - PIANO_IN_AT) / PIANO_IN_S)) * 34 * k;

      // focus circle (host or lifted user) — used by ripples and the vibration ring
      {
        const L0 = host.lift;
        if (L0) {
          const upq = easeOut((t - LIFT_AT) / LIFT_S);
          const dnq = smooth((t - LIFT_BACK_AT) / LIFT_BACK_S);
          const e0 = upq * (1 - dnq);
          focus = { x: lerp(L0.sx, L0.ex, e0), y: lerp(L0.sy, L0.ey, e0), r: lerp(L0.sr, L0.R, e0) };
        } else {
          focus = { x: host.x, y: host.y, r: Math.max(host.w, host.h) / 2 };
        }
      }

      // music events (same score the sound engine plays)
      while (si < score.length && t >= score[si].t + STARRY_LEAD_S) { onEvent(score[si], t); si++; }
      lvl *= Math.exp(-dt * 2.4);
      pulse *= Math.exp(-dt * 3.2);
      for (let b = 0; b < NB; b++) bands[b] *= Math.exp(-dt * 3.6);
      for (let i = 0; i < NK; i++) keyGlow[i] *= Math.exp(-dt * 3.0);
      hRx += (tRx - hRx) * (1 - Math.exp(-dt * 16));
      hLx += (tLx - hLx) * (1 - Math.exp(-dt * 16));
      dipR *= Math.exp(-dt * 9);
      dipL *= Math.exp(-dt * 9);

      if (!arrived && t >= PIANO_IN_AT + 0.6) {
        arrived = true;
        for (let i = 0; i < 44; i++) spawnFx(gx + rnd(-20, 240) * ps, gy - rnd(0, 60) * ps, rnd(-40, 40) * k, -rnd(20, 120) * k, rnd(2, 4.5) * k, rnd(0.9, 1.6), [0, 2, 3, 4, 5][i % 5], { grav: -10 * k });
      }
      if (t >= CRYSTAL_AT - 0.3 && t - hotAt > 0.5) { hot = collectHot(); hotAt = t; }

      // shooting stars
      shootT -= dt;
      if (night > 0.6 && shootT <= 0 && t < 13) {
        shootT = rnd(1.1, 2.4);
        const sp = rnd(700, 1000) * k;
        const ang = rnd(0.45, 0.8);
        shots.push({ x: rnd(0.35, 1.05) * W, y: rnd(0, 0.35) * H, vx: -Math.cos(ang) * sp, vy: Math.sin(ang) * sp, age: 0, life: rnd(0.7, 1.1) });
      }

      // ═══ draw ═══
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';

      // night sky
      if (night > 0.003) {
        const ng = c.createLinearGradient(0, 0, 0, H);
        ng.addColorStop(0, `rgba(3,5,24,${NIGHT_MAX * night})`);
        ng.addColorStop(0.55, `rgba(10,8,40,${NIGHT_MAX * 0.82 * night})`);
        ng.addColorStop(1, `rgba(24,10,52,${NIGHT_MAX * 0.6 * night})`);
        c.fillStyle = ng;
        c.fillRect(0, 0, W, H);
      }

      if (night > 0.05) {
        // nebula clouds + aurora
        c.globalCompositeOperation = 'lighter';
        blob(SP[4], W * (0.25 + 0.05 * Math.sin(t * 0.3)), H * 0.22, W * 0.7, 0.16 * night);
        blob(SP[3], W * (0.78 + 0.05 * Math.cos(t * 0.25)), H * 0.38, W * 0.6, 0.1 * night);
        blob(SP[5], W * 0.5, H * 0.1, W * 0.7, 0.09 * night);
        c.globalAlpha = 1;
        c.lineCap = 'round';
        c.lineJoin = 'round';
        for (const a of AURORA) {
          for (const pass of [[60, 0.035], [34, 0.05], [14, 0.07]]) {
            c.lineWidth = pass[0] * k;
            c.strokeStyle = `rgba(${a.rgb},${pass[1] * night * (0.75 + 0.5 * lvl)})`;
            c.beginPath();
            for (let x = -10; x <= W + 24; x += 24) {
              const y = H * a.y + Math.sin(x * a.f + t * a.sp + a.ph) * H * a.amp + Math.sin(x * a.f * 2.3 - t * a.sp * 1.4) * H * a.amp * 0.4;
              if (x === -10) c.moveTo(x, y); else c.lineTo(x, y);
            }
            c.stroke();
          }
        }
        // stars
        for (const s of stars) {
          const ap = smooth((t - 0.2 - s.delay) / 0.8);
          if (ap <= 0.01) continue;
          const tw = 0.55 + 0.45 * Math.sin(t * s.sp + s.ph);
          const a = ap * tw * night;
          blob(SP[s.spr], s.x, s.y, s.r * (s.big ? 7 : 3.4), a * 0.85);
          blob(SP[0], s.x, s.y, s.r * 1.1, a);
          if (s.big) {
            c.globalAlpha = a * 0.8;
            c.strokeStyle = 'rgba(255,255,255,0.9)';
            c.lineWidth = Math.max(0.6, s.r * 0.3);
            const L = s.r * 5.5 * (0.7 + 0.5 * tw);
            c.beginPath(); c.moveTo(s.x - L, s.y); c.lineTo(s.x + L, s.y); c.moveTo(s.x, s.y - L); c.lineTo(s.x, s.y + L); c.stroke();
          }
        }
        c.globalAlpha = 1;
        // moon
        const mx = W * 0.84, my = H * 0.115, mr = 20 * k;
        blob(SP[2], mx, my, mr * 4.2, 0.35 * night);
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = night;
        const mgd = c.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
        mgd.addColorStop(0, '#fffdf0'); mgd.addColorStop(0.7, '#efe7c9'); mgd.addColorStop(1, '#cfc6a4');
        c.fillStyle = mgd;
        c.beginPath(); c.arc(mx, my, mr, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(150,140,110,0.22)';
        c.beginPath(); c.arc(mx - mr * 0.35, my - mr * 0.1, mr * 0.22, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(mx + mr * 0.3, my + mr * 0.3, mr * 0.16, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 1;
        // shooting stars
        c.globalCompositeOperation = 'lighter';
        for (let i = shots.length - 1; i >= 0; i--) {
          const s = shots[i];
          s.age += dt;
          if (s.age >= s.life) { shots.splice(i, 1); continue; }
          s.x += s.vx * dt; s.y += s.vy * dt;
          const u = s.age / s.life;
          const a = Math.sin(Math.PI * u) * night * endFade;
          const tx = s.x - s.vx * 0.14, ty = s.y - s.vy * 0.14;
          const lg2 = c.createLinearGradient(tx, ty, s.x, s.y);
          lg2.addColorStop(0, 'rgba(255,255,255,0)');
          lg2.addColorStop(1, `rgba(255,255,255,${a})`);
          c.strokeStyle = lg2; c.lineWidth = 2 * k; c.lineCap = 'round';
          c.beginPath(); c.moveTo(tx, ty); c.lineTo(s.x, s.y); c.stroke();
          blob(SP[0], s.x, s.y, 7 * k, a);
        }
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = 1;
      }

      // ── crystals on buttons + glowing button outlines ──
      tips.length = 0;
      if (t >= CRYSTAL_AT) {
        const outK = 1 - smooth((t - CRYSTAL_OUT_AT) / CRYSTAL_OUT_S);
        let drawn = 0;
        const cap = Math.round(MAX_CRYSTALS * q);
        const pul = 0.6 + 0.4 * Math.min(1, pulse + lvl * 0.5);
        const showCr = (bx: number, by: number, cr: Crystal, tt: number) => {
          const g = easeOut((tt - cr.delay) / 0.9);
          if (g <= 0.01 || drawn >= cap) return 0;
          drawn++;
          const grow = g * (1 + 0.08 * Math.sin(Math.PI * clamp01((tt - cr.delay) / 0.9))) * (0.35 + 0.65 * outK);
          const h = cr.hgt * grow, w = cr.wid * grow;
          c.globalCompositeOperation = 'lighter';
          blob(SP[PALS[cr.pal].spr], bx, by - h * 0.45, h * 1.1 + w * 2, 0.4 * g * pul * outK * endFade);
          c.globalCompositeOperation = 'source-over';
          drawCrystal(bx, by, w, h, cr.pal, cr.tilt, outK * endFade * Math.min(1, g * 1.4));
          if (outK > 0.6 && g > 0.9) tips.push([bx + cr.tilt * w, by - h]);
          return g;
        };
        // floor row
        for (const cr of floorCr) showCr(cr.f * W, H + 2, cr, t);
        // buttons
        hot.forEach((h, hi) => {
          const arr = crystalsFor(h);
          let gsum = 0;
          for (const cr of arr) {
            const bx = h.x + cr.f * h.w + cr.off;
            const top = topAt(h, Math.min(h.x + h.w, Math.max(h.x, bx)));
            gsum += showCr(bx, (top === null ? h.y : top) + 1, cr, t);
          }
          const gAvg = arr.length ? gsum / arr.length : 0;
          if (gAvg > 0.03) {
            const a = Math.min(1, gAvg) * pul * outK * endFade;
            const hue = 200 + 90 * Math.sin(t * 0.8 + hi);
            rrPath(h.x, h.y, h.w, h.h, h.rad);
            c.fillStyle = `hsla(${hue},100%,75%,${0.07 * a})`;
            c.fill();
            c.lineWidth = 1.6;
            c.strokeStyle = `hsla(${hue},100%,78%,${0.75 * a})`;
            c.shadowColor = `hsla(${hue},100%,70%,0.9)`;
            c.shadowBlur = 10 * a;
            c.stroke();
            c.shadowBlur = 0;
          }
        });
        c.globalAlpha = 1;
      }

      // ── pianist + piano ──
      drawScene(pA * endFade, t);
      c.globalAlpha = 1;

      // ── floating notes ──
      for (let i = notes.length - 1; i >= 0; i--) {
        const n = notes[i];
        n.age += dt;
        if (n.age >= n.life) { notes.splice(i, 1); continue; }
        n.x += (n.vx + Math.sin(n.age * 2.2 + n.ph) * 26 * k) * dt;
        n.y += n.vy * dt;
        n.rot += n.vr * dt;
        const u = n.age / n.life;
        const a = Math.min(n.age / 0.25, 1) * (1 - u) * endFade;
        c.globalCompositeOperation = 'lighter';
        blob(SP[NOTE_SPR[n.col]], n.x, n.y - n.size * 0.6, n.size * 2.4, a * 0.5);
        c.globalCompositeOperation = 'source-over';
        drawNote(n, a);
      }
      c.globalAlpha = 1;

      // ── sparkles ──
      c.globalCompositeOperation = 'lighter';
      for (let i = fx.length - 1; i >= 0; i--) {
        const p = fx[i];
        p.age += dt;
        if (p.age >= p.life) { fx[i] = fx[fx.length - 1]; fx.pop(); continue; }
        p.vy += p.grav * dt;
        const dm = Math.exp(-p.drag * dt);
        p.vx *= dm; p.vy *= dm;
        p.x += p.vx * dt; p.y += p.vy * dt;
        const u = p.age / p.life;
        const a = (1 - u) * (0.6 + 0.4 * Math.sin(p.age * 20 + p.ph)) * endFade;
        blob(SP[p.spr], p.x, p.y, p.size * 2.6, a * 0.8);
        blob(SP[0], p.x, p.y, p.size * 0.9, a);
        if (p.star) {
          c.globalAlpha = a * 0.8;
          c.strokeStyle = 'rgba(255,255,255,0.9)';
          c.lineWidth = Math.max(0.6, p.size * 0.18);
          const L = p.size * 3;
          c.beginPath(); c.moveTo(p.x - L, p.y); c.lineTo(p.x + L, p.y); c.moveTo(p.x, p.y - L); c.lineTo(p.x, p.y + L); c.stroke();
        }
      }
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';

      // ── ripples (sound waves) ──
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        const u = (t - r.born) / r.dur;
        if (u >= 1) { rings.splice(i, 1); continue; }
        if (u < 0) continue;
        const rr = lerp(r.r0, r.r1, easeOut(u));
        c.strokeStyle = `rgba(${SPR_LIST[r.col]},${(1 - u) * 0.6 * endFade})`;
        c.lineWidth = r.w * (1 - u) + 0.8;
        c.beginPath(); c.arc(r.x, r.y, rr, 0, Math.PI * 2); c.stroke();
      }

      // ── focus: host aura OR lifted user frame (vibrates with the music) ──
      if (host && focus) {
        const L = host.lift;
        if (L) {
          const up = easeOut((t - LIFT_AT) / LIFT_S);
          const down = smooth((t - LIFT_BACK_AT) / LIFT_BACK_S);
          const e2 = up * (1 - down);
          if (down >= 1 && !L.done) { L.done = true; L.restore(); }
          if (e2 > 0.004) {
            const jx = Math.sin(t * 61) * lvl * 1.6 * k * e2;
            const jy = Math.cos(t * 53) * lvl * 1.6 * k * e2;
            const ax = focus.x + jx;
            const ay = focus.y + jy + Math.sin(t * 2.2) * 3 * k * e2;
            const ar = focus.r * (1 + 0.05 * lvl * e2);
            drawVibe(ax, ay, ar, e2 * endFade, t);
            c.save();
            c.globalAlpha = clamp01(e2 * 3) * endFade;
            c.beginPath(); c.arc(ax, ay, ar, 0, Math.PI * 2); c.closePath();
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
            // pulsing glowing frame
            c.beginPath(); c.arc(ax, ay, ar * (1 + 0.025 * lvl * Math.sin(t * 40)), 0, Math.PI * 2);
            c.lineWidth = Math.max(2, ar * 0.06) + lvl * 4 * k;
            c.strokeStyle = `hsla(${280 + 60 * Math.sin(t * 1.5)},100%,80%,0.95)`;
            c.shadowColor = 'rgba(160,140,255,0.95)';
            c.shadowBlur = 12 + 14 * lvl;
            c.stroke();
            c.shadowBlur = 0;
            c.restore();
            if (e2 > 0.5) {
              c.save();
              c.globalAlpha = clamp01((e2 - 0.5) * 2) * endFade;
              c.font = `800 ${Math.round(Math.max(12, ar * 0.3))}px sans-serif`;
              c.textAlign = 'center';
              c.textBaseline = 'top';
              c.shadowColor = 'rgba(0,0,0,0.9)';
              c.shadowBlur = 6;
              c.fillStyle = '#efe8ff';
              c.fillText(L.name.length > 18 ? L.name.slice(0, 17) + '…' : L.name, ax, ay + ar * 1.7 + 8 * k);
              c.restore();
            }
            c.globalAlpha = 1;
          }
        } else {
          const ha = smooth((t - 1.6) / 0.8) * (1 - smooth((t - 13.2) / 1.0)) * endFade;
          if (ha > 0.01) {
            drawVibe(host.x, host.y, focus.r, ha, t);
            c.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 4; i++) {
              const a = t * 1.3 + (i * Math.PI) / 2;
              const rr = focus.r * (1.9 + 0.25 * Math.sin(t * 2 + i));
              blob(SP[i % 2 ? 2 : 0], host.x + Math.cos(a) * rr, host.y + Math.sin(a) * rr, 6 * k, 0.8 * ha);
            }
            c.globalCompositeOperation = 'source-over';
            c.globalAlpha = 1;
          }
        }
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const tDone = window.setTimeout(() => doneRef.current(), TOTAL_MS);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(tDone);
      stopSound();
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
    </div>
  );
}

export const StarryPianoGift: GiftDefinition = {
  id: 'starry-piano',
  name: 'Starry Piano',
  price: PRICE,
  durationMs: TOTAL_MS,
  Preview: StarryPianoPreview,
  Animation: StarryPianoAnimation,
};

export default StarryPianoGift;
