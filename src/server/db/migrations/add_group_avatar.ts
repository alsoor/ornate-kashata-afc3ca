import { db } from '../client.js';
import { sql } from 'drizzle-orm';

export async function addGroupAvatar() {
  try {
    // Check if column exists first (IF NOT EXISTS not supported in all MySQL versions)
    const rows = await db.execute(sql`
      SELECT COUNT(*) as cnt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'groups'
        AND COLUMN_NAME  = 'avatar_url'
    `);
    const count = (rows as unknown as [Array<{ cnt: number }>])[0]?.[0]?.cnt ?? 0;
    if (Number(count) > 0) {
      console.log('[migration] groups.avatar_url already exists, skipping');
      return;
    }
    await db.execute(sql`ALTER TABLE \`groups\` ADD COLUMN \`avatar_url\` TEXT NULL`);
    console.log('[migration] groups.avatar_url added');
  } catch (e) {
    console.error('[migration] addGroupAvatar error:', e);
  }
}
