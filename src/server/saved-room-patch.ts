import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Express, Request, Response } from "express";

type Member = { userId: string; username: string; name: string; avatarUrl?: string | null };
type RoomMsg = { id: string; userId: string; name: string; text: string; at: number; avatarUrl?: string | null };
type Room = { ownerId: string; ownerName: string; members: Member[]; messages: RoomMsg[]; kicked: string[] };

const FILE = join(dirname(fileURLToPath(import.meta.url)), "data", "saved-rooms.json");
const load = (): Record<string, Room> => {
  try { if (existsSync(FILE)) return JSON.parse(readFileSync(FILE, "utf8")); } catch { /* */ }
  return {};
};
const rooms = load();
const save = () => {
  try { mkdirSync(dirname(FILE), { recursive: true }); writeFileSync(FILE, JSON.stringify(rooms)); } catch { /* */ }
};
const keyOf = (userId: string, username: string) => `${userId}|${username.replace(/^@/, "").toLowerCase()}`;

export function registerSavedRoomRoutes(app: Express) {
  app.get("/api/saved-room", (req: Request, res: Response) => {
    const userId = String(req.query.userId || "");
    const username = String(req.query.username || "").replace(/^@/, "").toLowerCase();
    const mine = rooms[userId] || null;
    const joined = Object.values(rooms).find(r => r.ownerId !== userId && r.members.some(m => m.userId === userId || (username && m.username.toLowerCase() === username)) && !r.kicked.includes(userId) && !r.kicked.includes(username));
    res.json({ ok: true, mine, joined: joined || null });
  });
  app.post("/api/saved-room/invite", (req: Request, res: Response) => {
    const body = (req.body || {}) as any;
    const ownerId = String(body.ownerId || "");
    const username = String(body.username || "").replace(/^@/, "");
    if (!ownerId || !username) return res.status(400).json({ error: "missing" });
    const room = rooms[ownerId] || { ownerId, ownerName: String(body.ownerName || "Saved"), members: [], messages: [], kicked: [] };
    room.kicked = room.kicked.filter(k => k.toLowerCase() !== username.toLowerCase());
    if (!room.members.some(m => m.username.toLowerCase() === username.toLowerCase())) {
      room.members.push({ userId: String(body.userId || ""), username, name: String(body.name || username), avatarUrl: body.avatarUrl || null } as Member);
    }
    rooms[ownerId] = room;
    save();
    res.json({ ok: true, room });
  });
  app.post("/api/saved-room/message", (req: Request, res: Response) => {
    const body = (req.body || {}) as any;
    const ownerId = String(body.ownerId || "");
    const room = rooms[ownerId];
    if (!room) return res.status(404).json({ error: "no-room" });
    const msg: RoomMsg = { id: `sr_${Date.now()}`, userId: String(body.userId || ""), name: String(body.name || ""), text: String(body.text || "").slice(0, 2000), at: Date.now(), avatarUrl: body.avatarUrl || null };
    room.messages.push(msg);
    room.messages = room.messages.slice(-400);
    save();
    res.json({ ok: true, message: msg, room });
  });
  app.post("/api/saved-room/leave", (req: Request, res: Response) => {
    const body = (req.body || {}) as any;
    const ownerId = String(body.ownerId || "");
    const userId = String(body.userId || "");
    const username = String(body.username || "").replace(/^@/, "").toLowerCase();
    const room = rooms[ownerId];
    if (room) room.members = room.members.filter(m => m.userId !== userId && m.username.toLowerCase() !== username);
    save();
    res.json({ ok: true });
  });
  app.post("/api/saved-room/kick", (req: Request, res: Response) => {
    const body = (req.body || {}) as any;
    const ownerId = String(body.ownerId || "");
    const username = String(body.username || "").replace(/^@/, "");
    const room = rooms[ownerId];
    if (!room) return res.status(404).json({ error: "no-room" });
    room.members = room.members.filter(m => m.username.toLowerCase() !== username.toLowerCase());
    room.kicked.push(username.toLowerCase());
    save();
    res.json({ ok: true, room });
  });
  app.post("/api/saved-room/delete", (req: Request, res: Response) => {
    const ownerId = String((req.body || {}).ownerId || "");
    delete rooms[ownerId];
    save();
    res.json({ ok: true });
  });
}
