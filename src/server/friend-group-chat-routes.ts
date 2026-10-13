/**
 * FRIEND-GROUP-CHAT ROUTES  (ملف جديد مستقل — لا يعدّل friend-chat-routes.js ولا أي ملف قديم)
 *
 * قروبات داخل شات الأصدقاء. جداول خاصة (MySQL):
 *   fgc_groups(id, owner_id, name, created_at)
 *   fgc_members(group_id, user_id, name, avatar, invited_by, joined_at, last_read)
 *   fgc_messages(id, group_id, sender_id, sender_name, kind, body, client_id, ts)
 *
 * المسارات (كلها تحتاج جلسة + عضوية):
 *   GET  /api/friend-group/list              قروباتي (مع الأعضاء)
 *   GET  /api/friend-group/unread            { byGroup: { [groupId]: n } }
 *   POST /api/friend-group/create            { name, me:{name,avatar}, members:[{id,name,avatar}] }
 *   GET  /api/friend-group/:id               معلومات القروب + الأعضاء
 *   GET  /api/friend-group/:id/messages      الرسائل (ويعلّم المقروء)
 *   POST /api/friend-group/:id/messages      { body, clientId }
 *   POST /api/friend-group/:id/invite        { userId, name, avatar }   أي عضو يقدر يدعو (بشرط أن المدعو صديقه)
 *   POST /api/friend-group/:id/leave         مغادرة (لو غادر المالك تنتقل الملكية لأقدم عضو)
 *   POST /api/friend-group/:id/kick          { userId }  للمالك فقط
 */
import type { Express, Request, Response } from "express";
import { randomUUID } from "node:crypto";

type GUser = { id?: string | number; name?: string | null; username?: string | null; avatarUrl?: string | null; image?: string | null } | null | undefined;

export interface FriendGroupDeps {
  pool: any; // mysql2/promise pool (نفس templatesPool)
  getUser: (req: Request) => Promise<GUser> | GUser;
  isFriend: (req: Request, meId: string, peerId: string) => Promise<boolean>;
  push?: (toId: string, title: string, text: string) => Promise<unknown> | unknown;
}

const MAX_MEMBERS = 50;
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

export function registerFriendGroupChatRoutes(app: Express, deps: FriendGroupDeps) {
  const { pool } = deps;
  if (!pool) { console.warn("[friend-group] no MySQL pool: group chats disabled"); return; }

  const q = async (sql: string, params: any[] = []): Promise<any> => (await pool.query(sql, params))[0];
  let ready: Promise<void> | null = null;
  const ensure = () => (ready ??= (async () => {
    await q(`CREATE TABLE IF NOT EXISTS fgc_groups (id VARCHAR(40) PRIMARY KEY, owner_id VARCHAR(64) NOT NULL, name VARCHAR(160) NOT NULL, created_at BIGINT NOT NULL)`);
    await q(`CREATE TABLE IF NOT EXISTS fgc_members (group_id VARCHAR(40) NOT NULL, user_id VARCHAR(64) NOT NULL, name VARCHAR(160) NOT NULL DEFAULT '', avatar TEXT NULL, invited_by VARCHAR(64) NULL, joined_at BIGINT NOT NULL, last_read BIGINT NOT NULL DEFAULT 0, PRIMARY KEY (group_id, user_id), INDEX (user_id))`);
    await q(`CREATE TABLE IF NOT EXISTS fgc_messages (id BIGINT AUTO_INCREMENT PRIMARY KEY, group_id VARCHAR(40) NOT NULL, sender_id VARCHAR(64) NOT NULL, sender_name VARCHAR(160) NOT NULL DEFAULT '', kind VARCHAR(10) NOT NULL DEFAULT 'text', body MEDIUMTEXT NOT NULL, client_id VARCHAR(64) NULL, ts BIGINT NOT NULL, INDEX (group_id, ts))`);
  })().catch((e) => { ready = null; throw e; }));

  const who = async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const u = await deps.getUser(req);
    const id = u?.id != null ? String(u.id) : "";
    if (!id) { res.status(401).json({ ok: false, error: "login required" }); return null; }
    await ensure();
    return { id, name: clip(u?.name || u?.username, 160), avatar: (u?.avatarUrl || u?.image || null) as string | null };
  };
  const isMember = async (gid: string, uid: string) => (await q(`SELECT 1 FROM fgc_members WHERE group_id=? AND user_id=? LIMIT 1`, [gid, uid])).length > 0;
  const members = async (gid: string) => (await q(`SELECT user_id AS id, name, avatar, joined_at AS joinedAt FROM fgc_members WHERE group_id=? ORDER BY joined_at ASC`, [gid])) as any[];
  const sys = (gid: string, text: string) => q(`INSERT INTO fgc_messages (group_id, sender_id, sender_name, kind, body, client_id, ts) VALUES (?,?,?,?,?,NULL,?)`, [gid, "system", "", "system", text, Date.now()]);
  const info = async (gid: string) => {
    const g = (await q(`SELECT id, name, owner_id AS ownerId FROM fgc_groups WHERE id=? LIMIT 1`, [gid]))[0];
    if (!g) return null;
    return { id: g.id, name: g.name, ownerId: g.ownerId, members: await members(gid) };
  };
  /** يرجع المعلومات فقط لو المستخدم عضو، وإلا يرسل 403/404 */
  const guard = async (req: Request, res: Response) => {
    const me = await who(req, res); if (!me) return null;
    const gid = clip(req.params.id, 40);
    const g = await info(gid);
    if (!g) { res.status(404).json({ ok: false, error: "no group" }); return null; }
    if (!g.members.some((m: any) => m.id === me.id)) { res.status(403).json({ ok: false, error: "not a member" }); return null; }
    return { me, gid, g };
  };
  const fail = (res: Response, e: unknown) => { console.error("[friend-group]", e); if (!res.headersSent) res.status(500).json({ ok: false, error: "server error" }); };
  const notify = (ids: string[], title: string, text: string) => { try { ids.forEach((id) => { void Promise.resolve(deps.push?.(id, title, text)).catch(() => {}); }); } catch { /* */ } };

  app.get("/api/friend-group/list", async (req, res) => {
    try {
      const me = await who(req, res); if (!me) return;
      const gs = (await q(`SELECT g.id, g.name, g.owner_id AS ownerId FROM fgc_groups g JOIN fgc_members m ON m.group_id=g.id WHERE m.user_id=? ORDER BY g.created_at DESC`, [me.id])) as any[];
      const out = [];
      for (const g of gs) out.push({ ...g, members: await members(g.id) });
      res.json({ groups: out });
    } catch (e) { fail(res, e); }
  });

  app.get("/api/friend-group/unread", async (req, res) => {
    try {
      const me = await who(req, res); if (!me) return;
      const rows = (await q(`SELECT m.group_id AS gid, COUNT(x.id) AS c FROM fgc_members m JOIN fgc_messages x ON x.group_id=m.group_id AND x.ts>m.last_read AND x.sender_id<>m.user_id AND x.kind='text' WHERE m.user_id=? GROUP BY m.group_id`, [me.id])) as any[];
      const byGroup: Record<string, number> = {};
      rows.forEach((r) => { if (Number(r.c) > 0) byGroup[String(r.gid)] = Number(r.c); });
      res.json({ byGroup });
    } catch (e) { fail(res, e); }
  });

  app.post("/api/friend-group/create", async (req, res) => {
    try {
      const me = await who(req, res); if (!me) return;
      const b: any = req.body || {};
      const list: any[] = Array.isArray(b.members) ? b.members : [];
      const uniq = new Map<string, { id: string; name: string; avatar: string | null }>();
      for (const m of list) {
        const id = clip(m?.id, 64);
        if (!id || id === me.id) continue;
        uniq.set(id, { id, name: clip(m?.name, 160), avatar: m?.avatar ? clip(m.avatar, 2000) : null });
      }
      if (uniq.size < 1 || uniq.size + 1 > MAX_MEMBERS) { res.status(400).json({ ok: false, error: "bad members" }); return; }
      for (const id of uniq.keys()) {
        if (!(await deps.isFriend(req, me.id, id))) { res.status(403).json({ ok: false, error: `not your friend: ${id}` }); return; }
      }
      const gid = randomUUID();
      const now = Date.now();
      const myName = me.name || clip(b?.me?.name, 160);
      const myAvatar = me.avatar || (b?.me?.avatar ? clip(b.me.avatar, 2000) : null);
      const name = clip(b.name, 160) || [myName, ...[...uniq.values()].map((m) => m.name)].filter(Boolean).join(", ") || "Group";
      await q(`INSERT INTO fgc_groups (id, owner_id, name, created_at) VALUES (?,?,?,?)`, [gid, me.id, name, now]);
      await q(`INSERT INTO fgc_members (group_id, user_id, name, avatar, invited_by, joined_at, last_read) VALUES (?,?,?,?,?,?,?)`, [gid, me.id, myName, myAvatar, null, now, now]);
      for (const m of uniq.values()) await q(`INSERT INTO fgc_members (group_id, user_id, name, avatar, invited_by, joined_at, last_read) VALUES (?,?,?,?,?,?,0)`, [gid, m.id, m.name, m.avatar, me.id, now + 1]);
      await sys(gid, `${myName || "Owner"} created the group`);
      notify([...uniq.keys()], myName || "Group", `${myName || "Someone"} added you to a group`);
      res.json({ ok: true, id: gid, name });
    } catch (e) { fail(res, e); }
  });

  app.get("/api/friend-group/:id", async (req, res) => {
    try { const c = await guard(req, res); if (c) res.json(c.g); } catch (e) { fail(res, e); }
  });

  app.get("/api/friend-group/:id/messages", async (req, res) => {
    try {
      const c = await guard(req, res); if (!c) return;
      const rows = (await q(`SELECT * FROM (SELECT id, sender_id, sender_name, kind, body, client_id, ts FROM fgc_messages WHERE group_id=? ORDER BY ts DESC, id DESC LIMIT 300) t ORDER BY ts ASC, id ASC`, [c.gid])) as any[];
      const reads = (await q(`SELECT user_id, last_read FROM fgc_members WHERE group_id=?`, [c.gid])) as any[];
      const others = reads.filter((r) => String(r.user_id) !== c.me.id);
      const nameOf = new Map<string, string>(c.g.members.map((m: any) => [m.id, m.name]));
      const messages = rows.map((r) => ({
        id: Number(r.id), from: String(r.sender_id), fromName: r.sender_name || nameOf.get(String(r.sender_id)) || "", kind: r.kind === "system" ? "system" : "text",
        text: String(r.body), clientId: r.client_id || undefined, ts: Number(r.ts),
        read: r.kind === "system" || (String(r.sender_id) === c.me.id && others.length > 0 && others.every((o) => Number(o.last_read) >= Number(r.ts))),
      }));
      await q(`UPDATE fgc_members SET last_read=? WHERE group_id=? AND user_id=?`, [Date.now(), c.gid, c.me.id]);
      res.json({ messages });
    } catch (e) { fail(res, e); }
  });

  app.post("/api/friend-group/:id/messages", async (req, res) => {
    try {
      const c = await guard(req, res); if (!c) return;
      const body = clip((req.body || {}).body, 4000);
      const cid = clip((req.body || {}).clientId, 64) || null;
      if (!body) { res.status(400).json({ ok: false, error: "empty" }); return; }
      if (cid) {
        const dup = (await q(`SELECT id, ts FROM fgc_messages WHERE group_id=? AND sender_id=? AND client_id=? LIMIT 1`, [c.gid, c.me.id, cid]))[0];
        if (dup) { res.json({ ok: true, id: Number(dup.id), ts: Number(dup.ts) }); return; }
      }
      const me = c.g.members.find((m: any) => m.id === c.me.id);
      const ts = Date.now();
      const r = await q(`INSERT INTO fgc_messages (group_id, sender_id, sender_name, kind, body, client_id, ts) VALUES (?,?,?,?,?,?,?)`, [c.gid, c.me.id, me?.name || c.me.name, "text", body, cid, ts]);
      await q(`UPDATE fgc_members SET last_read=? WHERE group_id=? AND user_id=?`, [ts, c.gid, c.me.id]);
      notify(c.g.members.map((m: any) => m.id).filter((id: string) => id !== c.me.id), c.g.name, `${me?.name || c.me.name}: ${body.startsWith("[") || body.length > 120 ? "📎" : body}`);
      res.json({ ok: true, id: Number(r.insertId), ts });
    } catch (e) { fail(res, e); }
  });

  app.post("/api/friend-group/:id/invite", async (req, res) => {
    try {
      const c = await guard(req, res); if (!c) return;
      const b: any = req.body || {};
      const uid = clip(b.userId, 64);
      if (!uid) { res.status(400).json({ ok: false, error: "userId" }); return; }
      if (c.g.members.some((m: any) => m.id === uid)) { res.json({ ok: true, already: true }); return; }
      if (c.g.members.length >= MAX_MEMBERS) { res.status(400).json({ ok: false, error: "group is full" }); return; }
      if (!(await deps.isFriend(req, c.me.id, uid))) { res.status(403).json({ ok: false, error: "not your friend" }); return; }
      const name = clip(b.name, 160);
      await q(`INSERT INTO fgc_members (group_id, user_id, name, avatar, invited_by, joined_at, last_read) VALUES (?,?,?,?,?,?,0)`, [c.gid, uid, name, b.avatar ? clip(b.avatar, 2000) : null, c.me.id, Date.now()]);
      const inviter = c.g.members.find((m: any) => m.id === c.me.id)?.name || c.me.name;
      await sys(c.gid, `${name || "Someone"} joined (invited by ${inviter || "a member"})`);
      notify([uid], c.g.name, `${inviter || "Someone"} added you to a group`);
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  app.post("/api/friend-group/:id/leave", async (req, res) => {
    try {
      const c = await guard(req, res); if (!c) return;
      const myName = c.g.members.find((m: any) => m.id === c.me.id)?.name || c.me.name;
      await q(`DELETE FROM fgc_members WHERE group_id=? AND user_id=?`, [c.gid, c.me.id]);
      const rest = await members(c.gid);
      if (!rest.length) {
        await q(`DELETE FROM fgc_messages WHERE group_id=?`, [c.gid]);
        await q(`DELETE FROM fgc_groups WHERE id=?`, [c.gid]);
      } else {
        await sys(c.gid, `${myName || "A member"} left`);
        if (c.g.ownerId === c.me.id) {
          await q(`UPDATE fgc_groups SET owner_id=? WHERE id=?`, [rest[0].id, c.gid]);
          await sys(c.gid, `${rest[0].name || "A member"} is now the group owner`);
        }
      }
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  app.post("/api/friend-group/:id/kick", async (req, res) => {
    try {
      const c = await guard(req, res); if (!c) return;
      if (c.g.ownerId !== c.me.id) { res.status(403).json({ ok: false, error: "owner only" }); return; }
      const uid = clip((req.body || {}).userId, 64);
      const target = c.g.members.find((m: any) => m.id === uid);
      if (!target || uid === c.me.id) { res.status(400).json({ ok: false, error: "bad target" }); return; }
      await q(`DELETE FROM fgc_members WHERE group_id=? AND user_id=?`, [c.gid, uid]);
      await sys(c.gid, `${target.name || "A member"} was removed`);
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });
}
