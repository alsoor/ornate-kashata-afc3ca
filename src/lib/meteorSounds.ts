/**
 * أصوات هدية النيزك — Web Audio فقط (بدون ملفات صوت).
 * رياح + مطر + رعد + اهتزاز أرض + صفير نيزك + انفجارات + صوت حفر معدني.
 * المستويات المستمرة تتحدث بـ update() والمؤثرات اللحظية تنادى وقت الحدث.
 */
export type MeteorSounds = {
  update: (l: { wind: number; rain: number; rumble: number; drill: number }) => void;
  whoosh: (dur: number) => void;
  thunder: (delay?: number) => void;
  explosion: (power?: number) => void;
  impact: () => void;
  stop: () => void;
};

const NOOP: MeteorSounds = {
  update: () => {}, whoosh: () => {}, thunder: () => {}, explosion: () => {}, impact: () => {}, stop: () => {},
};

export function createMeteorSounds(): MeteorSounds {
  let ctx: AudioContext;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return NOOP;
    ctx = new AC();
  } catch {
    return NOOP;
  }
  void ctx.resume().catch(() => { /* ignore */ });

  const master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp);
  comp.connect(ctx.destination);

  const mkNoise = (brown: boolean) => {
    const len = ctx.sampleRate * 3;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else { d[i] = w; }
    }
    return b;
  };
  const white = mkNoise(false);
  const brown = mkNoise(true);
  const loop = (buf: AudioBuffer) => {
    const s = ctx.createBufferSource();
    s.buffer = buf; s.loop = true; s.start();
    return s;
  };
  const gainNode = () => { const g = ctx.createGain(); g.gain.value = 0; g.connect(master); return g; };

  // رياح
  const windG = gainNode();
  const windF = ctx.createBiquadFilter(); windF.type = 'bandpass'; windF.frequency.value = 520; windF.Q.value = 0.6;
  loop(white).connect(windF); windF.connect(windG);
  const windLfo = ctx.createOscillator(); windLfo.frequency.value = 0.17;
  const windLfoG = ctx.createGain(); windLfoG.gain.value = 260;
  windLfo.connect(windLfoG); windLfoG.connect(windF.frequency); windLfo.start();

  // مطر
  const rainG = gainNode();
  const rainHp = ctx.createBiquadFilter(); rainHp.type = 'highpass'; rainHp.frequency.value = 2600;
  const rainLp = ctx.createBiquadFilter(); rainLp.type = 'lowpass'; rainLp.frequency.value = 9500;
  loop(white).connect(rainHp); rainHp.connect(rainLp); rainLp.connect(rainG);

  // اهتزاز الأرض
  const rumbleG = gainNode();
  const rumbleLp = ctx.createBiquadFilter(); rumbleLp.type = 'lowpass'; rumbleLp.frequency.value = 150;
  loop(brown).connect(rumbleLp); rumbleLp.connect(rumbleG);
  const subOsc = ctx.createOscillator(); subOsc.type = 'sine'; subOsc.frequency.value = 42;
  subOsc.connect(rumbleG); subOsc.start();

  // حفر معدني
  const drillG = gainNode();
  const sawO = ctx.createOscillator(); sawO.type = 'sawtooth'; sawO.frequency.value = 64;
  const sawLp = ctx.createBiquadFilter(); sawLp.type = 'lowpass'; sawLp.frequency.value = 950;
  const sawWob = ctx.createOscillator(); sawWob.frequency.value = 17;
  const sawWobG = ctx.createGain(); sawWobG.gain.value = 10;
  sawWob.connect(sawWobG); sawWobG.connect(sawO.frequency);
  sawO.connect(sawLp); sawLp.connect(drillG); sawO.start(); sawWob.start();
  const grindBp = ctx.createBiquadFilter(); grindBp.type = 'bandpass'; grindBp.frequency.value = 2300; grindBp.Q.value = 2.4;
  const grindG = ctx.createGain(); grindG.gain.value = 0.5;
  loop(white).connect(grindBp); grindBp.connect(grindG); grindG.connect(drillG);
  const screechO = ctx.createOscillator(); screechO.type = 'sawtooth'; screechO.frequency.value = 1650;
  const screechLfo = ctx.createOscillator(); screechLfo.frequency.value = 6;
  const screechLfoG = ctx.createGain(); screechLfoG.gain.value = 260;
  screechLfo.connect(screechLfoG); screechLfoG.connect(screechO.frequency);
  const screechBp = ctx.createBiquadFilter(); screechBp.type = 'bandpass'; screechBp.frequency.value = 1900; screechBp.Q.value = 3;
  const screechG = ctx.createGain(); screechG.gain.value = 0.07;
  screechO.connect(screechBp); screechBp.connect(screechG); screechG.connect(drillG);
  screechO.start(); screechLfo.start();

  const burst = (dur: number, f0: number, f1: number, peak: number, type: BiquadFilterType = 'lowpass', q = 0.7, delay = 0) => {
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = white;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  };
  const boom = (f0: number, f1: number, dur: number, peak: number, delay = 0) => {
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(18, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  };

  const set = (g: GainNode, v: number, max: number) => {
    g.gain.setTargetAtTime(Math.max(0, Math.min(1, v)) * max, ctx.currentTime, 0.12);
  };

  return {
    update(l) {
      set(windG, l.wind, 0.55);
      set(rainG, l.rain, 0.22);
      set(rumbleG, l.rumble, 1.5);
      set(drillG, l.drill, 0.34);
    },
    whoosh(dur) {
      const t = ctx.currentTime;
      const s = ctx.createBufferSource(); s.buffer = white;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.1;
      f.frequency.setValueAtTime(220, t);
      f.frequency.exponentialRampToValueAtTime(3200, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.7, t + dur * 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(master);
      s.start(t, Math.random()); s.stop(t + dur + 0.05);
    },
    thunder(delay = 0) {
      burst(2.8, 900, 60, 0.9, 'lowpass', 0.7, delay);
      boom(70, 28, 2.2, 0.5, delay);
    },
    explosion(power = 1) {
      burst(1.4, 3200, 70, 0.85 * power);
      boom(120, 30, 1.2, 0.9 * power);
      burst(0.25, 6000, 1500, 0.4 * power, 'highpass', 0.7);
    },
    impact() {
      burst(2.4, 4200, 50, 1.0);
      boom(140, 24, 2.2, 1.0);
      burst(0.4, 7000, 1200, 0.5, 'highpass', 0.7);
      burst(3.0, 700, 40, 0.7, 'lowpass', 0.7, 0.25);
    },
    stop() {
      try { master.gain.setTargetAtTime(0, ctx.currentTime, 0.1); } catch { /* ignore */ }
      window.setTimeout(() => { void ctx.close().catch(() => { /* ignore */ }); }, 700);
    },
  };
}
