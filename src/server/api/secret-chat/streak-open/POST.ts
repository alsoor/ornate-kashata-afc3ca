/**
 * POST /api/secret-chat/streak-open
 * Body: { msgId: number }
 * Marks a streak message as opened (sets streak_opened_at = NOW()).
 * Sends an in-app notification to the original sender: "تم فتح الستريك".
 * Returns { ok, alreadyOpened, duration, mediaType, url }
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { queryRows } from '../_helpers.js';
import { inAppNotifications } from '../../../db/schema.js';
import { sendPushToUser } from '../../../push-helper.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });
    const userId = session.user.id;
    const userName = session.user.name || 'شخص ما';

    const { msgId } = req.body as { msgId?: number };
    if (!msgId) return res.status(400).json({ error: 'msgId required' });

    // Fetch the streak message
    const rows = await queryRows(sql`
      SELECT m.id, m.sender_id, m.body, m.streak_opened_at, m.streak_duration, m.streak_media_type,
             m.chat_id
      FROM secret_chat_messages m
      WHERE m.id = ${msgId} AND m.is_streak = 1
      LIMIT 1
    `);
    if (!rows.length) return res.status(404).json({ error: 'Streak not found' });

    const msg = rows[0] as any;

    // Only the recipient (not the sender) can open it
    if (msg.sender_id === userId) {
      return res.json({ ok: true, alreadyOpened: false, isSender: true, duration: msg.streak_duration, mediaType: msg.streak_media_type, url: msg.body });
    }

    // Check if already opened
    if (msg.streak_opened_at) {
      return res.json({ ok: true, alreadyOpened: true, duration: msg.streak_duration, mediaType: msg.streak_media_type, url: null });
    }

    // Mark as opened
    await db.execute(sql`
      UPDATE secret_chat_messages SET streak_opened_at = NOW() WHERE id = ${msgId}
    `);

    // Notify sender
    const mediaLabel = msg.streak_media_type === 'video' ? 'الفيديو' : 'الصورة';
    const notifBody = `${userName} فتح ${mediaLabel} الستريك`;
    try {
      await db.insert(inAppNotifications).values({
        userId: msg.sender_id,
        type: 'streak_opened',
        title: '👁 تم فتح الستريك',
        body: notifBody,
        url: `/chat?chatId=${msg.chat_id}`,
      });
      await sendPushToUser(msg.sender_id, 'streak_opened', {
        title: '👁 تم فتح الستريك',
        body: notifBody,
        url: `/chat?chatId=${msg.chat_id}`,
      });
    } catch { /* non-critical */ }

    res.json({ ok: true, alreadyOpened: false, duration: msg.streak_duration, mediaType: msg.streak_media_type, url: msg.body });
  } catch (e) {
    console.error('[streak-open POST]', e);
    res.status(500).json({ error: 'Server error' });
  }
}
