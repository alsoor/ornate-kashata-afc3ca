/**
 * POST /api/call/invite/clear
 * Body: { userId?: string, channel?: string }
 *
 * Clears pending invite after answer / decline / timeout.
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { clearCallInvite } from '../../../../lib/callInvite.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });

    const body = (req.body || {}) as { userId?: string; channel?: string };
    const uid = session?.user?.id || body.userId;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    clearCallInvite(String(uid), body.channel ? String(body.channel) : undefined);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
