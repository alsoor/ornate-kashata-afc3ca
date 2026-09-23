/**
 * In-memory live GPS pin store (cross-device signaling).
 * TTL 30 minutes. Single process; swap to Redis for multi-instance later.
 */

const TTL_MS = 30 * 60 * 1000;

/** @type {Map<string, any>} */
const pins = new Map();

function prune() {
  const now = Date.now();
  for (const [id, p] of pins) {
    if (!p || now - Number(p.at || 0) > TTL_MS) pins.delete(id);
  }
}

/**
 * @param {object} pin
 */
export function upsertLiveGpsPin(pin) {
  if (!pin || !pin.id) return;
  const id = String(pin.id);
  const at = Date.now();
  pins.set(id, {
    id,
    name: String(pin.name || 'User'),
    username: String(pin.username || '').replace(/^@/, ''),
    avatarUrl: pin.avatarUrl ?? null,
    lat: Number(pin.lat),
    lng: Number(pin.lng),
    at,
  });
}

/**
 * @param {string} userId
 */
export function removeLiveGpsPin(userId) {
  if (!userId) return;
  pins.delete(String(userId));
}

/**
 * @returns {any[]}
 */
export function listLiveGpsPins() {
  prune();
  return Array.from(pins.values()).filter(
    p => p && typeof p.lat === 'number' && typeof p.lng === 'number',
  );
}
