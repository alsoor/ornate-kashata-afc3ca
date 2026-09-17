// DELETE /api/secret-chat/message/:id — delete a single secret chat message
// Any member of the chat can delete any message (local delete — removes from DB for everyone)
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

  const msgId = parseInt(req.params.id as string, 10);
  if (isNaN(msgId)) return res.status(400).json({ error: 'Invalid message id' });

  try {
    // Verify the message exists and the requester is a member of that chat
    const rows = await queryRows(sql`
      SELECT m.id, m.chat_id
      FROM secret_chat_messages m
      INNER JOIN secret_chat_members mem ON mem.chat_id = m.chat_id AND mem.user_id = ${userId}
      WHERE m.id = ${msgId}
      LIMIT 1
    `);

    if (!rows.length) {
      return res.status(404).json({ error: 'Message not found or not a member' });
    }

    await db.execute(sql`DELETE FROM secret_chat_messages WHERE id = ${msgId}`);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[secret-chat message DELETE]', e);
    return res.status(500).json({ error: 'Server error', detail: String(e) });
  }
}
