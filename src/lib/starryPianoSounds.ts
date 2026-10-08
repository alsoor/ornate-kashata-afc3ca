/**
 * Starry Piano gift — sound engine (pure WebAudio, no audio files needed).
 *
 * A soft, romantic piano ballad (C major / A minor, ~72 bpm) with a warm string pad,
 * a deep bass note on every chord, glass-bell chimes for the crystals, and a long hall reverb.
 *
 * The same score (STARRY_SCORE) is imported by StarryPianoGift.tsx so the pianist's hands,
 * the glowing keys, the floating notes, the crystals and the profile-frame vibrations
 * are all perfectly in sync with what you hear.
 *
 * Usage:  const stop = playStarryPianoSound();   // returns a stop() function
 */

export type ScoreKind = 'piano' | 'bass' | 'chime';

export interface ScoreEvent {
  t: number;      // seconds from the start of the gift
  kind: ScoreKind;
  midi: number;
  dur: number;    // seconds
  vel: number;    // 0..1
}

export const STARRY_TOTAL_S = 15;
/** Audio is scheduled this many seconds after the animation clock starts; visuals use the same lead. */
export const STARRY_LEAD_S = 0.08;
// PIANO-9S-SPEED: the whole piece is played faster so it lasts 9 real seconds
export const STARRY_REAL_S = 9;
const SPEED = STARRY_TOTAL_S / STARRY_REAL_S;

const T0 = 1.4;                 // music starts after the sky has begun to darken
const EIGHTH = 0.4167;          // eighth-note length (72 bpm)
const CHORD_S = EIGHTH * 4;     // each chord lasts 4 eighth notes

interface ChordDef {
  bass: number;
  tones: number[];                     // arpeggio tones
  pad: number[];                       // string pad notes
  mel: [number, number, number][];     // melody: [midi, startEighth, lengthEighths]
}

// Am | Am | F | F | C | G | F | C (final, rolled up)
const CHORDS: ChordDef[] = [
  { bass: 45, tones: [57, 64, 69, 72], pad: [57, 60, 64], mel: [[76, 0, 2], [72, 2, 2]] },
  { bass: 45, tones: [57, 64, 69, 72], pad: [57, 60, 64], mel: [[72, 0, 2], [76, 2, 2]] },
  { bass: 41, tones: [53, 60, 65, 69], pad: [53, 57, 60], mel: [[77, 0, 3], [76, 3, 1]] },
  { bass: 41, tones: [53, 60, 65, 69], pad: [53, 57, 60], mel: [[74, 0, 2], [72, 2, 2]] },
  { bass: 48, tones: [55, 64, 67, 72], pad: [55, 60, 64], mel: [[76, 0, 2], [79, 2, 2]] },
  { bass: 43, tones: [55, 62, 67, 71], pad: [55, 59, 62], mel: [[74, 0, 2], [71, 2, 2]] },
  { bass: 41, tones: [53, 60, 65, 69], pad: [53, 57, 60], mel: [[72, 0, 2], [77, 2, 2]] },
  { bass: 36, tones: [48, 55, 64, 67], pad: [48, 55, 64], mel: [] },
];

const CHIME_TIMES = [3.9, 5.0, 5.9, 6.8, 7.6, 8.7, 9.5, 10.4, 11.3, 12.2, 13.0, 13.6, 14.0];
const CHIME_NOTES = [84, 88, 91, 93, 96, 86];

function buildScore(): ScoreEvent[] {
  const ev: ScoreEvent[] = [];
  CHORDS.forEach((ch, ci) => {
    const t0 = T0 + ci * CHORD_S;
    const last = ci === CHORDS.length - 1;
    ev.push({ t: t0, kind: 'bass', midi: ch.bass, dur: last ? 3.2 : CHORD_S + 0.8, vel: last ? 0.62 : 0.5 });
    if (!last) {
      const pat = ci % 2 ? [0, 2, 1, 3] : [0, 1, 2, 3];
      pat.forEach((pi, n) => {
        ev.push({ t: t0 + n * EIGHTH, kind: 'piano', midi: ch.tones[pi], dur: 1.5, vel: n === 0 ? 0.4 : 0.34 });
      });
      ch.mel.forEach(([m, off, len]) => {
        ev.push({ t: t0 + off * EIGHTH, kind: 'piano', midi: m, dur: len * EIGHTH + 0.9, vel: 0.62 });
      });
    } else {
      // final chord: rolled rising arpeggio that rings out + one high sparkle note
      [48, 55, 64, 67, 72, 76, 79, 84].forEach((m, n) => {
        ev.push({ t: t0 + n * 0.17, kind: 'piano', midi: m, dur: 2.6 - n * 0.1, vel: 0.3 + n * 0.04 });
      });
      ev.push({ t: t0 + 1.55, kind: 'piano', midi: 88, dur: 2, vel: 0.4 });
    }
  });
  CHIME_TIMES.forEach((t, i) => {
    ev.push({ t, kind: 'chime', midi: CHIME_NOTES[i % CHIME_NOTES.length], dur: 2.2, vel: 0.5 + (i % 3) * 0.08 });
  });
  return ev.sort((a, b) => a.t - b.t);
}

export const STARRY_SCORE: ScoreEvent[] = buildScore();

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export function playStarryPianoSound(): () => void {
  let ctx: AudioContext;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return () => { /* no audio support */ };
    ctx = new AC();
  } catch {
    return () => { /* no audio support */ };
  }
  try { void ctx.resume(); } catch { /* ignore */ }

  const base = ctx.currentTime + STARRY_LEAD_S;

  // ── master chain: bus → (dry + reverb) → master → compressor → speakers ──
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  comp.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, base);
  master.gain.exponentialRampToValueAtTime(0.9, base + 0.5);
  master.gain.setValueAtTime(0.9, base + STARRY_REAL_S - 1.2);
  master.gain.linearRampToValueAtTime(0.0001, base + STARRY_REAL_S - 0.05);
  master.connect(comp);

  const bus = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = 0.85;
  bus.connect(dry);
  dry.connect(master);

  const conv = ctx.createConvolver();
  const irLen = Math.floor(ctx.sampleRate * 3.2);
  const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.6);
  }
  conv.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.42;
  bus.connect(conv);
  conv.connect(wet);
  wet.connect(master);

  // short noise burst = soft hammer sound
  const noiseLen = Math.floor(ctx.sampleRate * 0.08);
  const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  {
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) d[i] = Math.random() * 2 - 1;
  }

  const pianoNote = (when: number, midi: number, dur: number, vel: number) => {
    const f = mtof(midi);
    const out = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.4;
    lp.frequency.setValueAtTime(Math.min(11000, f * 7 + 1500 + vel * 2500), when);
    lp.frequency.exponentialRampToValueAtTime(Math.max(500, f * 2.2), when + Math.min(dur, 2.2));
    const peak = 0.3 * vel;
    out.gain.setValueAtTime(0.0001, when);
    out.gain.linearRampToValueAtTime(peak, when + 0.007);
    out.gain.exponentialRampToValueAtTime(peak * 0.4, when + 0.4);
    out.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.4);
    lp.connect(out);
    out.connect(bus);
    const stopAt = when + dur + 0.5;

    const parts: [number, number, number][] = [[1, 1, 1], [2, 0.45, 0.8], [3, 0.25, 0.6], [4, 0.12, 0.45]];
    parts.forEach(([h, g, decay]) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * h * (1 + 0.0005 * h * h);
      const pg = ctx.createGain();
      pg.gain.setValueAtTime(g, when);
      pg.gain.exponentialRampToValueAtTime(0.0001, when + (dur + 0.3) * decay);
      o.connect(pg);
      pg.connect(lp);
      o.start(when);
      o.stop(stopAt);
    });
    // warm detuned triangle layer
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = f;
    o2.detune.value = 5;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.22, when);
    g2.gain.exponentialRampToValueAtTime(0.0001, when + dur * 0.7 + 0.2);
    o2.connect(g2);
    g2.connect(lp);
    o2.start(when);
    o2.stop(stopAt);
    // hammer
    const ns = ctx.createBufferSource();
    ns.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(6000, Math.max(800, f * 3));
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.06 * vel, when);
    ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    ns.connect(bp);
    bp.connect(ng);
    ng.connect(bus);
    ns.start(when);
    ns.stop(when + 0.08);
  };

  const bell = (when: number, midi: number, vel: number) => {
    const f = mtof(midi);
    const parts: [number, number, number][] = [[1, 1, 2.2], [2.76, 0.35, 1.2], [5.4, 0.12, 0.6]];
    parts.forEach(([h, g, d]) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * h;
      const og = ctx.createGain();
      const pk = 0.1 * vel * g;
      og.gain.setValueAtTime(0.0001, when);
      og.gain.linearRampToValueAtTime(pk, when + 0.004);
      og.gain.exponentialRampToValueAtTime(0.0001, when + d);
      o.connect(og);
      og.connect(bus);
      o.start(when);
      o.stop(when + d + 0.1);
    });
  };

  const pad = (when: number, notes: number[], dur: number) => {
    notes.forEach(m => {
      const f = mtof(m);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(0.028, when + 0.8);
      g.gain.setValueAtTime(0.028, when + dur);
      g.gain.linearRampToValueAtTime(0.0001, when + dur + 1.0);
      lp.connect(g);
      g.connect(bus);
      [-6, 6].forEach(det => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        o.connect(lp);
        o.start(when);
        o.stop(when + dur + 1.1);
      });
    });
  };

  // ── schedule everything up-front ──
  STARRY_SCORE.forEach(e => {
    const when = base + e.t / SPEED;
    if (e.kind === 'chime') bell(when, e.midi, e.vel);
    else pianoNote(when, e.midi, e.dur / SPEED, e.vel);
  });
  CHORDS.forEach((ch, ci) => {
    const last = ci === CHORDS.length - 1;
    pad(base + (T0 + ci * CHORD_S) / SPEED, ch.pad, (last ? STARRY_TOTAL_S - (T0 + ci * CHORD_S) - 1.3 : CHORD_S + 0.2) / SPEED);
  });

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    try {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    } catch { /* ignore */ }
    window.setTimeout(() => { try { void ctx.close(); } catch { /* ignore */ } }, 420);
  };
}
