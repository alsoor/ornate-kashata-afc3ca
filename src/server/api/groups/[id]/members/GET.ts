import type { Request, Response } from 'express';
import { db } from '@/server/db/client.js';
import { groupMembers } from '@/server/db/schema.js';
import { eq } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  const groupId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!groupId) return res.status(400).json({ error: 'groupId required' });
  try {
    const members = await db.select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, parseInt(groupId, 10)));
    res.json(members);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
