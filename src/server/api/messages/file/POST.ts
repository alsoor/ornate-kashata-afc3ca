/**
 * POST /api/messages/file?receiverId=<id>&name=<filename>
 * Upload any file (image, video, document, etc.) — saves to storage,
 * inserts message row with the correct type: 'image' | 'video' | 'file'.
 * For video/file the body is a JSON payload: { url, name, ext }
 * For image the body is the plain URL (backward-compatible).
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { messages, user } from '../../../db/schema.js';
import { getAuth } from '../../../../lib/auth/auth.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { sendPushToUser } from '../../../push-helper.js';
import { eq } from 'drizzle-orm';

const STORAGE_DIR   = '/shared-storage/public/assets/chat-files';
const PUBLIC_PREFIX = '/airo-assets/uploads/chat-files';

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

    const receiverId   = String(req.query.receiverId ?? '');
    const originalName = String(req.query.name ?? '');
    if (!receiverId) return res.status(400).json({ error: 'receiverId required' });

    const blob = req.body as Buffer;
    if (!blob || blob.length === 0) return res.status(400).json({ error: 'Empty body' });

    const contentType = (req.headers['content-type'] || 'application/octet-stream').split(';')[0].trim();
    const ext = mimeToExt(contentType, originalName);

    await mkdir(STORAGE_DIR, { recursive: true });
    const filename = `cf-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    await writeFile(join(STORAGE_DIR, filename), blob);

    const fileUrl = `${PUBLIC_PREFIX}/${filename}`;
    const isImage = IMAGE_EXTS.has(ext);
    const isVideo = VIDEO_EXTS.has(ext);
    const msgType: 'image' | 'video' | 'file' = isImage ? 'image' : isVideo ? 'video' : 'file';

    // For image: store plain URL (backward-compatible with ImageBubble)
    // For video/file: store JSON payload so the UI can show name + download link
    const bodyValue = isImage
      ? fileUrl
      : JSON.stringify({ url: fileUrl, name: originalName || filename, ext });

    await db.insert(messages).values({
      senderId:   session.user.id,
      receiverId,
      type:       msgType,
      body:       bodyValue,
    });

    // Push notification
    try {
      const [sender] = await db.select({ name: user.name, username: user.username })
        .from(user).where(eq(user.id, session.user.id));
      const senderName = sender?.name ?? sender?.username ?? 'شخص ما';
      const pushBody = isImage ? 'أرسل لك صورة'
        : isVideo ? 'أرسل لك فيديو'
        : `أرسل لك ملف: ${originalName || filename}`;
      await sendPushToUser(receiverId, 'dm', {
        title: `${isImage ? '🖼' : isVideo ? '🎥' : '📎'} ${senderName}`,
        body: pushBody,
        icon: '/favicon.ico',
        url: `/chat?with=${session.user.id}`,
        tag: `dm-${session.user.id}`,
      });
    } catch { /* push is best-effort */ }

    res.status(201).json({ ok: true, fileUrl, msgType, ext });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
