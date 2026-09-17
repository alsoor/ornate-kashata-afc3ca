import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { groupMessages, groupMembers, user } from '../../../../db/schema.js';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { eq, and, asc } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const groupId = parseInt(String(req.params.id));
    const meId = session.user.id;

    // Verify membership
    const [mem] = await db.select().from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, meId)));
    if (!mem) return res.status(403).json({ error: 'Not a member' });

    const msgs = await db
      .select({
        id: groupMessages.id,
        groupId: groupMessages.groupId,
        senderId: groupMessages.senderId,
        type: groupMessages.type,
        body: groupMessages.body,
        duration: groupMessages.duration,
        createdAt: groupMessages.createdAt,
        senderName: user.name,
        senderUsername: user.username,
        senderAvatarUrl: user.avatarUrl,
        senderImage: user.image,
        senderNameColor: user.nameColor,
      })
      .from(groupMessages)
      .leftJoin(user, eq(user.id, groupMessages.senderId))
      .where(eq(groupMessages.groupId, groupId))
      .orderBy(asc(groupMessages.createdAt));

    // Normalise avatarUrl: prefer avatarUrl, fall back to image (BetterAuth field)
    const normalised = msgs.map(m => ({
      ...m,
      senderAvatarUrl: m.senderAvatarUrl ?? m.senderImage ?? null,
      senderImage: undefined,
    }));

    res.json(normalised);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
