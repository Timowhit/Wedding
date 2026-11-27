import { MAX_MESSAGES_PER_USER, MAX_QUESTIONNAIRES_PER_USER } from '../constants.js';
import db from './db.js';

// ---------- Message templates (scoped by user_id) ----------

/**
 * The person's message templates by kind and name.
 * @param {string} userId
 * @returns {Promise<Array<{id: string, kind: string, name: string, subject: string|null, body: string, updated_at: Date}>>}
 */
const findMessages = async (userId) => {
    const result = await db.query(
        `SELECT id, kind, name, subject, body, updated_at FROM message_templates WHERE user_id = $1 ORDER BY kind, LOWER(name), id;`,
        [userId]
    );
    return result.rows;
};

/**
 * @param {string} id
 * @param {string} userId
 * @returns {Promise<{id: string, kind: string, name: string, subject: string|null, body: string}|null>}
 */
const findMessage = async (id, userId) => {
    const result = await db.query(
        `SELECT id, kind, name, subject, body FROM message_templates WHERE id = $1 AND user_id = $2;`,
        [id, userId]
    );
    return result.rows[0] ?? null;
};

/**
 * Adds a message template, unless the person already has MAX_MESSAGES_PER_USER.
 * @param {string} userId
 * @param {{kind: string, name: string, subject: string|null, body: string}} message - Already validated.
 * @returns {Promise<{id: string}|null>} Null when the limit is reached.
 * @throws {Error} With code 23505 when the person already has one with this kind and name.
 */
const createMessage = async (userId, { kind, name, subject, body }) => {
    const result = await db.query(
        `INSERT INTO message_templates (user_id, kind, name, subject, body)
         SELECT $1, $2, $3, $4, $5
         WHERE (SELECT COUNT(*) FROM message_templates WHERE user_id = $1) < $6
         RETURNING id;`,
        [userId, kind, name, subject, body, MAX_MESSAGES_PER_USER]
    );
    return result.rows[0] ?? null;
};

/**
 * @param {string} id
 * @param {string} userId
 * @param {{kind: string, name: string, subject: string|null, body: string}} message - Already validated.
 * @returns {Promise<boolean>}
 * @throws {Error} With code 23505 when another of the person's messages has this kind and name.
 */
const updateMessage = async (id, userId, { kind, name, subject, body }) => {
    const result = await db.query(
        `UPDATE message_templates SET kind = $3, name = $4, subject = $5, body = $6, updated_at = NOW()
         WHERE id = $1 AND user_id = $2;`,
        [id, userId, kind, name, subject, body]
    );
    return result.rowCount > 0;
};

/**
 * @param {string} id
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
const deleteMessage = async (id, userId) => {
    const result = await db.query(`DELETE FROM message_templates WHERE id = $1 AND user_id = $2;`, [id, userId]);
    return result.rowCount > 0;
};

// ---------- Questionnaires (scoped by user_id) ----------

/**
 * @param {string} userId
 * @returns {Promise<Array<{id: string, title: string, question_count: number, updated_at: Date}>>}
 */
const findQuestionnaires = async (userId) => {
    const result = await db.query(
        `SELECT id, title, jsonb_array_length(questions)::int AS question_count, updated_at
         FROM questionnaires WHERE user_id = $1 ORDER BY LOWER(title), id;`,
        [userId]
    );
    return result.rows;
};

/**
 * @param {string} id
 * @param {string} userId
 * @returns {Promise<{id: string, title: string, intro: string|null, questions: unknown}|null>} questions: raw JSONB; normalise before use.
 */
const findQuestionnaire = async (id, userId) => {
    const result = await db.query(
        `SELECT id, title, intro, questions FROM questionnaires WHERE id = $1 AND user_id = $2;`,
        [id, userId]
    );
    return result.rows[0] ?? null;
};

/**
 * Adds a questionnaire, unless the person already has MAX_QUESTIONNAIRES_PER_USER.
 * @param {string} userId
 * @param {{title: string, intro: string|null, questions: Array<Object>}} questionnaire - Already validated.
 * @returns {Promise<{id: string}|null>}
 */
const createQuestionnaire = async (userId, { title, intro, questions }) => {
    const result = await db.query(
        `INSERT INTO questionnaires (user_id, title, intro, questions)
         SELECT $1, $2, $3, $4::jsonb
         WHERE (SELECT COUNT(*) FROM questionnaires WHERE user_id = $1) < $5
         RETURNING id;`,
        [userId, title, intro, JSON.stringify(questions), MAX_QUESTIONNAIRES_PER_USER]
    );
    return result.rows[0] ?? null;
};

/**
 * @param {string} id
 * @param {string} userId
 * @param {{title: string, intro: string|null, questions: Array<Object>}} questionnaire - Already validated.
 * @returns {Promise<boolean>}
 */
const updateQuestionnaire = async (id, userId, { title, intro, questions }) => {
    const result = await db.query(
        `UPDATE questionnaires SET title = $3, intro = $4, questions = $5::jsonb, updated_at = NOW() WHERE id = $1 AND user_id = $2;`,
        [id, userId, title, intro, JSON.stringify(questions)]
    );
    return result.rowCount > 0;
};

/**
 * @param {string} id
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
const deleteQuestionnaire = async (id, userId) => {
    const result = await db.query(`DELETE FROM questionnaires WHERE id = $1 AND user_id = $2;`, [id, userId]);
    return result.rowCount > 0;
};

// ---------- Questionnaires sent to a wedding (scoped by wedding_id) ----------

const SENT_COLUMNS = `wq.id, wq.title, wq.intro, wq.questions, wq.answers, wq.sent_at, wq.answered_at,
                      COALESCE(s.display_name, s.email) AS sent_by_name, COALESCE(a.display_name, a.email) AS answered_by_name`;
const SENT_FROM = `FROM wedding_questionnaires wq
                   LEFT JOIN users s ON s.id = wq.sent_by
                   LEFT JOIN users a ON a.id = wq.answered_by`;

/**
 * Copies one of the sender's questionnaires into the wedding.
 * @param {string} weddingId
 * @param {{title: string, intro: string|null, questions: Array<Object>}} questionnaire - Normalised.
 * @param {string} sentBy
 * @returns {Promise<{id: string}>}
 */
const sendQuestionnaire = async (weddingId, { title, intro, questions }, sentBy) => {
    const result = await db.query(
        `INSERT INTO wedding_questionnaires (wedding_id, title, intro, questions, sent_by) VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING id;`,
        [weddingId, title, intro, JSON.stringify(questions), sentBy]
    );
    return result.rows[0];
};

/**
 * @param {string} weddingId
 * @returns {Promise<Array<Object>>} Newest first.
 */
const findSentQuestionnaires = async (weddingId) => {
    const result = await db.query(
        `SELECT ${SENT_COLUMNS} ${SENT_FROM} WHERE wq.wedding_id = $1 ORDER BY wq.sent_at DESC, wq.id;`,
        [weddingId]
    );
    return result.rows;
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<Object|null>}
 */
const findSentQuestionnaire = async (id, weddingId) => {
    const result = await db.query(`SELECT ${SENT_COLUMNS} ${SENT_FROM} WHERE wq.id = $1 AND wq.wedding_id = $2;`, [
        id,
        weddingId
    ]);
    return result.rows[0] ?? null;
};

/**
 * Saves the answers (the last save wins) and who gave them.
 * @param {string} id
 * @param {string} weddingId
 * @param {string[]} answers - Already validated against the questions.
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
const saveAnswers = async (id, weddingId, answers, userId) => {
    const result = await db.query(
        `UPDATE wedding_questionnaires SET answers = $3::jsonb, answered_by = $4, answered_at = NOW() WHERE id = $1 AND wedding_id = $2;`,
        [id, weddingId, JSON.stringify(answers), userId]
    );
    return result.rowCount > 0;
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<boolean>}
 */
const deleteSentQuestionnaire = async (id, weddingId) => {
    const result = await db.query(`DELETE FROM wedding_questionnaires WHERE id = $1 AND wedding_id = $2;`, [
        id,
        weddingId
    ]);
    return result.rowCount > 0;
};

export {
    findMessages,
    findMessage,
    createMessage,
    updateMessage,
    deleteMessage,
    findQuestionnaires,
    findQuestionnaire,
    createQuestionnaire,
    updateQuestionnaire,
    deleteQuestionnaire,
    sendQuestionnaire,
    findSentQuestionnaires,
    findSentQuestionnaire,
    saveAnswers,
    deleteSentQuestionnaire
};
