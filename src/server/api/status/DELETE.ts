/**
 * DELETE /api/status/:id  — delete own status
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../lib/auth/auth.js';
import { db } from '../../db/client.js';
import { statuses } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
 
export default async function handler(req: Request, res: Response) {
  try {
    const auth    = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });
 
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
 
    await db.delete(statuses).where(and(eq(statuses.id, id), eq(statuses.userId, session.user.id)));
    res.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /api/status/:id]', e);
    res.status(500).json({ error: 'Delete failed' });
  }
}
 