/**
 * NEARBY-ROUTES — مسارات السيرفر لميزة "القريبون" (النقطة الزرقاء في Stooorna Ai).
 * مستقل تماماً: جداول خاصة (nearby_presence / nearby_messages / nearby_profiles / nearby_requests) ولا يلمس أي مسار قديم.
 * كل المسارات تتطلب جلسة مستخدم مسجّل => الميزة محصورة بمستخدمي التطبيق فقط.
 *
 * [v1.5] الأصدقاء المضافون دردشتهم مباشرة بدون طلب (canChat) · حفظ آخر صورة (COALESCE) + احتياطي الصورة من جدول الحضور · نصوص الإشعارات إنجليزي.
 * [v1.2] نظام الطلبات: ما في دردشة مباشرة — لازم تبعث طلب والطرف الثاني يقبل.
 *   POST   /api/nearby/requests            {to}      => يرسل طلب (وإذا هو أرسل لك قبلها => يتقبّل الاثنين تلقائياً)
 *   GET    /api/nearby/requests                      => { incoming, outgoing, accepted }
 *   POST   /api/nearby/requests/:id/respond {accept} => قبول/رفض (فقط للمستلم)
 *   DELETE /api/nearby/requests/:id                  => إلغاء طلب أرسلته
 *   GET    /api/nearby/user/:id                      => بروفايل مختصر (اسم/يوزر/صورة) لشخص وجدته بالبلوتوث
 *   POST   /api/nearby/messages                      => يرفض 403 إذا ما في قبول (المحادثات القديمة قبل v1.2 تبقى شغالة)
 *
 * الربط في entry.ts (بدون تغيير):
 *   import { registerNearbyRoutes } from "./nearby-routes.js"; // NEARBY
 *   registerNearbyRoutes(app, { pool: templatesPool, getUser: (req) => session.user(req),
 *     push: (toId, fromName, text) => sendFcmToUser({ userId: toId, title: fromName, body: text, url: `/?openChat=1&peerName=${encodeURIComponent(fromName || "")}`, type: "message" } as any) });
 */
import type { Express, Request, Response } from "express";

interface Opts {
  pool: any; // mysql2/promise pool
  getUser: (req: Request) => Promise<any> | any;
  push?: (toId: string, fromName: string, text: string) => Promise<unknown> | unknown;
  /** معرّفات أصدقائي المضافين (اختياري) — يظهرون كـ"صديق" ودردشتهم مباشرة بدون طلب. */
  friendIds?: (req: Request) => Promise<string[]> | string[];
}

const TTL_MS = 3 * 60 * 1000; // الموقع يختفي تلقائياً بعد 3 دقائق بدون تحديث (التطبيق يجدّده كل 45 ثانية)
const DECLINE_COOLDOWN_MS = 24 * 60 * 60 * 1000; // بعد الرفض: ما يقدر يعيد الطلب قبل 24 ساعة
const PROFILE_REFRESH_MS = 5 * 60 * 1000;
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
    // بروفايل مختصر (الاسم/اليوزر/الصورة) — يتحدّث تلقائياً كل ما المستخدم يستخدم أي مسار هنا
    await pool.query(`CREATE TABLE IF NOT EXISTS nearby_profiles (
      user_id VARCHAR(64) PRIMARY KEY, name VARCHAR(120) NOT NULL, username VARCHAR(120) NULL, avatar TEXT NULL, updated_at BIGINT NOT NULL
    ) CHARACTER SET utf8mb4`);
    // طلبات المحادثة: status = pending | accepted | declined
    await pool.query(`CREATE TABLE IF NOT EXISTS nearby_requests (
      id BIGINT AUTO_INCREMENT PRIMARY KEY, from_id VARCHAR(64) NOT NULL, to_id VARCHAR(64) NOT NULL,
      status VARCHAR(12) NOT NULL DEFAULT 'pending', created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
      UNIQUE KEY uq_pair (from_id, to_id), KEY idx_to (to_id, status), KEY idx_from (from_id, status)
    ) CHARACTER SET utf8mb4`);
  })().catch((e) => console.error('[nearby] migrate failed', e));

  const profSeen = new Map<string, number>();
  const me = async (req: Request, res: Response) => {
    await ready;
    const u = await Promise.resolve(o.getUser(req)).catch(() => null);
    if (!u?.id) { res.status(401).json({ error: 'unauthorized' }); return null; }
    const user = {
      id: String(u.id), name: String(u.name || u.username || 'User'), username: String(u.username || ''),
      avatar: ((u.avatarUrl || u.avatar || u.image || u.profileImage || '') as string) || null,
    };
    if (Date.now() - (profSeen.get(user.id) || 0) > PROFILE_REFRESH_MS) {
      profSeen.set(user.id, Date.now());
      pool.query(
        `INSERT INTO nearby_profiles (user_id, name, username, avatar, updated_at) VALUES (?,?,?,?,?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), username=VALUES(username), avatar=COALESCE(VALUES(avatar), avatar), updated_at=VALUES(updated_at)`,
        [user.id, user.name, user.username || null, user.avatar, Date.now()],
      ).catch(() => { /* */ });
    }
    return user;
  };

  /** هل مسموح بينهم دردشة؟ طلب مقبول، أو محادثة قديمة قبل نظام الطلبات (ما لم يُرفض/ينتظر). */
  const friendSet = async (req: Request): Promise<Set<string>> => {
    try { return new Set(((await Promise.resolve(o.friendIds?.(req))) || []).map(String)); } catch { return new Set(); }
  };
  const canChat = async (_req: Request, a: string, b: string): Promise<boolean> => {
    // [v1.5] الصديق المضاف => دردشة مباشرة بدون طلب؛ غير الأصدقاء لازم طلب مقبول
    if ((await friendSet(_req)).has(String(b))) return true;
    const [rows]: any = await pool.query(
      `SELECT 1 FROM nearby_requests WHERE status='accepted' AND ((from_id=? AND to_id=?) OR (from_id=? AND to_id=?)) LIMIT 1`, [a, b, b, a]);
    return !!rows?.length;
  };

  /** تحديث موقعي (يُستدعى فقط عند ضغط زر البحث). */
  app.post('/api/nearby/ping', async (req, res) => {
    const u = await me(req, res); if (!u) return;
    const lat = Number(req.body?.lat), lng = Number(req.body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return res.status(400).json({ error: 'bad coords' });
    await pool.query(
      `INSERT INTO nearby_presence (user_id, lat, lng, accuracy, name, avatar, updated_at) VALUES (?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE lat=VALUES(lat), lng=VALUES(lng), accuracy=VALUES(accuracy), name=VALUES(name), avatar=COALESCE(VALUES(avatar), avatar), updated_at=VALUES(updated_at)`,
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

  /** المستخدمون القريبون (من ضغطوا بحث مؤخراً داخل نفس النطاق) + اليوزر. */
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
    const ids = users.map(x => x.id);
    const uname: Record<string, string | null> = {};
    const pav: Record<string, string | null> = {};
    if (ids.length) {
      const [pr]: any = await pool.query('SELECT user_id, username, avatar FROM nearby_profiles WHERE user_id IN (?)', [ids]);
      (pr as any[]).forEach(r => { uname[String(r.user_id)] = r.username || null; pav[String(r.user_id)] = r.avatar || null; });
    }
    const fr = await friendSet(req);
    res.json({ users: users.map(x => ({ ...x, avatar: x.avatar || pav[x.id] || null, username: uname[x.id] ?? null, friend: fr.has(x.id) })) });
  });

  /** فحص سريع: هل المسارات مربوطة؟  GET /api/nearby/health */
  app.get('/api/nearby/health', async (_req, res) => { await ready; res.json({ ok: true, v: '1.5' }); });

  /** معرّفات أصدقائي المضافين. */
  app.get('/api/nearby/friends', async (req, res) => {
    const u = await me(req, res); if (!u) return;
    res.json({ ids: [...(await friendSet(req))] });
  });

  /** بروفايل مختصر لشخص (مثلاً وجدته بالبلوتوث وما عندي يوزره/صورته). */
  app.get('/api/nearby/user/:id', async (req, res) => {
    const u = await me(req, res); if (!u) return;
    const [rows]: any = await pool.query('SELECT user_id, name, username, avatar FROM nearby_profiles WHERE user_id=?', [clean(req.params.id, 64)]);
    let p = rows?.[0];
    if (!p || !p.avatar) { // [v1.4] لو ما عنده صورة في البروفايل نجيبها من آخر موقع نشره
      const [pr]: any = await pool.query('SELECT user_id, name, avatar FROM nearby_presence WHERE user_id=?', [clean(req.params.id, 64)]);
      if (pr?.[0]) p = { ...(p || {}), user_id: pr[0].user_id, name: p?.name || pr[0].name, avatar: p?.avatar || pr[0].avatar };
    }
    if (!p) return res.status(404).json({ error: 'not found' });
    res.json({ id: String(p.user_id), name: p.name, username: p.username || null, avatar: p.avatar || null });
  });

  /* ───────────── الطلبات ───────────── */

  /** إرسال طلب دردشة. */
  app.post('/api/nearby/requests', async (req, res) => {
    const u = await me(req, res); if (!u) return;
    const to = clean(req.body?.to, 64);
    if (!to || to === u.id) return res.status(400).json({ error: 'bad request' });
    const now = Date.now();
    const [rows]: any = await pool.query(
      `SELECT * FROM nearby_requests WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?)`, [u.id, to, to, u.id]);
    const mineRow = (rows as any[]).find(r => r.from_id === u.id);
    const theirs = (rows as any[]).find(r => r.from_id === to);

    if ((rows as any[]).some(r => r.status === 'accepted')) return res.json({ ok: true, status: 'accepted' });

    // هو أرسل لي طلب من قبل => أقبله مباشرة
    if (theirs?.status === 'pending') {
      await pool.query(`UPDATE nearby_requests SET status='accepted', updated_at=? WHERE id=?`, [now, theirs.id]);
      if (o.push) { try { await o.push(to, u.name, 'Accepted your request — you can chat now'); } catch { /* */ } }
      return res.json({ ok: true, status: 'accepted' });
    }

    if (mineRow?.status === 'pending') return res.json({ ok: true, status: 'pending', id: mineRow.id });
    if (mineRow?.status === 'declined' && now - Number(mineRow.updated_at) < DECLINE_COOLDOWN_MS) return res.status(429).json({ error: 'declined_recently' });

    if (mineRow) await pool.query(`UPDATE nearby_requests SET status='pending', created_at=?, updated_at=? WHERE id=?`, [now, now, mineRow.id]);
    else await pool.query(`INSERT INTO nearby_requests (from_id, to_id, status, created_at, updated_at) VALUES (?,?, 'pending', ?, ?)`, [u.id, to, now, now]);
    if (o.push) { try { await o.push(to, u.name, 'Sent you a chat request'); } catch { /* */ } }
    res.json({ ok: true, status: 'pending' });
  });

  /** الواردة (تظهر داخل النقطة الزرقاء) + الصادرة المعلّقة + المقبولون. */
  app.get('/api/nearby/requests', async (req, res) => {
    const u = await me(req, res); if (!u) return;
    const [inc]: any = await pool.query(
      `SELECT r.id, r.from_id, r.created_at, p.name, p.username, COALESCE(NULLIF(p.avatar,''), pp.avatar) AS avatar FROM nearby_requests r
       LEFT JOIN nearby_profiles p ON p.user_id=r.from_id
       LEFT JOIN nearby_presence pp ON pp.user_id=r.from_id
       WHERE r.to_id=? AND r.status='pending' ORDER BY r.id DESC LIMIT 50`, [u.id]);
    const [out]: any = await pool.query(
      `SELECT r.id, r.to_id, r.created_at, p.name, p.username, COALESCE(NULLIF(p.avatar,''), pp.avatar) AS avatar FROM nearby_requests r
       LEFT JOIN nearby_profiles p ON p.user_id=r.to_id
       LEFT JOIN nearby_presence pp ON pp.user_id=r.to_id
       WHERE r.from_id=? AND r.status='pending' ORDER BY r.id DESC LIMIT 50`, [u.id]);
    const [acc]: any = await pool.query(
      `SELECT IF(r.from_id=?, r.to_id, r.from_id) AS peer_id, p.name, p.username, COALESCE(NULLIF(p.avatar,''), pp.avatar) AS avatar FROM nearby_requests r
       LEFT JOIN nearby_profiles p ON p.user_id=IF(r.from_id=?, r.to_id, r.from_id)
       LEFT JOIN nearby_presence pp ON pp.user_id=IF(r.from_id=?, r.to_id, r.from_id)
       WHERE r.status='accepted' AND (r.from_id=? OR r.to_id=?) ORDER BY r.updated_at DESC LIMIT 200`, [u.id, u.id, u.id, u.id, u.id]);
    res.json({
      incoming: (inc as any[]).map(r => ({ id: String(r.id), fromId: String(r.from_id), name: r.name || 'User', username: r.username || null, avatar: r.avatar || null, ts: Number(r.created_at) })),
      outgoing: (out as any[]).map(r => ({ id: String(r.id), toId: String(r.to_id), name: r.name || 'User', username: r.username || null, avatar: r.avatar || null, ts: Number(r.created_at) })),
      accepted: (acc as any[]).map(r => ({ peerId: String(r.peer_id), name: r.name || 'User', username: r.username || null, avatar: r.avatar || null })),
    });
  });

  /** قبول/رفض — فقط المستلم. */
  app.post('/api/nearby/requests/:id/respond', async (req, res) => {
    const u = await me(req, res); if (!u) return;
    const id = Number(req.params.id), accept = !!req.body?.accept;
    const [rows]: any = await pool.query(`SELECT * FROM nearby_requests WHERE id=? AND to_id=? AND status='pending'`, [id, u.id]);
    const r = rows?.[0];
    if (!r) return res.status(404).json({ error: 'not found' });
    await pool.query(`UPDATE nearby_requests SET status=?, updated_at=? WHERE id=?`, [accept ? 'accepted' : 'declined', Date.now(), id]);
    if (accept && o.push) { try { await o.push(String(r.from_id), u.name, 'Accepted your request — you can chat now'); } catch { /* */ } }
    res.json({ ok: true, status: accept ? 'accepted' : 'declined' });
  });

  /** إلغاء طلب أرسلته (وهو لسه معلّق). */
  app.delete('/api/nearby/requests/:id', async (req, res) => {
    const u = await me(req, res); if (!u) return;
    await pool.query(`DELETE FROM nearby_requests WHERE id=? AND from_id=? AND status='pending'`, [Number(req.params.id), u.id]);
    res.json({ ok: true });
  });

  /* ───────────── الرسائل ───────────── */

  /** إرسال رسالة — فقط بعد قبول الطلب. clientId يمنع التكرار. */
  app.post('/api/nearby/messages', async (req, res) => {
    const u = await me(req, res); if (!u) return;
    const to = clean(req.body?.receiverId, 64), body = clean(req.body?.body), cid = clean(req.body?.clientId, 80);
    if (!to || !body || !cid || to === u.id) return res.status(400).json({ error: 'bad request' });
    if (!(await canChat(req, u.id, to))) return res.status(403).json({ error: 'not_accepted' });
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
