import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { recordings } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const rows = await db
      .select()
      .from(recordings)
      .where(eq(recordings.userId, session.user.id))
      .orderBy(desc(recordings.createdAt));
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch recordings', message: String(error) });
  }
}
