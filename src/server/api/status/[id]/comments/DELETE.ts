import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

// DELETE /api/status/:id
// Deletes the story (status) row itself, so it disappears for everyone who
// fetches /api/status (friends included) — not just on the device that
// deleted it. Place this file as a SIBLING of the existing "comments" folder,
// i.e. one level above it:
//   .../api/status/[id]/DELETE.ts   <-- this file
//   .../api/status/[id]/comments/DELETE.ts   <-- already exists (comments-only delete)
export default async function handler(req: Request, res: Response) {
  try {
    const storyId = Number(req.params.id);
    if (!Number.isInteger(storyId) || storyId <= 0) return res.status(400).json({ error: 'Invalid story id' });

    const auth = getAuth();
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) { if (typeof v === 'string') headers[k] = v; }
    const session = await auth.api.getSession({ headers: new Headers(headers) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    // Verify the story belongs to the current user before deleting anything —
    // same ownership check used in the comments handler.
    const storyRows = (await db.execute(sql`SELECT user_id FROM statuses WHERE id = ${storyId} LIMIT 1`) as unknown as [any[]])[0] ?? [];
    if (!storyRows.length) return res.status(404).json({ error: 'Story not found' });
    if (String(storyRows[0].user_id) !== session.user.id) return res.status(403).json({ error: 'Forbidden' });

    // Clean up rows that reference this story first, so nothing is left
    // orphaned. Each cleanup is wrapped on its own: if a table doesn't exist
    // (or was already removed by a DB-level cascade), it's swallowed and the
    // actual story deletion below still goes through.
    try {
      await db.execute(sql`DELETE FROM status_comments WHERE status_id = ${storyId}`);
    } catch (e) {
      console.error('[DELETE /api/status/:id] comments cleanup failed (continuing)', e);
    }
    try {
      await db.execute(sql`DELETE FROM status_views WHERE status_id = ${storyId}`);
    } catch {
      /* optional table — best effort only, safe to ignore if it doesn't exist */
    }

    await db.execute(sql`DELETE FROM statuses WHERE id = ${storyId}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/status/:id]', err);
    res.status(500).json({ error: 'Failed to delete story' });
  }
}
