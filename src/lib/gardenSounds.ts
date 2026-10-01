/**
 * أصوات هدية الحديقة (Web Audio — بدون ملفات صوت).
 * المسار: src/lib/gardenSounds.ts (بجانب audio.ts و volcanoSounds.ts و zombieSounds.ts)
 *
 *  - عصافير بعدة أنواع (تغريدة، زقزقة سريعة، ترنيمة طويلة، هديل حمام، شحرور نازل) موزعة عشوائياً على الستيريو
 *  - نسيم خفيف بين أوراق الشجر
 *  - رنّة ناعمة عند نزول كل قلب على الزر أو على العشب (playGardenSound يرجع land())
 *  - وضع المستخدم: صوت صعود الإطار + سلّم لامع عند تحوّله لقلب + نبض قلب هادئ
 *
 * playGardenSound(plan) يجدول كل شيء على خط الزمن ويرجع { stop, land, burst }.
 */
import { getAudioCtx, noiseBuffer } from './audio';

export interface GardenSoundPlan {
  /** مدة الهدية الكلية (ثواني) */
  totalS: number;
  /** host = الدعم لصاحب البث ، user = الدعم لمتحدث (الإطار يصعد ويتحول لقلب) */
  mode: 'host' | 'user';
  /** نهاية دخول الحديقة (الأصوات تطلع تدريجياً) */
  fadeInS: number;
  /** بداية خروج الحديقة (الأصوات تنزل تدريجياً) */
  fadeOutAt: number;
  /** وضع المستخدم: بداية صعود الصورة */
  liftAt: number;
  /** وضع المستخدم: بداية تحول الإطار لقلب */
  morphAt: number;
  /** وضع المستخدم: بداية نزول الصورة */
  downAt: number;
}

export interface GardenSound {
  stop: () => void;
  /** يستدعى عند نزول قلب: colorIdx 0=أحمر 1=أصفر 2=أزرق 3=أخضر ، size 0..1 */
  land: (colorIdx: number, size?: number) => void;
  /** انفجار قلوب صغير (عند تحول الإطار) */
  burst: () => void;
}

const NOOP: GardenSound = { stop: () => { /* no audio */ }, land: () => { /* no audio */ }, burst: () => { /* no audio */ } };

// سلّم خماسي ناعم (C5 D5 E5 G5 A5 C6)
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
const COLOR_NOTE = [0, 2, 3, 1];   // أحمر / أصفر / أزرق / أخضر

export function playGardenSound(plan: GardenSoundPlan): GardenSound {
  const ctx = getAudioCtx();
  if (!ctx) return NOOP;

  const sources: AudioScheduledSourceNode[] = [];
  let stopped = false;

  const t0 = ctx.currentTime + 0.02;
  const at = (s: number) => Math.max(t0 + s, ctx.currentTime + 0.02);
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);

  // مستوى عام يطلع تدريجياً وينزل بالنهاية
  const m = ctx.createGain();
  m.gain.setValueAtTime(0.0001, t0);
  m.gain.linearRampToValueAtTime(0.95, t0 + Math.max(0.5, plan.fadeInS));
  m.gain.setValueAtTime(0.95, t0 + Math.max(1, plan.fadeOutAt));
  m.gain.linearRampToValueAtTime(0.0001, t0 + plan.totalS);
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

  // صدى حديقة خفيف
  const len = Math.floor(ctx.sampleRate * 1.5);
  const rb = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = rb.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const u = i / len;
      lp += ((Math.random() * 2 - 1) - lp) * (0.75 - 0.5 * u);
      d[i] = lp * Math.pow(1 - u, 2.6);
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = rb;
  const verbOut = ctx.createGain();
  verbOut.gain.value = 0.55;
  const verb = ctx.createGain();
  verb.gain.value = 0.6;
  verb.connect(conv); conv.connect(verbOut); verbOut.connect(comp);

  const wet = (node: AudioNode, amt: number) => {
    const w = ctx.createGain();
    w.gain.value = amt;
    node.connect(w);
    w.connect(verb);
  };
  const pan = (p: number): AudioNode | null => {
    try {
      const sp = ctx.createStereoPanner();
      sp.pan.value = Math.max(-1, Math.min(1, p));
      return sp;
    } catch { return null; }
  };
  const osc = (type: OscillatorType) => {
    const o = ctx.createOscillator();
    o.type = type;
    sources.push(o);
    return o;
  };
  const noise = (dur: number) => {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer(ctx, dur);
    sources.push(s);
    return s;
  };

  // يوصّل مصدر صوت للمستوى العام مع توزيع ستيريو وصدى
  const out = (node: AudioNode, p: number, wetAmt: number) => {
    const sp = pan(p);
    if (sp) { node.connect(sp); sp.connect(m); } else node.connect(m);
    wet(node, wetAmt);
  };

  // ── نسيم الأوراق ───────────────────────────────────────────────────────
  const breeze = () => {
    const t = at(0);
    const dur = plan.totalS;
    const n = noise(dur + 0.2);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 2100; f.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.value = 0.022;
    const lfo = osc('sine');
    lfo.frequency.value = 0.21;
    const lg = ctx.createGain(); lg.gain.value = 0.014;
    lfo.connect(lg); lg.connect(g.gain);
    const lfo2 = osc('sine');
    lfo2.frequency.value = 0.09;
    const lg2 = ctx.createGain(); lg2.gain.value = 500;
    lfo2.connect(lg2); lg2.connect(f.frequency);
    n.connect(f); f.connect(g); g.connect(m);
    n.start(t); n.stop(t + dur + 0.2);
    lfo.start(t); lfo.stop(t + dur + 0.2);
    lfo2.start(t); lfo2.stop(t + dur + 0.2);
  };

  // ── عصافير ─────────────────────────────────────────────────────────────
  // نغمة واحدة: تنزلق من f0 إلى f1 مع اهتزاز سريع
  const note = (s: number, f0: number, f1: number, dur: number, vol: number, p: number, vib = 28, wetAmt = 0.5, type: OscillatorType = 'sine') => {
    const t = at(s);
    const o = osc(type);
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t + dur);
    const lfo = osc('sine');
    lfo.frequency.value = vib + rnd(-4, 4);
    const lg = ctx.createGain(); lg.gain.value = f0 * 0.018;
    lfo.connect(lg); lg.connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 900;
    o.connect(g); g.connect(hp);
    out(hp, p, wetAmt);
    o.start(t); o.stop(t + dur + 0.05);
    lfo.start(t); lfo.stop(t + dur + 0.05);
  };

  // تغريدة: 2-4 نغمات صاعدة
  const tweet = (s: number, base: number, vol: number, p: number) => {
    const n = 2 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) note(s + i * 0.13, base * rnd(0.95, 1.05), base * rnd(1.3, 1.55), 0.085, vol, p);
  };
  // زقزقة سريعة (ترل)
  const trill = (s: number, base: number, vol: number, p: number) => {
    const n = 8 + ((Math.random() * 8) | 0);
    for (let i = 0; i < n; i++) note(s + i * 0.052, base * (i % 2 ? 1.18 : 1), base * (i % 2 ? 1.05 : 1.22), 0.04, vol * 0.8, p, 40, 0.4);
  };
  // ترنيمة طويلة متقلبة
  const warble = (s: number, base: number, vol: number, p: number) => {
    const n = 7 + ((Math.random() * 6) | 0);
    let f = base;
    for (let i = 0; i < n; i++) {
      const f1 = Math.max(1800, Math.min(5600, f * rnd(0.78, 1.32)));
      note(s + i * 0.115, f, f1, 0.1, vol, p, 22, 0.55);
      f = f1;
    }
  };
  // شحرور: نغمات نازلة رخيمة
  const robin = (s: number, base: number, vol: number, p: number) => {
    const seq = [1.4, 1.22, 1.05, 0.92, 0.84];
    seq.forEach((k, i) => note(s + i * 0.17, base * k * 1.06, base * k * 0.93, 0.14, vol * 0.9, p, 12, 0.7));
  };
  // هديل حمام (منخفض)
  const coo = (s: number, vol: number, p: number) => {
    note(s, 520, 470, 0.22, vol * 0.7, p, 6, 0.8);
    note(s + 0.3, 560, 440, 0.34, vol * 0.8, p, 6, 0.8);
    note(s + 0.72, 540, 430, 0.3, vol * 0.7, p, 6, 0.8);
  };

  const scheduleBirds = () => {
    const end = plan.totalS - 1.6;
    let tt = 0.35;
    while (tt < end) {
      const p = rnd(-0.9, 0.9);
      const far = Math.random() < 0.35;
      const vol = (far ? 0.03 : 0.055) * rnd(0.8, 1.2);
      const r = Math.random();
      if (r < 0.28) tweet(tt, rnd(3000, 4100), vol, p);
      else if (r < 0.5) trill(tt, rnd(3400, 4600), vol, p);
      else if (r < 0.72) warble(tt, rnd(2800, 4200), vol * 0.9, p);
      else if (r < 0.9) robin(tt, rnd(2200, 3000), vol, p);
      else coo(tt, vol * 1.1, p);
      // أحياناً عصفوران يتجاوبان
      if (Math.random() < 0.4) tweet(tt + rnd(0.5, 0.9), rnd(3200, 4400), vol * 0.7, -p);
      tt += rnd(0.45, 1.25);
    }
  };

  // ── رنّة نزول القلب ────────────────────────────────────────────────────
  let lastLand = -10;
  const land = (colorIdx: number, size = 0.5) => {
    if (stopped) return;
    const now = ctx.currentTime;
    if (now - lastLand < 0.07) return;
    lastLand = now;
    const k = COLOR_NOTE[((colorIdx % 4) + 4) % 4];
    const f = PENTA[(k + ((Math.random() * 2) | 0)) % PENTA.length] * (Math.random() < 0.3 ? 2 : 1);
    const t = now + 0.005;
    const o = osc('sine');
    const o2 = osc('triangle');
    o.frequency.value = f;
    o2.frequency.value = f * 2.005;
    const g = ctx.createGain();
    const v = 0.045 + 0.03 * Math.max(0, Math.min(1, size));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    o.connect(g); o2.connect(g2); g2.connect(g);
    out(g, rnd(-0.5, 0.5), 0.8);
    o.start(t); o.stop(t + 0.8);
    o2.start(t); o2.stop(t + 0.8);
  };

  const burst = () => {
    if (stopped) return;
    const base = ctx.currentTime + 0.01;
    for (let i = 0; i < 6; i++) {
      const t = base + i * 0.05;
      const f = PENTA[i % PENTA.length] * 1.5;
      const o = osc('sine');
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.04, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.connect(g);
      out(g, (i / 5) * 1.6 - 0.8, 0.9);
      o.start(t); o.stop(t + 0.6);
    }
  };

  // ── وضع المستخدم: صعود + تحول لقلب + نبض ─────────────────────────────
  const userFx = () => {
    // صعود الصورة: انزلاق لطيف
    {
      const t = at(plan.liftAt);
      const o = osc('sine');
      o.frequency.setValueAtTime(330, t);
      o.frequency.exponentialRampToValueAtTime(990, t + 1.3);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      o.connect(g);
      out(g, 0, 0.9);
      o.start(t); o.stop(t + 1.6);
    }
    // سلّم لامع عند تحول الإطار لقلب
    for (let i = 0; i < 8; i++) {
      const t = at(plan.morphAt + 0.1 + i * 0.09);
      const f = PENTA[i % PENTA.length] * (i >= 6 ? 2 : 1);
      const o = osc('sine');
      const o2 = osc('triangle');
      o.frequency.value = f;
      o2.frequency.value = f * 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      const g2 = ctx.createGain(); g2.gain.value = 0.2;
      o.connect(g); o2.connect(g2); g2.connect(g);
      out(g, -0.6 + i * 0.17, 0.9);
      o.start(t); o.stop(t + 1);
      o2.start(t); o2.stop(t + 1);
    }
    // نبض قلب هادئ (لَب-دَب) طول فترة ظهور القلب
    let b = plan.morphAt + 1.2;
    while (b < plan.downAt - 0.4) {
      for (const [dt, f, v] of [[0, 78, 0.16], [0.17, 66, 0.11]] as [number, number, number][]) {
        const t = at(b + dt);
        const o = osc('sine');
        o.frequency.setValueAtTime(f * 1.5, t);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.1);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(v, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
        o.connect(g); g.connect(m);
        o.start(t); o.stop(t + 0.28);
      }
      b += 0.95;
    }
    // نزول الصورة
    {
      const t = at(plan.downAt);
      const o = osc('sine');
      o.frequency.setValueAtTime(880, t);
      o.frequency.exponentialRampToValueAtTime(380, t + 0.9);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.04, t + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
      o.connect(g);
      out(g, 0, 0.8);
      o.start(t); o.stop(t + 1.1);
    }
  };

  breeze();
  scheduleBirds();
  if (plan.mode === 'user') userFx();

  return { stop: cleanup, land, burst };
}
