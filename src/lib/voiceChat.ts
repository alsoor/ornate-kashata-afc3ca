/**
 * VOICE-CHAT  (src/lib/voiceChat.ts)
 *
 * Client engine used by voiceAssistantPatch.tsx (English US only):
 *   - chatTurn():   free conversation with the assistant (American English), keeps short history
 *   - ttsOnly():    natural female voice for any short text (used for the "Yes <username>" greeting)
 *   - playAudio():  plays the returned mp3 through WebAudio (works after the first touch, no extra tap)
 *   - readable diagnostics (getChatIssue / getVoiceIssue) so you can see why chat or the natural voice is not working
 *
 * Needs the backend route api/voice-chat/POST.ts. If the route is missing or not configured,
 * every function returns null/false and the patch falls back to the old search + browser voice.
 */

export const CHAT_ENDPOINT = '/api/voice-chat';
const HISTORY_MAX = 12; // messages kept (6 turns)
const HISTORY_TTL_MS = 5 * 60_000;

export interface ChatReply {
  text: string;
  spoken: string;
  heard?: string; // what the user really said (English speech the phone wrote in Arabic letters is fixed here)
  lang: 'en';
  audio?: string; // base64 mp3
}

// ───────────── diagnostics (shown in small gray text under the answer) ─────────────
let chatIssue = '';
let voiceIssue = '';
let netIssue = '';
export const getChatIssue = () => chatIssue;
export const getVoiceIssue = () => voiceIssue;

function explainTts(code: unknown): string {
  const c = String(code || '');
  if (c === 'no_key') return 'Natural voice is off: set AZURE_TTS_KEY and AZURE_TTS_REGION on the server.';
  const m = /^http_(\d+)/.exec(c);
  if (m) return `Natural voice error from Azure (HTTP ${m[1]}): check the key, the region and the voice name.`;
  if (c === 'timeout') return 'Natural voice timed out.';
  return 'Natural voice is unavailable.';
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
    if (!r.ok) { netIssue = `Server route ${CHAT_ENDPOINT} answered HTTP ${r.status}. Is api/voice-chat/POST.ts deployed?`; return null; }
    netIssue = '';
    return await r.json();
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e;
    netIssue = `Could not reach ${CHAT_ENDPOINT}.`;
    return null;
  }
}

/** One conversation turn. Returns null if chat is not available (patch then uses search). */
export async function chatTurn(q: string, name: string, signal?: AbortSignal): Promise<ChatReply | null> {
  if (Date.now() - lastTurnAt > HISTORY_TTL_MS) history = [];
  let now = '';
  try { now = new Date().toString(); } catch { /* ignore */ }
  const d = await post({ mode: 'chat', q, name, now, history }, signal);
  if (!d?.ok || !d.answer) {
    chatIssue = !d ? netIssue : String(d.detail || d.error || 'Chat is unavailable.');
    return null;
  }
  chatIssue = '';
  const text = String(d.answer);
  const heard = typeof d.heard === 'string' && d.heard.trim() ? d.heard.trim() : undefined;
  history = [...history, { role: 'user' as const, content: heard || q }, { role: 'assistant' as const, content: text }].slice(-HISTORY_MAX);
  lastTurnAt = Date.now();
  const audio = typeof d.audio === 'string' && d.audio ? d.audio : undefined;
  voiceIssue = audio ? '' : explainTts(d.ttsError);
  return { text, spoken: String(d.spoken || text), heard, lang: 'en', audio };
}

// ───────────── text-to-speech only (cached) ─────────────
const ttsCache = new Map<string, string>();

export async function ttsOnly(text: string, lang: 'en' = 'en', signal?: AbortSignal): Promise<string | null> {
  const key = `${lang}|${text}`;
  const hit = ttsCache.get(key);
  if (hit) return hit;
  const d = await post({ mode: 'tts', say: text, lang }, signal);
  const audio = d?.ok && typeof d.audio === 'string' && d.audio ? d.audio : null;
  if (audio) { if (ttsCache.size > 40) ttsCache.clear(); ttsCache.set(key, audio); voiceIssue = ''; }
  else voiceIssue = d ? explainTts(d.ttsError) : netIssue;
  return audio;
}

/** Warm the cache so the "Yes <name>" greeting plays instantly after the wake word. */
export function prefetchGreeting(name: string) {
  const who = name.replace(/[_.\-]+/g, ' ').trim();
  void ttsOnly(who ? `Yes, ${who}` : 'Yes', 'en').catch(() => {});
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
export async function playAudio(ctx: AudioContext | null, b64: string, onStart: () => void, onEnd: () => void, alive?: () => boolean): Promise<boolean> {
  stopAudio();
  if (ctx) {
    try {
      if (ctx.state === 'suspended') await ctx.resume();
      if (ctx.state === 'running') {
        const buf = await ctx.decodeAudioData(b64ToBuffer(b64));
        if (alive && !alive()) return true; // closed while decoding: do not play
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
    if (alive && !alive()) { currentEl = null; return true; }
    await a.play();
    if (alive && !alive()) { try { a.pause(); } catch { /* ignore */ } currentEl = null; return true; }
    onStart();
    return true;
  } catch {
    currentEl = null;
    return false;
  }
}
