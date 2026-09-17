// POST /api/secret-chat/verify-pin — verify PIN before opening chat
import type { Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import bcrypt from 'bcryptjs';
import { queryRows } from '../_helpers.js';

export default async function handler(req: Request, res: Response) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
  if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });
  const userId = session.user.id;

  const { chatId, pin } = req.body as { chatId?: number; pin?: string };
  if (!chatId || !pin) return res.status(400).json({ error: 'chatId and pin required' });

  try {
    const memList = await queryRows(sql`
      SELECT 1 FROM secret_chat_members WHERE chat_id = ${chatId} AND user_id = ${userId}
    `);
    if (!memList.length) return res.status(403).json({ error: 'Not a member' });

    const list = await queryRows(sql`SELECT pin_hash FROM secret_chats WHERE id = ${chatId}`);
    const chat = list[0] as { pin_hash: string } | undefined;
    if (!chat) return res.status(404).json({ error: 'Not found' });

    const ok = await bcrypt.compare(pin, chat.pin_hash);
    res.json({ ok });
  } catch (e) {
    console.error('[secret-chat verify-pin]', e);
    res.status(500).json({ error: 'Server error' });
  }
}
