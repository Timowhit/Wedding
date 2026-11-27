import db from './db.js';

/**
 * @param {string} weddingId
 * @param {number} total - Already validated (>= 0).
 * @returns {Promise<number>} The saved total.
 */
const saveBudgetLimit = async (weddingId, total) => {
    const result = await db.query(
        `INSERT INTO budget_limits (wedding_id, total)
         VALUES ($1, $2)
         ON CONFLICT (wedding_id) DO UPDATE SET total = EXCLUDED.total
         RETURNING total;`,
        [weddingId, total]
    );
    return Number(result.rows[0].total);
};

/**
 * Expenses, newest first, optionally only one category.
 * @param {string} weddingId
 * @param {string|null} [category] - Already validated against BUDGET_CATEGORIES.
 * @returns {Promise<Array<{id: string, name: string, category: string, amount: string, created_at: Date}>>}
 */
const findExpenses = async (weddingId, category = null) => {
    const result = await db.query(
        `SELECT id, name, category, amount, created_at
         FROM budget_items
         WHERE wedding_id = $1 AND ($2::text IS NULL OR category = $2)
         ORDER BY created_at DESC, id ASC;`,
        [weddingId, category]
    );
    return result.rows;
};

/**
 * @param {string} weddingId
 * @param {{name: string, category: string, amount: number}} values - Already validated.
 * @returns {Promise<{id: string, name: string}>}
 */
const createExpense = async (weddingId, { name, category, amount }) => {
    const result = await db.query(
        `INSERT INTO budget_items (wedding_id, name, category, amount)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name;`,
        [weddingId, name, category, amount]
    );
    return result.rows[0];
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<boolean>} False when no such expense exists in this wedding.
 */
const deleteExpense = async (id, weddingId) => {
    const result = await db.query('DELETE FROM budget_items WHERE id = $1 AND wedding_id = $2;', [id, weddingId]);
    return result.rowCount > 0;
};

export { saveBudgetLimit, findExpenses, createExpense, deleteExpense };
