/**
 * أصوات هدية الزومبي (Web Audio — بدون ملفات صوت).
 * المسار: src/lib/zombieSounds.ts (بجانب audio.ts و heartSounds.ts و stormSounds.ts)
 *
 *  - ذئاب تعوي من بعيد (عدة عويلات بنبرات مختلفة)
 *  - صراصير الليل (3 أصوات متداخلة طول الهدية)
 *  - رياح مظلمة تحت كل شيء
 *  - تراب يتكسر + خدش أظافر + اهتزاز الأرض عند خروج الزومبي
 *  - أنين زومبي (3 أصوات: اليمين / اليسار / المنتصف)
 *  - تمزيق الصدر (وضع القلب) + نبض القلب (لَب-دَب) + رمية القلب + ارتطامه عند صاحب البث
 *  - ابتلاع الصورة داخل الجسد + ضحكة شريرة عالية (وضع الصورة)
 *  - playZombieSound(plan) : يجدول كل شيء على خط الزمن ويرجع دالة إيقاف
 *
 * تسجيلات حقيقية (اختياري): ضع الملفات في public/sounds ثم مرّر روابطها من ZombieGift.tsx
 *     public/sounds/zombie-howl.mp3   public/sounds/zombie-crickets.mp3   public/sounds/zombie-laugh.mp3
 * لو الملف غير موجود أو لا يمكن فك تشفيره يشتغل الصوت المولَّد بالكود بدلاً منه.
 */
import { getAudioCtx, noiseBuffer } from './audio';

export interface ZombieSoundPlan {
  /** مدة الهدية الكلية (ثواني) */
  totalS: number;
  /** heart = القلب يُرمى لصاحب البث ، avatar = الزومبي يبتلع صورة المستخدم ويضحك */
  mode: 'heart' | 'avatar';
  /** أوقات عواء الذئاب */
  howls: number[];
  /** تشقق الأرض / الاهتزاز */
  crackAt: number;
  /** خروج زومبي اليمين واليسار */
  sideAt: number;
  /** خروج زومبي المنتصف */
  midAt: number;
  /** تمزيق الصدر (القلب) أو الإمساك بالصورة (الصورة) */
  ripAt: number;
  /** أوقات نبضات القلب (فارغة في وضع الصورة) */
  beats: number[];
  /** رمية القلب */
  throwAt: number;
  /** وصول القلب لصاحب البث */
  arriveAt: number;
  /** ابتلاع الصورة */
  gulpAt: number;
  /** بداية الضحكة ومدتها (laughS = 0 → بدون ضحك) */
  laughAt: number;
  laughS: number;
  /** زئير الزومبي (وضع القلب) — سالب = بدون */
  roarAt: number;
  /** بداية غرق الزومبي بالأرض */
  sinkAt: number;
  howlUrl?: string;
  cricketsUrl?: string;
  laughUrl?: string;
}

const shaperCurve = (k: number) => {
  const n = 256;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return c;
};

export function playZombieSound(plan: ZombieSoundPlan): () => void {
  const ctx = getAudioCtx();
  if (!ctx) return () => { /* no audio available */ };

  const sources: AudioScheduledSourceNode[] = [];
  let stopped = false;

  const t0 = ctx.currentTime + 0.02;
  // وقت مطلق (ثواني الهدية → ساعة الصوت). لو الصوت تأخر يبدأ فوراً
  const at = (s: number) => Math.max(t0 + s, ctx.currentTime + 0.02);

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

  // صدى المقبرة (يعطي الأصوات مساحة كبيرة)
  const len = Math.floor(ctx.sampleRate * 2.6);
  const rb = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = rb.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const u = i / len;
      lp += ((Math.random() * 2 - 1) - lp) * (0.5 - 0.4 * u);
      d[i] = lp * Math.pow(1 - u, 2.2);
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = rb;
  const verbOut = ctx.createGain();
  verbOut.gain.value = 0.7;
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
  const wet = (node: AudioNode, amt: number) => {
    const w = ctx.createGain();
    w.gain.value = amt;
    node.connect(w);
    w.connect(verb);
  };

  // ── Wind bed ───────────────────────────────────────────────────────────────
  const wind = () => {
    const t = at(0);
    const dur = plan.totalS;
    const n = noise(dur + 0.2);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 320; f.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.07, t + 2);
    g.gain.setValueAtTime(0.07, t + dur - 2);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const lfo = osc('sine');
    lfo.frequency.value = 0.17;
    const lg = ctx.createGain(); lg.gain.value = 0.03;
    lfo.connect(lg); lg.connect(g.gain);
    n.connect(f); f.connect(g); g.connect(m);
    n.start(t); n.stop(t + dur + 0.2);
    lfo.start(t); lfo.stop(t + dur + 0.2);
  };

  // ── Wolf howl ──────────────────────────────────────────────────────────────
  const howl = (s: number, f0: number, dur: number, vol: number, far: number) => {
    const t = at(s);
    const o = osc('sawtooth');
    const o2 = osc('triangle');
    const mult = [0.8, 1.45, 1.62, 1.5, 0.92];
    const tm = [0, 0.22, 0.5, 0.75, 1];
    mult.forEach((k, i) => {
      const tt = t + tm[i] * dur;
      if (i === 0) {
        o.frequency.setValueAtTime(f0 * k, tt);
        o2.frequency.setValueAtTime(f0 * k * 2, tt);
      } else {
        o.frequency.linearRampToValueAtTime(f0 * k, tt);
        o2.frequency.linearRampToValueAtTime(f0 * k * 2, tt);
      }
    });
    const lfo = osc('sine');
    lfo.frequency.value = 5 + Math.random() * 1.2;
    const lg = ctx.createGain(); lg.gain.value = f0 * 0.02;
    lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1500 - far * 700; lp.Q.value = 0.8;
    const fb = ctx.createBiquadFilter();
    fb.type = 'peaking'; fb.frequency.value = 780; fb.Q.value = 1.4; fb.gain.value = 7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.2);
    g.gain.setValueAtTime(vol, t + dur * 0.68);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const og = ctx.createGain(); og.gain.value = 0.5;
    const o2g = ctx.createGain(); o2g.gain.value = 0.22;
    o.connect(og); o2.connect(o2g);
    og.connect(lp); o2g.connect(lp);
    lp.connect(fb); fb.connect(g); g.connect(m);
    wet(g, 0.9);

    // نَفَس خفيف مع العواء
    const n = noise(dur + 0.2);
    const nb = ctx.createBiquadFilter();
    nb.type = 'bandpass'; nb.frequency.value = 1700; nb.Q.value = 0.8;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.linearRampToValueAtTime(vol * 0.12, t + dur * 0.25);
    ng.gain.linearRampToValueAtTime(0.0001, t + dur);
    n.connect(nb); nb.connect(ng); ng.connect(m);

    o.start(t); o.stop(t + dur + 0.1);
    o2.start(t); o2.stop(t + dur + 0.1);
    lfo.start(t); lfo.stop(t + dur + 0.1);
    n.start(t); n.stop(t + dur + 0.2);
  };

  const howls = () => {
    plan.howls.forEach((s, i) => {
      const base = 330 + (i % 3) * 38;
      howl(s, base, 3.2 + (i % 2) * 0.6, 0.2, 0.2);
      howl(s + 0.9, base * 1.22, 2.6, 0.12, 0.8);   // ذئب ثاني يرد من بعيد
    });
  };

  // ── Crickets ───────────────────────────────────────────────────────────────
  const crickets = () => {
    const t = at(0.3);
    const dur = plan.totalS - 0.6;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.05, t + 2);
    env.gain.setValueAtTime(0.05, t + dur - 2.4);
    env.gain.linearRampToValueAtTime(0.0001, t + dur);
    env.connect(m);
    [4300, 4650, 5100].forEach((f, i) => {
      const o = osc('sine');
      o.frequency.value = f + i * 35;
      const p = ctx.createGain(); p.gain.value = 0.5;          // نبضات سريعة (الصرير)
      const am = osc('square'); am.frequency.value = 26 + i * 3;
      const amg = ctx.createGain(); amg.gain.value = 0.5;
      am.connect(amg); amg.connect(p.gain);
      const q = ctx.createGain(); q.gain.value = 0.5;          // مجموعات متقطعة
      const gate = osc('square'); gate.frequency.value = 2 + i * 0.55;
      const gg = ctx.createGain(); gg.gain.value = 0.5;
      gate.connect(gg); gg.connect(q.gain);
      o.connect(p); p.connect(q); q.connect(env);
      o.start(t); o.stop(t + dur + 0.1);
      am.start(t); am.stop(t + dur + 0.1);
      gate.start(t); gate.stop(t + dur + 0.1);
    });
  };

  // ── Soil / claws / rumble ──────────────────────────────────────────────────
  const dig = (s: number, dur: number, p: number) => {
    const t = at(s);
    const n = noise(dur + 0.3);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 170;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.55 * p, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    n.connect(lp); lp.connect(g); g.connect(m);
    n.start(t); n.stop(t + dur + 0.3);

    const sb = osc('sine');
    const sg = ctx.createGain();
    sb.frequency.setValueAtTime(52, t);
    sb.frequency.linearRampToValueAtTime(34, t + dur);
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.linearRampToValueAtTime(0.4 * p, t + dur * 0.4);
    sg.gain.linearRampToValueAtTime(0.0001, t + dur);
    sb.connect(sg); sg.connect(m);
    sb.start(t); sb.stop(t + dur + 0.1);

    // تراب يتكسر
    const bursts = Math.floor(dur * 16);
    for (let i = 0; i < bursts; i++) {
      const tb = t + Math.random() * dur;
      const bd = 0.04 + Math.random() * 0.06;
      const bn = noise(bd + 0.02);
      const bf = ctx.createBiquadFilter();
      bf.type = 'bandpass'; bf.frequency.value = 300 + Math.random() * 700; bf.Q.value = 0.9;
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.0001, tb);
      bg.gain.linearRampToValueAtTime((0.1 + Math.random() * 0.22) * p, tb + 0.005);
      bg.gain.exponentialRampToValueAtTime(0.0001, tb + bd);
      bn.connect(bf); bf.connect(bg); bg.connect(m);
      bn.start(tb); bn.stop(tb + bd + 0.02);
    }
    // خدش أظافر
    for (let i = 0; i < 7; i++) {
      const tc = t + dur * 0.3 + Math.random() * dur * 0.7;
      const cd = 0.08 + Math.random() * 0.1;
      const cn = noise(cd + 0.02);
      const cf = ctx.createBiquadFilter();
      cf.type = 'highpass'; cf.frequency.value = 2200 + Math.random() * 1800;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.0001, tc);
      cg.gain.linearRampToValueAtTime(0.05 * p, tc + 0.02);
      cg.gain.exponentialRampToValueAtTime(0.0001, tc + cd);
      cn.connect(cf); cf.connect(cg); cg.connect(m);
      cn.start(tc); cn.stop(tc + cd + 0.02);
    }
  };

  // ── Zombie groan ───────────────────────────────────────────────────────────
  const groan = (s: number, f0: number, dur: number, p: number, vowel: 0 | 1) => {
    const t = at(s);
    const o = osc('sawtooth');
    o.frequency.setValueAtTime(f0 * 1.18, t);
    o.frequency.linearRampToValueAtTime(f0, t + 0.28);
    o.frequency.linearRampToValueAtTime(f0 * 0.7, t + dur);
    const lfo = osc('sine');
    lfo.frequency.value = 6.2;
    const lg = ctx.createGain(); lg.gain.value = f0 * 0.035;
    lfo.connect(lg); lg.connect(o.frequency);

    const ws = ctx.createWaveShaper();
    ws.curve = shaperCurve(22);
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass'; f1.Q.value = 4;
    f1.frequency.setValueAtTime(vowel ? 760 : 520, t);
    f1.frequency.linearRampToValueAtTime(vowel ? 560 : 430, t + dur);
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass'; f2.Q.value = 5;
    f2.frequency.setValueAtTime(vowel ? 1180 : 900, t);
    f2.frequency.linearRampToValueAtTime(vowel ? 900 : 760, t + dur);
    const f2g = ctx.createGain(); f2g.gain.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.45 * p, t + 0.22);
    g.gain.setValueAtTime(0.4 * p, t + dur * 0.6);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(ws);
    ws.connect(f1); ws.connect(f2);
    f1.connect(g); f2.connect(f2g); f2g.connect(g);
    g.connect(m);
    wet(g, 0.55);

    const n = noise(dur + 0.2);
    const nb = ctx.createBiquadFilter();
    nb.type = 'bandpass'; nb.frequency.value = 900; nb.Q.value = 0.9;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.linearRampToValueAtTime(0.1 * p, t + 0.25);
    ng.gain.linearRampToValueAtTime(0.0001, t + dur);
    n.connect(nb); nb.connect(ng); ng.connect(m);

    o.start(t); o.stop(t + dur + 0.1);
    lfo.start(t); lfo.stop(t + dur + 0.1);
    n.start(t); n.stop(t + dur + 0.2);
  };

  // ── Heartbeat (lub-dub) ────────────────────────────────────────────────────
  const beat = (s: number, p: number) => {
    const t = at(s);
    const one = (tt: number, f: number, vol: number, d: number) => {
      const o = osc('sine');
      const g = ctx.createGain();
      o.frequency.setValueAtTime(f, tt);
      o.frequency.exponentialRampToValueAtTime(f * 0.58, tt + d);
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.linearRampToValueAtTime(vol, tt + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + d);
      o.connect(g); g.connect(m);
      o.start(tt); o.stop(tt + d + 0.02);
    };
    one(t, 78, 0.95 * p, 0.14);
    one(t + 0.17, 66, 0.65 * p, 0.12);
    // رطوبة خفيفة
    const n = noise(0.12);
    const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 420;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.linearRampToValueAtTime(0.1 * p, t + 0.01);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    n.connect(nf); nf.connect(ng); ng.connect(m);
    n.start(t); n.stop(t + 0.14);
  };

  // ── Flesh tear + squelch ───────────────────────────────────────────────────
  const tear = (s: number, dur: number) => {
    const t = at(s);
    const n = noise(dur + 0.1);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(380, t);
    bp.frequency.linearRampToValueAtTime(1500, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + dur * 0.2);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const lfo = osc('square');
    lfo.frequency.value = 17;
    const lg = ctx.createGain(); lg.gain.value = 0.2;
    lfo.connect(lg); lg.connect(g.gain);
    n.connect(bp); bp.connect(g); g.connect(m);
    n.start(t); n.stop(t + dur + 0.1);
    lfo.start(t); lfo.stop(t + dur + 0.1);

    const o = osc('sine');
    const og = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(48, t + dur);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.linearRampToValueAtTime(0.45, t + dur * 0.3);
    og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(og); og.connect(m);
    o.start(t); o.stop(t + dur + 0.05);
  };

  const whoosh = (s: number, dur: number, p: number) => {
    const t = at(s);
    const n = noise(dur + 0.1);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(350, t);
    bp.frequency.exponentialRampToValueAtTime(3000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5 * p, t + dur * 0.5);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    n.connect(bp); bp.connect(g); g.connect(m);
    n.start(t); n.stop(t + dur + 0.1);
  };

  const splat = (s: number, p: number) => {
    const t = at(s);
    const o = osc('sine');
    const g = ctx.createGain();
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.8 * p, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    o.connect(g); g.connect(m);
    wet(g, 0.5);
    o.start(t); o.stop(t + 0.36);
    const n = noise(0.25);
    const nf = ctx.createBiquadFilter(); nf.type = 'lowpass';
    nf.frequency.setValueAtTime(2600, t);
    nf.frequency.exponentialRampToValueAtTime(260, t + 0.22);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.5 * p, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    n.connect(nf); nf.connect(ng); ng.connect(m);
    n.start(t); n.stop(t + 0.25);
  };

  const gulp = (s: number) => {
    const t = at(s);
    [0, 0.22].forEach((d, i) => {
      const o = osc('sine');
      const g = ctx.createGain();
      o.frequency.setValueAtTime(300 - i * 40, t + d);
      o.frequency.exponentialRampToValueAtTime(90, t + d + 0.2);
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.linearRampToValueAtTime(0.7, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.22);
      o.connect(g); g.connect(m);
      o.start(t + d); o.stop(t + d + 0.25);
    });
    tear(s - 0.05, 0.4);
  };

  // ── Evil laugh ─────────────────────────────────────────────────────────────
  const ha = (s: number, f0: number, d: number, p: number) => {
    const t = Math.max(s, ctx.currentTime + 0.02);
    const o = osc('sawtooth');
    o.frequency.setValueAtTime(f0 * 1.12, t);
    o.frequency.linearRampToValueAtTime(f0 * 0.82, t + d);
    const sub = osc('sawtooth');
    sub.frequency.setValueAtTime(f0 * 0.5, t);
    sub.frequency.linearRampToValueAtTime(f0 * 0.42, t + d);
    const ws = ctx.createWaveShaper();
    ws.curve = shaperCurve(18);
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass'; f1.Q.value = 5;
    f1.frequency.setValueAtTime(820, t);
    f1.frequency.linearRampToValueAtTime(640, t + d);
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass'; f2.Q.value = 6; f2.frequency.value = 1280;
    const f2g = ctx.createGain(); f2g.gain.value = 0.55;
    const sg = ctx.createGain(); sg.gain.value = 0.45;
    const lpS = ctx.createBiquadFilter(); lpS.type = 'lowpass'; lpS.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.9 * p, t + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(ws);
    ws.connect(f1); ws.connect(f2);
    f1.connect(g); f2.connect(f2g); f2g.connect(g);
    sub.connect(lpS); lpS.connect(sg); sg.connect(g);
    g.connect(m);
    wet(g, 0.5);
    o.start(t); o.stop(t + d + 0.05);
    sub.start(t); sub.stop(t + d + 0.05);

    // "هـ" الهواء في بداية كل ضحكة
    const n = noise(0.12);
    const nb = ctx.createBiquadFilter(); nb.type = 'bandpass'; nb.frequency.value = 1500; nb.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.linearRampToValueAtTime(0.28 * p, t + 0.015);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    n.connect(nb); nb.connect(ng); ng.connect(m);
    n.start(t); n.stop(t + 0.12);
  };

  const laugh = (s: number, dur: number) => {
    const t = at(s);
    // "هووواا" طويلة ثم "ها ها ها ها"
    ha(t, 150, 0.55, 1);
    const step = 0.25;
    const n = Math.max(1, Math.floor((dur - 0.6) / step));
    for (let i = 0; i < n; i++) {
      const f = 205 - i * 2.4 + (i % 2 ? 9 : 0);
      ha(t + 0.62 + i * step, f, 0.2, 0.95 - i * 0.008);
    }
  };

  // ── Real recordings (optional) ─────────────────────────────────────────────
  const load = (url: string) =>
    fetch(url)
      .then(r => { if (!r.ok) throw new Error('zombie'); return r.arrayBuffer(); })
      .then(buf => new Promise<AudioBuffer>((res, rej) => { ctx.decodeAudioData(buf, res, rej); }));

  const withRec = (url: string | undefined, real: (ab: AudioBuffer) => void, fallback: () => void) => {
    if (!url) { fallback(); return; }
    load(url)
      .then(ab => { if (!stopped) real(ab); })
      .catch(() => { if (!stopped) fallback(); });
  };
  const playBuf = (ab: AudioBuffer, s: number, vol: number, loop = false, until = 0) => {
    const src = ctx.createBufferSource();
    src.buffer = ab;
    src.loop = loop;
    sources.push(src);
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g); g.connect(m);
    wet(g, 0.3);
    const t = at(s);
    src.start(t);
    if (until > 0) src.stop(at(until));
  };

  // ── Scheduling ─────────────────────────────────────────────────────────────
  wind();

  withRec(plan.howlUrl, ab => plan.howls.forEach(s => playBuf(ab, s, 0.8)), howls);
  withRec(plan.cricketsUrl, ab => playBuf(ab, 0.3, 0.5, true, plan.totalS - 0.3), crickets);

  // الأرض تهتز وتتشقق
  dig(plan.crackAt, 1.4, 0.7);
  // زومبي اليمين واليسار يخرجون ويزحفون
  dig(plan.sideAt, 1.8, 0.9);
  dig(plan.sideAt + 0.35, 1.8, 0.9);
  groan(plan.sideAt + 1.1, 112, 1.5, 0.9, 0);
  groan(plan.sideAt + 1.6, 98, 1.6, 0.9, 1);
  groan(plan.sideAt + 4.4, 105, 1.4, 0.7, 0);
  // زومبي المنتصف يخرج
  dig(plan.midAt, 2.0, 1);
  groan(plan.midAt + 1.5, 82, 2.0, 1, 1);

  if (plan.mode === 'heart') {
    tear(plan.ripAt, 0.9);
    plan.beats.forEach(b => beat(b, 0.9));
    groan(plan.ripAt + 0.9, 74, 1.5, 1, 1);
    if (plan.roarAt >= 0) groan(plan.roarAt, 70, 1.8, 1, 1);
    whoosh(plan.throwAt, 0.5, 1);
    splat(plan.arriveAt, 0.9);
  } else {
    groan(plan.ripAt, 76, 1.2, 0.9, 1);
    gulp(plan.gulpAt);
    if (plan.laughS > 0) {
      withRec(plan.laughUrl, ab => playBuf(ab, plan.laughAt, 1), () => laugh(plan.laughAt, plan.laughS));
    }
  }

  // الغرق بالأرض
  dig(plan.sinkAt, 2.2, 0.8);
  groan(plan.sinkAt + 0.2, 90, 1.5, 0.6, 0);

  return cleanup;
}
