/**
 * liveChatVideoDeletePatch.ts
 * Independent LIVE-CHAT video delete (normal + view-once).
 * Does NOT touch stories (/api/status) or the public feed.
 *
 * Place at: src/lib/liveChatVideoDeletePatch.ts
 * Wired from PublicLiveCommentsPanel deleteRound.
 */

export const LIVE_CHAT_VIDEO_DELETE_EVT = 'stooorna:live-chat-video-deleted';
export const LIVE_CHAT_ROOM_DEFAULT = 'stooorna-live-chat';
/** Tombstone marker — same family as round-video tags (○​RV + D). */
export const LIVE_CHAT_ROUND_GONE = '\u25CB\u200bRVD';

export type LiveChatVideoDeleteInput = {
  id: string;
  userId: string;
  room?: string;
  /** Previous media URL (best-effort server file cleanup). */
  mediaUrl?: string | null;
  name?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  createdAt?: number;
};

export type LiveChatVideoDeleteResult = {
  ok: boolean;
  err: string;
};

export function isLiveChatRoundGone(text?: string | null): boolean {
  const t = String(text || '');
  return t === LIVE_CHAT_ROUND_GONE || t.includes('\u25CB\u200bRVD') || /RVD$/.test(t);
}

/** Broadcast delete so every open client can dust-hide immediately. */
export function broadcastLiveChatVideoDeleted(id: string, userId: string): void {
  try {
    window.dispatchEvent(new CustomEvent(LIVE_CHAT_VIDEO_DELETE_EVT, {
      detail: { id, userId, at: Date.now() },
    }));
  } catch { /* */ }
  try {
    const bc = new BroadcastChannel('stooorna_live_chat');
    bc.postMessage({ type: 'video-deleted', id, userId, at: Date.now() });
    bc.close();
  } catch { /* */ }
  try {
    localStorage.setItem('stooorna_live_chat_del_ping', JSON.stringify({ id, userId, at: Date.now() }));
    localStorage.removeItem('stooorna_live_chat_del_ping');
  } catch { /* */ }
}

export function onLiveChatVideoDeleted(
  handler: (info: { id: string; userId: string }) => void,
): () => void {
  const onCustom = (e: Event) => {
    const d = (e as CustomEvent).detail || {};
    if (d?.id) handler({ id: String(d.id), userId: String(d.userId || '') });
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key !== 'stooorna_live_chat_del_ping' || !e.newValue) return;
    try {
      const d = JSON.parse(e.newValue);
      if (d?.id) handler({ id: String(d.id), userId: String(d.userId || '') });
    } catch { /* */ }
  };
  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel('stooorna_live_chat');
    bc.onmessage = (ev) => {
      const d = ev?.data;
      if (d?.type === 'video-deleted' && d.id) handler({ id: String(d.id), userId: String(d.userId || '') });
    };
  } catch { bc = null; }
  window.addEventListener(LIVE_CHAT_VIDEO_DELETE_EVT, onCustom as EventListener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(LIVE_CHAT_VIDEO_DELETE_EVT, onCustom as EventListener);
    window.removeEventListener('storage', onStorage);
    try { bc?.close(); } catch { /* */ }
  };
}

/**
 * Publish a delete tombstone to live-chat APIs so every client drops the video.
 * Clears imageUrl/mediaUrl/videoUrl explicitly so merge cannot revive the media.
 */
export async function publishLiveChatVideoDelete(input: LiveChatVideoDeleteInput): Promise<LiveChatVideoDeleteResult> {
  const room = input.room || LIVE_CHAT_ROOM_DEFAULT;
  const payload = {
    action: 'delete',
    roomId: room,
    room,
    id: input.id,
    commentId: input.id,
    userId: input.userId,
    name: input.name ?? null,
    username: input.username ?? null,
    avatarUrl: input.avatarUrl ?? null,
    text: LIVE_CHAT_ROUND_GONE,
    body: LIVE_CHAT_ROUND_GONE,
    imageUrl: null,
    mediaUrl: null,
    videoUrl: null,
    voiceUrl: null,
    voiceDuration: null,
    createdAt: input.createdAt || Date.now(),
    editCount: 99,
    edited: true,
    deleted: true,
    mediaType: 'deleted',
    kind: 'delete',
    noStory: 1,
    destination: 'live-chat',
    liveChatVideo: 1,
  };

  const paths = [
    '/api/live-chat',
    `/api/live-chat?room=${encodeURIComponent(room)}`,
    '/api/public-chat',
    '/api/room/message',
  ];
  let ok = false;
  let lastErr = '';
  for (const path of paths) {
    try {
      const r = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (r.ok) { ok = true; break; }
      lastErr = `${path} ${r.status}`;
    } catch (e: any) {
      lastErr = String(e?.message || e);
    }
  }

  // Best-effort file cleanup (never stories)
  const url = String(input.mediaUrl || '');
  if (url && !/^(blob:|data:)/i.test(url)) {
    for (const delPath of ['/api/upload', '/api/live-chat/media', '/api/files/upload']) {
      try {
        await fetch(delPath, {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, id: input.id, noStory: 1 }),
        });
      } catch { /* */ }
    }
  }

  broadcastLiveChatVideoDeleted(input.id, input.userId);
  return { ok, err: ok ? '' : (lastErr || 'delete post failed') };
}

/** Apply tombstone onto a local comments list (clear media, mark gone). */
export function applyLiveChatVideoTombstone<T extends {
  id: string;
  text: string;
  imageUrl?: string | null;
  editCount?: number;
}>(list: T[], id: string): T[] {
  return list.map(row => {
    if (row.id !== id) return row;
    return {
      ...row,
      text: LIVE_CHAT_ROUND_GONE,
      imageUrl: null,
      editCount: Math.max(row.editCount || 0, 99),
    };
  });
}
