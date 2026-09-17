/** GET /api/users/me/bio */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { userBio } from '../../../../db/schema.js';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { eq } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const rows = await db.select().from(userBio).where(eq(userBio.userId, session.user.id));
    return res.json({ bio: rows[0]?.bio ?? '' });
  } catch (e) { return res.status(500).json({ error: String(e) }); }
}
