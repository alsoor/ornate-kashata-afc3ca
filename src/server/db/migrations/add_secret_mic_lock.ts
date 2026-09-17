import { db } from '../client.js';
import { sql } from 'drizzle-orm';

export async function addSecretMicLock() {
  // Standalone table: one row = current mic lock state for the secret room
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS secret_mic_lock (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        locked_by    VARCHAR(255) NOT NULL,
        locked_name  VARCHAR(255) NOT NULL,
        locked_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[migrate] secret_mic_lock table ready');
  } catch (e) {
    console.error('[migrate] secret_mic_lock failed:', e);
  }
}
