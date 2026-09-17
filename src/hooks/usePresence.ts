/**
 * usePresence — heartbeat + query online status for a list of user IDs
 */
import { useState, useEffect, useCallback } from 'react';

export interface PresenceInfo {
  userId: string;
  online: boolean;
  lastSeenAt: string | null;
}

/** Send heartbeat every 20s while mounted */
export function useHeartbeat(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const beat = () => fetch('/api/presence/heartbeat', { method: 'POST' }).catch(() => {});
    beat();
    const id = setInterval(beat, 20_000);
    return () => clearInterval(id);
  }, [active]);
}

/** Poll presence for a list of user IDs every 10s */
export function usePresenceQuery(userIds: string[]) {
  const [presence, setPresence] = useState<Record<string, PresenceInfo>>({});
  const idsKey = userIds.join(',');

  const fetch_ = useCallback(async () => {
    if (!userIds.length) return;
    try {
      const r = await fetch(`/api/presence?userIds=${encodeURIComponent(idsKey)}`);
      if (!r.ok) return;
      const data: PresenceInfo[] = await r.json();
      const map: Record<string, PresenceInfo> = {};
      for (const p of data) map[p.userId] = p;
      setPresence(map);
    } catch { /* silent */ }
  }, [idsKey]);

  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, 5_000);
    return () => clearInterval(id);
  }, [fetch_]);

  return presence;
}

/** Format "last seen X ago" */
export function formatLastSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt) return 'a while ago';
  const diff = Date.now() - new Date(lastSeenAt).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 7)  return `${days}d ago`;
  return new Date(lastSeenAt).toLocaleDateString('en', { day: 'numeric', month: 'short' });
}
