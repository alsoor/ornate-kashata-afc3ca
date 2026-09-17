import { db } from '../client.js';
import { sql } from 'drizzle-orm';

export async function addTextPostSocial(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS post_hashtags (
      id INT AUTO_INCREMENT PRIMARY KEY,
      post_id INT NOT NULL,
      tag VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY post_hashtag_unique (post_id, tag),
      KEY post_hashtags_tag_idx (tag),
      CONSTRAINT post_hashtags_post_fk FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS post_reposts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      post_id INT NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY post_repost_unique (post_id, user_id),
      KEY post_reposts_post_idx (post_id),
      CONSTRAINT post_reposts_post_fk FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS post_shares (
      id INT AUTO_INCREMENT PRIMARY KEY,
      post_id INT NOT NULL,
      sender_id VARCHAR(36) NOT NULL,
      recipient_id VARCHAR(36) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY post_share_unique (post_id, sender_id, recipient_id),
      KEY post_shares_recipient_idx (recipient_id),
      CONSTRAINT post_shares_post_fk FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS post_mentions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      post_id INT NOT NULL,
      mentioned_user_id VARCHAR(36) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY post_mention_unique (post_id, mentioned_user_id),
      KEY post_mentions_user_idx (mentioned_user_id),
      CONSTRAINT post_mentions_post_fk FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    )
  `);
}
