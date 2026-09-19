/**
 * POST /api/posts
 * Create a new post. Accepts a plain JSON body — works for text-only posts
 * as well as posts whose media was already uploaded separately via
 * POST /api/posts/media (which returns a mediaUrl to pass in here).
 *
 * Body (application/json):
 *   {
 *     text?: string,
 *     mediaUrl?: string | null,
 *     mediaType?: 'image' | 'video' | null
 *   }
 *
 * WHY THE OLD FILE BROKE TEXT POSTS:
 * The previous handler only accepted multipart/form-data (multer) and
 * rejected ANY request with no attached file via `if (!file) return
 * res.status(400)...`. A text-only post never has a file, so it always
 * hit that 400 — that's the exact "تعذر نشر المنشور" error reported.
 *
 * WHY THIS VERSION IS SAFE:
 * It writes to EXACTLY the same columns already proven to work for video
 * posts (confirmed from the working video-upload handler):
 *   user_id, media_url, media_type, caption, duration
 * No new/guessed column names (no `body`, no `hashtags`, no `repost_count`)
 * — those were never confirmed to exist and are left out to avoid a
 * fresh INSERT failure. The post's text is stored in `caption`, same
 * column video posts already use successfully.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';

interface CreatePostBody {
  text?: string;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'video' | null;
  mediaUrls?: string[];
  mediaTypes?: ('image' | 'video')[];
  audience?: 'public' | 'text';
  destination?: 'text' | 'photos' | 'videos';
  hashtags?: string[];
}

function extractHashtags(text: string): string[] {
  return [...new Set(Array.from(text.matchAll(/#([\p{L}\p{N}_]+)/gu)).map(match => match[1].toLowerCase()))].slice(0, 20);
}

function extractMentions(text: string): string[] {
  return [...new Set(Array.from(text.matchAll(/@([\p{L}\p{N}_]+)/gu)).map(match => match[1].toLowerCase()))].slice(0, 20);
}

export default async function handler(req: Request, res: Response) {
  try {
    const _auth = getAuth();
    const _headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) { if (typeof v === 'string') _headers[k] = v; }
    const session = await _auth.api.getSession({ headers: new Headers(_headers) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const userId = session.user.id;
    const { text, mediaUrl, mediaType, mediaUrls, mediaTypes, audience, destination } = (req.body ?? {}) as CreatePostBody;

    const caption = (text ?? '').trim();
    const suppliedMedia = Array.isArray(mediaUrls)
      ? mediaUrls.map((url, index) => ({
          url: typeof url === 'string' ? url.trim() : '',
          type: mediaTypes?.[index] === 'video' ? 'video' as const : 'image' as const,
        })).filter(item => item.url.length > 0)
      : [];
    const primaryMediaUrl = suppliedMedia[0]?.url ?? (typeof mediaUrl === 'string' ? mediaUrl.trim() : '');
    const primaryMediaType = suppliedMedia[0]?.type ?? (mediaType === 'video' ? 'video' as const : 'image' as const);
    const hasMedia = primaryMediaUrl.length > 0;
    const resolvedDestination = destination === 'photos' || destination === 'videos' || destination === 'text'
      ? destination
      : (audience === 'text' ? 'text' : (primaryMediaType === 'video' ? 'videos' : 'photos'));
    const isTextPost = resolvedDestination === 'text';

    if (!caption && !hasMedia) {
      return res.status(400).json({ error: 'Post must have text or media' });
    }
    if (resolvedDestination === 'photos' && (!hasMedia || primaryMediaType !== 'image')) {
      return res.status(400).json({ error: 'Photo posts require an image' });
    }
    if (resolvedDestination === 'videos' && (!hasMedia || primaryMediaType !== 'video')) {
      return res.status(400).json({ error: 'Video posts require a video' });
    }

    // The deployed posts table stores one media URL per post. For writing-feed
    // posts, the media remains on the same post while the sentinel keeps it out
    // of the photo/video grids. This avoids relying on columns that may not exist.
    const storedMediaUrl = isTextPost ? (hasMedia ? primaryMediaUrl : '__text_post__') : primaryMediaUrl;
    const storedMediaType = primaryMediaType;
    const storedMediaUrls = hasMedia ? [primaryMediaUrl] : [];
    const storedMediaTypes = hasMedia ? [primaryMediaType] : [];
    const result = await db.execute(sql`
      INSERT INTO posts (user_id, media_url, media_type, caption, duration)
      VALUES (${userId}, ${storedMediaUrl}, ${storedMediaType}, ${caption}, 0)
    `);

    const insertId = Number((result as any).insertId ?? (result as any)[0]?.insertId);
    if (!insertId) {
      throw new Error('Post was not assigned an ID');
    }

    const hashtags = isTextPost ? extractHashtags(caption) : [];
    for (const tag of hashtags) {
      await db.execute(sql`INSERT IGNORE INTO post_hashtags (post_id, tag) VALUES (${insertId}, ${tag})`);
    }

    const mentionUsernames = isTextPost ? extractMentions(caption) : [];
    if (mentionUsernames.length) {
      const placeholders = mentionUsernames.map(username => sql`${username}`);
      const mentionedRows = (await db.execute(sql`
        SELECT id, name, username FROM user WHERE LOWER(username) IN (${sql.join(placeholders, sql`, `)})
      `) as unknown as [any[]])[0] ?? [];
      for (const mentioned of mentionedRows) {
        if (mentioned.id === userId) continue;
        await db.execute(sql`INSERT IGNORE INTO post_mentions (post_id, mentioned_user_id) VALUES (${insertId}, ${mentioned.id})`);
        await db.execute(sql`
          INSERT INTO in_app_notifications (user_id, type, title, body, url)
          VALUES (${mentioned.id}, 'post_mention', 'تمت الإشارة إليك', ${`${session.user.name ?? 'مستخدم'} أشار إليك في منشور`}, ${`/add-friend?post=${insertId}`})
        `);
      }
    }

    // The post is already safely stored. Profile lookup is best-effort only:
    // it must never turn a successful text post into a failed response.
    let u: Record<string, unknown> = {};
    try {
      const userRows = (await db.execute(
        sql`SELECT name, username, image FROM \user\ WHERE id = ${userId} LIMIT 1`
      ) as unknown as [any[]])[0];
      u = userRows?.[0] ?? {};
    } catch (profileError) {
      console.warn('[POST /api/posts] profile lookup skipped', profileError);
    }

    const authorName = typeof u.name === 'string' ? u.name : (session.user.name ?? '');
    const authorUsername = typeof u.username === 'string' ? u.username : null;
    const authorAvatarUrl = typeof u.image === 'string' ? u.image : null;
    const post = {
      id: insertId,
      authorId: userId,
      authorName,
      authorUsername,
      authorAvatarUrl,
      text: caption,
      mediaUrl: hasMedia ? primaryMediaUrl : null,
      mediaType: hasMedia ? primaryMediaType : null,
      mediaUrls: storedMediaUrls,
      mediaTypes: storedMediaTypes,
      hashtags,
      createdAt: new Date().toISOString(),
      likesCount: 0,
      likes: 0,
      likeCount: 0,
      likedByMe: false,
      repostsCount: 0,
      repostedByMe: false,
      commentsCount: 0,
      userId,
      userName: authorName,
      userAvatar: authorAvatarUrl,
      author: {
        id: userId,
        name: authorName,
        username: authorUsername,
        avatarUrl: authorAvatarUrl,
      },
    };

    res.status(201).json({ post });
  } catch (err) {
    console.error('[POST /api/posts]', err);
    res.status(500).json({ error: 'Failed to create post' });
  }
}