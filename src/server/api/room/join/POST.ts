/** POST /api/room/join — join a voice room */
import { db } from '../../../../db/client';
import { schema } from '../../../../db/schema';
import type { Request, Response } from 'express';
import { getAuth } from '../../../../lib/auth/auth.js';
import { roomJoin } from '../../../lib/voiceRoom.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });

    const { roomId = 'ch1', userId: bodyUserId, name: bodyName } = req.body as {
      roomId?: string; userId?: string; name?: string;
    };

    // Accept session user OR userId passed in body (preview / cookie-less clients)
    const uid  = session?.user?.id ?? bodyUserId;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    const u = session?.user as { id: string; name?: string | null; username?: string | null; image?: string | null } | undefined;

    let avatarUrl: string | null = null;
    if (u) {
      try {
        const { db } = await import('../../../db/client.js');
        const { user: userTable } = await import('../../../db/schema.js');
        const { eq } = await import('drizzle-orm');
        const rows = await db.select({ avatarUrl: userTable.avatarUrl, image: userTable.image })
          .from(userTable).where(eq(userTable.id, uid));
        avatarUrl = rows[0]?.avatarUrl ?? rows[0]?.image ?? u.image ?? null;
      } catch { /* non-fatal */ }
    }

    roomJoin(roomId, {
      userId: uid,
      name: u?.name ?? bodyName ?? null,
      username: (u as Record<string, unknown> | undefined)?.username as string | null ?? null,
      avatarUrl,
      joinedAt: Date.now(),
    });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
