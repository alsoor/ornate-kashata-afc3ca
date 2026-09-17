// GET /api/secret-chat/messages?chatId=X
import type { Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { queryRows } from '../_helpers.js';

export default async function handler(req: Request, res: Response) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
  if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });
  const userId = session.user.id;
  const chatId = Number(req.query.chatId);
  if (!chatId) return res.status(400).json({ error: 'chatId required' });

  try {
    const memList = await queryRows(sql`
      SELECT 1 FROM secret_chat_members WHERE chat_id = ${chatId} AND user_id = ${userId}
    `);
    if (!memList.length) return res.status(403).json({ error: 'Not a member' });

    const rows = await queryRows(sql`
      SELECT m.id, m.sender_id, m.body, m.is_system, m.created_at,
             COALESCE(m.type, 'text') AS type,
             m.duration,
             m.is_streak, m.streak_opened_at, m.streak_duration, m.streak_media_type,
             u.name AS sender_name, u.username AS sender_username, u.avatar_url AS sender_avatar_url
      FROM secret_chat_messages m
      LEFT JOIN user u ON u.id = m.sender_id
      WHERE m.chat_id = ${chatId}
      ORDER BY m.created_at ASC
      LIMIT 200
    `);
    res.json(rows);
  } catch (e) {
    console.error('[secret-chat messages GET]', e);
    res.status(500).json({ error: 'Server error' });
  }
}
