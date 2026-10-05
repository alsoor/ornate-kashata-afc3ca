/**
 * POST /api/live-gps-go
 * body: { action: 'request' | 'respond' | 'cancel' | 'end' | 'position', ... }  -> { request }
 * Works with an Express-style handler (req, res) AND a Web-style handler (Request -> Response).
 */
import { applyAction } from '__STATE_IMPORT__';

async function bodyOf(req: any): Promise<any> {
  if (req && typeof req.json === 'function') { try { return await req.json(); } catch { return {}; } }
  const b = req?.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string') { try { return JSON.parse(b); } catch { return {}; } }
  // no body parser: read the raw stream
  if (req && typeof req.on === 'function') {
    return await new Promise<any>(resolve => {
      let raw = '';
      req.on('data', (c: any) => { raw += c; });
      req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); } });
      req.on('error', () => resolve({}));
    });
  }
  return {};
}

export default async function handler(req: any, res: any) {
  const out = applyAction(await bodyOf(req));
  return res.status(out.status).json(out.data);
}

export async function POST(request: Request) {
  const out = applyAction(await bodyOf(request));
  return new Response(JSON.stringify(out.data), { status: out.status, headers: { 'Content-Type': 'application/json' } });
}
