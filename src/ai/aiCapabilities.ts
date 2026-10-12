/**
 * Stooorna Ai — Capabilities (v1.2.0)
 * Place at: src/ai/aiCapabilities.ts
 *
 * ChatGPT-style abilities, as ONE separate file. Nothing in the existing files is removed or changed.
 * Like imageEditPatch.ts it installs itself once (window.fetch wrapper, ONLY for requests that end in "/chat")
 * and also exports helpers that any button in the sheet can call.
 *
 *  1. Context      : the last turns of the conversation are sent with every message ("history" + "lang").
 *  2. Web search   : when the text asks to search / latest news / price ... results are added as context.
 *                    Order: <AI_API>/search  ->  www.stooorna.com/ai/search  ->  Wikipedia (no key).
 *  3. Image create : when the text asks to draw / create an image, it is generated and handed back as
 *                    { reply, image_base64, image_mime } (same shape imageEditPatch gives the sheet).
 *                    Order: <AI_API>/image-generate  ->  Pollinations (free, no key).
 *  4. Files        : readFileForAi(file) reads txt / md / csv / json / code (any text) and queues it as context
 *                    for the next message. PDF / Word need the server (returns a clear note).
 *  5. Voice        : startListening() (speech to text) and speak() / stopSpeaking() (voice replies).
 *  6. Saved chats  : every exchange is saved per user (listChats / loadChat / deleteChat / newChat).
 *  7. Accounts & subscription : already handled by aiCredits.ts (nothing duplicated here).
 *
 * Optional config:
 *   window.__STOOORNA_AI_USER__ = { id: '123' }       (so chats are saved under the signed-in user)
 *   window.__STOOORNA_AI_LANG__ = 'ar' | 'en'
 */

export const STOOORNA_AI_CAPS_VERSION = '1.2.0';

const FLAG = '__stooornaAiCaps__';
const RAILWAY_BASE = 'https://welcoming-heart-production.up.railway.app/ai';
function fallbackBases(): string[] {
  const list: string[] = [];
  try { const b = (window as any).__STOOORNA_AI_API__; if (b) list.push(String(b).replace(/\/+$/, '')); } catch { /* */ }
  list.push(RAILWAY_BASE, 'https://www.stooorna.com/ai');
  return Array.from(new Set(list));
}
const HISTORY_TURNS = 12;
const MAX_CHATS = 60;
const MAX_FILE_CHARS = 8000; // 3 files x 8000 + search + question stays under the server's 32000-char limit

/* ------------------------------------------------------------------ helpers */

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const urlOf = (i: RequestInfo | URL): string =>
  typeof i === 'string' ? i : (typeof URL !== 'undefined' && i instanceof URL) ? i.href : (i as Request).url || '';
const isArabic = (s: string) => /[\u0600-\u06FF]/.test(s);
const jsonRes = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

function currentUserId(): string {
  try {
    const u = (window as any).__STOOORNA_AI_USER__;
    if (u?.id) return String(u.id);
  } catch { /* */ }
  return 'guest';
}

async function fetchJsonFirst(urls: string[], init: RequestInit, ms = 15000): Promise<any | null> {
  for (const u of urls) {
    try {
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), ms);
      const r = await fetch(u, { ...init, signal: ctrl.signal });
      window.clearTimeout(t);
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) return await r.json();
    } catch { /* next */ }
  }
  return null;
}

/** "<base>/chat"  ->  "<base>/<name>"  plus the fallback hosts. */
function siblings(chatUrl: string, name: string): string[] {
  const list: string[] = [];
  try { list.push(chatUrl.replace(/\/chat(\?.*)?$/, `/${name}`)); } catch { /* */ }
  fallbackBases().forEach(b => list.push(`${b}/${name}`));
  return Array.from(new Set(list));
}

/* ------------------------------------------------------------------ saved chats */

export interface ChatTurn { role: 'user' | 'assistant'; text: string; at: number; image?: boolean }
export interface SavedChat { id: string; title: string; updatedAt: number; turns: ChatTurn[] }

const chatsKey = (uid: string) => `stooorna_ai_chats_v1_${uid}`;
const curKey = (uid: string) => `stooorna_ai_chat_cur_v1_${uid}`;

function readChats(): SavedChat[] {
  try { return JSON.parse(localStorage.getItem(chatsKey(currentUserId())) || '[]') as SavedChat[]; } catch { return []; }
}
function writeChats(list: SavedChat[]) {
  try {
    const trimmed = list.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CHATS);
    localStorage.setItem(chatsKey(currentUserId()), JSON.stringify(trimmed));
    window.dispatchEvent(new CustomEvent('stooorna:ai-chats'));
  } catch { /* storage full -> keep working without saving */ }
}
function currentChatId(): string {
  const uid = currentUserId();
  try {
    let id = localStorage.getItem(curKey(uid));
    if (!id) { id = `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; localStorage.setItem(curKey(uid), id); }
    return id;
  } catch { return 'c_tmp'; }
}

export const listChats = (): SavedChat[] => readChats().sort((a, b) => b.updatedAt - a.updatedAt);
export const loadChat = (id: string): SavedChat | null => readChats().find(c => c.id === id) || null;
export function deleteChat(id: string) { writeChats(readChats().filter(c => c.id !== id)); }
/** Start a fresh conversation (the old one stays in the history). Call it from the pencil button. */
export function newChat(): string {
  const id = `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  try { localStorage.setItem(curKey(currentUserId()), id); } catch { /* */ }
  return id;
}
/** Continue an old conversation from the history list. */
export function openChat(id: string) { try { localStorage.setItem(curKey(currentUserId()), id); } catch { /* */ } }
export const exportChatText = (id: string): string =>
  (loadChat(id)?.turns || []).map(t => `${t.role === 'user' ? 'Me' : 'Stooorna Ai'}: ${t.text}`).join('\n\n');

function remember(user: string, bot: string, image = false) {
  const id = currentChatId();
  const all = readChats();
  let chat = all.find(c => c.id === id);
  if (!chat) { chat = { id, title: user.slice(0, 48) || 'Chat', updatedAt: Date.now(), turns: [] }; all.push(chat); }
  const now = Date.now();
  chat.turns.push({ role: 'user', text: user, at: now });
  chat.turns.push({ role: 'assistant', text: bot, at: now, image: image || undefined });
  chat.turns = chat.turns.slice(-200);
  chat.updatedAt = now;
  writeChats(all);
}

function recentHistory(): Array<{ role: string; content: string }> {
  const chat = loadChat(currentChatId());
  return (chat?.turns || []).slice(-HISTORY_TURNS).map(t => ({ role: t.role, content: t.text.slice(0, 1500) }));
}

/* ------------------------------------------------------------------ files */

let pendingFiles: Array<{ name: string; text: string }> = [];

/** Reads a picked file and queues it as context for the NEXT message. Returns a short status for the UI. */
export async function readFileForAi(file: File): Promise<{ ok: boolean; note: string }> {
  const name = file.name || 'file';
  const isText = /^text\//.test(file.type) || /\.(txt|md|csv|json|xml|html?|css|js|jsx|ts|tsx|py|java|kt|php|sql|ya?ml|log|ini|c|cpp|cs|go|rb|swift)$/i.test(name);
  if (!isText) {
    const ar = /^ar/i.test(String((window as any).__STOOORNA_AI_LANG__ || navigator.language || ''));
    if (/\.(pdf|docx)$/i.test(name) || file.type === 'application/pdf') { // read by the server (/ai/file-read)
      for (const b of fallbackBases()) {
        try {
          const fd = new FormData();
          fd.append('file', file, name);
          const ctrl = new AbortController();
          const timer = window.setTimeout(() => ctrl.abort(), 60000);
          const r = await fetch(`${b}/file-read`, { method: 'POST', body: fd, signal: ctrl.signal });
          window.clearTimeout(timer);
          if (!r.ok) continue;
          const d = await r.json();
          const text = String(d?.text || '').slice(0, MAX_FILE_CHARS);
          if (!text) continue;
          pendingFiles = [...pendingFiles.filter(f => f.name !== name), { name, text }].slice(-3);
          return { ok: true, note: name };
        } catch { /* next base */ }
      }
    }
    return { ok: false, note: ar ? 'ما قدرت أقرأ هذا الملف الحين' : 'Could not read this file right now' };
  }
  try {
    const text = (await file.text()).slice(0, MAX_FILE_CHARS);
    pendingFiles = [...pendingFiles.filter(f => f.name !== name), { name, text }].slice(-3);
    return { ok: true, note: name };
  } catch {
    return { ok: false, note: 'cannot read file' };
  }
}
export const clearPendingFiles = () => { pendingFiles = []; };

/* ------------------------------------------------------------------ voice */

export function voiceInputSupported(): boolean {
  const w: any = window;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/** Speech to text. Returns a stop() function. onText gets live + final text. */
export function startListening(lang: string, onText: (t: string, final: boolean) => void, onEnd?: () => void): () => void {
  const w: any = window;
  const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!SR) { onEnd?.(); return () => { /* */ }; }
  const rec = new SR();
  rec.lang = /^ar/i.test(lang) ? 'ar-KW' : lang || 'en-US';
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = (e: any) => {
    let txt = '';
    let fin = false;
    for (let i = e.resultIndex; i < e.results.length; i++) { txt += e.results[i][0].transcript; if (e.results[i].isFinal) fin = true; }
    onText(txt.trim(), fin);
  };
  rec.onend = () => onEnd?.();
  rec.onerror = () => onEnd?.();
  try { rec.start(); } catch { onEnd?.(); }
  return () => { try { rec.stop(); } catch { /* */ } };
}

export const voiceOutputSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

export function speak(text: string, lang?: string) {
  if (!voiceOutputSupported()) return;
  try {
    window.speechSynthesis.cancel();
    const clean = text.replace(/[*_`#>]/g, '').slice(0, 1800);
    const u = new SpeechSynthesisUtterance(clean);
    const ar = lang ? /^ar/i.test(lang) : isArabic(clean);
    u.lang = ar ? 'ar-SA' : 'en-US';
    const v = window.speechSynthesis.getVoices().find(x => x.lang.toLowerCase().startsWith(ar ? 'ar' : 'en'));
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  } catch { /* */ }
}
export const stopSpeaking = () => { try { window.speechSynthesis?.cancel(); } catch { /* */ } };

/* ------------------------------------------------------------------ web search */

const SEARCH_RE = /(ابحث|بحث عن|دور لي|دوّر|اخر اخبار|آخر أخبار|اخبار|أخبار|سعر|اسعار|أسعار|نتيجة مباراة|search|google|look up|latest|news|price of|current|today's)/i;
const IMAGE_GEN_RE = /(ارسم|ارسم لي|صمم لي صورة|صمم صورة|انشئ صورة|أنشئ صورة|سوي صورة|سوّي صورة|ولد صورة|ولّد صورة|توليد صورة|اصنع صورة|generate (an? )?(image|picture|logo)|create (an? )?(image|picture|logo)|draw (me )?|make (me )?(an? )?(image|picture|logo))/i;

async function webSearch(query: string, chatUrl: string): Promise<string> {
  const q = query.slice(0, 200);
  const server = await fetchJsonFirst(siblings(chatUrl, 'search'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q, lang: isArabic(q) ? 'ar' : 'en' }),
  }, 12000);
  if (server?.answer) { // Google-grounded answer from the server
    const src = (server.results || []).slice(0, 4).map((r: any) => `- ${r.title || ''} ${r.url || r.link || ''}`).join('\n');
    return `${String(server.answer).slice(0, 3000)}${src ? `\nSources:\n${src}` : ''}`;
  }
  const items: any[] = server?.results || server?.items || [];
  if (items.length) {
    return items.slice(0, 5).map((r, i) => `${i + 1}. ${r.title || ''} — ${String(r.snippet || r.content || r.description || '').slice(0, 300)} (${r.url || r.link || ''})`).join('\n');
  }
  // fallback with no key: Wikipedia
  const lang = isArabic(q) ? 'ar' : 'en';
  const w = await fetchJsonFirst([
    `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=4&format=json&origin=*`,
  ], { method: 'GET' }, 10000);
  const hits: any[] = w?.query?.search || [];
  return hits.map((h, i) => `${i + 1}. ${h.title} — ${String(h.snippet || '').replace(/<[^>]*>/g, '')} (https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(h.title).replace(/ /g, '_'))})`).join('\n');
}

/* ------------------------------------------------------------------ image creation */

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1] || '');
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
}

/** Creates an image from text. Returns base64 + mime, or null. Usable directly from a button too. */
export async function generateImage(prompt: string, chatUrl = ''): Promise<{ data: string; mime: string } | null> {
  const p = prompt.trim().slice(0, 600);
  if (!p) return null;
  const server = await fetchJsonFirst(chatUrl ? siblings(chatUrl, 'image-generate') : fallbackBases().map(b => `${b}/image-generate`), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: p }),
  }, 60000);
  if (server) {
    const raw: any = server.image_base64 ?? server.b64 ?? server.b64_json ?? server.image ?? server.images?.[0];
    const val: string = typeof raw === 'string' ? raw : raw?.b64_json || raw?.base64 || '';
    if (val && !/^https?:/.test(val)) return { data: val.replace(/^data:[^,]*,/, ''), mime: server.image_mime || 'image/png' };
    if (typeof server.url === 'string' && /^https?:/.test(server.url)) { // server gave a link: download it and hand back base64
      try {
        const ir = await fetch(server.url);
        if (ir.ok) {
          const ib = await ir.blob();
          if (ib.size > 2000 && /^image\//.test(ib.type)) return { data: await blobToBase64(ib), mime: ib.type };
        }
      } catch { /* next */ }
    }
  }
  try { // free fallback, no key
    const r = await fetch(`https://image.pollinations.ai/prompt/${encodeURIComponent(p)}?width=1024&height=1024&nologo=true`);
    if (r.ok) {
      const b = await r.blob();
      if (b.size > 2000 && /^image\//.test(b.type)) return { data: await blobToBase64(b), mime: b.type };
    }
  } catch { /* */ }
  return null;
}

/* ------------------------------------------------------------------ instant local answers + safe fetch (v1.1.0) */

const TIME_RE = /(كم الساع[هة]|ما هي الساع[هة]|ما الساع[هة]|الساع[هة] كم|الساع[هة] الان|الساع[هة] الآن|كم الوقت|ما الوقت|الوقت الان|الوقت الآن|what time is it|what('s| is) the time|current time)/i;
const DATE_RE = /(ما التاريخ|تاريخ اليوم|التاريخ الان|التاريخ الآن|اي يوم|أي يوم|شنو اليوم|what('s| is) (the )?date|today'?s date|what day is it)/i;

function localAnswer(text: string, ar: boolean): string {
  const t = text.trim();
  if (t.length > 60) return '';
  const now = new Date();
  const loc = ar ? 'ar-KW' : 'en-US';
  if (TIME_RE.test(t)) {
    const time = now.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
    return ar ? `الساعة الحين ${time} ⏰` : `It is ${time} now ⏰`;
  }
  if (DATE_RE.test(t)) {
    const d = now.toLocaleDateString(loc, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    return ar ? `اليوم ${d} 📅` : `Today is ${d} 📅`;
  }
  return '';
}

/** fetch with a timeout (so the sheet never spins forever). Respects the sheet's own stop button. */
async function fetchWithTimeout(nativeFetch: typeof fetch, input: RequestInfo | URL, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const outer = init.signal as AbortSignal | undefined;
  const onAbort = () => ctrl.abort();
  if (outer) { if (outer.aborted) ctrl.abort(); else outer.addEventListener('abort', onAbort); }
  const timer = window.setTimeout(() => ctrl.abort(), ms);
  try {
    return await nativeFetch(input, { ...init, signal: ctrl.signal });
  } finally {
    window.clearTimeout(timer);
    if (outer) outer.removeEventListener('abort', onAbort);
  }
}

/* ------------------------------------------------------------------ the /chat interceptor */

type BodyAccess = { text: string; set: (t: string) => void; obj: any };

/** Finds the user's text in a JSON body whatever the field is called. */
function bodyAccess(obj: any): BodyAccess | null {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of ['message', 'prompt', 'text', 'query', 'input']) {
    if (typeof obj[k] === 'string') return { text: obj[k], set: t => { obj[k] = t; }, obj };
  }
  if (Array.isArray(obj.messages)) {
    for (let i = obj.messages.length - 1; i >= 0; i--) {
      const m = obj.messages[i];
      if (m?.role === 'user' && typeof m.content === 'string') return { text: m.content, set: t => { m.content = t; }, obj };
    }
  }
  return null;
}

function replyOf(data: any): string {
  return String(data?.reply ?? data?.response ?? data?.answer ?? data?.message ?? data?.text ?? data?.content ?? '').trim();
}

async function handleChat(nativeFetch: typeof fetch, input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  let obj: any;
  try { obj = JSON.parse(String(init.body)); } catch { return nativeFetch(input, init); }
  const acc = bodyAccess(obj);
  if (!acc || !acc.text.trim()) return nativeFetch(input, init);

  const original = acc.text.trim();
  const chatUrl = urlOf(input);
  const ar = isArabic(original);

  // instant local answer (time / date): no server needed, never hangs
  const quick = pendingFiles.length === 0 ? localAnswer(original, ar) : '';
  if (quick) {
    remember(original, quick);
    return jsonRes({ reply: quick });
  }

  // image creation: answer here, the sheet gets { reply, image_base64, image_mime }
  if (IMAGE_GEN_RE.test(original) && pendingFiles.length === 0) {
    const img = await generateImage(original.replace(IMAGE_GEN_RE, '').trim() || original, chatUrl);
    if (img) {
      const reply = ar ? 'تفضل، هذي الصورة 🎨' : 'Here is your image 🎨';
      remember(original, reply, true);
      return jsonRes({ reply, image_base64: img.data, image_mime: img.mime });
    }
    // not available -> let the normal chat answer
  }

  // build the enriched message
  const parts: string[] = [];
  if (pendingFiles.length) {
    parts.push(pendingFiles.map(f => `[File: ${f.name}]\n${f.text}`).join('\n\n'));
  }
  if (SEARCH_RE.test(original)) {
    const found = await webSearch(original, chatUrl).catch(() => '');
    if (found) parts.push(`[Web search results — use them and mention the source link]\n${found}`);
  }
  parts.push(`[Device date & time now: ${new Date().toLocaleString(ar ? 'ar-KW' : 'en-US')} — use it only if the user asks about time/date]`);
  if (parts.length) acc.set(`${parts.join('\n\n')}\n\n${original}`);
  if (obj.history === undefined) obj.history = recentHistory();
  if (obj.lang === undefined) obj.lang = ar ? 'ar' : 'en';
  pendingFiles = [];

  const plainObj = JSON.parse(String(init.body));
  let res: Response | null = null;
  let why = ''; // DEBUG: the real reason shown in the chat when the server does not answer
  try {
    res = await fetchWithTimeout(nativeFetch, input, { ...init, body: JSON.stringify(obj) }, 30000);
    if (!res.ok) { why = `HTTP ${res.status} ${(await res.clone().text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160)}`; res = null; }
  } catch (e) { why = String((e as any)?.message || e); res = null; }

  // the enriched request failed / timed out -> retry once exactly as the sheet sent it
  if (!res) {
    try {
      res = await fetchWithTimeout(nativeFetch, input, { ...init, body: JSON.stringify(plainObj) }, 30000);
      if (!res.ok) { why = `HTTP ${res.status} ${(await res.clone().text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160)}`; res = null; }
    } catch (e) { why = String((e as any)?.message || e); res = null; }
  }

  // still nothing -> answer with a clear message instead of an endless spinner
  if (!res) {
    const msg = ar ? 'السيرفر ما رد الحين، جرب مرة ثانية بعد لحظات.' : 'The server did not answer. Please try again in a moment.';
    try { console.warn('[Stooorna Ai] /chat failed:', chatUrl, why); } catch { /* */ }
    return jsonRes({ reply: `${msg}${why ? ` [${why}]` : ''}` });
  }

  try {
    if ((res.headers.get('content-type') || '').includes('json')) {
      const reply = replyOf(await res.clone().json());
      if (reply) remember(original, reply);
    }
  } catch { /* streaming or non-JSON answer: pass through untouched */ }
  return res;
}

export function installStooornaAiCapabilities() {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  const w: any = window;
  if (w[FLAG]) return;
  w[FLAG] = STOOORNA_AI_CAPS_VERSION;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const isChat =
      /\/chat(\?|$)/.test(urlOf(input)) &&
      !/\/api\//.test(urlOf(input)) &&
      (init?.method || 'GET').toUpperCase() === 'POST' &&
      typeof init?.body === 'string';
    if (!isChat) return nativeFetch(input, init);
    return handleChat(nativeFetch, input, init as RequestInit).catch(() => nativeFetch(input, init));
  }) as typeof window.fetch;
}

installStooornaAiCapabilities();
