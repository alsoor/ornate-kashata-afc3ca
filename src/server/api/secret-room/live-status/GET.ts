/**
 * GET /api/secret-room/live-status
 * Returns who is currently speaking live in the secret room.
 * Visible to ALL authenticated users — used for the global LIVE banner.
 */
import type { Request, Response } from 'express';
import { getSecretRoomLiveSpeakers } from '../../../room-live-ws.js';

export default async function handler(_req: Request, res: Response) {
  const speakers = getSecretRoomLiveSpeakers();
  return res.json({
    live:     speakers.length > 0,
    speakers, // [{ userId, name }]
  });
}
