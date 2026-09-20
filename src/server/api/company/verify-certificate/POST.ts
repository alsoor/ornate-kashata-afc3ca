/**
 * POST /api/company/verify-certificate
 *
 * Verifies an uploaded commercial-registration or trade-license certificate
 * using Claude vision:
 *   1) Confirms the file is a real certificate of the requested type.
 *   2) Reads the registration/license number printed on the document.
 *   3) Compares that number to the number the user typed.
 *   4) Reads the expiry / validity end date and rejects expired documents.
 *
 * Request body (JSON):
 *   {
 *     documentType: 'commercial_registry' | 'trade_license',
 *     expectedNumber: string,
 *     fileName?: string,
 *     dataUrl: string
 *   }
 *
 * Response (JSON):
 *   {
 *     valid: boolean,
 *     message?: string,
 *     extractedNumber?: string | null,
 *     extractedExpiryDate?: string | null,  // ISO YYYY-MM-DD when known
 *     isExpired?: boolean,
 *     numbersMatch?: boolean,
 *     isCertificate?: boolean
 *   }
 *
 * Requires ANTHROPIC_API_KEY. Optional ANTHROPIC_VERIFY_MODEL
 * (default: claude-sonnet-5).
 *
 * Express body parser must allow large payloads, e.g.:
 *   app.use(express.json({ limit: '15mb' }));
 */
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
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
  numbersMatch?: boolean;
  extractedExpiryDate?: string | null;
  isExpired?: boolean;
  reason?: string;
}

interface VerifyBodyOut {
  valid: boolean;
  message?: string;
  extractedNumber?: string | null;
  extractedExpiryDate?: string | null;
  isExpired?: boolean;
  numbersMatch?: boolean;
  isCertificate?: boolean;
}

interface VerifyResult {
  status: number;
  body: VerifyBodyOut;
}

function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } | null {
  try {
    const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl);
    if (!match) return null;
    return { mediaType: match[1], base64: match[2] };
  } catch {
    return null;
  }
}

function docLabel(type: DocumentType): string {
  return type === 'commercial_registry'
    ? 'commercial registration certificate'
    : 'trade license certificate';
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

/** Normalize AI date strings to YYYY-MM-DD when possible. */
function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // Already ISO-like
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const y = iso[1];
    const m = iso[2].padStart(2, '0');
    const d = iso[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (dmy) {
    const d = dmy[1].padStart(2, '0');
    const m = dmy[2].padStart(2, '0');
    const y = dmy[3];
    return `${y}-${m}-${d}`;
  }
  // YYYY/MM/DD
  const ymd = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (ymd) {
    const y = ymd[1];
    const m = ymd[2].padStart(2, '0');
    const d = ymd[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return s;
}

/** Return true if date (YYYY-MM-DD) is strictly before today (UTC date). */
function isDateExpired(isoDate: string | null): boolean {
  if (!isoDate) return false;
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return false;
  const exp = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return exp < today;
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

    if (!ANTHROPIC_API_KEY) {
      console.error('[verify-certificate] ANTHROPIC_API_KEY is not configured');
      return { status: 503, body: { valid: false, message: 'Verification service is not configured' } };
    }

    const contentBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: parsed.base64 } }
      : { type: 'image', source: { type: 'base64', media_type: parsed.mediaType, data: parsed.base64 } };

    const todayIso = new Date().toISOString().slice(0, 10);

    const prompt = [
      'You are verifying a ' + docLabel(documentType) + ' uploaded during a business registration flow.',
      'The user typed this number in the form: "' + String(expectedNumber).trim() + '".',
      'Today\'s date (UTC) is: ' + todayIso + '.',
      'Look at the attached document carefully and determine:',
      '1) Whether it genuinely is a certificate of this type (not a random photo, blank page, or unrelated document).',
      '   Phone photos with glare, slight blur, skew, shadows, or background around the paper are acceptable.',
      '   Only reject if the content is clearly not this type of certificate.',
      '   Kuwait / GCC commercial registration and trade license documents (Arabic and/or English) are valid.',
      '2) The registration/license number printed on the certificate (main official number field).',
      '   Formats may include year/number (e.g. 2025/18932), spaces, dashes, or Arabic-Indic digits.',
      '3) Whether that printed number matches the number the user typed. Treat as identical:',
      '   - spaces, dashes, slashes as separators',
      '   - leading zeros',
      '   - Arabic-Indic digits vs Western digits',
      '   - year/number vs number-only when significant digits match',
      '4) The expiry / validity end date printed on the certificate (look for expiry, valid until, end date,',
      '   تاريخ الانتهاء, ساري حتى, صالح حتى). Convert to YYYY-MM-DD when possible.',
      '   If no expiry date is visible, set extractedExpiryDate to null and isExpired to false.',
      '5) isExpired: true only if the expiry date is strictly before today (' + todayIso + ').',
      '',
      'Reply with ONLY a JSON object, no extra text, in this exact shape:',
      '{"isCertificate": boolean, "extractedNumber": string | null, "numbersMatch": boolean, "extractedExpiryDate": string | null, "isExpired": boolean, "reason": string}',
    ].join('\n');

    let aiRes: globalThis.Response;
    try {
      aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 600,
          messages: [
            {
              role: 'user',
              content: [contentBlock, { type: 'text', text: prompt }],
            },
          ],
        }),
      });
    } catch (fetchErr) {
      console.error('[verify-certificate] fetch to Anthropic failed', fetchErr);
      return { status: 502, body: { valid: false, message: 'Verification service failed, please try again' } };
    }

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => '');
      console.error('[verify-certificate] Anthropic API error', aiRes.status, errText);
      return { status: 502, body: { valid: false, message: 'Verification service failed, please try again' } };
    }

    let aiData: { content?: Array<{ type: string; text?: string }> } = {};
    try {
      aiData = (await aiRes.json()) as { content?: Array<{ type: string; text?: string }> };
    } catch (parseErr) {
      console.error('[verify-certificate] Failed to parse Anthropic JSON', parseErr);
      return { status: 502, body: { valid: false, message: 'Verification service failed, please try again' } };
    }

    const textBlock = (aiData.content && aiData.content.find((b) => b.type === 'text')?.text) || '';

    let verdict: AiVerdict = {};
    try {
      const jsonMatch = textBlock.match(/\{[\s\S]*\}/);
      if (jsonMatch) verdict = JSON.parse(jsonMatch[0]) as AiVerdict;
    } catch {
      verdict = {};
    }

    if (!textBlock || Object.keys(verdict).length === 0) {
      console.error('[verify-certificate] Could not parse AI verdict. Raw text:', textBlock);
    }

    const isCertificate = verdict.isCertificate === true;
    const serverMatch = numbersEqual(String(expectedNumber).trim(), verdict.extractedNumber);
    const numbersMatch = verdict.numbersMatch === true || serverMatch;

    const extractedExpiryDate = normalizeDate(verdict.extractedExpiryDate ?? null);
    // Prefer server-side expiry check when we have a normalized date
    let isExpired = false;
    if (extractedExpiryDate && /^\d{4}-\d{2}-\d{2}$/.test(extractedExpiryDate)) {
      isExpired = isDateExpired(extractedExpiryDate);
    } else if (verdict.isExpired === true) {
      isExpired = true;
    }

    const valid = isCertificate && numbersMatch && !isExpired;

    const baseOut: VerifyBodyOut = {
      valid,
      extractedNumber: verdict.extractedNumber ?? null,
      extractedExpiryDate,
      isExpired,
      numbersMatch,
      isCertificate,
    };

    if (!valid) {
      console.log('[verify-certificate] rejected', {
        documentType,
        expectedNumber: String(expectedNumber).trim(),
        extractedNumber: verdict.extractedNumber ?? null,
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

      return {
        status: 200,
        body: { ...baseOut, valid: false, message },
      };
    }

    return {
      status: 200,
      body: { ...baseOut, valid: true },
    };
  } catch (err) {
    console.error('[verify-certificate] unexpected error', err);
    return { status: 500, body: { valid: false, message: 'Verification failed, please try again' } };
  }
}

/** Express-style default export: (req, res) => void */
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
