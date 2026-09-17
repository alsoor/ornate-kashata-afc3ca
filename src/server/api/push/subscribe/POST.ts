/** POST /api/push/subscribe — save a push subscription for the current user */
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

    const { endpoint, keys } = req.body as { endpoint: string; keys: { p256dh: string; auth: string } };
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }

    // Upsert: delete old same-endpoint, then insert
    await db.delete(pushSubscriptions).where(
      and(eq(pushSubscriptions.userId, session.user.id), eq(pushSubscriptions.endpoint, endpoint))
    );
    await db.insert(pushSubscriptions).values({
      userId:   session.user.id,
      endpoint,
      p256dh:   keys.p256dh,
      auth:     keys.auth,
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
