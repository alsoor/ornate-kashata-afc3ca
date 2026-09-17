/**
 * DELETE /api/posts/:id
 * Delete a post. Only the post owner or the app owner can delete.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
  if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

  const postId = Number(req.params.id);
  if (!Number.isInteger(postId) || postId <= 0) {
    return res.status(400).json({ error: 'Invalid post id' });
  }

  try {
    // Fetch the post to verify ownership
    const rows = (await db.execute(sql`SELECT user_id FROM posts WHERE id = ${postId} LIMIT 1`)) as unknown as [any[]];
    const post = rows[0]?.[0];
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const isOwner = session.user.email === 'alsoor@mail.com';
    if (post.user_id !== session.user.id && !isOwner) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Remove dependent records first. Deleting the post before its comments/likes
    // can violate database foreign-key constraints and leave the post visible.
    await db.transaction(async (tx) => {
      await tx.execute(sql`DELETE FROM post_comments WHERE post_id = ${postId}`);
      await tx.execute(sql`DELETE FROM post_likes WHERE post_id = ${postId}`);
      await tx.execute(sql`DELETE FROM posts WHERE id = ${postId}`);
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /api/posts/:id]', e);
    res.status(500).json({ error: 'Failed to delete post' });
  }
}
