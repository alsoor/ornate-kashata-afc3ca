/**
 * SMART-SEARCH  (src/ai/smartSearch.ts)  — standalone, no dependency on the rest of the app
 *
 * Smart Pixabay search for Stooorna Ai (photos, illustrations, vectors, videos).
 * It understands normal Arabic / English sentences, for example:
 *   "ابي صور سيارات حمراء"            -> red cars, photos
 *   "عطني 5 خلفيات جوال طبيعة"        -> 5 vertical, high-resolution nature photos
 *   "فيديو بحر وغروب"                 -> sea + sunset videos
 *   "رسومات قطط بدون خلفية"           -> cat illustrations, transparent
 *   "latest 4k wallpapers of mountains"
 *
 * What it does for you:
 *   • decides if the message is a photo / video request at all (otherwise returns null and the chat goes on as before)
 *   • pulls out the subject, colour, orientation, quality, "latest", "best", how many, photo / illustration / vector / video
 *   • translates an Arabic subject to English (built-in dictionary first, then the free MyMemory service) because Pixabay has no Arabic
 *   • if nothing is found it retries with fewer filters, then with the main word only
 *   • answers in the user's language with a sentence saying what it understood
 *
 * Needs a free Pixabay key (https://pixabay.com/api/docs/). Put it in ONE of:
 *   - .env            VITE_PIXABAY_KEY=xxxxxxxx
 *   - or at runtime   window.__STOOORNA_PIXABAY_KEY__ = 'xxxxxxxx'
 * Without a key detectSmartSearch() returns null, so the old behaviour keeps working untouched.
 *
 * Public API:
 *   detectSmartSearch(text)            -> SmartIntent | null
 *   runSmartSearch(intent, signal?)    -> Promise<SmartResult>
 *   hasPixabayKey()                    -> boolean
 */

export interface SmartPhoto {
  id: string;
  thumb: string;
  full: string;
  credit: string;
  kind: 'image' | 'video';
  video?: string;
}

export interface SmartIntent {
  kind: 'image' | 'video';
  imageType: 'all' | 'photo' | 'illustration' | 'vector';
  subject: string;            // what the user asked for, in his own words (shown back to him)
  ar: boolean;                // the user wrote Arabic
  colors: string[];           // Pixabay colour names
  orientation: 'all' | 'horizontal' | 'vertical';
  hd: boolean;
  latest: boolean;
  best: boolean;
  count: number;
  raw: string;
}

export interface SmartResult {
  text: string;               // sentence to show above the results (user's language)
  photos: SmartPhoto[];       // same shape the chat gallery already uses
  query: string;              // the English query that was finally used
}

// ───────────────────────── key ─────────────────────────
function getKey(): string {
  try {
    const w: any = typeof window !== 'undefined' ? window : {};
    if (w.__STOOORNA_PIXABAY_KEY__) return String(w.__STOOORNA_PIXABAY_KEY__).trim();
    const k = (import.meta as any)?.env?.VITE_PIXABAY_KEY;
    if (k) return String(k).trim();
  } catch { /* ignore */ }
  return '';
}
export const hasPixabayKey = () => !!getKey();

// ───────────────────────── text helpers ─────────────────────────
const AR_RE = /[؀-ۿ]/;

function norm(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')   // tashkeel + tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[؟?!.,،؛:"“”«»()]/g, ' ')
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\s+/g, ' ')
    .trim();
}
const stripAl = (w: string) => (w.length > 3 && w.startsWith('ال') ? w.slice(2) : w);

const MEDIA_IMG = /^(صور|صوره|صورتين|خلفيه|خلفيات|بوستر|بوسترات|رسم|رسوم|رسومات|رسمه|فيكتور|فكتور|photo|photos|image|images|picture|pictures|pic|pics|wallpaper|wallpapers|background|backgrounds|illustration|illustrations|vector|vectors|clipart|pixabay)$/;
const MEDIA_VID = /^(فيديو|فيديوهات|فديو|فيديوات|مقطع|مقاطع|كليب|كليبات|video|videos|clip|clips|footage)$/;
const REQUEST_WORDS = new Set([
  'ابي', 'ابغي', 'ابغى', 'ابا', 'ابى', 'اريد', 'بغيت', 'بدي', 'عطني', 'اعطني', 'عطيني', 'جيب', 'جيبلي', 'هات', 'هاتلي', 'ورني', 'وريني', 'اظهر', 'اعرض', 'اعرضلي',
  'دور', 'دورلي', 'ابحث', 'بحث', 'دورلي', 'لاقي', 'لقيلي', 'اعطيني', 'حمل', 'نزل', 'نزللي',
  'show', 'give', 'find', 'search', 'get', 'need', 'want', 'looking', 'send', 'me', 'please', 'download',
]);
const STOP = new Set([
  'عن', 'ل', 'لي', 'لو', 'سمحت', 'تكفي', 'من', 'في', 'فيها', 'فيه', 'مع', 'و', 'يا', 'ممكن', 'بس', 'شوية', 'شوي', 'حلوه', 'حلوة', 'جميله', 'حلو', 'جميل', 'ذكي', 'ذكيه',
  'عن', 'على', 'علي', 'الى', 'الي', 'هذي', 'هذا', 'ذي', 'ذا', 'كذا', 'جديده', 'حق', 'خاصه', 'خاص', 'اي', 'اشي', 'شي', 'شيء', 'كل', 'عدد', 'منها', 'بعض',
  'of', 'for', 'the', 'a', 'an', 'some', 'with', 'about', 'on', 'in', 'to', 'and', 'any', 'best', 'nice', 'beautiful', 'good', 'high', 'quality', 'new', 'hd',
]);
const QUESTION_START = /^(كيف|كيفيه|ليش|لماذا|ليه|متي|وش|ايش|ماذا|ما هو|ما هي|من هو|هل|how|why|when|what|who|can you|could you explain)(\s|$)/;

const COLOR_MAP: Record<string, string> = {
  احمر: 'red', حمراء: 'red', حمرا: 'red', حمر: 'red', red: 'red',
  ازرق: 'blue', زرقاء: 'blue', زرقا: 'blue', blue: 'blue',
  اخضر: 'green', خضراء: 'green', خضرا: 'green', green: 'green',
  اصفر: 'yellow', صفراء: 'yellow', صفرا: 'yellow', yellow: 'yellow',
  اسود: 'black', سوداء: 'black', سودا: 'black', black: 'black',
  ابيض: 'white', بيضاء: 'white', بيضا: 'white', white: 'white',
  رمادي: 'gray', رمادية: 'gray', gray: 'gray', grey: 'gray',
  بني: 'brown', بنيه: 'brown', brown: 'brown',
  برتقالي: 'orange', برتقاليه: 'orange', orange: 'orange',
  وردي: 'pink', ورديه: 'pink', pink: 'pink',
  بنفسجي: 'lilac', بنفسجيه: 'lilac', ليلكي: 'lilac', purple: 'lilac', lilac: 'lilac',
  تركوازي: 'turquoise', turquoise: 'turquoise',
};

const COUNT_WORDS: Record<string, number> = {
  واحد: 1, وحده: 1, اثنين: 2, اثنتين: 2, ثنتين: 2, ثلاث: 3, ثلاثه: 3, اربع: 4, اربعه: 4, خمس: 5, خمسه: 5, ست: 6, سته: 6, سبع: 7, سبعه: 7,
  ثمان: 8, ثمانيه: 8, تسع: 9, تسعه: 9, عشر: 10, عشره: 10,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

// Arabic -> English words that Pixabay understands (the most common search subjects)
const DICT: Record<string, string> = {
  سياره: 'car', سيارات: 'cars', سيارة: 'car', دراجه: 'bicycle', دراجات: 'bicycles', موتر: 'motorcycle', طياره: 'airplane', طائره: 'airplane', طيارات: 'airplanes', قطار: 'train', سفينه: 'ship', سفن: 'ships', قارب: 'boat',
  طبيعه: 'nature', جبل: 'mountain', جبال: 'mountains', بحر: 'sea', محيط: 'ocean', شاطئ: 'beach', شاطي: 'beach', نهر: 'river', شلال: 'waterfall', شلالات: 'waterfalls', بحيره: 'lake', صحراء: 'desert', صحرا: 'desert', كثبان: 'dunes',
  غابه: 'forest', غابات: 'forest', شجره: 'tree', اشجار: 'trees', زهره: 'flower', زهور: 'flowers', ورد: 'roses', وردة: 'rose', عشب: 'grass', حديقه: 'garden', جزيره: 'island',
  سماء: 'sky', سما: 'sky', غيوم: 'clouds', سحاب: 'clouds', مطر: 'rain', ثلج: 'snow', شمس: 'sun', قمر: 'moon', نجوم: 'stars', نجمه: 'star', مجره: 'galaxy', فضاء: 'space', كوكب: 'planet', كواكب: 'planets', غروب: 'sunset', شروق: 'sunrise', فجر: 'dawn', ليل: 'night', برق: 'lightning', عاصفه: 'storm', ضباب: 'fog', نار: 'fire', ماء: 'water', خريف: 'autumn', شتاء: 'winter', صيف: 'summer', ربيع: 'spring',
  قطه: 'cat', قطط: 'cats', قط: 'cat', كلب: 'dog', كلاب: 'dogs', حصان: 'horse', خيل: 'horses', خيول: 'horses', اسد: 'lion', نمر: 'tiger', فهد: 'cheetah', ذئب: 'wolf', دب: 'bear', فيل: 'elephant', زرافه: 'giraffe', قرد: 'monkey', جمل: 'camel', ابل: 'camels', غزال: 'deer', ارنب: 'rabbit', ثعلب: 'fox',
  طير: 'bird', طيور: 'birds', صقر: 'falcon', نسر: 'eagle', بومه: 'owl', ببغاء: 'parrot', حمام: 'pigeon', سمكه: 'fish', سمك: 'fish', حوت: 'whale', دلفين: 'dolphin', قرش: 'shark', فراشه: 'butterfly', فراشات: 'butterflies', نحله: 'bee', حشره: 'insect', ثعبان: 'snake', تمساح: 'crocodile',
  مدينه: 'city', مدن: 'cities', قريه: 'village', شارع: 'street', جسر: 'bridge', برج: 'tower', مبنى: 'building', مباني: 'buildings', ناطحات: 'skyscrapers', بيت: 'house', منزل: 'house', قصر: 'palace', قلعه: 'castle', مسجد: 'mosque', كنيسه: 'church', مكه: 'mecca', كعبه: 'kaaba', قدس: 'jerusalem', دبي: 'dubai', لندن: 'london', باريس: 'paris', اسطنبول: 'istanbul', نيويورك: 'new york', طوكيو: 'tokyo', مصر: 'egypt', اهرامات: 'pyramids', سعوديه: 'saudi arabia', الرياض: 'riyadh', جده: 'jeddah',
  طعام: 'food', اكل: 'food', اكله: 'food', قهوه: 'coffee', شاي: 'tea', عصير: 'juice', فاكهه: 'fruit', فواكه: 'fruits', خضار: 'vegetables', تفاح: 'apple', موز: 'banana', برتقال: 'orange fruit', عنب: 'grapes', بطيخ: 'watermelon', تمر: 'dates fruit', فراوله: 'strawberry', ليمون: 'lemon', بيتزا: 'pizza', برجر: 'burger', همبرغر: 'burger', كيك: 'cake', حلويات: 'desserts', شوكولاته: 'chocolate', ايس: 'ice cream', ايسكريم: 'ice cream', مشويات: 'grill', لحم: 'meat', دجاج: 'chicken', رز: 'rice', خبز: 'bread', عسل: 'honey',
  رجل: 'man', امراه: 'woman', طفل: 'child', اطفال: 'children', بنت: 'girl', ولد: 'boy', عائله: 'family', صديق: 'friends', اصدقاء: 'friends', حب: 'love', قلب: 'heart', زواج: 'wedding', عرس: 'wedding', سعاده: 'happiness', حزن: 'sadness', ابتسامه: 'smile',
  رياضه: 'sports', كره: 'football', قدم: 'soccer', كرة: 'ball', سلة: 'basketball', تنس: 'tennis', سباحه: 'swimming', جري: 'running', جيم: 'gym', لياقه: 'fitness', يوغا: 'yoga', ملاكمه: 'boxing',
  تقنيه: 'technology', تكنولوجيا: 'technology', كمبيوتر: 'computer', لابتوب: 'laptop', جوال: 'smartphone', هاتف: 'phone', موبايل: 'mobile phone', برمجه: 'programming', روبوت: 'robot', ذكاء: 'artificial intelligence', انترنت: 'internet', شبكه: 'network',
  سفر: 'travel', سياحه: 'tourism', مطار: 'airport', فندق: 'hotel', خريطه: 'map', حقيبه: 'suitcase', مغامره: 'adventure', تخييم: 'camping', خيمه: 'tent',
  موسيقى: 'music', جيتار: 'guitar', بيانو: 'piano', طبل: 'drums', مسرح: 'stage', حفله: 'concert', رقص: 'dance', كتاب: 'book', كتب: 'books', مكتبه: 'library', قلم: 'pen', مدرسه: 'school', جامعه: 'university', تعليم: 'education', علم: 'science', طب: 'medicine', مستشفى: 'hospital', دكتور: 'doctor', صحه: 'health',
  عمل: 'business', شغل: 'work', مكتب: 'office', اجتماع: 'meeting', فلوس: 'money', مال: 'money', ذهب: 'gold', ماس: 'diamond', ساعه: 'watch', وقت: 'time', تاريخ: 'history', قديم: 'vintage', تراث: 'heritage', فن: 'art', لوحه: 'painting', تصميم: 'design', ازياء: 'fashion', موضه: 'fashion', ملابس: 'clothes', حذاء: 'shoes', نظارات: 'glasses', عطر: 'perfume', مكياج: 'makeup',
  رمضان: 'ramadan', عيد: 'eid', حج: 'hajj', قران: 'quran', هلال: 'crescent', فانوس: 'lantern', سلام: 'peace', حريه: 'freedom', ابداع: 'creativity', خلفيه: 'background', مجرد: 'abstract', نيون: 'neon', سيبر: 'cyberpunk', كرتون: 'cartoon', انمي: 'anime', تنين: 'dragon', ملاك: 'angel', ساحر: 'wizard', خيال: 'fantasy', رعب: 'horror', حرب: 'war', جندي: 'soldier', جيش: 'army', دبابه: 'tank', عسكري: 'military',
  فارغ: 'empty', بسيط: 'minimal', داكن: 'dark', فاتح: 'light', ملون: 'colorful', ذهبي: 'golden', فضي: 'silver', كبير: 'big', صغير: 'small', جديد: 'new',
};
const NDICT: Record<string, string> = {};
for (const k of Object.keys(DICT)) NDICT[norm(k)] = DICT[k];
const dictGet = (w: string): string | undefined => NDICT[w] ?? NDICT[stripAl(w)];

// ───────────────────────── intent ─────────────────────────
export function detectSmartSearch(text: string): SmartIntent | null {
  if (!getKey()) return null; // no key: leave the old behaviour alone
  const raw = (text || '').trim();
  if (!raw || raw.length > 160) return null;
  const n = norm(raw);
  if (QUESTION_START.test(n)) return null;

  const words = n.split(' ').filter(Boolean);
  let hasImg = false, hasVid = false, hasReq = false;
  let imageType: SmartIntent['imageType'] = 'all';
  let transparent = false;

  for (const w0 of words) {
    const w = stripAl(w0);
    if (MEDIA_VID.test(w)) hasVid = true;
    if (MEDIA_IMG.test(w)) {
      hasImg = true;
      if (/^(رسم|رسوم|رسومات|رسمه|illustration|illustrations|clipart)$/.test(w)) imageType = 'illustration';
      if (/^(فيكتور|فكتور|vector|vectors)$/.test(w)) imageType = 'vector';
      if (/^(صور|صوره|صورتين|photo|photos|picture|pictures|pic|pics)$/.test(w) && imageType === 'all') imageType = 'photo';
    }
    if (REQUEST_WORDS.has(w0) || REQUEST_WORDS.has(w)) hasReq = true;
  }
  if (!hasImg && !hasVid) return null;
  // "how do I film a video" etc.: a media word alone inside a long sentence is not a request
  if (!hasReq && words.length > 7 && !/pixabay/.test(n)) return null;

  let orientation: SmartIntent['orientation'] = 'all';
  let hd = false, latest = false, best = false;
  if (/(جوال|موبايل|هاتف|عمودي|طولي|ستوري|portrait|vertical|phone|mobile|story)/.test(n)) { orientation = 'vertical'; if (/(خلفيه|خلفيات|wallpaper|background)/.test(n)) hd = true; }
  if (/(افقي|عرضي|كمبيوتر|لابتوب|landscape|horizontal|desktop|widescreen)/.test(n)) orientation = 'horizontal';
  if (/(عاليه الجوده|دقه عاليه|اتش دي|4k|8k|hd|uhd|high quality|high resolution|hi res)/.test(n)) hd = true;
  if (/(احدث|جديده|جديد|اخر|latest|newest|recent|new)/.test(n)) latest = true;
  if (/(افضل|مميز|احلي|اجمل|اروع|best|top|editors)/.test(n)) best = true;
  if (/(بدون خلفيه|شفاف|transparent|no background|png)/.test(n)) transparent = true;
  const bw = /(اسود و ?ابيض|اسود وابيض|black and white|b&w|grayscale)/.test(n);

  const colors = new Set<string>();
  if (transparent) colors.add('transparent');
  if (bw) colors.add('grayscale');

  let count = 8;
  const digit = n.match(/(?:^|\s)(\d{1,2})(?=\s|$)/);
  if (digit) count = Math.max(1, Math.min(12, parseInt(digit[1], 10)));

  // subject = what is left after removing every non-subject word
  const subjectWords: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w0 = words[i];
    const w = stripAl(w0);
    if (/^\d+k?$/.test(w0)) continue;
    if (MEDIA_IMG.test(w) || MEDIA_VID.test(w)) continue;
    if (REQUEST_WORDS.has(w0) || REQUEST_WORDS.has(w) || STOP.has(w0) || STOP.has(w)) continue;
    if (COLOR_MAP[w0] || COLOR_MAP[w]) { colors.add(COLOR_MAP[w0] || COLOR_MAP[w]); continue; }
    if (COUNT_WORDS[w0] || COUNT_WORDS[w]) {
      if (!digit) count = COUNT_WORDS[w0] || COUNT_WORDS[w];
      continue;
    }
    if (/^(جوال|موبايل|هاتف|عمودي|طولي|ستوري|افقي|عرضي|كمبيوتر|لابتوب|عاليه|الجوده|جوده|دقه|احدث|اخر|افضل|مميز|احلي|اجمل|اروع|شفاف|بدون|خلفيه|portrait|vertical|landscape|horizontal|phone|mobile|desktop|latest|newest|recent|best|top|4k|8k|uhd|transparent|black|grayscale|png)$/.test(w)) continue;
    subjectWords.push(w0);
  }
  const subject = subjectWords.join(' ').replace(/\b(و)\s/g, ' ').trim();

  return {
    kind: hasVid && !hasImg ? 'video' : 'image',
    imageType,
    subject,
    ar: AR_RE.test(raw),
    colors: Array.from(colors).slice(0, 3),
    orientation,
    hd,
    latest,
    best,
    count,
    raw,
  };
}

// ───────────────────────── translation (Arabic -> English) ─────────────────────────
const trCache = new Map<string, string>();

async function toEnglish(subject: string, signal?: AbortSignal): Promise<string> {
  const s = subject.trim();
  if (!s) return '';
  if (!AR_RE.test(s)) return s;
  const hit = trCache.get(s);
  if (hit !== undefined) return hit;

  const parts = s.split(' ').filter(Boolean);
  const known: string[] = [];
  let allKnown = true;
  for (const p of parts) {
    const e = dictGet(p) ?? dictGet(p.replace(/^و/, '')); // "وغروب" -> غروب
    if (e) known.push(e); else allKnown = false;
  }
  if (allKnown && known.length) { const out = known.join(' '); trCache.set(s, out); return out; }

  // unknown word(s): ask the free MyMemory translator (no key needed)
  try {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), 4500);
    signal?.addEventListener('abort', () => ctrl.abort(), { once: true });
    const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(s)}&langpair=ar|en`, { signal: ctrl.signal });
    window.clearTimeout(t);
    if (r.ok) {
      const j: any = await r.json();
      const out = String(j?.responseData?.translatedText || '').replace(/[^\w\s'-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
      if (out && !/mymemory|invalid|query length/.test(out) && !AR_RE.test(out)) { trCache.set(s, out); return out; }
    }
  } catch { /* fall back to the words we know */ }
  const out = known.join(' ');
  trCache.set(s, out);
  return out;
}

// ───────────────────────── Pixabay ─────────────────────────
const resCache = new Map<string, { t: number; hits: SmartPhoto[] }>();
const CACHE_MS = 5 * 60 * 1000;

async function pixabay(it: SmartIntent, q: string, o: { filters: boolean }, signal?: AbortSignal): Promise<SmartPhoto[]> {
  const p = new URLSearchParams();
  p.set('key', getKey());
  p.set('q', q.slice(0, 100));
  p.set('safesearch', 'true');
  p.set('per_page', String(Math.max(3, Math.min(20, it.count + 4))));
  p.set('order', it.latest ? 'latest' : 'popular');
  if (it.kind === 'image') {
    p.set('image_type', it.imageType);
    if (o.filters) {
      if (it.orientation !== 'all') p.set('orientation', it.orientation);
      if (it.colors.length) p.set('colors', it.colors.join(','));
      if (it.hd) { p.set('min_width', it.orientation === 'vertical' ? '1080' : '1920'); p.set('min_height', it.orientation === 'vertical' ? '1920' : '1080'); }
      if (it.best) p.set('editors_choice', 'true');
    }
  }
  const url = (it.kind === 'video' ? 'https://pixabay.com/api/videos/?' : 'https://pixabay.com/api/?') + p.toString();
  const ckey = url.replace(/key=[^&]+/, '');
  const c = resCache.get(ckey);
  if (c && Date.now() - c.t < CACHE_MS) return c.hits;

  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`Pixabay HTTP ${r.status}`);
  const j: any = await r.json();
  const raw: any[] = Array.isArray(j?.hits) ? j.hits : [];
  const hits: SmartPhoto[] = raw.map(h => {
    if (it.kind === 'video') {
      const v = h.videos || {};
      const pick = v.medium?.url ? v.medium : v.small?.url ? v.small : v.large?.url ? v.large : v.tiny;
      const thumb = pick?.thumbnail || v.medium?.thumbnail || v.small?.thumbnail || (h.picture_id ? `https://i.vimeocdn.com/video/${h.picture_id}_640x360.jpg` : '');
      return { id: `pv-${h.id}`, thumb, full: pick?.url || '', video: pick?.url || '', credit: `Pixabay · ${h.user || ''}`.trim(), kind: 'video' as const };
    }
    return { id: `pi-${h.id}`, thumb: h.webformatURL || h.previewURL, full: h.largeImageURL || h.webformatURL, credit: `Pixabay · ${h.user || ''}`.trim(), kind: 'image' as const };
  }).filter(h => h.thumb && h.full);
  resCache.set(ckey, { t: Date.now(), hits });
  return hits;
}

// ───────────────────────── run ─────────────────────────
function describe(it: SmartIntent, q: string, n: number, relaxed: boolean): string {
  const ar = it.ar;
  const label = it.subject || q || (ar ? 'متنوعة' : 'popular');
  const bits: string[] = [];
  if (it.kind === 'image') {
    if (it.orientation === 'vertical') bits.push(ar ? 'طولية' : 'vertical');
    if (it.orientation === 'horizontal') bits.push(ar ? 'عرضية' : 'horizontal');
    if (it.hd) bits.push(ar ? 'دقة عالية' : 'high-res');
    if (it.colors.length && !relaxed) bits.push(it.colors.join(' + '));
  }
  if (it.latest) bits.push(ar ? 'الأحدث' : 'latest');
  if (it.best && it.kind === 'image' && !relaxed) bits.push(ar ? 'المميزة' : "editor's choice");
  const extra = bits.length ? ` (${bits.join('، ')})` : '';
  const what = it.kind === 'video'
    ? (ar ? 'فيديوهات' : 'videos')
    : it.imageType === 'illustration' ? (ar ? 'رسومات' : 'illustrations')
    : it.imageType === 'vector' ? (ar ? 'رسومات فيكتور' : 'vectors')
    : (ar ? 'صور' : 'photos');
  const note = relaxed ? (ar ? ' — خففت الفلاتر عشان تطلع لك نتائج' : ' — I relaxed some filters to find results') : '';
  return ar
    ? `هذي ${n} ${what} «${label}»${extra} من Pixabay${note}:`
    : `Here are ${n} ${what} of "${label}"${extra} from Pixabay${note}:`;
}

export async function runSmartSearch(it: SmartIntent, signal?: AbortSignal): Promise<SmartResult> {
  const en = await toEnglish(it.subject, signal);
  const attempts: { q: string; filters: boolean }[] = [{ q: en, filters: true }];
  if (it.colors.length || it.orientation !== 'all' || it.hd || it.best) attempts.push({ q: en, filters: false });
  const last = en.split(' ').filter(Boolean).slice(-1)[0];
  if (last && last !== en) attempts.push({ q: last, filters: false });

  let lastErr: unknown = null;
  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i];
    try {
      const hits = await pixabay(it, a.q, { filters: a.filters }, signal);
      if (hits.length) {
        const list = hits.slice(0, it.count);
        return { text: describe(it, a.q, list.length, i > 0), photos: list, query: a.q };
      }
    } catch (e) {
      if ((e as any)?.name === 'AbortError') throw e;
      lastErr = e;
    }
  }
  if (lastErr && attempts.length === 1) throw lastErr;
  return {
    text: it.ar
      ? `ما لقيت نتائج لـ «${it.subject || it.raw}». جرّب كلمات ثانية، مثلاً اسم الشي بشكل أبسط.`
      : `No results for "${it.subject || it.raw}". Try simpler or different words.`,
    photos: [],
    query: en,
  };
}
