/**
 * chatMediaAiPatch.ts — Fast AI-style media prep for chat (≤ ~5s)
 * Separate from publish mediaAiPatch — do not mix.
 *
 * Flow: pick image/video/file → process → ready File (URL never shown in UI)
 * Install: src/lib/chatMediaAiPatch.ts
 */

export type ChatMediaKind = 'image' | 'video' | 'file';

export type ChatMediaReady = {
  file: File;
  kind: ChatMediaKind;
};

export const CHAT_MEDIA_AI_MAX_MS = 5000;

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

/** Fast JPEG normalize for chat images. */
export async function chatMediaAiNormalizeImage(file: File, maxEdge = 1280, quality = 0.78): Promise<File> {
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
    /* keep */
  }

  return file;
}

function detectKind(file: File): ChatMediaKind {
  const t = (file.type || '').toLowerCase();
  const n = (file.name || '').toLowerCase();
  if (t.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif|svg)$/i.test(n)) return 'image';
  if (t.startsWith('video/') || /\.(mp4|webm|mov|m4v|mkv|avi|3gp)$/i.test(n)) return 'video';
  return 'file';
}

/**
 * Prepare gallery/camera file for chat send.
 * Returns a File only — never exposes a public URL string for the input UI.
 */
export async function chatMediaAiPrepare(
  file: File,
  onStatus?: (msg: string) => void,
): Promise<ChatMediaReady | null> {
  const kind = detectKind(file);
  onStatus?.('يرجى الانتظار');

  const work = await withTimeout(
    (async () => {
      if (kind === 'image') {
        try {
          return await chatMediaAiNormalizeImage(file);
        } catch {
          return file;
        }
      }
      return file;
    })(),
    CHAT_MEDIA_AI_MAX_MS,
  );

  const readyFile = work || file;
  onStatus?.('');
  return { file: readyFile, kind };
}
