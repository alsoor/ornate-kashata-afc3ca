/**
 * أصوات هدية الساحرة (Web Audio — بدون ملفات صوت).
 * المسار: lib/gifts/witchSounds.ts
 *
 *  - footstep : صوت حذاء/كعب وهي تمشي على بوكس الرسائل
 *  - smooch   : صوت بوسة ناعمة (شفط خفيف + فرقعة + نَفَس)
 *  - chime    : رنّة سحرية صغيرة تلمع مع البوسة
 *  - playWitchSound(plan) : يجدول كل الأصوات حسب توقيت الأنميشن ويرجع دالة إيقاف
 *
 * لتغيير صوت البوسة بصوت حقيقي مسجّل: مرّر kissUrl في الخطة (يُضبط من WitchGift.tsx → KISS_URL).
 */
import { getAudioCtx, noiseBuffer } from './audio';

export interface WitchSoundPlan {
  /** أوقات وقع الخطوات بالثواني (من بداية الأنميشن) */
  stepTimes: number[];
  /** وقت البوسة الكبيرة الموجهة لصاحب البث */
  kissAt: number;
  /** وقت وصول البوسة لصاحب البث */
  arriveAt: number;
  /** وقت بداية خروج البوسات من فمها */
  burstAt: number;
  /** مدة خروج البوسات */
  burstSpan: number;
  /** عدد أصوات البوسات الصغيرة */
  burstCount: number;
  /** ملف صوت بوسة حقيقي (اختياري) */
  kissUrl?: string;
}

export function playWitchSound(plan: WitchSoundPlan): () => void {
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
        master.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
        sources.forEach(s => { try { s.stop(ctx.currentTime + 0.1); } catch { /* ignore */ } });
      } catch { /* ignore */ }
    }
  };

  if (plan.kissUrl) {
    timers.push(window.setTimeout(() => {
      try {
        const a = new Audio(plan.kissUrl);
        a.volume = 1;
        audios.push(a);
        void a.play().catch(() => { /* ignore */ });
      } catch { /* ignore */ }
    }, plan.kissAt * 1000));
  }

  if (!ctx) return cleanup;

  const t0 = ctx.currentTime + 0.02;
  const m = ctx.createGain();
  m.gain.value = 0.9;
  master = m;
  const comp = ctx.createDynamicsCompressor();
  m.connect(comp);
  comp.connect(ctx.destination);

  // صدى خفيف يعطي البوسات نعومة وجمال
  const dly = ctx.createDelay(0.5);
  dly.delayTime.value = 0.09;
  const dlp = ctx.createBiquadFilter();
  dlp.type = 'lowpass';
  dlp.frequency.value = 3500;
  const fb = ctx.createGain();
  fb.gain.value = 0.3;
  const wet = ctx.createGain();
  wet.gain.value = 0.22;
  m.connect(dly);
  dly.connect(dlp);
  dlp.connect(fb);
  fb.connect(dly);
  dlp.connect(wet);
  wet.connect(comp);

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

  // ── خطوة حذاء: ضربة كعب + طقة + رنين الصندوق ─────────────────────────
  const footstep = (t: number, i: number) => {
    const f = i % 2 ? 1.1 : 0.95;
    const j = 0.96 + Math.random() * 0.08;

    const th = osc('sine');
    const thg = ctx.createGain();
    th.frequency.setValueAtTime(210 * f * j, t);
    th.frequency.exponentialRampToValueAtTime(80, t + 0.08);
    thg.gain.setValueAtTime(0.42, t);
    thg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    th.connect(thg); thg.connect(m);
    th.start(t); th.stop(t + 0.14);

    const ck = noise(0.05);
    const ckf = ctx.createBiquadFilter();
    ckf.type = 'bandpass';
    ckf.frequency.value = 2400 * f * j;
    ckf.Q.value = 1.3;
    const ckg = ctx.createGain();
    ckg.gain.setValueAtTime(0.3, t);
    ckg.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    ck.connect(ckf); ckf.connect(ckg); ckg.connect(m);
    ck.start(t); ck.stop(t + 0.05);

    const bd = noise(0.09);
    const bdf = ctx.createBiquadFilter();
    bdf.type = 'lowpass';
    bdf.frequency.value = 700;
    const bdg = ctx.createGain();
    bdg.gain.setValueAtTime(0.18, t);
    bdg.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    bd.connect(bdf); bdf.connect(bdg); bdg.connect(m);
    bd.start(t); bd.stop(t + 0.09);
  };

  // ── بوسة ناعمة ─────────────────────────────────────────────────────────
  const smooch = (t: number, vol: number, pitch: number) => {
    const tp = t + 0.095;

    // "مم" شفط الشفاه (صعود ناعم)
    const o = osc('sine');
    o.frequency.setValueAtTime(420 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(1100 * pitch, tp);
    const olp = ctx.createBiquadFilter();
    olp.type = 'lowpass';
    olp.frequency.value = 2200;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.linearRampToValueAtTime(0.2 * vol, t + 0.05);
    og.gain.exponentialRampToValueAtTime(0.0001, tp + 0.02);
    o.connect(olp); olp.connect(og); og.connect(m);
    o.start(t); o.stop(tp + 0.04);

    // جسم ناعم منخفض
    const body = osc('sine');
    body.frequency.setValueAtTime(260 * pitch, t);
    body.frequency.exponentialRampToValueAtTime(200 * pitch, tp + 0.05);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.linearRampToValueAtTime(0.1 * vol, t + 0.04);
    bg.gain.exponentialRampToValueAtTime(0.0001, tp + 0.06);
    body.connect(bg); bg.connect(m);
    body.start(t); body.stop(tp + 0.08);

    // "مواه" الفرقعة اللطيفة
    const pn = noise(0.05);
    const pf = ctx.createBiquadFilter();
    pf.type = 'bandpass';
    pf.frequency.value = 1900 * pitch;
    pf.Q.value = 2.2;
    const pg = ctx.createGain();
    pg.gain.setValueAtTime(0.38 * vol, tp);
    pg.gain.exponentialRampToValueAtTime(0.0001, tp + 0.04);
    pn.connect(pf); pf.connect(pg); pg.connect(m);
    pn.start(tp); pn.stop(tp + 0.05);

    const po = osc('triangle');
    po.frequency.setValueAtTime(1700 * pitch, tp);
    po.frequency.exponentialRampToValueAtTime(520 * pitch, tp + 0.07);
    const pog = ctx.createGain();
    pog.gain.setValueAtTime(0.24 * vol, tp);
    pog.gain.exponentialRampToValueAtTime(0.0001, tp + 0.09);
    po.connect(pog); pog.connect(m);
    po.start(tp); po.stop(tp + 0.1);

    // نَفَس خفيف بعد البوسة
    const br = noise(0.2);
    const bf = ctx.createBiquadFilter();
    bf.type = 'bandpass';
    bf.frequency.value = 3200;
    bf.Q.value = 0.8;
    const brg = ctx.createGain();
    brg.gain.setValueAtTime(0.0001, tp);
    brg.gain.linearRampToValueAtTime(0.06 * vol, tp + 0.03);
    brg.gain.exponentialRampToValueAtTime(0.0001, tp + 0.18);
    br.connect(bf); bf.connect(brg); brg.connect(m);
    br.start(tp); br.stop(tp + 0.2);
  };

  // ── رنّة سحرية صغيرة ───────────────────────────────────────────────────
  const chime = (t: number, vol: number) => {
    [1760, 2217, 2637].forEach((f, i) => {
      const o = osc('sine');
      const g = ctx.createGain();
      const ts = t + i * 0.07;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ts);
      g.gain.exponentialRampToValueAtTime(0.05 * vol, ts + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, ts + 0.5);
      o.connect(g); g.connect(m);
      o.start(ts); o.stop(ts + 0.55);
    });
  };

  // ── صوت تحليق البوسة نحو صاحب البث ─────────────────────────────────────
  const whoosh = (t: number, dur: number) => {
    const n = noise(dur + 0.1);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.1;
    f.frequency.setValueAtTime(700, t);
    f.frequency.exponentialRampToValueAtTime(3200, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f); f.connect(g); g.connect(m);
    n.start(t); n.stop(t + dur + 0.1);
  };

  // الجدولة
  plan.stepTimes.forEach((s, i) => footstep(t0 + s, i));

  const tk = t0 + plan.kissAt;
  if (!plan.kissUrl) smooch(tk, 1, 1);
  chime(tk + 0.06, 1);
  whoosh(tk + 0.08, Math.max(0.3, plan.arriveAt - plan.kissAt - 0.1));
  chime(t0 + plan.arriveAt, 0.8);

  chime(t0 + plan.burstAt, 0.7);
  for (let i = 0; i < plan.burstCount; i++) {
    const t = t0 + plan.burstAt + (i / plan.burstCount) * plan.burstSpan + Math.random() * 0.05;
    smooch(t, 0.28 + Math.random() * 0.3, 0.9 + Math.random() * 0.5);
    if (i % 5 === 2) chime(t + 0.05, 0.4);
  }

  return cleanup;
}
