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
 * IMPORTANT: the model name MUST be a real, currently available model for
 * your Anthropic API key (check https://docs.claude.com for the current
 * list). An invalid model name makes every single verification fail with
 * the exact same generic "certificate is invalid" message, which looks
 * identical to a real mismatch from the outside — see the error-message
 * fix in this handler and in the frontend for how to tell them apart.
 */
import type { Request, Response } from 'express';

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

function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) return null;
  return { mediaType: match[1], base64: match[2] };
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
  let s = String(raw).trim();
  let out = '';
  for (const ch of s) {
    const ai = arabicIndic.indexOf(ch);
    if (ai >= 0) {
      out += String(ai);
    } else if (ch >= '0' && ch <= '9') {
      out += ch;
    }
  }
  return out;
}

/**
 * Compare expected form number vs number extracted from the certificate.
 * Treats as equal when:
 *  - same digits after removing spaces / dashes / slashes / leading zeros
 *  - Arabic-Indic digits normalized to Western
 *  - one number is a suffix/prefix of the other (e.g. "18932" vs "2025/18932")
 *    as long as the shorter side has at least 4 digits (avoids false positives)
 */
function numbersEqual(expected: string, extracted: string | null | undefined): boolean {
  const a = digitsOnly(expected);
  const b = digitsOnly(extracted);
  if (!a || !b) return false;
  if (a === b) return true;
  // strip leading zeros then compare
  const a2 = a.replace(/^0+/, '') || '0';
  const b2 = b.replace(/^0+/, '') || '0';
  if (a2 === b2) return true;
  // compound formats: year/number — accept if the longer side ends with the shorter
  // (or vice versa) when the shorter has enough digits
  const minLen = 4;
  if (a.length >= minLen && b.length >= minLen) {
    if (a.endsWith(b) || b.endsWith(a)) return true;
    if (a.startsWith(b) || b.startsWith(a)) return true;
  }
  return false;
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ valid: false, message: 'Method not allowed' });
  }

  try {
    const body = (req.body || {}) as VerifyBody;
    const documentType = body.documentType;
    const expectedNumber = body.expectedNumber;
    const dataUrl = body.dataUrl;

    if (documentType !== 'commercial_registry' && documentType !== 'trade_license') {
      return res.status(400).json({ valid: false, message: 'Invalid document type' });
    }
    if (!expectedNumber || !expectedNumber.trim()) {
      return res.status(400).json({ valid: false, message: 'Missing expected number' });
    }
    if (!dataUrl || typeof dataUrl !== 'string') {
      return res.status(400).json({ valid: false, message: 'No file received' });
    }
    if (dataUrl.length > MAX_DATA_URL_LENGTH) {
      return res.status(413).json({ valid: false, message: 'File is too large to verify' });
    }

    const parsed = parseDataUrl(dataUrl);
    if (!parsed) {
      return res.status(400).json({ valid: false, message: 'Unsupported file format' });
    }

    const isPdf = parsed.mediaType === 'application/pdf';
    const isImage = parsed.mediaType.startsWith('image/');
    if (!isPdf && !isImage) {
      return res.status(400).json({ valid: false, message: 'Only image or PDF certificates are accepted' });
    }

    if (!ANTHROPIC_API_KEY) {
      console.error('[verify-certificate] ANTHROPIC_API_KEY is not configured');
      return res.status(503).json({ valid: false, message: 'Verification service is not configured' });
    }

    const contentBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: parsed.base64 } }
      : { type: 'image', source: { type: 'base64', media_type: parsed.mediaType, data: parsed.base64 } };

    const prompt = [
      `You are verifying a ${docLabel(documentType)} uploaded during a business registration flow.`,
      `The user typed this number in the form: "${expectedNumber.trim()}".`,
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
      '   - Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) vs Western digits (0123456789) — convert before comparing',
      '   - year/number vs number-only when the significant digits match (e.g. "2025/18932" and "18932")',
      '   Only mark numbersMatch as false if the actual significant digits differ once the above formatting differences are ignored.',
      '',
      'Reply with ONLY a JSON object, no extra text, in this exact shape:',
      '{"isCertificate": boolean, "extractedNumber": string | null, "numbersMatch": boolean, "reason": string}',
    ].join('\n');

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
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

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => '');
      console.error('[verify-certificate] Anthropic API error', aiRes.status, errText);
      return res.status(502).json({ valid: false, message: 'Verification service failed, please try again' });
    }

    const aiData = (await aiRes.json()) as { content?: Array<{ type: string; text?: string }> };
    const textBlock = aiData.content?.find(b => b.type === 'text')?.text ?? '';

    let verdict: AiVerdict = {};
    try {
      const jsonMatch = textBlock.match(/\{[\s\S]*\}/);
      verdict = jsonMatch ? (JSON.parse(jsonMatch[0]) as AiVerdict) : {};
    } catch {
      verdict = {};
    }

    if (!textBlock || Object.keys(verdict).length === 0) {
      // The model replied but we could not parse a verdict out of it — log the
      // raw text so this is debuggable from server logs instead of looking
      // identical to a genuine certificate mismatch.
      console.error('[verify-certificate] Could not parse AI verdict. Raw text:', textBlock);
    }

    const isCertificate = verdict.isCertificate === true;
    // Trust the model when it says match, OR override with strict server-side digit compare
    // so formatting differences (slashes, Arabic digits, year prefix) do not false-reject.
    const serverMatch = numbersEqual(expectedNumber.trim(), verdict.extractedNumber);
    const numbersMatch = verdict.numbersMatch === true || serverMatch;
    const valid = isCertificate && numbersMatch;

    if (!valid) {
      // Log the model's own reasoning + extracted number server-side so a
      // real mismatch can be told apart from a mis-read during troubleshooting.
      console.log('[verify-certificate] rejected', {
        documentType,
        expectedNumber: expectedNumber.trim(),
        extractedNumber: verdict.extractedNumber ?? null,
        isCertificate,
        modelNumbersMatch: verdict.numbersMatch === true,
        serverMatch,
        reason: verdict.reason ?? null,
      });
      const message = !isCertificate
        ? 'The uploaded file does not appear to be a valid certificate'
        : 'The number on the certificate does not match the number entered';
      return res.json({
        valid: false,
        message,
        extractedNumber: verdict.extractedNumber ?? null,
      });
    }

    return res.json({ valid: true, extractedNumber: verdict.extractedNumber ?? null });
  } catch (err) {
    console.error('[POST /api/company/verify-certificate]', err);
    return res.status(500).json({ valid: false, message: 'Verification failed, please try again' });
  }
}
