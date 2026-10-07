// Express adapter for server/app-releases.ts (APK / IPA downloads).
import type { Express, Request as ExReq, Response as ExRes } from "express";
import { Readable } from "node:stream";
import { handleAppReleases, storeUpload } from "./app-releases.js";

type SessionUser = { id?: string; username?: string | null; email?: string | null } | null | undefined;

export function registerAppReleaseRoutes(
  app: Express,
  opts: { getUser: (req: ExReq) => Promise<SessionUser>; ownerIds: Set<string> },
) {
  const isOwner = async (webReq: Request) => {
    const exReq = (webReq as unknown as { __ex?: ExReq }).__ex;
    if (!exReq) return false;
    const u = await opts.getUser(exReq).catch(() => null);
    if (!u) return false;
    return [u.id, u.username, u.email].some((v) => !!v && opts.ownerIds.has(String(v).trim().toLowerCase()));
  };

  const handler = async (req: ExReq, res: ExRes) => {
    try {
      const url = `${req.protocol}://${req.get("host") || "localhost"}${req.originalUrl}`;
      const hasBody = req.method !== "GET" && req.method !== "HEAD";
      const webReq = new Request(url, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        ...(hasBody ? { body: Readable.toWeb(req) as unknown as ReadableStream, duplex: "half" } : {}),
      } as RequestInit);
      (webReq as unknown as { __ex: ExReq }).__ex = req;

      const out = await handleAppReleases(webReq, { isOwner });
      if (!out) return res.status(404).json({ error: "Not found" });
      res.status(out.status);
      out.headers.forEach((v, k) => res.setHeader(k, v));
      if (!out.body) return res.end();
      Readable.fromWeb(out.body as unknown as import("node:stream/web").ReadableStream).pipe(res);
    } catch (e) {
      if (!res.headersSent) res.status(500).json({ error: "Server error" });
      else res.end();
    }
  };

  app.get("/api/app-releases", handler);
  app.get("/api/app-releases/latest/:platform/download", handler);
  app.get("/api/app-releases/:id/download", handler);
  // Upload goes straight from the Express request stream to disk (no Web Request bridge): big APK/IPA files, real error messages.
  app.put("/api/app-releases/upload", async (req: ExReq, res: ExRes) => {
    try {
      const u = await opts.getUser(req).catch(() => null);
      const ids = u ? [u.id, u.username, u.email] : [];
      const owner = ids.some((v) => !!v && opts.ownerIds.has(String(v).trim().toLowerCase()));
      if (!owner) {
        console.warn("[app-releases] upload denied", { signedIn: !!u, ids });
        return res.status(403).json({ error: u ? "Owner only" : "Not signed in" });
      }
      req.setTimeout(0);
      const q = req.query as Record<string, string | undefined>;
      const out = await storeUpload(req, {
        platform: String(q.platform || ""),
        version: String(q.version || ""),
        name: String(q.name || ""),
        declared: Number(req.headers["content-length"] || 0),
      });
      if (out.ok) return res.json({ release: out.release });
      res.setHeader("Connection", "close");
      return res.status(out.status).json({ error: out.error });
    } catch (e) {
      console.error("[app-releases] upload crashed", e);
      if (!res.headersSent) res.status(500).json({ error: "Server error" });
    }
  });
  app.put("/api/app-releases/link", handler);
  app.put("/api/app-releases/visibility", handler);
  app.delete("/api/app-releases/:id", handler);
}
