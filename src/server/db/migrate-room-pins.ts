/**
 * One-time migration: create room_pins table if it doesn't exist
 */
import { db } from './client.js';
import { sql } from 'drizzle-orm';

export async function migrateRoomPins() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS room_pins (
        room_id   VARCHAR(10)  NOT NULL PRIMARY KEY,
        pin_hash  VARCHAR(255) NOT NULL,
        updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('[migrate] room_pins table ready');
  } catch (e) {
    console.error('[migrate] room_pins failed:', e);
  }
}
