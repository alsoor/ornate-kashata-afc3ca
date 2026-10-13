/**
 * Profile "bell": a visitor picks, per user, whether they want a push notification for that user's new posts.
 *
 * Modes (same idea as Instagram's post notifications):
 *   all       every new post from that user sends a notification
 *   relevant  at most ONE notification per author per RELEVANT_WINDOW_MS (a burst of posts = one ping)
 *   off       nothing (default - no row is stored)
 *
 * - migratePostBell()          creates the post_bell table (idempotent)
 * - registerPostBellRoutes()   GET /api/post-bell/:authorId   -> { mode }
 *                              GET /api/post-bell             -> { items: [{ authorId, mode }] }
 *                              PUT|POST /api/post-bell        body { authorId, mode }
 * - makePostBellPush()         Express middleware placed in front of POST /api/posts. It does NOT change the
 *                              existing handler: it only watches the successful response and then pushes
 *                              (through the existing FCM sender) to everyone who rang that author's bell.
 */
import type { Express, Request, RequestHandler, Response } from 'express';
import { db } from './db/client.js';
import { getAuth } from '../lib/auth/auth.js';
import { sendFcmToUser } from './fcm-push.js';

export type PostBellMode = 'all' | 'relevant' | 'off';
const MODES: PostBellMode[] = ['all', 'relevant', 'off'];
const RELEVANT_WINDOW_MS = 3 * 60 * 60 * 1000; // "Most relevant": one ping per author every 3 hours
const MAX_SUBSCRIBERS_PER_POST = 1000;

const client = () => (db as any).$client;

async function rows(sql: string, params: unknown[] = []): Promise<any[]> {
  const r = await client().execute(sql, params);
  return Array.isArray(r) ? (r[0] as any[]) : (r as any[]);
}

export async function migratePostBell() {
  try {
    await client().execute(`
      CREATE TABLE IF NOT EXISTS \`post_bell\` (
        \`id\`               INT AUTO_INCREMENT PRIMARY KEY,
        \`user_id\`          VARCHAR(255) NOT NULL,
        \`author_id\`        VARCHAR(255) NOT NULL,
        \`mode\`             VARCHAR(12) NOT NULL DEFAULT 'relevant',
        \`last_notified_at\` BIGINT NOT NULL DEFAULT 0,
        \`updated_at\`       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_post_bell (\`user_id\`, \`author_id\`),
        INDEX idx_post_bell_author (\`author_id\`)
      )
    `);
    console.log('[migrate] post_bell ready');
  } catch (e) {
    console.error('[migrate] post_bell failed:', e);
  }
}

async function sessionUser(req: Request) {
  const auth = getAuth();
  const s = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
  return s?.user as (undefined | { id: string; name?: string; username?: string });
}

const cleanId = (v: unknown) => String(v ?? '').trim().slice(0, 255);

export function registerPostBellRoutes(app: Express) {
  app.get('/api/post-bell/:authorId', async (req: Request, res: Response) => {
    try {
      const user = await sessionUser(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      const authorId = cleanId(req.params.authorId);
      const r = await rows('SELECT `mode` FROM post_bell WHERE user_id = ? AND author_id = ? LIMIT 1', [user.id, authorId]);
      const mode = (r[0]?.mode as PostBellMode) || 'off';
      res.json({ mode: MODES.includes(mode) ? mode : 'off' });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get('/api/post-bell', async (req: Request, res: Response) => {
    try {
      const user = await sessionUser(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      const r = await rows('SELECT author_id, `mode` FROM post_bell WHERE user_id = ? AND `mode` <> ? LIMIT 2000', [user.id, 'off']);
      res.json({ items: r.map((x) => ({ authorId: String(x.author_id), mode: String(x.mode) })) });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  const save: RequestHandler = async (req, res) => {
    try {
      const user = await sessionUser(req);
      if (!user) return void res.status(401).json({ error: 'Unauthorized' });
      const authorId = cleanId((req.body || {}).authorId);
      const mode = String((req.body || {}).mode || '') as PostBellMode;
      if (!authorId || !MODES.includes(mode)) return void res.status(400).json({ error: 'Invalid request' });
      if (String(user.id) === authorId) return void res.status(400).json({ error: 'Cannot subscribe to yourself' });
      if (mode === 'off') {
        await client().execute('DELETE FROM post_bell WHERE user_id = ? AND author_id = ?', [user.id, authorId]);
      } else {
        await client().execute(
          `INSERT INTO post_bell (user_id, author_id, \`mode\`) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE \`mode\` = VALUES(\`mode\`)`,
          [user.id, authorId, mode],
        );
      }
      res.json({ ok: true, mode });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  };
  app.put('/api/post-bell', save);
  app.post('/api/post-bell', save);
}

/** Pushes "new post" to everyone who rang the author's bell. Never throws. */
async function notifySubscribers(author: { id: string; name?: string; username?: string }, postId: unknown, text = 'نشر منشوراً جديداً') {
  try {
    const authorId = String(author.id);
    const subs = await rows(
      `SELECT user_id, \`mode\`, last_notified_at FROM post_bell WHERE author_id = ? AND \`mode\` <> ? LIMIT ${MAX_SUBSCRIBERS_PER_POST}`,
      [authorId, 'off'],
    );
    if (!subs.length) return;
    const now = Date.now();
    const who = String(author.name || author.username || 'Stooorna').slice(0, 60);
    for (const s of subs) {
      const uid = String(s.user_id);
      if (uid === authorId) continue;
      if (s.mode === 'relevant' && now - Number(s.last_notified_at || 0) < RELEVANT_WINDOW_MS) continue;
      await client().execute('UPDATE post_bell SET last_notified_at = ? WHERE user_id = ? AND author_id = ?', [now, uid, authorId]);
      void sendFcmToUser({
        userId: uid,
        title: who,
        body: text,
        url: '/',
        type: 'post',
      });
    }
    console.log(`[post-bell] ${authorId} post ${String(postId ?? '')} -> ${subs.length} subscriber(s) checked`);
  } catch (e) {
    console.error('[post-bell] notify failed:', e);
  }
}

/**
 * Put in front of the existing POST /api/posts handler:  app.post('/api/posts', postBellPush, posts_post_68)
 * It lets the original handler run untouched and only reacts once a post was really created (HTTP 2xx).
 */
export function makePostBellPush(getUser: (req: Request) => Promise<any>): RequestHandler {
  return (req, res, next) => {
    let captured: any = null;
    const origJson = res.json.bind(res);
    (res as any).json = (body: any) => {
      captured = body;
      return origJson(body);
    };
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      void (async () => {
        try {
          const post = (captured && (captured.post || captured.data || captured)) || {};
          const audience = String(post.audience || (req.body || {}).audience || '').toLowerCase();
          // never ping about posts that are not meant for everyone who follows the bell
          if (['private', 'me', 'only_me', 'onlyme', 'draft', 'hidden'].includes(audience)) return;
          const u = await getUser(req).catch(() => null);
          if (!u?.id) return;
          await notifySubscribers({ id: String(u.id), name: u.name, username: u.username }, post.id);
        } catch (e) {
          console.error('[post-bell] hook failed:', e);
        }
      })();
    });
    next();
  };
}

/**
 * Templates posts (images / videos) are saved by templates-routes through their own endpoint.
 * This middleware is mounted on /api BEFORE those routes and recognises a new Templates post by its shape
 * (a row whose id starts with "tpl_", created in the last 2 minutes) in a successful POST/PUT body, so it
 * works without touching or knowing the exact path of the existing handler. Each row id is notified once.
 */
const notifiedTpl = new Map<string, number>();
function findTemplateRow(b: any, depth = 0): any | null {
  if (!b || typeof b !== 'object' || depth > 3) return null;
  if (typeof b.id === 'string' && /^tpl_/.test(b.id)) return b;
  for (const v of Object.values(b)) {
    const r = findTemplateRow(v, depth + 1);
    if (r) return r;
  }
  return null;
}
export function makeTemplatePostBellPush(getUser: (req: Request) => Promise<any>): RequestHandler {
  return (req, res, next) => {
    if (req.method !== 'POST' && req.method !== 'PUT') return next();
    const row = findTemplateRow(req.body);
    if (!row) return next();
    const created = Number(row.createdAt || 0);
    if (created && Date.now() - created > 2 * 60_000) return next(); // an old row being re-synced, not a new post
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      void (async () => {
        try {
          const id = String(row.id);
          if (notifiedTpl.has(id)) return;
          const u = await getUser(req).catch(() => null);
          if (!u?.id) return;
          if (row.userId && String(row.userId) !== String(u.id)) return;
          notifiedTpl.set(id, Date.now());
          for (const [k, t] of notifiedTpl) if (Date.now() - t > 30 * 60_000) notifiedTpl.delete(k);
          await notifySubscribers({ id: String(u.id), name: u.name, username: u.username }, id, 'نشر منشوراً جديداً في Templates');
        } catch (e) {
          console.error('[post-bell] templates hook failed:', e);
        }
      })();
    });
    next();
  };
}
