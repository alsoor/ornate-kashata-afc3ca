import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { businessDirectory } from "@/server/db/schema";

function stillActive(row: { active: boolean; expiresAt: Date | null }): boolean {
  if (!row.active) return false;
  if (row.expiresAt && Date.now() > row.expiresAt.getTime()) return false;
  return true;
}

export default async function handler(_req: Request, res: Response) {
  try {
    const rows = await db.select().from(businessDirectory).where(eq(businessDirectory.active, true));
    const users = rows.filter(stillActive).map((row) => ({
      userId: row.userId,
      username: row.username || null,
      email: row.email || null,
      projectName: row.projectName || null,
      active: true,
      expiresAt: row.expiresAt ? row.expiresAt.getTime() : undefined,
    }));
    return res.json({ users });
  } catch (err) {
    console.error("[api/business/directory] GET failed:", err);
    return res.json({ users: [] });
  }
}
