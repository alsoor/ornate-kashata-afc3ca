/** GET /api/users/blocks — list users I've blocked */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { userBlocks, user } from '../../../db/schema.js';
import { getAuth } from '../../../../lib/auth/auth.js';
import { eq } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const rows = await db
      .select({ id: user.id, name: user.name, username: user.username, avatarUrl: user.avatarUrl, image: user.image })
      .from(userBlocks)
      .leftJoin(user, eq(user.id, userBlocks.blockedId))
      .where(eq(userBlocks.blockerId, session.user.id));

    return res.json(rows.map(r => ({ ...r, avatarUrl: r.avatarUrl ?? r.image ?? null, image: undefined })));
  } catch (e) { return res.status(500).json({ error: String(e) }); }
}
