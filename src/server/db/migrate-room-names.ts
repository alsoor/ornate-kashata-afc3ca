/**
 * Migration: create room_names table
 * Run once: npx tsx src/server/db/migrate-room-names.ts
 */
import { db } from './client.js';
import { sql } from 'drizzle-orm';

async function run() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS room_names (
      room_id   VARCHAR(10)  NOT NULL PRIMARY KEY,
      name      VARCHAR(40)  NOT NULL,
      updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ room_names table ready');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
