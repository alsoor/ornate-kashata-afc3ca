import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { groupMessages, groupMembers } from '../../../../../db/schema.js';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { eq, and } from 'drizzle-orm';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

function mimeToExt(mime: string): string {
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'mp4';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('webm')) return 'webm';
  return 'webm';
}

export default async function handler(req: Request, res: Response) {
  try {
    const auth    = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const groupId  = parseInt(String(req.params.id));
    const meId     = session.user.id;
    const duration = parseInt(String(req.query.duration ?? '0'));

    const [mem] = await db.select().from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, meId)));
    if (!mem) return res.status(403).json({ error: 'Not a member' });

    const blob = req.body as Buffer;
    if (!blob || blob.length === 0) return res.status(400).json({ error: 'Empty body' });

    const contentType = (req.headers['content-type'] || 'audio/webm').split(';')[0].trim();
    const ext         = mimeToExt(contentType);

    const dir      = '/shared-storage/public/assets/chat-audio';
    await mkdir(dir, { recursive: true });
    const filename = `grp-${groupId}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    await writeFile(join(dir, filename), blob);

    const audioUrl = `/airo-assets/uploads/chat-audio/${filename}`;
    await db.insert(groupMessages).values({ groupId, senderId: meId, type: 'voice', body: audioUrl, duration });
    res.status(201).json({ ok: true, audioUrl });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
