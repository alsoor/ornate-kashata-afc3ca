/** GET /api/push/vapid-public-key — returns VAPID public key for SW subscription */
import type { Request, Response } from 'express';
import { getSecret } from '#airo/secrets';

export default function handler(_req: Request, res: Response) {
  const key = getSecret('VAPID_PUBLIC_KEY') ?? '';
  res.json({ key });
}
