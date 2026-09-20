import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getAuth } from '../../../../lib/auth/auth.js';

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const UPLOAD_ROOT = '/shared-storage/public/assets/uploads';
const PUBLIC_BASE = '/airo-assets/uploads';

function extensionFor(contentType: string, requestedExtension?: string, originalName?: string) {
  const fromName = originalName && path.extname(originalName);
  if (fromName && /^\.[a-zA-Z0-9]{1,8}$/.test(fromName)) return fromName.toLowerCase();
  const safeRequested = requestedExtension?.replace(/[^a-zA-Z0-9.]/g, '').slice(0, 12);
  if (safeRequested && safeRequested.startsWith('.')) return safeRequested.toLowerCase();
  if (contentType.startsWith('video/')) return '.mp4';
  if (contentType === 'image/png') return '.png';
  if (contentType === 'image/webp') return '.webp';
  if (contentType === 'image/gif') return '.gif';
  return '.jpg';
}

async function readBodyBuffer(req: Request): Promise<{ buffer: Buffer; contentType: string; originalName?: string }> {
  // Multipart/FormData (busboy / multer / express with files)
  const anyReq = req as any;
  if (anyReq.file?.buffer) {
    return {
      buffer: Buffer.from(anyReq.file.buffer),
      contentType: String(anyReq.file.mimetype || req.headers['content-type'] || 'application/octet-stream'),
      originalName: anyReq.file.originalname,
    };
  }
  if (Array.isArray(anyReq.files) && anyReq.files[0]?.buffer) {
    const f = anyReq.files[0];
    return {
      buffer: Buffer.from(f.buffer),
      contentType: String(f.mimetype || 'application/octet-stream'),
      originalName: f.originalname,
    };
  }
  if (anyReq.files && typeof anyReq.files === 'object') {
    for (const key of Object.keys(anyReq.files)) {
      const entry = anyReq.files[key];
      const f = Array.isArray(entry) ? entry[0] : entry;
      if (f?.buffer) {
        return {
          buffer: Buffer.from(f.buffer),
          contentType: String(f.mimetype || 'application/octet-stream'),
          originalName: f.originalname,
        };
      }
    }
  }

  // Raw binary body (Content-Type: image/* or video/*)
  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    return {
      buffer: req.body,
      contentType: String(req.headers['content-type'] ?? '').split(';')[0].toLowerCase() || 'application/octet-stream',
    };
  }

  // Some stacks put body as Uint8Array / ArrayBuffer
  if (req.body && (req.body as any).byteLength) {
    const buf = Buffer.from(req.body as ArrayBuffer);
    if (buf.length > 0) {
      return {
        buffer: buf,
        contentType: String(req.headers['content-type'] ?? '').split(';')[0].toLowerCase() || 'application/octet-stream',
      };
    }
  }

  return { buffer: Buffer.alloc(0), contentType: '' };
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

    const { buffer, contentType, originalName } = await readBodyBuffer(req);
    if (!buffer.length) {
      return res.status(400).json({ error: 'Choose a photo or video first' });
    }
    if (buffer.length > MAX_FILE_SIZE) {
      return res.status(413).json({ error: 'File is too large' });
    }

    const ct = contentType.toLowerCase();
    if (!ct.startsWith('image/') && !ct.startsWith('video/') && !ct.includes('octet-stream')) {
      return res.status(400).json({ error: 'Only images and videos can be published' });
    }

    const extension = extensionFor(
      ct.startsWith('image/') || ct.startsWith('video/') ? ct : 'image/jpeg',
      typeof req.headers['x-file-ext'] === 'string' ? req.headers['x-file-ext'] : undefined,
      originalName,
    );
    const filename = `posts/${session.user.id}/${Date.now()}-${randomUUID()}${extension}`;
    const storagePath = path.join(UPLOAD_ROOT, filename);
    await mkdir(path.dirname(storagePath), { recursive: true });
    await writeFile(storagePath, buffer);

    const url = `${PUBLIC_BASE}/${filename}`;
    res.status(201).json({
      url,
      mediaUrl: url,
      path: url,
      fileUrl: url,
    });
  } catch (error) {
    console.error('[POST /api/posts/media]', error);
    res.status(500).json({ error: 'Failed to upload media' });
  }
}
