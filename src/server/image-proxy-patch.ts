/**
 * IMAGE-PROXY-PATCH — lets the app save photos from Pixabay / Pexels / Wikimedia.
 * Place next to entry.ts (server folder).
 * GET /api/image-proxy?url=https://...   ->  the same image, with CORS allowed.
 * Only image files from the photo libraries below are served (no other sites).
 */
import type { Express, Request, Response } from "express";

const ALLOWED_HOSTS = [
  "pixabay.com",
  "images.pexels.com",
  "upload.wikimedia.org",
];
const MAX_BYTES = 60 * 1024 * 1024; // photos are small; Pixabay videos can reach tens of MB

function hostAllowed(host: string): boolean {
  const h = host.toLowerCase();
  return ALLOWED_HOSTS.some(a => h === a || h.endsWith("." + a));
}

export function registerImageProxyRoutes(app: Express) {
  app.options("/api/image-proxy", (_req: Request, res: Response) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.status(204).end();
  });

  app.get("/api/image-proxy", async (req: Request, res: Response) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    try {
      const raw = String(req.query.url || "");
      const u = new URL(raw);
      if (u.protocol !== "https:" || !hostAllowed(u.hostname)) {
        return res.status(400).json({ ok: false, error: "host not allowed" });
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      const r = await fetch(u.href, { redirect: "error", signal: ctrl.signal });
      clearTimeout(timer);
      if (!r.ok) return res.status(502).json({ ok: false, error: `upstream ${r.status}` });
      const type = r.headers.get("content-type") || "";
      if (!/^(image|video)\//.test(type)) return res.status(415).json({ ok: false, error: "not an image or video" });
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > MAX_BYTES) return res.status(413).json({ ok: false, error: "too large" });
      res.setHeader("Content-Type", type);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.end(buf);
    } catch {
      res.status(400).json({ ok: false, error: "bad request" });
    }
  });
}
