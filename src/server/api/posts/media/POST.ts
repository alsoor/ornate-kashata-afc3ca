import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { getAuth } from '../../../../lib/auth/auth.js';

const MAX_FILE_SIZE = 50 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

/** Applied in entry.ts so multipart FormData reaches req.file / req.files */
export const multerMiddleware = upload.any();

function extensionFor(contentType: string, requestedExtension?: string) {
  const safeRequested = requestedExtension?.replace(/[^a-zA-Z0-9.]/g, '').slice(0, 12);
  if (safeRequested && safeRequested.startsWith('.')) return safeRequested.toLowerCase();
  if (contentType.startsWith('video/')) return '.mp4';
  if (contentType === 'image/png') return '.png';
  if (contentType === 'image/webp') return '.webp';
  if (contentType === 'image/gif') return '.gif';
  if (contentType.includes('webm')) return '.webm';
  return '.jpg';
}

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers[key] = value;
    }
    const session = await auth.api.getSession({ headers: new Headers(headers) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    let mediaBuf: Buffer | null = null;
    let contentType = '';
    let requestedExt: string | undefined;

    // 1) Multipart (FormData)
    const files = req.files as Express.Multer.File[] | undefined;
    const fileFromMulter =
      (Array.isArray(files) && files[0]) ||
      (req as any).file ||
      undefined;

    if (fileFromMulter?.buffer?.length) {
      mediaBuf = fileFromMulter.buffer;
      contentType = (fileFromMulter.mimetype || '').toLowerCase();
      if (fileFromMulter.originalname) {
        const m = fileFromMulter.originalname.match(/(\.[a-zA-Z0-9]+)$/);
        if (m) requestedExt = m[1].toLowerCase();
      }
    }

    // 2) Legacy raw binary body
    if (!mediaBuf) {
      if (Buffer.isBuffer(req.body) && req.body.length > 0) {
        mediaBuf = req.body;
        contentType = String(req.headers['content-type'] ?? '').split(';')[0].toLowerCase();
        if (typeof req.headers['x-file-ext'] === 'string') {
          requestedExt = req.headers['x-file-ext'];
        }
      }
    }

    if (!mediaBuf || mediaBuf.length === 0) {
      return res.status(400).json({ error: 'Choose a photo or video first' });
    }
    if (mediaBuf.length > MAX_FILE_SIZE) {
      return res.status(413).json({ error: 'File is too large' });
    }

    if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) {
      const ext = (requestedExt || '').toLowerCase();
      if (/\.(mp4|mov|webm|m4v|mkv|3gp)$/i.test(ext)) contentType = 'video/mp4';
      else if (/\.(png)$/i.test(ext)) contentType = 'image/png';
      else if (/\.(webp)$/i.test(ext)) contentType = 'image/webp';
      else if (/\.(gif)$/i.test(ext)) contentType = 'image/gif';
      else if (/\.(jpe?g|heic|heif)$/i.test(ext)) contentType = 'image/jpeg';
    }

    if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) {
      return res.status(400).json({ error: 'Only images and videos can be published' });
    }

    const extension = extensionFor(contentType, requestedExt);
    const filename = `posts/${session.user.id}/${Date.now()}-${randomUUID()}${extension}`;
    const storagePath = path.join('/shared-storage/public/assets/uploads', filename);
    await mkdir(path.dirname(storagePath), { recursive: true });
    await writeFile(storagePath, mediaBuf);

    const url = `/airo-assets/uploads/${filename}`;
    res.status(201).json({
      url,
      mediaUrl: url,
      path: url,
      fileUrl: url,
      mediaType: contentType.startsWith('video/') ? 'video' : 'image',
    });
  } catch (error) {
    console.error('[POST /api/posts/media]', error);
    res.status(500).json({ error: 'Failed to upload media' });
  }
}
