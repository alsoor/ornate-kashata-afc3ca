/**
 * POST /api/call/invite/clear
 * Body: { userId?: string, toUserId?: string, channel?: string }
 *
 * Clears the pending invite for the person who is ringing.
 * The caller session is the host, so the callee id must be taken from the body.
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

    const body = (req.body || {}) as {
      userId?: string;
      toUserId?: string;
      targetUserId?: string;
      channel?: string;
    };
    if (!session?.user?.id && !body.userId && !body.toUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const channel = body.channel ? String(body.channel) : undefined;
    const ids = [body.toUserId, body.userId, body.targetUserId, session?.user?.id]
      .map(v => String(v || '').trim())
      .filter(Boolean);
    for (const uid of Array.from(new Set(ids))) clearCallInvite(uid, channel);
    return res.json({ ok: true, cleared: Array.from(new Set(ids)) });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
