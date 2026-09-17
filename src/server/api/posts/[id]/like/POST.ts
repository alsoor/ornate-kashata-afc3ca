/**
 * POST /api/posts/:id/like  — toggle like on a post (requires auth)
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

    const postId = Number(req.params.id);
    const userId = session.user.id;
    if (!postId) return res.status(400).json({ error: 'Invalid post id' });

    const postResult = await db.execute(sql`SELECT id FROM posts WHERE id = ${postId} LIMIT 1`);
    const postRows = (postResult as unknown as [any[]])[0];
    if (postRows.length === 0) return res.status(404).json({ error: 'Post not found' });

    const existing = await db.execute(sql`SELECT 1 FROM post_likes WHERE post_id = ${postId} AND user_id = ${userId}`);
    const rows = (existing as unknown as [any[]])[0];

    let liked: boolean;
    if (rows.length > 0) {
      await db.execute(sql`DELETE FROM post_likes WHERE post_id = ${postId} AND user_id = ${userId}`);
      await db.execute(sql`UPDATE posts SET like_count = GREATEST(0, like_count - 1) WHERE id = ${postId}`);
      liked = false;
    } else {
      await db.execute(sql`INSERT IGNORE INTO post_likes (post_id, user_id) VALUES (${postId}, ${userId})`);
      await db.execute(sql`UPDATE posts SET like_count = like_count + 1 WHERE id = ${postId}`);
      liked = true;
    }

    const countResult = await db.execute(sql`SELECT like_count FROM posts WHERE id = ${postId}`);
    const post = (countResult as unknown as [any[]])[0][0];
    res.json({ liked, likeCount: post?.like_count ?? 0 });
  } catch (err) {
    console.error('[POST /api/posts/:id/like]', err);
    res.status(500).json({ error: 'Failed to toggle like' });
  }
}
