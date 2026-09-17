/**
 * POST /api/room/pin/verify
 * Any authenticated user — verify PIN before entering a locked room
 * Body: { roomId: 'ch1', pin: '12345678' }
 */
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../../../../db/client.js';
import { roomPins } from '../../../../db/schema.js';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { eq } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const { roomId, pin } = req.body as { roomId: string; pin: string };
    if (!roomId || !pin) return res.status(400).json({ error: 'roomId and pin required' });

    const [row] = await db.select().from(roomPins).where(eq(roomPins.roomId, roomId));
    if (!row) return res.json({ ok: true }); // not locked

    const match = await bcrypt.compare(pin, row.pinHash);
    if (!match) return res.status(403).json({ error: 'Wrong PIN' });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
