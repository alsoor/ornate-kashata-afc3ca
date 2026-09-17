/**
 * GET /api/users/:id/posts  — all posts by a specific user
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const targetId = req.params.id;
    let currentUserId: string | null = null;
    try {
      const _auth = getAuth();
      const _headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) { if (typeof v === 'string') _headers[k] = v; }
      const session = await _auth.api.getSession({ headers: new Headers(_headers) });
      currentUserId = session?.user?.id ?? null;
    } catch {}

    const privacyResult = await db.execute(sql`SELECT is_private FROM user_privacy WHERE user_id = ${targetId}`);
    const privacyRows = (privacyResult as unknown as [any[]])[0];
    const isPrivate = privacyRows.length > 0 && Boolean(privacyRows[0].is_private);

    if (isPrivate && currentUserId !== targetId) {
      const relationshipResult = currentUserId
        ? await db.execute(sql`SELECT 1 FROM friends WHERE status = 'accepted' AND ((requester_id = ${currentUserId} AND addressee_id = ${targetId}) OR (requester_id = ${targetId} AND addressee_id = ${currentUserId})) LIMIT 1`)
        : null;
      const relationshipRows = relationshipResult ? (relationshipResult as unknown as [any[]])[0] : [];
      if (relationshipRows.length === 0) {
        return res.json({ posts: [], hasNewPost: false, private: true });
      }
    }

    let rows: any[];
    if (currentUserId) {
      const result = await db.execute(sql`
        SELECT
          p.id, p.media_url, p.media_type, p.caption, p.thumbnail_url,
          p.duration, p.like_count, p.comment_count, p.created_at,
          (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = ${currentUserId}) AS liked_by_me
        FROM posts p
        WHERE p.user_id = ${targetId}
        ORDER BY p.id DESC
        LIMIT 60
      `);
      rows = (result as unknown as [any[]])[0];
    } else {
      const result = await db.execute(sql`
        SELECT
          p.id, p.media_url, p.media_type, p.caption, p.thumbnail_url,
          p.duration, p.like_count, p.comment_count, p.created_at,
          0 AS liked_by_me
        FROM posts p
        WHERE p.user_id = ${targetId}
        ORDER BY p.id DESC
        LIMIT 60
      `);
      rows = (result as unknown as [any[]])[0];
    }

    const latestPost = rows[0];
    const hasNewPost = latestPost
      ? Date.now() - new Date(latestPost.created_at).getTime() < 24 * 60 * 60 * 1000
      : false;

    res.json({
      posts: rows.map((r: any) => ({
        id: r.id,
        mediaUrl: r.media_url,
        mediaType: r.media_type,
        caption: r.caption,
        thumbnailUrl: r.thumbnail_url,
        duration: r.duration,
        likeCount: r.like_count,
        commentCount: r.comment_count,
        createdAt: r.created_at,
        likedByMe: Number(r.liked_by_me) > 0,
      })),
      hasNewPost,
    });
  } catch (err) {
    console.error('[GET /api/users/:id/posts]', err);
    res.status(500).json({ error: 'Failed to load posts' });
  }
}
