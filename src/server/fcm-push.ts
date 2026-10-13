/**
 * Native (Capacitor / Android) push notifications through Firebase Cloud Messaging.
 *
 * - migrateFcm()          creates the fcm_tokens table (idempotent)
 * - registerFcmRoutes()   POST/DELETE /api/push/fcm-token  (logged-in users only)
 * - sendFcmToUser()       sends a notification to every device of a user
 *
 * Railway variable required:  FIREBASE_SERVICE_ACCOUNT  = the Firebase service-account key,
 * either as the raw JSON or as a single-line base64 of that JSON.
 */
import type { Express, Request, Response } from 'express';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { db } from './db/client.js';
import { getAuth } from '../lib/auth/auth.js';

const client = () => (db as any).$client;

async function rows(sql: string, params: unknown[] = []): Promise<any[]> {
  const r = await client().execute(sql, params);
  return Array.isArray(r) ? (r[0] as any[]) : (r as any[]);
}

export async function migrateFcm() {
  try {
    await client().execute(`
      CREATE TABLE IF NOT EXISTS \`fcm_tokens\` (
        \`id\`         INT AUTO_INCREMENT PRIMARY KEY,
        \`user_id\`    VARCHAR(255) NOT NULL,
        \`username\`   VARCHAR(255) NULL,
        \`token\`      VARCHAR(255) NOT NULL,
        \`platform\`   VARCHAR(20) NULL,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_fcm_token (\`token\`),
        INDEX idx_fcm_user (\`user_id\`),
        INDEX idx_fcm_username (\`username\`)
      )
    `);
    console.log('[migrate] fcm_tokens ready');
  } catch (e) {
    console.error('[migrate] fcm_tokens failed:', e);
  }
}

let fcmReady: boolean | null = null;
function ensureFirebase(): boolean {
  if (fcmReady !== null) return fcmReady;
  try {
    let raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
    if (!raw) {
      console.warn('[fcm] FIREBASE_SERVICE_ACCOUNT is not set - native push disabled');
      return (fcmReady = false);
    }
    // Accept either raw JSON or a single-line base64 of the JSON.
    if (!raw.startsWith('{')) raw = Buffer.from(raw, 'base64').toString('utf8').trim();
    const sa = JSON.parse(raw);
    if (typeof sa.private_key === 'string') sa.private_key = sa.private_key.replace(/\\n/g, '\n');
    if (!getApps().length) initializeApp({ credential: cert(sa) });
    return (fcmReady = true);
  } catch (e) {
    console.error('[fcm] firebase init failed:', e);
    return (fcmReady = false);
  }
}

async function sessionUser(req: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
  return session?.user as (undefined | { id: string; name?: string; username?: string });
}

export function registerFcmRoutes(app: Express) {
  app.post('/api/push/fcm-token', async (req: Request, res: Response) => {
    try {
      const user = await sessionUser(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      const token = String((req.body || {}).token || '').trim();
      const platform = String((req.body || {}).platform || 'android').slice(0, 20);
      if (!token || token.length > 255) return res.status(400).json({ error: 'Invalid token' });
      const username = String(user.username || user.name || '').replace(/^@/, '').toLowerCase() || null;
      await client().execute(
        `INSERT INTO fcm_tokens (user_id, username, token, platform) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), username = VALUES(username), platform = VALUES(platform)`,
        [user.id, username, token, platform],
      );
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // Call on logout so the device stops receiving this user's notifications.
  app.delete('/api/push/fcm-token', async (req: Request, res: Response) => {
    try {
      const user = await sessionUser(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });
      const token = String((req.body || {}).token || req.query.token || '').trim();
      if (token) await client().execute('DELETE FROM fcm_tokens WHERE token = ? AND user_id = ?', [token, user.id]);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
}

export type FcmMessage = {
  userId?: string;
  username?: string;
  title: string;
  body: string;
  url?: string;
  type?: string;
};

/** Fire-and-forget safe: never throws. */
export async function sendFcmToUser(m: FcmMessage): Promise<void> {
  try {
    if (!ensureFirebase()) return;
    const uid = String(m.userId || '');
    const uname = String(m.username || '').replace(/^@/, '').toLowerCase();
    if (!uid && !uname) return;

    const list = await rows(
      `SELECT DISTINCT token FROM fcm_tokens
       WHERE (? <> '' AND user_id = ?) OR (? <> '' AND LOWER(username) = ?)
       LIMIT 500`,
      [uid, uid, uname, uname],
    );
    const tokens: string[] = list.map((r) => String(r.token)).filter(Boolean);
    if (!tokens.length) {
      console.log('[fcm] no registered device for', uid || uname);
      return;
    }

    const isCall = m.type === 'call';
    const resp = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title: m.title || 'Stooorna', body: (m.body || '').slice(0, 180) },
      data: { url: m.url || '/', type: m.type || '' },
      android: {
        priority: 'high',
        ttl: isCall ? 30_000 : 24 * 60 * 60 * 1000,
        notification: { channelId: 'default' },
      },
    });

    console.log(`[fcm] sent ${resp.successCount}/${tokens.length} to ${uid || uname}`);
    resp.responses.forEach((r) => {
      if (r.error) console.warn('[fcm] failed:', r.error.code, r.error.message);
    });

    // Remove dead tokens.
    const dead: string[] = [];
    resp.responses.forEach((r, i) => {
      const code = r.error?.code || '';
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      ) dead.push(tokens[i]);
    });
    for (const t of dead) await client().execute('DELETE FROM fcm_tokens WHERE token = ?', [t]);
  } catch (e) {
    console.error('[fcm] send failed:', e);
  }
}

export type FcmBroadcast = {
  exceptUserId?: string;
  exceptUsername?: string;
  title: string;
  body: string;
  url?: string;
  type?: string;
};

/** Sends to every registered device except the given user (used for "someone went live"). Never throws. */
export async function sendFcmToAll(m: FcmBroadcast): Promise<void> {
  try {
    if (!ensureFirebase()) return;
    const uid = String(m.exceptUserId || '');
    const uname = String(m.exceptUsername || '').replace(/^@/, '').toLowerCase();

    const list = await rows(
      `SELECT DISTINCT token FROM fcm_tokens
       WHERE NOT ((? <> '' AND user_id = ?) OR (? <> '' AND LOWER(username) = ?))
       LIMIT 500`,
      [uid, uid, uname, uname],
    );
    const tokens: string[] = list.map((r) => String(r.token)).filter(Boolean);
    if (!tokens.length) return;

    const resp = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title: m.title || 'Stooorna', body: (m.body || '').slice(0, 180) },
      data: { url: m.url || '/', type: m.type || '' },
      android: {
        priority: 'high',
        ttl: 10 * 60 * 1000,
        notification: { channelId: 'default' },
      },
    });
    console.log(`[fcm] broadcast ${m.type || ''} sent ${resp.successCount}/${tokens.length}`);

    const dead: string[] = [];
    resp.responses.forEach((r, i) => {
      const code = r.error?.code || '';
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      ) dead.push(tokens[i]);
    });
    for (const t of dead) await client().execute('DELETE FROM fcm_tokens WHERE token = ?', [t]);
  } catch (e) {
    console.error('[fcm] broadcast failed:', e);
  }
}
