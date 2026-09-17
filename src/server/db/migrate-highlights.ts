/**
 * One-time migration: create owner_highlights table
 * Run: npx tsx src/server/db/migrate-highlights.ts
 */
import { getDatabaseCredentials } from './config.js';
import mysql from 'mysql2/promise';

async function run() {
  const cfg = getDatabaseCredentials();
  const conn = await mysql.createConnection({
    host: cfg.host, port: cfg.port,
    user: cfg.user, password: cfg.password,
    database: cfg.database,
    ssl: { rejectUnauthorized: false },
  });

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS owner_highlights (
      target_user_id VARCHAR(36) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (target_user_id),
      FOREIGN KEY (target_user_id) REFERENCES user(id) ON DELETE CASCADE
    )
  `);

  console.log('✓ owner_highlights table ready');
  await conn.end();
}

run().catch(e => { console.error(e); process.exit(1); });
