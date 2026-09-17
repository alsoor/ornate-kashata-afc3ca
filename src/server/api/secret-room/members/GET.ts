/**
 * GET /api/secret-room/members
 * Returns all users currently connected (joined) to the secret room.
 */
import type { Request, Response } from 'express';
import { getSecretRoomMembers } from '../../../room-live-ws.js';

export default async function handler(_req: Request, res: Response) {
  const members = getSecretRoomMembers();
  return res.json({ members }); // [{ userId, name, username }]
}
