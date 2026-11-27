import db from './db.js';

// The owner's name only while they are still a member: someone who left shows as nobody.
const TASK_SELECT = `SELECT t.id, t.text, t.category, t.due_date, t.done, t.sort_order, t.created_at, t.priority,
                            CASE WHEN wm.user_id IS NULL THEN NULL ELSE t.assignee_id END AS assignee_id,
                            CASE WHEN wm.user_id IS NULL THEN NULL ELSE COALESCE(u.display_name, u.email) END AS assignee_name
                     FROM checklist_tasks t
                     LEFT JOIN wedding_members wm ON wm.wedding_id = t.wedding_id AND wm.user_id = t.assignee_id
                     LEFT JOIN users u ON u.id = wm.user_id`;
// High first, then normal, then low (see TASK_PRIORITIES).
const PRIORITY_ORDER = `CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END`;

/**
 * Tasks in display order, optionally filtered.
 * @param {string} weddingId
 * @param {{category?: string|null, status?: 'active'|'done'|null, priority?: string|null, assigneeId?: string|null}} [filters] - Already validated.
 * @returns {Promise<Array<Object>>}
 */
const findTasks = async (weddingId, { category = null, status = null, priority = null, assigneeId = null } = {}) => {
    const done = status === null ? null : status === 'done';
    const result = await db.query(
        `${TASK_SELECT}
         WHERE t.wedding_id = $1
           AND ($2::text IS NULL OR t.category = $2)
           AND ($3::boolean IS NULL OR t.done = $3)
           AND ($4::text IS NULL OR t.priority = $4)
           AND ($5::uuid IS NULL OR (t.assignee_id = $5 AND wm.user_id IS NOT NULL))
         ORDER BY t.done ASC, t.due_date ASC NULLS LAST, ${PRIORITY_ORDER}, t.sort_order ASC, t.created_at ASC;`,
        [weddingId, category, done, priority, assigneeId]
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

// Open tasks shown in the header's progress badge.
const BADGE_NEXT_TASKS = 3;

/**
 * The header's progress badge: checklist totals and the next few open tasks (soonest due first,
 * then high priority).
 * @param {string} weddingId
 * @returns {Promise<{total: number, done: number, pct: number, next: Array<{id: string, text: string, due_date: Date|null}>}>}
 */
const findTaskBadge = async (weddingId) => {
    const [progress, next] = await Promise.all([
        findTaskProgress(weddingId),
        db.query(
            `SELECT t.id, t.text, t.due_date FROM checklist_tasks t
             WHERE t.wedding_id = $1 AND NOT t.done
             ORDER BY t.due_date ASC NULLS LAST, ${PRIORITY_ORDER}, t.sort_order, t.created_at
             LIMIT $2;`,
            [weddingId, BADGE_NEXT_TASKS]
        )
    ]);
    return { ...progress, next: next.rows };
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<Object|null>}
 */
const findTask = async (id, weddingId) => {
    const result = await db.query(`${TASK_SELECT} WHERE t.id = $1 AND t.wedding_id = $2;`, [id, weddingId]);
    return result.rows[0] ?? null;
};

/**
 * @param {string} weddingId
 * @param {{text: string, category: string, dueDate: string|null, priority: string, assigneeId: string|null}} values - Already validated; assigneeId is a member.
 * @returns {Promise<{id: string, text: string}>}
 * @throws {Error} With code 23505 when the wedding already has a task with the same text.
 */
const createTask = async (weddingId, { text, category, dueDate, priority, assigneeId }) => {
    const result = await db.query(
        `INSERT INTO checklist_tasks (wedding_id, text, category, due_date, priority, assignee_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, text;`,
        [weddingId, text, category, dueDate, priority, assigneeId]
    );
    return result.rows[0];
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @param {{text: string, category: string, dueDate: string|null, priority: string, assigneeId: string|null}} values - Already validated; assigneeId is a member.
 * @returns {Promise<{id: string, text: string}|null>}
 * @throws {Error} With code 23505 when another task already has the same text.
 */
const updateTask = async (id, weddingId, { text, category, dueDate, priority, assigneeId }) => {
    const result = await db.query(
        `UPDATE checklist_tasks SET text = $3, category = $4, due_date = $5, priority = $6, assignee_id = $7
         WHERE id = $1 AND wedding_id = $2
         RETURNING id, text;`,
        [id, weddingId, text, category, dueDate, priority, assigneeId]
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

/**
 * Which of these task texts the wedding already has (compared without case).
 * @param {string} weddingId
 * @param {string[]} texts
 * @returns {Promise<Set<string>>} The matching texts, lowercased.
 */
const findExistingTaskTexts = async (weddingId, texts) => {
    const result = await db.query(
        `SELECT DISTINCT LOWER(text) AS text FROM checklist_tasks WHERE wedding_id = $1 AND LOWER(text) = ANY($2::text[]);`,
        [weddingId, texts.map((text) => text.toLowerCase())]
    );
    return new Set(result.rows.map((row) => row.text));
};

export {
    findExistingTaskTexts,
    findTasks,
    findTaskProgress,
    findTask,
    createTask,
    updateTask,
    toggleTask,
    deleteTask,
    createTasksIfMissing,
    findTaskBadge
};
