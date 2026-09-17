/**
 * DELETE /api/support/thread?userId=<id>
 * Owner-only: delete all messages between the owner and a support user.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

const OWNER_EMAIL = 'alsoor@mail.com';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    // Only the owner can bulk-delete support threads
    if (session.user.email !== OWNER_EMAIL) return res.status(403).json({ error: 'Forbidden' });

    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const ownerId = session.user.id;

    // Delete all messages between owner and this user (both directions)
    await db.execute(sql`
      DELETE FROM messages
      WHERE (sender_id = ${ownerId} AND receiver_id = ${userId})
         OR (sender_id = ${userId} AND receiver_id = ${ownerId})
    `);

    return res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/support/thread]', err);
    return res.status(500).json({ error: 'Failed to delete thread', message: String(err) });
  }
}
