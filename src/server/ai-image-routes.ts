/**
 * Stooorna Ai — Image routes (server side, Express)
 * Place next to ai-icon-patch.ts (same folder as entry.ts) → server/ai-image-routes.ts
 *
 * POST /ai/image-edit      (also /api/ai/image-edit)
 *   multipart/form-data:  prompt (text), images (1–3 files), mode ("edit" | "understand", optional), lang (optional)
 *   → { reply, image_base64?, image_mime? }
 *
 * mode "edit"       → Gemini image model changes the photo (glasses, clothes, background …)
 * mode "understand" → Gemini text/vision model describes / reads / answers about the photo
 *
 * Railway variables (Express service):
 *   GEMINI_API_KEY        required (GOOGLE_API_KEY also accepted)
 *   GEMINI_IMAGE_MODEL    optional, default gemini-2.5-flash-image
 *   GEMINI_TEXT_MODEL     optional, default gemini-2.5-flash
 *   ALLOWED_ORIGINS       optional, comma-separated extra origins
 *
 * Wire it in entry.ts (next to registerAiIconRoutes):
 *   import { registerAiImageRoutes } from "./ai-image-routes.js"; // AI-IMAGE-PATCH
 *   registerAiImageRoutes(app);                                    // AI-IMAGE-PATCH
 *
 * Health check:  GET /ai/image-edit/health  → { ok: true, hasKey: true }
 */
import type { Express, NextFunction, Request, Response } from 'express';
import multer from 'multer';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const PATHS = ['/ai/image-edit', '/api/ai/image-edit'];
const HEALTH = ['/ai/image-edit/health', '/api/ai/image-edit/health'];

const DEFAULT_ORIGINS = [
  'https://www.stooorna.com',
  'https://stooorna.com',
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
  'ionic://localhost',
];

const EDIT_RE =
  /(لبس|البس|ألبس|غير|غيّر|عدل|عدّل|احذف|امسح|شيل|ازل|أزل|ضيف|أضف|اضف|حول|حوّل|اجعل|بدل|استبدل|لون|ارسم|كبر|صغر|حسن|نظار|edit|change|make|add|remove|delete|put|wear|replace|turn|convert|erase|background|filter|enhance|colorize|retouch|cartoon|anime)/i;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 3 } });

function cors(req: Request, res: Response, next: NextFunction) {
  const origin = String(req.headers.origin || '');
  const extra = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const ok = DEFAULT_ORIGINS.includes(origin) || extra.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
  if (origin && ok) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '600');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
}

// tiny per-IP limiter: 12 requests / minute (protects your Gemini bill)
const hits = new Map<string, number[]>();
function rateOk(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < 60_000);
  if (arr.length >= 12) { hits.set(ip, arr); return false; }
  arr.push(now);
  hits.set(ip, arr);
  return true;
}

async function gemini(model: string, key: string, body: unknown, ms = 80_000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error?.message || `Gemini HTTP ${r.status}`);
    return j;
  } finally {
    clearTimeout(t);
  }
}

function readParts(j: any) {
  const ps: any[] = j?.candidates?.[0]?.content?.parts || [];
  let text = '';
  let img: { mime: string; data: string } | null = null;
  for (const p of ps) {
    if (typeof p?.text === 'string') text += p.text;
    const d = p?.inlineData || p?.inline_data;
    if (d?.data && !img) img = { mime: d.mimeType || d.mime_type || 'image/png', data: d.data };
  }
  return { text: text.trim(), img, blocked: j?.promptFeedback?.blockReason as string | undefined };
}

async function handler(req: Request, res: Response) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return res.status(503).json({ detail: 'GEMINI_API_KEY is not set on the server' });

  const ip = String(req.headers['x-forwarded-for'] || req.ip || 'x').split(',')[0].trim();
  if (!rateOk(ip)) return res.status(429).json({ detail: 'Too many requests, slow down' });

  const files = (((req as any).files as any[]) || []).filter(f => String(f.mimetype || '').startsWith('image/'));
  if (!files.length) return res.status(400).json({ detail: 'No image uploaded' });

  const body: any = req.body || {};
  const prompt = String(body.prompt || '').trim();
  const ar = body.lang ? body.lang === 'ar' : /[\u0600-\u06FF]/.test(prompt);
  const mode: 'edit' | 'understand' =
    body.mode === 'edit' || body.mode === 'understand' ? body.mode : prompt && EDIT_RE.test(prompt) ? 'edit' : 'understand';

  const imageParts = files.map(f => ({ inline_data: { mime_type: f.mimetype, data: f.buffer.toString('base64') } }));

  try {
    if (mode === 'edit') {
      const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
      const instruction =
        `Edit the attached image according to this request: "${prompt}". ` +
        `Keep the same people, faces, identity, pose, lighting, background and every other detail exactly as in the original; ` +
        `change only what was requested. Return the edited image.`;
      const j = await gemini(model, key, {
        contents: [{ role: 'user', parts: [{ text: instruction }, ...imageParts] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      });
      const { text, img, blocked } = readParts(j);
      if (img) {
        return res.json({
          reply: text || (ar ? 'تفضل، هذي الصورة بعد التعديل.' : 'Here is your edited image.'),
          image_base64: img.data,
          image_mime: img.mime,
        });
      }
      return res.json({
        reply:
          text ||
          (blocked
            ? ar ? 'ما قدرت أعدل هذي الصورة لأسباب تتعلق بالسلامة. جرب صورة أو طلب ثاني.' : 'I could not edit this image for safety reasons. Try another photo or request.'
            : ar ? 'ما قدرت أطلع صورة معدلة هالمرة. جرب توضح الطلب أكثر.' : 'No edited image came back this time. Try describing the change more clearly.'),
      });
    }

    const model = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';
    const j = await gemini(model, key, {
      systemInstruction: {
        parts: [{
          text:
            'You are Stooorna Ai, the assistant inside the Stooorna social app. Look carefully at the attached image(s) and answer the user. ' +
            'Reply in the same language and dialect the user writes in (Arabic users get Arabic). Be clear and concise. If text is visible in the image and the user asks, read or translate it.',
        }],
      },
      contents: [{ role: 'user', parts: [{ text: prompt || (ar ? 'صف لي هذه الصورة.' : 'Describe this image.') }, ...imageParts] }],
    });
    const { text } = readParts(j);
    return res.json({ reply: text || (ar ? 'ما قدرت أفهم الصورة، جرب مرة ثانية.' : 'I could not read this image, please try again.') });
  } catch (e: any) {
    console.error('[ai-image] failed:', e?.message || e);
    return res.status(502).json({ detail: String(e?.message || 'image request failed').slice(0, 200) });
  }
}

export function registerAiImageRoutes(app: Express) {
  app.options(PATHS, cors);
  app.get(HEALTH, cors, (_req, res) => {
    res.json({ ok: true, hasKey: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) });
  });
  app.post(
    PATHS,
    cors,
    (req: Request, res: Response, next: NextFunction) => {
      upload.array('images', 3)(req, res, (err: any) => (err ? res.status(400).json({ detail: String(err.message || err) }) : next()));
    },
    handler,
  );
  console.log('[ai-image] routes ready: POST /ai/image-edit');
}
