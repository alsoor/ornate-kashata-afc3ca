/**
 * POST /api/notify/whisper
 * Stores a pending whisper alert for a target user in the DB.
 * Body: { toUserId, fromName }
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../lib/auth/auth.js';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { ensureSignalTables } from '../../../db/migrate-signal-tables.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const { toUserId, fromName } = req.body as { toUserId?: string; fromName?: string };
    if (!toUserId) return res.status(400).json({ error: 'Missing toUserId' });

    await ensureSignalTables();
    await db.execute(sql`
      INSERT INTO whisper_notifications (to_user_id, from_user_id, from_name)
      VALUES (${toUserId}, ${session.user.id}, ${fromName ?? session.user.name ?? 'Someone'})
    `);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
