/**
 * PATCH /api/owner/users/:id
 * Owner controls:
 *  - isBanned / banned   → ban/unban + kick sessions
 *  - isRoomAdmin         → toggle room-admin
 *  - username            → rename username
 *  - newPassword         → force-reset password (no old password required)
 *  - nameColor / usernameColor / color → change display colour
 *  - vip / isVip / vipActive → grant (true) or remove (false) VIP in vip_status
 *  - business / isBusiness / businessApproved → grant (true) or remove (false) Business in business_directory
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql, eq } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import bcrypt from 'bcryptjs';
import { vipStatus, businessDirectory } from '@/server/db/schema';

const OWNER_EMAILS = new Set(['alsoor@mail.com', 'stooorna@mail.com']);
const PRIVILEGED_USERNAMES = new Set(['q8', 'stooorna']);

function isPrivilegedUser(u: { email?: string | null; username?: string | null; name?: string | null }) {
  const username = (u.username ?? u.name ?? '').replace(/^@/, '').trim().toLowerCase();
  const email = (u.email ?? '').toLowerCase().trim(); return OWNER_EMAILS.has(email) || PRIVILEGED_USERNAMES.has(username);
}

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const sess = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!sess?.user || !isPrivilegedUser(sess.user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { id } = req.params;
    const body = req.body as {
      isBanned?: boolean;
      banned?: boolean;
      isRoomAdmin?: boolean;
      username?: string;
      newPassword?: string;
      nameColor?: string;
      usernameColor?: string;
      color?: string;
      vip?: boolean; isVip?: boolean; vipActive?: boolean;
      vipColor?: string | null; vipExpiresAt?: number | null;
      business?: boolean; isBusiness?: boolean; businessApproved?: boolean;
      businessProjectName?: string | null;
      accountType?: string;
    };

    // ── Ban / Unban ──────────────────────────────────────────────────────────
    const banValue = body.isBanned ?? body.banned;
    if (banValue !== undefined) {
      await db.execute(sql`UPDATE user SET is_banned = ${banValue ? 1 : 0} WHERE id = ${id}`);
      if (banValue === true) {
        // Real-time kick — delete all sessions
        await db.execute(sql`DELETE FROM session WHERE user_id = ${id}`);
      }
    }

    // ── Room admin toggle ────────────────────────────────────────────────────
    if (body.isRoomAdmin !== undefined) {
      await db.execute(sql`UPDATE user SET is_room_admin = ${body.isRoomAdmin ? 1 : 0} WHERE id = ${id}`);
    }

    // ── Username rename ──────────────────────────────────────────────────────
    if (body.username && body.username.trim()) {
      const next = body.username.trim().replace(/^@/, '');
      // Check uniqueness
      const [existingRows] = await db.execute(sql`SELECT id FROM user WHERE username = ${next} AND id != ${id} LIMIT 1`) as unknown as [unknown[], unknown];
      if ((existingRows ?? []).length > 0) {
        return res.status(409).json({ error: 'Username already taken' });
      }
      await db.execute(sql`UPDATE user SET username = ${next} WHERE id = ${id}`);
    }

    // ── Force password reset (no old password needed) ────────────────────────
    if (body.newPassword && body.newPassword.length >= 6) {
      const hashed = await bcrypt.hash(body.newPassword, 10);
      // BetterAuth stores password in the `account` table (credential provider)
      const [updateResult] = await db.execute(
        sql`UPDATE account SET password = ${hashed} WHERE user_id = ${id} AND provider_id = 'credential'`
      ) as unknown as [{ affectedRows?: number }, unknown];
      const affectedRows = updateResult?.affectedRows ?? 0;
      // Fallback: also try the user table `password` column if it exists
      if (!affectedRows) {
        await db.execute(sql`UPDATE user SET password = ${hashed} WHERE id = ${id}`).catch(() => {});
      }
      // Invalidate all sessions so the user must re-login with new password
      await db.execute(sql`DELETE FROM session WHERE user_id = ${id}`);
    }

    // ── Display colour ───────────────────────────────────────────────────────
    const colour = body.nameColor ?? body.usernameColor ?? body.color;
    if (colour) {
      // Store in name_color column; add it if missing (idempotent)
      await db.execute(sql`
        ALTER TABLE user ADD COLUMN IF NOT EXISTS name_color VARCHAR(20) DEFAULT NULL
      `).catch(() => {});
      await db.execute(sql`UPDATE user SET name_color = ${colour} WHERE id = ${id}`);
    }

    // ── VIP grant / removal (same vip_status table the /api/vip routes use) ───
    const vipFlag = body.vip ?? body.isVip ?? body.vipActive;
    if (vipFlag !== undefined && vipFlag !== null) {
      const existing = await db.select().from(vipStatus).where(eq(vipStatus.userId, id)).limit(1);
      if (vipFlag === false) {
        // Remove: switch off and clear expiry + features. Row and renameUsed flag are kept.
        if (existing.length > 0) {
          await db.update(vipStatus)
            .set({ active: false, expiresAt: null, eightMics: false, roomMusic: false } as Record<string, unknown>)
            .where(eq(vipStatus.userId, id));
        }
      } else {
        const FAR = new Date('2099-12-31T00:00:00Z').getTime();
        const validColors = ['blue', 'gold', 'red', 'green', 'gray', 'pink'];
        const wantedColor = String(body.vipColor ?? body.color ?? '');
        const patch: Record<string, unknown> = {
          active: true,
          since: new Date(),
          expiresAt: new Date(Number(body.vipExpiresAt) || FAR),
        };
        if (validColors.includes(wantedColor)) patch.color = wantedColor;
        if (existing.length > 0) {
          await db.update(vipStatus).set(patch).where(eq(vipStatus.userId, id));
        } else {
          const [uRows] = await db.execute(sql`SELECT username FROM user WHERE id = ${id} LIMIT 1`) as unknown as [any[], unknown];
          await db.insert(vipStatus).values({ userId: id, username: uRows?.[0]?.username ?? null, ...patch } as any);
        }
      }
    }

    // ── Business grant / removal (same business_directory table as /api/business/directory) ──
    const bizFlag = body.business ?? body.isBusiness ?? body.businessApproved;
    if (bizFlag !== undefined && bizFlag !== null) {
      if (bizFlag === false) {
        await db.delete(businessDirectory).where(eq(businessDirectory.userId, id));
      } else {
        const FAR = new Date('2099-12-31T00:00:00Z');
        const [uRows] = await db.execute(sql`SELECT username, email FROM user WHERE id = ${id} LIMIT 1`) as unknown as [any[], unknown];
        const u = uRows?.[0] ?? {};
        const existing = await db.select().from(businessDirectory).where(eq(businessDirectory.userId, id)).limit(1);
        const patch: Record<string, unknown> = { active: true, since: new Date(), expiresAt: FAR };
        if (body.businessProjectName) patch.projectName = String(body.businessProjectName);
        if (existing.length > 0) {
          await db.update(businessDirectory).set(patch).where(eq(businessDirectory.userId, id));
        } else {
          await db.insert(businessDirectory).values({
            userId: id,
            username: u.username ?? null,
            email: u.email ?? null,
            projectName: (patch.projectName as string | undefined) ?? u.username ?? null,
            active: true,
            since: patch.since as Date,
            expiresAt: FAR,
          } as any);
        }
      }
    }

    // ── Account type (best effort: ignored if the column does not exist) ─────
    if (body.accountType === 'user' || body.accountType === 'business') {
      await db.execute(sql`UPDATE user SET account_type = ${body.accountType} WHERE id = ${id}`).catch(() => {});
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
