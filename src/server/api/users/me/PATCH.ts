/**
 * PATCH /api/users/me
 * Update current user's settings.
 * Body: { username?: string, isPrivate?: boolean }
 *
 * isPrivate يُقرأ ويُكتب عبر SQL مباشر (db.execute) على جدول user_privacy،
 * بنفس أسلوب user_follows/is_private بالملفات الثانية — بدون أي تعديل على schema.js.
 * تأكد إنك شغّلت أمر الـ ALTER TABLE (إضافة عمود is_private) قبل استخدام هذا الملف.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { user } from '../../../db/schema.js';
import { getAuth } from '../../../../lib/auth/auth.js';
import { eq, ne, and, sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const meId = session.user.id;
    const { username, isPrivate } = req.body as { username?: string; isPrivate?: boolean };

    const result: { ok: true; username?: string; isPrivate?: boolean } = { ok: true };

    // ── تحديث اسم المستخدم (اختياري — فقط لو أُرسل بالطلب) ──
    if (username !== undefined) {
      if (!/^[a-zA-Z0-9_]{2,30}$/.test(username)) {
        return res.status(400).json({ error: 'Username must be 3–30 chars: letters, numbers, underscores' });
      }

      const [existing] = await db
        .select({ id: user.id })
        .from(user)
        .where(and(eq(user.username, username), ne(user.id, meId)))
        .limit(1);

      if (existing) return res.status(409).json({ error: 'Username already taken' });

      await db.update(user).set({ username }).where(eq(user.id, meId));
      result.username = username;
    }

    // ── تحديث حالة الحساب عام/خاص (اختياري — فقط لو أُرسل بالطلب) ──
    if (isPrivate !== undefined) {
      await db.execute(
        sql`INSERT INTO user_privacy (user_id, is_private)
            VALUES (${meId}, ${isPrivate})
            ON DUPLICATE KEY UPDATE is_private = ${isPrivate}`
      );
      result.isPrivate = isPrivate;
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user', message: String(error) });
  }
}