/**
 * هدية القلب (Heart) — 25 Coins
 *
 * - Preview  : قلب أحمر ينبض داخل مربع الهدايا.
 * - Animation: قلب صغير ينتفخ لنص الشاشة (مع صوت نفخ) ثم ينفجر ويتفتت لقلوب صغيرة تملأ الشاشة
 *              (مع صوت انفجار). المدة الكلية 6 ثواني.
 *
 * هذا الملف مستقل بالكامل: غيّر الأرقام تحت (السعر/المدد/عدد القطع) أو الصوت من دالة playHeartSound.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { GiftDefinition } from '@/lib/gifts/types';
import { getAudioCtx, noiseBuffer } from '@/lib/gifts/audio';

// ── إعدادات الهدية ──────────────────────────────────────────────────────
const PRICE = 25;
const TOTAL_MS = 6000;      // مدة الأنميشن الكلية
const INFLATE_S = 3.0;      // مدة النفخ قبل الانفجار
const FRAGMENTS = 70;       // عدد القلوب الصغيرة بعد الانفجار
const SPARKS = 36;          // عدد الشرارات الصغيرة
// أوقات "نفخات" القلب بالثواني (تتسارع) — الصوت والحركة يتزامنون عليها
const PUMPS = [0.2, 0.62, 1.0, 1.32, 1.6, 1.85, 2.07, 2.27, 2.45, 2.6, 2.73, 2.85, 2.94];

const HEART_PATH =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';

function GlossyHeart({ size }: { size: number }) {
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
      <path d={HEART_PATH} fill={`url(#hg${gid})`} />
      <ellipse cx="8" cy="7.2" rx="2.4" ry="1.4" transform="rotate(-35 8 7.2)" fill="rgba(255,255,255,0.55)" />
    </svg>
  );
}

function FlatHeart({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block' }}>
      <path d={HEART_PATH} fill={color} />
    </svg>
  );
}

// ── الصوت: نفخ (هواء + نبضات متسارعة) ثم انفجار (دفعة + طقطقة) ─────────────
function playHeartSound(): () => void {
  const ctx = getAudioCtx();
  if (!ctx) return () => {};
  const t0 = ctx.currentTime + 0.02;
  const tb = t0 + INFLATE_S;
  const sources: AudioScheduledSourceNode[] = [];

  const master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp);
  comp.connect(ctx.destination);

  // هواء النفخ: ضجيج يمر بفلتر يرتفع تردده
  const air = ctx.createBufferSource();
  air.buffer = noiseBuffer(ctx, INFLATE_S + 0.3);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(300, t0);
  bp.frequency.exponentialRampToValueAtTime(2400, tb);
  const ag = ctx.createGain();
  ag.gain.setValueAtTime(0.0001, t0);
  ag.gain.exponentialRampToValueAtTime(0.24, tb - 0.05);
  ag.gain.linearRampToValueAtTime(0.0001, tb + 0.12);
  air.connect(bp); bp.connect(ag); ag.connect(master);
  air.start(t0); air.stop(tb + 0.3);
  sources.push(air);

  // نبضات النفخ (تتسارع)
  PUMPS.forEach((p, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    const t = t0 + p;
    o.frequency.setValueAtTime(130 + i * 16, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.14);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.2);
    sources.push(o);
  });

  // الانفجار: دفعة ضجيج + ضربة عميقة + فرقعة
  const boom = ctx.createBufferSource();
  boom.buffer = noiseBuffer(ctx, 1.3);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(7000, tb);
  lp.frequency.exponentialRampToValueAtTime(160, tb + 1.0);
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.95, tb);
  bg.gain.exponentialRampToValueAtTime(0.0001, tb + 1.15);
  boom.connect(lp); lp.connect(bg); bg.connect(master);
  boom.start(tb); boom.stop(tb + 1.3);
  sources.push(boom);

  const thump = ctx.createOscillator();
  const tg = ctx.createGain();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(150, tb);
  thump.frequency.exponentialRampToValueAtTime(30, tb + 0.6);
  tg.gain.setValueAtTime(1.0, tb);
  tg.gain.exponentialRampToValueAtTime(0.0001, tb + 0.7);
  thump.connect(tg); tg.connect(master);
  thump.start(tb); thump.stop(tb + 0.75);
  sources.push(thump);

  const pop = ctx.createOscillator();
  const pg = ctx.createGain();
  pop.type = 'triangle';
  pop.frequency.setValueAtTime(950, tb);
  pop.frequency.exponentialRampToValueAtTime(180, tb + 0.16);
  pg.gain.setValueAtTime(0.45, tb);
  pg.gain.exponentialRampToValueAtTime(0.0001, tb + 0.2);
  pop.connect(pg); pg.connect(master);
  pop.start(tb); pop.stop(tb + 0.25);
  sources.push(pop);

  // طقطقة القطع المتفتتة
  for (let i = 0; i < 16; i++) {
    const t = tb + 0.06 + Math.random() * 0.95;
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(ctx, 0.05);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500 + Math.random() * 2500;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.0001, t);
    cg.gain.exponentialRampToValueAtTime(0.22, t + 0.004);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    n.connect(hp); hp.connect(cg); cg.connect(master);
    n.start(t); n.stop(t + 0.06);
    sources.push(n);
  }

  return () => {
    try {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
      sources.forEach(s => { try { s.stop(ctx.currentTime + 0.1); } catch { /* ignore */ } });
    } catch { /* ignore */ }
  };
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

// ── أنميشن ملء الشاشة: ينتفخ → ينفجر → قلوب صغيرة تملأ الشاشة ──────────────
const FRAG_COLORS = ['#ff2d55', '#ff5c7a', '#e11d48', '#ff8fa3', '#ffd1dc', '#ff3b6b'];

function HeartAnimation({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<'inflate' | 'burst'>('inflate');
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const W = typeof window !== 'undefined' ? window.innerWidth : 360;
  const H = typeof window !== 'undefined' ? window.innerHeight : 640;
  const heartSize = Math.round(Math.min(W * 0.85, H * 0.55));

  // مفاتيح الحركة: كل نفخة ترفع الحجم قليلاً مع ارتداد خفيف
  const { times, scales, rotates } = useMemo(() => {
    const ts: number[] = [0];
    const ss: number[] = [0.05];
    const rs: number[] = [0];
    const n = PUMPS.length;
    PUMPS.forEach((p, i) => {
      const s = 0.05 + 0.95 * Math.pow((i + 1) / n, 0.9);
      ts.push(p / INFLATE_S); ss.push(s * 1.07); rs.push(i % 2 ? -4 : 4);
      ts.push((p + 0.09) / INFLATE_S); ss.push(s); rs.push(0);
    });
    ts.push(1); ss.push(1.2); rs.push(0);
    return { times: ts, scales: ss, rotates: rs };
  }, []);

  const frags = useMemo(() => Array.from({ length: FRAGMENTS }, (_, i) => {
    const dx = (Math.random() - 0.5) * W * 1.15;
    const dy = (Math.random() - 0.5) * H * 1.1;
    return {
      key: i,
      size: 14 + Math.random() * 34,
      color: FRAG_COLORS[i % FRAG_COLORS.length],
      dx, dy,
      fall: 40 + Math.random() * 120,
      rot: (Math.random() - 0.5) * 540,
      delay: Math.random() * 0.12,
    };
  }), [W, H]);

  const sparks = useMemo(() => Array.from({ length: SPARKS }, (_, i) => ({
    key: i,
    size: 4 + Math.random() * 7,
    dx: (Math.random() - 0.5) * W * 1.2,
    dy: (Math.random() - 0.5) * H * 1.2,
    delay: Math.random() * 0.15,
  })), [W, H]);

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
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 9400, pointerEvents: 'none', overflow: 'hidden' }}>
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
            transition={{ duration: INFLATE_S, times, ease: 'easeOut' }}
            style={{ willChange: 'transform' }}
          >
            <GlossyHeart size={heartSize} />
          </motion.div>
        </div>
      )}

      {phase === 'burst' && (
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

          {/* القلوب الصغيرة */}
          {frags.map(f => (
            <motion.div
              key={f.key}
              initial={{ x: 0, y: 0, scale: 0.2, opacity: 1, rotate: 0 }}
              animate={{
                x: [0, f.dx, f.dx * 1.04],
                y: [0, f.dy, f.dy + f.fall],
                scale: [0.2, 1, 0.85],
                opacity: [1, 1, 0],
                rotate: [0, f.rot * 0.6, f.rot],
              }}
              transition={{ duration: burstSeconds - f.delay - 0.05, delay: f.delay, times: [0, 0.3, 1], ease: 'easeOut' }}
              style={{ position: 'absolute', left: -f.size / 2, top: -f.size / 2, willChange: 'transform, opacity' }}
            >
              <FlatHeart size={f.size} color={f.color} />
            </motion.div>
          ))}

          {/* شرارات */}
          {sparks.map(s => (
            <motion.span
              key={s.key}
              initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
              animate={{ x: s.dx, y: s.dy, scale: 0.2, opacity: 0 }}
              transition={{ duration: 1.6, delay: s.delay, ease: 'easeOut' }}
              style={{
                position: 'absolute', left: -s.size / 2, top: -s.size / 2, width: s.size, height: s.size, borderRadius: '50%',
                background: '#ffd1dc', boxShadow: '0 0 8px #ff5c7a',
              }}
            />
          ))}
        </div>
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
