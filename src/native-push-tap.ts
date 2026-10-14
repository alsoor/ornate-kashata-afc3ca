/**
 * Native push helpers (Capacitor / Android).
 *  - installPushTapHandler:     the user tapped a notification outside the app -> onUrl(data.url)
 *  - installPushReceiveHandler: a notification arrived while the app is open   -> onNotif({ title, body, data })
 * Uses the Capacitor global, so both are a no-op in a normal browser and need no extra import.
 * If the plugin is not ready yet it retries for a few seconds.
 */
type Remover = () => void;

function withPlugin(attach: (plugin: any) => Promise<{ remove?: () => void } | undefined> | { remove?: () => void } | undefined): Remover {
  let removed = false;
  let handle: { remove?: () => void } | undefined;
  let tries = 0;
  let timer = 0;
  const run = () => {
    if (removed) return;
    try {
      const cap = (window as any).Capacitor;
      const plugin = cap?.Plugins?.PushNotifications || (cap?.registerPlugin ? cap.registerPlugin('PushNotifications') : null);
      if (plugin?.addListener) {
        Promise.resolve(attach(plugin)).then((h) => { handle = h; if (removed) { try { h?.remove?.(); } catch { /* ignore */ } } }).catch(() => {});
        return;
      }
    } catch { /* ignore */ }
    if (++tries < 15) timer = window.setTimeout(run, 1000);
  };
  run();
  return () => { removed = true; if (timer) window.clearTimeout(timer); try { handle?.remove?.(); } catch { /* ignore */ } };
}

export function installPushTapHandler(onUrl: (url: string) => void): Remover {
  return withPlugin((plugin) => plugin.addListener('pushNotificationActionPerformed', (ev: any) => {
    try {
      const url = String(ev?.notification?.data?.url || '').trim();
      if (url && url.startsWith('/')) onUrl(url);
    } catch { /* ignore */ }
  }));
}

export function installPushReceiveHandler(onNotif: (n: { title?: string; body?: string; data?: Record<string, any> }) => void): Remover {
  return withPlugin((plugin) => plugin.addListener('pushNotificationReceived', (n: any) => {
    try { onNotif({ title: n?.title, body: n?.body, data: n?.data || {} }); } catch { /* ignore */ }
  }));
}
