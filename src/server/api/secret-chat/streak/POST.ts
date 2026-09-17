/**
 * POST /api/secret-chat/streak?chatId=<id>&duration=<secs>&mediaType=photo|video
 * Upload a one-view streak photo or video to a secret chat.
 * Saves file, inserts message with is_streak=1.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { queryRows } from '../_helpers.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const STORAGE_DIR   = '/shared-storage/public/assets/secret-chat-streaks';
const PUBLIC_PREFIX = '/airo-assets/uploads/secret-chat-streaks';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });
    const userId = session.user.id;

    const chatId = parseInt(String(req.query.chatId ?? ''), 10);
    if (!chatId) return res.status(400).json({ error: 'chatId required' });

    const duration = parseInt(String(req.query.duration ?? '5'), 10) || 5;
    const mediaType = String(req.query.mediaType ?? 'photo') === 'video' ? 'video' : 'photo';

    const blob = req.body as Buffer;
    if (!blob || blob.length === 0) return res.status(400).json({ error: 'Empty body' });

    // Verify membership
    const memList = await queryRows(sql`
      SELECT 1 FROM secret_chat_members WHERE chat_id = ${chatId} AND user_id = ${userId}
    `);
    if (!memList.length) return res.status(403).json({ error: 'Not a member' });

    const contentType = (req.headers['content-type'] || 'image/jpeg').split(';')[0].trim();
    let ext = 'jpg';
    if (contentType.includes('png')) ext = 'png';
    else if (contentType.includes('gif')) ext = 'gif';
    else if (contentType.includes('webm')) ext = 'webm';
    else if (contentType.includes('mp4')) ext = 'mp4';

    await mkdir(STORAGE_DIR, { recursive: true });
    const filename = `streak-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    await writeFile(join(STORAGE_DIR, filename), blob);
    const fileUrl = `${PUBLIC_PREFIX}/${filename}`;

    // Insert as streak message — type='image' for photo, 'video' for video
    const msgType = mediaType === 'video' ? 'video' : 'image';
    await db.execute(sql`
      INSERT INTO secret_chat_messages
        (chat_id, sender_id, body, type, is_system, is_streak, streak_duration, streak_media_type)
      VALUES
        (${chatId}, ${userId}, ${fileUrl}, ${msgType}, 0, 1, ${duration}, ${mediaType})
    `);

    res.status(201).json({ ok: true, fileUrl });
  } catch (e) {
    console.error('[secret-chat streak POST]', e);
    res.status(500).json({ error: 'Server error' });
  }
}
