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

/* ───────────────────────── FIX 3: viewers of the invited host see BOTH players ─────────────────────────
 *
 * The split picture (A left, B right) exists only in the room of the OWNER (A): B's second connection publishes
 * into A's channel. Someone who entered B's own room saw B alone, and the other host alone in his room.
 *
 * While B is in a split, B now keeps telling his own room "follow me to A's room" (the existing `duet-moved`
 * signal that live-camera already handles: viewers leave B's room and open A's room, where both cameras, the
 * round line, the chat and the gifts are). It repeats every 2.5s, so people who enter B's room later are moved too.
 * Nothing is sent when there is no split, and B's own live is never touched.
 */
export function useSplitViewersFollow(opts: {
  /** I am the INVITED host and the split is running (splitWith != null) */
  enabled: boolean;
  /** id of MY room (the room whose viewers must be moved) */
  roomHostId: string;
  /** the owner of the split (A) = where my viewers must go */
  owner: { userId: string; name: string; username: string | null; avatarUrl: string | null } | null;
  /** live-camera's sendDataPayload (sends into MY own room) */
  send: (payload: object) => unknown;
}): void {
  const { enabled, roomHostId, owner, send } = opts;
  const sendRef = React.useRef(send);
  sendRef.current = send;
  const ownerId = owner?.userId || '';
  const ownerName = owner?.name || '';
  const ownerUsername = owner?.username || '';
  const ownerAvatar = owner?.avatarUrl || '';
  React.useEffect(() => {
    if (!enabled || !roomHostId || !ownerId) return;
    const push = () => {
      try {
        void sendRef.current({
          t: 'duet-moved', split: true, hostId: roomHostId,
          toHostId: ownerId, toName: ownerName, toUsername: ownerUsername, toAvatar: ownerAvatar,
          ts: Date.now(),
        });
      } catch { /* ignore */ }
    };
    push();
    const t1 = window.setTimeout(push, 700);
    const iv = window.setInterval(push, 2500);
    return () => { window.clearTimeout(t1); window.clearInterval(iv); };
  }, [enabled, roomHostId, ownerId, ownerName, ownerUsername, ownerAvatar]);
}
