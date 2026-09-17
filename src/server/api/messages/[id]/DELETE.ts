/**
 * DELETE /api/messages/:id — delete a direct message (sender only)
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { messages } from '../../../db/schema.js';
import { getAuth } from '../../../../lib/auth/auth.js';
import { eq, and } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const msgId = parseInt(req.params.id as string, 10);
    if (isNaN(msgId)) return res.status(400).json({ error: 'Invalid message id' });

    const meId = session.user.id;

    await db.delete(messages)
      .where(and(eq(messages.id, msgId), eq(messages.senderId, meId)));

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete message', message: String(err) });
  }
}
