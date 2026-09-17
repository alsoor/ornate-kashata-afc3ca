/**
 * PATCH /api/users/me/password
 * Change the current user's password.
 * Uses BetterAuth's scrypt verifyPassword + hashPassword — NOT bcrypt.
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { db } from '../../../../db/client.js';
import { account } from '../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
// BetterAuth uses scrypt — must use its own hash/verify functions
import { verifyPassword, hashPassword } from '@better-auth/utils/password';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers(req.headers as Record<string, string>);
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!currentPassword || !newPassword)
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });

    if (newPassword.length < 8)
      return res.status(400).json({ error: 'New password must be at least 8 characters' });

    if (currentPassword === newPassword)
      return res.status(400).json({ error: 'New password must be different from current password' });

    // Fetch credential account — BetterAuth stores password hash here (scrypt format)
    const accRows = await db
      .select({ id: account.id, password: account.password, providerId: account.providerId })
      .from(account)
      .where(eq(account.userId, session.user.id));

    const credAccount = accRows.find(r => r.providerId === 'credential');
    if (!credAccount?.password)
      return res.status(400).json({ error: 'No password set on this account' });

    // Verify using BetterAuth's scrypt verifyPassword
    const valid = await verifyPassword(credAccount.password, currentPassword);
    if (!valid)
      return res.status(400).json({ error: 'Current password is incorrect' });

    // Hash new password using BetterAuth's scrypt hashPassword
    const newHash = await hashPassword(newPassword);

    // Update in account table
    await db
      .update(account)
      .set({ password: newHash })
      .where(and(eq(account.userId, session.user.id), eq(account.providerId, 'credential')));

    return res.json({ ok: true });
  } catch (e) {
    console.error('[PATCH /api/users/me/password]', e);
    return res.status(500).json({ error: 'Failed to update password' });
  }
}
