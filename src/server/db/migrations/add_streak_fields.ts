/**
 * Migration: add streak (view-once) fields to messages table
 * Idempotent — safe to run multiple times.
 */
import { db } from '../client.js';
import { sql } from 'drizzle-orm';
import { isAlreadyDoneError } from './_migration_helpers.js';

export async function addStreakFields(): Promise<void> {
  // Add is_streak column (marks a view-once message)
  try {
    await db.execute(sql`ALTER TABLE messages ADD COLUMN is_streak TINYINT(1) NOT NULL DEFAULT 0`);
  } catch (e: unknown) {
    if (!isAlreadyDoneError(e)) throw e;
  }

  // Add streak_opened_at — set when recipient opens it
  try {
    await db.execute(sql`ALTER TABLE messages ADD COLUMN streak_opened_at TIMESTAMP NULL DEFAULT NULL`);
  } catch (e: unknown) {
    if (!isAlreadyDoneError(e)) throw e;
  }

  console.log('[startup] Streak fields migration complete.');
}
