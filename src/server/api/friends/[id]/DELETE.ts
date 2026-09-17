/**
 * DELETE /api/friends/:id
 * Removes a friendship (both directions) — works whether the current user
 * was the requester or the addressee.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { friends } from '../../../db/schema.js';
import { getAuth } from '../../../../lib/auth/auth.js';
import { eq, and, or } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const meId = session.user.id;
    // friendId here is the OTHER user's userId (not the row id)
    const otherUserId = req.params.id as string;

    // Delete the friendship row regardless of who sent the request
    await db
      .delete(friends)
      .where(
        and(
          or(
            and(eq(friends.requesterId, meId), eq(friends.addresseeId, otherUserId)),
            and(eq(friends.requesterId, otherUserId), eq(friends.addresseeId, meId)),
          ),
        ),
      );

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove friend', message: String(error) });
  }
}
