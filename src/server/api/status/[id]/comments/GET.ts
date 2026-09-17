import type { Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { db } from '../../../../db/client.js';

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
    if (!Number.isInteger(statusId) || statusId <= 0) return res.status(400).json({ error: 'Invalid story' });

    const result = await db.execute(sql`
      SELECT c.id, c.user_id, c.body, c.parent_comment_id, c.created_at,
             COALESCE(u.name, u.username, 'شخص ما') AS author_name, u.avatar_url
      FROM status_comments c
      INNER JOIN statuses s ON s.id = c.status_id
      LEFT JOIN user u ON u.id = c.user_id
      WHERE c.status_id = ${statusId} AND s.expires_at > NOW()
      ORDER BY c.created_at ASC
    `);
    const rows = (result as unknown as [any[]])[0] ?? [];
    res.json({ comments: rows.map((row: any) => ({
      id: Number(row.id),
      authorId: row.user_id,
      authorName: row.author_name,
      authorAvatarUrl: row.avatar_url ?? null,
      text: row.body,
      parentCommentId: row.parent_comment_id ? Number(row.parent_comment_id) : null,
      createdAt: new Date(row.created_at).toISOString(),
      likesCount: 0,
      likedByMe: false,
    })) });
  } catch (error) {
    console.error('[GET /api/status/:id/comments]', error);
    res.status(500).json({ error: 'Failed to load story comments' });
  }
}
