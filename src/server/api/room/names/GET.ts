/**
 * GET /api/room/names
 * Returns custom names for all 8 rooms.
 * Public — no auth required (names are visible to everyone).
 * Response: { ch1: "name", ch2: "name", … }
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { roomNames } from '../../../db/schema.js';

const CHANNELS = ['ch1','ch2','ch3','ch4','ch5','ch6','ch7','ch8'];

export default async function handler(_req: Request, res: Response) {
  try {
    const rows = await db.select().from(roomNames);
    const map: Record<string, string> = {};
    for (const r of rows) map[r.roomId] = r.name;
    // Fill defaults for channels without a custom name
    const result: Record<string, string> = {};
    for (const ch of CHANNELS) {
      result[ch] = map[ch] ?? '';
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
