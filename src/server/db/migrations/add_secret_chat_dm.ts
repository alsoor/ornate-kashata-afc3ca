import { db } from '../client.js';
import { sql } from 'drizzle-orm';

export async function addSecretChatDm() {
  try {
    await db.execute(sql`ALTER TABLE secret_chats ADD COLUMN is_dm TINYINT(1) NOT NULL DEFAULT 0`);
    console.log('[migrate] secret_chats.is_dm added');
  } catch {
    // Column already exists — harmless
  }
  try {
    await db.execute(sql`ALTER TABLE secret_chats MODIFY COLUMN pin_hash VARCHAR(255) NULL`);
    console.log('[migrate] secret_chats.pin_hash made nullable');
  } catch {
    // Already nullable — harmless
  }
}
