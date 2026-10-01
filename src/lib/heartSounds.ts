/**
 * أصوات هدية القلب (Web Audio — بدون ملفات صوت).
 * المسار: src/lib/heartSounds.ts (بجانب audio.ts و witchSounds.ts)
 *
 *  - playHeartSound(plan) : نفخ بالونة (زفير + شهيق + صرير مطاط) ثم فرقعة + صوت امرأة تقول "I love you"
 *                           ويرجع دالة إيقاف.
 *  - playHeartTick(vol)   : نقرة خفيفة عند ارتطام قلب صغير بزر من أزرار البث.
 *
 * التوقيتات والأصوات الحقيقية (اختياري) تُضبط من HeartGift.tsx (INFLATE_S / PUMPS / VOICE_URL / BLOW_URL).
 */
import { getAudioCtx, noiseBuffer } from './audio';

export interface HeartPump {
  /** وقت بداية النفخة بالثواني */
  t: number;
  /** مدة النفخة */
  d: number;
}

export interface HeartSoundPlan {
  /** مدة النفخ قبل الانفجار (ثواني) */
  inflateS: number;
  /** أنفاس النفخ */
  pumps: HeartPump[];
  /** النص الذي تنطقه المرأة (الافتراضي: I love you) */
  voiceText?: string;
  /** ملف صوت امرأة حقيقي (اختياري) */
  voiceUrl?: string;
  /** ملف نفخ بالونة حقيقي (اختياري) */
  blowUrl?: string;
}

const FEMALE_RE = /female|woman|samantha|victoria|karen|moira|tessa|zira|susan|hazel|aria|jenny|ava|allison|serena|fiona|nicky|google us english|google uk english female/i;
const MALE_RE = /\bmale\b|david|mark|daniel|alex|fred|george|james|guy|ravi|rishi|arthur|oliver/i;

function pickWomanVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const en = voices.filter(v => /^en/i.test(v.lang));
  return (
    en.find(v => FEMALE_RE.test(v.name) && !MALE_RE.test(v.name)) ||
    en.find(v => !MALE_RE.test(v.name)) ||
    null
  );
}

// صوت امرأة تقول I love you
function speakILoveYou(audios: HTMLAudioElement[], voiceUrl: string, voiceText: string) {
  if (voiceUrl) {
    try {
      const a = new Audio(voiceUrl);
      a.volume = 1;
      audios.push(a);
      void a.play().catch(() => { /* ignore */ });
    } catch { /* ignore */ }
    return;
  }
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const u = new SpeechSynthesisUtterance(voiceText);
    u.lang = 'en-US';
    u.rate = 0.88;
    u.pitch = 1.3; // نبرة أنثوية
    u.volume = 1;
    const v = pickWomanVoice(synth.getVoices());
    if (v) { u.voice = v; u.lang = v.lang; }
    synth.cancel();
    synth.speak(u);
  } catch { /* ignore */ }
}

// نفخ بالونة حقيقي (نفَس + شهيق + صرير مطاط) ثم فرقعة + صوت المرأة
export function playHeartSound(plan: HeartSoundPlan): () => void {
  const { inflateS: INFLATE_S, pumps: PUMPS, voiceText: VOICE_TEXT = 'I love you', voiceUrl: VOICE_URL = '', blowUrl: BLOW_URL = '' } = plan;
  const ctx = getAudioCtx();
  const sources: AudioScheduledSourceNode[] = [];
  const timers: number[] = [];
  const audios: HTMLAudioElement[] = [];
  let master: GainNode | null = null;

  // تجهيز أصوات الجهاز مبكراً (تتحمل بشكل متأخر في بعض المتصفحات)
  try {
    if (!VOICE_URL && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      const prime = new SpeechSynthesisUtterance(' ');
      prime.volume = 0;
      window.speechSynthesis.speak(prime);
    }
  } catch { /* ignore */ }

  if (BLOW_URL) {
    try {
      const a = new Audio(BLOW_URL);
      a.volume = 1;
      audios.push(a);
      void a.play().catch(() => { /* ignore */ });
    } catch { /* ignore */ }
  }

  if (ctx) {
    const t0 = ctx.currentTime + 0.02;
    const tb = t0 + INFLATE_S;

    master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);
    const out = master;

    const noise = (dur: number) => {
      const s = ctx.createBufferSource();
      s.buffer = noiseBuffer(ctx, dur);
      sources.push(s);
      return s;
    };

    if (!BLOW_URL) {
      PUMPS.forEach((b, i) => {
        const t = t0 + b.t;
        const te = t + b.d;
        const k = i / (PUMPS.length - 1);

        // 1) الزفير: هواء ينفخه الفم داخل البالونة
        const n = noise(b.d + 0.1);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 380;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 0.8;
        bp.frequency.setValueAtTime(850 + k * 500, t);
        bp.frequency.linearRampToValueAtTime(1100 + k * 700, te);
        const g = ctx.createGain();
        const peak = 0.2 + k * 0.08;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(peak, t + 0.07);
        g.gain.setValueAtTime(peak, te - 0.1);
        g.gain.exponentialRampToValueAtTime(0.0001, te);
        // اضطراب خفيف في الهواء
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 9 + Math.random() * 6;
        const lg = ctx.createGain();
        lg.gain.value = 0.05;
        lfo.connect(lg); lg.connect(g.gain);
        n.connect(hp); hp.connect(bp); bp.connect(g); g.connect(out);
        n.start(t); n.stop(te + 0.1);
        lfo.start(t); lfo.stop(te + 0.1);
        sources.push(lfo);

        // 2) "بف" الشفاه عند بداية النفخة
        const lip = ctx.createOscillator();
        const lipG = ctx.createGain();
        lip.type = 'sine';
        lip.frequency.setValueAtTime(140, t);
        lip.frequency.exponentialRampToValueAtTime(60, t + 0.07);
        lipG.gain.setValueAtTime(0.0001, t);
        lipG.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
        lipG.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        lip.connect(lipG); lipG.connect(out);
        lip.start(t); lip.stop(t + 0.1);
        sources.push(lip);

        // 3) صرير المطاط وهو يتمدد (يزيد مع امتلاء البالونة)
        if (i >= 1) {
          const sq = ctx.createOscillator();
          sq.type = 'sawtooth';
          const f0 = 700 + i * 120;
          sq.frequency.setValueAtTime(f0, t + 0.05);
          sq.frequency.linearRampToValueAtTime(f0 + 350 + i * 40, te);
          const vib = ctx.createOscillator();
          vib.frequency.value = 28 + Math.random() * 10;
          const vibG = ctx.createGain();
          vibG.gain.value = 35;
          vib.connect(vibG); vibG.connect(sq.frequency);
          const sbp = ctx.createBiquadFilter();
          sbp.type = 'bandpass';
          sbp.Q.value = 7;
          sbp.frequency.value = 1700 + i * 150;
          const sg = ctx.createGain();
          const sp = 0.02 + k * 0.03;
          sg.gain.setValueAtTime(0.0001, t + 0.05);
          sg.gain.linearRampToValueAtTime(sp, t + 0.18);
          sg.gain.exponentialRampToValueAtTime(0.0001, te);
          sq.connect(sbp); sbp.connect(sg); sg.connect(out);
          sq.start(t + 0.05); sq.stop(te + 0.02);
          vib.start(t + 0.05); vib.stop(te + 0.02);
          sources.push(sq, vib);
        }

        // 4) الشهيق بين النفخات
        if (i < PUMPS.length - 1) {
          const ti = te + 0.02;
          const di = PUMPS[i + 1].t - b.t - b.d - 0.04;
          if (di > 0.05) {
            const inh = noise(di + 0.05);
            const ibp = ctx.createBiquadFilter();
            ibp.type = 'bandpass';
            ibp.Q.value = 0.6;
            ibp.frequency.setValueAtTime(900, ti);
            ibp.frequency.linearRampToValueAtTime(1500, ti + di);
            const ig = ctx.createGain();
            ig.gain.setValueAtTime(0.0001, ti);
            ig.gain.linearRampToValueAtTime(0.07, ti + di * 0.5);
            ig.gain.linearRampToValueAtTime(0.0001, ti + di);
            inh.connect(ibp); ibp.connect(ig); ig.connect(out);
            inh.start(ti); inh.stop(ti + di + 0.05);
          }
        }
      });

      // توتر المطاط قبل الانفجار: صرير متقطع
      const tn = noise(0.9);
      const tbp = ctx.createBiquadFilter();
      tbp.type = 'bandpass';
      tbp.Q.value = 6;
      tbp.frequency.setValueAtTime(2800, tb - 0.8);
      tbp.frequency.linearRampToValueAtTime(4200, tb);
      const tg = ctx.createGain();
      tg.gain.setValueAtTime(0.03, tb - 0.8);
      const tl = ctx.createOscillator();
      tl.type = 'square';
      tl.frequency.value = 22;
      const tlg = ctx.createGain();
      tlg.gain.value = 0.03;
      tl.connect(tlg); tlg.connect(tg.gain);
      tn.connect(tbp); tbp.connect(tg); tg.connect(out);
      tg.gain.setValueAtTime(0.0001, tb - 0.001);
      tn.start(tb - 0.8); tn.stop(tb);
      tl.start(tb - 0.8); tl.stop(tb);
      sources.push(tl);
    }

    // الانفجار: طقة بالونة حادة + ضربة هواء قصيرة
    const crack = noise(0.2);
    const chp = ctx.createBiquadFilter();
    chp.type = 'highpass';
    chp.frequency.value = 900;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(1.0, tb);
    cg.gain.exponentialRampToValueAtTime(0.0001, tb + 0.12);
    crack.connect(chp); chp.connect(cg); cg.connect(out);
    crack.start(tb); crack.stop(tb + 0.2);

    const boom = noise(0.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3500, tb);
    lp.frequency.exponentialRampToValueAtTime(200, tb + 0.4);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.55, tb);
    bg.gain.exponentialRampToValueAtTime(0.0001, tb + 0.4);
    boom.connect(lp); lp.connect(bg); bg.connect(out);
    boom.start(tb); boom.stop(tb + 0.5);

    const thump = ctx.createOscillator();
    const thg = ctx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(170, tb);
    thump.frequency.exponentialRampToValueAtTime(40, tb + 0.35);
    thg.gain.setValueAtTime(0.8, tb);
    thg.gain.exponentialRampToValueAtTime(0.0001, tb + 0.4);
    thump.connect(thg); thg.connect(out);
    thump.start(tb); thump.stop(tb + 0.45);
    sources.push(thump);

    // طقطقة قطع القلب المتفتتة
    for (let i = 0; i < 12; i++) {
      const t = tb + 0.08 + Math.random() * 0.9;
      const n = noise(0.05);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2500 + Math.random() * 2500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      n.connect(hp); hp.connect(g); g.connect(out);
      n.start(t); n.stop(t + 0.06);
    }
  }

  // صوت المرأة "I love you" مع لحظة الانفجار
  timers.push(window.setTimeout(() => speakILoveYou(audios, VOICE_URL, VOICE_TEXT), (INFLATE_S + 0.12) * 1000));

  return () => {
    timers.forEach(t => window.clearTimeout(t));
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    audios.forEach(a => { try { a.pause(); } catch { /* ignore */ } });
    if (ctx && master) {
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
        sources.forEach(s => { try { s.stop(ctx.currentTime + 0.1); } catch { /* ignore */ } });
      } catch { /* ignore */ }
    }
  };
}

// نقرة خفيفة عند ارتطام قلب بزر
export function playHeartTick(vol: number) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(600 + Math.random() * 500, t);
    o.frequency.exponentialRampToValueAtTime(260, t + 0.05);
    g.gain.setValueAtTime(Math.min(0.07, vol), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + 0.07);
  } catch { /* ignore */ }
}
