/**
 * liveChatVideoPatch.ts
 * Independent LIVE-CHAT video delivery (normal + view-once / temporary).
 * Does NOT touch stories (/api/status) or the public feed.
 *
 * Place at: src/lib/liveChatVideoPatch.ts  (or next to other @/lib patches)
 * Wired from the public live chat sendRound path.
 */

export type LiveChatVideoPublishInput = {
  id: string;
  userId: string;
  name?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  blob: Blob;
  seconds: number;
  once: boolean;
  room?: string;
};

export type LiveChatVideoPublishResult = {
  ok: boolean;
  url: string | null;
  err: string;
};

const ROOM = 'stooorna-live-chat';
const ROUND_TAG = '\u25CB\u200bRV';

export function makeLiveChatRoundText(once: boolean, seconds: number): string {
  const mode = once ? 'once' : 'normal';
  return `${ROUND_TAG}\u200b${mode}\u200b${Math.max(1, Math.round(seconds))}`;
}

export function isLiveChatRoundText(text?: string | null): boolean {
  return typeof text === 'string' && text.includes(ROUND_TAG);
}

/** Pull a public media URL from any server/upload JSON shape. */
export function extractLiveChatMediaUrl(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s || s === 'null' || s === 'undefined') return null;
    if (/^(https?:\/\/|\/|data:)/i.test(s)) return s;
    if (/^[a-z0-9_\-./]+\.(mp4|webm|mov|m4v|jpe?g|png|gif|webp)(\?|$)/i.test(s)) return s.startsWith('/') ? s : `/${s}`;
    return null;
  }
  if (typeof raw !== 'object') return null;
  const d = raw as Record<string, any>;
  const candidates = [
    d.url, d.mediaUrl, d.videoUrl, d.imageUrl, d.fileUrl, d.path, d.publicUrl, d.src,
    d.location, d.href, d.key, d.filename,
    d.data?.url, d.data?.mediaUrl, d.data?.videoUrl, d.data?.imageUrl, d.data?.path,
    d.result?.url, d.file?.url, d.media?.url, d.video?.url,
  ];
  for (const c of candidates) {
    const u = extractLiveChatMediaUrl(c);
    if (u) return u;
  }
  return null;
}

/** Normalize server message fields so video rows are never dropped. */
export function normalizeLiveChatMediaFields(x: any): {
  id: string;
  userId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  text: string;
  imageUrl: string | null;
  voiceUrl: string | null;
  voiceDuration: number | null;
  likes: string[];
  createdAt: number;
  editCount: number;
} | null {
  if (!x || typeof x !== 'object') return null;
  const imageUrl =
    extractLiveChatMediaUrl(x.imageUrl) ||
    extractLiveChatMediaUrl(x.mediaUrl) ||
    extractLiveChatMediaUrl(x.videoUrl) ||
    extractLiveChatMediaUrl(x.url) ||
    (typeof x.imageUrl === 'string' ? x.imageUrl : null);
  const voiceUrl = typeof x.voiceUrl === 'string' ? x.voiceUrl : (x.audioUrl || null);
  const text = String(x.text || x.body || x.caption || '').slice(0, 500);
  if (!x.id && !text && !imageUrl && !voiceUrl) return null;
  // Keep pure-media rows (image/video URL) even when text is empty
  if (!text && !imageUrl && !voiceUrl) return null;
  return {
    id: String(x.id || `srv_${x.createdAt || x.at || Date.now()}_${Math.random().toString(36).slice(2, 6)}`),
    userId: String(x.userId || x.senderId || x.fromId || ''),
    name: x.name ?? x.authorName ?? null,
    username: x.username ?? x.authorUsername ?? null,
    avatarUrl: x.avatarUrl ?? x.authorAvatar ?? x.image ?? null,
    text,
    imageUrl: imageUrl,
    voiceUrl: voiceUrl,
    voiceDuration: x.voiceDuration ?? x.duration ?? null,
    likes: Array.isArray(x.likes) ? x.likes.map(String) : [],
    createdAt: Number(x.createdAt || x.at || Date.parse(x.created_at || '') || Date.now()),
    editCount: Math.max(0, Number(x.editCount || x.edits || 0) || 0),
  };
}

async function postForm(endpoint: string, fd: FormData, timeoutMs = 30000): Promise<string | null> {
  if (/\/api\/status\b/i.test(endpoint) || /\/api\/stories\b/i.test(endpoint)) return null;
  return new Promise(resolve => {
    const x = new XMLHttpRequest();
    let settled = false;
    const done = (v: string | null) => { if (!settled) { settled = true; resolve(v); } };
    try {
      x.open('POST', endpoint);
      x.withCredentials = true;
      x.timeout = timeoutMs;
      x.onload = () => {
        if (x.status < 200 || x.status >= 300) { done(null); return; }
        const loc = x.getResponseHeader('location') || x.getResponseHeader('x-file-url') || x.getResponseHeader('x-media-url');
        const fromLoc = extractLiveChatMediaUrl(loc);
        if (fromLoc) { done(fromLoc); return; }
        try {
          const ct = (x.getResponseHeader('content-type') || '').toLowerCase();
          if (ct.includes('json') || /^\s*[{[]/.test(x.responseText || '')) {
            done(extractLiveChatMediaUrl(JSON.parse(x.responseText || '{}')));
            return;
          }
          const first = String(x.responseText || '').trim().split(/\s/)[0];
          done(extractLiveChatMediaUrl(first));
        } catch { done(null); }
      };
      x.onerror = () => done(null);
      x.ontimeout = () => done(null);
      x.send(fd);
    } catch { done(null); }
  });
}

function buildLiveFd(file: File, userId: string, field: string): FormData {
  const fd = new FormData();
  fd.append(field, file, file.name);
  fd.append('userId', userId);
  fd.append('kind', 'video');
  fd.append('type', 'video');
  fd.append('mediaType', 'video');
  fd.append('destination', 'live-chat');
  fd.append('scope', 'live-chat');
  fd.append('channel', 'live-chat');
  fd.append('noStory', '1');
  fd.append('createStory', 'false');
  fd.append('story', '0');
  fd.append('skipStory', '1');
  fd.append('liveChatVideo', '1');
  return fd;
}

/** Upload a video blob for live chat only. Never stories. */
export async function uploadLiveChatVideoBlob(blob: Blob, userId: string): Promise<LiveChatVideoPublishResult> {
  const rawType = String(blob.type || '').toLowerCase();
  const looksMp4 = /mp4|m4v|quicktime|avc1/i.test(rawType);
  const ext = looksMp4 && !/webm/i.test(rawType) ? 'mp4' : 'webm';
  const contentType = rawType.startsWith('video/') ? rawType.split(';')[0] : (ext === 'mp4' ? 'video/mp4' : 'video/webm');
  const file = blob instanceof File ? blob : new File([blob], `live-chat-video-${Date.now()}.${ext}`, { type: contentType });

  const endpoints: Array<{ ep: string; field: string }> = [
    { ep: '/api/live-chat/media', field: 'file' },
    { ep: '/api/live-chat/media', field: 'media' },
    { ep: '/api/live-chat/video', field: 'file' },
    { ep: '/api/live-chat/upload', field: 'file' },
    { ep: '/api/video-swap', field: 'file' },
    { ep: '/api/upload', field: 'file' },
    { ep: '/api/media', field: 'file' },
    { ep: '/api/files/upload', field: 'file' },
    { ep: '/api/posts/media', field: 'file' },
    { ep: '/api/posts/media', field: 'media' },
  ];

  for (const a of endpoints) {
    const url = await postForm(a.ep, buildLiveFd(file, userId, a.field), 32000);
    if (url && !/^blob:/i.test(url)) return { ok: true, url, err: '' };
  }

  // Mirror voice-note pattern: JSON + data URL to live-chat endpoints
  if (blob.size > 0 && blob.size < 5_000_000) {
    try {
      const dataUrl = await new Promise<string | null>(resolve => {
        const r = new FileReader();
        r.onloadend = () => resolve(typeof r.result === 'string' && r.result.startsWith('data:') ? r.result : null);
        r.onerror = () => resolve(null);
        r.readAsDataURL(file);
      });
      if (dataUrl) {
        const body = {
          id: `vid_${Date.now()}`,
          userId,
          kind: 'video',
          type: 'video',
          mediaType: 'video',
          video: dataUrl,
          media: dataUrl,
          file: dataUrl,
          audio: dataUrl, // some servers reuse voice handler
          room: ROOM,
          roomId: ROOM,
          noStory: 1,
          destination: 'live-chat',
          liveChatVideo: 1,
        };
        for (const path of ['/api/live-chat/video', '/api/live-chat/media', '/api/live-chat/voice', '/api/live-chat/upload']) {
          try {
            const r = await fetch(path, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            if (!r.ok) continue;
            const d = await r.json().catch(() => null);
            const u = extractLiveChatMediaUrl(d) || extractLiveChatMediaUrl((d as any)?.url);
            if (u) return { ok: true, url: u, err: '' };
          } catch { /* next */ }
        }
        // Last resort: embed data URL in the chat message itself (visible if server stores JSON body)
        if (dataUrl.length < 4_000_000) return { ok: true, url: dataUrl, err: '' };
      }
    } catch { /* */ }
  }

  return { ok: false, url: null, err: 'upload failed' };
}

/** Publish round/normal video to live-chat APIs so every client can fetch it. */
export async function publishLiveChatRoundVideo(input: LiveChatVideoPublishInput): Promise<LiveChatVideoPublishResult> {
  const up = await uploadLiveChatVideoBlob(input.blob, input.userId);
  if (!up.ok || !up.url) return up;

  const text = makeLiveChatRoundText(!!input.once, input.seconds);
  const room = input.room || ROOM;
  const payload = {
    roomId: room,
    room,
    id: input.id,
    userId: input.userId,
    name: input.name ?? null,
    username: input.username ?? null,
    avatarUrl: input.avatarUrl ?? null,
    text,
    body: text,
    imageUrl: up.url,
    mediaUrl: up.url,
    videoUrl: up.url,
    voiceUrl: null,
    voiceDuration: null,
    createdAt: Date.now(),
    editCount: 0,
    mediaType: 'video',
    kind: 'video',
    once: !!input.once,
    duration: Math.max(1, Math.round(input.seconds)),
    noStory: 1,
    destination: 'live-chat',
    liveChatVideo: 1,
  };

  const posts = [
    '/api/live-chat',
    `/api/live-chat?room=${encodeURIComponent(room)}`,
    '/api/public-chat',
    '/api/room/message',
  ];
  let posted = false;
  for (const path of posts) {
    try {
      const r = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (r.ok) { posted = true; break; }
    } catch { /* next */ }
  }

  return { ok: true, url: up.url, err: posted ? '' : 'uploaded but post echo failed' };
}
