// Express adapter for server/app-releases.ts (APK / IPA downloads).
import type { Express, Request as ExReq, Response as ExRes } from "express";
import { Readable } from "node:stream";
import { handleAppReleases } from "./app-releases.js";

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
  app.put("/api/app-releases/upload", handler);
  app.put("/api/app-releases/visibility", handler);
  app.delete("/api/app-releases/:id", handler);
}
