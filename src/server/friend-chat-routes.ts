/**
 * FRIEND-CHAT-ROUTES — شات الأصدقاء المستقل (جدول خاص على السيرفر، بدون العلامة الخفية)
 *
 *  GET  /api/friend-chat/messages?with=<peerId>   -> { messages: [...] }  (ويعلّم رسائل الطرف الثاني كمقروءة)
 *  POST /api/friend-chat/messages { receiverId, body, clientId? } -> { ok, id, ts }
 *  GET  /api/friend-chat/unread                   -> { bySender: { [peerId]: count } }
 *
 * الجدول: friend_chat_messages (ينشأ تلقائياً). لا يلمس جدول الرسائل القديم نهائياً.
 * الهوية من الجلسة فقط. الإرسال فقط بين الأصدقاء (isFriend).
 */
import type { Express, Request, Response } from "express";

type Pool = { query: (sql: string, params?: unknown[]) => Promise<any> };

export interface FriendChatDeps {
  pool?: Pool;
  getUser: (req: Request) => Promise<any> | any;
  /** true إذا الطرفان أصدقاء مقبولون. لو ما انمرّرت، يُسمح بالإرسال لأي مستخدم. */
  isFriend?: (req: Request, meId: string, peerId: string) => Promise<boolean>;
  /** إشعار فوري على الجوال للمستلم (اختياري). */
  push?: (toId: string, fromName: string, text: string) => void | Promise<void>;
}

const MAX_LEN = 4000;
const rows = (r: any): any[] => (Array.isArray(r) ? (Array.isArray(r[0]) ? r[0] : r) : []);

export function registerFriendChatRoutes(app: Express, deps: FriendChatDeps): void {
  const { pool } = deps;
  let ready: Promise<void> | null = null;

  const ensure = (): Promise<void> => {
    if (!pool) return Promise.reject(new Error("no_db"));
    if (!ready) {
      ready = pool
        .query(
          `CREATE TABLE IF NOT EXISTS friend_chat_messages (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            sender_id VARCHAR(64) NOT NULL,
            receiver_id VARCHAR(64) NOT NULL,
            body TEXT NOT NULL,
            client_id VARCHAR(64) NULL,
            created_at BIGINT NOT NULL,
            read_at BIGINT NULL,
            INDEX idx_pair (sender_id, receiver_id, id),
            INDEX idx_inbox (receiver_id, read_at),
            UNIQUE KEY uq_client (sender_id, client_id)
          ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
        )
        .then(() => undefined)
        .catch((e) => {
          ready = null;
          throw e;
        });
    }
    return ready;
  };
  void ensure().then(
    () => console.log("[friend-chat] table friend_chat_messages ready"),
    (e) => console.error("[friend-chat] table init failed:", e instanceof Error ? e.message : e),
  );

  const fail = (res: Response, code: number, error: string) => res.status(code).json({ ok: false, error });
  const meOf = async (req: Request, res: Response): Promise<{ id: string; name: string } | null> => {
    res.setHeader("Cache-Control", "no-store");
    const u = await Promise.resolve(deps.getUser(req)).catch(() => null);
    if (!u || !u.id) { fail(res, 401, "unauthorized"); return null; }
    return { id: String(u.id), name: String(u.name || u.username || "Stooorna").slice(0, 60) };
  };
  const guard = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response) => {
    fn(req, res).catch((e) => {
      console.error("[friend-chat] error:", e instanceof Error ? e.message : e);
      if (!res.headersSent) fail(res, e?.message === "no_db" ? 503 : 500, "server_error");
    });
  };

  app.get("/api/friend-chat/messages", guard(async (req, res) => {
    const me = await meOf(req, res); if (!me) return;
    const peer = String(req.query.with || "").trim();
    if (!peer) return fail(res, 400, "bad_request");
    await ensure();
    const list = rows(await pool!.query(
      `SELECT id, sender_id, receiver_id, body, client_id, created_at, read_at FROM (
         SELECT * FROM friend_chat_messages
         WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
         ORDER BY id DESC LIMIT 300
       ) t ORDER BY id ASC`,
      [me.id, peer, peer, me.id],
    ));
    // فتح الشات = قراءة رسائل الطرف الثاني
    await pool!.query(
      `UPDATE friend_chat_messages SET read_at = ? WHERE sender_id = ? AND receiver_id = ? AND read_at IS NULL`,
      [Date.now(), peer, me.id],
    );
    res.json({
      messages: list.map((m) => ({
        id: Number(m.id),
        from: String(m.sender_id),
        to: String(m.receiver_id),
        body: String(m.body),
        clientId: m.client_id || undefined,
        ts: Number(m.created_at),
        read: m.read_at != null,
      })),
    });
  }));

  app.post("/api/friend-chat/messages", guard(async (req, res) => {
    const me = await meOf(req, res); if (!me) return;
    const b = (req.body || {}) as Record<string, unknown>;
    const to = String(b.receiverId || "").trim();
    const text = String(b.body ?? "").trim().slice(0, MAX_LEN);
    const clientId = b.clientId ? String(b.clientId).slice(0, 64) : null;
    if (!to || !text || to === me.id) return fail(res, 400, "bad_request");
    if (deps.isFriend && !(await deps.isFriend(req, me.id, to))) return fail(res, 403, "not_friends");
    await ensure();
    const ts = Date.now();
    try {
      const r: any = await pool!.query(
        `INSERT INTO friend_chat_messages (sender_id, receiver_id, body, client_id, created_at) VALUES (?, ?, ?, ?, ?)`,
        [me.id, to, text, clientId, ts],
      );
      const id = Number((Array.isArray(r) ? r[0] : r)?.insertId || 0);
      if (deps.push) void Promise.resolve(deps.push(to, me.name, text.slice(0, 120))).catch(() => undefined);
      return res.json({ ok: true, id, ts });
    } catch (e: any) {
      // إعادة إرسال بنفس clientId => نرجع الرسالة الأولى بدل تكرارها
      if (clientId && (e?.code === "ER_DUP_ENTRY" || e?.errno === 1062)) {
        const ex = rows(await pool!.query(
          `SELECT id, created_at FROM friend_chat_messages WHERE sender_id = ? AND client_id = ? LIMIT 1`, [me.id, clientId]));
        if (ex[0]) return res.json({ ok: true, id: Number(ex[0].id), ts: Number(ex[0].created_at) });
      }
      throw e;
    }
  }));

  app.get("/api/friend-chat/unread", guard(async (req, res) => {
    const me = await meOf(req, res); if (!me) return;
    await ensure();
    const list = rows(await pool!.query(
      `SELECT sender_id, COUNT(*) AS c FROM friend_chat_messages WHERE receiver_id = ? AND read_at IS NULL GROUP BY sender_id`,
      [me.id],
    ));
    const bySender: Record<string, number> = {};
    for (const r of list) bySender[String(r.sender_id)] = Number(r.c);
    res.json({ bySender });
  }));
}
