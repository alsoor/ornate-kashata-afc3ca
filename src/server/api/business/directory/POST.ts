import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { businessDirectory } from "@/server/db/schema";

const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

function stillActive(row: { active: boolean; expiresAt: Date | null }): boolean {
  if (!row.active) return false;
  if (row.expiresAt && Date.now() > row.expiresAt.getTime()) return false;
  return true;
}

function toApiRow(row: typeof businessDirectory.$inferSelect) {
  return {
    userId: row.userId,
    username: row.username || null,
    email: row.email || null,
    projectName: row.projectName || null,
    active: true,
    expiresAt: row.expiresAt ? row.expiresAt.getTime() : undefined,
  };
}

async function activeUsers() {
  const rows = await db.select().from(businessDirectory).where(eq(businessDirectory.active, true));
  return rows.filter(stillActive).map(toApiRow);
}

export default async function handler(req: Request, res: Response) {
  const body = (req.body || {}) as Record<string, unknown>;
  const action = String(body.action || "upsert");
  const userId = String(body.userId || "");
  if (!userId) return res.status(400).json({ error: "userId required" });

  try {
    if (action === "remove") {
      await db.delete(businessDirectory).where(eq(businessDirectory.userId, userId));
      return res.json({ users: await activeUsers() });
    }

    const existingRows = await db.select().from(businessDirectory).where(eq(businessDirectory.userId, userId)).limit(1);
    const existing = existingRows[0];

    const patch: Record<string, unknown> = {};
    if (action === "activate" || action === "publish" || action === "upsert") {
      patch.active = true;
      patch.since = new Date();
      patch.expiresAt = new Date(Number(body.expiresAt) || Date.now() + PERIOD_MS);
    } else if (action === "deactivate") {
      patch.active = false;
    }

    if (body.username !== undefined) patch.username = body.username ? String(body.username) : null;
    if (body.email !== undefined) patch.email = body.email ? String(body.email) : null;
    if (body.projectName !== undefined) patch.projectName = body.projectName ? String(body.projectName) : null;

    if (!existing) {
      await db.insert(businessDirectory).values({
        userId,
        username: (patch.username as string | null) ?? null,
        email: (patch.email as string | null) ?? null,
        projectName: (patch.projectName as string | null) ?? null,
        active: (patch.active as boolean) ?? false,
        since: (patch.since as Date | null) ?? null,
        expiresAt: (patch.expiresAt as Date | null) ?? null,
      });
    } else {
      await db.update(businessDirectory).set(patch).where(eq(businessDirectory.userId, userId));
    }

    return res.json({ users: await activeUsers() });
  } catch (err) {
    console.error("[api/business/directory] POST failed:", err);
    return res.status(500).json({ error: "db_error" });
  }
}
