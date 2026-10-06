/**
 * compress.ts — ضغط ردود السيرفر (gzip / brotli) بدون أي مكتبة خارجية (node:zlib فقط).
 * يضغط فقط: JSON / نصوص / JS / CSS / SVG / XML. لا يلمس: الصور، الفيديو، الصوت، SSE، طلبات Range، الردود الصغيرة.
 * الاستخدام في entry.ts:  app.use(compressMiddleware());
 */
import { createGzip, createBrotliCompress, constants as zc } from "node:zlib";
import type { IncomingMessage, ServerResponse } from "node:http";

const COMPRESSIBLE = /^(text\/|application\/(json|javascript|x-javascript|xml|manifest\+json|ld\+json|rss\+xml|atom\+xml)|image\/svg\+xml)/i;
const MIN_BYTES = 1024;

export function compressMiddleware() {
  return (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    if (req.method === "HEAD" || req.headers.range) return next();
    const ae = String(req.headers["accept-encoding"] || "");
    const wantBr = /\bbr\b/.test(ae);
    const wantGz = /\bgzip\b/.test(ae);
    if (!wantBr && !wantGz) return next();

    // Vary must be present on every response so caches keep both variants apart.
    const prevVary = String(res.getHeader("Vary") || "");
    if (!/accept-encoding/i.test(prevVary)) res.setHeader("Vary", prevVary ? prevVary + ", Accept-Encoding" : "Accept-Encoding");

    const origWrite = res.write.bind(res) as (...a: any[]) => boolean;
    const origEnd = res.end.bind(res) as (...a: any[]) => ServerResponse;
    let decided = false;
    let stream: ReturnType<typeof createGzip> | null = null;

    const decide = (sizeHint?: number) => {
      if (decided) return;
      decided = true;
      if (res.headersSent) return;
      const type = String(res.getHeader("Content-Type") || "");
      const enc = res.getHeader("Content-Encoding");
      const cc = String(res.getHeader("Cache-Control") || "");
      let len = Number(res.getHeader("Content-Length"));
      if (!Number.isFinite(len) && sizeHint !== undefined) len = sizeHint;
      const status = res.statusCode;
      if (enc || status === 204 || status === 304 || status < 200) return;
      if (/no-transform/i.test(cc)) return;
      if (!COMPRESSIBLE.test(type) || /event-stream/i.test(type)) return;
      if (Number.isFinite(len) && len < MIN_BYTES) return;
      // Hashed build assets are downloaded once per device -> brotli is worth it. Everything else: fast gzip.
      const isAsset = /\.(js|css|mjs)(\?|$)/i.test(String(req.url || "")) && /immutable/i.test(cc);
      const useBr = wantBr && isAsset;
      stream = useBr
        ? createBrotliCompress({ params: { [zc.BROTLI_PARAM_QUALITY]: 4 } })
        : (createGzip({ level: 5 }) as any);
      res.setHeader("Content-Encoding", useBr ? "br" : "gzip");
      res.removeHeader("Content-Length");
      const s = stream!;
      s.on("data", (chunk: Buffer) => { if (origWrite(chunk) === false) s.pause(); });
      s.on("end", () => { origEnd(); });
      s.on("error", () => { try { origEnd(); } catch { /* ignore */ } });
      res.on("drain", () => s.resume());
      res.once("close", () => { try { s.destroy(); } catch { /* ignore */ } });
    };

    (res as any).write = (chunk: any, encoding?: any, cb?: any) => {
      decide();
      if (!stream) return origWrite(chunk, encoding, cb);
      if (typeof encoding === "function") { cb = encoding; encoding = undefined; }
      if (chunk == null) return true;
      const ok = stream.write(typeof chunk === "string" ? Buffer.from(chunk, encoding) : chunk);
      if (typeof cb === "function") process.nextTick(cb);
      return ok;
    };
    (res as any).end = (chunk?: any, encoding?: any, cb?: any) => {
      if (typeof chunk === "function") { cb = chunk; chunk = undefined; encoding = undefined; }
      else if (typeof encoding === "function") { cb = encoding; encoding = undefined; }
      decide(chunk == null ? 0 : typeof chunk === "string" ? Buffer.byteLength(chunk, encoding) : chunk.length);
      if (!stream) return origEnd(chunk, encoding, cb);
      if (typeof cb === "function") res.once("finish", cb);
      if (chunk != null) stream.end(typeof chunk === "string" ? Buffer.from(chunk, encoding) : chunk);
      else stream.end();
      return res;
    };
    next();
  };
}
