/**
 * GET /api/live-gps
 * Returns { pins: [...] } of users currently sharing live location.
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../lib/auth/auth.js';
import { listLiveGpsPins } from '../../lib/liveGps.js';

export default async function handler(req: Request, res: Response) {
  try {
    // Optional auth — list is public to signed-in clients
    try {
      const auth = getAuth();
      await auth.api.getSession({
        headers: new Headers(req.headers as Record<string, string>),
      });
    } catch { /* allow */ }

    const pins = listLiveGpsPins();
    return res.json({ pins });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
