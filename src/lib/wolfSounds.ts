/**
 * Wolf gift sounds (Web Audio, no audio files needed).
 * Path: src/lib/wolfSounds.ts (next to audio.ts and witchSounds.ts)
 *
 *  - footstep : heavy paw on dry leaves and fallen twigs (louder as the wolf comes closer)
 *  - howl     : long wolf howl (pitch glide + vibrato + mountain echo)
 *  - wind     : cold night wind bed + a low drone when the darkness falls
 *  - playWolfSound(plan) : schedules everything on the animation timeline and returns a stop function
 *
 * To use a real recorded howl instead of the generated one, pass howlUrl in the plan
 * (set it from WolfGift.tsx -> HOWL_URL).
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

  const cleanup = () => {
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

  if (!ctx) return cleanup;

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

  // ── The howl: rising glide, long held note with vibrato, slow fall ─────────
  const howl = (t: number, dur: number) => {
    const bus = ctx.createGain();
    bus.gain.value = 1;

    // vowel shaping (an "oooo / aoooo" sound)
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2300;
    const f1 = ctx.createBiquadFilter();
    f1.type = 'peaking';
    f1.frequency.value = 700;
    f1.Q.value = 2;
    f1.gain.value = 9;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'peaking';
    f2.frequency.value = 1150;
    f2.Q.value = 3;
    f2.gain.value = 5;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.3, t + 0.7);
    env.gain.linearRampToValueAtTime(0.46, t + dur * 0.5);
    env.gain.linearRampToValueAtTime(0.34, t + dur * 0.78);
    env.gain.linearRampToValueAtTime(0.0001, t + dur);

    // pitch curve (Hz): low start, rise, long high note, slow descent
    const curve = (o: OscillatorNode, k: number) => {
      o.frequency.setValueAtTime(250 * k, t);
      o.frequency.linearRampToValueAtTime(430 * k, t + dur * 0.12);
      o.frequency.linearRampToValueAtTime(600 * k, t + dur * 0.3);
      o.frequency.linearRampToValueAtTime(655 * k, t + dur * 0.55);
      o.frequency.linearRampToValueAtTime(610 * k, t + dur * 0.75);
      o.frequency.linearRampToValueAtTime(380 * k, t + dur);
    };

    const lfo = osc('sine');
    lfo.frequency.setValueAtTime(4.4, t);
    lfo.frequency.linearRampToValueAtTime(5.6, t + dur);
    lfo.start(t); lfo.stop(t + dur + 0.1);

    ([
      { type: 'sawtooth' as OscillatorType, k: 1, vol: 0.5, depth: 8 },
      { type: 'sawtooth' as OscillatorType, k: 2, vol: 0.22, depth: 16 },
      { type: 'triangle' as OscillatorType, k: 3, vol: 0.08, depth: 24 },
      { type: 'sine' as OscillatorType, k: 0.5, vol: 0.28, depth: 4 },
    ]).forEach(p => {
      const o = osc(p.type);
      curve(o, p.k);
      const vg = ctx.createGain();
      vg.gain.value = p.vol;
      const dg = ctx.createGain();
      dg.gain.setValueAtTime(0.0001, t);
      dg.gain.linearRampToValueAtTime(p.depth, t + dur * 0.5);
      lfo.connect(dg); dg.connect(o.frequency);
      o.connect(vg); vg.connect(bus);
      o.start(t); o.stop(t + dur + 0.1);
    });

    // breathy air in the voice
    const br = noise(dur + 0.1);
    const bf = ctx.createBiquadFilter();
    bf.type = 'bandpass';
    bf.frequency.value = 1700;
    bf.Q.value = 0.7;
    const bg = ctx.createGain();
    bg.gain.value = 0.06;
    br.connect(bf); bf.connect(bg); bg.connect(bus);
    br.start(t); br.stop(t + dur + 0.1);

    bus.connect(lp); lp.connect(f1); f1.connect(f2); f2.connect(env);
    env.connect(m);
    env.connect(echoIn);
  };

  // Scheduling
  wind(t0, plan.totalS);
  plan.steps.forEach((s, i) => footstep(t0 + s.t, s.v, i));
  if (!plan.howlUrl) howl(t0 + plan.howlAt, plan.howlDur);

  return cleanup;
}
