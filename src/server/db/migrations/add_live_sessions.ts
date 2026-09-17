import { db } from '../client.js';
import { sql } from 'drizzle-orm';

export async function addLiveSessions() {
  try {
    const [rows] = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'live_sessions'
    `);
    const cnt = (rows as any)?.[0]?.cnt ?? 0;
    if (Number(cnt) === 0) {
      await db.execute(sql`
        CREATE TABLE live_sessions (
          id         INT AUTO_INCREMENT PRIMARY KEY,
          host_id    VARCHAR(36) NOT NULL,
          title      VARCHAR(200) DEFAULT NULL,
          started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          ended_at   TIMESTAMP DEFAULT NULL,
          FOREIGN KEY (host_id) REFERENCES user(id) ON DELETE CASCADE
        )
      `);
      console.log('[migration] live_sessions table created');
    } else {
      console.log('[migration] live_sessions table already exists, skipping');
    }
  } catch (e) {
    console.error('[migration] addLiveSessions error:', e);
  }
}
