/**
 * Shared helpers for voice live (/live) and camera live (/live-camera).
 * English-only. Used for presence, top notifications, chat payloads, end-room UX.
 */

export type LiveKind = 'voice' | 'camera';

export type LiveChatMsg = {
  id: string;
  uid: number;
  userId?: string;
  name: string;
  text: string;
  at: number;
  isMe?: boolean;
};

export const LIVE_CHAT_MAX = 80;
export const LIVE_CHAT_TEXT_MAX = 200;

export function liveActiveStorageKey(hostId: string, kind: LiveKind): string {
  return kind === 'camera'
    ? `stooorna_livecam_active_${hostId}`
    : `stooorna_live_active_${hostId}`;
}

export function liveActiveEventName(kind: LiveKind): string {
  return kind === 'camera' ? 'stooorna:livecam-active' : 'stooorna:live-active';
}

export function publishLiveActive(opts: {
  hostId: string;
  kind: LiveKind;
  active: boolean;
  channel?: string;
  hostName?: string | null;
  hostUsername?: string | null;
  hostAvatar?: string | null;
}) {
  const {
    hostId,
    kind,
    active,
    channel,
    hostName,
    hostUsername,
    hostAvatar,
  } = opts;
  if (!hostId) return;
  const payload = JSON.stringify({
    hostId,
    kind,
    channel: channel || null,
    at: Date.now(),
    active,
    name: hostName ?? null,
    username: hostUsername ?? null,
    avatarUrl: hostAvatar ?? null,
  });
  try {
    const key = liveActiveStorageKey(hostId, kind);
    if (active) localStorage.setItem(key, payload);
    else localStorage.removeItem(key);
    localStorage.setItem(
      kind === 'camera' ? 'stooorna_livecam_active_current' : 'stooorna_live_active_current',
      active ? payload : '',
    );
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(
      new CustomEvent(liveActiveEventName(kind), {
        detail: {
          hostId,
          active,
          kind,
          channel: channel || null,
          hostName: hostName ?? null,
          hostUsername: hostUsername ?? null,
          hostAvatar: hostAvatar ?? null,
        },
      }),
    );
  } catch {
    /* ignore */
  }
  // Unified banner event for app shell (top notification)
  try {
    window.dispatchEvent(
      new CustomEvent('stooorna:live-banner', {
        detail: {
          hostId,
          active,
          kind,
          hostName: hostName ?? 'User',
          hostUsername: hostUsername ?? null,
          hostAvatar: hostAvatar ?? null,
          channel: channel || null,
          message: active
            ? kind === 'camera'
              ? `${hostName || 'User'} started a video live`
              : `${hostName || 'User'} started a voice live`
            : kind === 'camera'
              ? 'Video live has ended'
              : 'Voice live has ended',
        },
      }),
    );
  } catch {
    /* ignore */
  }
}

export function makeChatPayload(opts: {
  uid: number;
  userId?: string;
  name: string;
  text: string;
}): { t: 'chat'; uid: number; userId?: string; name: string; text: string; at: number; id: string } {
  const text = String(opts.text || '').trim().slice(0, LIVE_CHAT_TEXT_MAX);
  return {
    t: 'chat',
    uid: opts.uid,
    userId: opts.userId,
    name: opts.name || 'User',
    text,
    at: Date.now(),
    id: `c_${opts.uid}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  };
}

export function parseIncomingChat(msg: any): LiveChatMsg | null {
  if (!msg || msg.t !== 'chat') return null;
  const text = String(msg.text || '').trim();
  if (!text) return null;
  return {
    id: String(msg.id || `c_${msg.uid}_${msg.at || Date.now()}`),
    uid: Number(msg.uid) || 0,
    userId: msg.userId ? String(msg.userId) : undefined,
    name: String(msg.name || 'User'),
    text: text.slice(0, LIVE_CHAT_TEXT_MAX),
    at: Number(msg.at) || Date.now(),
  };
}

export const LIVE_ENDED_TITLE = 'Live ended';
export const LIVE_ENDED_BODY =
  'The host closed this broadcast. You have been removed from the room.';
export const LIVE_ENDED_HINT = 'You can return to the profile or home feed.';

/** Optional UI helper for profile: treat host as online while live is active. */
export function isHostLiveOnline(hostId: string): { online: boolean; kind: LiveKind | null } {
  if (!hostId || typeof window === 'undefined') return { online: false, kind: null };
  try {
    for (const kind of ['camera', 'voice'] as LiveKind[]) {
      const raw = localStorage.getItem(liveActiveStorageKey(hostId, kind));
      if (!raw) continue;
      const d = JSON.parse(raw) as { active?: boolean; at?: number };
      if (d?.active && d.at && Date.now() - d.at < 60_000) {
        return { online: true, kind };
      }
    }
  } catch {
    /* ignore */
  }
  return { online: false, kind: null };
}
