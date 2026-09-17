/**
 * POST /api/groups/unread — mark group as read (update last-read msg id)
 * Body: { groupId: number }
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { groupMessages, groupMembers, groupMessageReads } from '../../../db/schema.js';
import { getAuth } from '../../../../lib/auth/auth.js';
import { eq, and, desc } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const meId = session.user.id;
    const { groupId } = req.body as { groupId: number };
    if (!groupId) return res.status(400).json({ error: 'groupId required' });

    // Verify membership
    const [member] = await db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.userId, meId), eq(groupMembers.groupId, groupId)));
    if (!member) return res.status(403).json({ error: 'Not a member' });

    // Get latest message id in this group
    const [latest] = await db
      .select({ id: groupMessages.id })
      .from(groupMessages)
      .where(eq(groupMessages.groupId, groupId))
      .orderBy(desc(groupMessages.id))
      .limit(1);

    const lastId = latest?.id ?? 0;

    // Upsert read record
    await db
      .insert(groupMessageReads)
      .values({ userId: meId, groupId, lastReadMsgId: lastId })
      .onDuplicateKeyUpdate({ set: { lastReadMsgId: lastId } });

    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: String(e) }); }
}
