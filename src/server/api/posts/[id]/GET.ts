import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const postId = Number(req.params.id);
    if (!Number.isInteger(postId) || postId <= 0) return res.status(400).json({ error: 'Invalid post id' });

    let currentUserId: string | null = null;
    try {
      const auth = getAuth();
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) { if (typeof v === 'string') headers[k] = v; }
      const session = await auth.api.getSession({ headers: new Headers(headers) });
      currentUserId = session?.user?.id ?? null;
    } catch { /* guest */ }

    const result = await db.execute(sql`
      SELECT
        p.id, p.user_id, p.media_url, p.media_type, p.caption,
        p.like_count, p.comment_count, p.created_at,
        u.name, u.username, u.avatar_url, u.name_color,
        COALESCE(up.is_private, FALSE) AS author_is_private,
        ${currentUserId
          ? sql`(SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = ${currentUserId}) AS liked_by_me,
                (SELECT COUNT(*) FROM post_reposts pr WHERE pr.post_id = p.id AND pr.user_id = ${currentUserId}) AS reposted_by_me,`
          : sql`0 AS liked_by_me, 0 AS reposted_by_me,`}
        (SELECT COUNT(*) FROM post_reposts pr2 WHERE pr2.post_id = p.id) AS repost_count,
        (SELECT GROUP_CONCAT(ph.tag ORDER BY ph.id SEPARATOR ',') FROM post_hashtags ph WHERE ph.post_id = p.id) AS hashtags
      FROM posts p
      JOIN user u ON u.id = CONVERT(p.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
      LEFT JOIN user_privacy up ON up.user_id = u.id
      WHERE p.id = ${postId}
      LIMIT 1
    `);

    const rows = (result as unknown as [any[]])[0] ?? [];
    if (!rows.length) return res.status(404).json({ error: 'Post not found' });
    const r = rows[0];

    const createdAtMs = r.created_at instanceof Date
      ? r.created_at.getTime()
      : (typeof r.created_at === 'string'
          ? new Date(r.created_at).getTime()
          : Number(r.created_at) * (Number(r.created_at) < 1e12 ? 1000 : 1));

    const likeCount = Number(r.like_count) || 0;
    const hasMedia = Boolean(r.media_url) && r.media_url !== '__text_post__';
    const normalizedMediaType = r.media_type === 'video' ? 'video' : 'image';

    res.json({
      id: r.id,
      authorId: r.user_id,
      authorName: r.name ?? '',
      authorUsername: r.username ?? null,
      authorAvatarUrl: r.avatar_url ?? null,
      authorNameColor: r.name_color ?? null,
      authorIsPrivate: Boolean(r.author_is_private),
      text: r.caption ?? '',
      hashtags: typeof r.hashtags === 'string' && r.hashtags ? r.hashtags.split(',') : [],
      likesCount: likeCount,
      repostsCount: Number(r.repost_count) || 0,
      repostedByMe: Number(r.reposted_by_me) > 0,
      commentsCount: Number(r.comment_count) || 0,
      userId: r.user_id,
      userName: r.name ?? '',
      userAvatar: r.avatar_url ?? null,
      author: { id: r.user_id, name: r.name ?? '', username: r.username ?? null, avatarUrl: r.avatar_url ?? null, nameColor: r.name_color ?? null },
      likes: likeCount,
      likeCount,
      mediaUrl: hasMedia ? r.media_url : null,
      mediaType: hasMedia ? normalizedMediaType : null,
      mediaUrls: hasMedia ? [r.media_url] : [],
      mediaTypes: hasMedia ? [normalizedMediaType] : [],
      createdAt: new Date(createdAtMs).toISOString(),
      likedByMe: Number(r.liked_by_me) > 0,
    });
  } catch (err) {
    console.error('[GET /api/posts/:id]', err);
    res.status(500).json({ error: 'Failed to load post' });
  }
}
