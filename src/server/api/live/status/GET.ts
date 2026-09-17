/** GET /api/live/status?hostId=X — check if a specific user is live */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { liveSessions } from '../../../db/schema.js';
import { eq, isNull, and } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const hostId = String(req.query.hostId ?? '');
    if (!hostId) return res.status(400).json({ error: 'hostId required' });

    const [session] = await db.select({ id: liveSessions.id, startedAt: liveSessions.startedAt })
      .from(liveSessions)
      .where(and(eq(liveSessions.hostId, hostId), isNull(liveSessions.endedAt)))
      .limit(1);

    return res.json({ live: !!session, sessionId: session?.id ?? null });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
