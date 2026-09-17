// POST /api/secret-chat/add-member — add a user to a secret chat (must be creator or member)
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { queryRows } from '../_helpers.js';

export default async function handler(req: Request, res: Response) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
  if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });
  const requesterId = session.user.id;

  const { chatId, userId } = req.body as { chatId?: number; userId?: string };
  if (!chatId || !userId) return res.status(400).json({ error: 'chatId and userId required' });

  try {
    const memList = await queryRows(sql`
      SELECT 1 FROM secret_chat_members WHERE chat_id = ${chatId} AND user_id = ${requesterId}
    `);
    if (!memList.length) return res.status(403).json({ error: 'Not a member' });

    await db.execute(sql`INSERT IGNORE INTO secret_chat_members (chat_id, user_id) VALUES (${chatId}, ${userId})`);
    res.json({ ok: true });
  } catch (e) {
    console.error('[secret-chat add-member]', e);
    res.status(500).json({ error: 'Server error' });
  }
}
