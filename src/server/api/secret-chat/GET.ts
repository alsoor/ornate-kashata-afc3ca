// GET /api/secret-chat — list secret chats the current user is a member of
import type { Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { queryRows } from './_helpers.js';

export default async function handler(req: Request, res: Response) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
  if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });
  const userId = session.user.id;

  try {
    const rows = await queryRows(sql`
      SELECT sc.id, sc.name, sc.created_by, sc.created_at,
             (SELECT COUNT(*) FROM secret_chat_members WHERE chat_id = sc.id) AS member_count
      FROM secret_chats sc
      INNER JOIN secret_chat_members scm ON scm.chat_id = sc.id AND scm.user_id = ${userId}
      ORDER BY sc.created_at DESC
    `);
    res.json(rows);
  } catch (e) {
    console.error('[secret-chat GET]', e);
    res.status(500).json({ error: 'Server error' });
  }
}
