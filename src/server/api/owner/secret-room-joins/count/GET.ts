import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const result = await db.execute(sql`SELECT COUNT(DISTINCT user_id) as total FROM secret_room_joins`) as any;
    const rows = Array.isArray(result[0]) ? result[0] : result;
    const total = rows[0]?.total ?? 0;
    res.json({ count: Number(total) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
