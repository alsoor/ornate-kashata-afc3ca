/**
 * POST /api/recordings/upload
 *
 * Accepts a raw audio blob (webm/ogg/mp4) as the request body.
 * Query params: title, duration (seconds), mode ('public'|'whisper')
 *
 * Saves the file to /shared-storage/public/assets/recordings/<userId>/<timestamp>.webm
 * and inserts a row into the recordings table.
 */
import type { Request, Response } from 'express';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { db } from '../../../db/client.js';
import { recordings } from '../../../db/schema.js';
import { getAuth } from '../../../../lib/auth/auth.js';

const STORAGE_ROOT = '/shared-storage/public/assets/recordings';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });
    if (!session?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = session.user.id;
    const title = (req.query.title as string) || `Recording ${Date.now()}`;
    const duration = parseInt((req.query.duration as string) || '0', 10);
    const mode = (req.query.mode as string) || 'public';

    // req.body is a Buffer (express.raw middleware applied in entry.ts for this route)
    const buffer: Buffer = req.body;
    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: 'No audio data received' });
    }

    // Determine extension — treat audio/mpeg as mp3; fallback to webm
    const contentType = req.headers['content-type'] || 'audio/mpeg';
    const ext = contentType.includes('ogg') ? 'ogg'
      : contentType.includes('mp4') ? 'm4a'
      : contentType.includes('mpeg') || contentType.includes('mp3') ? 'mp3'
      : 'webm';

    const filename = `${Date.now()}.${ext}`;
    const userDir = path.join(STORAGE_ROOT, userId);
    await fs.mkdir(userDir, { recursive: true });
    const filePath = path.join(userDir, filename);
    await fs.writeFile(filePath, buffer);

    // Public URL served via /airo-assets/uploads/recordings/<userId>/<filename>
    const fileUrl = `/airo-assets/uploads/recordings/${userId}/${filename}`;

    const [result] = await db.insert(recordings).values({
      userId,
      title,
      duration: isNaN(duration) ? 0 : duration,
      mode,
      fileUrl,
    });

    res.status(201).json({ ok: true, id: (result as { insertId: number }).insertId, fileUrl });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed', message: String(error) });
  }
}
