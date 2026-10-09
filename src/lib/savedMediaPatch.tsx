/**
 * SAVED-MEDIA-PATCH (client) — standalone file, used ONLY by the Saved Messages chat in add-friend.tsx.
 * (The public live chat does not import anything from here.)
 *
 *  Flow when you pick Video / Photo from the "+" menu in Saved Messages:
 *   1) The writing rectangle shows "جاري المعاينة…" (instead of the yellow fill + %).
 *   2) prepareSavedMedia(): photo is shrunk to a light JPEG (HEIC too), then uploaded (retries on the
 *      other endpoint). Result = a permanent URL.
 *   3) The message that travels to the other person is that URL (a hidden link): encodeSavedMediaLink().
 *      The receiver never sees the link text — decodeSavedMediaLink() turns it back into a photo / video bubble.
 *   4) When the preview is ready it is sent automatically and the photo / video drops into the chat.
 *
 *  Old messages ("img:" / "vid:" prefix) keep working — add-friend.tsx still understands them.
 */
import type { CSSProperties } from 'react';

export type SavedMediaKind = 'image' | 'video';

const TAG = '#sm=';
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif|avif)(\?|#|$)/i;

/** url -> hidden-link message text that the server just stores as a normal text message */
export function encodeSavedMediaLink(url: string, kind: SavedMediaKind): string {
  const clean = String(url || '').split(TAG)[0];
  return `${clean}${TAG}${kind}`;
}

/** message text -> { kind, url } when the WHOLE message is a media link (otherwise null = normal text) */
export function decodeSavedMediaLink(raw?: string | null): { kind: SavedMediaKind; url: string } | null {
  const s = String(raw ?? '').trim();
  if (!s || /\s/.test(s)) return null;
  if (!/^(https?:\/\/|\/)/i.test(s)) return null;
  const i = s.indexOf(TAG);
  if (i > 0) {
    const k = s.slice(i + TAG.length);
    const url = s.slice(0, i);
    if ((k === 'image' || k === 'video') && url) return { kind: k, url };
    return null;
  }
  if (VIDEO_EXT.test(s)) return { kind: 'video', url: s };
  if (IMAGE_EXT.test(s)) return { kind: 'image', url: s };
  return null;
}

/** phone photos are big (several MB / HEIC): shrink to a light JPEG so the upload is quick and always opens for the friend */
async function shrinkPhoto(file: File): Promise<File> {
  const isHeic = /heic|heif/i.test(`${file.type} ${file.name}`);
  if (!isHeic && file.size > 0 && file.size < 900_000 && /^image\/(jpeg|png|webp|gif)$/i.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const sc = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(bmp.width * sc));
    cv.height = Math.max(1, Math.round(bmp.height * sc));
    cv.getContext('2d')?.drawImage(bmp, 0, 0, cv.width, cv.height);
    try { bmp.close(); } catch { /* */ }
    const blob: Blob | null = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.82));
    if (blob && blob.size > 0) {
      const base = (file.name || 'photo').replace(/\.[^.]+$/, '') || 'photo';
      return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
    }
  } catch { /* keep original */ }
  return file;
}

function pickUrl(d: any): string {
  const u = d?.url || d?.mediaUrl || d?.path || d?.data?.url || d?.file?.url || '';
  return typeof u === 'string' && u && !u.startsWith('blob:') ? u : '';
}

/**
 * Prepare a picked photo / video for sending. Returns the permanent URL ('' when every upload attempt failed,
 * the caller then keeps only a local preview and does NOT send a temporary blob: link to the friend).
 *
 * `uploader` = the app's own proven uploader (the one the public live chat already uses). It is tried first.
 * Fallbacks: /api/posts/media is a RAW-body route on the server (express.raw), so the file is sent as a raw body
 * with Content-Type + X-File-Ext; multipart is only the last resort.
 */
export async function prepareSavedMedia(
  file: File,
  kind: SavedMediaKind,
  uploader?: (f: File) => Promise<string | null | undefined>,
  signal?: AbortSignal,
): Promise<string> {
  const up = kind === 'image' ? await shrinkPhoto(file) : file;
  const isPermanent = (u: unknown): u is string => typeof u === 'string' && !!u && !/^(blob:|data:)/i.test(u);

  // 1) the app's own uploader (same one that already works in the public chat)
  if (uploader) {
    try {
      const u = await uploader(up);
      if (isPermanent(u)) return u;
    } catch { /* next */ }
  }

  const mime = (up.type || '').split(';')[0] || (kind === 'video' ? 'video/mp4' : 'image/jpeg');
  const ext = ((up.name || '').split('.').pop() || (kind === 'video' ? 'mp4' : 'jpg')).toLowerCase().replace(/[^a-z0-9]/g, '') || (kind === 'video' ? 'mp4' : 'jpg');
  const name = up.name || `${kind === 'image' ? 'photo' : 'video'}.${ext}`;
  const ms = kind === 'video' ? 60000 : 30000;

  const attempts: Array<() => Promise<Response>> = [
    // 2) raw body (what /api/posts/media really parses)
    () => fetch('/api/posts/media', {
      method: 'POST', credentials: 'include', signal,
      headers: { 'Content-Type': mime, 'X-File-Ext': `.${ext}`, 'X-Media-Type': kind },
      body: up,
    }),
    // 3) multipart fallbacks
    () => { const fd = new FormData(); fd.append('file', up, name); fd.append('media', up, name); fd.append('type', kind); fd.append('mediaType', kind); return fetch('/api/posts/media', { method: 'POST', credentials: 'include', signal, body: fd }); },
    () => { const fd = new FormData(); fd.append('file', up, name); fd.append('type', kind); return fetch('/api/files/upload', { method: 'POST', credentials: 'include', signal, body: fd }); },
  ];
  for (const run of attempts) {
    if (signal?.aborted) return '';
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), ms);
    try {
      // each attempt builds its own request; abort is applied by racing the timeout
      const r = await Promise.race([
        run(),
        new Promise<Response>((_, rej) => { ctrl.signal.addEventListener('abort', () => rej(new Error('timeout'))); }),
      ]);
      if (r.ok) {
        const url = pickUrl(await r.json().catch(() => ({})));
        if (url) return url;
      }
    } catch { /* next attempt */ } finally {
      window.clearTimeout(timer);
    }
  }
  return '';
}

/** Hard limit for the whole preparation (shrink + upload). After `maxMs` everything is cut so the user can simply try again. */
export async function prepareSavedMediaWithin(
  file: File,
  kind: SavedMediaKind,
  uploader?: (f: File) => Promise<string | null | undefined>,
  maxMs = 40000,
): Promise<{ url: string; timedOut: boolean }> {
  const ctrl = new AbortController();
  let timer = 0;
  const timeout = new Promise<'timeout'>(res => { timer = window.setTimeout(() => res('timeout'), maxMs); });
  const work = prepareSavedMedia(file, kind, uploader, ctrl.signal).catch(() => '');
  const r = await Promise.race([work, timeout]);
  window.clearTimeout(timer);
  if (r === 'timeout') { ctrl.abort(); return { url: '', timedOut: true }; }
  return { url: String(r || ''), timedOut: false };
}

/* ───────────── location (same picker as before — this only lets it travel through the room and show in the chat) ───────────── */
const LOC = '\u2063SMLOC\u2063';
export function encodeSavedLocation(lat: number, lng: number, label: string): string {
  return `${LOC}${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}|${String(label || '').slice(0, 300)}`;
}
export function decodeSavedLocation(raw?: unknown): { lat: number; lng: number; label: string } | null {
  const s = String(raw ?? '');
  if (!s.startsWith(LOC)) return null;
  const m = s.slice(LOC.length).match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\|([\s\S]*)$/);
  if (!m) return null;
  const lat = Number(m[1]); const lng = Number(m[2]);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  return { lat, lng, label: m[3] };
}

/** "جاري المعاينة…" shown inside the writing rectangle while the photo / video is being prepared (put it in the position:relative rectangle) */
export function SavedPreviewLabel({ style }: { style?: CSSProperties }) {
  return (
    <>
      <style>{'@keyframes savedPrevPulse{0%,100%{opacity:.45}50%{opacity:1}}'}</style>
      <span
        aria-live="polite"
        style={{
          position: 'absolute', inset: 0, zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#000000', color: '#ffffff', fontWeight: 800, fontSize: '0.85rem', letterSpacing: 0.2,
          pointerEvents: 'none', animation: 'savedPrevPulse 1.1s ease-in-out infinite', ...style,
        }}
      >
        جاري المعاينة…
      </span>
    </>
  );
}
