/**
 * VOICE-CHAT  (src/lib/voiceChat.ts)
 *
 * Client engine used by voiceAssistantPatch.tsx:
 *   - chatTurn():   free conversation with the assistant (Gulf Arabic / American English), keeps short history
 *   - ttsOnly():    natural female voice for any short text (used for the "Yes <username>" greeting)
 *   - playAudio():  plays the returned mp3 through WebAudio (works after the first touch, no extra tap)
 *   - language preference helpers (Auto / AR / EN) stored under the same key the patch already uses
 *
 * Needs the backend route api/voice-chat/POST.ts. If the route is missing or not configured,
 * every function returns null/false and the patch falls back to the old search + browser voice.
 */

export const CHAT_ENDPOINT = '/api/voice-chat';
const LANG_KEY = 'stooorna_voice_lang'; // same key as voiceAssistantPatch.tsx ('ar-SA' | 'en-US' | absent = auto)
const HISTORY_MAX = 12; // messages kept (6 turns)
const HISTORY_TTL_MS = 5 * 60_000;

export type LangPref = 'auto' | 'ar' | 'en';
export interface ChatReply {
  text: string;
  spoken: string;
  lang: 'ar' | 'en';
  audio?: string; // base64 mp3
}

const hasArabic = (s: string) => /[\u0600-\u06FF]/.test(s);

// ───────────── language preference ─────────────
export function getLangPref(): LangPref {
  try {
    const v = (localStorage.getItem(LANG_KEY) || '').toLowerCase();
    if (v.startsWith('ar')) return 'ar';
    if (v.startsWith('en')) return 'en';
  } catch { /* ignore */ }
  return 'auto';
}

export function setLangPref(p: LangPref) {
  try {
    if (p === 'auto') localStorage.removeItem(LANG_KEY);
    else localStorage.setItem(LANG_KEY, p === 'ar' ? 'ar-SA' : 'en-US');
  } catch { /* ignore */ }
}

// ───────────── conversation memory (in the page only) ─────────────
type Msg = { role: 'user' | 'assistant'; content: string };
let history: Msg[] = [];
let lastTurnAt = 0;

export function resetChat() { history = []; lastTurnAt = 0; }

async function post(body: unknown, signal?: AbortSignal): Promise<any | null> {
  try {
    const r = await fetch(CHAT_ENDPOINT, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal,
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e;
    return null;
  }
}

/** One conversation turn. Returns null if chat is not available (patch then uses search). */
export async function chatTurn(q: string, lang: 'ar' | 'en', name: string, signal?: AbortSignal): Promise<ChatReply | null> {
  if (Date.now() - lastTurnAt > HISTORY_TTL_MS) history = [];
  const d = await post({ mode: 'chat', q, lang, name, history }, signal);
  if (!d?.ok || !d.answer) return null;
  const text = String(d.answer);
  history = [...history, { role: 'user' as const, content: q }, { role: 'assistant' as const, content: text }].slice(-HISTORY_MAX);
  lastTurnAt = Date.now();
  const outLang: 'ar' | 'en' = d.lang === 'en' ? 'en' : d.lang === 'ar' ? 'ar' : hasArabic(text) ? 'ar' : 'en';
  return { text, spoken: String(d.spoken || text), lang: outLang, audio: typeof d.audio === 'string' && d.audio ? d.audio : undefined };
}

// ───────────── text-to-speech only (cached) ─────────────
const ttsCache = new Map<string, string>();

export async function ttsOnly(text: string, lang: 'ar' | 'en', signal?: AbortSignal): Promise<string | null> {
  const key = `${lang}|${text}`;
  const hit = ttsCache.get(key);
  if (hit) return hit;
  const d = await post({ mode: 'tts', say: text, lang }, signal);
  const audio = d?.ok && typeof d.audio === 'string' && d.audio ? d.audio : null;
  if (audio) { if (ttsCache.size > 40) ttsCache.clear(); ttsCache.set(key, audio); }
  return audio;
}

/** Warm the cache so the "Yes <name>" greeting plays instantly after the wake word. */
export function prefetchGreeting(name: string) {
  const who = name.replace(/[_.\-]+/g, ' ').trim();
  void ttsOnly(who ? `Yes, ${who}` : 'Yes', 'en').catch(() => {});
  void ttsOnly(who ? `\u0646\u0639\u0645, ${who}` : '\u0646\u0639\u0645', 'ar').catch(() => {});
}

// ───────────── playback ─────────────
let currentSrc: AudioBufferSourceNode | null = null;
let currentEl: HTMLAudioElement | null = null;

export function stopAudio() {
  const s = currentSrc; currentSrc = null;
  if (s) { try { s.onended = null; s.stop(); } catch { /* ignore */ } }
  const a = currentEl; currentEl = null;
  if (a) { try { a.onended = null; a.onerror = null; a.pause(); a.src = ''; } catch { /* ignore */ } }
}

function b64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8.buffer;
}

/** Plays base64 mp3. Resolves true if playback started (onEnd will fire), false if the caller should fall back. */
export async function playAudio(ctx: AudioContext | null, b64: string, onStart: () => void, onEnd: () => void): Promise<boolean> {
  stopAudio();
  if (ctx) {
    try {
      if (ctx.state === 'suspended') await ctx.resume();
      if (ctx.state === 'running') {
        const buf = await ctx.decodeAudioData(b64ToBuffer(b64));
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        currentSrc = src;
        src.onended = () => { if (currentSrc === src) currentSrc = null; onEnd(); };
        src.start();
        onStart();
        return true;
      }
    } catch { /* try the audio element next */ }
  }
  try {
    const a = new Audio(`data:audio/mpeg;base64,${b64}`);
    currentEl = a;
    a.onended = () => { if (currentEl === a) currentEl = null; onEnd(); };
    a.onerror = () => { if (currentEl === a) currentEl = null; onEnd(); };
    await a.play();
    onStart();
    return true;
  } catch {
    currentEl = null;
    return false;
  }
}
