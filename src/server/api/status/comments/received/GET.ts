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

    const result = await db.execute(sql`
      SELECT
        s.id AS story_id, s.media_url, s.media_type, s.created_at, s.expires_at,
        COUNT(c.id) AS comments_count,
        MAX(c.created_at) AS last_comment_at,
        SUBSTRING_INDEX(
          GROUP_CONCAT(CONCAT(COALESCE(u.name, u.username, 'شخص ما'), '\u001f', c.body) ORDER BY c.created_at DESC SEPARATOR '\u001e'),
          '\u001e', 1
        ) AS last_comment,
        MAX(CASE WHEN r.status_id IS NULL THEN 1 ELSE 0 END) AS unread
      FROM statuses s
      INNER JOIN status_comments c ON c.status_id = s.id AND c.user_id != ${session.user.id}
      LEFT JOIN user u ON u.id = c.user_id
      LEFT JOIN status_comment_reads r ON r.status_id = s.id AND r.user_id = ${session.user.id}
      WHERE s.user_id = ${session.user.id} AND s.expires_at > NOW()
      GROUP BY s.id, s.media_url, s.media_type, s.created_at, s.expires_at
      ORDER BY last_comment_at DESC
      LIMIT 100
    `);
    const rows = (result as unknown as [any[]])[0] ?? [];
    res.json({ threads: rows.map((row: any) => {
      const [authorName = '', text = ''] = String(row.last_comment ?? '').split('\u001f');
      return {
        storyId: Number(row.story_id),
        mediaUrl: row.media_url,
        mediaType: row.media_type,
        createdAt: new Date(row.created_at).toISOString(),
        expiresAt: new Date(row.expires_at).toISOString(),
        commentsCount: Number(row.comments_count) || 0,
        lastComment: text ? { authorName, text, createdAt: new Date(row.last_comment_at).toISOString() } : null,
        read: Number(row.unread) === 0,
      };
    }) });
  } catch (error) {
    console.error('[GET /api/status/comments/received]', error);
    res.status(500).json({ error: 'Failed to load story comment threads' });
  }
}
