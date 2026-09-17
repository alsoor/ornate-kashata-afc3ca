/**
 * POST /api/messages/:id/open-streak
 * Mark a streak (view-once) message as opened by the recipient.
 * Notifies the sender via WebSocket signaling.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const _auth = getAuth();
    const _headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) { if (typeof v === 'string') _headers[k] = v; }
    const session = await _auth.api.getSession({ headers: new Headers(_headers) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const msgId = Number(req.params.id);
    const userId = session.user.id;
    if (!msgId) return res.status(400).json({ error: 'Invalid id' });

    // Only the receiver can open it; only open once
    const rows = (await db.execute(sql`
      SELECT id, sender_id, receiver_id, is_streak, streak_opened_at
      FROM messages WHERE id = ${msgId}
    `) as unknown as [any[]])[0];

    const msg = rows[0];
    if (!msg) return res.status(404).json({ error: 'Not found' });
    if (msg.receiver_id !== userId) return res.status(403).json({ error: 'Forbidden' });
    if (!msg.is_streak) return res.status(400).json({ error: 'Not a streak' });
    if (msg.streak_opened_at) return res.json({ alreadyOpened: true });

    await db.execute(sql`
      UPDATE messages SET streak_opened_at = NOW() WHERE id = ${msgId}
    `);

    res.json({ ok: true, senderId: msg.sender_id });
  } catch (err) {
    console.error('[POST /api/messages/:id/open-streak]', err);
    res.status(500).json({ error: 'Failed' });
  }
}
