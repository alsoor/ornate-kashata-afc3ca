/**
 * GET /api/live-gps-go?userId=<me>
 * -> { incoming: GoReq[], outgoing: GoReq[] }   (requests asking me / requests I sent)
 * Works with an Express-style handler (req, res) AND a Web-style handler (Request -> Response).
 */
import { listFor } from '__STATE_IMPORT__';

function userIdOf(req: any): string {
  const q = req?.query?.userId;
  if (q) return String(q).trim();
  try {
    const url = typeof req?.url === 'string' ? req.url : '';
    return String(new URL(url, 'http://x').searchParams.get('userId') || '').trim();
  } catch { return ''; }
}

export default async function handler(req: any, res: any) {
  const userId = userIdOf(req);
  if (!userId) return res.status(400).json({ error: 'userId required' });
  res.setHeader?.('Cache-Control', 'no-store');
  return res.status(200).json(listFor(userId));
}

export async function GET(request: Request) {
  const userId = userIdOf(request);
  if (!userId) return new Response(JSON.stringify({ error: 'userId required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  return new Response(JSON.stringify(listFor(userId)), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
