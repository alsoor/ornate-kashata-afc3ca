/**
 * push-helper.ts
 * Central helper for sending Web Push notifications + saving in-app notifications.
 *
 * VAPID keys are stored as secrets:
 *   VAPID_PUBLIC_KEY  — base64url public key
 *   VAPID_PRIVATE_KEY — base64url private key
 *
 * If keys are missing, push is silently skipped (graceful degradation).
 */

import webpush from 'web-push';
import { getSecret } from '#airo/secrets';
import { db } from './db/client.js';
import { pushSubscriptions, inAppNotifications, fcmTokens } from './db/schema.js';
import { eq } from 'drizzle-orm';

let vapidReady = false;

function initVapid() {
  if (vapidReady) return true;
  const pub  = getSecret('VAPID_PUBLIC_KEY');
  const priv = getSecret('VAPID_PRIVATE_KEY');
  if (!pub || !priv) return false;
  try {
    webpush.setVapidDetails('mailto:admin@stooorna.com', pub as string, priv as string);
    vapidReady = true;
    return true;
  } catch {
    return false;
  }
}

export interface PushPayload {
  title: string;
  body:  string;
  icon?: string;
  url?:  string;
  tag?:  string;
  data?: Record<string, any>; // Extra data for native apps
}

/**
 * Send a push notification to one user (all their subscriptions).
 * Also saves an in-app notification row.
 */
export async function sendPushToUser(
  userId: string,
  type: string,
  payload: PushPayload,
): Promise<void> {
  // 1. Save in-app notification
  try {
    await db.insert(inAppNotifications).values({
      userId,
      type,
      title: payload.title,
      body:  payload.body,
      icon:  payload.icon ?? null,
      url:   payload.url ?? null,
    });
  } catch (e) {
    console.error('[push] in-app insert error', e);
  }

  // 2. Send Web Push (if VAPID configured)
  if (initVapid()) {
    let subs: { id: number; endpoint: string; p256dh: string; auth: string }[] = [];
    try {
      subs = await db
        .select({ id: pushSubscriptions.id, endpoint: pushSubscriptions.endpoint, p256dh: pushSubscriptions.p256dh, auth: pushSubscriptions.auth })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId));
    } catch {}

    const data = JSON.stringify(payload);
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          data,
          { TTL: 60 * 60 * 24 }, // 24h TTL
        );
      } catch (err: any) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          try { await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id)); } catch {}
        }
      }
    }
  }

  // 3. Send FCM (for native apps)
  const fcmKey = getSecret('FCM_SERVER_KEY');
  if (fcmKey) {
    let tokens: { id: number; token: string }[] = [];
    try {
      tokens = await db
        .select({ id: fcmTokens.id, token: fcmTokens.token })
        .from(fcmTokens)
        .where(eq(fcmTokens.userId, userId));
    } catch {}

    for (const { token } of tokens) {
      try {
        await fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `key=${fcmKey}`,
          },
          body: JSON.stringify({
            to: token,
            priority: 'high',
            data: {
              type,
              title: payload.title,
              message: payload.body,
              ...payload.data,
            },
          }),
        });
      } catch (err) {
        console.error('[push] FCM send error', err);
      }
    }
  }
}

/**
 * Send push to multiple users (e.g. all group members).
 */
export async function sendPushToUsers(
  userIds: string[],
  type: string,
  payload: PushPayload,
): Promise<void> {
  await Promise.all(userIds.map(uid => sendPushToUser(uid, type, payload)));
}

/**
 * Send a Web Push notification to ALL subscribed users (broadcast).
 * Used for new-post notifications.
 */
export async function sendPushToAll(payload: PushPayload): Promise<void> {
  if (!initVapid()) return;
  let subs: { id: number; userId: string; endpoint: string; p256dh: string; auth: string }[] = [];
  try {
    subs = await db
      .select({ id: pushSubscriptions.id, userId: pushSubscriptions.userId, endpoint: pushSubscriptions.endpoint, p256dh: pushSubscriptions.p256dh, auth: pushSubscriptions.auth })
      .from(pushSubscriptions);
  } catch { return; }

  const data = JSON.stringify(payload);
  await Promise.all(subs.map(async sub => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        data,
        { TTL: 60 * 60 * 6 }, // 6h TTL for post notifications
      );
    } catch (err: any) {
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        try { await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id)); } catch {}
      }
    }
  }));
}