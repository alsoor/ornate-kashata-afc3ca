/**
 * POST /api/support/complete
 * Called by owner when they mark a support task as done.
 * Schedules a WebSocket "support_thread_clear" event to the user after TTL_MS.
 * This ensures both sides (owner + user) have their localStorage wiped.
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../lib/auth/auth.js';
import { sendToUser } from '../../../call-signaling-ws.js';

const OWNER_EMAILS = new Set(['alsoor@mail.com', 'stooorna@mail.com']);
const PRIVILEGED_USERNAMES = new Set(['q8', 'stooorna']);
const TTL_MS = 10 * 60 * 1000; // 10 minutes

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

    const { userId, deleteAfterMs } = req.body as { userId?: string; deleteAfterMs?: number };
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const delay = typeof deleteAfterMs === 'number' ? deleteAfterMs : TTL_MS;

    // Schedule the clear event to fire after TTL — sent to BOTH the user and the owner
    setTimeout(() => {
      // Notify the user
      sendToUser(userId, {
        type: 'support_thread_clear',
        ownerId: session.user.id,
      });
      // Notify the owner themselves so their side clears too
      sendToUser(session.user.id, {
        type: 'support_thread_clear',
        targetUserId: userId,
      });
    }, delay);

    res.json({ ok: true, clearAfterMs: delay });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
