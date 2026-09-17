/** GET /api/friends/requests/count — returns count of pending incoming friend requests */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { friends } from '../../../../db/schema.js';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { and, eq, sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const meId = session.user.id;
    const [row] = await db
      .select({ count: sql<number>`COUNT(*)`.as('count') })
      .from(friends)
      .where(and(eq(friends.addresseeId, meId), eq(friends.status, 'pending')));

    return res.json({ count: Number(row?.count ?? 0) });
  } catch (e) { return res.status(500).json({ error: String(e) }); }
}
