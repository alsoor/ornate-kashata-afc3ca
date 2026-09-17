/** GET /api/room?id=ch1 — get room snapshot (members, floor holder) */
import type { Request, Response } from 'express';
import { getAuth } from '../../../lib/auth/auth.js';
import { roomSnapshot } from '../../lib/voiceRoom.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const roomId = (req.query.id as string) || 'ch1';
    return res.json(roomSnapshot(roomId));
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
