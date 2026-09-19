/**
 * سكربت استيراد بيانات من ملفات JSON (مصدّرة من Airo) إلى قاعدة MySQL الجديدة على Railway.
 *
 * طريقة الاستخدام:
 * 1. ثبّت الحزمة اللازمة (مرة وحدة فقط):
 *      npm install mysql2
 *
 * 2. حط كل ملفات الـ JSON اللي فكيت ضغطها (user.json, groups.json, posts.json ...)
 *    داخل مجلد واحد، مثلاً مجلد اسمه "data" بجانب هذا السكربت.
 *
 * 3. جيب رابط الاتصال العام (Public) لقاعدة MySQL من Railway:
 *    - روح لسيرفس MySQL في Railway → Variables → انسخ قيمة MYSQL_PUBLIC_URL
 *      (لازم PUBLIC مو الرابط الداخلي، لأنك بتشغل السكربت من جهازك)
 *
 * 4. شغّل السكربت (استبدل الرابط بالرابط الحقيقي تبعك):
 *
 *    Windows (PowerShell):
 *      $env:DATABASE_URL="mysql://user:pass@host:port/dbname"; node import-data.js ./data
 *
 *    Mac/Linux:
 *      DATABASE_URL="mysql://user:pass@host:port/dbname" node import-data.js ./data
 *
 * السكربت يقرأ كل ملف .json في المجلد، ويحاول يدخل بياناته بالجدول اللي له نفس الاسم.
 * أي عمود موجود بالملف وغير موجود بالجدول يتجاهله تلقائياً.
 * أي صف موجود مسبقاً (نفس المفتاح الأساسي) يتم تجاهله بأمان (INSERT IGNORE) بدون تكرار.
 */

import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';

const DATA_DIR = process.argv[2] || './data';
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ لازم تحدد DATABASE_URL كمتغير بيئة قبل التشغيل. شوف التعليمات فوق السكربت.');
  process.exit(1);
}

if (!fs.existsSync(DATA_DIR)) {
  console.error(`❌ المجلد "${DATA_DIR}" غير موجود. تأكد من المسار.`);
  process.exit(1);
}

async function main() {
  console.log(`🔌 يتصل بقاعدة البيانات...`);
  const conn = await mysql.createConnection(DATABASE_URL);

  // نوقف فحص العلاقات (Foreign Keys) مؤقتاً عشان نقدر ندخل الجداول بأي ترتيب
  await conn.query('SET FOREIGN_KEY_CHECKS=0');

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();

  console.log(`📂 لقيت ${files.length} ملف JSON في "${DATA_DIR}"\n`);

  let totalInserted = 0;
  let totalSkippedTables = 0;

  for (const file of files) {
    const table = path.basename(file, '.json');
    const filePath = path.join(DATA_DIR, file);

    let rows;
    try {
      const raw = fs.readFileSync(filePath, 'utf8').trim();
      rows = raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.log(`⚠️  ${table}: ملف JSON غير صالح، تم تجاوزه`);
      continue;
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      console.log(`-  ${table}: فاضي، تم تجاوزه`);
      continue;
    }

    // نتأكد إن الجدول موجود فعلاً بقاعدة البيانات، ونجيب أسماء أعمدته
    const [colRows] = await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?`,
      [table]
    );

    if (colRows.length === 0) {
      console.log(`⚠️  الجدول "${table}" غير موجود بقاعدة البيانات الجديدة، تم تجاوزه`);
      totalSkippedTables++;
      continue;
    }

    const validCols = new Set(colRows.map((r) => r.COLUMN_NAME));

    let inserted = 0;
    let failed = 0;
    let firstError = null;

    for (const row of rows) {
      const cols = Object.keys(row).filter((c) => validCols.has(c));
      if (cols.length === 0) continue;

      const placeholders = cols.map(() => '?').join(',');
      const values = cols.map((c) => (row[c] === undefined ? null : row[c]));
      const colList = cols.map((c) => `\`${c}\``).join(',');

      const sql = `INSERT IGNORE INTO \`${table}\` (${colList}) VALUES (${placeholders})`;

      try {
        const [result] = await conn.query(sql, values);
        if (result.affectedRows > 0) inserted++;
      } catch (e) {
        failed++;
        if (!firstError) firstError = e.message;
      }
    }

    totalInserted += inserted;
    const status = failed > 0 ? `، ${failed} فشل (${firstError})` : '';
    console.log(`✅ ${table}: ${inserted}/${rows.length} صف${status}`);
  }

  await conn.query('SET FOREIGN_KEY_CHECKS=1');
  await conn.end();

  console.log(`\n🎉 انتهى الاستيراد — إجمالي ${totalInserted} صف تم إدخاله.`);
  if (totalSkippedTables > 0) {
    console.log(`ملاحظة: ${totalSkippedTables} جدول ما كان موجود بقاعدة البيانات (تجاوزناه).`);
  }
}

main().catch((err) => {
  console.error('❌ صار خطأ:', err.message);
  process.exit(1);
});
