/**
 * POST /api/presence/visitors
 * Anonymous visitor heartbeat — no auth required.
 * Body: { visitorId: string }  (client-generated UUID stored in localStorage)
 * Returns: { onlineVisitors: number, onlineUsers: number, total: number }
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';

// In-memory visitor map: visitorId → lastSeen timestamp
const visitors = new Map<string, number>();
const VISITOR_TTL_MS = 60_000; // 60s

function pruneVisitors() {
  const cutoff = Date.now() - VISITOR_TTL_MS;
  for (const [id, ts] of visitors) {
    if (ts < cutoff) visitors.delete(id);
  }
}

export default async function handler(req: Request, res: Response) {
  try {
    const { visitorId } = req.body as { visitorId?: string };
    if (visitorId) {
      visitors.set(visitorId, Date.now());
    }
    pruneVisitors();

    // Count registered users online in last 60s
    const [row] = await db.execute<{ cnt: number }>(
      sql`SELECT COUNT(*) as cnt FROM user WHERE last_seen_at > DATE_SUB(NOW(), INTERVAL 60 SECOND)`
    );
    const onlineUsers = Number((row as unknown as { cnt: string | number }).cnt ?? 0);
    const onlineVisitors = visitors.size;
    const total = onlineUsers + onlineVisitors;

    res.json({ onlineVisitors, onlineUsers, total });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
