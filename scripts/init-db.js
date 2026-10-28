// Creates the database and tables by running schema.sql (no mysql CLI needed).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });
  await conn.query(sql);
  await conn.end();
  console.log('Database "budget_manager" and tables created.');
})().catch((err) => {
  console.error('Could not initialise the database:', err.message);
  process.exit(1);
});
