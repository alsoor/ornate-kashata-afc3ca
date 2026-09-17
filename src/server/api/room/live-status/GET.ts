/**
 * GET /api/room/live-status
 * Returns floor holder (speaker) per room + member count.
 * Used by ChannelWaves to show LIVE badge on active rooms.
 */
import type { Request, Response } from 'express';
import { roomSnapshot, roomCount } from '../../../lib/voiceRoom.js';

export default async function handler(_req: Request, res: Response) {
  const result: Record<string, { live: boolean; speakerName: string | null; count: number }> = {};

  for (let i = 1; i <= 10; i++) {
    const id       = `ch${i}`;
    const snap     = roomSnapshot(id);
    const count    = roomCount(id);
    const speaker  = snap.floor
      ? (snap.members.find(m => m.userId === snap.floor) ?? null)
      : null;

    result[id] = {
      live:        !!snap.floor,
      speakerName: speaker?.name ?? speaker?.username ?? null,
      count,
    };
  }

  return res.json(result);
}
