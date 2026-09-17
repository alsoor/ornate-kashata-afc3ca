/** GET /api/room/active-call?channel=X
 *  Returns { active: boolean, memberCount: number }
 *  active = true when at least one member is in the room
 */
import type { Request, Response } from 'express';
import { roomSnapshot } from '../../../lib/voiceRoom.js';

export default function handler(req: Request, res: Response) {
  const channel = (req.query.channel as string | undefined) ?? '';
  if (!channel) return res.status(400).json({ error: 'channel required' });

  const snap = roomSnapshot(channel);
  const memberCount = snap.members.length;
  return res.json({ active: memberCount > 0, memberCount });
}
