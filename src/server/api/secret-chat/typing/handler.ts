/**
 * GET  /api/secret-chat/typing?chatId=<id>   — get who is typing
 * POST /api/secret-chat/typing?chatId=<id>   — signal I am typing
 *
 * In-memory store: typing expires after 4 seconds.
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../lib/auth/auth.js';

interface TypingEntry { userId: string; name: string; expiresAt: number; }
const store = new Map<number, TypingEntry[]>(); // chatId → entries

function pruneChat(chatId: number) {
  const now = Date.now();
  const entries = (store.get(chatId) ?? []).filter(e => e.expiresAt > now);
  if (entries.length) store.set(chatId, entries);
  else store.delete(chatId);
}

export async function getTyping(req: Request, res: Response) {
  const chatId = parseInt(String(req.query.chatId ?? ''), 10);
  if (!chatId) return res.status(400).json({ error: 'chatId required' });

  const auth = getAuth();
  const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
  const meId = session?.user?.id ?? '';

  pruneChat(chatId);
  const entries = (store.get(chatId) ?? []).filter(e => e.userId !== meId);
  res.json({ typing: entries.map(e => e.name) });
}

export async function postTyping(req: Request, res: Response) {
  const chatId = parseInt(String(req.query.chatId ?? ''), 10);
  if (!chatId) return res.status(400).json({ error: 'chatId required' });

  const auth = getAuth();
  const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
  if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

  const userId = session.user.id;
  const name   = session.user.name ?? session.user.email ?? 'شخص ما';
  const expiresAt = Date.now() + 4000;

  pruneChat(chatId);
  const entries = store.get(chatId) ?? [];
  const idx = entries.findIndex(e => e.userId === userId);
  if (idx >= 0) entries[idx].expiresAt = expiresAt;
  else entries.push({ userId, name, expiresAt });
  store.set(chatId, entries);

  res.json({ ok: true });
}
