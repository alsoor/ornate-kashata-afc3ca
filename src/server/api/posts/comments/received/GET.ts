import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers[key] = value;
    }
    const session = await auth.api.getSession({ headers: new Headers(headers) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const rows = (await db.execute(sql`
      SELECT
        p.id,
        p.user_id,
        p.caption,
        p.media_url,
        p.media_type,
        NULL AS media_urls,
        NULL AS media_types,
        p.created_at,
        NULL AS expires_at,
        p.like_count,
        (SELECT COUNT(*) FROM post_reposts pr WHERE pr.post_id = p.id) AS repost_count,
        p.comment_count,
        u.name,
        u.username,
        u.avatar_url,
        COUNT(c.id) AS comments_count,
        MAX(c.created_at) AS last_comment_at,
        SUBSTRING_INDEX(GROUP_CONCAT(CONCAT(COALESCE(cu.name, cu.username, 'Someone'), '\u001f', c.body) ORDER BY c.created_at DESC SEPARATOR '\u001e'), '\u001e', 1) AS last_comment
      FROM posts p
      JOIN post_comments c ON c.post_id = p.id AND c.user_id != ${session.user.id}
      LEFT JOIN user u ON u.id = CONVERT(p.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
      LEFT JOIN user cu ON cu.id = CONVERT(c.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
      WHERE p.user_id = ${session.user.id}
      GROUP BY p.id, p.user_id, p.caption, p.media_url, p.media_type, p.created_at, p.like_count, p.comment_count, u.name, u.username, u.avatar_url
      ORDER BY last_comment_at DESC
      LIMIT 100
    `) as unknown as [any[]])[0] ?? [];

    const threads = rows.map((row: any) => {
      const [authorName = '', text = ''] = String(row.last_comment ?? '').split('\u001f');
      const mediaUrls = row.media_urls ? (typeof row.media_urls === 'string' ? JSON.parse(row.media_urls) : row.media_urls) : [];
      const mediaTypes = row.media_types ? (typeof row.media_types === 'string' ? JSON.parse(row.media_types) : row.media_types) : [];
      return {
        post: {
          id: Number(row.id),
          authorId: row.user_id,
          authorName: row.name ?? '',
          authorUsername: row.username ?? null,
          authorAvatarUrl: row.avatar_url ?? null,
          text: row.caption ?? '',
          mediaUrl: row.media_url ?? null,
          mediaType: row.media_type ?? null,
          mediaUrls: Array.isArray(mediaUrls) ? mediaUrls : [],
          mediaTypes: Array.isArray(mediaTypes) ? mediaTypes : [],
          createdAt: new Date(row.created_at).toISOString(),
          expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
          likesCount: Number(row.like_count) || 0,
          likedByMe: false,
          repostsCount: Number(row.repost_count) || 0,
          repostedByMe: false,
          commentsCount: Number(row.comment_count) || 0,
          authorIsPrivate: false,
        },
        expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : new Date(new Date(row.created_at).getTime() + 24 * 60 * 60 * 1000).toISOString(),
        commentsCount: Number(row.comments_count) || 0,
        lastComment: text ? { text, authorName, createdAt: new Date(row.last_comment_at).toISOString() } : null,
        read: false,
      };
    });

    res.json({ threads });
  } catch (error) {
    console.error('[GET /api/posts/comments/received]', error);
    res.status(500).json({ error: 'Failed to load comment threads' });
  }
}
