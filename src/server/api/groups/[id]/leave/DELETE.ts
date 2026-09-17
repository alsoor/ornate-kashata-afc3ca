/**
 * DELETE /api/groups/:id/leave — leave a group (removes membership)
 * If the user is the last member, the group is deleted entirely.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { groups, groupMembers } from '../../../../db/schema.js';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { eq, and } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const groupId = parseInt(req.params.id as string, 10);
    if (isNaN(groupId)) return res.status(400).json({ error: 'Invalid group id' });

    const meId = session.user.id;

    // Remove membership
    await db.delete(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, meId)));

    // Check if any members remain
    const remaining = await db.select({ id: groupMembers.id })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, groupId));

    // If no members left, delete the group entirely
    if (remaining.length === 0) {
      await db.delete(groups).where(eq(groups.id, groupId));
    }

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to leave group', message: String(err) });
  }
}
