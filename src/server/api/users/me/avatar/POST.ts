/**
 * POST /api/users/me/avatar
 * Accepts raw binary image (Content-Type: image/*), saves to shared-storage,
 * updates user.avatar_url AND user.image, returns { avatarUrl }.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { user } from '../../../../db/schema.js';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { eq } from 'drizzle-orm';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const UPLOAD_DIR = '/shared-storage/public/assets/uploads/avatars';
const PUBLIC_BASE = '/airo-assets/uploads/avatars';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

    const meId = session.user.id;

    const buf: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
    if (!buf || buf.length === 0) return res.status(400).json({ error: 'No image data' });

    const ct = String(req.headers['content-type'] ?? 'image/jpeg').toLowerCase();
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : ct.includes('gif') ? 'gif' : 'jpg';
    const filename = `${meId}-${Date.now()}.${ext}`;

    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const filePath = path.join(UPLOAD_DIR, filename);
    await fs.writeFile(filePath, buf);

    const avatarUrl = `${PUBLIC_BASE}/${filename}`;
    // Write both columns: feed uses avatar_url; some session paths still read image
    try {
      await db.update(user).set({ avatarUrl, image: avatarUrl } as any).where(eq(user.id, meId));
    } catch {
      await db.update(user).set({ avatarUrl }).where(eq(user.id, meId));
    }

    res.json({ ok: true, avatarUrl });
  } catch (e) {
    res.status(500).json({ error: 'Upload failed', message: String(e) });
  }
}
