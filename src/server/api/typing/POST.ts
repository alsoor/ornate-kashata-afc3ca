/**
 * POST /api/typing
 * يُسجّل أن المستخدم يكتب حالياً في محادثة معينة
 * Body: { peerId?: string, groupId?: string }
 * TTL: 4 ثواني — إذا لم يُرسل المستخدم مجدداً يختفي المؤشر تلقائياً
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../lib/auth/auth.js';

// ── In-memory store ──────────────────────────────────────────────────────────
// key: `dm:${userId}:${peerId}` أو `group:${groupId}:${userId}`
// value: { name, avatarUrl, expiresAt }
export const typingStore = new Map<string, { name: string; avatarUrl: string; expiresAt: number }>();

const TTL_MS = 4000; // 4 ثواني

export default async function handler(req: Request, res: Response) {
  const auth    = getAuth();
  const session = await auth.api.getSession({
    headers: new Headers(req.headers as Record<string, string>),
  });
  if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

  const { peerId, groupId } = req.body as { peerId?: string; groupId?: string };
  if (!peerId && !groupId) return res.status(400).json({ error: 'peerId or groupId required' });

  const userId    = session.user.id;
  const name      = (session.user as any).name      ?? 'Unknown';
  const avatarUrl = (session.user as any).avatarUrl ?? '';

  const key = groupId
    ? `group:${groupId}:${userId}`
    : `dm:${userId}:${peerId}`;

  typingStore.set(key, { name, avatarUrl, expiresAt: Date.now() + TTL_MS });

  // تنظيف المدخلات المنتهية
  for (const [k, v] of typingStore) {
    if (v.expiresAt < Date.now()) typingStore.delete(k);
  }

  res.json({ ok: true });
}
