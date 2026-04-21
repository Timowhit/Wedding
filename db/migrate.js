/**
 * @file db/migrate.js
 *
 * Tracks applied migrations in a schema_migrations table so each
 * file only ever runs once, even if you call node db/migrate.js
 * multiple times.
 */

"use strict";

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { pool } = require("./index");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

(async () => {
  // Ensure the tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Find which migrations have already been applied
  const { rows } = await pool.query("SELECT filename FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.filename));

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`Skipping:  ${file} (already applied)`);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    console.log(`Running migration: ${file}`);
    await pool.query(sql);
    await pool.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [
      file,
    ]);
    console.log(`  \u2713 ${file}`);
    ran++;
  }

  if (ran === 0) {
    console.log("\nDatabase is up to date -- nothing to run.");
  } else {
    console.log(`\n${ran} migration(s) applied successfully.`);
  }

  await pool.end();
})().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
