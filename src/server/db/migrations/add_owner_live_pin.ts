import { db } from '../client.js';
import { sql } from 'drizzle-orm';

export async function addOwnerLivePin() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS owner_live_pin (
        id INT PRIMARY KEY DEFAULT 1,
        pin_value VARCHAR(8) NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('[migrate] owner_live_pin table ready');
  } catch (e) {
    console.error('[migrate] owner_live_pin failed:', e);
  }
}
