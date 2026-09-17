/** GET /api/users/by-username/:username — public profile lookup by username */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { user, userBio, friends } from '../../../../db/schema.js';
import { eq, and, or, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

const ONLINE_THRESHOLD_MS = 60_000;

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const targetUsername = req.params.username as string;

    const rows = await db
      .select({
        id: user.id,
        name: user.name,
        username: user.username,
        image: user.image,
        avatarUrl: user.avatarUrl,
        lastSeenAt: user.lastSeenAt,
      })
      .from(user)
      .where(eq(user.username, targetUsername));

    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const u = rows[0];

    const [bioRow] = await db
      .select({ bio: userBio.bio })
      .from(userBio)
      .where(eq(userBio.userId, u.id));

    // ── عدد الأصدقاء المقبولين — الصداقة ثنائية الاتجاه بمجرد status='accepted'،
    //    فلازم نعد الصفوف اللي هذا المستخدم فيها إما الطالب (requesterId) أو
    //    المُستقبل (addresseeId)، وإلا بنفوت نصّ أصدقائه. ──
    const [{ count: followersCountRaw }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(friends)
      .where(
        and(
          eq(friends.status, 'accepted'),
          or(eq(friends.requesterId, u.id), eq(friends.addresseeId, u.id))
        )
      );
    const followersCount = Number(followersCountRaw ?? 0);

    const privacyResult = await db.execute(sql`SELECT is_private FROM user_privacy WHERE user_id = ${u.id}`);
    const privacyRows = (privacyResult as unknown as [any[]])[0];
    const isPrivate = privacyRows.length > 0 && Boolean(privacyRows[0].is_private);

    const now = Date.now();
    const online = u.lastSeenAt
      ? now - new Date(u.lastSeenAt).getTime() < ONLINE_THRESHOLD_MS
      : false;

    return res.json({
      id: u.id,
      name: u.name,
      username: u.username,
      avatarUrl: u.avatarUrl ?? u.image ?? null,
      bio: bioRow?.bio ?? null,
      online,
      lastSeenAt: u.lastSeenAt ?? null,
      followersCount,
      isPrivate,
      // repostsCount و likesCount لسه ناقصين — بنضيفهم بمجرد ما توصلني جداول
      // البوستات/الإعجابات/الريبوست من السكيما.
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}