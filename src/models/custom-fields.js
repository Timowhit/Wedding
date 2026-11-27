import { MAX_CUSTOM_FIELDS } from '../constants.js';
import db from './db.js';

// The table behind each entity: only these, never a name from a request.
const ENTITY_TABLES = Object.freeze({ guest: 'guests', vendor: 'vendors', task: 'checklist_tasks' });
const FIELD_COLUMNS = 'id, entity, label, type, options';

/**
 * A wedding's custom fields, oldest first; optionally only one entity's.
 * @param {string} weddingId
 * @param {'guest'|'vendor'|'task'} [entity]
 * @returns {Promise<Array<{id: string, entity: string, label: string, type: string, options: string[]}>>}
 */
const findCustomFields = async (weddingId, entity = null) => {
    const result = await db.query(
        `SELECT ${FIELD_COLUMNS} FROM custom_fields
         WHERE wedding_id = $1 AND ($2::text IS NULL OR entity = $2)
         ORDER BY created_at, id;`,
        [weddingId, entity]
    );
    return result.rows;
};

/**
 * Adds a field, unless the entity already has MAX_CUSTOM_FIELDS or one with this label.
 * @param {string} weddingId
 * @param {{entity: string, label: string, type: string, options: string[]}} field - Already validated.
 * @returns {Promise<'added'|'exists'|'full'>}
 */
const addCustomField = async (weddingId, { entity, label, type, options }) => {
    const result = await db.query(
        `INSERT INTO custom_fields (wedding_id, entity, label, type, options)
         SELECT $1, $2, $3, $4, $5::jsonb
         WHERE (SELECT COUNT(*) FROM custom_fields WHERE wedding_id = $1 AND entity = $2) < $6
         ON CONFLICT DO NOTHING
         RETURNING id;`,
        [weddingId, entity, label, type, JSON.stringify(options), MAX_CUSTOM_FIELDS]
    );
    if (result.rowCount > 0) return 'added';
    const exists = await db.query(
        `SELECT 1 FROM custom_fields WHERE wedding_id = $1 AND entity = $2 AND LOWER(label) = LOWER($3);`,
        [weddingId, entity, label]
    );
    return exists.rowCount > 0 ? 'exists' : 'full';
};

/**
 * Deletes a field and its values on every row of its entity.
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<boolean>}
 */
const deleteCustomField = async (id, weddingId) => {
    const deleted = await db.query(`DELETE FROM custom_fields WHERE id = $1 AND wedding_id = $2 RETURNING entity;`, [
        id,
        weddingId
    ]);
    if (deleted.rowCount === 0) return false;
    const table = ENTITY_TABLES[deleted.rows[0].entity];
    await db.query(`UPDATE ${table} SET custom = custom - $2::text WHERE wedding_id = $1 AND custom ? $2::text;`, [
        weddingId,
        id
    ]);
    return true;
};

/**
 * Replaces a row's custom values.
 * @param {'guest'|'vendor'|'task'} entity
 * @param {string} id - The guest, vendor or task.
 * @param {string} weddingId
 * @param {Object<string, string|number|boolean>} values - Already validated against this wedding's fields.
 * @returns {Promise<void>}
 */
const saveCustomValues = async (entity, id, weddingId, values) => {
    await db.query(`UPDATE ${ENTITY_TABLES[entity]} SET custom = $3::jsonb WHERE id = $1 AND wedding_id = $2;`, [
        id,
        weddingId,
        JSON.stringify(values)
    ]);
};

/**
 * Adds fields from a whole-wedding template, skipping labels the wedding already has.
 * @param {string} weddingId
 * @param {Array<{entity: string, label: string, type: string, options: string[]}>} fields - Already validated.
 * @returns {Promise<void>}
 */
const addCustomFieldsIfMissing = async (weddingId, fields) => {
    for (const field of fields) await addCustomField(weddingId, field);
};

export { addCustomFieldsIfMissing, findCustomFields, addCustomField, deleteCustomField, saveCustomValues };
