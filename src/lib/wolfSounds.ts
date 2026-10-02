/**
 * أصوات هدية الذئب (WolfGift) — WebAudio بدون ملفات صوت.
 *
 * ملاحظة مهمة: صرخة الذئب نفسها (وصوت الرعد والرياح الأصلي) موجودة داخل الفيديو ويشغّلها الفيديو كما هو.
 * هذا الملف يضيف فقط طبقة خفيفة حول الفيديو: رياح ليل + طنين عميق + نجوم تلمع + رعد + نبض قلب قبل
 * وصول الذئب + دوي مع الصرخة + صوت سحري لحظة صعود إطار المستخدم.
 *
 * يرجع كائن تحكم (WolfSound) تستدعيه WolfGift.tsx بالتوقيت الفعلي، فيبقى الصوت متزامن حتى لو الفيديو تأخر.
 */

export interface WolfSound {
  /** يخفّض طبقة الخلفية أثناء تشغيل الفيديو (عشان الصرخة تطلع واضحة) أو يرجّعها */
  duck: (on: boolean) => void;
  /** رعد (strength من 0 إلى 1) */
  thunder: (strength?: number) => void;
  /** نبضتين قلب منخفضتين (توتر قبل وصول الذئب) */
  heartbeat: () => void;
  /** دوي عميق (يتزامن مع موجات الصرخة) */
  boom: (strength?: number) => void;
  /** لمعة نجمة صغيرة */
  sparkle: () => void;
  /** صوت سحري لحظة صعود إطار المستخدم / ختام الهدية */
  rise: () => void;
  /** إيقاف كل شيء */
  stop: () => void;
}

const NOOP: WolfSound = {
  duck: () => {}, thunder: () => {}, heartbeat: () => {}, boom: () => {},
  sparkle: () => {}, rise: () => {}, stop: () => {},
};

export function createWolfSound(): WolfSound {
  let ctx: AudioContext;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return NOOP;
    ctx = new AC();
    void ctx.resume?.();
  } catch {
    return NOOP;
  }

  const master = ctx.createGain();
  master.gain.value = 0.0001;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 6;
  master.connect(comp);
  comp.connect(ctx.destination);
  master.gain.setTargetAtTime(0.5, ctx.currentTime, 0.6);

  // ── ضجيج أبيض مشترك ──
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  {
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const noiseSrc = () => {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    return s;
  };

  const live: AudioScheduledSourceNode[] = [];
  const track = <T extends AudioScheduledSourceNode>(n: T): T => { live.push(n); return n; };

  // ── رياح الليل (ضجيج مفلتر يتمايل) ──
  const windG = ctx.createGain();
  windG.gain.value = 0.0001;
  windG.gain.setTargetAtTime(0.33, ctx.currentTime, 0.9);
  const windBP = ctx.createBiquadFilter();
  windBP.type = 'bandpass';
  windBP.frequency.value = 520;
  windBP.Q.value = 0.8;
  const windLfo = track(ctx.createOscillator());
  windLfo.frequency.value = 0.13;
  const windLfoG = ctx.createGain();
  windLfoG.gain.value = 260;
  windLfo.connect(windLfoG);
  windLfoG.connect(windBP.frequency);
  const wn = track(noiseSrc());
  wn.connect(windBP);
  windBP.connect(windG);
  windG.connect(master);
  windLfo.start();
  wn.start();

  // ── طنين عميق (يعطي ثقل للظلام) ──
  const droneG = ctx.createGain();
  droneG.gain.value = 0.0001;
  droneG.gain.setTargetAtTime(0.2, ctx.currentTime, 1.4);
  const droneLP = ctx.createBiquadFilter();
  droneLP.type = 'lowpass';
  droneLP.frequency.value = 260;
  const d1 = track(ctx.createOscillator());
  d1.type = 'sine';
  d1.frequency.value = 55;
  const d2 = track(ctx.createOscillator());
  d2.type = 'triangle';
  d2.frequency.value = 82.6;
  const d3 = track(ctx.createOscillator());
  d3.type = 'sine';
  d3.frequency.value = 110.4;
  const d3g = ctx.createGain();
  d3g.gain.value = 0.35;
  d1.connect(droneLP);
  d2.connect(droneLP);
  d3.connect(d3g);
  d3g.connect(droneLP);
  droneLP.connect(droneG);
  droneG.connect(master);
  d1.start();
  d2.start();
  d3.start();

  const now = () => ctx.currentTime;

  const env = (g: GainNode, t0: number, peak: number, attack: number, decay: number) => {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  };

  let stopped = false;

  return {
    duck(on) {
      if (stopped) return;
      const t = now();
      windG.gain.setTargetAtTime(on ? 0.1 : 0.33, t, 0.5);
      droneG.gain.setTargetAtTime(on ? 0.12 : 0.2, t, 0.6);
    },

    thunder(strength = 0.6) {
      if (stopped) return;
      const t = now();
      // طقطقة البداية
      const crack = track(noiseSrc());
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1800;
      const cg = ctx.createGain();
      env(cg, t, 0.5 * strength, 0.004, 0.14);
      crack.connect(hp);
      hp.connect(cg);
      cg.connect(master);
      crack.start(t);
      crack.stop(t + 0.3);
      // الدوي العميق
      const rum = track(noiseSrc());
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(420, t);
      lp.frequency.exponentialRampToValueAtTime(70, t + 2.4);
      const rg = ctx.createGain();
      env(rg, t + 0.05, 1.0 * strength, 0.08, 2.3);
      rum.connect(lp);
      lp.connect(rg);
      rg.connect(master);
      rum.start(t);
      rum.stop(t + 2.8);
    },

    heartbeat() {
      if (stopped) return;
      const t = now();
      [0, 0.24].forEach((dt, i) => {
        const o = track(ctx.createOscillator());
        o.type = 'sine';
        o.frequency.setValueAtTime(i ? 52 : 62, t + dt);
        o.frequency.exponentialRampToValueAtTime(30, t + dt + 0.2);
        const g = ctx.createGain();
        env(g, t + dt, i ? 0.55 : 0.8, 0.012, 0.22);
        o.connect(g);
        g.connect(master);
        o.start(t + dt);
        o.stop(t + dt + 0.4);
      });
    },

    boom(strength = 0.8) {
      if (stopped) return;
      const t = now();
      const o = track(ctx.createOscillator());
      o.type = 'sine';
      o.frequency.setValueAtTime(78, t);
      o.frequency.exponentialRampToValueAtTime(28, t + 0.9);
      const g = ctx.createGain();
      env(g, t, 0.9 * strength, 0.01, 0.9);
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + 1.1);
    },

    sparkle() {
      if (stopped) return;
      const t = now();
      const f = 2200 + Math.random() * 2800;
      const o = track(ctx.createOscillator());
      o.type = 'sine';
      o.frequency.value = f;
      const o2 = track(ctx.createOscillator());
      o2.type = 'sine';
      o2.frequency.value = f * 1.5;
      const g = ctx.createGain();
      env(g, t, 0.07, 0.005, 0.5);
      o.connect(g);
      o2.connect(g);
      g.connect(master);
      o.start(t);
      o2.start(t);
      o.stop(t + 0.6);
      o2.stop(t + 0.6);
    },

    rise() {
      if (stopped) return;
      const t = now();
      // سلم نغمات صاعد
      [523.25, 659.25, 783.99, 987.77, 1318.5, 1568].forEach((f, i) => {
        const o = track(ctx.createOscillator());
        o.type = i % 2 ? 'triangle' : 'sine';
        o.frequency.value = f;
        const g = ctx.createGain();
        env(g, t + i * 0.1, 0.22, 0.01, 1.3);
        o.connect(g);
        g.connect(master);
        o.start(t + i * 0.1);
        o.stop(t + i * 0.1 + 1.5);
      });
      // نفَس هواء صاعد
      const n = track(noiseSrc());
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(600, t);
      hp.frequency.exponentialRampToValueAtTime(5200, t + 1.1);
      const ng = ctx.createGain();
      env(ng, t, 0.22, 0.5, 0.8);
      n.connect(hp);
      hp.connect(ng);
      ng.connect(master);
      n.start(t);
      n.stop(t + 1.6);
    },

    stop() {
      if (stopped) return;
      stopped = true;
      try {
        const t = now();
        master.gain.cancelScheduledValues(t);
        master.gain.setTargetAtTime(0.0001, t, 0.08);
        window.setTimeout(() => {
          live.forEach(n => { try { n.stop(); } catch { /* ignore */ } });
          void ctx.close().catch(() => {});
        }, 400);
      } catch { /* ignore */ }
    },
  };
}
