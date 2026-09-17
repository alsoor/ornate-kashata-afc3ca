// POST /api/secret-chat/join — join a secret chat by PIN
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import bcrypt from 'bcryptjs';
import { queryRows } from '../_helpers.js';

export default async function handler(req: Request, res: Response) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
  if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });
  const userId = session.user.id;
  const userName = session.user.name ?? session.user.email ?? 'Someone';

  const { chatId, pin } = req.body as { chatId?: number; pin?: string };
  if (!chatId || !pin) return res.status(400).json({ error: 'chatId and pin required' });

  try {
    const list = await queryRows(sql`SELECT id, pin_hash, name FROM secret_chats WHERE id = ${chatId}`);
    const chat = list[0] as { id: number; pin_hash: string; name: string } | undefined;
    if (!chat) return res.status(404).json({ error: 'Chat not found' });

    const ok = await bcrypt.compare(pin, chat.pin_hash);
    if (!ok) return res.status(403).json({ error: 'Wrong PIN' });

    // Check if already a member
    const existList = await queryRows(sql`
      SELECT 1 FROM secret_chat_members WHERE chat_id = ${chatId} AND user_id = ${userId}
    `);
    const isNew = existList.length === 0;

    await db.execute(sql`INSERT IGNORE INTO secret_chat_members (chat_id, user_id) VALUES (${chatId}, ${userId})`);

    if (isNew) {
      await db.execute(sql`
        INSERT INTO secret_chat_messages (chat_id, sender_id, body, is_system)
        VALUES (${chatId}, ${userId}, ${`${userName} joined the chat`}, 1)
      `);
    }

    res.json({ ok: true, name: chat.name });
  } catch (e) {
    console.error('[secret-chat join]', e);
    res.status(500).json({ error: 'Server error' });
  }
}
