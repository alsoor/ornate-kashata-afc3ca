/**
 * POST /api/friends
 * Body: { addresseeId: string }
 * Send a friend request (requires auth)
 * — لو حساب المُستقبل عام: تُقبل الصداقة فورًا (status: 'accepted')
 * — لو حسابه خاص: تبقى الصداقة بانتظار موافقته (status: 'pending') كما كانت
 *
 * ملاحظة: عمود is_private يُقرأ عبر SQL مباشر (db.execute) بدل Drizzle الـ typed
 * table، بنفس أسلوب user_follows بملف /api/users/:id/follow — عشان ما نحتاج
 * نعدّل schema.js إطلاقًا. تأكد إنك شغّلت أمر الـ ALTER TABLE قبل استخدام هذا الملف.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { friends } from '../../db/schema.js';
import { getAuth } from '../../../lib/auth/auth.js';
import { eq, and, or, sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const meId = session.user.id;
    const { addresseeId } = req.body as { addresseeId: string };
    if (!addresseeId || addresseeId === meId) {
      return res.status(400).json({ error: 'Invalid addressee' });
    }

    // Check if a relation already exists
    const [existing] = await db
      .select()
      .from(friends)
      .where(
        or(
          and(eq(friends.requesterId, meId), eq(friends.addresseeId, addresseeId)),
          and(eq(friends.requesterId, addresseeId), eq(friends.addresseeId, meId)),
        ),
      )
      .limit(1);

    if (existing) {
      return res.status(409).json({ error: 'Request already exists', status: existing.status });
    }

    // A missing privacy row must behave as a private account until the user
    // explicitly chooses public visibility. This guarantees that a request
    // sent from search appears in the recipient's Requests tab.
    const privacyResult = await db.execute(
      sql`SELECT is_private FROM user_privacy WHERE user_id = ${addresseeId}`
    );
    const privacyRows = (privacyResult as unknown as [any[]])[0] ?? [];
    const isTargetPrivate = privacyRows.length === 0 || Boolean(privacyRows[0].is_private);
    const initialStatus = isTargetPrivate ? 'pending' : 'accepted';

    await db.insert(friends).values({ requesterId: meId, addresseeId, status: initialStatus });
    res.status(201).json({ ok: true, status: initialStatus });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send request', message: String(error) });
  }
}