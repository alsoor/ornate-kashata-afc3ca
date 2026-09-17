/** PATCH /api/users/me/bio */
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

    const { bio } = req.body as { bio: string };
    if (typeof bio !== 'string') return res.status(400).json({ error: 'bio required' });
    const trimmed = bio.trim().slice(0, 160);

    const existing = await db.select().from(userBio).where(eq(userBio.userId, session.user.id));
    if (existing.length) {
      await db.update(userBio).set({ bio: trimmed }).where(eq(userBio.userId, session.user.id));
    } else {
      await db.insert(userBio).values({ userId: session.user.id, bio: trimmed });
    }
    return res.json({ ok: true, bio: trimmed });
  } catch (e) { return res.status(500).json({ error: String(e) }); }
}
