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
import http2 from 'node:http2'; // IOS-PUSH
import crypto from 'node:crypto'; // IOS-PUSH
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
  image?: string; // TPL-COMMENT-NOTIFY: optional picture shown inside the phone notification
};

/** TPL-COMMENT-NOTIFY: FCM needs an absolute https image url. */
function fcmImage(u?: string): string | undefined {
  const s = String(u || '').trim();
  if (!s || s.startsWith('data:') || s.startsWith('blob:')) return undefined;
  if (/^https:\/\//i.test(s)) return s;
  if (s.startsWith('/')) return `${(process.env.PUBLIC_BASE_URL || 'https://stooorna.com').replace(/\/+$/, '')}${s}`;
  return undefined;
}


// ───────────────────────── IOS-PUSH: iPhone notifications straight through APNs ─────────────────────────
// No Firebase SDK is needed inside the iOS app. The app registers the plain APNs device token (64+ hex chars),
// and this server sends to Apple directly with the .p8 key (HTTP/2 + ES256 JWT, built-in Node modules only).
//
// Railway variables:
//   APNS_KEY        = contents of the AuthKey_XXXX.p8 file (raw text, or single-line base64 of it)
//   APNS_KEY_ID     = the 10-character Key ID of that key
//   APNS_TEAM_ID    = your 10-character Apple Team ID
//   APNS_BUNDLE_ID  = optional, default com.stooorna.app
//   APNS_ENV        = optional, "sandbox" only for Xcode debug builds; default is production (TestFlight / App Store)
const isApnsToken = (t: string) => /^[0-9a-f]{64,200}$/i.test(t);

let apnsJwt: { token: string; at: number } | null = null;
const apnsConfigured = () => !!(process.env.APNS_KEY && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID);

function apnsKeyPem(): string {
  let raw = (process.env.APNS_KEY || '').trim();
  if (!raw.includes('BEGIN')) raw = Buffer.from(raw, 'base64').toString('utf8');
  return raw.replace(/\\n/g, '\n').trim();
}

function apnsAuthToken(): string {
  const now = Math.floor(Date.now() / 1000);
  if (apnsJwt && now - apnsJwt.at < 50 * 60) return apnsJwt.token;
  const b64 = (v: string | Buffer) => Buffer.from(v).toString('base64url');
  const header = b64(JSON.stringify({ alg: 'ES256', kid: process.env.APNS_KEY_ID }));
  const claims = b64(JSON.stringify({ iss: process.env.APNS_TEAM_ID, iat: now }));
  const sig = crypto.sign('sha256', Buffer.from(`${header}.${claims}`), { key: apnsKeyPem(), dsaEncoding: 'ieee-p1363' });
  const token = `${header}.${claims}.${b64(sig)}`;
  apnsJwt = { token, at: now };
  return token;
}

/** Sends one alert to many iPhones. Returns the tokens Apple says are no longer valid (HTTP 410). Never throws. */
async function sendApns(
  tokens: string[],
  m: { title: string; body: string; url?: string; type?: string; ttlMs: number },
): Promise<string[]> {
  const dead: string[] = [];
  if (!tokens.length) return dead;
  if (!apnsConfigured()) {
    console.warn('[apns] APNS_KEY / APNS_KEY_ID / APNS_TEAM_ID not set - iPhone push disabled');
    return dead;
  }
  let session: http2.ClientHttp2Session | null = null;
  try {
    const host = process.env.APNS_ENV === 'sandbox' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
    const topic = process.env.APNS_BUNDLE_ID || 'com.stooorna.app';
    const jwt = apnsAuthToken();
    const expiration = String(Math.floor(Date.now() / 1000) + Math.floor(m.ttlMs / 1000));
    const payload = JSON.stringify({
      aps: { alert: { title: m.title || 'Stooorna', body: (m.body || '').slice(0, 180) }, sound: 'default' },
      url: m.url || '/',
      type: m.type || '',
    });
    const s = http2.connect(host);
    session = s;
    s.on('error', (e) => console.warn('[apns] session error:', e?.message || e));

    let ok = 0;
    const one = (token: string) =>
      new Promise<void>((resolve) => {
        try {
          const req = s.request({
            ':method': 'POST',
            ':path': `/3/device/${token}`,
            authorization: `bearer ${jwt}`,
            'apns-topic': topic,
            'apns-push-type': 'alert',
            'apns-priority': '10',
            'apns-expiration': expiration,
            'content-type': 'application/json',
          });
          let status = 0;
          let data = '';
          req.setEncoding('utf8');
          req.on('response', (h) => { status = Number(h[':status'] || 0); });
          req.on('data', (c) => { data += c; });
          req.on('end', () => {
            if (status === 200) ok++;
            else {
              console.warn('[apns] failed:', status, data);
              if (status === 410) dead.push(token);
            }
            resolve();
          });
          req.on('error', () => resolve());
          req.setTimeout(10_000, () => { try { req.close(); } catch { /* */ } resolve(); });
          req.end(payload);
        } catch { resolve(); }
      });
    await Promise.all(tokens.map(one));
    console.log(`[apns] sent ${ok}/${tokens.length}`);
  } catch (e) {
    console.error('[apns] send failed:', e);
  } finally {
    try { session?.close(); } catch { /* */ }
  }
  return dead;
}

/** Fire-and-forget safe: never throws. */
export async function sendFcmToUser(m: FcmMessage): Promise<void> {
  try {
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
    const img = fcmImage(m.image); // TPL-COMMENT-NOTIFY

    // IOS-PUSH: iPhone tokens go to APNs directly, everything else (Android) through FCM.
    const iosTokens = tokens.filter(isApnsToken);
    const androidTokens = tokens.filter((t) => !isApnsToken(t));
    const deadIos = await sendApns(iosTokens, {
      title: m.title, body: m.body, url: m.url, type: m.type,
      ttlMs: isCall ? 30_000 : 24 * 60 * 60 * 1000,
    });
    for (const t of deadIos) await client().execute('DELETE FROM fcm_tokens WHERE token = ?', [t]);
    if (!androidTokens.length || !ensureFirebase()) return;

    const resp = await getMessaging().sendEachForMulticast({
      tokens: androidTokens,
      notification: { title: m.title || 'Stooorna', body: (m.body || '').slice(0, 180), ...(img ? { imageUrl: img } : {}) },
      data: { url: m.url || '/', type: m.type || '' },
      android: {
        priority: 'high',
        ttl: isCall ? 30_000 : 24 * 60 * 60 * 1000,
        notification: { channelId: 'default', ...(img ? { imageUrl: img } : {}) },
      },
    });

    console.log(`[fcm] sent ${resp.successCount}/${androidTokens.length} to ${uid || uname}`);
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
      ) dead.push(androidTokens[i]);
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

    // IOS-PUSH
    const iosTokens = tokens.filter(isApnsToken);
    const androidTokens = tokens.filter((t) => !isApnsToken(t));
    const deadIos = await sendApns(iosTokens, { title: m.title, body: m.body, url: m.url, type: m.type, ttlMs: 10 * 60 * 1000 });
    for (const t of deadIos) await client().execute('DELETE FROM fcm_tokens WHERE token = ?', [t]);
    if (!androidTokens.length || !ensureFirebase()) return;

    const resp = await getMessaging().sendEachForMulticast({
      tokens: androidTokens,
      notification: { title: m.title || 'Stooorna', body: (m.body || '').slice(0, 180) },
      data: { url: m.url || '/', type: m.type || '' },
      android: {
        priority: 'high',
        ttl: 10 * 60 * 1000,
        notification: { channelId: 'default' },
      },
    });
    console.log(`[fcm] broadcast ${m.type || ''} sent ${resp.successCount}/${androidTokens.length}`);

    const dead: string[] = [];
    resp.responses.forEach((r, i) => {
      const code = r.error?.code || '';
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      ) dead.push(androidTokens[i]);
    });
    for (const t of dead) await client().execute('DELETE FROM fcm_tokens WHERE token = ?', [t]);
  } catch (e) {
    console.error('[fcm] broadcast failed:', e);
  }
}
