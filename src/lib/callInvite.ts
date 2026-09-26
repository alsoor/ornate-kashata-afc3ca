type CallInvitePayload = {
  channel: string;
  hostId: string;
  hostName?: string | null;
  hostAvatar?: string | null;
  members?: unknown[];
  video?: boolean;
  kind?: string;
  at?: number;
};

type StoredInvite = {
  payload: CallInvitePayload;
  expiresAt: number;
};

const INVITE_TTL_MS = 45_000;
const invites = new Map<string, StoredInvite>();

function prune() {
  const now = Date.now();
  for (const [uid, row] of invites) {
    if (!row || row.expiresAt <= now) invites.delete(uid);
  }
}

export function setCallInvite(toUserId: string, payload: CallInvitePayload) {
  const uid = String(toUserId || '').trim();
  if (!uid || !payload?.channel) return;
  prune();
  invites.set(uid, {
    payload: { ...payload, at: Number(payload.at) || Date.now() },
    expiresAt: Date.now() + INVITE_TTL_MS,
  });
}

export function getCallInvite(userId: string): CallInvitePayload | null {
  const uid = String(userId || '').trim();
  if (!uid) return null;
  prune();
  const row = invites.get(uid);
  if (!row) return null;
  return row.payload;
}

export function clearCallInvite(userId: string, channel?: string) {
  const uid = String(userId || '').trim();
  if (!uid) return;
  if (!channel) {
    invites.delete(uid);
    return;
  }
  const row = invites.get(uid);
  if (!row) return;
  if (String(row.payload.channel) === String(channel)) invites.delete(uid);
}
