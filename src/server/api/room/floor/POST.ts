/** POST /api/room/floor — take, release, or force-release the floor */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../lib/auth/auth.js';
import { roomTakeFloor, roomReleaseFloor, roomForceRelease } from '../../../lib/voiceRoom.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });

    const { roomId = 'ch1', action, userId: bodyUserId } = req.body as {
      roomId?: string; action: 'take' | 'release' | 'forceRelease'; userId?: string;
    };
    const uid = session?.user?.id ?? bodyUserId;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    if (action === 'take') {
      const granted = roomTakeFloor(roomId, uid);
      return res.json({ granted });
    } else if (action === 'forceRelease') {
      roomForceRelease(roomId, uid);
      return res.json({ ok: true });
    } else {
      roomReleaseFloor(roomId, uid);
      return res.json({ ok: true });
    }
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
