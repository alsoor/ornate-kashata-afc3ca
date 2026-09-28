/**
 * Story-comment likes (the route the app calls did not exist on the server, so every
 * like was rolled back → "the like disappears").
 *
 *   POST /api/status/comments/:id/like        → toggle my like, returns { liked, likeCount }
 *   GET  /api/status/comment-likes?ids=1,2,3  → { counts: { "1": 2, ... }, mine: [1, 3] }
 *
 * Uses its own tiny table (created automatically, idempotent) so it doesn't depend on the
 * existing comments schema.
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../lib/auth/auth.js';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

let _tableReady: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (!_tableReady) {
    _tableReady = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS status_comment_likes (
          comment_id BIGINT NOT NULL,
          user_id    VARCHAR(191) NOT NULL,
          created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (comment_id, user_id)
        )
      `);
    })().catch(e => { _tableReady = null; throw e; });
  }
  return _tableReady;
}

/** mysql2 via drizzle returns [rows, fields]; normalise to rows. */
function rowsOf(r: any): any[] {
  if (Array.isArray(r)) return Array.isArray(r[0]) ? r[0] : r;
  return r?.rows ?? [];
}

async function sessionUserId(req: Request): Promise<string | null> {
  const headerMap: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headerMap[k] = v;
    else if (Array.isArray(v) && v.length > 0) headerMap[k] = v.join(', ');
  }
  const session = await getAuth().api.getSession({ headers: new Headers(headerMap) });
  return session?.user?.id ?? null;
}

export async function toggleStatusCommentLike(req: Request, res: Response) {
  try {
    const uid = await sessionUserId(req);
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    const commentId = Number(req.params.id);
    if (!Number.isFinite(commentId) || commentId <= 0) return res.status(400).json({ error: 'invalid comment id' });

    await ensureTable();
    const existing = rowsOf(await db.execute(sql`
      SELECT 1 AS x FROM status_comment_likes WHERE comment_id = ${commentId} AND user_id = ${uid} LIMIT 1
    `));
    let liked: boolean;
    if (existing.length) {
      await db.execute(sql`DELETE FROM status_comment_likes WHERE comment_id = ${commentId} AND user_id = ${uid}`);
      liked = false;
    } else {
      await db.execute(sql`INSERT IGNORE INTO status_comment_likes (comment_id, user_id) VALUES (${commentId}, ${uid})`);
      liked = true;
    }
    const cnt = rowsOf(await db.execute(sql`SELECT COUNT(*) AS c FROM status_comment_likes WHERE comment_id = ${commentId}`));
    const likeCount = Number(cnt[0]?.c ?? 0);
    return res.json({ ok: true, liked, likeCount });
  } catch (e) {
    console.error('[POST /api/status/comments/:id/like]', e);
    return res.status(500).json({ error: 'Like failed' });
  }
}

export async function getStatusCommentLikes(req: Request, res: Response) {
  try {
    const uid = await sessionUserId(req);
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    const ids = String(req.query.ids ?? '')
      .split(',')
      .map(s => Number(s.trim()))
      .filter(n => Number.isFinite(n) && n > 0)
      .slice(0, 500);
    if (!ids.length) return res.json({ counts: {}, mine: [] });

    await ensureTable();
    const idList = sql.join(ids.map(i => sql`${i}`), sql`, `);
    const countRows = rowsOf(await db.execute(sql`
      SELECT comment_id, COUNT(*) AS c FROM status_comment_likes WHERE comment_id IN (${idList}) GROUP BY comment_id
    `));
    const mineRows = rowsOf(await db.execute(sql`
      SELECT comment_id FROM status_comment_likes WHERE user_id = ${uid} AND comment_id IN (${idList})
    `));
    const counts: Record<string, number> = {};
    for (const r of countRows) counts[String(r.comment_id)] = Number(r.c);
    return res.json({ counts, mine: mineRows.map(r => Number(r.comment_id)) });
  } catch (e) {
    console.error('[GET /api/status/comment-likes]', e);
    return res.status(500).json({ error: 'Failed' });
  }
}
