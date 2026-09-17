/**
 * POST /api/posts/comment-unread
 * Mark comment notifications as read.
 * Body: { ids?: number[] }  — if omitted, marks ALL comment notifications read.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { inAppNotifications } from '../../../db/schema.js';
import { getAuth } from '../../../../lib/auth/auth.js';
import { eq, and, inArray } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const { ids } = req.body as { ids?: number[] };

    if (ids && ids.length > 0) {
      await db
        .update(inAppNotifications)
        .set({ isRead: true })
        .where(
          and(
            eq(inAppNotifications.userId, session.user.id),
            inArray(inAppNotifications.id, ids)
          )
        );
    } else {
      await db
        .update(inAppNotifications)
        .set({ isRead: true })
        .where(
          and(
            eq(inAppNotifications.userId, session.user.id),
            eq(inAppNotifications.type, 'comment')
          )
        );
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
