/**
 * PATCH /api/users/me/name
 * Update the display name (nickname) of the current user.
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { db } from '../../../../db/client.js';
import { user } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const { name } = req.body as { name?: string };
    if (name === undefined || name === null)
      return res.status(400).json({ error: 'name is required' });

    const trimmed = name.trim();
    if (trimmed.length === 0)
      return res.status(400).json({ error: 'Name cannot be empty' });
    if (trimmed.length > 60)
      return res.status(400).json({ error: 'Name must be 60 characters or less' });

    await db.update(user).set({ name: trimmed }).where(eq(user.id, session.user.id));

    return res.json({ ok: true, name: trimmed });
  } catch (e) {
    console.error('[PATCH /api/users/me/name]', e);
    return res.status(500).json({ error: 'Failed to update name' });
  }
}
