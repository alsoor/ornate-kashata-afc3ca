/**
 * VOICE-GUIDE — Stooorna Ai spoken guide (Kuwaiti Arabic).
 * Standalone file in src/ai, linked from StooornaAiSheet.tsx.
 *
 *  • Plays automatically when the Stooorna Ai page opens on its welcome screen, and from the
 *    "Voice guide" button next to the quick-action chips.
 *  • If a real recording exists at  public/stooorna-ai-guide.mp3  (served as /stooorna-ai-guide.mp3)
 *    it is played. Otherwise the phone's Arabic text-to-speech voice reads VOICE_GUIDE_SENTENCES.
 *  • Only one guide plays at a time; stopVoiceGuide() cuts it immediately.
 */

/** Public URL of an optional real recording (drop the mp3 in /public to use your own voice). */
export const VOICE_GUIDE_AUDIO_URL = '/stooorna-ai-guide.mp3';

/** The guide text, in Kuwaiti dialect. "Stooorna Ai" is spelled the way it should sound. */
export const VOICE_GUIDE_SENTENCES: string[] = [
  'هلا والله! هذا ستوورنا إيه آي.',
  'من هني تقدر ترسل صور وفيديوهات، وتعدّل على الصور، وحتى تدمج صوت وموسيقى مع الفيديو اللي تبيه.',
  'وإذا تبي تنشر فيديو أو صورة عادية، اضغط ضغطة طويلة على أيقونة ستوورنا إيه آي، وبتنفتح لك صفحة النشر.',
  'ارفق الصورة اللي تبيها أو الفيديو، وانشره في التيمبلاتس.',
  'وإذا تبي تسمع الشرح مرة ثانية، اضغط على زر الصوت اللي تحت. الله يعطيك العافية!',
];

let audioEl: HTMLAudioElement | null = null;
let playing = false;
let token = 0;
const subs = new Set<() => void>();

function setPlaying(v: boolean) {
  if (playing === v) return;
  playing = v;
  subs.forEach(f => { try { f(); } catch { /* */ } });
}

export function isVoiceGuidePlaying(): boolean { return playing; }

export function subscribeVoiceGuide(f: () => void): () => void {
  subs.add(f);
  return () => { subs.delete(f); };
}

export function voiceGuideSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'speechSynthesis' in window || typeof Audio !== 'undefined';
}

function pickArabicVoice(): SpeechSynthesisVoice | null {
  try {
    const all = window.speechSynthesis.getVoices();
    const ar = all.filter(v => String(v.lang || '').toLowerCase().startsWith('ar'));
    if (!ar.length) return null;
    return ar.find(v => /ar[-_]kw/i.test(v.lang))
      || ar.find(v => /ar[-_](sa|ae|qa|bh)/i.test(v.lang))
      || ar[0];
  } catch { return null; }
}

function speakWithVoice(my: number) {
  const synth = window.speechSynthesis;
  const go = () => {
    if (my !== token) return;
    try { synth.cancel(); } catch { /* */ }
    const voice = pickArabicVoice();
    const lastIdx = VOICE_GUIDE_SENTENCES.length - 1;
    VOICE_GUIDE_SENTENCES.forEach((text, i) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = voice?.lang || 'ar-SA';
      if (voice) u.voice = voice;
      u.rate = 0.95;
      u.pitch = 1;
      u.onend = () => { if (my === token && i === lastIdx) setPlaying(false); };
      u.onerror = (e: SpeechSynthesisErrorEvent) => {
        const err = String((e as any)?.error || '');
        if (my === token && err !== 'interrupted' && err !== 'canceled') setPlaying(false);
      };
      synth.speak(u);
    });
  };
  // voices load asynchronously on some phones: wait a moment for them, then speak anyway
  if (synth.getVoices().length > 0) { go(); return; }
  let done = false;
  const once = () => { if (done) return; done = true; try { synth.removeEventListener('voiceschanged', once); } catch { /* */ } go(); };
  try { synth.addEventListener('voiceschanged', once); } catch { /* */ }
  window.setTimeout(once, 1200);
}

export function stopVoiceGuide() {
  token += 1;
  if (audioEl) { try { audioEl.pause(); } catch { /* */ } audioEl = null; }
  try { if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel(); } catch { /* */ }
  setPlaying(false);
}

export function playVoiceGuide() {
  if (!voiceGuideSupported()) return;
  stopVoiceGuide();
  const my = token;
  setPlaying(true);
  const fallback = () => {
    if (my !== token) return;
    audioEl = null;
    if ('speechSynthesis' in window) speakWithVoice(my); else setPlaying(false);
  };
  try {
    const a = new Audio(VOICE_GUIDE_AUDIO_URL);
    a.preload = 'auto';
    audioEl = a;
    let fell = false;
    const fb = () => { if (fell) return; fell = true; fallback(); };
    a.onended = () => { if (my === token) { audioEl = null; setPlaying(false); } };
    a.onerror = fb; // no recording uploaded (or not an audio file) -> use the Arabic voice instead
    const p = a.play();
    if (p && typeof p.catch === 'function') p.catch(fb);
  } catch { fallback(); }
}
