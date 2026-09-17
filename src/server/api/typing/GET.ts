/**
 * GET /api/typing?peerId=X  أو  GET /api/typing?groupId=X
 * يُرجع قائمة المستخدمين الذين يكتبون حالياً في هذه المحادثة
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../lib/auth/auth.js';
import { typingStore } from './POST.js';

export default async function handler(req: Request, res: Response) {
  const auth    = getAuth();
  const session = await auth.api.getSession({
    headers: new Headers(req.headers as Record<string, string>),
  });
  if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

  const { peerId, groupId } = req.query as { peerId?: string; groupId?: string };
  if (!peerId && !groupId) return res.status(400).json({ error: 'peerId or groupId required' });

  const userId = session.user.id;
  const now    = Date.now();

  const typers: { name: string; avatarUrl: string }[] = [];

  if (groupId) {
    // كل من يكتب في هذا الغروب ما عدا المستخدم الحالي
    for (const [key, val] of typingStore) {
      if (!key.startsWith(`group:${groupId}:`)) continue;
      if (val.expiresAt < now) { typingStore.delete(key); continue; }
      const uid = key.split(':')[2];
      if (uid === userId) continue;
      typers.push({ name: val.name, avatarUrl: val.avatarUrl });
    }
  } else {
    // DM: الطرف الآخر يكتب لي
    const key = `dm:${peerId}:${userId}`;
    const val = typingStore.get(key);
    if (val) {
      if (val.expiresAt < now) {
        typingStore.delete(key);
      } else {
        typers.push({ name: val.name, avatarUrl: val.avatarUrl });
      }
    }
  }

  res.json({ typers });
}
