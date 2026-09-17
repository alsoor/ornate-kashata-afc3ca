/** GET /api/users/me — return current user's fresh data from DB (avatarUrl, username, bio) */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { user, userBio } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const meId = session.user.id;

    const [row] = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        avatarUrl: user.avatarUrl,
        coverUrl: user.coverUrl,
        image: user.image,
        phoneNumber: user.phoneNumber,
        lastSeenAt: user.lastSeenAt,
      })
      .from(user)
      .where(eq(user.id, meId));

    if (!row) return res.status(404).json({ error: 'User not found' });

    const [bioRow] = await db
      .select({ bio: userBio.bio })
      .from(userBio)
      .where(eq(userBio.userId, meId));

    return res.json({
      id: row.id,
      name: row.name,
      email: row.email,
      username: row.username,
      avatarUrl: row.avatarUrl ?? row.image ?? null,
      coverUrl: row.coverUrl ?? null,
      phoneNumber: row.phoneNumber ?? null,
      bio: bioRow?.bio ?? null,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
