/**
 * /api/vip — persist VIP so every device can read it.
 * Backed by MySQL (Drizzle) so state survives redeploys.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { vipStatus } from '@/server/db/schema';

type VipColor = 'blue' | 'gold' | 'red' | 'green' | 'gray' | 'pink';

export type VipRow = {
  userId: string;
  active: boolean;
  since: number;
  expiresAt?: number;
  color: VipColor;
  feats: { eightMics: boolean; roomMusic: boolean };
  renameUsed: boolean;
  username?: string | null;
};

const COLORS: VipColor[] = ['blue', 'gold', 'red', 'green', 'gray', 'pink'];

function empty(userId: string): VipRow {
  return {
    userId,
    active: false,
    since: 0,
    color: 'gold',
    feats: { eightMics: false, roomMusic: false },
    renameUsed: false,
  };
}

function toApiRow(row: typeof vipStatus.$inferSelect): VipRow {
  return {
    userId: row.userId,
    active: !!row.active,
    since: row.since ? row.since.getTime() : 0,
    expiresAt: row.expiresAt ? row.expiresAt.getTime() : undefined,
    color: (row.color as VipColor) || 'gold',
    feats: { eightMics: !!row.eightMics, roomMusic: !!row.roomMusic },
    renameUsed: !!row.renameUsed,
    username: row.username ?? null,
  };
}

function stillActive(row: VipRow): boolean {
  if (!row.active) return false;
  if (row.expiresAt && Date.now() > row.expiresAt) return false;
  return true;
}

async function loadRow(userId: string): Promise<VipRow> {
  const rows = await db.select().from(vipStatus).where(eq(vipStatus.userId, userId)).limit(1);
  if (!rows.length) return empty(userId);
  const row = toApiRow(rows[0]);
  if (row.active && !stillActive(row)) {
    await db.update(vipStatus).set({ active: false }).where(eq(vipStatus.userId, userId));
    row.active = false;
  }
  return row;
}

async function upsertRow(userId: string, patch: Record<string, unknown>) {
  const existing = await db.select().from(vipStatus).where(eq(vipStatus.userId, userId)).limit(1);
  if (!existing.length) {
    await db.insert(vipStatus).values({
      userId,
      active: (patch.active as boolean) ?? false,
      since: (patch.since as Date) ?? null,
      expiresAt: (patch.expiresAt as Date | null) ?? null,
      color: (patch.color as VipColor) ?? 'gold',
      eightMics: (patch.eightMics as boolean) ?? false,
      roomMusic: (patch.roomMusic as boolean) ?? false,
      renameUsed: (patch.renameUsed as boolean) ?? false,
      username: (patch.username as string | null) ?? null,
    });
  } else {
    await db.update(vipStatus).set(patch).where(eq(vipStatus.userId, userId));
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get('userId') || '';
  if (!userId) return Response.json({ error: 'userId required' }, { status: 400 });
  try {
    const row = await loadRow(userId);
    return Response.json(row);
  } catch (err) {
    console.error('[api/vip] GET failed:', err);
    return Response.json(empty(userId));
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const userId = String(body.userId || '');
  if (!userId) return Response.json({ error: 'userId required' }, { status: 400 });
  const action = String(body.action || '');

  try {
    if (action === 'activate') {
      const expiresAt = Number(body.expiresAt) || Date.now() + 30 * 24 * 60 * 60 * 1000;
      await upsertRow(userId, { active: true, since: new Date(), expiresAt: new Date(expiresAt) });
    } else if (action === 'deactivate') {
      await upsertRow(userId, { active: false });
    } else if (action === 'color') {
      const c = String(body.color || '') as VipColor;
      if (COLORS.includes(c)) await upsertRow(userId, { color: c });
    } else if (action === 'feat') {
      const key = body.key === 'eightMics' || body.key === 'roomMusic' ? body.key : null;
      if (key) await upsertRow(userId, { [key]: !!body.on });
    } else if (action === 'rename-used') {
      await upsertRow(userId, { renameUsed: true });
    }
    if (typeof body.username === 'string') {
      await upsertRow(userId, { username: body.username });
    }

    const row = await loadRow(userId);
    return Response.json(row);
  } catch (err) {
    console.error('[api/vip] POST failed:', err);
    return Response.json({ error: 'db_error' }, { status: 500 });
  }
}
