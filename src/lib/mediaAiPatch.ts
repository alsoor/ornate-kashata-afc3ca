/**
 * mediaAiPatch.ts — Fast automatic media pipeline (target ≤ 5s)
 *
 * 1) Quick JPEG re-encode (skip if already small)
 * 2) Instant data: URL (always works — any domain)
 * 3) Optional server upload with hard timeout (no airo-assets)
 * 4) No long image-load probes
 *
 * Install: src/lib/mediaAiPatch.ts
 */

export type MediaAiKind = 'image' | 'video';

export type MediaAiItem = {
  url: string;
  type: MediaAiKind;
  preview: string;
  source: 'upload' | 'data' | 'blob';
};

/** Hard ceiling for the whole AI media step (ms). */
export const MEDIA_AI_MAX_MS = 5000;
/** Server upload attempt budget (ms) — local data URL is ready first. */
const UPLOAD_BUDGET_MS = 2200;

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

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise(resolve => {
    let done = false;
    const t = window.setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, ms);
    p.then(
      v => {
        if (!done) {
          done = true;
          window.clearTimeout(t);
          resolve(v);
        }
      },
      () => {
        if (!done) {
          done = true;
          window.clearTimeout(t);
          resolve(null);
        }
      },
    );
  });
}

/** Fast JPEG normalize — skip work when file is already small enough. */
export async function mediaAiNormalizeImage(file: File, maxEdge = 1280, quality = 0.78): Promise<File> {
  const name = (file.name || '').toLowerCase();
  const mime = (file.type || '').toLowerCase();
  const needsConvert =
    mime.includes('heic') || mime.includes('heif') ||
    name.endsWith('.heic') || name.endsWith('.heif') ||
    (!mime.startsWith('image/') && !name.match(/\.(jpe?g|png|webp|gif)$/i));

  // Fast path: already a reasonable JPEG/PNG/WebP under ~1.2MB
  const smallOk =
    !needsConvert &&
    mime.startsWith('image/') &&
    file.size > 0 &&
    file.size < 1_200_000 &&
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
    const ctx = canvas.getContext('2d', { alpha: false } as any) || canvas.getContext('2d');
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

/** Fast file → data: URL (chunked base64). */
export async function mediaAiToDataUrl(file: File): Promise<string | null> {
  try {
    const normalized = await mediaAiNormalizeImage(file);
    const buf = await normalized.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
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

/** Kept for API compat — no long waits (data/blob always true, airo always false). */
export function mediaAiProbeImageLoads(url: string, _timeoutMs = 500): Promise<boolean> {
  if (/^data:image\//i.test(url) || /^blob:/i.test(url)) return Promise.resolve(true);
  if (mediaAiIsBrokenHostUrl(url)) return Promise.resolve(false);
  // Do not wait on remote hosts — treat unknown remote as usable only if not airo
  return Promise.resolve(/^https?:\/\//i.test(url));
}

type UploadFn = (file: File, kind: MediaAiKind) => Promise<string | null>;

/**
 * Fast force-working media (≤ MEDIA_AI_MAX_MS overall when used per file).
 * Local data/blob URL is produced first; upload races with a short budget.
 */
export async function mediaAiForceWorkingMedia(
  file: File,
  kind: MediaAiKind,
  upload?: UploadFn,
  onStatus?: (msg: string) => void,
): Promise<MediaAiItem | null> {
  const started = Date.now();
  onStatus?.(kind === 'video' ? 'جاري معالجة الفيديو…' : 'جاري معالجة الصورة…');

  let work = file;
  if (kind === 'image') {
    try {
      work = await mediaAiNormalizeImage(file);
    } catch {
      work = file;
    }
  }

  // Instant local playable URL (preview + publish always work)
  let localUrl: string | null = null;
  if (kind === 'image') {
    localUrl = await mediaAiToDataUrl(work);
  } else {
    localUrl = URL.createObjectURL(work);
  }
  if (!localUrl) return null;

  const remaining = Math.max(400, MEDIA_AI_MAX_MS - (Date.now() - started));
  const uploadMs = Math.min(UPLOAD_BUDGET_MS, remaining);

  if (upload) {
    onStatus?.('جاري تجهيز الرابط…');
    const uploaded = await withTimeout(
      (async () => {
        try {
          const u = await upload(work, kind);
          if (!u || mediaAiIsBrokenHostUrl(u) || /airo-assets/i.test(u)) return null;
          if (!isPlayableHref(u)) return null;
          return absUrl(u);
        } catch {
          return null;
        }
      })(),
      uploadMs,
    );
    if (uploaded && !mediaAiIsBrokenHostUrl(uploaded)) {
      return { url: uploaded, type: kind, preview: uploaded, source: 'upload' };
    }
  }

  onStatus?.('جاهز للنشر');
  return {
    url: localUrl,
    type: kind,
    preview: localUrl,
    source: localUrl.startsWith('blob:') ? 'blob' : 'data',
  };
}

export async function mediaAiProcessGalleryFiles(
  files: File[],
  upload?: UploadFn,
  onStatus?: (msg: string) => void,
): Promise<MediaAiItem[]> {
  const mediaFiles = files.filter(file => {
    const t = (file.type || '').toLowerCase();
    return !(t === 'application/pdf' || /\.pdf$/i.test(file.name || ''));
  });

  // Parallel process all files under a shared 5s budget
  const started = Date.now();
  onStatus?.(
    mediaFiles.length > 1
      ? `جاري معالجة ${mediaFiles.length} وسائط…`
      : mediaFiles[0] && ((mediaFiles[0].type || '').startsWith('video/') || /\.(mp4|webm|mov|m4v)/i.test(mediaFiles[0].name || ''))
        ? 'جاري معالجة الفيديو…'
        : 'جاري معالجة الصورة…',
  );

  const tasks = mediaFiles.map(async file => {
    const t = (file.type || '').toLowerCase();
    const isVid =
      t.startsWith('video/') ||
      /\.(mp4|webm|mov|m4v|mkv|3gp)$/i.test(file.name || '');
    const kind: MediaAiKind = isVid ? 'video' : 'image';
    // Per-file upload disabled inside parallel map if budget almost gone — still build local URL
    const left = MEDIA_AI_MAX_MS - (Date.now() - started);
    const useUpload = left > 800 ? upload : undefined;
    return mediaAiForceWorkingMedia(file, kind, useUpload, undefined);
  });

  const results = await withTimeout(Promise.all(tasks), MEDIA_AI_MAX_MS);
  const out: MediaAiItem[] = [];
  if (results) {
    for (const item of results) {
      if (item) out.push(item);
    }
  } else {
    // Timeout: still try sequential fast local-only for first file
    for (const file of mediaFiles.slice(0, 3)) {
      const t = (file.type || '').toLowerCase();
      const isVid =
        t.startsWith('video/') ||
        /\.(mp4|webm|mov|m4v|mkv|3gp)$/i.test(file.name || '');
      const kind: MediaAiKind = isVid ? 'video' : 'image';
      const item = await mediaAiForceWorkingMedia(file, kind, undefined, onStatus);
      if (item) out.push(item);
    }
  }

  onStatus?.(out.length ? 'جاهز للنشر' : '');
  return out;
}
