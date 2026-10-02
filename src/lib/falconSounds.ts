/**
 * أصوات هدية الصقر (Falcon) — كلها مولّدة بـ WebAudio (بدون ملفات صوت).
 *
 *  - غابة: رياح + صراصير + بومة بعيدة
 *  - غربان: نعيق (caw) بتوقيتات تتزامن مع الغربان الطايرة بالشاشة
 *  - الصقر: رفرفة أجنحة (whoosh) + نداء متقطع (kak-kak) + صرخة (scream) + صرخة قوية (screech)
 *  - صدى غابة خفيف (reverb) على النعيق والصرخات
 *
 * الاستخدام: const stop = playFalconSound({...}); وعند الخروج: stop();
 * ملف مستقل داخل src/lib (مو داخل فولدر gifts).
 */

export interface FalconCry {
  at: number;                                   // وقت البداية بالثواني
  kind: 'chatter' | 'scream' | 'screech';       // نداء متقطع | صرخة | صرخة قوية
}

export interface FalconFlap {
  from: number;                                 // بداية فترة الرفرفة
  to: number;                                   // نهايتها
  gap: number;                                  // الفاصل بين الرفرفات (ثانية)
  level: number;                                // القوة 0..1
}

export interface FalconSoundOpts {
  totalS: number;                               // مدة الهدية
  forestInS: number;                            // الغابة توصل أعلى صوت عند هذي الثانية
  forestOutAt: number;                          // بداية خفوت الغابة
  forestEndAt: number;                          // نهاية الخفوت
  cawTimes: number[];                           // أوقات نعيق الغربان
  owlTimes?: number[];                          // أوقات صوت البومة
  flaps: FalconFlap[];                          // فترات رفرفة الصقر
  cries: FalconCry[];                           // نداءات/صرخات الصقر
}

type AudioCtor = typeof AudioContext;

function makeCtx(): AudioContext | null {
  try {
    const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
    const A = w.AudioContext || w.webkitAudioContext;
    if (!A) return null;
    const ctx = new A();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => { /* ignore */ });
    return ctx;
  } catch {
    return null;
  }
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export function playFalconSound(o: FalconSoundOpts): () => void {
  const ctx = makeCtx();
  if (!ctx) return () => { /* no audio */ };
  const t0 = ctx.currentTime + 0.05;
  const sr = ctx.sampleRate;

  // ── الماستر + الصدى ──
  const master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 5;
  master.connect(comp);
  comp.connect(ctx.destination);

  const rev = ctx.createConvolver();
  {
    const len = Math.floor(sr * 1.9);
    const ir = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    rev.buffer = ir;
  }
  const revGain = ctx.createGain();
  revGain.gain.value = 0.3;
  rev.connect(revGain);
  revGain.connect(master);

  const send = (n: AudioNode, wet = 1) => {
    n.connect(master);
    if (wet > 0) {
      const g = ctx.createGain();
      g.gain.value = wet;
      n.connect(g);
      g.connect(rev);
    }
  };

  // ── ضجيج أبيض ──
  const noise = ctx.createBuffer(1, sr * 2, sr);
  {
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const noiseSrc = (t: number, dur: number): AudioBufferSourceNode => {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    s.start(t, rnd(0, 1.5));
    s.stop(t + dur + 0.05);
    return s;
  };

  const pan = (n: AudioNode, p: number): AudioNode => {
    try {
      if (typeof ctx.createStereoPanner === 'function') {
        const sp = ctx.createStereoPanner();
        sp.pan.value = Math.max(-1, Math.min(1, p));
        n.connect(sp);
        return sp;
      }
    } catch { /* ignore */ }
    return n;
  };

  // ═══ جو الغابة: رياح + صراصير ═══
  const bed = ctx.createGain();
  bed.gain.setValueAtTime(0, t0);
  bed.gain.linearRampToValueAtTime(1, t0 + o.forestInS);
  bed.gain.setValueAtTime(1, t0 + o.forestOutAt);
  bed.gain.linearRampToValueAtTime(0, t0 + o.forestEndAt);
  bed.connect(master);

  {
    const wind = noiseSrc(t0, o.totalS + 1);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 380;
    bp.Q.value = 0.7;
    const wg = ctx.createGain();
    wg.gain.value = 0.2;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.21;
    const lg = ctx.createGain();
    lg.gain.value = 150;
    lfo.connect(lg);
    lg.connect(bp.frequency);
    lfo.start(t0);
    lfo.stop(t0 + o.totalS + 1);
    wind.connect(bp);
    bp.connect(wg);
    wg.connect(bed);
  }

  const cricket = (f: number, rate: number, lvl: number, groupRate: number) => {
    const end = t0 + o.totalS + 1;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    const am = ctx.createGain();
    am.gain.value = lvl * 0.5;
    const l1 = ctx.createOscillator();
    l1.type = 'square';
    l1.frequency.value = rate;
    const l1g = ctx.createGain();
    l1g.gain.value = lvl * 0.5;
    l1.connect(l1g);
    l1g.connect(am.gain);
    const grp = ctx.createGain();
    grp.gain.value = 0.5;
    const l2 = ctx.createOscillator();
    l2.type = 'sine';
    l2.frequency.value = groupRate;
    const l2g = ctx.createGain();
    l2g.gain.value = 0.5;
    l2.connect(l2g);
    l2g.connect(grp.gain);
    osc.connect(am);
    am.connect(grp);
    grp.connect(bed);
    [osc, l1, l2].forEach(n => { n.start(t0); n.stop(end); });
  };
  cricket(4300, 29, 0.014, 2.4);
  cricket(4750, 33, 0.011, 1.7);
  cricket(3900, 26, 0.009, 2.9);

  // ═══ نعيق الغراب ═══
  const caw = (t: number, base: number, dur: number, lvl: number, p: number) => {
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(lvl, t + 0.035);
    out.gain.exponentialRampToValueAtTime(lvl * 0.7, t + dur * 0.6);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const mix = ctx.createGain();
    mix.gain.value = 1;
    for (const det of [0, 14]) {
      const s = ctx.createOscillator();
      s.type = 'sawtooth';
      s.detune.value = det;
      s.frequency.setValueAtTime(base * 1.12, t);
      s.frequency.exponentialRampToValueAtTime(base * 0.78, t + dur);
      s.connect(mix);
      s.start(t);
      s.stop(t + dur + 0.05);
    }
    // خشونة (rasp)
    const rasp = ctx.createGain();
    rasp.gain.value = 0.6;
    const rl = ctx.createOscillator();
    rl.frequency.value = rnd(56, 74);
    const rlg = ctx.createGain();
    rlg.gain.value = 0.4;
    rl.connect(rlg);
    rlg.connect(rasp.gain);
    rl.start(t);
    rl.stop(t + dur + 0.05);
    mix.connect(rasp);
    // فورمنتات
    const formants: [number, number, number][] = [[900, 4, 0.9], [1700, 5, 0.7], [2800, 3, 0.3]];
    for (const [f, q, g] of formants) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const gg = ctx.createGain();
      gg.gain.value = g;
      rasp.connect(bp);
      bp.connect(gg);
      gg.connect(out);
    }
    const ns = noiseSrc(t, dur);
    const nb = ctx.createBiquadFilter();
    nb.type = 'bandpass';
    nb.frequency.value = 1800;
    nb.Q.value = 1;
    const ng = ctx.createGain();
    ng.gain.value = 0.22;
    ns.connect(nb);
    nb.connect(ng);
    ng.connect(out);
    send(pan(out, p), 0.8);
  };

  for (const ct of o.cawTimes) {
    const n = 2 + Math.floor(Math.random() * 3);
    const base = rnd(330, 430);
    const p = rnd(-0.8, 0.8);
    for (let i = 0; i < n; i++) caw(t0 + ct + i * rnd(0.36, 0.46), base * rnd(0.92, 1.08), rnd(0.26, 0.4), rnd(0.1, 0.17), p);
  }

  // ═══ بومة بعيدة ═══
  for (const ot of o.owlTimes || []) {
    for (let i = 0; i < 2; i++) {
      const t = t0 + ot + i * 0.55;
      const s = ctx.createOscillator();
      s.type = 'sine';
      s.frequency.setValueAtTime(430, t);
      s.frequency.exponentialRampToValueAtTime(370, t + 0.4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      s.connect(g);
      send(pan(g, -0.5), 1);
      s.start(t);
      s.stop(t + 0.5);
    }
  }

  // ═══ رفرفة الأجنحة ═══
  const whoosh = (t: number, lvl: number) => {
    const ns = noiseSrc(t, 0.34);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1400, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, 0.2 * lvl), t + 0.07);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    ns.connect(lp);
    lp.connect(g);
    send(g, 0.4);
  };
  for (const f of o.flaps) {
    for (let t = f.from; t < f.to; t += f.gap * rnd(0.92, 1.08)) whoosh(t0 + t, f.level);
  }

  // ═══ صوت الصقر ═══
  const shaperCurve = (() => {
    const n = 512;
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(x * 3);
    }
    return c;
  })();

  const kak = (t: number, f0: number, lvl: number) => {
    const s = ctx.createOscillator();
    s.type = 'sawtooth';
    s.frequency.setValueAtTime(f0, t);
    s.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + 0.075);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2900;
    bp.Q.value = 2.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(lvl, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
    s.connect(bp);
    bp.connect(g);
    const ns = noiseSrc(t, 0.09);
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 3200;
    nf.Q.value = 1.4;
    const ng = ctx.createGain();
    ng.gain.value = 0.5;
    ns.connect(nf);
    nf.connect(ng);
    ng.connect(g);
    send(g, 0.9);
    s.start(t);
    s.stop(t + 0.1);
  };

  const scream = (t: number, dur: number, lvl: number) => {
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(lvl, t + 0.05);
    env.gain.setValueAtTime(lvl, t + dur * 0.55);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const mix = ctx.createGain();
    mix.gain.value = 0.7;
    const vib = ctx.createOscillator();
    vib.frequency.value = 17;
    const vg = ctx.createGain();
    vg.gain.value = 70;
    vib.connect(vg);
    [1, 2.005].forEach((mul, idx) => {
      const s = ctx.createOscillator();
      s.type = 'sawtooth';
      s.frequency.setValueAtTime(1900 * mul, t);
      s.frequency.exponentialRampToValueAtTime(3500 * mul, t + 0.16);
      s.frequency.exponentialRampToValueAtTime(3100 * mul, t + 0.5);
      s.frequency.exponentialRampToValueAtTime(1500 * mul, t + dur);
      vg.connect(s.frequency);
      const sg = ctx.createGain();
      sg.gain.value = idx === 0 ? 1 : 0.35;
      s.connect(sg);
      sg.connect(mix);
      s.start(t);
      s.stop(t + dur + 0.05);
    });
    vib.start(t);
    vib.stop(t + dur + 0.05);
    const sh = ctx.createWaveShaper();
    sh.curve = shaperCurve;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3100;
    bp.Q.value = 0.9;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 700;
    mix.connect(sh);
    sh.connect(bp);
    bp.connect(hp);
    hp.connect(env);
    const ns = noiseSrc(t, dur);
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 3300;
    nf.Q.value = 1;
    const ng = ctx.createGain();
    ng.gain.value = 0.5;
    ns.connect(nf);
    nf.connect(ng);
    ng.connect(env);
    send(env, 1);
  };

  for (const cry of o.cries) {
    const t = t0 + cry.at;
    if (cry.kind === 'chatter') {
      const n = 7 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) kak(t + i * 0.105, 2400 + i * 25, 0.3);
    } else if (cry.kind === 'scream') {
      scream(t, 1.35, 0.42);
    } else {
      for (let i = 0; i < 4; i++) kak(t + i * 0.1, 2500, 0.34);
      scream(t + 0.55, 1.9, 0.62);
    }
  }

  // ── الإيقاف ──
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
    } catch { /* ignore */ }
    window.setTimeout(() => { try { void ctx.close(); } catch { /* ignore */ } }, 600);
  };
  window.setTimeout(stop, (o.totalS + 1.2) * 1000);
  return stop;
}
