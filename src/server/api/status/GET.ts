/**
 * GET /api/statuses
 * Returns active (non-expired) statuses for current user + their friends
 * Groups by userId, sorted: my statuses first, then friends
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../lib/auth/auth.js';
import { db } from '../../db/client.js';
import { statuses, statusViews, friends, user, userBio } from '../../db/schema.js';
import { eq, and, or, gt, inArray } from 'drizzle-orm';
import { up as runStatusMigration } from '../../db/migrations/add_status_audio_overlay.js';

// Run the migration exactly once — ensures columns exist before the first SELECT
let migrationRan = false;
let migrationPromise: Promise<void> | null = null;
function ensureMigration(): Promise<void> {
  if (migrationRan) return Promise.resolve();
  if (!migrationPromise) {
    migrationPromise = runStatusMigration()
      .then(() => { migrationRan = true; console.log('[GET /api/status] migration complete'); })
      .catch(e => {
        console.error('[GET /api/status] migration FAILED:', e);
        migrationPromise = null;
      });
  }
  return migrationPromise;
}

export default async function handler(req: Request, res: Response) {
  try {
    // Ensure all status columns exist before querying
    await ensureMigration();

    const auth    = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const meId = session.user.id;
    const now  = new Date();

    // Get friend IDs (friends table uses requesterId/addresseeId)
    const friendRows = await db.select().from(friends)
      .where(and(
        or(eq(friends.requesterId, meId), eq(friends.addresseeId, meId)),
        eq(friends.status, 'accepted'),
      ));
    const friendIds = friendRows.map(r => r.requesterId === meId ? r.addresseeId : r.requesterId);
    const visibleIds = [meId, ...friendIds];

    // Fetch active statuses
    const rows = await db.select({
      id:           statuses.id,
      userId:       statuses.userId,
      mediaUrl:     statuses.mediaUrl,
      mediaType:    statuses.mediaType,
      duration:     statuses.duration,
      expiresAt:    statuses.expiresAt,
      createdAt:    statuses.createdAt,
      audioUrl:     statuses.audioUrl,
      overlayText:  statuses.overlayText,
      overlayColor: statuses.overlayColor,
      overlayX:     statuses.overlayX,
      overlayY:     statuses.overlayY,
      musicBadgeX:     statuses.musicBadgeX,
      musicBadgeY:     statuses.musicBadgeY,
      musicBadgeScale: statuses.musicBadgeScale,
      name:         user.name,
      username:     user.username,
      avatarUrl:    user.avatarUrl,
      bio:          userBio.bio,
    })
      .from(statuses)
      .innerJoin(user, eq(statuses.userId, user.id))
      .leftJoin(userBio, eq(userBio.userId, user.id))
      .where(and(
        inArray(statuses.userId, visibleIds),
        gt(statuses.expiresAt, now),
      ));

    // Fetch which statuses current user has already viewed
    const viewedRows = await db.select({ statusId: statusViews.statusId })
      .from(statusViews)
      .where(eq(statusViews.viewerId, meId));
    const viewedSet = new Set(viewedRows.map(r => r.statusId));

    // Group by userId
    const grouped: Record<string, {
      userId: string; name: string; username: string; avatarUrl: string | null; bio: string | null;
      items: { id: number; mediaUrl: string; mediaType: string; duration: number; expiresAt: Date; createdAt: Date; seen: boolean; audioUrl: string | null; overlayText: string | null; overlayColor: string | null; overlayX: number | null; overlayY: number | null; musicBadgeX: number | null; musicBadgeY: number | null; musicBadgeScale: number | null }[];
    }> = {};

    for (const r of rows) {
      if (!grouped[r.userId]) {
        grouped[r.userId] = {
          userId: r.userId,
          name: r.username ? `@${r.username}` : (r.name ?? 'Unknown'),
          username: r.username ?? '',
          avatarUrl: r.avatarUrl ?? null,
          bio: r.bio ?? null,
          items: [],
        };
      }
      grouped[r.userId].items.push({
        id: r.id,
        mediaUrl: r.mediaUrl,
        mediaType: r.mediaType,
        duration: r.duration,
        expiresAt: r.expiresAt,
        createdAt: r.createdAt,
        seen: viewedSet.has(r.id),
        audioUrl:     r.audioUrl    ?? null,
        overlayText:  r.overlayText ?? null,
        overlayColor: r.overlayColor ?? null,
        overlayX:     r.overlayX    ?? null,
        overlayY:     r.overlayY    ?? null,
        musicBadgeX:     r.musicBadgeX     ?? null,
        musicBadgeY:     r.musicBadgeY     ?? null,
        musicBadgeScale: r.musicBadgeScale ?? null,
      });
    }

    // Sort: my statuses first
    const list = Object.values(grouped).sort((a, b) => {
      if (a.userId === meId) return -1;
      if (b.userId === meId) return 1;
      return 0;
    });

    res.json({ statuses: list, myId: meId });
  } catch (e) {
    console.error('[GET /api/statuses]', e);
    res.status(500).json({ error: 'Failed to fetch statuses' });
  }
}
