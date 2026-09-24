/**
 * homeCallSession.ts
 * Shared signaling + Agora helpers for real 1:1 / small-group voice (and optional video) calls.
 * Used by RootLayout home-call flow. English-only identifiers and comments.
 *
 * Flow:
 *  1) Caller: startInvite -> join Agora channel -> publish mic
 *  2) Callee: only ring when an explicit invite exists (API / localStorage), never from profile-visit alone
 *  3) Callee answer: join same channel, signal answered, UI switches green -> red (end)
 *  4) Either side hang up: signal ended for ALL peers + leave Agora + clear invites
 *  5) Reload: restoreActiveSession can rejoin if a live session key is still fresh
 */

export const AGORA_APP_ID = '149ef04e839c4132a08efb49d717c436';

export type HomeCallMember = {
  id: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  joined?: boolean;
};

export type HomeCallInvite = {
  channel: string;
  hostId: string;
  hostName: string | null;
  hostUsername?: string | null;
  hostAvatar: string | null;
  members: HomeCallMember[];
  at: number;
  video?: boolean;
  inviteeIds?: string[];
  ended?: boolean;
  answered?: boolean;
  clear?: boolean;
};

export type HomeCallEndPayload = {
  channel: string;
  by: string;
  at: number;
};

export type HomeCallAnswerPayload = {
  channel: string;
  by: string;
  at: number;
};

const INVITE_TTL_MS = 55_000;
const END_TTL_MS = 120_000;
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;

export function homeCallShortHash(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
}

export function buildPrivateChannel(userA: string, userB: string): string {
  return `private_${homeCallShortHash([userA, userB].sort().join('_'))}`;
}

export function buildGroupChannel(hostId: string, peerIds: string[]): string {
  return `home_group_${homeCallShortHash([hostId, ...peerIds].sort().join('_'))}`;
}

export function homeInviteKey(channel: string, at?: number | null): string {
  return `${channel}@${Number(at) || 0}`;
}

export function isFreshHomeInvite(raw: { at?: number; ended?: boolean; answered?: boolean } | null | undefined): boolean {
  if (!raw || raw.ended || raw.answered) return false;
  const at = Number(raw.at) || 0;
  if (!at) return false;
  return Date.now() - at < INVITE_TTL_MS;
}

function declinedKey(uid: string): string {
  return `stooorna_home_call_declined_${uid}`;
}

export function loadHomeCallDeclinedMap(uid: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(declinedKey(uid));
    const map = raw ? JSON.parse(raw) : {};
    return map && typeof map === 'object' ? map : {};
  } catch {
    return {};
  }
}

export function markHomeCallDeclined(uid: string, inviteKey: string) {
  try {
    const map = loadHomeCallDeclinedMap(uid);
    map[inviteKey] = Date.now();
    const keys = Object.keys(map);
    if (keys.length > 80) {
      keys
        .sort((a, b) => (map[a] || 0) - (map[b] || 0))
        .slice(0, keys.length - 60)
        .forEach((k) => delete map[k]);
    }
    localStorage.setItem(declinedKey(uid), JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function isHomeCallRecentlyDeclined(uid: string, inviteKey: string): boolean {
  const at = loadHomeCallDeclinedMap(uid)[inviteKey];
  if (!at) return false;
  return Date.now() - at < 10 * 60 * 1000;
}

const ACTIVE_SESSION_KEY = 'stooorna_home_call_live_session';

export type LiveSessionSnapshot = {
  channel: string;
  hostId: string;
  peerId?: string | null;
  peerName?: string | null;
  peerAvatar?: string | null;
  video?: boolean;
  at: number;
  phase: 'connecting' | 'live';
};

export function saveLiveSession(snap: LiveSessionSnapshot) {
  try {
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(snap));
  } catch {
    /* ignore */
  }
}

export function clearLiveSession() {
  try {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function readLiveSession(): LiveSessionSnapshot | null {
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as LiveSessionSnapshot;
    if (!s?.channel || !s.at) return null;
    if (Date.now() - s.at > SESSION_TTL_MS) {
      clearLiveSession();
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

/** Broadcast invite to one peer (local + server). */
export async function signalInvite(toUserId: string, invite: HomeCallInvite): Promise<void> {
  try {
    localStorage.setItem(`stooorna_home_call_invite_${toUserId}`, JSON.stringify(invite));
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(
      'stooorna_home_call_active_invite',
      JSON.stringify({ ...invite, inviteeIds: invite.inviteeIds || [toUserId] }),
    );
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(
      new CustomEvent('stooorna:home-group-call', {
        detail: { ...invite, inviteeIds: invite.inviteeIds || [toUserId] },
      }),
    );
  } catch {
    /* ignore */
  }
  try {
    await fetch('/api/call/invite', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toUserId,
        channel: invite.channel,
        video: !!invite.video,
        kind: invite.video ? 'video' : 'voice',
        hostId: invite.hostId,
        hostName: invite.hostName,
        hostAvatar: invite.hostAvatar,
        members: invite.members,
        at: invite.at,
      }),
    });
  } catch {
    /* ignore */
  }
  // Ring room marker so peer poll can confirm a real invite exists
  try {
    await fetch('/api/room/join', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId: `home_ring_${homeCallShortHash(toUserId)}`,
        userId: invite.hostId,
        name: JSON.stringify({
          channel: invite.channel,
          hostId: invite.hostId,
          hostName: invite.hostName,
          hostAvatar: invite.hostAvatar,
          members: invite.members,
          at: invite.at,
          video: !!invite.video,
        }),
      }),
    });
  } catch {
    /* ignore */
  }
}

/** Peer answered — notify caller and clear ringing UI. */
export async function signalAnswered(channel: string, byUserId: string, hostId?: string | null): Promise<void> {
  const payload: HomeCallAnswerPayload = { channel, by: byUserId, at: Date.now() };
  try {
    localStorage.setItem(`stooorna_call_answered_${channel}`, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent('stooorna:call-answered', { detail: payload }));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new StorageEvent('storage', { key: `stooorna_call_answered_${channel}`, newValue: JSON.stringify(payload) }));
  } catch {
    /* ignore */
  }
  try {
    await fetch('/api/call/invite', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clear: true, toUserId: byUserId, userId: byUserId, channel, answered: true }),
    });
  } catch {
    /* ignore */
  }
  if (hostId) {
    try {
      await fetch('/api/call/invite', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clear: true, toUserId: hostId, userId: hostId, channel, answered: true }),
      });
    } catch {
      /* ignore */
    }
  }
  try {
    localStorage.removeItem(`stooorna_home_call_invite_${byUserId}`);
    localStorage.removeItem('stooorna_home_call_active_invite');
  } catch {
    /* ignore */
  }
}

/**
 * End call for EVERYONE: local events, storage, API clear, room leave.
 * Caller passes peer member ids so invites are wiped on each side.
 */
export async function signalEndedForAll(opts: {
  channel: string;
  byUserId: string;
  peerIds: string[];
  endRoom?: boolean;
}): Promise<void> {
  const { channel, byUserId, peerIds, endRoom = true } = opts;
  const payload: HomeCallEndPayload = { channel, by: byUserId, at: Date.now() };

  try {
    localStorage.setItem(`stooorna_call_ended_${channel}`, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent('stooorna:home-call-ended', { detail: payload }));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new StorageEvent('storage', { key: `stooorna_call_ended_${channel}`, newValue: JSON.stringify(payload) }));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent('stooorna:incoming-call-ui', { detail: { ringing: false } }));
    window.dispatchEvent(new CustomEvent('stooorna:stop-incoming-ring'));
  } catch {
    /* ignore */
  }

  for (const peerId of peerIds) {
    if (!peerId || peerId === byUserId) continue;
    try {
      localStorage.setItem(
        `stooorna_home_call_invite_${peerId}`,
        JSON.stringify({ ended: true, channel, at: payload.at }),
      );
      localStorage.removeItem(`stooorna_home_call_invite_${peerId}`);
    } catch {
      /* ignore */
    }
    try {
      await fetch('/api/call/invite', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clear: true,
          toUserId: peerId,
          userId: peerId,
          channel,
          ended: true,
        }),
      });
    } catch {
      /* ignore */
    }
  }

  try {
    localStorage.removeItem(`stooorna_home_call_invite_${byUserId}`);
    localStorage.removeItem('stooorna_home_call_active_invite');
  } catch {
    /* ignore */
  }

  try {
    await fetch('/api/room/leave', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: channel, userId: byUserId, endRoom }),
    });
  } catch {
    /* ignore */
  }

  // Clear ring markers for each peer
  for (const peerId of peerIds) {
    if (!peerId) continue;
    try {
      await fetch('/api/room/leave', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: `home_ring_${homeCallShortHash(peerId)}`,
          userId: byUserId,
          endRoom: true,
        }),
      });
    } catch {
      /* ignore */
    }
  }

  clearLiveSession();
}

export function isRecentEnd(channel: string): boolean {
  try {
    const raw = localStorage.getItem(`stooorna_call_ended_${channel}`);
    if (!raw) return false;
    const p = JSON.parse(raw) as HomeCallEndPayload;
    if (String(p?.channel || '') !== String(channel)) return false;
    return !!(p.at && Date.now() - Number(p.at) < END_TTL_MS);
  } catch {
    return false;
  }
}

export function isRecentAnswer(channel: string): boolean {
  try {
    const raw = localStorage.getItem(`stooorna_call_answered_${channel}`);
    if (!raw) return false;
    const p = JSON.parse(raw) as HomeCallAnswerPayload;
    if (String(p?.channel || '') !== String(channel)) return false;
    return !!(p.at && Date.now() - Number(p.at) < END_TTL_MS);
  } catch {
    return false;
  }
}

/** Fetch token from backend. */
export async function fetchAgoraToken(
  channel: string,
  userId: string,
): Promise<{ token: string; uid: number; appId?: string }> {
  const r = await fetch(
    `/api/call/token?channel=${encodeURIComponent(channel)}&uid=${encodeURIComponent(userId)}`,
    { credentials: 'include' },
  );
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Agora token failed (${r.status}): ${body || 'check /api/call/token'}`);
  }
  return r.json();
}

/**
 * Join Agora channel, publish mic (and optional camera).
 * Returns client + tracks for the caller to hold in refs.
 */
export async function joinAgoraCall(opts: {
  channel: string;
  userId: string;
  video?: boolean;
  onRemotePublished?: (remoteUser: any, mediaType: string) => void;
  onRemoteLeft?: () => void;
}): Promise<{
  client: any;
  micTrack: any;
  camTrack: any | null;
}> {
  const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
  const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

  client.on('user-published', async (remoteUser: any, mediaType: string) => {
    try {
      await client.subscribe(remoteUser, mediaType);
      if (mediaType === 'audio') remoteUser.audioTrack?.play();
      opts.onRemotePublished?.(remoteUser, mediaType);
    } catch {
      /* ignore */
    }
  });
  client.on('user-unpublished', (remoteUser: any) => {
    try {
      remoteUser.audioTrack?.stop?.();
    } catch {
      /* ignore */
    }
  });
  client.on('user-left', () => {
    try {
      opts.onRemoteLeft?.();
    } catch {
      /* ignore */
    }
  });

  const tokenData = await fetchAgoraToken(opts.channel, opts.userId);
  const appId = tokenData.appId || AGORA_APP_ID;
  await client.join(appId, opts.channel, tokenData.token, tokenData.uid);

  const micTrack = await AgoraRTC.createMicrophoneAudioTrack({ encoderConfig: 'speech_standard' });
  try {
    await micTrack.setMuted(false);
  } catch {
    /* ignore */
  }
  try {
    await micTrack.setEnabled(true);
  } catch {
    /* ignore */
  }

  const tracks: any[] = [micTrack];
  let camTrack: any = null;
  if (opts.video) {
    try {
      camTrack = await AgoraRTC.createCameraVideoTrack();
      tracks.push(camTrack);
    } catch {
      /* camera permission denied */
    }
  }

  await client.publish(tracks);

  await Promise.all(
    (client.remoteUsers || []).map(async (remoteUser: any) => {
      try {
        if (remoteUser.hasAudio) {
          await client.subscribe(remoteUser, 'audio');
          remoteUser.audioTrack?.play();
        }
        if (remoteUser.hasVideo) {
          await client.subscribe(remoteUser, 'video');
        }
      } catch {
        /* ignore */
      }
    }),
  );

  return { client, micTrack, camTrack };
}

export async function leaveAgoraCall(client: any, micTrack: any, camTrack?: any | null): Promise<void> {
  try {
    const tracks = [micTrack, camTrack].filter(Boolean);
    if (tracks.length && client?.unpublish) {
      await client.unpublish(tracks);
    }
  } catch {
    /* ignore */
  }
  try {
    micTrack?.stop?.();
    micTrack?.close?.();
  } catch {
    /* ignore */
  }
  try {
    camTrack?.stop?.();
    camTrack?.close?.();
  } catch {
    /* ignore */
  }
  try {
    await client?.leave?.();
  } catch {
    /* ignore */
  }
}

/**
 * Read invite from local storage for current user only if it is a real, fresh invite.
 * Never invent invites from profile visitors.
 */
export function readExplicitInviteForUser(userId: string): HomeCallInvite | null {
  try {
    const raw = localStorage.getItem(`stooorna_home_call_invite_${userId}`);
    if (!raw) return null;
    const inv = JSON.parse(raw) as HomeCallInvite;
    if (!inv?.channel || inv.hostId === userId) return null;
    if (inv.ended || inv.answered || inv.clear) return null;
    if (!isFreshHomeInvite(inv)) return null;
    if (isRecentEnd(inv.channel)) return null;
    if (isHomeCallRecentlyDeclined(userId, homeInviteKey(inv.channel, inv.at))) return null;
    return inv;
  } catch {
    return null;
  }
}

/**
 * Parse ring-room member name JSON written by signalInvite (explicit only).
 */
export function parseRingRoomInvite(nameField: string | null | undefined, myUserId: string): HomeCallInvite | null {
  if (!nameField) return null;
  try {
    const parsed = JSON.parse(nameField) as HomeCallInvite;
    if (!parsed?.channel || !parsed.hostId) return null;
    if (String(parsed.hostId) === String(myUserId)) return null;
    if (parsed.ended || parsed.answered) return null;
    if (!isFreshHomeInvite(parsed)) return null;
    if (isRecentEnd(parsed.channel)) return null;
    return {
      channel: String(parsed.channel),
      hostId: String(parsed.hostId),
      hostName: parsed.hostName ?? null,
      hostUsername: parsed.hostUsername ?? null,
      hostAvatar: parsed.hostAvatar ?? null,
      members: Array.isArray(parsed.members) ? parsed.members : [],
      at: Number(parsed.at) || Date.now(),
      video: !!parsed.video,
    };
  } catch {
    // Legacy: name may be channel id only
    if (nameField.startsWith('private_') || nameField.startsWith('home_group_')) {
      return null; // require structured JSON to avoid false rings
    }
    return null;
  }
}
