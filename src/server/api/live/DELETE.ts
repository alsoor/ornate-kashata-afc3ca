/** DELETE /api/live — end the current host's live session */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { liveSessions } from '../../db/schema.js';
import { getAuth } from '../../../lib/auth/auth.js';
import { eq } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headerMap: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headerMap[k] = v;
      else if (Array.isArray(v)) headerMap[k] = v[0] ?? '';
    }
    const session = await auth.api.getSession({ headers: new Headers(headerMap) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    await db.update(liveSessions)
      .set({ endedAt: new Date() })
      .where(eq(liveSessions.hostId, session.user.id));

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}