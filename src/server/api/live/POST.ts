/** POST /api/live — start a live session
 * Self-migrates: adds `channel`/`type` columns to live_sessions on first
 * run if they're missing (no separate migration file / ssr.ts registration
 * needed — this project auto-discovers route files).
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { liveSessions, friends, user } from '../../db/schema.js';
import { getAuth } from '../../../lib/auth/auth.js';
import { eq, or, and, sql } from 'drizzle-orm';
import { sendPushToUsers } from '../../../server/push-helper.js';

// Runs at most once per server process — checked lazily on first request
// instead of at boot, since there's no central startup hook to call this
// from. Safe to run concurrently: each ALTER is guarded by its own
// information_schema check, and a second concurrent request just repeats
// the (cheap) check and no-ops if the column already landed.
let channelTypeReady: Promise<void> | null = null;
export async function ensureLiveChannelTypeColumns(): Promise<void> {
  if (!channelTypeReady) {
    channelTypeReady = (async () => {
      try {
        const [rows] = await db.execute(sql`
          SELECT COLUMN_NAME as name FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'live_sessions'
            AND COLUMN_NAME IN ('channel', 'type')
        `);
        const existing = new Set((rows as unknown as Array<{ name: string }>).map((r) => r.name));
        if (!existing.has('channel')) {
          await db.execute(sql`ALTER TABLE live_sessions ADD COLUMN channel VARCHAR(64) NOT NULL DEFAULT '' AFTER title`);
        }
        if (!existing.has('type')) {
          await db.execute(sql`ALTER TABLE live_sessions ADD COLUMN type VARCHAR(16) NOT NULL DEFAULT 'camera' AFTER channel`);
        }
      } catch (e) {
        console.error('[live/POST] ensureLiveChannelTypeColumns error:', e);
        channelTypeReady = null; // let the next request retry instead of caching a failure forever
      }
    })();
  }
  return channelTypeReady;
}

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

    // End any existing open session for this host
    await db.update(liveSessions)
      .set({ endedAt: new Date() })
      .where(eq(liveSessions.hostId, session.user.id));

    const { title, channel, type } = req.body as { title?: string; channel?: string; type?: 'camera' | 'audio' };
    if (!channel || typeof channel !== 'string') return res.status(400).json({ error: 'channel is required' });
    if (type !== 'camera' && type !== 'audio') return res.status(400).json({ error: "type must be 'camera' or 'audio'" });

    // Use an explicit column list so the live endpoint remains compatible with
    // databases that were created before optional recording/chat columns existed.
    // Drizzle otherwise includes every schema column in the INSERT, including
    // columns that may not yet exist on an already-deployed live_sessions table.
    const result = await db.execute(sql`
      INSERT INTO live_sessions (host_id, title, channel, type)
      VALUES (${session.user.id}, ${title?.trim() || null}, ${channel}, ${type})
    `);
    const insertId = Number((result as unknown as { insertId?: number }).insertId ?? 0);

    // Push to all friends
    try {
      const [host] = await db.select({ name: user.name, username: user.username, avatarUrl: user.avatarUrl })
        .from(user).where(eq(user.id, session.user.id));
      const hostName = host?.name ?? host?.username ?? 'شخص ما';

      const friendRows = await db.select({ requesterId: friends.requesterId, addresseeId: friends.addresseeId })
        .from(friends)
        .where(and(
          or(eq(friends.requesterId, session.user.id), eq(friends.addresseeId, session.user.id)),
          eq(friends.status, 'accepted'),
        ));
      const friendIds = friendRows.map(f => f.requesterId === session.user.id ? f.addresseeId : f.requesterId);
      if (friendIds.length > 0) {
        await sendPushToUsers(friendIds, 'live', {
          title: `🔴 ${hostName} يبث الآن`,
          body:  title?.trim() ? `"${title.trim()}"` : 'انضم للبث المباشر',
          icon:  (host as any)?.avatarUrl ?? '/favicon.ico',
          url:   `/live?action=watch&channel=${encodeURIComponent(channel)}&type=${type}&hostId=${encodeURIComponent(session.user.id)}&hostName=${encodeURIComponent(hostName)}${(host as any)?.avatarUrl ? `&hostAvatar=${encodeURIComponent((host as any).avatarUrl)}` : ''}`,
          tag:   `live-${session.user.id}`,
        });
      }
    } catch {}

    return res.status(201).json({ id: insertId, hostId: session.user.id, title: title?.trim() || null, channel, type });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}