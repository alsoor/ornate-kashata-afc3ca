/**
 * PATCH /api/friends/:id
 * Body: { action: 'accept' | 'reject' }
 * Accept or reject an incoming friend request (requires auth)
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { friends } from '../../../db/schema.js';
import { getAuth } from '../../../../lib/auth/auth.js';
import { eq, and } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const meId = session.user.id;
    const friendId = parseInt(req.params.id as string, 10);
    const { action } = req.body as { action: 'accept' | 'reject' };

    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const [row] = await db
      .select()
      .from(friends)
      .where(and(eq(friends.id, friendId), eq(friends.addresseeId, meId)))
      .limit(1);

    if (!row) return res.status(404).json({ error: 'Request not found' });

    await db
      .update(friends)
      .set({ status: action === 'accept' ? 'accepted' : 'rejected' })
      .where(eq(friends.id, friendId));

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update request', message: String(error) });
  }
}
