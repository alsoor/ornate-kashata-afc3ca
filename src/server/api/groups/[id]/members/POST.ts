/** POST /api/groups/:id/members — add a user to the group (admin/creator only) */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { groups, groupMembers, user } from '../../../../db/schema.js';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { eq, and } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headerMap: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headerMap[k] = v;
      else if (Array.isArray(v)) headerMap[k] = v[0] ?? '';
    }
    const session = await auth.api.getSession({ headers: new Headers(headerMap) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const groupId = parseInt(String(req.params.id), 10);
    if (isNaN(groupId)) return res.status(400).json({ error: 'Invalid group id' });

    const { userId } = req.body as { userId: string };
    if (!userId) return res.status(400).json({ error: 'userId required' });

    // Only creator/admin can add members
    const [grp] = await db.select().from(groups).where(eq(groups.id, groupId));
    if (!grp) return res.status(404).json({ error: 'Group not found' });
    if (grp.createdBy !== session.user.id) return res.status(403).json({ error: 'Only the group admin can add members' });

    // Check target user exists
    const [targetUser] = await db.select({ id: user.id, name: user.name, username: user.username, avatarUrl: user.avatarUrl })
      .from(user).where(eq(user.id, userId));
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    // Check already a member
    const [existing] = await db.select().from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
    if (existing) return res.status(409).json({ error: 'User is already a member' });

    await db.insert(groupMembers).values({ groupId, userId });

    return res.status(201).json({ ok: true, user: targetUser });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
