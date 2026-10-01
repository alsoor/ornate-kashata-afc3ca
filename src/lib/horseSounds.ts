/**
 * Horse gift sounds (Web Audio, no audio files needed).
 * Path: src/lib/horseSounds.ts (next to audio.ts, witchSounds.ts and stormSounds.ts)
 *
 *  - wind   : desert wind bed + gusts with a lonely whistle and blowing sand
 *  - neigh  : horse whinny (fast rise, shaky high part, falling stutter) with valley echo
 *  - hoof   : hoof beats on soft sand (thud + scuff), gallop pattern comes from the plan
 *  - thump  : heavy landing / take-off with a dust "whoomph"
 *  - chime  : magic sparkle for the wink and for the princess disappearing
 *  - playHorseSound(plan) : schedules everything on the animation timeline and returns a stop function
 *
 * To use real recordings, put the files in the public folder and pass the urls (HorseGift.tsx -> NEIGH_URL / WIND_URL):
 *     public/sounds/horse-neigh.mp3   public/sounds/desert-wind.mp3
 * If a file is missing or cannot be decoded, the generated sound is played instead.
 */
import { getAudioCtx, noiseBuffer } from './audio';

export interface HorseSoundPlan {
  totalS: number;
  /** hoof beats: time (s) and loudness 0..1 */
  hoofs: { t: number; v: number }[];
  /** heavy impacts (rear-up push, landing) */
  thumps: { t: number; v: number }[];
  /** whinnies */
  neighs: { t: number; dur: number; power: number }[];
  /** magic sounds */
  chimes: { t: number; kind: 'wink' | 'vanish' }[];
  /** wind gusts on top of the wind bed */
  gusts: { t: number; dur: number; power: number }[];
  /** optional real neigh recording */
  neighUrl?: string;
  /** optional real wind recording */
  windUrl?: string;
}

export function playHorseSound(plan: HorseSoundPlan): () => void {
  const ctx = getAudioCtx();
  if (!ctx) return () => { /* no audio available */ };

  const sources: AudioScheduledSourceNode[] = [];
  let stopped = false;

  const t0 = ctx.currentTime + 0.02;
  const m = ctx.createGain();
  m.gain.value = 0.95;
  const comp = ctx.createDynamicsCompressor();
  m.connect(comp);
  comp.connect(ctx.destination);

  const cleanup = () => {
    stopped = true;
    try {
      m.gain.cancelScheduledValues(ctx.currentTime);
      m.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      sources.forEach(s => { try { s.stop(ctx.currentTime + 0.2); } catch { /* ignore */ } });
    } catch { /* ignore */ }
  };

  // Open-air reverb (the whinny and the chimes travel over the dunes)
  const len = Math.floor(ctx.sampleRate * 2.8);
  const rb = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = rb.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const u = i / len;
      lp += ((Math.random() * 2 - 1) - lp) * (0.6 - 0.5 * u);
      d[i] = lp * Math.pow(1 - u, 2.5);
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = rb;
  const verbOut = ctx.createGain();
  verbOut.gain.value = 0.8;
  const verb = ctx.createGain();
  verb.gain.value = 0.7;
  verb.connect(conv); conv.connect(verbOut); verbOut.connect(comp);

  const noise = (dur: number) => {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer(ctx, dur);
    sources.push(s);
    return s;
  };
  const osc = (type: OscillatorType) => {
    const o = ctx.createOscillator();
    o.type = type;
    sources.push(o);
    return o;
  };
  const smoothNoise = (n: number, k: number) => {
    const a = new Float32Array(n);
    let v = 0;
    for (let i = 0; i < n; i++) { v += ((Math.random() * 2 - 1) - v) * k; a[i] = v; }
    return a;
  };
  const sstep = (x: number) => { const u = Math.min(1, Math.max(0, x)); return u * u * (3 - 2 * u); };

  // ── Wind ───────────────────────────────────────────────────────────────────
  const windBed = (t: number, dur: number) => {
    const n = noise(dur + 0.2);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 480; f.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.07, t + 1.6);
    g.gain.setValueAtTime(0.07, t + dur - 1.6);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const lfo = osc('sine');
    lfo.frequency.value = 0.13;
    const lg = ctx.createGain(); lg.gain.value = 0.03;
    lfo.connect(lg); lg.connect(g.gain);
    n.connect(f); f.connect(g); g.connect(m);
    n.start(t); n.stop(t + dur + 0.2);
    lfo.start(t); lfo.stop(t + dur + 0.2);

    // fine sand grains in the air
    const s = noise(dur + 0.2);
    const sh = ctx.createBiquadFilter(); sh.type = 'highpass'; sh.frequency.value = 3600;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.linearRampToValueAtTime(0.02, t + 2);
    sg.gain.setValueAtTime(0.02, t + dur - 1.6);
    sg.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.connect(sh); sh.connect(sg); sg.connect(m);
    s.start(t); s.stop(t + dur + 0.2);
  };

  const gust = (t: number, dur: number, p: number) => {
    const env = (g: GainNode, peak: number) => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + dur * 0.4);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
    };
    // the roar of the gust
    const a = noise(dur + 0.2);
    const af = ctx.createBiquadFilter(); af.type = 'bandpass'; af.Q.value = 0.9;
    af.frequency.setValueAtTime(350, t);
    af.frequency.linearRampToValueAtTime(700 + 650 * p, t + dur * 0.5);
    af.frequency.linearRampToValueAtTime(420, t + dur);
    const ag = ctx.createGain(); env(ag, 0.22 * p);
    a.connect(af); af.connect(ag); ag.connect(m);
    a.start(t); a.stop(t + dur + 0.2);

    // the thin whistle of the wind
    const b = noise(dur + 0.2);
    const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.Q.value = 26;
    bf.frequency.setValueAtTime(700, t);
    bf.frequency.linearRampToValueAtTime(980, t + dur * 0.5);
    bf.frequency.linearRampToValueAtTime(760, t + dur);
    const bg = ctx.createGain(); env(bg, 0.07 * p);
    b.connect(bf); bf.connect(bg); bg.connect(m);
    const bs = ctx.createGain(); bs.gain.value = 0.4;
    bg.connect(bs); bs.connect(verb);
    b.start(t); b.stop(t + dur + 0.2);

    // blowing sand
    const c = noise(dur + 0.2);
    const cf = ctx.createBiquadFilter(); cf.type = 'highpass'; cf.frequency.value = 3000;
    const cg = ctx.createGain(); env(cg, 0.06 * p);
    c.connect(cf); cf.connect(cg); cg.connect(m);
    c.start(t); c.stop(t + dur + 0.2);
  };

  // ── Hooves on soft sand ────────────────────────────────────────────────────
  const hoof = (t: number, v: number) => {
    const th = osc('sine');
    const tg = ctx.createGain();
    th.frequency.setValueAtTime(110 * (0.95 + Math.random() * 0.1), t);
    th.frequency.exponentialRampToValueAtTime(46, t + 0.14);
    tg.gain.setValueAtTime(0.0001, t);
    tg.gain.linearRampToValueAtTime(0.5 * v, t + 0.01);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    th.connect(tg); tg.connect(m);
    th.start(t); th.stop(t + 0.22);

    const n = noise(0.2);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700 + Math.random() * 300; f.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.3 * v, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    n.connect(f); f.connect(g); g.connect(m);
    n.start(t); n.stop(t + 0.2);

    const k = noise(0.06);
    const kf = ctx.createBiquadFilter(); kf.type = 'bandpass'; kf.frequency.value = 2600; kf.Q.value = 1.2;
    const kg = ctx.createGain();
    kg.gain.setValueAtTime(0.0001, t);
    kg.gain.linearRampToValueAtTime(0.1 * v, t + 0.003);
    kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    k.connect(kf); kf.connect(kg); kg.connect(m);
    k.start(t); k.stop(t + 0.06);
  };

  const thump = (t: number, v: number) => {
    const th = osc('sine');
    const tg = ctx.createGain();
    th.frequency.setValueAtTime(75, t);
    th.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    tg.gain.setValueAtTime(0.0001, t);
    tg.gain.linearRampToValueAtTime(0.9 * v, t + 0.015);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    th.connect(tg); tg.connect(m);
    th.start(t); th.stop(t + 0.6);

    const n = noise(0.6);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(200, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5 * v, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    n.connect(f); f.connect(g); g.connect(m);
    n.start(t); n.stop(t + 0.6);

    // sand blowing up
    const s = noise(0.7);
    const sf = ctx.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 1500; sf.Q.value = 0.5;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t + 0.03);
    sg.gain.linearRampToValueAtTime(0.16 * v, t + 0.12);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
    s.connect(sf); sf.connect(sg); sg.connect(m);
    s.start(t); s.stop(t + 0.7);
  };

  // ── Horse whinny ───────────────────────────────────────────────────────────
  const neigh = (t: number, dur: number, p: number) => {
    const N = Math.max(32, Math.floor(dur * 160));
    const fr = new Float32Array(N), am = new Float32Array(N);
    const f1 = new Float32Array(N), f2 = new Float32Array(N);
    const jit = smoothNoise(N, 0.1);
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1), tau = u * dur;
      const rise = 0.16;
      let base: number;
      if (u < rise) base = 260 + 640 * sstep(u / rise);                    // fast scoop up
      else if (u < 0.5) base = 900 - 110 * sstep((u - rise) / (0.5 - rise)); // shaky high part
      else base = 790 - 420 * sstep((u - 0.5) / 0.5);                        // falling away
      const shake = 1 + 0.06 * Math.sin(2 * Math.PI * 13 * tau) * sstep((u - 0.25) / 0.2);
      fr[i] = base * shake * (1 + 0.025 * jit[i]);
      const pulse = u < 0.32 ? 1 : 0.5 + 0.5 * Math.max(0, Math.sin(2 * Math.PI * 9 * tau));
      am[i] = sstep(tau / 0.06) * sstep((dur - tau) / 0.4) * pulse * (0.9 + 0.1 * jit[i]);
      const open = Math.sin(Math.PI * Math.min(1, u * 1.2));
      f1[i] = 620 + 260 * open;
      f2[i] = 1450 + 500 * open;
    }

    const o = ctx.createOscillator();
    sources.push(o);
    const H = 24, re = new Float32Array(H + 1), im = new Float32Array(H + 1);
    for (let n = 1; n <= H; n++) im[n] = 1 / Math.pow(n, 0.95);
    o.setPeriodicWave(ctx.createPeriodicWave(re, im));
    o.frequency.setValueAtTime(fr[0], t);
    o.frequency.setValueCurveAtTime(fr, t, dur);

    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 140;
    o.connect(hp);
    const sum = ctx.createGain(); sum.gain.value = 1;

    const body = ctx.createBiquadFilter(); body.type = 'lowpass'; body.frequency.value = 2200;
    const bg = ctx.createGain(); bg.gain.value = 0.35;
    hp.connect(body); body.connect(bg); bg.connect(sum);

    const formant = (curve: Float32Array | null, fixed: number, q: number, gain: number) => {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
      if (curve) { bp.frequency.setValueAtTime(curve[0], t); bp.frequency.setValueCurveAtTime(curve, t, dur); }
      else bp.frequency.value = fixed;
      const g = ctx.createGain(); g.gain.value = gain;
      hp.connect(bp); bp.connect(g); g.connect(sum);
    };
    formant(f1, 0, 5, 1.1);
    formant(f2, 0, 6, 0.8);
    formant(null, 3000, 8, 0.3);

    // rasp / breath of the animal
    const br = noise(dur + 0.1);
    const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 2000; bf.Q.value = 0.7;
    const bg2 = ctx.createGain(); bg2.gain.value = 0.09;
    br.connect(bf); bf.connect(bg2); bg2.connect(sum);
    br.start(t); br.stop(t + dur + 0.1);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.setValueCurveAtTime(am, t, dur);
    sum.connect(env);
    const vg = ctx.createGain(); vg.gain.value = 0.55 * p;
    env.connect(vg);
    vg.connect(m);
    const vs = ctx.createGain(); vs.gain.value = 0.45;
    vg.connect(vs); vs.connect(verb);

    o.start(t); o.stop(t + dur + 0.05);
  };

  // ── Magic chimes ───────────────────────────────────────────────────────────
  const ping = (t: number, f: number, v: number, d: number) => {
    const o = osc('sine');
    const g = ctx.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(m);
    const s = ctx.createGain(); s.gain.value = 0.6;
    g.connect(s); s.connect(verb);
    o.start(t); o.stop(t + d + 0.02);
    const o2 = osc('triangle');
    const g2 = ctx.createGain();
    o2.frequency.value = f * 2.005;
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.linearRampToValueAtTime(v * 0.3, t + 0.004);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + d * 0.6);
    o2.connect(g2); g2.connect(m);
    o2.start(t); o2.stop(t + d + 0.02);
  };

  const chime = (t: number, kind: 'wink' | 'vanish') => {
    if (kind === 'wink') {
      ping(t, 1760, 0.2, 0.8);
      ping(t + 0.09, 2637, 0.16, 0.9);
      return;
    }
    const notes = [1319, 1568, 1976, 2349, 2637, 3136, 3951, 4699];
    notes.forEach((f, i) => ping(t + i * 0.1 + Math.random() * 0.03, f, 0.13 - i * 0.008, 0.7));
    const sh = noise(1.2);
    const sf = ctx.createBiquadFilter(); sf.type = 'highpass'; sf.frequency.value = 6000;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.linearRampToValueAtTime(0.06, t + 0.5);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    sh.connect(sf); sf.connect(sg); sg.connect(m);
    sh.start(t); sh.stop(t + 1.2);
  };

  // ── Real recordings (optional) ─────────────────────────────────────────────
  const load = (url: string) =>
    fetch(url)
      .then(r => { if (!r.ok) throw new Error('horse'); return r.arrayBuffer(); })
      .then(buf => new Promise<AudioBuffer>((res, rej) => { ctx.decodeAudioData(buf, res, rej); }));

  // ── Scheduling ─────────────────────────────────────────────────────────────
  if (plan.windUrl) {
    load(plan.windUrl)
      .then(ab => {
        if (stopped) return;
        const s = ctx.createBufferSource();
        s.buffer = ab; s.loop = true;
        sources.push(s);
        const g = ctx.createGain();
        const a = ctx.currentTime + 0.02;
        const e = t0 + plan.totalS;
        g.gain.setValueAtTime(0.0001, a);
        g.gain.linearRampToValueAtTime(0.8, a + 1.6);
        g.gain.setValueAtTime(0.8, e - 1.6);
        g.gain.linearRampToValueAtTime(0.0001, e);
        s.connect(g); g.connect(m);
        s.start(a); s.stop(e + 0.1);
      })
      .catch(() => {
        if (!stopped) { windBed(t0, plan.totalS); plan.gusts.forEach(g => gust(t0 + g.t, g.dur, g.power)); }
      });
  } else {
    windBed(t0, plan.totalS);
    plan.gusts.forEach(g => gust(t0 + g.t, g.dur, g.power));
  }

  plan.hoofs.forEach(h => hoof(t0 + h.t, h.v));
  plan.thumps.forEach(h => thump(t0 + h.t, h.v));
  plan.chimes.forEach(c => chime(t0 + c.t, c.kind));

  if (plan.neighUrl) {
    load(plan.neighUrl)
      .then(ab => {
        if (stopped) return;
        plan.neighs.forEach(n => {
          const s = ctx.createBufferSource();
          s.buffer = ab;
          sources.push(s);
          const g = ctx.createGain(); g.gain.value = 0.9 * n.power;
          s.connect(g); g.connect(m);
          const vs = ctx.createGain(); vs.gain.value = 0.35;
          g.connect(vs); vs.connect(verb);
          s.start(Math.max(t0 + n.t, ctx.currentTime + 0.02));
        });
      })
      .catch(() => {
        if (!stopped) plan.neighs.forEach(n => neigh(Math.max(t0 + n.t, ctx.currentTime + 0.05), n.dur, n.power));
      });
  } else {
    plan.neighs.forEach(n => neigh(t0 + n.t, n.dur, n.power));
  }

  return cleanup;
}
