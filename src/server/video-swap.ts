/**
 * /api/video-swap — real AI "put YOU in the video" backend.
 *
 *   POST  multipart {userId, video, photo, duration?}  → 202 {jobId}
 *   GET   ?job=ID                                       → {status: 'queued'|'working'|'done'|'error', url?, error?}
 *
 * Model: fal.ai  fal-ai/wan/v2.2-14b/animate/replace  (Alibaba Wan 2.2 Animate — replaces the person in the
 * video with the person in the photo, keeping the original motion, expressions, lighting and scene).
 *
 * Setup:
 *   npm i @fal-ai/client            (multer is already used by /api/status; if missing: npm i multer)
 *   Railway → Variables:  FAL_KEY=xxxxxxxx      (https://fal.ai/dashboard/keys)
 *   entry.ts already has:  import { registerVideoSwap } from "./video-swap";  registerVideoSwap(app, ASSETS_DIR);
 *   The finished video is copied into ASSETS_DIR/video-swap/ and served from /airo-assets/video-swap/…
 *   (fal links expire; on Railway mount a Volume on ASSETS_DIR so files survive redeploys).
 *
 * Optional env: VIDEO_SWAP_RESOLUTION (480p | 580p | 720p, default 480p),
 *               VIDEO_SWAP_MAX_PER_HOUR (default 5 per user), VIDEO_SWAP_MAX_SEC (default 30),
 *               VIDEO_SWAP_MAX_MB (default 50).
 */
import { Router, type Express, type Request, type Response } from 'express';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import multer from 'multer';
import { fal } from '@fal-ai/client';

const MODEL_ID = 'fal-ai/wan/v2.2-14b/animate/replace';
const MAX_SEC = Number(process.env.VIDEO_SWAP_MAX_SEC || 30);
const MAX_MB = Number(process.env.VIDEO_SWAP_MAX_MB || 50);
const MAX_PER_HOUR = Number(process.env.VIDEO_SWAP_MAX_PER_HOUR || 5);
const RESOLUTION = (['480p', '580p', '720p'].includes(String(process.env.VIDEO_SWAP_RESOLUTION))
  ? String(process.env.VIDEO_SWAP_RESOLUTION)
  : '480p') as '480p' | '580p' | '720p';
const JOB_TTL_MS = 60 * 60 * 1000;

type Job = {
  userId: string;
  requestId: string;
  createdAt: number;
  status: 'queued' | 'working' | 'done' | 'error';
  url?: string;
  error?: string;
  code?: string;
};

let ASSETS_DIR = process.env.ASSETS_DIR || '/shared-storage/public/assets';

async function saveResultLocally(id: string, remoteUrl: string): Promise<string> {
  try {
    const r = await fetch(remoteUrl);
    if (!r.ok) throw new Error(`download ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const dir = join(ASSETS_DIR, 'video-swap');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${id}.mp4`), buf);
    return `/airo-assets/video-swap/${id}.mp4`;
  } catch (e) {
    console.error('[video-swap] could not save result locally, using provider url:', (e as any)?.message || e);
    return remoteUrl;
  }
}

const jobs = new Map<string, Job>();
const history = new Map<string, number[]>(); // userId → timestamps of started jobs

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 2 },
});

function sweep() {
  const now = Date.now();
  for (const [id, j] of jobs) if (now - j.createdAt > JOB_TTL_MS) jobs.delete(id);
  for (const [u, list] of history) {
    const fresh = list.filter(t => now - t < 60 * 60 * 1000);
    if (fresh.length) history.set(u, fresh); else history.delete(u);
  }
}
setInterval(sweep, 5 * 60 * 1000).unref?.();

function fail(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ error: code, code, message });
}

function currentUserId(req: Request): string {
  const r = req as any;
  return String(
    r.user?.id ?? r.session?.user?.id ?? r.session?.userId ?? r.auth?.userId ?? req.body?.userId ?? '',
  ).trim();
}

/** Real file-type check (magic bytes) — never trust the client mime type alone. */
function looksLikeVideo(b: Buffer): boolean {
  if (b.length < 12) return false;
  if (b.slice(4, 8).toString('ascii') === 'ftyp') return true;                       // mp4 / mov / 3gp
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return true; // webm / mkv
  return false;
}
function looksLikeImage(b: Buffer): boolean {
  if (b.length < 12) return false;
  if (b[0] === 0xff && b[1] === 0xd8) return true;                                   // jpeg
  if (b.slice(1, 4).toString('ascii') === 'PNG') return true;                        // png
  if (b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP') return true;
  return false;
}

function mapProviderError(e: any): { status: number; code: string; message: string } {
  const status = Number(e?.status || e?.response?.status || 0);
  const text = String(e?.message || e?.body?.detail || '').toLowerCase();
  if (status === 401 || status === 403 || text.includes('balance') || text.includes('locked') || text.includes('unauthorized')) {
    return { status: 503, code: 'PROVIDER_AUTH', message: 'خدمة الذكاء الاصطناعي متوقفة مؤقتاً (تحقق من مفتاح FAL_KEY ورصيد الحساب في السيرفر)' };
  }
  if (status === 429) return { status: 429, code: 'LIMIT', message: 'الخدمة مزدحمة الحين، حاول بعد شوي' };
  if (status === 422 || text.includes('safety') || text.includes('nsfw') || text.includes('content')) {
    return { status: 422, code: 'REJECTED', message: 'ما قدر الذكاء الاصطناعي يعالج هذا الفيديو أو الصورة، جرّب صورة وجه واضحة من الأمام وفيديو فيه شخص واضح' };
  }
  return { status: 502, code: 'PROVIDER', message: 'تعذّر الاتصال بخدمة الذكاء الاصطناعي، حاول مرة ثانية' };
}

async function runJob(id: string, video: Buffer, videoType: string, photo: Buffer) {
  const job = jobs.get(id);
  if (!job) return;
  try {
    const [videoUrl, imageUrl] = await Promise.all([
      fal.storage.upload(new Blob([new Uint8Array(video)], { type: videoType || 'video/mp4' })),
      fal.storage.upload(new Blob([new Uint8Array(photo)], { type: 'image/jpeg' })),
    ]);
    const { request_id } = await fal.queue.submit(MODEL_ID, {
      input: {
        video_url: videoUrl,
        image_url: imageUrl,
        resolution: RESOLUTION,
        enable_safety_checker: true,
      } as any,
    });
    job.requestId = request_id;
    job.status = 'queued';

    // Poll the provider until it finishes (the browser polls OUR endpoint, not the provider).
    const t0 = Date.now();
    while (Date.now() - t0 < 12 * 60 * 1000) {
      await new Promise(r => setTimeout(r, 3000));
      const st: any = await fal.queue.status(MODEL_ID, { requestId: request_id });
      if (st.status === 'IN_PROGRESS') job.status = 'working';
      if (st.status === 'COMPLETED') {
        const out: any = await fal.queue.result(MODEL_ID, { requestId: request_id });
        const url = out?.data?.video?.url || out?.data?.video_url || out?.data?.url;
        if (!url) throw Object.assign(new Error('no video in result'), { status: 502 });
        job.url = await saveResultLocally(id, String(url));
        job.status = 'done';
        return;
      }
    }
    throw Object.assign(new Error('timeout'), { code: 'TIMEOUT' });
  } catch (e: any) {
    if (e?.code === 'TIMEOUT') {
      job.status = 'error'; job.code = 'TIMEOUT'; job.error = 'طوّلت العملية، حاول مرة ثانية';
    } else {
      const m = mapProviderError(e);
      job.status = 'error'; job.code = m.code; job.error = m.message;
      console.error('[video-swap] job failed:', e?.status || '', e?.message || e);
    }
    refundQuota(job.userId); // a failed generation shouldn't eat the user's hourly quota
  }
}

function refundQuota(userId: string) {
  const list = history.get(userId);
  if (list && list.length) { list.pop(); if (list.length) history.set(userId, list); else history.delete(userId); }
}

const router = Router();

if (process.env.FAL_KEY) fal.config({ credentials: process.env.FAL_KEY });

router.post('/', upload.fields([{ name: 'video', maxCount: 1 }, { name: 'photo', maxCount: 1 }]), (req: Request, res: Response) => {
  if (!process.env.FAL_KEY) {
    return fail(res, 503, 'NO_KEY', 'خدمة دمج الفيديو غير مفعّلة على السيرفر بعد (FAL_KEY ناقص)');
  }
  fal.config({ credentials: process.env.FAL_KEY });

  const userId = currentUserId(req);
  if (!userId) return fail(res, 401, 'LOGIN', 'سجّل دخولك أول');

  const files = (req.files || {}) as Record<string, Express.Multer.File[]>;
  const video = files.video?.[0];
  const photo = files.photo?.[0];
  if (!video || !photo) return fail(res, 400, 'MISSING', 'لازم ترسل الفيديو والصورة');
  if (!looksLikeVideo(video.buffer)) return fail(res, 400, 'BAD_VIDEO', 'ملف الفيديو غير صالح');
  if (!looksLikeImage(photo.buffer)) return fail(res, 400, 'BAD_PHOTO', 'ملف الصورة غير صالح');

  const dur = Number(req.body?.duration);
  if (Number.isFinite(dur) && dur > MAX_SEC + 0.5) {
    return fail(res, 400, 'TOO_LONG', `الفيديو أطول من ${MAX_SEC} ثانية`);
  }

  sweep();
  // One active job per user + hourly quota (each generation costs real money).
  for (const j of jobs.values()) {
    if (j.userId === userId && (j.status === 'queued' || j.status === 'working')) {
      return fail(res, 429, 'BUSY', 'عندك عملية دمج شغّالة الحين، انتظر تخلص');
    }
  }
  const recent = history.get(userId) || [];
  if (recent.length >= MAX_PER_HOUR) return fail(res, 429, 'LIMIT', 'وصلت للحد المسموح حالياً، حاول بعد شوي');
  history.set(userId, [...recent, Date.now()]);

  const id = `vs_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  jobs.set(id, { userId, requestId: '', createdAt: Date.now(), status: 'queued' });
  void runJob(id, video.buffer, video.mimetype, photo.buffer);
  return res.status(202).json({ jobId: id });
});

router.get('/', (req: Request, res: Response) => {
  // Client asks "is Stooorna Ai switched on?" (FAL_KEY present) — never reveals the key.
  if (req.query.ping) return res.json({ enabled: !!process.env.FAL_KEY });
  const id = String(req.query.job || '');
  const job = jobs.get(id);
  if (!job) return fail(res, 404, 'NOT_FOUND', 'العملية غير موجودة أو انتهت صلاحيتها');
  const userId = currentUserId(req);
  if (userId && userId !== job.userId) return fail(res, 403, 'FORBIDDEN', 'مو مسموح');
  res.setHeader('Cache-Control', 'no-store');
  if (job.status === 'done') return res.json({ status: 'done', url: job.url });
  if (job.status === 'error') return res.json({ status: 'error', error: job.error, code: job.code });
  return res.json({ status: job.status });
});

/** Called from entry.ts: registerVideoSwap(app, ASSETS_DIR). */
export function registerVideoSwap(app: Express, assetsDir?: string) {
  if (assetsDir) ASSETS_DIR = assetsDir;
  app.use('/api/video-swap', router);
}

export default router;
