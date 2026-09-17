/**
 * Live Chat WebSocket — /ws/live-chat
 *
 * Relays chat messages between host and viewers in a live session.
 *
 * Client → Server:
 *   { type: 'join',    roomId: string, userId: string, name: string, avatarUrl?: string }
 *   { type: 'message', roomId: string, userId: string, name: string, avatarUrl?: string, text: string }
 *   { type: 'leave',   roomId: string, userId: string }
 *   { type: 'mic-request', roomId: string }
 *   { type: 'mic-request-cancel', roomId: string }
 *   { type: 'mic-request-accept', roomId: string, userId: string }
 *   { type: 'mic-request-reject', roomId: string, userId: string }
 *
 * Server → Client:
 *   { type: 'message', userId: string, name: string, avatarUrl?: string, text: string, ts: number }
 *   { type: 'viewer-count', count: number }
 *   { type: 'mic-request-list', requests: MicRequest[] }
 *   { type: 'mic-request-accepted' | 'mic-request-rejected', userId: string }
 */
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';

interface ChatClient {
  ws: WebSocket;
  userId: string;
  roomId: string;
  name: string;
  avatarUrl?: string;
  isHost: boolean;
  onMic: boolean;
}

interface MicRequest {
  uid: string;
  name: string;
  avatar: string | null;
}

// roomId → Map<userId, ChatClient>
const rooms = new Map<string, Map<string, ChatClient>>();
const micRequests = new Map<string, Map<string, MicRequest>>();

function getRoom(roomId: string): Map<string, ChatClient> {
  let r = rooms.get(roomId);
  if (!r) { r = new Map(); rooms.set(roomId, r); }
  return r;
}

function broadcast(roomId: string, data: object, excludeId?: string): void {
  const room = rooms.get(roomId);
  if (!room) return;
  const msg = JSON.stringify(data);
  for (const c of room.values()) {
    if (c.userId !== excludeId && c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(msg);
    }
  }
}

function sendToClient(client: ChatClient, data: object): void {
  if (client.ws.readyState === WebSocket.OPEN) client.ws.send(JSON.stringify(data));
}

function broadcastViewerCount(roomId: string): void {
  const room = rooms.get(roomId);
  const count = room ? room.size : 0;
  broadcast(roomId, { type: 'viewer-count', count });
}

function broadcastParticipants(roomId: string): void {
  const participants = Array.from(rooms.get(roomId)?.values() ?? []).map((client) => ({
    uid: client.userId,
    name: client.name,
    avatar: client.avatarUrl ?? null,
    isHost: client.isHost,
    onMic: client.onMic,
  }));
  broadcast(roomId, { type: 'participant-list', participants });
}

function broadcastMicRequests(roomId: string): void {
  const requests = Array.from(micRequests.get(roomId)?.values() ?? []);
  broadcast(roomId, { type: 'mic-request-list', requests });
}

function removeClient(client: ChatClient): void {
  const room = rooms.get(client.roomId);
  if (!room) return;
  room.delete(client.userId);
  const requests = micRequests.get(client.roomId);
  requests?.delete(client.userId);
  if (requests?.size === 0) micRequests.delete(client.roomId);
  if (room.size === 0) rooms.delete(client.roomId);
  broadcastViewerCount(client.roomId);
  broadcastParticipants(client.roomId);
  broadcastMicRequests(client.roomId);
}

export function attachLiveChatWS(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws/live-chat' });

  wss.on('connection', (ws) => {
    let client: ChatClient | null = null;

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      const { type, roomId, userId, name, avatarUrl, text } = msg as Record<string, string>;

      switch (type) {
        case 'join': {
          if (!roomId || !userId || !name) return;
          const room = getRoom(roomId);
          const isHost = msg.isHost === true || msg.isHost === 'true';
          client = { ws, userId, roomId, name, avatarUrl, isHost, onMic: isHost };
          room.set(userId, client);
          broadcastViewerCount(roomId);
          broadcastParticipants(roomId);
          broadcastMicRequests(roomId);
          // A newly joined host must receive the current queue even if the
          // request was created before the host's socket finished connecting.
          sendToClient(client, { type: 'participant-list', participants: Array.from(room.values()).map((participant) => ({
            uid: participant.userId,
            name: participant.name,
            avatar: participant.avatarUrl ?? null,
            isHost: participant.isHost,
            onMic: participant.onMic,
          })) });
          sendToClient(client, { type: 'mic-request-list', requests: Array.from(micRequests.get(roomId)?.values() ?? []) });
          break;
        }

        case 'message': {
          if (!client || !text?.trim()) return;
          const payload = {
            type: 'message',
            userId: client.userId,
            name: client.name,
            avatarUrl: client.avatarUrl,
            text: text.trim().slice(0, 300),
            ts: Date.now(),
          };
          // Send to everyone in the room including sender
          const room = rooms.get(client.roomId);
          if (!room) return;
          const msgStr = JSON.stringify(payload);
          for (const c of room.values()) {
            if (c.ws.readyState === WebSocket.OPEN) c.ws.send(msgStr);
          }
          break;
        }

        case 'mic-request': {
          // Only listeners can request the microphone. Hosts are already on stage.
          if (!client || client.isHost || client.onMic) return;
          const requests = micRequests.get(client.roomId) ?? new Map<string, MicRequest>();
          requests.set(client.userId, { uid: client.userId, name: client.name, avatar: client.avatarUrl ?? null });
          micRequests.set(client.roomId, requests);
          broadcastMicRequests(client.roomId);
          break;
        }

        case 'mic-request-cancel': {
          if (!client) return;
          const requests = micRequests.get(client.roomId);
          requests?.delete(client.userId);
          if (requests?.size === 0) micRequests.delete(client.roomId);
          broadcastMicRequests(client.roomId);
          break;
        }

        case 'mic-request-accept': {
          if (!client || !client.isHost || !userId) return;
          const target = rooms.get(client.roomId)?.get(userId);
          if (target) target.onMic = true;
          const requests = micRequests.get(client.roomId);
          requests?.delete(userId);
          if (requests?.size === 0) micRequests.delete(client.roomId);
          broadcast(client.roomId, { type: 'mic-request-accepted', userId });
          broadcastParticipants(client.roomId);
          broadcastMicRequests(client.roomId);
          break;
        }

        case 'mic-request-reject': {
          if (!client || !client.isHost || !userId) return;
          const requests = micRequests.get(client.roomId);
          requests?.delete(userId);
          if (requests?.size === 0) micRequests.delete(client.roomId);
          broadcast(client.roomId, { type: 'mic-request-rejected', userId });
          broadcastMicRequests(client.roomId);
          break;
        }

        case 'like': {
          if (!client) return;
          broadcast(client.roomId, { type: 'like', userId: client.userId, ts: Date.now() });
          break;
        }

        case 'leave': {
          if (client) { removeClient(client); client = null; }
          break;
        }
      }
    });

    ws.on('close', () => { if (client) removeClient(client); });
    ws.on('error', () => { if (client) removeClient(client); });
  });

  console.log('[live-chat-ws] Live chat attached at /ws/live-chat');
}
