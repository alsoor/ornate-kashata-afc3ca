import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

// Log join — upsert so each user is counted once only
export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const userId = session.user.id;
    const name   = session.user.name ?? session.user.email ?? 'Unknown';

    // INSERT IGNORE — only inserts if this user_id doesn't exist yet
    await db.execute(sql`
      INSERT IGNORE INTO secret_room_joins (user_id, user_name, joined_at)
      VALUES (${userId}, ${name}, NOW())
    `);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
