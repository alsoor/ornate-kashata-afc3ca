/**
 * Migration: add video_url, duration, file_size columns to live_sessions
 */
import { db } from '../client.js';
import { sql } from 'drizzle-orm';
import { isAlreadyDoneError } from './_migration_helpers.js';

export async function addLiveRecordingCols() {
  const cols = [
    { name: 'video_url', ddl: 'TEXT NULL' },
    { name: 'duration',  ddl: 'INT NULL' },
    { name: 'file_size', ddl: 'INT NULL' },
  ];

  for (const col of cols) {
    try {
      await db.execute(sql.raw(`ALTER TABLE live_sessions ADD COLUMN ${col.name} ${col.ddl}`));
      console.log(`[migration] live_sessions.${col.name} added`);
    } catch (e: unknown) {
      if (!isAlreadyDoneError(e)) console.error(`[migration] addLiveRecordingCols (${col.name}) error:`, e);
      // else: column already exists — silently skip
    }
  }
}
