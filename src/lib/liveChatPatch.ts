/**
 * liveChatPatch.ts
 * Drop this file at: src/lib/liveChatPatch.ts  (or @/lib/liveChatPatch)
 *
 * Public LIVE chat shared by every user (friends and non-friends).
 * Client: GET/POST /api/live-chat every 2s + BroadcastChannel.
 * Pair with api-live-chat-route.ts on the server.
 */

export const LIVE_CHAT_ROOM = 'stooorna-live-chat';
export const LIVE_CHAT_STORAGE_KEY = 'stooorna_public_live_comments_v1';
export const LIVE_CHAT_EVENT = 'stooorna:public-live-comments';

export type LiveChatMessage = {
  id: string;
  userId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  text: string;
  imageUrl?: string | null;
  likes: string[];
  createdAt: number;
};

export function loadLiveChatLocal(): LiveChatMessage[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LIVE_CHAT_STORAGE_KEY) || '[]');
    return normalizeLiveChatRows(raw);
  } catch {
    return [];
  }
}

export function saveLiveChatLocal(list: LiveChatMessage[]) {
  try {
    const next = list.slice(-400);
    localStorage.setItem(LIVE_CHAT_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(LIVE_CHAT_EVENT, { detail: { list: next } }));
    try {
      const bc = (window as any).__stooornaLiveChatBc as BroadcastChannel | undefined;
      bc?.postMessage({ list: next });
    } catch { /* */ }
  } catch { /* */ }
}

export function normalizeLiveChatRows(raw: unknown): LiveChatMessage[] {
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? ((raw as any).comments || (raw as any).messages || (raw as any).list || [])
      : [];
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x: any) => x && (x.id || x.text || x.body))
    .map((x: any) => ({
      id: String(x.id || `srv_${x.createdAt || x.at || Date.now()}`),
      userId: String(x.userId || x.senderId || x.fromId || ''),
      name: x.name ?? x.authorName ?? null,
      username: x.username ?? x.authorUsername ?? null,
      avatarUrl: x.avatarUrl ?? x.authorAvatar ?? x.image ?? null,
      text: String(x.text || x.body || '').slice(0, 500),
      imageUrl: x.imageUrl ?? null,
      likes: Array.isArray(x.likes) ? x.likes.map(String) : [],
      createdAt: Number(x.createdAt || x.at || Date.parse(x.created_at || '') || Date.now()),
    }))
    .filter(x => x.text)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-400);
}

export function mergeLiveChatLists(a: LiveChatMessage[], b: LiveChatMessage[]): LiveChatMessage[] {
  const map = new Map<string, LiveChatMessage>();
  for (const row of [...a, ...b]) {
    const prev = map.get(row.id);
    if (!prev || (row.likes?.length || 0) >= (prev.likes?.length || 0)) map.set(row.id, row);
  }
  return [...map.values()].sort((x, y) => x.createdAt - y.createdAt).slice(-400);
}

export function liveChatSignature(list: LiveChatMessage[]): string {
  return list.map(x => `${x.id}:${x.text}:${x.likes.length}`).join('|');
}

export async function fetchLiveChatFromServer(): Promise<LiveChatMessage[] | null> {
  const urls = [
    `/api/live-chat?room=${encodeURIComponent(LIVE_CHAT_ROOM)}`,
    '/api/live-chat',
    `/api/room/messages?id=${encodeURIComponent(LIVE_CHAT_ROOM)}`,
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u, { credentials: 'include', cache: 'no-store' });
      if (!r.ok) continue;
      const d = await r.json();
      return normalizeLiveChatRows(d);
    } catch { /* next */ }
  }
  return null;
}

export async function postLiveChatToServer(row: LiveChatMessage): Promise<boolean> {
  const payload = {
    roomId: LIVE_CHAT_ROOM,
    room: LIVE_CHAT_ROOM,
    id: row.id,
    userId: row.userId,
    name: row.name,
    username: row.username,
    avatarUrl: row.avatarUrl,
    text: row.text,
    body: row.text,
    imageUrl: row.imageUrl || null,
    createdAt: row.createdAt,
  };
  const attempts: Array<() => Promise<Response>> = [
    () => fetch('/api/live-chat', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
    () => fetch('/api/room/message', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  ];
  for (const fn of attempts) {
    try {
      const r = await fn();
      if (r.ok) return true;
    } catch { /* next */ }
  }
  return false;
}

export async function pullLiveChatSilent(): Promise<LiveChatMessage[]> {
  const local = loadLiveChatLocal();
  const remote = await fetchLiveChatFromServer();
  const next = remote ? mergeLiveChatLists(local, remote) : local;
  saveLiveChatLocal(next);
  return next;
}
