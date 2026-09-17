/**
 * PATCH /api/room/names
 * Owner-only: set a custom name for a room.
 * Body: { roomId: "ch1", name: "الديوانية" }
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { roomNames } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

const OWNER_EMAILS = new Set(['alsoor@mail.com', 'stooorna@mail.com']);
const PRIVILEGED_USERNAMES = new Set(['q8', 'stooorna']);

function isPrivilegedUser(user: { email?: string | null; username?: string | null; name?: string | null }) {
  const username = (user.username ?? user.name ?? '').replace(/^@/, '').trim().toLowerCase();
  const email = (user.email ?? '').toLowerCase().trim(); return OWNER_EMAILS.has(email) || PRIVILEGED_USERNAMES.has(username);
}
const CHANNELS    = new Set(['ch1','ch2','ch3','ch4','ch5','ch6','ch7','ch8']);

export default async function handler(req: Request, res: Response) {
  // Auth check
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
  if (!session?.user || !isPrivilegedUser(session.user)) {
    return res.status(403).json({ error: 'Owner only' });
  }

  const { roomId, name } = req.body as { roomId?: string; name?: string };
  if (!roomId || !CHANNELS.has(roomId)) {
    return res.status(400).json({ error: 'Invalid roomId' });
  }
  const trimmed = (name ?? '').trim().slice(0, 40);

  try {
    if (trimmed === '') {
      // Empty name = delete custom name (revert to default number)
      await db.delete(roomNames).where(eq(roomNames.roomId, roomId));
    } else {
      await db
        .insert(roomNames)
        .values({ roomId, name: trimmed })
        .onDuplicateKeyUpdate({ set: { name: trimmed } });
    }
    res.json({ ok: true, roomId, name: trimmed });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
