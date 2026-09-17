/**
 * Periodic cleanup job for time-limited DB records.
 * Runs every 60 seconds and deletes expired rows from signal/audio tables.
 *
 * TTLs:
 *   audio_chunks          — 2 minutes  (live audio is ephemeral)
 *   call_signals          — 60 seconds (call events are consumed quickly)
 *   rtc_signals           — 2 minutes  (WebRTC handshake window)
 *   whisper_notifications — 60 seconds (consumed on first poll)
 *   statuses              — per expiresAt column (image=30s, video=60s)
 */
import { db } from './db/client.js';
import { sql } from 'drizzle-orm';

async function cleanup() {
  try {
    await Promise.all([
      db.execute(sql`DELETE FROM audio_chunks          WHERE created_at < DATE_SUB(NOW(), INTERVAL 2  MINUTE)`),
      db.execute(sql`DELETE FROM call_signals          WHERE created_at < DATE_SUB(NOW(), INTERVAL 60 SECOND)`),
      db.execute(sql`DELETE FROM rtc_signals           WHERE created_at < DATE_SUB(NOW(), INTERVAL 2  MINUTE)`),
      db.execute(sql`DELETE FROM whisper_notifications WHERE created_at < DATE_SUB(NOW(), INTERVAL 60 SECOND)`),
      // Statuses: delete rows where expiresAt has passed (set to 24h after upload)
      db.execute(sql`DELETE FROM statuses WHERE expires_at < NOW()`).catch(() => {}),
    ]);
  } catch (e) {
    // Non-fatal — log and continue
    console.error('[cleanup-job] Error during cleanup:', e);
  }
}

export function startCleanupJob(): void {
  // Run immediately on startup, then every 60 seconds
  cleanup();
  setInterval(cleanup, 60_000);
}
