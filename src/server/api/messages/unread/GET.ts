/** GET /api/messages/unread — returns total unread count + per-sender breakdown with names */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { messages, user } from '../../../db/schema.js';
import { getAuth } from '../../../../lib/auth/auth.js';
import { eq, and, isNull, sql, inArray } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const meId = session.user.id;

    // Count unread per sender
    const rows = await db
      .select({
        senderId: messages.senderId,
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(messages)
      .where(and(eq(messages.receiverId, meId), isNull(messages.readAt)))
      .groupBy(messages.senderId);

    const bySender: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      bySender[r.senderId] = Number(r.count);
      total += Number(r.count);
    }

    // Fetch sender names + avatars
    const senderIds = Object.keys(bySender);
    const senderInfo: Record<string, { name: string | null; username: string | null; avatarUrl: string | null }> = {};

    if (senderIds.length > 0) {
      const users = await db
        .select({ id: user.id, name: user.name, username: user.username, avatarUrl: user.avatarUrl })
        .from(user)
        .where(inArray(user.id, senderIds));
      for (const u of users) {
        senderInfo[u.id] = { name: u.name, username: u.username, avatarUrl: u.avatarUrl };
      }
    }

    return res.json({ total, bySender, senderInfo });
  } catch (e) { return res.status(500).json({ error: String(e) }); }
}
