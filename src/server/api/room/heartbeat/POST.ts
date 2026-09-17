/** POST /api/room/heartbeat — keep member alive in room */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../lib/auth/auth.js';
import { roomHeartbeat } from '../../../lib/voiceRoom.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });

    const { roomId = 'ch1', userId: bodyUserId } = req.body as { roomId?: string; userId?: string };
    const uid = session?.user?.id ?? bodyUserId;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    roomHeartbeat(roomId, uid);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
