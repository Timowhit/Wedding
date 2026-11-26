import db from './db.js';

const DECISION_COLUMNS = `d.id, d.title, d.details, d.due_date, d.status, d.comment, d.answered_at, d.created_at,
                          COALESCE(answerer.display_name, answerer.email) AS answered_by_name`;
const FROM_DECISIONS = 'FROM decisions d LEFT JOIN users answerer ON answerer.id = d.answered_by';

/**
 * Decisions of a wedding: those waiting for an answer first (open, then sent back), then answered
 * ones; within each group the soonest due date first.
 * @param {string} weddingId
 * @returns {Promise<Array<Object>>}
 */
const findDecisions = async (weddingId) => {
    const result = await db.query(
        `SELECT ${DECISION_COLUMNS} ${FROM_DECISIONS}
         WHERE d.wedding_id = $1
         ORDER BY CASE d.status WHEN 'open' THEN 0 WHEN 'changes_requested' THEN 1 ELSE 2 END,
                  d.due_date ASC NULLS LAST, d.created_at ASC, d.id ASC;`,
        [weddingId]
    );
    return result.rows;
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<Object|null>}
 */
const findDecision = async (id, weddingId) => {
    const result = await db.query(
        `SELECT ${DECISION_COLUMNS} ${FROM_DECISIONS} WHERE d.id = $1 AND d.wedding_id = $2;`,
        [id, weddingId]
    );
    return result.rows[0] ?? null;
};

/**
 * @param {string} weddingId
 * @param {string} userId - Who asks.
 * @param {{title: string, details: string|null, dueDate: string|null}} values - Already validated.
 * @returns {Promise<{id: string, title: string}>}
 */
const createDecision = async (weddingId, userId, { title, details, dueDate }) => {
    const result = await db.query(
        `INSERT INTO decisions (wedding_id, created_by, title, details, due_date)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, title;`,
        [weddingId, userId, title, details, dueDate]
    );
    return result.rows[0];
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @param {{title: string, details: string|null, dueDate: string|null}} values - Already validated.
 * @returns {Promise<{id: string, title: string}|null>}
 */
const updateDecision = async (id, weddingId, { title, details, dueDate }) => {
    const result = await db.query(
        `UPDATE decisions SET title = $3, details = $4, due_date = $5
         WHERE id = $1 AND wedding_id = $2
         RETURNING id, title;`,
        [id, weddingId, title, details, dueDate]
    );
    return result.rows[0] ?? null;
};

/**
 * Records the couple's answer.
 * @param {string} id
 * @param {string} weddingId
 * @param {string} userId - Who answers.
 * @param {{status: 'approved'|'changes_requested', comment: string|null}} answer - Already validated.
 * @returns {Promise<{id: string, title: string, status: string}|null>}
 */
const answerDecision = async (id, weddingId, userId, { status, comment }) => {
    const result = await db.query(
        `UPDATE decisions SET status = $4, comment = $5, answered_by = $3, answered_at = NOW()
         WHERE id = $1 AND wedding_id = $2
         RETURNING id, title, status;`,
        [id, weddingId, userId, status, comment]
    );
    return result.rows[0] ?? null;
};

/**
 * Puts a decision back to open and clears the previous answer.
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<boolean>}
 */
const reopenDecision = async (id, weddingId) => {
    const result = await db.query(
        `UPDATE decisions SET status = 'open', comment = NULL, answered_by = NULL, answered_at = NULL
         WHERE id = $1 AND wedding_id = $2;`,
        [id, weddingId]
    );
    return result.rowCount > 0;
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<boolean>}
 */
const deleteDecision = async (id, weddingId) => {
    const result = await db.query('DELETE FROM decisions WHERE id = $1 AND wedding_id = $2;', [id, weddingId]);
    return result.rowCount > 0;
};

/**
 * @param {string} weddingId
 * @returns {Promise<number>} Decisions still waiting for an answer.
 */
const countOpenDecisions = async (weddingId) => {
    const result = await db.query(
        `SELECT COUNT(*)::int AS n FROM decisions WHERE wedding_id = $1 AND status = 'open';`,
        [weddingId]
    );
    return result.rows[0].n;
};

export {
    findDecisions,
    findDecision,
    createDecision,
    updateDecision,
    answerDecision,
    reopenDecision,
    deleteDecision,
    countOpenDecisions
};
