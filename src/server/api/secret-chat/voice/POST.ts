/**
 * POST /api/secret-chat/voice?chatId=<id>&duration=<secs>
 * Upload a voice message to a secret chat.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { queryRows } from '../_helpers.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const STORAGE_DIR   = '/shared-storage/public/assets/secret-chat-voice';
const PUBLIC_PREFIX = '/airo-assets/uploads/secret-chat-voice';

function mimeToExt(mime: string): string {
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'mp4';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });
    const userId = session.user.id;

    const chatId   = parseInt(String(req.query.chatId ?? ''), 10);
    const duration = parseInt(String(req.query.duration ?? '0'), 10);
    if (!chatId) return res.status(400).json({ error: 'chatId required' });

    const blob = req.body as Buffer;
    if (!blob || blob.length === 0) return res.status(400).json({ error: 'Empty body' });

    // Verify membership
    const memList = await queryRows(sql`
      SELECT 1 FROM secret_chat_members WHERE chat_id = ${chatId} AND user_id = ${userId}
    `);
    if (!memList.length) return res.status(403).json({ error: 'Not a member' });

    const contentType = (req.headers['content-type'] || 'audio/webm').split(';')[0].trim();
    const ext = mimeToExt(contentType);

    await mkdir(STORAGE_DIR, { recursive: true });
    const filename = `sc-vm-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    await writeFile(join(STORAGE_DIR, filename), blob);

    const fileUrl = `${PUBLIC_PREFIX}/${filename}`;

    await db.execute(sql`
      INSERT INTO secret_chat_messages (chat_id, sender_id, body, type, duration, is_system)
      VALUES (${chatId}, ${userId}, ${fileUrl}, 'voice', ${duration}, 0)
    `);

    res.status(201).json({ ok: true, fileUrl });
  } catch (e) {
    console.error('[secret-chat voice POST]', e);
    res.status(500).json({ error: 'Server error' });
  }
}
