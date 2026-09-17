/**
 * POST /api/secret-chat/dm
 * Auto-create or retrieve a 1-on-1 secret chat between the current user and peerId.
 * No PIN required — used by the DM chat page.
 * Body: { peerId: string }
 * Returns: { chatId: number }
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { queryRows } from '../_helpers.js';

export default async function handler(req: Request, res: Response) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
  if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

  const meId = session.user.id;
  const { peerId } = req.body as { peerId?: string };
  if (!peerId) return res.status(400).json({ error: 'peerId required' });

  try {
    // Look for an existing DM secret chat between the two users
    // A DM secret chat has exactly 2 members: meId and peerId
    const existing = await queryRows(sql`
      SELECT sc.id FROM secret_chats sc
      INNER JOIN secret_chat_members m1 ON m1.chat_id = sc.id AND m1.user_id = ${meId}
      INNER JOIN secret_chat_members m2 ON m2.chat_id = sc.id AND m2.user_id = ${peerId}
      WHERE sc.is_dm = 1
      LIMIT 1
    `);

    if (existing.length > 0) {
      return res.json({ chatId: (existing[0] as { id: number }).id });
    }

    // Create a new DM secret chat (no PIN — pin_hash = NULL)
    const insertResult = await db.execute(sql`
      INSERT INTO secret_chats (name, pin_hash, created_by, is_dm)
      VALUES ('dm', NULL, ${meId}, 1)
    `);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chatId = Number((insertResult as any)[0]?.insertId ?? 0);
    if (!chatId) return res.status(500).json({ error: 'Failed to create DM chat' });

    // Add both members
    await db.execute(sql`INSERT IGNORE INTO secret_chat_members (chat_id, user_id) VALUES (${chatId}, ${meId})`);
    await db.execute(sql`INSERT IGNORE INTO secret_chat_members (chat_id, user_id) VALUES (${chatId}, ${peerId})`);

    return res.status(201).json({ chatId });
  } catch (e) {
    console.error('[secret-chat/dm POST]', e);
    res.status(500).json({ error: 'Server error', detail: String(e) });
  }
}
