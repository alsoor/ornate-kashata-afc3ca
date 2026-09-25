/**
 * Drop-in Express / Next.js route handler for /api/vip
 * Persist VIP state on the server so other devices and visitors see it.
 *
 * Next.js App Router: export { GET, POST } from this file after adapting
 * Request/Response to NextRequest if needed.
 *
 * Replace memoryStore with your DB (Postgres / SQLite).
 */

type VipColor = 'blue' | 'gold' | 'red' | 'green' | 'gray';

type Row = {
  userId: string;
  active: boolean;
  since: number;
  color: VipColor;
  feats: { eightMics: boolean; roomMusic: boolean };
  renameUsed: boolean;
};

const memoryStore = new Map<string, Row>();

function empty(userId: string): Row {
  return {
    userId,
    active: false,
    since: 0,
    color: 'gold',
    feats: { eightMics: false, roomMusic: false },
    renameUsed: false,
  };
}

function getRow(userId: string): Row {
  return memoryStore.get(userId) || empty(userId);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get('userId') || '';
  if (!userId) return Response.json({ error: 'userId required' }, { status: 400 });
  return Response.json(getRow(userId));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const userId = String(body.userId || '');
  if (!userId) return Response.json({ error: 'userId required' }, { status: 400 });
  const row = getRow(userId);
  const action = String(body.action || '');
  if (action === 'activate') {
    row.active = true;
    row.since = Date.now();
  } else if (action === 'color') {
    const c = String(body.color || '') as VipColor;
    if (['blue', 'gold', 'red', 'green', 'gray'].includes(c)) row.color = c;
  } else if (action === 'feat') {
    const key = body.key === 'eightMics' || body.key === 'roomMusic' ? body.key : null;
    if (key) row.feats[key] = !!body.on;
  } else if (action === 'rename-used') {
    row.renameUsed = true;
  }
  memoryStore.set(userId, row);
  return Response.json(row);
}
