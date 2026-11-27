import db from './db.js';
import { COUNTED_STATUS, REMINDER_PAST_WEDDING_DAYS, REMINDER_ROLES, REMINDER_WINDOW_DAYS } from '../constants.js';
import { decisionPermissions } from '../middleware/wedding.js';

/**
 * People who may get today's summary: switched on, not yet sent today, and owner, editor or
 * client of at least one wedding. Whether there is anything to report is decided per person.
 * @param {string} today - YYYY-MM-DD in APP_TIME_ZONE.
 * @returns {Promise<Array<{id: string, email: string, display_name: string, language: string, account_type: string}>>}
 */
const findReminderCandidates = async (today) => {
    const result = await db.query(
        `SELECT u.id, u.email, u.display_name, u.language, u.account_type
         FROM users u
         WHERE u.reminder_emails AND NOT u.is_trial
           AND (u.reminders_sent_on IS NULL OR u.reminders_sent_on <> $1::date)
           AND EXISTS (SELECT 1 FROM wedding_members wm WHERE wm.user_id = u.id AND wm.role = ANY($2))
         ORDER BY u.email ASC;`,
        [today, REMINDER_ROLES]
    );
    return result.rows;
};

/**
 * What needs attention for one person: per wedding where they are owner, editor or client,
 * booked vendors' unpaid payments and open tasks that are overdue or due within the window,
 * and the decisions waiting on them (open ones for whoever answers, sent-back ones for whoever
 * asks, as decisionPermissions decides). Weddings that ended more than REMINDER_PAST_WEDDING_DAYS
 * ago are left out.
 * @param {string} userId
 * @param {string} today - YYYY-MM-DD in APP_TIME_ZONE.
 * @returns {Promise<Array<{id: string, name: string, payments: Array<{vendor_name: string, label: string|null, amount: number, due_date: Date, overdue: boolean}>, tasks: Array<{text: string, due_date: Date, overdue: boolean}>, decisions: Array<{title: string, status: string}>}>>}
 *   Only weddings with at least one item, by name.
 */
const findReminderDigest = async (userId, today) => {
    const weddings = (
        await db.query(
            `SELECT w.id, w.name, w.planner_managed, wm.role
             FROM weddings w JOIN wedding_members wm ON wm.wedding_id = w.id
             WHERE wm.user_id = $1 AND wm.role = ANY($2)
               AND (w.wedding_date IS NULL OR w.wedding_date >= $3::date - $4::int)
               AND w.archived_at IS NULL
             ORDER BY LOWER(w.name) ASC, w.id ASC;`,
            [userId, REMINDER_ROLES, today, REMINDER_PAST_WEDDING_DAYS]
        )
    ).rows;
    if (weddings.length === 0) return [];
    const ids = weddings.map((w) => w.id);

    const [payments, tasks, decisions] = await Promise.all([
        db.query(
            `SELECT p.wedding_id, v.name AS vendor_name, p.label, p.amount::float AS amount, p.due_date,
                    p.due_date < $2::date AS overdue
             FROM vendor_payments p JOIN vendors v ON v.id = p.vendor_id AND v.wedding_id = p.wedding_id
             WHERE p.wedding_id = ANY($1) AND p.paid_on IS NULL AND v.status = $3
               AND p.due_date <= $2::date + $4::int
             ORDER BY p.due_date ASC, v.name ASC;`,
            [ids, today, COUNTED_STATUS, REMINDER_WINDOW_DAYS]
        ),
        db.query(
            `SELECT wedding_id, text, due_date, due_date < $2::date AS overdue
             FROM checklist_tasks
             WHERE wedding_id = ANY($1) AND NOT done AND due_date <= $2::date + $3::int
             ORDER BY due_date ASC, text ASC;`,
            [ids, today, REMINDER_WINDOW_DAYS]
        ),
        db.query(
            `SELECT wedding_id, title, status, created_by FROM decisions
             WHERE wedding_id = ANY($1) AND status IN ('open', 'changes_requested')
             ORDER BY due_date ASC NULLS LAST, created_at ASC;`,
            [ids]
        )
    ]);

    return weddings
        .map((wedding) => {
            const { canAsk, canAnswer } = decisionPermissions(wedding);
            const mine = (rows) => rows.filter((row) => row.wedding_id === wedding.id);
            return {
                id: wedding.id,
                name: wedding.name,
                payments: mine(payments.rows),
                tasks: mine(tasks.rows),
                // In a couple's own wedding both partners can answer, but nobody is reminded to
                // answer a question they asked themselves.
                decisions: mine(decisions.rows)
                    .filter(
                        (d) =>
                            (d.status === 'open' &&
                                canAnswer &&
                                (wedding.planner_managed || d.created_by !== userId)) ||
                            (d.status === 'changes_requested' && canAsk)
                    )
                    .map(({ title, status }) => ({ title, status }))
            };
        })
        .filter((w) => w.payments.length + w.tasks.length + w.decisions.length > 0);
};

/**
 * Records that today's summary went out, so the job never sends twice on one day.
 * @param {string} userId
 * @param {string} today - YYYY-MM-DD in APP_TIME_ZONE.
 * @returns {Promise<void>}
 */
const markReminded = async (userId, today) => {
    await db.query('UPDATE users SET reminders_sent_on = $2 WHERE id = $1;', [userId, today]);
};

export { findReminderCandidates, findReminderDigest, markReminded };
