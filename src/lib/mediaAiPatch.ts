/**
 * mediaAiPatch.ts — AI-style media force pipeline for Stooorna composer
 *
 * Goal: when the user picks an image/video from the device gallery, automatically
 * re-encode / normalize it so it ALWAYS yields a playable URL suitable for:
 *   1) the Link rectangle in the New Post composer
 *   2) live media preview under that rectangle
 *   3) publish as real image/video media on the post
 *
 * Copy this file to:  src/lib/mediaAiPatch.ts
 * Then import from '@/lib/mediaAiPatch' if you prefer modular usage.
 *
 * This module does NOT talk to MySQL. Server DATABASE_URL stays on Railway env only.
 */

export type MediaAiKind = 'image' | 'video';

export type MediaAiItem = {
  url: string;
  type: MediaAiKind;
  preview: string;
  source: 'upload' | 'data' | 'blob';
};

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
  return /^(https?:\/\/|\/|blob:|data:)/i.test(s) ||
    /^[a-z0-9_\-./]+\.(jpe?g|png|webp|gif|mp4|webm|mov|m4v)(\?|$)/i.test(s);
}

/** Re-encode image via canvas → JPEG (browser-safe, smaller, always displayable). */
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
      const out = await toJpeg(img, img.naturalWidth || img.width, img.naturalHeight || img.height, file.name || 'photo');
      if (out) return out;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    /* keep original */
  }

  return file;
}

/** File → durable data: URL (images) or blob: URL (video preview). */
export async function mediaAiToDataOrBlobUrl(file: File, kind: MediaAiKind): Promise<string | null> {
  try {
    if (kind === 'video') {
      return URL.createObjectURL(file);
    }
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
 * Force a working media URL for one gallery file.
 * 1) AI normalize (re-encode image)
 * 2) try server upload if provided
 * 3) always fall back to data:/blob: so the link rectangle NEVER stays empty
 */
export async function mediaAiForceWorkingMedia(
  file: File,
  kind: MediaAiKind,
  upload?: UploadFn,
): Promise<MediaAiItem | null> {
  let work = file;
  if (kind === 'image') {
    try {
      work = await mediaAiNormalizeImage(file);
    } catch {
      work = file;
    }
  }

  let url: string | null = null;
  let source: MediaAiItem['source'] = 'data';

  if (upload) {
    try {
      const uploaded = await upload(work, kind);
      if (uploaded && isPlayableHref(uploaded)) {
        url = absUrl(uploaded);
        source = 'upload';
      }
    } catch {
      /* fall through */
    }
  }

  if (!url) {
    const fallback = await mediaAiToDataOrBlobUrl(work, kind);
    if (!fallback) return null;
    url = fallback;
    source = fallback.startsWith('blob:') ? 'blob' : 'data';
  }

  return {
    url,
    type: kind,
    preview: url,
    source,
  };
}

/** Process many gallery files → list of working media items. */
export async function mediaAiProcessGalleryFiles(
  files: File[],
  upload?: UploadFn,
): Promise<MediaAiItem[]> {
  const out: MediaAiItem[] = [];
  for (const file of files) {
    const t = (file.type || '').toLowerCase();
    if (t === 'application/pdf' || /\.pdf$/i.test(file.name || '')) continue;
    const isVid =
      t.startsWith('video/') ||
      /\.(mp4|webm|mov|m4v|mkv|3gp)$/i.test(file.name || '');
    const kind: MediaAiKind = isVid ? 'video' : 'image';
    const item = await mediaAiForceWorkingMedia(file, kind, upload);
    if (item) out.push(item);
  }
  return out;
}
