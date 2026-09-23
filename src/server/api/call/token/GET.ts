/**
 * GET /api/call/token?channel=&uid=
 *
 * Generates a signed Agora RTC token using App Certificate.
 * Token expires in 1 hour (3600 seconds).
 *
 * Returns { appId, token, channel, uid } — the client MUST use the returned
 * uid when calling client.join() so it matches the token exactly.
 *
 * Used by both voice and video calls (same channel + uid contract).
 */
import type { Request, Response } from 'express';
import pkg from 'agora-token';
const { RtcTokenBuilder, RtcRole } = pkg;

import { getSecret } from '#airo/secrets';

const AGORA_APP_ID          = '149ef04e839c4132a08efb49d717c436';
const AGORA_APP_CERTIFICATE = String(getSecret('AGORA_APP_CERTIFICATE') ?? '');
const TOKEN_EXPIRY_SECONDS  = 3600; // 1 hour

export default function handler(req: Request, res: Response) {
  const channel = (req.query.channel as string | undefined)?.trim();
  const uidStr  = (req.query.uid     as string | undefined)?.trim() ?? '0';

  if (!channel) {
    res.status(400).json({ error: 'channel query param is required' });
    return;
  }

  if (!AGORA_APP_CERTIFICATE) {
    res.status(500).json({ error: 'AGORA_APP_CERTIFICATE secret is not configured' });
    return;
  }

  // Convert string userId to a numeric uid (Agora requires uint32).
  // Use the SAME algorithm on both server and client so the uid is consistent.
  const uid = uidStr === '0'
    ? 0
    : (Math.abs(
        uidStr.split('').reduce((a, c) => (Math.imul(31, a) + c.charCodeAt(0)) | 0, 0)
      ) % 100_000) || 1;

  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS;

  const token = RtcTokenBuilder.buildTokenWithUid(
    AGORA_APP_ID,
    AGORA_APP_CERTIFICATE,
    channel,
    uid,
    RtcRole.PUBLISHER,
    expiresAt,
    expiresAt,
  ) as string;

  res.json({ appId: AGORA_APP_ID, token, channel, uid });
}
