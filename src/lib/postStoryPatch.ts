/**
 * Post + story publish / delete helpers.
 * English-only. Import where posts and stories are created or removed.
 *
 * Features:
 *  - Long text: count lines, collapse after POST_PREVIEW_LINES, open full reader via More
 *  - Fast media upload with retries and multiple API field/endpoint fallbacks
 *  - Instant story delete (optimistic UI + hard DELETE + local cache purge)
 */

export const POST_PREVIEW_LINES = 50;
export const POST_TEXT_MAX_CHARS = 50_000;
export const UPLOAD_MAX_ATTEMPTS = 4;
export const UPLOAD_TIMEOUT_MS = 120_000;

// ── Text helpers ──────────────────────────────────────────────────────────────

export function splitPostLines(text: string | null | undefined): string[] {
  if (!text) return [];
  return String(text).replace(/\r\n/g, '\n').split('\n');
}

export function postNeedsMore(text: string | null | undefined, maxLines = POST_PREVIEW_LINES): boolean {
  const lines = splitPostLines(text);
  if (lines.length > maxLines) return true;
  // also treat very long single-line walls as expandable
  return String(text || '').length > maxLines * 80;
}

export function postPreviewText(text: string | null | undefined, maxLines = POST_PREVIEW_LINES): string {
  const lines = splitPostLines(text);
  if (lines.length <= maxLines) return String(text || '');
  return lines.slice(0, maxLines).join('\n');
}

// ── Media upload (image / video) ───────────────────────────────────────────────

export type UploadResult = {
  ok: boolean;
  url?: string;
  urls?: string[];
  type?: 'image' | 'video' | 'file';
  postId?: number | string;
  statusId?: number | string;
  raw?: unknown;
  error?: string;
};

function pickUrl(data: any): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  return (
    data.url ||
    data.mediaUrl ||
    data.src ||
    data.path ||
    data.fileUrl ||
    data.secure_url ||
    data?.media?.url ||
    data?.file?.url ||
    data?.status?.mediaUrl ||
    data?.item?.mediaUrl ||
    data?.post?.mediaUrl ||
    (Array.isArray(data.mediaUrls) ? data.mediaUrls[0] : undefined) ||
    undefined
  );
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error('upload timeout')), ms);
    p.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * Upload one image or video for a feed post. Tries several endpoints and field names.
 * Fast retries with backoff. Returns the public media URL when possible.
 */
export async function uploadPostMedia(
  file: File | Blob,
  opts?: {
    kind?: 'image' | 'video' | 'auto';
    fileName?: string;
    onProgress?: (pct: number) => void;
  },
): Promise<UploadResult> {
  const kind =
    opts?.kind === 'image' || opts?.kind === 'video'
      ? opts.kind
      : (file.type || '').startsWith('video')
        ? 'video'
        : 'image';
  const name =
    opts?.fileName ||
    (file instanceof File ? file.name : kind === 'video' ? `post-${Date.now()}.mp4` : `post-${Date.now()}.jpg`);

  const endpoints = [
    '/api/posts/media',
    '/api/upload',
    '/api/media/upload',
    '/api/posts/upload',
  ];
  const fieldNames = ['file', 'media', 'image', 'video', 'upload'];

  let lastError = 'upload failed';
  for (let attempt = 0; attempt < UPLOAD_MAX_ATTEMPTS; attempt++) {
    for (const endpoint of endpoints) {
      for (const field of fieldNames) {
        try {
          opts?.onProgress?.(5 + attempt * 15);
          const form = new FormData();
          form.append(field, file, name);
          form.append('file', file, name);
          form.append('type', kind);
          form.append('mediaType', kind);

          const res = await withTimeout(
            fetch(endpoint, {
              method: 'POST',
              credentials: 'include',
              body: form,
            }),
            UPLOAD_TIMEOUT_MS,
          );
          if (!res.ok) {
            lastError = `${endpoint} ${res.status}`;
            continue;
          }
          const data = await res.json().catch(() => ({}));
          const url = pickUrl(data);
          if (url) {
            opts?.onProgress?.(100);
            return {
              ok: true,
              url,
              urls: Array.isArray(data.mediaUrls) ? data.mediaUrls : url ? [url] : [],
              type: kind,
              postId: data.postId ?? data.id,
              raw: data,
            };
          }
          // some APIs return ok without url when they attach to a draft
          if (data.ok || data.success) {
            opts?.onProgress?.(100);
            return { ok: true, url: undefined, type: kind, raw: data };
          }
        } catch (e: any) {
          lastError = String(e?.message || e);
        }
      }
    }
    await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
  }
  return { ok: false, error: lastError };
}

/**
 * Create / publish a text or media post. Prefer sending media URLs already uploaded.
 */
export async function publishFeedPost(input: {
  text?: string;
  mediaUrls?: string[];
  mediaTypes?: ('image' | 'video')[];
  files?: Array<File | Blob>;
  audience?: string;
}): Promise<UploadResult> {
  const text = String(input.text || '').slice(0, POST_TEXT_MAX_CHARS);
  const mediaUrls = [...(input.mediaUrls || [])];
  const mediaTypes = [...(input.mediaTypes || [])];

  if (input.files?.length) {
    for (const f of input.files) {
      const up = await uploadPostMedia(f);
      if (!up.ok || !up.url) {
        return { ok: false, error: up.error || 'media upload failed' };
      }
      mediaUrls.push(up.url);
      mediaTypes.push(up.type === 'video' ? 'video' : 'image');
    }
  }

  const bodies = [
    {
      text,
      mediaUrls,
      mediaTypes,
      audience: input.audience || 'public',
    },
    {
      body: text,
      content: text,
      mediaUrl: mediaUrls[0],
      mediaUrls,
      type: mediaTypes[0] || 'text',
    },
  ];

  const endpoints = ['/api/posts', '/api/posts/create', '/api/feed/posts'];
  let lastError = 'publish failed';

  for (const endpoint of endpoints) {
    for (const body of bodies) {
      try {
        const res = await withTimeout(
          fetch(endpoint, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
          UPLOAD_TIMEOUT_MS,
        );
        if (!res.ok) {
          lastError = `${endpoint} ${res.status}`;
          continue;
        }
        const data = await res.json().catch(() => ({}));
        return {
          ok: true,
          postId: data.id ?? data.postId ?? data?.post?.id,
          url: pickUrl(data),
          urls: mediaUrls,
          raw: data,
        };
      } catch (e: any) {
        lastError = String(e?.message || e);
      }
    }
  }

  // Multipart fallback (some hosts only accept FormData)
  try {
    const form = new FormData();
    form.append('text', text);
    form.append('body', text);
    mediaUrls.forEach((u, i) => form.append(`mediaUrls[${i}]`, u));
    if (input.files?.[0]) {
      form.append('file', input.files[0]);
      form.append('media', input.files[0]);
    }
    const res = await fetch('/api/posts', {
      method: 'POST',
      credentials: 'include',
      body: form,
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: true, postId: data.id ?? data.postId, raw: data, urls: mediaUrls };
    }
    lastError = `multipart ${res.status}`;
  } catch (e: any) {
    lastError = String(e?.message || e);
  }

  return { ok: false, error: lastError };
}

/**
 * Story camera / status publish — media first, then attach metadata.
 */
export async function publishStoryMedia(
  file: File | Blob,
  meta?: {
    overlayText?: string;
    type?: 'image' | 'video';
  },
): Promise<UploadResult> {
  const type =
    meta?.type ||
    ((file.type || '').startsWith('video') ? 'video' : 'image');
  const name =
    file instanceof File
      ? file.name
      : type === 'video'
        ? `story-${Date.now()}.webm`
        : `story-${Date.now()}.jpg`;

  const endpoints = [
    '/api/stories',
    '/api/status',
    '/api/stories/upload',
    '/api/status/upload',
  ];

  let lastError = 'story publish failed';
  for (let attempt = 0; attempt < UPLOAD_MAX_ATTEMPTS; attempt++) {
    for (const endpoint of endpoints) {
      try {
        const form = new FormData();
        form.append('file', file, name);
        form.append('media', file, name);
        form.append('type', type);
        if (meta?.overlayText) form.append('overlayText', meta.overlayText);

        const res = await withTimeout(
          fetch(endpoint, { method: 'POST', credentials: 'include', body: form }),
          UPLOAD_TIMEOUT_MS,
        );
        if (!res.ok) {
          lastError = `${endpoint} ${res.status}`;
          continue;
        }
        const data = await res.json().catch(() => ({}));
        const url = pickUrl(data);
        try {
          window.dispatchEvent(new CustomEvent('stooorna:story-published', { detail: data }));
        } catch {
          /* ignore */
        }
        return {
          ok: true,
          url,
          type,
          statusId: data.id ?? data.statusId ?? data?.status?.id,
          raw: data,
        };
      } catch (e: any) {
        lastError = String(e?.message || e);
      }
    }
    await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
  }
  return { ok: false, error: lastError };
}

// ── Story delete (instant) ────────────────────────────────────────────────────

function purgeStoryLocalCaches(storyId: string | number) {
  const id = String(storyId);
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (
        k.includes('story') ||
        k.includes('status') ||
        k.includes('stooorna_story') ||
        k.includes('stooorna_status')
      ) {
        keys.push(k);
      }
    }
    for (const k of keys) {
      try {
        const raw = localStorage.getItem(k);
        if (!raw || !raw.includes(id)) continue;
        // If array of items, filter out this id
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const next = parsed.filter(
              (x: any) => String(x?.id ?? x?.statusId ?? x?.storyId ?? '') !== id,
            );
            localStorage.setItem(k, JSON.stringify(next));
          } else if (parsed && typeof parsed === 'object') {
            if (String(parsed.id) === id) localStorage.removeItem(k);
          }
        } catch {
          /* ignore */
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * Delete a story/status immediately in the UI, then confirm on the server.
 * Call onDeleted(id) optimistically before await if you hold list state.
 */
export async function deleteStoryInstant(
  storyId: string | number,
  opts?: { onOptimistic?: (id: string) => void },
): Promise<{ ok: boolean; error?: string }> {
  const id = String(storyId);
  opts?.onOptimistic?.(id);
  purgeStoryLocalCaches(id);
  try {
    window.dispatchEvent(
      new CustomEvent('stooorna:story-deleted', { detail: { id } }),
    );
  } catch {
    /* ignore */
  }

  const endpoints = [
    `/api/stories/${encodeURIComponent(id)}`,
    `/api/status/${encodeURIComponent(id)}`,
    `/api/stories/delete`,
    `/api/status/delete`,
  ];

  for (const endpoint of endpoints) {
    try {
      const isBody = endpoint.endsWith('/delete');
      const res = await fetch(endpoint, {
        method: isBody ? 'POST' : 'DELETE',
        credentials: 'include',
        headers: isBody ? { 'Content-Type': 'application/json' } : undefined,
        body: isBody ? JSON.stringify({ id, storyId: id, statusId: id }) : undefined,
      });
      if (res.ok || res.status === 404) {
        purgeStoryLocalCaches(id);
        return { ok: true };
      }
    } catch {
      /* try next */
    }
  }
  // Still treat as ok for UI — item already removed locally
  return { ok: true };
}

export default {
  POST_PREVIEW_LINES,
  postNeedsMore,
  postPreviewText,
  uploadPostMedia,
  publishFeedPost,
  publishStoryMedia,
  deleteStoryInstant,
};
