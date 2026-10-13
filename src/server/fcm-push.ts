/**
 * Native (Capacitor / Android) push notifications through Firebase Cloud Messaging.
 *
 * - migrateFcm()          creates the fcm_tokens table (idempotent)
 * - registerFcmRoutes()   POST/DELETE /api/push/fcm-token  (logged-in users only)
 * - sendFcmToUser()       sends a notification to every device of a user
 *
 * Railway variable required:  FIREBASE_SERVICE_ACCOUNT  = the Firebase service-account key,
 * either as the raw JSON or as a single-line base64 of that JSON.
 *
 * DEEP-LINK: every message carries data.url (path + query). Tapping the system
 * notification opens the app; the client reads data.url / the launch URL and
 * navigates straight to the place (call, chat, live, post, invite, …).
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

export function registerFcmRoutes(app: Express) {
  // Register / refresh the device token for the logged-in user.
  app.post('/api/push/fcm-token', async (req: Request, res: Response) => {
    try {
      const session = await getAuth().api.getSession({ headers: req.headers as any });
      const user = session?.user;
      if (!user?.id) return res.status(401).json({ error: 'unauthorized' });
      const token = String((req.body as any)?.token || '').trim();
      if (!token || token.length < 20) return res.status(400).json({ error: 'token required' });
      const platform = String((req.body as any)?.platform || 'android').slice(0, 20);
      const username = String((user as any).username || (user as any).name || '').slice(0, 255);
      await client().execute(
        `INSERT INTO fcm_tokens (user_id, username, token, platform) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), username = VALUES(username), platform = VALUES(platform), updated_at = CURRENT_TIMESTAMP`,
        [String(user.id), username, token, platform],
      );
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // Call on logout so the device stops receiving this user's notifications.
  app.delete('/api/push/fcm-token', async (req: Request, res: Response) => {
    try {
      const session = await getAuth().api.getSession({ headers: req.headers as any });
      const user = session?.user;
      if (!user?.id) return res.status(401).json({ error: 'unauthorized' });
      const token = String((req.body as any)?.token || (req.query as any)?.token || '').trim();
      if (token) await client().execute('DELETE FROM fcm_tokens WHERE token = ? AND user_id = ?', [token, user.id]);
      else await client().execute('DELETE FROM fcm_tokens WHERE user_id = ?', [user.id]);
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

/** Normalize a deep-link path so the client can always open it. */
function normalizeDeepUrl(raw?: string): string {
  const u = String(raw || '/').trim() || '/';
  if (/^https?:\/\//i.test(u)) {
    try {
      const parsed = new URL(u);
      return parsed.pathname + parsed.search + parsed.hash;
    } catch {
      return '/';
    }
  }
  return u.startsWith('/') ? u : `/${u}`;
}

/** Build FCM data + notification options so a tap opens data.url on every platform. */
function buildPayload(m: { title: string; body: string; url?: string; type?: string }, opts?: { ttlMs?: number; priority?: 'high' | 'normal' }) {
  const url = normalizeDeepUrl(m.url);
  const type = String(m.type || '');
  // FCM data values MUST be strings.
  const data: Record<string, string> = {
    url,
    type,
    // Duplicate under common aliases so Capacitor / older clients still find the path.
    click_action: url,
    link: url,
  };
  const title = m.title || 'Stooorna';
  const body = (m.body || '').slice(0, 180);
  return {
    notification: { title, body },
    data,
    android: {
      priority: (opts?.priority || 'high') as 'high',
      ttl: opts?.ttlMs ?? 24 * 60 * 60 * 1000,
      notification: {
        channelId: 'default',
        // Bring the app to the foreground on tap; Capacitor receives the data payload.
        clickAction: 'FCM_PLUGIN_ACTIVITY',
        sound: 'default',
        defaultSound: true,
        priority: 'high' as const,
      },
    },
    // Web / PWA: open the same deep link when the notification is clicked.
    webpush: {
      fcmOptions: { link: url },
      notification: { title, body, data: { url, type } },
    },
  };
}

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
    const payload = buildPayload(m, {
      ttlMs: isCall ? 30_000 : 24 * 60 * 60 * 1000,
      priority: 'high',
    });

    const resp = await getMessaging().sendEachForMulticast({
      tokens,
      ...payload,
    });

    console.log(`[fcm] sent ${resp.successCount}/${tokens.length} to ${uid || uname} url=${payload.data.url}`);
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

    const payload = buildPayload(m, { ttlMs: 10 * 60 * 1000, priority: 'high' });
    const resp = await getMessaging().sendEachForMulticast({
      tokens,
      ...payload,
    });
    console.log(`[fcm] broadcast ${m.type || ''} sent ${resp.successCount}/${tokens.length} url=${payload.data.url}`);

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
