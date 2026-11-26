import db from './db.js';

const TASK_COLUMNS = 'id, text, category, due_date, done, sort_order, created_at';

/**
 * Tasks in display order, optionally filtered.
 * @param {string} weddingId
 * @param {{category?: string|null, status?: 'active'|'done'|null}} [filters] - Already validated.
 * @returns {Promise<Array<Object>>}
 */
const findTasks = async (weddingId, { category = null, status = null } = {}) => {
    const done = status === null ? null : status === 'done';
    const result = await db.query(
        `SELECT ${TASK_COLUMNS}
         FROM checklist_tasks
         WHERE wedding_id = $1
           AND ($2::text IS NULL OR category = $2)
           AND ($3::boolean IS NULL OR done = $3)
         ORDER BY done ASC, due_date ASC NULLS LAST, sort_order ASC, created_at ASC;`,
        [weddingId, category, done]
    );
    return result.rows;
};

/**
 * Progress over all of the wedding's tasks (ignores any list filter).
 * @param {string} weddingId
 * @returns {Promise<{total: number, done: number, pct: number}>}
 */
const findTaskProgress = async (weddingId) => {
    const result = await db.query(
        `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE done) AS done
         FROM checklist_tasks WHERE wedding_id = $1;`,
        [weddingId]
    );
    const total = Number(result.rows[0].total);
    const done = Number(result.rows[0].done);
    return { total, done, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<Object|null>}
 */
const findTask = async (id, weddingId) => {
    const result = await db.query(`SELECT ${TASK_COLUMNS} FROM checklist_tasks WHERE id = $1 AND wedding_id = $2;`, [
        id,
        weddingId
    ]);
    return result.rows[0] ?? null;
};

/**
 * @param {string} weddingId
 * @param {{text: string, category: string, dueDate: string|null}} values - Already validated.
 * @returns {Promise<{id: string, text: string}>}
 * @throws {Error} With code 23505 when the wedding already has a task with the same text.
 */
const createTask = async (weddingId, { text, category, dueDate }) => {
    const result = await db.query(
        `INSERT INTO checklist_tasks (wedding_id, text, category, due_date)
         VALUES ($1, $2, $3, $4)
         RETURNING id, text;`,
        [weddingId, text, category, dueDate]
    );
    return result.rows[0];
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @param {{text: string, category: string, dueDate: string|null}} values - Already validated.
 * @returns {Promise<{id: string, text: string}|null>}
 * @throws {Error} With code 23505 when another task already has the same text.
 */
const updateTask = async (id, weddingId, { text, category, dueDate }) => {
    const result = await db.query(
        `UPDATE checklist_tasks SET text = $3, category = $4, due_date = $5
         WHERE id = $1 AND wedding_id = $2
         RETURNING id, text;`,
        [id, weddingId, text, category, dueDate]
    );
    return result.rows[0] ?? null;
};

/**
 * Flips a task between done and not done in one statement.
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<{id: string, text: string, done: boolean}|null>}
 */
const toggleTask = async (id, weddingId) => {
    const result = await db.query(
        `UPDATE checklist_tasks SET done = NOT done
         WHERE id = $1 AND wedding_id = $2
         RETURNING id, text, done;`,
        [id, weddingId]
    );
    return result.rows[0] ?? null;
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<boolean>}
 */
const deleteTask = async (id, weddingId) => {
    const result = await db.query('DELETE FROM checklist_tasks WHERE id = $1 AND wedding_id = $2;', [id, weddingId]);
    return result.rowCount > 0;
};

/**
 * Inserts several tasks in one statement, skipping any whose text the wedding already has.
 * @param {string} weddingId
 * @param {Array<{text: string, category: string}>} tasks
 * @returns {Promise<number>} How many were added.
 */
const createTasksIfMissing = async (weddingId, tasks) => {
    const result = await db.query(
        `INSERT INTO checklist_tasks (wedding_id, text, category, sort_order)
         SELECT $1, t.text, t.category, t.ord
         FROM unnest($2::text[], $3::text[]) WITH ORDINALITY AS t(text, category, ord)
         ON CONFLICT (wedding_id, text) DO NOTHING;`,
        [weddingId, tasks.map((task) => task.text), tasks.map((task) => task.category)]
    );
    return result.rowCount;
};

export { findTasks, findTaskProgress, findTask, createTask, updateTask, toggleTask, deleteTask, createTasksIfMissing };
