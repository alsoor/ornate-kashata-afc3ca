/**
 * POST /api/posts/:id/comments  — add a comment (requires auth)
 * After inserting, notifies:
 *   1. The post owner (if different from commenter)
 *   2. All previous commenters on the same post (deduped, excluding commenter)
 * via inAppNotifications + Web Push.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { sendPushToUsers } from '../../../../push-helper.js';

export default async function handler(req: Request, res: Response) {
  try {
    const _auth = getAuth();
    const _headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) { if (typeof v === 'string') _headers[k] = v; }
    const session = await _auth.api.getSession({ headers: new Headers(_headers) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const postId = Number(req.params.id);
    const body = (req.body?.body ?? req.body?.text ?? '').trim();
    const parentCommentId = Number(req.body?.parentCommentId) || null;
    if (!postId || !body) return res.status(400).json({ error: 'Missing fields' });

    const commenterId = session.user.id;
    const commenterName = session.user.name || 'شخص ما';

    const postResult = await db.execute(sql`SELECT id FROM posts WHERE id = ${postId} LIMIT 1`);
    const postRows = (postResult as unknown as [any[]])[0];
    if (postRows.length === 0) return res.status(404).json({ error: 'Post not found' });

    // Insert comment and return the saved record so the client can replace its optimistic item.
    const insertResult = await db.execute(sql`INSERT INTO post_comments (post_id, user_id, body, parent_comment_id) VALUES (${postId}, ${commenterId}, ${body}, ${parentCommentId})`);
    await db.execute(sql`UPDATE posts SET comment_count = comment_count + 1 WHERE id = ${postId}`);
    const commentId = Number((insertResult as any).insertId ?? (insertResult as any)[0]?.insertId);
    const userRows = (await db.execute(sql`SELECT name, username, avatar_url FROM user WHERE id = ${commenterId} LIMIT 1`) as unknown as [any[]])[0];
    const commenter = userRows?.[0] ?? {};
    const comment = {
      id: commentId,
      authorId: commenterId,
      authorName: commenter.name ?? commenterName,
      authorAvatarUrl: commenter.avatar_url ?? null,
      text: body,
      parentCommentId,
      createdAt: new Date().toISOString(),
    };

    // ── Notify in background (don't block response) ──────────────────────────
    void (async () => {
      try {
        // 1. Get post owner
        const postRows = (await db.execute(sql`SELECT user_id FROM posts WHERE id = ${postId} LIMIT 1`) as unknown as [any[]])[0];
        const postOwnerId: string | null = postRows?.[0]?.user_id ?? null;

        // 2. Get all previous commenters on this post (distinct user_ids)
        const prevRows = (await db.execute(sql`
          SELECT DISTINCT user_id FROM post_comments
          WHERE post_id = ${postId} AND user_id != ${commenterId}
        `) as unknown as [any[]])[0];
        const prevCommenters: string[] = prevRows.map((r: any) => r.user_id);

        // 3. Build recipient set: post owner + previous commenters, excluding commenter
        const recipientSet = new Set<string>(prevCommenters);
        if (postOwnerId && postOwnerId !== commenterId) recipientSet.add(postOwnerId);
        const recipients = Array.from(recipientSet);
        if (recipients.length === 0) return;

        const notifTitle = 'تعليق جديد 💬';
        const notifBody = `${commenterName}: ${body.slice(0, 60)}${body.length > 60 ? '…' : ''}`;
        const notifUrl = `/?post=${postId}`;

        // Save the inbox notification and deliver Web Push through one shared
        // path. The previous implementation inserted the inbox row directly,
        // then only attempted push delivery, which made the two notification
        // channels drift apart and hid delivery failures.
        await sendPushToUsers(recipients, 'comment', {
          title: notifTitle,
          body: notifBody,
          url: notifUrl,
          tag: `stooorna-comment-${postId}`,
        });
      } catch (e) {
        console.error('[comment notify]', e);
      }
    })();

    res.status(201).json({ ok: true, comment });
  } catch (err) {
    console.error('[POST /api/posts/:id/comments]', err);
    res.status(500).json({ error: 'Failed to add comment' });
  }
}
