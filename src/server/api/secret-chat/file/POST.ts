/**
 * POST /api/secret-chat/file?chatId=<id>&name=<filename>
 * Upload a video or document file to a secret chat.
 * type='image' → plain URL body; type='video'|'file' → JSON { url, name, ext }
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { queryRows } from '../_helpers.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const STORAGE_DIR   = '/shared-storage/public/assets/secret-chat-files';
const PUBLIC_PREFIX = '/airo-assets/uploads/secret-chat-files';

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg']);
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', '3gp']);

function mimeToExt(mime: string, originalName?: string): string {
  if (originalName) {
    const parts = originalName.split('.');
    if (parts.length > 1) return parts[parts.length - 1].toLowerCase().slice(0, 10);
  }
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('png'))  return 'png';
  if (mime.includes('gif'))  return 'gif';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('avif')) return 'avif';
  if (mime.includes('mp4'))  return 'mp4';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('quicktime') || mime.includes('mov')) return 'mov';
  if (mime.includes('pdf'))  return 'pdf';
  if (mime.includes('msword') || mime.includes('wordprocessingml')) return 'docx';
  if (mime.includes('spreadsheetml') || mime.includes('excel')) return 'xlsx';
  if (mime.includes('presentationml') || mime.includes('powerpoint')) return 'pptx';
  if (mime.includes('zip'))  return 'zip';
  if (mime.includes('text/plain')) return 'txt';
  return 'bin';
}

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });
    const userId = session.user.id;

    const chatId       = parseInt(String(req.query.chatId ?? ''), 10);
    const originalName = String(req.query.name ?? '');
    if (!chatId) return res.status(400).json({ error: 'chatId required' });

    const blob = req.body as Buffer;
    if (!blob || blob.length === 0) return res.status(400).json({ error: 'Empty body' });

    // Verify membership
    const memList = await queryRows(sql`
      SELECT 1 FROM secret_chat_members WHERE chat_id = ${chatId} AND user_id = ${userId}
    `);
    if (!memList.length) return res.status(403).json({ error: 'Not a member' });

    const contentType = (req.headers['content-type'] || 'application/octet-stream').split(';')[0].trim();
    const ext = mimeToExt(contentType, originalName);
    const isImage = IMAGE_EXTS.has(ext);
    const isVideo = VIDEO_EXTS.has(ext);
    const msgType = isImage ? 'image' : isVideo ? 'video' : 'file';

    await mkdir(STORAGE_DIR, { recursive: true });
    const filename = `sc-file-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    await writeFile(join(STORAGE_DIR, filename), blob);

    const fileUrl = `${PUBLIC_PREFIX}/${filename}`;
    const bodyPayload = isImage
      ? fileUrl
      : JSON.stringify({ url: fileUrl, name: originalName || filename, ext });

    await db.execute(sql`
      INSERT INTO secret_chat_messages (chat_id, sender_id, body, type, is_system)
      VALUES (${chatId}, ${userId}, ${bodyPayload}, ${msgType}, 0)
    `);

    res.status(201).json({ ok: true, fileUrl, msgType, ext });
  } catch (e) {
    console.error('[secret-chat file POST]', e);
    res.status(500).json({ error: 'Server error' });
  }
}
