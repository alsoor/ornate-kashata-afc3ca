/**
 * mediaAiPatch.ts — Real automatic media pipeline for Stooorna
 *
 * When the user picks an image/video:
 *  1) Re-encode image to browser-safe JPEG (canvas)
 *  2) Try server upload (optional)
 *  3) REJECT legacy broken hosts (airo-assets / offline CDN paths)
 *  4) ALWAYS return a playable URL (data: for images, blob: for video fallback)
 *  5) URL does NOT have to be the site domain — data: works everywhere
 *
 * Install: copy to src/lib/mediaAiPatch.ts
 */

export type MediaAiKind = 'image' | 'video';

export type MediaAiItem = {
  url: string;
  type: MediaAiKind;
  preview: string;
  source: 'upload' | 'data' | 'blob';
};

/** Legacy Airo storage + other known-dead patterns after Railway migration */
export function mediaAiIsBrokenHostUrl(url: string | null | undefined): boolean {
  const s = String(url || '').trim();
  if (!s) return true;
  if (/airo-assets/i.test(s)) return true;
  if (/\/airo\//i.test(s)) return true;
  if (/stooorna\.com\/airo/i.test(s)) return true;
  if (/localhost:\d+\/airo/i.test(s)) return true;
  return false;
}

function absUrl(u: string): string {
  const s = String(u || '').trim();
  if (!s) return '';
  if (/^(https?:|blob:|data:)/i.test(s)) return s;
  try {
    if (typeof window !== 'undefined') {
      if (s.startsWith('/')) return new URL(s, window.location.origin).href;
      if (/^[a-z0-9_\-./]+\.(jpe?g|png|webp|gif|mp4|webm|mov|m4v)/i.test(s)) {
        return new URL('/' + s.replace(/^\/+/, ''), window.location.origin).href;
      }
    }
  } catch {
    /* ignore */
  }
  return s;
}

function isPlayableHref(u: string | null | undefined): u is string {
  if (!u || typeof u !== 'string') return false;
  const s = u.trim();
  if (!s || s === 'null' || s === 'undefined') return false;
  if (mediaAiIsBrokenHostUrl(s)) return false;
  return /^(https?:\/\/|\/|blob:|data:)/i.test(s) ||
    /^[a-z0-9_\-./]+\.(jpe?g|png|webp|gif|mp4|webm|mov|m4v)(\?|$)/i.test(s);
}

/** Probe that an image URL actually loads in the browser (timeout 4s). */
export function mediaAiProbeImageLoads(url: string, timeoutMs = 4000): Promise<boolean> {
  return new Promise(resolve => {
    if (/^data:image\//i.test(url)) {
      resolve(true);
      return;
    }
    if (/^blob:/i.test(url)) {
      resolve(true);
      return;
    }
    if (mediaAiIsBrokenHostUrl(url)) {
      resolve(false);
      return;
    }
    const img = new Image();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      resolve(ok);
    };
    const t = window.setTimeout(() => finish(false), timeoutMs);
    img.onload = () => {
      window.clearTimeout(t);
      finish(true);
    };
    img.onerror = () => {
      window.clearTimeout(t);
      finish(false);
    };
    try {
      img.referrerPolicy = 'no-referrer';
    } catch {
      /* */
    }
    img.src = url;
  });
}

/** Re-encode image via canvas → JPEG (always displayable). */
export async function mediaAiNormalizeImage(file: File, maxEdge = 1600, quality = 0.85): Promise<File> {
  const name = (file.name || '').toLowerCase();
  const mime = (file.type || '').toLowerCase();
  const needsConvert =
    mime.includes('heic') || mime.includes('heif') ||
    name.endsWith('.heic') || name.endsWith('.heif') ||
    (!mime.startsWith('image/') && !name.match(/\.(jpe?g|png|webp|gif)$/i));

  const smallOk =
    !needsConvert &&
    mime.startsWith('image/') &&
    file.size > 0 &&
    file.size < 900_000 &&
    !mime.includes('heic') &&
    !mime.includes('heif');

  if (smallOk) return file;

  const toJpeg = async (source: CanvasImageSource, w: number, h: number, baseName: string): Promise<File | null> => {
    if (!w || !h) return null;
    let tw = w;
    let th = h;
    if (Math.max(tw, th) > maxEdge) {
      const scale = maxEdge / Math.max(tw, th);
      tw = Math.max(1, Math.round(tw * scale));
      th = Math.max(1, Math.round(th * scale));
    }
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, tw, th);
    const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size <= 0) return null;
    const base = (baseName || 'photo').replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  };

  try {
    if (typeof createImageBitmap === 'function') {
      const bmp = await createImageBitmap(file);
      try {
        const out = await toJpeg(bmp, bmp.width, bmp.height, file.name || 'photo');
        if (out) return out;
      } finally {
        try {
          bmp.close?.();
        } catch {
          /* */
        }
      }
    }
  } catch {
    /* fall through */
  }

  try {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('img load'));
        el.src = url;
      });
      const out = await toJpeg(
        img,
        img.naturalWidth || img.width,
        img.naturalHeight || img.height,
        file.name || 'photo',
      );
      if (out) return out;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    /* keep original */
  }

  return file;
}

/** Durable data: URL for images (works without any site domain / CDN). */
export async function mediaAiToDataUrl(file: File): Promise<string | null> {
  try {
    const normalized = await mediaAiNormalizeImage(file);
    const buf = await normalized.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const mime = (normalized.type || 'image/jpeg').split(';')[0] || 'image/jpeg';
    return `data:${mime};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

type UploadFn = (file: File, kind: MediaAiKind) => Promise<string | null>;

/**
 * Force a working media URL — not tied to stooorna.com domain.
 * Server upload is used only if the returned URL is NOT airo-assets and actually loads.
 * Otherwise image → data: URL (always works in preview + post).
 */
export async function mediaAiForceWorkingMedia(
  file: File,
  kind: MediaAiKind,
  upload?: UploadFn,
  onStatus?: (msg: string) => void,
): Promise<MediaAiItem | null> {
  onStatus?.(kind === 'video' ? 'جاري معالجة الفيديو…' : 'جاري معالجة الصورة بالذكاء الاصطناعي…');

  let work = file;
  if (kind === 'image') {
    try {
      work = await mediaAiNormalizeImage(file);
    } catch {
      work = file;
    }
  }

  // 1) Always build a local durable/playable URL first (guarantees preview works)
  let localUrl: string | null = null;
  if (kind === 'image') {
    localUrl = await mediaAiToDataUrl(work);
  } else {
    localUrl = URL.createObjectURL(work);
  }
  if (!localUrl) return null;

  // 2) Try server upload — accept only if not legacy airo-assets AND image actually loads
  if (upload) {
    onStatus?.('جاري رفع الوسائط…');
    try {
      const uploaded = await upload(work, kind);
      if (uploaded && isPlayableHref(uploaded) && !mediaAiIsBrokenHostUrl(uploaded)) {
        const abs = absUrl(uploaded);
        if (kind === 'image') {
          const ok = await mediaAiProbeImageLoads(abs, 3500);
          if (ok) {
            return { url: abs, type: kind, preview: abs, source: 'upload' };
          }
        } else if (/^https?:\/\//i.test(abs)) {
          return { url: abs, type: kind, preview: abs, source: 'upload' };
        }
      }
    } catch {
      /* fall back to local */
    }
  }

  onStatus?.('تم تجهيز رابط وسائط يعمل');
  return {
    url: localUrl,
    type: kind,
    preview: localUrl,
    source: localUrl.startsWith('blob:') ? 'blob' : 'data',
  };
}

/** Process many gallery files → working media items + optional status callback. */
export async function mediaAiProcessGalleryFiles(
  files: File[],
  upload?: UploadFn,
  onStatus?: (msg: string) => void,
): Promise<MediaAiItem[]> {
  const out: MediaAiItem[] = [];
  let i = 0;
  for (const file of files) {
    i += 1;
    const t = (file.type || '').toLowerCase();
    if (t === 'application/pdf' || /\.pdf$/i.test(file.name || '')) continue;
    const isVid =
      t.startsWith('video/') ||
      /\.(mp4|webm|mov|m4v|mkv|3gp)$/i.test(file.name || '');
    const kind: MediaAiKind = isVid ? 'video' : 'image';
    onStatus?.(
      files.length > 1
        ? `جاري معالجة الوسائط (${i}/${files.length})…`
        : kind === 'video'
          ? 'جاري معالجة الفيديو بالذكاء الاصطناعي…'
          : 'جاري معالجة الصورة بالذكاء الاصطناعي…',
    );
    const item = await mediaAiForceWorkingMedia(file, kind, upload, onStatus);
    if (item) out.push(item);
  }
  return out;
}
