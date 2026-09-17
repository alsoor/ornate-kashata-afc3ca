import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const rawTag = typeof req.query.tag === 'string' ? req.query.tag : '';
    const tag = rawTag.replace(/^#/, '').trim().toLowerCase();
    if (!tag) return res.status(400).json({ error: 'A hashtag is required' });

    const result = await db.execute(sql`
      SELECT p.id, p.user_id, p.caption, p.created_at, p.like_count, p.comment_count,
             u.name, u.username, u.avatar_url
      FROM post_hashtags ph
      JOIN posts p ON p.id = ph.post_id
      JOIN user u ON u.id = CONVERT(p.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
      WHERE ph.tag = ${tag} AND p.media_url = '__text_post__'
      ORDER BY p.id DESC
      LIMIT 50
    `);
    const rows = (result as unknown as [any[]])[0] ?? [];
    res.json({ tag, posts: rows.map((row: any) => ({
      id: row.id,
      authorId: row.user_id,
      authorName: row.name ?? '',
      authorUsername: row.username ?? null,
      authorAvatarUrl: row.avatar_url ?? null,
      text: row.caption ?? '',
      createdAt: new Date(row.created_at).toISOString(),
      likesCount: Number(row.like_count) || 0,
      commentsCount: Number(row.comment_count) || 0,
    })) });
  } catch (error) {
    console.error('[GET /api/posts/hashtags]', error);
    res.status(500).json({ error: 'Failed to load hashtag posts' });
  }
}
