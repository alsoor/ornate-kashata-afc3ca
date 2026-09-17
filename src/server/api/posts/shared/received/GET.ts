import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const rows = (await db.execute(sql`
      SELECT
        ps.id AS share_id,
        ps.sender_id,
        ps.created_at AS shared_at,
        NULL AS read_at,
        p.id AS post_id,
        p.user_id AS post_user_id,
        p.caption,
        p.media_url,
        p.media_type,
        NULL AS media_urls,
        NULL AS media_types,
        p.created_at AS post_created_at,
        NULL AS expires_at,
        u.name AS author_name,
        u.username AS author_username,
        u.avatar_url AS author_avatar_url,
        sender.name AS sender_name,
        sender.username AS sender_username,
        sender.avatar_url AS sender_avatar_url,
        (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
        (SELECT COUNT(*) FROM post_reposts pr WHERE pr.post_id = p.id) AS repost_count,
        (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id) AS comment_count      FROM post_shares ps
      INNER JOIN posts p ON p.id = ps.post_id
      LEFT JOIN user u ON u.id = CONVERT(p.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
      LEFT JOIN user sender ON sender.id = CONVERT(ps.sender_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
      WHERE ps.recipient_id = CONVERT(${session.user.id} USING utf8mb4) COLLATE utf8mb4_unicode_ci
      ORDER BY ps.created_at DESC
      LIMIT 100
    `) as unknown as [any[]])[0] ?? [];

    res.json({
      shares: rows.map((row: any) => ({
        id: Number(row.share_id),
        senderId: String(row.sender_id ?? ''),
        senderName: row.sender_name ?? null,
        senderUsername: row.sender_username ?? null,
        senderAvatarUrl: row.sender_avatar_url ?? null,
        createdAt: row.shared_at,
        read: Boolean(row.read_at),
        post: {
          id: Number(row.post_id),
          userId: String(row.post_user_id),
          authorName: row.author_name ?? null,
          authorUsername: row.author_username ?? null,
          authorAvatarUrl: row.author_avatar_url ?? null,
          text: row.caption ?? '',
          mediaUrl: row.media_url ?? null,
          mediaType: row.media_type ?? null,
          mediaUrls: row.media_urls ? JSON.parse(row.media_urls) : [],
          mediaTypes: row.media_types ? JSON.parse(row.media_types) : [],
          createdAt: row.post_created_at,
          expiresAt: row.expires_at ?? null,
          likesCount: Number(row.like_count) || 0,
          likedByMe: false,
          commentsCount: Number(row.comment_count) || 0,
          repostsCount: Number(row.repost_count) || 0,
          repostedByMe: false,
        },
      })),
    });
  } catch (error) {
    console.error('[GET /api/posts/shared/received]', error);
    res.status(500).json({ error: 'Failed to load shared posts' });
  }
}
