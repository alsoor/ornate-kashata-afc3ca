/**
 * MeteorGift — هدية "نيزك الدمار" (15,000 Coins, 25s)
 *
 * المشهد: ظلام + سماء حمراء + أمطار وعواصف وبرق → زلزال يهز البث ويرجّ الأزرار →
 * نيزك ينزل من السماء ويضرب البث فتتطاير الأزرار → أيقونة التطبيق (دائرة كبيرة بسنون حديد على إطارها)
 * تنزل من السماء وتدور:
 *   - للمضيف (مستخدم دعم صاحب البث): تحفر البث من الأسفل بشرار وانفجارات ورياح وأمطار حتى النهاية.
 *   - لمستخدم (صاحب البث دعمه): عند نزول الأيقونة تتحول لإطار لصورته، يصعد للأعلى وأطرافه شرار نار وينتهي.
 * الأصوات: src/lib/meteorSounds.ts (Web Audio) — الأيقونة: src/lib/meteorIcon.ts
 */
import React, { useEffect, useRef, useState } from 'react';
import type { GiftDefinition } from '@/lib/types';
import { createMeteorSounds } from '@/lib/meteorSounds';
import { METEOR_APP_ICON } from '@/lib/meteorIcon';

const DURATION = 25;       // ثواني
const T_QUAKE = 1.6;       // بداية الزلزال
const T_METEOR = 4.4;      // ظهور النيزك
const T_IMPACT = 7.4;      // ضربة النيزك
const T_ICON = 9.2;        // نزول الأيقونة
const T_LAND = 12.6;       // وصول الأيقونة للأرض
const T_RETURN = 22.6;     // نهاية الحفر + رجوع الأزرار

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ramp = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

type Lift = { userId?: string; name?: string; avatarUrl?: string | null };
function readLift(): Lift | null {
  try {
    const v = (window as unknown as { __stooornaGiftLift?: Lift }).__stooornaGiftLift;
    return v || null;
  } catch {
    return null;
  }
}

// ── حلقة السنون الحديدية (تستخدم بالأنميشن وبمربع الهدية) ─────────────────
const SPIKE_ANGLES = Array.from({ length: 16 }, (_, i) => i * 22.5);
function SpikeRing({ id }: { id: string }): React.ReactElement {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-iron`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f1f5f9" />
          <stop offset="0.45" stopColor="#8a94a6" />
          <stop offset="1" stopColor="#363c48" />
        </linearGradient>
      </defs>
      {SPIKE_ANGLES.map(a => (
        <polygon
          key={a}
          points="-8,-95 0,-121 8,-95"
          transform={`rotate(${a})`}
          fill={`url(#${id}-iron)`}
          stroke="#1b1f27"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      ))}
      <circle r="94" fill="none" stroke={`url(#${id}-iron)`} strokeWidth="10" />
      <circle r="88" fill="none" stroke="#3db5d4" strokeWidth="3" />
    </>
  );
}

// ── مربع الهدية قبل النقر: نيزك ينزل + أيقونة بسنون تدور + مطر ───────────
function MeteorPreview({ size = 70 }: { size?: number }) {
  return (
    <span aria-hidden="true" style={{ display: 'inline-block', width: size, height: size, position: 'relative' }}>
      <style>{`
        @keyframes mtp-fall { 0% { transform: translate(-34px,-40px); opacity: 0 } 12% { opacity: 1 } 62% { transform: translate(22px,20px); opacity: 1 } 70%,100% { transform: translate(26px,24px); opacity: 0 } }
        @keyframes mtp-spin { to { transform: rotate(360deg) } }
        @keyframes mtp-rain { from { transform: translate(0,-10px) } to { transform: translate(-6px,100px) } }
        @keyframes mtp-flash { 0%,60%,100% { opacity: 0 } 66% { opacity: .75 } 74% { opacity: .1 } 80% { opacity: .5 } }
      `}</style>
      <svg viewBox="0 0 100 100" width={size} height={size} style={{ display: 'block', overflow: 'hidden', borderRadius: size * 0.22 }}>
        <defs>
          <linearGradient id="mtp-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#b3180d" />
            <stop offset="0.5" stopColor="#4b0806" />
            <stop offset="1" stopColor="#0b0203" />
          </linearGradient>
          <radialGradient id="mtp-fire">
            <stop offset="0" stopColor="#fffbe6" />
            <stop offset="0.4" stopColor="#ffb938" />
            <stop offset="1" stopColor="#ff3c0a" stopOpacity="0" />
          </radialGradient>
          <clipPath id="mtp-clip"><circle r="87" /></clipPath>
        </defs>
        <rect width="100" height="100" fill="url(#mtp-bg)" />
        <g stroke="#9fb4ff" strokeOpacity="0.55" strokeWidth="0.9" style={{ animation: 'mtp-rain 0.7s linear infinite' }}>
          {[8, 24, 40, 58, 74, 90].map(x => <line key={x} x1={x} y1={-4} x2={x - 3} y2={6} />)}
          {[16, 32, 50, 66, 82].map(x => <line key={x} x1={x} y1={-34} x2={x - 3} y2={-24} />)}
        </g>
        <rect width="100" height="100" fill="#fff" style={{ animation: 'mtp-flash 3.2s linear infinite', opacity: 0 }} />
        <g transform="translate(50 76) scale(0.2)">
          <g style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'mtp-spin 1.8s linear infinite' }}>
            <image href={METEOR_APP_ICON} x="-87" y="-87" width="174" height="174" clipPath="url(#mtp-clip)" />
            <SpikeRing id="mtp" />
          </g>
        </g>
        <g style={{ animation: 'mtp-fall 3.2s ease-in infinite' }}>
          <path d="M 20 22 L 8 6 L 24 18 Z" fill="#ff7a1f" opacity="0.75" />
          <circle cx="24" cy="26" r="14" fill="url(#mtp-fire)" />
          <circle cx="24" cy="26" r="6" fill="#2a1208" />
        </g>
      </svg>
    </span>
  );
}

// ── الأنميشن الكامل ──────────────────────────────────────────────────────
type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; w: number; c: number };
type Chunk = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; s: number; life: number; max: number };
type Ball = { x: number; y: number; max: number; age: number; life: number };
type Ring = { x: number; y: number; age: number; life: number };
type Crack = { pts: [number, number][]; t0: number };
type Tr = { el: HTMLElement; ph: number; big: boolean; cx: number; cy: number; fx: number; fy: number; fr: number; arc: number; pT: string; pR: string };

const SPARK_COLORS = ['255,140,30', '255,210,80', '255,255,235', '255,70,20'];

function MeteorAnimation({ onDone }: { onDone: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const darkRef = useRef<HTMLDivElement>(null);
  const skyRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<SVGImageElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const [lift] = useState<Lift | null>(readLift);

  useEffect(() => {
    const root = rootRef.current;
    const cv = canvasRef.current;
    const ic = iconRef.current;
    const dk = darkRef.current;
    const sk = skyRef.current;
    const fl = flashRef.current;
    const g = cv ? cv.getContext('2d') : null;
    if (!root || !cv || !ic || !dk || !sk || !fl || !g) { doneRef.current(); return; }
    const av = avatarRef.current;
    const imgEl = imgRef.current;
    const isUser = !!lift;
    const sounds = createMeteorSounds();

    let W = 0, H = 0, D = 240, S = 300, AV = 200, F = 150;
    const resize = () => {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      W = window.innerWidth; H = window.innerHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      D = Math.max(170, Math.min(W * 0.62, H * 0.34, 300));
      S = D * 1.25;
      AV = D * 0.9;
      F = Math.min(170, W * 0.4);
      ic.style.width = `${S}px`;
      ic.style.height = `${S}px`;
      if (av) { av.style.width = `${AV}px`; av.style.height = `${AV}px`; av.style.fontSize = `${AV * 0.45}px`; }
    };
    resize();
    window.addEventListener('resize', resize);

    // ── عناصر الواجهة اللي تهتز وتتطاير (أزرار + صور + فيديو) ─────────────
    const tracked: Tr[] = [];
    try {
      const list = Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"], img, video, [data-gift-user]'))
        .filter(el => !root.contains(el));
      for (const el of list) {
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) continue;
        if (list.some(o => o !== el && o.contains(el))) continue; // الأعلى فقط
        tracked.push({
          el, ph: Math.random() * 6.28, big: r.width > W * 0.7 && r.height > H * 0.5,
          cx: r.left + r.width / 2, cy: r.top + r.height / 2, fx: 0, fy: 0, fr: 0, arc: rnd(40, 120),
          pT: el.style.getPropertyValue('translate'), pR: el.style.getPropertyValue('rotate'),
        });
        if (tracked.length >= 90) break;
      }
    } catch { /* ignore */ }
    const liftEl = isUser ? document.querySelector<HTMLElement>('[data-gift-lift="1"]') : null;
    const liftPrevOpacity = liftEl ? liftEl.style.opacity : '';
    let liftHidden = false;

    // ── جسيمات ────────────────────────────────────────────────────────────
    let sparks: Spark[] = [];
    let chunks: Chunk[] = [];
    let balls: Ball[] = [];
    let rings: Ring[] = [];
    const cracks: Crack[] = [];
    const drops = Array.from({ length: 170 }, () => ({ x: rnd(-0.2, 1), y: Math.random(), l: rnd(12, 26), v: rnd(0.9, 1.5) }));
    const rockNoise = Array.from({ length: 10 }, () => rnd(0.78, 1));
    let bolt: { pts: [number, number][]; t0: number } | null = null;
    let nextBolt = 1.4;
    let flashA = 0;
    let impactFlash = 0;
    let impulse = 0;
    let impacted = false;
    let landed = false;
    let whooshed = false;
    let nextBoom = T_LAND + 1.2;
    let rot = 0;

    const addSpark = (x: number, y: number, vx: number, vy: number, max: number, w: number, c: number) => {
      if (sparks.length < 650) sparks.push({ x, y, vx, vy, life: 0, max, w, c });
    };
    const burst = (x: number, y: number, n: number, speed: number, up = 0) => {
      for (let i = 0; i < n; i++) {
        const a = rnd(0, Math.PI * 2);
        const s = rnd(0.2, 1) * speed;
        addSpark(x, y, Math.cos(a) * s, Math.sin(a) * s - up, rnd(0.5, 1.4), rnd(1.2, 3.2), (Math.random() * 4) | 0);
      }
    };
    const addChunks = (x: number, y: number, n: number, speed: number) => {
      for (let i = 0; i < n; i++) {
        const a = rnd(Math.PI * 1.05, Math.PI * 1.95);
        const s = rnd(0.3, 1) * speed;
        chunks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, rot: rnd(0, 6), vr: rnd(-9, 9), s: rnd(5, 15), life: 0, max: rnd(1.4, 2.6) });
      }
    };
    const explode = (x: number, y: number, size: number, power: number) => {
      balls.push({ x, y, max: size, age: 0, life: 0.9 });
      burst(x, y, 34, 520 * power, 120);
      addChunks(x, y, 7, 620 * power);
      impulse += 14 * power;
      sounds.explosion(power);
    };
    const addCracks = (x: number, y: number, n: number, reach: number, t0: number) => {
      for (let i = 0; i < n; i++) {
        let a = (i / n) * Math.PI * 2 + rnd(-0.2, 0.2);
        const len = rnd(0.12, 1) * reach * Math.max(W, H);
        const segs = 8;
        const pts: [number, number][] = [[x, y]];
        let cx = x, cy = y;
        for (let k = 0; k < segs; k++) {
          a += rnd(-0.38, 0.38);
          cx += Math.cos(a) * (len / segs);
          cy += Math.sin(a) * (len / segs) * 0.85;
          pts.push([cx, cy]);
        }
        cracks.push({ pts, t0 });
      }
    };

    const ix = () => W * 0.5;
    const iy = () => H * 0.56;

    // ── لحظة ضربة النيزك: تطيّر الأزرار ───────────────────────────────────
    const scatter = () => {
      for (const o of tracked) {
        if (o.big) continue;
        let dx = o.cx - ix(), dy = o.cy - iy();
        const d = Math.hypot(dx, dy) || 1;
        dx /= d; dy /= d;
        const dist = (160 + Math.random() * 320) * (1 + (1 - clamp(d / H)) * 0.8);
        o.fx = dx * dist; o.fy = dy * dist - 40; o.fr = (Math.random() - 0.5) * 420;
      }
    };

    // ── مؤثرات الإطار الواحد ──────────────────────────────────────────────
    const drawMeteor = (p: number, dt: number) => {
      const sx = W * 0.08, sy = -H * 0.1, ex = ix(), ey = iy();
      const pos = (q: number) => ({ x: sx + (ex - sx) * q, y: sy + (ey - sy) * q });
      const rad = (q: number) => 8 + (Math.min(W * 0.2, 130) - 8) * Math.pow(q, 1.6);
      g.globalCompositeOperation = 'lighter';
      for (let k = 26; k >= 1; k--) {
        const q = Math.max(0, p - k * 0.012);
        const pt = pos(q);
        const r = rad(q) * (1 - k / 30);
        g.fillStyle = `rgba(255,${100 + Math.round((1 - k / 27) * 100)},30,${(1 - k / 27) * 0.5})`;
        g.beginPath(); g.arc(pt.x, pt.y, Math.max(1, r), 0, Math.PI * 2); g.fill();
      }
      const h = pos(p);
      const r = rad(p);
      const gr = g.createRadialGradient(h.x, h.y, r * 0.1, h.x, h.y, r * 1.9);
      gr.addColorStop(0, 'rgba(255,255,230,1)');
      gr.addColorStop(0.35, 'rgba(255,190,70,0.95)');
      gr.addColorStop(0.7, 'rgba(255,80,20,0.5)');
      gr.addColorStop(1, 'rgba(255,40,10,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(h.x, h.y, r * 1.9, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#2a1208';
      g.strokeStyle = 'rgba(255,150,40,0.85)';
      g.lineWidth = Math.max(1, r * 0.08);
      g.beginPath();
      rockNoise.forEach((n, i) => {
        const a = (i / rockNoise.length) * Math.PI * 2 + p * 5;
        const px = h.x + Math.cos(a) * r * 0.85 * n, py = h.y + Math.sin(a) * r * 0.85 * n;
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      });
      g.closePath(); g.fill(); g.stroke();
      // جمرات خلف النيزك
      const dx = ex - sx, dy = ey - sy, dl = Math.hypot(dx, dy) || 1;
      for (let i = 0; i < Math.max(2, Math.round(dt * 160)); i++) {
        addSpark(h.x + rnd(-r, r) * 0.5, h.y + rnd(-r, r) * 0.5, -dx / dl * rnd(80, 320) + rnd(-70, 70), -dy / dl * rnd(80, 320) + rnd(-70, 70), rnd(0.4, 0.9), rnd(1.5, 3.4), (Math.random() * 4) | 0);
      }
    };

    // ── الحلقة الرئيسية ───────────────────────────────────────────────────
    let raf = 0;
    let ended = false;
    let lastSnd = 0;
    const t0 = performance.now();
    let last = t0;

    const cleanup = () => {
      if (ended) return;
      ended = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      for (const o of tracked) {
        if (o.pT) o.el.style.setProperty('translate', o.pT); else o.el.style.removeProperty('translate');
        if (o.pR) o.el.style.setProperty('rotate', o.pR); else o.el.style.removeProperty('rotate');
      }
      if (liftEl && liftHidden) liftEl.style.opacity = liftPrevOpacity;
      sounds.stop();
    };

    const frame = (now: number) => {
      if (ended) return;
      const t = (now - t0) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (t >= DURATION) { cleanup(); doneRef.current(); return; }

      const fade = 1 - ramp(t, 22.8, DURATION);
      const landY = H * 0.6, sunkY = H * 0.8, topY = H * 0.22;
      const showHost = !isUser;

      // أحداث لمرة وحدة
      if (!whooshed && t >= T_METEOR) { whooshed = true; sounds.whoosh(T_IMPACT - T_METEOR); }
      if (!impacted && t >= T_IMPACT) {
        impacted = true;
        impactFlash = 1; impulse += 34;
        rings.push({ x: ix(), y: iy(), age: 0, life: 1.4 }, { x: ix(), y: iy(), age: -0.2, life: 1.6 }, { x: ix(), y: iy(), age: -0.45, life: 1.8 });
        balls.push({ x: ix(), y: iy(), max: W * 0.75, age: 0, life: 1.2 });
        burst(ix(), iy(), 110, 900, 200);
        addChunks(ix(), iy(), 36, 900);
        addCracks(ix(), iy(), 16, 0.5, t);
        scatter();
        sounds.impact();
      }
      if (!landed && t >= T_LAND) {
        landed = true;
        const lx = W / 2, ly = landY + D * 0.45;
        impulse += 26; impactFlash = Math.max(impactFlash, 0.55);
        rings.push({ x: lx, y: ly, age: 0, life: 1.1 });
        balls.push({ x: lx, y: ly, max: W * 0.55, age: 0, life: 1 });
        burst(lx, ly, 90, 760, 160);
        addChunks(lx, ly, 22, 760);
        addCracks(lx, ly, 12, 0.42, t);
        sounds.explosion(1.4);
      }
      if (t >= nextBoom && t < (isUser ? 17 : T_RETURN - 0.4)) {
        explode(W * rnd(0.15, 0.85), H * rnd(0.45, 0.9), rnd(0.2, 0.38) * W, isUser ? 0.7 : 1);
        nextBoom += rnd(1.1, 2.0);
      }
      if (t > 1.2 && t < 22.5 && t >= nextBolt) {
        const x0 = rnd(0.1, 0.9) * W, yEnd = rnd(0.35, 0.7) * H;
        const pts: [number, number][] = [[x0, -10]];
        let bx = x0;
        for (let i = 1; i <= 12; i++) { bx += rnd(-45, 45); pts.push([bx, (yEnd * i) / 12]); }
        bolt = { pts, t0: t };
        flashA = 0.55;
        nextBolt = t + rnd(1.3, 3.4);
        sounds.thunder(rnd(0.2, 0.7));
      }
      impulse *= Math.exp(-dt * 3.2);
      flashA *= Math.exp(-dt * 7);
      impactFlash *= Math.exp(-dt * 3.5);

      // اهتزاز الأرض
      let base = 0;
      if (t < T_QUAKE) base = 0;
      else if (t < T_IMPACT) base = 1 + 8 * ramp(t, T_QUAKE, T_IMPACT - 0.4);
      else if (t < T_ICON) base = 3 + 12 * (1 - ramp(t, T_IMPACT, T_ICON));
      else if (t < T_LAND) base = 3 + 4 * ramp(t, T_ICON, T_LAND);
      else if (isUser) base = 6 * (1 - ramp(t, T_LAND, T_LAND + 2));
      else base = 6;
      base *= 1 - ramp(t, T_RETURN, 24.2);
      const amp = base + impulse;

      // طبقات الظلام والسماء
      dk.style.opacity = String(0.82 * ramp(t, 0, 1.6) * fade);
      sk.style.opacity = String(ramp(t, 0.6, 3) * (1 - ramp(t, 22.5, DURATION)));
      fl.style.opacity = String(clamp(impactFlash));

      // عناصر البث (اهتزاز + تطاير)
      const p = ramp(t, T_IMPACT, T_IMPACT + 0.9);
      const e = easeOut(p);
      const back = 1 - easeInOut(ramp(t, T_RETURN, T_RETURN + 1.2));
      for (const o of tracked) {
        const a = amp * (o.big ? 0.45 : 1);
        let x = (Math.sin(t * 47 + o.ph) + Math.sin(t * 29 + o.ph * 2.3)) * 0.5 * a;
        let y = (Math.sin(t * 41 + o.ph * 1.7) + Math.sin(t * 33 + o.ph * 0.6)) * 0.5 * a;
        let r = 0;
        if (t >= T_IMPACT && !o.big) {
          x += o.fx * e * back;
          y += (o.fy * e - Math.sin(Math.PI * p) * o.arc) * back;
          r = o.fr * e * back;
        }
        o.el.style.setProperty('translate', `${x.toFixed(1)}px ${y.toFixed(1)}px`);
        o.el.style.setProperty('rotate', `${r.toFixed(1)}deg`);
      }

      // ── الأيقونة ──
      let cx = W / 2, cy = -S, sc = 1, iconA = 0, imgA = 1, avA = 0;
      const ringD = () => D * sc;
      if (t >= T_ICON) {
        iconA = 1;
        if (t < T_LAND) {
          const q = ramp(t, T_ICON, T_LAND);
          cy = -S * 0.7 + (landY + S * 0.7) * q * q;
          cx = W / 2 + Math.sin(q * 6) * W * 0.03 * (1 - q);
          rot += dt * (360 + 400 * q);
        } else if (showHost) {
          const q = ramp(t, T_LAND, T_RETURN);
          cy = landY + (sunkY - landY) * q + Math.sin(t * 60) * 3;
          cx = W / 2 + Math.sin(t * 53) * 3;
          rot += dt * 900;
          if (t >= T_RETURN) cy += ramp(t, T_RETURN, DURATION) * S * 0.9;
          iconA = 1 - ramp(t, 23.8, DURATION);
        } else {
          const q1 = easeInOut(ramp(t, T_LAND, T_LAND + 1.4));
          sc = 1 + (F / D - 1) * q1;
          imgA = 1 - q1; avA = q1;
          const q2 = easeInOut(ramp(t, T_LAND + 1.4, 19.5));
          cy = landY + (topY - landY) * q2 + (q2 >= 1 ? Math.sin(t * 2) * 6 : 0);
          rot += dt * (900 - 860 * q1);
          iconA = 1 - ramp(t, 23.5, DURATION);
          avA *= iconA;
          if (liftEl && !liftHidden && t >= T_LAND + 0.6) { liftEl.style.opacity = '0'; liftHidden = true; }
        }
      }
      ic.style.opacity = String(clamp(iconA));
      ic.style.transform = `translate3d(${(cx - S / 2).toFixed(1)}px, ${(cy - S / 2).toFixed(1)}px, 0) rotate(${rot.toFixed(1)}deg) scale(${sc.toFixed(3)})`;
      if (imgEl) imgEl.setAttribute('opacity', String(clamp(imgA)));
      if (av) {
        av.style.opacity = String(clamp(avA));
        av.style.transform = `translate3d(${(cx - AV / 2).toFixed(1)}px, ${(cy - AV / 2).toFixed(1)}px, 0) scale(${sc.toFixed(3)})`;
      }

      // انبعاث الشرار من الأيقونة
      if (t >= T_ICON && iconA > 0.05) {
        const R = D * 0.55;
        if (t < T_LAND) {
          for (let i = 0; i < 4; i++) {
            const a = rnd(0, Math.PI * 2);
            addSpark(cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9, rnd(-60, 60), -rnd(120, 360), rnd(0.4, 0.9), rnd(1.5, 3.2), (Math.random() * 4) | 0);
          }
        } else if (showHost && t < T_RETURN + 0.6) {
          for (let i = 0; i < 12; i++) {
            const a = rnd(0.15 * Math.PI, 0.85 * Math.PI);
            addSpark(cx + Math.cos(a) * R, cy + Math.sin(a) * R, Math.cos(a) * rnd(150, 520) + rnd(-80, 80), -rnd(120, 520), rnd(0.4, 1), rnd(1.2, 3.4), (Math.random() * 4) | 0);
          }
          if (Math.random() < 0.25) addChunks(cx + rnd(-R, R), cy + R * 0.8, 1, 420);
        } else if (isUser && t >= T_LAND + 0.8) {
          const Rr = ringD() * 0.56;
          for (let i = 0; i < 5; i++) {
            const a = rnd(0, Math.PI * 2);
            addSpark(cx + Math.cos(a) * Rr, cy + Math.sin(a) * Rr, Math.cos(a) * rnd(10, 60) + rnd(-20, 20), Math.sin(a) * rnd(10, 50) - rnd(60, 200), rnd(0.5, 1.1), rnd(1.4, 3.4), [0, 1, 3, 0][(Math.random() * 4) | 0]);
          }
        }
      }
      // جمرات حمراء تطلع من الأسفل (جو عام)
      if (t > 2 && t < 23 && Math.random() < 0.6) addSpark(rnd(0, W), H + 5, rnd(-30, 30), -rnd(80, 220), rnd(1.2, 2.4), rnd(1, 2.2), 3);

      // ── رسم الكانفس ──
      g.clearRect(0, 0, W, H);

      // شقوق الأرض المتوهجة
      if (cracks.length) {
        g.globalCompositeOperation = 'lighter';
        g.lineCap = 'round'; g.lineJoin = 'round';
        const ca = 1 - ramp(t, 21, 24);
        cracks.forEach((c, i) => {
          const gr = clamp((t - c.t0) * 1.4);
          const n = Math.max(1, Math.floor((c.pts.length - 1) * gr));
          const al = (0.7 + 0.3 * Math.sin(t * 5 + i)) * ca;
          if (al <= 0.01) return;
          for (let pass = 0; pass < 2; pass++) {
            g.strokeStyle = pass === 0 ? `rgba(255,110,25,${al * 0.8})` : `rgba(255,235,170,${al})`;
            g.lineWidth = pass === 0 ? 4 : 1.4;
            g.beginPath();
            g.moveTo(c.pts[0][0], c.pts[0][1]);
            for (let k = 1; k <= n; k++) g.lineTo(c.pts[k][0], c.pts[k][1]);
            g.stroke();
          }
        });
        g.globalCompositeOperation = 'source-over';
      }
      // توهج الحفرة بعد الضربة
      if (t >= T_IMPACT) {
        const ga = (0.55 + 0.1 * Math.sin(t * 6)) * ramp(t, T_IMPACT, T_IMPACT + 1) * (1 - ramp(t, 20, 23));
        if (ga > 0.01) {
          g.globalCompositeOperation = 'lighter';
          const gr = g.createRadialGradient(ix(), iy(), 0, ix(), iy(), W * 0.5);
          gr.addColorStop(0, `rgba(255,120,20,${ga})`); gr.addColorStop(1, 'rgba(255,60,10,0)');
          g.fillStyle = gr; g.fillRect(0, 0, W, H);
          g.globalCompositeOperation = 'source-over';
        }
      }
      // وهج الأيقونة (حرارة الحفر / نار الإطار)
      if (t >= T_ICON && iconA > 0.05) {
        g.globalCompositeOperation = 'lighter';
        const gy = showHost && t >= T_LAND ? cy + D * 0.35 : cy;
        const rr = D * (isUser && t >= T_LAND ? sc : 1) * 0.95;
        const gr = g.createRadialGradient(cx, gy, rr * 0.2, cx, gy, rr);
        gr.addColorStop(0, `rgba(255,120,30,${0.5 * iconA})`); gr.addColorStop(1, 'rgba(255,60,10,0)');
        g.fillStyle = gr; g.fillRect(cx - rr, gy - rr, rr * 2, rr * 2);
        g.globalCompositeOperation = 'source-over';
      }
      // النيزك
      if (t >= T_METEOR && t < T_IMPACT + 0.06) drawMeteor(ramp(t, T_METEOR, T_IMPACT), dt);

      // كرات النار + موجات الصدمة
      g.globalCompositeOperation = 'lighter';
      balls = balls.filter(b => (b.age += dt) < b.life);
      for (const b of balls) {
        const q = b.age / b.life, r = Math.max(2, b.max * easeOut(q)), a = 1 - q;
        const gr = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
        gr.addColorStop(0, `rgba(255,235,170,${a})`); gr.addColorStop(0.45, `rgba(255,120,30,${a * 0.7})`); gr.addColorStop(1, 'rgba(255,50,10,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(b.x, b.y, r, 0, Math.PI * 2); g.fill();
      }
      rings = rings.filter(r => (r.age += dt) < r.life);
      for (const r of rings) {
        if (r.age < 0) continue;
        const q = r.age / r.life;
        g.strokeStyle = `rgba(255,205,150,${(1 - q) * 0.7})`;
        g.lineWidth = 6 * (1 - q) + 1;
        g.beginPath(); g.arc(r.x, r.y, easeOut(q) * W * 0.9, 0, Math.PI * 2); g.stroke();
      }
      g.globalCompositeOperation = 'source-over';

      // قطع الصخر
      chunks = chunks.filter(c => (c.life += dt) < c.max && c.y < H + 40);
      for (const c of chunks) {
        c.vy += 1400 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt;
        g.save(); g.translate(c.x, c.y); g.rotate(c.rot);
        g.globalAlpha = clamp(2 - c.life / c.max * 2 + 0.2);
        g.fillStyle = '#1d1410'; g.fillRect(-c.s / 2, -c.s / 3, c.s, c.s * 0.66);
        g.strokeStyle = 'rgba(255,130,40,0.8)'; g.lineWidth = 1; g.strokeRect(-c.s / 2, -c.s / 3, c.s, c.s * 0.66);
        g.restore();
      }
      g.globalAlpha = 1;

      // الشرار
      g.globalCompositeOperation = 'lighter';
      g.lineCap = 'round';
      sparks = sparks.filter(s => (s.life += dt) < s.max);
      for (const s of sparks) {
        s.vy += 900 * dt; s.vx *= 1 - dt * 0.8; s.x += s.vx * dt; s.y += s.vy * dt;
        g.strokeStyle = `rgba(${SPARK_COLORS[s.c]},${1 - s.life / s.max})`;
        g.lineWidth = s.w;
        g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(s.x - s.vx * 0.04, s.y - s.vy * 0.04); g.stroke();
      }
      g.globalCompositeOperation = 'source-over';

      // مطر
      const rainI = ramp(t, 0.3, 3) * (1 - ramp(t, 23, DURATION));
      if (rainI > 0.01) {
        g.strokeStyle = 'rgba(175,195,255,0.5)'; g.lineWidth = 1.2;
        g.beginPath();
        const cnt = Math.round(drops.length * rainI);
        for (let i = 0; i < cnt; i++) {
          const d = drops[i];
          d.y += d.v * dt * 1.6; d.x -= dt * 0.18;
          if (d.y > 1.05) { d.y = -0.05; d.x = rnd(-0.2, 1); }
          if (d.x < -0.25) d.x = 1;
          g.moveTo(d.x * W, d.y * H); g.lineTo(d.x * W - d.l * 0.25, d.y * H + d.l);
        }
        g.stroke();
      }
      // برق
      if (bolt && t - bolt.t0 < 0.22) {
        const a = 1 - (t - bolt.t0) / 0.22;
        g.globalCompositeOperation = 'lighter';
        for (let pass = 0; pass < 2; pass++) {
          g.strokeStyle = pass === 0 ? `rgba(140,170,255,${a * 0.5})` : `rgba(255,255,255,${a})`;
          g.lineWidth = pass === 0 ? 7 : 2;
          g.beginPath();
          bolt.pts.forEach(([x, y], i) => { if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); });
          g.stroke();
        }
        g.globalCompositeOperation = 'source-over';
      }
      if (flashA > 0.01) { g.fillStyle = `rgba(220,230,255,${flashA * 0.5})`; g.fillRect(0, 0, W, H); }

      // الأصوات (كل ~100ms)
      if (now - lastSnd > 100) {
        lastSnd = now;
        const drill = showHost && t >= T_LAND && t < T_RETURN + 0.6
          ? ramp(t, T_LAND, T_LAND + 0.6) * (1 - ramp(t, T_RETURN, T_RETURN + 0.6))
          : (t >= T_ICON && t < T_LAND ? 0.3 : 0);
        sounds.update({
          wind: ramp(t, 0, 2) * fade,
          rain: rainI,
          rumble: clamp(amp / 18) * fade,
          drill,
        });
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const avatarBg = lift?.avatarUrl ? `url("${String(lift.avatarUrl).replace(/"/g, '%22')}")` : undefined;
  return (
    <div ref={rootRef} aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 9400, pointerEvents: 'none', overflow: 'hidden' }}>
      <div ref={darkRef} style={{ position: 'absolute', inset: 0, background: '#000', opacity: 0 }} />
      <div
        ref={skyRef}
        style={{ position: 'absolute', inset: 0, opacity: 0, background: 'linear-gradient(180deg, rgba(200,24,10,0.9) 0%, rgba(120,10,10,0.6) 36%, rgba(30,0,0,0) 78%)' }}
      />
      <canvas ref={canvasRef} style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' }} />
      {lift ? (
        <div
          ref={avatarRef}
          style={{
            position: 'absolute', left: 0, top: 0, borderRadius: '50%', opacity: 0, willChange: 'transform',
            background: '#222', backgroundImage: avatarBg, backgroundSize: 'cover', backgroundPosition: 'center',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900,
          }}
        >
          {lift.avatarUrl ? null : (lift.name || '?').trim().charAt(0).toUpperCase()}
        </div>
      ) : null}
      <div ref={iconRef} style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, opacity: 0, willChange: 'transform' }}>
        <svg viewBox="-120 -120 240 240" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
          <defs><clipPath id="mtr-clip"><circle r="87" /></clipPath></defs>
          <image ref={imgRef} href={METEOR_APP_ICON} x="-87" y="-87" width="174" height="174" clipPath="url(#mtr-clip)" />
          <SpikeRing id="mtr" />
        </svg>
      </div>
      <div ref={flashRef} style={{ position: 'absolute', inset: 0, background: '#fff', opacity: 0 }} />
    </div>
  );
}

const def = {
  id: 'meteor',
  name: 'Meteor',
  price: 15000,
  Preview: MeteorPreview,
  Animation: MeteorAnimation,
};

// GiftDefinition معرّف بـ lib/types — الحقول اللي يستخدمها LiveCoinsDock: id, name, price, Preview, Animation
export const MeteorGift = def as unknown as GiftDefinition;
export default MeteorGift;
