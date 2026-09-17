import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { groupMessages, groupMembers, groups, user } from '../../../../db/schema.js';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { eq, and } from 'drizzle-orm';
import { sendPushToUsers } from '../../../../../server/push-helper.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const groupId = parseInt(String(req.params.id));
    const meId = session.user.id;

    const [mem] = await db.select().from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, meId)));
    if (!mem) return res.status(403).json({ error: 'Not a member' });

    const { body } = req.body as { body: string };
    if (!body?.trim()) return res.status(400).json({ error: 'Empty message' });

    await db.insert(groupMessages).values({ groupId, senderId: meId, type: 'text', body: body.trim() });

    // Push to all other members
    try {
      const [grp] = await db.select({ name: groups.name }).from(groups).where(eq(groups.id, groupId));
      const [sender] = await db.select({ name: user.name, username: user.username }).from(user).where(eq(user.id, meId));
      const senderName = sender?.name ?? sender?.username ?? 'شخص ما';
      const members = await db.select({ userId: groupMembers.userId }).from(groupMembers).where(eq(groupMembers.groupId, groupId));
      const otherIds = members.map(m => m.userId).filter(id => id !== meId);
      if (otherIds.length > 0) {
        await sendPushToUsers(otherIds, 'group', {
          title: `💬 ${grp?.name ?? 'مجموعة'}`,
          body:  `${senderName}: ${body.trim().slice(0, 80)}`,
          icon:  '/favicon.ico',
          url:   `/chat?group=${groupId}`,
          tag:   `group-${groupId}`,
        });
      }
    } catch {}

    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
