/**
 * PATCH /api/users/me/email
 * Change the current user's email address.
 * Verifies current password using BetterAuth's own verifyPassword (scrypt) — NOT bcrypt.
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { db } from '../../../../db/client.js';
import { user, account } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
// BetterAuth uses scrypt internally — import its verifyPassword directly
// BetterAuth uses scrypt internally — import its verifyPassword directly
import { verifyPassword } from '@better-auth/utils/password';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers(req.headers as Record<string, string>);
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const { newEmail, currentPassword } = req.body as {
      newEmail?: string;
      currentPassword?: string;
    };

    if (!newEmail || !currentPassword)
      return res.status(400).json({ error: 'newEmail and currentPassword are required' });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail))
      return res.status(400).json({ error: 'Invalid email format' });

    if (newEmail === session.user.email)
      return res.status(400).json({ error: 'New email is the same as current email' });

    // Fetch password hash from account table (BetterAuth stores it there, not in user)
    const accRows = await db
      .select({ password: account.password, providerId: account.providerId })
      .from(account)
      .where(eq(account.userId, session.user.id));

    // Find the credential account (BetterAuth uses 'credential' as providerId)
    const credAccount = accRows.find(r => r.providerId === 'credential');
    if (!credAccount?.password)
      return res.status(400).json({ error: 'No password set on this account' });

    // Verify using BetterAuth's scrypt verifyPassword — bcrypt will NOT work here
    const valid = await verifyPassword(credAccount.password, currentPassword);
    if (!valid)
      return res.status(400).json({ error: 'Current password is incorrect' });

    // Check new email not already taken by another user
    const existing = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, newEmail));
    if (existing.length && existing[0].id !== session.user.id)
      return res.status(400).json({ error: 'Email already in use' });

    // Update email in user table
    await db.update(user).set({ email: newEmail }).where(eq(user.id, session.user.id));

    return res.json({ ok: true, email: newEmail });
  } catch (e) {
    console.error('[PATCH /api/users/me/email]', e);
    return res.status(500).json({ error: 'Failed to update email' });
  }
}
