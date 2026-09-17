import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { groups, groupMembers, user } from '../../../db/schema.js';
import { getAuth } from '../../../../lib/auth/auth.js';
import { eq } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headerMap: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) { if (typeof v === 'string') headerMap[k] = v; else if (Array.isArray(v)) headerMap[k] = v[0] ?? ''; }
    const session = await auth.api.getSession({ headers: new Headers(headerMap) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const groupId = parseInt(String(req.params.id), 10);
    if (isNaN(groupId)) return res.status(400).json({ error: 'Invalid group id' });

    const [grp] = await db.select().from(groups).where(eq(groups.id, groupId));
    if (!grp) return res.status(404).json({ error: 'Group not found' });

    const members = await db
      .select({ id: user.id, name: user.name, username: user.username, avatarUrl: user.avatarUrl })
      .from(groupMembers)
      .leftJoin(user, eq(user.id, groupMembers.userId))
      .where(eq(groupMembers.groupId, groupId));

    res.json({ ...grp, members });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
