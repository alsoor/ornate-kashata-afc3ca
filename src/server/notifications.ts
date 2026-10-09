import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Express, Request, Response } from "express";
import { extractMentions } from "./mentions.js";

export type AppNotice = {
  id: string;
  type: "call" | "mention" | "invite";
  toUserId: string;
  toUsername: string;
  fromUserId: string;
  fromName: string;
  fromAvatar?: string;
  title: string;
  body: string;
  room: string;
  messageId: string;
  href: string;
  at: number;
  read: boolean;
};

const FILE = join(dirname(fileURLToPath(import.meta.url)), "data", "notifications.json");
const mem = () => {
  const g = globalThis as typeof globalThis & { __stooornaNotices?: AppNotice[]; __stooornaNoticesLoaded?: boolean };
  if (!g.__stooornaNotices) g.__stooornaNotices = [];
  if (!g.__stooornaNoticesLoaded) {
    g.__stooornaNoticesLoaded = true;
    try {
      if (existsSync(FILE)) {
        const rows = JSON.parse(readFileSync(FILE, "utf8"));
        if (Array.isArray(rows)) g.__stooornaNotices = rows;
      }
    } catch { /* */ }
  }
  return g.__stooornaNotices;
};
const save = () => {
  try {
    mkdirSync(dirname(FILE), { recursive: true });
    const start = Date.now() - 24 * 60 * 60 * 1000;
    const rows = mem().filter(n => n.at >= start).slice(-500);
    mem().splice(0, mem().length, ...rows);
    writeFileSync(FILE, JSON.stringify(rows));
  } catch { /* */ }
};

export function pushNotification(row: Omit<AppNotice, "id" | "at" | "read"> & { id?: string }) {
  // ONE-TIME-PATCH: never notify someone about their own mention
  const _to = String(row.toUsername || "").replace(/^@/, "").toLowerCase();
  const _from = String(row.fromName || "").replace(/^@/, "").toLowerCase();
  if (row.type === "mention" && _to && _from && _to === _from) return { id: "", type: row.type, toUserId: "", toUsername: _to, fromUserId: "", fromName: "", title: "", body: "", room: "", messageId: "", href: "/", at: Date.now(), read: true } as AppNotice;
  if (row.type === "mention" && row.fromUserId && row.toUserId && String(row.fromUserId) === String(row.toUserId)) return { id: "", type: row.type, toUserId: "", toUsername: _to, fromUserId: "", fromName: "", title: "", body: "", room: "", messageId: "", href: "/", at: Date.now(), read: true } as AppNotice;
  // ONE-TIME-PATCH: the same message can reach us twice (server chat hook + the client POST) → keep only one notice per message per person
  if (row.type !== "invite") {
    const _mid = String(row.messageId || "");
    const _body = String(row.body || "").slice(0, 180);
    const _now = Date.now();
    const dup = mem().find(x =>
      x.type === row.type &&
      x.toUsername.toLowerCase() === _to &&
      (_mid
        ? x.messageId === _mid
        : (x.fromName === String(row.fromName || "") && x.body === _body && _now - x.at < 15000)));
    if (dup) return dup;
  }
  const n: AppNotice = {
    id: row.id || `nt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: row.type,
    toUserId: String(row.toUserId || ""),
    toUsername: String(row.toUsername || "").replace(/^@/, ""),
    fromUserId: String(row.fromUserId || ""),
    fromName: String(row.fromName || ""),
    fromAvatar: String((row as any).fromAvatar || ""),
    title: String(row.title || "Stooorna"),
    body: String(row.body || "").slice(0, 180),
    room: String(row.room || ""),
    messageId: String(row.messageId || ""),
    href: String(row.href || "/"),
    at: Date.now(),
    read: false,
  };
  mem().push(n);
  save();
  return n;
}

export function notifyMentionsFromText(text: string, from: { userId?: string; name?: string; room?: string; messageId?: string; kind?: string }) {
  const names = extractMentions(text);
  return names.map(username => pushNotification({
    type: "mention",
    toUsername: username,
    toUserId: "",
    fromUserId: from.userId || "",
    fromName: from.name || "",
    title: `${from.name || "Someone"} mentioned you`,
    body: text.slice(0, 140),
    room: from.room || "",
    messageId: from.messageId || "",
    href: `/?chat=1&msg=${encodeURIComponent(from.messageId || "")}`,
  }));
}

export function registerNotificationRoutes(app: Express) {
  app.get("/api/notifications", (req: Request, res: Response) => {
    const userId = String(req.query.userId || "");
    const username = String(req.query.username || "").replace(/^@/, "").toLowerCase();
    const since = Number(req.query.since || 0);
    const consume = String(req.query.consume || "") === "1";
    const rows = mem().filter(n => {
      if (n.at <= since) return false;
      if (n.type !== "invite" && n.read) return false; // ONE-TIME-PATCH: already delivered/seen → never again
      if (userId && n.toUserId && n.toUserId === userId) return true;
      if (username && n.toUsername && n.toUsername.toLowerCase() === username) return true;
      return false;
    });
    const out = rows.slice(-30);
    if (consume) {
      // the app asked to consume: each notice is handed over exactly once
      let touched = false;
      for (const n of out) if (n.type !== "invite" && !n.read) { n.read = true; touched = true; }
      if (touched) save();
      res.json({ ok: true, notifications: out.map(n => ({ ...n, read: false })) });
      return;
    }
    res.json({ ok: true, notifications: out });
  });
  app.post("/api/notifications", (req: Request, res: Response) => {
    const body = (req.body || {}) as any;
    const type = body.type === "call" || body.type === "invite" ? body.type : "mention";
    const names: string[] = Array.isArray(body.usernames) ? body.usernames.map(String) : extractMentions(String(body.text || body.body || ""));
    const created = (names.length ? names : [String(body.toUsername || "")]).filter(Boolean).map(username => pushNotification({
      type,
      toUsername: username,
      toUserId: String(body.toUserId || ""),
      fromUserId: String(body.fromUserId || ""),
      fromName: String(body.fromName || ""),
      fromAvatar: String(body.fromAvatar || ""),
      title: String(body.title || (type === "call" ? "Incoming call" : "Mention")),
      body: String(body.body || body.text || ""),
      room: String(body.room || ""),
      messageId: String(body.messageId || ""),
      href: String(body.href || "/"),
    }));
    res.json({ ok: true, notifications: created });
  });
  app.post("/api/notifications/read", (req: Request, res: Response) => {
    const id = String((req.body || {}).id || "");
    const row = mem().find(n => n.id === id);
    if (row) row.read = true;
    save();
    res.json({ ok: true });
  });
}
