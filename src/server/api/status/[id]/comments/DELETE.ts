import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

// DELETE /api/status/:storyId/comments
// Deletes ALL comments on a story owned by the current user → clears the notification thread
export default async function handler(req: Request, res: Response) {
  try {
    const storyId = Number(req.params.id);
    if (!Number.isInteger(storyId) || storyId <= 0) return res.status(400).json({ error: 'Invalid story id' });

    const auth = getAuth();
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) { if (typeof v === 'string') headers[k] = v; }
    const session = await auth.api.getSession({ headers: new Headers(headers) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    // Verify the story belongs to the current user
    const storyRows = (await db.execute(sql`SELECT user_id FROM statuses WHERE id = ${storyId} LIMIT 1`) as unknown as [any[]])[0] ?? [];
    if (!storyRows.length) return res.status(404).json({ error: 'Story not found' });
    if (String(storyRows[0].user_id) !== session.user.id) return res.status(403).json({ error: 'Forbidden' });

    await db.execute(sql`DELETE FROM status_comments WHERE status_id = ${storyId}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/status/:id/comments]', err);
    res.status(500).json({ error: 'Failed to delete comments' });
  }
}
