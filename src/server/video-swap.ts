/**
 * /api/video-swap — public media upload (Templates: share a video / photo).  NO AI, NO third-party service.
 * (File / route / export names are unchanged on purpose so entry.ts keeps working:
 *   import { registerVideoSwap } from "./video-swap";  registerVideoSwap(app, ASSETS_DIR);)
 *
 *   POST  multipart {userId, kind?, file}  → 200 {url, kind: 'video'|'photo'}
 *   GET   ?ping=1                                      → {enabled: true}
 *
 * Files are saved to ASSETS_DIR/public-media/ and served from /airo-assets/public-media/…
 * (on Railway mount a Volume on ASSETS_DIR so files survive redeploys).
 *
 * Setup:  npm i multer      (already used by /api/status).  @fal-ai/client and FAL_KEY are no longer needed.
 * Optional env: PUBLIC_MEDIA_MAX_VIDEO_MB (default 300; no limit on video length),
 *               PUBLIC_MEDIA_MAX_PHOTO_MB (15), PUBLIC_MEDIA_MAX_PER_HOUR (20 per user).
 */
import { Router, type Express, type Request, type Response } from 'express';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import multer from 'multer';

const MAX_VIDEO_MB = Number(process.env.PUBLIC_MEDIA_MAX_VIDEO_MB || 300); // size cap only — video length is unlimited
const MAX_PHOTO_MB = Number(process.env.PUBLIC_MEDIA_MAX_PHOTO_MB || 15);
const MAX_PER_HOUR = Number(process.env.PUBLIC_MEDIA_MAX_PER_HOUR || 20);

let ASSETS_DIR = process.env.ASSETS_DIR || '/shared-storage/public/assets';

const history = new Map<string, number[]>(); // userId → timestamps of uploads in the last hour

// Disk storage (not memory): unlimited-length videos can be big and must not sit in RAM.
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = join(ASSETS_DIR, 'public-media');
      mkdir(dir, { recursive: true }).then(() => cb(null, dir), err => cb(err, dir));
    },
    filename: (_req, _file, cb) => cb(null, `tmp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.part`),
  }),
  limits: { fileSize: MAX_VIDEO_MB * 1024 * 1024, files: 1 },
});

async function readHead(path: string): Promise<Buffer> {
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(16);
    const { bytesRead } = await fh.read(buf, 0, 16, 0);
    return buf.subarray(0, bytesRead);
  } finally { await fh.close(); }
}
const dropTmp = (path?: string) => { if (path) void unlink(path).catch(() => {}); };

function fail(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ error: code, code, message });
}

function currentUserId(req: Request): string {
  const r = req as any;
  return String(
    r.user?.id ?? r.session?.user?.id ?? r.session?.userId ?? r.auth?.userId ?? req.body?.userId ?? '',
  ).trim();
}

/** Real file-type check (magic bytes) — never trust the client mime type. Returns the extension or null. */
function videoExt(b: Buffer): string | null {
  if (b.length < 12) return null;
  if (b.slice(4, 8).toString('ascii') === 'ftyp') return b.slice(8, 12).toString('ascii') === 'qt  ' ? 'mov' : 'mp4';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'webm';
  return null;
}
function imageExt(b: Buffer): string | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpg';
  if (b.slice(1, 4).toString('ascii') === 'PNG') return 'png';
  if (b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

function sweepHistory() {
  const now = Date.now();
  for (const [u, list] of history) {
    const fresh = list.filter(t => now - t < 60 * 60 * 1000);
    if (fresh.length) history.set(u, fresh); else history.delete(u);
  }
}
setInterval(sweepHistory, 10 * 60 * 1000).unref?.();

async function handleUpload(req: Request, res: Response) {
  const file = (req as any).file as Express.Multer.File | undefined;
  const userId = currentUserId(req);
  if (!userId) { dropTmp(file?.path); return fail(res, 401, 'LOGIN', 'سجّل دخولك أول'); }
  if (!file || !file.size) { dropTmp(file?.path); return fail(res, 400, 'MISSING', 'لازم ترسل ملف'); }

  let head: Buffer;
  try { head = await readHead(file.path); } catch { dropTmp(file.path); return fail(res, 500, 'SAVE', 'تعذّر قراءة الملف'); }
  const vExt = videoExt(head);
  const iExt = vExt ? null : imageExt(head);
  if (!vExt && !iExt) { dropTmp(file.path); return fail(res, 400, 'BAD_FILE', 'الملف غير صالح (فيديو أو صورة فقط)'); }
  const kind: 'video' | 'photo' = vExt ? 'video' : 'photo';
  const ext = (vExt || iExt) as string;

  if (kind === 'photo' && file.size > MAX_PHOTO_MB * 1024 * 1024) {
    dropTmp(file.path);
    return fail(res, 413, 'TOO_BIG', `حجم الصورة أكبر من ${MAX_PHOTO_MB}MB`);
  }

  sweepHistory();
  const recent = history.get(userId) || [];
  if (recent.length >= MAX_PER_HOUR) { dropTmp(file.path); return fail(res, 429, 'LIMIT', 'وصلت للحد المسموح حالياً، حاول بعد شوي'); }

  const id = `pm_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  try {
    await rename(file.path, join(ASSETS_DIR, 'public-media', `${id}.${ext}`));
  } catch (e) {
    dropTmp(file.path);
    console.error('[public-media] save failed:', (e as any)?.message || e);
    return fail(res, 500, 'SAVE', 'تعذّر حفظ الملف على السيرفر، حاول مرة ثانية');
  }
  history.set(userId, [...recent, Date.now()]);
  return res.json({ url: `/airo-assets/public-media/${id}.${ext}`, kind });
}

const router = Router();

router.post('/', (req: Request, res: Response) => {
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return fail(res, 413, 'TOO_BIG', `حجم الملف أكبر من ${MAX_VIDEO_MB}MB`);
      return fail(res, 400, 'UPLOAD', 'تعذّر رفع الملف، حاول مرة ثانية');
    }
    void handleUpload(req, res);
  });
});

router.get('/', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ enabled: true });
});

/** Called from entry.ts: registerVideoSwap(app, ASSETS_DIR). */
export function registerVideoSwap(app: Express, assetsDir?: string) {
  if (assetsDir) ASSETS_DIR = assetsDir;
  app.use('/api/video-swap', router);
}
export const registerPublicMedia = registerVideoSwap;

export default router;
