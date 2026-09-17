/**
 * POST /api/secret-chat/mark-read
 * Updates the last-read timestamp for the current user in a specific chat.
 * Body: { chatId: number }
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const { chatId } = req.body as { chatId?: number };
    if (!chatId) return res.status(400).json({ error: 'Missing chatId' });

    const userId = session.user.id;

    // Ensure sc_last_read table exists
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS sc_last_read (
        chat_id INT NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        last_read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (chat_id, user_id)
      )
    `).catch(() => {});

    // Upsert last-read
    await db.execute(sql`
      INSERT INTO sc_last_read (chat_id, user_id, last_read_at)
      VALUES (${chatId}, ${userId}, NOW())
      ON DUPLICATE KEY UPDATE last_read_at = NOW()
    `);

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
