/**
 * usePresence — real-time online / last-seen / typing for Stooorna chat.
 *
 * Drop-in for: import { useHeartbeat, usePresenceQuery, formatLastSeen } from '@/hooks/usePresence'
 *
 * Strategy (strong, multi-layer):
 *  1) Server: POST /api/presence/heartbeat + GET /api/presence?ids=
 *  2) Same-browser tabs: BroadcastChannel + localStorage events
 *  3) Local mirror of last known presence so UI never stays stuck on Offline
 *  4) Optional DM typing via /api/typing or local channel when server has no route
 *
 * English-only identifiers and comments.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

// ── Tunables ──────────────────────────────────────────────────────────────────
const HEARTBEAT_MS = 12_000;
const POLL_MS = 8_000;
const ONLINE_WINDOW_MS = 45_000; // seen within this window => online
const LOCAL_TTL_MS = 90_000;
const TYPING_TTL_MS = 3_500;

export type PresenceEntry = {
  online: boolean;
  lastSeenAt: number | null;
  name?: string | null;
  username?: string | null;
};

type PresenceMap = Record<string, PresenceEntry>;

// ── Module store (shared across all hook instances) ───────────────────────────
let presenceStore: PresenceMap = {};
const presenceListeners = new Set<() => void>();

function emitPresence() {
  presenceListeners.forEach((l) => l());
}

function getPresenceSnapshot(): PresenceMap {
  return presenceStore;
}

function subscribePresence(listener: () => void) {
  presenceListeners.add(listener);
  return () => {
    presenceListeners.delete(listener);
  };
}

function mergePresence(patch: PresenceMap) {
  let changed = false;
  const next = { ...presenceStore };
  for (const [id, entry] of Object.entries(patch)) {
    if (!id) continue;
    const prev = next[id];
    const online = !!entry.online;
    const lastSeenAt =
      entry.lastSeenAt != null
        ? Number(entry.lastSeenAt)
        : online
          ? Date.now()
          : prev?.lastSeenAt ?? null;
    if (
      !prev ||
      prev.online !== online ||
      prev.lastSeenAt !== lastSeenAt ||
      prev.name !== entry.name ||
      prev.username !== entry.username
    ) {
      next[id] = {
        online,
        lastSeenAt,
        name: entry.name ?? prev?.name ?? null,
        username: entry.username ?? prev?.username ?? null,
      };
      changed = true;
    }
  }
  if (changed) {
    presenceStore = next;
    emitPresence();
    try {
      localStorage.setItem(
        'stooorna_presence_mirror',
        JSON.stringify({ at: Date.now(), map: presenceStore }),
      );
    } catch {
      /* ignore */
    }
  }
}

function hydrateFromMirror() {
  try {
    const raw = localStorage.getItem('stooorna_presence_mirror');
    if (!raw) return;
    const parsed = JSON.parse(raw) as { at?: number; map?: PresenceMap };
    if (!parsed?.map || !parsed.at) return;
    if (Date.now() - parsed.at > LOCAL_TTL_MS * 2) return;
    const now = Date.now();
    const cleaned: PresenceMap = {};
    for (const [id, e] of Object.entries(parsed.map)) {
      const last = e.lastSeenAt ? Number(e.lastSeenAt) : null;
      cleaned[id] = {
        online: !!(last && now - last < ONLINE_WINDOW_MS),
        lastSeenAt: last,
        name: e.name ?? null,
        username: e.username ?? null,
      };
    }
    presenceStore = { ...presenceStore, ...cleaned };
  } catch {
    /* ignore */
  }
}

hydrateFromMirror();

// ── Local broadcast (cross-tab + same device without waiting for API) ─────────
const BC_NAME = 'stooorna-presence-v1';
let bc: BroadcastChannel | null = null;
try {
  if (typeof BroadcastChannel !== 'undefined') bc = new BroadcastChannel(BC_NAME);
} catch {
  bc = null;
}

function publishLocalPresence(payload: {
  userId: string;
  online: boolean;
  at: number;
  name?: string | null;
  username?: string | null;
}) {
  const entry: PresenceMap = {
    [payload.userId]: {
      online: payload.online,
      lastSeenAt: payload.at,
      name: payload.name ?? null,
      username: payload.username ?? null,
    },
  };
  mergePresence(entry);
  try {
    localStorage.setItem(
      `stooorna_presence_user_${payload.userId}`,
      JSON.stringify({
        online: payload.online,
        at: payload.at,
        name: payload.name ?? null,
        username: payload.username ?? null,
      }),
    );
  } catch {
    /* ignore */
  }
  try {
    bc?.postMessage({ type: 'presence', ...payload });
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(
      new CustomEvent('stooorna:presence', {
        detail: payload,
      }),
    );
  } catch {
    /* ignore */
  }
}

if (typeof window !== 'undefined') {
  try {
    bc?.addEventListener('message', (ev: MessageEvent) => {
      const d = ev.data as {
        type?: string;
        userId?: string;
        online?: boolean;
        at?: number;
        name?: string | null;
        username?: string | null;
      };
      if (d?.type !== 'presence' || !d.userId) return;
      mergePresence({
        [d.userId]: {
          online: !!d.online,
          lastSeenAt: Number(d.at) || Date.now(),
          name: d.name ?? null,
          username: d.username ?? null,
        },
      });
    });
  } catch {
    /* ignore */
  }
  window.addEventListener('storage', (e: StorageEvent) => {
    if (!e.key || !e.newValue) return;
    if (e.key.startsWith('stooorna_presence_user_')) {
      const userId = e.key.slice('stooorna_presence_user_'.length);
      try {
        const p = JSON.parse(e.newValue) as {
          online?: boolean;
          at?: number;
          name?: string | null;
          username?: string | null;
        };
        mergePresence({
          [userId]: {
            online: !!p.online && !!(p.at && Date.now() - Number(p.at) < ONLINE_WINDOW_MS),
            lastSeenAt: Number(p.at) || null,
            name: p.name ?? null,
            username: p.username ?? null,
          },
        });
      } catch {
        /* ignore */
      }
    }
  });
  window.addEventListener('stooorna:presence', ((e: Event) => {
    const d = (e as CustomEvent).detail as {
      userId?: string;
      online?: boolean;
      at?: number;
      name?: string | null;
      username?: string | null;
    };
    if (!d?.userId) return;
    mergePresence({
      [d.userId]: {
        online: !!d.online,
        lastSeenAt: Number(d.at) || Date.now(),
        name: d.name ?? null,
        username: d.username ?? null,
      },
    });
  }) as EventListener);
}

// ── formatLastSeen ────────────────────────────────────────────────────────────
export function formatLastSeen(value: number | string | null | undefined): string {
  if (value == null || value === '') return 'last seen recently';
  const ts = typeof value === 'number' ? value : new Date(value).getTime();
  if (!Number.isFinite(ts)) return 'last seen recently';
  const diff = Math.max(0, Date.now() - ts);
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return 'last seen just now';
  const min = Math.floor(sec / 60);
  if (min === 1) return 'last seen a minute ago';
  if (min < 60) return `last seen ${min} minutes ago`;
  const hr = Math.floor(min / 60);
  if (hr === 1) return 'last seen an hour ago';
  if (hr < 24) return `last seen ${hr} hours ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'last seen a day ago';
  if (day < 30) return `last seen ${day} days ago`;
  try {
    return `last seen ${new Date(ts).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })}`;
  } catch {
    return 'last seen a while ago';
  }
}

// ── Server helpers ────────────────────────────────────────────────────────────
async function postHeartbeat(body: {
  userId?: string;
  id?: string;
  name?: string | null;
  username?: string | null;
}): Promise<boolean> {
  try {
    const r = await fetch('/api/presence/heartbeat', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function fetchPresenceIds(ids: string[]): Promise<PresenceMap> {
  const unique = Array.from(new Set(ids.map(String).filter(Boolean)));
  if (!unique.length) return {};
  const out: PresenceMap = {};

  // Primary: batch query
  try {
    const q = unique.map(encodeURIComponent).join(',');
    const r = await fetch(`/api/presence?ids=${q}`, { credentials: 'include' });
    if (r.ok) {
      const data = await r.json();
      const list = (data?.users ?? data?.presence ?? data?.map ?? data) as
        | Record<string, any>
        | any[];
      if (Array.isArray(list)) {
        for (const row of list) {
          const id = String(row.userId ?? row.id ?? '');
          if (!id) continue;
          const last = row.lastSeenAt ?? row.lastSeen ?? row.at ?? null;
          const lastN = last != null ? Number(new Date(last).getTime?.() ?? last) : null;
          const online =
            row.online === true ||
            row.status === 'online' ||
            (!!lastN && Date.now() - lastN < ONLINE_WINDOW_MS);
          out[id] = {
            online,
            lastSeenAt: lastN,
            name: row.name ?? null,
            username: row.username ?? null,
          };
        }
      } else if (list && typeof list === 'object') {
        for (const [id, row] of Object.entries(list as Record<string, any>)) {
          const last = row?.lastSeenAt ?? row?.lastSeen ?? row?.at ?? null;
          const lastN = last != null ? Number(new Date(last).getTime?.() ?? last) : null;
          const online =
            row?.online === true ||
            row?.status === 'online' ||
            (!!lastN && Date.now() - lastN < ONLINE_WINDOW_MS);
          out[id] = {
            online,
            lastSeenAt: lastN,
            name: row?.name ?? null,
            username: row?.username ?? null,
          };
        }
      }
    }
  } catch {
    /* ignore */
  }

  // Fallback: per-user local keys written by other clients of the same app origin
  for (const id of unique) {
    if (out[id]) continue;
    try {
      const raw = localStorage.getItem(`stooorna_presence_user_${id}`);
      if (!raw) continue;
      const p = JSON.parse(raw) as { online?: boolean; at?: number };
      const at = Number(p.at) || 0;
      if (!at) continue;
      out[id] = {
        online: Date.now() - at < ONLINE_WINDOW_MS,
        lastSeenAt: at,
      };
    } catch {
      /* ignore */
    }
  }

  return out;
}

// ── useHeartbeat ──────────────────────────────────────────────────────────────
/**
 * Keep the current user marked online. Call once near the root of chat / app shell.
 */
export function useHeartbeat(
  enabled: boolean,
  meta?: { userId?: string | null; name?: string | null; username?: string | null },
) {
  const userId = meta?.userId ? String(meta.userId) : null;

  useEffect(() => {
    if (!enabled) return;

    let stopped = false;
    const beat = async () => {
      if (stopped) return;
      const at = Date.now();
      const uid = userId || undefined;
      if (uid) {
        publishLocalPresence({
          userId: uid,
          online: true,
          at,
          name: meta?.name ?? null,
          username: meta?.username ?? null,
        });
      }
      await postHeartbeat({
        userId: uid,
        id: uid,
        name: meta?.name ?? null,
        username: meta?.username ?? null,
      });
    };

    void beat();
    const iv = window.setInterval(() => void beat(), HEARTBEAT_MS);

    const onVis = () => {
      if (document.visibilityState === 'visible') void beat();
    };
    document.addEventListener('visibilitychange', onVis);

    const onUnload = () => {
      if (!userId) return;
      try {
        publishLocalPresence({
          userId,
          online: false,
          at: Date.now(),
          name: meta?.name ?? null,
          username: meta?.username ?? null,
        });
        // Best-effort offline beacon
        const blob = new Blob(
          [
            JSON.stringify({
              userId,
              id: userId,
              online: false,
              at: Date.now(),
            }),
          ],
          { type: 'application/json' },
        );
        navigator.sendBeacon?.('/api/presence/heartbeat', blob);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('pagehide', onUnload);
    window.addEventListener('beforeunload', onUnload);

    return () => {
      stopped = true;
      window.clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onUnload);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [enabled, userId, meta?.name, meta?.username]);
}

// ── usePresenceQuery ──────────────────────────────────────────────────────────
/**
 * Live presence map for the given user ids. Re-polls on an interval and
 * merges BroadcastChannel / localStorage updates immediately.
 */
export function usePresenceQuery(ids: string[]): PresenceMap {
  const key = useMemo(
    () =>
      Array.from(new Set((ids || []).map(String).filter(Boolean)))
        .sort()
        .join(','),
    [ids],
  );
  const idList = useMemo(() => (key ? key.split(',') : []), [key]);

  const store = useSyncExternalStore(subscribePresence, getPresenceSnapshot, getPresenceSnapshot);

  useEffect(() => {
    if (!idList.length) return;
    let cancelled = false;

    const pull = async () => {
      const remote = await fetchPresenceIds(idList);
      if (cancelled) return;
      if (Object.keys(remote).length) mergePresence(remote);
      // Recompute online flags from lastSeenAt so stale "online" flips off
      const now = Date.now();
      const refresh: PresenceMap = {};
      for (const id of idList) {
        const cur = presenceStore[id];
        if (!cur) continue;
        const last = cur.lastSeenAt;
        const online = !!(last && now - last < ONLINE_WINDOW_MS);
        if (cur.online !== online) {
          refresh[id] = { ...cur, online };
        }
      }
      if (Object.keys(refresh).length) mergePresence(refresh);
    };

    void pull();
    const iv = window.setInterval(() => void pull(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, [key]); // idList derived from key

  return useMemo(() => {
    const out: PresenceMap = {};
    for (const id of idList) {
      out[id] = store[id] ?? { online: false, lastSeenAt: null };
    }
    return out;
  }, [store, key]);
}

// ── DM typing ─────────────────────────────────────────────────────────────────
type TypingMap = Record<string, number>; // peerId -> expiresAt
let typingStore: TypingMap = {};
const typingListeners = new Set<() => void>();

function emitTyping() {
  typingListeners.forEach((l) => l());
}

function getTypingSnapshot(): TypingMap {
  return typingStore;
}

function subscribeTyping(listener: () => void) {
  typingListeners.add(listener);
  return () => {
    typingListeners.delete(listener);
  };
}

function setPeerTyping(peerId: string, active: boolean) {
  const next = { ...typingStore };
  if (active) next[peerId] = Date.now() + TYPING_TTL_MS;
  else delete next[peerId];
  typingStore = next;
  emitTyping();
}

/**
 * Publish that the current user is typing in a 1:1 thread with peerId.
 * Call on each keystroke (debounced inside).
 */
export function useTypingPublisher(peerId: string | null | undefined, myUserId: string | null | undefined) {
  const timer = useRef<number | null>(null);
  const lastSent = useRef(0);

  const signal = useCallback(() => {
    if (!peerId || !myUserId) return;
    const now = Date.now();
    // local broadcast for instant UI on same origin tabs
    try {
      localStorage.setItem(
        `stooorna_typing_${peerId}`,
        JSON.stringify({ fromId: myUserId, at: now }),
      );
      window.dispatchEvent(
        new CustomEvent('stooorna:typing', {
          detail: { peerId, fromId: myUserId, at: now },
        }),
      );
    } catch {
      /* ignore */
    }
    if (now - lastSent.current < 1200) return;
    lastSent.current = now;
    void fetch('/api/typing', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ peerId, userId: myUserId }),
    }).catch(() => {});
  }, [peerId, myUserId]);

  const onType = useCallback(() => {
    signal();
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      /* expire remote side via TTL */
    }, TYPING_TTL_MS);
  }, [signal]);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  return onType;
}

/**
 * Whether the peer is currently typing toward the current user.
 */
export function usePeerTyping(
  myUserId: string | null | undefined,
  peerId: string | null | undefined,
): boolean {
  const map = useSyncExternalStore(subscribeTyping, getTypingSnapshot, getTypingSnapshot);

  useEffect(() => {
    if (!myUserId || !peerId) return;

    const onStorage = (e: StorageEvent) => {
      if (e.key !== `stooorna_typing_${myUserId}` || !e.newValue) return;
      try {
        const p = JSON.parse(e.newValue) as { fromId?: string; at?: number };
        if (String(p.fromId) !== String(peerId)) return;
        if (p.at && Date.now() - Number(p.at) < TYPING_TTL_MS) {
          setPeerTyping(peerId, true);
        }
      } catch {
        /* ignore */
      }
    };
    const onEvt = (e: Event) => {
      const d = (e as CustomEvent).detail as {
        peerId?: string;
        fromId?: string;
        at?: number;
      };
      // peer is typing TO me when their event targets my id
      if (!d?.fromId || String(d.fromId) !== String(peerId)) return;
      if (d.peerId && String(d.peerId) !== String(myUserId)) return;
      setPeerTyping(peerId, true);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('stooorna:typing', onEvt as EventListener);

    const poll = window.setInterval(() => {
      try {
        const raw = localStorage.getItem(`stooorna_typing_${myUserId}`);
        if (raw) {
          const p = JSON.parse(raw) as { fromId?: string; at?: number };
          if (String(p.fromId) === String(peerId) && p.at && Date.now() - Number(p.at) < TYPING_TTL_MS) {
            setPeerTyping(peerId, true);
            return;
          }
        }
      } catch {
        /* ignore */
      }
      // expire
      const exp = typingStore[peerId];
      if (exp && Date.now() > exp) setPeerTyping(peerId, false);
    }, 800);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('stooorna:typing', onEvt as EventListener);
      window.clearInterval(poll);
    };
  }, [myUserId, peerId]);

  if (!peerId) return false;
  const exp = map[peerId];
  return !!(exp && Date.now() < exp);
}

export default {
  useHeartbeat,
  usePresenceQuery,
  formatLastSeen,
  useTypingPublisher,
  usePeerTyping,
};
