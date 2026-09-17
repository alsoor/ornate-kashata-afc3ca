/**
 * POST /api/live/recordings/upload
 * Receives a raw MP4 binary body and saves it to /shared-storage/public/assets/live-recordings/.
 * Updates the live_sessions row with videoUrl, duration, fileSize.
 *
 * Query params:
 *   sessionId  — the live_sessions.id to update
 *   duration   — seconds (integer)
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

  const sessionId = parseInt(req.query.sessionId as string, 10);
  const duration  = parseInt(req.query.duration  as string, 10) || 0;

  if (!sessionId || isNaN(sessionId)) {
    return res.status(400).json({ error: 'Missing sessionId' });
  }

  try {
    // Ensure directory exists
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

    const filename = `live-${session.user.id}-${sessionId}-${Date.now()}.mp4`;
    const filePath = path.join(RECORDINGS_DIR, filename);

    // Write raw body to file
    await new Promise<void>((resolve, reject) => {
      const ws = fs.createWriteStream(filePath);
      req.pipe(ws);
      ws.on('finish', resolve);
      ws.on('error', reject);
    });

    const fileSize = fs.statSync(filePath).size;
    const videoUrl = `/airo-assets/uploads/live-recordings/${filename}`;

    // Update DB row
    await db
      .update(liveSessions)
      .set({ videoUrl, duration, fileSize })
      .where(
        and(
          eq(liveSessions.id, sessionId),
          eq(liveSessions.hostId, session.user.id),
        ),
      );

    return res.json({ ok: true, videoUrl, duration, fileSize });
  } catch (err) {
    console.error('POST /api/live/recordings/upload error:', err);
    return res.status(500).json({ error: 'Upload failed' });
  }
}
