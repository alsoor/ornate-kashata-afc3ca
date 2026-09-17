import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { groups, groupMembers, user } from '../../db/schema.js';
import { getAuth } from '../../../lib/auth/auth.js';
import { eq } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headerMap: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) { if (typeof v === 'string') headerMap[k] = v; else if (Array.isArray(v)) headerMap[k] = v[0] ?? ''; }
    const session = await auth.api.getSession({ headers: new Headers(headerMap) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const meId = session.user.id;

    // Get all groups I'm a member of
    const memberships = await db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, meId));

    if (!memberships.length) return res.json([]);

    const groupIds = memberships.map((m) => m.groupId);

    // For each group, get group info + member list
    const result = [];
    for (const gid of groupIds) {
      const [grp] = await db.select().from(groups).where(eq(groups.id, gid));
      if (!grp) continue;

      const members = await db
        .select({ id: user.id, name: user.name, username: user.username })
        .from(groupMembers)
        .leftJoin(user, eq(user.id, groupMembers.userId))
        .where(eq(groupMembers.groupId, gid));

      result.push({ ...grp, members });
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
