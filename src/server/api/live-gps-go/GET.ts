/**
 * GET /api/live-gps-go?userId=<me>
 * -> { incoming: GoReq[], outgoing: GoReq[] }   (requests asking me / requests I sent)
 */
import { listFor } from '__STATE_IMPORT__';

export default async function handler(req: any, res: any) {
  const userId = String(req?.query?.userId || '').trim();
  if (!userId) return res.status(400).json({ error: 'userId required' });
  res.setHeader?.('Cache-Control', 'no-store');
  return res.json(listFor(userId));
}
