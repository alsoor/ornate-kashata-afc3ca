import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const rows = (await db.execute(sql`
      SELECT id, type, title, body, url, is_read, created_at
      FROM in_app_notifications
      WHERE user_id = ${session.user.id}
        AND type IN ('repost', 'post_share_sent')
      ORDER BY created_at DESC
      LIMIT 100
    `) as unknown as [any[]])[0] ?? [];

    const interactions = rows.map((row: any) => ({
      id: Number(row.id),
      type: row.type === 'repost' ? 'repost' : 'share',
      title: row.title ?? '',
      body: row.body ?? '',
      url: row.url ?? '',
      read: Boolean(row.is_read),
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
    }));

    res.json({ interactions });
  } catch (error) {
    console.error('[GET /api/posts/interactions/received]', error);
    res.status(500).json({ error: 'Failed to load post interactions' });
  }
}
