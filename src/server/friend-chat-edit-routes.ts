/**
 * FRIEND-CHAT-EDIT-ROUTES — تعديل رسالة + حذفها عند الطرفين (شات الأصدقاء داخل Stooorna Ai).
 * ملف مستقل: لا يغيّر friend-chat-routes.ts ولا شكل جدول friend_chat_messages؛ يضيف جدولاً واحداً خاصاً به (friend_chat_changes).
 *
 *   PATCH  /api/friend-chat/messages/:id   { body }   => يعدّل نص رسالتي (المرسل فقط) ويسجّل "معدّلة"
 *   DELETE /api/friend-chat/messages/:id              => يمسح رسالتي من السيرفر نهائياً (يختفي عند الطرفين) ويسجّل علامة حذف
 *   GET    /api/friend-chat/changes?with=<peerId>     => { deleted:[ids], edited:[ids] } ليحدّث الطرف الثاني نسخته المخزّنة على جهازه
 *
 * الربط في entry.ts (بعد registerFriendChatRoutes):
 *   import { registerFriendChatEditRoutes } from "./friend-chat-edit-routes.js"; // FRIEND-CHAT-EDIT
 *   registerFriendChatEditRoutes(app, { pool: templatesPool, getUser: (req) => session.user(req) });
 *
 * أسماء أعمدة جدول friend_chat_messages تُكتشف تلقائياً (sender_id/from_id ، receiver_id/to_id ، body/text/content).
 */
import type { Express, Request, Response } from "express";

interface Opts {
  pool: any; // mysql2/promise pool
  getUser: (req: Request) => Promise<any> | any;
}

const TABLE = "friend_chat_messages";
const MAX_LEN = 4000;
const pick = (cols: string[], names: string[]) => names.find((n) => cols.includes(n)) || null;

export function registerFriendChatEditRoutes(app: Express, o: Opts) {
  const { pool } = o;

  const ready = pool
    .query(`CREATE TABLE IF NOT EXISTS friend_chat_changes (
      id BIGINT AUTO_INCREMENT PRIMARY KEY, msg_id BIGINT NOT NULL, user_a VARCHAR(64) NOT NULL, user_b VARCHAR(64) NOT NULL,
      kind VARCHAR(8) NOT NULL, at BIGINT NOT NULL,
      UNIQUE KEY uq_msg_kind (msg_id, kind), KEY idx_pair (user_a, user_b, id), KEY idx_pair2 (user_b, user_a, id)
    ) CHARACTER SET utf8mb4`)
    .catch((e: unknown) => console.error("[friend-chat-edit] migrate failed", e));

  let schema: { sender: string; receiver: string; body: string } | null = null;
  const cols = async () => {
    if (schema) return schema;
    const [rows]: any = await pool.query(
      "SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", [TABLE]);
    const names = (rows as any[]).map((r) => String(r.c));
    const sender = pick(names, ["sender_id", "from_id", "from_user_id", "sender"]);
    const receiver = pick(names, ["receiver_id", "to_id", "to_user_id", "receiver"]);
    const body = pick(names, ["body", "text", "content", "message"]);
    if (!sender || !receiver || !body) throw new Error("friend_chat_messages columns not found");
    schema = { sender, receiver, body };
    return schema;
  };

  const me = async (req: Request, res: Response) => {
    await ready;
    const u = await Promise.resolve(o.getUser(req)).catch(() => null);
    if (!u?.id) { res.status(401).json({ error: "unauthorized" }); return null; }
    return String(u.id);
  };
  const msgId = (req: Request) => { const n = Number(req.params.id); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };

  /** تعديل نص رسالة — المرسل فقط، نص عادي فقط (لا وسائط/لوكيشن/منشور). */
  app.patch("/api/friend-chat/messages/:id", async (req, res) => {
    const uid = await me(req, res); if (!uid) return;
    try {
      const c = await cols(); const id = msgId(req);
      const body = String(req.body?.body ?? "").trim().slice(0, MAX_LEN);
      if (!id || !body) return res.status(400).json({ error: "bad request" });
      const [rows]: any = await pool.query(`SELECT \`${c.receiver}\` AS r, \`${c.body}\` AS b FROM ${TABLE} WHERE id=? AND \`${c.sender}\`=?`, [id, uid]);
      const row = rows?.[0];
      if (!row) return res.status(404).json({ error: "not found" });
      if (String(row.b).startsWith("TPLPOST::")) return res.status(400).json({ error: "not editable" });
      const at = Date.now();
      await pool.query(`UPDATE ${TABLE} SET \`${c.body}\`=? WHERE id=? AND \`${c.sender}\`=?`, [body, id, uid]);
      await pool.query(
        "INSERT INTO friend_chat_changes (msg_id, user_a, user_b, kind, at) VALUES (?,?,?,'edit',?) ON DUPLICATE KEY UPDATE at=VALUES(at)",
        [id, uid, String(row.r), at]);
      res.json({ ok: true, id, editedAt: at });
    } catch (e) { console.error("[friend-chat-edit] patch", e); res.status(500).json({ error: "server" }); }
  });

  /** حذف عند الطرفين — يمسح الصف فعلياً ويترك علامة حذف ليتنظّف عند الطرف الثاني. */
  app.delete("/api/friend-chat/messages/:id", async (req, res) => {
    const uid = await me(req, res); if (!uid) return;
    try {
      const c = await cols(); const id = msgId(req);
      if (!id) return res.status(400).json({ error: "bad request" });
      const [rows]: any = await pool.query(`SELECT \`${c.receiver}\` AS r FROM ${TABLE} WHERE id=? AND \`${c.sender}\`=?`, [id, uid]);
      const row = rows?.[0];
      if (!row) return res.status(404).json({ error: "not found" });
      await pool.query(`DELETE FROM ${TABLE} WHERE id=? AND \`${c.sender}\`=?`, [id, uid]);
      await pool.query("DELETE FROM friend_chat_changes WHERE msg_id=? AND kind='edit'", [id]);
      await pool.query(
        "INSERT INTO friend_chat_changes (msg_id, user_a, user_b, kind, at) VALUES (?,?,?,'del',?) ON DUPLICATE KEY UPDATE at=VALUES(at)",
        [id, uid, String(row.r), Date.now()]);
      res.json({ ok: true, id });
    } catch (e) { console.error("[friend-chat-edit] delete", e); res.status(500).json({ error: "server" }); }
  });

  /** سجل التعديل/الحذف بيني وبين شخص (آخر 500) — الواجهة تنادي عليه مع كل تحديث للرسائل. */
  app.get("/api/friend-chat/changes", async (req, res) => {
    const uid = await me(req, res); if (!uid) return;
    try {
      const peer = String(req.query.with ?? "").slice(0, 64);
      if (!peer) return res.status(400).json({ error: "with required" });
      const [rows]: any = await pool.query(
        `SELECT msg_id, kind FROM friend_chat_changes WHERE (user_a=? AND user_b=?) OR (user_a=? AND user_b=?) ORDER BY id DESC LIMIT 500`,
        [uid, peer, peer, uid]);
      const deleted: string[] = [], edited: string[] = [];
      (rows as any[]).forEach((r) => (r.kind === "del" ? deleted : edited).push(String(r.msg_id)));
      res.json({ deleted, edited });
    } catch (e) { console.error("[friend-chat-edit] changes", e); res.status(500).json({ error: "server" }); }
  });
}
