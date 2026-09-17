import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { ownerHighlights } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
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

    const { userId } = req.body as { userId?: string };
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const existing = await db.select().from(ownerHighlights).where(eq(ownerHighlights.targetUserId, userId));
    if (existing.length > 0) {
      await db.delete(ownerHighlights).where(eq(ownerHighlights.targetUserId, userId));
      res.json({ highlighted: false });
    } else {
      await db.insert(ownerHighlights).values({ targetUserId: userId });
      res.json({ highlighted: true });
    }
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
