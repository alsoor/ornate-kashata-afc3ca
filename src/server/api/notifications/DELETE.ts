/** DELETE /api/notifications — حذف إشعار واحد أو كل الإشعارات */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { inAppNotifications } from '../../db/schema.js';
import { getAuth } from '../../../lib/auth/auth.js';
import { eq, and } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: req.headers as any });
    if (!session?.user?.id) return res.status(401).json({ error: 'Unauthorized' });

    const userId = session.user.id;
    const { id } = req.body as { id?: number };

    if (id) {
      // حذف إشعار واحد
      await db.delete(inAppNotifications)
        .where(and(eq(inAppNotifications.id, id), eq(inAppNotifications.userId, userId)));
    } else {
      // حذف كل الإشعارات
      await db.delete(inAppNotifications)
        .where(eq(inAppNotifications.userId, userId));
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed', message: String(err) });
  }
}
