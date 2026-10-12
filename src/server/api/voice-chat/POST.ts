/**
 * /api/voice-chat  (POST.ts)  — put it at: api/voice-chat/POST.ts
 *
 * Two modes (JSON body):
 *   { mode: 'chat', q, lang, name, history }  -> { ok, answer, spoken, lang, audio?, provider: 'chat' }
 *   { mode: 'tts',  say, lang }               -> { ok, audio, lang }
 *
 * Environment variables (Railway):
 *   ANTHROPIC_API_KEY      required for conversation (without it the app falls back to the old search flow)
 *   VOICE_CHAT_MODEL       optional, default 'claude-haiku-5-5' (fast + cheap, good for voice)
 *   VOICE_CHAT_WEB         optional, '1' lets her search the web for fresh facts (slower, costs more)
 *   AZURE_TTS_KEY          Azure Speech key (female neural voices). Without it the app uses the phone's own voice
 *   AZURE_TTS_REGION       e.g. 'uaenorth' or 'westeurope'
 *   VOICE_AR_VOICE         optional, default 'ar-KW-NouraNeural' (Kuwaiti female). Fallback idea: 'ar-AE-FatimaNeural'
 *   VOICE_EN_VOICE         optional, default 'en-US-JennyNeural' (American female)
 *
 * Works with Express (req, res) and with Fetch-style (Request) handlers.
 */

type Msg = { role: 'user' | 'assistant'; content: string };
type Out = { ok: boolean; answer?: string; spoken?: string; lang?: 'ar' | 'en'; audio?: string; provider?: string; error?: string };

const hasArabic = (s: string) => /[\u0600-\u06FF]/.test(s);

// ───── simple per-IP rate limit (in memory) ─────
const hits = new Map<string, number[]>();
function rateLimited(key: string, max = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > max;
}

async function fetchTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...init, signal: ac.signal }); } finally { clearTimeout(t); }
}

// ───── persona ─────
function systemPrompt(lang: 'ar' | 'en', name: string): string {
  const who = name ? ` The user's username is "${name}"; use it only now and then, naturally.` : '';
  const common =
    'You are Stooorna, a friendly young woman who is the voice assistant inside the Stooorna social app. ' +
    'Your answers are SPOKEN aloud, so: keep them short (1 to 3 sentences unless the user asks for detail), ' +
    'natural and warm, like chatting with a friend. No markdown, no lists, no emojis, no URLs. ' +
    'You can chat, joke, explain, give advice, help with ideas, translate and answer questions. ' +
    'If you do not know something or it needs live data you do not have, say so briefly instead of guessing. ' +
    'Never claim to be human. Refuse anything harmful politely.' + who;
  return lang === 'ar'
    ? common + ' Reply in relaxed Gulf (Kuwaiti/Khaleeji) Arabic dialect written in Arabic script, as a girl would speak, friendly and simple. Do not switch to English unless the user does.'
    : common + ' Reply in natural American English, as a friendly young woman would speak.';
}

// ───── 1) conversation via the Anthropic Messages API ─────
async function chat(q: string, lang: 'ar' | 'en', name: string, history: Msg[]): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const msgs: Msg[] = [
    ...history.filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim()).slice(-12).map(m => ({ role: m.role, content: m.content.slice(0, 800) })),
    { role: 'user', content: q },
  ];
  // the API needs the first message to be from the user
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();

  const body: any = {
    model: process.env.VOICE_CHAT_MODEL || 'claude-haiku-5-5',
    max_tokens: 400,
    system: systemPrompt(lang, name),
    messages: msgs,
  };
  const web = process.env.VOICE_CHAT_WEB === '1';
  if (web) body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }];

  const r = await fetchTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }, web ? 20000 : 12000);
  if (!r.ok) return null;
  const d: any = await r.json();
  const text = (Array.isArray(d?.content) ? d.content : [])
    .map((b: any) => (b?.type === 'text' ? String(b.text || '') : ''))
    .join('')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

// ───── 2) female neural voice via Azure Speech (mp3 -> base64) ─────
const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

async function tts(text: string, lang: 'ar' | 'en'): Promise<string | null> {
  const key = process.env.AZURE_TTS_KEY;
  const region = process.env.AZURE_TTS_REGION;
  if (!key || !region) return null;
  const voice = lang === 'ar' ? (process.env.VOICE_AR_VOICE || 'ar-KW-NouraNeural') : (process.env.VOICE_EN_VOICE || 'en-US-JennyNeural');
  const loc = voice.split('-').slice(0, 2).join('-');
  const ssml = `<speak version='1.0' xml:lang='${loc}'><voice xml:lang='${loc}' xml:gender='Female' name='${voice}'>${xmlEsc(text.slice(0, 700))}</voice></speak>`;
  const r = await fetchTimeout(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'StooornaVoiceAssistant',
    },
    body: ssml,
  }, 9000);
  if (!r.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  return buf.length ? buf.toString('base64') : null;
}

// ───── handler (Express or Fetch) ─────
export default async function handler(req: any, res?: any): Promise<any> {
  const isExpress = !!res && typeof res.status === 'function';
  const json = (status: number, data: Out) =>
    isExpress
      ? res.status(status).json(data)
      : new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

  try {
    const body = isExpress ? (req.body || {}) : await req.json().catch(() => ({}));
    const ip = String((isExpress ? req.headers?.['x-forwarded-for'] : req.headers?.get?.('x-forwarded-for')) || (isExpress ? req.ip : '') || 'anon').split(',')[0].trim();
    if (rateLimited(ip)) return json(429, { ok: false, error: 'rate_limited' });

    // text -> voice only (greeting etc.)
    if (body?.mode === 'tts') {
      const say = String(body?.say || '').trim().slice(0, 200);
      if (!say) return json(400, { ok: false, error: 'empty_text' });
      const lang: 'ar' | 'en' = body?.lang === 'ar' || (body?.lang !== 'en' && hasArabic(say)) ? 'ar' : 'en';
      const audio = await tts(say, lang).catch(() => null);
      return audio ? json(200, { ok: true, audio, lang }) : json(200, { ok: false, error: 'tts_unavailable' });
    }

    // conversation
    const q = String(body?.q || '').trim().slice(0, 400);
    if (!q) return json(400, { ok: false, error: 'empty_question' });
    const lang: 'ar' | 'en' = body?.lang === 'en' ? 'en' : body?.lang === 'ar' || hasArabic(q) ? 'ar' : 'en';
    const name = String(body?.name || '').replace(/[^\p{L}\p{N}_.\- ]/gu, '').slice(0, 40);
    const history: Msg[] = Array.isArray(body?.history) ? body.history : [];

    const answer = await chat(q, lang, name, history).catch(() => null);
    if (!answer) return json(200, { ok: false, error: 'chat_unavailable' });

    const outLang: 'ar' | 'en' = hasArabic(answer) ? 'ar' : 'en';
    const audio = await tts(answer, outLang).catch(() => null);
    return json(200, { ok: true, answer, spoken: answer, lang: outLang, audio: audio || undefined, provider: 'chat' });
  } catch {
    return json(500, { ok: false, error: 'server_error' });
  }
}

export const POST = handler;
