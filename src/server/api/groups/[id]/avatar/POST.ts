import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { groups } from '../../../../db/schema.js';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { eq } from 'drizzle-orm';
import path from 'path';
import fs from 'fs/promises';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headerMap: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) { if (typeof v === 'string') headerMap[k] = v; else if (Array.isArray(v)) headerMap[k] = v[0] ?? ''; }
    const session = await auth.api.getSession({ headers: new Headers(headerMap) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const groupId = parseInt(String(req.params.id), 10);
    if (isNaN(groupId)) return res.status(400).json({ error: 'Invalid group id' });

    const [grp] = await db.select().from(groups).where(eq(groups.id, groupId));
    if (!grp) return res.status(404).json({ error: 'Group not found' });
    if (grp.createdBy !== session.user.id) return res.status(403).json({ error: 'Only the group creator can change the avatar' });

    const contentType = req.headers['content-type'] ?? 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const filename = `group-${groupId}-${Date.now()}.${ext}`;
    const uploadDir = '/shared-storage/public/assets/uploads/groups';
    await fs.mkdir(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, filename);

    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const buffer = Buffer.concat(chunks);
    await fs.writeFile(filePath, buffer);

    const avatarUrl = `/airo-assets/uploads/groups/${filename}`;
    await db.update(groups).set({ avatarUrl }).where(eq(groups.id, groupId));

    res.json({ avatarUrl });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
