/**
 * TEMPLATES-SHARE-PATCH (server)
 * Share a Templates photo/video with another user -> lands in that user's Saved Messages chat.
 *   POST /api/templates-share/send   { toUserId, postId, kind: 'video'|'image', mediaUrl? }
 *   GET  /api/templates-share/inbox  -> { userId, items: [...] }  (items sent to me)
 * Storage: JSON file in dataDir (survives restarts when dataDir is on a persistent volume).
 * Nothing else in the server is touched.
 */
import type { Express, Request, Response } from "express";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

type ShareRow = {
  id: string; toUserId: string; fromUserId: string; fromName: string; fromUsername: string;
  fromAvatar: string; postId: string; kind: "video" | "image"; mediaUrl: string; at: number;
};

export function registerTemplatesShareRoutes(
  app: Express,
  opts: { dataDir: string; getUser: (req: Request) => any | Promise<any> },
) {
  const file = join(opts.dataDir, "shares.json");
  let rows: ShareRow[] = [];
  try {
    mkdirSync(opts.dataDir, { recursive: true });
    if (existsSync(file)) {
      const raw = JSON.parse(readFileSync(file, "utf-8"));
      if (Array.isArray(raw)) rows = raw;
    }
  } catch { /* start empty */ }
  const persist = () => {
    try { writeFileSync(file, JSON.stringify(rows.slice(-5000))); } catch { /* best effort */ }
  };
  const hits = new Map<string, number[]>();
  const limited = (uid: string) => {
    const now = Date.now();
    const a = (hits.get(uid) || []).filter(t => now - t < 60_000);
    a.push(now); hits.set(uid, a);
    return a.length > 40;
  };
  const clip = (v: unknown, n: number) => String(v ?? "").slice(0, n);

  app.post("/api/templates-share/send", async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const u = await opts.getUser(req);
    if (!u?.id) return res.status(401).json({ ok: false, error: "unauthorized" });
    const me = String(u.id);
    if (limited(me)) return res.status(429).json({ ok: false, error: "slow-down" });
    const b = (req.body || {}) as Record<string, unknown>;
    const toUserId = clip(b.toUserId, 100);
    const postId = clip(b.postId, 200);
    const kind = b.kind === "image" ? "image" : "video";
    if (!toUserId || !postId || toUserId === me) return res.status(400).json({ ok: false, error: "bad-request" });
    const row: ShareRow = {
      id: `tshare_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      toUserId, fromUserId: me,
      fromName: clip(u.name, 80), fromUsername: clip(u.username, 60), fromAvatar: clip(u.avatarUrl || u.image, 500),
      postId, kind, mediaUrl: clip(b.mediaUrl, 800), at: Date.now(),
    };
    rows.push(row);
    persist();
    res.json({ ok: true, id: row.id });
  });

  app.get("/api/templates-share/inbox", async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const u = await opts.getUser(req);
    if (!u?.id) return res.status(401).json({ ok: false, error: "unauthorized" });
    const me = String(u.id);
    const since = Number(req.query.since) || 0;
    res.json({ ok: true, userId: me, items: rows.filter(r => r.toUserId === me && r.at > since).slice(-200) });
  });
}
