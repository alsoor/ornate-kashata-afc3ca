/**
 * migrate-signal-tables.ts
 * Creates the persistent signal/audio tables if they don't exist.
 * Uses CREATE TABLE IF NOT EXISTS — safe to call on every boot.
 * Exported as both a direct call and a lazy-init singleton.
 */
import { db } from './client.js';
import { sql } from 'drizzle-orm';

let migrationPromise: Promise<void> | null = null;

export async function migrateSignalTables(): Promise<void> {
  if (migrationPromise) return migrationPromise;

  migrationPromise = (async () => {
    // Audio chunks (binary audio data for HTTP streaming)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS audio_chunks (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        channel_id  VARCHAR(80)  NOT NULL,
        sender_id   VARCHAR(36)  NOT NULL,
        seq         INT          NOT NULL,
        data        MEDIUMBLOB   NOT NULL,
        mime_type   VARCHAR(60)  NOT NULL DEFAULT 'audio/webm;codecs=opus',
        created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_audio_channel_seq (channel_id, seq),
        INDEX idx_audio_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Call signals (incoming / accepted / rejected / ended)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS call_signals (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        to_user_id   VARCHAR(36)  NOT NULL,
        from_user_id VARCHAR(36)  NOT NULL,
        call_id      VARCHAR(80)  NOT NULL,
        action       VARCHAR(20)  NOT NULL,
        mode         VARCHAR(20),
        caller_name  VARCHAR(80),
        created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_call_signals_to (to_user_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // WebRTC signals (offer / answer / ice-candidate)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS rtc_signals (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        call_id      VARCHAR(80)  NOT NULL,
        to_user_id   VARCHAR(36)  NOT NULL,
        from_user_id VARCHAR(36)  NOT NULL,
        type         VARCHAR(30)  NOT NULL,
        payload      TEXT         NOT NULL,
        created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_rtc_key (call_id, to_user_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Whisper notifications
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS whisper_notifications (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        to_user_id   VARCHAR(36)  NOT NULL,
        from_user_id VARCHAR(36)  NOT NULL,
        from_name    VARCHAR(80)  NOT NULL,
        created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_whisper_to (to_user_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    console.log('[migrate-signal-tables] All signal tables ready.');
  })();

  return migrationPromise;
}

/** Ensure tables exist before running a query — call at top of each store function */
export async function ensureSignalTables(): Promise<void> {
  return migrateSignalTables();
}
