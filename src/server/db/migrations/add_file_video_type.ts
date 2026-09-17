/**
 * Migration: extend messages.type and group_messages.type ENUM to include 'video' and 'file'
 * MySQL requires ALTER TABLE MODIFY COLUMN to change ENUM values.
 * Idempotent — checks current ENUM definition before altering.
 */
import { db } from '../client.js';

async function columnHasType(table: string, column: string, value: string): Promise<boolean> {
  try {
    const result = await db.execute(
      `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = '${table}'
         AND COLUMN_NAME = '${column}'`
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (result as any)[0] as { COLUMN_TYPE: string }[];
    if (!rows || rows.length === 0) return false;
    return rows[0].COLUMN_TYPE.includes(value);
  } catch {
    return false;
  }
}

export async function addFileVideoType() {
  // ── messages table ──────────────────────────────────────────────────────────
  try {
    const alreadyDone = await columnHasType('messages', 'type', "'file'");
    if (!alreadyDone) {
      await db.execute(
        `ALTER TABLE messages MODIFY COLUMN type ENUM('text','voice','image','video','file') NOT NULL DEFAULT 'text'`
      );
      console.log('[migration] messages.type ENUM extended to include video, file');
    } else {
      console.log('[migration] messages.type already has video/file');
    }
  } catch (e: unknown) {
    console.error('[migration] messages.type alter failed:', String(e));
  }

  // ── group_messages table ────────────────────────────────────────────────────
  try {
    const alreadyDone = await columnHasType('group_messages', 'type', "'file'");
    if (!alreadyDone) {
      await db.execute(
        `ALTER TABLE group_messages MODIFY COLUMN type ENUM('text','voice','image','video','file') NOT NULL DEFAULT 'text'`
      );
      console.log('[migration] group_messages.type ENUM extended to include video, file');
    } else {
      console.log('[migration] group_messages.type already has video/file');
    }
  } catch (e: unknown) {
    // group_messages may not exist — harmless
    console.log('[migration] group_messages.type alter skipped:', String(e));
  }
}
