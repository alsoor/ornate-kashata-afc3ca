import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Express, Request, Response } from "express";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "data", "chat-images");
const INDEX = join(dirname(fileURLToPath(import.meta.url)), "data", "chat-images.json");

const ensure = () => { try { mkdirSync(DIR, { recursive: true }); } catch { /* */ } };

const readIndex = (): Record<string, { name: string; mime: string; at: number }> => {
  try { return JSON.parse(readFileSync(INDEX, "utf8")); } catch { return {}; }
};
const writeIndex = (rows: Record<string, { name: string; mime: string; at: number }>) => {
  ensure();
  const start = Date.now() - 24 * 60 * 60 * 1000;
  const next: typeof rows = {};
  for (const [k, v] of Object.entries(rows)) if (v && v.at >= start) next[k] = v;
  writeFileSync(INDEX, JSON.stringify(next));
};

export function saveChatImage(id: string, dataUrl: string): string | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0 || !dataUrl.startsWith("data:")) return null;
  const mime = (dataUrl.slice(5, comma).split(";")[0] || "image/jpeg").toLowerCase();
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : mime.includes("gif") ? "gif" : mime.includes("mp4") ? "mp4" : mime.includes("webm") ? "webm" : "jpg";
  const buf = Buffer.from(dataUrl.slice(comma + 1), "base64");
  if (!buf.length) return null;
  ensure();
  const safe = String(id).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || `img_${Date.now()}`;
  const name = `${safe}.${ext}`;
  writeFileSync(join(DIR, name), buf);
  const rows = readIndex();
  rows[name] = { name, mime, at: Date.now() };
  writeIndex(rows);
  return `/api/chat-images?id=${encodeURIComponent(name)}`;
}

export function registerChatImageRoutes(app: Express) {
  app.post("/api/chat-images", (req: Request, res: Response) => {
    const body = (req.body || {}) as any;
    const dataUrl = String(body.image || body.video || body.media || body.file || "");
    if (!dataUrl.startsWith("data:")) return res.status(400).json({ error: "no-image" });
    const url = saveChatImage(String(body.id || `img_${Date.now()}`), dataUrl);
    if (!url) return res.status(400).json({ error: "bad-image" });
    res.json({ ok: true, url, mediaUrl: url, fileUrl: url });
  });
  app.get("/api/chat-images", (req: Request, res: Response) => {
    const id = String(req.query.id || "").replace(/[^a-zA-Z0-9_.-]/g, "");
    if (!id) return res.status(400).end();
    const file = join(DIR, id);
    if (!existsSync(file)) return res.status(404).end();
    const ext = extname(file).toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".gif" ? "image/gif" : ext === ".mp4" ? "video/mp4" : ext === ".webm" ? "video/webm" : "image/jpeg";
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(readFileSync(file));
  });
}
