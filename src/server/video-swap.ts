import type { Express, Request, Response, NextFunction } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * AI video merge for the live-chat film icon: takes the user's video + photo and replaces the
 * person in the video with the person in the photo (fal.ai PixVerse Swap, mode "person").
 *
 *   POST /api/video-swap        multipart {userId, video, photo}  → { ok, jobId }
 *   GET  /api/video-swap?job=ID                                   → { status: processing|done|error, url? }
 *
 * The finished MP4 is downloaded and re-hosted under ASSETS_DIR (served at /airo-assets/...),
 * so posts never depend on the provider's CDN.
 *
 * Env:
 *   FAL_KEY                       required (https://fal.ai/dashboard/keys)
 *   PUBLIC_BASE_URL               optional, e.g. https://stooorna.com (else derived from the request)
 *   VIDEO_SWAP_RESOLUTION         360p | 540p | 720p            (default 720p)
 *   VIDEO_SWAP_MAX_MB             max input video size           (default 25)
 *   VIDEO_SWAP_USER_PER_HOUR      per user                       (default 5)
 *   VIDEO_SWAP_IP_PER_HOUR        per IP                         (default 10)
 *   VIDEO_SWAP_DAILY_CAP          all users, per UTC day         (default 100)
 *   VIDEO_SWAP_FAL_ENDPOINT       default fal-ai/pixverse/swap
 */

type Job = {
  id: string;
  userId: string;
  createdAt: number;
  status: "processing" | "done" | "error";
  statusUrl: string;
  responseUrl: string;
  inputs: string[];
  url?: string;
  error?: string;
  finalizing?: Promise<void>;
};

type UploadedFile = { buffer: Buffer; mimetype: string; size: number; originalname: string };

const FAL_BASE = () => (process.env.VIDEO_SWAP_FAL_BASE || "https://queue.fal.run").replace(/\/$/, "");
const FAL_ENDPOINT = () => process.env.VIDEO_SWAP_FAL_ENDPOINT || "fal-ai/pixverse/swap";
const num = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const MAX_VIDEO_MB = () => num(process.env.VIDEO_SWAP_MAX_MB, 25);
const USER_PER_HOUR = () => num(process.env.VIDEO_SWAP_USER_PER_HOUR, 5);
const IP_PER_HOUR = () => num(process.env.VIDEO_SWAP_IP_PER_HOUR, 10);
const DAILY_CAP = () => num(process.env.VIDEO_SWAP_DAILY_CAP, 100);

const HOUR = 60 * 60 * 1000;
const JOB_TIMEOUT_MS = 10 * 60 * 1000;
const JOB_KEEP_MS = HOUR;
const OUT_KEEP_MS = 48 * HOUR;
const TMP_KEEP_MS = 30 * 60 * 1000;

const jobs = new Map<string, Job>();
const userHits = new Map<string, number[]>();
const ipHits = new Map<string, number[]>();
let daily = { day: "", count: 0 };

const falAuth = () => ({ Authorization: `Key ${process.env.FAL_KEY || ""}` });
const outDirOf = (assetsDir: string) => join(assetsDir, "video-swap");
const tmpDirOf = (assetsDir: string) => join(assetsDir, "video-swap", "tmp");

function recent(map: Map<string, number[]>, key: string): number[] {
  const now = Date.now();
  const list = (map.get(key) || []).filter((t) => now - t < HOUR);
  map.set(key, list);
  return list;
}
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
function dailyCount() {
  if (daily.day !== todayKey()) daily = { day: todayKey(), count: 0 };
  return daily.count;
}

function extFor(mime: string, kind: "video" | "image"): string {
  const m = (mime || "").toLowerCase();
  if (kind === "video") {
    if (m.includes("quicktime")) return ".mov";
    if (m.includes("webm")) return ".webm";
    return ".mp4";
  }
  if (m.includes("png")) return ".png";
  if (m.includes("webp")) return ".webp";
  return ".jpg";
}

function publicBase(req: Request): string {
  const env = (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
  return env || `${req.protocol}://${req.get("host")}`;
}

async function cleanupInputs(job: Job) {
  const list = job.inputs;
  job.inputs = [];
  await Promise.all(list.map((p) => rm(p, { force: true }).catch(() => {})));
}

async function falSubmit(input: Record<string, unknown>) {
  const r = await fetch(`${FAL_BASE()}/${FAL_ENDPOINT()}`, {
    method: "POST",
    headers: { ...falAuth(), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`fal submit ${r.status}: ${text.slice(0, 300)}`);
  const d = JSON.parse(text) as { request_id?: string; status_url?: string; response_url?: string };
  if (!d.status_url || !d.response_url) throw new Error("fal submit: unexpected response");
  return { statusUrl: d.status_url, responseUrl: d.response_url };
}

async function finalize(job: Job, assetsDir: string) {
  try {
    const rr = await fetch(job.responseUrl, { headers: falAuth() });
    if (!rr.ok) throw new Error(`fal result ${rr.status}`);
    const data = (await rr.json()) as { video?: { url?: string }; response?: { video?: { url?: string } } };
    const src = data?.video?.url || data?.response?.video?.url;
    if (!src) throw new Error("fal result has no video");
    const vr = await fetch(src);
    if (!vr.ok) throw new Error(`download ${vr.status}`);
    const buf = Buffer.from(await vr.arrayBuffer());
    await mkdir(outDirOf(assetsDir), { recursive: true });
    await writeFile(join(outDirOf(assetsDir), `${job.id}.mp4`), buf);
    job.url = `/airo-assets/video-swap/${job.id}.mp4`;
    job.status = "done";
  } catch (e) {
    job.status = "error";
    job.error = "FAILED";
    console.error("video-swap.finalize", { job: job.id, error: e instanceof Error ? e.message : String(e) });
  } finally {
    await cleanupInputs(job);
  }
}

/** Called on every status poll from the client: asks fal, and finishes the job when it is ready. */
async function advance(job: Job, assetsDir: string) {
  if (job.status !== "processing") return;
  if (job.finalizing) { await job.finalizing; return; }
  if (Date.now() - job.createdAt > JOB_TIMEOUT_MS) {
    job.status = "error";
    job.error = "TIMEOUT";
    await cleanupInputs(job);
    return;
  }
  let st: { status?: string } | null = null;
  try {
    const r = await fetch(job.statusUrl, { headers: falAuth() });
    if (r.ok) st = (await r.json()) as { status?: string };
  } catch { /* transient — next poll retries */ }
  if (!st || st.status !== "COMPLETED") return;
  job.finalizing = finalize(job, assetsDir).finally(() => { job.finalizing = undefined; });
  await job.finalizing;
}

export async function handleSubmit(req: Request, res: Response, assetsDir: string) {
  const body = (req.body || {}) as Record<string, unknown>;
  const userId = String(body.userId || "").trim().slice(0, 128);
  if (!userId) return res.status(401).json({ error: "LOGIN" });

  const files = ((req as unknown as { files?: Record<string, UploadedFile[]> }).files) || {};
  const video = files.video?.[0];
  const photo = files.photo?.[0];
  if (!video || !photo) return res.status(400).json({ error: "FILES" });
  if (!/^video\//i.test(video.mimetype) || !/^image\//i.test(photo.mimetype)) return res.status(400).json({ error: "TYPE" });
  if (video.size > MAX_VIDEO_MB() * 1024 * 1024) return res.status(413).json({ error: "TOO_BIG" });

  const ip = String(req.ip || "unknown");
  for (const j of jobs.values()) {
    if (j.userId === userId && j.status === "processing") return res.status(429).json({ error: "BUSY" });
  }
  if (recent(userHits, userId).length >= USER_PER_HOUR() || recent(ipHits, ip).length >= IP_PER_HOUR() || dailyCount() >= DAILY_CAP()) {
    return res.status(429).json({ error: "LIMIT" });
  }

  const id = randomUUID();
  const vName = `${id}-video${extFor(video.mimetype, "video")}`;
  const pName = `${id}-photo${extFor(photo.mimetype, "image")}`;
  const tmpDir = tmpDirOf(assetsDir);
  const vPath = join(tmpDir, vName);
  const pPath = join(tmpDir, pName);
  const job: Job = { id, userId, createdAt: Date.now(), status: "processing", statusUrl: "", responseUrl: "", inputs: [vPath, pPath] };

  try {
    await mkdir(tmpDir, { recursive: true });
    await writeFile(vPath, video.buffer);
    await writeFile(pPath, photo.buffer);
    const base = publicBase(req);
    const sub = await falSubmit({
      video_url: `${base}/airo-assets/video-swap/tmp/${vName}`,
      image_url: `${base}/airo-assets/video-swap/tmp/${pName}`,
      mode: "person",
      keyframe_id: 1,
      resolution: process.env.VIDEO_SWAP_RESOLUTION || "720p",
      original_sound_switch: true,
    });
    job.statusUrl = sub.statusUrl;
    job.responseUrl = sub.responseUrl;
  } catch (e) {
    console.error("video-swap.submit", { user: userId, error: e instanceof Error ? e.message : String(e) });
    await cleanupInputs(job);
    return res.status(502).json({ error: "UPSTREAM" });
  }

  jobs.set(id, job);
  recent(userHits, userId).push(Date.now());
  recent(ipHits, ip).push(Date.now());
  dailyCount();
  daily.count += 1;
  return res.json({ ok: true, jobId: id });
}

export async function handleStatus(req: Request, res: Response, assetsDir: string) {
  res.setHeader("Cache-Control", "no-store");
  const job = jobs.get(String(req.query.job || ""));
  if (!job) return res.status(404).json({ status: "error", error: "NOT_FOUND" });
  await advance(job, assetsDir);
  if (job.status === "done") return res.json({ status: "done", url: job.url });
  if (job.status === "error") return res.json({ status: "error", error: job.error || "FAILED" });
  return res.json({ status: "processing" });
}

async function sweep(assetsDir: string) {
  const now = Date.now();
  for (const [id, j] of jobs) {
    if (now - j.createdAt > JOB_KEEP_MS) {
      await cleanupInputs(j);
      jobs.delete(id);
    }
  }
  for (const [dir, keep] of [[outDirOf(assetsDir), OUT_KEEP_MS], [tmpDirOf(assetsDir), TMP_KEEP_MS]] as const) {
    let names: string[] = [];
    try { names = await readdir(dir); } catch { continue; }
    for (const n of names) {
      const p = join(dir, n);
      try {
        const s = await stat(p);
        if (s.isFile() && now - s.mtimeMs > keep) await rm(p, { force: true });
      } catch { /* ignore */ }
    }
  }
}

export function registerVideoSwap(app: Express, assetsDir: string) {
  void rm(tmpDirOf(assetsDir), { recursive: true, force: true }).catch(() => {}); // leftovers from a previous run
  const timer = setInterval(() => { void sweep(assetsDir); }, 10 * 60 * 1000);
  timer.unref?.();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: (MAX_VIDEO_MB() + 5) * 1024 * 1024, files: 2 },
  }).fields([{ name: "video", maxCount: 1 }, { name: "photo", maxCount: 1 }]);

  const gate = (_req: Request, res: Response, next: NextFunction) => {
    if (!process.env.FAL_KEY) return res.status(503).json({ error: "NOT_CONFIGURED" });
    next();
  };

  app.post(
    "/api/video-swap",
    gate,
    (req: Request, res: Response, next: NextFunction) => {
      upload(req, res, (err: unknown) => {
        if (err) {
          const code = (err as { code?: string }).code;
          return res.status(code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: code === "LIMIT_FILE_SIZE" ? "TOO_BIG" : "UPLOAD" });
        }
        next();
      });
    },
    (req: Request, res: Response) => { void handleSubmit(req, res, assetsDir); },
  );
  app.get("/api/video-swap", (req: Request, res: Response) => { void handleStatus(req, res, assetsDir); });
}
