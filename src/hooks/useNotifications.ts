/**
 * useNotifications — manages browser Notification permission and
 * provides helpers to fire notifications for:
 *   - Incoming calls
 *   - New private messages
 *   - New group messages
 *   - Whisper alerts
 *
 * Each notification also plays a matching in-app chime via Web Audio API.
 * Call `requestPermission()` once on app load (after a user gesture).
 * Then call the specific notify* functions wherever needed.
 */

import { playNotificationSound } from '@/lib/notificationSound';

export type NotifType = 'call' | 'message' | 'group' | 'whisper';

// ── Request permission ────────────────────────────────────────────────────────
export async function requestNotifPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission().catch(() => 'denied' as NotificationPermission);
  return result === 'granted';
}

export function notifPermission(): NotificationPermission {
  if (!('Notification' in window)) return 'denied';
  return Notification.permission;
}

// ── Fire a notification + play sound ─────────────────────────────────────────
function fire(
  title: string,
  body: string,
  tag: string,
  soundType: 'message' | 'request' | 'call' | 'whisper' = 'message',
  icon?: string,
) {
  // Always play the in-app sound (works even when tab is in foreground)
  playNotificationSound(soundType);

  // OS notification (only when permission granted)
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, {
      body,
      tag,
      icon: icon ?? '/favicon.ico',
      badge: '/favicon.ico',
      silent: true, // we handle sound ourselves
    });
    // Auto-close after 6s
    setTimeout(() => n.close(), 6000);
    // Focus window on click
    n.onclick = () => { window.focus(); n.close(); };
  } catch { /* Safari may throw */ }
}

// ── Specific notification helpers ─────────────────────────────────────────────

/** Incoming call notification */
export function notifyIncomingCall(callerName: string) {
  fire(
    '📞 Incoming call',
    `${callerName} is calling you — tap to open Stooorna`,
    'incoming-call',
    'call',
  );
}

/** New private message */
export function notifyPrivateMessage(senderName: string, preview: string) {
  fire(
    `💬 ${senderName}`,
    preview.length > 80 ? preview.slice(0, 80) + '…' : preview,
    `msg-${senderName}`,
    'message',
  );
}

/** New group message */
export function notifyGroupMessage(groupName: string, senderName: string, preview: string) {
  fire(
    `👥 ${groupName}`,
    `${senderName}: ${preview.length > 60 ? preview.slice(0, 60) + '…' : preview}`,
    `group-${groupName}`,
    'message',
  );
}

/** Whisper alert — someone wants to whisper to you */
export function notifyWhisperAlert(fromName: string) {
  fire(
    '🔔 Whisper request',
    `${fromName} wants to whisper to you — open Stooorna and hold the circle`,
    'whisper-alert',
    'whisper',
  );
}

/** Friend request received */
export function notifyFriendRequest(fromName: string) {
  fire(
    `👤 Friend request`,
    `${fromName} sent you a friend request`,
    `friend-req-${fromName}`,
    'request',
  );
}
