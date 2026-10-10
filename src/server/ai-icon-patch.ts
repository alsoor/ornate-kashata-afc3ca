// AI-ICON-PATCH — owner switches "hide Stooorna Ai icon" (users / owner) shared with every phone.
// GET  /api/ai-icon  -> { ok, hide: { users, owner } }   (public, no-store)
// POST /api/ai-icon  -> body { hide: { users, owner } }   (owner/admin only)
// Storage: MySQL table app_flags (permanent) when a pool is available, otherwise a JSON file.
import type { Express, Request, Response } from "express";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

type Hide = { users: boolean; owner: boolean };
type Opts = {
  pool?: any;
  dataDir: string;
  getUser: (req: Request) => Promise<any> | any;
  isAdmin: (u: any) => boolean;
};

const KEY = "ai_icon_hide";

export function registerAiIconRoutes(app: Express, opts: Opts) {
  let cache: Hide = { users: false, owner: false };
  let ready: Promise<void> | null = null;
  const file = join(opts.dataDir, "ai-icon.json");

  const norm = (v: any): Hide => ({ users: !!(v && v.users), owner: !!(v && v.owner) });

  const init = () => {
    if (ready) return ready;
    ready = (async () => {
      if (opts.pool) {
        try {
          await opts.pool.query(
            "CREATE TABLE IF NOT EXISTS app_flags (k VARCHAR(64) NOT NULL PRIMARY KEY, v TEXT NOT NULL, updated_at BIGINT NOT NULL)",
          );
          const [rows]: any = await opts.pool.query("SELECT v FROM app_flags WHERE k = ? LIMIT 1", [KEY]);
          if (Array.isArray(rows) && rows[0]?.v) cache = norm(JSON.parse(String(rows[0].v)));
          return;
        } catch (e) {
          console.error("[ai-icon] MySQL init failed, using file:", e instanceof Error ? e.message : "unknown");
        }
      }
      try {
        if (existsSync(file)) cache = norm(JSON.parse(readFileSync(file, "utf8")));
      } catch { /* */ }
    })();
    return ready;
  };

  const persist = async (next: Hide) => {
    cache = next;
    if (opts.pool) {
      try {
        await opts.pool.query(
          "INSERT INTO app_flags (k, v, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v), updated_at = VALUES(updated_at)",
          [KEY, JSON.stringify(next), Date.now()],
        );
        return;
      } catch (e) {
        console.error("[ai-icon] MySQL save failed, using file:", e instanceof Error ? e.message : "unknown");
      }
    }
    try {
      mkdirSync(opts.dataDir, { recursive: true });
      writeFileSync(file, JSON.stringify(next));
    } catch { /* */ }
  };

  app.get("/api/ai-icon", async (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    try { await init(); } catch { /* */ }
    res.json({ ok: true, hide: cache });
  });

  app.post("/api/ai-icon", express_json_safe, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const u = await opts.getUser(req);
      if (!u) return res.status(401).json({ ok: false, error: "unauthorized" });
      if (!opts.isAdmin(u)) return res.status(403).json({ ok: false, error: "forbidden" });
      await init();
      const body: any = (req as any).body || {};
      const next = norm(body.hide || body);
      await persist(next);
      return res.json({ ok: true, hide: next });
    } catch (e) {
      console.error("[ai-icon] error:", e instanceof Error ? e.message : "unknown");
      return res.status(500).json({ ok: false, error: "server_error" });
    }
  });
}

// Body parser is normally installed globally in entry.ts; this is a harmless fallback if req.body is empty.
function express_json_safe(req: Request, _res: Response, next: (err?: any) => void) {
  if ((req as any).body !== undefined) return next();
  let raw = "";
  req.on("data", (c) => { raw += c; if (raw.length > 4096) req.destroy(); });
  req.on("end", () => {
    try { (req as any).body = raw ? JSON.parse(raw) : {}; } catch { (req as any).body = {}; }
    next();
  });
  req.on("error", () => next());
}
