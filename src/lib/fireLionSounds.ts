/**
 * أصوات بداية هدية الأسد الناري (Web Audio — بدون ملفات):
 *  مطر خفيف + رياح منخفضة + رعد يتزامن مع ومضات البرق.
 *  تشتغل فقط بمرحلة البداية (قبل الفيديو) وتخفت تدريجياً لما يبدأ الفيديو،
 *  أما صوت الفيديو الأصلي فيشتغل كاملاً من الفيديو نفسه (ما نلمسه).
 */

/** توقيتات ومضات البرق (ms من بداية الهدية) — نفس القيم تُستخدم برسم البرق */
export const LIGHTNING_AT_MS = [650, 1700, 2500];

export interface IntroSounds {
  /** تخفيت تدريجي ثم إيقاف */
  fadeOut: (ms: number) => void;
  /** إيقاف فوري */
  stop: () => void;
}

const NOOP: IntroSounds = { fadeOut: () => {}, stop: () => {} };

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export function startFireLionIntroSounds(): IntroSounds {
  let ctx: AudioContext | null = null;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return NOOP;
    ctx = new AC();
  } catch {
    return NOOP;
  }
  const c = ctx;
  void c.resume().catch(() => { /* ignore */ });

  const master = c.createGain();
  master.gain.value = 0.0001;
  master.gain.linearRampToValueAtTime(0.55, c.currentTime + 0.5);
  master.connect(c.destination);

  const sources: AudioScheduledSourceNode[] = [];

  // مطر خفيف: ضجيج مفلتر
  const rain = c.createBufferSource();
  rain.buffer = noiseBuffer(c, 2);
  rain.loop = true;
  const rainHp = c.createBiquadFilter();
  rainHp.type = 'highpass';
  rainHp.frequency.value = 1200;
  const rainLp = c.createBiquadFilter();
  rainLp.type = 'lowpass';
  rainLp.frequency.value = 7000;
  const rainGain = c.createGain();
  rainGain.gain.value = 0.11;
  rain.connect(rainHp).connect(rainLp).connect(rainGain).connect(master);
  rain.start();
  sources.push(rain);

  // رياح/هدير منخفض
  const wind = c.createBufferSource();
  wind.buffer = noiseBuffer(c, 3);
  wind.loop = true;
  const windLp = c.createBiquadFilter();
  windLp.type = 'lowpass';
  windLp.frequency.value = 220;
  const windGain = c.createGain();
  windGain.gain.value = 0.28;
  wind.connect(windLp).connect(windGain).connect(master);
  wind.start();
  sources.push(wind);

  // رعد بعد كل ومضة برق (تأخير بسيط)
  const t0 = c.currentTime;
  LIGHTNING_AT_MS.forEach((ms, i) => {
    const at = t0 + ms / 1000 + 0.12;
    const dur = 1.5 + i * 0.25;
    const n = c.createBufferSource();
    n.buffer = noiseBuffer(c, dur + 0.2);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, at);
    lp.frequency.exponentialRampToValueAtTime(110, at + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(1.0, at + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    n.connect(lp).connect(g).connect(master);
    n.start(at);
    n.stop(at + dur + 0.2);
    sources.push(n);

    // دقّة منخفضة تحت الرعد
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(70, at);
    o.frequency.exponentialRampToValueAtTime(34, at + dur);
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, at);
    og.gain.exponentialRampToValueAtTime(0.7, at + 0.05);
    og.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(og).connect(master);
    o.start(at);
    o.stop(at + dur + 0.1);
    sources.push(o);
  });

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    sources.forEach(s => { try { s.stop(); } catch { /* ignore */ } });
    try { void c.close(); } catch { /* ignore */ }
  };

  return {
    fadeOut(ms: number) {
      if (closed) return;
      try {
        const now = c.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
        master.gain.linearRampToValueAtTime(0.0001, now + ms / 1000);
      } catch { /* ignore */ }
      window.setTimeout(close, ms + 80);
    },
    stop: close,
  };
}
