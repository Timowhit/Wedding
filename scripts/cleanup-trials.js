/**
 * Deletes playground trials left alone for a day, with the weddings only they belonged to.
 * Starting a trial does this too; run it on a schedule if trials are started rarely.
 * Usage: npm run cleanup-trials   (reads DB_URL from .env)
 */
import { deleteExpiredTrials } from '../src/models/trials.js';
import { pool } from '../src/models/db.js';

try {
    const deleted = await deleteExpiredTrials();
    console.info(`${deleted} expired trial(s) deleted.`);
} catch (err) {
    console.error(err.message);
    process.exitCode = 1;
} finally {
    await pool.end();
}
