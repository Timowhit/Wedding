import { randomUUID } from 'node:crypto';
import { TRIAL_IDLE_HOURS, TRIAL_TOUCH_MINUTES } from '../constants.js';
import db, { withTransaction } from './db.js';

// Trials deleted per clean-up, so a visitor starting a trial never waits on a large delete.
const CLEANUP_BATCH = 100;
import { createWedding } from './weddings.js';

const PUBLIC_RETURNING = `id, email, display_name, avatar_url, language, created_at, account_type, founding_number,
                          business_name, theme_palette, theme_mode, theme_colors, brand_palette, reminder_emails, is_trial`;

const seedExamples = async (client, weddingId, { tasks, budget, expenses, guests, schedule }) => {
    const column = (rows, key) => rows.map((row) => row[key]);
    await client.query(
        `INSERT INTO checklist_tasks (wedding_id, text, category, due_date, sort_order)
         SELECT $1, t.text, t.category, t.due::date, t.ord
         FROM UNNEST($2::text[], $3::text[], $4::text[]) WITH ORDINALITY AS t(text, category, due, ord);`,
        [weddingId, column(tasks, 'text'), column(tasks, 'category'), column(tasks, 'dueDate')]
    );
    await client.query(`INSERT INTO budget_limits (wedding_id, total) VALUES ($1, $2);`, [weddingId, budget]);
    await client.query(
        `INSERT INTO budget_items (wedding_id, name, category, amount)
         SELECT $1, e.name, e.category, e.amount FROM UNNEST($2::text[], $3::text[], $4::numeric[]) AS e(name, category, amount);`,
        [weddingId, column(expenses, 'name'), column(expenses, 'category'), column(expenses, 'amount')]
    );
    await client.query(
        `INSERT INTO guests (wedding_id, name, rsvp)
         SELECT $1, g.name, g.rsvp FROM UNNEST($2::text[], $3::text[]) AS g(name, rsvp);`,
        [weddingId, column(guests, 'name'), column(guests, 'rsvp')]
    );
    await client.query(
        `INSERT INTO schedule_items (wedding_id, starts_at, title, location)
         SELECT $1, s.starts::time, s.title, s.location FROM UNNEST($2::text[], $3::text[], $4::text[]) AS s(starts, title, location);`,
        [weddingId, column(schedule, 'startsAt'), column(schedule, 'title'), column(schedule, 'location')]
    );
};

/**
 * Creates a trial account and its wedding filled with examples, in one transaction.
 * @param {{displayName: string, language: string, weddingName: string, weddingDate: string}} values
 * @param {{tasks: Array<{text: string, category: string, dueDate: string}>, budget: number, expenses: Array<{name: string, category: string, amount: number}>, guests: Array<{name: string, rsvp: string}>, schedule: Array<{startsAt: string, title: string, location: string}>}} examples
 *   Already translated into the visitor's language.
 * @returns {Promise<Object>} The trial user (public columns).
 */
const createTrial = async ({ displayName, language, weddingName, weddingDate }, examples) =>
    withTransaction(async (client) => {
        const created = await client.query(
            `INSERT INTO users (email, password_hash, display_name, language, is_trial, last_seen_at, reminder_emails)
             VALUES ($1, NULL, $2, $3, TRUE, NOW(), FALSE)
             RETURNING ${PUBLIC_RETURNING};`,
            // An .invalid address is never deliverable (RFC 2606), so nothing is ever sent to a trial.
            [`trial-${randomUUID()}@playground.invalid`, displayName, language]
        );
        const user = created.rows[0];
        const wedding = await createWedding(user.id, { name: weddingName, weddingDate }, client);
        await seedExamples(client, wedding.id, examples);
        return user;
    });

/**
 * Notes that a trial is still in use (at most every TRIAL_TOUCH_MINUTES, to keep writes rare).
 * @param {string} userId
 * @returns {Promise<void>}
 */
const touchTrial = async (userId) => {
    await db.query(
        `UPDATE users SET last_seen_at = NOW()
         WHERE id = $1 AND is_trial AND (last_seen_at IS NULL OR last_seen_at < NOW() - make_interval(mins => $2));`,
        [userId, TRIAL_TOUCH_MINUTES]
    );
};

/**
 * Deletes up to CLEANUP_BATCH trials left alone for TRIAL_IDLE_HOURS, and the weddings that only
 * trials belonged to.
 * @returns {Promise<number>} How many trials were deleted.
 */
const deleteExpiredTrials = async () =>
    withTransaction(async (client) => {
        const expired = await client.query(
            `SELECT id FROM users WHERE is_trial AND last_seen_at < NOW() - make_interval(hours => $1)
             ORDER BY last_seen_at LIMIT $2 FOR UPDATE SKIP LOCKED;`,
            [TRIAL_IDLE_HOURS, CLEANUP_BATCH]
        );
        const ids = expired.rows.map((row) => row.id);
        if (ids.length === 0) return 0;
        await client.query(
            `DELETE FROM weddings w
             WHERE EXISTS (SELECT 1 FROM wedding_members wm WHERE wm.wedding_id = w.id AND wm.user_id = ANY($1))
               AND NOT EXISTS (SELECT 1 FROM wedding_members wm WHERE wm.wedding_id = w.id AND NOT (wm.user_id = ANY($1)));`,
            [ids]
        );
        await client.query(`DELETE FROM users WHERE id = ANY($1) AND is_trial;`, [ids]);
        return ids.length;
    });

/**
 * Turns a trial into a real account (the same row, so its wedding is kept), and gives the
 * wedding its owner's name if it still has the trial's.
 * @param {string} userId
 * @param {{email: string, passwordHash: string, displayName: string, accountType: 'couple'|'planner', businessName: string|null, weddingName: string, trialWeddingName: string}} values
 * @returns {Promise<Object|null>} The account (public columns), or null if it is no longer a trial.
 * @throws {Error} With code 23505 if the email is already registered.
 */
const convertTrial = async (userId, values) =>
    withTransaction(async (client) => {
        const updated = await client.query(
            `UPDATE users SET email = $2, password_hash = $3, display_name = $4, account_type = $5, business_name = $6,
                              is_trial = FALSE, reminder_emails = TRUE, updated_at = NOW()
             WHERE id = $1 AND is_trial
             RETURNING ${PUBLIC_RETURNING};`,
            [userId, values.email, values.passwordHash, values.displayName, values.accountType, values.businessName]
        );
        if (updated.rowCount === 0) return null;
        await client.query(
            `UPDATE weddings SET name = $3
             WHERE name = $2 AND id IN (SELECT wedding_id FROM wedding_members WHERE user_id = $1 AND role = 'owner');`,
            [userId, values.trialWeddingName, values.weddingName]
        );
        return updated.rows[0];
    });

export { createTrial, touchTrial, deleteExpiredTrials, convertTrial };
