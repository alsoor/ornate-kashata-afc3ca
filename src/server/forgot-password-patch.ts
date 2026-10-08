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

type ResetRec = { email: string; at: number; used: boolean; phone?: string };
type Store = Map<string, ResetRec>;

function store(): Store {
  const g = globalThis as typeof globalThis & { __stooornaForgotPw?: Store };
  if (!g.__stooornaForgotPw) g.__stooornaForgotPw = new Map();
  return g.__stooornaForgotPw;
}
function tokenFile(dataDir: string) { return join(dataDir, "tokens.json"); }
function rememberToken(dataDir: string, token: string, rec: ResetRec) {
  rememberToken(dataDir, token || rec.email, rec);
  try {
    mkdirSync(dataDir, { recursive: true });
    const file = tokenFile(dataDir);
    const prev = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
    prev[token] = rec;
    writeFileSync(file, JSON.stringify(prev));
  } catch { /* ignore */ }
}
function findToken(dataDir: string, token: string, emailHint: string): ResetRec | undefined {
  const mem = token ? store().get(token) : undefined;
  if (mem) return mem;
  try {
    const file = tokenFile(dataDir);
    if (!existsSync(file)) return emailHint ? undefined : undefined;
    const prev = JSON.parse(readFileSync(file, "utf8")) as Record<string, ResetRec>;
    if (token && prev[token]) { store().set(token, prev[token]); return prev[token]; }
    if (emailHint) {
      let best: ResetRec | undefined;
      for (const rec of Object.values(prev)) {
        if (rec.email === emailHint && !rec.used && (!best || rec.at > best.at)) best = rec;
      }
      return best;
    }
  } catch { /* ignore */ }
  return undefined;
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


function digitsOf(raw: string): string { return String(raw || "").replace(/\D/g, ""); }
function maskPhone(raw: string): string {
  const d = digitsOf(raw);
  if (d.length < 4) return "";
  return `+${"x".repeat(Math.max(4, d.length - 3))}${d.slice(-3)}`;
}
function phonesMatch(stored: string, given: string): boolean {
  const a = digitsOf(stored);
  const b = digitsOf(given);
  if (a.length < 8 || b.length < 8) return false;
  return a === b || a.endsWith(b) || b.endsWith(a);
}
function phoneFile(dataDir: string) { return join(dataDir, "phones.json"); }
function readPhoneFile(dataDir: string): Record<string, string> {
  try {
    const file = phoneFile(dataDir);
    if (!existsSync(file)) return {};
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? parsed as Record<string, string> : {};
  } catch { return {}; }
}
function writePhoneFile(dataDir: string, email: string, phone: string) {
  try {
    mkdirSync(dataDir, { recursive: true });
    const prev = readPhoneFile(dataDir);
    prev[email] = phone;
    writeFileSync(phoneFile(dataDir), JSON.stringify(prev));
  } catch { /* ignore */ }
}
async function phoneForEmail(db: Record<string, any> | undefined, dataDir: string, email: string): Promise<string> {
  const saved = String(readPhoneFile(dataDir)[email] || "").trim();
  const query = queryOf(db);
  if (query) {
    for (const sql of [
      "SELECT phone FROM `user` WHERE LOWER(email) = ? LIMIT 1",
      "SELECT phoneNumber AS phone FROM `user` WHERE LOWER(email) = ? LIMIT 1",
      "SELECT mobile AS phone FROM `user` WHERE LOWER(email) = ? LIMIT 1",
    ]) {
      try {
        const rows = rowsOf(await query(sql, [email]));
        const phone = String(rows[0]?.phone || "").trim();
        if (phone) return phone;
      } catch { /* column missing */ }
    }
  }
  return saved;
}
async function savePhone(db: Record<string, any> | undefined, dataDir: string, email: string, phone: string) {
  writePhoneFile(dataDir, email, phone);
  const query = queryOf(db);
  if (!query) return;
  for (const sql of [
    "UPDATE `user` SET phone = ? WHERE LOWER(email) = ?",
    "UPDATE `user` SET phoneNumber = ? WHERE LOWER(email) = ?",
    "UPDATE user SET phone = ? WHERE LOWER(email) = ?",
  ]) {
    try {
      const result = await query(sql, [phone, email]);
      if (affectedOf(result) > 0) return;
    } catch { /* next column */ }
  }
}

async function hashPassword(password: string): Promise<string> {
  const normalized = password.normalize("NFKC");
  for (const spec of ["better-auth/crypto", "@better-auth/utils/password"]) {
    try {
      const mod = await import(spec).catch(() => null) as { hashPassword?: (p: string) => Promise<string> } | null;
      if (mod && typeof mod.hashPassword === "function") return await mod.hashPassword(normalized);
    } catch { /* fall through to the same scrypt format Better Auth verifies */ }
  }
  // Better Auth credential hash: saltHex:keyHex, scrypt N=16384 r=16 p=1 dkLen=64
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(normalized, salt, 64, { N: 16384, r: 16, p: 1, maxmem: 64 * 1024 * 1024 })) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

async function verifyPassword(hash: string, password: string): Promise<boolean> {
  const normalized = password.normalize("NFKC");
  for (const spec of ["better-auth/crypto", "@better-auth/utils/password"]) {
    try {
      const mod = await import(spec).catch(() => null) as { verifyPassword?: (h: string, p: string) => Promise<boolean> } | null;
      if (mod && typeof mod.verifyPassword === "function") return await mod.verifyPassword(hash, normalized);
    } catch { /* */ }
  }
  const [salt, keyHex] = String(hash || "").split(":");
  if (!salt || !keyHex) return false;
  const key = (await scrypt(normalized, salt, 64, { N: 16384, r: 16, p: 1, maxmem: 64 * 1024 * 1024 })) as Buffer;
  return key.toString("hex") === keyHex;
}

function queryOf(db: Record<string, any> | undefined): ((sql: string, params?: unknown[]) => Promise<any>) | null {
  const pool = db?.pool || db?.mysqlPool || db?.connection || db?.client;
  if (pool?.query) return pool.query.bind(pool);
  if (pool?.execute) return pool.execute.bind(pool);
  return null;
}

function rowsOf(result: any): any[] {
  if (Array.isArray(result?.[0])) return result[0];
  if (Array.isArray(result) && result[0] && typeof result[0] === "object" && !("affectedRows" in result[0])) return result;
  return [];
}

function affectedOf(result: any): number {
  const pkt = result && result.affectedRows != null ? result : Array.isArray(result) ? result[0] : null;
  return Number(pkt?.affectedRows ?? 0);
}

async function emailRegistered(db: Record<string, any> | undefined, email: string): Promise<boolean> {
  const query = queryOf(db);
  if (!query) return false;
  const tries = [
    "SELECT id FROM `user` WHERE LOWER(email) = ? LIMIT 1",
    "SELECT id FROM user WHERE LOWER(email) = ? LIMIT 1",
    "SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1",
  ];
  for (const sql of tries) {
    try {
      const result = await query(sql, [email]);
      const rows = rowsOf(result);
      if (rows.length > 0) return true;
    } catch { /* table shape differs */ }
  }
  return false;
}

async function applyPassword(db: Record<string, any> | undefined, email: string, password: string): Promise<boolean> {
  const query = queryOf(db);
  if (!query) return false;
  const hash = await hashPassword(password);
  let userId = "";
  for (const sql of [
    "SELECT id FROM `user` WHERE LOWER(email) = ? LIMIT 1",
    "SELECT id FROM user WHERE LOWER(email) = ? LIMIT 1",
    "SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1",
  ]) {
    try {
      const rows = rowsOf(await query(sql, [email]));
      if (rows[0]?.id) { userId = String(rows[0].id); break; }
    } catch { /* next table name */ }
  }
  if (!userId) return false;
  const updates: Array<[string, unknown[]]> = [
    ["UPDATE account SET password = ? WHERE userId = ? AND providerId = 'credential'", [hash, userId]],
    ["UPDATE account SET password = ? WHERE userId = ?", [hash, userId]],
    ["UPDATE account SET password = ? WHERE user_id = ? AND providerId = 'credential'", [hash, userId]],
    ["UPDATE account SET password = ? WHERE user_id = ?", [hash, userId]],
    ["UPDATE account SET password = ? WHERE accountId = ? AND providerId = 'credential'", [hash, userId]],
    ["UPDATE `account` SET `password` = ? WHERE `userId` = ?", [hash, userId]],
  ];
  for (const [sql, params] of updates) {
    try {
      const result = await query(sql, params);
      if (affectedOf(result) > 0) return true;
    } catch { /* column/table shape differs */ }
  }
  // Row matched but MySQL reported 0 changed rows: read back and accept a credential hash we can verify.
  try {
    const rows = rowsOf(await query("SELECT password FROM account WHERE userId = ? AND password IS NOT NULL LIMIT 1", [userId]));
    const stored = String(rows[0]?.password || "");
    if (stored && await verifyPassword(stored, password)) return true;
  } catch { /* ignore */ }
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
    const registered = await emailRegistered(opts?.db, email);
    if (!registered) {
      res.status(404).json({ ok: false, error: "not_registered" });
      return;
    }
    const phone = await phoneForEmail(opts?.db, dataDir, email);
    if (!phone) {
      res.status(400).json({ ok: false, error: "no_phone" });
      return;
    }
    const token = randomBytes(24).toString("hex");
    rememberToken(dataDir, token, { email, phone, at: Date.now(), used: false });
    const origin = appOrigin(req);
    const resetUrl = `${origin}/settings?forgot=${encodeURIComponent(token)}`;
    let sent = false;
    try { sent = await sendResetEmail(email, resetUrl); } catch (e) { console.error("[forgot-password] send", e); }
    console.log(`[forgot-password] ${email} sent=${sent}`);
    res.json({ ok: true, sent, appToken: token, phoneMask: maskPhone(phone) });
  });


  app.post("/api/password/phone-bind", async (req: Request, res: Response) => {
    const body = await readBody(req);
    const email = normEmail(body.email);
    const phone = String(body.phone || "").trim();
    if (!validEmail(email) || digitsOf(phone).length < 8) {
      res.status(400).json({ ok: false, error: "phone" });
      return;
    }
    if (!(await emailRegistered(opts?.db, email))) {
      res.status(404).json({ ok: false, error: "not_registered" });
      return;
    }
    await savePhone(opts?.db, dataDir, email, phone);
    res.json({ ok: true, phone });
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
    let rec = findToken(dataDir, token, emailHint);
    if ((!rec || rec.used || Date.now() - rec.at > TTL_MS) && emailHint) {
      for (const item of store().values()) {
        if (item.email === emailHint && !item.used && Date.now() - item.at <= TTL_MS) rec = item;
      }
      if (!rec || rec.used) rec = findToken(dataDir, "", emailHint);
    }
    if (!rec || rec.used || Date.now() - rec.at > TTL_MS) {
      res.status(400).json({ ok: false, error: "expired" });
      return;
    }
    if (password.length < 6 || password !== confirm) {
      res.status(400).json({ ok: false, error: "password" });
      return;
    }
    if (!(await emailRegistered(opts?.db, rec.email))) {
      res.status(404).json({ ok: false, error: "not_registered" });
      return;
    }
    const givenPhone = String(body.phone || "");
    const storedPhone = rec.phone || await phoneForEmail(opts?.db, dataDir, rec.email);
    if (!storedPhone || !phonesMatch(storedPhone, givenPhone)) {
      res.status(400).json({ ok: false, error: "phone_mismatch" });
      return;
    }
    const applied = await applyPassword(opts?.db, rec.email, password);
    if (!applied) {
      res.status(400).json({ ok: false, error: "not_applied" });
      return;
    }
    rec.used = true;
    store().set(token, rec);
    persistApplied(dataDir, rec.email);
    try { mkdirSync(dirname(join(dataDir, "x")), { recursive: true }); } catch { /* */ }
    res.json({ ok: true, applied, email: rec.email });
  });
}
