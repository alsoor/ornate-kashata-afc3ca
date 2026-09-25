import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { vipStatus } from "@/server/db/schema";

type VipColor = "blue" | "gold" | "red" | "green" | "gray" | "pink";

function empty(userId: string) {
  return {
    userId,
    active: false,
    since: 0,
    color: "gold" as VipColor,
    feats: { eightMics: false, roomMusic: false },
    renameUsed: false,
  };
}

export default async function handler(req: Request, res: Response) {
  const userId = String(req.query.userId || "");
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    const rows = await db.select().from(vipStatus).where(eq(vipStatus.userId, userId)).limit(1);
    if (!rows.length) return res.json(empty(userId));
    const row = rows[0];
    const expiresAt = row.expiresAt ? row.expiresAt.getTime() : undefined;
    let active = !!row.active;
    if (active && expiresAt && Date.now() > expiresAt) {
      await db.update(vipStatus).set({ active: false }).where(eq(vipStatus.userId, userId));
      active = false;
    }
    return res.json({
      userId: row.userId,
      active,
      since: row.since ? row.since.getTime() : 0,
      expiresAt,
      color: (row.color as VipColor) || "gold",
      feats: { eightMics: !!row.eightMics, roomMusic: !!row.roomMusic },
      renameUsed: !!row.renameUsed,
      username: row.username ?? null,
    });
  } catch (err) {
    console.error("[api/vip] GET failed:", err);
    return res.json(empty(userId));
  }
}
