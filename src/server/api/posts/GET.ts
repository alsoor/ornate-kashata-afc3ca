/**
 * GET /api/posts?cursor=&limit=
 * Returns paginated feed posts (newest first) with author info + like status.
 * Works for both authenticated and guest users.
 *
 * FIX: the previous version returned a shape that did NOT match the
 * frontend's `PostItem` interface — e.g. `caption` instead of `text`,
 * `author.name` (nested) instead of `authorName` (flat), `likeCount`
 * instead of `likesCount`, `userId` instead of `authorId`.
 * Because the frontend only renders a post's text when `post.text` is
 * truthy, a mismatched field name meant `post.text` was always
 * `undefined` — the text card silently failed to render, which is
 * exactly why text posts looked like they "got deleted" after leaving
 * and returning to the page (media still showed because `mediaUrl`
 * happened to match on both sides).
 *
 * This version maps every DB row to the exact shape `PostItem` expects.
 *
 * UPDATE: this same endpoint is ALSO consumed by the home screen
 * (RecorderScreen.tsx), which normalises the response with its OWN
 * fallback chain expecting a DIFFERENT set of names — a nested
 * `author: { id, name, username, avatarUrl }` object, plus
 * `userId`/`userAvatar`/`likes`/`likeCount`. Returning only the flat
 * `authorX` / `likesCount` names (needed by the feed page) broke the
 * avatar on the home screen, because none of ITS fallback keys matched
 * anymore.
 * Fix: return BOTH naming schemes on every post object — the flat
 * `authorX` fields the feed page reads, AND a nested `author` object
 * plus the `userId`/`userAvatar`/`likes`/`likeCount` aliases the home
 * screen reads. Nothing on either frontend needs to change; this one
 * response now satisfies both.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
 
export default async function handler(req: Request, res: Response) {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 30);
    const cursor = req.query.cursor ? Number(req.query.cursor) : null;
 
    // Try to get current user (optional — guests can browse)
    let currentUserId: string | null = null;
    try {
      const _auth = getAuth();
      const _headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) { if (typeof v === 'string') _headers[k] = v; }
      const session = await _auth.api.getSession({ headers: new Headers(_headers) });
      currentUserId = session?.user?.id ?? null;
    } catch {}
 
    const audience = req.query.audience === 'text' ? 'text' : 'public';
    // Text posts are identified by their caption or the text-only sentinel. Media
    // posts are identified by their actual media type, so each post appears in one
    // selected section only.
    const audienceClause = audience === 'text'
      ? sql`AND (p.caption IS NOT NULL AND p.caption <> '' OR p.media_url = '__text_post__')`
      : sql`AND p.media_url <> '__text_post__'`;
    const cursorClause = cursor ? sql`AND p.id < ${cursor}` : sql``;
 
    let rows: any[];
    if (currentUserId) {
      const result = await db.execute(sql`
        SELECT
          p.id, p.user_id, p.media_url, p.media_type, p.caption,
          p.like_count, p.comment_count, p.created_at,
          u.name, u.username, COALESCE(u.avatar_url, u.image) AS avatar_url, u.name_color,
          COALESCE(up.is_private, FALSE) AS author_is_private,
          (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = ${currentUserId}) AS liked_by_me,
          (SELECT COUNT(*) FROM post_reposts pr WHERE pr.post_id = p.id) AS repost_count,
          (SELECT COUNT(*) FROM post_reposts pr WHERE pr.post_id = p.id AND pr.user_id = ${currentUserId}) AS reposted_by_me,
          (SELECT GROUP_CONCAT(ph.tag ORDER BY ph.id SEPARATOR ',') FROM post_hashtags ph WHERE ph.post_id = p.id) AS hashtags
        FROM posts p
        JOIN user u ON u.id = CONVERT(p.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
        LEFT JOIN user_privacy up ON up.user_id = u.id
        WHERE 1=1 ${audienceClause} ${cursorClause}
        ORDER BY p.id DESC
        LIMIT ${limit}
      `);
      rows = (result as unknown as [any[]])[0];
    } else {
      const result = await db.execute(sql`
        SELECT
          p.id, p.user_id, p.media_url, p.media_type, p.caption,
          p.like_count, p.comment_count, p.created_at,
          u.name, u.username, COALESCE(u.avatar_url, u.image) AS avatar_url, u.name_color,
          COALESCE(up.is_private, FALSE) AS author_is_private,
          0 AS liked_by_me,
          (SELECT COUNT(*) FROM post_reposts pr WHERE pr.post_id = p.id) AS repost_count,
          0 AS reposted_by_me,
          (SELECT GROUP_CONCAT(ph.tag ORDER BY ph.id SEPARATOR ',') FROM post_hashtags ph WHERE ph.post_id = p.id) AS hashtags
        FROM posts p
        JOIN user u ON u.id = CONVERT(p.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
        LEFT JOIN user_privacy up ON up.user_id = u.id
        WHERE 1=1 ${audienceClause} ${cursorClause}
        ORDER BY p.id DESC
        LIMIT ${limit}
      `);
      rows = (result as unknown as [any[]])[0];
    }
 
    // Map DB rows to the EXACT PostItem shape the frontend expects.
    const posts = rows.map((r: any) => {
      const createdAtMs = r.created_at instanceof Date
        ? r.created_at.getTime()
        : (typeof r.created_at === 'string'
            ? new Date(r.created_at).getTime()
            : Number(r.created_at) * (Number(r.created_at) < 1e12 ? 1000 : 1));
 
      const likeCount = Number(r.like_count) || 0;
      const commentCount = Number(r.comment_count) || 0;
      const likedByMe = Number(r.liked_by_me) > 0;
      const hasMedia = Boolean(r.media_url) && r.media_url !== '__text_post__';
      const normalizedMediaType = r.media_type === 'video' ? 'video' : 'image';
      const mediaUrls = hasMedia ? [r.media_url] : [];
      const mediaTypes = hasMedia ? [normalizedMediaType] : [];

      return {
        id: r.id,
 
        // ── Flat names — read by the feed page (add-friend.tsx / PostItem) ──
        authorId: r.user_id,
        authorName: r.name ?? '',
        authorUsername: r.username ?? null,
        authorAvatarUrl: r.avatar_url ?? null,
        authorNameColor: r.name_color ?? null,
        authorIsPrivate: Boolean(r.author_is_private),
        text: r.caption ?? '',
        hashtags: typeof r.hashtags === 'string' && r.hashtags ? r.hashtags.split(',') : [] as string[],
        likesCount: likeCount,
        repostsCount: Number(r.repost_count) || 0,
        repostedByMe: Number(r.reposted_by_me) > 0,
        commentsCount: commentCount,
 
        // ── Aliases — read by the home screen (RecorderScreen.tsx / HomePost) ──
        userId: r.user_id,
        userName: r.name ?? '',
        userAvatar: r.avatar_url ?? null,
        author: {
          id: r.user_id,
          name: r.name ?? '',
          username: r.username ?? null,
          avatarUrl: r.avatar_url ?? null,
          nameColor: r.name_color ?? null,
        },
        likes: likeCount,
        likeCount: likeCount,
 
        // ── Shared fields, same name on both sides ──
        mediaUrl: hasMedia ? r.media_url : null,
        mediaType: hasMedia ? normalizedMediaType : null,
        mediaUrls: Array.isArray(mediaUrls) ? mediaUrls : [],
        mediaTypes: Array.isArray(mediaTypes) ? mediaTypes : [],
        createdAt: new Date(createdAtMs).toISOString(),
        likedByMe,
      };
    });
 
    // ── Fetch recent reposts and inject them as extra feed entries ──────────
    // Each repost row becomes a copy of the original post with a `repostedBy`
    // field and a unique `repostKey` so React can key it separately.
    let repostEntries: any[] = [];
    try {
      const repostResult = await db.execute(sql`
        SELECT
          pr.id AS repost_row_id,
          pr.created_at AS reposted_at,
          ru.id AS reposter_id,
          ru.name AS reposter_name,
          ru.username AS reposter_username,
          COALESCE(ru.avatar_url, ru.image) AS reposter_avatar,
          p.id, p.user_id, p.media_url, p.media_type, p.caption,
          p.like_count, p.comment_count, p.created_at,
          u.name, u.username, COALESCE(u.avatar_url, u.image) AS avatar_url, u.name_color,
          COALESCE(up.is_private, FALSE) AS author_is_private,
          ${currentUserId
            ? sql`(SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = ${currentUserId}) AS liked_by_me,
                  (SELECT COUNT(*) FROM post_reposts pr2 WHERE pr2.post_id = p.id AND pr2.user_id = ${currentUserId}) AS reposted_by_me,`
            : sql`0 AS liked_by_me, 0 AS reposted_by_me,`}
          (SELECT COUNT(*) FROM post_reposts pr3 WHERE pr3.post_id = p.id) AS repost_count,
          (SELECT GROUP_CONCAT(ph.tag ORDER BY ph.id SEPARATOR ',') FROM post_hashtags ph WHERE ph.post_id = p.id) AS hashtags
        FROM post_reposts pr
        JOIN user ru ON ru.id = CONVERT(pr.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
        JOIN posts p ON p.id = pr.post_id
        JOIN user u ON u.id = CONVERT(p.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
        LEFT JOIN user_privacy up ON up.user_id = u.id
        WHERE (p.media_url = '__text_post__' OR (p.caption IS NOT NULL AND p.caption <> ''))
        ORDER BY pr.id DESC
        LIMIT ${limit}
      `);
      const repostRows = (repostResult as unknown as [any[]])[0] ?? [];
      repostEntries = repostRows.map((r: any) => {
        const createdAtMs = r.created_at instanceof Date
          ? r.created_at.getTime()
          : (typeof r.created_at === 'string'
              ? new Date(r.created_at).getTime()
              : Number(r.created_at) * (Number(r.created_at) < 1e12 ? 1000 : 1));
        const repostedAtMs = r.reposted_at instanceof Date
          ? r.reposted_at.getTime()
          : (typeof r.reposted_at === 'string'
              ? new Date(r.reposted_at).getTime()
              : Number(r.reposted_at) * (Number(r.reposted_at) < 1e12 ? 1000 : 1));
        const likeCount = Number(r.like_count) || 0;
        const hasMedia = Boolean(r.media_url) && r.media_url !== '__text_post__';
        const normalizedMediaType = r.media_type === 'video' ? 'video' : 'image';
        return {
          id: r.id,
          repostKey: `repost-${r.repost_row_id}`,
          repostedBy: {
            id: r.reposter_id,
            name: r.reposter_name ?? '',
            username: r.reposter_username ?? null,
            avatarUrl: r.reposter_avatar ?? null,
          },
          repostedAt: new Date(repostedAtMs).toISOString(),
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
        };
      });
    } catch (e) {
      console.error('[GET /api/posts] repost entries error', e);
    }

    // Merge original posts + repost entries, sort by newest first, deduplicate
    // (a post that was reposted should not appear twice as an original entry).
    const seenRepostKeys = new Set(repostEntries.map((r: any) => `orig-${r.id}`));
    const filteredPosts = posts.filter((p: any) => !seenRepostKeys.has(`orig-${p.id}`));
    const merged = [...filteredPosts, ...repostEntries].sort((a: any, b: any) => {
      const ta = new Date(a.repostedAt ?? a.createdAt).getTime();
      const tb = new Date(b.repostedAt ?? b.createdAt).getTime();
      return tb - ta;
    }).slice(0, limit);

    const nextCursor = posts.length === limit ? posts[posts.length - 1].id : null;

    res.json({ posts: merged, nextCursor });
  } catch (err) {
    console.error('[GET /api/posts]', err);
    res.status(500).json({ error: 'Failed to load feed' });
  }
}