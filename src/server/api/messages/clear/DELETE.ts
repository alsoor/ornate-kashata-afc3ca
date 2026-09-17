/**
 * DELETE /api/messages/clear?with=<userId>
 * Deletes ALL direct messages between the authenticated user and the given peer.
 * Both sides of the conversation are wiped (sender OR receiver).
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { messages } from '../../../db/schema.js';
import { getAuth } from '../../../../lib/auth/auth.js';
import { or, and, eq } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const meId = session.user.id;
    const peerId = (req.query.with ?? req.body?.with) as string | undefined;
    if (!peerId) return res.status(400).json({ error: 'Missing peer user id (?with=)' });

    // Delete every message where (sender=me AND receiver=peer) OR (sender=peer AND receiver=me)
    await db.delete(messages).where(
      or(
        and(eq(messages.senderId, meId),   eq(messages.receiverId, peerId)),
        and(eq(messages.senderId, peerId), eq(messages.receiverId, meId)),
      ),
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[messages/clear]', err);
    return res.status(500).json({ error: 'Failed to clear history', message: String(err) });
  }
}
