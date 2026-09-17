/** GET /api/notifications — list in-app notifications for current user */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { inAppNotifications } from '../../db/schema.js';
import { getAuth } from '../../../lib/auth/auth.js';
import { eq, desc } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const rows = await db
      .select()
      .from(inAppNotifications)
      .where(eq(inAppNotifications.userId, session.user.id))
      .orderBy(desc(inAppNotifications.createdAt))
      .limit(50);

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
