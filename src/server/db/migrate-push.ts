/** One-time migration: create push_subscriptions + in_app_notifications tables */
import { db } from './client.js';

export async function migratePush() {
  try {
    await (db as any).$client.execute(`
      CREATE TABLE IF NOT EXISTS \`push_subscriptions\` (
        \`id\`         INT AUTO_INCREMENT PRIMARY KEY,
        \`user_id\`    VARCHAR(255) NOT NULL,
        \`endpoint\`   TEXT NOT NULL,
        \`p256dh\`     TEXT NOT NULL,
        \`auth\`       TEXT NOT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_push_user (\`user_id\`)
      )
    `);
    await (db as any).$client.execute(`
      CREATE TABLE IF NOT EXISTS \`in_app_notifications\` (
        \`id\`         INT AUTO_INCREMENT PRIMARY KEY,
        \`user_id\`    VARCHAR(255) NOT NULL,
        \`type\`       VARCHAR(50) NOT NULL,
        \`title\`      VARCHAR(255) NOT NULL,
        \`body\`       TEXT NOT NULL,
        \`icon\`       VARCHAR(512),
        \`url\`        VARCHAR(512),
        \`is_read\`    BOOLEAN DEFAULT FALSE,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_notif_user (\`user_id\`)
      )
    `);
    console.log('[migrate] push tables ready');
  } catch (e) {
    console.error('[migrate] push tables failed:', e);
  }
}
