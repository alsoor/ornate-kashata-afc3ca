/**
 * PATCH /api/users/me/phone
 * Save or update the current user's phone number
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { db } from '../../../../db/client.js';
import { user } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const { phone } = req.body as { phone?: string };
    // Allow empty string to clear the phone number
    const cleaned = (phone ?? '').trim();

    // Basic validation — allow empty (clear) or digits/spaces/+/dashes, 7–20 chars
    if (cleaned && !/^\+?[\d\s\-().]{7,20}$/.test(cleaned)) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    await db.update(user)
      .set({ phoneNumber: cleaned || null } as Record<string, unknown>)
      .where(eq(user.id, session.user.id));

    res.json({ ok: true, phone: cleaned || null });
  } catch (e) {
    console.error('[PATCH /api/users/me/phone]', e);
    res.status(500).json({ error: 'Failed to update phone number' });
  }
}
