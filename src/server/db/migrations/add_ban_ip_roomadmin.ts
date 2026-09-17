import { db } from '../client.js';
import { sql } from 'drizzle-orm';
import { isAlreadyDoneError } from './_migration_helpers.js';

export async function addBanIpRoomAdmin() {
  try {
    await db.execute(sql`ALTER TABLE user ADD COLUMN is_banned BOOLEAN NOT NULL DEFAULT FALSE`);
  } catch (e: unknown) {
    if (!isAlreadyDoneError(e)) console.error('[migration] is_banned:', e);
  }
  try {
    await db.execute(sql`ALTER TABLE user ADD COLUMN last_ip VARCHAR(45)`);
  } catch (e: unknown) {
    if (!isAlreadyDoneError(e)) console.error('[migration] last_ip:', e);
  }
  try {
    await db.execute(sql`ALTER TABLE user ADD COLUMN is_room_admin BOOLEAN NOT NULL DEFAULT FALSE`);
  } catch (e: unknown) {
    if (!isAlreadyDoneError(e)) console.error('[migration] is_room_admin:', e);
  }
}
