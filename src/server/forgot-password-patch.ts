/**
 * FORGOT-PASSWORD-PATCH
 * نسيت كلمة المرور — من داخل التطبيق: إرسال الطلب يفتح أيقونة، والضغط عليها يفتح تعيين الباسورد مرتين.
 * يُربَط من server/entry.ts عبر registerForgotPasswordRoutes(app).
 * لا يُعرض رابط للمستخدم. appToken داخلي فقط لتأكيد التغيير على السيرفر.
 */
import type { Express, Request, Response } from "express";
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);
const TTL_MS = 30 * 60 * 1000;
const APP_NAME = "Stooorna";

type ResetRec = { email: string; at: number; used: boolean };
type Store = Map<string, ResetRec>;

function store(): Store {
  const g = globalThis as typeof globalThis & { __stooornaForgotPw?: Store };
  if (!g.__stooornaForgotPw) g.__stooornaForgotPw = new Map();
  return g.__stooornaForgotPw;
}

function normEmail(raw: unknown): string {
  return String(raw || "").trim().toLowerCase();
}
function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function appOrigin(req: Request): string {
  const env = String(process.env.APP_ORIGIN || process.env.PUBLIC_APP_URL || process.env.APP_URL || "").replace(/\/$/, "");
  if (env) return env;
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0];
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0];
  return host ? `${proto}://${host}` : "";
}

function emailHtml(resetUrl: string): string {
  return `<!DOCTYPE html>
<html lang="ar">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#04120f;font-family:Tahoma,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#04120f;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:#0b1f22;border:1px solid rgba(0,188,212,0.35);border-radius:18px;overflow:hidden;">
        <tr><td style="padding:22px 22px 8px;text-align:center;background:linear-gradient(180deg,#0e2c30,#0b1f22);">
          <div style="font-size:22px;font-weight:900;letter-spacing:0.18em;color:#00BCD4;">STOOORNA</div>
          <div style="margin-top:6px;font-size:13px;color:#eab308;font-weight:700;">نسيت كلمة المرور · Forgot password</div>
        </td></tr>
        <tr><td style="padding:8px 22px 18px;color:#d7eeee;font-size:14px;line-height:1.7;text-align:right;direction:rtl;">
          <p style="margin:0 0 10px;">وصلك هذا الإيميل لأن أحد طلب تغيير كلمة مرور حساب <b style="color:#fff;">Stooorna</b>.</p>
          <p style="margin:0 0 14px;">اضغط الزر لفتح صفحة التطبيق، ثم اكتب كلمة المرور الجديدة مرتين.</p>
          <p style="margin:0;text-align:left;direction:ltr;color:rgba(200,230,230,0.75);font-size:13px;">This link opens Stooorna so you can set a new password. It expires in 30 minutes.</p>
        </td></tr>
        <tr><td align="center" style="padding:0 22px 18px;">
          <a href="${resetUrl}" style="display:inline-block;background:#00BCD4;color:#041018;text-decoration:none;font-weight:900;padding:12px 22px;border-radius:12px;">فتح Stooorna وتغيير كلمة المرور</a>
        </td></tr>
        <tr><td style="padding:0 22px 20px;color:rgba(180,210,210,0.55);font-size:11px;line-height:1.5;word-break:break-all;direction:ltr;text-align:left;">
          ${resetUrl}
        </td></tr>
      </table>
      <p style="color:rgba(150,190,190,0.45);font-size:11px;margin:14px 0 0;">${APP_NAME}</p>
    </td></tr>
  </table>
</body></html>`;
}

async function sendResetEmail(to: string, resetUrl: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || "Stooorna <noreply@stooorna.com>",
      to: [to],
      subject: "Stooorna · نسيت كلمة المرور",
      html: emailHtml(resetUrl),
    }),
  });
  if (!r.ok) {
    console.error("[forgot-password] resend", await r.text());
    return false;
  }
  return true;
}

async function hashPassword(password: string): Promise<string> {
  try {
    const mod = await import("@better-auth/utils/password").catch(() => null) as { hashPassword?: (p: string) => Promise<string> } | null;
    if (mod && typeof mod.hashPassword === "function") return await mod.hashPassword(password);
  } catch { /* fall through */ }
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password.normalize("NFKC"), salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

async function applyPassword(db: Record<string, any> | undefined, email: string, password: string): Promise<boolean> {
  const hash = await hashPassword(password);
  const pool = db?.pool || db?.mysqlPool || db?.connection || db?.client || db?.default;
  const query = pool?.query ? pool.query.bind(pool) : pool?.execute ? pool.execute.bind(pool) : null;
  if (!query) return false;
  const tries = [
    "UPDATE account SET password = ? WHERE userId IN (SELECT id FROM user WHERE LOWER(email) = ?)",
    "UPDATE account SET password = ? WHERE accountId IN (SELECT id FROM user WHERE LOWER(email) = ?)",
    "UPDATE users SET password = ? WHERE LOWER(email) = ?",
  ];
  for (const sql of tries) {
    try {
      const result = await query(sql, [hash, email]);
      const affected = Number(result?.affectedRows ?? result?.[0]?.affectedRows ?? 0);
      if (affected > 0) return true;
    } catch { /* table shape differs */ }
  }
  return false;
}

function persistApplied(dataDir: string, email: string) {
  try {
    mkdirSync(dataDir, { recursive: true });
    const file = join(dataDir, "applied.json");
    const prev = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
    prev[email] = Date.now();
    writeFileSync(file, JSON.stringify(prev));
  } catch { /* ignore */ }
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body as Record<string, unknown>;
  const raw = await new Promise<string>((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(""));
  });
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return { email: raw }; }
}

type LiveHide = { coins: boolean; gifts: boolean; deposit: boolean };
function liveHideStore(): { hide: LiveHide } {
  const g = globalThis as typeof globalThis & { __stooornaLiveHide?: { hide: LiveHide } };
  if (!g.__stooornaLiveHide) g.__stooornaLiveHide = { hide: { coins: false, gifts: false, deposit: false } };
  return g.__stooornaLiveHide;
}
export function registerLiveIconRoutes(app: Express) {
  app.get("/api/live-icons", (_req, res) => { res.json(liveHideStore()); });
  app.post("/api/live-icons", async (req, res) => {
    const body = await readBody(req);
    const hide = (body.hide || body) as Partial<LiveHide>;
    const cur = liveHideStore();
    cur.hide = { coins: !!hide.coins, gifts: !!hide.gifts, deposit: !!hide.deposit };
    res.json(cur);
  });
}

export function registerForgotPasswordRoutes(app: Express, opts?: { db?: Record<string, any>; dataDir?: string }) {
  const g = globalThis as typeof globalThis & { __stooornaForgotPwRoutes?: boolean };
  if (g.__stooornaForgotPwRoutes) return;
  g.__stooornaForgotPwRoutes = true;
  const dataDir = opts?.dataDir || join(process.cwd(), "data", "forgot-password");
  app.post("/api/password/forgot", async (req: Request, res: Response) => {
    const body = await readBody(req);
    const email = normEmail(body.email || req.query.email);
    if (!validEmail(email)) {
      res.status(400).json({ error: "invalid_email" });
      return;
    }
    const token = randomBytes(24).toString("hex");
    store().set(token, { email, at: Date.now(), used: false });
    const origin = appOrigin(req);
    const resetUrl = `${origin}/settings?forgot=${encodeURIComponent(token)}`;
    let sent = false;
    try { sent = await sendResetEmail(email, resetUrl); } catch (e) { console.error("[forgot-password] send", e); }
    console.log(`[forgot-password] ${email} sent=${sent}`);
    res.json({ ok: true, sent, appToken: token });
  });

  app.get("/api/password/forgot/verify", (req: Request, res: Response) => {
    const token = String(req.query.token || "");
    const rec = store().get(token);
    if (!rec || rec.used || Date.now() - rec.at > TTL_MS) {
      res.status(400).json({ ok: false, error: "expired" });
      return;
    }
    res.json({ ok: true, email: rec.email });
  });

  app.post("/api/password/forgot/confirm", async (req: Request, res: Response) => {
    const body = await readBody(req);
    const token = String(body.token || req.query.token || "");
    const password = String(body.password || "");
    const confirm = String(body.confirm || body.password2 || "");
    const emailHint = normEmail(body.email);
    let rec = token ? store().get(token) : undefined;
    if ((!rec || rec.used || Date.now() - rec.at > TTL_MS) && emailHint) {
      for (const item of store().values()) {
        if (item.email === emailHint && !item.used && Date.now() - item.at <= TTL_MS) rec = item;
      }
    }
    if (!rec || rec.used || Date.now() - rec.at > TTL_MS) {
      res.status(400).json({ ok: false, error: "expired" });
      return;
    }
    if (password.length < 6 || password !== confirm) {
      res.status(400).json({ ok: false, error: "password" });
      return;
    }
    const applied = await applyPassword(opts?.db, rec.email, password);
    rec.used = true;
    store().set(token, rec);
    persistApplied(dataDir, rec.email);
    try { mkdirSync(dirname(join(dataDir, "x")), { recursive: true }); } catch { /* */ }
    res.json({ ok: true, applied, email: rec.email });
  });
}
