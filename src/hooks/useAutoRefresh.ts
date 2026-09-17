/**
 * useAutoRefresh
 *
 * Provides a `tick` counter that increments every 3 seconds automatically.
 * Also increments immediately when:
 *   • The Service Worker broadcasts SW_REFRESH (push notification received)
 *   • The tab becomes visible again (user switches back to the app)
 *
 * Usage — pass `tick` as a dependency to any useEffect that fetches data:
 *
 *   const tick = useAutoRefresh();
 *   useEffect(() => { fetchMessages(); }, [tick, conversationId]);
 *
 * This replaces scattered setInterval calls across pages with a single
 * coordinated refresh signal. The interval is paused when the tab is hidden
 * to avoid wasting requests in the background.
 */
import { useState, useEffect, useRef } from 'react';

const INTERVAL_MS = 3_000;

export function useAutoRefresh(): number {
  const [tick, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── 3-second interval (paused when tab is hidden) ─────────────────────────
  useEffect(() => {
    const start = () => {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(() => setTick(t => t + 1), INTERVAL_MS);
    };
    const stop = () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        setTick(t => t + 1); // immediate refresh on tab focus
        start();
      } else {
        stop();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    if (document.visibilityState === 'visible') start();

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, []);

  // ── SW_REFRESH: instant tick when a push notification arrives ─────────────
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const onMessage = (ev: MessageEvent) => {
      if (ev.data?.type === 'SW_REFRESH') {
        setTick(t => t + 1);
      }
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  return tick;
}
