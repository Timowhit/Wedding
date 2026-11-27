import db from './db.js';

/**
 * A person's templates, newest first, optionally of one kind.
 * @param {string} userId
 * @param {'checklist'|'schedule'} [kind]
 * @returns {Promise<Array<{id: string, kind: string, name: string, item_count: number, updated_at: Date}>>}
 */
const findTemplates = async (userId, kind = null) => {
    const result = await db.query(
        `SELECT id, kind, name, jsonb_array_length(items) AS item_count, updated_at
         FROM templates
         WHERE user_id = $1 AND ($2::text IS NULL OR kind = $2)
         ORDER BY kind ASC, LOWER(name) ASC, id ASC;`,
        [userId, kind]
    );
    return result.rows;
};

/**
 * One of the person's templates with its items.
 * @param {string} id
 * @param {string} userId
 * @returns {Promise<{id: string, kind: string, name: string, items: unknown}|null>} Null if it isn't theirs.
 */
const findTemplate = async (id, userId) => {
    const result = await db.query('SELECT id, kind, name, items FROM templates WHERE id = $1 AND user_id = $2;', [
        id,
        userId
    ]);
    return result.rows[0] ?? null;
};

/**
 * @param {string} userId
 * @returns {Promise<number>}
 */
const countTemplates = async (userId) => {
    const result = await db.query('SELECT COUNT(*)::int AS count FROM templates WHERE user_id = $1;', [userId]);
    return result.rows[0].count;
};

/**
 * Saves a template; an existing template of the same kind and name gets the new items.
 * @param {string} userId
 * @param {'checklist'|'schedule'} kind
 * @param {string} name - Already validated.
 * @param {Array<object>} items - Already built from the wedding.
 * @returns {Promise<{id: string, replaced: boolean}>}
 */
const saveTemplate = async (userId, kind, name, items) => {
    const result = await db.query(
        `INSERT INTO templates (user_id, kind, name, items) VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (user_id, kind, name) DO UPDATE SET items = EXCLUDED.items
         RETURNING id, (xmax <> 0) AS replaced;`,
        [userId, kind, name, JSON.stringify(items)]
    );
    return result.rows[0];
};

/**
 * @param {string} id
 * @param {string} userId
 * @param {string} name - Already validated.
 * @returns {Promise<boolean>} False when the template isn't theirs.
 * @throws {Error} PG_ERRORS.UNIQUE_VIOLATION when they already have a template of that kind and name.
 */
const renameTemplate = async (id, userId, name) => {
    const result = await db.query('UPDATE templates SET name = $3 WHERE id = $1 AND user_id = $2;', [id, userId, name]);
    return result.rowCount > 0;
};

/**
 * @param {string} id
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
const deleteTemplate = async (id, userId) => {
    const result = await db.query('DELETE FROM templates WHERE id = $1 AND user_id = $2;', [id, userId]);
    return result.rowCount > 0;
};

/**
 * Adds checklist tasks to a wedding, skipping texts the checklist already has.
 * @param {string} weddingId
 * @param {Array<{text: string, category: string, dueDate: string|null}>} items - Already normalised.
 * @returns {Promise<{added: number, skipped: number}>}
 */
const addChecklistItems = async (weddingId, items) => {
    const result = await db.query(
        `INSERT INTO checklist_tasks (wedding_id, text, category, due_date, sort_order)
         SELECT $1, t.text, t.category, t.due::date, t.ord
         FROM unnest($2::text[], $3::text[], $4::text[]) WITH ORDINALITY AS t(text, category, due, ord)
         ON CONFLICT (wedding_id, text) DO NOTHING;`,
        [weddingId, items.map((i) => i.text), items.map((i) => i.category), items.map((i) => i.dueDate)]
    );
    return { added: result.rowCount, skipped: items.length - result.rowCount };
};

/**
 * Adds event-day schedule items to a wedding.
 * @param {string} weddingId
 * @param {Array<{startsAt: string, endsAt: string|null, title: string, location: string|null, notes: string|null, contingency: string|null}>} items - Already normalised.
 * @returns {Promise<number>} How many were added.
 */
const addScheduleItems = async (weddingId, items) => {
    const result = await db.query(
        `INSERT INTO schedule_items (wedding_id, starts_at, ends_at, title, location, notes, contingency)
         SELECT $1, t.starts_at::time, t.ends_at::time, t.title, t.location, t.notes, t.contingency
         FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[])
              AS t(starts_at, ends_at, title, location, notes, contingency);`,
        [
            weddingId,
            items.map((i) => i.startsAt),
            items.map((i) => i.endsAt),
            items.map((i) => i.title),
            items.map((i) => i.location),
            items.map((i) => i.notes),
            items.map((i) => i.contingency)
        ]
    );
    return result.rowCount;
};

export {
    findTemplates,
    findTemplate,
    countTemplates,
    saveTemplate,
    renameTemplate,
    deleteTemplate,
    addChecklistItems,
    addScheduleItems
};
