/**
 * Migration: add posts, post_likes, and user_follows tables
 * Idempotent — safe to run multiple times.
 */
import { db } from '../client.js';

export async function addPostsLikesFollows(): Promise<void> {
  const conn = db as any;

  // posts
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS posts (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      user_id      VARCHAR(36) NOT NULL,
      media_url    TEXT NOT NULL,
      media_type   ENUM('video','image') NOT NULL DEFAULT 'video',
      caption      VARCHAR(500),
      thumbnail_url TEXT,
      duration     INT DEFAULT 0,
      like_count   INT NOT NULL DEFAULT 0,
      comment_count INT NOT NULL DEFAULT 0,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_posts_user (user_id),
      INDEX idx_posts_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // post_likes
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS post_likes (
      post_id   INT NOT NULL,
      user_id   VARCHAR(36) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (post_id, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // user_follows
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS user_follows (
      follower_id  VARCHAR(36) NOT NULL,
      following_id VARCHAR(36) NOT NULL,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (follower_id, following_id),
      INDEX idx_follows_following (following_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // post_comments
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS post_comments (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      post_id    INT NOT NULL,
      user_id    VARCHAR(36) NOT NULL,
      body       TEXT NOT NULL,
      parent_comment_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_comments_post (post_id),
      INDEX idx_comments_parent (parent_comment_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
