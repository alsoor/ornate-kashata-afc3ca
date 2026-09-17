import { db } from '../client.js';
import { sql } from 'drizzle-orm';
import { isAlreadyDoneError } from './_migration_helpers.js';

export async function addSecretRoomJoins() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS secret_room_joins (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        user_id    VARCHAR(255) NOT NULL,
        user_name  VARCHAR(255) NOT NULL,
        joined_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_user_id (user_id),
        INDEX idx_joined_at (joined_at DESC)
      )
    `);
    console.log('[migrate] secret_room_joins table ready');
  } catch (e: unknown) {
    if (!isAlreadyDoneError(e)) console.error('[migrate] secret_room_joins failed:', e);
  }

  // Add UNIQUE KEY if table already existed without it
  try {
    await db.execute(sql`ALTER TABLE secret_room_joins ADD UNIQUE KEY uq_user_id (user_id)`);
    console.log('[migrate] secret_room_joins unique key added');
  } catch (e: unknown) {
    // 1061 = duplicate key name, 1060 = duplicate column, 1062 = dup entry — all mean already done
    if (!isAlreadyDoneError(e)) console.error('[migrate] secret_room_joins unique key error:', e);
  }
}
