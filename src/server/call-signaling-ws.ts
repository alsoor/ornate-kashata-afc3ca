/**
 * /ws/call-signal — signaling for VoIP calls + live voice broadcast
 * DEBUG VERSION — with console.log tracing at every critical point
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { db } from './db/client.js';
import { groupMembers, secretChatMembers } from './db/schema.js';
import { eq } from 'drizzle-orm';
import { sendPushToUser } from './push-helper.js';

// userId → WebSocket
const clients = new Map<string, WebSocket>();

/** Send a message to a specific connected user (used by other server modules) */
export function sendToUser(userId: string, msg: object): boolean {
  const ws = clients.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
    return true;
  }
  return false;
}

function send(ws: WebSocket, msg: object) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
    console.log('[call-signal] >>> SENT', msg);
  } else {
    console.log('[call-signal] >>> DROPPED (socket not OPEN, state=' + ws.readyState + ')', msg);
  }
}

export function attachCallSignalingWS(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws/call-signal' });

  console.log('[call-signal] WS server attached at /ws/call-signal');

  wss.on('connection', (ws) => {
    let myUserId = '';
    console.log('[call-signal] new raw connection opened');

    ws.on('message', async (data) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(data.toString()); } catch (e) {
        console.log('[call-signal] !!! failed to parse message:', data.toString());
        return;
      }

      const { type } = msg as { type: string };
      console.log('[call-signal] <<< RECEIVED', msg);

      /* ── تسجيل المستخدم ── */
      if (type === 'register') {
        myUserId = (msg.userId as string) ?? '';
        if (myUserId) {
          clients.set(myUserId, ws);
          console.log(`[call-signal] REGISTERED userId=${myUserId}. Currently connected:`, Array.from(clients.keys()));
        } else {
          console.log('[call-signal] !!! register message had no userId', msg);
        }
        return;
      }

      /* ── إشارات البث الصوتي للقروب ── */
      if ((type === 'voice_start' || type === 'voice_end' || type === 'voice_interaction') && msg.groupId) {
        try {
          const members = await db
            .select({ userId: groupMembers.userId })
            .from(groupMembers)
            .where(eq(groupMembers.groupId, Number(msg.groupId)));

          console.log(`[call-signal] group voice broadcast groupId=${msg.groupId}, members=`, members.map(m => m.userId));

          for (const m of members) {
            if (m.userId === (msg.from as string)) continue; // لا ترسل لنفسك
            const target = clients.get(m.userId);
            if (target) {
              send(target, msg);
            } else {
              console.log(`[call-signal] group voice: member ${m.userId} not connected, skipping`);
            }
          }
        } catch (e) {
          console.error('[call-signaling] group voice broadcast error', e);
        }
        return;
      }

      /* ── إشارات البث الصوتي للـ Secret Chat ── */
      if ((type === 'voice_start' || type === 'voice_end' || type === 'voice_interaction') && msg.chatId) {
        try {
          const members = await db
            .select({ userId: secretChatMembers.userId })
            .from(secretChatMembers)
            .where(eq(secretChatMembers.chatId, Number(msg.chatId)));

          console.log(`[call-signal] secret chat voice broadcast chatId=${msg.chatId}, members=`, members.map(m => m.userId));

          for (const m of members) {
            if (m.userId === (msg.from as string)) continue; // لا ترسل لنفسك
            const target = clients.get(m.userId);
            if (target) {
              send(target, msg);
            } else {
              console.log(`[call-signal] secret chat voice: member ${m.userId} not connected, skipping`);
            }
          }
        } catch (e) {
          console.error('[call-signaling] secret chat voice broadcast error', e);
        }
        return;
      }

      /* ── إشارات البث الصوتي للـ DM + باقي الإشارات ── */
      const to = msg.to as string;
      if (!to) {
        console.log('[call-signal] !!! message has no "to" field and did not match group/secret-chat/register branches. Ignoring.', msg);
        return;
      }

      console.log(`[call-signal] Looking up target "to"=${to}. Currently connected:`, Array.from(clients.keys()));
      const target = clients.get(to);
      console.log(`[call-signal] target socket found? ${!!target}, readyState=${target?.readyState}`);

      if (type === 'call') {
        console.log(`[call-signal] CALL from=${msg.from} to=${to} channel=${msg.channel}`);

        // Always send push notification so callee can join even if not on the app
        try {
          const fromName = (msg.fromName as string) ?? 'Someone';
          await sendPushToUser(to, 'call', {
            title: `📞 Incoming voice call`,
            body:  `${fromName} is calling you`,
            icon:  (msg.fromAvatar as string) ?? '/favicon.ico',
            url:   `/dm?with=${encodeURIComponent(msg.from as string)}`,
            tag:   `call-${msg.from as string}`,
            data: {
              fromId:     msg.from,
              fromName,
              fromAvatar: msg.fromAvatar,
            channel:    msg.channel,
            isGroup:    'true',
            callType:   msg.callType === 'video' ? 'video' : 'voice',
            }
          });
          console.log(`[call-signal] push notification sent (or attempted) to=${to}`);
        } catch (e) {
          console.log('[call-signal] !!! push notification failed', e);
        }

        if (target && target.readyState === WebSocket.OPEN) {
          // Callee is online — deliver immediately
          console.log(`[call-signal] callee ${to} is ONLINE — delivering call signal immediately`);
          send(target, msg);
        } else {
          console.log(`[call-signal] callee ${to} is NOT connected via WS right now — will retry for 10s`);
          // Callee not connected via WS right now — retry for 10s
          let waited = 0;
          const retry = setInterval(() => {
            waited += 500;
            const t = clients.get(to);
            if (t && t.readyState === WebSocket.OPEN) {
              clearInterval(retry);
              console.log(`[call-signal] callee ${to} came online after ${waited}ms — delivering now`);
              send(t, msg);
            } else if (waited >= 10000) {
              clearInterval(retry);
              console.log(`[call-signal] gave up after 10s waiting for callee ${to} to connect. Did NOT send busy.`);
              // Do NOT send busy — caller stays in channel waiting for callee to join via push
            }
          }, 500);
        }
        return;
      }

      if (!target || target.readyState !== WebSocket.OPEN) {
        console.log(`[call-signal] target for type=${type} to=${to} not available — dropping message silently`);
        return;
      }

      send(target, msg);
    });

    ws.on('close', () => {
      console.log(`[call-signal] connection closed for userId=${myUserId || '(never registered)'}`);
      if (myUserId) clients.delete(myUserId);
    });
    ws.on('error', (err) => {
      console.log(`[call-signal] connection error for userId=${myUserId || '(never registered)'}`, err);
      if (myUserId) clients.delete(myUserId);
    });
  });
}