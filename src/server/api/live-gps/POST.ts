/**
 * POST /api/live-gps
 * Body: { lat, lng, name?, username?, avatarUrl? }  — publish my live pin
 * Body: { clear: true }                              — stop sharing
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../lib/auth/auth.js';
import { upsertLiveGpsPin, removeLiveGpsPin } from '../../lib/liveGps.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });
    const body = (req.body || {}) as {
      clear?: boolean;
      lat?: number;
      lng?: number;
      name?: string | null;
      username?: string | null;
      avatarUrl?: string | null;
      userId?: string;
    };

    const sessionUser = session?.user as
      | { id: string; name?: string | null; username?: string | null; image?: string | null; avatarUrl?: string | null }
      | undefined;
    const uid = sessionUser?.id || body.userId;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });

    if (body.clear) {
      removeLiveGpsPin(String(uid));
      return res.json({ ok: true, cleared: true });
    }

    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat and lng are required' });
    }

    const pin = {
      id: String(uid),
      name: body.name ?? sessionUser?.name ?? 'User',
      username: (body.username ?? (sessionUser as any)?.username ?? '').toString().replace(/^@/, ''),
      avatarUrl: body.avatarUrl ?? sessionUser?.avatarUrl ?? sessionUser?.image ?? null,
      lat,
      lng,
    };
    upsertLiveGpsPin(pin);
    return res.json({ ok: true, pin });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
