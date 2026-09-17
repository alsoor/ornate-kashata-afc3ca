/**
 * Public Voice Room — in-memory floor control
 * State: { floor, members, frozenUsers, roomAdmins }
 * Persists in module scope (lost on server restart — acceptable for ephemeral rooms)
 */

export interface RoomMember {
  userId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  joinedAt: number;
  isRoomAdmin?: boolean;
}

interface RoomState {
  floor: string | null;
  floorSince: number;
  members: Map<string, RoomMember>;
  lastHeartbeat: Map<string, number>;
  frozenUsers: Set<string>;   // mic-locked by admin/owner
  roomAdmins: Set<string>;    // granted room-admin in this session
}

const ROOM_TIMEOUT_MS  = 35_000; // raised from 8s — heartbeat every 15s
const FLOOR_TIMEOUT_MS = 30_000;

const rooms = new Map<string, RoomState>();

function getRoom(roomId: string): RoomState {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      floor: null,
      floorSince: 0,
      members: new Map(),
      lastHeartbeat: new Map(),
      frozenUsers: new Set(),
      roomAdmins: new Set(),
    });
  }
  return rooms.get(roomId)!;
}

function pruneStale(room: RoomState) {
  const now = Date.now();
  for (const [uid, ts] of room.lastHeartbeat) {
    if (now - ts > ROOM_TIMEOUT_MS) {
      room.members.delete(uid);
      room.lastHeartbeat.delete(uid);
      room.frozenUsers.delete(uid);
      if (room.floor === uid) {
        room.floor = null;
        room.floorSince = 0;
      }
    }
  }
  if (room.floor && now - room.floorSince > FLOOR_TIMEOUT_MS) {
    room.floor = null;
    room.floorSince = 0;
  }
}

export function roomJoin(roomId: string, member: RoomMember) {
  const room = getRoom(roomId);
  // Preserve isRoomAdmin flag if already set in this session
  const existing = room.members.get(member.userId);
  room.members.set(member.userId, {
    ...member,
    isRoomAdmin: existing?.isRoomAdmin ?? member.isRoomAdmin ?? false,
  });
  room.lastHeartbeat.set(member.userId, Date.now());
}

export function roomHeartbeat(roomId: string, userId: string) {
  const room = getRoom(roomId);
  room.lastHeartbeat.set(userId, Date.now());
  pruneStale(room);
}

export function roomLeave(roomId: string, userId: string) {
  const room = getRoom(roomId);
  room.members.delete(userId);
  room.lastHeartbeat.delete(userId);
  room.frozenUsers.delete(userId);
  if (room.floor === userId) {
    room.floor = null;
    room.floorSince = 0;
  }
}

/** Try to take the floor. Returns false if floor is busy OR user is frozen. */
export function roomTakeFloor(roomId: string, userId: string): boolean {
  const room = getRoom(roomId);
  pruneStale(room);
  if (room.frozenUsers.has(userId)) return false; // mic frozen
  if (room.floor && room.floor !== userId) return false;
  room.floor = userId;
  room.floorSince = Date.now();
  return true;
}

export function roomReleaseFloor(roomId: string, userId: string) {
  const room = getRoom(roomId);
  if (room.floor === userId) {
    room.floor = null;
    room.floorSince = 0;
  }
}

export function roomForceRelease(roomId: string, userId: string) {
  const room = getRoom(roomId);
  const heldTooLong = room.floorSince > 0 && Date.now() - room.floorSince > 5_000;
  if (room.floor === userId || heldTooLong) {
    room.floor = null;
    room.floorSince = 0;
  }
}

/** Freeze a user's mic (admin/owner action). Also releases floor if they hold it. */
export function roomFreezeUser(roomId: string, targetId: string) {
  const room = getRoom(roomId);
  room.frozenUsers.add(targetId);
  if (room.floor === targetId) {
    room.floor = null;
    room.floorSince = 0;
  }
}

/** Unfreeze a user's mic. */
export function roomUnfreezeUser(roomId: string, targetId: string) {
  const room = getRoom(roomId);
  room.frozenUsers.delete(targetId);
}

/** Kick a user from the room (removes them from members). */
export function roomKickUser(roomId: string, targetId: string) {
  const room = getRoom(roomId);
  room.members.delete(targetId);
  room.lastHeartbeat.delete(targetId);
  room.frozenUsers.delete(targetId);
  if (room.floor === targetId) {
    room.floor = null;
    room.floorSince = 0;
  }
}

/** Grant/revoke room-admin for a user in this session. */
export function roomSetAdmin(roomId: string, targetId: string, grant: boolean) {
  const room = getRoom(roomId);
  if (grant) {
    room.roomAdmins.add(targetId);
    const m = room.members.get(targetId);
    if (m) m.isRoomAdmin = true;
  } else {
    room.roomAdmins.delete(targetId);
    const m = room.members.get(targetId);
    if (m) m.isRoomAdmin = false;
  }
}

export function roomSnapshot(roomId: string) {
  const room = getRoom(roomId);
  pruneStale(room);
  return {
    floor: room.floor,
    floorSince: room.floorSince,
    members: Array.from(room.members.values()),
    frozenUsers: Array.from(room.frozenUsers),
    roomAdmins: Array.from(room.roomAdmins),
  };
}

export function roomCount(roomId: string): number {
  const room = getRoom(roomId);
  pruneStale(room);
  return room.members.size;
}
