import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { groupMessages, groupMembers } from '../../../../../db/schema.js';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { eq, and } from 'drizzle-orm';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const groupId = parseInt(String(req.params.id));
    const meId = session.user.id;

    const [mem] = await db.select().from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, meId)));
    if (!mem) return res.status(403).json({ error: 'Not a member' });

    const dir = '/shared-storage/public/assets/chat-images';
    mkdirSync(dir, { recursive: true });
    const ext = (req.headers['content-type'] ?? 'image/jpeg').includes('png') ? 'png' : 'jpg';
    const filename = `grp-${groupId}-${Date.now()}.${ext}`;
    writeFileSync(join(dir, filename), req.body as Buffer);

    const imageUrl = `/airo-assets/uploads/chat-images/${filename}`;
    await db.insert(groupMessages).values({ groupId, senderId: meId, type: 'image', body: imageUrl });
    res.status(201).json({ ok: true, imageUrl });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
