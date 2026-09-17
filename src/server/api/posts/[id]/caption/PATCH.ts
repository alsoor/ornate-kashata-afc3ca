import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) if (typeof value === 'string') headers[key] = value;
    const session = await auth.api.getSession({ headers: new Headers(headers) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const postId = Number(req.params.id);
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!Number.isInteger(postId) || postId < 1) return res.status(400).json({ error: 'Invalid post' });
    if (text.length > 2000) return res.status(400).json({ error: 'Text is too long' });

    const result = await db.execute(sql`
      UPDATE posts
      SET caption = ${text}
      WHERE id = ${postId} AND user_id = ${session.user.id} AND media_url <> '__text_post__'
    `);
    const affectedRows = Number((result as any).affectedRows ?? (result as any)[0]?.affectedRows ?? 0);
    if (!affectedRows) return res.status(404).json({ error: 'Post not found' });

    res.json({ ok: true, text });
  } catch (error) {
    console.error('[PATCH /api/posts/:id/caption]', error);
    res.status(500).json({ error: 'Failed to save post text' });
  }
}
