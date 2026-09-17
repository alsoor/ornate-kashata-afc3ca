import { db } from '../client.js';
import { sql } from 'drizzle-orm';

/**
 * Migration: extend messages.type ENUM to include 'post_share' and 'call'
 */
export async function addPostShareType(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE messages
      MODIFY COLUMN type ENUM('text','voice','image','video','file','post_share','call') NOT NULL DEFAULT 'text'
    `);
    console.log('[migration] messages.type ENUM extended to include post_share, call');
  } catch (e: any) {
    if (e?.message?.includes('Duplicate') || e?.message?.includes('already exists')) {
      console.log('[migration] messages.type already has post_share/call — skipped');
    } else {
      console.error('[migration] addPostShareType error:', e);
    }
  }
}
