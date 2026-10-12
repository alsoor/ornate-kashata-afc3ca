/**
 * /api/voice-chat  (POST.ts)  — put it at: api/voice-chat/POST.ts   (English, United States only)
 *
 * Two modes (JSON body):
 *   { mode: 'chat', q, name, now, history }  -> { ok, answer, spoken, lang:'en', audio?, ttsError?, provider:'chat' }
 *   { mode: 'tts',  say }                    -> { ok, audio } | { ok:false, ttsError }
 *
 * Environment variables (Railway):
 *   ANTHROPIC_API_KEY   required for conversation (without it the app falls back to the old search flow)
 *   VOICE_CHAT_MODEL    optional, default 'claude-haiku-5-5' (fast + cheap, good for voice)
 *   VOICE_CHAT_WEB      optional, '1' lets her search the web for fresh facts (slower, costs more)
 *   AZURE_TTS_KEY       Azure Speech key (female American neural voice). Without it the app uses the phone's own voice
 *   AZURE_TTS_REGION    e.g. 'uaenorth' or 'westeurope'
 *   VOICE_EN_VOICE      optional, default 'en-US-JennyNeural' (American female)
 *
 * Works with Express (req, res) and with Fetch-style (Request) handlers.
 */

type Msg = { role: 'user' | 'assistant'; content: string };
type Out = { ok: boolean; answer?: string; spoken?: string; lang?: 'en'; audio?: string; ttsError?: string; provider?: string; error?: string; detail?: string };

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
function systemPrompt(name: string, now: string): string {
  const who = name ? ` The user's username is "${name}"; use it only now and then, naturally.` : '';
  const when = now ? ` The user's current local date and time: ${now}. Use it for any question about the time, date or day.` : '';
  return (
    'You are Stooorna, a friendly young American woman who is the voice assistant inside the Stooorna social app. ' +
    'Your answers are SPOKEN aloud, so: keep them short (1 to 3 sentences unless the user asks for detail), ' +
    'natural and warm, like chatting with a friend. No markdown, no lists, no emojis, no URLs. ' +
    'You can chat, joke, explain, give advice, help with ideas and answer questions. ' +
    'Always reply in natural American English, whatever the user writes. ' +
    'The user speaks to you through a phone speech recognizer, so a word may be slightly misheard; use common sense. ' +
    'If you do not know something or it needs live data you do not have, say so briefly instead of guessing. ' +
    'Never claim to be human. Refuse anything harmful politely.' + who + when
  );
}

// ───── 1) conversation via the Anthropic Messages API ─────
async function chat(q: string, name: string, now: string, history: Msg[]): Promise<{ reply: string } | { error: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { error: 'ANTHROPIC_API_KEY is not set on the server' };
  const msgs: Msg[] = [
    ...history.filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim()).slice(-12).map(m => ({ role: m.role, content: m.content.slice(0, 800) })),
    { role: 'user', content: q },
  ];
  // the API needs the first message to be from the user
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();

  const model = process.env.VOICE_CHAT_MODEL || 'claude-haiku-5-5';
  const body: any = { model, max_tokens: 400, system: systemPrompt(name, now), messages: msgs };
  const web = process.env.VOICE_CHAT_WEB === '1';
  if (web) body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }];

  let r: Response;
  try {
    r = await fetchTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }, web ? 20000 : 12000);
  } catch {
    return { error: 'The chat model timed out' };
  }
  if (!r.ok) return { error: `Anthropic API error ${r.status} (check ANTHROPIC_API_KEY and VOICE_CHAT_MODEL=${model})` };
  const d: any = await r.json();
  const reply = (Array.isArray(d?.content) ? d.content : [])
    .map((b: any) => (b?.type === 'text' ? String(b.text || '') : ''))
    .join('')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return reply ? { reply } : { error: 'The chat model returned an empty answer' };
}

// ───── 2) female American neural voice via Azure Speech (mp3 -> base64) ─────
const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

async function tts(text: string): Promise<{ audio?: string; error?: string }> {
  const key = process.env.AZURE_TTS_KEY;
  const region = process.env.AZURE_TTS_REGION;
  if (!key || !region) return { error: 'no_key' };
  const voice = process.env.VOICE_EN_VOICE || 'en-US-JennyNeural';
  const ssml = `<speak version='1.0' xml:lang='en-US'><voice xml:lang='en-US' xml:gender='Female' name='${voice}'>${xmlEsc(text.slice(0, 700))}</voice></speak>`;
  try {
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
    if (!r.ok) return { error: `http_${r.status}` };
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length ? { audio: buf.toString('base64') } : { error: 'empty' };
  } catch {
    return { error: 'timeout' };
  }
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
      const t = await tts(say);
      return t.audio ? json(200, { ok: true, audio: t.audio, lang: 'en' }) : json(200, { ok: false, error: 'tts_unavailable', ttsError: t.error });
    }

    // conversation
    const q = String(body?.q || '').trim().slice(0, 400);
    if (!q) return json(400, { ok: false, error: 'empty_question' });
    const name = String(body?.name || '').replace(/[^\p{L}\p{N}_.\- ]/gu, '').slice(0, 40);
    const now = String(body?.now || '').replace(/[^\w\s:+\-().,/]/g, '').slice(0, 80);
    const history: Msg[] = Array.isArray(body?.history) ? body.history : [];

    const out = await chat(q, name, now, history);
    if ('error' in out) return json(200, { ok: false, error: 'chat_unavailable', detail: out.error });

    const t = await tts(out.reply);
    return json(200, { ok: true, answer: out.reply, spoken: out.reply, lang: 'en', audio: t.audio, ttsError: t.audio ? undefined : t.error, provider: 'chat' });
  } catch {
    return json(500, { ok: false, error: 'server_error' });
  }
}

export const POST = handler;
