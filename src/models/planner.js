import db, { withTransaction } from './db.js';
import { claimFoundingNumber } from './founding.js';
import { findCommittedByWedding } from './payments.js';
import { createWedding } from './weddings.js';

/** Weddings a planner sees on the dashboard: every wedding they belong to. */
const WHEN_FILTERS = Object.freeze({
    upcoming: '(w.wedding_date IS NULL OR w.wedding_date >= CURRENT_DATE) AND w.archived_at IS NULL',
    past: 'w.wedding_date < CURRENT_DATE AND w.archived_at IS NULL',
    archived: 'w.archived_at IS NOT NULL',
    all: 'TRUE'
});
const DEADLINES_PER_WEDDING = 3;

/** Escapes LIKE wildcards so a search for "50%" matches the text "50%". */
const likePattern = (text) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * The planner dashboard: one row per wedding with what needs attention.
 * @param {string} userId
 * @param {{q?: string, when?: 'upcoming'|'past'|'all'}} [filters] - Already validated.
 * @returns {Promise<Array<{id: string, name: string, wedding_date: Date|null, role: string, open_decisions: number, changes_requested: number, overdue_tasks: number, committed: number, budget_limit: number, guests_total: number, guests_confirmed: number, deadlines: Array<{kind: 'task'|'decision', title: string, due_date: Date, overdue: boolean}>}>>}
 */
const findPlannerOverview = async (userId, { q = '', when = 'upcoming' } = {}) => {
    const whenSql = WHEN_FILTERS[when] ?? WHEN_FILTERS.upcoming;
    const weddings = await db.query(
        `SELECT w.id, w.name, w.wedding_date, wm.role,
                (SELECT COUNT(*) FROM decisions d WHERE d.wedding_id = w.id AND d.status = 'open')::int AS open_decisions,
                (SELECT COUNT(*) FROM decisions d WHERE d.wedding_id = w.id AND d.status = 'changes_requested')::int
                    AS changes_requested,
                (SELECT COUNT(*) FROM checklist_tasks t
                  WHERE t.wedding_id = w.id AND NOT t.done AND t.due_date < CURRENT_DATE)::int AS overdue_tasks,
                (SELECT COALESCE(MAX(total), 0) FROM budget_limits l WHERE l.wedding_id = w.id)::float AS budget_limit,
                (SELECT COUNT(*) FROM guests g WHERE g.wedding_id = w.id)::int AS guests_total,
                (SELECT COUNT(*) FROM guests g WHERE g.wedding_id = w.id AND g.rsvp = 'Confirmed')::int AS guests_confirmed
         FROM weddings w
         JOIN wedding_members wm ON wm.wedding_id = w.id AND wm.user_id = $1
         WHERE ${whenSql} AND ($2 = '' OR w.name ILIKE $3)
         ORDER BY w.wedding_date ASC NULLS LAST, LOWER(w.name) ASC, w.id ASC;`,
        [userId, q, likePattern(q)]
    );
    if (weddings.rows.length === 0) return [];

    // The next few dated items per wedding, tasks and decisions together, soonest first.
    const deadlines = await db.query(
        `SELECT wedding_id, kind, title, due_date, due_date < CURRENT_DATE AS overdue
         FROM (
             SELECT x.*, ROW_NUMBER() OVER (PARTITION BY x.wedding_id ORDER BY x.due_date, x.title) AS position
             FROM (
                 SELECT wedding_id, 'task' AS kind, text AS title, due_date
                 FROM checklist_tasks WHERE NOT done AND due_date IS NOT NULL AND wedding_id = ANY($1)
                 UNION ALL
                 SELECT wedding_id, 'decision' AS kind, title, due_date
                 FROM decisions WHERE status <> 'approved' AND due_date IS NOT NULL AND wedding_id = ANY($1)
             ) x
         ) ranked
         WHERE position <= $2
         ORDER BY due_date, title;`,
        [weddings.rows.map((w) => w.id), DEADLINES_PER_WEDDING]
    );
    const committed = await findCommittedByWedding(weddings.rows.map((w) => w.id));
    return weddings.rows.map((wedding) => ({
        ...wedding,
        committed: committed.get(wedding.id) ?? 0,
        deadlines: deadlines.rows.filter((d) => d.wedding_id === wedding.id)
    }));
};

/**
 * Totals across all of a planner's weddings, for the top of the dashboard. Decisions count only
 * those waiting on couples, like the per-wedding cards; sent-back ones are shown on each card.
 * @param {string} userId
 * @returns {Promise<{weddingsThisMonth: number, openDecisions: number, overdueTasks: number}>}
 */
const findPlannerWorkload = async (userId) => {
    const result = await db.query(
        `WITH mine AS (SELECT wm.wedding_id FROM wedding_members wm JOIN weddings aw ON aw.id = wm.wedding_id
                       WHERE wm.user_id = $1 AND aw.archived_at IS NULL)
         SELECT
           (SELECT COUNT(*) FROM weddings w JOIN mine ON mine.wedding_id = w.id
             WHERE date_trunc('month', w.wedding_date) = date_trunc('month', CURRENT_DATE))::int AS weddings_this_month,
           (SELECT COUNT(*) FROM decisions d JOIN mine ON mine.wedding_id = d.wedding_id
             WHERE d.status = 'open')::int AS open_decisions,
           (SELECT COUNT(*) FROM checklist_tasks t JOIN mine ON mine.wedding_id = t.wedding_id
             WHERE NOT t.done AND t.due_date < CURRENT_DATE)::int AS overdue_tasks;`,
        [userId]
    );
    const row = result.rows[0];
    return {
        weddingsThisMonth: row.weddings_this_month,
        openDecisions: row.open_decisions,
        overdueTasks: row.overdue_tasks
    };
};

/**
 * A planner adds a client wedding. In one transaction: the wedding is created with the planner
 * as owner, marked as a planner wedding, and the planner's founding number is claimed if this is
 * their first planner wedding and spots remain.
 * @param {string} plannerId
 * @param {{name: string, weddingDate: string|null}} values - Already validated.
 * @returns {Promise<{wedding: {id: string, name: string}, foundingNumber: number|null}>}
 */
const createClientWedding = async (plannerId, { name, weddingDate }) =>
    withTransaction(async (client) => {
        const wedding = await createWedding(plannerId, { name, weddingDate }, client);
        await client.query('UPDATE weddings SET planner_managed = TRUE WHERE id = $1;', [wedding.id]);
        const foundingNumber = await claimFoundingNumber(client, plannerId);
        return { wedding, foundingNumber };
    });

export { findPlannerOverview, findPlannerWorkload, createClientWedding };
