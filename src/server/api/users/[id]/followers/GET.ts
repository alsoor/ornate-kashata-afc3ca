/**
 * GET /api/users/:id/followers — قائمة متابعين مستخدم (تحتاج تسجيل دخول)
 * ترجع: { followers: [...], count }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

const rowsOf = (r: unknown): any[] => ((r as [any[]])[0] ?? []) as any[];

export default async function handler(req: Request, res: Response) {
  try {
    const _auth = getAuth();
    const _headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) { if (typeof v === 'string') _headers[k] = v; }
    const session = await _auth.api.getSession({ headers: new Headers(_headers) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const targetId = String(req.params.id || '');
    const viewerId = session.user.id;
    if (!targetId) return res.status(400).json({ error: 'Missing user id' });

    const target = rowsOf(await db.execute(sql`SELECT id FROM user WHERE id = ${targetId} LIMIT 1`));
    if (target.length === 0) return res.status(404).json({ error: 'User not found' });

    // ── الخصوصية: صاحب الحساب دايماً يشوف قائمته، غيره حسب الإعدادات ──
    if (viewerId !== targetId) {
      let isPrivate = false;
      try {
        const p = rowsOf(await db.execute(sql`SELECT is_private FROM user_privacy WHERE user_id = ${targetId}`));
        isPrivate = p.length > 0 && Boolean(p[0].is_private);
      } catch { /* الجدول/العمود غير موجود → نعتبره عام */ }

      // مفتاح "إخفاء قائمة المتابعين" (إن كان محفوظاً في السيرفر)
      let hidden = false;
      try {
        const h = rowsOf(await db.execute(sql`SELECT followers_visible FROM user_privacy WHERE user_id = ${targetId}`));
        if (h.length > 0 && h[0].followers_visible !== null && h[0].followers_visible !== undefined) {
          hidden = !Boolean(h[0].followers_visible);
        }
      } catch { /* العمود غير موجود بعد */ }

      if (hidden) return res.status(403).json({ error: 'Followers list is hidden', hidden: true });

      if (isPrivate) {
        const f = rowsOf(await db.execute(
          sql`SELECT 1 FROM user_follows WHERE follower_id = ${viewerId} AND following_id = ${targetId} LIMIT 1`,
        ));
        if (f.length === 0) return res.status(403).json({ error: 'This account is private', private: true });
      }
    }

    // ── قائمة المتابعين ──
    let ids: any[] = [];
    try {
      ids = rowsOf(await db.execute(
        sql`SELECT follower_id, created_at FROM user_follows WHERE following_id = ${targetId} ORDER BY created_at DESC LIMIT 500`,
      ));
    } catch {
      ids = rowsOf(await db.execute(
        sql`SELECT follower_id FROM user_follows WHERE following_id = ${targetId} LIMIT 500`,
      ));
    }
    if (ids.length === 0) return res.json({ followers: [], count: 0 });

    const idList = ids.map((r) => String(r.follower_id));
    const users = rowsOf(await db.execute(
      sql`SELECT * FROM user WHERE id IN (${sql.join(idList.map((i) => sql`${i}`), sql`, `)})`,
    ));
    const byId = new Map<string, any>(users.map((u) => [String(u.id), u]));

    const followers = ids
      .map((r) => {
        const u = byId.get(String(r.follower_id));
        if (!u) return null;
        return {
          id: u.id,
          friendId: u.id,
          userId: u.id,
          followerId: u.id,
          name: u.name ?? null,
          username: u.username ?? null,
          avatarUrl: u.avatar_url ?? u.avatarUrl ?? u.image ?? null,
          since: r.created_at ?? null,
        };
      })
      .filter(Boolean);

    res.json({ followers, count: followers.length });
  } catch (err) {
    console.error('[GET /api/users/:id/followers]', err);
    res.status(500).json({ error: 'Failed to load followers' });
  }
}
