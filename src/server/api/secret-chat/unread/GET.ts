/**
 * GET /api/secret-chat/unread
 * Returns unread message counts per secret chat for the current user.
 * Also returns peerUserId for DM chats so the frontend can map friend → unread.
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

    // Get all chats this user is a member of, with is_dm flag
    const memberRows = (await db.execute(
      sql`SELECT scm.chat_id, sc.is_dm
          FROM secret_chat_members scm
          JOIN secret_chats sc ON sc.id = scm.chat_id
          WHERE scm.user_id = ${userId}`
    )) as unknown as [{ chat_id: number; is_dm: number }[]];

    const chats = (memberRows[0] ?? []) as { chat_id: number; is_dm: number }[];
    if (chats.length === 0) return res.json({ total: 0, byChatId: {}, peerByChat: {} });

    const byChatId: Record<number, number> = {};
    const peerByChat: Record<number, string> = {}; // chatId → peer userId (for DM chats)
    let total = 0;

    for (const { chat_id: chatId, is_dm: isDm } of chats) {
      // Get last read timestamp
      let lastRead: Date | null = null;
      try {
        const lrRows = (await db.execute(
          sql`SELECT last_read_at FROM sc_last_read WHERE chat_id = ${chatId} AND user_id = ${userId} LIMIT 1`
        )) as unknown as [{ last_read_at: string | null }[]];
        const lrRow = (lrRows[0] ?? [])[0] as { last_read_at: string | null } | undefined;
        if (lrRow?.last_read_at) lastRead = new Date(lrRow.last_read_at);
      } catch { /* table may not exist */ }

      // Count unread messages from others
      let count = 0;
      try {
        const cntRows = lastRead
          ? (await db.execute(
              sql`SELECT COUNT(*) as cnt FROM secret_messages WHERE chat_id = ${chatId} AND sender_id != ${userId} AND created_at > ${lastRead}`
            )) as unknown as [{ cnt: number }[]]
          : (await db.execute(
              sql`SELECT COUNT(*) as cnt FROM secret_messages WHERE chat_id = ${chatId} AND sender_id != ${userId}`
            )) as unknown as [{ cnt: number }[]];
        count = Number(((cntRows[0] ?? [])[0] as { cnt: number } | undefined)?.cnt ?? 0);
      } catch { count = 0; }

      if (count > 0) {
        byChatId[chatId] = count;
        total += count;
      }

      // For DM chats, find the peer user id
      if (isDm) {
        try {
          const peerRows = (await db.execute(
            sql`SELECT user_id FROM secret_chat_members WHERE chat_id = ${chatId} AND user_id != ${userId} LIMIT 1`
          )) as unknown as [{ user_id: string }[]];
          const peer = ((peerRows[0] ?? [])[0] as { user_id: string } | undefined)?.user_id;
          if (peer) peerByChat[chatId] = peer;
        } catch { /* ignore */ }
      }
    }

    return res.json({ total, byChatId, peerByChat });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
