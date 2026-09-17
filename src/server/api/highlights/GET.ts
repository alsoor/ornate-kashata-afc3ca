/**
 * GET /api/highlights
 * Returns the list of highlighted user IDs — available to any logged-in user.
 * Does NOT reveal who the owner is or why users are highlighted.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { ownerHighlights, user } from '../../db/schema.js';
import { getAuth } from '../../../lib/auth/auth.js';
import { eq } from 'drizzle-orm';

const OWNER_EMAIL = 'alsoor@mail.com';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    // Get manually highlighted users
    const rows = await db.select({ targetUserId: ownerHighlights.targetUserId }).from(ownerHighlights);
    const ids = new Set(rows.map(r => r.targetUserId));

    // Also include the owner's own user ID (always red)
    const ownerRows = await db.select({ id: user.id }).from(user).where(eq(user.email, OWNER_EMAIL));
    if (ownerRows.length > 0) ids.add(ownerRows[0].id);

    res.json([...ids]);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
