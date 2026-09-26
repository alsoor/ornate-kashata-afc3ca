const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({ uri: process.env.DATABASE_URL });
  const [r] = await c.query('SHOW TABLES');
  const names = r.map((row) => Object.values(row)[0]);
  console.log('vip_status exists:', names.includes('vip_status'));
  console.log('business_directory exists:', names.includes('business_directory'));
  await c.end();
})().catch((e) => console.error('FAIL:', e.message));