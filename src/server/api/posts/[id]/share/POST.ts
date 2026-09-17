import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { sendPushToUser } from '../../../../push-helper.js';

export default async function handler(req: Request, res: Response) {
  try {
    const postId = Number(req.params.id);
    const recipientIds = Array.isArray(req.body?.recipientIds) ? req.body.recipientIds.filter((id: unknown) => typeof id === 'string') : [];
    if (!Number.isInteger(postId) || postId <= 0 || recipientIds.length === 0) return res.status(400).json({ error: 'Choose at least one friend' });
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const postRows = (await db.execute(sql`SELECT id, caption, user_id, media_url FROM posts WHERE id = ${postId} LIMIT 1`) as unknown as [any[]])[0] ?? [];
    if (!postRows.length) return res.status(404).json({ error: 'Post not found' });
    const postOwnerId = String(postRows[0].user_id ?? '');

    const allowedRows = (await db.execute(sql`
      SELECT CASE WHEN requester_id = ${session.user.id} THEN addressee_id ELSE requester_id END AS friend_id
      FROM friends
      WHERE status = 'accepted' AND (requester_id = ${session.user.id} OR addressee_id = ${session.user.id})
    `) as unknown as [any[]])[0] ?? [];
    const allowed = new Set(allowedRows.map((row: any) => row.friend_id));
    const recipients = [...new Set(recipientIds)].filter(id => allowed.has(id));
    if (!recipients.length) return res.status(403).json({ error: 'You can only share with confirmed friends' });

    const senderRows = (await db.execute(sql`SELECT name, username FROM user WHERE id = ${session.user.id} LIMIT 1`) as unknown as [any[]])[0] ?? [];
    const senderName = senderRows[0]?.name ?? senderRows[0]?.username ?? 'A friend';
    const preview = String(postRows[0].caption ?? '').slice(0, 120);

    let createdShares = 0;
    for (const recipientId of recipients) {
      const shareResult = await db.execute(sql`
        INSERT IGNORE INTO post_shares (post_id, sender_id, recipient_id)
        VALUES (${postId}, ${session.user.id}, ${recipientId})
      `);
      const inserted = Number((shareResult as any).affectedRows ?? (shareResult as any)[0]?.affectedRows ?? 0) > 0;
      if (inserted) createdShares += 1;
      await db.execute(sql`
        INSERT INTO messages (sender_id, receiver_id, type, body)
        VALUES (${session.user.id}, ${recipientId}, 'post_share', ${JSON.stringify({
          postId,
          text: preview,
          authorName: senderRows[0]?.name ?? senderRows[0]?.username ?? 'Someone',
          mediaUrl: postRows[0].media_url && postRows[0].media_url !== '__text_post__' ? postRows[0].media_url : null,
        })})
      `);
      await db.execute(sql`
        INSERT INTO in_app_notifications (user_id, type, title, body, url)
        VALUES (${recipientId}, 'post_share', 'Shared post', ${`${senderName} shared a post with you`}, ${`/add-friend?post=${postId}`})
      `);
    }

    // The original author receives a Share notification in the posts inbox.
    // Do not notify them when they share their own post, and avoid duplicate
    // alerts when the same sender reopens an already-created share.
    if (createdShares > 0 && postOwnerId && postOwnerId !== session.user.id) {
      await sendPushToUser(postOwnerId, 'post_share_sent', {
        title: 'تمت مشاركة منشورك',
        body: `${senderName} شارك منشورك النصي مع ${createdShares} ${createdShares === 1 ? 'صديق' : 'أصدقاء'}`,
        url: `/add-friend?post=${postId}`,
        tag: `stooorna-share-${postId}`,
      });
    }
    res.status(201).json({ sharedWith: recipients.length });
  } catch (error) {
    console.error('[POST /api/posts/:id/share]', error);
    res.status(500).json({ error: 'Failed to share post' });
  }
}
