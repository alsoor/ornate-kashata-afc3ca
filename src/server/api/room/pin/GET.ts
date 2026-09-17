/**
 * GET /api/room/pin — returns which rooms are locked (no PIN values exposed)
 * Returns: { ch1: true, ch2: false, … }
 * Public endpoint — no auth required (lock status is not sensitive)
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { roomPins } from '../../../db/schema.js';

export default async function handler(req: Request, res: Response) {
  try {
    const rows = await db.select({ roomId: roomPins.roomId }).from(roomPins);
    const locked: Record<string, boolean> = {};
    for (const r of rows) locked[r.roomId] = true;
    res.json(locked);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
