/**
 * Stooorna Ai — Wallpaper / photo search (own tool, no AI provider)
 * Place at: src/ai/wallpaperSearch.ts
 *
 * "ابي خلفيات سيارات"  →  detectWallpaperIntent()  →  searchWallpapers()  →  photos in the Ai chat.
 *
 * Understanding the request is plain keyword matching (no AI). Photos come from free photo libraries:
 *   1. Pexels   (free key)  VITE_PEXELS_API_KEY   or  window.__STOOORNA_PEXELS_KEY__
 *   2. Pixabay  (free key)  VITE_PIXABAY_API_KEY  or  window.__STOOORNA_PIXABAY_KEY__
 *   3. Wikimedia Commons    (no key needed - used when no key is set or the others return nothing)
 * Keys are free and rate-limited; they end up inside the app bundle, so never reuse a paid/private key here.
 */

export interface WallpaperHit {
  id: string;
  thumb: string;
  full: string;
  credit: string;
  source: 'pexels' | 'pixabay' | 'wikimedia';
  page?: string;
}

export interface WallpaperIntent {
  /** English words sent to the photo libraries */
  query: string;
  /** What to show the user (their own words) */
  display: string;
  orientation: 'portrait' | 'landscape' | 'any';
  count: number;
}

/* ───────────────────────── intent detection ───────────────────────── */

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const NOUN_RE = /(خلفي(?:ه|ات)|ولبيبر|وولبيبر|wallpapers?|صور(?:ه)?|pictures?|photos?|images?|pics?)/i;
const WALLPAPER_RE = /(خلفي(?:ه|ات)|ولبيبر|وولبيبر|wallpapers?)/i;
const VERB_RE =
  /(^|\s)(ابي|ابغي|ابغا|ابغى|اريد|ودي|هات|هاتلي|جيب|جيبلي|ورني|وريني|عطني|اعطني|دور|دورلي|ابحث|show|find|get|search|want|need)(\s|$)/i;
const HOW_RE = /^(كيف|لماذا|ليش|how|why)\s/i;
const LANDSCAPE_RE = /(كمبيوتر|لابتوب|لاب توب|\bpc\b|desktop|laptop|شاشه|عريض|عريضه|افقي|landscape)/i;

const STOP = new Set(
  norm(
    'ابي ابغي ابغا ابغى اريد ودي هات هاتلي جيب جيبلي ورني وريني عطني اعطني دور دورلي ابحث عن لي من في ل لل و ' +
      'خلفيه خلفيات ولبيبر وولبيبر صوره صور ممكن لو سمحت بليز شوي كم كثير حلوه حلو جميله جميل رجاء ' +
      'كمبيوتر لابتوب لاب توب شاشه عريض عريضه افقي ' +
      'show find get search want need me some of for a the please plz pictures picture photos photo images image pics pic wallpapers wallpaper pc desktop laptop landscape i to my',
  ).split(' '),
);

const AR_EN: Record<string, string> = {
  سيارات: 'cars', سياره: 'car', رياضيه: 'sport', فخمه: 'luxury', فخم: 'luxury', جميله: 'beautiful', ملونه: 'colorful',
  هادئه: 'calm', مظلمه: 'dark', بسيطه: 'minimal', تجريديه: 'abstract', فن: 'art', انمي: 'anime', العاب: 'gaming',
  تقنيه: 'technology', تكنولوجيا: 'technology', طبيعه: 'nature', بحر: 'sea', شاطي: 'beach', جبال: 'mountains',
  جبل: 'mountain', غابه: 'forest', غابات: 'forest', صحراء: 'desert', سماء: 'sky', غروب: 'sunset', شروق: 'sunrise',
  ليل: 'night', نجوم: 'stars', قمر: 'moon', فضاء: 'space', مجره: 'galaxy', مدينه: 'city', مباني: 'buildings',
  برج: 'tower', جسر: 'bridge', شلال: 'waterfall', نهر: 'river', بحيره: 'lake', ثلج: 'snow', مطر: 'rain',
  غيوم: 'clouds', ورد: 'flowers', زهور: 'flowers', ورود: 'roses', شجر: 'trees', شجره: 'tree', حديقه: 'garden',
  قطط: 'cats', قطه: 'cat', كلاب: 'dogs', كلب: 'dog', اسد: 'lion', نمر: 'tiger', خيل: 'horses', حصان: 'horse',
  طيور: 'birds', طير: 'bird', صقر: 'falcon', جمل: 'camel', ابل: 'camels', سمك: 'fish', فراشه: 'butterfly',
  طعام: 'food', اكل: 'food', قهوه: 'coffee', كره: 'football', رياضه: 'sport', سفر: 'travel', طائره: 'airplane',
  قطار: 'train', دراجه: 'bicycle', موتر: 'motorcycle', دراجات: 'motorcycles', ساعه: 'watch', مسجد: 'mosque',
  جامع: 'mosque', كعبه: 'kaaba', مكه: 'mecca', الكويت: 'kuwait', كويت: 'kuwait', دبي: 'dubai', السعوديه: 'saudi arabia',
  باريس: 'paris', لندن: 'london', اسود: 'black', ابيض: 'white', احمر: 'red', ازرق: 'blue', اخضر: 'green',
  اصفر: 'yellow', وردي: 'pink', بنفسجي: 'purple', ذهبي: 'gold', برتقالي: 'orange', رمادي: 'gray',
  ضباب: 'fog', نار: 'fire', ماء: 'water', سحاب: 'clouds', عشب: 'grass', جزيره: 'island', كهف: 'cave',
  قلعه: 'castle', بيت: 'house', غرفه: 'room', موسيقى: 'music', سياره_رياضيه: 'sports car', حيوانات: 'animals',
  اطفال: 'kids', طفل: 'kid', حب: 'love', قلب: 'heart', نيون: 'neon', ظلام: 'darkness', خريف: 'autumn',
  مرسيدس: 'mercedes', تويوتا: 'toyota', لكزس: 'lexus', فيراري: 'ferrari', لامبورجيني: 'lamborghini', بورش: 'porsche', نيسان: 'nissan', هوندا: 'honda', فورد: 'ford', شيفروليه: 'chevrolet', جيب: 'jeep', كاديلاك: 'cadillac', بنتلي: 'bentley', ايفون: 'iphone', بي_ام_دبليو: 'bmw', شتاء: 'winter', صيف: 'summer', ربيع: 'spring', رمال: 'sand', امواج: 'waves', سفينه: 'ship', يخت: 'yacht',
};
const DICT = new Map(Object.entries(AR_EN).map(([k, v]) => [norm(k.replace(/_/g, ' ')), v]));

function translateToken(t: string): string {
  if (DICT.has(t)) return DICT.get(t)!;
  if (t.startsWith('ال') && DICT.has(t.slice(2))) return DICT.get(t.slice(2))!;
  return t;
}

/** Returns null when the message is not a "get me wallpapers/photos of X" request. */
export function detectWallpaperIntent(text: string): WallpaperIntent | null {
  const raw = (text || '').trim();
  if (!raw || raw.length > 90) return null;
  const n = norm(raw);
  if (HOW_RE.test(n + ' ')) return null;
  if (NOUN_RE.test(n)) {
    const startsWithNoun = new RegExp('^' + NOUN_RE.source, 'i').test(n);
    if (!VERB_RE.test(n) && !startsWithNoun) return null;
  } else if (!SEARCH_VERB_RE.test(n) || QUESTION_RE.test(n) || n.split(' ').length > 6) {
    return null;
  }

  const tokens = n.split(' ').filter(Boolean);
  const kept = tokens.filter(t => !STOP.has(t) && !(t.startsWith('ال') && STOP.has(t.slice(2))));
  if (!kept.length) return null; // no topic → don't search blindly

  const query = kept.map(translateToken).join(' ').trim();
  const wallpaper = WALLPAPER_RE.test(n);
  const orientation: WallpaperIntent['orientation'] = LANDSCAPE_RE.test(n) ? 'landscape' : wallpaper ? 'portrait' : 'any';
  return { query, display: kept.join(' '), orientation, count: 8 };
}

/* ───────────────────────── providers ───────────────────────── */

/** Built-in free Pixabay key (can still be overridden by window.__STOOORNA_PIXABAY_KEY__ or VITE_PIXABAY_API_KEY). */
const DEFAULT_PIXABAY_KEY = '57979311-8a039f9922dc91162d27bc5b9';

function envKey(winName: string, viteName: string): string {
  try {
    const w: any = window;
    const v = String(w[winName] || (import.meta as any)?.env?.[viteName] || '').trim();
    if (v) return v;
  } catch { /* */ }
  return viteName === 'VITE_PIXABAY_API_KEY' ? DEFAULT_PIXABAY_KEY : '';
}

async function getJson(url: string, headers?: Record<string, string>): Promise<any> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ctrl ? window.setTimeout(() => ctrl.abort(), 12000) : 0;
  try {
    const r = await fetch(url, { headers, signal: ctrl?.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    if (t) window.clearTimeout(t);
  }
}

async function fromPexels(i: WallpaperIntent, page: number): Promise<WallpaperHit[]> {
  const key = envKey('__STOOORNA_PEXELS_KEY__', 'VITE_PEXELS_API_KEY');
  if (!key) return [];
  const o = i.orientation === 'any' ? '' : `&orientation=${i.orientation}`;
  const d = await getJson(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(i.query)}&per_page=${i.count}&page=${page}${o}`,
    { Authorization: key },
  );
  return (d?.photos || []).map((p: any) => ({
    id: `px-${p.id}`,
    thumb: p.src?.medium || p.src?.large,
    full: p.src?.large2x || p.src?.large || p.src?.original,
    credit: p.photographer || 'Pexels',
    source: 'pexels' as const,
    page: p.url,
  }));
}

async function fromPixabay(i: WallpaperIntent, page: number): Promise<WallpaperHit[]> {
  const key = envKey('__STOOORNA_PIXABAY_KEY__', 'VITE_PIXABAY_API_KEY');
  if (!key) return [];
  const o = i.orientation === 'portrait' ? '&orientation=vertical' : i.orientation === 'landscape' ? '&orientation=horizontal' : '';
  const run = async (q: string, lang: string): Promise<WallpaperHit[]> => {
    const d = await getJson(
      `https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&image_type=photo&safesearch=true&per_page=${Math.max(3, i.count)}&page=${page}${o}${lang}`,
    );
    return (d?.hits || []).map((p: any) => ({
      id: `pb-${p.id}`,
      thumb: p.webformatURL,
      full: p.largeImageURL || p.webformatURL,
      credit: p.user || 'Pixabay',
      source: 'pixabay' as const,
      page: p.pageURL,
    }));
  };
  const hasAr = /[\u0600-\u06FF]/.test(i.query);
  let hits = await run(i.query, hasAr ? '&lang=ar' : '');
  // Words not in the dictionary stay Arabic: try the plain Arabic text, then English only.
  if (!hits.length && hasAr) hits = await run(i.display, '&lang=ar');
  if (!hits.length && hasAr) {
    const en = i.query.split(' ').filter(w => !/[\u0600-\u06FF]/.test(w)).join(' ').trim();
    if (en) hits = await run(en, '');
  }
  return hits;
}

async function fromWikimedia(i: WallpaperIntent): Promise<WallpaperHit[]> {
  const q = `${i.query} filetype:bitmap -nude -naked -sex`;
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6' +
    `&gsrlimit=30&gsrsearch=${encodeURIComponent(q)}&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=1200`;
  const d = await getJson(url);
  const pages: any[] = Object.values(d?.query?.pages || {});
  const out: WallpaperHit[] = [];
  for (const p of pages) {
    const info = p?.imageinfo?.[0];
    if (!info?.thumburl || !/^image\/(jpeg|png|webp)$/.test(info.mime || '')) continue;
    if ((info.width || 0) < 900 || (info.height || 0) < 600) continue;
    const portrait = info.height > info.width;
    if (i.orientation === 'portrait' && !portrait) continue;
    if (i.orientation === 'landscape' && portrait) continue;
    out.push({
      id: `wm-${p.pageid}`,
      thumb: info.thumburl,
      full: info.thumburl,
      credit: 'Wikimedia Commons',
      source: 'wikimedia',
      page: info.descriptionurl,
    });
    if (out.length >= i.count) break;
  }
  return out;
}

export async function searchWallpapers(
  intent: WallpaperIntent,
  page = 1,
): Promise<{ hits: WallpaperHit[]; provider: string }> {
  const steps: Array<[string, () => Promise<WallpaperHit[]>]> = [
    ['pexels', () => fromPexels(intent, page)],
    ['pixabay', () => fromPixabay(intent, page)],
    ['wikimedia', () => fromWikimedia(intent)],
  ];
  let lastErr: unknown;
  for (const [name, run] of steps) {
    try {
      const hits = (await run()).filter(h => h.thumb && h.full);
      if (hits.length) return { hits, provider: name };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error('no results');
}
