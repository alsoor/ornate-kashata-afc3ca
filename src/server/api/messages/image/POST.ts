import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { messages, user } from '../../../db/schema.js';
import { getAuth } from '../../../../lib/auth/auth.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { sendPushToUser } from '../../../push-helper.js';
import { eq } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const receiverId = String(req.query.receiverId ?? '');
    const isStreak = req.query.isStreak === '1';
    if (!receiverId) return res.status(400).json({ error: 'receiverId required' });

    const dir = '/shared-storage/public/assets/chat-images';
    mkdirSync(dir, { recursive: true });
    const ext = (req.headers['content-type'] ?? 'image/jpeg').includes('png') ? 'png' : 'jpg';
    const filename = `dm-${Date.now()}.${ext}`;
    writeFileSync(join(dir, filename), req.body as Buffer);

    const imageUrl = `/airo-assets/uploads/chat-images/${filename}`;
    const [result] = await db.insert(messages).values({
      senderId: session.user.id,
      receiverId,
      type: 'image',
      body: imageUrl,
    });

    const insertId = (result as { insertId: number }).insertId;
    if (isStreak && insertId) {
      try {
        const { sql: sqlTag } = await import('drizzle-orm');
        await (db as any).execute(sqlTag`UPDATE messages SET is_streak = 1 WHERE id = ${insertId}`);
      } catch { /* streak column may not exist yet */ }
    }

    // Push
    try {
      const [sender] = await db.select({ name: user.name, username: user.username })
        .from(user).where(eq(user.id, session.user.id));
      const senderName = sender?.name ?? sender?.username ?? 'شخص ما';
      await sendPushToUser(receiverId, 'dm', {
        title: `📷 ${senderName}`,
        body:  'أرسل لك صورة',
        icon:  '/favicon.ico',
        url:   `/chat?with=${session.user.id}`,
        tag:   `dm-${session.user.id}`,
      });
    } catch {}

    res.status(201).json({ ok: true, imageUrl });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
