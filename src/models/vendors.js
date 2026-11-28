import db from './db.js';

const VENDOR_COLUMNS = `id, name, category, phone, email, website, status, notes, created_at,
    contract_total::float AS contract_total, contract_signed_on, contract_url, contract_includes, contract_cancellation,
    rating, review, custom`;

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

/**
 * Saves a vendor's contract details. All-null values clear the contract.
 * @param {string} id
 * @param {string} weddingId
 * @param {{total: number|null, signedOn: string|null, url: string|null, includes: string|null, cancellation: string|null}} contract - Already validated.
 * @returns {Promise<boolean>} False when the vendor is not in this wedding.
 */
const updateContract = async (id, weddingId, { total, signedOn, url, includes, cancellation }) => {
    const result = await db.query(
        `UPDATE vendors SET contract_total = $3, contract_signed_on = $4, contract_url = $5,
                contract_includes = $6, contract_cancellation = $7
         WHERE id = $1 AND wedding_id = $2;`,
        [id, weddingId, total, signedOn, url, includes, cancellation]
    );
    return result.rowCount > 0;
};

/**
 * Number of payments per vendor, for the delete confirmation on the vendor list.
 * @param {string} weddingId
 * @returns {Promise<Map<string, number>>}
 */
const countVendorPayments = async (weddingId) => {
    const result = await db.query(
        'SELECT vendor_id, COUNT(*)::int AS count FROM vendor_payments WHERE wedding_id = $1 GROUP BY vendor_id;',
        [weddingId]
    );
    return new Map(result.rows.map((row) => [row.vendor_id, row.count]));
};

/**
 * Saves a vendor's rating (1-5) and review after the wedding; null for both clears them.
 * @param {string} id
 * @param {string} weddingId
 * @param {{rating: number|null, review: string|null}} values - Already validated.
 * @returns {Promise<boolean>} False when no such vendor exists in this wedding.
 */
const rateVendor = async (id, weddingId, { rating, review }) => {
    const result = await db.query(`UPDATE vendors SET rating = $3, review = $4 WHERE id = $1 AND wedding_id = $2;`, [
        id,
        weddingId,
        rating,
        review
    ]);
    return result.rowCount > 0;
};

/**
 * Booked vendors nobody has rated yet (the wrap-up list).
 * @param {string} weddingId
 * @param {string} bookedStatus - COUNTED_STATUS.
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
const findUnratedBookedVendors = async (weddingId, bookedStatus) => {
    const result = await db.query(
        `SELECT id, name FROM vendors WHERE wedding_id = $1 AND status = $2 AND rating IS NULL ORDER BY LOWER(name), id;`,
        [weddingId, bookedStatus]
    );
    return result.rows;
};

/**
 * Adds vendors from a whole-wedding template, skipping names the wedding already has.
 * @param {string} weddingId
 * @param {Array<{name: string, category: string}>} vendors - Already normalised.
 * @param {string} status - The status new vendors start with.
 * @returns {Promise<number>} How many were added.
 */
const addVendorsIfMissing = async (weddingId, vendors, status) => {
    const result = await db.query(
        `INSERT INTO vendors (wedding_id, name, category, status)
         SELECT $1, v.name, v.category, $4 FROM UNNEST($2::text[], $3::text[]) AS v(name, category)
         WHERE NOT EXISTS (SELECT 1 FROM vendors e WHERE e.wedding_id = $1 AND LOWER(e.name) = LOWER(v.name));`,
        [weddingId, vendors.map((vendor) => vendor.name), vendors.map((vendor) => vendor.category), status]
    );
    return result.rowCount;
};

export {
    addVendorsIfMissing,
    rateVendor,
    findUnratedBookedVendors,
    findVendors,
    findVendorStats,
    findVendor,
    createVendor,
    updateVendor,
    updateVendorStatus,
    deleteVendor,
    updateContract,
    countVendorPayments
};
