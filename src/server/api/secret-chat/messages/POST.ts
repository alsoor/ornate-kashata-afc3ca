// POST /api/secret-chat/messages — send a message
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

  const { chatId, body, type, duration } = req.body as {
    chatId?: number; body?: string; type?: string; duration?: number;
  };
  if (!chatId || !body?.trim()) return res.status(400).json({ error: 'chatId and body required' });

  // ── دعم رسائل المكالمة — type:'call' يخزّن حالة المكالمة (answered/missed/
  //    declined) بعمود body نفسه، والمدة بعمود duration الموجود أصلاً لغير
  //    شي. أي شي غير هذا (النمط القديم) يشتغل بالضبط زي ما كان. ──
  const isCall = type === 'call';
  const msgBody = body.trim();
  if (isCall && !['answered', 'missed', 'declined'].includes(msgBody)) {
    return res.status(400).json({ error: 'Invalid call status' });
  }
  const dur = isCall && msgBody === 'answered' ? Math.max(0, Math.floor(duration ?? 0)) : null;

  try {
    const memList = await queryRows(sql`
      SELECT 1 FROM secret_chat_members WHERE chat_id = ${chatId} AND user_id = ${userId}
    `);
    if (!memList.length) return res.status(403).json({ error: 'Not a member' });

    const result = await db.execute(sql`
      INSERT INTO secret_chat_messages (chat_id, sender_id, body, type, duration)
      VALUES (${chatId}, ${userId}, ${msgBody}, ${isCall ? 'call' : 'text'}, ${dur})
    `);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertId = Number((result as any)[0]?.insertId ?? 0);
    res.status(201).json({ id: insertId });
  } catch (e) {
    console.error('[secret-chat messages POST]', e);
    res.status(500).json({ error: 'Server error' });
  }
}