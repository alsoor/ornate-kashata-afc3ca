/**
 * GET /api/users/by-username?username=xxx
 * Public profile lookup — no auth required.
 * Used by /share page and OG image generation.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { user as userTable, userBio } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';

const HEARTBEAT_THRESHOLD_MS = 90_000;

export default async function handler(req: Request, res: Response) {
  try {
    const username = String(req.query.username ?? '').trim().replace(/^@/, '');
    if (!username) return res.status(400).json({ error: 'username required' });

    const [u] = await db
      .select({
        id:         userTable.id,
        name:       userTable.name,
        username:   userTable.username,
        avatarUrl:  userTable.avatarUrl,
        nameColor:  userTable.nameColor,
        lastSeenAt: userTable.lastSeenAt,
      })
      .from(userTable)
      .where(eq(userTable.username, username))
      .limit(1);

    if (!u) return res.status(404).json({ error: 'User not found' });

    // Fetch bio from separate table
    const [bioRow] = await db
      .select({ bio: userBio.bio })
      .from(userBio)
      .where(eq(userBio.userId, u.id))
      .limit(1);

    const online = u.lastSeenAt
      ? Date.now() - new Date(u.lastSeenAt).getTime() < HEARTBEAT_THRESHOLD_MS
      : false;

    return res.json({
      id:        u.id,
      name:      u.name,
      username:  u.username,
      avatarUrl: u.avatarUrl,
      nameColor: u.nameColor ?? null,
      bio:       bioRow?.bio ?? null,
      online,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
