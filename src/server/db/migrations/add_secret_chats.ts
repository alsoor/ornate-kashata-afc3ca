import { db } from '../client.js';
import { isAlreadyDoneError } from './_migration_helpers.js';

export async function addSecretChats() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS secret_chats (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(80) NOT NULL,
        pin_hash VARCHAR(255) NOT NULL,
        created_by VARCHAR(36) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS secret_chat_members (
        id INT AUTO_INCREMENT PRIMARY KEY,
        chat_id INT NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_chat_user (chat_id, user_id),
        FOREIGN KEY (chat_id) REFERENCES secret_chats(id) ON DELETE CASCADE
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS secret_chat_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        chat_id INT NOT NULL,
        sender_id VARCHAR(36) NOT NULL,
        body TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chat_id) REFERENCES secret_chats(id) ON DELETE CASCADE
      )
    `);

    // Add is_system column if missing — use INFORMATION_SCHEMA to avoid the extractRows bug
    try {
      const result = await db.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'secret_chat_messages'
           AND COLUMN_NAME = 'is_system'`
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (result as any)[0] as unknown[];
      if (!rows || rows.length === 0) {
        await db.execute(
          `ALTER TABLE secret_chat_messages ADD COLUMN is_system TINYINT(1) NOT NULL DEFAULT 0`
        );
        console.log('[migration] added is_system column to secret_chat_messages');
      }
    } catch (colErr: unknown) {
      if (!isAlreadyDoneError(colErr)) {
        console.error('[migration] is_system column check failed:', colErr instanceof Error ? colErr.message : String(colErr));
      }
    }

    // Add type column if missing
    try {
      const r2 = await db.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'secret_chat_messages'
           AND COLUMN_NAME = 'type'`
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows2 = (r2 as any)[0] as unknown[];
      if (!rows2 || rows2.length === 0) {
        await db.execute(
          `ALTER TABLE secret_chat_messages ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'text'`
        );
        console.log('[migration] added type column to secret_chat_messages');
      }
    } catch (e2: unknown) {
      if (!isAlreadyDoneError(e2)) console.error('[migration] type column check failed:', String(e2));
    }

    // Add duration column if missing
    try {
      const r3 = await db.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'secret_chat_messages'
           AND COLUMN_NAME = 'duration'`
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows3 = (r3 as any)[0] as unknown[];
      if (!rows3 || rows3.length === 0) {
        await db.execute(
          `ALTER TABLE secret_chat_messages ADD COLUMN duration INT NULL DEFAULT NULL`
        );
        console.log('[migration] added duration column to secret_chat_messages');
      }
    } catch (e3: unknown) {
      if (!isAlreadyDoneError(e3)) console.error('[migration] duration column check failed:', String(e3));
    }

    console.log('[migration] secret_chats tables ready');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes('ER_TABLE_EXISTS_ERROR') && !isAlreadyDoneError(e)) {
      console.error('[migration] addSecretChats:', msg);
    }
  }
}
