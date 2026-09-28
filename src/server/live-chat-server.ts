/**
 * Vite / custom server handler for public LIVE chat.
 * Put this file at:  src/server/live-chat.ts
 * Then register it in your server router (src/server or src/routes).
 *
 * Endpoints:
 *   GET  /api/live-chat
 *   POST /api/live-chat
 */

import { promises as fs } from 'fs';
import path from 'path';

type LiveChatMessage = {
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

const FILE = path.join(process.cwd(), 'data', 'live-chat.json');
const MAX = 400;
const g = globalThis as unknown as { __stooornaLiveChat?: LiveChatMessage[] };

async function readAll(): Promise<LiveChatMessage[]> {
  if (Array.isArray(g.__stooornaLiveChat) && g.__stooornaLiveChat.length) return g.__stooornaLiveChat;
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed?.comments || [];
    g.__stooornaLiveChat = list;
    return list;
  } catch {
    g.__stooornaLiveChat = g.__stooornaLiveChat || [];
    return g.__stooornaLiveChat;
  }
}

async function writeAll(list: LiveChatMessage[]) {
  const next = list.slice(-MAX);
  g.__stooornaLiveChat = next;
  try {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(next), 'utf8');
  } catch { /* memory still shared in this process */ }
  return next;
}

function normalize(body: any): LiveChatMessage | null {
  const text = String(body?.text || body?.body || '').trim().slice(0, 500);
  if (!text) return null;
  return {
    id: String(body?.id || `lc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    userId: String(body?.userId || body?.senderId || ''),
    name: body?.name ?? null,
    username: body?.username ?? null,
    avatarUrl: body?.avatarUrl ?? null,
    text,
    imageUrl: body?.imageUrl ?? null,
    likes: Array.isArray(body?.likes) ? body.likes.map(String) : [],
    createdAt: Number(body?.createdAt) || Date.now(),
  };
}

/** Express / Connect style */
export async function liveChatGet(_req: any, res: any) {
  const comments = await readAll();
  res.setHeader?.('Cache-Control', 'no-store');
  res.json?.({ ok: true, comments, messages: comments, list: comments });
}

export async function liveChatPost(req: any, res: any) {
  const row = normalize(req.body || {});
  if (!row) {
    res.status?.(400);
    return res.json?.({ ok: false, error: 'empty' });
  }
  const cur = await readAll();
  const exists = cur.some(x => x.id === row.id);
  const next = exists ? cur.map(x => (x.id === row.id ? { ...x, ...row } : x)) : [...cur, row];
  const comments = await writeAll(next);
  res.json?.({ ok: true, comments, messages: comments });
}

/** Call this once when the server starts. */
export function registerLiveChatRoutes(app: any) {
  app.get('/api/live-chat', liveChatGet);
  app.post('/api/live-chat', liveChatPost);
}
