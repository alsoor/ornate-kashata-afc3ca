/**
 * POST /api/room/pin
 * Owner only — set or clear a PIN for a room
 * Body: { roomId: 'ch1', pin: '12345678' }  → set
 *       { roomId: 'ch1', pin: null }         → clear
 */
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../../../db/client.js';
import { roomPins } from '../../../db/schema.js';
import { getAuth } from '../../../../lib/auth/auth.js';
import { eq } from 'drizzle-orm';

const OWNER_EMAILS = new Set(['alsoor@mail.com', 'stooorna@mail.com']);
const PRIVILEGED_USERNAMES = new Set(['q8', 'stooorna']);

function isPrivilegedUser(user: { email?: string | null; username?: string | null; name?: string | null }) {
  const username = (user.username ?? user.name ?? '').replace(/^@/, '').trim().toLowerCase();
  const email = (user.email ?? '').toLowerCase().trim(); return OWNER_EMAILS.has(email) || PRIVILEGED_USERNAMES.has(username);
}

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!isPrivilegedUser(session.user)) return res.status(403).json({ error: 'Forbidden' });

    const { roomId, pin } = req.body as { roomId: string; pin: string | null };
    if (!roomId || !/^ch[1-8]$/.test(roomId)) return res.status(400).json({ error: 'Invalid roomId' });

    if (!pin) {
      // Clear PIN
      await db.delete(roomPins).where(eq(roomPins.roomId, roomId));
      return res.json({ ok: true, locked: false });
    }

    if (!/^\d{8}$/.test(pin)) return res.status(400).json({ error: 'PIN must be exactly 8 digits' });

    const pinHash = await bcrypt.hash(pin, 10);
    await db
      .insert(roomPins)
      .values({ roomId, pinHash })
      .onDuplicateKeyUpdate({ set: { pinHash } });

    res.json({ ok: true, locked: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
