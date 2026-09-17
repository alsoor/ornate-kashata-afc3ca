/** PATCH /api/users/me/privacy */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { userPrivacy } from '../../../../db/schema.js';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { eq } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const { showLastSeen, whoCanContact, whoCanCall, isPrivate } = req.body as {
      showLastSeen?: boolean;
      whoCanContact?: 'everyone' | 'friends' | 'nobody';
      whoCanCall?: 'everyone' | 'friends' | 'nobody';
      isPrivate?: boolean;
    };

    if (showLastSeen !== undefined && typeof showLastSeen !== 'boolean') {
      return res.status(400).json({ error: 'showLastSeen must be a boolean' });
    }
    if (isPrivate !== undefined && typeof isPrivate !== 'boolean') {
      return res.status(400).json({ error: 'isPrivate must be a boolean' });
    }
    const validVisibility = (value: unknown): value is 'everyone' | 'friends' | 'nobody' =>
      value === 'everyone' || value === 'friends' || value === 'nobody';
    if (whoCanContact !== undefined && !validVisibility(whoCanContact)) {
      return res.status(400).json({ error: 'Invalid whoCanContact value' });
    }
    if (whoCanCall !== undefined && !validVisibility(whoCanCall)) {
      return res.status(400).json({ error: 'Invalid whoCanCall value' });
    }

    const existing = await db.select().from(userPrivacy).where(eq(userPrivacy.userId, session.user.id));
    if (existing.length) {
      await db.update(userPrivacy)
        .set({ ...(showLastSeen !== undefined && { showLastSeen }), ...(whoCanContact !== undefined && { whoCanContact }), ...(whoCanCall !== undefined && { whoCanCall }), ...(isPrivate !== undefined && { isPrivate }) })
        .where(eq(userPrivacy.userId, session.user.id));
    } else {
      await db.insert(userPrivacy).values({
        userId: session.user.id,
        showLastSeen: showLastSeen ?? true,
        whoCanContact: whoCanContact ?? 'everyone',
        whoCanCall: whoCanCall ?? 'everyone',
        isPrivate: isPrivate ?? false,
      });
    }
    const saved = await db.select().from(userPrivacy).where(eq(userPrivacy.userId, session.user.id));
    const privacy = saved[0];
    return res.json({
      ok: true,
      showLastSeen: privacy?.showLastSeen ?? true,
      whoCanContact: privacy?.whoCanContact ?? 'everyone',
      whoCanCall: privacy?.whoCanCall ?? 'everyone',
      isPrivate: privacy?.isPrivate ?? false,
    });
  } catch (e) { return res.status(500).json({ error: String(e) }); }
}
