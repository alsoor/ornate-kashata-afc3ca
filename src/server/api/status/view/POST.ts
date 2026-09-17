// POST /api/status/view — mark a status as viewed by the current user
import type { Request, Response } from 'express';
import { getAuth } from '../../../../lib/auth/auth.js';
import { db } from '../../../db/client.js';
import { statusViews } from '../../../db/schema.js';
import { and, eq } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const { statusId } = req.body as { statusId?: number };
    if (!statusId) return res.status(400).json({ error: 'statusId required' });

    const viewerId = session.user.id;

    // Upsert — ignore if already viewed
    const existing = await db.select().from(statusViews)
      .where(and(eq(statusViews.statusId, statusId), eq(statusViews.viewerId, viewerId)));

    if (!existing.length) {
      await db.insert(statusViews).values({ statusId, viewerId });
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error('[POST /api/status/view]', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
