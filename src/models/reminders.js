import db from './db.js';
import {
    COUNTED_STATUS,
    REMINDER_KINDS,
    REMINDER_PAST_WEDDING_DAYS,
    REMINDER_ROLES,
    REMINDER_WEEKLY_DAY,
    REMINDER_WINDOW_DAYS
} from '../constants.js';
import { decisionPermissions } from '../middleware/wedding.js';

/**
 * People who may get today's summary: switched on, not yet sent today, daily (or weekly and
 * today is REMINDER_WEEKLY_DAY), and owner, editor or client of at least one wedding. Whether
 * there is anything to report is decided per person.
 * @param {string} today - YYYY-MM-DD in APP_TIME_ZONE.
 * @returns {Promise<Array<{id: string, email: string, display_name: string, language: string, account_type: string, reminder_days: number, reminder_kinds: string[]}>>}
 */
const findReminderCandidates = async (today) => {
    const result = await db.query(
        `SELECT u.id, u.email, u.display_name, u.language, u.account_type, u.reminder_days, u.reminder_kinds
         FROM users u
         WHERE u.reminder_emails AND NOT u.is_trial
           AND (u.reminders_sent_on IS NULL OR u.reminders_sent_on <> $1::date)
           AND (u.reminder_frequency = 'daily' OR EXTRACT(ISODOW FROM $1::date) = $3)
           AND EXISTS (SELECT 1 FROM wedding_members wm WHERE wm.user_id = u.id AND wm.role = ANY($2))
         ORDER BY u.email ASC;`,
        [today, REMINDER_ROLES, REMINDER_WEEKLY_DAY]
    );
    return result.rows;
};

/**
 * What needs attention for one person: per wedding where they are owner, editor or client,
 * booked vendors' unpaid payments and open tasks that are overdue or due within the window,
 * appointments from today to the end of the window, and the decisions waiting on them (open ones for whoever answers, sent-back ones for whoever
 * asks, as decisionPermissions decides). Weddings that ended more than REMINDER_PAST_WEDDING_DAYS
 * ago are left out.
 * @param {string} userId
 * @param {string} today - YYYY-MM-DD in APP_TIME_ZONE.
 * @param {{days?: number, kinds?: string[]}} [prefs] - The person's choices: days ahead (the
 *        window) and which kinds to list; kinds left out come back as empty lists.
 * @returns {Promise<Array<{id: string, name: string, payments: Array<{vendor_name: string, label: string|null, amount: number, due_date: Date, overdue: boolean}>, tasks: Array<{text: string, due_date: Date, overdue: boolean}>, decisions: Array<{title: string, status: string}>, appointments: Array<{title: string, starts_on: Date, starts_at: string|null, location: string|null}>}>>}
 *   Only weddings with at least one item, by name.
 */
const findReminderDigest = async (userId, today, { days = REMINDER_WINDOW_DAYS, kinds = REMINDER_KINDS } = {}) => {
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

    const [payments, tasks, decisions, appointments] = await Promise.all([
        db.query(
            `SELECT p.wedding_id, v.name AS vendor_name, p.label, p.amount::float AS amount, p.due_date,
                    p.due_date < $2::date AS overdue
             FROM vendor_payments p JOIN vendors v ON v.id = p.vendor_id AND v.wedding_id = p.wedding_id
             WHERE p.wedding_id = ANY($1) AND p.paid_on IS NULL AND v.status = $3
               AND p.due_date <= $2::date + $4::int
             ORDER BY p.due_date ASC, v.name ASC;`,
            [ids, today, COUNTED_STATUS, days]
        ),
        db.query(
            `SELECT wedding_id, text, due_date, due_date < $2::date AS overdue
             FROM checklist_tasks
             WHERE wedding_id = ANY($1) AND NOT done AND due_date <= $2::date + $3::int
             ORDER BY due_date ASC, text ASC;`,
            [ids, today, days]
        ),
        db.query(
            `SELECT wedding_id, title, status, created_by FROM decisions
             WHERE wedding_id = ANY($1) AND status IN ('open', 'changes_requested')
             ORDER BY due_date ASC NULLS LAST, created_at ASC;`,
            [ids]
        ),
        // Only ones still to come: a missed meeting can't be helped by a reminder.
        db.query(
            `SELECT wedding_id, title, starts_on, to_char(starts_at, 'HH24:MI') AS starts_at, location
             FROM appointments
             WHERE wedding_id = ANY($1) AND starts_on BETWEEN $2::date AND $2::date + $3::int
             ORDER BY starts_on ASC, starts_at ASC NULLS LAST, title ASC;`,
            [ids, today, days]
        )
    ]);

    return weddings
        .map((wedding) => {
            const { canAsk, canAnswer } = decisionPermissions(wedding);
            const mine = (rows) => rows.filter((row) => row.wedding_id === wedding.id);
            const chosen = (kind, list) => (kinds.includes(kind) ? list : []);
            return {
                id: wedding.id,
                name: wedding.name,
                payments: chosen('payments', mine(payments.rows)),
                tasks: chosen('tasks', mine(tasks.rows)),
                // In a couple's own wedding both partners can answer, but nobody is reminded to
                // answer a question they asked themselves.
                decisions: chosen('decisions', mine(decisions.rows))
                    .filter(
                        (d) =>
                            (d.status === 'open' &&
                                canAnswer &&
                                (wedding.planner_managed || d.created_by !== userId)) ||
                            (d.status === 'changes_requested' && canAsk)
                    )
                    .map(({ title, status }) => ({ title, status })),
                appointments: chosen(
                    'appointments',
                    mine(appointments.rows).map(({ wedding_id: _id, ...row }) => row)
                )
            };
        })
        .filter((w) => w.payments.length + w.tasks.length + w.decisions.length + w.appointments.length > 0);
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
