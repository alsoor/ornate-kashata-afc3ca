/**
 * POST /api/users/:id/follow  — toggle follow (requires auth)
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
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const followingId = req.params.id;
    const followerId = session.user.id;
    if (followerId === followingId) return res.status(400).json({ error: 'Cannot follow yourself' });

    const targetResult = await db.execute(sql`SELECT id FROM user WHERE id = ${followingId} LIMIT 1`);
    const targetRows = (targetResult as unknown as [any[]])[0] ?? [];
    if (targetRows.length === 0) return res.status(404).json({ error: 'User not found' });

    const existing = await db.execute(sql`SELECT 1 FROM user_follows WHERE follower_id = ${followerId} AND following_id = ${followingId}`);
    const rows = (existing as unknown as [any[]])[0] ?? [];

    let following: boolean;
    if (rows.length > 0) {
      await db.execute(sql`DELETE FROM user_follows WHERE follower_id = ${followerId} AND following_id = ${followingId}`);
      following = false;
    } else {
      const privacyResult = await db.execute(sql`SELECT is_private FROM user_privacy WHERE user_id = ${followingId}`);
      const privacyRows = (privacyResult as unknown as [any[]])[0] ?? [];
      const isPrivate = privacyRows.length > 0 && Boolean(privacyRows[0].is_private);

      if (isPrivate) {
        return res.status(403).json({ error: 'This account is private. Send a connection request instead.', private: true });
      }

      await db.execute(sql`INSERT IGNORE INTO user_follows (follower_id, following_id) VALUES (${followerId}, ${followingId})`);
      const confirmed = await db.execute(sql`SELECT 1 FROM user_follows WHERE follower_id = ${followerId} AND following_id = ${followingId} LIMIT 1`);
      following = ((confirmed as unknown as [any[]])[0] ?? []).length > 0;
      if (!following) return res.status(500).json({ error: 'Unable to save follow relationship' });
    }

    res.json({ following });
  } catch (err) {
    console.error('[POST /api/users/:id/follow]', err);
    res.status(500).json({ error: 'Failed to toggle follow' });
  }
}
