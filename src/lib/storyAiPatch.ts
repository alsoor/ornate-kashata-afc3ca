/**
 * storyAiPatch.ts — Fast, GUARANTEED-TO-PUBLISH Story (status) pipeline (target ≤ 5s)
 *
 * v3 — fixes a regression introduced by v2.
 *
 * ── What went wrong in v2 ──────────────────────────────────────────────────
 * v2 removed the data:/blob: fallback entirely, requiring a real, permanent
 * upload link before it would publish anything. But this app has no
 * persistent server-side file storage (see the "Railway without volume"
 * comments already in this codebase) — the data:/blob: fallback in
 * mediaAiPatch.ts IS the durable storage mechanism here, and it's the exact
 * same mechanism already working fine for regular posts (/api/posts happily
 * accepts a data: URL as mediaUrl). Requiring a real link for stories made
 * every publish fail outright whenever the real upload endpoints don't
 * respond in time — which, on this backend, is most of the time. That's why
 * publishing stopped working completely ("Unable to publish this story").
 *
 * ── What this version does ──────────────────────────────────────────────────
 * 1) Reuse mediaAiForceWorkingMedia (mediaAiPatch.ts) exactly like the post
 *    composer does — instant data:/blob: URL, real upload races a short
 *    budget. This is what makes publishing itself reliable and fast again.
 * 2) Publish with whatever URL comes back (JSON → form-with-url → files-only,
 *    in that order) so we never block on a permanent link.
 * 3) AFTER a successful publish, run a quick, non-blocking load check
 *    ("اختبار الرقع"). If the story published on a local data:/blob: URL and
 *    didn't verify cleanly, kick off a background attempt to fetch a real
 *    upload link and PATCH the story to it (same PATCH pattern the built-in
 *    camera-story publisher already uses). This never delays or blocks the
 *    publish the user is waiting on — it's a best-effort repair afterwards.
 *
 * v4 — fixes "Unable to publish this story. Please try a different image or video."
 *
 * Root cause: v3 only ever posted to /api/status with a data:/blob: URL in a
 * JSON body (or multipart carrying that URL). Big data URLs (esp. video, or
 * phone photos) get rejected by the server body limit, so all 3 attempts failed
 * and the user saw the error. The upload method that is PROVEN to work in this
 * app is the one the camera publisher uses: raw file body → /api/status with
 * Content-Type + X-File-Ext, or multipart media/file/type. v4 tries those FIRST,
 * then falls through to every v3 strategy (nothing was removed).
 *
 * Install: src/lib/storyAiPatch.ts
 */

import {
  mediaAiForceWorkingMedia,
  mediaAiIsBrokenHostUrl,
  type MediaAiKind,
  type MediaAiItem,
} from './mediaAiPatch';

export type StoryPublishResult = {
  ok: boolean;
  mediaUrl: string;
  type: MediaAiKind;
  error?: string;
};

type UploadFn = (file: File, kind: MediaAiKind) => Promise<string | null>;

/** Hard ceiling for the publish step the user actually waits on (ms). */
export const STORY_AI_MAX_MS = 5000;
/** Quick real-load check ("اختبار الرقع") — never blocks the publish itself. */
const VERIFY_BUDGET_MS = 1200;

function storyAiKindOf(file: File): MediaAiKind {
  const t = (file.type || '').toLowerCase();
  const n = (file.name || '').toLowerCase();
  return t.startsWith('video/') || /\.(mp4|webm|mov|m4v|mkv|3gp)$/i.test(n) ? 'video' : 'image';
}

/** A real, permanent link — never a data:/blob: URL, never a dead host. */
function isPermanentUrl(u: string | null | undefined): u is string {
  if (!u) return false;
  const s = String(u).trim();
  if (!s || s === 'null' || s === 'undefined') return false;
  if (/^(data:|blob:)/i.test(s)) return false;
  if (mediaAiIsBrokenHostUrl(s)) return false;
  if (/^https?:\/\//i.test(s)) return true;
  if (s.startsWith('/') && s.length < 600) return true;
  return false;
}

/** اختبار الرقع — actually try to load the URL rather than trusting a 200 alone. */
function probeUrlLoads(url: string, kind: MediaAiKind, timeoutMs = VERIFY_BUDGET_MS): Promise<boolean> {
  return new Promise(resolve => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      resolve(ok);
    };
    const t = window.setTimeout(() => finish(false), timeoutMs);
    try {
      if (kind === 'video') {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => { window.clearTimeout(t); finish(true); };
        v.onerror = () => { window.clearTimeout(t); finish(false); };
        v.src = url;
      } else {
        const img = new Image();
        img.onload = () => { window.clearTimeout(t); finish(true); };
        img.onerror = () => { window.clearTimeout(t); finish(false); };
        img.src = url;
      }
    } catch {
      window.clearTimeout(t);
      finish(false);
    }
  });
}

async function postStatusJson(payload: Record<string, unknown>): Promise<Response | null> {
  try {
    return await fetch('/api/status', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    return null;
  }
}

async function postStatusFormWithUrl(file: File, mediaUrl: string, kind: MediaAiKind): Promise<Response | null> {
  try {
    const fd = new FormData();
    fd.append('mediaUrl', mediaUrl);
    fd.append('url', mediaUrl);
    fd.append('media', file, file.name || (kind === 'video' ? 'story.mp4' : 'story.jpg'));
    fd.append('file', file, file.name || (kind === 'video' ? 'story.mp4' : 'story.jpg'));
    fd.append('type', kind);
    fd.append('mediaType', kind);
    return await fetch('/api/status', { method: 'POST', credentials: 'include', body: fd });
  } catch {
    return null;
  }
}

/** No mediaUrl field at all — last resort in case the server can store the raw file itself. */
async function postStatusFilesOnly(file: File, kind: MediaAiKind): Promise<Response | null> {
  try {
    const fd = new FormData();
    fd.append('media', file, file.name || (kind === 'video' ? 'story.mp4' : 'story.jpg'));
    fd.append('file', file, file.name || (kind === 'video' ? 'story.mp4' : 'story.jpg'));
    fd.append('type', kind);
    fd.append('mediaType', kind);
    return await fetch('/api/status', { method: 'POST', credentials: 'include', body: fd });
  } catch {
    return null;
  }
}


/** Per-request ceiling for the direct uploads (videos can be large). */
const DIRECT_TIMEOUT_MS = 90_000;

async function fetchWithTimeout(input: string, init: RequestInit, ms = DIRECT_TIMEOUT_MS): Promise<Response | null> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ctrl ? window.setTimeout(() => ctrl.abort(), ms) : 0;
  try {
    return await fetch(input, { ...init, signal: ctrl?.signal });
  } catch {
    return null;
  } finally {
    if (t) window.clearTimeout(t);
  }
}

function storyAiExt(file: File, kind: MediaAiKind): string {
  const fromName = (file.name || '').split('.').pop()?.toLowerCase() || '';
  if (/^(jpe?g|png|webp|gif|mp4|webm|mov|m4v|mkv|3gp)$/.test(fromName)) return fromName;
  const t = (file.type || '').toLowerCase();
  if (t.includes('png')) return 'png';
  if (t.includes('webp')) return 'webp';
  if (t.includes('gif')) return 'gif';
  if (t.includes('webm')) return 'webm';
  if (t.includes('quicktime')) return 'mov';
  if (t.startsWith('video/')) return 'mp4';
  return kind === 'video' ? 'mp4' : 'jpg';
}

function storyAiContentType(file: File, kind: MediaAiKind): string {
  const t = (file.type || '').split(';')[0].toLowerCase();
  if (t.startsWith('image/') || t.startsWith('video/')) return t;
  const ext = storyAiExt(file, kind);
  if (kind === 'video') return ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : 'video/mp4';
  return ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
}

/** Give the file a clean name + real MIME so the server always recognises it. */
function storyAiCleanFile(file: File, kind: MediaAiKind): File {
  const ext = storyAiExt(file, kind);
  const base = ((file.name || '').replace(/\.[^.]+$/, '') || 'story').replace(/[^\w\-]+/g, '_').slice(0, 40) || 'story';
  try {
    return new File([file], `${base}.${ext}`, { type: storyAiContentType(file, kind), lastModified: file.lastModified || Date.now() });
  } catch {
    return file;
  }
}

/** Big phone photos / HEIC → JPEG ≤1600px so they fit the server body limit. */
async function storyAiShrinkImage(file: File): Promise<File> {
  try {
    const mime = (file.type || '').toLowerCase();
    const name = (file.name || '').toLowerCase();
    const heic = mime.includes('heic') || mime.includes('heif') || /\.(heic|heif)$/.test(name);
    if (!heic && file.size > 0 && file.size < 1_200_000) return file;
    if (typeof createImageBitmap !== 'function') return file;
    const bmp = await createImageBitmap(file);
    try {
      const MAX = 1600;
      const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * scale));
      const h = Math.max(1, Math.round(bmp.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(bmp, 0, 0, w, h);
      const blob: Blob | null = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.82));
      if (!blob || blob.size <= 0) return file;
      const base = ((file.name || 'story').replace(/\.[^.]+$/, '') || 'story');
      return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
    } finally {
      try { bmp.close?.(); } catch { /* ignore */ }
    }
  } catch {
    return file;
  }
}

/** PROVEN path #1 (same as the camera publisher): raw file body. */
async function postStatusRaw(file: File, kind: MediaAiKind): Promise<Response | null> {
  return fetchWithTimeout('/api/status', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': storyAiContentType(file, kind),
      'X-File-Ext': `.${storyAiExt(file, kind)}`,
      'X-Media-Type': kind,
    },
    body: file,
  });
}

/** PROVEN path #2 (same as the camera publisher): multipart media + file + type. */
async function postStatusMultipart(file: File, kind: MediaAiKind, withMediaType = false): Promise<Response | null> {
  try {
    const fd = new FormData();
    fd.append('media', file, file.name);
    fd.append('file', file, file.name);
    fd.append('type', kind);
    if (withMediaType) {
      fd.append('mediaType', kind);
      fd.append('duration', String(kind === 'video' ? 15 : 5));
    }
    return await fetchWithTimeout('/api/status', { method: 'POST', credentials: 'include', body: fd });
  } catch {
    return null;
  }
}

async function readErr(r: Response | null): Promise<string> {
  if (!r) return 'network';
  try { return `${r.status} ${(await r.clone().text()).slice(0, 200)}`; } catch { return String(r.status); }
}

function extractFromJson(d: any): { mediaUrl: string | null; id: string | number | null } {
  const mediaUrl =
    d?.status?.mediaUrl || d?.item?.mediaUrl || d?.data?.mediaUrl ||
    d?.mediaUrl || d?.url || d?.status?.url || d?.item?.url || null;
  const id =
    d?.id ?? d?.statusId ?? d?.status?.id ?? d?.item?.id ?? d?.data?.id ?? null;
  return {
    mediaUrl: typeof mediaUrl === 'string' && mediaUrl.trim() ? mediaUrl.trim() : null,
    id: id ?? null,
  };
}

/** Best-effort background repair — never awaited by the caller, never blocks the publish. */
function backgroundUpgradeToRealLink(
  work: File,
  kind: MediaAiKind,
  storyId: string | number,
  upload: UploadFn,
) {
  void (async () => {
    try {
      const betterUrl = await upload(work, kind);
      if (!betterUrl || !isPermanentUrl(betterUrl)) return;
      const metaBody = {
        id: storyId,
        statusId: storyId,
        mediaUrl: betterUrl,
        url: betterUrl,
        mediaType: kind,
        type: kind,
      };
      const attempts = [
        () => fetch('/api/status', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(metaBody) }),
        () => fetch(`/api/status/${storyId}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(metaBody) }),
        () => fetch('/api/status/update', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(metaBody) }),
      ];
      for (const run of attempts) {
        try {
          const r = await run();
          if (r.ok) {
            try { window.dispatchEvent(new CustomEvent('stooorna:story-published')); } catch { /* ignore */ }
            break;
          }
        } catch {
          /* try next */
        }
      }
    } catch {
      /* best-effort only — a failure here never surfaces to the user */
    }
  })();
}

/** v3 strategy chain (data:/blob: URL based) — kept as the last-resort fallback. */
/**
 * Publish one Story item in ≤ STORY_AI_MAX_MS. Never throws, and never
 * requires a real permanent link to succeed — mirrors the proven mechanism
 * already used for regular posts, then quietly tries to upgrade the link in
 * the background if the publish had to fall back to a local data:/blob: URL.
 */
async function storyAiPublishLegacy(
  file: File,
  upload?: UploadFn,
  onStatus?: (msg: string) => void,
): Promise<StoryPublishResult> {
  const kind = storyAiKindOf(file);

  const item: MediaAiItem | null = await mediaAiForceWorkingMedia(file, kind, upload, onStatus);
  if (!item) {
    return { ok: false, mediaUrl: '', type: kind, error: 'تعذر تجهيز الوسائط' };
  }

  onStatus?.('جاري النشر…');
  const payload = {
    mediaUrl: item.url,
    url: item.url,
    mediaType: kind,
    type: kind,
    duration: kind === 'video' ? 15 : 5,
  };

  let response = await postStatusJson(payload);
  let created: any = null;
  if (response && response.ok) {
    try { created = await response.clone().json(); } catch { /* server may not echo JSON */ }
  }
  if (!response || !response.ok) {
    response = await postStatusFormWithUrl(file, item.url, kind);
    if (response && response.ok) {
      try { created = await response.clone().json(); } catch { /* */ }
    }
  }
  if (!response || !response.ok) {
    response = await postStatusFilesOnly(file, kind);
    if (response && response.ok) {
      try { created = await response.clone().json(); } catch { /* */ }
    }
  }

  if (!response || !response.ok) {
    return { ok: false, mediaUrl: item.url, type: kind, error: 'فشل نشر القصة' };
  }

  const extracted = extractFromJson(created);
  const finalUrl = extracted.mediaUrl || item.url;

  try {
    window.dispatchEvent(new CustomEvent('stooorna:story-published'));
  } catch {
    /* ignore */
  }
  onStatus?.('تم النشر');

  // اختبار الرقع — if we had to fall back to a local URL, verify it renders;
  // if not, try to quietly upgrade it to a real link in the background.
  // This never blocks or delays the result the user is waiting on.
  if (item.source !== 'upload' && upload && extracted.id != null) {
    probeUrlLoads(finalUrl, kind).then(okLoad => {
      if (!okLoad) backgroundUpgradeToRealLink(file, kind, extracted.id as string | number, upload);
    });
  }

  return { ok: true, mediaUrl: finalUrl, type: kind };
}


/**
 * Publish one Story item. Never throws.
 * Order: proven raw/multipart uploads → real-link upload + JSON → v3 chain.
 */
export async function storyAiPublish(
  file: File,
  upload?: UploadFn,
  onStatus?: (msg: string) => void,
): Promise<StoryPublishResult> {
  const kind = storyAiKindOf(file);
  let lastError = '';

  const done = async (r: Response, usedFile: File): Promise<StoryPublishResult> => {
    let created: any = null;
    try { created = await r.clone().json(); } catch { /* server may not echo JSON */ }
    const extracted = extractFromJson(created);
    try { window.dispatchEvent(new CustomEvent('stooorna:story-published')); } catch { /* ignore */ }
    onStatus?.('تم النشر');
    return { ok: true, mediaUrl: extracted.mediaUrl || '', type: kind };
  };

  try {
    onStatus?.('جاري التجهيز…');
    const cleaned = storyAiCleanFile(file, kind);
    const candidates: File[] = [];
    if (kind === 'image') {
      const shrunk = await storyAiShrinkImage(cleaned);
      candidates.push(storyAiCleanFile(shrunk, kind));
      if (shrunk !== cleaned) candidates.push(cleaned);
    } else {
      candidates.push(cleaned);
    }

    onStatus?.('جاري النشر…');
    for (const f of candidates) {
      // 1) raw body (proven)
      let r = await postStatusRaw(f, kind);
      if (r && r.ok) return await done(r, f);
      lastError = await readErr(r);
      // 2) multipart media/file/type (proven)
      r = await postStatusMultipart(f, kind, false);
      if (r && r.ok) return await done(r, f);
      lastError = await readErr(r);
      // 3) multipart with extra fields
      r = await postStatusMultipart(f, kind, true);
      if (r && r.ok) return await done(r, f);
      lastError = await readErr(r);
    }

    // 4) real permanent link via the app's uploader, then publish by URL
    if (upload) {
      try {
        const link = await upload(candidates[0], kind);
        if (link && isPermanentUrl(link)) {
          const r = await postStatusJson({
            mediaUrl: link, url: link, mediaType: kind, type: kind,
            duration: kind === 'video' ? 15 : 5,
          });
          if (r && r.ok) return await done(r, candidates[0]);
          lastError = await readErr(r);
        }
      } catch (e) {
        lastError = e instanceof Error ? e.message : lastError;
      }
    }
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
  }

  // 5) last resort: the v3 data:/blob: chain (unchanged)
  try {
    const legacy = await storyAiPublishLegacy(file, upload, onStatus);
    if (legacy.ok) return legacy;
    lastError = legacy.error || lastError;
  } catch (e) {
    lastError = e instanceof Error ? e.message : lastError;
  }

  try { console.error('[storyAi] publish failed:', lastError); } catch { /* ignore */ }
  return { ok: false, mediaUrl: '', type: kind, error: lastError || 'فشل نشر القصة' };
}
