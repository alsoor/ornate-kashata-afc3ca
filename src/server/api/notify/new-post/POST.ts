/**
 * POST /api/notify/new-post
 * Sends a Web Push notification to all subscribers when a new post is published.
 * Body: { posterName: string }
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../lib/auth/auth.js';
import { sendPushToAll } from '../../../push-helper.js';

export default async function handler(req: Request, res: Response) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
  if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

  const { posterName } = req.body as { posterName?: string };
  const name = posterName?.trim() || 'شخص ما';

  try {
    await sendPushToAll({
      title: '📸 منشور جديد',
      body: `${name} نشر منشوراً جديداً`,
      url: '/',
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('[notify/new-post]', e);
    res.status(500).json({ error: 'Push failed' });
  }
}
