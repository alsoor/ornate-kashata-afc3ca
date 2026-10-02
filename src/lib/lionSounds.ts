/**
 * أصوات هدية الأسد (Lion) — Web Audio، بدون ملفات صوت خارجية.
 * يُستدعى من LionGift.Animation ويعيد دالة إيقاف.
 *
 * مسار مقترح: src/lib/lionSounds.ts
 */
type LionSoundOpts = {
  runEnd?: number;   // نهاية الركض (ث)
  roarAt?: number;   // بداية الزئير
  roarEnd?: number;  // نهاية الزئير
  total?: number;    // المدة الكلية
};

function ctx(): AudioContext | null {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const c = new AC();
    if (c.state === 'suspended') void c.resume();
    return c;
  } catch {
    return null;
  }
}

function noiseBuffer(ac: AudioContext, seconds: number): AudioBuffer {
  const n = Math.max(1, Math.floor(ac.sampleRate * seconds));
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** خطوات ركض خفيفة + غبار صوتي */
function playRunSteps(ac: AudioContext, start: number, end: number, master: GainNode) {
  const stepEvery = 0.22;
  for (let t = start; t < end; t += stepEvery) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    g.connect(master);

    const o = ac.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(90 + Math.random() * 40, t);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.14);

    // ضربة غبار قصيرة
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, 0.08);
    const ng = ac.createGain();
    ng.gain.setValueAtTime(0.06, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 400 + Math.random() * 300;
    f.Q.value = 0.8;
    src.connect(f);
    f.connect(ng);
    ng.connect(master);
    src.start(t);
    src.stop(t + 0.08);
  }
}

/** زئير أسد مركّب: نغمة منخفضة + ضوضاء + اهتزاز */
function playRoar(ac: AudioContext, at: number, dur: number, master: GainNode) {
  const attack = 0.12;
  const hold = Math.max(0.4, dur * 0.55);
  const release = Math.max(0.3, dur - attack - hold);

  // جسم الزئير (نغمة منخفضة متذبذبة)
  const body = ac.createOscillator();
  body.type = 'sawtooth';
  body.frequency.setValueAtTime(85, at);
  body.frequency.linearRampToValueAtTime(55, at + attack + hold * 0.4);
  body.frequency.linearRampToValueAtTime(70, at + attack + hold);
  body.frequency.linearRampToValueAtTime(40, at + dur);

  const bodyG = ac.createGain();
  bodyG.gain.setValueAtTime(0, at);
  bodyG.gain.linearRampToValueAtTime(0.55, at + attack);
  bodyG.gain.setValueAtTime(0.5, at + attack + hold);
  bodyG.gain.exponentialRampToValueAtTime(0.001, at + dur);

  const bodyF = ac.createBiquadFilter();
  bodyF.type = 'lowpass';
  bodyF.frequency.setValueAtTime(320, at);
  bodyF.frequency.linearRampToValueAtTime(180, at + dur);
  bodyF.Q.value = 1.2;

  body.connect(bodyF);
  bodyF.connect(bodyG);
  bodyG.connect(master);
  body.start(at);
  body.stop(at + dur + 0.05);

  // توافقي أعلى (خشونة)
  const harm = ac.createOscillator();
  harm.type = 'square';
  harm.frequency.setValueAtTime(170, at);
  harm.frequency.linearRampToValueAtTime(110, at + dur);
  const harmG = ac.createGain();
  harmG.gain.setValueAtTime(0, at);
  harmG.gain.linearRampToValueAtTime(0.12, at + attack);
  harmG.gain.exponentialRampToValueAtTime(0.001, at + dur);
  harm.connect(harmG);
  harmG.connect(master);
  harm.start(at);
  harm.stop(at + dur + 0.05);

  // ضوضاء الزئير (حلق/نفس)
  const noise = ac.createBufferSource();
  noise.buffer = noiseBuffer(ac, dur + 0.2);
  const nF = ac.createBiquadFilter();
  nF.type = 'bandpass';
  nF.frequency.setValueAtTime(600, at);
  nF.frequency.linearRampToValueAtTime(280, at + dur);
  nF.Q.value = 0.6;
  const nG = ac.createGain();
  nG.gain.setValueAtTime(0, at);
  nG.gain.linearRampToValueAtTime(0.35, at + attack);
  nG.gain.setValueAtTime(0.28, at + attack + hold * 0.7);
  nG.gain.exponentialRampToValueAtTime(0.001, at + dur);
  noise.connect(nF);
  nF.connect(nG);
  nG.connect(master);
  noise.start(at);
  noise.stop(at + dur + 0.05);

  // نبضة افتتاح قوية
  const punch = ac.createOscillator();
  punch.type = 'sine';
  punch.frequency.setValueAtTime(55, at);
  punch.frequency.exponentialRampToValueAtTime(30, at + 0.25);
  const punchG = ac.createGain();
  punchG.gain.setValueAtTime(0, at);
  punchG.gain.linearRampToValueAtTime(0.7, at + 0.04);
  punchG.gain.exponentialRampToValueAtTime(0.001, at + 0.35);
  punch.connect(punchG);
  punchG.connect(master);
  punch.start(at);
  punch.stop(at + 0.4);
}

/**
 * يشغّل تسلسل أصوات الأسد ويعيد دالة إيقاف (تقطع كل شيء).
 */
export function playLionSound(opts: LionSoundOpts = {}): () => void {
  const ac = ctx();
  if (!ac) return () => {};

  const runEnd = opts.runEnd ?? 2.0;
  const roarAt = opts.roarAt ?? 2.35;
  const roarEnd = opts.roarEnd ?? 4.2;
  const total = opts.total ?? 5.2;
  const t0 = ac.currentTime + 0.03;

  const master = ac.createGain();
  master.gain.value = 0.85;
  master.connect(ac.destination);

  playRunSteps(ac, t0, t0 + runEnd, master);
  playRoar(ac, t0 + roarAt, Math.max(0.5, roarEnd - roarAt), master);

  // هسهسة خفيفة أثناء الاختفاء
  const fadeStart = t0 + roarEnd;
  const fadeDur = Math.max(0.2, total - roarEnd);
  try {
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, fadeDur + 0.1);
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 200;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.08, fadeStart);
    g.gain.exponentialRampToValueAtTime(0.001, fadeStart + fadeDur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(fadeStart);
    src.stop(fadeStart + fadeDur + 0.05);
  } catch { /* ignore */ }

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    try {
      master.gain.cancelScheduledValues(ac.currentTime);
      master.gain.setValueAtTime(master.gain.value, ac.currentTime);
      master.gain.linearRampToValueAtTime(0, ac.currentTime + 0.08);
    } catch { /* ignore */ }
    window.setTimeout(() => {
      try { ac.close(); } catch { /* ignore */ }
    }, 120);
  };
}

export default playLionSound;
