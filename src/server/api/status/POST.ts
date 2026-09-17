/**
 * POST /api/status
 * Accepts multipart/form-data with:
 *   media      — image or video file (required)
 *   audio      — background music file (optional, mp3/m4a/ogg/webm)
 *   overlayText  — text to display over the story (optional)
 *   overlayColor — hex colour for the text (optional, default #ffffff)
 *
 * Legacy raw-binary body (Content-Type: image/* or video/*) still supported.
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../lib/auth/auth.js';
import { db } from '../../db/client.js';
import { statuses } from '../../db/schema.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { up as runStatusMigration } from '../../db/migrations/add_status_audio_overlay.js';

let _migDone = false;
let _migP: Promise<void> | null = null;
function ensureMigration(): Promise<void> {
  if (_migDone) return Promise.resolve();
  if (!_migP) {
    _migP = runStatusMigration()
      .then(() => { _migDone = true; })
      .catch(e => { console.error('[POST /api/status] migration error:', e); _migP = null; });
  }
  return _migP;
}

const IMAGE_DISPLAY_DURATION = 30;
const VIDEO_DISPLAY_DURATION = 60;
const STATUS_LIFETIME_MS     = 24 * 60 * 60 * 1000;

const MEDIA_DIR  = '/shared-storage/public/assets/uploads/statuses';
const AUDIO_DIR  = '/shared-storage/public/assets/uploads/status-audio';
const MEDIA_BASE = '/airo-assets/uploads/statuses';
const AUDIO_BASE = '/airo-assets/uploads/status-audio';

// ── multer: memory storage, 60 MB limit ──────────────────────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } });

export const multerMiddleware = upload.fields([
  { name: 'media', maxCount: 1 },
  { name: 'audio', maxCount: 1 },
]);

function extFromMime(mime: string, fallback: string): string {
  if (mime.includes('mp4'))  return '.mp4';
  if (mime.includes('webm')) return '.webm';
  if (mime.includes('mov'))  return '.mov';
  if (mime.includes('png'))  return '.png';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('gif'))  return '.gif';
  if (mime.includes('heic') || mime.includes('heif')) return '.jpg';
  if (mime.includes('mp3') || mime.includes('mpeg')) return '.mp3';
  if (mime.includes('m4a') || mime.includes('mp4a')) return '.m4a';
  if (mime.includes('ogg')) return '.ogg';
  return fallback;
}

export default async function handler(req: Request, res: Response) {
  try {
    await ensureMigration();
    const auth = getAuth();
    // Build a safe string-only header map — req.headers values can be string[]
    // (e.g. set-cookie) which breaks `new Headers(obj)` silently.
    const headerMap: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headerMap[k] = v;
      else if (Array.isArray(v) && v.length > 0) headerMap[k] = v.join(', ');
    }
    const session = await auth.api.getSession({ headers: new Headers(headerMap) });
    if (!session?.user) {
      console.error('[POST /api/status] 401 — no session. cookie header:', headerMap['cookie']?.slice(0, 80));
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await fs.mkdir(MEDIA_DIR, { recursive: true });
    await fs.mkdir(AUDIO_DIR, { recursive: true });

    let mediaBuf: Buffer;
    let mediaMime: string;
    let audioUrl: string | null = null;
    const overlayText  = (req.body?.overlayText  as string | undefined) ?? null;
    const overlayColor = (req.body?.overlayColor as string | undefined) ?? null;
    const overlayX     = req.body?.overlayX != null ? parseFloat(req.body.overlayX as string) : null;
    const overlayY     = req.body?.overlayY != null ? parseFloat(req.body.overlayY as string) : null;
    const musicBadgeX     = req.body?.musicBadgeX     != null ? parseFloat(req.body.musicBadgeX as string)     : null;
    const musicBadgeY     = req.body?.musicBadgeY     != null ? parseFloat(req.body.musicBadgeY as string)     : null;
    const musicBadgeScale = req.body?.musicBadgeScale != null ? parseFloat(req.body.musicBadgeScale as string) : null;

    // ── multipart path ────────────────────────────────────────────────────────
    // After multer runs, req.files is populated. We detect multipart by checking
    // req.files first (multer already parsed it), falling back to content-type check.
    const isMultipart = !!(req.files) || req.is('multipart/form-data');
    if (isMultipart) {
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const mediaFile = files?.['media']?.[0];
      if (!mediaFile) return res.status(400).json({ error: 'media field missing' });
      mediaBuf  = mediaFile.buffer;
      mediaMime = mediaFile.mimetype.toLowerCase();

      const audioFile = files?.['audio']?.[0];
      if (audioFile) {
        const audioExt  = extFromMime(audioFile.mimetype.toLowerCase(), '.mp3');
        const audioName = `${crypto.randomUUID()}${audioExt}`;
        await fs.writeFile(path.join(AUDIO_DIR, audioName), audioFile.buffer);
        audioUrl = `${AUDIO_BASE}/${audioName}`;
      }
    } else {
      // ── legacy raw-binary path ────────────────────────────────────────────
      const buf: Buffer = req.body;
      if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
        return res.status(400).json({ error: 'No file data received' });
      }
      mediaBuf  = buf;
      mediaMime = (req.headers['content-type'] ?? '').toLowerCase();
    }

    const isVideo = mediaMime.startsWith('video/');
    const isImage = mediaMime.startsWith('image/');
    if (!isVideo && !isImage) return res.status(400).json({ error: 'Only image or video allowed. Got: ' + mediaMime });

    let ext = ((req.headers['x-file-ext'] as string | undefined) ?? '').toLowerCase();
    if (!ext || ext === '.') ext = extFromMime(mediaMime, isVideo ? '.mp4' : '.jpg');

    const filename = `${crypto.randomUUID()}${ext}`;
    await fs.writeFile(path.join(MEDIA_DIR, filename), mediaBuf);

    const mediaUrl  = `${MEDIA_BASE}/${filename}`;
    const duration  = isVideo ? VIDEO_DISPLAY_DURATION : IMAGE_DISPLAY_DURATION;
    const expiresAt = new Date(Date.now() + STATUS_LIFETIME_MS);

    const [result] = await db.insert(statuses).values({
      userId:      session.user.id,
      mediaUrl,
      mediaType:   isVideo ? 'video' : 'image',
      duration,
      expiresAt,
      audioUrl:        audioUrl        ?? undefined,
      overlayText:     overlayText     ?? undefined,
      overlayColor:    overlayColor    ?? undefined,
      overlayX:        overlayX        ?? undefined,
      overlayY:        overlayY        ?? undefined,
      musicBadgeX:     musicBadgeX     ?? undefined,
      musicBadgeY:     musicBadgeY     ?? undefined,
      musicBadgeScale: musicBadgeScale ?? undefined,
    });

    const insertId = (result as { insertId: number }).insertId;
    res.status(201).json({ id: insertId, mediaUrl, mediaType: isVideo ? 'video' : 'image', duration, expiresAt, audioUrl, overlayText, overlayColor, overlayX, overlayY, musicBadgeX, musicBadgeY, musicBadgeScale });
  } catch (e) {
    console.error('[POST /api/status]', e);
    res.status(500).json({ error: 'Upload failed' });
  }
}
