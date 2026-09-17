/**
 * Migration: add phone_number column to user table
 */
import { db } from '../client.js';
import { sql } from 'drizzle-orm';

let ran = false;
export async function runAddPhoneNumberMigration() {
  if (ran) return;
  ran = true;
  try {
    // Check if column already exists first
    const rows = await db.execute(sql`
      SELECT COUNT(*) as cnt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'user'
        AND COLUMN_NAME = 'phone_number'
    `);
    const count = (rows[0] as unknown as Array<{ cnt: number }>)[0]?.cnt ?? 0;
    if (Number(count) > 0) {
      console.log('[migration] add_phone_number: column already exists, skipping');
      return;
    }
    await db.execute(sql`
      ALTER TABLE \`user\`
      ADD COLUMN \`phone_number\` VARCHAR(30) NULL
    `);
    console.log('[migration] add_phone_number: done');
  } catch (e) {
    console.error('[migration] add_phone_number failed:', e);
  }
}
