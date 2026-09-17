// POST /api/secret-chat/delete — delete a secret chat (creator only)
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { queryRows } from '../_helpers.js';

export default async function handler(req: Request, res: Response) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
  if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });
  const userId = session.user.id;

  const { chatId } = req.body as { chatId?: number };
  if (!chatId) return res.status(400).json({ error: 'chatId required' });

  try {
    const list = await queryRows(sql`
      SELECT id, created_by FROM secret_chats WHERE id = ${chatId}
    `);
    const chat = list[0] as { id: number; created_by: string } | undefined;

    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    if (String(chat.created_by) !== String(userId)) {
      return res.status(403).json({ error: 'Only the creator can delete this chat' });
    }

    await db.execute(sql`DELETE FROM secret_chat_messages WHERE chat_id = ${chatId}`);
    await db.execute(sql`DELETE FROM secret_chat_members WHERE chat_id = ${chatId}`);
    await db.execute(sql`DELETE FROM secret_chats WHERE id = ${chatId}`);

    res.json({ ok: true });
  } catch (e) {
    console.error('[secret-chat delete]', e);
    res.status(500).json({ error: 'Server error', detail: String(e) });
  }
}
