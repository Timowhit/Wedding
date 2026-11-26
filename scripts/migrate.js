/**
 * Brings the database schema up to date.
 * Usage: npm run migrate   (reads DB_URL from .env)
 */
import { migrate } from '../src/db/migrate.js';
import { pool } from '../src/models/db.js';

try {
    const applied = await migrate(pool, { log: console.info });
    console.info(applied.length === 0 ? 'Database is up to date.' : `${applied.length} migration(s) applied.`);
} catch (err) {
    console.error(err.message);
    process.exitCode = 1;
} finally {
    await pool.end();
}
