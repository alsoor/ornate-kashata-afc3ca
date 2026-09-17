import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { sendPushToUser } from '../../../../push-helper.js';

export default async function handler(req: Request, res: Response) {
  try {
    const postId = Number(req.params.id);
    if (!Number.isInteger(postId) || postId <= 0) return res.status(400).json({ error: 'Invalid post' });
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const postRows = (await db.execute(sql`SELECT id, user_id FROM posts WHERE id = ${postId} LIMIT 1`) as unknown as [any[]])[0] ?? [];
    if (!postRows.length) return res.status(404).json({ error: 'Post not found' });
    const postOwnerId = String(postRows[0].user_id ?? '');

    const existing = (await db.execute(sql`SELECT id FROM post_reposts WHERE post_id = ${postId} AND user_id = ${session.user.id} LIMIT 1`) as unknown as [any[]])[0] ?? [];
    let reposted: boolean;
    if (existing.length) {
      await db.execute(sql`DELETE FROM post_reposts WHERE id = ${existing[0].id}`);
      reposted = false;
    } else {
      await db.execute(sql`INSERT INTO post_reposts (post_id, user_id) VALUES (${postId}, ${session.user.id})`);
      reposted = true;
    }
    const countRows = (await db.execute(sql`SELECT COUNT(*) AS count FROM post_reposts WHERE post_id = ${postId}`) as unknown as [any[]])[0] ?? [];

    // Notify the original author only when a new repost is created. Removing a
    // repost is not an interaction the author needs to be alerted about.
    if (reposted && postOwnerId && postOwnerId !== session.user.id) {
      const userRows = (await db.execute(sql`SELECT name, username FROM user WHERE id = ${session.user.id} LIMIT 1`) as unknown as [any[]])[0] ?? [];
      const reposterName = userRows[0]?.name ?? userRows[0]?.username ?? 'شخص ما';
      await sendPushToUser(postOwnerId, 'repost', {
        title: 'إعادة نشر',
        body: `${reposterName} أعاد نشر منشورك النصي`,
        url: `/add-friend?post=${postId}`,
        tag: `stooorna-repost-${postId}`,
      });
    }

    res.json({ reposted, repostCount: Number(countRows[0]?.count) || 0 });
  } catch (error) {
    console.error('[POST /api/posts/:id/repost]', error);
    res.status(500).json({ error: 'Failed to update repost' });
  }
}
