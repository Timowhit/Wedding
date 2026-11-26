import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/**
 * Applies the SQL files in src/db/migrations in file-name order. Applied files are recorded in
 * the schema_migrations table, so each one runs once however often this is called. Each file
 * runs in its own transaction: a failing file is rolled back and stops the run.
 * @param {import('pg').Pool} pool
 * @param {{log?: (message: string) => void}} [options]
 * @returns {Promise<string[]>} The files applied by this call.
 */
const migrate = async (pool, { log = () => {} } = {}) => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            filename   TEXT        PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    const { rows } = await pool.query('SELECT filename FROM schema_migrations;');
    const applied = new Set(rows.map((row) => row.filename));
    const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql')).sort();

    const ran = [];
    for (const file of files) {
        if (applied.has(file)) continue;

        const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(sql);
            await client.query('INSERT INTO schema_migrations (filename) VALUES ($1);', [file]);
            await client.query('COMMIT');
            log(`Applied ${file}`);
            ran.push(file);
        } catch (err) {
            await client.query('ROLLBACK');
            throw new Error(`Migration ${file} failed: ${err.message}`, { cause: err });
        } finally {
            client.release();
        }
    }
    return ran;
};

export { migrate };
