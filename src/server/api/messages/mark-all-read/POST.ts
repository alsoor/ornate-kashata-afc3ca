/**
 * POST /api/messages/mark-all-read
 * Marks ALL old DM messages as read for the current user.
 * Used to clear stale badges from the old messages system.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { messages } from '../../../db/schema.js';
import { getAuth } from '../../../../lib/auth/auth.js';
import { eq, and, isNull } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    await db
      .update(messages)
      .set({ readAt: new Date() })
      .where(and(eq(messages.receiverId, session.user.id), isNull(messages.readAt)));

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
