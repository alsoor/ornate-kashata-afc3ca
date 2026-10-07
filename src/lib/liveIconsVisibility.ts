import { useEffect, useState } from 'react';

/**
 * Global switch (owner only) that shows / hides the Coins ($) icon and the Gifts icon
 * inside every video LIVE and voice LIVE. One value for the whole app, stored on the server,
 * so when the owner turns it off nobody can see the two icons.
 *
 * Server routes (see server/app-settings/live-icons/GET.ts and POST.ts):
 *   GET  /api/app-settings/live-icons  -> { visible: boolean }   (everyone)
 *   POST /api/app-settings/live-icons  { visible: boolean }      (owner only)
 */
const URL_ = '/api/app-settings/live-icons';
const CACHE_KEY = 'stooorna_live_icons_visible';
export const LIVE_ICONS_EVENT = 'stooorna:live-icons-visible';

function readCache(): boolean {
  try { return localStorage.getItem(CACHE_KEY) !== '0'; } catch { return true; }
}
function writeCache(v: boolean) {
  try { localStorage.setItem(CACHE_KEY, v ? '1' : '0'); } catch { /* ignore */ }
}

/** Reads the server value. Returns null when the server cannot be reached (caller keeps the last known value). */
export async function fetchLiveIconsVisible(): Promise<boolean | null> {
  try {
    const r = await fetch(URL_, { credentials: 'include', cache: 'no-store' });
    if (!r.ok) return null;
    const d = await r.json();
    if (typeof d?.visible !== 'boolean') return null;
    writeCache(d.visible);
    return d.visible;
  } catch {
    return null;
  }
}

/** Owner only. Returns true when the server accepted the change. */
export async function setLiveIconsVisible(visible: boolean): Promise<boolean> {
  try {
    const r = await fetch(URL_, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visible }),
    });
    if (!r.ok) return false;
    writeCache(visible);
    window.dispatchEvent(new CustomEvent(LIVE_ICONS_EVENT, { detail: { visible } }));
    return true;
  } catch {
    return false;
  }
}

/** React hook: current value (default = shown), refreshed on mount, on focus and every 20s so users see the change quickly. */
export function useLiveIconsVisible(): boolean {
  const [visible, setVisible] = useState<boolean>(readCache);
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      const v = await fetchLiveIconsVisible();
      if (alive && v !== null) setVisible(v);
    };
    const onEvt = (e: Event) => {
      const v = (e as CustomEvent<{ visible?: boolean }>).detail?.visible;
      if (typeof v === 'boolean') setVisible(v);
    };
    const onVis = () => { if (document.visibilityState === 'visible') void pull(); };
    void pull();
    const t = window.setInterval(pull, 20000);
    window.addEventListener(LIVE_ICONS_EVENT, onEvt);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      window.clearInterval(t);
      window.removeEventListener(LIVE_ICONS_EVENT, onEvt);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
  return visible;
}
