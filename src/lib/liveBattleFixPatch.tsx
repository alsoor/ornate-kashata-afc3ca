/**
 * liveBattleFixPatch — fixes for the split-screen game round (liveBattlePatch). Standalone, adds code only.
 *
 * FIX 1 (add-friend.tsx): the merged "two players" circle now opens the room of the OWNER of the split
 *   (the room that really shows both cameras). Before, the `owner` flag was read upside down, so the circle opened
 *   the guest's own live -> one user only, with the round line on top.
 *
 * FIX 2 (live-camera.tsx): the round line did not move on gifts. The round polled `gifts-<hostId>` by itself; if the
 *   room key LiveCoinsDock really uses is different, the line never saw a gift while the gift animation still played.
 *   Now every response of the dock's OWN `/api/live-gifts` polling is also fed into the round (`ingestGift`,
 *   de-duplicated by gift id), so the line grows exactly when a gift arrives: for the host, his guest, the supporter
 *   and all viewers (the authority re-broadcasts battle-state, the guest relays battle-view to his own viewers).
 */

import React from 'react';

const EVT = 'stooorna:live-gifts-seen';

/** Wrap window.fetch ONCE: every successful poll of /api/live-gifts is re-published as a window event. */
function installGiftSniffer(): void {
  if (typeof window === 'undefined') return;
  const w = window as any;
  if (w.__stooornaGiftSniffer) return;
  w.__stooornaGiftSniffer = true;
  const orig: typeof fetch = w.fetch.bind(w);
  w.fetch = (input: any, init?: any) => {
    const p: Promise<Response> = orig(input, init);
    try {
      const url: string = typeof input === 'string' ? input : input?.href || input?.url || '';
      const method = String(init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
      if (method === 'GET' && url.includes('/api/live-gifts') && url.includes('since=')) {
        const room = new URL(url, window.location.origin).searchParams.get('room') || '';
        p.then((r) => (r.ok ? r.clone().json() : null))
          .then((d: any) => {
            if (room && Array.isArray(d?.events) && d.events.length) {
              window.dispatchEvent(new CustomEvent(EVT, { detail: { room, events: d.events } }));
            }
          })
          .catch(() => { /* ignore */ });
      }
    } catch { /* ignore */ }
    return p;
  };
}

/** Call inside live-camera right after useLiveBattle. `enabled` = I am one of the two hosts of the split. */
export function useBattleGiftBridge(ingest: (room: string, event: any) => void, enabled: boolean): void {
  const ref = React.useRef(ingest);
  ref.current = ingest;
  React.useEffect(() => { installGiftSniffer(); }, []);
  React.useEffect(() => {
    if (!enabled) return;
    const onSeen = (ev: Event) => {
      const d = (ev as CustomEvent).detail as { room?: string; events?: any[] } | undefined;
      if (!d?.room || !Array.isArray(d.events)) return;
      for (const e of d.events) { try { ref.current(d.room, e); } catch { /* ignore */ } }
    };
    window.addEventListener(EVT, onSeen);
    return () => window.removeEventListener(EVT, onSeen);
  }, [enabled]);
}
