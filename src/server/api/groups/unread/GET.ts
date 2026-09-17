/**
 * GET /api/groups/unread — returns total unread group messages count
 * Uses group_message_reads to track last-read per user per group.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { groupMessages, groupMembers, groupMessageReads } from '../../../db/schema.js';
import { getAuth } from '../../../../lib/auth/auth.js';
import { eq, and, gt, sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const meId = session.user.id;

    // Get all groups I'm in
    const memberships = await db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, meId));

    if (memberships.length === 0) return res.json({ total: 0, byGroup: {} });

    let total = 0;
    const byGroup: Record<number, number> = {};

    for (const { groupId } of memberships) {
      // Get my last-read msg id for this group
      const [readRow] = await db
        .select({ lastReadMsgId: groupMessageReads.lastReadMsgId })
        .from(groupMessageReads)
        .where(and(eq(groupMessageReads.userId, meId), eq(groupMessageReads.groupId, groupId)));

      const lastReadId = readRow?.lastReadMsgId ?? 0;

      // Count messages after lastReadId that are NOT from me
      const [countRow] = await db
        .select({ count: sql<number>`COUNT(*)`.as('count') })
        .from(groupMessages)
        .where(
          and(
            eq(groupMessages.groupId, groupId),
            gt(groupMessages.id, lastReadId),
            sql`${groupMessages.senderId} != ${meId}`
          )
        );

      const count = Number(countRow?.count ?? 0);
      if (count > 0) {
        byGroup[groupId] = count;
        total += count;
      }
    }

    return res.json({ total, byGroup });
  } catch (e) { return res.status(500).json({ error: String(e) }); }
}
