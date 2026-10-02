/**
 * أصوات هدية التنين الناري (DragonFire) — 10,000 Coins
 *
 * ملاحظة مهمة: صرخة التنين وأصوات المشهد الأصلية تجي من ملف الفيديو نفسه (public/gifts/dragon-roar.mp4)
 * وتشتغل تلقائياً بالمكوّن. هذا الملف يضيف فقط أجواء مساندة (Web Audio) بدون أي ملفات صوت:
 *   قبل الفيديو : رياح عاصفة + طنين خوف منخفض يتصاعد + رعد بعيد
 *   أثناء الفيديو: كل المؤثرات تنزل لمستوى منخفض جداً عشان الصرخة تطلع واضحة (ducking)
 *   بعد الفيديو : فرقعة جمر + (لو الهدية لمستخدم) وشّة صعود + رنّة نار لإطار صورته
 *
 * الاستخدام: const stop = playDragonFireSound({...}); وعند الإلغاء/النهاية: stop();
 */

export interface DragonSoundOptions {
  /** ثانية دخول الفيديو */
  videoAt: number;
  /** ثانية نهاية الفيديو */
  videoEnd: number;
  /** أوقات الرعد (قبل/أثناء الفيديو) */
  thunderTimes: number[];
  /** لو الهدية لمستخدم: ثانية بداية صعود إطاره + وصوله لمنتصف الشاشة (وإلا null) */
  liftAt: number | null;
  liftArriveAt: number | null;
  /** نهاية الهدية (للإطفاء الناعم) */
  endAt: number;
}

type AC = AudioContext;
let sharedCtx: AC | null = null;

function getCtx(): AC | null {
  try {
    if (sharedCtx && sharedCtx.state !== 'closed') return sharedCtx;
    const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Ctor) return null;
    sharedCtx = new Ctor();
    return sharedCtx;
  } catch {
    return null;
  }
}

function noiseBuffer(ctx: AC, seconds: number, kind: 'white' | 'brown' = 'white'): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return buf;
}

/** فرقعة جمر: نبضات قصيرة متناثرة (تتكرر بحلقة) */
function crackleBuffer(ctx: AC, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const clicks = Math.floor(seconds * 38);
  for (let n = 0; n < clicks; n++) {
    const at = Math.floor(Math.random() * (len - 600));
    const amp = 0.25 + Math.random() * 0.75;
    const dur = 40 + Math.floor(Math.random() * 380);
    for (let i = 0; i < dur; i++) d[at + i] += (Math.random() * 2 - 1) * amp * Math.pow(1 - i / dur, 3);
  }
  return buf;
}

export function playDragonFireSound(o: DragonSoundOptions): () => void {
  const ctx = getCtx();
  if (!ctx) return () => {};
  try { if (ctx.state === 'suspended') void ctx.resume(); } catch { /* ignore */ }

  const T0 = ctx.currentTime + 0.05;
  const at = (s: number) => T0 + Math.max(0, s);
  const nodes: AudioNode[] = [];
  const srcs: (AudioScheduledSourceNode)[] = [];
  const keep = <N extends AudioNode>(n: N): N => { nodes.push(n); return n; };

  const master = keep(ctx.createGain());
  master.gain.setValueAtTime(0.0001, T0);
  master.gain.exponentialRampToValueAtTime(0.9, at(0.8));
  const comp = keep(ctx.createDynamicsCompressor());
  comp.threshold.value = -16;
  comp.ratio.value = 5;
  master.connect(comp);
  comp.connect(ctx.destination);

  // مستوى الأجواء: عالي قبل الفيديو، ينخفض تحت صوت الفيديو (ducking)، يرجع بعد نهايته
  const amb = keep(ctx.createGain());
  amb.gain.setValueAtTime(1, T0);
  amb.gain.setValueAtTime(1, at(o.videoAt - 0.5));
  amb.gain.linearRampToValueAtTime(0.1, at(o.videoAt + 0.8));
  amb.gain.setValueAtTime(0.1, at(o.videoEnd - 1.2));
  amb.gain.linearRampToValueAtTime(1, at(o.videoEnd + 0.4));
  amb.connect(master);

  const start = (s: AudioScheduledSourceNode, t: number, stopT?: number) => {
    srcs.push(s);
    s.start(t);
    if (stopT != null) s.stop(stopT);
  };

  // ── رياح عاصفة (ضجيج مفلتر مع تموّج) ──
  const wind = ctx.createBufferSource();
  wind.buffer = noiseBuffer(ctx, 4, 'brown');
  wind.loop = true;
  const windLP = keep(ctx.createBiquadFilter());
  windLP.type = 'bandpass';
  windLP.frequency.value = 420;
  windLP.Q.value = 0.8;
  const windG = keep(ctx.createGain());
  windG.gain.setValueAtTime(0.0001, T0);
  windG.gain.linearRampToValueAtTime(0.55, at(1.4));
  windG.gain.setValueAtTime(0.55, at(o.videoAt));
  windG.gain.linearRampToValueAtTime(0.0001, at(o.videoAt + 3));
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.22;
  const lfoG = keep(ctx.createGain());
  lfoG.gain.value = 260;
  lfo.connect(lfoG);
  lfoG.connect(windLP.frequency);
  wind.connect(windLP); windLP.connect(windG); windG.connect(amb);
  start(wind, T0, at(o.videoAt + 3.2));
  start(lfo, T0, at(o.videoAt + 3.2));

  // ── طنين تحذيري منخفض يتصاعد قبل دخول التنين ──
  const dr = [55, 55.7, 82.4].map((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = i === 2 ? 'triangle' : 'sawtooth';
    osc.frequency.setValueAtTime(f * 0.9, T0);
    osc.frequency.exponentialRampToValueAtTime(f * 1.12, at(o.videoAt));
    return osc;
  });
  const drLP = keep(ctx.createBiquadFilter());
  drLP.type = 'lowpass';
  drLP.frequency.setValueAtTime(120, T0);
  drLP.frequency.exponentialRampToValueAtTime(520, at(o.videoAt));
  const drG = keep(ctx.createGain());
  drG.gain.setValueAtTime(0.0001, T0);
  drG.gain.linearRampToValueAtTime(0.22, at(o.videoAt - 0.1));
  drG.gain.linearRampToValueAtTime(0.0001, at(o.videoAt + 2.4));
  dr.forEach(osc => { osc.connect(drLP); start(osc, T0, at(o.videoAt + 2.6)); });
  drLP.connect(drG); drG.connect(amb);

  // ── رعد ──
  const thunder = (t: number, power = 1) => {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(ctx, 3, 'brown');
    const lp = keep(ctx.createBiquadFilter());
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, at(t));
    lp.frequency.exponentialRampToValueAtTime(80, at(t + 2.2));
    const g = keep(ctx.createGain());
    g.gain.setValueAtTime(0.0001, at(t));
    g.gain.linearRampToValueAtTime(0.95 * power, at(t + 0.05));
    g.gain.exponentialRampToValueAtTime(0.001, at(t + 2.6));
    n.connect(lp); lp.connect(g); g.connect(amb);
    start(n, at(t), at(t + 2.8));
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(70, at(t));
    sub.frequency.exponentialRampToValueAtTime(30, at(t + 1.4));
    const sg = keep(ctx.createGain());
    sg.gain.setValueAtTime(0.0001, at(t));
    sg.gain.linearRampToValueAtTime(0.7 * power, at(t + 0.04));
    sg.gain.exponentialRampToValueAtTime(0.001, at(t + 1.6));
    sub.connect(sg); sg.connect(amb);
    start(sub, at(t), at(t + 1.8));
  };
  o.thunderTimes.forEach((t, i) => thunder(t, i === 0 ? 0.8 : 1));

  // ── ضربة دخول التنين (تحت صوت الفيديو، تعطيه ثقل) ──
  {
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(90, at(o.videoAt));
    sub.frequency.exponentialRampToValueAtTime(28, at(o.videoAt + 1.8));
    const g = keep(ctx.createGain());
    g.gain.setValueAtTime(0.0001, at(o.videoAt));
    g.gain.linearRampToValueAtTime(0.5, at(o.videoAt + 0.05));
    g.gain.exponentialRampToValueAtTime(0.001, at(o.videoAt + 2));
    sub.connect(g); g.connect(master);
    start(sub, at(o.videoAt), at(o.videoAt + 2.2));
  }

  // ── فرقعة جمر بعد الفيديو (وتستمر لنهاية الهدية) ──
  {
    const cr = ctx.createBufferSource();
    cr.buffer = crackleBuffer(ctx, 2);
    cr.loop = true;
    const hp = keep(ctx.createBiquadFilter());
    hp.type = 'highpass';
    hp.frequency.value = 1400;
    const g = keep(ctx.createGain());
    g.gain.setValueAtTime(0.0001, at(o.videoEnd - 2));
    g.gain.linearRampToValueAtTime(0.5, at(o.videoEnd));
    g.gain.setValueAtTime(0.5, at(o.endAt - 1.5));
    g.gain.linearRampToValueAtTime(0.0001, at(o.endAt));
    cr.connect(hp); hp.connect(g); g.connect(master);
    start(cr, at(o.videoEnd - 2), at(o.endAt + 0.2));
  }

  // ── لو الهدية لمستخدم: وشّة صعود إطاره + رنّة نار عند وصوله لمنتصف الشاشة ──
  if (o.liftAt != null && o.liftArriveAt != null) {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(ctx, 2, 'white');
    const bp = keep(ctx.createBiquadFilter());
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(300, at(o.liftAt));
    bp.frequency.exponentialRampToValueAtTime(3200, at(o.liftArriveAt));
    const g = keep(ctx.createGain());
    g.gain.setValueAtTime(0.0001, at(o.liftAt));
    g.gain.linearRampToValueAtTime(0.55, at(o.liftArriveAt - 0.35));
    g.gain.exponentialRampToValueAtTime(0.001, at(o.liftArriveAt + 0.5));
    n.connect(bp); bp.connect(g); g.connect(master);
    start(n, at(o.liftAt), at(o.liftArriveAt + 0.6));

    [392, 587.3, 784, 1174.7].forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const og = keep(ctx.createGain());
      const t = o.liftArriveAt! + i * 0.06;
      og.gain.setValueAtTime(0.0001, at(t));
      og.gain.linearRampToValueAtTime(0.16, at(t + 0.03));
      og.gain.exponentialRampToValueAtTime(0.001, at(t + 1.6));
      osc.connect(og); og.connect(master);
      start(osc, at(t), at(t + 1.7));
    });
  }

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
    window.setTimeout(() => {
      srcs.forEach(s => { try { s.stop(); } catch { /* ignore */ } try { s.disconnect(); } catch { /* ignore */ } });
      nodes.forEach(n => { try { n.disconnect(); } catch { /* ignore */ } });
    }, 320);
  };
}
