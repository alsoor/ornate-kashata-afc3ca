/**
 * GET /api/secret-chat/streak-pending
 * Returns pending (unopened) streaks sent TO the current user, grouped by sender.
 * Response: { bySender: Record<senderId, { count, mediaType: 'photo'|'video'|'mixed' }> }
 * Used by the friends list to show yellow/purple flash on sender's name.
 */
import type { Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { queryRows } from '../_helpers.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });
    const userId = session.user.id;

    // Find all unopened streaks in chats where current user is a member
    const rows = await queryRows(sql`
      SELECT m.sender_id, m.streak_media_type, COUNT(*) as cnt
      FROM secret_chat_messages m
      JOIN secret_chat_members mem ON mem.chat_id = m.chat_id AND mem.user_id = ${userId}
      WHERE m.is_streak = 1
        AND m.streak_opened_at IS NULL
        AND m.sender_id != ${userId}
      GROUP BY m.sender_id, m.streak_media_type
    `);

    // Group by sender
    const bySender: Record<string, { count: number; mediaType: 'photo' | 'video' | 'mixed' }> = {};
    for (const r of rows as any[]) {
      const sid = r.sender_id;
      const mt = r.streak_media_type as 'photo' | 'video';
      const cnt = Number(r.cnt);
      if (!bySender[sid]) {
        bySender[sid] = { count: cnt, mediaType: mt };
      } else {
        bySender[sid].count += cnt;
        bySender[sid].mediaType = bySender[sid].mediaType !== mt ? 'mixed' : mt;
      }
    }

    res.json({ bySender });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
