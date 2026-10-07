/**
 * templates-routes.ts (نسخة MySQL) → نفس مكان الملف القديم بجانب entry.ts
 *
 * مسارات /api/templates مع تخزين دائم في MySQL (جدول templates_posts يُنشأ تلقائياً أول تشغيل).
 * لا يعتمد على قرص Render ولا يضيع مع النشر.
 * لا يوجد أي مسح تلقائي: الحذف فقط بطلب DELETE من صاحب المنشور (أو الأدمن).
 *
 * الفرق عن النسخة القديمة: بدل  dataDir  نمرّر  pool  (mysql2/promise Pool — نفس الاتصال اللي يستخدمه Drizzle).
 *   registerTemplatesRoutes(app, { pool, getUser, isAdmin })
 *   (لو ما مرّرت pool يشتغل بالنسخة القديمة JSON عبر dataDir — عشان السيرفر ما يتعطل قبل ما تربط pool في entry.ts)
 */
import type { Express, Request, Response } from "express";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface TemplateRowServer {
  id: string;
  userId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  text: string;
  imageUrl?: string | null;
  voiceUrl?: string | null;
  voiceDuration?: number | null;
  likes: string[];
  createdAt: number;
  editCount?: number;
  replyToId?: string | null;
  replyToName?: string | null;
  replyToText?: string | null;
}

interface Opts {
  /** MySQL pool (mysql2/promise). لو موجود → تخزين دائم في MySQL. لو غير موجود → النسخة القديمة (ملف JSON) عبر dataDir. */
  pool?: Pool;
  dataDir?: string;
  getUser: (req: Request) => Promise<{ id: string; username?: string; email?: string } | null>;
  isAdmin?: (u: { id: string; username?: string; email?: string }) => Promise<boolean> | boolean;
}

const CMT_RE = /^↩([^\u200b\s]+)\u200b/;
const parentOf = (text: string) => CMT_RE.exec(text || "")?.[1] ?? null;
/** فقط روابط دائمة: مسار نسبي أو http(s). يرفض blob: و data: */
const isPermanentUrl = (u?: string | null) => !u || /^https?:\/\//i.test(u) || u.startsWith("/");

type Q = Pick<Pool, "query"> | Pick<PoolConnection, "query">;

export function registerTemplatesRoutes(app: Express, opts: Opts) {
  if (!opts.pool) {
    if (!opts.dataDir) throw new Error("[templates] pass either pool (MySQL) or dataDir (JSON)");
    console.warn("[templates] no MySQL pool passed — using the old JSON file (lost on every Render deploy without a Disk)");
    return registerTemplatesRoutesJson(app, { dataDir: opts.dataDir, getUser: opts.getUser, isAdmin: opts.isAdmin });
  }
  return registerTemplatesRoutesMysql(app, { ...opts, pool: opts.pool });
}

function registerTemplatesRoutesMysql(app: Express, opts: Opts & { pool: Pool }) {
  const { pool, getUser, isAdmin } = opts;

  // الجدول: data = JSON للصف كاملاً (الاسم، النص، الرابط، likes ...)
  const ready: Promise<void> = (pool as Pool)
    .query(
      `CREATE TABLE IF NOT EXISTS templates_posts (
         id         VARCHAR(80)  NOT NULL PRIMARY KEY,
         user_id    VARCHAR(191) NOT NULL,
         parent_id  VARCHAR(80)  NULL,
         data       MEDIUMTEXT   NOT NULL,
         created_at BIGINT       NOT NULL,
         INDEX idx_templates_parent (parent_id),
         INDEX idx_templates_created (created_at)
       ) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci`,
    )
    .then(() => undefined)
    .catch((e) => { console.error("[templates] failed to create table", e); });

  const parse = (r: RowDataPacket): TemplateRowServer | null => {
    try {
      const v = JSON.parse(String(r.data)) as TemplateRowServer;
      return v && v.id ? v : null;
    } catch { return null; }
  };
  const getRow = async (id: string, q: Q = pool, lock = false): Promise<TemplateRowServer | null> => {
    const [rs] = await (q as Pool).query<RowDataPacket[]>(
      `SELECT data FROM templates_posts WHERE id = ? LIMIT 1${lock ? " FOR UPDATE" : ""}`, [id]);
    return rs.length ? parse(rs[0]) : null;
  };
  const putRow = async (row: TemplateRowServer, q: Q = pool) => {
    await (q as Pool).query(
      `INSERT INTO templates_posts (id, user_id, parent_id, data, created_at) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), parent_id = VALUES(parent_id), data = VALUES(data)`,
      [row.id, row.userId, parentOf(row.text), JSON.stringify(row), row.createdAt],
    );
  };

  const auth = async (req: Request, res: Response) => {
    const u = await getUser(req);
    if (!u) { res.status(401).json({ error: "unauthorized" }); return null; }
    return u;
  };
  const noStore = (res: Response) => res.set("Cache-Control", "no-store");
  const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
    try { await ready; await fn(req, res); }
    catch (e) {
      console.error("[templates] error", e);
      if (!res.headersSent) res.status(500).json({ error: "server_error" });
    }
  };

  // GET /api/templates
  app.get("/api/templates", wrap(async (req, res) => {
    noStore(res);
    if (!(await auth(req, res))) return;
    const [rs] = await pool.query<RowDataPacket[]>(`SELECT data FROM templates_posts ORDER BY created_at ASC`);
    res.json({ items: rs.map(parse).filter((x): x is TemplateRowServer => !!x) });
  }));

  // POST /api/templates/like
  app.post("/api/templates/like", wrap(async (req, res) => {
    const u = await auth(req, res); if (!u) return;
    const { id, liked } = (req.body || {}) as { id?: string; liked?: boolean };
    if (!id) return void res.status(400).json({ error: "bad_request" });
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const row = await getRow(String(id), conn, true);
      if (!row) { await conn.rollback(); return void res.status(404).json({ error: "not_found" }); }
      const set = new Set(row.likes || []);
      if (liked) set.add(u.id); else set.delete(u.id);
      row.likes = [...set];
      await putRow(row, conn);
      await conn.commit();
      res.json({ ok: true, likes: row.likes });
    } catch (e) {
      try { await conn.rollback(); } catch { /* ignore */ }
      throw e;
    } finally {
      conn.release();
    }
  }));

  // POST /api/templates  (إنشاء/تحديث منشور أو تعليق)
  app.post("/api/templates", wrap(async (req, res) => {
    const u = await auth(req, res); if (!u) return;
    const b = (req.body || {}) as Partial<TemplateRowServer>;
    if (!b.id || !(b.text || b.imageUrl || b.voiceUrl)) return void res.status(400).json({ error: "bad_request" });
    if (!isPermanentUrl(b.imageUrl) || !isPermanentUrl(b.voiceUrl)) {
      return void res.status(400).json({ error: "temporary_url", message: "ارفع الملف أولاً ثم أرسل رابطه الدائم" });
    }
    const id = String(b.id).slice(0, 80);
    const existing = await getRow(id);
    if (existing && existing.userId !== u.id) return void res.status(403).json({ error: "forbidden" });
    const parent = parentOf(String(b.text || ""));
    if (parent && !(await getRow(parent))) return void res.status(404).json({ error: "parent_not_found" });
    await putRow({
      id,
      userId: u.id, // من الجلسة دائماً
      name: b.name ?? null,
      username: b.username ?? null,
      avatarUrl: b.avatarUrl ?? null,
      text: String(b.text || "").slice(0, 600),
      imageUrl: b.imageUrl ?? null,
      voiceUrl: b.voiceUrl ?? null,
      voiceDuration: b.voiceDuration ?? null,
      likes: existing?.likes ?? [],
      createdAt: existing?.createdAt ?? (Number(b.createdAt) || Date.now()),
      editCount: b.editCount ?? 0,
      replyToId: b.replyToId ?? null,
      replyToName: b.replyToName ?? null,
      replyToText: b.replyToText ?? null,
    });
    res.json({ ok: true, id });
  }));

  // DELETE /api/templates/:id  (يحذف المنشور وتعليقاته)
  app.delete("/api/templates/:id", wrap(async (req, res) => {
    const u = await auth(req, res); if (!u) return;
    const id = String(req.params.id);
    const row = await getRow(id);
    if (!row) return void res.json({ ok: true });
    const admin = isAdmin ? await isAdmin(u) : false;
    if (row.userId !== u.id && !admin) return void res.status(403).json({ error: "forbidden" });
    await pool.query(`DELETE FROM templates_posts WHERE id = ? OR parent_id = ?`, [id, id]);
    res.json({ ok: true });
  }));
}

// ───────────── النسخة القديمة (ملف JSON) — تُستخدم فقط لو ما مُرّر pool ─────────────
interface JsonOpts {
  dataDir: string;
  getUser: (req: Request) => Promise<{ id: string; username?: string; email?: string } | null>;
  isAdmin?: (u: { id: string; username?: string; email?: string }) => Promise<boolean> | boolean;
}

function registerTemplatesRoutesJson(app: Express, opts: JsonOpts) {
  const { dataDir, getUser, isAdmin } = opts;
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, "templates.json");

  // ── تحميل من القرص مرة واحدة عند الإقلاع ──
  const rows = new Map<string, TemplateRowServer>();
  try {
    if (existsSync(file)) {
      const arr = JSON.parse(readFileSync(file, "utf-8"));
      if (Array.isArray(arr)) for (const r of arr) if (r?.id) rows.set(String(r.id), r);
    }
  } catch (e) {
    console.error("[templates] failed to load", file, e);
  }

  // ── حفظ ذرّي (كتابة ملف مؤقت ثم rename) مع تجميع الكتابات ──
  let timer: NodeJS.Timeout | null = null;
  const flush = () => {
    timer = null;
    try {
      const tmp = file + ".tmp";
      writeFileSync(tmp, JSON.stringify([...rows.values()]), "utf-8");
      renameSync(tmp, file);
    } catch (e) {
      console.error("[templates] failed to save", e);
    }
  };
  const persist = () => { if (!timer) timer = setTimeout(flush, 200); };
  for (const sig of ["SIGTERM", "SIGINT"] as const) process.once(sig, () => { if (timer) clearTimeout(timer); flush(); });

  const auth = async (req: Request, res: Response) => {
    const u = await getUser(req);
    if (!u) { res.status(401).json({ error: "unauthorized" }); return null; }
    return u;
  };
  const noStore = (res: Response) => res.set("Cache-Control", "no-store");

  // GET /api/templates
  app.get("/api/templates", async (req, res) => {
    noStore(res);
    if (!(await auth(req, res))) return;
    res.json({ items: [...rows.values()].sort((a, b) => a.createdAt - b.createdAt) });
  });

  // POST /api/templates/like
  app.post("/api/templates/like", async (req, res) => {
    const u = await auth(req, res); if (!u) return;
    const { id, liked } = (req.body || {}) as { id?: string; liked?: boolean };
    if (!id) return void res.status(400).json({ error: "bad_request" });
    const row = rows.get(String(id));
    if (!row) return void res.status(404).json({ error: "not_found" });
    const set = new Set(row.likes || []);
    if (liked) set.add(u.id); else set.delete(u.id);
    row.likes = [...set];
    persist();
    res.json({ ok: true, likes: row.likes });
  });

  // POST /api/templates  (إنشاء/تحديث منشور أو تعليق)
  app.post("/api/templates", async (req, res) => {
    const u = await auth(req, res); if (!u) return;
    const b = (req.body || {}) as Partial<TemplateRowServer>;
    if (!b.id || !(b.text || b.imageUrl || b.voiceUrl)) return void res.status(400).json({ error: "bad_request" });
    if (!isPermanentUrl(b.imageUrl) || !isPermanentUrl(b.voiceUrl)) {
      return void res.status(400).json({ error: "temporary_url", message: "ارفع الملف أولاً ثم أرسل رابطه الدائم" });
    }
    const id = String(b.id).slice(0, 80);
    const existing = rows.get(id);
    if (existing && existing.userId !== u.id) return void res.status(403).json({ error: "forbidden" });
    const parent = parentOf(String(b.text || ""));
    if (parent && !rows.has(parent)) return void res.status(404).json({ error: "parent_not_found" });
    rows.set(id, {
      id,
      userId: u.id, // من الجلسة دائماً
      name: b.name ?? null,
      username: b.username ?? null,
      avatarUrl: b.avatarUrl ?? null,
      text: String(b.text || "").slice(0, 600),
      imageUrl: b.imageUrl ?? null,
      voiceUrl: b.voiceUrl ?? null,
      voiceDuration: b.voiceDuration ?? null,
      likes: existing?.likes ?? [],
      createdAt: existing?.createdAt ?? (Number(b.createdAt) || Date.now()),
      editCount: b.editCount ?? 0,
      replyToId: b.replyToId ?? null,
      replyToName: b.replyToName ?? null,
      replyToText: b.replyToText ?? null,
    });
    persist();
    res.json({ ok: true, id });
  });

  // DELETE /api/templates/:id  (يحذف المنشور وتعليقاته)
  app.delete("/api/templates/:id", async (req, res) => {
    const u = await auth(req, res); if (!u) return;
    const id = String(req.params.id);
    const row = rows.get(id);
    if (!row) return void res.json({ ok: true });
    const admin = isAdmin ? await isAdmin(u) : false;
    if (row.userId !== u.id && !admin) return void res.status(403).json({ error: "forbidden" });
    rows.delete(id);
    for (const r of [...rows.values()]) if (parentOf(r.text) === id) rows.delete(r.id);
    persist();
    res.json({ ok: true });
  });
}
