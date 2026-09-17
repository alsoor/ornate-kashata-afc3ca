import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

const OWNER_EMAILS = new Set(['alsoor@mail.com', 'stooorna@mail.com']);
const PRIVILEGED_USERNAMES = new Set(['q8', 'stooorna']);

function isPrivilegedUser(user: { email?: string | null; username?: string | null; name?: string | null }) {
  const email = (user.email ?? '').toLowerCase().trim();
  const username = (user.username ?? user.name ?? '').replace(/^@/, '').trim().toLowerCase();
  return OWNER_EMAILS.has(email) || PRIVILEGED_USERNAMES.has(username);
}

/** Check if a column exists in a table */
async function columnExists(table: string, column: string): Promise<boolean> {
  try {
    // db.execute with mysql2 returns [[rows], [fields]]
    const [rows] = await db.execute(sql`
      SELECT COUNT(*) AS cnt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = ${table}
        AND COLUMN_NAME  = ${column}
    `) as unknown as [Array<Record<string, unknown>>, unknown];
    const cnt = Number((rows[0] as Record<string, unknown>)?.['cnt'] ?? 0);
    return cnt > 0;
  } catch {
    return false;
  }
}

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user || !isPrivilegedUser(session.user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Ensure name_color column exists
    const hasNameColor = await columnExists('user', 'name_color');
    if (!hasNameColor) {
      await db.execute(sql`ALTER TABLE user ADD COLUMN name_color VARCHAR(20) DEFAULT NULL`).catch(() => {});
    }

    const [hasLastIp, hasIsRoomAdmin, hasIsBanned, hasCreatedAt, hasNameColorNow] = await Promise.all([
      columnExists('user', 'last_ip'),
      columnExists('user', 'is_room_admin'),
      columnExists('user', 'is_banned'),
      columnExists('user', 'created_at'),
      hasNameColor ? Promise.resolve(true) : columnExists('user', 'name_color'),
    ]);

    // Check if image table exists (BetterAuth stores avatars there)
    const hasImageTable = await columnExists('user', 'image');

    // mysql2 + drizzle returns [[rows], [fields]] — destructure directly
    const [rawRows] = await db.execute(sql`
      SELECT
        id,
        name,
        username,
        email,
        ${hasIsBanned    ? sql`is_banned`    : sql`0`}    AS is_banned,
        ${hasLastIp      ? sql`last_ip`      : sql`NULL`} AS last_ip,
        ${hasIsRoomAdmin ? sql`is_room_admin` : sql`0`}   AS is_room_admin,
        ${hasCreatedAt   ? sql`created_at`   : sql`NULL`} AS created_at,
        ${hasNameColorNow ? sql`name_color`  : sql`NULL`} AS name_color,
        ${hasImageTable  ? sql`image`        : sql`NULL`} AS image
      FROM user
      ORDER BY ${hasCreatedAt ? sql`created_at DESC` : sql`id DESC`}
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    const rows = (rawRows ?? []).map((row) => ({
      id:          row['id']           ?? null,
      name:        row['name']         ?? null,
      username:    row['username']     ?? null,
      email:       row['email']        ?? '',
      isBanned:    !!(row['is_banned']),
      lastIp:      row['last_ip']      ?? null,
      isRoomAdmin: !!(row['is_room_admin']),
      createdAt:   row['created_at']   ?? null,
      nameColor:   row['name_color']   ?? null,
      avatarUrl:   (row['image'] as string | null) ?? null,
    }));

    res.json(rows);
  } catch (e) {
    console.error('[GET /api/owner/users]', e);
    res.status(500).json({ error: String(e) });
  }
}
