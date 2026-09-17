/**
 * DELETE /api/groups/:id/messages/clear
 * Deletes ALL messages in a group chat.
 * Only group members are allowed to trigger this.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { queryRows } from '../../../../secret-chat/_helpers.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const groupId = parseInt(req.params.id as string, 10);
    if (isNaN(groupId)) return res.status(400).json({ error: 'Invalid group id' });

    const userId = session.user.id;

    // Verify the caller is a member of the group
    const membership = await queryRows(sql`
      SELECT id FROM group_members WHERE group_id = ${groupId} AND user_id = ${userId} LIMIT 1
    `);
    if (!membership.length) return res.status(403).json({ error: 'Not a member of this group' });

    await db.execute(sql`DELETE FROM group_messages WHERE group_id = ${groupId}`);

    return res.json({ ok: true });
  } catch (err) {
    console.error('[groups/messages/clear]', err);
    return res.status(500).json({ error: 'Failed to clear group history', message: String(err) });
  }
}
