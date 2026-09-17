/** POST /api/users/block — block or unblock a user */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { userBlocks } from '../../../db/schema.js';
import { getAuth } from '../../../../lib/auth/auth.js';
import { and, eq } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const { targetId, action } = req.body as { targetId: string; action: 'block' | 'unblock' };
    if (!targetId) return res.status(400).json({ error: 'targetId required' });

    if (action === 'block') {
      await db.insert(userBlocks).ignore().values({ blockerId: session.user.id, blockedId: targetId });
    } else {
      await db.delete(userBlocks).where(
        and(eq(userBlocks.blockerId, session.user.id), eq(userBlocks.blockedId, targetId))
      );
    }
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: String(e) }); }
}
