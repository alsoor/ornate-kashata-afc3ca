/**
 * Wolf gift - 1,500 Coins
 *
 * - Preview  : a cyan-and-black wolf (cut from the reference wolf image) inside the gift square. It keeps raising its head and
 *              howls at a glowing moon (stars twinkle, sound arcs travel to the moon) before it is tapped.
 * - Animation: the live room turns dark, the upper part becomes a night sky with a big moon and stars,
 *              a huge realistic cyan-and-black wolf walks in slowly with heavy footsteps on dry leaves and fallen twigs,
 *              stops, lifts its head to the moon and howls (sound rings travel to the moon),
 *              then dissolves into cyan mist and the room returns to normal.
 *
 * The wolf picture is embedded at the bottom of this file (WOLF_IMG), so nothing else needs uploading.
 * Optional: drop a real recorded howl at public/sounds/wolf-howl.mp3 (see HOWL_URL).
 *
 * Standalone file: put it in src/components/gifts/ next to HeartGift.tsx and WitchGift.tsx.
 * Sounds live in src/lib/wolfSounds.ts. Tune the numbers below (price / timings / sizes).
 */
import React, { useEffect, useRef, useState } from 'react';
import type { GiftDefinition } from '../../lib/types';
import { playWolfSound } from '../../lib/wolfSounds';
import type { WolfStep } from '../../lib/wolfSounds';

// ── Gift settings ────────────────────────────────────────────────────────
const PRICE = 1500;
const TOTAL_MS = 15000;      // full animation length
const NIGHT_IN_S = 1.4;      // darkness fades in
const WALK_AT = 1.2;         // the wolf starts entering
const WALK_S = 6.2;          // walking time until it stops in the middle
const CYCLE_S = 2.4;         // one full gait cycle (4 paw landings) - bigger = slower walk
const RAISE_AT = 7.9;        // head starts rising to the moon
const RAISE_S = 1.3;
const HOWL_AT = 8.9;         // howl starts
const HOWL_S = 4.2;          // howl length
const LOWER_AT = 13.0;       // head comes back down
const LOWER_S = 0.8;
const VANISH_AT = 13.5;      // wolf dissolves
const VANISH_S = 1.0;
const NIGHT_OUT_AT = 14.0;   // darkness fades out
const NIGHT_OUT_S = 1.0;
const HOWL_URL = '/sounds/wolf-howl.mp3'; // a real recorded howl (put the file in public/sounds). If it is missing, the generated howl plays instead. Use '' to always use the generated one

const FIG_W_RATIO = 0.74;    // wolf width as a share of the screen width
const FIG_W_MAX = 560;       // max wolf width in px
const GROUND_RATIO = 0.84;   // paws line (share of screen height)
const HEAD_WALK = 3;         // head angle while walking (down)
const HEAD_UP = -30;         // head angle while howling (up to the moon)

// ── Colors ────────────────────────────────────────────────────────────────
const CYAN = '#22d3ee';
const CYAN_L = '#8af2ff';
const GLOW = 'drop-shadow(0 0 2px rgba(138,242,255,0.6)) drop-shadow(0 0 14px rgba(34,211,238,0.4))';

// ── Wolf (built from the reference wolf image, recolored cyan/black, facing right) ──
// The image is split into layers that move separately: head, body, and 4 legs.
// All numbers below are in image pixels (473 x 550). Paws touch y = PAW_Y.
const SPR_W = 473;
const SPR_H = 550;
const VB = { x: 0, y: 0, w: SPR_W, h: SPR_H };
const PAW_Y = 548;
const LEG_Y = 332;                       // hip line (legs rotate around this height)
const HEAD_PIVOT = { x: 335, y: 262 };   // the head turns around the base of the neck
const MUZZLE = { x: 392, y: 192 };       // nose tip (sound rings start here)
const SWING_DEG = 9;

const HEAD_PTS = '262,70 292,40 300,-14 345,-14 352,30 395,28 402,-14 487,-14 487,250 440,262 395,258 350,282 310,278 285,248 272,170';
const HIND_CUT = '26,340 176,340 176,550 26,550';
const FRONT_CUT = '212,340 430,340 430,550 212,550';

const LEGS = [
  { name: 'hindNear', px: 63, paw: 52, ph: 0, far: false, pts: '26,322 101,322 101,360 80,430 80,550 26,550' },
  { name: 'frontNear', px: 375, paw: 385, ph: 0.25, far: false, pts: '322,322 430,322 430,550 348,550 346,500 318,400' },
  { name: 'hindFar', px: 135, paw: 122, ph: 0.5, far: true, pts: '101,322 176,322 176,420 160,550 80,550 80,430 101,360' },
  { name: 'frontFar', px: 270, paw: 328, ph: 0.75, far: true, pts: '212,322 322,322 318,400 346,500 348,550 212,550' },
] as const;

function headPoint(dx: number, dy: number, ang: number, tx: number, ty: number) {
  const r = (ang * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return { x: HEAD_PIVOT.x + tx + dx * c - dy * s, y: HEAD_PIVOT.y + ty + dx * s + dy * c };
}

function WolfDefs({ uid }: { uid: string }) {
  return (
    <defs>
      {LEGS.map(l => (
        <clipPath key={l.name} id={`wfClip${l.name}${uid}`}>
          <polygon points={l.pts} />
        </clipPath>
      ))}
      <filter id={`wfBlur${uid}`} x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur stdDeviation="2.4" />
      </filter>
      <filter id={`wfSoft${uid}`} x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="10" />
      </filter>
      <mask id={`wfHeadM${uid}`} maskUnits="userSpaceOnUse" x="0" y="0" width={SPR_W} height={SPR_H}>
        <polygon points={HEAD_PTS} fill="#fff" filter={`url(#wfBlur${uid})`} />
      </mask>
      <mask id={`wfBodyM${uid}`} maskUnits="userSpaceOnUse" x="0" y="0" width={SPR_W} height={SPR_H}>
        <rect x="0" y="0" width={SPR_W} height={SPR_H} fill="#fff" />
        <polygon points={HEAD_PTS} fill="#000" filter={`url(#wfBlur${uid})`} />
        <polygon points={HIND_CUT} fill="#000" />
        <polygon points={FRONT_CUT} fill="#000" />
      </mask>
    </defs>
  );
}

function WolfLegLayer({ uid, name }: { uid: string; name: string }) {
  return (
    <g data-w={name}>
      <image href={WOLF_IMG} x={0} y={0} width={SPR_W} height={SPR_H} clipPath={`url(#wfClip${name}${uid})`} />
    </g>
  );
}

function WolfBodyLayer({ uid }: { uid: string }) {
  return (
    <g data-w="body">
      {/* dark neck behind the head: shows only while the head is raised */}
      <ellipse cx="330" cy="190" rx="78" ry="108" fill="#031219" filter={`url(#wfSoft${uid})`} />
      <image href={WOLF_IMG} x={0} y={0} width={SPR_W} height={SPR_H} mask={`url(#wfBodyM${uid})`} />
    </g>
  );
}

// smil = self-animated (used by the small preview)
function WolfHeadLayer({ uid, smil = false }: { uid: string; smil?: boolean }) {
  const P = `${HEAD_PIVOT.x} ${HEAD_PIVOT.y}`;
  return (
    <g data-w="head">
      {smil && (
        <animateTransform
          attributeName="transform" type="rotate" dur="4.4s" repeatCount="indefinite"
          values={`3 ${P};3 ${P};-27 ${P};-27 ${P};3 ${P}`}
          keyTimes="0;0.25;0.4;0.8;1" calcMode="spline" keySplines="0.4 0 0.2 1;0.4 0 0.2 1;0.4 0 0.2 1;0.4 0 0.2 1"
        />
      )}
      <image href={WOLF_IMG} x={0} y={0} width={SPR_W} height={SPR_H} mask={`url(#wfHeadM${uid})`} />
    </g>
  );
}

function WolfFigure({ uid, svgRef, width, height }: {
  uid: string; svgRef: React.RefObject<SVGSVGElement | null>; width: number; height: number;
}) {
  return (
    <svg
      ref={svgRef}
      width={width} height={height}
      viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
      style={{ display: 'block', overflow: 'visible', filter: GLOW }}
    >
      <WolfDefs uid={uid} />
      {LEGS.filter(l => l.far).map(l => <WolfLegLayer key={l.name} uid={uid} name={l.name} />)}
      {LEGS.filter(l => !l.far).map(l => <WolfLegLayer key={l.name} uid={uid} name={l.name} />)}
      <WolfBodyLayer uid={uid} />
      <WolfHeadLayer uid={uid} />
    </svg>
  );
}

// ── Preview inside the gift square: the wolf raises its head and calls the glowing moon ──
function WolfPreview({ size = 72 }: { size?: number }) {
  const uid = React.useId().replace(/:/g, '');
  const h = Math.round(size * 1.35);
  const w = Math.round((h * 303) / 380);
  const MX = 236, MY = -6;
  const arc = (r: number) => {
    const a1 = (8 * Math.PI) / 180, a2 = (78 * Math.PI) / 180;
    return `M${MX + r * Math.cos(a1)} ${MY + r * Math.sin(a1)} A${r} ${r} 0 0 1 ${MX + r * Math.cos(a2)} ${MY + r * Math.sin(a2)}`;
  };
  return (
    <div aria-hidden="true" style={{ position: 'relative', width: w, height: h, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg
        width={w} height={h} viewBox="170 -64 303 380"
        style={{ display: 'block', overflow: 'visible', filter: 'drop-shadow(0 0 7px rgba(34,211,238,0.5))' }}
      >
        <WolfDefs uid={uid} />
        <defs>
          <radialGradient id={`wfMoon${uid}`} cx="38%" cy="32%" r="75%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#d9f7ff" />
            <stop offset="100%" stopColor="#8fd3e2" />
          </radialGradient>
          <radialGradient id={`wfHalo${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#a5f3fc" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#a5f3fc" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`wfFadeG${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1="236" x2="0" y2="306">
            <stop offset="0%" stopColor="#fff" />
            <stop offset="100%" stopColor="#000" />
          </linearGradient>
          <mask id={`wfFade${uid}`} maskUnits="userSpaceOnUse" x="170" y="-64" width="303" height="380">
            <rect x="170" y="-64" width="303" height="380" fill={`url(#wfFadeG${uid})`} />
          </mask>
        </defs>

        {/* twinkling stars */}
        {[[196, -40, 0], [214, 18, 0.7], [182, 52, 1.3], [440, -34, 0.4], [330, -52, 1.8], [452, 24, 1.1]].map(([x, y, d]) => (
          <path key={`${x}-${y}`} d={`M${x} ${y - 5} Q${x + 1} ${y - 1} ${x + 5} ${y} Q${x + 1} ${y + 1} ${x} ${y + 5} Q${x - 1} ${y + 1} ${x - 5} ${y} Q${x - 1} ${y - 1} ${x} ${y - 5} Z`} fill="#e0fbff">
            <animate attributeName="opacity" values="0.15;1;0.15" dur="2.2s" begin={`${d}s`} repeatCount="indefinite" />
          </path>
        ))}

        {/* moon */}
        <circle cx={MX} cy={MY} r="46" fill={`url(#wfHalo${uid})`}>
          <animate attributeName="opacity" values="0.55;1;0.55" dur="4.4s" repeatCount="indefinite" />
        </circle>
        <circle cx={MX} cy={MY} r="21" fill={`url(#wfMoon${uid})`} />
        <ellipse cx={MX - 7} cy={MY - 6} rx="5" ry="4" fill="#9fcfdb" opacity="0.55" />
        <ellipse cx={MX + 7} cy={MY + 6} rx="3.6" ry="3" fill="#9fcfdb" opacity="0.5" />

        {/* sound arcs travelling to the moon while it howls */}
        {[28, 38, 48].map((r, i) => (
          <path key={r} d={arc(r)} fill="none" stroke={CYAN_L} strokeWidth="2.4" strokeLinecap="round" opacity="0">
            <animate attributeName="opacity" values="0;0;0.9;0" keyTimes={`0;${0.4 + i * 0.06};${0.5 + i * 0.07};${0.7 + i * 0.07}`} dur="4.4s" repeatCount="indefinite" />
          </path>
        ))}

        <g mask={`url(#wfFade${uid})`}>
          <WolfBodyLayer uid={uid} />
          <WolfHeadLayer uid={uid} smil />
        </g>
      </svg>
    </div>
  );
}

// ── Forest scenery (static) ────────────────────────────────────────────────
function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pine(x: number, base: number, h: number, w: number): string {
  let d = '';
  const tiers = 6;
  for (let k = 0; k < tiers; k++) {
    const top = base - h + (k * h * 0.78) / tiers;
    const th = h * 0.34;
    const hw = w * (0.22 + (k / (tiers - 1)) * 0.5);
    d += `M${x.toFixed(1)} ${top.toFixed(1)}L${(x + hw).toFixed(1)} ${(top + th).toFixed(1)}L${(x - hw).toFixed(1)} ${(top + th).toFixed(1)}Z`;
  }
  d += `M${(x - w * 0.05).toFixed(1)} ${(base - h * 0.14).toFixed(1)}h${(w * 0.1).toFixed(1)}v${(h * 0.14).toFixed(1)}h${(-w * 0.1).toFixed(1)}Z`;
  return d;
}

function buildForest(W: number, H: number, gy: number) {
  const rnd = mulberry(1912);
  let far = '';
  for (let x = -20; x < W + 40; x += 26 + rnd() * 22) {
    const h = H * (0.16 + rnd() * 0.16);
    far += pine(x, gy - 4, h, h * 0.42);
  }
  let near = '';
  [-0.02, 0.08, 0.93, 1.03].forEach((fx, i) => {
    const h = H * (0.42 + rnd() * 0.12 - (i === 1 || i === 2 ? 0.08 : 0));
    near += pine(W * fx, gy + 6, h, h * 0.38);
  });
  const leaves: { x: number; y: number; rx: number; ry: number; rot: number; c: string }[] = [];
  const colors = ['#5b4524', '#7a5a2c', '#3f5a2e', '#2a3b22', '#6b3f22', '#4d4a24'];
  for (let i = 0; i < 70; i++) {
    leaves.push({
      x: rnd() * W,
      y: gy + 2 + Math.pow(rnd(), 1.4) * (H - gy) * 0.55,
      rx: 3 + rnd() * 5, ry: 1.5 + rnd() * 2.2,
      rot: rnd() * 180, c: colors[Math.floor(rnd() * colors.length)],
    });
  }
  const twigs: { x: number; y: number; len: number; rot: number }[] = [];
  for (let i = 0; i < 16; i++) {
    twigs.push({ x: rnd() * W, y: gy + 4 + Math.pow(rnd(), 1.2) * (H - gy) * 0.4, len: 18 + rnd() * 40, rot: -25 + rnd() * 50 });
  }
  return { far, near, leaves, twigs };
}

function Forest({ W, H, gy }: { W: number; H: number; gy: number }) {
  const [f] = useState(() => buildForest(W, H, gy));
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', left: 0, top: 0 }}>
      <defs>
        <linearGradient id="wfGround" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0a2229" />
          <stop offset="100%" stopColor="#010607" />
        </linearGradient>
      </defs>
      <path d={f.far} fill="#05202a" opacity="0.95" />
      <path d={f.near} fill="#010a0d" />
      <path
        d={`M0 ${gy - 8} Q${W * 0.25} ${gy - 14} ${W * 0.5} ${gy - 8} Q${W * 0.75} ${gy - 2} ${W} ${gy - 9} L${W} ${H} L0 ${H} Z`}
        fill="url(#wfGround)"
      />
      {f.twigs.map((t, i) => (
        <g key={i} transform={`translate(${t.x} ${t.y}) rotate(${t.rot})`} stroke="#4a3520" strokeLinecap="round" fill="none">
          <path d={`M0 0 L${t.len} 0`} strokeWidth="2.4" />
          <path d={`M${t.len * 0.45} 0 L${t.len * 0.7} -8`} strokeWidth="1.5" />
          <path d={`M${t.len * 0.7} 0 L${t.len * 0.92} 6`} strokeWidth="1.3" />
        </g>
      ))}
      {f.leaves.map((l, i) => (
        <ellipse key={i} cx={l.x} cy={l.y} rx={l.rx} ry={l.ry} fill={l.c} opacity="0.85" transform={`rotate(${l.rot} ${l.x} ${l.y})`} />
      ))}
    </svg>
  );
}

function MoonSvg({ r, uid }: { r: number; uid: string }) {
  return (
    <svg width={r * 2} height={r * 2} viewBox="-50 -50 100 100" style={{ display: 'block' }}>
      <defs>
        <radialGradient id={`wfM${uid}`} cx="38%" cy="32%" r="80%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#e3f9ff" />
          <stop offset="100%" stopColor="#8fd3e2" />
        </radialGradient>
      </defs>
      <circle r="48" fill={`url(#wfM${uid})`} />
      <ellipse cx="-16" cy="-14" rx="12" ry="9" fill="#9fcfdb" opacity="0.5" />
      <ellipse cx="18" cy="8" rx="9" ry="7" fill="#9fcfdb" opacity="0.45" />
      <ellipse cx="-6" cy="24" rx="7" ry="5" fill="#9fcfdb" opacity="0.4" />
      <ellipse cx="22" cy="-22" rx="5" ry="4" fill="#9fcfdb" opacity="0.4" />
      <ellipse cx="-28" cy="12" rx="4.5" ry="3.5" fill="#9fcfdb" opacity="0.35" />
    </svg>
  );
}

// ── Timeline helpers ──────────────────────────────────────────────────────
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };

// Walk speed profile: constant, then slows down to a stop
const WALK_A = 0.8;
const WALK_NORM = WALK_A + (1 - WALK_A) / 2;
function walkSpeed(t: number): number {
  const u = (t - WALK_AT) / WALK_S;
  if (u <= 0 || u >= 1) return 0;
  const ramp = smooth(u / 0.06);
  return (u < WALK_A ? 1 : 1 - (u - WALK_A) / (1 - WALK_A)) * ramp;
}
function walkProgress(t: number): number {
  const u = clamp01((t - WALK_AT) / WALK_S);
  const pos = u <= WALK_A ? u : WALK_A + (u - WALK_A) - ((u - WALK_A) * (u - WALK_A)) / (2 * (1 - WALK_A));
  return pos / WALK_NORM;
}

// Paw landing times (the sound and the dust use the same list)
interface PawStep extends WolfStep { leg: number }
const PAW_STEPS: PawStep[] = (() => {
  const out: PawStep[] = [];
  for (let n = 0; n < 40; n++) {
    LEGS.forEach((l, li) => {
      const t = CYCLE_S * (l.ph + 0.25 + n);
      if (t > WALK_AT + 0.5 && t < WALK_AT + WALK_S * 0.93) {
        const p = (t - WALK_AT) / WALK_S;
        out.push({ t, v: 0.2 + 0.8 * smooth(p * 1.15), leg: li });
      }
    });
  }
  return out.sort((a, b) => a.t - b.t);
})();

function makeGeo(W: number, H: number) {
  const figW = Math.round(Math.min(W * FIG_W_RATIO, FIG_W_MAX));
  const sc = figW / VB.w;
  const figH = Math.round(VB.h * sc);
  const groundY = Math.round(H * GROUND_RATIO);
  const topY = groundY - (PAW_Y - VB.y) * sc;
  const xStart = -figW - 16;
  const xStop = (W - figW) / 2;
  const tip = headPoint(MUZZLE.x - HEAD_PIVOT.x, MUZZLE.y - HEAD_PIVOT.y, HEAD_UP, -4, -10);
  const earL = headPoint(320 - HEAD_PIVOT.x, -HEAD_PIVOT.y, HEAD_UP, -4, -10);
  const earR = headPoint(440 - HEAD_PIVOT.x, -HEAD_PIVOT.y, HEAD_UP, -4, -10);
  const tipX = xStop + (tip.x - VB.x) * sc;
  const tipY = topY + (tip.y - VB.y) * sc;
  const headTopY = topY + (Math.min(earL.y, earR.y, tip.y) - VB.y) * sc;
  const moonR = Math.round(Math.max(28, Math.min(W * 0.17, 96, (headTopY - 30) / 2.4)));
  const moonX = Math.min(Math.max(tipX - moonR * 0.3, moonR + 12), W - moonR - 12);
  const moonY = Math.max(moonR + 16, headTopY - moonR - 26);
  return { W, H, figW, figH, sc, groundY, topY, xStart, xStop, D: xStop - xStart, moonR, moonX, moonY };
}

// ── Particles ─────────────────────────────────────────────────────────────
type Kind = 'leaf' | 'dust' | 'twig' | 'ring' | 'mist';
interface P {
  kind: Kind; x: number; y: number; vx: number; vy: number;
  size: number; rot: number; vr: number; born: number; life: number; grav: number; color: string; a: number;
}

const LEAF_COLORS = ['#7a5a2c', '#8a6a34', '#5b4524', '#6b3f22', '#4d4a24'];

const WF_CSS = `
@keyframes wf-twinkle{0%,100%{opacity:.15}50%{opacity:1}}
@keyframes wf-drift{0%{transform:translateX(-12%)}100%{transform:translateX(12%)}}
.wf-star{animation:wf-twinkle 2.6s ease-in-out infinite}
.wf-fog{animation:wf-drift 9s ease-in-out infinite alternate}
`;

// ── Full-screen animation ──────────────────────────────────────────────────
function WolfAnimation({ onDone }: { onDone: () => void }) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const uid = React.useId().replace(/:/g, '');
  const sceneRef = useRef<HTMLDivElement>(null);
  const figRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const moonRef = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);

  const [geo] = useState(() => makeGeo(
    typeof window !== 'undefined' ? window.innerWidth : 360,
    typeof window !== 'undefined' ? window.innerHeight : 640,
  ));
  const [stars] = useState(() => {
    const rnd = mulberry(77);
    return Array.from({ length: 70 }, () => ({
      x: rnd() * geo.W, y: rnd() * geo.H * 0.55, s: 0.8 + rnd() * 1.6, d: rnd() * 2.6,
    }));
  });

  useEffect(() => {
    const scene = sceneRef.current;
    const fig = figRef.current;
    const svg = svgRef.current;
    const cv = cvRef.current;
    const moon = moonRef.current;
    const halo = haloRef.current;
    if (!scene || !fig || !svg || !cv || !moon || !halo) return;
    const c = cv.getContext('2d');
    if (!c) return;

    const { W, H, sc, groundY, topY, xStart, D, moonX, moonY, moonR } = geo;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    const k = Math.max(W, H) / 700;
    const TOTAL_S = TOTAL_MS / 1000;
    const HOWL_END = HOWL_AT + HOWL_S;

    const q = (n: string) => svg.querySelector<SVGElement>(`[data-w="${n}"]`);
    const legEls = LEGS.map(l => q(l.name));
    const headEl = q('head');
    const setT = (el: Element | null, v: string) => { if (el) el.setAttribute('transform', v); };

    const ps: P[] = [];
    const add = (p: Partial<P> & { kind: Kind; x: number; y: number; born: number; life: number }) => {
      ps.push({ vx: 0, vy: 0, size: 6, rot: 0, vr: 0, grav: 0, color: '#fff', a: 0, ...p });
    };

    const stopSound = playWolfSound({
      steps: PAW_STEPS.map(s => ({ t: s.t, v: s.v })),
      howlAt: HOWL_AT,
      howlDur: HOWL_S,
      totalS: TOTAL_S,
      howlUrl: HOWL_URL || undefined,
    });

    let raf = 0;
    const start = performance.now();
    let last = start;
    let stepIdx = 0;
    let nextRing = HOWL_AT + 0.25;

    const frame = (now: number) => {
      const t = (now - start) / 1000;
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;

      // night: fade in / out
      const night = smooth(t / NIGHT_IN_S) * (1 - smooth((t - NIGHT_OUT_AT) / NIGHT_OUT_S));
      scene.style.opacity = String(night);

      // walking
      const amp = walkSpeed(t);
      const p = walkProgress(t);
      const x = xStart + D * p;
      const bobPx = -2.2 * sc * amp * Math.abs(Math.cos((2 * Math.PI * t * 2) / CYCLE_S));
      const vanish = smooth((t - VANISH_AT) / VANISH_S);
      fig.style.transform = `translate3d(${x}px, ${topY + bobPx}px, 0)`;
      fig.style.opacity = String(1 - vanish);

      LEGS.forEach((l, i) => {
        const u = 2 * Math.PI * (t / CYCLE_S - l.ph);
        const theta = -SWING_DEG * amp * Math.sin(u);
        const lift = 12 * amp * Math.max(0, Math.cos(u));
        setT(legEls[i], `translate(0 ${-lift}) rotate(${theta} ${l.px} ${LEG_Y})`);
      });

      // head: rises toward the moon and trembles / swells while it calls
      const raise = smooth((t - RAISE_AT) / RAISE_S) * (1 - smooth((t - LOWER_AT) / LOWER_S));
      const howl = smooth((t - HOWL_AT) / 0.4) * (1 - smooth((t - (HOWL_END - 0.6)) / 0.6));
      const nod = 2.5 * amp * Math.sin((2 * Math.PI * t) / CYCLE_S + 1);
      const tremble = 0.9 * howl * Math.sin(t * 23) + 1.4 * howl * Math.sin(t * 5.3);
      const headAng = HEAD_WALK + (HEAD_UP - HEAD_WALK) * raise + nod * (1 - raise) + tremble;
      const swell = howl * (0.5 + 0.5 * Math.sin(t * 6.5));
      const tx = -4 * raise, ty = -10 * raise - 3 * swell;
      const hs = 1 + 0.025 * swell;
      setT(headEl, `translate(${tx} ${ty}) rotate(${headAng} ${HEAD_PIVOT.x} ${HEAD_PIVOT.y}) translate(${HEAD_PIVOT.x} ${HEAD_PIVOT.y}) scale(${hs}) translate(${-HEAD_PIVOT.x} ${-HEAD_PIVOT.y})`);

      // moon
      const moonIn = smooth((t - 0.25) / 1.4) * (1 - smooth((t - NIGHT_OUT_AT) / NIGHT_OUT_S));
      const pulse = 1 + 0.035 * howl * Math.sin(t * 3.2) + 0.04 * howl;
      moon.style.opacity = String(moonIn);
      moon.style.transform = `translate3d(${moonX - moonR}px, ${moonY - moonR + 26 * (1 - moonIn)}px, 0) scale(${pulse})`;
      halo.style.opacity = String(moonIn * (0.7 + 0.5 * howl));
      halo.style.transform = `translate3d(${moonX - moonR * 2.6}px, ${moonY - moonR * 2.6 + 26 * (1 - moonIn)}px, 0) scale(${1 + 0.1 * howl * Math.sin(t * 3.2)})`;

      // canvas
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);

      // paw landings -> leaves, dust and twigs fly
      while (stepIdx < PAW_STEPS.length && t >= PAW_STEPS[stepIdx].t) {
        const s = PAW_STEPS[stepIdx];
        const l = LEGS[s.leg];
        const pawX = x + (l.paw - VB.x) * sc;
        if (pawX > -30 && pawX < W + 30) {
          const n = 5 + Math.floor(Math.random() * 3);
          for (let i = 0; i < n; i++) {
            const ang = -Math.PI * (0.15 + Math.random() * 0.7);
            const sp = (60 + Math.random() * 140) * k * (0.6 + s.v * 0.6);
            add({
              kind: 'leaf', x: pawX + (Math.random() - 0.5) * 20 * sc, y: groundY - 2,
              vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
              size: 3 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12,
              born: t, life: 0.7 + Math.random() * 0.7, grav: 520 * k,
              color: LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)],
            });
          }
          for (let i = 0; i < 3; i++) {
            add({
              kind: 'dust', x: pawX + (Math.random() - 0.5) * 24 * sc, y: groundY - 3,
              vx: (Math.random() - 0.5) * 40 * k, vy: -(10 + Math.random() * 26) * k,
              size: 10 + Math.random() * 16, born: t, life: 0.9 + Math.random() * 0.6, color: '#9fc4cc',
            });
          }
          if (stepIdx % 3 === 1) {
            for (let i = 0; i < 2; i++) {
              add({
                kind: 'twig', x: pawX, y: groundY - 4,
                vx: (Math.random() - 0.3) * 140 * k, vy: -(80 + Math.random() * 120) * k,
                size: 8 + Math.random() * 10, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 16,
                born: t, life: 0.8 + Math.random() * 0.4, grav: 620 * k, color: '#5a4025',
              });
            }
          }
        }
        stepIdx++;
      }

      // sound rings travelling from the muzzle to the moon
      if (t >= nextRing && t < HOWL_END - 0.3) {
        const m = headPoint(MUZZLE.x - HEAD_PIVOT.x, MUZZLE.y - HEAD_PIVOT.y, headAng, tx, ty);
        const mx = x + (m.x - VB.x) * sc;
        const my = topY + (m.y - VB.y) * sc;
        add({
          kind: 'ring', x: mx, y: my, size: 14 * k, born: t, life: 1.9,
          a: Math.atan2(moonY - my, moonX - mx), vx: 150 * k, color: CYAN_L,
        });
        nextRing += 0.62;
      }

      // the wolf dissolves into cyan mist
      if (vanish > 0 && vanish < 1) {
        for (let i = 0; i < 6; i++) {
          add({
            kind: 'mist',
            x: x + (20 + Math.random() * 430) * sc,
            y: topY + (30 + Math.random() * 500) * sc,
            vx: (Math.random() - 0.5) * 30 * k, vy: -(30 + Math.random() * 70) * k,
            size: 16 + Math.random() * 30, born: t, life: 0.9 + Math.random() * 0.8, color: CYAN_L,
          });
        }
      }

      // update + draw
      for (let i = ps.length - 1; i >= 0; i--) {
        const pt = ps[i];
        const age = t - pt.born;
        if (age >= pt.life) { ps.splice(i, 1); continue; }
        const left = pt.life - age;
        const fade = Math.min(1, left / 0.4);

        if (pt.kind === 'ring') {
          const rr = pt.size + pt.vx * age;
          c.save();
          c.globalAlpha = fade * 0.7 * (1 - age / pt.life * 0.5) * night;
          c.strokeStyle = pt.color;
          c.lineWidth = 3 * k;
          c.shadowColor = CYAN;
          c.shadowBlur = 10;
          c.beginPath();
          c.arc(pt.x, pt.y, rr, pt.a - 0.55, pt.a + 0.55);
          c.stroke();
          c.restore();
          continue;
        }

        pt.vy += pt.grav * dt;
        const damp = Math.exp(-(pt.kind === 'dust' || pt.kind === 'mist' ? 1.4 : 0.6) * dt);
        pt.vx *= damp; pt.vy *= pt.kind === 'leaf' || pt.kind === 'twig' ? 1 : damp;
        pt.x += pt.vx * dt; pt.y += pt.vy * dt;
        pt.rot += pt.vr * dt;

        if (pt.kind === 'leaf') {
          c.save();
          c.globalAlpha = fade;
          c.translate(pt.x, pt.y); c.rotate(pt.rot);
          c.fillStyle = pt.color;
          c.beginPath(); c.ellipse(0, 0, pt.size, pt.size * 0.45, 0, 0, Math.PI * 2); c.fill();
          c.restore();
        } else if (pt.kind === 'twig') {
          c.save();
          c.globalAlpha = fade;
          c.translate(pt.x, pt.y); c.rotate(pt.rot);
          c.strokeStyle = pt.color; c.lineWidth = 2; c.lineCap = 'round';
          c.beginPath(); c.moveTo(-pt.size / 2, 0); c.lineTo(pt.size / 2, 0); c.stroke();
          c.restore();
        } else if (pt.kind === 'dust') {
          const s = pt.size * (1 + age * 0.9);
          c.save();
          c.globalAlpha = fade * 0.2 * (1 - age / pt.life);
          c.fillStyle = pt.color;
          c.beginPath(); c.arc(pt.x, pt.y, s, 0, Math.PI * 2); c.fill();
          c.restore();
        } else {
          const s = pt.size * (1 + age * 0.6);
          const g = c.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, s);
          g.addColorStop(0, 'rgba(138,242,255,0.55)');
          g.addColorStop(1, 'rgba(34,211,238,0)');
          c.save();
          c.globalAlpha = fade * 0.9;
          c.fillStyle = g;
          c.beginPath(); c.arc(pt.x, pt.y, s, 0, Math.PI * 2); c.fill();
          c.restore();
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
    };
  }, [geo]);

  const { W, H, figW, figH, groundY, moonR } = geo;

  return (
    <div
      aria-hidden="true"
      data-gift-overlay="1"
      style={{ position: 'fixed', inset: 0, zIndex: 9400, pointerEvents: 'none', overflow: 'hidden' }}
    >
      <style>{WF_CSS}</style>

      {/* night scene: sky, stars, moon, forest, fog */}
      <div ref={sceneRef} style={{ position: 'absolute', inset: 0, opacity: 0 }}>
        <div
          style={{
            position: 'absolute', inset: 0,
            background: `linear-gradient(180deg, rgba(1,4,10,0.97) 0%, rgba(3,16,24,0.95) 38%, rgba(10,50,60,0.9) ${Math.round((groundY / H) * 100 - 4)}%, rgba(2,10,13,0.96) ${Math.round((groundY / H) * 100 + 2)}%, rgba(1,5,7,0.97) 100%)`,
          }}
        />
        {stars.map((s, i) => (
          <span
            key={i} className="wf-star"
            style={{
              position: 'absolute', left: s.x, top: s.y, width: s.s, height: s.s, borderRadius: '50%',
              background: '#e8fbff', boxShadow: '0 0 4px rgba(200,245,255,0.9)', animationDelay: `${s.d}s`,
            }}
          />
        ))}
        <div
          ref={haloRef}
          style={{
            position: 'absolute', left: 0, top: 0, width: moonR * 5.2, height: moonR * 5.2, borderRadius: '50%', opacity: 0,
            background: 'radial-gradient(circle, rgba(165,243,252,0.5) 0%, rgba(34,211,238,0.18) 40%, rgba(34,211,238,0) 70%)',
          }}
        />
        <div ref={moonRef} style={{ position: 'absolute', left: 0, top: 0, width: moonR * 2, height: moonR * 2, opacity: 0, filter: 'drop-shadow(0 0 18px rgba(200,248,255,0.8))' }}>
          <MoonSvg r={moonR} uid={uid} />
        </div>
        <Forest W={W} H={H} gy={groundY} />
        <div
          className="wf-fog"
          style={{
            position: 'absolute', left: '-10%', width: '120%', top: groundY - 40, height: 90,
            background: 'radial-gradient(ellipse at center, rgba(120,210,225,0.22) 0%, rgba(120,210,225,0) 70%)',
          }}
        />
      </div>

      <div
        ref={figRef}
        style={{ position: 'absolute', left: 0, top: 0, width: figW, height: figH, transform: 'translate3d(-9999px,0,0)', willChange: 'transform' }}
      >
        <WolfFigure uid={uid} svgRef={svgRef} width={figW} height={figH} />
      </div>
      <canvas ref={cvRef} style={{ position: 'absolute', inset: 0, width: W, height: H, pointerEvents: 'none' }} />
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

// ── Embedded wolf picture (cyan/black, transparent WebP) ───────────────────
const WOLF_IMG =
  'data:image/webp;base64,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';
