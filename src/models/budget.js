import { BUDGET_CATEGORIES, FALLBACK_BUDGET_CATEGORY, MAX_BUDGET_CATEGORIES } from '../constants.js';
import db, { withTransaction } from './db.js';

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
 * @param {string|null} [category] - Already validated against the wedding's categories.
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

// ---------- Categories (each wedding's own list) ----------

const CATEGORY_COLUMNS = 'id, builtin_key, name, planned::float AS planned, COALESCE(builtin_key, name) AS value';

/** Suggested categories in their usual order, then the wedding's own by name, then Other. */
const categoryOrder = (a, b) => {
    const rank = (row) =>
        row.value === FALLBACK_BUDGET_CATEGORY
            ? Number.MAX_SAFE_INTEGER
            : row.builtin_key
              ? BUDGET_CATEGORIES.indexOf(row.builtin_key)
              : BUDGET_CATEGORIES.length;
    return rank(a) - rank(b) || a.value.localeCompare(b.value);
};

/**
 * A wedding's budget categories. A wedding that has none yet gets the suggested ones first
 * (Other can't be deleted, so the list is never empty after that).
 * @param {string} weddingId
 * @returns {Promise<Array<{id: string, builtin_key: string|null, name: string|null, planned: number|null, value: string}>>}
 *   `value` is what expenses store: the key of a suggested category, or the wedding's own name.
 */
const findBudgetCategories = async (weddingId) => {
    await db.query(
        `INSERT INTO budget_categories (wedding_id, builtin_key)
         SELECT $1, key FROM UNNEST($2::text[]) AS key
         WHERE NOT EXISTS (SELECT 1 FROM budget_categories WHERE wedding_id = $1)
         ON CONFLICT DO NOTHING;`,
        [weddingId, BUDGET_CATEGORIES]
    );
    const result = await db.query(`SELECT ${CATEGORY_COLUMNS} FROM budget_categories WHERE wedding_id = $1;`, [
        weddingId
    ]);
    return result.rows.sort(categoryOrder);
};

/**
 * Adds a category: a suggested one (by key) or the wedding's own (by name).
 * @param {string} weddingId
 * @param {{builtinKey: string|null, name: string|null, planned: number|null}} values - Already validated; exactly one of builtinKey and name.
 * @returns {Promise<'added'|'exists'|'full'>}
 */
const addBudgetCategory = async (weddingId, { builtinKey, name, planned }) =>
    withTransaction(async (client) => {
        // Counted under a lock, so two adds at once can't pass the limit.
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('budget_categories:' || $1));`, [weddingId]);
        return insertCategory(client, weddingId, { builtinKey, name, planned });
    });

const insertCategory = async (client, weddingId, { builtinKey, name, planned }) => {
    const result = await client.query(
        `INSERT INTO budget_categories (wedding_id, builtin_key, name, planned)
         SELECT $1, $2, $3, $4
         WHERE (SELECT COUNT(*) FROM budget_categories WHERE wedding_id = $1) < $5
         ON CONFLICT DO NOTHING
         RETURNING id;`,
        [weddingId, builtinKey, name, planned, MAX_BUDGET_CATEGORIES]
    );
    if (result.rowCount > 0) return 'added';
    const exists = await client.query(
        `SELECT 1 FROM budget_categories WHERE wedding_id = $1 AND LOWER(COALESCE(builtin_key, name)) = LOWER($2);`,
        [weddingId, builtinKey ?? name]
    );
    return exists.rowCount > 0 ? 'exists' : 'full';
};

/**
 * Adds back every suggested category the wedding deleted.
 * @param {string} weddingId
 * @returns {Promise<number>} How many came back.
 */
const addSuggestedCategories = async (weddingId) => {
    const result = await db.query(
        `INSERT INTO budget_categories (wedding_id, builtin_key)
         SELECT $1, key FROM UNNEST($2::text[]) AS key
         ON CONFLICT DO NOTHING;`,
        [weddingId, BUDGET_CATEGORIES]
    );
    return result.rowCount;
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @param {number|null} planned - Already validated; null clears it.
 * @returns {Promise<boolean>} False when no such category exists in this wedding.
 */
const setCategoryPlanned = async (id, weddingId, planned) => {
    const result = await db.query(`UPDATE budget_categories SET planned = $3 WHERE id = $1 AND wedding_id = $2;`, [
        id,
        weddingId,
        planned
    ]);
    return result.rowCount > 0;
};

/**
 * Deletes a category and moves its expenses to Other (which can't be deleted).
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<{value: string, moved: number}|null>} Null when there is no such deletable category.
 */
const deleteBudgetCategory = async (id, weddingId) =>
    withTransaction(async (client) => {
        const deleted = await client.query(
            `DELETE FROM budget_categories
             WHERE id = $1 AND wedding_id = $2 AND builtin_key IS DISTINCT FROM $3
             RETURNING COALESCE(builtin_key, name) AS value;`,
            [id, weddingId, FALLBACK_BUDGET_CATEGORY]
        );
        if (deleted.rowCount === 0) return null;
        const { value } = deleted.rows[0];
        const moved = await client.query(
            `UPDATE budget_items SET category = $3 WHERE wedding_id = $1 AND category = $2;`,
            [weddingId, value, FALLBACK_BUDGET_CATEGORY]
        );
        return { value, moved: moved.rowCount };
    });

/**
 * Adds categories from a whole-wedding template (those the wedding lacks, up to the limit) and
 * sets their planned amounts.
 * @param {string} weddingId
 * @param {Array<{key: string|null, name: string|null, planned: number|null}>} categories - Already normalised.
 * @returns {Promise<void>}
 */
const addCategoriesWithPlans = async (weddingId, categories) => {
    await findBudgetCategories(weddingId); // the suggested ones first, as on a first visit
    await withTransaction(async (client) => {
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('budget_categories:' || $1));`, [weddingId]);
        for (const { key, name, planned } of categories) {
            await insertCategory(client, weddingId, { builtinKey: key, name: key ? null : name, planned });
            if (planned !== null) {
                await client.query(
                    `UPDATE budget_categories SET planned = $3
                     WHERE wedding_id = $1 AND LOWER(COALESCE(builtin_key, name)) = LOWER($2);`,
                    [weddingId, key ?? name, planned]
                );
            }
        }
    });
};

export {
    addCategoriesWithPlans,
    saveBudgetLimit,
    findExpenses,
    createExpense,
    deleteExpense,
    findBudgetCategories,
    addBudgetCategory,
    addSuggestedCategories,
    setCategoryPlanned,
    deleteBudgetCategory
};
