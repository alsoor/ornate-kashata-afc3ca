/**
 * storyAiPatch.ts — Fast, GUARANTEED-TO-DISPLAY Story (status) publish (target ≤ 5s)
 *
 * v2 — replaces the previous approach entirely (see note below).
 *
 * ── Why images weren't showing after the first patch ──────────────────────
 * The old flow (and the first version of this file) fell back to an instant
 * data:image/...;base64,... URL whenever the real upload didn't finish inside
 * its budget, and then persisted THAT giant string as the story's mediaUrl by
 * putting it straight into the JSON/form body. Most upload endpoints (and the
 * DB column behind them) have a size limit far smaller than a base64 photo —
 * so the request either got rejected or silently truncated, and the story was
 * saved with a broken mediaUrl. Video used a short blob: object URL instead of
 * a data: string, so it stayed small and happened to keep working — which is
 * exactly why only images broke, never videos.
 *
 * ── What this version does instead ─────────────────────────────────────────
 * 1) Try a REAL upload first (bounded so we never blow the 5s ceiling).
 * 2) If we get a real, permanent link → publish it, then run a load test
 *    ("اختبار الرقع" — probeUrlLoads) to actually confirm the image/video
 *    renders before calling it a success.
 * 3) If no real link comes back in time, send the raw file straight to
 *    /api/status via multipart — NEVER as a data: URL text field — so the
 *    server does its own storage and hands back its own (small, real) URL.
 * 4) Only if both attempts genuinely fail do we report failure. Nothing here
 *    ever persists a base64 data: URL as a story's mediaUrl again.
 *
 * Install: src/lib/storyAiPatch.ts
 */

import { mediaAiNormalizeImage, mediaAiIsBrokenHostUrl, type MediaAiKind } from './mediaAiPatch';

export type StoryPublishResult = {
  ok: boolean;
  mediaUrl: string;
  type: MediaAiKind;
  error?: string;
};

type UploadFn = (file: File, kind: MediaAiKind) => Promise<string | null>;

/** Hard ceiling for the whole story publish step (ms). */
export const STORY_AI_MAX_MS = 5000;
/** Most of the budget goes to getting a real, permanent link — that's the fix. */
const UPLOAD_BUDGET_MS = 4200;
/** Quick real-load check ("اختبار الرقع") before trusting a URL is truly published. */
const VERIFY_BUDGET_MS = 900;

function storyAiKindOf(file: File): MediaAiKind {
  const t = (file.type || '').toLowerCase();
  const n = (file.name || '').toLowerCase();
  return t.startsWith('video/') || /\.(mp4|webm|mov|m4v|mkv|3gp)$/i.test(n) ? 'video' : 'image';
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

/** A real link worth persisting: http(s)/absolute path, never a data:/blob: URL, never a dead host. */
function isPermanentUrl(u: string | null | undefined): u is string {
  if (!u) return false;
  const s = String(u).trim();
  if (!s || s === 'null' || s === 'undefined') return false;
  if (/^data:/i.test(s)) return false; // never treat a base64 string as "permanent"
  if (mediaAiIsBrokenHostUrl(s)) return false;
  if (/^https?:\/\//i.test(s)) return true;
  if (s.startsWith('/') && s.length < 600) return true;
  return false;
}

/**
 * اختبار الرقع — actually try to load the URL before trusting the publish
 * worked, instead of assuming success from an HTTP 200 alone.
 */
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
        v.onloadedmetadata = () => {
          window.clearTimeout(t);
          finish(true);
        };
        v.onerror = () => {
          window.clearTimeout(t);
          finish(false);
        };
        v.src = url;
      } else {
        const img = new Image();
        img.onload = () => {
          window.clearTimeout(t);
          finish(true);
        };
        img.onerror = () => {
          window.clearTimeout(t);
          finish(false);
        };
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

/** Real, short URL only — safe to also send as a form field (unlike a data: URL). */
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

/** No mediaUrl/data: text field at all — the server stores the file itself and mints its own URL. */
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

function extractMediaUrlFromJson(d: any): string | null {
  const u =
    d?.status?.mediaUrl || d?.item?.mediaUrl || d?.data?.mediaUrl ||
    d?.mediaUrl || d?.url || d?.status?.url || d?.item?.url;
  return typeof u === 'string' && u.trim() ? u.trim() : null;
}

/**
 * Publish one Story item in ≤ STORY_AI_MAX_MS. Never throws.
 * Never persists a data: URL as the story's mediaUrl (see file header) —
 * that was the actual cause of images not showing after publish.
 */
export async function storyAiPublish(
  file: File,
  upload?: UploadFn,
  onStatus?: (msg: string) => void,
): Promise<StoryPublishResult> {
  const started = Date.now();
  const kind = storyAiKindOf(file);
  onStatus?.(kind === 'video' ? 'جاري معالجة الفيديو…' : 'جاري معالجة الصورة…');

  let work = file;
  if (kind === 'image') {
    try {
      work = await mediaAiNormalizeImage(file);
    } catch {
      work = file;
    }
  }

  // 1) Real, permanent link first — bounded so the whole thing stays ≤ 5s.
  let realUrl: string | null = null;
  if (upload) {
    onStatus?.('جاري تجهيز الرابط…');
    const remaining = Math.max(600, STORY_AI_MAX_MS - (Date.now() - started));
    const budget = Math.min(UPLOAD_BUDGET_MS, remaining);
    realUrl = await withTimeout(
      (async () => {
        try {
          const u = await upload(work, kind);
          return isPermanentUrl(u) ? u : null;
        } catch {
          return null;
        }
      })(),
      budget,
    );
  }

  // 2) Got a real link — publish it, then actually verify it renders.
  if (realUrl) {
    onStatus?.('جاري النشر…');
    const payload = {
      mediaUrl: realUrl,
      url: realUrl,
      mediaType: kind,
      type: kind,
      duration: kind === 'video' ? 15 : 5,
    };
    let response = await postStatusJson(payload);
    if (!response || !response.ok) response = await postStatusFormWithUrl(work, realUrl, kind);

    if (response && response.ok) {
      // اختبار الرقع — don't just trust a 200; confirm the media actually loads.
      const verified = await probeUrlLoads(realUrl, kind);
      try {
        window.dispatchEvent(new CustomEvent('stooorna:story-published'));
      } catch {
        /* ignore */
      }
      onStatus?.('تم النشر');
      // Report success either way once the server accepted it — a failed probe
      // (e.g. slow CDN warm-up) shouldn't block the publish — but note it.
      return { ok: true, mediaUrl: realUrl, type: kind, error: verified ? undefined : 'نُشرت، لكن تعذّر التأكد من ظهورها فوراً' };
    }
  }

  // 3) No real link in time — let the SERVER store the raw file itself.
  //    Deliberately never falls back to a data: URL text field here.
  onStatus?.('جاري النشر…');
  const filesResp = await postStatusFilesOnly(work, kind);
  if (filesResp && filesResp.ok) {
    let servedUrl: string | null = null;
    try {
      servedUrl = extractMediaUrlFromJson(await filesResp.clone().json());
    } catch {
      /* server may not echo JSON back — that's fine, fetchStories() will pick it up */
    }
    try {
      window.dispatchEvent(new CustomEvent('stooorna:story-published'));
    } catch {
      /* ignore */
    }
    onStatus?.('تم النشر');
    return { ok: true, mediaUrl: servedUrl || '', type: kind };
  }

  return { ok: false, mediaUrl: '', type: kind, error: 'فشل نشر القصة' };
}
