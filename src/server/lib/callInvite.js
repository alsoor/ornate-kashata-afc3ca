/**
 * In-memory call-invite signaling.
 * Keys: invitee userId -> latest invite payload.
 * TTL: 45 seconds (matches client ring window).
 *
 * Note: works on a single server process. For multi-instance, swap to Redis later.
 */

const TTL_MS = 45_000;

/** @type {Map<string, { payload: any, expiresAt: number }>} */
const invites = new Map();

function prune() {
  const now = Date.now();
  for (const [k, v] of invites) {
    if (v.expiresAt <= now) invites.delete(k);
  }
}

/**
 * @param {string} toUserId
 * @param {object} payload
 */
export function setCallInvite(toUserId, payload) {
  if (!toUserId) return;
  prune();
  invites.set(String(toUserId), {
    payload: { ...payload, at: Number(payload.at) || Date.now() },
    expiresAt: Date.now() + TTL_MS,
  });
}

/**
 * @param {string} toUserId
 * @returns {object | null}
 */
export function getCallInvite(toUserId) {
  if (!toUserId) return null;
  prune();
  const row = invites.get(String(toUserId));
  if (!row) return null;
  if (row.expiresAt <= Date.now()) {
    invites.delete(String(toUserId));
    return null;
  }
  return row.payload;
}

/**
 * @param {string} toUserId
 * @param {string} [channel]
 */
export function clearCallInvite(toUserId, channel) {
  if (!toUserId) return;
  const row = invites.get(String(toUserId));
  if (!row) return;
  if (channel && row.payload?.channel && String(row.payload.channel) !== String(channel)) return;
  invites.delete(String(toUserId));
}

export function callInviteTtlMs() {
  return TTL_MS;
}
