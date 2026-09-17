/**
 * DELETE /api/live/recordings/:id
 * Deletes a live session record (and its video file if present).
 * Only the owner of the session can delete it.
 */
import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { db } from '../../../../db/client.js';
import { liveSessions } from '../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

const RECORDINGS_DIR = '/shared-storage/public/assets/live-recordings';

export default async function handler(req: Request, res: Response) {
  const auth = getAuth();
  const headerMap: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headerMap[k] = v;
    else if (Array.isArray(v)) headerMap[k] = v[0] ?? '';
  }
  const session = await auth.api.getSession({ headers: new Headers(headerMap) });
  if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

  const id = parseInt(String(req.params.id), 10);
  if (!id || isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    // Fetch the row first to get videoUrl and verify ownership
    const rows = await db
      .select()
      .from(liveSessions)
      .where(and(eq(liveSessions.id, id), eq(liveSessions.hostId, session.user.id)))
      .limit(1);

    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });

    const row = rows[0];

    // Delete physical file if it exists
    if (row.videoUrl) {
      // videoUrl is like /airo-assets/uploads/live-recordings/filename.mp4
      const filename = path.basename(row.videoUrl);
      const filePath = path.join(RECORDINGS_DIR, filename);
      try { fs.unlinkSync(filePath); } catch { /* file may not exist */ }
    }

    // Delete DB row
    await db
      .delete(liveSessions)
      .where(and(eq(liveSessions.id, id), eq(liveSessions.hostId, session.user.id)));

    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/live/recordings/:id error:', err);
    return res.status(500).json({ error: 'Delete failed' });
  }
}
