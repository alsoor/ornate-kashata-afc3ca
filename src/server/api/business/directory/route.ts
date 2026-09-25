/**
 * GET/POST /api/business/directory
 * Public Business badges for every viewer.
 * Backed by MySQL (Drizzle) so state survives redeploys.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { businessDirectory } from '@/server/db/schema';

const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

function stillActive(row: { active: boolean; expiresAt: Date | null }): boolean {
  if (!row.active) return false;
  if (row.expiresAt && Date.now() > row.expiresAt.getTime()) return false;
  return true;
}

function toApiRow(row: typeof businessDirectory.$inferSelect) {
  return {
    userId: row.userId,
    username: row.username || null,
    email: row.email || null,
    projectName: row.projectName || null,
    active: true,
    expiresAt: row.expiresAt ? row.expiresAt.getTime() : undefined,
  };
}

async function activeUsers() {
  const rows = await db.select().from(businessDirectory).where(eq(businessDirectory.active, true));
  return rows.filter(stillActive).map(toApiRow);
}

export async function GET() {
  const users = await activeUsers();
  return Response.json({ users });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = String(body.action || 'upsert');
  const userId = String(body.userId || '');
  if (!userId) return Response.json({ error: 'userId required' }, { status: 400 });

  if (action === 'remove') {
    await db.delete(businessDirectory).where(eq(businessDirectory.userId, userId));
    return Response.json({ users: await activeUsers() });
  }

  const existingRows = await db.select().from(businessDirectory).where(eq(businessDirectory.userId, userId)).limit(1);
  const existing = existingRows[0];

  const patch: Record<string, unknown> = {};
  if (action === 'activate') {
    patch.active = true;
    patch.since = new Date();
    patch.expiresAt = new Date(Number(body.expiresAt) || Date.now() + PERIOD_MS);
  } else if (action === 'deactivate') {
    patch.active = false;
  }
  // 'upsert' (default) only updates profile fields below and leaves the
  // existing subscription state untouched, so editing a profile can never
  // grant or revoke Business status on its own.

  if (body.username !== undefined) patch.username = body.username ? String(body.username) : null;
  if (body.email !== undefined) patch.email = body.email ? String(body.email) : null;
  if (body.projectName !== undefined) patch.projectName = body.projectName ? String(body.projectName) : null;

  if (!existing) {
    await db.insert(businessDirectory).values({
      userId,
      username: (patch.username as string | null) ?? null,
      email: (patch.email as string | null) ?? null,
      projectName: (patch.projectName as string | null) ?? null,
      active: (patch.active as boolean) ?? false,
      since: (patch.since as Date | null) ?? null,
      expiresAt: (patch.expiresAt as Date | null) ?? null,
    });
  } else {
    await db.update(businessDirectory).set(patch).where(eq(businessDirectory.userId, userId));
  }

  return Response.json({ users: await activeUsers() });
}
