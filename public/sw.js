/* Stooorna Service Worker — Web Push + Offline Cache + Auto-Refresh */

const CACHE = 'stooorna-v1';

// ── Broadcast REFRESH to every open tab/window ────────────────────────────────
function broadcastRefresh(url) {
  return clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    list.forEach((client) => client.postMessage({ type: 'SW_REFRESH', url: url || '/' }));
  });
}

// ── Push event: show notification + trigger instant refresh ───────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'Stooorna', body: 'لديك إشعار جديد', icon: '/favicon.ico', url: '/' };
  try {
    if (event.data) data = { ...data, ...JSON.parse(event.data.text()) };
  } catch {}

  event.waitUntil(
    Promise.all([
      // 1. Show the OS notification
      self.registration.showNotification(data.title, {
        body:    data.body,
        icon:    data.icon || '/favicon.ico',
        badge:   '/favicon.ico',
        tag:     data.tag || 'stooorna-notif',
        data:    { url: data.url || '/' },
        vibrate: [200, 100, 200],
        requireInteraction: false,
      }),
      // 2. Tell every open tab to refresh its data immediately
      broadcastRefresh(data.url),
    ])
  );
});

// ── Notification click: open/focus the app ────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.postMessage({ type: 'NOTIFICATION_CLICK', url });
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});

// ── Install / activate ────────────────────────────────────────────────────────
self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));
