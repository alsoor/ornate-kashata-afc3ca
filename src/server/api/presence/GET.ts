import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { user } from '../../db/schema.js';
import { getAuth } from '../../../lib/auth/auth.js';
import { inArray } from 'drizzle-orm';

const ONLINE_THRESHOLD_MS = 90_000; // 90 seconds — heartbeat is every 30s, give 3× buffer

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const ids = String(req.query.userIds ?? '').split(',').filter(Boolean);
    if (!ids.length) return res.json([]);

    const rows = await db
      .select({ id: user.id, lastSeenAt: user.lastSeenAt })
      .from(user)
      .where(inArray(user.id, ids));

    const now = Date.now();
    const result = rows.map((r) => ({
      userId: r.id,
      online: r.lastSeenAt ? now - new Date(r.lastSeenAt).getTime() < ONLINE_THRESHOLD_MS : false,
      lastSeenAt: r.lastSeenAt,
    }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
