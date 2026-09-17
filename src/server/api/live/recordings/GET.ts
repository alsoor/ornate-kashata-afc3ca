/**
 * GET /api/live/recordings
 * Returns the current user's past live session recordings (with videoUrl).
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { liveSessions } from '../../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  const auth = getAuth();
  const headerMap: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headerMap[k] = v;
    else if (Array.isArray(v)) headerMap[k] = v[0] ?? '';
  }
  const session = await auth.api.getSession({ headers: new Headers(headerMap) });
  if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const rows = await db
      .select()
      .from(liveSessions)
      .where(eq(liveSessions.hostId, session.user.id))
      .orderBy(desc(liveSessions.startedAt))
      .limit(50);

    return res.json(rows);
  } catch (err) {
    console.error('GET /api/live/recordings error:', err);
    return res.status(500).json({ error: 'Failed to fetch recordings' });
  }
}
