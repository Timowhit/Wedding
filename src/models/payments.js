import db from './db.js';
import { COUNTED_STATUS, PAID_ONLY_STATUS, PAYMENT_DUE_WINDOW_DAYS, VENDOR_BUDGET_CATEGORY } from '../constants.js';
import { todayIso } from '../utils/today.js';

/*
 * Every money figure for vendors is worked out here, so the vendor page, the budget, the
 * dashboards and the planner cards can never disagree. The rules (see the payments design):
 *   Booked    counts in full:   committed = max(contract total, sum of payments)
 *   Declined  counts paid only: committed = paid = sum of paid payments (that money is gone)
 *   others    count nothing;    a contract total is only a quote
 * Each vendor is worked out on its own and then summed, so overpaying one vendor never hides
 * money owed to another.
 */

const PAYMENT_COLUMNS = 'id, vendor_id, label, amount::float AS amount, due_date, paid_on, note';

/**
 * Per-vendor figures. `scope` picks the weddings ('= $1' for one id, '= ANY($1)' for an array);
 * $2 today, $3 counted status, $4 paid-only status. With `exact`, amounts stay NUMERIC so callers
 * can add them up without float rounding.
 */
const vendorMoneySql = (scope, { exact = false } = {}) => {
    const cast = exact ? '' : '::float';
    return `
    WITH pay AS (
        SELECT vendor_id,
               SUM(amount) AS scheduled,
               COALESCE(SUM(amount) FILTER (WHERE paid_on IS NOT NULL), 0) AS paid,
               BOOL_OR(paid_on IS NULL AND due_date < $2::date) AS overdue,
               MIN(due_date) FILTER (WHERE paid_on IS NULL) AS next_due
        FROM vendor_payments WHERE wedding_id ${scope} GROUP BY vendor_id
    ), figures AS (
        SELECT v.id, v.wedding_id, v.name, v.category, v.status, v.contract_total,
               COALESCE(p.scheduled, 0) AS scheduled,
               COALESCE(p.overdue, FALSE) AS overdue, p.next_due,
               CASE WHEN v.status = $3 THEN GREATEST(COALESCE(v.contract_total, 0), COALESCE(p.scheduled, 0))
                    WHEN v.status = $4 THEN COALESCE(p.paid, 0)
                    ELSE 0 END AS committed,
               CASE WHEN v.status IN ($3, $4) THEN COALESCE(p.paid, 0) ELSE 0 END AS paid
        FROM vendors v LEFT JOIN pay p ON p.vendor_id = v.id
        WHERE v.wedding_id ${scope}
    )
    SELECT id, wedding_id, name, category, status,
           contract_total${cast} AS contract_total, scheduled${cast} AS scheduled,
           committed${cast} AS committed, paid${cast} AS paid,
           GREATEST(committed - paid, 0)${cast} AS owed,
           overdue, next_due
    FROM figures`;
};

const vendorMoneyRows = async (weddingId, today) =>
    (await db.query(vendorMoneySql('= $1'), [weddingId, today, COUNTED_STATUS, PAID_ONLY_STATUS])).rows;

/**
 * Money figures for every vendor of a wedding.
 * @param {string} weddingId
 * @param {string} [today] - YYYY-MM-DD; defaults to todayIso().
 * @returns {Promise<Map<string, {counts: boolean, quote: number|null, committed: number, paid: number, owed: number, scheduled: number, unscheduled: number|null, overdue: boolean, nextDue: Date|null}>>}
 *   `counts` is true for a booked vendor. `unscheduled` is the contract total minus all scheduled payments
 *   (negative when more is scheduled than the total; null without a total).
 */
const findVendorMoney = async (weddingId, today = todayIso()) => {
    const rows = await vendorMoneyRows(weddingId, today);
    return new Map(
        rows.map((row) => {
            const counts = row.status === COUNTED_STATUS;
            const quote = counts || row.status === PAID_ONLY_STATUS ? null : row.contract_total;
            return [
                row.id,
                {
                    counts,
                    quote,
                    committed: row.committed,
                    paid: row.paid,
                    owed: row.owed,
                    scheduled: row.scheduled,
                    unscheduled: row.contract_total === null ? null : row.contract_total - row.scheduled,
                    overdue: counts && row.overdue,
                    nextDue: counts ? row.next_due : null
                }
            ];
        })
    );
};

/**
 * Budget totals for a wedding. Ordinary expenses count as already paid.
 * @param {string} weddingId
 * @returns {Promise<{limit: number, committed: number, paid: number, owed: number, expenses: number, remaining: number, over: boolean}>}
 */
const findMoneySummary = async (weddingId) => {
    // Totals, differences and the over-budget test stay NUMERIC in SQL: adding floats in JS can
    // make 1000.01 + 500.10 exceed a 1500.11 budget by a fraction of a cent.
    const result = await db.query(
        `WITH v AS (${vendorMoneySql('= $1', { exact: true })}),
              totals AS (
                  SELECT (SELECT COALESCE(MAX(total), 0) FROM budget_limits WHERE wedding_id = $1) AS limit_total,
                         (SELECT COALESCE(SUM(amount), 0) FROM budget_items WHERE wedding_id = $1) AS expenses,
                         (SELECT COALESCE(SUM(committed), 0) FROM v) AS vendor_committed,
                         (SELECT COALESCE(SUM(paid), 0) FROM v) AS vendor_paid,
                         (SELECT COALESCE(SUM(owed), 0) FROM v) AS owed)
         SELECT limit_total::float AS limit_total, expenses::float AS expenses,
                (vendor_committed + expenses)::float AS committed,
                (vendor_paid + expenses)::float AS paid,
                owed::float AS owed,
                (limit_total - vendor_committed - expenses)::float AS remaining,
                (limit_total > 0 AND vendor_committed + expenses > limit_total) AS over
         FROM totals;`,
        [weddingId, todayIso(), COUNTED_STATUS, PAID_ONLY_STATUS]
    );
    const row = result.rows[0];
    return {
        limit: row.limit_total,
        committed: row.committed,
        paid: row.paid,
        owed: row.owed,
        expenses: row.expenses,
        remaining: row.remaining,
        over: row.over
    };
};

/**
 * Committed totals (counting vendors plus ordinary expenses) for several weddings at once, for
 * the planner's wedding cards.
 * @param {string[]} weddingIds
 * @returns {Promise<Map<string, number>>} Weddings with nothing committed are absent.
 */
const findCommittedByWedding = async (weddingIds) => {
    if (weddingIds.length === 0) return new Map();
    const result = await db.query(
        `WITH v AS (${vendorMoneySql('= ANY($1)', { exact: true })}),
              amounts AS (
                  SELECT wedding_id, committed FROM v
                  UNION ALL
                  SELECT wedding_id, amount FROM budget_items WHERE wedding_id = ANY($1))
         SELECT wedding_id, SUM(committed)::float AS committed FROM amounts GROUP BY wedding_id;`,
        [weddingIds, todayIso(), COUNTED_STATUS, PAID_ONLY_STATUS]
    );
    return new Map(result.rows.map((row) => [row.wedding_id, row.committed]));
};

/**
 * Vendors whose money counts in the budget (booked, or declined with paid payments).
 * @param {string} weddingId
 * @returns {Promise<Array<{id: string, name: string, category: string, budgetCategory: string, committed: number, paid: number, owed: number}>>}
 */
const findContractRows = async (weddingId) => {
    const rows = await vendorMoneyRows(weddingId, todayIso());
    return rows
        .filter((row) => row.committed > 0)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(({ id, name, category, committed, paid, owed }) => ({
            id,
            name,
            category,
            budgetCategory: VENDOR_BUDGET_CATEGORY[category] ?? 'Other',
            committed,
            paid,
            owed
        }));
};

/**
 * Budget totals per category: ordinary expenses plus counting vendors' committed amounts under
 * their mapped budget category. Largest first.
 * @param {string} weddingId
 * @returns {Promise<Array<{category: string, total: number}>>}
 */
const findBudgetCategoryTotals = async (weddingId) => {
    const [expenses, contracts] = await Promise.all([
        db.query(
            'SELECT category, SUM(amount)::float AS total FROM budget_items WHERE wedding_id = $1 GROUP BY category;',
            [weddingId]
        ),
        findContractRows(weddingId)
    ]);
    const totals = new Map(expenses.rows.map((row) => [row.category, row.total]));
    const CENTS = 100;
    for (const row of contracts) {
        const sum = (totals.get(row.budgetCategory) ?? 0) + row.committed;
        totals.set(row.budgetCategory, Math.round(sum * CENTS) / CENTS);
    }
    return [...totals]
        .map(([category, total]) => ({ category, total }))
        .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));
};

/**
 * True when an ordinary expense looks like it duplicates a booked vendor's contract: its name
 * contains the vendor's name, or it is in the vendor's (mapped) budget category with the same
 * amount as the contract total or one of its payments. Only used to show a warning.
 * @param {string} weddingId
 * @returns {Promise<boolean>}
 */
const findDuplicateExpenseHints = async (weddingId) => {
    const categoryPairs = Object.entries(VENDOR_BUDGET_CATEGORY);
    const result = await db.query(
        `WITH mapping (vendor_category, budget_category) AS (SELECT * FROM UNNEST($3::text[], $4::text[])),
              counted AS (
                  SELECT v.id, v.name, v.contract_total, m.budget_category
                  FROM vendors v JOIN mapping m ON m.vendor_category = v.category
                  WHERE v.wedding_id = $1 AND v.status = $2)
         SELECT EXISTS (
             SELECT 1 FROM budget_items b JOIN counted c ON TRUE
             WHERE b.wedding_id = $1
               AND (POSITION(LOWER(c.name) IN LOWER(b.name)) > 0
                    OR (b.category = c.budget_category
                        AND (b.amount = c.contract_total
                             OR b.amount IN (SELECT amount FROM vendor_payments p
                                             WHERE p.vendor_id = c.id AND p.wedding_id = $1))))
         ) AS found;`,
        [weddingId, COUNTED_STATUS, categoryPairs.map(([vendor]) => vendor), categoryPairs.map(([, budget]) => budget)]
    );
    return result.rows[0].found;
};

/** Unpaid, dated payments of booked vendors, with their wedding. $1 counted status, $2 today. */
const DUE_SELECT = `
    SELECT p.id, p.wedding_id, w.name AS wedding_name, p.vendor_id, v.name AS vendor_name,
           p.label, p.amount::float AS amount, p.due_date, p.due_date < $2::date AS overdue
    FROM vendor_payments p
    JOIN vendors v ON v.id = p.vendor_id AND v.wedding_id = p.wedding_id
    JOIN weddings w ON w.id = p.wedding_id
    WHERE p.paid_on IS NULL AND p.due_date IS NOT NULL AND v.status = $1`;

/**
 * "Payments due" for one wedding: overdue ones, then those due within `days`, soonest first.
 * @param {string} weddingId
 * @param {{today?: string, days?: number}} [options]
 * @returns {Promise<Array<{id: string, wedding_id: string, wedding_name: string, vendor_id: string, vendor_name: string, label: string|null, amount: number, due_date: Date, overdue: boolean}>>}
 */
const findPaymentsDue = async (weddingId, { today = todayIso(), days = PAYMENT_DUE_WINDOW_DAYS } = {}) => {
    const result = await db.query(
        `${DUE_SELECT} AND p.wedding_id = $3 AND p.due_date <= $2::date + $4::int
         ORDER BY p.due_date ASC, v.name ASC, p.id ASC;`,
        [COUNTED_STATUS, today, weddingId, days]
    );
    return result.rows;
};

/** Latest due date (exclusive or inclusive) per planner filter; overdue payments are always included. */
const PLANNER_DUE_LIMITS = Object.freeze({
    month: `p.due_date < (date_trunc('month', $2::date) + INTERVAL '1 month')::date`,
    next30: `p.due_date <= $2::date + ${PAYMENT_DUE_WINDOW_DAYS}`,
    overdue: 'p.due_date < $2::date'
});

/**
 * "Payments due" across every wedding a planner belongs to, past weddings included (an unpaid
 * bill is still owed) but archived ones left out.
 * @param {string} userId
 * @param {{filter?: 'month'|'next30'|'overdue', today?: string}} [options] - filter already validated.
 * @returns {Promise<Array<{id: string, wedding_id: string, wedding_name: string, vendor_id: string, vendor_name: string, label: string|null, amount: number, due_date: Date, overdue: boolean}>>}
 */
const findPlannerPaymentsDue = async (userId, { filter = 'month', today = todayIso() } = {}) => {
    const limit = PLANNER_DUE_LIMITS[filter] ?? PLANNER_DUE_LIMITS.month;
    const result = await db.query(
        `${DUE_SELECT} AND ${limit}
           AND p.wedding_id IN (SELECT wedding_id FROM wedding_members WHERE user_id = $3)
           AND w.archived_at IS NULL
         ORDER BY p.due_date ASC, w.name ASC, v.name ASC, p.id ASC;`,
        [COUNTED_STATUS, today, userId]
    );
    return result.rows;
};

/**
 * Number of overdue payments across a planner's weddings.
 * @param {string} userId
 * @param {string} [today]
 * @returns {Promise<number>}
 */
const countPlannerOverdue = async (userId, today = todayIso()) => {
    const result = await db.query(
        `SELECT COUNT(*)::int AS count FROM (${DUE_SELECT} AND ${PLANNER_DUE_LIMITS.overdue}
           AND p.wedding_id IN (SELECT wedding_id FROM wedding_members WHERE user_id = $3)
           AND w.archived_at IS NULL) due;`,
        [COUNTED_STATUS, today, userId]
    );
    return result.rows[0].count;
};

/**
 * A vendor's payments, by due date (undated last).
 * @param {string} vendorId
 * @param {string} weddingId
 * @returns {Promise<Array<{id: string, vendor_id: string, label: string|null, amount: number, due_date: Date|null, paid_on: Date|null, note: string|null}>>}
 */
const findPayments = async (vendorId, weddingId) => {
    const result = await db.query(
        `SELECT ${PAYMENT_COLUMNS} FROM vendor_payments
         WHERE vendor_id = $1 AND wedding_id = $2
         ORDER BY due_date ASC NULLS LAST, created_at ASC, id ASC;`,
        [vendorId, weddingId]
    );
    return result.rows;
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<{id: string, vendor_id: string, label: string|null, amount: number, due_date: Date|null, paid_on: Date|null, note: string|null}|null>}
 */
const findPayment = async (id, weddingId) => {
    const result = await db.query(`SELECT ${PAYMENT_COLUMNS} FROM vendor_payments WHERE id = $1 AND wedding_id = $2;`, [
        id,
        weddingId
    ]);
    return result.rows[0] ?? null;
};

/**
 * Adds a payment to a vendor, only if that vendor belongs to the wedding (checked in the same
 * statement, so a forged vendor id adds nothing).
 * @param {string} vendorId
 * @param {string} weddingId
 * @param {{label: string|null, amount: number, dueDate: string|null, paidOn: string|null, note: string|null}} data - Already validated.
 * @returns {Promise<{id: string, vendor_id: string}|null>} Null when the vendor is not in this wedding.
 */
const createPayment = async (vendorId, weddingId, { label, amount, dueDate, paidOn, note }) => {
    const result = await db.query(
        `INSERT INTO vendor_payments (wedding_id, vendor_id, label, amount, due_date, paid_on, note)
         SELECT wedding_id, id, $3, $4, $5, $6, $7 FROM vendors WHERE id = $1 AND wedding_id = $2
         RETURNING ${PAYMENT_COLUMNS};`,
        [vendorId, weddingId, label, amount, dueDate, paidOn, note]
    );
    return result.rows[0] ?? null;
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @param {{label: string|null, amount: number, dueDate: string|null, paidOn: string|null, note: string|null}} data - Already validated.
 * @returns {Promise<{id: string, vendor_id: string}|null>}
 */
const updatePayment = async (id, weddingId, { label, amount, dueDate, paidOn, note }) => {
    const result = await db.query(
        `UPDATE vendor_payments SET label = $3, amount = $4, due_date = $5, paid_on = $6, note = $7
         WHERE id = $1 AND wedding_id = $2 RETURNING ${PAYMENT_COLUMNS};`,
        [id, weddingId, label, amount, dueDate, paidOn, note]
    );
    return result.rows[0] ?? null;
};

/**
 * Marks a payment paid on a date (keeping an existing paid date), or unpaid (null).
 * @param {string} id
 * @param {string} weddingId
 * @param {string|null} paidOn - YYYY-MM-DD or null.
 * @returns {Promise<{id: string, vendor_id: string}|null>}
 */
const setPaymentPaid = async (id, weddingId, paidOn) => {
    const result = await db.query(
        // Marking paid keeps a paid date that is already set (a page loaded before someone entered
        // the real date must not overwrite it); marking unpaid clears it.
        `UPDATE vendor_payments SET paid_on = CASE WHEN $3::date IS NULL THEN NULL ELSE COALESCE(paid_on, $3::date) END
         WHERE id = $1 AND wedding_id = $2 RETURNING ${PAYMENT_COLUMNS};`,
        [id, weddingId, paidOn]
    );
    return result.rows[0] ?? null;
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<{vendor_id: string}|null>} The deleted payment's vendor, or null if nothing was deleted.
 */
const deletePayment = async (id, weddingId) => {
    const result = await db.query(
        'DELETE FROM vendor_payments WHERE id = $1 AND wedding_id = $2 RETURNING vendor_id;',
        [id, weddingId]
    );
    return result.rows[0] ?? null;
};

export {
    findVendorMoney,
    findMoneySummary,
    findContractRows,
    findCommittedByWedding,
    findBudgetCategoryTotals,
    findDuplicateExpenseHints,
    findPaymentsDue,
    findPlannerPaymentsDue,
    countPlannerOverdue,
    findPayments,
    findPayment,
    createPayment,
    updatePayment,
    setPaymentPaid,
    deletePayment
};
