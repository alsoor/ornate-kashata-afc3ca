/**
 * Native push tap handler (Capacitor / Android).
 * When the user taps a notification outside the app, the FCM data.url is passed to onUrl,
 * which navigates straight to the target place (call, chat, post, invite, live).
 * Uses the Capacitor global, so it is a no-op in a normal browser and needs no extra import.
 */
type TapHandler = (url: string) => void;

export function installPushTapHandler(onUrl: TapHandler): () => void {
  let removed = false;
  let handle: { remove?: () => void } | null = null;
  try {
    const cap = (window as any).Capacitor;
    const plugin = cap?.Plugins?.PushNotifications;
    if (!plugin?.addListener) return () => {};
    const res = plugin.addListener('pushNotificationActionPerformed', (ev: any) => {
      try {
        const data = ev?.notification?.data || {};
        const url = String(data.url || '').trim();
        if (url && url.startsWith('/')) onUrl(url);
      } catch { /* ignore */ }
    });
    Promise.resolve(res).then((h: any) => { handle = h; if (removed) { try { h?.remove?.(); } catch { /* ignore */ } } });
  } catch { /* ignore */ }
  return () => { removed = true; try { handle?.remove?.(); } catch { /* ignore */ } };
}
