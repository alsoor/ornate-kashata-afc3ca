/**
 * usePushNotifications
 * Registers the Service Worker, requests Push permission, subscribes to VAPID,
 * and sends the subscription to the backend.
 *
 * Usage:
 *   const { permission, subscribe, unsubscribe } = usePushNotifications();
 */

import { useState, useEffect, useCallback } from 'react';

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<PushPermission>('default');
  const [swReg, setSwReg] = useState<ServiceWorkerRegistration | null>(null);

  // Register SW on mount
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPermission('unsupported');
      return;
    }
    setPermission(Notification.permission as PushPermission);

    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => {
        setSwReg(reg);
        // Handle notification click → navigate
        navigator.serviceWorker.addEventListener('message', (ev) => {
          if (ev.data?.type === 'NOTIFICATION_CLICK' && ev.data.url) {
            window.location.href = ev.data.url as string;
          }
        });
      })
      .catch(e => console.warn('[SW] registration failed', e));
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    // 1. Try Native Android Registration
    if ((window as any).AndroidInterface?.registerFcmToken) {
      const { data } = await fetch('/api/users/me').then(r => r.json());
      if (data?.user?.id) {
        (window as any).AndroidInterface.registerFcmToken(data.user.id);
      }
      return true; // Assume success for native flow
    }

    // 2. Web Push Registration
    if (!swReg) return false;
    try {
      // Get VAPID public key
      const r = await fetch('/api/push/vapid-public-key');
      const { key } = await r.json() as { key: string };
      if (!key) {
        console.warn('[Push] No VAPID key configured');
        return false;
      }

      // Request permission only when it has not already been granted. Calling
      // this on every app mount can cause browsers to suppress the prompt.
      const perm = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
      setPermission(perm as PushPermission);
      if (perm !== 'granted') return false;

      // Reuse an existing subscription when possible. A new subscription is
      // only created when the browser does not already have one for this app.
      const sub = await swReg.pushManager.getSubscription() ?? await swReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as unknown as BufferSource,
      });

      // Send to backend and verify the subscription was actually persisted.
      const subJson = sub.toJSON();
      const saveResponse = await fetch('/api/push/subscribe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: { p256dh: subJson.keys?.p256dh, auth: subJson.keys?.auth },
        }),
      });
      if (!saveResponse.ok) return false;

      return true;
    } catch (e) {
      console.error('[Push] subscribe error', e);
      return false;
    }
  }, [swReg]);

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!swReg) return;
    try {
      const sub = await swReg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
    } catch (e) {
      console.error('[Push] unsubscribe error', e);
    }
  }, [swReg]);

  return { permission, subscribe, unsubscribe };
}