/**
 * POST /api/company/verify-certificate
 *
 * Verifies an uploaded commercial-registration certificate or trade-license
 * certificate during company signup, using Claude's vision API:
 *   1) Confirms the uploaded file genuinely looks like a certificate of the
 *      requested type (not a random photo, a blank page, or an unrelated file).
 *   2) Reads the registration/license number printed on the certificate.
 *   3) Confirms that number matches the number the user typed in the form.
 *
 * Request body (JSON):
 *   {
 *     documentType: 'commercial_registry' | 'trade_license',
 *     expectedNumber: string,
 *     fileName?: string,
 *     dataUrl: string   // data:<mime>;base64,<...> — image or PDF
 *   }
 *
 * Response (JSON):
 *   { valid: true,  extractedNumber?: string | null }
 *   { valid: false, message: string, extractedNumber?: string | null }
 *
 * Requires env var ANTHROPIC_API_KEY. Optional env var
 * ANTHROPIC_VERIFY_MODEL to override the model (defaults to claude-sonnet-5).
 *
 * Compatible with Express (default export handler) and Next.js App Router
 * (named export POST). Ensure the JSON body parser allows large payloads
 * (e.g. express.json({ limit: '15mb' })) because certificates are base64 images.
 */
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_VERIFY_MODEL || 'claude-sonnet-5';
const MAX_DATA_URL_LENGTH = 12 * 1024 * 1024; // ~12MB base64 safety cap

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
  reason?: string;
}

interface VerifyResult {
  status: number;
  body: {
    valid: boolean;
    message?: string;
    extractedNumber?: string | null;
  };
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

/** Convert Arabic-Indic digits to Western digits and strip all non-digit chars. */
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

/**
 * Compare expected form number vs number extracted from the certificate.
 * Equal when digits match after normalizing separators / Arabic digits /
 * leading zeros, or when one is a significant suffix/prefix of the other
 * (e.g. "18932" vs "2025/18932").
 */
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

    const prompt = [
      'You are verifying a ' + docLabel(documentType) + ' uploaded during a business registration flow.',
      'The user typed this number in the form: "' + String(expectedNumber).trim() + '".',
      'Look at the attached document and determine:',
      '1) Whether it genuinely is a certificate of this type (not a random photo, a blank page, an unrelated document, or a screenshot of something else).',
      '   This is very often a photo taken with a phone camera, not a clean scan — accept normal photo conditions',
      '   such as glare, slight blur, skew/rotation, shadows, or background visible around the paper. Only reject',
      '   for (1) if the content itself is clearly not this type of certificate.',
      '   Kuwait / GCC commercial registration and trade license documents (Arabic and/or English) are valid.',
      '2) The registration/license number printed on the certificate.',
      '   Prefer the main official number field. Formats may include year/number (e.g. 2025/18932),',
      '   spaces, dashes, or Arabic-Indic digits.',
      '3) Whether that printed number matches the number the user typed. When comparing, treat these as identical:',
      '   - spaces, dashes, and slashes used as separators',
      '   - leading zeros',
      '   - Arabic-Indic digits vs Western digits — convert before comparing',
      '   - year/number vs number-only when the significant digits match (e.g. "2025/18932" and "18932")',
      '   Only mark numbersMatch as false if the actual significant digits differ once formatting is ignored.',
      '',
      'Reply with ONLY a JSON object, no extra text, in this exact shape:',
      '{"isCertificate": boolean, "extractedNumber": string | null, "numbersMatch": boolean, "reason": string}',
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
          max_tokens: 500,
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
    const valid = isCertificate && numbersMatch;

    if (!valid) {
      console.log('[verify-certificate] rejected', {
        documentType,
        expectedNumber: String(expectedNumber).trim(),
        extractedNumber: verdict.extractedNumber ?? null,
        isCertificate,
        modelNumbersMatch: verdict.numbersMatch === true,
        serverMatch,
        reason: verdict.reason ?? null,
      });
      const message = !isCertificate
        ? 'The uploaded file does not appear to be a valid certificate'
        : 'The number on the certificate does not match the number entered';
      return {
        status: 200,
        body: {
          valid: false,
          message,
          extractedNumber: verdict.extractedNumber ?? null,
        },
      };
    }

    return {
      status: 200,
      body: { valid: true, extractedNumber: verdict.extractedNumber ?? null },
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

function jsonResponse(status: number, body: VerifyResult['body']) {
  // Web Fetch API Response (Next.js / edge)
  if (typeof Response !== 'undefined') {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  // Fallback plain object for custom adapters
  return { status, body };
}
