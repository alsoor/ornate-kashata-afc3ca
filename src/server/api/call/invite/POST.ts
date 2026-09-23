/**
 * POST /api/call/invite
 * Body: {
 *   toUserId: string,
 *   channel: string,
 *   kind?: 'voice' | 'video',
 *   hostId?: string,
 *   hostName?: string | null,
 *   hostAvatar?: string | null,
 *   members?: array,
 * }
 *
 * Caller notifies callee so the ring works while browsing any in-app page.
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../lib/auth/auth.js';
import { setCallInvite } from '../../../lib/callInvite.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });

    const body = (req.body || {}) as {
      toUserId?: string;
      channel?: string;
      kind?: string;
      video?: boolean;
      hostId?: string;
      hostName?: string | null;
      hostAvatar?: string | null;
      members?: unknown[];
    };

    const sessionUser = session?.user as
      | { id: string; name?: string | null; image?: string | null; avatarUrl?: string | null }
      | undefined;

    const hostId = sessionUser?.id || body.hostId;
    const toUserId = String(body.toUserId || '').trim();
    const channel = String(body.channel || '').trim();

    if (!hostId) return res.status(401).json({ error: 'Unauthorized' });
    if (!toUserId) return res.status(400).json({ error: 'toUserId is required' });
    if (!channel) return res.status(400).json({ error: 'channel is required' });
    if (toUserId === String(hostId)) {
      return res.status(400).json({ error: 'cannot invite yourself' });
    }

    const video = body.video === true || body.kind === 'video';
    const payload = {
      channel,
      hostId: String(hostId),
      hostName: body.hostName ?? sessionUser?.name ?? null,
      hostAvatar: body.hostAvatar ?? sessionUser?.avatarUrl ?? sessionUser?.image ?? null,
      members: Array.isArray(body.members) ? body.members : [],
      video,
      kind: video ? 'video' : 'voice',
      at: Date.now(),
    };

    setCallInvite(toUserId, payload);
    return res.json({ ok: true, invite: payload });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
