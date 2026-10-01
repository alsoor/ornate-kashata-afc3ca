/**
 * Wolf gift - 1,500 Coins
 *
 * - Preview  : a cyan-and-black striped wolf bust inside the gift square. It keeps raising its head and
 *              howls at a glowing moon (stars twinkle, sound arcs travel to the moon) before it is tapped.
 * - Animation: the live room turns dark, the upper part becomes a night sky with a big moon and stars,
 *              a huge striped wolf walks in slowly with heavy footsteps on dry leaves and fallen twigs,
 *              stops, lifts its head to the moon and howls (sound rings travel to the moon),
 *              then dissolves into cyan mist and the room returns to normal.
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
const HOWL_URL = '';         // example: '/sounds/howl.mp3' (a real recorded howl instead of the generated one)

const FIG_W_RATIO = 0.98;    // wolf width as a share of the screen width
const FIG_W_MAX = 640;       // max wolf width in px
const GROUND_RATIO = 0.8;    // paws line (share of screen height)
const HEAD_WALK = 5;         // head angle while walking (down)
const HEAD_UP = -72;         // head angle while howling (up to the moon)

// ── Colors ────────────────────────────────────────────────────────────────
const CYAN = '#22d3ee';
const CYAN_L = '#8af2ff';
const GLOW = 'drop-shadow(0 0 2px rgba(138,242,255,0.9)) drop-shadow(0 0 14px rgba(34,211,238,0.45))';

// ── Wolf drawing (facing right). Local units; paws touch y = PAW_Y. ───────
const VB = { x: 8, y: 44, w: 424, h: 208 };
const PAW_Y = 248;
const LEG_Y = 148;
const HEAD_PIVOT = { x: 300, y: 115 };
const JAW_PIVOT = { x: 350, y: 138 };
const SWING_DEG = 17;

const LEGS = [
  { name: 'hindNear', px: 126, ph: 0, far: false, hind: true },
  { name: 'frontNear', px: 266, ph: 0.25, far: false, hind: false },
  { name: 'hindFar', px: 148, ph: 0.5, far: true, hind: true },
  { name: 'frontFar', px: 288, ph: 0.75, far: true, hind: false },
] as const;

const TORSO =
  'M96 118 C100 96 140 84 190 86 C230 86 262 82 290 98 C306 110 306 140 292 160 C270 178 230 176 190 172 C160 170 140 180 118 170 C98 160 92 138 96 118 Z';
const HAUNCH = 'M96 134 C98 108 134 100 156 118 C170 134 160 168 134 176 C108 178 94 158 96 134 Z';
const SHOULDER = 'M236 118 C244 100 280 98 294 120 C300 142 286 166 262 170 C240 166 230 138 236 118 Z';
const TAIL =
  'M100 112 C74 104 40 118 24 160 C18 176 20 196 32 204 C40 208 46 200 46 192 C48 168 66 150 104 138 Z';
const LEG_FRONT =
  'M-13 0 C-17 24 -12 52 -9 72 L-12 90 C-12 96 -10 100 -4 100 L14 100 C17 100 17 95 14 92 L9 76 C11 52 15 24 13 0 Z';
const LEG_HIND =
  'M-16 0 C-26 26 -20 48 -11 62 C-15 76 -13 88 -13 94 C-13 100 -10 100 -6 100 L15 100 C18 100 18 95 14 92 L8 82 C6 66 12 50 16 30 C18 14 17 6 16 0 Z';
const NECK = 'M262 92 C285 78 322 82 346 100 L352 150 C330 168 295 172 262 158 Z';
const HEAD =
  'M318 108 C320 88 336 80 352 84 C366 87 372 98 384 103 C400 108 414 112 421 119 C424 124 421 130 415 131 L372 134 C362 136 354 140 346 146 C332 150 318 138 316 124 Z';
const JAW = 'M350 138 L372 135 L414 132 C418 134 417 138 412 140 L376 150 C364 154 352 152 346 146 Z';
const MOUTH_IN = 'M350 138 L372 135 L414 131 L412 140 L376 148 L356 146 Z';
const TONGUE = 'M372 137 C385 143 400 143 410 138 L408 143 C395 149 380 147 372 141 Z';
const MANE = 'M262 96 L250 76 L270 86 L266 62 L286 82 L290 56 L306 80 L316 58 L324 82 L340 68 L342 98 Z';
const CHEEK_RUFF = 'M318 118 L294 126 L312 130 L290 146 L316 142 L304 162 L336 150 Z';
const CHEST_RUFF = 'M268 156 L264 174 L278 166 L282 184 L294 168 L304 182 L312 164 L326 172 L336 152 Z';
const EAR_NEAR = 'M326 94 C326 76 330 64 334 54 C342 62 350 74 352 88 Z';
const EAR_FAR = 'M346 88 C350 72 358 62 364 56 C368 68 368 80 364 94 Z';

function headPoint(dx: number, dy: number, ang: number, tx: number, ty: number) {
  const r = (ang * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return { x: HEAD_PIVOT.x + tx + dx * c - dy * s, y: HEAD_PIVOT.y + ty + dx * s + dy * c };
}

function WolfDefs({ uid }: { uid: string }) {
  return (
    <defs>
      <linearGradient id={`wfFur${uid}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#0d1a1f" />
        <stop offset="100%" stopColor="#03080b" />
      </linearGradient>
      <linearGradient id={`wfStripeG${uid}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={CYAN_L} />
        <stop offset="55%" stopColor={CYAN} stopOpacity="0.85" />
        <stop offset="100%" stopColor="#0e8aa6" stopOpacity="0" />
      </linearGradient>
      <pattern id={`wfStripe${uid}`} width="78" height="320" patternUnits="userSpaceOnUse">
        <path d="M3 56 L12 56 C11 100 9 150 6 196 C3 150 3 100 3 56 Z" fill={`url(#wfStripeG${uid})`} />
        <path d="M21 62 L26 62 C25 96 24 124 22 152 C20 124 20 96 21 62 Z" fill={`url(#wfStripeG${uid})`} />
        <path d="M34 54 L42 54 C41 100 40 156 37 206 C34 156 34 100 34 54 Z" fill={`url(#wfStripeG${uid})`} />
        <path d="M50 66 L54 66 C53 94 52 120 51 144 C49 120 49 94 50 66 Z" fill={`url(#wfStripeG${uid})`} />
        <path d="M62 58 L70 58 C69 96 67 140 65 178 C62 140 62 96 62 58 Z" fill={`url(#wfStripeG${uid})`} />
      </pattern>
      <pattern id={`wfBands${uid}`} width="40" height="19" patternUnits="userSpaceOnUse">
        <path d="M-2 4 L42 0 L42 4 L-2 8.5 Z" fill={CYAN} opacity="0.85" />
      </pattern>
      <radialGradient id={`wfEye${uid}`} cx="50%" cy="50%" r="60%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="45%" stopColor={CYAN_L} />
        <stop offset="100%" stopColor="#0ea5c4" />
      </radialGradient>
    </defs>
  );
}

function Fur({ d, uid, far = false, stripe = 0.95, bands = false }: {
  d: string; uid: string; far?: boolean; stripe?: number; bands?: boolean;
}) {
  return (
    <>
      <path d={d} fill={far ? '#03080a' : `url(#wfFur${uid})`} />
      <path d={d} fill={`url(#${bands ? 'wfBands' : 'wfStripe'}${uid})`} opacity={far ? stripe * 0.6 : stripe} />
    </>
  );
}

function WolfLeg({ uid, name, px, far, hind }: { uid: string; name: string; px: number; far: boolean; hind: boolean }) {
  return (
    <g data-w={name} transform={`translate(${px} ${LEG_Y})`}>
      <Fur d={hind ? LEG_HIND : LEG_FRONT} uid={uid} far={far} bands />
    </g>
  );
}

// The head group (ears + neck + ruff + jaw + head + eye). smil = self-animated (used by the small preview).
function WolfHead({ uid, smil = false }: { uid: string; smil?: boolean }) {
  const eyeStyle: React.CSSProperties = { transformBox: 'fill-box', transformOrigin: '50% 50%' };
  const T = '4.4s';
  const KT = '0;0.25;0.4;0.8;1';
  const KS = '0.4 0 0.2 1;0.4 0 0.2 1;0.4 0 0.2 1;0.4 0 0.2 1';
  return (
    <g data-w="head">
      {smil && (
        <animateTransform
          attributeName="transform" type="rotate" dur={T} repeatCount="indefinite"
          values={`4 ${HEAD_PIVOT.x} ${HEAD_PIVOT.y};4 ${HEAD_PIVOT.x} ${HEAD_PIVOT.y};-52 ${HEAD_PIVOT.x} ${HEAD_PIVOT.y};-52 ${HEAD_PIVOT.x} ${HEAD_PIVOT.y};4 ${HEAD_PIVOT.x} ${HEAD_PIVOT.y}`}
          keyTimes={KT} calcMode="spline" keySplines={KS}
        />
      )}
      <g data-w="ears">
        <g>
          <Fur d={EAR_FAR} uid={uid} far />
          <path d="M350 86 C353 76 358 68 362 62 C364 72 364 82 361 90 Z" fill="#0e7490" opacity="0.9" />
        </g>
        <g>
          <Fur d={EAR_NEAR} uid={uid} />
          <path d="M331 90 C331 78 334 68 336 62 C342 68 347 76 349 86 Z" fill="#0e7490" opacity="0.9" />
        </g>
      </g>

      <Fur d={MANE} uid={uid} />
      <Fur d={NECK} uid={uid} />
      <Fur d={CHEST_RUFF} uid={uid} />
      <Fur d={CHEEK_RUFF} uid={uid} />

      <path d={MOUTH_IN} fill="#020a0d" />
      <g data-w="jaw">
        {smil && (
          <animateTransform
            attributeName="transform" type="rotate" dur={T} repeatCount="indefinite"
            values={`0 ${JAW_PIVOT.x} ${JAW_PIVOT.y};0 ${JAW_PIVOT.x} ${JAW_PIVOT.y};18 ${JAW_PIVOT.x} ${JAW_PIVOT.y};18 ${JAW_PIVOT.x} ${JAW_PIVOT.y};0 ${JAW_PIVOT.x} ${JAW_PIVOT.y}`}
            keyTimes={KT} calcMode="spline" keySplines={KS}
          />
        )}
        <path d={TONGUE} fill="#1b8aa3" />
        <Fur d={JAW} uid={uid} />
        <path d="M404 134 L406.4 127 L409 133.4 Z" fill="#e0fbff" />
      </g>

      <Fur d={HEAD} uid={uid} />
      <ellipse cx="419" cy="121" rx="4.6" ry="3.7" fill="#020608" />
      <ellipse cx="417.6" cy="119.6" rx="1.5" ry="0.9" fill={CYAN_L} opacity="0.8" />

      <g data-w="eye" style={eyeStyle}>
        {smil && <animate attributeName="opacity" dur={T} repeatCount="indefinite" values="1;1;0.05;0.05;1" keyTimes={KT} />}
        <path d="M352 103 Q361 95 373 101 Q362 108 352 103 Z" fill={`url(#wfEye${uid})`} />
        <ellipse cx="362.5" cy="101.8" rx="1.7" ry="3.2" fill="#02080b" />
        <path d="M349 98 L375 93" stroke="#02080b" strokeWidth="2.2" strokeLinecap="round" />
      </g>

      <g data-w="fangs" opacity={0}>
        {smil && <animate attributeName="opacity" dur={T} repeatCount="indefinite" values="0;0;1;1;0" keyTimes={KT} />}
        <path d="M398 131 L401 141 L404.4 131 Z" fill="#e0fbff" />
        <path d="M380 134 L382.4 140 L385.6 134 Z" fill="#e0fbff" />
      </g>
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
      <g data-w="tail" transform="rotate(0 100 120)">
        <Fur d={TAIL} uid={uid} bands />
      </g>
      {LEGS.filter(l => l.far).map(l => <WolfLeg key={l.name} uid={uid} {...l} />)}
      <Fur d={TORSO} uid={uid} />
      <path d={HAUNCH} fill="rgba(120,220,235,0.06)" />
      <path d={SHOULDER} fill="rgba(120,220,235,0.06)" />
      {LEGS.filter(l => !l.far).map(l => <WolfLeg key={l.name} uid={uid} {...l} />)}
      <WolfHead uid={uid} />
    </svg>
  );
}

// ── Preview inside the gift square: a wolf bust howling at a glowing moon ──
function WolfPreview({ size = 72 }: { size?: number }) {
  const uid = React.useId().replace(/:/g, '');
  const h = Math.round(size * 1.35);
  const w = Math.round((h * 202) / 230);
  const arc = (r: number) => {
    const cx = 381, cy = 29;
    const a1 = (-105 * Math.PI) / 180, a2 = (-40 * Math.PI) / 180;
    return `M${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)} A${r} ${r} 0 0 1 ${cx + r * Math.cos(a2)} ${cy + r * Math.sin(a2)}`;
  };
  return (
    <div aria-hidden="true" style={{ position: 'relative', width: w, height: h, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg
        width={w} height={h} viewBox="228 -30 202 230"
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
        </defs>

        {/* twinkling stars */}
        {[[246, -14, 0], [270, 4, 0.7], [236, 26, 1.3], [418, 40, 0.4], [330, -20, 1.8]].map(([x, y, d]) => (
          <path key={`${x}-${y}`} d={`M${x} ${y - 4} Q${x + 0.8} ${y - 0.8} ${x + 4} ${y} Q${x + 0.8} ${y + 0.8} ${x} ${y + 4} Q${x - 0.8} ${y + 0.8} ${x - 4} ${y} Q${x - 0.8} ${y - 0.8} ${x} ${y - 4} Z`} fill="#e0fbff">
            <animate attributeName="opacity" values="0.15;1;0.15" dur="2.2s" begin={`${d}s`} repeatCount="indefinite" />
          </path>
        ))}

        {/* moon */}
        <circle cx="394" cy="-6" r="34" fill={`url(#wfHalo${uid})`}>
          <animate attributeName="opacity" values="0.55;1;0.55" dur="4.4s" repeatCount="indefinite" />
        </circle>
        <circle cx="394" cy="-6" r="17" fill={`url(#wfMoon${uid})`} />
        <ellipse cx="388" cy="-10" rx="4" ry="3.2" fill="#9fcfdb" opacity="0.55" />
        <ellipse cx="399" cy="0" rx="3" ry="2.4" fill="#9fcfdb" opacity="0.5" />
        <ellipse cx="401" cy="-12" rx="2" ry="1.7" fill="#9fcfdb" opacity="0.45" />

        {/* sound arcs travelling to the moon while it howls */}
        {[12, 20, 28].map((r, i) => (
          <path key={r} d={arc(r)} fill="none" stroke={CYAN_L} strokeWidth="2" strokeLinecap="round" opacity="0">
            <animate attributeName="opacity" values="0;0;0.9;0" keyTimes={`0;${0.4 + i * 0.06};${0.5 + i * 0.07};${0.7 + i * 0.07}`} dur="4.4s" repeatCount="indefinite" />
          </path>
        ))}

        {/* chest / shoulders */}
        <path d="M236 202 C238 160 270 128 300 116 C326 128 346 156 352 202 Z" fill={`url(#wfFur${uid})`} />
        <path d="M236 202 C238 160 270 128 300 116 C326 128 346 156 352 202 Z" fill={`url(#wfStripe${uid})`} opacity="0.9" />

        <WolfHead uid={uid} smil />
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
  const tip = headPoint(118, 11, HEAD_UP, 6, -4);
  const tipX = xStop + (tip.x - VB.x) * sc;
  const tipY = topY + (tip.y - VB.y) * sc;
  const moonR = Math.round(Math.min(Math.max(W * 0.17, 46), 96));
  const moonX = Math.min(Math.max(tipX + moonR * 0.1, moonR + 12), W - moonR - 12);
  const moonY = Math.max(moonR + 30, Math.min(H * 0.19, tipY - moonR - 60));
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
    const headEl = q('head'), jawEl = q('jaw'), earsEl = q('ears'), eyeEl = q('eye'), tailEl = q('tail');
    const fangsEl = q('fangs');
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
        const lift = 9 * amp * Math.max(0, Math.cos(u));
        setT(legEls[i], `translate(${l.px} ${LEG_Y - lift}) rotate(${theta})`);
      });

      // head / jaw / eye / ears / tail
      const raise = smooth((t - RAISE_AT) / RAISE_S) * (1 - smooth((t - LOWER_AT) / LOWER_S));
      const howl = smooth((t - HOWL_AT) / 0.4) * (1 - smooth((t - (HOWL_END - 0.6)) / 0.6));
      const nod = 3 * amp * Math.sin((2 * Math.PI * t) / CYCLE_S + 1);
      const tremble = 0.9 * howl * Math.sin(t * 23) + 1.2 * howl * Math.sin(t * 5.3);
      const headAng = HEAD_WALK + (HEAD_UP - HEAD_WALK) * raise + nod * (1 - raise) + tremble;
      const tx = 6 * raise, ty = -4 * raise;
      setT(headEl, `translate(${tx} ${ty}) rotate(${headAng} ${HEAD_PIVOT.x} ${HEAD_PIVOT.y})`);
      const jawAng = 19 * howl * (0.88 + 0.12 * Math.sin(t * 7.5));
      setT(jawEl, `rotate(${jawAng} ${JAW_PIVOT.x} ${JAW_PIVOT.y})`);
      if (fangsEl) fangsEl.setAttribute('opacity', String(clamp01(howl * 1.4)));
      setT(earsEl, `rotate(${-14 * raise} 345 92)`);
      eyeEl?.style.setProperty('transform', `scaleY(${1 - 0.9 * raise})`);
      setT(tailEl, `rotate(${4 * Math.sin(t * 1.3) - 10 * raise} 100 120)`);

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
        const pawX = x + (l.px + 100 * Math.sin((SWING_DEG * Math.PI) / 180) - VB.x) * sc;
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
        const m = headPoint(118, 11, headAng, tx, ty);
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
            x: x + (30 + Math.random() * 390) * sc,
            y: topY + (60 + Math.random() * 190) * sc,
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
