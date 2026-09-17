import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getAuth } from '../../../../lib/auth/auth.js';

const MAX_FILE_SIZE = 50 * 1024 * 1024;

function extensionFor(contentType: string, requestedExtension?: string) {
  const safeRequested = requestedExtension?.replace(/[^a-zA-Z0-9.]/g, '').slice(0, 12);
  if (safeRequested && safeRequested.startsWith('.')) return safeRequested.toLowerCase();
  if (contentType.startsWith('video/')) return '.mp4';
  if (contentType === 'image/png') return '.png';
  if (contentType === 'image/webp') return '.webp';
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

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: 'Choose a photo or video first' });
    }
    if (req.body.length > MAX_FILE_SIZE) {
      return res.status(413).json({ error: 'File is too large' });
    }

    const contentType = String(req.headers['content-type'] ?? '').split(';')[0].toLowerCase();
    if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) {
      return res.status(400).json({ error: 'Only images and videos can be published' });
    }

    const extension = extensionFor(contentType, typeof req.headers['x-file-ext'] === 'string' ? req.headers['x-file-ext'] : undefined);
    const filename = `posts/${session.user.id}/${Date.now()}-${randomUUID()}${extension}`;
    const storagePath = path.join('/shared-storage/public/assets/uploads', filename);
    await mkdir(path.dirname(storagePath), { recursive: true });
    await writeFile(storagePath, req.body);

    res.status(201).json({ url: `/airo-assets/uploads/${filename}` });
  } catch (error) {
    console.error('[POST /api/posts/media]', error);
    res.status(500).json({ error: 'Failed to upload media' });
  }
}
