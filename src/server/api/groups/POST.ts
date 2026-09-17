import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { groups, groupMembers } from '../../db/schema.js';
import { getAuth } from '../../../lib/auth/auth.js';
import { sql } from 'drizzle-orm';

// Ensure avatar_url column exists — runs once per process
let columnEnsured = false;
async function ensureAvatarUrlColumn() {
  if (columnEnsured) return;
  columnEnsured = true;
  try {
    const rows = await db.execute(sql`
      SELECT COUNT(*) AS cnt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'groups'
        AND COLUMN_NAME  = 'avatar_url'
    `);
    const cnt = (rows as unknown as [Array<{ cnt: number }>])[0]?.[0]?.cnt ?? 0;
    if (Number(cnt) === 0) {
      await db.execute(sql`ALTER TABLE \`groups\` ADD COLUMN \`avatar_url\` TEXT NULL`);
      console.log('[groups] avatar_url column added');
    }
  } catch (e) {
    console.error('[groups] ensureAvatarUrlColumn error:', e);
  }
}

export default async function handler(req: Request, res: Response) {
  try {
    // Ensure DB schema is up to date
    await ensureAvatarUrlColumn();

    const auth = getAuth();
    const headerMap: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headerMap[k] = v;
      else if (Array.isArray(v)) headerMap[k] = v[0] ?? '';
    }
    const session = await auth.api.getSession({ headers: new Headers(headerMap) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const meId = session.user.id;
    const { name, memberIds } = req.body as { name: string; memberIds: string[] };

    if (!name?.trim()) return res.status(400).json({ error: 'Group name required' });

    // Insert group — Drizzle MySQL returns [ResultSetHeader, ...], destructure first element
    const [result] = await db.insert(groups).values({ name: name.trim(), createdBy: meId });
    const groupId = (result as unknown as { insertId: number }).insertId;

    if (!groupId) {
      console.error('[groups/POST] insertId missing, result:', JSON.stringify(result));
      return res.status(500).json({ error: 'Failed to create group — no insertId' });
    }

    // Add creator + all selected members (deduplicated)
    const allMembers = Array.from(new Set([meId, ...(memberIds ?? [])]));
    await db.insert(groupMembers).values(allMembers.map((uid) => ({ groupId, userId: uid })));

    res.status(201).json({ id: groupId, name: name.trim(), createdBy: meId });
  } catch (e) {
    console.error('[groups/POST] error:', e);
    res.status(500).json({ error: String(e) });
  }
}
