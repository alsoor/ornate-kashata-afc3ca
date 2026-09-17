/**
 * /ws/room-live — True live audio streaming for voice rooms
 *
 * Protocol:
 *   Client → Server (JSON):
 *     { type: 'join',  userId, name, mime }   — join room, declare MIME
 *     { type: 'start', userId }               — about to start speaking
 *     { type: 'stop',  userId }               — stopped speaking
 *     { type: 'voice_note', userId, name, mime, duration, id }  — about to send a full voice note blob
 *
 *   Client → Server (binary):
 *     raw audio chunk (MediaRecorder timeslice, ~250 ms)
 *     OR full voice note blob (sent right after voice_note JSON)
 *
 *   Server → Client (JSON):
 *     { type: 'joined' }                      — ack
 *     { type: 'speaking', userId, name }      — someone started speaking
 *     { type: 'silent',   userId }            — someone stopped speaking
 *     { type: 'peer_joined', userId, name }   — new member joined
 *     { type: 'peer_left',   userId }         — member left
 *     { type: 'voice_note', userId, name, mime, duration, id }  — incoming voice note (blob follows)
 *
 *   Server → Client (binary):
 *     [4 B LE: mime-len][mime UTF-8][4 B LE: userId-len][userId UTF-8][audio chunk]
 *     — only sent to peers (not the sender) for live chunks
 *     OR raw blob forwarded to all peers after voice_note JSON
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { db } from './db/client.js';
import { user as userTable } from './db/schema.js';
import { eq } from 'drizzle-orm';

// Floor release helper — calls the room floor API to release a stuck floor
async function releaseFloor(roomId: string, userId: string): Promise<void> {
  try {
    await fetch(`http://localhost:${process.env.PORT ?? 3000}/api/room/floor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, action: 'forceRelease', userId }),
    });
  } catch { /* best-effort */ }
}

/**
 * Usernames allowed in the secret-live room.
 * Owner (Q8) + the four permitted users.
 */
const SECRET_ROOM_WHITELIST = new Set(['Q8', 'bye', 'Ahmed', 'Nada', 'Ghost']);

interface LiveClient {
  ws:       WebSocket;
  userId:   string;
  name:     string;
  username: string;
  mime:     string;
  speaking: boolean;
}

// roomId → Map<userId, LiveClient>
const liveRooms = new Map<string, Map<string, LiveClient>>();

function getRoom(roomId: string): Map<string, LiveClient> {
  let r = liveRooms.get(roomId);
  if (!r) { r = new Map(); liveRooms.set(roomId, r); }
  return r;
}

/**
 * Binary frame sent to listeners:
 *   [4 B LE: mime-len][mime][4 B LE: userId-len][userId][audio]
 */
function buildChunkFrame(mime: string, userId: string, audio: Buffer): Buffer {
  const mimeB   = Buffer.from(mime,   'utf8');
  const userB   = Buffer.from(userId, 'utf8');
  const hdr     = Buffer.allocUnsafe(8);
  hdr.writeUInt32LE(mimeB.length,   0);
  hdr.writeUInt32LE(userB.length,   4);
  return Buffer.concat([hdr, mimeB, userB, audio]);
}

function broadcast(room: Map<string, LiveClient>, senderId: string, payload: Buffer | string): void {
  const isBuf = Buffer.isBuffer(payload);
  for (const [uid, peer] of room) {
    if (uid === senderId) continue;
    if (peer.ws.readyState !== WebSocket.OPEN) continue;
    if (isBuf) peer.ws.send(payload);
    else       peer.ws.send(payload);
  }
}

/** Send to ALL members including sender */
function broadcastAll(room: Map<string, LiveClient>, payload: string): void {
  for (const [, peer] of room) {
    if (peer.ws.readyState !== WebSocket.OPEN) continue;
    peer.ws.send(payload);
  }
}

/**
 * Returns all users currently connected to the secret room.
 * Called by GET /api/secret-room/members.
 */
export function getSecretRoomMembers(): { userId: string; name: string; username: string }[] {
  const room = liveRooms.get('secret-live');
  if (!room) return [];
  const out: { userId: string; name: string; username: string }[] = [];
  for (const [, client] of room) {
    out.push({ userId: client.userId, name: client.name, username: client.username });
  }
  return out;
}

/**
 * Returns the list of users currently speaking live in the secret room.
 * Called by GET /api/secret-room/live-status for the global LIVE banner.
 */
export function getSecretRoomLiveSpeakers(): { userId: string; name: string }[] {
  const room = liveRooms.get('secret-live');
  if (!room) return [];
  const out: { userId: string; name: string }[] = [];
  for (const [, client] of room) {
    if (client.speaking) out.push({ userId: client.userId, name: client.name });
  }
  return out;
}

export function attachRoomLiveWS(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws/room-live' });

  wss.on('connection', (ws, req) => {
    const url    = new URL(req.url ?? '/', 'http://localhost');
    const roomId = url.searchParams.get('room')   ?? '';
    const userId = url.searchParams.get('userId') ?? '';

    if (!roomId || !userId) {
      ws.close(1008, 'room and userId required');
      return;
    }

    let client: LiveClient | null = null;
    let joined = false;

    ws.on('message', async (data, isBinary) => {
      // ── Binary: audio chunk OR full voice note blob ────────────────────────
      if (isBinary) {
        if (!joined || !client) return;
        const room  = getRoom(roomId);
        const frame = buildChunkFrame(client.mime, client.userId, data as Buffer);
        broadcast(room, userId, frame);
        return;
      }

      // ── JSON control messages ──────────────────────────────────────────────
      let msg: { type: string; userId?: string; name?: string; mime?: string; duration?: number; id?: string; audio?: string; levels?: number[] };
      try { msg = JSON.parse(data.toString()); }
      catch { return; }

      if (!joined && msg.type === 'join') {
        let resolvedUsername = '';
        // ── Whitelist check for secret-live room ──────────────────────────────
        if (roomId === 'secret-live') {
          try {
            const rows = await db.select({ username: userTable.username })
              .from(userTable)
              .where(eq(userTable.id, userId))
              .limit(1);
            resolvedUsername = rows[0]?.username ?? '';
            if (!SECRET_ROOM_WHITELIST.has(resolvedUsername)) {
              ws.send(JSON.stringify({ type: 'error', message: 'not_allowed' }));
              ws.close(1008, 'not allowed');
              return;
            }
          } catch {
            ws.close(1011, 'server error');
            return;
          }
        }

        client = {
          ws,
          userId,
          name:     msg.name   ?? userId,
          username: resolvedUsername,
          mime:     msg.mime   ?? 'audio/webm;codecs=opus',
          speaking: false,
        };
        const room = getRoom(roomId);
        room.set(userId, client);
        joined = true;

        // Ack the joiner
        ws.send(JSON.stringify({ type: 'joined' }));

        // Notify ALL members (including joiner) about the new peer
        broadcastAll(room, JSON.stringify({ type: 'peer_joined', userId, name: client.name, username: resolvedUsername }));
        return;
      }

      if (!joined || !client) return;

      if (msg.type === 'start') {
        client.speaking = true;
        // Notify ALL members so everyone sees who is speaking (including the speaker)
        broadcastAll(getRoom(roomId), JSON.stringify({ type: 'speaking', userId, name: client.name }));
        return;
      }

      if (msg.type === 'stop') {
        client.speaking = false;
        // Notify ALL members that speaker stopped
        broadcastAll(getRoom(roomId), JSON.stringify({ type: 'silent', userId }));
        return;
      }

      // ── recording_start / recording_stop: hold-to-record waveform sync ──
      if (msg.type === 'recording_start') {
        broadcastAll(getRoom(roomId), JSON.stringify({ type: 'recording_start', userId, name: client.name }));
        return;
      }
      if (msg.type === 'recording_stop') {
        broadcastAll(getRoom(roomId), JSON.stringify({ type: 'recording_stop', userId }));
        return;
      }
      // ── waveform_tick: live levels during hold-record ─────────────────────
      if (msg.type === 'waveform_tick' && msg.levels) {
        broadcast(getRoom(roomId), userId, JSON.stringify({ type: 'waveform_tick', userId, levels: msg.levels }));
        return;
      }

      // ── voice_note: full blob encoded as base64 in JSON ──────────────────
      if (msg.type === 'voice_note' && msg.audio) {
        // Forward to all peers (not sender) as-is — they decode base64 client-side
        broadcast(getRoom(roomId), userId, JSON.stringify({
          type:     'voice_note',
          userId,
          name:     client.name,
          mime:     msg.mime     ?? client.mime,
          duration: msg.duration ?? 0,
          id:       msg.id       ?? `vn-${Date.now()}`,
          audio:    msg.audio,
        }));
        return;
      }
    });

    ws.on('close', () => {
      if (!joined || !client) return;
      const room = getRoom(roomId);
      // if they were speaking, notify everyone they stopped and release floor
      if (client.speaking) {
        broadcastAll(room, JSON.stringify({ type: 'silent', userId }));
        // Release floor in the room API so the next speaker can take it
        if (roomId.startsWith('group-')) {
          releaseFloor(roomId, userId).catch(() => {});
        }
      }
      room.delete(userId);
      if (room.size === 0) liveRooms.delete(roomId);
      else broadcastAll(room, JSON.stringify({ type: 'peer_left', userId }));
    });

    ws.on('error', () => {
      if (!joined || !client) return;
      const room = getRoom(roomId);
      if (client.speaking) {
        broadcastAll(room, JSON.stringify({ type: 'silent', userId }));
        if (roomId.startsWith('group-')) {
          releaseFloor(roomId, userId).catch(() => {});
        }
      }
      room.delete(userId);
      if (room.size === 0) liveRooms.delete(roomId);
    });
  });

  console.log('[room-live-ws] Live audio WebSocket attached at /ws/room-live');
}
