import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { vipStatus } from "@/server/db/schema";

export default async function handler(_req: Request, res: Response) {
  try {
    const rows = await db.select().from(vipStatus).where(eq(vipStatus.active, true));
    const now = Date.now();
    const users = rows
      .filter((row) => !row.expiresAt || now <= row.expiresAt.getTime())
      .map((row) => ({
        userId: row.userId,
        active: true,
        color: row.color || "gold",
        feats: {
          eightMics: !!row.eightMics,
          roomMusic: !!row.roomMusic,
        },
        expiresAt: row.expiresAt ? row.expiresAt.getTime() : undefined,
        username: row.username || null,
      }));
    return res.json({ users });
  } catch (err) {
    console.error("[api/vip/directory] GET failed:", err);
    return res.json({ users: [] });
  }
}
