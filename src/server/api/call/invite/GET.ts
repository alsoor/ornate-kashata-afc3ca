/**
 * GET /api/call/invite
 * Optional: ?userId=  (fallback when session cookie missing)
 *
 * Returns the latest pending invite for the current user, or { invite: null }.
 * Client polls this from RootLayout so ring works on any in-app page.
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../lib/auth/auth.js';
import { getCallInvite } from '../../../lib/callInvite.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });

    const qUser = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
    const uid = session?.user?.id || qUser;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    const invite = getCallInvite(String(uid));
    return res.json({ invite: invite || null });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
