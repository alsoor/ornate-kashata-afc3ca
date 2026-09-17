/**
 * POST /api/messages/voice?receiverId=<id>&duration=<secs>
 * Upload a voice message blob (express.raw), save to storage, insert message row.
 * Supports any MIME type: audio/webm, audio/mp4, audio/ogg, audio/aac
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { messages } from '../../../db/schema.js';
import { getAuth } from '../../../../lib/auth/auth.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const STORAGE_DIR   = '/shared-storage/public/assets/voice-messages';
const PUBLIC_PREFIX = '/airo-assets/uploads/voice-messages';

/** Map MIME type → file extension */
function mimeToExt(mime: string): string {
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'mp4';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('webm')) return 'webm';
  return 'webm'; // safe fallback
}

export default async function handler(req: Request, res: Response) {
  try {
    const auth    = getAuth();
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const meId      = session.user.id;
    const receiverId = req.query.receiverId as string;
    const duration   = parseInt((req.query.duration as string) || '0', 10);

    if (!receiverId) return res.status(400).json({ error: 'Missing receiverId' });

    const blob = req.body as Buffer;
    if (!blob || blob.length === 0) return res.status(400).json({ error: 'Empty body' });

    // Detect MIME from Content-Type header (sent by the client)
    const contentType = (req.headers['content-type'] || 'audio/webm').split(';')[0].trim();
    const ext         = mimeToExt(contentType);

    await mkdir(STORAGE_DIR, { recursive: true });
    const filename = `vm-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    await writeFile(join(STORAGE_DIR, filename), blob);

    const fileUrl = `${PUBLIC_PREFIX}/${filename}`;

    const [result] = await db.insert(messages).values({
      senderId: meId,
      receiverId,
      type: 'voice',
      body: fileUrl,
      duration,
    });

    res.status(201).json({
      id: (result as { insertId: number }).insertId,
      fileUrl,
      ok: true,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send voice message', message: String(error) });
  }
}
