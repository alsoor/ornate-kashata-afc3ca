const mysql = require('mysql2/promise');

const sql = `
CREATE TABLE IF NOT EXISTS vip_status (
  user_id varchar(36) NOT NULL PRIMARY KEY,
  active boolean NOT NULL DEFAULT false,
  since timestamp NULL,
  expires_at timestamp NULL,
  color enum('blue','gold','red','green','gray','pink') NOT NULL DEFAULT 'gold',
  eight_mics boolean NOT NULL DEFAULT false,
  room_music boolean NOT NULL DEFAULT false,
  rename_used boolean NOT NULL DEFAULT false,
  username varchar(50) NULL,
  updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT vip_status_user_id_fk FOREIGN KEY (user_id) REFERENCES \`user\`(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS business_directory (
  user_id varchar(36) NOT NULL PRIMARY KEY,
  username varchar(50) NULL,
  email varchar(255) NULL,
  project_name varchar(255) NULL,
  active boolean NOT NULL DEFAULT false,
  since timestamp NULL,
  expires_at timestamp NULL,
  updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT business_directory_user_id_fk FOREIGN KEY (user_id) REFERENCES \`user\`(id) ON DELETE CASCADE
);
`;

(async () => {
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    multipleStatements: true,
  });
  await c.query(sql);
  console.log('DONE');
  await c.end();
})().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});