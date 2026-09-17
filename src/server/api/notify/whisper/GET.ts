/**
 * GET /api/notify/whisper?userId=<id>
 * Returns and clears pending whisper alerts for the user (< 60s old).
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { ensureSignalTables } from '../../../db/migrate-signal-tables.js';

export default async function handler(req: Request, res: Response) {
  const userId = req.query.userId as string;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  try {
    await ensureSignalTables();

    const rows = await db.execute(sql`
      SELECT from_user_id, from_name, UNIX_TIMESTAMP(created_at) * 1000 AS ts
      FROM whisper_notifications
      WHERE to_user_id = ${userId}
        AND created_at > DATE_SUB(NOW(), INTERVAL 60 SECOND)
      ORDER BY created_at ASC
    `) as unknown as [Array<{ from_user_id: string; from_name: string; ts: number }>];

    await db.execute(sql`DELETE FROM whisper_notifications WHERE to_user_id = ${userId}`);

    res.json((rows[0] ?? []).map(r => ({
      fromId:   r.from_user_id,
      fromName: r.from_name,
      ts:       Number(r.ts),
    })));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
