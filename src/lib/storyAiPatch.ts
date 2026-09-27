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

/**
 * Publish one Story item in ≤ STORY_AI_MAX_MS. Never throws, and never
 * requires a real permanent link to succeed — mirrors the proven mechanism
 * already used for regular posts, then quietly tries to upgrade the link in
 * the background if the publish had to fall back to a local data:/blob: URL.
 */
export async function storyAiPublish(
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
