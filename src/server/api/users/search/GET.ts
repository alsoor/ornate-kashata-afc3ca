/**
 * GET /api/users/search?q=<query>
 * Search users by username or name (requires auth)
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { user, friends } from '../../../db/schema.js';
import { getAuth } from '../../../../lib/auth/auth.js';
import { like, or, ne, eq, and } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const q = ((req.query.q as string) || '').trim();
    if (!q || q.length < 2) return res.json([]);

    const meId = session.user.id;
    const pattern = `%${q}%`;

    const users = await db
      .select({ id: user.id, name: user.name, username: user.username, email: user.email, avatarUrl: user.avatarUrl })
      .from(user)
      .where(
        and(
          ne(user.id, meId),
          or(like(user.username, pattern), like(user.name, pattern)),
        ),
      )
      .limit(15);

    // Attach friendship status
    const withStatus = await Promise.all(
      users.map(async (u) => {
        const [rel] = await db
          .select({ status: friends.status, requesterId: friends.requesterId })
          .from(friends)
          .where(
            or(
              and(eq(friends.requesterId, meId), eq(friends.addresseeId, u.id)),
              and(eq(friends.requesterId, u.id), eq(friends.addresseeId, meId)),
            ),
          )
          .limit(1);
        return { ...u, friendStatus: rel?.status ?? null, iRequested: rel?.requesterId === meId };
      }),
    );

    res.json(withStatus);
  } catch (error) {
    res.status(500).json({ error: 'Search failed', message: String(error) });
  }
}
