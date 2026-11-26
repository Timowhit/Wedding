import db from './db.js';

// The vendor join is also scoped to the wedding, so a link can never show another wedding's vendor.
const ITEM_SELECT = `SELECT s.id, to_char(s.starts_at, 'HH24:MI') AS starts_at, to_char(s.ends_at, 'HH24:MI') AS ends_at,
                            s.title, s.location, s.vendor_id, s.contact, s.notes, s.contingency,
                            v.name AS vendor_name, v.phone AS vendor_phone
                     FROM schedule_items s
                     LEFT JOIN vendors v ON v.id = s.vendor_id AND v.wedding_id = s.wedding_id`;

/**
 * The event-day timeline in time order. Times come back as "HH:MM".
 * @param {string} weddingId
 * @returns {Promise<Array<Object>>}
 */
const findScheduleItems = async (weddingId) => {
    const result = await db.query(`${ITEM_SELECT} WHERE s.wedding_id = $1 ORDER BY s.starts_at, s.created_at, s.id;`, [
        weddingId
    ]);
    return result.rows;
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<Object|null>}
 */
const findScheduleItem = async (id, weddingId) => {
    const result = await db.query(`${ITEM_SELECT} WHERE s.id = $1 AND s.wedding_id = $2;`, [id, weddingId]);
    return result.rows[0] ?? null;
};

const VALUE_COLUMNS = 'starts_at, ends_at, title, location, vendor_id, contact, notes, contingency';
const toParams = (v) => [v.startsAt, v.endsAt, v.title, v.location, v.vendorId, v.contact, v.notes, v.contingency];

/**
 * @param {string} weddingId
 * @param {{startsAt: string, endsAt: string|null, title: string, location: string|null, vendorId: string|null, contact: string|null, notes: string|null, contingency: string|null}} values
 *        Already validated; vendorId belongs to this wedding.
 * @returns {Promise<{id: string, title: string}>}
 */
const createScheduleItem = async (weddingId, values) => {
    const result = await db.query(
        `INSERT INTO schedule_items (wedding_id, ${VALUE_COLUMNS})
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, title;`,
        [weddingId, ...toParams(values)]
    );
    return result.rows[0];
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @param {Object} values - As for createScheduleItem.
 * @returns {Promise<{id: string, title: string}|null>}
 */
const updateScheduleItem = async (id, weddingId, values) => {
    const result = await db.query(
        `UPDATE schedule_items
         SET starts_at = $3, ends_at = $4, title = $5, location = $6, vendor_id = $7, contact = $8, notes = $9, contingency = $10
         WHERE id = $1 AND wedding_id = $2
         RETURNING id, title;`,
        [id, weddingId, ...toParams(values)]
    );
    return result.rows[0] ?? null;
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<boolean>}
 */
const deleteScheduleItem = async (id, weddingId) => {
    const result = await db.query('DELETE FROM schedule_items WHERE id = $1 AND wedding_id = $2;', [id, weddingId]);
    return result.rowCount > 0;
};

export { findScheduleItems, findScheduleItem, createScheduleItem, updateScheduleItem, deleteScheduleItem };
