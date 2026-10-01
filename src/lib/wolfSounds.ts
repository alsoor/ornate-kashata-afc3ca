/**
 * Wolf gift sounds (Web Audio, no audio files needed).
 * Path: src/lib/wolfSounds.ts (next to audio.ts and witchSounds.ts)
 *
 *  - footstep : heavy paw on dry leaves and fallen twigs (louder as the wolf comes closer)
 *  - howl     : realistic wolf howl (lead wolf + two answering voices, natural pitch drift, vowel formants, breath, valley reverb + echo)
 *  - wind     : cold night wind bed + a low drone when the darkness falls
 *  - playWolfSound(plan) : schedules everything on the animation timeline and returns a stop function
 *
 * To use a real recorded howl, put the file in public/sounds/wolf-howl.mp3 (WolfGift.tsx -> HOWL_URL).
 * If the file is missing or cannot be decoded, the generated howl is played instead.
 */
import { getAudioCtx, noiseBuffer } from './audio';

export interface WolfStep {
  /** time of the paw landing, seconds from the animation start */
  t: number;
  /** loudness 0..1 (the wolf is quiet while far away) */
  v: number;
}

export interface WolfSoundPlan {
  steps: WolfStep[];
  /** when the howl starts (seconds) */
  howlAt: number;
  /** howl length (seconds) */
  howlDur: number;
  /** total animation length (seconds) */
  totalS: number;
  /** optional real howl recording */
  howlUrl?: string;
}

export function playWolfSound(plan: WolfSoundPlan): () => void {
  const ctx = getAudioCtx();
  const sources: AudioScheduledSourceNode[] = [];
  const timers: number[] = [];
  const audios: HTMLAudioElement[] = [];
  let master: GainNode | null = null;
  let stopped = false;

  const cleanup = () => {
    stopped = true;
    timers.forEach(t => window.clearTimeout(t));
    audios.forEach(a => { try { a.pause(); } catch { /* ignore */ } });
    if (ctx && master) {
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
        sources.forEach(s => { try { s.stop(ctx.currentTime + 0.15); } catch { /* ignore */ } });
      } catch { /* ignore */ }
    }
  };

  if (!ctx) {
    if (plan.howlUrl) {
      timers.push(window.setTimeout(() => {
        try {
          const a = new Audio(plan.howlUrl);
          a.volume = 1;
          audios.push(a);
          void a.play().catch(() => { /* ignore */ });
        } catch { /* ignore */ }
      }, plan.howlAt * 1000));
    }
    return cleanup;
  }

  const t0 = ctx.currentTime + 0.02;
  const m = ctx.createGain();
  m.gain.value = 0.9;
  master = m;
  const comp = ctx.createDynamicsCompressor();
  m.connect(comp);
  comp.connect(ctx.destination);

  // Long dark echo bus (used by the howl so it sounds like it travels over the valley)
  const echoIn = ctx.createGain();
  echoIn.gain.value = 1;
  const echoDly = ctx.createDelay(1.5);
  echoDly.delayTime.value = 0.46;
  const echoLp = ctx.createBiquadFilter();
  echoLp.type = 'lowpass';
  echoLp.frequency.value = 1700;
  const echoFb = ctx.createGain();
  echoFb.gain.value = 0.46;
  const echoWet = ctx.createGain();
  echoWet.gain.value = 0.55;
  echoIn.connect(echoDly);
  echoDly.connect(echoLp);
  echoLp.connect(echoFb);
  echoFb.connect(echoDly);
  echoLp.connect(echoWet);
  echoWet.connect(comp);

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

  // ── Footstep: heavy paw, dry leaves crunching, sometimes a twig snaps ──────
  const footstep = (t: number, vol: number, i: number) => {
    const jit = 0.94 + Math.random() * 0.12;

    // heavy low thud
    const th = osc('sine');
    const thg = ctx.createGain();
    th.frequency.setValueAtTime(130 * jit, t);
    th.frequency.exponentialRampToValueAtTime(46, t + 0.16);
    thg.gain.setValueAtTime(0.0001, t);
    thg.gain.linearRampToValueAtTime(0.5 * vol, t + 0.012);
    thg.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    th.connect(thg); thg.connect(m);
    th.start(t); th.stop(t + 0.24);

    // soft body of the step
    const bd = noise(0.16);
    const bdf = ctx.createBiquadFilter();
    bdf.type = 'lowpass';
    bdf.frequency.value = 520;
    const bdg = ctx.createGain();
    bdg.gain.setValueAtTime(0.0001, t);
    bdg.gain.linearRampToValueAtTime(0.26 * vol, t + 0.015);
    bdg.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    bd.connect(bdf); bdf.connect(bdg); bdg.connect(m);
    bd.start(t); bd.stop(t + 0.16);

    // dry leaves: a few tiny crackles right after the landing
    const crackles = 5 + Math.floor(Math.random() * 4);
    for (let c = 0; c < crackles; c++) {
      const tc = t + 0.01 + Math.random() * 0.2;
      const len = 0.018 + Math.random() * 0.03;
      const n = noise(len + 0.01);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1700 + Math.random() * 2800;
      f.Q.value = 0.9;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, tc);
      g.gain.linearRampToValueAtTime((0.1 + Math.random() * 0.12) * vol, tc + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, tc + len);
      n.connect(f); f.connect(g); g.connect(m);
      n.start(tc); n.stop(tc + len + 0.01);
    }

    // every third step a dry twig snaps under the paw
    if (i % 3 === 1) {
      const ts = t + 0.03;
      const sn = noise(0.05);
      const sf = ctx.createBiquadFilter();
      sf.type = 'bandpass';
      sf.frequency.value = 3600 + Math.random() * 1600;
      sf.Q.value = 6;
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.0001, ts);
      sg.gain.linearRampToValueAtTime(0.34 * vol, ts + 0.002);
      sg.gain.exponentialRampToValueAtTime(0.0001, ts + 0.04);
      sn.connect(sf); sf.connect(sg); sg.connect(m);
      sn.start(ts); sn.stop(ts + 0.05);

      const cl = osc('triangle');
      const cg = ctx.createGain();
      cl.frequency.setValueAtTime(2600, ts);
      cl.frequency.exponentialRampToValueAtTime(900, ts + 0.03);
      cg.gain.setValueAtTime(0.0001, ts);
      cg.gain.linearRampToValueAtTime(0.1 * vol, ts + 0.002);
      cg.gain.exponentialRampToValueAtTime(0.0001, ts + 0.035);
      cl.connect(cg); cg.connect(m);
      cl.start(ts); cl.stop(ts + 0.04);
    }
  };

  // ── Night wind + low drone while the sky turns dark ─────────────────────────
  const wind = (t: number, dur: number) => {
    const n = noise(dur + 0.2);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 420;
    f.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 1.6);
    g.gain.setValueAtTime(0.05, t + dur - 1.6);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const lfo = osc('sine');
    lfo.frequency.value = 0.17;
    const lg = ctx.createGain();
    lg.gain.value = 0.02;
    lfo.connect(lg); lg.connect(g.gain);
    n.connect(f); f.connect(g); g.connect(m);
    n.start(t); n.stop(t + dur + 0.2);
    lfo.start(t); lfo.stop(t + dur + 0.2);

    const n2 = noise(dur + 0.2);
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.value = 1100;
    f2.Q.value = 2.2;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.linearRampToValueAtTime(0.012, t + 2.4);
    g2.gain.setValueAtTime(0.012, t + dur - 1.8);
    g2.gain.linearRampToValueAtTime(0.0001, t + dur);
    n2.connect(f2); f2.connect(g2); g2.connect(m);
    n2.start(t); n2.stop(t + dur + 0.2);

    // dark drone as the night falls
    const d = osc('sine');
    const dg = ctx.createGain();
    d.frequency.setValueAtTime(52, t);
    d.frequency.linearRampToValueAtTime(46, t + 2.4);
    dg.gain.setValueAtTime(0.0001, t);
    dg.gain.linearRampToValueAtTime(0.1, t + 1.2);
    dg.gain.linearRampToValueAtTime(0.0001, t + 3);
    d.connect(dg); dg.connect(m);
    d.start(t); d.stop(t + 3.1);
  };

  // ── Realistic wolf howl ─────────────────────────────────────────────────────
  // A lead wolf plus two answering voices. Each voice has: a harmonic-rich throat tone,
  // a natural pitch contour (scoop up, long held note, slow fall) with drifting pitch and
  // vibrato that fades in, a "ooo/aoo" vowel made by moving formants, breath noise,
  // and a big valley reverb + echo.
  let verbSend: GainNode | null = null;
  const ensureVerb = () => {
    if (verbSend) return verbSend;
    const len = Math.floor(ctx.sampleRate * 3.4);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const u = i / len;
        lp += ((Math.random() * 2 - 1) - lp) * (0.6 - 0.5 * u);
        d[i] = lp * Math.pow(1 - u, 2.6);
      }
    }
    const conv = ctx.createConvolver();
    conv.buffer = buf;
    const out = ctx.createGain();
    out.gain.value = 0.85;
    verbSend = ctx.createGain();
    verbSend.gain.value = 0.75;
    verbSend.connect(conv); conv.connect(out); out.connect(comp);
    return verbSend;
  };

  const smoothNoise = (n: number, k: number) => {
    const a = new Float32Array(n);
    let v = 0;
    for (let i = 0; i < n; i++) { v += ((Math.random() * 2 - 1) - v) * k; a[i] = v; }
    return a;
  };
  const sstep = (x: number) => { const u = Math.min(1, Math.max(0, x)); return u * u * (3 - 2 * u); };
  // pitch contour in Hz: [position 0..1, frequency]
  const PITCH: [number, number][] = [[0, 300], [0.1, 430], [0.26, 600], [0.46, 690], [0.68, 668], [0.86, 560], [1, 400]];
  const pitchAt = (u: number) => {
    for (let i = 1; i < PITCH.length; i++) {
      if (u <= PITCH[i][0]) {
        const [u0, f0] = PITCH[i - 1], [u1, f1] = PITCH[i];
        return f0 + (f1 - f0) * sstep((u - u0) / (u1 - u0));
      }
    }
    return PITCH[PITCH.length - 1][1];
  };

  const voice = (t: number, dur: number, k: number, vol: number, pan: number) => {
    const N = Math.max(16, Math.floor(dur * 120));
    const fr = new Float32Array(N), am = new Float32Array(N);
    const f1 = new Float32Array(N), f2 = new Float32Array(N);
    const drift = smoothNoise(N, 0.02), fast = smoothNoise(N, 0.22), tremN = smoothNoise(N, 0.08);
    const ph = Math.random() * 6.28;
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1), tau = u * dur;
      const vibIn = sstep((u - 0.2) / 0.25);
      const vib = 1 + 0.016 * vibIn * Math.sin(2 * Math.PI * (4.4 + 1.1 * u) * tau + ph);
      fr[i] = pitchAt(u) * k * vib * (1 + 0.09 * drift[i] + 0.004 * fast[i]);
      const env = sstep(tau / 0.9) * sstep((dur - tau) / 1.25) * (0.72 + 0.28 * Math.sin(Math.PI * Math.min(1, u * 1.15)));
      am[i] = Math.max(0, env * (1 + 0.1 * vibIn * Math.sin(2 * Math.PI * 5 * tau + ph) + 0.18 * tremN[i]));
      const open = Math.sin(Math.PI * Math.min(1, u * 1.1));   // mouth opens while the pitch rises
      f1[i] = 430 + 200 * open;
      f2[i] = 880 + 360 * open;
    }

    const o = ctx.createOscillator();
    sources.push(o);
    const H = 18, re = new Float32Array(H + 1), im = new Float32Array(H + 1);
    for (let n = 1; n <= H; n++) im[n] = (1 / Math.pow(n, 1.15)) * (n % 2 === 1 ? 1 : 0.7);
    o.setPeriodicWave(ctx.createPeriodicWave(re, im));
    o.frequency.setValueAtTime(fr[0], t);
    o.frequency.setValueCurveAtTime(fr, t, dur);

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 90;
    const sum = ctx.createGain();
    sum.gain.value = 1;
    o.connect(hp);

    const body = ctx.createBiquadFilter();
    body.type = 'lowpass'; body.frequency.value = 1500;
    const bg = ctx.createGain(); bg.gain.value = 0.4;
    hp.connect(body); body.connect(bg); bg.connect(sum);

    const formant = (curve: Float32Array | null, fixed: number, q: number, gain: number) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.Q.value = q;
      if (curve) { bp.frequency.setValueAtTime(curve[0], t); bp.frequency.setValueCurveAtTime(curve, t, dur); }
      else bp.frequency.value = fixed;
      const g = ctx.createGain(); g.gain.value = gain;
      hp.connect(bp); bp.connect(g); g.connect(sum);
    };
    formant(f1, 0, 4.5, 1.15);
    formant(f2, 0, 5.5, 0.7);
    formant(null, 2450, 7, 0.3);

    // breath in the voice (a bit more at the start and the end)
    const br = noise(dur + 0.1);
    const bf = ctx.createBiquadFilter();
    bf.type = 'bandpass'; bf.frequency.value = 1500; bf.Q.value = 0.8;
    const bg2 = ctx.createGain(); bg2.gain.value = 0.05;
    br.connect(bf); bf.connect(bg2); bg2.connect(sum);
    br.start(t); br.stop(t + dur + 0.1);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.setValueCurveAtTime(am, t, dur);
    sum.connect(env);

    const vg = ctx.createGain();
    vg.gain.value = vol;
    env.connect(vg);
    let out: AudioNode = vg;
    if (typeof ctx.createStereoPanner === 'function') {
      const pn = ctx.createStereoPanner();
      pn.pan.value = pan;
      vg.connect(pn);
      out = pn;
    }
    out.connect(m);
    const vs = ensureVerb();
    const sendG = ctx.createGain(); sendG.gain.value = 0.55;
    out.connect(sendG); sendG.connect(vs);
    const echoG = ctx.createGain(); echoG.gain.value = 0.5;
    out.connect(echoG); echoG.connect(echoIn);

    o.start(t); o.stop(t + dur + 0.05);
  };

  const howl = (t: number, dur: number) => {
    voice(t, dur, 1, 0.5, 0);
    voice(t + 0.55, dur * 0.9, 1.19, 0.26, -0.55);
    voice(t + 1.15, dur * 0.82, 0.84, 0.22, 0.55);
  };

  // Scheduling
  wind(t0, plan.totalS);
  plan.steps.forEach((s, i) => footstep(t0 + s.t, s.v, i));
  const howlWhen = t0 + plan.howlAt;
  if (!plan.howlUrl) {
    howl(howlWhen, plan.howlDur);
  } else {
    // a real recording if it loads, otherwise the generated howl
    fetch(plan.howlUrl)
      .then(r => { if (!r.ok) throw new Error('howl'); return r.arrayBuffer(); })
      .then(buf => new Promise<AudioBuffer>((res, rej) => { ctx.decodeAudioData(buf, res, rej); }))
      .then(ab => {
        if (stopped) return;
        const s = ctx.createBufferSource();
        s.buffer = ab;
        sources.push(s);
        const g = ctx.createGain();
        g.gain.value = 1;
        s.connect(g); g.connect(m);
        const eg = ctx.createGain();
        eg.gain.value = 0.25;
        g.connect(eg); eg.connect(echoIn);
        const st = Math.max(howlWhen, ctx.currentTime + 0.02);
        s.start(st);
        g.gain.setTargetAtTime(0, Math.max(st + 1, howlWhen + plan.howlDur + 1.2), 0.35);
      })
      .catch(() => {
        if (!stopped) howl(Math.max(howlWhen, ctx.currentTime + 0.05), plan.howlDur);
      });
  }

  return cleanup;
}
