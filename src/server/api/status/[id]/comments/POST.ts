import type { Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { db } from '../../../../db/client.js';
import { sendPushToUser } from '../../../../push-helper.js';

function sessionHeaders(req: Request) {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers[key] = value;
  }
  return new Headers(headers);
}

export default async function handler(req: Request, res: Response) {
  try {
    const session = await getAuth().api.getSession({ headers: sessionHeaders(req) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const statusId = Number(req.params.id);
    const body = String(req.body?.body ?? req.body?.text ?? '').trim();
    const parentCommentId = Number(req.body?.parentCommentId) || null;
    if (!Number.isInteger(statusId) || statusId <= 0 || !body) {
      return res.status(400).json({ error: 'Story and comment text are required' });
    }

    const storyResult = await db.execute(sql`
      SELECT s.user_id, s.expires_at
      FROM statuses s
      WHERE s.id = ${statusId}
      LIMIT 1
    `);
    const storyRows = (storyResult as unknown as [any[]])[0] ?? [];
    const story = storyRows[0];
    if (!story || new Date(story.expires_at).getTime() <= Date.now()) {
      return res.status(404).json({ error: 'Story not found or expired' });
    }

    const insertResult = await db.execute(sql`
      INSERT INTO status_comments (status_id, user_id, body, parent_comment_id)
      VALUES (${statusId}, ${session.user.id}, ${body}, ${parentCommentId})
    `);
    const commentId = Number((insertResult as any).insertId ?? (insertResult as any)[0]?.insertId);
    const authorResult = await db.execute(sql`
      SELECT COALESCE(name, username, 'شخص ما') AS author_name, avatar_url
      FROM user WHERE id = ${session.user.id} LIMIT 1
    `);
    const author = ((authorResult as unknown as [any[]])[0] ?? [])[0] ?? {};

    if (story.user_id !== session.user.id) {
      const commenterName = author.author_name ?? session.user.name ?? 'شخص ما';
      void sendPushToUser(story.user_id, 'story_comment', {
        title: 'تعليق جديد على قصتك',
        body: `${commenterName}: ${body.slice(0, 60)}${body.length > 60 ? '…' : ''}`,
        url: '/add-friend?inbox=story',
        tag: `stooorna-story-comment-${statusId}`,
        data: { storyId: statusId },
      });
    }

    res.status(201).json({
      ok: true,
      comment: {
        id: commentId,
        authorId: session.user.id,
        authorName: author.author_name ?? session.user.name ?? 'شخص ما',
        authorAvatarUrl: author.avatar_url ?? null,
        text: body,
        parentCommentId,
        createdAt: new Date().toISOString(),
        likesCount: 0,
        likedByMe: false,
      },
    });
  } catch (error) {
    console.error('[POST /api/status/:id/comments]', error);
    res.status(500).json({ error: 'Failed to add story comment' });
  }
}
