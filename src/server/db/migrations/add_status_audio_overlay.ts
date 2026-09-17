/**
 * Migration: add audio_url, overlay_text, overlay_color, overlay_x, overlay_y,
 *            music_badge_x, music_badge_y, music_badge_scale to statuses table.
 * Safe for MySQL 5.7+ — each column is added in its own ALTER so a duplicate-column
 * error on one does not block the others.
 */
import { db } from '../client.js';
import { sql } from 'drizzle-orm';
import { isAlreadyDoneError } from './_migration_helpers.js';

async function addColumnIfMissing(table: string, column: string, definition: string): Promise<void> {
  try {
    // Check existence first
    const rows = await db.execute(sql.raw(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}' AND COLUMN_NAME = '${column}'`
    ));
    const row = (rows as unknown as Array<Record<string, unknown>>)[0];
    const cnt = row ? Number(Object.values(row)[0]) : 0;
    if (cnt > 0) {
      // column already exists
      return;
    }
    await db.execute(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`));
    console.log(`[migration] added column ${table}.${column}`);
  } catch (e) {
    // Log but don't throw — a duplicate-column error (1060) is harmless
    if (!isAlreadyDoneError(e)) {
      console.error(`[migration] error adding ${table}.${column}:`, e instanceof Error ? e.message : String(e));
    }
  }
}

export async function up() {
  await addColumnIfMissing('statuses', 'audio_url',         'TEXT NULL');
  await addColumnIfMissing('statuses', 'overlay_text',      'TEXT NULL');
  await addColumnIfMissing('statuses', 'overlay_color',     'VARCHAR(20) NULL');
  await addColumnIfMissing('statuses', 'overlay_x',         'FLOAT NULL');
  await addColumnIfMissing('statuses', 'overlay_y',         'FLOAT NULL');
  await addColumnIfMissing('statuses', 'music_badge_x',     'FLOAT NULL');
  await addColumnIfMissing('statuses', 'music_badge_y',     'FLOAT NULL');
  await addColumnIfMissing('statuses', 'music_badge_scale', 'FLOAT NULL');
  console.log('[migration] add_status_audio_overlay: done');
}
