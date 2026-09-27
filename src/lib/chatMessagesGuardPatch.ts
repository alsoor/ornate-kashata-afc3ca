/**
 * chatMessagesGuardPatch.ts
 * Independent chat message guard — keeps every sent text/image/file in the chat.
 * Survives fetch polls, status changes, leave/return. Linked from chat.tsx only.
 */
export type GuardedMsg = {
  id: number;
  senderId: string;
  type: string;
  body: string | null;
  duration?: number | null;
  createdAt?: string | null;
  read?: boolean;
  readAt?: string | null;
  delivered?: boolean;
  senderName?: string | null;
  senderUsername?: string | null;
  senderAvatarUrl?: string | null;
  isSystem?: boolean;
  isStreak?: boolean;
  [k: string]: unknown;
};

const STORE_PREFIX = 'stooorna_chat_guard_v2_';
const MAX_MSGS = 120;

function safeKey(parts: {
  userId?: string | null;
  peerId?: string | null;
  scChatId?: number | string | null;
  groupId?: string | null;
  peerUsername?: string | null;
  peerName?: string | null;
  isGroup?: boolean;
}): string {
  const uid = String(parts.userId || 'anon');
  const other = parts.isGroup
    ? `g_${parts.groupId || 'x'}`
    : String(parts.scChatId || '').trim()
      ? `sc_${parts.scChatId}`
      : (String(parts.peerId || '').trim()
        || String(parts.peerUsername || '').trim()
        || String(parts.peerName || '').trim()
        || 'direct');
  return `${STORE_PREFIX}${uid}_${other}`;
}

function isPlayableBody(body: unknown): boolean {
  const s = String(body || '').trim();
  if (!s) return false;
  if (/airo-assets/i.test(s)) return false;
  return (
    s.startsWith('data:image') ||
    s.startsWith('data:video') ||
    s.startsWith('blob:') ||
    s.startsWith('http://') ||
    s.startsWith('https://') ||
    s.startsWith('/')
  );
}

function loadRaw(key: string): GuardedMsg[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((m: any) => m && typeof m === 'object') as GuardedMsg[];
  } catch {
    return [];
  }
}

function saveRaw(key: string, list: GuardedMsg[]) {
  try {
    const slim = list.slice(-MAX_MSGS);
    localStorage.setItem(key, JSON.stringify(slim));
  } catch {
    try {
      // quota: drop oldest non-image first, then truncate data URLs
      const lighter = list.slice(-40).map(m => {
        const body = String(m.body || '');
        if (body.startsWith('data:') && body.length > 80_000) {
          return { ...m, body: body.slice(0, 100) };
        }
        return m;
      });
      localStorage.setItem(key, JSON.stringify(lighter));
    } catch {
      /* give up */
    }
  }
}

/** Merge server list + local guard store. Never drop local playable media. */
export function guardMergeMessages(
  keyParts: Parameters<typeof safeKey>[0],
  serverMsgs: GuardedMsg[],
  prev: GuardedMsg[],
): GuardedMsg[] {
  const key = safeKey(keyParts);
  const stored = loadRaw(key);

  const byId = new Map<number, GuardedMsg>();

  // 1) stored (persistent)
  for (const m of stored) {
    if (typeof m.id === 'number') byId.set(m.id, m);
  }
  // 2) previous UI state
  for (const m of prev) {
    if (typeof m.id === 'number') {
      const cur = byId.get(m.id);
      if (!cur || isPlayableBody(m.body)) byId.set(m.id, { ...cur, ...m });
      else byId.set(m.id, { ...m, ...cur, body: isPlayableBody(cur.body) ? cur.body : m.body });
    }
  }
  // 3) server — fill gaps, never overwrite good local body with empty/broken
  for (const m of serverMsgs) {
    if (typeof m.id !== 'number') continue;
    const cur = byId.get(m.id);
    if (!cur) {
      byId.set(m.id, m);
      continue;
    }
    const serverOk = isPlayableBody(m.body);
    const localOk = isPlayableBody(cur.body);
    if (serverOk) {
      byId.set(m.id, { ...cur, ...m, body: m.body });
    } else if (localOk) {
      byId.set(m.id, { ...m, ...cur, body: cur.body, type: cur.type || m.type });
    } else {
      byId.set(m.id, { ...cur, ...m });
    }
  }

  // 4) Keep negative-id local temps that are still playable and not represented by server body match
  for (const m of [...prev, ...stored]) {
    if (typeof m.id !== 'number' || m.id >= 0) continue;
    if (!isPlayableBody(m.body)) continue;
    const sameBody = Array.from(byId.values()).some(
      x => isPlayableBody(x.body) && String(x.body) === String(m.body) && x.senderId === m.senderId,
    );
    if (!sameBody && !byId.has(m.id)) byId.set(m.id, m);
  }

  const out = Array.from(byId.values()).sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ta - tb;
  });

  // Never return empty if we had local content
  if (out.length === 0 && (prev.length > 0 || stored.length > 0)) {
    const fallback = prev.length ? prev : stored;
    saveRaw(key, fallback);
    return fallback;
  }

  saveRaw(key, out);
  return out;
}

/** Pin a newly sent local message (image/text) into the guard store. */
export function guardPinMessage(
  keyParts: Parameters<typeof safeKey>[0],
  msg: GuardedMsg,
): void {
  const key = safeKey(keyParts);
  const list = loadRaw(key);
  const i = list.findIndex(m => m.id === msg.id);
  if (i >= 0) list[i] = { ...list[i], ...msg };
  else list.push(msg);
  saveRaw(key, list);
}

/** Load all guarded messages for this chat. */
export function guardLoadMessages(keyParts: Parameters<typeof safeKey>[0]): GuardedMsg[] {
  return loadRaw(safeKey(keyParts));
}

/** Clear only when user explicitly clears history. */
export function guardClearMessages(keyParts: Parameters<typeof safeKey>[0]): void {
  try {
    localStorage.removeItem(safeKey(keyParts));
  } catch {
    /* */
  }
}

export function guardStorageKey(keyParts: Parameters<typeof safeKey>[0]): string {
  return safeKey(keyParts);
}
