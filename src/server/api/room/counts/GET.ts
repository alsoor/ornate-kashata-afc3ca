/** GET /api/room/counts — returns member count for channels 1-10 */
import type { Request, Response } from 'express';
import { roomCount } from '../../../lib/voiceRoom.js';

export default async function handler(_req: Request, res: Response) {
  const counts: Record<string, number> = {};
  for (let i = 1; i <= 10; i++) {
    counts[`ch${i}`] = roomCount(`ch${i}`);
  }
  return res.json(counts);
}
