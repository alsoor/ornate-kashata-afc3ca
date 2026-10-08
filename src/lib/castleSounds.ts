/**
 * أصوات هدية القلعة (Castle) — مولّدة بالكامل بـ Web Audio (بدون أي ملفات صوت).
 * الملف داخل src/lib (مو داخل فولدر gifts).
 *
 * الطبقات:
 *   - أجواء قاعة ملكية: بساط وتر/كورال هادئ + صدى (Reverb) كبير
 *   - فتح بوابة القلعة: هدير ثقيل + صرير خشب
 *   - فرد السجادة الحمراء: هسهسة قماش
 *   - دخول ملكي: بوق (Fanfare) + طبول تيمباني
 *   - سقوط البلورة: وشوشة صاعدة ← ارتطام ناعم + أجراس لامعة (Arpeggio)
 *   - لمعان دوري: أجراس صغيرة
 *   - ألعاب نارية: فرقعات خفيفة
 *   - (لمستخدم) طيران البلورة لإطار صورته: وشوشة + أرغن صاعد + بوق قصير وأجراس عند الوصول
 *
 * الاستخدام:
 *   const stop = playCastleSound({ ...توقيتات بالثواني... });
 *   stop(); // عند إلغاء الأنميشن
 */

export interface CastleSoundCfg {
  speed?: number;          // playback speed of the whole timeline (1 = normal)
  totalS: number;          // المدة الكلية
  doorsAt: number;         // فتح البوابة
  carpetAt: number;        // فرد السجادة
  fanfareAt: number;       // البوق الملكي الأول
  orbDropAt: number;       // بداية نزول البلورة
  orbLandAt: number;       // وصول البلورة لمنتصف السجادة
  shineTimes: number[];    // لمعات دورية
  popTimes: number[];      // ألعاب نارية
  fanfare2At: number;      // بوق ثاني
  lift: boolean;           // هدية لمستخدم (البلورة تطير فوق إطاره)
  orbFlyAt: number;        // بداية طيران البلورة
  orbArriveAt: number;     // وصولها فوق الإطار
  endFadeAt: number;       // بداية خفوت الصوت
}

// نغمات (Hz) — ري ماجور
const D4 = 293.66, FS4 = 369.99, G4 = 392.0, A4 = 440.0, B4 = 493.88;
const D5 = 587.33, E5 = 659.25, FS5 = 739.99, G5 = 783.99, A5 = 880.0, D6 = 1174.66;

export function playCastleSound(cfg: CastleSoundCfg): () => void {
  let ctx: AudioContext;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return () => { /* no audio */ };
    ctx = new AC();
  } catch {
    return () => { /* no audio */ };
  }
  try { ctx.resume().catch(() => { /* ignore */ }); } catch { /* ignore */ }

  const base = ctx.currentTime + 0.06;
  const T = (s: number) => base + Math.max(0, s) / (cfg.speed || 1); // CASTLE-9S-SPEED

  // ── السلسلة الرئيسية: master → compressor → output، + إرسال للصدى ──
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 4;
  comp.connect(ctx.destination);
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(comp);

  const sr = ctx.sampleRate;
  const impLen = Math.floor(sr * 2.4);
  const imp = ctx.createBuffer(2, impLen, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = imp.getChannelData(ch);
    for (let i = 0; i < impLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / impLen, 2.6);
  }
  const conv = ctx.createConvolver();
  conv.buffer = imp;
  const wet = ctx.createGain();
  wet.gain.value = 0.34;
  conv.connect(wet);
  wet.connect(comp);

  const noiseBuf = ctx.createBuffer(1, sr * 2, sr);
  {
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  const out = (node: AudioNode, send = 0.3) => {
    node.connect(master);
    if (send > 0) {
      const s = ctx.createGain();
      s.gain.value = send;
      node.connect(s);
      s.connect(conv);
    }
  };

  // ── أدوات توليد ──
  const noise = (at: number, dur: number, vol: number, type: BiquadFilterType, f0: number, f1: number, q = 0.8, send = 0.2) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, T(at));
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), T(at + dur));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, T(at));
    g.gain.linearRampToValueAtTime(vol, T(at + Math.min(0.25, dur * 0.35)));
    g.gain.linearRampToValueAtTime(0.0001, T(at + dur));
    src.connect(f);
    f.connect(g);
    out(g, send);
    src.start(T(at), Math.random() * 0.8);
    src.stop(T(at + dur + 0.05));
  };

  const brass = (freq: number, at: number, dur: number, vol = 0.1) => {
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2.2;
    lp.frequency.setValueAtTime(freq * 1.2, T(at));
    lp.frequency.linearRampToValueAtTime(freq * 6.5, T(at + 0.09));
    lp.frequency.linearRampToValueAtTime(freq * 3.4, T(at + dur));
    g.gain.setValueAtTime(0.0001, T(at));
    g.gain.linearRampToValueAtTime(vol, T(at + 0.05));
    g.gain.setValueAtTime(vol * 0.88, T(Math.max(at + 0.06, at + dur - 0.12)));
    g.gain.linearRampToValueAtTime(0.0001, T(at + dur + 0.12));
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    lfo.frequency.value = 5.4;
    lfoG.gain.value = freq * 0.004;
    lfo.connect(lfoG);
    [-7, 7].forEach(det => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = det;
      lfoG.connect(o.frequency);
      o.connect(lp);
      o.start(T(at));
      o.stop(T(at + dur + 0.2));
    });
    lfo.start(T(at));
    lfo.stop(T(at + dur + 0.2));
    lp.connect(g);
    out(g, 0.38);
  };

  const timpani = (at: number, vol = 0.5, f = 118) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.5, T(at));
    o.frequency.exponentialRampToValueAtTime(f * 0.5, T(at + 0.4));
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, T(at));
    g.gain.exponentialRampToValueAtTime(0.001, T(at + 1.1));
    o.connect(g);
    out(g, 0.3);
    o.start(T(at));
    o.stop(T(at + 1.2));
    noise(at, 0.12, vol * 0.5, 'lowpass', 900, 200, 0.7, 0.1);
  };

  const bell = (freq: number, at: number, vol = 0.08, dur = 1.8) => {
    [[1, 1], [2.76, 0.4], [5.4, 0.18]].forEach(([m, a]) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * m;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, T(at));
      g.gain.linearRampToValueAtTime(vol * a, T(at + 0.01));
      g.gain.exponentialRampToValueAtTime(0.0008, T(at + dur / m));
      o.connect(g);
      out(g, 0.5);
      o.start(T(at));
      o.stop(T(at + dur / m + 0.1));
    });
  };

  const pad = (freqs: number[], at: number, dur: number, vol: number) => {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 760;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, T(at));
    g.gain.linearRampToValueAtTime(vol * 0.55, T(at + 1.8));
    g.gain.linearRampToValueAtTime(vol, T(at + 2.8 + 0.01));
    g.gain.setValueAtTime(vol, T(at + dur - 1.2));
    g.gain.linearRampToValueAtTime(0.0001, T(at + dur));
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = (i % 2 ? 1 : -1) * 6;
      o.connect(lp);
      o.start(T(at));
      o.stop(T(at + dur + 0.1));
    });
    lp.connect(g);
    out(g, 0.5);
  };

  const harp = (freqs: number[], at: number, gap: number, vol = 0.07) => {
    freqs.forEach((f, i) => bell(f, at + i * gap, vol, 1.6));
  };

  const fanfare1 = (at: number) => {
    const notes: [number, number, number][] = [
      [D4, 0, 0.17], [D4, 0.21, 0.17], [D4, 0.42, 0.17], [A4, 0.63, 1.0],
      [G4, 1.7, 0.3], [A4, 2.05, 0.3], [B4, 2.4, 0.3], [D5, 2.75, 1.7],
    ];
    notes.forEach(([f, o, d]) => {
      brass(f, at + o, d, 0.1);
      brass(f * 0.5, at + o, d, 0.07);
      brass(f * 1.5, at + o, d, 0.045);
    });
    timpani(at, 0.55);
    timpani(at + 0.63, 0.45, 104);
    timpani(at + 2.75, 0.6, 98);
  };

  const fanfare2 = (at: number) => {
    const notes: [number, number, number][] = [[G4, 0, 0.25], [B4, 0.3, 0.25], [D5, 0.6, 0.25], [G5, 0.9, 1.4]];
    notes.forEach(([f, o, d]) => {
      brass(f, at + o, d, 0.09);
      brass(f * 0.5, at + o, d, 0.06);
    });
    timpani(at, 0.45, 110);
    timpani(at + 0.9, 0.5, 98);
  };

  // ── الجدولة ──
  const end = cfg.totalS;
  pad([D4 / 2, D4, A4 / 2, FS4], 0.1, end - 0.4, 0.05);

  // بوابة القلعة
  noise(cfg.doorsAt, 2.2, 0.32, 'lowpass', 140, 380, 0.9, 0.35);
  {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(64, T(cfg.doorsAt));
    o.frequency.linearRampToValueAtTime(104, T(cfg.doorsAt + 1.6));
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 280;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, T(cfg.doorsAt));
    g.gain.linearRampToValueAtTime(0.07, T(cfg.doorsAt + 0.5));
    g.gain.linearRampToValueAtTime(0.0001, T(cfg.doorsAt + 1.9));
    o.connect(lp);
    lp.connect(g);
    out(g, 0.3);
    o.start(T(cfg.doorsAt));
    o.stop(T(cfg.doorsAt + 2));
  }

  // السجادة
  noise(cfg.carpetAt, 1.5, 0.13, 'highpass', 1200, 4200, 0.6, 0.15);

  // البوق الملكي
  fanfare1(cfg.fanfareAt);

  // نزول البلورة وارتطامها
  noise(cfg.orbDropAt, cfg.orbLandAt - cfg.orbDropAt, 0.16, 'bandpass', 500, 3600, 1.2, 0.3);
  timpani(cfg.orbLandAt, 0.55, 92);
  harp([D5, FS5, A5, D6, FS5 * 2], cfg.orbLandAt + 0.02, 0.1, 0.085);
  noise(cfg.orbLandAt, 1.2, 0.12, 'highpass', 3000, 7000, 0.7, 0.4);

  // لمعات
  cfg.shineTimes.forEach((s, i) => {
    const seq = [D6, A5, FS5 * 2, E5 * 2];
    bell(seq[i % seq.length], s, 0.07, 1.6);
    bell(seq[(i + 2) % seq.length] * 1.0, s + 0.12, 0.05, 1.4);
  });

  // ألعاب نارية
  cfg.popTimes.forEach(p => {
    noise(p, 0.18, 0.12, 'bandpass', 1800, 700, 1.4, 0.3);
    noise(p + 0.12, 0.7, 0.07, 'highpass', 3500, 8000, 0.7, 0.4);
  });

  // بوق ثاني
  fanfare2(cfg.fanfare2At);

  // هدية لمستخدم: البلورة تطير فوق الإطار
  if (cfg.lift) {
    noise(cfg.orbFlyAt, cfg.orbArriveAt - cfg.orbFlyAt, 0.15, 'bandpass', 600, 5200, 1.1, 0.3);
    harp([D5, FS5, A5, D6, FS5 * 2, A5 * 2], cfg.orbFlyAt + 0.1, (cfg.orbArriveAt - cfg.orbFlyAt - 0.6) / 5, 0.07);
    bell(D6, cfg.orbArriveAt, 0.1, 2.4);
    bell(A5, cfg.orbArriveAt + 0.05, 0.08, 2.2);
    noise(cfg.orbArriveAt, 1.1, 0.1, 'highpass', 3500, 8000, 0.7, 0.4);
  }

  // خفوت نهائي
  master.gain.setValueAtTime(0.9, T(cfg.endFadeAt));
  master.gain.linearRampToValueAtTime(0.0001, T(end - 0.04));

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    try {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
      window.setTimeout(() => { try { void ctx.close(); } catch { /* ignore */ } }, 400);
    } catch { /* ignore */ }
  };
}
