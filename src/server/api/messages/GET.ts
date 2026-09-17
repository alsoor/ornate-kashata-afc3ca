/**
 * GET /api/messages?with=<userId>
 * Fetch conversation between current user and another user (requires auth)
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { messages, user } from '../../db/schema.js';
import { getAuth } from '../../../lib/auth/auth.js';
import { eq, and, or, asc, isNull } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const meId = session.user.id;
    const withId = req.query.with as string;
    if (!withId) return res.status(400).json({ error: 'Missing ?with= param' });

    const rows = await db
      .select({
        id: messages.id,
        senderId: messages.senderId,
        receiverId: messages.receiverId,
        type: messages.type,
        body: messages.body,
        duration: messages.duration,
        readAt: messages.readAt,
        createdAt: messages.createdAt,
        senderName: user.name,
        senderUsername: user.username,
        senderAvatarUrl: user.avatarUrl,
        senderNameColor: user.nameColor,
      })
      .from(messages)
      .leftJoin(user, eq(user.id, messages.senderId))
      .where(
        or(
          and(eq(messages.senderId, meId), eq(messages.receiverId, withId)),
          and(eq(messages.senderId, withId), eq(messages.receiverId, meId)),
        ),
      )
      .orderBy(asc(messages.createdAt))
      .limit(200);

    // Fetch streak fields separately (not in Drizzle schema yet)
    const ids = rows.map(r => r.id);
    let streakMap: Record<number, { isStreak: boolean; streakOpenedAt: string | null }> = {};
    if (ids.length > 0) {
      try {
        const { sql: sqlTag } = await import('drizzle-orm');
        const idList = ids.join(',');
        const streakRows = (await (db as any).execute(sqlTag`
          SELECT id, is_streak, streak_opened_at FROM messages WHERE id IN (${sqlTag.raw(idList)})
        `) as unknown as [any[]])[0];
        for (const r of streakRows) {
          streakMap[r.id] = { isStreak: !!r.is_streak, streakOpenedAt: r.streak_opened_at };
        }
      } catch { /* streak columns may not exist yet */ }
    }

    const enriched = rows.map(r => ({
      ...r,
      isStreak: streakMap[r.id]?.isStreak ?? false,
      streakOpenedAt: streakMap[r.id]?.streakOpenedAt ?? null,
    }));

    // Mark incoming unread messages as read
    await db
      .update(messages)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(messages.senderId, withId),
          eq(messages.receiverId, meId),
          isNull(messages.readAt),
        ),
      );

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch messages', message: String(error) });
  }
}
