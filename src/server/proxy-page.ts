import type { IncomingMessage, ServerResponse } from 'http';

function readQuery(req: IncomingMessage): URLSearchParams {
  try {
    const host = req.headers.host || 'localhost';
    return new URL(req.url || '/', `http://${host}`).searchParams;
  } catch {
    return new URLSearchParams();
  }
}

function safeTarget(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

export async function handleProxyPage(req: IncomingMessage, res: ServerResponse) {
  const target = safeTarget(readQuery(req).get('url'));
  if (!target) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Missing url');
    return;
  }

  try {
    const upstream = await fetch(target, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/122.0.0.0 Mobile Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    const contentType = upstream.headers.get('content-type') || 'text/html; charset=utf-8';
    let body = Buffer.from(await upstream.arrayBuffer());

    if (/text\/html/i.test(contentType)) {
      let html = body.toString('utf8');
      if (!/<base\s/i.test(html)) {
        html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${target}">`);
      }
      html = html
        .replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, '')
        .replace(/<meta[^>]+http-equiv=["']?x-frame-options["']?[^>]*>/gi, '');
      body = Buffer.from(html, 'utf8');
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Content-Security-Policy', "frame-ancestors *");
    res.end(body);
  } catch {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Proxy failed');
  }
}

export default handleProxyPage;
