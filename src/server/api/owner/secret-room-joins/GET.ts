import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

const OWNER_EMAILS = new Set(['alsoor@mail.com', 'stooorna@mail.com']);
const PRIVILEGED_USERNAMES = new Set(['q8', 'stooorna']);

function isPrivilegedUser(user: { email?: string | null; username?: string | null; name?: string | null }) {
  const username = (user.username ?? user.name ?? '').replace(/^@/, '').trim().toLowerCase();
  const email = (user.email ?? '').toLowerCase().trim(); return OWNER_EMAILS.has(email) || PRIVILEGED_USERNAMES.has(username);
}

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user || !isPrivilegedUser(session.user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const result = await db.execute(sql`
      SELECT user_id, user_name, joined_at
      FROM secret_room_joins
      ORDER BY joined_at DESC
      LIMIT 50
    `) as any;
    const rows = Array.isArray(result[0]) ? result[0] : result;
    res.json({ joins: rows });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
