/**
 * هدية الأسد الناري — 15,000 Coins
 *
 * التسلسل:
 *  1) بداية (~3s): سماء حمراء + مطر خفيف يتساقط على البث + برق ورعد + جمرات (Canvas + Web Audio)
 *  2) الفيديو (public/gifts/fire-lion.mp4 — 1080×1920) يدخل ملء الشاشة بدون أي أزرار تشغيل/إيقاف
 *     ويشتغل صوته الأصلي كاملاً تلقائياً مع بدايته (مع فيديو الأسد نفسه — ما فيه كتم ولا تعديل بصوته)
 *  3) للمضيف (لما المستخدم يدعمه): تنتهي الهدية بنهاية الفيديو
 *     لمستخدم (لما المضيف يعطيه): بعد الفيديو إطار صورته يصعد للأعلى ويتحول إطاره لنار ثم ينفجر ويختفي
 *
 * تحديد المستلم: نفس آلية بقية الهدايا — window.__stooornaGiftLift (يضبطها LiveCoinsDock) +
 * العنصر [data-gift-lift] لمكان صورته الفعلي.
 *
 * الأصوات: src/lib/fireLionSounds.ts (مطر/رعد بداية الهدية فقط)
 */
import React, { useEffect, useRef, useState } from 'react';
import type { GiftDefinition } from '@/lib/types';
import { LIGHTNING_AT_MS, startFireLionIntroSounds } from '@/lib/fireLionSounds';

const BASE: string =
  ((import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) || '/';
const VIDEO_SRC = `${BASE}gifts/fire-lion.mp4`;
const THUMB_SRC = `${BASE}gifts/fire-lion-thumb.jpg`;

const INTRO_MS = 3000;          // مدة السماء الحمراء/المطر/البرق قبل الفيديو
const INTRO_WAIT_MAX_MS = 2500; // أقصى انتظار إضافي لو الفيديو لسا ما تحمّل
const VIDEO_MS = 18900;         // مدة الفيديو
const VIDEO_FADE_MS = 600;
const RISE_MS = 5200;           // مدة صعود إطار المستخدم

type Lift = { userId: string; name: string; avatarUrl: string | null };

function readLift(): Lift | null {
  try {
    const w = window as unknown as { __stooornaGiftLift?: Lift };
    return w.__stooornaGiftLift ?? null;
  } catch {
    return null;
  }
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// سبرايت نار ناعم (يُرسم مرة وحدة بدل gradient لكل جسيم)
function makeSprite(inner: string, mid: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.35, mid);
    grad.addColorStop(1, 'rgba(255,40,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  return c;
}

type Particle = { x: number; y: number; vx: number; vy: number; age: number; max: number; size: number; a: number };
type Bolt = { pts: [number, number][]; branch: [number, number][]; born: number };
type Drop = { x: number; y: number; l: number; s: number };

function makeBolt(w: number, h: number, born: number): Bolt {
  const pts: [number, number][] = [];
  let x = w * (0.15 + Math.random() * 0.7);
  let y = 0;
  pts.push([x, y]);
  const endY = h * (0.42 + Math.random() * 0.22);
  while (y < endY) {
    y += h * (0.035 + Math.random() * 0.05);
    x += (Math.random() - 0.5) * w * 0.13;
    pts.push([x, y]);
  }
  const bi = Math.max(1, Math.floor(pts.length * (0.3 + Math.random() * 0.3)));
  const branch: [number, number][] = [pts[bi]];
  let bx = pts[bi][0];
  let by = pts[bi][1];
  const dir = Math.random() < 0.5 ? -1 : 1;
  for (let i = 0; i < 4; i++) {
    by += h * (0.03 + Math.random() * 0.03);
    bx += dir * w * (0.03 + Math.random() * 0.05);
    branch.push([bx, by]);
  }
  return { pts, branch, born };
}

function FireLionAnimation({ onDone }: { onDone: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const skyRef = useRef<HTMLDivElement | null>(null);
  const avatarRef = useRef<HTMLDivElement | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const [lift] = useState<Lift | null>(() => readLift());
  const [videoVisible, setVideoVisible] = useState(false);
  const [rising, setRising] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas ? canvas.getContext('2d') : null;
    if (!canvas || !ctx) { onDoneRef.current(); return; }

    let raf = 0;
    let finished = false;
    let disposed = false;
    const timers: number[] = [];
    const cleanups: Array<() => void> = [];

    let w = window.innerWidth;
    let h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    cleanups.push(() => window.removeEventListener('resize', resize));

    const sprites = [
      makeSprite('rgba(255,250,200,1)', 'rgba(255,200,60,0.85)'),
      makeSprite('rgba(255,200,80,1)', 'rgba(255,120,20,0.8)'),
      makeSprite('rgba(255,110,40,0.9)', 'rgba(200,30,0,0.6)'),
    ];

    // ── أصوات البداية (المطر/الرعد) ──
    const sounds = startFireLionIntroSounds();
    cleanups.push(() => sounds.stop());

    // ── الفيديو ──
    const v = videoRef.current;
    let unmuteHandler: (() => void) | null = null;
    const removeUnmute = () => {
      if (!unmuteHandler) return;
      window.removeEventListener('pointerdown', unmuteHandler, true);
      window.removeEventListener('keydown', unmuteHandler, true);
      window.removeEventListener('touchstart', unmuteHandler, true);
      unmuteHandler = null;
    };
    const tryPlay = () => {
      if (!v) return;
      try {
        v.currentTime = 0;
        v.muted = false;
        v.volume = 1;
        const p = v.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            // المتصفح منع التشغيل بالصوت (مستخدم بدون تفاعل سابق): شغّله مكتوم ثم افتح الصوت عند أول لمسة
            try {
              v.muted = true;
              const p2 = v.play();
              if (p2 && typeof p2.catch === 'function') p2.catch(() => { timers.push(window.setTimeout(endVideo, 300)); });
              unmuteHandler = () => { try { v.muted = false; v.volume = 1; } catch { /* ignore */ } removeUnmute(); };
              window.addEventListener('pointerdown', unmuteHandler, true);
              window.addEventListener('keydown', unmuteHandler, true);
              window.addEventListener('touchstart', unmuteHandler, true);
            } catch { /* ignore */ }
          });
        }
      } catch { /* ignore */ }
    };
    cleanups.push(() => {
      removeUnmute();
      if (v) { try { v.pause(); } catch { /* ignore */ } }
    });

    // ── جسيمات ──
    const particles: Particle[] = [];
    const MAX_P = 520;
    const emit = (x: number, y: number, vx: number, vy: number, max: number, size: number, a = 1) => {
      if (particles.length >= MAX_P) return;
      particles.push({ x, y, vx, vy, age: 0, max, size, a });
    };
    const drops: Drop[] = Array.from({ length: 110 }, () => ({
      x: Math.random() * (w + 120),
      y: Math.random() * h,
      l: 10 + Math.random() * 16,
      s: 14 + Math.random() * 10,
    }));
    const bolts: Bolt[] = [];
    const lightningFired = LIGHTNING_AT_MS.map(() => false);

    // ── مراحل ──
    type Stage = 'intro' | 'video' | 'rise' | 'out';
    let stage: Stage = 'intro';
    let videoStartT = -1;
    let riseT0 = 0;
    let burstDone = false;

    // موضع الصعود
    let originEl: HTMLElement | null = null;
    let originPrevVis = '';
    let sx = w / 2, sy = h * 0.78, s0 = 84;
    const restoreOrigin = () => {
      if (originEl) { originEl.style.visibility = originPrevVis; originEl = null; }
    };
    cleanups.push(restoreOrigin);

    const finish = () => {
      if (finished) return;
      finished = true;
      restoreOrigin();
      onDoneRef.current();
    };

    function endVideo() {
      if (stage !== 'video') return;
      setVideoVisible(false);
      if (lift) {
        try {
          const el = document.querySelector<HTMLElement>('[data-gift-lift]');
          if (el) {
            const r = el.getBoundingClientRect();
            if (r.width > 8 && r.height > 8) {
              sx = r.left + r.width / 2;
              sy = r.top + r.height / 2;
              s0 = clamp(Math.min(r.width, r.height), 48, 140);
              originEl = el;
              originPrevVis = el.style.visibility;
              el.style.visibility = 'hidden';
            }
          }
        } catch { /* ignore */ }
        stage = 'rise';
        riseT0 = performance.now();
        setRising(true);
      } else {
        stage = 'out';
        timers.push(window.setTimeout(finish, VIDEO_FADE_MS + 100));
      }
    }

    if (v) {
      const onEnded = () => endVideo();
      const onErr = () => { if (stage === 'video') endVideo(); };
      v.addEventListener('ended', onEnded);
      v.addEventListener('error', onErr);
      cleanups.push(() => { v.removeEventListener('ended', onEnded); v.removeEventListener('error', onErr); });
      try { v.load(); } catch { /* ignore */ }
    }

    // صمّام أمان عام: ما تعلق الهدية أبداً
    timers.push(window.setTimeout(finish, INTRO_MS + INTRO_WAIT_MAX_MS + VIDEO_MS + 4500 + RISE_MS + 2000));

    const start = performance.now();
    let last = start;

    const drawBolt = (b: Bolt, age: number) => {
      const alpha = age < 130 ? 1 : Math.max(0, 1 - (age - 130) / 280);
      if (alpha <= 0) return;
      const strokePath = (pts: [number, number][]) => {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke();
      };
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(255,120,80,1)';
      ctx.shadowBlur = 22;
      ctx.strokeStyle = `rgba(255,140,100,${alpha * 0.55})`;
      ctx.lineWidth = 7;
      strokePath(b.pts);
      ctx.lineWidth = 4;
      strokePath(b.branch);
      ctx.shadowBlur = 8;
      ctx.strokeStyle = `rgba(255,250,245,${alpha})`;
      ctx.lineWidth = 2.4;
      strokePath(b.pts);
      ctx.lineWidth = 1.4;
      strokePath(b.branch);
      ctx.restore();
    };

    const frame = (now: number) => {
      if (disposed || finished) return;
      const dt = clamp(now - last, 1, 50);
      last = now;
      const k = dt / 16.667;
      const t = now - start;

      // ── الانتقال من البداية إلى الفيديو ──
      if (stage === 'intro' && t >= INTRO_MS) {
        const ready = !v || v.readyState >= 3 || !!v.error || t >= INTRO_MS + INTRO_WAIT_MAX_MS;
        if (ready) {
          stage = 'video';
          videoStartT = t;
          setVideoVisible(true);
          sounds.fadeOut(1300);
          if (v && !v.error) {
            tryPlay();
            // احتياط: لو ما انتهى الفيديو بحدثه الطبيعي
            timers.push(window.setTimeout(endVideo, VIDEO_MS + 4000));
          } else {
            timers.push(window.setTimeout(endVideo, 200));
          }
        }
      }

      ctx.clearRect(0, 0, w, h);

      // ── السماء الحمراء ──
      let skyOpacity = 0;
      if (stage === 'intro') {
        skyOpacity = clamp(t / 700, 0, 1);
      } else if (stage === 'video' || stage === 'out') {
        skyOpacity = clamp(1 - (t - videoStartT) / 700, 0, 1);
      } else if (stage === 'rise') {
        const p = clamp((now - riseT0) / RISE_MS, 0, 1);
        skyOpacity = 0.55 * clamp(p / 0.15, 0, 1) * (p > 0.9 ? (1 - p) / 0.1 : 1);
      }
      if (skyRef.current) skyRef.current.style.opacity = String(skyOpacity);

      // ── مطر (بالبداية فقط، يخف مع دخول الفيديو) ──
      const rainAlpha =
        stage === 'intro' ? clamp(t / 500, 0, 1)
          : (stage === 'video' && videoStartT >= 0) ? clamp(1 - (t - videoStartT) / 700, 0, 1)
            : 0;
      if (rainAlpha > 0) {
        ctx.save();
        ctx.strokeStyle = `rgba(255,205,195,${0.38 * rainAlpha})`;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        for (const d of drops) {
          d.y += d.s * k;
          d.x -= d.s * 0.22 * k;
          if (d.y > h + 20) { d.y = -20; d.x = Math.random() * (w + 120); }
          if (d.x < -40) d.x = w + 40;
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x + d.l * 0.22, d.y - d.l);
        }
        ctx.stroke();
        ctx.restore();
      }

      // ── برق ──
      if (stage === 'intro') {
        LIGHTNING_AT_MS.forEach((ms, i) => {
          if (!lightningFired[i] && t >= ms) {
            lightningFired[i] = true;
            bolts.push(makeBolt(w, h, now));
          }
        });
      }
      let flash = 0;
      for (let i = bolts.length - 1; i >= 0; i--) {
        const age = now - bolts[i].born;
        if (age > 450) { bolts.splice(i, 1); continue; }
        drawBolt(bolts[i], age);
        const f = age < 90 ? 1 : age >= 160 && age < 230 ? 0.65 : Math.max(0, 1 - (age - 90) / 300) * 0.5;
        flash = Math.max(flash, f);
      }
      if (flash > 0) {
        ctx.fillStyle = `rgba(255,225,205,${flash * 0.5})`;
        ctx.fillRect(0, 0, w, h);
      }

      // ── جمرات من الأسفل (بالبداية) ──
      if (stage === 'intro' && Math.random() < 0.6 * k) {
        emit(Math.random() * w, h + 10, (Math.random() - 0.5) * 0.8, -(0.8 + Math.random() * 1.6), 2200 + Math.random() * 1500, 9 + Math.random() * 10, 0.8);
      }

      // ── صعود إطار المستخدم + تحوله لنار ──
      if (stage === 'rise') {
        const p = clamp((now - riseT0) / RISE_MS, 0, 1);
        const tx = w / 2;
        const ty = h * 0.3;
        const s1 = Math.min(w * 0.42, 190);
        let cx = sx, cy = sy, size = s0, fire = 0, opacity = 1;

        if (p < 0.16) {
          fire = p / 0.16;
          size = s0 * (1 + 0.15 * fire);
        } else if (p < 0.72) {
          const e = easeInOut((p - 0.16) / 0.56);
          cx = lerp(sx, tx, e) + Math.sin(p * 34) * 7 * (1 - e);
          cy = lerp(sy, ty, e);
          size = lerp(s0 * 1.15, s1, e);
          fire = 1;
        } else {
          cx = tx;
          cy = ty + Math.sin(now / 160) * 4;
          size = s1;
          fire = 1;
          if (p >= 0.84 && !burstDone) {
            burstDone = true;
            for (let i = 0; i < 90; i++) {
              const a = Math.random() * Math.PI * 2;
              const sp = 2 + Math.random() * 6;
              emit(cx, cy, Math.cos(a) * sp, Math.sin(a) * sp - 1, 700 + Math.random() * 700, 14 + Math.random() * 22, 1);
            }
          }
          if (p >= 0.9) {
            const q = (p - 0.9) / 0.1;
            opacity = 1 - q;
            size = s1 * (1 + 0.2 * q);
          }
        }

        // الإطار: يتحول من أبيض لبرتقالي ناري مع وهج متذبذب
        const el = avatarRef.current;
        if (el) {
          const flick = 0.75 + Math.random() * 0.25;
          const r = 255, g = Math.round(lerp(255, 140, fire)), b = Math.round(lerp(255, 20, fire));
          el.style.transform = `translate3d(${cx - 100}px, ${cy - 100}px, 0) scale(${size / 200})`;
          el.style.opacity = String(opacity);
          el.style.borderColor = `rgb(${r},${g},${b})`;
          el.style.boxShadow =
            `0 0 ${Math.round(18 + 34 * fire * flick)}px ${Math.round(4 + 10 * fire)}px rgba(255,${Math.round(lerp(255, 110, fire))},20,${0.35 + 0.5 * fire}),` +
            `0 0 ${Math.round(80 * fire * flick)}px ${Math.round(14 * fire)}px rgba(255,50,0,${0.55 * fire}),` +
            `inset 0 0 ${Math.round(24 * fire)}px rgba(255,120,20,${0.5 * fire})`;
        }

        // ألسنة نار على محيط الإطار
        const R = size / 2;
        const n = Math.round((2 + 7 * fire) * k + (p > 0.16 && p < 0.72 ? 3 : 0));
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const px = cx + Math.cos(a) * R * 0.98;
          const py = cy + Math.sin(a) * R * 0.98;
          emit(
            px, py,
            Math.cos(a) * 0.5 + (Math.random() - 0.5) * 0.8,
            -(1.2 + Math.random() * 2.4) + Math.sin(a) * 0.4,
            450 + Math.random() * 500,
            (R * 0.28) + Math.random() * (R * 0.32),
            0.95 * opacity,
          );
        }

        if (p >= 1) { stage = 'out'; finish(); }
      }

      // ── رسم الجسيمات ──
      if (particles.length) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = particles.length - 1; i >= 0; i--) {
          const q = particles[i];
          q.age += dt;
          if (q.age >= q.max) { particles.splice(i, 1); continue; }
          q.x += q.vx * k;
          q.y += q.vy * k;
          q.vy -= 0.012 * k;
          q.vx *= 0.995;
          const f = q.age / q.max;
          const sp = sprites[f < 0.3 ? 0 : f < 0.65 ? 1 : 2];
          const sz = q.size * (1 - f * 0.45);
          ctx.globalAlpha = clamp((1 - f) * q.a, 0, 1);
          ctx.drawImage(sp, q.x - sz / 2, q.y - sz / 2, sz, sz);
        }
        ctx.restore();
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      timers.forEach(id => window.clearTimeout(id));
      cleanups.forEach(fn => { try { fn(); } catch { /* ignore */ } });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initial = (lift?.name || '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <div
      aria-hidden
      style={{ position: 'fixed', inset: 0, zIndex: 9400, pointerEvents: 'none', overflow: 'hidden' }}
    >
      {/* سماء حمراء */}
      <div
        ref={skyRef}
        style={{
          position: 'absolute', inset: 0, opacity: 0,
          background:
            'radial-gradient(120% 70% at 50% 100%, rgba(255,120,20,0.45) 0%, rgba(255,120,20,0) 60%),' +
            'linear-gradient(180deg, rgba(110,4,6,0.86) 0%, rgba(175,22,10,0.66) 48%, rgba(70,6,8,0.55) 100%)',
        }}
      />

      {/* الفيديو: يدخل كهدية (بدون أزرار تشغيل/إيقاف) — الصوت الأصلي يشتغل كاملاً */}
      <video
        ref={videoRef}
        src={VIDEO_SRC}
        preload="auto"
        playsInline
        controls={false}
        disablePictureInPicture
        disableRemotePlayback
        controlsList="nodownload noremoteplayback nofullscreen"
        onContextMenu={e => e.preventDefault()}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', background: '#000', pointerEvents: 'none',
          opacity: videoVisible ? 1 : 0,
          transition: `opacity ${VIDEO_FADE_MS}ms ease`,
        }}
      />

      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

      {/* إطار المستخدم المدعوم: يصعد للأعلى ويتحول لنار */}
      {lift && rising ? (
        <div
          ref={avatarRef}
          style={{
            position: 'absolute', left: 0, top: 0, width: 200, height: 200, borderRadius: '50%',
            boxSizing: 'border-box', border: '6px solid #fff', overflow: 'hidden',
            background: 'linear-gradient(135deg,#ff7a1a,#b3120a)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 900, fontSize: 84, willChange: 'transform, opacity, box-shadow',
            transformOrigin: 'center center',
          }}
        >
          {lift.avatarUrl ? (
            <img src={lift.avatarUrl} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span>{initial}</span>
          )}
        </div>
      ) : null}
    </div>
  );
}

// مربع الهدية قبل النقر: صورة الأسد بإطار ناري متوهج وجمرات صغيرة صاعدة
const PREVIEW_CSS = `
@keyframes flg-glow{0%,100%{box-shadow:0 0 8px 1px rgba(255,120,20,.65),0 0 18px 3px rgba(255,60,0,.35)}50%{box-shadow:0 0 14px 3px rgba(255,170,40,.85),0 0 28px 6px rgba(255,70,0,.5)}}
@keyframes flg-ember{0%{transform:translateY(0) scale(1);opacity:0}15%{opacity:1}100%{transform:translateY(-34px) scale(.3);opacity:0}}
`;

function FireLionPreview({ size = 70 }: { size?: number }) {
  const s = size;
  const img = Math.round(s * 0.86);
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <style>{PREVIEW_CSS}</style>
      <img
        src={THUMB_SRC}
        alt=""
        draggable={false}
        style={{
          width: img, height: img, borderRadius: '50%', objectFit: 'cover',
          border: '2px solid #ff8a1f', animation: 'flg-glow 1.4s ease-in-out infinite',
        }}
      />
      {[0, 1, 2, 3, 4].map(i => (
        <span
          key={i}
          style={{
            position: 'absolute', bottom: '38%', left: `${18 + i * 16}%`,
            width: Math.max(3, s * 0.06), height: Math.max(3, s * 0.06), borderRadius: '50%',
            background: i % 2 ? '#ffd34d' : '#ff7a1a',
            boxShadow: '0 0 6px 2px rgba(255,140,30,.8)',
            animation: `flg-ember ${1.3 + (i % 3) * 0.35}s ease-out ${i * 0.27}s infinite`,
            pointerEvents: 'none',
          }}
        />
      ))}
    </span>
  );
}

export const FireLionGift = {
  id: 'fire-lion',
  name: 'Fire Lion',
  price: 15000,
  Preview: FireLionPreview,
  Animation: FireLionAnimation,
} as unknown as GiftDefinition;
