/**
 * Sends today's reminder emails (see src/services/reminders.js).
 * Run it once a day from a scheduler, e.g. a Render Cron Job: `npm run reminders`.
 * Running it again on the same day sends nothing new. Needs the same DB_URL, SESSION_SECRET and
 * APP_URL as the web service, plus APP_TIME_ZONE and the SMTP_* settings.
 */
import { pool } from '../src/models/db.js';
import { exitCodeFor, reminderConfigProblems } from '../src/services/reminder-config.js';
import { runReminders } from '../src/services/reminders.js';
import { todayIso } from '../src/utils/today.js';

try {
    const problems = reminderConfigProblems(process.env);
    if (problems.length > 0) {
        console.error(`Reminders not sent: set ${problems.join(' and ')} (the same values as the web service).`);
        process.exitCode = 1;
    } else {
        const today = todayIso();
        const result = await runReminders({ today });
        if (result.configured) {
            console.info(
                `Reminders for ${today}: ${result.sent} sent, ${result.skipped} with nothing due, ${result.failed} failed.`
            );
        }
        process.exitCode = exitCodeFor(result);
    }
} catch (err) {
    console.error(err.message);
    process.exitCode = 1;
} finally {
    await pool.end();
}
