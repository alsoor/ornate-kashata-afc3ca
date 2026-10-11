/**
 * Stooorna Ai — Credits routes (server) v1.0.0
 * Place at: server/ai-credits-routes.ts   (same folder as templates-routes.ts)
 *
 *   GET  /api/ai-credits          -> { ok, balance, cost, welcome }   (first call gives the 30 P welcome credit)
 *   POST /api/ai-credits/spend    -> { ok, balance }  or 402 { ok:false, error:'insufficient', balance }
 *   OWNER ONLY (needs opts.isAdmin):  GET /api/ai-credits/free-list -> { ok, ids }   POST /api/ai-credits/free { userId, on } -> { ok, ids }
 *   A user in the free list publishes without paying (no points taken, never sent to Upgrade); remove them and they are normal again.
 *
 * Identity comes from the session only. There is NO route that adds points from the client:
 * after Google Pay is connected, call grantCredits(userId, 500) from your VERIFIED payment handler.
 */
import type { Express, Request, Response } from 'express';

const COST = 5;
const WELCOME = 30;

interface Opts {
  pool?: any; // mysql2 pool (same one used by templates)
  getUser: (req: Request) => Promise<{ id?: string | number } | null | undefined> | { id?: string | number } | null | undefined;
  isAdmin?: (u: any) => boolean | Promise<boolean>; // OWNER-FREE-PUBLISH: only the owner may change the free list
}

let poolRef: any;
const mem = new Map<string, number>(); // used only when no MySQL pool exists
const freeMem = new Set<string>(); // OWNER-FREE-PUBLISH (no MySQL pool)

async function ensureTable() {
  if (!poolRef) return;
  await poolRef.query(
    'CREATE TABLE IF NOT EXISTS ai_credits (user_id VARCHAR(64) NOT NULL PRIMARY KEY, balance INT NOT NULL DEFAULT 0, updated_at BIGINT NOT NULL DEFAULT 0)',
  );
  await poolRef.query(
    'CREATE TABLE IF NOT EXISTS ai_free_publish (user_id VARCHAR(64) NOT NULL PRIMARY KEY, granted_at BIGINT NOT NULL DEFAULT 0)',
  );
}

// OWNER-FREE-PUBLISH helpers
let tableP: Promise<void> | null = null;
const ready = (): Promise<void> => (tableP ??= ensureTable().catch(e => { tableP = null; throw e; })); // retries if the first attempt failed

async function isFree(uid: string): Promise<boolean> {
  if (!poolRef) return freeMem.has(uid);
  try {
    await ready();
    const [rows]: any = await poolRef.query('SELECT 1 FROM ai_free_publish WHERE user_id = ? LIMIT 1', [uid]);
    return !!rows?.length;
  } catch { return false; }
}
async function freeIds(): Promise<string[]> {
  if (!poolRef) return Array.from(freeMem);
  await ready();
  const [rows]: any = await poolRef.query('SELECT user_id FROM ai_free_publish');
  return (rows || []).map((r: any) => String(r.user_id));
}
async function setFree(uid: string, on: boolean) {
  if (!poolRef) { if (on) freeMem.add(uid); else freeMem.delete(uid); return; }
  await ready();
  if (on) await poolRef.query('INSERT IGNORE INTO ai_free_publish (user_id, granted_at) VALUES (?, ?)', [uid, Date.now()]);
  else await poolRef.query('DELETE FROM ai_free_publish WHERE user_id = ?', [uid]);
}

async function getBalance(uid: string): Promise<number> {
  if (!poolRef) { if (!mem.has(uid)) mem.set(uid, WELCOME); return mem.get(uid)!; }
  await poolRef.query('INSERT IGNORE INTO ai_credits (user_id, balance, updated_at) VALUES (?, ?, ?)', [uid, WELCOME, Date.now()]);
  const [rows]: any = await poolRef.query('SELECT balance FROM ai_credits WHERE user_id = ?', [uid]);
  return Number(rows?.[0]?.balance) || 0;
}

/** Atomic: only takes points when enough are left. Returns the new balance or null. */
async function spend(uid: string, amount: number): Promise<number | null> {
  await getBalance(uid);
  if (!poolRef) {
    const cur = mem.get(uid) || 0;
    if (cur < amount) return null;
    mem.set(uid, cur - amount);
    return cur - amount;
  }
  const [res]: any = await poolRef.query('UPDATE ai_credits SET balance = balance - ?, updated_at = ? WHERE user_id = ? AND balance >= ?', [amount, Date.now(), uid, amount]);
  if (!res?.affectedRows) return null;
  return getBalance(uid);
}

/** For the future payment handler (verified Google Pay purchase): adds points to a user. */
export async function grantCredits(userId: string, amount: number): Promise<number> {
  await getBalance(userId);
  if (!poolRef) { mem.set(userId, (mem.get(userId) || 0) + amount); return mem.get(userId)!; }
  await poolRef.query('UPDATE ai_credits SET balance = balance + ?, updated_at = ? WHERE user_id = ?', [amount, Date.now(), userId]);
  return getBalance(userId);
}

export function registerAiCreditsRoutes(app: Express, opts: Opts) {
  poolRef = opts.pool;
  ready().catch(e => console.error('[ai-credits] table error:', e));

  const who = async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const u: any = await opts.getUser(req);
    const id = u?.id != null ? String(u.id) : '';
    if (!id) { res.status(401).json({ ok: false, error: 'not-signed-in' }); return null; }
    return id;
  };

  app.get('/api/ai-credits', async (req, res) => {
    try {
      const id = await who(req, res); if (!id) return;
      res.json({ ok: true, balance: await getBalance(id), cost: COST, welcome: WELCOME, free: await isFree(id) });
    } catch (e) { console.error('[ai-credits] get', e); res.status(500).json({ ok: false, error: 'server' }); }
  });

  app.post('/api/ai-credits/spend', async (req, res) => {
    try {
      const id = await who(req, res); if (!id) return;
      if (await isFree(id)) return res.json({ ok: true, balance: await getBalance(id), free: true }); // OWNER-FREE-PUBLISH: nothing is taken
      const left = await spend(id, COST);
      if (left === null) return res.status(402).json({ ok: false, error: 'insufficient', balance: await getBalance(id) });
      res.json({ ok: true, balance: left });
    } catch (e) { console.error('[ai-credits] spend', e); res.status(500).json({ ok: false, error: 'server' }); }
  });

  // ── OWNER-FREE-PUBLISH: owner-only list of users who may publish without paying ──
  const ownerOnly = async (req: Request, res: Response): Promise<boolean> => {
    res.setHeader('Cache-Control', 'no-store');
    const u: any = await opts.getUser(req);
    if (!u?.id || !opts.isAdmin || !(await opts.isAdmin(u))) { res.status(403).json({ ok: false, error: 'owner-only' }); return false; }
    return true;
  };

  app.get('/api/ai-credits/free-list', async (req, res) => {
    try {
      if (!(await ownerOnly(req, res))) return;
      res.json({ ok: true, ids: await freeIds() });
    } catch (e) { console.error('[ai-credits] free-list', e); res.status(500).json({ ok: false, error: 'server', detail: String((e as any)?.message || e).slice(0, 160) }); }
  });

  app.post('/api/ai-credits/free', async (req, res) => {
    try {
      if (!(await ownerOnly(req, res))) return;
      const uid = String((req.body as any)?.userId ?? '').trim();
      if (!uid || uid.length > 64) return res.status(400).json({ ok: false, error: 'bad-user' });
      await setFree(uid, !!(req.body as any)?.on);
      res.json({ ok: true, ids: await freeIds() });
    } catch (e) { console.error('[ai-credits] free', e); res.status(500).json({ ok: false, error: 'server', detail: String((e as any)?.message || e).slice(0, 160) }); }
  });
}
