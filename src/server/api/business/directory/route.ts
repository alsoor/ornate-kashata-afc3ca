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
};

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'business-directory.json');

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

export async function GET() {
  const users = await loadList();
  return Response.json({ users });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = String(body.action || 'upsert');
  const userId = String(body.userId || '');
  if (!userId) return Response.json({ error: 'userId required' }, { status: 400 });
  let list = await loadList();
  if (action === 'remove') {
    list = list.filter((x) => x.userId !== userId);
  } else {
    const row: Row = {
      userId,
      username: body.username ? String(body.username) : null,
      email: body.email ? String(body.email) : null,
      projectName: body.projectName ? String(body.projectName) : null,
    };
    list = list.filter((x) => x.userId !== userId);
    list.unshift(row);
  }
  await saveList(list);
  return Response.json({ users: list });
}
