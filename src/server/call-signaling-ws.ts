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

/**
 * userId → كل الاتصالات المفتوحة لهذا المستخدم.
 * كانت Map<string, WebSocket> (اتصال واحد): أي اتصال ثانٍ لنفس المستخدم (تبويب آخر، النظام القديم في
 * RootLayout بجانب HomeCallHost، إعادة اتصال) كان يستبدل الأول، وإغلاق القديم كان يحذف الجديد من الجدول،
 * فيظهر المستخدم "غير متصل" ولا تصله رسالة hangup أبداً ويبقى الرنين.
 */
const clients = new Map<string, Set<WebSocket>>();

function addClient(userId: string, ws: WebSocket) {
  let set = clients.get(userId);
  if (!set) { set = new Set(); clients.set(userId, set); }
  set.add(ws);
}
function removeClient(userId: string, ws: WebSocket) {
  const set = clients.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) clients.delete(userId);
}
function liveSockets(userId: string): WebSocket[] {
  const set = clients.get(userId);
  if (!set) return [];
  return [...set].filter(ws => ws.readyState === WebSocket.OPEN);
}
/** يرسل لكل اتصالات المستخدم المفتوحة. يرجع عدد من وصلتهم الرسالة. */
function deliver(userId: string, msg: object): number {
  const targets = liveSockets(userId);
  for (const ws of targets) send(ws, msg);
  return targets.length;
}

/** Send a message to a specific connected user (used by other server modules) */
export function sendToUser(userId: string, msg: object): boolean {
  return deliver(userId, msg) > 0;
}

function send(ws: WebSocket, msg: object) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
    console.log('[call-signal] >>> SENT', msg);
  } else {
    console.log('[call-signal] >>> DROPPED (socket not OPEN, state=' + ws.readyState + ')', msg);
  }
}

/* ───────────── المكالمات المنتهية والرنات المعلّقة ───────────── */

const ENDED_TTL_MS = 3 * 60 * 1000;
/** channel → وقت الإنهاء (بساعة المتصل) + وقت التسجيل على الخادم */
const endedChannels = new Map<string, { at: number; local: number }>();

function markEnded(channel: string, at: number) {
  if (!channel) return;
  const prev = endedChannels.get(channel);
  if (!prev || at > prev.at) endedChannels.set(channel, { at, local: Date.now() });
  // تنظيف خفيف
  if (endedChannels.size > 500) {
    const now = Date.now();
    for (const [k, v] of endedChannels) if (now - v.local > ENDED_TTL_MS) endedChannels.delete(k);
  }
}
/** هل هذه الرنة أقدم من إنهاء سُجّل لنفس القناة؟ (رنة جديدة بعد الإنهاء بـ 800ms+ تمرّ) */
function isStaleCall(channel: string, at: number) {
  const row = endedChannels.get(channel);
  if (!row) return false;
  if (Date.now() - row.local > ENDED_TTL_MS) { endedChannels.delete(channel); return false; }
  return !at || at <= row.at + 800;
}

/** رنات لم تُسلَّم بعد لأن المستقبِل غير متصل: تُلغى فور وصول hangup من المتصل. */
const pendingCalls = new Map<string, { timer: ReturnType<typeof setInterval>; at: number }>();
const pendingKey = (to: string, channel: string) => `${to}|${channel}`;

function cancelPendingCall(to: string, channel: string, hangupAt: number) {
  const k = pendingKey(to, channel);
  const p = pendingCalls.get(k);
  if (!p) return;
  // رنة أحدث من الإنهاء = اتصال جديد (إعادة اتصال سريعة): لا تلغها.
  if (p.at > hangupAt) return;
  clearInterval(p.timer);
  pendingCalls.delete(k);
  console.log(`[call-signal] cancelled pending call to=${to} channel=${channel} (caller hung up)`);
}

/** إعادة محاولة تسليم hangup/answered… بدون تكرار الحلقات لنفس الرسالة */
const retryingSignals = new Map<string, ReturnType<typeof setInterval>>();

export function attachCallSignalingWS(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws/call-signal' });

  console.log('[call-signal] WS server attached at /ws/call-signal');

  // نبض: على الجوال ينقطع الاتصال أحياناً دون إغلاق نظيف، فيبقى socket "ميتاً" مسجلاً ونعتبر الرسالة مُسلَّمة.
  const beat = setInterval(() => {
    wss.clients.forEach((client) => {
      const c = client as WebSocket & { isAlive?: boolean };
      if (c.isAlive === false) { try { c.terminate(); } catch { /* */ } return; }
      c.isAlive = false;
      try { c.ping(); } catch { /* */ }
    });
  }, 15000);
  wss.on('close', () => clearInterval(beat));

  wss.on('connection', (ws) => {
    let myUserId = '';
    (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
    ws.on('pong', () => { (ws as WebSocket & { isAlive?: boolean }).isAlive = true; });
    console.log('[call-signal] new raw connection opened');

    ws.on('message', async (data) => {
      (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(data.toString()); } catch (e) {
        console.log('[call-signal] !!! failed to parse message:', data.toString());
        return;
      }

      const { type } = msg as { type: string };
      console.log('[call-signal] <<< RECEIVED', msg);

      /* ── تسجيل المستخدم ── */
      if (type === 'register') {
        const uid = (msg.userId as string) ?? '';
        if (uid) {
          if (myUserId && myUserId !== uid) removeClient(myUserId, ws);
          myUserId = uid;
          addClient(myUserId, ws);
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
            if (!deliver(m.userId, msg)) {
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
            if (!deliver(m.userId, msg)) {
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

      const channel = String(msg.channel || '');
      console.log(`[call-signal] Looking up target "to"=${to}. Currently connected:`, Array.from(clients.keys()));

      if (type === 'call') {
        const callAt = Number(msg.at) || Date.now();
        console.log(`[call-signal] CALL from=${msg.from} to=${to} channel=${channel}`);

        // رنة متأخرة وصلت بعد أن أنهى المتصل المكالمة (مثلاً sendSignal المعلّقة عند المتصل): لا ترنّ ولا push.
        if (channel && isStaleCall(channel, callAt)) {
          console.log(`[call-signal] dropped STALE call to=${to} channel=${channel} (already ended)`);
          return;
        }

        // رنة جديدة تستبدل أي رنة معلّقة قديمة لنفس القناة
        const k = pendingKey(to, channel);
        const old = pendingCalls.get(k);
        if (old) { clearInterval(old.timer); pendingCalls.delete(k); }

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

        // انتهت المكالمة أثناء انتظار الـ push؟
        if (channel && isStaleCall(channel, callAt)) {
          console.log(`[call-signal] call to=${to} channel=${channel} ended while sending push — not delivering`);
          return;
        }

        if (deliver(to, msg) > 0) {
          console.log(`[call-signal] callee ${to} is ONLINE — delivered call signal immediately`);
        } else {
          console.log(`[call-signal] callee ${to} is NOT connected via WS right now — will retry for 10s`);
          let waited = 0;
          const timer = setInterval(() => {
            waited += 500;
            // أُلغيت أو استُبدلت؟
            const cur = pendingCalls.get(k);
            if (!cur || cur.timer !== timer) { clearInterval(timer); return; }
            if (channel && isStaleCall(channel, callAt)) {
              clearInterval(timer);
              pendingCalls.delete(k);
              return;
            }
            if (deliver(to, msg) > 0) {
              clearInterval(timer);
              pendingCalls.delete(k);
              console.log(`[call-signal] callee ${to} came online after ${waited}ms — delivered now`);
            } else if (waited >= 10000) {
              clearInterval(timer);
              pendingCalls.delete(k);
              console.log(`[call-signal] gave up after 10s waiting for callee ${to} to connect. Did NOT send busy.`);
              // Do NOT send busy — caller stays in channel waiting for callee to join via push
            }
          }, 500);
          pendingCalls.set(k, { timer, at: callAt });
        }
        return;
      }

      const isEndSignal = type === 'hangup' || type === 'call-end' || type === 'ended';
      if (isEndSignal && channel) {
        const endAt = Number(msg.at) || Date.now();
        // سجّل الإنهاء وألغِ أي رنة معلّقة لم تصل بعد (المستقبِل كان غير متصل لحظة الاتصال).
        markEnded(channel, endAt);
        cancelPendingCall(to, channel, endAt);
      }

      if (deliver(to, msg) > 0) return;
      // hangup / end / answered must reach the other phone even if the socket blipped
      const retryable = isEndSignal || type === 'answered' || type === 'call-answered';
      if (!retryable) {
        console.log(`[call-signal] target for type=${type} to=${to} not available — dropping message silently`);
        return;
      }
      const rk = `${type}|${to}|${channel}`;
      if (retryingSignals.has(rk)) return; // حلقة قائمة لنفس الرسالة
      console.log(`[call-signal] ${type} to=${to} not connected — retrying for 20s`);
      let waited = 0;
      const retry = setInterval(() => {
        waited += 500;
        if (deliver(to, msg) > 0 || waited >= 20000) {
          clearInterval(retry);
          retryingSignals.delete(rk);
        }
      }, 500);
      retryingSignals.set(rk, retry);
      return;
    });

    ws.on('close', () => {
      console.log(`[call-signal] connection closed for userId=${myUserId || '(never registered)'}`);
      // احذف هذا الاتصال فقط — لا اتصالاً أحدث لنفس المستخدم.
      if (myUserId) removeClient(myUserId, ws);
    });
    ws.on('error', (err) => {
      console.log(`[call-signal] connection error for userId=${myUserId || '(never registered)'}`, err);
      if (myUserId) removeClient(myUserId, ws);
    });
  });
}
