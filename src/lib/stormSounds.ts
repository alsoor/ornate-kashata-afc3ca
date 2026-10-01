/**
 * Storm gift sounds (Web Audio, no audio files needed).
 * Path: src/lib/stormSounds.ts (next to audio.ts and witchSounds.ts)
 *
 *  - thunder : sharp crack that "tears" the sky, then a deep rolling rumble with a valley echo and a sub thump
 *  - rain    : real-sounding rain bed (hiss + body + thousands of tiny drops), fades in and calms at the end
 *  - wind    : low dark wind under everything
 *  - playStormSound(plan) : schedules everything on the animation timeline and returns a stop function
 *
 * To use real recordings, put the files in the public folder and pass the urls (StormGift.tsx -> THUNDER_URL / RAIN_URL):
 *     public/sounds/storm-thunder.mp3   public/sounds/storm-rain.mp3
 * If a file is missing or cannot be decoded, the generated sound is played instead.
 */
import { getAudioCtx, noiseBuffer } from './audio';

export interface StormThunder {
  /** when the thunder is heard (seconds from the animation start) */
  t: number;
  /** loudness / size 0..1 */
  power: number;
}

export interface StormSoundPlan {
  thunders: StormThunder[];
  /** rain starts (seconds) */
  rainFrom: number;
  /** rain ends (seconds) */
  rainTo: number;
  /** total animation length (seconds) */
  totalS: number;
  /** optional real thunder recording */
  thunderUrl?: string;
  /** optional real rain recording */
  rainUrl?: string;
}

export function playStormSound(plan: StormSoundPlan): () => void {
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

  // Big valley reverb (makes the thunder feel huge)
  const len = Math.floor(ctx.sampleRate * 3.2);
  const rb = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = rb.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const u = i / len;
      lp += ((Math.random() * 2 - 1) - lp) * (0.55 - 0.45 * u);
      d[i] = lp * Math.pow(1 - u, 2.4);
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

  // ── Thunder ────────────────────────────────────────────────────────────────
  const thunder = (t: number, p: number) => {
    // 1) the crack: a very sharp burst, then a few tearing crackles
    const cr = noise(0.6);
    const cf = ctx.createBiquadFilter();
    cf.type = 'bandpass';
    cf.frequency.setValueAtTime(3200, t);
    cf.frequency.exponentialRampToValueAtTime(900, t + 0.35);
    cf.Q.value = 0.7;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.0001, t);
    cg.gain.linearRampToValueAtTime(1.0 * p, t + 0.004);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    cr.connect(cf); cf.connect(cg); cg.connect(m);
    const cs = ctx.createGain(); cs.gain.value = 0.6;
    cg.connect(cs); cs.connect(verb);
    cr.start(t); cr.stop(t + 0.6);

    const crackles = 6 + Math.floor(Math.random() * 5);
    for (let i = 0; i < crackles; i++) {
      const tc = t + 0.03 + Math.random() * 0.45;
      const dur = 0.02 + Math.random() * 0.05;
      const n = noise(dur + 0.02);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1200 + Math.random() * 3800;
      f.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, tc);
      g.gain.linearRampToValueAtTime((0.25 + Math.random() * 0.4) * p, tc + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, tc + dur);
      n.connect(f); f.connect(g); g.connect(m);
      n.start(tc); n.stop(tc + dur + 0.02);
    }

    // 2) the rolling rumble: dark noise, the pitch sinks and the volume rolls in waves
    const dur = 3.2 + 2.6 * p;
    const rn = noise(dur + 0.2);
    const rf = ctx.createBiquadFilter();
    rf.type = 'lowpass';
    rf.Q.value = 1.1;
    rf.frequency.setValueAtTime(1000, t);
    rf.frequency.exponentialRampToValueAtTime(70, t + dur);
    const rg = ctx.createGain();
    rg.gain.setValueAtTime(0.0001, t);
    rg.gain.linearRampToValueAtTime(0.9 * p, t + 0.06);
    for (let k = 1; k <= 5; k++) {
      const tk = t + 0.06 + k * dur * 0.16 + Math.random() * 0.12;
      rg.gain.linearRampToValueAtTime(0.9 * p * (1 - k * 0.15) * (0.65 + Math.random() * 0.35), tk);
    }
    rg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    rn.connect(rf); rf.connect(rg); rg.connect(m);
    const rs = ctx.createGain(); rs.gain.value = 0.7;
    rg.connect(rs); rs.connect(verb);
    rn.start(t); rn.stop(t + dur + 0.2);

    // 3) the sub thump you feel in the chest
    const sb = osc('sine');
    const sg = ctx.createGain();
    sb.frequency.setValueAtTime(62, t);
    sb.frequency.exponentialRampToValueAtTime(30, t + 1.1);
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.linearRampToValueAtTime(0.85 * p, t + 0.03);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    sb.connect(sg); sg.connect(m);
    sb.start(t); sb.stop(t + 1.5);
  };

  // ── Rain ───────────────────────────────────────────────────────────────────
  const rain = (from: number, to: number) => {
    const dur = Math.max(2, to - from);
    const rampIn = Math.min(2.4, dur * 0.4);
    const rampOut = Math.min(1.8, dur * 0.3);
    const shape = (g: GainNode, peak: number) => {
      g.gain.setValueAtTime(0.0001, from);
      g.gain.linearRampToValueAtTime(peak, from + rampIn);
      g.gain.setValueAtTime(peak, to - rampOut);
      g.gain.linearRampToValueAtTime(0.0001, to);
    };

    // hiss of the rain
    const a = noise(dur + 0.3);
    const ah = ctx.createBiquadFilter(); ah.type = 'highpass'; ah.frequency.value = 1100;
    const al = ctx.createBiquadFilter(); al.type = 'lowpass'; al.frequency.value = 8000;
    const ag = ctx.createGain(); shape(ag, 0.2);
    a.connect(ah); ah.connect(al); al.connect(ag); ag.connect(m);
    a.start(from); a.stop(to + 0.3);

    // body / sizzle
    const b = noise(dur + 0.3);
    const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 3200; bf.Q.value = 0.45;
    const bg = ctx.createGain(); shape(bg, 0.14);
    b.connect(bf); bf.connect(bg); bg.connect(m);
    b.start(from); b.stop(to + 0.3);

    // low patter on the ground
    const d = noise(dur + 0.3);
    const df = ctx.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 650;
    const dg = ctx.createGain(); shape(dg, 0.13);
    d.connect(df); df.connect(dg); dg.connect(m);
    d.start(from); d.stop(to + 0.3);

    // individual drops hitting (denser in the middle)
    const ticks = Math.floor(dur * 16);
    for (let i = 0; i < ticks; i++) {
      const u = Math.random();
      const tt = from + rampIn * 0.5 + u * (dur - rampIn * 0.5 - rampOut * 0.4);
      const td = 0.012 + Math.random() * 0.02;
      const n = noise(td + 0.02);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 2200 + Math.random() * 5200;
      f.Q.value = 1.6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.09, tt + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + td);
      let out: AudioNode = g;
      n.connect(f); f.connect(g);
      if (typeof ctx.createStereoPanner === 'function') {
        const pn = ctx.createStereoPanner();
        pn.pan.value = Math.random() * 2 - 1;
        g.connect(pn);
        out = pn;
      }
      out.connect(m);
      n.start(tt); n.stop(tt + td + 0.02);
    }
  };

  // ── Wind bed under everything ──────────────────────────────────────────────
  const wind = (t: number, dur: number) => {
    const n = noise(dur + 0.2);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 380; f.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.06, t + 2);
    g.gain.setValueAtTime(0.06, t + dur - 1.6);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const lfo = osc('sine');
    lfo.frequency.value = 0.21;
    const lg = ctx.createGain(); lg.gain.value = 0.025;
    lfo.connect(lg); lg.connect(g.gain);
    n.connect(f); f.connect(g); g.connect(m);
    n.start(t); n.stop(t + dur + 0.2);
    lfo.start(t); lfo.stop(t + dur + 0.2);

    // dark drone while the cloud comes down
    const dr = osc('sine');
    const dg = ctx.createGain();
    dr.frequency.setValueAtTime(48, t);
    dr.frequency.linearRampToValueAtTime(40, t + 3);
    dg.gain.setValueAtTime(0.0001, t);
    dg.gain.linearRampToValueAtTime(0.12, t + 1.4);
    dg.gain.linearRampToValueAtTime(0.0001, t + 3.2);
    dr.connect(dg); dg.connect(m);
    dr.start(t); dr.stop(t + 3.3);
  };

  // ── Real recordings (optional) ─────────────────────────────────────────────
  const load = (url: string) =>
    fetch(url)
      .then(r => { if (!r.ok) throw new Error('storm'); return r.arrayBuffer(); })
      .then(buf => new Promise<AudioBuffer>((res, rej) => { ctx.decodeAudioData(buf, res, rej); }));

  // Scheduling
  wind(t0, plan.totalS);

  if (plan.thunderUrl) {
    load(plan.thunderUrl)
      .then(ab => {
        if (stopped) return;
        plan.thunders.forEach(th => {
          const s = ctx.createBufferSource();
          s.buffer = ab;
          sources.push(s);
          const g = ctx.createGain();
          g.gain.value = 0.9 * th.power;
          s.connect(g); g.connect(m);
          const vs = ctx.createGain(); vs.gain.value = 0.35;
          g.connect(vs); vs.connect(verb);
          s.start(Math.max(t0 + th.t, ctx.currentTime + 0.02));
        });
      })
      .catch(() => {
        if (!stopped) plan.thunders.forEach(th => thunder(Math.max(t0 + th.t, ctx.currentTime + 0.02), th.power));
      });
  } else {
    plan.thunders.forEach(th => thunder(t0 + th.t, th.power));
  }

  if (plan.rainUrl) {
    load(plan.rainUrl)
      .then(ab => {
        if (stopped) return;
        const from = Math.max(t0 + plan.rainFrom, ctx.currentTime + 0.02);
        const to = t0 + plan.rainTo;
        const s = ctx.createBufferSource();
        s.buffer = ab;
        s.loop = true;
        sources.push(s);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, from);
        g.gain.linearRampToValueAtTime(0.9, from + 2.2);
        g.gain.setValueAtTime(0.9, to - 1.8);
        g.gain.linearRampToValueAtTime(0.0001, to);
        s.connect(g); g.connect(m);
        s.start(from); s.stop(to + 0.1);
      })
      .catch(() => {
        if (!stopped) rain(Math.max(t0 + plan.rainFrom, ctx.currentTime + 0.02), t0 + plan.rainTo);
      });
  } else {
    rain(t0 + plan.rainFrom, t0 + plan.rainTo);
  }

  return cleanup;
}
