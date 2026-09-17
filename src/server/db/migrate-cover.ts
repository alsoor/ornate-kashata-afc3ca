import { db } from './client.js';
import { sql } from 'drizzle-orm';
import { isAlreadyDoneError } from './migrations/_migration_helpers.js';

export async function migrateCover(): Promise<void> {
  try {
    await db.execute(sql`ALTER TABLE \`user\` ADD COLUMN \`cover_url\` TEXT NULL`);
    console.log('[migrate-cover] cover_url column added');
  } catch (e: unknown) {
    if (!isAlreadyDoneError(e)) console.error('[migrate-cover] error:', e);
    // else: column already exists — silently skip
  }
}
