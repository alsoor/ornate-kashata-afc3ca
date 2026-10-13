import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

// Same-origin (relative) URL, exactly like the rest of the app, so the login cookie is sent.
const API_BASE = '';

let started = false;
let lastToken = '';

async function uploadToken(token: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/push/fcm-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token, platform: Capacitor.getPlatform() }),
    });
  } catch (e) {
    console.warn('fcm token upload failed', e);
  }
}

/**
 * Call after the user is logged in (RootLayout.tsx does this).
 * Does nothing on the web, so it will not clash with the existing Web Push.
 * Safe to call again after another user logs in on the same phone: the saved token is re-sent
 * so it is attached to the new account.
 */
export async function initNativePush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (started) {
    if (lastToken) await uploadToken(lastToken);
    return;
  }
  started = true;

  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') {
      started = false; // allow retry later if the user grants it in settings
      return;
    }

    await PushNotifications.addListener('registration', async (token) => {
      lastToken = token.value;
      await uploadToken(token.value);
    });

    await PushNotifications.addListener('registrationError', (err) => {
      console.warn('push registration error', err);
    });

    // Tapping a notification opens the url sent in its data payload.
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const url = action.notification?.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) {
        window.location.assign(url);
      }
    });

    // Android channel (importance 5 = max, shows heads-up banner).
    if (Capacitor.getPlatform() === 'android') {
      await PushNotifications.createChannel({
        id: 'default',
        name: 'Default',
        description: 'Stooorna notifications',
        importance: 5,
        visibility: 1,
        vibration: true,
      });
    }

    await PushNotifications.register();
  } catch (e) {
    started = false;
    console.warn('initNativePush failed', e);
  }
}
