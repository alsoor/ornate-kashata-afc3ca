import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { vipStatus } from "@/server/db/schema";

type VipColor = "blue" | "gold" | "red" | "green" | "gray" | "pink";
const COLORS: VipColor[] = ["blue", "gold", "red", "green", "gray", "pink"];

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

async function loadRow(userId: string) {
  const rows = await db.select().from(vipStatus).where(eq(vipStatus.userId, userId)).limit(1);
  if (!rows.length) return empty(userId);
  const row = rows[0];
  const expiresAt = row.expiresAt ? row.expiresAt.getTime() : undefined;
  let active = !!row.active;
  if (active && expiresAt && Date.now() > expiresAt) {
    await db.update(vipStatus).set({ active: false }).where(eq(vipStatus.userId, userId));
    active = false;
  }
  return {
    userId: row.userId,
    active,
    since: row.since ? row.since.getTime() : 0,
    expiresAt,
    color: (row.color as VipColor) || "gold",
    feats: { eightMics: !!row.eightMics, roomMusic: !!row.roomMusic },
    renameUsed: !!row.renameUsed,
    username: row.username ?? null,
  };
}

async function upsertRow(userId: string, patch: Record<string, unknown>) {
  const existing = await db.select().from(vipStatus).where(eq(vipStatus.userId, userId)).limit(1);
  if (!existing.length) {
    await db.insert(vipStatus).values({
      userId,
      active: (patch.active as boolean) ?? false,
      since: (patch.since as Date) ?? null,
      expiresAt: (patch.expiresAt as Date | null) ?? null,
      color: (patch.color as VipColor) ?? "gold",
      eightMics: (patch.eightMics as boolean) ?? false,
      roomMusic: (patch.roomMusic as boolean) ?? false,
      renameUsed: (patch.renameUsed as boolean) ?? false,
      username: (patch.username as string | null) ?? null,
    });
  } else {
    await db.update(vipStatus).set(patch).where(eq(vipStatus.userId, userId));
  }
}

export default async function handler(req: Request, res: Response) {
  const body = (req.body || {}) as Record<string, unknown>;
  const userId = String(body.userId || "");
  if (!userId) return res.status(400).json({ error: "userId required" });
  const action = String(body.action || "");
  try {
    if (action === "activate") {
      const expiresAt = Number(body.expiresAt) || Date.now() + 30 * 24 * 60 * 60 * 1000;
      await upsertRow(userId, { active: true, since: new Date(), expiresAt: new Date(expiresAt) });
    } else if (action === "deactivate") {
      await upsertRow(userId, { active: false });
    } else if (action === "color") {
      const c = String(body.color || "") as VipColor;
      if (COLORS.includes(c)) await upsertRow(userId, { color: c });
    } else if (action === "feat") {
      const key = body.key === "eightMics" || body.key === "roomMusic" ? body.key : null;
      if (key) await upsertRow(userId, { [key]: !!body.on });
    } else if (action === "rename-used") {
      await upsertRow(userId, { renameUsed: true });
    }
    if (typeof body.username === "string") {
      await upsertRow(userId, { username: body.username });
    }
    return res.json(await loadRow(userId));
  } catch (err) {
    console.error("[api/vip] POST failed:", err);
    return res.status(500).json({ error: "db_error" });
  }
}
