import { db } from '../client.js';

/** Ensures private-account state is persisted in every deployed database. */
export async function addUserPrivacyIsPrivate() {
  try {
    const [columns] = await (db as any).$client.execute(
      "SHOW COLUMNS FROM `user_privacy` LIKE 'is_private'",
    );
    if (!Array.isArray(columns) || columns.length === 0) {
      await (db as any).$client.execute(
        'ALTER TABLE `user_privacy` ADD COLUMN `is_private` BOOLEAN NOT NULL DEFAULT FALSE AFTER `who_can_call`',
      );
    }
    console.log('[migrate] user_privacy.is_private ready');
  } catch (error) {
    console.error('[migrate] user_privacy.is_private failed:', error);
  }
}
