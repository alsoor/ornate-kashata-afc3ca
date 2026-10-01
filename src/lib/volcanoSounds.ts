/**
 * أصوات هدية البركان (Web Audio — بدون ملفات صوت).
 * المسار: src/lib/volcanoSounds.ts (بجانب audio.ts)
 *
 * الطبقات:
 *  - رياح     : هبّات رياح قوية + صفير في الظلام
 *  - هزّة     : رعد أرضي منخفض + تشققات صخور وقت طلوع البركان
 *  - ثوران    : دوي انفجار + هدير مستمر + طقطقة نار + فقاعات حمم + فحيح جمرات
 *  - برق      : صواعق داخل عمود الدخان (طقة + رعد)
 *  - شبح      : نغمة كورال مخيفة + عويل + ويش وقت يطلع من الفوهة
 *  - التاج    : اشتعال التاج (ووش + رنّة) ثم اختفاؤه (فرقعة)
 *
 *  playVolcanoSound(plan) : يجدول كل الأصوات حسب توقيت الأنميشن ويرجع دالة إيقاف
 */
import { getAudioCtx } from './audio';

export interface VolcanoSoundPlan {
  /** نهاية الرياح (ثانية) */
  windEnd: number;
  /** بداية الهزّة الأرضية */
  rumbleAt: number;
  /** بداية طلوع البركان من الأرض */
  riseAt: number;
  /** لحظة الانفجار الكبير */
  eruptAt: number;
  /** بداية هدوء الثوران */
  eruptFadeAt: number;
  /** نهاية الثوران */
  eruptEnd: number;
  /** خروج الشبح من الفوهة */
  ghostAt: number;
  /** وصول الشبح لصاحب البث */
  ghostArriveAt: number;
  /** لحظة نزول التاج على الرأس */
  crownAt: number;
  /** لحظة اختفاء التاج */
  crownEndAt: number;
  /** أوقات الصواعق (اختياري) */
  lightningTimes?: number[];
}

export function playVolcanoSound(plan: VolcanoSoundPlan): () => void {
  const ctx = getAudioCtx();
  const sources: AudioScheduledSourceNode[] = [];
  let master: GainNode | null = null;

  const cleanup = () => {
    if (ctx && master) {
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
        sources.forEach(s => { try { s.stop(ctx.currentTime + 0.15); } catch { /* ignore */ } });
      } catch { /* ignore */ }
    }
  };

  if (!ctx) return cleanup;
  if (ctx.state === 'suspended') ctx.resume().catch(() => { /* ignore */ });

  const t0 = ctx.currentTime + 0.03;
  const m = ctx.createGain();
  m.gain.value = 0.9;
  master = m;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 5;
  m.connect(comp);
  comp.connect(ctx.destination);

  // صدى واسع (للشبح والرعد)
  const space = ctx.createGain();
  const dly = ctx.createDelay(1);
  dly.delayTime.value = 0.21;
  const dlp = ctx.createBiquadFilter();
  dlp.type = 'lowpass';
  dlp.frequency.value = 1800;
  const fb = ctx.createGain();
  fb.gain.value = 0.38;
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  space.connect(dly);
  dly.connect(dlp);
  dlp.connect(fb);
  fb.connect(dly);
  dlp.connect(wet);
  wet.connect(comp);

  // ── مولّدات الضجيج (تتولّد مرة وحدة وتُعاد) ─────────────────────────────
  const BUF_S = 24;
  const mkNoise = (brown: boolean) => {
    const len = Math.floor(ctx.sampleRate * BUF_S);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return b;
  };
  const whiteBuf = mkNoise(false);
  const brownBuf = mkNoise(true);

  // طقطقة نار: نقرات عشوائية متفرقة
  const crackleDur = Math.max(4, plan.eruptEnd - plan.eruptAt + 3);
  const crackleBuf = (() => {
    const len = Math.floor(ctx.sampleRate * crackleDur);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let i = 0;
    while (i < len) {
      i += Math.floor(ctx.sampleRate * (0.004 + Math.random() * 0.05));
      const cl = Math.floor(ctx.sampleRate * (0.002 + Math.random() * 0.012));
      const a = 0.3 + Math.random() * 0.7;
      for (let j = 0; j < cl && i + j < len; j++) d[i + j] += (Math.random() * 2 - 1) * a * Math.pow(1 - j / cl, 2);
    }
    return b;
  })();

  const bufSrc = (b: AudioBuffer) => {
    const s = ctx.createBufferSource();
    s.buffer = b;
    sources.push(s);
    return s;
  };
  /** ضجيج من t ثانية لمدة dur */
  const nz = (brown: boolean, t: number, dur: number) => {
    const d = Math.min(dur, BUF_S - 4.5);
    const s = bufSrc(brown ? brownBuf : whiteBuf);
    s.start(t0 + t, Math.random() * 4);
    s.stop(t0 + t + d);
    return s;
  };
  const osc = (type: OscillatorType) => {
    const o = ctx.createOscillator();
    o.type = type;
    sources.push(o);
    return o;
  };
  const filt = (type: BiquadFilterType, f: number, q = 1) => {
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  };
  /** منحنى صوت: [وقت، مستوى] */
  const env = (g: GainNode, pts: [number, number][]) => {
    g.gain.setValueAtTime(Math.max(0.0001, pts[0][1]), t0 + pts[0][0]);
    for (let i = 1; i < pts.length; i++) g.gain.linearRampToValueAtTime(Math.max(0.0001, pts[i][1]), t0 + pts[i][0]);
  };
  const chain = (src: AudioNode, nodes: AudioNode[], toSpace = 0) => {
    let n: AudioNode = src;
    nodes.forEach(x => { n.connect(x); n = x; });
    n.connect(m);
    if (toSpace > 0) {
      const sg = ctx.createGain();
      sg.gain.value = toSpace;
      n.connect(sg);
      sg.connect(space);
    }
  };

  const { windEnd, rumbleAt, riseAt, eruptAt, eruptFadeAt, eruptEnd, ghostAt, ghostArriveAt, crownAt, crownEndAt } = plan;

  // ═══ الرياح ═══════════════════════════════════════════════════════════
  {
    const body = nz(false, 0, windEnd + 0.5);
    const bp = filt('bandpass', 500, 0.9);
    const wg = ctx.createGain();
    env(wg, [[0, 0], [1.4, 0.3], [eruptAt, 0.34], [eruptAt + 0.5, 0.14], [eruptFadeAt, 0.12], [windEnd, 0]]);
    chain(body, [bp, wg]);

    const low = nz(true, 0, windEnd + 0.5);
    const lp = filt('lowpass', 420);
    const lg = ctx.createGain();
    env(lg, [[0, 0], [1.6, 0.5], [eruptAt, 0.55], [eruptAt + 0.6, 0.2], [windEnd, 0]]);
    chain(low, [lp, lg]);

    const whistle = nz(false, 0, windEnd + 0.5);
    const wp = filt('bandpass', 1700, 14);
    const whg = ctx.createGain();
    env(whg, [[0, 0], [2, 0.07], [eruptAt, 0.08], [eruptAt + 0.4, 0.015], [windEnd, 0]]);
    chain(whistle, [wp, whg]);

    // هبّات: تتغير الترددات كل 1.2–2.4 ثانية
    let tt = 0;
    bp.frequency.setValueAtTime(420, t0);
    wp.frequency.setValueAtTime(1500, t0);
    while (tt < windEnd) {
      tt += 1.2 + Math.random() * 1.2;
      bp.frequency.linearRampToValueAtTime(350 + Math.random() * 900, t0 + tt);
      wp.frequency.linearRampToValueAtTime(1300 + Math.random() * 900, t0 + tt);
    }
  }

  // ═══ الهزّة الأرضية ═════════════════════════════════════════════════════
  {
    const rb = nz(true, rumbleAt, eruptEnd - rumbleAt + 1);
    const lp = filt('lowpass', 160);
    const rg = ctx.createGain();
    env(rg, [[rumbleAt, 0], [riseAt, 0.4], [riseAt + 1.5, 0.6], [eruptAt, 0.95], [eruptAt + 2, 0.6], [eruptFadeAt, 0.5], [eruptEnd, 0]]);
    chain(rb, [lp, rg]);

    const sub = osc('sine');
    sub.frequency.value = 36;
    const sg = ctx.createGain();
    env(sg, [[rumbleAt, 0], [riseAt, 0.25], [eruptAt, 0.55], [eruptFadeAt, 0.35], [eruptEnd, 0]]);
    const trem = osc('sine');
    trem.frequency.value = 6.5;
    const tg = ctx.createGain();
    tg.gain.value = 0.12;
    trem.connect(tg);
    tg.connect(sg.gain);
    sub.connect(sg);
    sg.connect(m);
    sub.start(t0 + rumbleAt); sub.stop(t0 + eruptEnd + 0.2);
    trem.start(t0 + rumbleAt); trem.stop(t0 + eruptEnd + 0.2);

    // تشققات صخور وقت طلوع البركان
    for (let i = 0; i < 9; i++) {
      const t = riseAt + Math.random() * (eruptAt - riseAt - 0.2);
      const n = nz(false, t, 0.12);
      const f = filt('bandpass', 220 + Math.random() * 700, 1.4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0 + t);
      g.gain.linearRampToValueAtTime(0.35, t0 + t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + t + 0.11);
      chain(n, [f, g]);
    }
  }

  // ═══ الانفجار الكبير ═══════════════════════════════════════════════════
  {
    const boom = osc('sine');
    const bg = ctx.createGain();
    boom.frequency.setValueAtTime(150, t0 + eruptAt);
    boom.frequency.exponentialRampToValueAtTime(26, t0 + eruptAt + 1.3);
    bg.gain.setValueAtTime(0.0001, t0 + eruptAt);
    bg.gain.linearRampToValueAtTime(1.0, t0 + eruptAt + 0.015);
    bg.gain.exponentialRampToValueAtTime(0.0001, t0 + eruptAt + 2.6);
    boom.connect(bg);
    bg.connect(m);
    boom.start(t0 + eruptAt); boom.stop(t0 + eruptAt + 2.7);

    const blast = nz(false, eruptAt, 2.6);
    const bl = filt('lowpass', 3000);
    bl.frequency.setValueAtTime(3000, t0 + eruptAt);
    bl.frequency.exponentialRampToValueAtTime(180, t0 + eruptAt + 1.8);
    const blg = ctx.createGain();
    blg.gain.setValueAtTime(0.0001, t0 + eruptAt);
    blg.gain.linearRampToValueAtTime(0.9, t0 + eruptAt + 0.02);
    blg.gain.exponentialRampToValueAtTime(0.0001, t0 + eruptAt + 2.5);
    chain(blast, [bl, blg], 0.25);

    const crack = nz(false, eruptAt, 0.35);
    const hp = filt('highpass', 1200);
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.7, t0 + eruptAt);
    cg.gain.exponentialRampToValueAtTime(0.0001, t0 + eruptAt + 0.3);
    chain(crack, [hp, cg]);

    // هدير مستمر
    const roar = nz(true, eruptAt, eruptEnd - eruptAt + 0.5);
    const rp = filt('bandpass', 450, 0.6);
    const rg = ctx.createGain();
    env(rg, [[eruptAt, 0], [eruptAt + 0.3, 1.1], [eruptAt + 3, 0.65], [eruptFadeAt, 0.55], [eruptEnd, 0]]);
    chain(roar, [rp, rg]);

    // هسهسة نافورة الحمم
    const hiss = nz(false, eruptAt, eruptEnd - eruptAt + 0.5);
    const hh = filt('highpass', 2500);
    const hg = ctx.createGain();
    env(hg, [[eruptAt, 0], [eruptAt + 0.4, 0.09], [eruptFadeAt, 0.07], [eruptEnd, 0]]);
    chain(hiss, [hh, hg]);

    // طقطقة النار
    const cr = bufSrc(crackleBuf);
    cr.start(t0 + eruptAt);
    const chp = filt('highpass', 1500);
    const crg = ctx.createGain();
    env(crg, [[eruptAt, 0], [eruptAt + 0.5, 0.5], [eruptFadeAt, 0.4], [eruptEnd, 0]]);
    chain(cr, [chp, crg]);

    // فقاعات حمم
    for (let i = 0; i < 18; i++) {
      const t = eruptAt + 0.6 + Math.random() * (eruptFadeAt - eruptAt - 0.6);
      const o = osc('sine');
      const g = ctx.createGain();
      const f0 = 90 + Math.random() * 90;
      o.frequency.setValueAtTime(f0, t0 + t);
      o.frequency.exponentialRampToValueAtTime(f0 * 2.2, t0 + t + 0.08);
      g.gain.setValueAtTime(0.0001, t0 + t);
      g.gain.linearRampToValueAtTime(0.14, t0 + t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + t + 0.14);
      o.connect(g); g.connect(m);
      o.start(t0 + t); o.stop(t0 + t + 0.16);
    }

    // فحيح جمرات تنزل على الأزرار
    for (let i = 0; i < 34; i++) {
      const t = eruptAt + 1 + Math.random() * (eruptEnd - eruptAt - 1.2);
      const n = nz(false, t, 0.16);
      const f = filt('highpass', 4200);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0 + t);
      g.gain.linearRampToValueAtTime(0.03 + Math.random() * 0.06, t0 + t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + t + 0.15);
      chain(n, [f, g]);
    }
  }

  // ═══ الصواعق ═══════════════════════════════════════════════════════════
  (plan.lightningTimes || []).forEach(t => {
    const c1 = nz(false, t, 0.3);
    const hp = filt('highpass', 2000);
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0.5, t0 + t);
    g1.gain.exponentialRampToValueAtTime(0.0001, t0 + t + 0.22);
    chain(c1, [hp, g1], 0.2);

    const th = nz(true, t + 0.12, 1.7);
    const lp = filt('lowpass', 260);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.0001, t0 + t + 0.12);
    g2.gain.linearRampToValueAtTime(0.7, t0 + t + 0.3);
    g2.gain.exponentialRampToValueAtTime(0.0001, t0 + t + 1.8);
    chain(th, [lp, g2], 0.3);
  });

  // ═══ الشبح ════════════════════════════════════════════════════════════
  {
    const gEnd = crownAt + 0.9;

    const wh = nz(false, ghostAt, 1.4);
    const wp = filt('bandpass', 300, 1.2);
    wp.frequency.setValueAtTime(300, t0 + ghostAt);
    wp.frequency.exponentialRampToValueAtTime(2000, t0 + ghostAt + 1.1);
    const wg = ctx.createGain();
    env(wg, [[ghostAt, 0], [ghostAt + 0.5, 0.24], [ghostAt + 1.3, 0]]);
    chain(wh, [wp, wg], 0.3);

    // كورال مخيف
    [196, 233.1, 293.7, 392].forEach((f, i) => {
      const o = osc(i % 2 ? 'triangle' : 'sine');
      o.frequency.value = f;
      const lfo = osc('sine');
      lfo.frequency.value = 4.6 + i * 0.5;
      const lg = ctx.createGain();
      lg.gain.value = 14;
      lfo.connect(lg);
      lg.connect(o.detune);
      const lp = filt('lowpass', 1400);
      const g = ctx.createGain();
      env(g, [[ghostAt, 0], [ghostAt + 1.2, 0.07], [ghostArriveAt, 0.1], [crownAt, 0.08], [gEnd, 0]]);
      o.connect(lp); lp.connect(g); g.connect(m);
      const sg = ctx.createGain();
      sg.gain.value = 0.5;
      g.connect(sg); sg.connect(space);
      o.start(t0 + ghostAt); o.stop(t0 + gEnd + 0.1);
      lfo.start(t0 + ghostAt); lfo.stop(t0 + gEnd + 0.1);
    });

    // عويل
    const wail = osc('sine');
    wail.frequency.setValueAtTime(330, t0 + ghostAt + 0.2);
    wail.frequency.exponentialRampToValueAtTime(560, t0 + ghostAt + 1.6);
    wail.frequency.exponentialRampToValueAtTime(420, t0 + ghostArriveAt);
    const wlg = ctx.createGain();
    env(wlg, [[ghostAt + 0.2, 0], [ghostAt + 1.0, 0.06], [ghostArriveAt - 0.5, 0.05], [ghostArriveAt, 0]]);
    const wlp = filt('lowpass', 1200);
    wail.connect(wlp); wlp.connect(wlg); wlg.connect(m);
    const wls = ctx.createGain();
    wls.gain.value = 0.6;
    wlg.connect(wls); wls.connect(space);
    wail.start(t0 + ghostAt + 0.2); wail.stop(t0 + ghostArriveAt + 0.1);
  }

  // ═══ التاج ════════════════════════════════════════════════════════════
  {
    // اشتعال
    const ig = nz(false, crownAt - 0.1, 0.7);
    const ip = filt('bandpass', 600, 1);
    ip.frequency.setValueAtTime(600, t0 + crownAt - 0.1);
    ip.frequency.exponentialRampToValueAtTime(3000, t0 + crownAt + 0.4);
    const igg = ctx.createGain();
    env(igg, [[crownAt - 0.1, 0], [crownAt + 0.1, 0.3], [crownAt + 0.6, 0]]);
    chain(ig, [ip, igg], 0.25);

    const wh = osc('sine');
    wh.frequency.setValueAtTime(95, t0 + crownAt);
    wh.frequency.exponentialRampToValueAtTime(48, t0 + crownAt + 0.4);
    const whg = ctx.createGain();
    whg.gain.setValueAtTime(0.0001, t0 + crownAt);
    whg.gain.linearRampToValueAtTime(0.5, t0 + crownAt + 0.02);
    whg.gain.exponentialRampToValueAtTime(0.0001, t0 + crownAt + 0.5);
    wh.connect(whg); whg.connect(m);
    wh.start(t0 + crownAt); wh.stop(t0 + crownAt + 0.55);

    // رنّة ملكية
    [880, 1318.5, 1760].forEach((f, i) => {
      const o = osc('sine');
      const g = ctx.createGain();
      const ts = t0 + crownAt + 0.03 + i * 0.05;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ts);
      g.gain.exponentialRampToValueAtTime(0.06, ts + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, ts + 1.6);
      o.connect(g); g.connect(m);
      const sg = ctx.createGain();
      sg.gain.value = 0.5;
      g.connect(sg); sg.connect(space);
      o.start(ts); o.stop(ts + 1.7);
    });

    // لهيب التاج طول ما هو على الرأس
    const fl = nz(true, crownAt, crownEndAt - crownAt + 0.1);
    const flp = filt('lowpass', 900);
    const flg = ctx.createGain();
    env(flg, [[crownAt, 0], [crownAt + 0.2, 0.3], [crownEndAt - 0.2, 0.25], [crownEndAt + 0.1, 0]]);
    chain(fl, [flp, flg]);

    const cc = bufSrc(crackleBuf);
    cc.start(t0 + crownAt, 0);
    cc.stop(t0 + crownEndAt + 0.1);
    const cch = filt('highpass', 1800);
    const ccg = ctx.createGain();
    env(ccg, [[crownAt, 0], [crownAt + 0.1, 0.45], [crownEndAt, 0.4], [crownEndAt + 0.1, 0]]);
    chain(cc, [cch, ccg]);

    // اختفاء: فرقعة + رنّة نازلة
    const pop = nz(false, crownEndAt, 0.4);
    const pp = filt('bandpass', 1800, 0.9);
    const pg = ctx.createGain();
    pg.gain.setValueAtTime(0.5, t0 + crownEndAt);
    pg.gain.exponentialRampToValueAtTime(0.0001, t0 + crownEndAt + 0.35);
    chain(pop, [pp, pg], 0.3);

    const dn = osc('triangle');
    const dg = ctx.createGain();
    dn.frequency.setValueAtTime(1500, t0 + crownEndAt);
    dn.frequency.exponentialRampToValueAtTime(180, t0 + crownEndAt + 0.6);
    dg.gain.setValueAtTime(0.0001, t0 + crownEndAt);
    dg.gain.linearRampToValueAtTime(0.14, t0 + crownEndAt + 0.02);
    dg.gain.exponentialRampToValueAtTime(0.0001, t0 + crownEndAt + 0.65);
    dn.connect(dg); dg.connect(m);
    dn.start(t0 + crownEndAt); dn.stop(t0 + crownEndAt + 0.7);
  }

  return cleanup;
}
