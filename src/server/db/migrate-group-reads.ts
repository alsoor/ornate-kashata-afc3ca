/** One-time migration: create group_message_reads table if it doesn't exist */
import { db } from './client.js';
import { sql } from 'drizzle-orm';

export async function migrateGroupReads() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS group_message_reads (
        user_id          VARCHAR(36)  NOT NULL,
        group_id         INT          NOT NULL,
        last_read_msg_id INT          NOT NULL DEFAULT 0,
        updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, group_id)
      )
    `);
    console.log('[migrate] group_message_reads table ready');
  } catch (e) {
    console.error('[migrate] group_message_reads failed:', e);
  }
}
