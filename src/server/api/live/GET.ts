/** GET /api/live — get active live sessions from my friends */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { liveSessions, user } from '../../db/schema.js';
import { getAuth } from '../../../lib/auth/auth.js';
import { eq, isNull } from 'drizzle-orm';
import { ensureLiveChannelTypeColumns } from './POST.js';

export default async function handler(req: Request, res: Response) {
  try {
    await ensureLiveChannelTypeColumns();

    const auth = getAuth();
    const headerMap: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headerMap[k] = v;
      else if (Array.isArray(v)) headerMap[k] = v[0] ?? '';
    }
    const session = await auth.api.getSession({ headers: new Headers(headerMap) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    // Fetch all public active sessions. The homepage is a public discovery surface.
    // Keep the authenticated session check above so only signed-in users can join.

    // Fetch active sessions (endedAt IS NULL) for all hosts.
    // Agora does not expose a server-side listener count here, so the host is
    // counted as the guaranteed active participant until presence is available.
    const sessions = await db
      .select({
        id: liveSessions.id,
        hostId: liveSessions.hostId,
        title: liveSessions.title,
        channel: liveSessions.channel,
        type: liveSessions.type,
        startedAt: liveSessions.startedAt,
        hostName: user.name,
        hostUsername: user.username,
        hostAvatarUrl: user.avatarUrl,
      })
      .from(liveSessions)
      .leftJoin(user, eq(user.id, liveSessions.hostId))
      .where(isNull(liveSessions.endedAt));

    return res.json(sessions.map((liveSession) => ({ ...liveSession, participantCount: 1 })));
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}