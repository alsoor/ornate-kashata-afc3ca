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
    const result = await db.execute(sql`SELECT pin_value FROM owner_live_pin WHERE id = 1 LIMIT 1`) as any;
    let pin: string | null = null;
    if (Array.isArray(result)) {
      const rows = Array.isArray(result[0]) ? result[0] : result;
      if (rows.length > 0 && rows[0]) pin = (rows[0] as any).pin_value ?? null;
    }
    res.json({ pin: pin ?? '' });
  } catch {
    res.json({ pin: '' });
  }
}
