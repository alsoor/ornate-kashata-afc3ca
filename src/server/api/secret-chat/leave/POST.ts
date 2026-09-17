// POST /api/secret-chat/leave — leave a secret chat
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
  const userName = session.user.name ?? session.user.email ?? 'Someone';

  const { chatId } = req.body as { chatId?: number };
  if (!chatId) return res.status(400).json({ error: 'chatId required' });

  try {
    const memList = await queryRows(sql`
      SELECT 1 FROM secret_chat_members WHERE chat_id = ${chatId} AND user_id = ${userId}
    `);
    if (!memList.length) return res.status(403).json({ error: 'Not a member' });

    // System message then remove
    await db.execute(sql`
      INSERT INTO secret_chat_messages (chat_id, sender_id, body, is_system)
      VALUES (${chatId}, ${userId}, ${`${userName} left the chat`}, 1)
    `);
    await db.execute(sql`
      DELETE FROM secret_chat_members WHERE chat_id = ${chatId} AND user_id = ${userId}
    `);

    res.json({ ok: true });
  } catch (e) {
    console.error('[secret-chat leave]', e);
    res.status(500).json({ error: 'Server error' });
  }
}
