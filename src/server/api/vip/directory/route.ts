/**
 * GET /api/vip/directory — public list of active VIP accounts.
 * Backed by MySQL (Drizzle) so every viewer/device sees the same list.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { vipStatus } from '@/server/db/schema';

export async function GET() {
  const rows = await db.select().from(vipStatus).where(eq(vipStatus.active, true));
  const now = Date.now();
  const users = rows
    .filter((row) => !row.expiresAt || now <= row.expiresAt.getTime())
    .map((row) => ({
      userId: row.userId,
      active: true,
      color: row.color || 'gold',
      feats: {
        eightMics: !!row.eightMics,
        roomMusic: !!row.roomMusic,
      },
      expiresAt: row.expiresAt ? row.expiresAt.getTime() : undefined,
      username: row.username || null,
    }));
  return Response.json({ users });
}
