/**
 * /api/voice-assistant  (POST.ts)  — يوضع في مجلد: api/voice-assistant/POST.ts
 *
 * يستقبل { q, lang, images } ويرجّع:
 *   { ok, answer, spoken, images[], sources[{title,url}], provider }
 *
 * مصدر البحث:
 *   1) إذا موجود متغير البيئة SERPER_API_KEY  => نتائج قوقل الحقيقية (Answer box / Knowledge graph / نتائج / صور)
 *      (مفتاح من serper.dev — فيه رصيد مجاني للتجربة)
 *   2) غير كذا => ويكيبيديا (بدون مفتاح)
 *
 * يشتغل مع نمط (req, res) حق Express ومع نمط Request/Response (Fetch).
 */

type Source = { title: string; url: string };
type Result = {
  ok: boolean;
  answer?: string;
  spoken?: string;
  images?: string[];
  sources?: Source[];
  provider?: string;
  error?: string;
};

const hasArabic = (s: string) => /[\u0600-\u06FF]/.test(s);

// ───── حد بسيط للطلبات (في الذاكرة) حتى ما يُستنزف رصيد البحث ─────
const hits = new Map<string, number[]>();
function rateLimited(key: string, max = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > max;
}

function stripQuestionWords(q: string): string {
  return q
    .replace(/[؟?!]/g, ' ')
    .replace(/^(ما هو|ما هي|ما هى|من هو|من هي|من هى|ما|من|ماذا|متى|اين|أين|كم|كيف|لماذا|اعرض لي صور[ةه]?|اعرض لي|وريني|ورني|صور[ةه]?|what is|what are|who is|who was|who are|where is|when is|when was|tell me about|show me|picture of|image of)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstSentences(text: string, n = 2, max = 320): string {
  const parts = text.replace(/\s+/g, ' ').split(/(?<=[.!؟?۔])\s+/).slice(0, n).join(' ');
  return parts.slice(0, max);
}

async function getJson(url: string, init?: RequestInit, ms = 7000): Promise<any> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { ...init, signal: ac.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

// ───── 1) قوقل عبر Serper ─────
async function viaSerper(q: string, lang: string, wantImages: boolean, key: string): Promise<Result | null> {
  const headers = { 'X-API-KEY': key, 'Content-Type': 'application/json' };
  const body = JSON.stringify({ q, gl: process.env.VOICE_ASSISTANT_GL || 'kw', hl: lang === 'ar' ? 'ar' : 'en', num: 6 });

  const search = await getJson('https://google.serper.dev/search', { method: 'POST', headers, body });
  const ab = search?.answerBox;
  const kg = search?.knowledgeGraph;
  const organic: any[] = Array.isArray(search?.organic) ? search.organic : [];

  let answer = '';
  if (ab) answer = String(ab.answer || ab.snippet || ab.title || '').trim();
  if (!answer && kg?.description) answer = String(kg.description).trim();
  if (!answer && organic.length) {
    answer = organic.slice(0, 2).map(o => String(o.snippet || '').trim()).filter(Boolean).join('\n\n');
  }
  if (!answer) return null;

  const sources: Source[] = organic.slice(0, 3).map(o => ({ title: String(o.title || o.link), url: String(o.link) })).filter(s => /^https?:\/\//.test(s.url));

  let images: string[] = [];
  if (wantImages) {
    try {
      const im = await getJson('https://google.serper.dev/images', { method: 'POST', headers, body });
      const list: any[] = Array.isArray(im?.images) ? im.images : [];
      images = list.map(i => i.thumbnailUrl || i.imageUrl).filter((u: any) => typeof u === 'string' && /^https?:\/\//.test(u)).slice(0, 4);
    } catch { /* الصور اختيارية */ }
  }

  return { ok: true, answer, spoken: firstSentences(answer), images, sources, provider: 'serper' };
}

// ───── 2) ويكيبيديا (بدون مفتاح) ─────
async function viaWikipedia(q: string, lang: string, wantImages: boolean): Promise<Result | null> {
  const term = stripQuestionWords(q) || q;
  const wl = lang === 'ar' ? 'ar' : 'en';
  const url =
    `https://${wl}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(term)}` +
    `&gsrlimit=4&prop=extracts%7Cpageimages&exintro=1&explaintext=1&exsentences=4&piprop=thumbnail&pithumbsize=700&format=json&origin=*`;
  const d = await getJson(url, { headers: { 'User-Agent': 'StooornaVoiceAssistant/1.0' } });
  const pages = (Object.values(d?.query?.pages || {}) as any[]).sort((a, b) => (a.index || 99) - (b.index || 99));
  const top = pages.find(p => p?.extract && String(p.extract).trim().length > 20);
  if (!top) return null;
  const answer = String(top.extract).trim();
  const images = wantImages ? pages.map(p => p?.thumbnail?.source).filter((u: any) => typeof u === 'string').slice(0, 4) : [];
  return {
    ok: true,
    answer,
    spoken: firstSentences(answer),
    images,
    sources: [{ title: `${top.title} — Wikipedia`, url: `https://${wl}.wikipedia.org/wiki/${encodeURIComponent(String(top.title).replace(/ /g, '_'))}` }],
    provider: 'wikipedia',
  };
}

export async function answer(q: string, lang: string, wantImages: boolean): Promise<Result> {
  const key = process.env.SERPER_API_KEY;
  if (key) {
    try {
      const r = await viaSerper(q, lang, wantImages, key);
      if (r) return r;
    } catch { /* نكمل على ويكيبيديا */ }
  }
  try {
    const r = await viaWikipedia(q, lang, wantImages);
    if (r) return r;
  } catch { /* ignore */ }
  return { ok: false, error: 'no_answer' };
}

// ───── المعالج: يدعم Express (req,res) و Fetch (Request) ─────
export default async function handler(req: any, res?: any): Promise<any> {
  const isExpress = !!res && typeof res.status === 'function';
  const json = (status: number, data: Result) =>
    isExpress
      ? res.status(status).json(data)
      : new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

  try {
    const body = isExpress ? (req.body || {}) : await req.json().catch(() => ({}));
    const q = String(body?.q || '').trim().slice(0, 300);
    if (!q) return json(400, { ok: false, error: 'empty_question' });

    const ip = String((isExpress ? req.headers?.['x-forwarded-for'] : req.headers?.get?.('x-forwarded-for')) || (isExpress ? req.ip : '') || 'anon').split(',')[0].trim();
    if (rateLimited(ip)) return json(429, { ok: false, error: 'rate_limited' });

    const lang = body?.lang === 'en' ? 'en' : body?.lang === 'ar' || hasArabic(q) ? 'ar' : 'en';
    const out = await answer(q, lang, !!body?.images);
    return json(200, out); // 200 حتى لا تنلخبط مع "المسار غير موجود"؛ الواجهة تفحص out.ok
  } catch {
    return json(500, { ok: false, error: 'server_error' });
  }
}

export const POST = handler;
