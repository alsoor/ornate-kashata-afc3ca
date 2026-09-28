/**
 * DELETE /api/status/:id      — delete one of MY stories (real server-side delete)
 * DELETE /api/status?id=123   — same (id may also be in a JSON body: { id | statusId })
 *
 * Why this exists: /api/status goes through the raw-binary parser in entry.ts, so a
 * JSON body arrived as a Buffer and the id was never read; and /api/status/:id was
 * not registered at all. The story disappeared only locally (localStorage list),
 * while friends kept receiving it from GET /api/status. This deletes the DB row
 * (+ views/comments + media files) so it vanishes for everyone.
 */
import type { Request, Response, NextFunction } from 'express';
import { getAuth } from '../../../lib/auth/auth.js';
import { db } from '../../db/client.js';
import * as schema from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const { statuses, statusViews } = schema;
// Must match ASSETS_DIR in entry.ts / POST.ts
const ASSETS_DIR = process.env.ASSETS_DIR || '/shared-storage/public/assets';
const ASSETS_URL_PREFIX = '/airo-assets/';

/** Read the id from :id, ?id=, or a JSON body (Buffer or object). */
function readId(req: Request): number | null {
  let body: any = req.body;
  if (Buffer.isBuffer(body)) {
    try { body = body.length ? JSON.parse(body.toString('utf8')) : {}; } catch { body = {}; }
  }
  if (!body || typeof body !== 'object') body = {};
  const raw =
    (req.params as any)?.id ?? req.query.id ?? req.query.statusId ?? req.query.storyId ??
    body.id ?? body.statusId ?? body.storyId;
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function unlinkAsset(url: string | null | undefined) {
  try {
    if (!url || !url.startsWith(ASSETS_URL_PREFIX)) return;
    const root = path.resolve(ASSETS_DIR);
    const full = path.resolve(root, url.slice(ASSETS_URL_PREFIX.length));
    if (!full.startsWith(root + path.sep)) return; // never leave the assets folder
    await fs.unlink(full);
  } catch { /* file already gone — fine */ }
}

export default async function deleteStatusById(req: Request, res: Response) {
  try {
    const headerMap: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headerMap[k] = v;
      else if (Array.isArray(v) && v.length > 0) headerMap[k] = v.join(', ');
    }
    const session = await getAuth().api.getSession({ headers: new Headers(headerMap) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const id = readId(req);
    if (!id) return res.status(400).json({ error: 'id required' });

    const [row] = await db.select().from(statuses).where(eq(statuses.id, id));
    if (!row) return res.json({ ok: true, deleted: false, id }); // already gone
    if (row.userId !== session.user.id) return res.status(403).json({ error: 'Forbidden' });

    // dependent rows first (avoids FK errors)
    try { await db.delete(statusViews).where(eq(statusViews.statusId, id)); } catch (e) { console.error('[DELETE status] views', e); }
    const sc: any = (schema as any).statusComments;
    if (sc?.statusId) {
      try { await db.delete(sc).where(eq(sc.statusId, id)); } catch (e) { console.error('[DELETE status] comments', e); }
    }

    await db.delete(statuses).where(and(eq(statuses.id, id), eq(statuses.userId, session.user.id)));

    void unlinkAsset((row as any).mediaUrl);
    void unlinkAsset((row as any).audioUrl);

    return res.json({ ok: true, deleted: true, id });
  } catch (e) {
    console.error('[DELETE /api/status/:id]', e);
    return res.status(500).json({ error: 'Delete failed' });
  }
}

/**
 * For DELETE /api/status (no id in the path): if an id is provided (query or body)
 * delete it here; otherwise fall through to the existing handler untouched.
 */
export function statusDeleteEntry(req: Request, res: Response, next: NextFunction) {
  const id = readId(req);
  if (id == null) {
    // make the parsed body available to the legacy handler too
    if (Buffer.isBuffer(req.body)) {
      try { req.body = req.body.length ? JSON.parse(req.body.toString('utf8')) : {}; } catch { req.body = {}; }
    }
    return next();
  }
  return void deleteStatusById(req, res);
}
