/**
 * useNotificationCounts — polls all badge counts every 3s
 *
 * Returns:
 *   dmUnread     — total unread SC messages (for Friends/Chat button)
 *   dmBySender   — unread count per PEER USER ID (for per-friend badge in friends list)
 *   groupUnread  — total unread group messages (for Groups button)
 *   groupByGroup — unread count per group id (for per-group badge)
 *   friendReqs   — pending incoming friend requests (for Add button)
 */
import { useState, useEffect, useRef } from 'react';
import { requestNotifPermission, notifyPrivateMessage, notifyFriendRequest, notifyGroupMessage } from './useNotifications';

export interface NotificationCounts {
  dmUnread:    number;
  dmBySender:  Record<string, number>; // peerId → unread count
  groupUnread: number;
  groupByGroup: Record<number, number>;
  friendReqs:  number;
}

let oldMsgsCleared = false; // clear once per session

export function useNotificationCounts(enabled: boolean): NotificationCounts {
  const [counts, setCounts] = useState<NotificationCounts>({
    dmUnread: 0, dmBySender: {}, groupUnread: 0, groupByGroup: {}, friendReqs: 0,
  });
  const prevDmRef  = useRef(-1);
  const prevReqRef = useRef(-1);
  const prevGrpRef = useRef<Record<number, number>>({});

  useEffect(() => {
    if (!enabled) return;
    requestNotifPermission();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    // Clear stale old-messages unread badges once per session
    if (!oldMsgsCleared) {
      oldMsgsCleared = true;
      fetch('/api/messages/mark-all-read', { method: 'POST', credentials: 'include' }).catch(() => {});
    }

    const load = async () => {
      try {
        const [scRes, groupRes, reqRes] = await Promise.all([
          fetch('/api/secret-chat/unread',      { credentials: 'include' }),
          fetch('/api/groups/unread',           { credentials: 'include' }),
          fetch('/api/friends/requests/count',  { credentials: 'include' }),
        ]);

        const sc    = scRes.ok    ? await scRes.json()    : { total: 0, byChatId: {}, peerByChat: {} };
        const group = groupRes.ok ? await groupRes.json() : { total: 0, byGroup: {} };
        const req   = reqRes.ok   ? await reqRes.json()   : { count: 0 };

        const scTotal    = Number(sc.total ?? 0);
        const byChatId   = (sc.byChatId  ?? {}) as Record<string, number>;
        const peerByChat = (sc.peerByChat ?? {}) as Record<string, string>;

        // Build dmBySender keyed by PEER USER ID (so friends list can show per-friend badge)
        const dmBySender: Record<string, number> = {};
        for (const [chatIdStr, count] of Object.entries(byChatId)) {
          const peerId = peerByChat[chatIdStr];
          if (peerId) {
            dmBySender[peerId] = (dmBySender[peerId] ?? 0) + Number(count);
          } else {
            // Group SC — key by chatId prefixed so it doesn't collide with user ids
            dmBySender[`chat_${chatIdStr}`] = Number(count);
          }
        }

        // Fire OS notification for new SC messages
        if (prevDmRef.current !== -1 && scTotal > prevDmRef.current) {
          const diff = scTotal - prevDmRef.current;
          notifyPrivateMessage('New message', `${diff} new message${diff > 1 ? 's' : ''}`);
        }
        prevDmRef.current = scTotal;

        // Fire notification for new friend requests
        const reqCount = Number(req.count ?? 0);
        if (prevReqRef.current !== -1 && reqCount > prevReqRef.current) {
          notifyFriendRequest('Someone');
        }
        prevReqRef.current = reqCount;

        // Fire notification for new group messages
        const newByGroup = (group.byGroup ?? {}) as Record<string, number>;
        if (Object.keys(prevGrpRef.current).length > 0) {
          for (const [gidStr, count] of Object.entries(newByGroup)) {
            const gid = Number(gidStr);
            const prev = prevGrpRef.current[gid] ?? 0;
            if (count > prev) {
              notifyGroupMessage('Group', '', `${count - prev} new message${count - prev > 1 ? 's' : ''}`);
            }
          }
        }
        prevGrpRef.current = Object.fromEntries(
          Object.entries(newByGroup).map(([k, v]) => [Number(k), Number(v)])
        );

        setCounts({
          dmUnread:     scTotal,
          dmBySender,
          groupUnread:  Number(group.total ?? 0),
          groupByGroup: Object.fromEntries(
            Object.entries(newByGroup).map(([k, v]) => [Number(k), Number(v)])
          ),
          friendReqs:   reqCount,
        });
      } catch { /* silent */ }
    };

    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [enabled]);

  return counts;
}
