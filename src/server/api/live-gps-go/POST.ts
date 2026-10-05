/**
 * POST /api/live-gps-go
 * body: { action: 'request' | 'respond' | 'cancel' | 'end' | 'position', ... }  -> { request }
 */
import { applyAction } from '__STATE_IMPORT__';

export default async function handler(req: any, res: any) {
  const out = applyAction(req?.body || {});
  return res.status(out.status).json(out.data);
}
