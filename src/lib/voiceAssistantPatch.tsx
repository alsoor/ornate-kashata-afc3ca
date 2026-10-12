/**
 * VOICE-ASSISTANT-PATCH  (src/lib/voiceAssistantPatch.tsx)  — v2
 *
 * ضغطة مطوّلة على زر الكرة الأرضية (StooornaAiIcon):
 *   1) نغمة "جاهز" + اهتزاز، وتطلع صفحة بيضاء كاملة من تحت لفوق تغطي كل الأقسام
 *   2) الأيقونة تبقى فوق الصفحة في مكانها وتتحول هي نفسها إلى ذبذبات صوت
 *   3) تسأل (عربي أو إنجليزي) -> يكتب الجواب في الصفحة ويرد عليك بصوت أنثوي
 *   4) نقرة وحدة على الأيقونة = يوقف كل شي وتختفي الصفحة. ضغطة مطوّلة عليها = سؤال جديد
 *
 * الواجهة العامة (ما تغيّرت): <GlobeVoiceLongPress> و <VoiceAssistantHost />
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSession } from '@/lib/auth/auth-client';
import { chatTurn, ttsOnly, playAudio, stopAudio, resetChat, prefetchGreeting, getChatIssue, getVoiceIssue } from '@/lib/voiceChat';

export const VOICE_ASSISTANT_START = 'stooorna:voice-assistant-start';
export const VOICE_ASSISTANT_STOP = 'stooorna:voice-assistant-stop';

const LONG_PRESS_MS = 450;
const ENDPOINT = '/api/voice-assistant';
const Z_PAGE = 300000;
const Z_ORB = 300001;
const LANG_KEY = 'stooorna_voice_lang';        // لو حطيته (مثال en-US) يثبّت لغة التعرّف ويوقف التبديل التلقائي
const LAST_LANG_KEY = 'stooorna_voice_lang_last';
// Voice wake ("Stooorna" / Arabic spelling): now ON by default for every account, no tap needed.
// A user can still switch it off from the toggle inside the assistant page (saved per account).
const WAKE_DEFAULT_ON = true;
const WAKE_KEY = 'stooorna_wake_on'; // يُحفظ لكل حساب: stooorna_wake_on_<userId>
const OFF_KEY = 'stooorna_va_off'; // saved per account: stooorna_va_off_<userId> = '1' when the assistant is switched off
const HOLD_TOGGLE_MS = 6000;      // hold the globe icon this long to switch the assistant off / on
const OFF_COLOR = '#ff8a00';
let globeEl: HTMLElement | null = null; // أيقونة الكرة الحالية (يسجّلها GlobeVoiceLongPress)

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking';
type UiLang = 'ar' | 'en' | null;
interface Rect { left: number; top: number; width: number; height: number }
interface AssistantAnswer {
  text: string;
  spoken: string;
  images: string[];
  sources: { title: string; url: string }[];
  provider?: string;
  audio?: string; // base64 mp3 from the server voice (optional)
  heard?: string; // what the user really said (fixed transcript)
  lang?: 'ar' | 'en';
}

const hasArabic = (s: string) => /[\u0600-\u06FF]/.test(s);
const vibrate = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* ignore */ } };

// ───────────────────────── assistant on / off (6-second hold on the globe) ─────────────────────────
let vaOff = false;
const offListeners = new Set<() => void>();
const readOff = (userId: string): boolean => { try { return localStorage.getItem(`${OFF_KEY}_${userId}`) === '1'; } catch { return false; } };
function applyOff(userId: string, v: boolean) {
  vaOff = v;
  try { if (v) localStorage.setItem(`${OFF_KEY}_${userId}`, '1'); else localStorage.removeItem(`${OFF_KEY}_${userId}`); } catch { /* ignore */ }
  offListeners.forEach(f => f());
}
function useAssistantOff(): { off: boolean; userId: string } {
  const sess: any = useSession();
  const user: any = sess?.user ?? sess?.data?.user ?? null;
  const userId = String(user?.id || '');
  const [off, setOff] = useState<boolean>(() => (userId ? readOff(userId) : false));
  useEffect(() => {
    vaOff = userId ? readOff(userId) : false;
    setOff(vaOff);
    const f = () => setOff(vaOff);
    offListeners.add(f);
    return () => { offListeners.delete(f); };
  }, [userId]);
  return { off, userId };
}

// orange look on the globe icon while the assistant is off (original inline styles are restored when it is back on)
const offSaved = new WeakMap<HTMLElement, Record<string, [string, string]>>();
const OFF_PROPS: [string, string][] = [
  ['box-shadow', `0 0 0 2px ${OFF_COLOR}`],
  ['background-color', 'rgba(255,138,0,0.30)'],
  ['color', OFF_COLOR],
  ['border-radius', '50%'],
];
function paintOff(el: HTMLElement) {
  if (offSaved.has(el)) return;
  const saved: Record<string, [string, string]> = {};
  for (const [k, v] of OFF_PROPS) {
    saved[k] = [el.style.getPropertyValue(k), el.style.getPropertyPriority(k)];
    el.style.setProperty(k, v, 'important');
  }
  offSaved.set(el, saved);
}
function unpaintOff(el: HTMLElement) {
  const saved = offSaved.get(el);
  if (!saved) return;
  for (const [k, [v, pr]] of Object.entries(saved)) {
    if (v) el.style.setProperty(k, v, pr); else el.style.removeProperty(k);
  }
  offSaved.delete(el);
}

// ───────────────────────── صوت (نغمات بالكود) ─────────────────────────
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

function beep(kind: 'ready' | 'got' | 'error') {
  const ctx = getCtx();
  if (!ctx) return;
  // ready: ثلاث نغمات صاعدة واضحة = "اشتغلت وجاهزة"
  const seq: [number, number, number][] =
    kind === 'ready' ? [[523, 0.11, 0.2], [659, 0.11, 0.2], [988, 0.2, 0.22]] :
    kind === 'got' ? [[880, 0.07, 0.14], [1175, 0.1, 0.14]] :
    [[330, 0.14, 0.18], [247, 0.2, 0.18]];
  let t = ctx.currentTime + 0.01;
  for (const [f, d, vol] of seq) {
    for (const type of ['sine', 'triangle'] as OscillatorType[]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(type === 'sine' ? vol : vol * 0.35, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t);
      o.stop(t + d + 0.03);
    }
    t += d * 0.85;
  }
}

// ───────────────────────── نطق (صوت أنثوي قدر الإمكان) ─────────────────────────
let voicesCache: SpeechSynthesisVoice[] = [];
function loadVoices() {
  try { voicesCache = window.speechSynthesis.getVoices() || []; } catch { /* ignore */ }
}
const FEMALE_RE = /female|woman|girl|zira|samantha|karen|moira|tessa|victoria|susan|hazel|fiona|serena|allison|ava|joanna|salli|kendra|kimberly|ivy|emma|amy|laila|lana|mariam|salma|amira|hoda|zariyah|google (us|uk) english|aria|jenny|libby|sonia|natasha/i;
const MALE_RE = /\bmale\b|maged|tarik|naayf|hamed|majed|david|mark|daniel|alex|fred|george|james|guy|rishi|oliver|thomas|ryan|christopher|eric|hamza/i;

function pickVoice(text: string): { voice: SpeechSynthesisVoice | null; female: boolean } {
  if (!voicesCache.length) loadVoices();
  const want = hasArabic(text) ? 'ar' : 'en';
  const pool = voicesCache.filter(v => v.lang.toLowerCase().startsWith(want));
  if (!pool.length) return { voice: null, female: false };
  const fem = pool.find(v => FEMALE_RE.test(v.name) && !MALE_RE.test(v.name));
  if (fem) return { voice: fem, female: true };
  const notMale = pool.find(v => !MALE_RE.test(v.name));
  return { voice: notMale || pool[0], female: false };
}

function cleanForSpeech(s: string): string {
  return s.replace(/https?:\/\/\S+/g, ' ').replace(/[*_`#>\[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
}
function stopSpeaking() { stopAudio(); try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } }

function speak(text: string, onStart: () => void, onEnd: () => void) {
  const clean = cleanForSpeech(text);
  if (!clean || !('speechSynthesis' in window)) { onEnd(); return; }
  try {
    const u = new SpeechSynthesisUtterance(clean);
    const { voice, female } = pickVoice(clean);
    if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = hasArabic(clean) ? 'ar-SA' : 'en-US';
    u.rate = 1;
    u.pitch = female ? 1.05 : 1.25; // لو ما لقينا صوت أنثوي صريح نرفع النبرة شوي
    u.onstart = onStart;
    u.onend = onEnd;
    u.onerror = onEnd;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch { onEnd(); }
}

// ───────────────────────── ردود محلية فورية ─────────────────────────
function localIntent(q: string): AssistantAnswer | null {
  const s = q.toLowerCase().replace(/[؟?!.,،]/g, ' ').replace(/\s+/g, ' ').trim();
  const now = new Date();
  const ar = hasArabic(q);
  const mk = (t: string): AssistantAnswer => ({ text: t, spoken: t, images: [], sources: [], provider: 'local' });

  if (/(كم الساع|ما هي الساع|ما الساع|الساعه كم|الساعة كم|كم الوقت|ما هو الوقت|الساعه الحين|الساعة الحين|what time|current time|time is it|what's the time)/.test(s)) {
    if (ar) {
      const h24 = now.getHours();
      const h12 = h24 % 12 || 12;
      return mk(`الساعة الآن ${h12}:${String(now.getMinutes()).padStart(2, '0')} ${h24 < 12 ? 'صباحاً' : 'مساءً'}`);
    }
    return mk(`It's ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} right now.`);
  }

  const askDate = /(ما هو التاريخ|ما التاريخ|كم التاريخ|تاريخ اليوم|التاريخ اليوم|what('s| is) the date|today's date|what date)/.test(s);
  const askDay = /(ما هو اليوم|ما اليوم|اي يوم|أي يوم|شنو اليوم|what day)/.test(s);
  if (askDate || askDay) {
    if (ar) {
      const o = { day: 'numeric', month: 'long', year: 'numeric' } as const;
      const full = new Intl.DateTimeFormat('ar-KW-u-ca-gregory-nu-latn', { weekday: 'long', ...o }).format(now);
      const day = new Intl.DateTimeFormat('ar-KW-u-ca-gregory-nu-latn', { weekday: 'long' }).format(now);
      return mk(askDay && !askDate ? `اليوم ${day}` : `اليوم ${full}`);
    }
    return mk(`Today is ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`);
  }
  return null;
}

const wantsImages = (q: string) =>
  /(صورة|صور|صوره|اعرض|عرض لي|وريني|ورني|image|images|picture|pictures|photo|photos|show me)/i.test(q);

// ───────────────────────── احتياط: ويكيبيديا من الجهاز ─────────────────────────
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
    `&gsrlimit=4&prop=extracts%7Cpageimages&exintro=1&explaintext=1&exsentences=3&piprop=thumbnail&pithumbsize=700&format=json&origin=*`;
  const r = await fetch(url, { signal });
  if (!r.ok) return null;
  const d = await r.json();
  const pages = Object.values(d?.query?.pages || {}) as any[];
  pages.sort((a, b) => (a.index || 99) - (b.index || 99));
  const top = pages.find(p => p?.extract && String(p.extract).trim().length > 20);
  if (!top) return null;
  const text = String(top.extract).trim();
  const images = wantsImages(q) ? pages.map(p => p?.thumbnail?.source).filter((u: any) => typeof u === 'string').slice(0, 4) : [];
  return {
    text,
    spoken: text.split(/(?<=[.!؟?۔])\s+/).slice(0, 2).join(' ').slice(0, 320),
    images,
    sources: [{ title: `${top.title} — Wikipedia`, url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(top.title).replace(/ /g, '_'))}` }],
    provider: 'wikipedia-client',
  };
}

async function askAssistant(q: string, signal: AbortSignal, name = ''): Promise<AssistantAnswer> {
  const local = localIntent(q);
  if (local) return local;
  const lang = hasArabic(q) ? 'ar' : 'en';
  // Free conversation first (Gulf Arabic / American English). Image requests and failures fall through to the search flow below.
  if (!wantsImages(q)) {
    const c = await chatTurn(q, name, signal);
    if (c) return { text: c.text, spoken: c.spoken, images: [], sources: [], provider: 'chat', audio: c.audio, heard: c.heard, lang: c.lang };
  }
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, lang, images: wantsImages(q) }), signal,
    });
    if (r.ok) {
      const d = await r.json();
      if (d?.ok && d.answer) {
        return {
          text: String(d.answer), spoken: String(d.spoken || d.answer),
          images: Array.isArray(d.images) ? d.images.filter((u: any) => typeof u === 'string') : [],
          sources: Array.isArray(d.sources) ? d.sources : [], provider: d.provider,
        };
      }
    }
  } catch (e: any) { if (e?.name === 'AbortError') throw e; }
  try {
    const w = await wikipediaFallback(q, signal);
    if (w) return w;
  } catch (e: any) { if (e?.name === 'AbortError') throw e; }
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
// ───────────────────────── كشف كلمة النداء (عربي/إنجليزي) ─────────────────────────
function normWake(s: string): string {
  return s.toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[^a-z0-9\u0600-\u06FF\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
// Stooorna / Storna / Sturna …  و  ستورنا / ستورنه / استورنا …
const WAKE_LATIN = /(?:^|\s)[ei]?s?t[ou]{1,3}a?r+n[aeh]{1,2}(?=\s|$)/;
const WAKE_ARABIC = /(?:^|\s)ا?[سص]ت[وؤ]{1,3}ر+ن[اهي]{0,2}(?=\s|$)/;

function matchWake(raw: string): { lang: 'ar' | 'en'; rest: string } | null {
  const t = normWake(raw);
  if (!t) return null;
  let lang: 'ar' | 'en' = 'ar';
  let m = WAKE_ARABIC.exec(t);
  if (!m) { m = WAKE_LATIN.exec(t); lang = 'en'; }
  if (!m) return null;
  const before = t.slice(0, m.index).trim();
  const rest = t.slice(m.index + m[0].length).trim();
  if (lang === 'en' && /(?:^|\s)(ya|yaa|yah)$/.test(before)) lang = 'ar';
  else if (lang === 'ar' && /(?:^|\s)(هاي|هلو|اوكي)$/.test(before)) lang = 'en';
  return { lang, rest };
}

function iconRectOf(target: EventTarget | null): Rect | null {
  try {
    const first = target as HTMLElement | null;
    if (!first || !first.getBoundingClientRect) return null;
    let el: HTMLElement = (first.closest('button,[role="button"]') as HTMLElement | null) || first;
    // نطلع للأب طالما لسه بحجم الأيقونة (حتى ما ناخذ svg صغير من داخلها)
    for (let i = 0; i < 3; i++) {
      const parent: HTMLElement | null = el.parentElement;
      if (!parent || parent === document.body) break;
      const pr = parent.getBoundingClientRect();
      if (pr.width > 60 || pr.height > 60) break;
      el = parent;
    }
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return null;
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  } catch { return null; }
}

export function GlobeVoiceLongPress({ children, delay = LONG_PRESS_MS }: { children: ReactNode; delay?: number }) {
  const { userId: holdUser } = useAssistantOff();
  const st = useRef<{ timer: number; toggle: number; fired: boolean; x: number; y: number }>({ timer: 0, toggle: 0, fired: false, x: 0, y: 0 });
  const clear = () => {
    if (st.current.timer) { window.clearTimeout(st.current.timer); st.current.timer = 0; }
    if (st.current.toggle) { window.clearTimeout(st.current.toggle); st.current.toggle = 0; }
  };
  const sentinel = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const el = (sentinel.current?.nextElementSibling as HTMLElement | null) || null;
    if (el) globeEl = el;
    return () => { if (globeEl === el) globeEl = null; };
  });
  return (
    <div
      style={{ display: 'contents', WebkitTouchCallout: 'none', userSelect: 'none', WebkitUserSelect: 'none' } as any}
      onPointerDownCapture={e => {
        st.current.fired = false;
        st.current.x = e.clientX;
        st.current.y = e.clientY;
        const target = e.target;
        clear();
        st.current.timer = window.setTimeout(() => {
          st.current.timer = 0;
          if (vaOff) return; // switched off: a normal hold does nothing
          st.current.fired = true;
          vibrate(35);
          try {
            window.dispatchEvent(new CustomEvent(VOICE_ASSISTANT_START, { detail: { rect: iconRectOf(target) } }));
          } catch { /* ignore */ }
        }, delay);
        // keep holding for 6 seconds: switch the assistant off (icon turns orange) or back on
        st.current.toggle = window.setTimeout(() => {
          st.current.toggle = 0;
          if (!holdUser) return;
          st.current.fired = true;
          const next = !vaOff;
          vibrate(next ? [60, 40, 60, 40, 60] : [30, 40, 30]);
          applyOff(holdUser, next);
          beep(next ? 'error' : 'ready');
        }, HOLD_TOGGLE_MS);
      }}
      onPointerMoveCapture={e => {
        if ((st.current.timer || st.current.toggle) && Math.hypot(e.clientX - st.current.x, e.clientY - st.current.y) > 14) clear();
      }}
      onPointerUpCapture={clear}
      onPointerCancelCapture={clear}
      onContextMenuCapture={e => e.preventDefault()}
      onClickCapture={e => {
        if (st.current.fired) { st.current.fired = false; e.stopPropagation(); e.preventDefault(); }
      }}
    >
      <span ref={sentinel} style={{ display: 'none' }} />
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
  const [pageOpen, setPageOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [typing, setTyping] = useState(false);
  const [uiLang, setUiLang] = useState<UiLang>(null);
  const [rect, setRect] = useState<Rect | null>(null);

  // المستخدم الحالي (نفس هوك RootLayout) — اسمه يُنطق بعد "نعم / Yes"
  const sess: any = useSession();
  const user: any = sess?.user ?? sess?.data?.user ?? null;
  const userId = String(user?.id || '');
  const nameRef = useRef('');
  nameRef.current = String(user?.username || user?.name || '').trim();
  const { off: assistantOff } = useAssistantOff();
  const [chatHint, setChatHint] = useState('');
  const [voiceHint, setVoiceHint] = useState('');
  const [wakeOn, setWakeOn] = useState(false);
  const [wakeMsg, setWakeMsg] = useState('');
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const wakeRecRef = useRef<any>(null);
  const wakeTimer = useRef(0);
  const wakeSession = useRef(0);
  const wakeDelay = useRef(350);
  const autoCloseRef = useRef(false);

  const recRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionRef = useRef(0);
  const startTimer = useRef(0);
  const orbHold = useRef<{ timer: number; fired: boolean }>({ timer: 0, fired: false });

  const msg = useCallback((ar: string, en: string) => (uiLang === 'ar' ? ar : uiLang === 'en' ? en : `${ar}  ·  ${en}`), [uiLang]);

  // تحميل الأصوات + فك قفل الصوت عند أول لمسة
  useEffect(() => {
    try { localStorage.removeItem(LANG_KEY); } catch { /* ignore */ } // language is automatic: drop any pinned language
    loadVoices();
    try { window.speechSynthesis?.addEventListener?.('voiceschanged', loadVoices); } catch { /* ignore */ }
    const unlock = () => { getCtx(); };
    window.addEventListener('pointerup', unlock, { once: true, passive: true });
    window.addEventListener('touchend', unlock, { once: true, passive: true });
    return () => {
      try { window.speechSynthesis?.removeEventListener?.('voiceschanged', loadVoices); } catch { /* ignore */ }
      window.removeEventListener('pointerup', unlock);
      window.removeEventListener('touchend', unlock);
    };
  }, []);

  const killRecognition = useCallback(() => {
    const r = recRef.current;
    recRef.current = null;
    if (r) {
      try { r.onresult = null; r.onerror = null; r.onend = null; } catch { /* ignore */ }
      try { r.abort(); } catch { /* ignore */ }
    }
  }, []);

  const stopWake = useCallback(() => {
    wakeSession.current += 1;
    window.clearTimeout(wakeTimer.current);
    const r = wakeRecRef.current;
    wakeRecRef.current = null;
    if (r) {
      try { r.onresult = null; r.onerror = null; r.onend = null; } catch { /* ignore */ }
      try { r.abort(); } catch { /* ignore */ }
    }
  }, []);

  const cancelAll = useCallback((closePage: boolean) => {
    sessionRef.current += 1;
    window.clearTimeout(startTimer.current);
    killRecognition();
    stopSpeaking();
    try { abortRef.current?.abort(); } catch { /* ignore */ }
    abortRef.current = null;
    setPhase('idle');
    setHeard('');
    setNotice('');
    if (closePage) { setPageOpen(false); setTyping(false); resetChat(); }
  }, [killRecognition]);

  const ttsFails = useRef(0);
  const followUpRef = useRef(false);
  const listenRef = useRef<((session: number, lang: string, attempt: number) => void) | null>(null);

  /** Natural female voice (server) with automatic fallback to the phone's own voice. */
  const speakNatural = useCallback(async (
    text: string, lang: 'ar' | 'en', audio: string | undefined,
    alive: () => boolean, onStart: () => void, onEnd: () => void,
  ) => {
    let b64: string | null = audio || null;
    if (!b64 && ttsFails.current < 2) {
      b64 = await ttsOnly(cleanForSpeech(text), lang).catch(() => null);
      if (!b64) ttsFails.current += 1;
    }
    if (!alive()) return;
    if (b64) {
      const ok = await playAudio(getCtx(), b64, onStart, onEnd);
      if (ok) { setVoiceHint(''); return; }
      if (!alive()) return;
    }
    const why = getVoiceIssue();
    setVoiceHint('speechSynthesis' in window
      ? `Using the phone voice. ${why || 'The natural voice could not be played.'}`
      : `No voice output on this device. ${why}`.trim());
    speak(text, onStart, onEnd);
  }, []);

  /** After she finishes talking: keep the conversation going by listening again (chat answers only). */
  const afterSpeech = useCallback((session: number, lang: 'ar' | 'en', convo: boolean) => {
    if (session !== sessionRef.current) return;
    if (convo) {
      followUpRef.current = true;
      setHeard('');
      setNotice('');
      setPhase('listening');
      listenRef.current?.(session, lang === 'ar' ? 'ar-SA' : 'en-US', 0);
    } else setPhase('idle');
  }, []);

  const ask = useCallback(async (q: string, session: number) => {
    setQuestion(q);
    setUiLang(hasArabic(q) ? 'ar' : 'en');
    setAnswer(null);
    setError('');
    setNotice('');
    setChatHint('');
    setVoiceHint('');
    setPhase('thinking');
    beep('got');
    vibrate(20);
    const ac = new AbortController();
    abortRef.current = ac;
    const timeout = window.setTimeout(() => ac.abort(), 14000);
    try {
      const res = await askAssistant(q, ac.signal, nameRef.current);
      if (session !== sessionRef.current) return;
      setAnswer(res);
      setTyping(true);
      setChatHint(res.provider === 'chat' || res.provider === 'local' ? '' : getChatIssue());
      if (res.heard) setQuestion(res.heard); // show what she really understood (English stays English)
      const said = res.spoken || res.text;
      const sayLang: 'ar' | 'en' = res.lang || (hasArabic(said) ? 'ar' : 'en');
      if (res.lang) {
        setUiLang(res.lang);
        try { localStorage.setItem(LAST_LANG_KEY, res.lang === 'ar' ? 'ar-SA' : 'en-US'); } catch { /* ignore */ }
      }
      void speakNatural(
        said, sayLang, res.audio,
        () => session === sessionRef.current,
        () => { if (session === sessionRef.current) setPhase('speaking'); },
        () => afterSpeech(session, sayLang, res.provider === 'chat'),
      );
    } catch (e: any) {
      if (session !== sessionRef.current) return;
      beep('error');
      const ar = hasArabic(q);
      setError(
        e?.name === 'AbortError'
          ? (ar ? 'انتهى الوقت قبل ما يجي الجواب، حاول مرة ثانية.' : 'Timed out before an answer arrived. Please try again.')
          : (ar ? 'تعذّر جلب الجواب، تأكد من الإنترنت وحاول مرة ثانية.' : "Couldn't get an answer. Check your connection and try again."),
      );
      setPhase('idle');
    } finally {
      window.clearTimeout(timeout);
    }
  }, [speakNatural, afterSpeech]);

  /** يسمع بلغة معيّنة. لو الثقة ضعيفة يبدّل العربي/الإنجليزي مرة وحدة تلقائياً */
  const listen = useCallback((session: number, lang: string, attempt: number) => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    recRef.current = rec;
    let finalText = '';
    let conf = 0;
    let failed = false;
    const forced = (() => { try { return localStorage.getItem(LANG_KEY); } catch { return null; } })();
    rec.lang = forced || lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onresult = (ev: any) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const alt = ev.results[i][0];
        const t = alt?.transcript || '';
        if (ev.results[i].isFinal) { finalText += t; conf = Math.max(conf, Number(alt?.confidence) || 0); } else interim += t;
      }
      const shown = (finalText + ' ' + interim).trim();
      setHeard(shown);
      if (shown) setUiLang(hasArabic(shown) ? 'ar' : 'en');
    };
    rec.onerror = (ev: any) => {
      const code = String(ev?.error || '');
      if (code === 'no-speech' || code === 'aborted') return;
      failed = true;
      beep('error');
      setQuestion('');
      setAnswer(null);
      setError(
        code === 'not-allowed' || code === 'service-not-allowed'
          ? 'اسمح للتطبيق باستخدام المايك.  ·  Please allow microphone access.'
          : code === 'audio-capture'
            ? 'المايك مشغول — لو أنت داخل مكالمة أو بث سكّره وجرّب.  ·  Microphone is busy.'
            : 'صار خطأ في التعرّف على الصوت، حاول مرة ثانية.  ·  Speech recognition error, try again.',
      );
      setPhase('idle');
    };
    rec.onend = () => {
      if (session !== sessionRef.current) return;
      recRef.current = null;
      if (failed) return;
      const q = finalText.trim();
      if (!q) {
        beep('error'); setHeard('');
        if (followUpRef.current) { followUpRef.current = false; setPhase('idle'); return; } // silence after her reply: keep the page, just stop listening
        if (autoCloseRef.current) { cancelAll(true); return; } // نداء بالصوت وما تكلمت => نقفل الصفحة
        setPhase('idle');
        return;
      }
      // ثقة ضعيفة + ما في لغة مثبّتة + لسه ما جرّبنا اللغة الثانية => نبدّل اللغة ونسمع مرة ثانية
      if (!forced && attempt === 0 && conf > 0 && conf < 0.55) {
        const other = rec.lang.toLowerCase().startsWith('ar') ? 'en-US' : 'ar-SA';
        setNotice('ما فهمت، قلها مرة ثانية  ·  Say it again');
        setHeard('');
        beep('got');
        startTimer.current = window.setTimeout(() => {
          if (session === sessionRef.current) listen(session, other, 1);
        }, 350);
        return;
      }
      try { localStorage.setItem(LAST_LANG_KEY, hasArabic(q) ? 'ar-SA' : 'en-US'); } catch { /* ignore */ }
      followUpRef.current = false;
      void ask(q, session);
    };
    try { rec.start(); } catch {
      beep('error');
      setError('تعذّر تشغيل المايك.  ·  Could not start the microphone.');
      setPhase('idle');
    }
  }, [ask, cancelAll]);
  listenRef.current = listen;

  const begin = useCallback((newRect?: Rect | null) => {
    if (vaOff) return; // assistant is switched off
    sessionRef.current += 1;
    const session = sessionRef.current;
    window.clearTimeout(startTimer.current);
    killRecognition();
    stopSpeaking();
    try { abortRef.current?.abort(); } catch { /* ignore */ }

    stopWake();
    autoCloseRef.current = false;
    followUpRef.current = false;
    if (newRect) setRect(newRect);
    setPageOpen(true);
    setError('');
    setNotice('');
    setHeard('');
    setQuestion('');
    setAnswer(null);
    setTyping(false);
    setUiLang(null);

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      beep('error');
      setError('هذا المتصفح لا يدعم التعرّف على الصوت. افتح التطبيق من كروم أندرويد.  ·  Speech recognition is not supported here. Open the app in Chrome on Android.');
      setPhase('idle');
      return;
    }

    getCtx();
    try { if ('speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch { /* ignore */ }

    beep('ready');
    vibrate([18, 45, 18]);
    setPhase('listening');

    const last = (() => { try { return localStorage.getItem(LAST_LANG_KEY) || 'ar-SA'; } catch { return 'ar-SA'; } })();
    // نبدأ التسجيل بعد نغمة الجاهزية حتى ما تنلقط كسؤال
    startTimer.current = window.setTimeout(() => {
      if (session === sessionRef.current) listen(session, last, 0);
    }, 520);
  }, [killRecognition, listen, stopWake]);

  // ───────── النداء الصوتي: قل "Stooorna" / "ستورنا" => يرد "Yes <username>" / "نعم <username>" ─────────
  const handleWake = useCallback((lang: 'ar' | 'en', rest: string, isFinal: boolean) => {
    if (vaOff) return;
    stopWake();
    sessionRef.current += 1;
    const session = sessionRef.current;
    window.clearTimeout(startTimer.current);
    killRecognition();
    stopSpeaking();
    try { abortRef.current?.abort(); } catch { /* ignore */ }
    autoCloseRef.current = true;
    followUpRef.current = false;

    const r = iconRectOf(globeEl);
    if (r) setRect(r);
    setPageOpen(true);
    setError(''); setHeard(''); setQuestion(''); setAnswer(null); setTyping(false);
    setUiLang(lang);
    try { localStorage.setItem(LAST_LANG_KEY, lang === 'ar' ? 'ar-SA' : 'en-US'); } catch { /* ignore */ }

    const raw = nameRef.current;
    const say = raw.replace(/[_.\-]+/g, ' ').trim();
    const word = lang === 'ar' ? 'نعم' : 'Yes';
    setNotice(raw ? `${word} ${raw}` : word);
    vibrate([25, 40, 25]);
    setPhase('speaking');

    const trailing = isFinal && rest.length >= 4 ? rest : '';
    let proceeded = false;
    const proceed = () => {
      if (proceeded || session !== sessionRef.current) return;
      proceeded = true;
      if (trailing) { void ask(trailing, session); return; }
      setPhase('listening');
      listen(session, lang === 'ar' ? 'ar-SA' : 'en-US', 0);
    };
    void speakNatural(say ? `${word}, ${say}` : word, lang, undefined, () => session === sessionRef.current && !proceeded, () => {}, proceed);
    window.setTimeout(proceed, 4500); // لو النطق ما اشتغل لأي سبب ما نعلّق
  }, [ask, listen, killRecognition, stopWake, speakNatural]);

  const startWake = useCallback(() => {
    stopWake();
    const my = wakeSession.current;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    wakeRecRef.current = rec;
    let handled = false;
    const forced = (() => { try { return localStorage.getItem(LANG_KEY); } catch { return null; } })();
    const last = (() => { try { return localStorage.getItem(LAST_LANG_KEY); } catch { return null; } })();
    rec.lang = forced || last || 'ar-SA';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    const retry = (ms: number) => {
      window.clearTimeout(wakeTimer.current);
      wakeTimer.current = window.setTimeout(() => { if (my === wakeSession.current) startWake(); }, ms);
    };
    rec.onresult = (ev: any) => {
      if (handled) return;
      wakeDelay.current = 350;
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        for (let j = 0; j < res.length; j++) {
          const m = matchWake(String(res[j]?.transcript || ''));
          if (m) { handled = true; handleWake(m.lang, m.rest, !!res.isFinal); return; }
        }
      }
    };
    rec.onerror = (ev: any) => {
      const code = String(ev?.error || '');
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        wakeDelay.current = 0; // stop for this session only; it retries on the next app launch
        setWakeMsg('Allow the microphone so voice wake can work');
      } else if (code === 'audio-capture') wakeDelay.current = 20000; // المايك مشغول (مكالمة/بث)
      else if (code === 'network') wakeDelay.current = 6000;
    };
    rec.onend = () => {
      if (my !== wakeSession.current || handled) return;
      wakeRecRef.current = null;
      if (wakeDelay.current > 0) retry(wakeDelay.current);
    };
    try { rec.start(); } catch { retry(2000); }
  }, [handleWake, stopWake, userId]);

  useEffect(() => {
    if (!userId) { setWakeOn(false); return; }
    try {
      const v = localStorage.getItem(`${WAKE_KEY}_${userId}`);
      setWakeOn(v === null ? WAKE_DEFAULT_ON : v === '1');
    } catch { setWakeOn(WAKE_DEFAULT_ON); }
  }, [userId]);

  // Ask for the mic permission once (first touch) so wake listening can start without any further tap
  useEffect(() => {
    if (!wakeOn || !userId) return;
    let done = false;
    const warm = async () => {
      if (done) return;
      done = true;
      try {
        const md = navigator.mediaDevices;
        if (!md?.getUserMedia) return;
        const st = await md.getUserMedia({ audio: true });
        st.getTracks().forEach(t => t.stop());
        wakeDelay.current = 350;
        setWakeMsg('');
      } catch { /* permission denied or mic busy: wake retries by itself */ }
    };
    window.addEventListener('pointerdown', warm, { once: true, passive: true });
    return () => window.removeEventListener('pointerdown', warm);
  }, [wakeOn, userId]);

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // النداء يشتغل بس لما المساعد فاضي (مو يسمع/يبحث/يتكلم) والتطبيق مفتوح على الشاشة
  useEffect(() => {
    if (wakeOn && userId && phase === 'idle' && !hidden && !assistantOff) { wakeDelay.current = 350; startWake(); }
    else stopWake();
    return () => stopWake();
  }, [wakeOn, userId, phase, hidden, assistantOff, startWake, stopWake]);

  // Pre-load the "Yes <username>" / Arabic greeting voice so it plays instantly after the wake word
  useEffect(() => {
    if (wakeOn && userId && nameRef.current) prefetchGreeting(nameRef.current);
  }, [wakeOn, userId]);

  // switched off (6-second hold): stop everything, paint the globe orange; switched on: restore it
  useEffect(() => {
    if (assistantOff) { cancelAll(true); stopWake(); }
    let prev: HTMLElement | null = null;
    const paint = () => {
      const el = globeEl;
      if (prev && prev !== el) unpaintOff(prev);
      if (el) { if (assistantOff) paintOff(el); else unpaintOff(el); }
      prev = el;
    };
    paint();
    const id = assistantOff ? window.setInterval(paint, 400) : 0;
    return () => { if (id) window.clearInterval(id); if (prev) unpaintOff(prev); };
  }, [assistantOff, cancelAll, stopWake]);

  const toggleWake = () => {
    const next = !wakeOn;
    setWakeOn(next);
    setWakeMsg('');
    try { localStorage.setItem(`${WAKE_KEY}_${userId}`, next ? '1' : '0'); } catch { /* ignore */ }
    if (next) getCtx();
  };

  useEffect(() => {
    const onStart = (e: Event) => begin((e as CustomEvent).detail?.rect || null);
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

  // ── الأيقونة الحيّة: نقرة = إيقاف وإغلاق، ضغطة مطوّلة = سؤال جديد ──
  const clearOrbTimer = () => { if (orbHold.current.timer) { window.clearTimeout(orbHold.current.timer); orbHold.current.timer = 0; } };
  const orbHandlers = {
    onPointerDown: () => {
      orbHold.current.fired = false;
      clearOrbTimer();
      orbHold.current.timer = window.setTimeout(() => {
        orbHold.current.timer = 0;
        orbHold.current.fired = true;
        vibrate(35);
        begin(null);
      }, LONG_PRESS_MS);
    },
    onPointerUp: clearOrbTimer,
    onPointerCancel: clearOrbTimer,
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
    onClick: () => {
      if (orbHold.current.fired) { orbHold.current.fired = false; return; }
      cancelAll(true);
    },
  };

  const vw = typeof window !== 'undefined' ? window.innerWidth : 400;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const orb: Rect = rect || { left: vw / 2 - 22, top: vh - 80, width: 44, height: 44 };
  const size = Math.max(36, Math.min(orb.width, orb.height));
  const bars = [0.55, 0.85, 1, 0.85, 0.55];
  const barAnim = (i: number) => {
    if (phase === 'listening') return `stooornaVaBar ${0.5 + (i % 3) * 0.12}s ease-in-out ${i * 0.07}s infinite`;
    if (phase === 'speaking') return `stooornaVaBar ${0.42 + (i % 2) * 0.22}s ease-in-out ${i * 0.05}s infinite`;
    if (phase === 'thinking') return `stooornaVaBar 1.3s ease-in-out ${i * 0.16}s infinite`;
    return 'none';
  };
  const statusLabel =
    phase === 'listening' ? msg('يسمعك…', 'Listening…') :
    phase === 'thinking' ? msg('يبحث…', 'Searching…') :
    phase === 'speaking' ? msg('يتكلم…', 'Speaking…') : 'Stooorna';

  return (
    <>
      <style>{`
        @keyframes stooornaVaBar { 0%,100% { transform: scaleY(0.2); } 50% { transform: scaleY(1); } }
        @keyframes stooornaVaRing { 0% { box-shadow: 0 0 0 0 rgba(0,188,212,0.6); } 100% { box-shadow: 0 0 0 20px rgba(0,188,212,0); } }
        @keyframes stooornaVaDots { 0%,80%,100% { opacity: 0.25; } 40% { opacity: 1; } }
      `}</style>

      {/* ── الصفحة البيضاء الكاملة: تطلع من تحت لفوق وتغطي كل الأقسام ── */}
      <div
        aria-hidden={!pageOpen}
        style={{
          position: 'fixed', inset: 0, zIndex: Z_PAGE, background: '#ffffff', color: '#000',
          transform: pageOpen ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.38s cubic-bezier(0.32,0.72,0,1)',
          overflowY: 'auto', WebkitOverflowScrolling: 'touch', boxSizing: 'border-box',
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 18px)',
          paddingLeft: 16, paddingRight: 16,
          paddingBottom: Math.max(120, vh - orb.top + 28),
          pointerEvents: pageOpen ? 'auto' : 'none',
        }}
      >
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14, fontWeight: 300 }}>
            <span style={{ fontSize: 13, color: '#444' }}>{statusLabel}</span>
            <span style={{ fontSize: 11, color: '#999' }}>{msg('اضغط الأيقونة للإيقاف', 'Tap the icon to stop')}</span>
          </div>

          {userId ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
              <div dir="auto" style={{ fontSize: 12, fontWeight: 300, color: '#444', lineHeight: 1.6 }}>
                {msg('النداء بالصوت: قل «ستورنا»', 'Voice wake: say "Stooorna"')}
                {wakeMsg ? <div style={{ fontSize: 11, color: '#b00020' }}>{wakeMsg}</div> : null}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={wakeOn}
                aria-label="Voice wake"
                onClick={toggleWake}
                style={{
                  direction: 'ltr', position: 'relative', flex: '0 0 auto', width: 44, height: 26, borderRadius: 13, border: 'none', padding: 0,
                  cursor: 'pointer', background: wakeOn ? '#0b0b0b' : '#d1d5db', transition: 'background 0.2s ease',
                }}
              >
                <span style={{ position: 'absolute', top: 3, left: wakeOn ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s ease' }} />
              </button>
            </div>
          ) : null}

          {(question || heard) ? (
            <div dir="auto" style={{ fontSize: 14, fontWeight: 300, color: '#666', marginBottom: 10, textAlign: 'start', wordBreak: 'break-word' }}>
              {question || heard}
            </div>
          ) : null}

          <div style={{ border: '1px solid rgba(0,0,0,0.14)', borderRadius: 8, background: '#fff', padding: '16px 14px', minHeight: 70 }}>
            {error ? (
              <div dir="auto" style={{ fontSize: 15, fontWeight: 300, lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>{error}</div>
            ) : answer ? (
              <>
                <div dir="auto" style={{ fontSize: 17, fontWeight: 300, lineHeight: 2, whiteSpace: 'pre-wrap', textAlign: 'start', wordBreak: 'break-word' }}>
                  {shownText}
                </div>
                {answer.images.length ? (
                  <div style={{ display: 'grid', gridTemplateColumns: answer.images.length === 1 ? '1fr' : '1fr 1fr', gap: 8, marginTop: 14 }}>
                    {answer.images.slice(0, 4).map((src, i) => (
                      <img
                        key={src + i} src={src} alt="" loading="lazy" referrerPolicy="no-referrer"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 6, border: '1px solid rgba(0,0,0,0.1)', background: '#f3f4f6' }}
                      />
                    ))}
                  </div>
                ) : null}
              </>
            ) : phase === 'thinking' ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', height: 30 }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#000', animation: `stooornaVaDots 1.1s ease-in-out ${i * 0.18}s infinite` }} />
                ))}
              </div>
            ) : (
              <div dir="auto" style={{ fontSize: 16, fontWeight: 300, color: notice ? '#000' : '#888', lineHeight: 1.9, textAlign: 'center', paddingTop: 6 }}>
                {notice || msg('تفضّل اسأل…', 'Go ahead, ask…')}
              </div>
            )}
          </div>

          {(chatHint || voiceHint) ? (
            <div dir="ltr" style={{ marginTop: 10, fontSize: 11, fontWeight: 300, color: '#888', lineHeight: 1.6 }}>
              {chatHint ? <div>{chatHint}</div> : null}
              {voiceHint ? <div>{voiceHint}</div> : null}
            </div>
          ) : null}

          {answer?.sources?.length ? (
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
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
      </div>

      {/* ── الأيقونة نفسها فوق الصفحة وفي نفس مكانها: تصير ذبذبات صوت ── */}
      <button
        type="button"
        aria-label="إيقاف المساعد الصوتي"
        {...orbHandlers}
        style={{
          position: 'fixed', left: orb.left, top: orb.top, width: orb.width, height: orb.height, zIndex: Z_ORB,
          borderRadius: Math.round(size * 0.28), border: 'none', padding: 0, cursor: 'pointer',
          background: '#0b0b0b',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: Math.max(2, Math.round(size * 0.06)),
          opacity: pageOpen ? 1 : 0, pointerEvents: pageOpen ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
          touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
          animation: phase === 'listening' || phase === 'speaking' ? 'stooornaVaRing 1.1s ease-out infinite' : 'none',
          boxShadow: '0 6px 18px rgba(0,0,0,0.3)',
        } as any}
      >
        {bars.map((h, i) => (
          <span
            key={i}
            style={{
              width: Math.max(3, Math.round(size * 0.075)), height: Math.round(size * 0.6 * h), borderRadius: 3, background: '#fff',
              transformOrigin: 'center', transform: phase === 'idle' ? 'scaleY(0.3)' : undefined, animation: barAnim(i),
            }}
          />
        ))}
      </button>
    </>
  );
}

export default VoiceAssistantHost;
