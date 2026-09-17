/**
 * Migration: add streak columns to secret_chat_messages
 * is_streak        TINYINT(1) DEFAULT 0  — marks a message as a one-view streak
 * streak_opened_at DATETIME NULL         — when the recipient first opened it
 * streak_duration  INT NULL              — video duration in seconds (for auto-close timer)
 * streak_media_type VARCHAR(10) NULL     — 'photo' | 'video'
 */
import { db } from '../client.js';
import { sql } from 'drizzle-orm';
import { isAlreadyDoneError } from './_migration_helpers.js';

export async function addStreakCols() {
  const cols = [
    `ALTER TABLE secret_chat_messages ADD COLUMN is_streak TINYINT(1) NOT NULL DEFAULT 0`,
    `ALTER TABLE secret_chat_messages ADD COLUMN streak_opened_at DATETIME NULL`,
    `ALTER TABLE secret_chat_messages ADD COLUMN streak_duration INT NULL`,
    `ALTER TABLE secret_chat_messages ADD COLUMN streak_media_type VARCHAR(10) NULL`,
  ];
  for (const q of cols) {
    try {
      await db.execute(sql.raw(q));
    } catch (e: unknown) {
      if (!isAlreadyDoneError(e)) throw e;
    }
  }
  console.log('[migration] streak cols ready');
}
