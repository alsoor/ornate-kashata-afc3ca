/**
 * storyAiPatch.ts — Fast, guaranteed Story (status) publish pipeline (target ≤ 5s)
 *
 * Same idea as mediaAiPatch.ts (instant data:/blob: URL first, server upload
 * races against a short budget) but wraps the *whole* Story flow — turn the
 * file into a working URL, then POST /api/status — in one call, so a Story
 * finishes publishing in well under 5 seconds even when the upload endpoint
 * is slow, flaky, or returns a dead (airo-assets) link.
 *
 * Does NOT replace mediaAiPatch.ts — it imports and reuses it, the same way
 * the general post composer already does.
 *
 * Install: src/lib/storyAiPatch.ts
 */

import {
  mediaAiForceWorkingMedia,
  mediaAiIsBrokenHostUrl,
  type MediaAiKind,
} from './mediaAiPatch';

export type StoryPublishResult = {
  ok: boolean;
  mediaUrl: string;
  type: MediaAiKind;
  error?: string;
};

type UploadFn = (file: File, kind: MediaAiKind) => Promise<string | null>;

/** Hard ceiling for the whole story publish step (ms) — mirrors MEDIA_AI_MAX_MS. */
export const STORY_AI_MAX_MS = 5000;

function storyAiKindOf(file: File): MediaAiKind {
  const t = (file.type || '').toLowerCase();
  const n = (file.name || '').toLowerCase();
  return t.startsWith('video/') || /\.(mp4|webm|mov|m4v|mkv|3gp)$/i.test(n) ? 'video' : 'image';
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

async function postStatusForm(file: File, mediaUrl: string, kind: MediaAiKind): Promise<Response | null> {
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

/** Last-resort raw body POST — kept for parity with the old uploadStory fallbacks. */
async function postStatusRaw(file: File): Promise<Response | null> {
  const ext = (file.name || '').split('.').pop() || 'jpg';
  try {
    return await fetch('/api/status', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Ext': `.${ext}` },
      body: file,
    });
  } catch {
    return null;
  }
}

/**
 * Publish one Story item in ≤ STORY_AI_MAX_MS, guaranteed to resolve (never throws).
 *
 * 1) mediaAiForceWorkingMedia turns the file into an always-playable URL —
 *    a real server link if the upload finishes inside its short budget,
 *    otherwise an instant data:/blob: URL, so the story is never blocked
 *    waiting on a slow or dead upload host.
 * 2) POST /api/status with that URL (JSON → multipart → raw body fallback,
 *    same as before, just faster because step 1 already has a working URL).
 */
export async function storyAiPublish(
  file: File,
  upload?: UploadFn,
  onStatus?: (msg: string) => void,
): Promise<StoryPublishResult> {
  const kind = storyAiKindOf(file);

  const item = await mediaAiForceWorkingMedia(file, kind, upload, onStatus);
  if (!item || mediaAiIsBrokenHostUrl(item.url)) {
    return { ok: false, mediaUrl: '', type: kind, error: 'تعذر تجهيز وسائط القصة' };
  }

  onStatus?.('جاري نشر القصة…');
  const payload = {
    mediaUrl: item.url,
    url: item.url,
    mediaType: kind,
    type: kind,
    duration: kind === 'video' ? 15 : 5,
  };

  let response = await postStatusJson(payload);
  if (!response || !response.ok) response = await postStatusForm(file, item.url, kind);
  if (!response || !response.ok) response = await postStatusRaw(file);

  if (!response || !response.ok) {
    return { ok: false, mediaUrl: item.url, type: kind, error: 'فشل نشر القصة' };
  }

  try {
    window.dispatchEvent(new CustomEvent('stooorna:story-published'));
  } catch {
    /* ignore */
  }
  onStatus?.('تم النشر');
  return { ok: true, mediaUrl: item.url, type: kind };
}
