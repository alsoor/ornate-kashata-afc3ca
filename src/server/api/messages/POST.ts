/**
 * POST /api/messages
 * Send a text message. Body: { receiverId, body }
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { messages, user } from '../../db/schema.js';
import { getAuth } from '../../../lib/auth/auth.js';
import { sendPushToUser } from '../../push-helper.js';
import { eq } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const meId = session.user.id;
    const { receiverId, body, isStreak } = req.body as { receiverId: string; body: string; isStreak?: boolean };

    if (!receiverId || !body?.trim()) {
      return res.status(400).json({ error: 'receiverId and body are required' });
    }

    const [result] = await db.insert(messages).values({
      senderId: meId,
      receiverId,
      type: 'text',
      body: body.trim(),
    });

    // Set is_streak flag if requested
    const insertId = (result as { insertId: number }).insertId;
    if (isStreak && insertId) {
      try {
        const { sql: sqlTag } = await import('drizzle-orm');
        await (db as any).execute(sqlTag`UPDATE messages SET is_streak = 1 WHERE id = ${insertId}`);
      } catch { /* streak column may not exist yet */ }
    }

    // Push notification to receiver
    try {
      const [sender] = await db.select({ name: user.name, username: user.username, avatarUrl: user.avatarUrl })
        .from(user).where(eq(user.id, meId));
      const senderName = sender?.name ?? sender?.username ?? 'شخص ما';
      await sendPushToUser(receiverId, 'dm', {
        title: `💬 ${senderName}`,
        body:  body.trim().slice(0, 100),
        icon:  (sender as any)?.avatarUrl ?? '/favicon.ico',
        url:   `/chat?with=${meId}`,
        tag:   `dm-${meId}`,
      });
    } catch {}

    res.status(201).json({ id: insertId, ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send message', message: String(error) });
  }
}
