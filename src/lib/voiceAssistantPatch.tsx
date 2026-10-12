/**
 * VOICE-ASSISTANT-PATCH  (src/lib/voiceAssistantPatch.tsx)
 *
 * ضغطة مطوّلة على زر الكرة الأرضية (StooornaAiIcon) =>
 *   1) نغمة + اهتزاز + موجات صوت  (مثل سيري)
 *   2) يسمع سؤالك، ويجاوبك بالصوت مباشرة
 *   3) تنزل صفحة بيضاء من فوق فيها الجواب مرتّب داخل مستطيل بخط أسود رفيع (وصور إذا طلبت)
 *
 * ملف مستقل: ما يعدّل أي كود موجود. يتركّب بثلاث إضافات صغيرة فقط:
 *   - <GlobeVoiceLongPress> يلفّ <StooornaAiIcon />   (add-friend.tsx)
 *   - <VoiceAssistantHost />  مرة وحدة في RootLayout.tsx
 *
 * الجواب: أول شي محلي فوري (الساعة/التاريخ/اليوم)، وبعدين POST /api/voice-assistant (بحث نت)،
 * وإذا السيرفر ما جاوب (404 / مفتاح ناقص) يشتغل بحث ويكيبيديا مباشر من الجهاز كاحتياط.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

// ───────────────────────── أحداث ─────────────────────────
export const VOICE_ASSISTANT_START = 'stooorna:voice-assistant-start';
export const VOICE_ASSISTANT_STOP = 'stooorna:voice-assistant-stop';

// ───────────────────────── إعدادات ─────────────────────────
const LONG_PRESS_MS = 450;
const ENDPOINT = '/api/voice-assistant';
const Z_SHEET = 300000;
const Z_PILL = 300001;
const LANG_KEY = 'stooorna_voice_lang'; // مثال: localStorage.setItem('stooorna_voice_lang','en-US')

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking';
interface AssistantAnswer {
  text: string;
  spoken: string;
  images: string[];
  sources: { title: string; url: string }[];
  provider?: string;
}

// ───────────────────────── أدوات صغيرة ─────────────────────────
const hasArabic = (s: string) => /[\u0600-\u06FF]/.test(s);

function vibrate(p: number | number[]) {
  try { navigator.vibrate?.(p); } catch { /* ignore */ }
}

let audioCtx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx && audioCtx.state === 'suspended') void audioCtx.resume();
    return audioCtx;
  } catch { return null; }
}

/** نغمات قصيرة مولّدة بالكود (بدون ملفات صوت) */
function beep(kind: 'start' | 'got' | 'error') {
  const ctx = getCtx();
  if (!ctx) return;
  const seq: [number, number][] =
    kind === 'start' ? [[660, 0.09], [880, 0.12]] :
    kind === 'got' ? [[880, 0.07], [1040, 0.09]] :
    [[300, 0.16]];
  let t = ctx.currentTime;
  for (const [f, d] of seq) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + d + 0.02);
    t += d * 0.9;
  }
}

function cleanForSpeech(s: string): string {
  return s
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*_`#>\[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickVoice(text: string): SpeechSynthesisVoice | null {
  try {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;
    const want = hasArabic(text) ? 'ar' : 'en';
    const stored = (localStorage.getItem(LANG_KEY) || '').toLowerCase();
    return (
      voices.find(v => v.lang.toLowerCase() === stored && v.lang.toLowerCase().startsWith(want)) ||
      voices.find(v => v.lang.toLowerCase().startsWith(want)) ||
      null
    );
  } catch { return null; }
}

function stopSpeaking() {
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
}

function speak(text: string, onStart: () => void, onEnd: () => void) {
  const clean = cleanForSpeech(text);
  if (!clean || !('speechSynthesis' in window)) { onEnd(); return; }
  try {
    const u = new SpeechSynthesisUtterance(clean);
    const v = pickVoice(clean);
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = hasArabic(clean) ? 'ar-SA' : 'en-US';
    u.rate = 1;
    u.pitch = 1;
    u.onstart = onStart;
    u.onend = onEnd;
    u.onerror = onEnd;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch { onEnd(); }
}

// ───────────────────────── ردود محلية فورية ─────────────────────────
const AR_PERIOD = (h: number) => (h < 12 ? 'صباحاً' : 'مساءً');

function localIntent(q: string): AssistantAnswer | null {
  const s = q.toLowerCase().replace(/[؟?!.,،]/g, ' ').replace(/\s+/g, ' ').trim();
  const now = new Date();
  const ar = hasArabic(q);

  const askTime = /(كم الساع|ما هي الساع|ما الساع|الساعه كم|الساعة كم|كم الوقت|ما هو الوقت|الساعه الحين|الساعة الحين|what time|current time|time is it|what's the time)/.test(s);
  if (askTime) {
    if (ar) {
      const h24 = now.getHours();
      const h12 = h24 % 12 || 12;
      const m = String(now.getMinutes()).padStart(2, '0');
      const t = `الساعة الآن ${h12}:${m} ${AR_PERIOD(h24)}`;
      return { text: t, spoken: t, images: [], sources: [], provider: 'local' };
    }
    const t = `It's ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} right now.`;
    return { text: t, spoken: t, images: [], sources: [], provider: 'local' };
  }

  const askDate = /(ما هو التاريخ|ما التاريخ|كم التاريخ|تاريخ اليوم|التاريخ اليوم|what('s| is) the date|today's date|what date)/.test(s);
  const askDay = /(ما هو اليوم|ما اليوم|اي يوم|أي يوم|شنو اليوم|what day)/.test(s);
  if (askDate || askDay) {
    if (ar) {
      const fmt = new Intl.DateTimeFormat('ar-KW-u-ca-gregory-nu-latn', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });
      const day = new Intl.DateTimeFormat('ar-KW-u-ca-gregory-nu-latn', { weekday: 'long' }).format(now);
      const t = askDay && !askDate ? `اليوم ${day}` : `اليوم ${fmt.format(now)}`;
      return { text: t, spoken: t, images: [], sources: [], provider: 'local' };
    }
    const t = `Today is ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;
    return { text: t, spoken: t, images: [], sources: [], provider: 'local' };
  }
  return null;
}

function wantsImages(q: string): boolean {
  return /(صورة|صور|صوره|اعرض|عرض لي|وريني|ورني|شوفني|image|images|picture|pictures|photo|photos|show me)/i.test(q);
}

// ───────────────────────── احتياط: ويكيبيديا مباشرة من الجهاز ─────────────────────────
function stripQuestionWords(q: string): string {
  return q
    .replace(/[؟?!]/g, ' ')
    .replace(/^(ما هو|ما هي|ما هى|من هو|من هي|من هى|ما|من|ماذا|متى|اين|أين|كم|كيف|لماذا|اعرض لي صور[ةه]?|اعرض لي|وريني|ورني|صور[ةه]?|what is|what are|who is|who was|who are|where is|when is|when was|tell me about|show me|picture of|image of)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function wikipediaFallback(q: string, signal: AbortSignal): Promise<AssistantAnswer | null> {
  const lang = hasArabic(q) ? 'ar' : 'en';
  const term = stripQuestionWords(q) || q;
  const url =
    `https://${lang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(term)}` +
    `&gsrlimit=4&prop=extracts%7Cpageimages&exintro=1&explaintext=1&exsentences=3&piprop=thumbnail&pithumbsize=700` +
    `&format=json&origin=*`;
  const r = await fetch(url, { signal });
  if (!r.ok) return null;
  const d = await r.json();
  const pages = Object.values(d?.query?.pages || {}) as any[];
  pages.sort((a, b) => (a.index || 99) - (b.index || 99));
  const top = pages.find(p => p?.extract && String(p.extract).trim().length > 20);
  if (!top) return null;
  const text = String(top.extract).trim();
  const images = wantsImages(q)
    ? pages.map(p => p?.thumbnail?.source).filter((u: any) => typeof u === 'string').slice(0, 4)
    : [];
  const spoken = text.split(/(?<=[.!؟?۔])\s+/).slice(0, 2).join(' ').slice(0, 320);
  return {
    text,
    spoken,
    images,
    sources: [{ title: `${top.title} — Wikipedia`, url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(top.title).replace(/ /g, '_'))}` }],
    provider: 'wikipedia-client',
  };
}

async function askAssistant(q: string, signal: AbortSignal): Promise<AssistantAnswer> {
  const local = localIntent(q);
  if (local) return local;

  const lang = hasArabic(q) ? 'ar' : 'en';
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, lang, images: wantsImages(q) }),
      signal,
    });
    if (r.ok) {
      const d = await r.json();
      if (d?.ok && d.answer) {
        return {
          text: String(d.answer),
          spoken: String(d.spoken || d.answer),
          images: Array.isArray(d.images) ? d.images.filter((u: any) => typeof u === 'string') : [],
          sources: Array.isArray(d.sources) ? d.sources : [],
          provider: d.provider,
        };
      }
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e;
  }

  try {
    const w = await wikipediaFallback(q, signal);
    if (w) return w;
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e;
  }

  const none = lang === 'ar' ? 'ما لقيت جواب واضح لهذا السؤال. جرّب تعيد صياغته.' : "I couldn't find a clear answer. Try rephrasing the question.";
  return { text: none, spoken: none, images: [], sources: [], provider: 'none' };
}

// ───────────────────────── كتابة تدريجية ─────────────────────────
function useTypewriter(full: string, run: boolean): string {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) { setN(full.length); return; }
    setN(0);
    if (!full) return;
    const step = Math.max(1, Math.ceil(full.length / 150));
    const id = window.setInterval(() => {
      setN(v => {
        const nx = v + step;
        if (nx >= full.length) { window.clearInterval(id); return full.length; }
        return nx;
      });
    }, 16);
    return () => window.clearInterval(id);
  }, [full, run]);
  return full.slice(0, n);
}

// ───────────────────────── الزر: ضغطة مطوّلة تلفّ أيقونة الكرة ─────────────────────────
export function GlobeVoiceLongPress({ children, delay = LONG_PRESS_MS }: { children: ReactNode; delay?: number }) {
  const st = useRef<{ timer: number; fired: boolean; x: number; y: number }>({ timer: 0, fired: false, x: 0, y: 0 });
  const clear = () => {
    if (st.current.timer) { window.clearTimeout(st.current.timer); st.current.timer = 0; }
  };
  return (
    <div
      style={{ display: 'contents', WebkitTouchCallout: 'none', userSelect: 'none', WebkitUserSelect: 'none' } as any}
      onPointerDownCapture={e => {
        st.current.fired = false;
        st.current.x = e.clientX;
        st.current.y = e.clientY;
        clear();
        st.current.timer = window.setTimeout(() => {
          st.current.timer = 0;
          st.current.fired = true;
          vibrate(35);
          try { window.dispatchEvent(new CustomEvent(VOICE_ASSISTANT_START)); } catch { /* ignore */ }
        }, delay);
      }}
      onPointerMoveCapture={e => {
        if (st.current.timer && Math.hypot(e.clientX - st.current.x, e.clientY - st.current.y) > 14) clear();
      }}
      onPointerUpCapture={clear}
      onPointerCancelCapture={clear}
      onContextMenuCapture={e => e.preventDefault()}
      onClickCapture={e => {
        // بعد الضغطة المطوّلة لا نفتح/نغلق شيت الـ Ai العادي
        if (st.current.fired) {
          st.current.fired = false;
          e.stopPropagation();
          e.preventDefault();
        }
      }}
    >
      {children}
    </div>
  );
}

// ───────────────────────── المضيف: يُركَّب مرة وحدة في RootLayout ─────────────────────────
export function VoiceAssistantHost() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [heard, setHeard] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState('');
  const [typing, setTyping] = useState(false);

  const recRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionRef = useRef(0);
  const startTimer = useRef<number>(0);

  const killRecognition = useCallback(() => {
    const r = recRef.current;
    recRef.current = null;
    if (r) {
      try { r.onresult = null; r.onerror = null; r.onend = null; } catch { /* ignore */ }
      try { r.abort(); } catch { /* ignore */ }
    }
  }, []);

  const cancelAll = useCallback((closeSheet: boolean) => {
    sessionRef.current += 1;
    window.clearTimeout(startTimer.current);
    killRecognition();
    stopSpeaking();
    try { abortRef.current?.abort(); } catch { /* ignore */ }
    abortRef.current = null;
    setPhase('idle');
    setHeard('');
    if (closeSheet) {
      setSheetOpen(false);
      setTyping(false);
    }
  }, [killRecognition]);

  const ask = useCallback(async (q: string, session: number) => {
    setQuestion(q);
    setAnswer(null);
    setError('');
    setSheetOpen(true);
    setPhase('thinking');
    beep('got');
    vibrate(20);

    const ac = new AbortController();
    abortRef.current = ac;
    const timeout = window.setTimeout(() => ac.abort(), 14000);
    try {
      const res = await askAssistant(q, ac.signal);
      if (session !== sessionRef.current) return;
      setAnswer(res);
      setTyping(true);
      speak(
        res.spoken || res.text,
        () => { if (session === sessionRef.current) setPhase('speaking'); },
        () => { if (session === sessionRef.current) setPhase('idle'); },
      );
      // لو ما في صوت متاح، نرجع idle بعد قليل
      window.setTimeout(() => {
        if (session === sessionRef.current && !('speechSynthesis' in window)) setPhase('idle');
      }, 400);
    } catch (e: any) {
      if (session !== sessionRef.current) return;
      beep('error');
      setError(e?.name === 'AbortError' ? 'انتهى الوقت قبل ما يجي الجواب، حاول مرة ثانية.' : 'تعذّر جلب الجواب، تأكد من الإنترنت وحاول مرة ثانية.');
      setPhase('idle');
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  const begin = useCallback(() => {
    // أي جلسة قديمة تنتهي (ضغطة جديدة أثناء الكلام = سؤال جديد)
    sessionRef.current += 1;
    const session = sessionRef.current;
    window.clearTimeout(startTimer.current);
    killRecognition();
    stopSpeaking();
    try { abortRef.current?.abort(); } catch { /* ignore */ }

    setError('');
    setHeard('');
    setTyping(false);

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      beep('error');
      setSheetOpen(true);
      setQuestion('');
      setAnswer(null);
      setError('هذا المتصفح لا يدعم التعرّف على الصوت. افتح التطبيق من كروم أندرويد.');
      setPhase('idle');
      return;
    }

    // فتح الصوت من لمسة المستخدم (يحتاجها بعض الأجهزة قبل أول نطق)
    getCtx();
    try { if ('speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch { /* ignore */ }

    beep('start');
    vibrate([18, 45, 18]);
    setPhase('listening');

    // نبدأ التسجيل بعد النغمة بشوي حتى ما تنلقط كسؤال
    startTimer.current = window.setTimeout(() => {
      if (session !== sessionRef.current) return;
      const rec = new SR();
      recRef.current = rec;
      let finalText = '';
      let failed = false;
      rec.lang = (() => { try { return localStorage.getItem(LANG_KEY) || 'ar-SA'; } catch { return 'ar-SA'; } })();
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      rec.onresult = (ev: any) => {
        let interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const t = ev.results[i][0]?.transcript || '';
          if (ev.results[i].isFinal) finalText += t; else interim += t;
        }
        setHeard((finalText + ' ' + interim).trim());
      };
      rec.onerror = (ev: any) => {
        const code = String(ev?.error || '');
        if (code === 'no-speech' || code === 'aborted') return;
        failed = true;
        beep('error');
        setSheetOpen(true);
        setQuestion('');
        setAnswer(null);
        setError(
          code === 'not-allowed' || code === 'service-not-allowed'
            ? 'اسمح للتطبيق باستخدام المايك من إعدادات الموقع/التطبيق.'
            : code === 'audio-capture'
              ? 'المايك مشغول — لو أنت داخل مكالمة أو بث سكّره وجرّب.'
              : 'صار خطأ في التعرّف على الصوت، حاول مرة ثانية.',
        );
        setPhase('idle');
      };
      rec.onend = () => {
        if (session !== sessionRef.current) return;
        recRef.current = null;
        const q = finalText.trim() || '';
        if (failed) return;
        if (q) { void ask(q, session); return; }
        // ما سمعنا شي
        beep('error');
        setPhase('idle');
        setHeard('');
      };
      try { rec.start(); } catch {
        beep('error');
        setError('تعذّر تشغيل المايك.');
        setSheetOpen(true);
        setPhase('idle');
      }
    }, 240);
  }, [ask, killRecognition]);

  useEffect(() => {
    const onStart = () => begin();
    const onStop = () => cancelAll(true);
    window.addEventListener(VOICE_ASSISTANT_START, onStart);
    window.addEventListener(VOICE_ASSISTANT_STOP, onStop);
    return () => {
      window.removeEventListener(VOICE_ASSISTANT_START, onStart);
      window.removeEventListener(VOICE_ASSISTANT_STOP, onStop);
      cancelAll(true);
    };
  }, [begin, cancelAll]);

  const shownText = useTypewriter(answer?.text || '', typing);
  const active = phase !== 'idle';

  return (
    <>
      <style>{`
        @keyframes stooornaVaBar { 0%,100% { transform: scaleY(0.25); } 50% { transform: scaleY(1); } }
        @keyframes stooornaVaPulse { 0% { box-shadow: 0 0 0 0 rgba(0,188,212,0.55); } 100% { box-shadow: 0 0 0 22px rgba(0,188,212,0); } }
        @keyframes stooornaVaDots { 0%,80%,100% { opacity: 0.25; } 40% { opacity: 1; } }
      `}</style>

      {/* ── حبّة الاستماع: موجات صوت فوق الشريط السفلي ── */}
      {phase === 'listening' || (phase === 'thinking' && !sheetOpen) ? (
        <div
          role="button"
          aria-label="إيقاف المساعد الصوتي"
          onClick={() => cancelAll(false)}
          style={{
            position: 'fixed', left: '50%', transform: 'translateX(-50%)',
            bottom: 'calc(84px + env(safe-area-inset-bottom, 0px))',
            zIndex: Z_PILL, minWidth: 150, maxWidth: '86vw',
            padding: '12px 18px', borderRadius: 999,
            background: 'rgba(6,14,14,0.95)', border: '1px solid rgba(0,188,212,0.55)',
            color: '#fff', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
            animation: 'stooornaVaPulse 1.2s ease-out infinite',
            boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, height: 26 }}>
            {[0, 1, 2, 3, 4, 5, 6].map(i => (
              <span
                key={i}
                style={{
                  width: 3, height: 26, borderRadius: 2, background: '#00BCD4', transformOrigin: 'center',
                  animation: `stooornaVaBar ${0.7 + (i % 3) * 0.15}s ease-in-out ${i * 0.08}s infinite`,
                }}
              />
            ))}
          </span>
          <span dir="auto" style={{ fontSize: 13, fontWeight: 300, opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '58vw' }}>
            {heard || 'اسأل…'}
          </span>
        </div>
      ) : null}

      {/* ── الصفحة البيضاء من فوق ── */}
      <div
        aria-hidden={!sheetOpen}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: Z_SHEET,
          maxHeight: '82dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          background: '#ffffff', color: '#000',
          borderRadius: '0 0 22px 22px',
          boxShadow: sheetOpen ? '0 18px 50px rgba(0,0,0,0.35)' : 'none',
          transform: sheetOpen ? 'translateY(0)' : 'translateY(-115%)',
          transition: 'transform 0.34s cubic-bezier(0.32,0.72,0,1)',
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
          paddingBottom: 16, paddingLeft: 14, paddingRight: 14, boxSizing: 'border-box',
          pointerEvents: sheetOpen ? 'auto' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 300, color: '#555' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 2, height: 14 }}>
              {[0, 1, 2, 3].map(i => (
                <span
                  key={i}
                  style={{
                    width: 2, height: 14, borderRadius: 1, background: '#000', opacity: phase === 'speaking' ? 1 : 0.25,
                    animation: phase === 'speaking' ? `stooornaVaBar 0.8s ease-in-out ${i * 0.1}s infinite` : 'none',
                  }}
                />
              ))}
            </span>
            <span>
              {phase === 'thinking' ? 'يبحث…' : phase === 'speaking' ? 'يتكلم' : phase === 'listening' ? 'يسمعك' : 'Stooorna'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {phase === 'speaking' ? (
              <button
                type="button"
                onClick={() => { stopSpeaking(); setPhase('idle'); }}
                aria-label="إيقاف الصوت"
                style={{ border: '1px solid rgba(0,0,0,0.18)', background: '#fff', color: '#000', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 300, cursor: 'pointer' }}
              >
                إيقاف الصوت
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => cancelAll(true)}
              aria-label="إغلاق"
              style={{ border: 'none', background: 'transparent', color: '#000', fontSize: 22, lineHeight: 1, width: 32, height: 32, cursor: 'pointer', fontWeight: 200 }}
            >
              ×
            </button>
          </div>
        </div>

        {question ? (
          <div dir="auto" style={{ fontSize: 13, fontWeight: 300, color: '#666', marginBottom: 8, textAlign: 'start' }}>
            {question}
          </div>
        ) : null}

        <div
          style={{
            border: '1px solid rgba(0,0,0,0.14)', borderRadius: 8, background: '#fff',
            padding: '14px 14px', minHeight: 56,
          }}
        >
          {error ? (
            <div dir="auto" style={{ fontSize: 15, fontWeight: 300, color: '#000', lineHeight: 1.8 }}>{error}</div>
          ) : phase === 'thinking' && !answer ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', height: 28 }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#000', animation: `stooornaVaDots 1.1s ease-in-out ${i * 0.18}s infinite` }} />
              ))}
            </div>
          ) : answer ? (
            <>
              <div dir="auto" style={{ fontSize: 16, fontWeight: 300, color: '#000', lineHeight: 1.95, whiteSpace: 'pre-wrap', textAlign: 'start', wordBreak: 'break-word' }}>
                {shownText}
              </div>
              {answer.images.length ? (
                <div style={{ display: 'grid', gridTemplateColumns: answer.images.length === 1 ? '1fr' : '1fr 1fr', gap: 8, marginTop: 12 }}>
                  {answer.images.slice(0, 4).map((src, i) => (
                    <img
                      key={src + i}
                      src={src}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 6, border: '1px solid rgba(0,0,0,0.1)', background: '#f3f4f6' }}
                    />
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        {answer?.sources?.length ? (
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
            {answer.sources.slice(0, 3).map((s, i) => {
              let host = s.url;
              try { host = new URL(s.url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
              return (
                <a key={s.url + i} href={s.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, fontWeight: 300, color: '#555', textDecoration: 'underline' }}>
                  {host}
                </a>
              );
            })}
          </div>
        ) : null}
      </div>
      {/* يخلي TypeScript يعتبر active مستخدم حتى لو ما احتجناه بالعرض */}
      <span hidden data-voice-active={active ? '1' : '0'} />
    </>
  );
}

export default VoiceAssistantHost;
