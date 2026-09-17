/** POST /api/notifications/read — mark all (or specific id) as read */
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

    const { id } = req.body as { id?: number };
    if (id) {
      await db.update(inAppNotifications)
        .set({ isRead: true })
        .where(and(eq(inAppNotifications.id, id), eq(inAppNotifications.userId, session.user.id)));
    } else {
      await db.update(inAppNotifications)
        .set({ isRead: true })
        .where(eq(inAppNotifications.userId, session.user.id));
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
