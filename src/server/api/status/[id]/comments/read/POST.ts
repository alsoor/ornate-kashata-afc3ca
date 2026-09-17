import type { Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { db } from '../../../../../db/client.js';

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

    const ownerResult = await db.execute(sql`SELECT user_id FROM statuses WHERE id = ${statusId} AND expires_at > NOW() LIMIT 1`);
    const owner = ((ownerResult as unknown as [any[]])[0] ?? [])[0];
    if (!owner) return res.status(404).json({ error: 'Story not found or expired' });
    if (owner.user_id !== session.user.id) return res.status(403).json({ error: 'Only the story owner can mark comments read' });

    await db.execute(sql`
      INSERT INTO status_comment_reads (status_id, user_id, read_at)
      VALUES (${statusId}, ${session.user.id}, NOW())
      ON DUPLICATE KEY UPDATE read_at = VALUES(read_at)
    `);
    res.json({ ok: true });
  } catch (error) {
    console.error('[POST /api/status/:id/comments/read]', error);
    res.status(500).json({ error: 'Failed to mark story comments read' });
  }
}
