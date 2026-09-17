/**
 * ══════════════════════════════════════════════════════════════════
 *  AGORA CONFIGURATION — Test Mode (token: null)
 * ══════════════════════════════════════════════════════════════════
 *
 *  App ID: 149ef04e839c4132a08efb49d717c436
 *  Token:  null  →  Testing Mode (App Certificate disabled)
 *
 *  ⚠️  Production Mode يسبب Error 110 — لا تفعّل App Certificate
 *      إلا إذا أضفت token server يولّد tokens حقيقية.
 *
 * ──────────────────────────────────────────────────────────────────
 *  المناطق المخصصة لهذا الـ App ID:
 *
 *  1. الغرف الـ8 (Public Voice Rooms)
 *     الملف الحالي:  src/pages/room.tsx
 *     النظام الحالي: WebSocket /ws/room-live + MediaRecorder
 *     عند التحويل:   channel = roomId (e.g. "ch1" … "ch8")
 *
 *  2. Secret Room
 *     الملف الحالي:  src/components/RecorderScreen.tsx
 *     النظام الحالي: WebSocket /ws/room-live?room=secret-live
 *     عند التحويل:   channel = "secret-live"
 *
 *  3. Live Audio & Video Broadcasting
 *     الملف الحالي:  src/pages/live.tsx
 *     النظام الحالي: WebRTC (RTCPeerConnection) + WebSocket /ws/rtc
 *     عند التحويل:   channel = "live-" + hostId
 * ──────────────────────────────────────────────────────────────────
 */

export const AGORA_APP_ID = '149ef04e839c4132a08efb49d717c436';

/**
 * Token = null → Testing Mode
 * لا تغيّر هذه القيمة إلا إذا أضفت token server حقيقي
 */
export const AGORA_TOKEN: null = null;

/**
 * Channel names لكل منطقة
 * استخدم هذه الدوال عند بناء تكامل Agora مستقبلاً
 */
export function getRoomChannel(roomId: string): string {
  // e.g. "ch1", "ch2", ... "ch8"
  return roomId;
}

export function getSecretRoomChannel(): string {
  return 'secret-live';
}

export function getLiveChannel(hostId: string): string {
  return `live-${hostId}`;
}

/**
 * Agora client config — جاهز للاستخدام
 * يُستخدم مع: import('agora-rtc-sdk-ng') (dynamic import فقط — لا static)
 *
 * مثال الاستخدام:
 *   const AgoraRTC = await import('agora-rtc-sdk-ng');
 *   AgoraRTC.default.setLogLevel(3);
 *   const client = AgoraRTC.default.createClient(AGORA_CLIENT_CONFIG as any);
 *   await client.join(AGORA_APP_ID, channel, AGORA_TOKEN, uid);
 */
export const AGORA_CLIENT_CONFIG = {
  mode: 'rtc',       // للغرف والـ Secret Room
  codec: 'vp8',
  areaCode: 'GLOBAL', // موجود في runtime لكن ليس في TypeScript types — استخدم (as any)
} as const;

export const AGORA_LIVE_CLIENT_CONFIG = {
  mode: 'live',      // للـ Live Broadcasting
  codec: 'vp8',
  areaCode: 'GLOBAL',
} as const;
