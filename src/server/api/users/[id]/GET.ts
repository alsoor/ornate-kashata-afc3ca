/** GET /api/users/:id — get public profile of a user (name, avatar, bio, online status) */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { user, userBio } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

const ONLINE_THRESHOLD_MS = 60_000; // 60 seconds

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const targetId = req.params.id as string;
    const rows = await db
      .select({
        id: user.id,
        name: user.name,
        username: user.username,
        image: user.image,
        avatarUrl: user.avatarUrl,
        lastSeenAt: user.lastSeenAt,
      })
      .from(user)
      .where(eq(user.id, targetId));

    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const u = rows[0];

    // Fetch bio
    const [bioRow] = await db
      .select({ bio: userBio.bio })
      .from(userBio)
      .where(eq(userBio.userId, targetId));

    const now = Date.now();
    const online = u.lastSeenAt
      ? now - new Date(u.lastSeenAt).getTime() < ONLINE_THRESHOLD_MS
      : false;

    return res.json({
      id: u.id,
      name: u.name,
      username: u.username,
      avatarUrl: u.avatarUrl ?? u.image ?? null,
      bio: bioRow?.bio ?? null,
      online,
      lastSeenAt: u.lastSeenAt ?? null,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
