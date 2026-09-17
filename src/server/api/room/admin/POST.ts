/**
 * POST /api/room/admin
 * Owner/admin actions on room members: freeze, unfreeze, kick, grant-admin, revoke-admin
 * Body: { roomId, targetId, action: 'freeze'|'unfreeze'|'kick'|'grant-admin'|'revoke-admin' }
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../lib/auth/auth.js';
import { db } from '../../../db/client.js';
import { user } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import {
  roomFreezeUser, roomUnfreezeUser, roomKickUser, roomSetAdmin, roomSnapshot,
} from '../../../lib/voiceRoom.js';

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

    const { roomId, targetId, action } = req.body as {
      roomId: string; targetId: string;
      action: 'freeze' | 'unfreeze' | 'kick' | 'grant-admin' | 'revoke-admin';
    };

    if (!roomId || !targetId || !action) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const isOwner = isPrivilegedUser(session.user);

    // Check if caller is room admin in this session
    const snap = roomSnapshot(roomId);
    const callerIsAdmin = isOwner || snap.roomAdmins.includes(session.user.id);

    if (!callerIsAdmin) {
      return res.status(403).json({ error: 'Forbidden — not an admin' });
    }

    // Non-owner admins cannot grant/revoke admin or ban
    if (!isOwner && (action === 'grant-admin' || action === 'revoke-admin')) {
      return res.status(403).json({ error: 'Only owner can manage admin roles' });
    }

    switch (action) {
      case 'freeze':
        roomFreezeUser(roomId, targetId);
        break;
      case 'unfreeze':
        roomUnfreezeUser(roomId, targetId);
        break;
      case 'kick':
        roomKickUser(roomId, targetId);
        break;
      case 'grant-admin':
        roomSetAdmin(roomId, targetId, true);
        // Persist to DB
        await db.execute(sql`UPDATE user SET is_room_admin = 1 WHERE id = ${targetId}`);
        break;
      case 'revoke-admin':
        roomSetAdmin(roomId, targetId, false);
        await db.execute(sql`UPDATE user SET is_room_admin = 0 WHERE id = ${targetId}`);
        break;
    }

    // Suppress unused import warning
    void user; void eq;

    res.json({ ok: true, snapshot: roomSnapshot(roomId) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
