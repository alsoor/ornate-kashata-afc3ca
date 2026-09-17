/**
 * GET /api/me/ban-status
 * Returns { isBanned: boolean } for the current session user.
 * Used by BanGuard to poll and kick banned users in real-time.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { user } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.json({ isBanned: false });

    const rows = await db.select({ isBanned: user.isBanned })
      .from(user).where(eq(user.id, session.user.id)).limit(1);

    res.json({ isBanned: rows[0]?.isBanned ?? false });
  } catch {
    res.json({ isBanned: false });
  }
}
