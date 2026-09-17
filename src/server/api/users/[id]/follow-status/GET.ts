/**
 * GET /api/users/:id/follow-status  — check if current user follows target
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const _auth = getAuth();
    const _headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) { if (typeof v === 'string') _headers[k] = v; }
    const session = await _auth.api.getSession({ headers: new Headers(_headers) });
    if (!session?.user) return res.json({ following: false });

    const followingId = req.params.id;
    const followerId = session.user.id;

    const result = await db.execute(sql`SELECT 1 FROM user_follows WHERE follower_id = ${followerId} AND following_id = ${followingId}`);
    const rows = (result as unknown as [any[]])[0];
    res.json({ following: rows.length > 0 });
  } catch {
    res.json({ following: false });
  }
}
