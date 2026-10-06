/**
 * templates-routes.ts → ضعه بجانب entry.ts (نفس مجلد withdrawals.ts)
 *
 * مسارات /api/templates لتطبيق Express الموجود عندك، مع تخزين دائم في ملف JSON
 * داخل ASSETS_DIR/_private/templates (المجلد _private محجوب عن الوصول العام عبر privateAssetsGuard).
 * ⚠️ يتطلب أن ASSETS_DIR على Volume دائم، وإلا ستضيع البيانات عند كل نشر.
 *
 * لا يوجد أي مسح تلقائي: الحذف فقط بطلب DELETE من صاحب المنشور (أو الأدمن).
 */
import type { Express, Request, Response } from "express";
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
  dataDir: string;
  getUser: (req: Request) => Promise<{ id: string; username?: string; email?: string } | null>;
  isAdmin?: (u: { id: string; username?: string; email?: string }) => Promise<boolean> | boolean;
}

const CMT_RE = /^↩([^\u200b\s]+)\u200b/;
const parentOf = (text: string) => CMT_RE.exec(text || "")?.[1] ?? null;
/** فقط روابط دائمة: مسار نسبي أو http(s). يرفض blob: و data: */
const isPermanentUrl = (u?: string | null) => !u || /^https?:\/\//i.test(u) || u.startsWith("/");

export function registerTemplatesRoutes(app: Express, opts: Opts) {
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
