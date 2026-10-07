import { useEffect, useState } from 'react';

/**
 * Owner switches (Settings → Company → App Upload). One value for the whole app, stored on the server,
 * so when the owner turns a switch off nobody can see that item.
 *
 *   gifts   → the Gifts icon inside video LIVE and voice LIVE
 *   coins   → the Coins ($) icon inside video LIVE and voice LIVE
 *   deposit → the "Deposit" box inside the Wallet page (live $ icon AND the user's Settings $ page)
 *
 * Server routes (see entry.ts, LIVE-ICONS-PATCH):
 *   GET  /api/app-settings/live-icons  -> { ok, gifts, coins, deposit }          (everyone)
 *   POST /api/app-settings/live-icons  { gifts?, coins?, deposit? } (booleans)   (owner only)
 */
export type LiveSwitchKey = 'gifts' | 'coins' | 'deposit';
export type LiveSwitches = Record<LiveSwitchKey, boolean>;

const URL_ = '/api/app-settings/live-icons';
const CACHE_KEY = 'stooorna_live_switches';
export const LIVE_ICONS_EVENT = 'stooorna:live-switches';
const ALL_ON: LiveSwitches = { gifts: true, coins: true, deposit: true };

function normalize(d: unknown): LiveSwitches {
  const o = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
  return { gifts: o.gifts !== false, coins: o.coins !== false, deposit: o.deposit !== false };
}
function readCache(): LiveSwitches {
  try { return normalize(JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')); } catch { return { ...ALL_ON }; }
}
function writeCache(v: LiveSwitches) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(v)); } catch { /* ignore */ }
}

/** Reads the server values. Returns null when the server cannot be reached (caller keeps the last known value). */
export async function fetchLiveSwitches(): Promise<LiveSwitches | null> {
  try {
    const r = await fetch(URL_, { credentials: 'include', cache: 'no-store' });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d || d.ok === false) return null;
    const v = normalize(d);
    writeCache(v);
    return v;
  } catch {
    return null;
  }
}

/** Owner only. Returns the saved values, or null when the server refused. */
export async function setLiveSwitch(key: LiveSwitchKey, value: boolean): Promise<LiveSwitches | null> {
  try {
    const r = await fetch(URL_, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const v = normalize(d);
    writeCache(v);
    window.dispatchEvent(new CustomEvent(LIVE_ICONS_EVENT, { detail: v }));
    return v;
  } catch {
    return null;
  }
}

/** React hook: current switches (default = all shown), refreshed on mount, on focus and every 20s so users see changes quickly. */
export function useLiveSwitches(): LiveSwitches {
  const [sw, setSw] = useState<LiveSwitches>(readCache);
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      const v = await fetchLiveSwitches();
      if (alive && v) setSw(v);
    };
    const onEvt = (e: Event) => {
      const d = (e as CustomEvent<LiveSwitches>).detail;
      if (d) setSw(normalize(d));
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
  return sw;
}
