import { db } from '../client.js';
import { sql } from 'drizzle-orm';

export async function addStatuses() {
  try {
    // statuses table
    const [rows] = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'statuses'
    `);
    const cnt = (rows as any)?.[0]?.cnt ?? 0;
    if (Number(cnt) === 0) {
      await db.execute(sql`
        CREATE TABLE statuses (
          id         INT AUTO_INCREMENT PRIMARY KEY,
          user_id    VARCHAR(36) NOT NULL,
          media_url  TEXT NOT NULL,
          media_type ENUM('image','video') NOT NULL,
          duration   INT NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
        )
      `);
      console.log('[migration] statuses table created');
    } else {
      console.log('[migration] statuses table already exists, skipping');
    }

    // status_views table
    const [rows2] = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'status_views'
    `);
    const cnt2 = (rows2 as any)?.[0]?.cnt ?? 0;
    if (Number(cnt2) === 0) {
      await db.execute(sql`
        CREATE TABLE status_views (
          id        INT AUTO_INCREMENT PRIMARY KEY,
          status_id INT NOT NULL,
          viewer_id VARCHAR(36) NOT NULL,
          viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          FOREIGN KEY (status_id) REFERENCES statuses(id) ON DELETE CASCADE
        )
      `);
      console.log('[migration] status_views table created');
    } else {
      console.log('[migration] status_views table already exists, skipping');
    }

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS status_comments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        status_id INT NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        body TEXT NOT NULL,
        parent_comment_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        KEY status_comments_status_idx (status_id),
        KEY status_comments_user_idx (user_id),
        CONSTRAINT status_comments_status_fk FOREIGN KEY (status_id) REFERENCES statuses(id) ON DELETE CASCADE,
        CONSTRAINT status_comments_user_fk FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS status_comment_reads (
        status_id INT NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        PRIMARY KEY (status_id, user_id),
        CONSTRAINT status_comment_reads_status_fk FOREIGN KEY (status_id) REFERENCES statuses(id) ON DELETE CASCADE,
        CONSTRAINT status_comment_reads_user_fk FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
      )
    `);
  } catch (e) {
    console.error('[migration] addStatuses error:', e);
  }
}
