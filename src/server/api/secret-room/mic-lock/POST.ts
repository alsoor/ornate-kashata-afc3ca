// POST /api/secret-room/mic-lock
// Body: { userId, userName, action: 'lock' | 'unlock' }
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  const { userId, userName, action } = req.body as { userId?: string; userName?: string; action?: string };
  if (!userId || !action) return res.status(400).json({ error: 'userId and action required' });

  try {
    if (action === 'lock') {
      // Check if already locked by someone else
      const rows = await db.execute(sql`SELECT locked_by, locked_at FROM secret_mic_lock LIMIT 1`);
      const data = Array.isArray((rows as any)[0]) ? (rows as any)[0] : rows;
      if (data && (data as any[]).length > 0) {
        const row = (data as any[])[0];
        const age = Date.now() - new Date(row.locked_at).getTime();
        if (age <= 90_000 && row.locked_by !== userId) {
          return res.status(409).json({ error: 'locked', lockedBy: row.locked_by });
        }
      }
      // Clear any stale lock and insert new
      await db.execute(sql`DELETE FROM secret_mic_lock`);
      await db.execute(sql`
        INSERT INTO secret_mic_lock (locked_by, locked_name, locked_at)
        VALUES (${userId}, ${userName ?? userId}, NOW())
      `);
      return res.json({ ok: true, locked: true });
    }

    if (action === 'unlock') {
      await db.execute(sql`DELETE FROM secret_mic_lock WHERE locked_by = ${userId}`);
      return res.json({ ok: true, locked: false });
    }

    return res.status(400).json({ error: 'action must be lock or unlock' });
  } catch (e) {
    console.error('[mic-lock POST]', e);
    res.status(500).json({ error: 'Failed' });
  }
}
