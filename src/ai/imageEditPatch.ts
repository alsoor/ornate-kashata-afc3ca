/**
 * Stooorna Ai — Image Patch (v1.1.0)
 * Place at: src/ai/imageEditPatch.ts
 *
 * Fixes: "تعذر تعديل الصورة حالياً [HTTP 404 {"detail":"Not Found"}]"
 *
 * Cause: StooornaAiSheet posts photos to  <AI_API>/image-edit  but the AI
 * service on Railway does not have that route (it only answers /ai/chat).
 *
 * This patch needs NO edit inside StooornaAiSheet.tsx — nothing there is
 * removed or changed. It wraps window.fetch ONLY for requests that end in
 * "/image-edit" and adds:
 *   1. Fallback endpoints (custom env  ->  original  ->  same-origin /ai  ->  www.stooorna.com/ai)
 *      The first one that works is remembered, so later calls go straight to it.
 *   2. Automatic photo shrinking (max 1600px, JPEG) so big phone photos upload fast.
 *   3. `mode` field: "edit" (change the photo) or "understand" (describe / read / answer about it),
 *      detected from the user's text (Arabic + English).
 *   4. One retry on network errors / 5xx.
 *   5. Response normalising: accepts image_base64 / b64_json / image / images[] / image_url / url
 *      and always hands the sheet { reply, image_base64, image_mime }.
 *
 * Optional config (only if you host the route somewhere else):
 *   window.__STOOORNA_AI_IMAGE_API__ = 'https://your-server.com/ai'
 *   or  VITE_AI_IMAGE_API_URL=https://your-server.com/ai
 */

export const STOOORNA_AI_IMAGE_PATCH_VERSION = '1.1.0';

const PATCH_FLAG = '__stooornaAiImagePatch__';
const CACHE_KEY = 'stooorna_ai_image_base_v1';
const MAX_SIDE = 1600;
const COMPRESS_OVER = 1.2 * 1024 * 1024; // only shrink photos bigger than ~1.2MB
const FALLBACK_BASES = ['https://www.stooorna.com/ai'];

const EDIT_RE =
  /(لبس|البس|ألبس|غير|غيّر|عدل|عدّل|احذف|امسح|شيل|ازل|أزل|ضيف|أضف|اضف|حول|حوّل|اجعل|بدل|استبدل|لون|ارسم|كبر|صغر|حسن|نظار|edit|change|make|add|remove|delete|put|wear|replace|turn|convert|erase|background|filter|enhance|colorize|retouch|cartoon|anime)/i;
const ASK_RE =
  /(وش|ايش|إيش|شنو|ماذا|ما هذ|من هذ|صف|اشرح|وصف|ترجم|اقرأ|اقرا|هل |describe|what|who|read|translate|explain|tell me)/i;

function guessMode(prompt: string): 'edit' | 'understand' {
  const p = (prompt || '').trim();
  if (!p) return 'understand';
  if (EDIT_RE.test(p)) return 'edit';
  if (ASK_RE.test(p) || /[?؟]/.test(p)) return 'understand';
  return 'understand';
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (typeof URL !== 'undefined' && input instanceof URL) return input.href;
  return (input as Request).url || '';
}

/** Shrink big photos before upload (keeps small ones untouched). */
async function shrink(file: File): Promise<File> {
  try {
    if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
    if (file.size <= COMPRESS_OVER) return file;
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    (bmp as any).close?.();
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.86));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], (file.name || 'image').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

async function prepareForm(src: FormData): Promise<FormData> {
  const out = new FormData();
  const prompt = String(src.get('prompt') ?? '').trim();
  const items: Array<[string, FormDataEntryValue]> = [];
  src.forEach((v, k) => items.push([k, v]));
  for (const [k, v] of items) {
    if (typeof v !== 'string' && k === 'images') {
      const small = await shrink(v as File);
      out.append('images', small, small.name);
    } else if (typeof v === 'string') {
      out.append(k, v);
    } else {
      out.append(k, v as Blob);
    }
  }
  if (!out.has('mode')) out.append('mode', guessMode(prompt));
  if (!out.has('lang')) out.append('lang', /[\u0600-\u06FF]/.test(prompt) ? 'ar' : 'en');
  return out;
}

function readCache(): string {
  try { return localStorage.getItem(CACHE_KEY) || ''; } catch { return ''; }
}
function remember(url: string) {
  try { localStorage.setItem(CACHE_KEY, url); } catch { /* */ }
}

function candidates(origUrl: string): string[] {
  const list: string[] = [];
  const push = (base: string) => {
    const b = base.replace(/\/+$/, '');
    list.push(/\/image-edit$/.test(b) ? b : `${b}/image-edit`);
  };
  try {
    const w: any = window;
    const custom = w.__STOOORNA_AI_IMAGE_API__ || (import.meta as any)?.env?.VITE_AI_IMAGE_API_URL;
    if (custom) push(String(custom));
  } catch { /* */ }
  const cached = readCache();
  if (cached) list.unshift(cached);
  list.push(origUrl);
  try {
    const { protocol, hostname, origin } = window.location;
    if (/^https?:$/.test(protocol) && hostname !== 'localhost' && hostname !== '127.0.0.1') push(`${origin}/ai`);
  } catch { /* */ }
  FALLBACK_BASES.forEach(push);
  return Array.from(new Set(list.filter(Boolean)));
}

async function urlToBase64(url: string): Promise<{ data: string; mime: string } | null> {
  try {
    if (url.startsWith('data:')) {
      const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
      return m ? { data: m[3], mime: m[1] || 'image/png' } : null;
    }
    const blob = await (await fetch(url)).blob();
    const data: string = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).split(',')[1] || '');
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(blob);
    });
    return { data, mime: blob.type || 'image/png' };
  } catch {
    return null;
  }
}

/** Always give the sheet { reply, image_base64, image_mime }. */
async function normalize(res: Response): Promise<Response> {
  try {
    if (!(res.headers.get('content-type') || '').includes('json')) return res;
    const data: any = await res.clone().json();
    if (!data || typeof data !== 'object') return res;
    const out: any = { ...data };

    out.reply = String(out.reply ?? out.response ?? out.answer ?? out.message ?? out.text ?? out.content ?? '').trim();

    if (!out.image_base64) {
      const first = Array.isArray(out.images) ? out.images[0] : undefined;
      const raw: any = out.b64_json ?? out.image ?? first ?? out.image_url ?? out.url;
      const val: string =
        typeof raw === 'string' ? raw : raw?.b64_json || raw?.base64 || raw?.data || raw?.url || '';
      if (val) {
        if (/^(data:|https?:)/.test(val)) {
          const r = await urlToBase64(val);
          if (r) { out.image_base64 = r.data; out.image_mime = out.image_mime || r.mime; }
        } else {
          out.image_base64 = val;
        }
      }
    }
    if (out.image_base64 && !out.image_mime) out.image_mime = 'image/png';

    return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch {
    return res;
  }
}

async function handleImageRequest(
  nativeFetch: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<Response> {
  const form = await prepareForm(init.body as FormData);
  const urls = candidates(urlOf(input));
  let last: Response | null = null;
  let lastErr: unknown;

  for (const url of urls) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await nativeFetch(url, { ...init, method: 'POST', body: form });
        if (res.ok) {
          remember(url);
          return await normalize(res);
        }
        last = res;
        if (res.status === 404 || res.status === 405) break;      // route missing here → next endpoint
        if (res.status >= 500 && attempt === 0) { await sleep(900); continue; }
        break;
      } catch (e) {
        if (init.signal?.aborted) throw e;
        lastErr = e;
        if (attempt === 0) { await sleep(600); continue; }
        break;
      }
    }
  }
  if (last) return last;
  throw lastErr ?? new Error('image request failed');
}

export function installStooornaAiImagePatch() {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  const w: any = window;
  if (w[PATCH_FLAG]) return;
  w[PATCH_FLAG] = STOOORNA_AI_IMAGE_PATCH_VERSION;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const isTarget =
      /\/image-edit(\?|$)/.test(urlOf(input)) &&
      (init?.method || 'GET').toUpperCase() === 'POST' &&
      typeof FormData !== 'undefined' &&
      init?.body instanceof FormData;
    if (!isTarget) return nativeFetch(input, init);
    return handleImageRequest(nativeFetch, input, init as RequestInit);
  }) as typeof window.fetch;
}

installStooornaAiImagePatch();
