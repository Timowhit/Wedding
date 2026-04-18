/**
 * @file db/migrate.js
 * @description Reads and executes every SQL file in migrations/
 *   in alphabetical order.  Run once:  node db/migrate.js
 */

'use strict';

require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const { pool } = require('./index');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

(async () => {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`Running migration: ${file}`);
    await pool.query(sql);
    console.log(`  ✓ ${file}`);
  }

  console.log('\nAll migrations applied successfully.');
  await pool.end();
})().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
