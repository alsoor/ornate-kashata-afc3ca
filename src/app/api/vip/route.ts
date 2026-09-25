/**
 * /api/vip  — persist VIP so every device can read it.
 * File-backed store (survives restarts). Swap for Postgres when ready.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

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

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'vip-store.json');

const COLORS: VipColor[] = ['blue', 'gold', 'red', 'green', 'gray', 'pink'];

async function loadStore(): Promise<Record<string, VipRow>> {
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

async function saveStore(store: Record<string, VipRow>) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(store), 'utf8');
}

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

function stillActive(row: VipRow): boolean {
  if (!row.active) return false;
  if (row.expiresAt && Date.now() > Number(row.expiresAt)) return false;
  return true;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get('userId') || '';
  if (!userId) return Response.json({ error: 'userId required' }, { status: 400 });
  const store = await loadStore();
  const row = store[userId] || empty(userId);
  if (row.active && !stillActive(row)) {
    row.active = false;
    store[userId] = row;
    await saveStore(store);
  }
  return Response.json(row);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const userId = String(body.userId || '');
  if (!userId) return Response.json({ error: 'userId required' }, { status: 400 });
  const store = await loadStore();
  const row = store[userId] || empty(userId);
  const action = String(body.action || '');
  if (action === 'activate') {
    row.active = true;
    row.since = Date.now();
    row.expiresAt = Number(body.expiresAt) || Date.now() + 30 * 24 * 60 * 60 * 1000;
  } else if (action === 'deactivate') {
    row.active = false;
  } else if (action === 'color') {
    const c = String(body.color || '') as VipColor;
    if (COLORS.includes(c)) row.color = c;
  } else if (action === 'feat') {
    const key = body.key === 'eightMics' || body.key === 'roomMusic' ? body.key : null;
    if (key) row.feats[key] = !!body.on;
  } else if (action === 'rename-used') {
    row.renameUsed = true;
  }
  if (typeof body.username === 'string') row.username = body.username;
  store[userId] = row;
  await saveStore(store);
  return Response.json(row);
}
