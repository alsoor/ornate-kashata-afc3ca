/** GET /api/users/me/privacy */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { userPrivacy } from '../../../../db/schema.js';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { eq } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const rows = await db.select().from(userPrivacy).where(eq(userPrivacy.userId, session.user.id));
    if (!rows.length) return res.json({ showLastSeen: true, whoCanContact: 'everyone', whoCanCall: 'everyone', isPrivate: false });
    const r = rows[0];
    return res.json({ showLastSeen: r.showLastSeen, whoCanContact: r.whoCanContact, whoCanCall: r.whoCanCall, isPrivate: r.isPrivate ?? false });
  } catch (e) { return res.status(500).json({ error: String(e) }); }
}
