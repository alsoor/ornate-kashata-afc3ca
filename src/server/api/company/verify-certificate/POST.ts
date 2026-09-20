/**
 * POST /api/company/verify-certificate
 *
 * AI verification disabled. Certificates are accepted on upload and reviewed
 * manually by the owner in settings (view images / approve or reject company).
 *
 * Kept for backward compatibility with any remaining clients that still call
 * this endpoint. Always returns valid when a file dataUrl is present.
 *
 * Request body (JSON):
 *   { documentType?, expectedNumber?, fileName?, dataUrl: string }
 *
 * Response (JSON):
 *   { valid: true, message?: string } | { valid: false, message: string }
 */
export default async function handler(req: any, res: any) {
  try {
    if (req.method && req.method !== 'POST') {
      return res.status(405).json({ valid: false, message: 'Method not allowed' });
    }
    const body = req.body || {};
    const dataUrl = body.dataUrl;
    if (!dataUrl || typeof dataUrl !== 'string') {
      return res.status(400).json({ valid: false, message: 'No file received' });
    }
    return res.status(200).json({
      valid: true,
      extractedNumber: null,
      extractedExpiryDate: null,
      isExpired: false,
      numbersMatch: true,
      isCertificate: true,
      message: 'Accepted for manual review',
    });
  } catch (err) {
    console.error('[POST /api/company/verify-certificate]', err);
    return res.status(500).json({ valid: false, message: 'Verification failed, please try again' });
  }
}

export async function POST(request: any) {
  try {
    let body: any = {};
    try {
      if (request && typeof request.json === 'function') body = await request.json();
      else if (request && request.body) body = request.body;
    } catch {
      body = {};
    }
    const dataUrl = body.dataUrl;
    if (!dataUrl || typeof dataUrl !== 'string') {
      return jsonResponse(400, { valid: false, message: 'No file received' });
    }
    return jsonResponse(200, {
      valid: true,
      extractedNumber: null,
      extractedExpiryDate: null,
      isExpired: false,
      numbersMatch: true,
      isCertificate: true,
      message: 'Accepted for manual review',
    });
  } catch (err) {
    console.error('[POST /api/company/verify-certificate]', err);
    return jsonResponse(500, { valid: false, message: 'Verification failed, please try again' });
  }
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  if (typeof Response !== 'undefined') {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return { status, body };
}
