require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'schema.sql'),
    'utf8'
  );

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'defaultdb',
    multipleStatements: true,
  });

  try {
    await conn.query(sql);
    console.log('Tables created in database:', process.env.DB_NAME || 'defaultdb');
  } finally {
    await conn.end();
  }
})().catch((err) => {
  console.error('Could not initialize the database:', err.message);
  process.exit(1);
});
