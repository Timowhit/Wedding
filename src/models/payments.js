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

/** Per-vendor figures for one wedding. $1 wedding, $2 today, $3 counted status, $4 paid-only status. */
const VENDOR_MONEY_SQL = `
    WITH pay AS (
        SELECT vendor_id,
               SUM(amount) AS scheduled,
               COALESCE(SUM(amount) FILTER (WHERE paid_on IS NOT NULL), 0) AS paid,
               BOOL_OR(paid_on IS NULL AND due_date < $2::date) AS overdue,
               MIN(due_date) FILTER (WHERE paid_on IS NULL) AS next_due
        FROM vendor_payments WHERE wedding_id = $1 GROUP BY vendor_id
    ), figures AS (
        SELECT v.id, v.name, v.category, v.status, v.contract_total,
               COALESCE(p.scheduled, 0) AS scheduled,
               COALESCE(p.overdue, FALSE) AS overdue, p.next_due,
               CASE WHEN v.status = $3 THEN GREATEST(COALESCE(v.contract_total, 0), COALESCE(p.scheduled, 0))
                    WHEN v.status = $4 THEN COALESCE(p.paid, 0)
                    ELSE 0 END AS committed,
               CASE WHEN v.status IN ($3, $4) THEN COALESCE(p.paid, 0) ELSE 0 END AS paid
        FROM vendors v LEFT JOIN pay p ON p.vendor_id = v.id
        WHERE v.wedding_id = $1
    )
    SELECT id, name, category, status,
           contract_total::float AS contract_total, scheduled::float AS scheduled,
           committed::float AS committed, paid::float AS paid,
           GREATEST(committed - paid, 0)::float AS owed,
           overdue, next_due
    FROM figures`;

const vendorMoneyRows = async (weddingId, today) =>
    (await db.query(VENDOR_MONEY_SQL, [weddingId, today, COUNTED_STATUS, PAID_ONLY_STATUS])).rows;

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
 * @returns {Promise<{limit: number, committed: number, paid: number, owed: number, expenses: number, over: boolean}>}
 */
const findMoneySummary = async (weddingId) => {
    const result = await db.query(
        `WITH v AS (${VENDOR_MONEY_SQL})
         SELECT (SELECT COALESCE(MAX(total), 0) FROM budget_limits WHERE wedding_id = $1)::float AS limit_total,
                (SELECT COALESCE(SUM(amount), 0) FROM budget_items WHERE wedding_id = $1)::float AS expenses,
                COALESCE(SUM(v.committed), 0)::float AS committed,
                COALESCE(SUM(v.paid), 0)::float AS paid,
                COALESCE(SUM(v.owed), 0)::float AS owed
         FROM v;`,
        [weddingId, todayIso(), COUNTED_STATUS, PAID_ONLY_STATUS]
    );
    const row = result.rows[0];
    const committed = row.committed + row.expenses;
    return {
        limit: row.limit_total,
        committed,
        paid: row.paid + row.expenses,
        owed: row.owed,
        expenses: row.expenses,
        over: row.limit_total > 0 && committed > row.limit_total
    };
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
 * bill is still owed).
 * @param {string} userId
 * @param {{filter?: 'month'|'next30'|'overdue', today?: string}} [options] - filter already validated.
 * @returns {Promise<Array<{id: string, wedding_id: string, wedding_name: string, vendor_id: string, vendor_name: string, label: string|null, amount: number, due_date: Date, overdue: boolean}>>}
 */
const findPlannerPaymentsDue = async (userId, { filter = 'month', today = todayIso() } = {}) => {
    const limit = PLANNER_DUE_LIMITS[filter] ?? PLANNER_DUE_LIMITS.month;
    const result = await db.query(
        `${DUE_SELECT} AND ${limit}
           AND p.wedding_id IN (SELECT wedding_id FROM wedding_members WHERE user_id = $3)
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
           AND p.wedding_id IN (SELECT wedding_id FROM wedding_members WHERE user_id = $3)) due;`,
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
 * Marks a payment paid on a date, or unpaid (null).
 * @param {string} id
 * @param {string} weddingId
 * @param {string|null} paidOn - YYYY-MM-DD or null.
 * @returns {Promise<{id: string, vendor_id: string}|null>}
 */
const setPaymentPaid = async (id, weddingId, paidOn) => {
    const result = await db.query(
        `UPDATE vendor_payments SET paid_on = $3 WHERE id = $1 AND wedding_id = $2 RETURNING ${PAYMENT_COLUMNS};`,
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
