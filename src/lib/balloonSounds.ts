/**
 * أصوات هدية البالونات والدببة (Balloons) — مولّدة بالكامل بـ WebAudio (بدون ملفات صوت خارجية).
 *
 * الاستخدام (من BalloonGift.tsx):
 *   const snd = playBalloonSound({ mode: 'host' | 'lift', totalS: 9, whooshAt: [...], tingAt: [...] });
 *   snd.boing(0..1);   // دبدوب يرتطم ببالونة (صوت مطاط ناعم)
 *   snd.land();        // دبدوب ينزل على زر أو يثبت على الإطار (صوت قطني "بف")
 *   snd.stop();        // عند إنهاء/إلغاء الهدية
 *
 * الأصوات:
 *   - طلوع البالونات: "ووش" ناعم + صرير مطاطي صاعد
 *   - لما الحبل يمسك الإطار: جرس "تينغ"
 *   - طوال الهدية: لحن علبة موسيقى (Music Box) خفيف
 *   - النهاية: نغمتين هابطتين
 */

export interface BalloonSoundOpts {
  mode: 'host' | 'lift';
  totalS: number;
  /** أوقات (بالثواني) طلوع بالونة جديدة مهمة (ووش + صرير) */
  whooshAt?: number[];
  /** أوقات (بالثواني) إمساك الحبل للإطار (تينغ) */
  tingAt?: number[];
}
export interface BalloonSoundHandle {
  stop: () => void;
  boing: (v?: number) => void;
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

// سلم بنتاتوني (C major): نغمات علبة الموسيقى
const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
const MELODY = [0, 2, 3, 2, 4, 3, 2, 1, 0, 2, 3, 5, 4, 3, 2, 3];

export function playBalloonSound(opts: BalloonSoundOpts): BalloonSoundHandle {
  const noop: BalloonSoundHandle = { stop: () => {}, boing: () => {}, land: () => {} };
  const ctx = getCtx();
  if (!ctx) return noop;

  try {
    const t0 = ctx.currentTime + 0.02;
    const master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);

    // جرس ناعم (أساسي + هارمونك)
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
      o2.frequency.value = freq * 2.76;
      const g2 = ctx.createGain();
      g2.gain.value = 0.18;
      o2.connect(g2);
      g2.connect(g);
      o1.start(t0 + at);
      o2.start(t0 + at);
      o1.stop(t0 + at + dur + 0.05);
      o2.stop(t0 + at + dur + 0.05);
    };

    // علبة موسيقى (مثلثية، ديكاي قصير)
    const boxNote = (freq: number, at: number, vol: number) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.55);
      g.connect(master);
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      o.connect(g);
      o.start(t0 + at);
      o.stop(t0 + at + 0.6);
    };

    // ووش ناعم (ضجيج مفلتر يصعد)
    const whoosh = (at: number, dur: number, vol: number) => {
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 0.9;
      f.frequency.setValueAtTime(300, t0 + at);
      f.frequency.exponentialRampToValueAtTime(2200, t0 + at + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(vol, t0 + at + dur * 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(t0 + at);
      src.stop(t0 + at + dur + 0.02);
    };

    // صرير مطاطي صاعد (بالونة تطلع)
    const squeak = (at: number, vol: number) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(380, t0 + at);
      o.frequency.exponentialRampToValueAtTime(980, t0 + at + 0.32);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 22;
      const lg = ctx.createGain();
      lg.gain.value = 28;
      lfo.connect(lg);
      lg.connect(o.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.36);
      o.connect(g);
      g.connect(master);
      o.start(t0 + at);
      lfo.start(t0 + at);
      o.stop(t0 + at + 0.4);
      lfo.stop(t0 + at + 0.4);
    };

    // ── طلوع البالونات ──
    const wh = opts.whooshAt && opts.whooshAt.length ? opts.whooshAt : [0.1, 1.4, 2.8, 4.2, 5.6];
    wh.forEach((tt) => {
      whoosh(Math.max(0, tt), 0.7, 0.2);
      squeak(Math.max(0, tt) + 0.05, 0.05);
    });

    // ── إمساك الحبل (تينغ) ──
    (opts.tingAt || []).forEach((tt) => {
      bell(1318.5, tt, 0.7, 0.14);
      bell(1760, tt + 0.07, 0.8, 0.1);
    });

    // ── لحن علبة الموسيقى ──
    const step = 0.36;
    const mEnd = opts.totalS - 1.0;
    for (let i = 0, tt = 0.5; tt < mEnd; i++, tt += step) {
      boxNote(NOTES[MELODY[i % MELODY.length]], tt, 0.045);
    }

    // ── النهاية ──
    bell(1174.7, opts.totalS - 1.0, 0.8, 0.09);
    bell(880, opts.totalS - 0.8, 0.9, 0.09);

    let stopped = false;
    let lastBoing = 0;
    let lastLand = 0;

    return {
      boing: (v = 0.5) => {
        if (stopped) return;
        try {
          const now = ctx.currentTime;
          if (now - lastBoing < 0.09) return;
          lastBoing = now;
          const vol = 0.05 + 0.1 * Math.min(1, Math.max(0, v));
          const o = ctx.createOscillator();
          o.type = 'sine';
          const base = 300 + Math.random() * 160;
          o.frequency.setValueAtTime(base, now);
          o.frequency.exponentialRampToValueAtTime(base * 2.1, now + 0.06);
          o.frequency.exponentialRampToValueAtTime(base * 0.8, now + 0.2);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, now);
          g.gain.exponentialRampToValueAtTime(vol, now + 0.012);
          g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
          o.connect(g);
          g.connect(master);
          o.start(now);
          o.stop(now + 0.25);
        } catch { /* ignore */ }
      },
      land: () => {
        if (stopped) return;
        try {
          const now = ctx.currentTime;
          if (now - lastLand < 0.06) return;
          lastLand = now;
          // "بف" قطنية: ضجيج مفلتر قصير + نغمة منخفضة
          const len = Math.floor(ctx.sampleRate * 0.09);
          const buf = ctx.createBuffer(1, len, ctx.sampleRate);
          const d = buf.getChannelData(0);
          for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.value = 900;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.14, now);
          g.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
          src.connect(f);
          f.connect(g);
          g.connect(master);
          src.start(now);
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.setValueAtTime(190, now);
          o.frequency.exponentialRampToValueAtTime(90, now + 0.1);
          const g2 = ctx.createGain();
          g2.gain.setValueAtTime(0.0001, now);
          g2.gain.exponentialRampToValueAtTime(0.1, now + 0.01);
          g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
          o.connect(g2);
          g2.connect(master);
          o.start(now);
          o.stop(now + 0.18);
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
