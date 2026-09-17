// GET /api/secret-room/mic-lock
// Returns current mic lock state: { locked: false } or { locked: true, lockedBy, lockedName, lockedAt }
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  try {
    const rows = await db.execute(sql`SELECT locked_by, locked_name, locked_at FROM secret_mic_lock LIMIT 1`);
    const data = Array.isArray((rows as any)[0]) ? (rows as any)[0] : rows;
    if (!data || (data as any[]).length === 0) {
      return res.json({ locked: false });
    }
    const row = (data as any[])[0];
    // Auto-expire lock after 90 seconds (safety net)
    const age = Date.now() - new Date(row.locked_at).getTime();
    if (age > 90_000) {
      await db.execute(sql`DELETE FROM secret_mic_lock`);
      return res.json({ locked: false });
    }
    return res.json({ locked: true, lockedBy: row.locked_by, lockedName: row.locked_name, lockedAt: row.locked_at });
  } catch (e) {
    console.error('[mic-lock GET]', e);
    res.status(500).json({ error: 'Failed' });
  }
}
