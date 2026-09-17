/** DELETE /api/push/subscribe — remove push subscription */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { pushSubscriptions } from '../../../db/schema.js';
import { getAuth } from '../../../../lib/auth/auth.js';
import { eq, and } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const { endpoint } = req.body as { endpoint?: string };
    if (endpoint) {
      await db.delete(pushSubscriptions).where(
        and(eq(pushSubscriptions.userId, session.user.id), eq(pushSubscriptions.endpoint, endpoint))
      );
    } else {
      // Remove all for this user
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, session.user.id));
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
