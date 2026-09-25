/**
 * GET /api/vip/directory — public list of active VIP accounts.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const FILE = path.join(process.cwd(), 'data', 'vip-store.json');

export async function GET() {
  let store: Record<string, {
    userId: string;
    active?: boolean;
    expiresAt?: number;
    color?: string;
    feats?: { eightMics?: boolean; roomMusic?: boolean };
    username?: string | null;
  }> = {};
  try {
    store = JSON.parse(await fs.readFile(FILE, 'utf8'));
  } catch {
    store = {};
  }
  const now = Date.now();
  const users = Object.values(store).filter((row) => {
    if (!row?.userId || !row.active) return false;
    if (row.expiresAt && now > Number(row.expiresAt)) return false;
    return true;
  }).map((row) => ({
    userId: row.userId,
    active: true,
    color: row.color || 'gold',
    feats: {
      eightMics: !!row.feats?.eightMics,
      roomMusic: !!row.feats?.roomMusic,
    },
    expiresAt: row.expiresAt,
    username: row.username || null,
  }));
  return Response.json({ users });
}
