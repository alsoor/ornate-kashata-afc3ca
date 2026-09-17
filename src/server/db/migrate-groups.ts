/**
 * Ensure groups, group_members, and group_messages tables exist,
 * and that groups.avatar_url column is present.
 * Safe to call on every boot.
 */
import { db } from './client.js';
import { sql } from 'drizzle-orm';

export async function migrateGroups() {
  try {
    // 1. Create groups table if missing
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS \`groups\` (
        \`id\`         INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        \`name\`       VARCHAR(100) NOT NULL,
        \`created_by\` VARCHAR(36)  NOT NULL,
        \`created_at\` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Add avatar_url column if missing (IF NOT EXISTS not supported in all MySQL versions)
    const colRows = await db.execute(sql`
      SELECT COUNT(*) AS cnt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'groups'
        AND COLUMN_NAME  = 'avatar_url'
    `);
    const colCount = (colRows as unknown as [Array<{ cnt: number }>])[0]?.[0]?.cnt ?? 0;
    if (Number(colCount) === 0) {
      await db.execute(sql`ALTER TABLE \`groups\` ADD COLUMN \`avatar_url\` TEXT NULL`);
      console.log('[migrate-groups] groups.avatar_url column added');
    }

    // 3. Create group_members table if missing
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS \`group_members\` (
        \`id\`        INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
        \`group_id\`  INT         NOT NULL,
        \`user_id\`   VARCHAR(36) NOT NULL,
        \`joined_at\` TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY \`uq_group_member\` (\`group_id\`, \`user_id\`)
      )
    `);

    // 4. Create group_messages table if missing
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS \`group_messages\` (
        \`id\`         INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
        \`group_id\`   INT         NOT NULL,
        \`sender_id\`  VARCHAR(36) NOT NULL,
        \`type\`       VARCHAR(20) NOT NULL DEFAULT 'text',
        \`body\`       TEXT        NULL,
        \`file_url\`   TEXT        NULL,
        \`created_at\` TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('[migrate-groups] All group tables ready.');
  } catch (e) {
    console.error('[migrate-groups] error:', e);
  }
}
