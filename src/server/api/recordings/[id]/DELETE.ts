import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { recordings } from '../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    await db.delete(recordings).where(
      and(eq(recordings.id, id), eq(recordings.userId, session.user.id))
    );
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete recording', message: String(error) });
  }
}
