/**
 * أصوات هدية الوردة (Rose) — مولّدة بالكامل بـ WebAudio (بدون ملفات صوت خارجية).
 *
 * الاستخدام (من RoseGift.tsx):
 *   const snd = playRoseSound({ mode: 'host' | 'lift', totalS: 6 });
 *   snd.land();   // (وضع lift) صوت ناعم كل ما وردة تنزل وتثبت على إطار الصورة
 *   snd.stop();   // عند إنهاء/إلغاء الهدية
 *
 * الأصوات:
 *   - ظهور الوردة: "ووش" ناعم + جرس رباعي النغمات صاعد
 *   - أثناء الهدية: وميض نغمات عالية خفيفة (تتلألأ) + طبقة هادئة منخفضة
 *   - النهاية: نغمتين هابطتين ناعمتين
 */

export interface RoseSoundOpts {
  mode: 'host' | 'lift';
  totalS: number;
}
export interface RoseSoundHandle {
  stop: () => void;
  land: () => void;
}

let shared: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const AC = w.AudioContext || w.webkitAudioContext;
    if (!AC) return null;
    if (!shared || shared.state === 'closed') shared = new AC();
    if (shared.state === 'suspended') void shared.resume();
    return shared;
  } catch {
    return null;
  }
}

const PENTA = [1047, 1175, 1319, 1568, 1760, 2093];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export function playRoseSound(opts: RoseSoundOpts): RoseSoundHandle {
  const noop: RoseSoundHandle = { stop: () => {}, land: () => {} };
  const ctx = getCtx();
  if (!ctx) return noop;

  try {
    const t0 = ctx.currentTime + 0.02;
    const master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);

    // نغمة بجرس ناعم (أساسي + هارمونك)
    const bell = (freq: number, at: number, dur: number, vol: number) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      g.connect(master);
      const o1 = ctx.createOscillator();
      o1.type = 'sine';
      o1.frequency.value = freq;
      o1.connect(g);
      const o2 = ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = freq * 2.01;
      const g2 = ctx.createGain();
      g2.gain.value = 0.25;
      o2.connect(g2);
      g2.connect(g);
      o1.start(t0 + at);
      o2.start(t0 + at);
      o1.stop(t0 + at + dur + 0.05);
      o2.stop(t0 + at + dur + 0.05);
    };

    // ووش ناعم (ضجيج مفلتر يتحرك للأعلى)
    const whoosh = (at: number, dur: number, vol: number) => {
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 1.2;
      f.frequency.setValueAtTime(400, t0 + at);
      f.frequency.exponentialRampToValueAtTime(2600, t0 + at + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(vol, t0 + at + dur * 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(t0 + at);
      src.stop(t0 + at + dur + 0.02);
    };

    // ── الظهور ──
    whoosh(0, 0.45, 0.22);
    [523, 659, 784, 1047].forEach((fq, i) => bell(fq, 0.08 + i * 0.11, 0.9, 0.15));

    // ── طبقة هادئة منخفضة طوال الهدية ──
    const padEnd = Math.max(1, opts.totalS - 0.6);
    [261.6, 329.6].forEach((fq) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = fq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0 + 0.4);
      g.gain.linearRampToValueAtTime(0.03, t0 + 1.2);
      g.gain.linearRampToValueAtTime(0.0001, t0 + padEnd);
      o.connect(g);
      g.connect(master);
      o.start(t0 + 0.4);
      o.stop(t0 + padEnd + 0.05);
    });

    // ── وميض نغمات متلألئة ──
    const twEnd = opts.totalS - 1.2;
    for (let tt = opts.mode === 'lift' ? 0.9 : 0.8; tt < twEnd; tt += 0.4 + Math.random() * 0.5) {
      bell(pick(PENTA), tt, 0.55, opts.mode === 'lift' ? 0.03 : 0.05);
    }

    // ── النهاية ──
    bell(1319, opts.totalS - 0.95, 0.7, 0.09);
    bell(988, opts.totalS - 0.75, 0.8, 0.09);

    let stopped = false;
    return {
      land: () => {
        if (stopped) return;
        try {
          const now = ctx.currentTime;
          // "ثب" ناعمة منخفضة
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.setValueAtTime(220, now);
          o.frequency.exponentialRampToValueAtTime(110, now + 0.1);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, now);
          g.gain.exponentialRampToValueAtTime(0.12, now + 0.008);
          g.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
          o.connect(g);
          g.connect(master);
          o.start(now);
          o.stop(now + 0.18);
          // جرس صغير
          const fq = pick(PENTA) * 0.75;
          const o2 = ctx.createOscillator();
          o2.type = 'sine';
          o2.frequency.value = fq;
          const g2 = ctx.createGain();
          g2.gain.setValueAtTime(0.0001, now + 0.02);
          g2.gain.exponentialRampToValueAtTime(0.07, now + 0.03);
          g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
          o2.connect(g2);
          g2.connect(master);
          o2.start(now + 0.02);
          o2.stop(now + 0.5);
        } catch { /* ignore */ }
      },
      stop: () => {
        if (stopped) return;
        stopped = true;
        try {
          const now = ctx.currentTime;
          master.gain.cancelScheduledValues(now);
          master.gain.setValueAtTime(master.gain.value, now);
          master.gain.linearRampToValueAtTime(0.0001, now + 0.12);
          window.setTimeout(() => { try { master.disconnect(); } catch { /* ignore */ } }, 400);
        } catch { /* ignore */ }
      },
    };
  } catch {
    return noop;
  }
}
