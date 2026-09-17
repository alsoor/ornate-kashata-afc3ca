/** GET /api/users/check-username?username=xxx — check if username is taken */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { user } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const username = (req.query.username as string ?? '').trim();
    if (!username) return res.status(400).json({ error: 'username required' });

    const rows = await db.select({ id: user.id }).from(user).where(eq(user.username, username));
    return res.json({ available: rows.length === 0 });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
