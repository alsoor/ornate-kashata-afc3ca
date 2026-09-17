/**
 * GET /api/posts/comment-unread
 * Returns unread comment notification counts per post for the current user.
 * Response: { total: number, byPost: Record<string, number>, ids: number[] }
 * The notification url is stored as "/?post=<postId>" so we parse postId from it.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { inAppNotifications } from '../../../db/schema.js';
import { getAuth } from '../../../../lib/auth/auth.js';
import { eq, and } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const rows = await db
      .select()
      .from(inAppNotifications)
      .where(
        and(
          eq(inAppNotifications.userId, session.user.id),
          eq(inAppNotifications.type, 'comment'),
          eq(inAppNotifications.isRead, false)
        )
      );

    // Parse postId from url "/?post=<id>"
    const byPost: Record<string, number> = {};
    for (const r of rows) {
      const match = r.url?.match(/[?&]post=(\d+)/);
      const pid = match ? match[1] : 'unknown';
      byPost[pid] = (byPost[pid] ?? 0) + 1;
    }

    res.json({ total: rows.length, byPost, ids: rows.map(r => r.id) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
