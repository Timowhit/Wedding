/**
 * Sends today's reminder emails (see src/services/reminders.js).
 * Run it once a day from a scheduler, e.g. a Render Cron Job: `npm run reminders`.
 * Running it again on the same day sends nothing new. Needs DB_URL, SESSION_SECRET, APP_URL,
 * APP_TIME_ZONE and the SMTP_* settings.
 */
import { pool } from '../src/models/db.js';
import { runReminders } from '../src/services/reminders.js';
import { todayIso } from '../src/utils/today.js';

try {
    const today = todayIso();
    const { sent, skipped, failed, configured } = await runReminders({ today });
    if (configured)
        console.info(`Reminders for ${today}: ${sent} sent, ${skipped} with nothing due, ${failed} failed.`);
    if (failed > 0) process.exitCode = 1;
} catch (err) {
    console.error(err.message);
    process.exitCode = 1;
} finally {
    await pool.end();
}
