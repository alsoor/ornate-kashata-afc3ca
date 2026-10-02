/**
 * أصوات هدية التنين (DragonGift) — src/lib/dragonSounds.ts
 *
 * ملف مستقل (بدون ملف Gift). كل الأصوات مولّدة بـ WebAudio (بدون ملفات خارجية)، وفيها خانة للموسيقى:
 *
 *  ▸ لإضافة موسيقاك الخاصة للهدية:
 *      1) ضع ملف الموسيقى في  public/sounds/dragon-music.mp3  (أو أي مسار تحبه)
 *      2) غيّر DRAGON_MUSIC_URL تحت إلى المسار:  '/sounds/dragon-music.mp3'
 *    الموسيقى تشتغل مع بداية الهدية وتخفت تلقائياً بآخر ثانية، ومدتها تتقص على مدة الهدية (16 ثانية).
 *    لو الملف ما انحمّل لأي سبب، تشتغل الموسيقى الملحمية المولّدة بدلها.
 *  ▸ لو DRAGON_MUSIC_URL فاضي ('') تشتغل الموسيقى الملحمية المولّدة (طبول + نحاسيات).
 */

export const DRAGON_MUSIC_URL = '';        // مثال: '/sounds/dragon-music.mp3'
export const DRAGON_MUSIC_VOLUME = 0.9;    // قوة موسيقاك (0 – 1)
export const DRAGON_FX_VOLUME = 0.8;       // قوة المؤثرات (زئير/نار/أجنحة)

export interface DragonSoundTimes {
  windEnd: number;       // نهاية الرياح الأولية
  flyInAt: number;       // بداية دخول التنين
  roarAt: number;        // الزئير الأول
  breathAt: number;      // بداية النفخ بالنار
  breathEnd: number;     // نهاية النار
  burnAt: number;        // بداية حرق الإطار (هدية لمستخدم)
  leaveAt: number;       // التنين يغادر
  total: number;         // المدة الكلية (ثواني)
}

type AC = AudioContext;

function noiseBuffer(ctx: AC, secs: number): AudioBuffer {
  const n = Math.max(1, Math.floor(ctx.sampleRate * secs));
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

export function playDragonSound(T: DragonSoundTimes): () => void {
  let ctx: AC | null = null;
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return () => { /* no audio */ };
    ctx = new Ctor();
  } catch {
    return () => { /* no audio */ };
  }
  const c: AC = ctx;
  try { void c.resume(); } catch { /* ignore */ }

  const t0 = c.currentTime + 0.05;
  const nodes: AudioNode[] = [];
  const srcs: (AudioScheduledSourceNode)[] = [];
  let stopped = false;

  // الماستر + كومبريسر
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 4;
  const master = c.createGain();
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.linearRampToValueAtTime(1, t0 + 0.4);
  master.gain.setValueAtTime(1, t0 + T.total - 0.9);
  master.gain.linearRampToValueAtTime(0.0001, t0 + T.total - 0.05);
  master.connect(comp);
  comp.connect(c.destination);
  nodes.push(comp, master);

  const fx = c.createGain();
  fx.gain.value = DRAGON_FX_VOLUME;
  fx.connect(master);
  nodes.push(fx);

  const noise = noiseBuffer(c, 3);
  const keep = <N extends AudioNode>(n: N): N => { nodes.push(n); return n; };
  const track = <S extends AudioScheduledSourceNode>(s: S): S => { srcs.push(s); return s; };

  const noiseSrc = (loop = true): AudioBufferSourceNode => {
    const s = track(c.createBufferSource());
    s.buffer = noise;
    s.loop = loop;
    return s;
  };

  // ── رياح (بداية) ──
  {
    const s = noiseSrc();
    const f = keep(c.createBiquadFilter());
    f.type = 'bandpass';
    f.frequency.setValueAtTime(380, t0);
    f.frequency.linearRampToValueAtTime(900, t0 + T.windEnd * 0.6);
    f.Q.value = 0.8;
    const g = keep(c.createGain());
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.32, t0 + 1.2);
    g.gain.linearRampToValueAtTime(0.0001, t0 + T.windEnd);
    s.connect(f); f.connect(g); g.connect(fx);
    s.start(t0); s.stop(t0 + T.windEnd + 0.1);
  }

  // ── رعد/هدير منخفض مستمر طول حضور التنين ──
  {
    const o1 = track(c.createOscillator());
    const o2 = track(c.createOscillator());
    o1.type = 'sine'; o1.frequency.value = 38;
    o2.type = 'sawtooth'; o2.frequency.value = 55;
    const lp = keep(c.createBiquadFilter());
    lp.type = 'lowpass'; lp.frequency.value = 140;
    const g = keep(c.createGain());
    g.gain.setValueAtTime(0.0001, t0 + T.flyInAt - 0.4);
    g.gain.linearRampToValueAtTime(0.38, t0 + T.roarAt);
    g.gain.setValueAtTime(0.38, t0 + T.breathEnd);
    g.gain.linearRampToValueAtTime(0.0001, t0 + T.total - 0.8);
    o1.connect(g); o2.connect(lp); lp.connect(g); g.connect(fx);
    o1.start(t0); o2.start(t0); o1.stop(t0 + T.total); o2.stop(t0 + T.total);
  }

  // ── رفرفة الأجنحة (ضربات منخفضة + وشوشة) ──
  for (let tt = T.flyInAt; tt < T.leaveAt + 1.4; tt += 0.62) {
    const at = t0 + tt;
    const o = track(c.createOscillator());
    o.type = 'sine';
    o.frequency.setValueAtTime(78, at);
    o.frequency.exponentialRampToValueAtTime(34, at + 0.28);
    const g = keep(c.createGain());
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.55, at + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.34);
    o.connect(g); g.connect(fx);
    o.start(at); o.stop(at + 0.4);

    const s = noiseSrc(false);
    const f = keep(c.createBiquadFilter());
    f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 0.6;
    const ng = keep(c.createGain());
    ng.gain.setValueAtTime(0.0001, at + 0.05);
    ng.gain.linearRampToValueAtTime(0.16, at + 0.16);
    ng.gain.exponentialRampToValueAtTime(0.0001, at + 0.46);
    s.connect(f); f.connect(ng); ng.connect(fx);
    s.start(at + 0.05); s.stop(at + 0.55);
  }

  // ── زئير ──
  const roar = (at0: number, dur: number, level: number) => {
    const at = t0 + at0;
    const o = track(c.createOscillator());
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, at);
    o.frequency.linearRampToValueAtTime(130, at + dur * 0.35);
    o.frequency.linearRampToValueAtTime(48, at + dur);
    const vib = track(c.createOscillator());
    vib.frequency.value = 17;
    const vg = keep(c.createGain());
    vg.gain.value = 9;
    vib.connect(vg); vg.connect(o.frequency);
    const f1 = keep(c.createBiquadFilter());
    f1.type = 'bandpass'; f1.Q.value = 2.2;
    f1.frequency.setValueAtTime(380, at);
    f1.frequency.linearRampToValueAtTime(900, at + dur * 0.4);
    f1.frequency.linearRampToValueAtTime(320, at + dur);
    const g = keep(c.createGain());
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(level, at + dur * 0.18);
    g.gain.setValueAtTime(level, at + dur * 0.62);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(f1); f1.connect(g); g.connect(fx);
    o.start(at); vib.start(at); o.stop(at + dur + 0.1); vib.stop(at + dur + 0.1);

    const s = noiseSrc();
    const nf = keep(c.createBiquadFilter());
    nf.type = 'bandpass'; nf.frequency.value = 1100; nf.Q.value = 0.7;
    const ng = keep(c.createGain());
    ng.gain.setValueAtTime(0.0001, at);
    ng.gain.linearRampToValueAtTime(level * 0.55, at + dur * 0.2);
    ng.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.connect(nf); nf.connect(ng); ng.connect(fx);
    s.start(at); s.stop(at + dur + 0.1);
  };
  roar(T.roarAt, 1.5, 0.55);
  roar(T.breathAt - 0.15, 0.9, 0.45);
  roar(T.burnAt - 0.5, 1.1, 0.5);

  // ── نار: هدير مستمر + طقطقة ──
  {
    const dur = T.breathEnd - T.breathAt + 1.2;
    const s = noiseSrc();
    const lp = keep(c.createBiquadFilter());
    lp.type = 'lowpass'; lp.frequency.value = 1800;
    const hp = keep(c.createBiquadFilter());
    hp.type = 'highpass'; hp.frequency.value = 90;
    const g = keep(c.createGain());
    g.gain.setValueAtTime(0.0001, t0 + T.breathAt - 0.1);
    g.gain.linearRampToValueAtTime(0.55, t0 + T.breathAt + 0.5);
    g.gain.setValueAtTime(0.55, t0 + T.breathEnd);
    g.gain.linearRampToValueAtTime(0.0001, t0 + T.breathAt + dur);
    const lfo = track(c.createOscillator());
    lfo.frequency.value = 6.5;
    const lg = keep(c.createGain());
    lg.gain.value = 0.12;
    lfo.connect(lg); lg.connect(g.gain);
    s.connect(hp); hp.connect(lp); lp.connect(g); g.connect(fx);
    s.start(t0 + T.breathAt - 0.1); s.stop(t0 + T.breathAt + dur);
    lfo.start(t0 + T.breathAt - 0.1); lfo.stop(t0 + T.breathAt + dur);

    // طقطقة
    for (let tt = T.breathAt; tt < T.breathAt + dur; tt += 0.045 + Math.random() * 0.07) {
      const at = t0 + tt;
      const cs = noiseSrc(false);
      const cf = keep(c.createBiquadFilter());
      cf.type = 'highpass'; cf.frequency.value = 1500 + Math.random() * 2500;
      const cg = keep(c.createGain());
      cg.gain.setValueAtTime(0.0001, at);
      cg.gain.linearRampToValueAtTime(0.12 + Math.random() * 0.14, at + 0.004);
      cg.gain.exponentialRampToValueAtTime(0.0001, at + 0.03 + Math.random() * 0.03);
      cs.connect(cf); cf.connect(cg); cg.connect(fx);
      cs.start(at); cs.stop(at + 0.09);
    }
  }

  // ── حرق الإطار: فحيح ──
  {
    const at = t0 + T.burnAt;
    const s = noiseSrc();
    const f = keep(c.createBiquadFilter());
    f.type = 'highpass'; f.frequency.value = 2400;
    const g = keep(c.createGain());
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.2, at + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 2.8);
    s.connect(f); f.connect(g); g.connect(fx);
    s.start(at); s.stop(at + 3);
  }

  // ── الموسيقى ──
  const music = c.createGain();
  music.gain.value = DRAGON_MUSIC_VOLUME;
  music.connect(master);
  nodes.push(music);

  const synthMusic = () => {
    if (stopped) return;
    // طبول ملحمية
    for (let tt = 0.6; tt < T.total - 1; tt += 0.62) {
      const at = t0 + tt;
      const strong = Math.round(tt / 0.62) % 4 === 0;
      const o = track(c.createOscillator());
      o.type = 'sine';
      o.frequency.setValueAtTime(strong ? 95 : 72, at);
      o.frequency.exponentialRampToValueAtTime(34, at + 0.32);
      const g = keep(c.createGain());
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(strong ? 0.7 : 0.4, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
      o.connect(g); g.connect(music);
      o.start(at); o.stop(at + 0.5);
    }
    // نحاسيات: وتر دقّة سلّمية (لا - دو - مي) تتصاعد مع الزئير والنار
    const chord = [55, 82.41, 110, 130.81];
    chord.forEach((fr, i) => {
      const o = track(c.createOscillator());
      o.type = 'sawtooth';
      o.frequency.value = fr * (i === 3 ? 1.0 : 1);
      o.detune.value = (i - 1.5) * 7;
      const f = keep(c.createBiquadFilter());
      f.type = 'lowpass';
      f.frequency.setValueAtTime(260, t0 + 1);
      f.frequency.linearRampToValueAtTime(1400, t0 + T.breathAt + 1);
      f.frequency.linearRampToValueAtTime(380, t0 + T.total - 1);
      const g = keep(c.createGain());
      g.gain.setValueAtTime(0.0001, t0 + 0.8);
      g.gain.linearRampToValueAtTime(0.1, t0 + T.roarAt);
      g.gain.linearRampToValueAtTime(0.16, t0 + T.breathAt + 1);
      g.gain.setValueAtTime(0.16, t0 + T.breathEnd);
      g.gain.linearRampToValueAtTime(0.0001, t0 + T.total - 0.8);
      o.connect(f); f.connect(g); g.connect(music);
      o.start(t0 + 0.8); o.stop(t0 + T.total);
    });
  };

  if (DRAGON_MUSIC_URL) {
    fetch(DRAGON_MUSIC_URL)
      .then(r => { if (!r.ok) throw new Error('music'); return r.arrayBuffer(); })
      .then(buf => c.decodeAudioData(buf))
      .then(ab => {
        if (stopped) return;
        const s = track(c.createBufferSource());
        s.buffer = ab;
        s.connect(music);
        s.start(c.currentTime);
        s.stop(t0 + T.total);
      })
      .catch(() => synthMusic());
  } else {
    synthMusic();
  }

  return () => {
    if (stopped) return;
    stopped = true;
    try {
      master.gain.cancelScheduledValues(c.currentTime);
      master.gain.setValueAtTime(master.gain.value, c.currentTime);
      master.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.25);
    } catch { /* ignore */ }
    window.setTimeout(() => {
      srcs.forEach(s => { try { s.stop(); } catch { /* ignore */ } });
      nodes.forEach(n => { try { n.disconnect(); } catch { /* ignore */ } });
      try { void c.close(); } catch { /* ignore */ }
    }, 320);
  };
}
