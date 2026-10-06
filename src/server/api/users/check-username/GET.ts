/**
 * GET /api/users/check-username?username=xxx&email=yyy
 * - username (optional): case-insensitive availability check -> { available }
 * - email    (optional): case-insensitive availability check -> { emailAvailable }
 * At least one of them is required.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { user } from '../../../db/schema.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const username = String(req.query.username ?? '').trim().replace(/^@/, '');
    const email = String(req.query.email ?? '').trim().toLowerCase();
    if (!username && !email) return res.status(400).json({ error: 'username or email required' });

    const out: { available?: boolean; emailAvailable?: boolean } = {};

    if (username) {
      const rows = await db
        .select({ id: user.id })
        .from(user)
        .where(sql`lower(${user.username}) = ${username.toLowerCase()}`);
      out.available = rows.length === 0;
    }

    if (email) {
      const rows = await db
        .select({ id: user.id })
        .from(user)
        .where(sql`lower(${user.email}) = ${email}`);
      out.emailAvailable = rows.length === 0;
    }

    return res.json(out);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
