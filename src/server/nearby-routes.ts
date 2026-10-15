/**
 * NEARBY-ROUTES — مسارات السيرفر لميزة "القريبون" (النقطة الزرقاء في Stooorna Ai).
 * مستقل تماماً: جداول خاصة (nearby_presence / nearby_messages) ولا يلمس أي مسار قديم.
 * كل المسارات تتطلب جلسة مستخدم مسجّل => الميزة محصورة بمستخدمي التطبيق فقط (بدون شرط الصداقة).
 *
 * الربط في entry.ts:
 *   import { registerNearbyRoutes } from "./nearby-routes.js"; // NEARBY
 *   registerNearbyRoutes(app, { pool: templatesPool, getUser: (req) => session.user(req),
 *     push: (toId, fromName, text) => sendFcmToUser({ userId: toId, title: fromName, body: text, url: `/?openChat=1&peerName=${encodeURIComponent(fromName || "")}`, type: "message" } as any) });
 */
import type { Express, Request, Response } from "express";

interface Opts {
  pool: any; // mysql2/promise pool
  getUser: (req: Request) => Promise<any> | any;
  push?: (toId: string, fromName: string, text: string) => Promise<unknown> | unknown;
}

const TTL_MS = 10 * 60 * 1000; // الموقع يختفي تلقائياً بعد 10 دقائق بدون تحديث
const clean = (s: unknown, n = 4000) => String(s ?? '').slice(0, n);

function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000, r = (x: number) => (x * Math.PI) / 180;
  const dLat = r(bLat - aLat), dLng = r(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function registerNearbyRoutes(app: Express, o: Opts) {
  const { pool } = o;
  const ready = (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS nearby_presence (
      user_id VARCHAR(64) PRIMARY KEY, lat DOUBLE NOT NULL, lng DOUBLE NOT NULL, accuracy DOUBLE NULL,
      name VARCHAR(120) NOT NULL, avatar TEXT NULL, updated_at BIGINT NOT NULL, KEY idx_upd (updated_at)
    ) CHARACTER SET utf8mb4`);
    await pool.query(`CREATE TABLE IF NOT EXISTS nearby_messages (
      id BIGINT AUTO_INCREMENT PRIMARY KEY, sender_id VARCHAR(64) NOT NULL, receiver_id VARCHAR(64) NOT NULL,
      client_id VARCHAR(80) NOT NULL, body TEXT NOT NULL, created_at BIGINT NOT NULL, read_at BIGINT NULL,
      UNIQUE KEY uq_client (sender_id, client_id), KEY idx_pair (sender_id, receiver_id, id), KEY idx_rcv (receiver_id, read_at)
    ) CHARACTER SET utf8mb4`);
  })().catch((e) => console.error('[nearby] migrate failed', e));

  const me = async (req: Request, res: Response) => {
    await ready;
    const u = await Promise.resolve(o.getUser(req)).catch(() => null);
    if (!u?.id) { res.status(401).json({ error: 'unauthorized' }); return null; }
    return { id: String(u.id), name: String(u.name || u.username || 'User'), avatar: (u.avatarUrl ?? u.image ?? null) as string | null };
  };

  /** تحديث موقعي (يُستدعى فقط عند ضغط زر البحث). */
  app.post('/api/nearby/ping', async (req, res) => {
    const u = await me(req, res); if (!u) return;
    const lat = Number(req.body?.lat), lng = Number(req.body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return res.status(400).json({ error: 'bad coords' });
    await pool.query(
      `INSERT INTO nearby_presence (user_id, lat, lng, accuracy, name, avatar, updated_at) VALUES (?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE lat=VALUES(lat), lng=VALUES(lng), accuracy=VALUES(accuracy), name=VALUES(name), avatar=VALUES(avatar), updated_at=VALUES(updated_at)`,
      [u.id, lat, lng, Number(req.body?.accuracy) || null, u.name, u.avatar, Date.now()],
    );
    res.json({ ok: true });
  });

  /** إخفاء موقعي. */
  app.delete('/api/nearby/ping', async (req, res) => {
    const u = await me(req, res); if (!u) return;
    await pool.query('DELETE FROM nearby_presence WHERE user_id=?', [u.id]);
    res.json({ ok: true });
  });

  /** المستخدمون القريبون (من ضغطوا بحث مؤخراً داخل نفس النطاق). */
  app.get('/api/nearby', async (req, res) => {
    const u = await me(req, res); if (!u) return;
    const [rows]: any = await pool.query('SELECT * FROM nearby_presence WHERE user_id=?', [u.id]);
    const mine = rows?.[0];
    if (!mine) return res.json({ users: [] });
    const radius = Math.min(50000, Math.max(100, Number(req.query.radius) || 3000));
    const dLat = radius / 111000, dLng = radius / (111000 * Math.max(0.2, Math.cos((mine.lat * Math.PI) / 180)));
    const [near]: any = await pool.query(
      'SELECT * FROM nearby_presence WHERE user_id<>? AND updated_at>? AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? LIMIT 200',
      [u.id, Date.now() - TTL_MS, mine.lat - dLat, mine.lat + dLat, mine.lng - dLng, mine.lng + dLng],
    );
    const users = (near as any[])
      .map(p => ({ id: String(p.user_id), name: p.name, avatar: p.avatar, distance: haversine(mine.lat, mine.lng, p.lat, p.lng) }))
      .filter(p => p.distance <= radius).sort((a, b) => a.distance - b.distance).slice(0, 100);
    res.json({ users });
  });

  /** إرسال رسالة (لأي مستخدم مسجّل — بدون شرط الصداقة). clientId يمنع التكرار. */
  app.post('/api/nearby/messages', async (req, res) => {
    const u = await me(req, res); if (!u) return;
    const to = clean(req.body?.receiverId, 64), body = clean(req.body?.body), cid = clean(req.body?.clientId, 80);
    if (!to || !body || !cid || to === u.id) return res.status(400).json({ error: 'bad request' });
    const ts = Date.now();
    const [r]: any = await pool.query('INSERT IGNORE INTO nearby_messages (sender_id, receiver_id, client_id, body, created_at) VALUES (?,?,?,?,?)', [u.id, to, cid, body, ts]);
    if (r?.affectedRows && o.push) { try { await o.push(to, u.name, body); } catch { /* */ } }
    res.json({ ok: true, ts, id: r?.insertId });
  });

  /** رسائل المحادثة بيني وبين شخص — ويعلّم الواردة كمقروءة. */
  app.get('/api/nearby/messages', async (req, res) => {
    const u = await me(req, res); if (!u) return;
    const peer = clean(req.query.with, 64); if (!peer) return res.status(400).json({ error: 'with required' });
    const [rows]: any = await pool.query(
      `SELECT id, sender_id, receiver_id, client_id, body, created_at FROM nearby_messages
       WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?) ORDER BY id DESC LIMIT 200`, [u.id, peer, peer, u.id]);
    await pool.query('UPDATE nearby_messages SET read_at=? WHERE receiver_id=? AND sender_id=? AND read_at IS NULL', [Date.now(), u.id, peer]);
    res.json({ messages: (rows as any[]).reverse().map(m => ({ id: m.id, clientId: m.client_id, from: m.sender_id, to: m.receiver_id, text: m.body, ts: Number(m.created_at) })) });
  });

  app.get('/api/nearby/unread', async (req, res) => {
    const u = await me(req, res); if (!u) return;
    const [rows]: any = await pool.query('SELECT sender_id, COUNT(*) c FROM nearby_messages WHERE receiver_id=? AND read_at IS NULL GROUP BY sender_id', [u.id]);
    const bySender: Record<string, number> = {};
    (rows as any[]).forEach(r => { bySender[String(r.sender_id)] = Number(r.c); });
    res.json({ bySender });
  });
}
