/**
 * GET /api/posts/:id/comments
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const postId = Number(req.params.id);
    if (!postId) return res.status(400).json({ error: 'Invalid post id' });

    const postResult = await db.execute(sql`SELECT id FROM posts WHERE id = ${postId} LIMIT 1`);
    const postRows = (postResult as unknown as [any[]])[0];
    if (postRows.length === 0) return res.status(404).json({ error: 'Post not found' });

    const result = await db.execute(sql`
      SELECT c.id, c.user_id, c.body, c.parent_comment_id, c.created_at, u.name, u.username, u.avatar_url, u.name_color
      FROM post_comments c
      JOIN user u ON u.id = CONVERT(c.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
      WHERE c.post_id = ${postId}
      ORDER BY c.id ASC
      LIMIT 100
    `);

    const rows = (result as unknown as [any[]])[0];
    res.json({
      comments: rows.map((r: any) => ({
        id: r.id,
        authorId: r.user_id,
        authorName: r.name ?? '',
        authorUsername: r.username ?? null,
        authorAvatarUrl: r.avatar_url ?? null,
        authorNameColor: r.name_color ?? null,
        text: r.body,
        parentCommentId: r.parent_comment_id ?? null,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error('[GET /api/posts/:id/comments]', err);
    res.status(500).json({ error: 'Failed to load comments' });
  }
}
