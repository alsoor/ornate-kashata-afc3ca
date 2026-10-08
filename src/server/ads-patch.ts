import type { Express, Request, Response } from "express";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Db = Record<string, any> | undefined;
const DAY = 24 * 60 * 60 * 1000;

function queryOf(db: Db) {
  const pool = db?.pool || db?.default?.pool;
  if (pool && typeof pool.query === "function") {
    return (sql: string, params: unknown[] = []) => pool.query(sql, params);
  }
  return null;
}
function rowsOf(result: any): any[] {
  if (Array.isArray(result)) return Array.isArray(result[0]) ? result[0] : result;
  if (Array.isArray(result?.rows)) return result.rows;
  return [];
}
function fileOf() { return join(process.cwd(), "data", "stooorna-ads.json"); }
function readFileAds(): any[] {
  try {
    const f = fileOf();
    if (!existsSync(f)) return [];
    const list = JSON.parse(readFileSync(f, "utf8"));
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}
function writeFileAds(list: any[]) {
  try {
    mkdirSync(join(process.cwd(), "data"), { recursive: true });
    writeFileSync(fileOf(), JSON.stringify(list));
  } catch { /* ignore */ }
}
function live(list: any[]) {
  const now = Date.now();
  return list.filter(a => {
    const ends = new Date(a.endsAt || a.expiresAt || 0).getTime();
    const created = new Date(a.createdAt || 0).getTime();
    if (created && now - created > DAY) return false;
    if (ends && ends <= now) return false;
    return true;
  });
}
async function ensureTable(query: (sql: string, params?: unknown[]) => Promise<any>) {
  await query(`CREATE TABLE IF NOT EXISTS stooorna_ads (
    id VARCHAR(80) PRIMARY KEY,
    userId VARCHAR(80) NULL,
    email VARCHAR(190) NULL,
    authorName VARCHAR(190) NULL,
    authorUsername VARCHAR(190) NULL,
    title VARCHAR(255) NULL,
    body TEXT NULL,
    mediaUrl LONGTEXT NULL,
    mediaType VARCHAR(20) NULL,
    mediaName VARCHAR(255) NULL,
    createdAt VARCHAR(40) NULL,
    endsAt VARCHAR(40) NULL
  )`);
}
async function readDb(db: Db): Promise<any[]> {
  const query = queryOf(db);
  if (!query) return [];
  try {
    await ensureTable(query);
    await query("DELETE FROM stooorna_ads WHERE createdAt < DATE_SUB(NOW(), INTERVAL 24 HOUR) OR endsAt < NOW()");
    return rowsOf(await query("SELECT * FROM stooorna_ads ORDER BY createdAt DESC LIMIT 80"));
  } catch { return []; }
}
async function readBody(req: Request): Promise<Record<string, any>> {
  if (req.body && typeof req.body === "object") return req.body as Record<string, any>;
  const raw = await new Promise<string>((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(""));
  });
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

export function registerAdsRoutes(app: Express, opts?: { db?: Db }) {
  app.get("/api/ads", async (_req, res) => {
    const dbAds = await readDb(opts?.db);
    const list = live(dbAds.length ? dbAds : readFileAds());
    writeFileAds(list);
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, ads: list });
  });
  app.post("/api/ads", async (req, res) => {
    const body = await readBody(req);
    const ad = body.ad && typeof body.ad === "object" ? body.ad : body;
    const id = String(ad.id || "").trim();
    if (!id) { res.status(400).json({ ok: false, error: "id" }); return; }
    const now = new Date();
    const row = {
      id,
      userId: String(ad.userId || ""),
      email: String(ad.email || ""),
      authorName: String(ad.authorName || ""),
      authorUsername: String(ad.authorUsername || ""),
      title: String(ad.title || ""),
      body: String(ad.body || ""),
      mediaUrl: String(ad.mediaUrl || ad.pdfUrl || ""),
      mediaType: String(ad.mediaType || ""),
      mediaName: String(ad.mediaName || ""),
      createdAt: String(ad.createdAt || now.toISOString()),
      endsAt: String(ad.endsAt || ad.expiresAt || new Date(now.getTime() + DAY).toISOString()),
    };
    const query = queryOf(opts?.db);
    if (query) {
      try {
        await ensureTable(query);
        await query(
          `INSERT INTO stooorna_ads (id,userId,email,authorName,authorUsername,title,body,mediaUrl,mediaType,mediaName,createdAt,endsAt)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE title=VALUES(title), body=VALUES(body), mediaUrl=VALUES(mediaUrl), endsAt=VALUES(endsAt)`,
          [row.id, row.userId, row.email, row.authorName, row.authorUsername, row.title, row.body, row.mediaUrl, row.mediaType, row.mediaName, row.createdAt, row.endsAt],
        );
      } catch (e) { console.error("[ads] insert", e); }
    }
    const list = live([row, ...readFileAds().filter(a => a.id !== id)]);
    writeFileAds(list);
    res.json({ ok: true, ad: row });
  });
  app.delete("/api/ads/:id", async (req, res) => {
    const id = String(req.params.id || "");
    const query = queryOf(opts?.db);
    if (query) {
      try { await query("DELETE FROM stooorna_ads WHERE id = ?", [id]); } catch { /* ignore */ }
    }
    writeFileAds(readFileAds().filter(a => String(a.id) !== id));
    res.json({ ok: true, deleted: id });
  });
}
