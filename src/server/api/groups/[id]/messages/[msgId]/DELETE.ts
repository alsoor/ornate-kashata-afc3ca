/**
 * DELETE /api/groups/:id/messages/:msgId — delete a group message
 * Any group member can delete any message (removes for everyone)
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { queryRows } from '../../../../secret-chat/_helpers.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const groupId = parseInt(req.params.id as string, 10);
    const msgId = parseInt(req.params.msgId as string, 10);
    if (isNaN(msgId) || isNaN(groupId)) return res.status(400).json({ error: 'Invalid id' });

    const meId = session.user.id;

    // Verify the requester is a member of this group
    const membership = await queryRows(sql`
      SELECT 1 FROM group_members WHERE group_id = ${groupId} AND user_id = ${meId} LIMIT 1
    `);
    if (!membership.length) return res.status(403).json({ error: 'Not a member' });

    await db.execute(sql`DELETE FROM group_messages WHERE id = ${msgId}`);

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete message', message: String(err) });
  }
}
