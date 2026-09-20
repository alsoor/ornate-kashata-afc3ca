/**
 * POST /api/company/verify-certificate
 *
 * Real document reading pipeline for commercial-registration and trade-license
 * certificates (Kuwait / GCC style Arabic+English docs).
 *
 * Pipeline:
 *   1) Prefer xAI Grok vision (same family as Grok chat) with detail=high
 *   2) Fallback to Anthropic Claude vision if XAI is unavailable
 *   3) Server-side digit normalization + expiry date check
 *
 * Request body (JSON):
 *   {
 *     documentType: 'commercial_registry' | 'trade_license',
 *     expectedNumber: string,
 *     fileName?: string,
 *     dataUrl: string   // data:<mime>;base64,...
 *   }
 *
 * Response (JSON):
 *   {
 *     valid: boolean,
 *     message?: string,
 *     extractedNumber?: string | null,
 *     extractedExpiryDate?: string | null,
 *     isExpired?: boolean,
 *     numbersMatch?: boolean,
 *     isCertificate?: boolean,
 *     provider?: 'xai' | 'anthropic'
 *   }
 *
 * Env:
 *   XAI_API_KEY          (preferred)  — Grok vision
 *   XAI_VERIFY_MODEL     optional, default grok-4.6
 *   ANTHROPIC_API_KEY    fallback
 *   ANTHROPIC_VERIFY_MODEL optional, default claude-sonnet-5
 *
 * Express: app.use(express.json({ limit: '15mb' }));
 */
const XAI_API_KEY = process.env.XAI_API_KEY || process.env.GROK_API_KEY || '';
const XAI_MODEL = process.env.XAI_VERIFY_MODEL || 'grok-4.6';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_VERIFY_MODEL || 'claude-sonnet-5';
const MAX_DATA_URL_LENGTH = 12 * 1024 * 1024;

type DocumentType = 'commercial_registry' | 'trade_license';

interface VerifyBody {
  documentType?: DocumentType;
  expectedNumber?: string;
  fileName?: string;
  dataUrl?: string;
}

interface AiVerdict {
  isCertificate?: boolean;
  extractedNumber?: string | null;
  allNumbersFound?: string[] | null;
  numbersMatch?: boolean;
  extractedExpiryDate?: string | null;
  isExpired?: boolean;
  reason?: string;
  rawTextSnippet?: string | null;
}

interface VerifyBodyOut {
  valid: boolean;
  message?: string;
  extractedNumber?: string | null;
  extractedExpiryDate?: string | null;
  isExpired?: boolean;
  numbersMatch?: boolean;
  isCertificate?: boolean;
  provider?: 'xai' | 'anthropic';
}

interface VerifyResult {
  status: number;
  body: VerifyBodyOut;
}

function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } | null {
  try {
    const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl);
    if (!match) return null;
    return { mediaType: match[1].trim().toLowerCase(), base64: match[2] };
  } catch {
    return null;
  }
}

function docLabel(type: DocumentType): string {
  return type === 'commercial_registry'
    ? 'commercial registration certificate (سجل تجاري)'
    : 'trade license certificate (ترخيص تجاري / رخصة تجارية)';
}

function digitsOnly(raw: string | null | undefined): string {
  if (!raw) return '';
  const arabicIndic = '٠١٢٣٤٥٦٧٨٩';
  const s = String(raw);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const ai = arabicIndic.indexOf(ch);
    if (ai >= 0) out += String(ai);
    else if (ch >= '0' && ch <= '9') out += ch;
  }
  return out;
}

function numbersEqual(expected: string, extracted: string | null | undefined): boolean {
  try {
    const a = digitsOnly(expected);
    const b = digitsOnly(extracted);
    if (!a || !b) return false;
    if (a === b) return true;
    const a2 = a.replace(/^0+/, '') || '0';
    const b2 = b.replace(/^0+/, '') || '0';
    if (a2 === b2) return true;
    const minLen = 4;
    if (a.length >= minLen && b.length >= minLen) {
      if (a.endsWith(b) || b.endsWith(a)) return true;
      if (a.startsWith(b) || b.startsWith(a)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** True if expected digits appear in any candidate from the document. */
function matchAnyCandidate(expected: string, candidates: Array<string | null | undefined>): boolean {
  for (const c of candidates) {
    if (c && numbersEqual(expected, c)) return true;
  }
  // Also scan concatenated digit runs inside longer strings
  const a = digitsOnly(expected);
  if (!a || a.length < 4) return false;
  for (const c of candidates) {
    if (!c) continue;
    const b = digitsOnly(c);
    if (b.includes(a) || a.includes(b)) {
      if (Math.min(a.length, b.length) >= 4) return true;
    }
  }
  return false;
}

function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  }
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  const ymd = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  }
  // Arabic-Indic digits in date
  const western = s
    .split('')
    .map((ch) => {
      const ai = '٠١٢٣٤٥٦٧٨٩'.indexOf(ch);
      return ai >= 0 ? String(ai) : ch;
    })
    .join('');
  if (western !== s) return normalizeDate(western);
  return s;
}

function isDateExpired(isoDate: string | null): boolean {
  if (!isoDate) return false;
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return false;
  const exp = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return exp < today;
}

function buildOcrPrompt(documentType: DocumentType, expectedNumber: string, todayIso: string): string {
  return [
    'You are a precise document OCR and verification engine for official Gulf / Kuwait business certificates.',
    'Task: read EVERY visible digit and date on the attached ' + docLabel(documentType) + '.',
    '',
    'User-entered number to match: "' + String(expectedNumber).trim() + '"',
    'Today (UTC): ' + todayIso,
    '',
    'Steps (follow in order):',
    'A) Decide if this image/PDF is a real ' + docLabel(documentType) + ' (not a random photo, blank page, ID card, or unrelated paper).',
    '   Phone photos with glare, blur, tilt, or background are OK if the certificate content is readable.',
    'B) OCR: list ALL registration / license / file numbers visible (Arabic-Indic and Western digits).',
    '   Prefer the main official number field near labels like:',
    '   رقم السجل التجاري, رقم الترخيص, رقم الرخصة, Commercial Registration, License No, CR No.',
    '   Formats often look like: 536769  or  2025/18932  or  2025-18932.',
    'C) Pick the single best primary number as extractedNumber (the one that best matches official CR/license fields).',
    'D) Put every other number you saw into allNumbersFound (array of strings).',
    'E) Find expiry / validity end date (تاريخ الانتهاء, ساري حتى, صالح حتى, Expiry, Valid until).',
    '   Output as YYYY-MM-DD when possible. If none visible, null.',
    'F) isExpired = true only if expiry is strictly before today.',
    'G) numbersMatch = true if extractedNumber OR any entry in allNumbersFound matches the user number',
    '   after ignoring spaces, dashes, slashes, leading zeros, and Arabic vs Western digits.',
    '   Example: user "2025/18932" matches document "18932" or "2025-18932".',
    '',
    'Return ONLY valid JSON (no markdown, no extra text):',
    '{"isCertificate":boolean,"extractedNumber":string|null,"allNumbersFound":string[],"numbersMatch":boolean,"extractedExpiryDate":string|null,"isExpired":boolean,"reason":string,"rawTextSnippet":string|null}',
  ].join('\n');
}

function parseVerdict(textBlock: string): AiVerdict {
  let verdict: AiVerdict = {};
  try {
    const jsonMatch = textBlock.match(/\{[\s\S]*\}/);
    if (jsonMatch) verdict = JSON.parse(jsonMatch[0]) as AiVerdict;
  } catch {
    verdict = {};
  }
  return verdict;
}

async function callGrokVision(
  dataUrl: string,
  mediaType: string,
  prompt: string,
): Promise<{ ok: boolean; text: string; error?: string }> {
  if (!XAI_API_KEY) return { ok: false, text: '', error: 'no-xai-key' };

  // Grok chat completions: images via image_url data URI. PDFs are not reliably
  // supported on this path — caller should skip Grok for application/pdf.
  if (mediaType === 'application/pdf') {
    return { ok: false, text: '', error: 'pdf-use-anthropic' };
  }

  try {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + XAI_API_KEY,
      },
      body: JSON.stringify({
        model: XAI_MODEL,
        temperature: 0,
        max_tokens: 800,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: dataUrl,
                  detail: 'high',
                },
              },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[verify-certificate] xAI error', res.status, errText.slice(0, 500));
      return { ok: false, text: '', error: 'xai-http-' + res.status };
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content || '';
    if (!text) return { ok: false, text: '', error: 'xai-empty' };
    return { ok: true, text };
  } catch (e) {
    console.error('[verify-certificate] xAI fetch failed', e);
    return { ok: false, text: '', error: 'xai-fetch' };
  }
}

async function callClaudeVision(
  base64: string,
  mediaType: string,
  prompt: string,
): Promise<{ ok: boolean; text: string; error?: string }> {
  if (!ANTHROPIC_API_KEY) return { ok: false, text: '', error: 'no-anthropic-key' };

  const isPdf = mediaType === 'application/pdf';
  const contentBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 800,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [contentBlock, { type: 'text', text: prompt }],
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[verify-certificate] Anthropic error', res.status, errText.slice(0, 500));
      return { ok: false, text: '', error: 'anthropic-http-' + res.status };
    }

    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find((b) => b.type === 'text')?.text || '';
    if (!text) return { ok: false, text: '', error: 'anthropic-empty' };
    return { ok: true, text };
  } catch (e) {
    console.error('[verify-certificate] Anthropic fetch failed', e);
    return { ok: false, text: '', error: 'anthropic-fetch' };
  }
}

async function runVerify(body: VerifyBody): Promise<VerifyResult> {
  try {
    const documentType = body.documentType;
    const expectedNumber = body.expectedNumber;
    const dataUrl = body.dataUrl;

    if (documentType !== 'commercial_registry' && documentType !== 'trade_license') {
      return { status: 400, body: { valid: false, message: 'Invalid document type' } };
    }
    if (!expectedNumber || !String(expectedNumber).trim()) {
      return { status: 400, body: { valid: false, message: 'Missing expected number' } };
    }
    if (!dataUrl || typeof dataUrl !== 'string') {
      return { status: 400, body: { valid: false, message: 'No file received' } };
    }
    if (dataUrl.length > MAX_DATA_URL_LENGTH) {
      return { status: 413, body: { valid: false, message: 'File is too large to verify' } };
    }

    const parsed = parseDataUrl(dataUrl);
    if (!parsed) {
      return { status: 400, body: { valid: false, message: 'Unsupported file format' } };
    }

    const isPdf = parsed.mediaType === 'application/pdf';
    const isImage = parsed.mediaType.indexOf('image/') === 0;
    if (!isPdf && !isImage) {
      return { status: 400, body: { valid: false, message: 'Only image or PDF certificates are accepted' } };
    }

    if (!XAI_API_KEY && !ANTHROPIC_API_KEY) {
      console.error('[verify-certificate] No XAI_API_KEY or ANTHROPIC_API_KEY configured');
      return { status: 503, body: { valid: false, message: 'Verification service is not configured' } };
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const prompt = buildOcrPrompt(documentType, String(expectedNumber), todayIso);

    let provider: 'xai' | 'anthropic' | null = null;
    let textBlock = '';

    // Prefer Grok for images (high-detail vision). PDFs go to Claude first.
    if (!isPdf && XAI_API_KEY) {
      const g = await callGrokVision(dataUrl, parsed.mediaType, prompt);
      if (g.ok) {
        provider = 'xai';
        textBlock = g.text;
      } else {
        console.warn('[verify-certificate] Grok unavailable, falling back:', g.error);
      }
    }

    if (!provider && ANTHROPIC_API_KEY) {
      const c = await callClaudeVision(parsed.base64, parsed.mediaType, prompt);
      if (c.ok) {
        provider = 'anthropic';
        textBlock = c.text;
      } else {
        console.error('[verify-certificate] Claude failed:', c.error);
      }
    }

    // Last resort: try the other provider if first path failed
    if (!provider && isPdf && XAI_API_KEY) {
      // PDF not ideal for Grok image path; still try Claude already done.
    }
    if (!provider && !isPdf && ANTHROPIC_API_KEY && !textBlock) {
      const c = await callClaudeVision(parsed.base64, parsed.mediaType, prompt);
      if (c.ok) {
        provider = 'anthropic';
        textBlock = c.text;
      }
    }

    if (!provider || !textBlock) {
      return {
        status: 502,
        body: { valid: false, message: 'Verification service failed, please try again' },
      };
    }

    const verdict = parseVerdict(textBlock);
    if (!textBlock || Object.keys(verdict).length === 0) {
      console.error('[verify-certificate] Could not parse AI verdict. Raw:', textBlock.slice(0, 400));
    }

    const isCertificate = verdict.isCertificate === true;

    const candidates: Array<string | null | undefined> = [
      verdict.extractedNumber,
      ...(Array.isArray(verdict.allNumbersFound) ? verdict.allNumbersFound : []),
      verdict.rawTextSnippet,
    ];
    const serverMatch = matchAnyCandidate(String(expectedNumber).trim(), candidates);
    const numbersMatch = verdict.numbersMatch === true || serverMatch;

    // If primary extracted number is empty but we matched via allNumbersFound, promote a match
    let extractedNumber = verdict.extractedNumber ?? null;
    if ((!extractedNumber || !numbersEqual(String(expectedNumber), extractedNumber)) && numbersMatch) {
      for (const c of candidates) {
        if (c && numbersEqual(String(expectedNumber), c)) {
          extractedNumber = String(c).trim();
          break;
        }
      }
    }

    const extractedExpiryDate = normalizeDate(verdict.extractedExpiryDate ?? null);
    let isExpired = false;
    if (extractedExpiryDate && /^\d{4}-\d{2}-\d{2}$/.test(extractedExpiryDate)) {
      isExpired = isDateExpired(extractedExpiryDate);
    } else if (verdict.isExpired === true) {
      isExpired = true;
    }

    const valid = isCertificate && numbersMatch && !isExpired;

    const baseOut: VerifyBodyOut = {
      valid,
      extractedNumber,
      extractedExpiryDate,
      isExpired,
      numbersMatch,
      isCertificate,
      provider,
    };

    if (!valid) {
      console.log('[verify-certificate] rejected', {
        provider,
        documentType,
        expectedNumber: String(expectedNumber).trim(),
        extractedNumber,
        allNumbersFound: verdict.allNumbersFound ?? null,
        extractedExpiryDate,
        isCertificate,
        numbersMatch,
        isExpired,
        reason: verdict.reason ?? null,
      });

      let message = 'The certificate is invalid or does not match the number entered';
      if (!isCertificate) {
        message = 'The uploaded file does not appear to be a valid certificate';
      } else if (isExpired) {
        message = 'The certificate has expired';
      } else if (!numbersMatch) {
        message = 'The number on the certificate does not match the number entered';
      }

      return { status: 200, body: { ...baseOut, valid: false, message } };
    }

    return { status: 200, body: { ...baseOut, valid: true } };
  } catch (err) {
    console.error('[verify-certificate] unexpected error', err);
    return { status: 500, body: { valid: false, message: 'Verification failed, please try again' } };
  }
}

/** Express default export */
export default async function handler(req: any, res: any) {
  try {
    if (req.method && req.method !== 'POST') {
      return res.status(405).json({ valid: false, message: 'Method not allowed' });
    }
    const body = (req.body || {}) as VerifyBody;
    const result = await runVerify(body);
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[POST /api/company/verify-certificate]', err);
    try {
      return res.status(500).json({ valid: false, message: 'Verification failed, please try again' });
    } catch {
      return undefined;
    }
  }
}

/** Next.js App Router named export */
export async function POST(request: any) {
  try {
    let body: VerifyBody = {};
    try {
      if (request && typeof request.json === 'function') {
        body = (await request.json()) as VerifyBody;
      } else if (request && request.body) {
        body = request.body as VerifyBody;
      }
    } catch (e) {
      console.error('[verify-certificate] failed to read request body', e);
      return jsonResponse(400, { valid: false, message: 'Invalid request body' });
    }
    const result = await runVerify(body);
    return jsonResponse(result.status, result.body);
  } catch (err) {
    console.error('[POST /api/company/verify-certificate]', err);
    return jsonResponse(500, { valid: false, message: 'Verification failed, please try again' });
  }
}

function jsonResponse(status: number, body: VerifyBodyOut) {
  if (typeof Response !== 'undefined') {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return { status, body };
}
