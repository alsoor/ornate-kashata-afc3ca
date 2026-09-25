/**
 * GET/POST /api/business/directory
 * Public Business badges for every viewer.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

type Row = {
  userId: string;
  username?: string | null;
  email?: string | null;
  projectName?: string | null;
  active: boolean;
  since: number;
  expiresAt?: number;
};

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'business-directory.json');
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

async function loadList(): Promise<Row[]> {
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    const o = JSON.parse(raw);
    return Array.isArray(o) ? o : [];
  } catch {
    return [];
  }
}

async function saveList(list: Row[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(list), 'utf8');
}

function stillActive(row: Row): boolean {
  if (!row.active) return false;
  if (row.expiresAt && Date.now() > Number(row.expiresAt)) return false;
  return true;
}

// Public endpoint: only currently-subscribed (active, non-expired) Business
// accounts are exposed here. Previously every upsert stayed listed forever
// with no subscription state, so the public directory could not tell a real
// paying Business account apart from a one-off profile write. This mirrors
// the VIP directory's active/expiresAt filtering.
export async function GET() {
  const list = await loadList();
  const users = list.filter(stillActive).map((row) => ({
    userId: row.userId,
    username: row.username || null,
    email: row.email || null,
    projectName: row.projectName || null,
    active: true,
    expiresAt: row.expiresAt,
  }));
  return Response.json({ users });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = String(body.action || 'upsert');
  const userId = String(body.userId || '');
  if (!userId) return Response.json({ error: 'userId required' }, { status: 400 });
  let list = await loadList();
  const existing = list.find((x) => x.userId === userId);

  if (action === 'remove') {
    list = list.filter((x) => x.userId !== userId);
    await saveList(list);
    return Response.json({ users: list.filter(stillActive) });
  }

  const row: Row = existing
    ? { ...existing }
    : { userId, username: null, email: null, projectName: null, active: false, since: 0 };

  if (action === 'activate') {
    row.active = true;
    row.since = Date.now();
    row.expiresAt = Number(body.expiresAt) || Date.now() + PERIOD_MS;
  } else if (action === 'deactivate') {
    row.active = false;
  }
  // 'upsert' (default) only updates profile fields below and leaves the
  // existing subscription state untouched, so editing a profile can never
  // grant or revoke Business status on its own.

  if (body.username !== undefined) row.username = body.username ? String(body.username) : null;
  if (body.email !== undefined) row.email = body.email ? String(body.email) : null;
  if (body.projectName !== undefined) row.projectName = body.projectName ? String(body.projectName) : null;

  list = list.filter((x) => x.userId !== userId);
  list.unshift(row);
  await saveList(list);
  return Response.json({ users: list.filter(stillActive) });
}
