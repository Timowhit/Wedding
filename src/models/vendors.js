import db from './db.js';

const VENDOR_COLUMNS = 'id, name, category, phone, email, website, status, notes, created_at';

/**
 * Vendors alphabetically, optionally only one booking status.
 * @param {string} weddingId
 * @param {string|null} [status] - Already validated against VENDOR_STATUSES.
 * @returns {Promise<Array<Object>>}
 */
const findVendors = async (weddingId, status = null) => {
    const result = await db.query(
        `SELECT ${VENDOR_COLUMNS}
         FROM vendors
         WHERE wedding_id = $1 AND ($2::text IS NULL OR status = $2)
         ORDER BY LOWER(name) ASC, id ASC;`,
        [weddingId, status]
    );
    return result.rows;
};

/**
 * Number of vendors per status, over all vendors.
 * @param {string} weddingId
 * @returns {Promise<{total: number, booked: number}>}
 */
const findVendorStats = async (weddingId) => {
    const result = await db.query(
        `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'Booked') AS booked
         FROM vendors WHERE wedding_id = $1;`,
        [weddingId]
    );
    return { total: Number(result.rows[0].total), booked: Number(result.rows[0].booked) };
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<Object|null>}
 */
const findVendor = async (id, weddingId) => {
    const result = await db.query(`SELECT ${VENDOR_COLUMNS} FROM vendors WHERE id = $1 AND wedding_id = $2;`, [
        id,
        weddingId
    ]);
    return result.rows[0] ?? null;
};

/**
 * @param {string} weddingId
 * @param {{name: string, category: string, phone: string|null, email: string|null, website: string|null, status: string, notes: string|null}} values - Already validated.
 * @returns {Promise<{id: string, name: string}>}
 */
const createVendor = async (weddingId, { name, category, phone, email, website, status, notes }) => {
    const result = await db.query(
        `INSERT INTO vendors (wedding_id, name, category, phone, email, website, status, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, name;`,
        [weddingId, name, category, phone, email, website, status, notes]
    );
    return result.rows[0];
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @param {{name: string, category: string, phone: string|null, email: string|null, website: string|null, status: string, notes: string|null}} values - Already validated.
 * @returns {Promise<{id: string, name: string}|null>}
 */
const updateVendor = async (id, weddingId, { name, category, phone, email, website, status, notes }) => {
    const result = await db.query(
        `UPDATE vendors
         SET name = $3, category = $4, phone = $5, email = $6, website = $7, status = $8, notes = $9
         WHERE id = $1 AND wedding_id = $2
         RETURNING id, name;`,
        [id, weddingId, name, category, phone, email, website, status, notes]
    );
    return result.rows[0] ?? null;
};

/**
 * Sets only the booking status (the one-click status button).
 * @param {string} id
 * @param {string} weddingId
 * @param {string} status - Already validated.
 * @returns {Promise<{id: string, name: string, status: string}|null>}
 */
const updateVendorStatus = async (id, weddingId, status) => {
    const result = await db.query(
        'UPDATE vendors SET status = $3 WHERE id = $1 AND wedding_id = $2 RETURNING id, name, status;',
        [id, weddingId, status]
    );
    return result.rows[0] ?? null;
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<boolean>}
 */
const deleteVendor = async (id, weddingId) => {
    const result = await db.query('DELETE FROM vendors WHERE id = $1 AND wedding_id = $2;', [id, weddingId]);
    return result.rowCount > 0;
};

export { findVendors, findVendorStats, findVendor, createVendor, updateVendor, updateVendorStatus, deleteVendor };
