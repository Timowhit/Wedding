import db from './db.js';

const GUEST_COLUMNS = 'id, name, rsvp, diet, plus_one, created_at';

/**
 * Guests alphabetically, optionally only one RSVP status.
 * @param {string} weddingId
 * @param {string|null} [rsvp] - Already validated against RSVP_STATUSES.
 * @returns {Promise<Array<Object>>}
 */
const findGuests = async (weddingId, rsvp = null) => {
    const result = await db.query(
        `SELECT ${GUEST_COLUMNS}
         FROM guests
         WHERE wedding_id = $1 AND ($2::text IS NULL OR rsvp = $2)
         ORDER BY LOWER(name) ASC, id ASC;`,
        [weddingId, rsvp]
    );
    return result.rows;
};

/**
 * RSVP counts over all guests.
 * @param {string} weddingId
 * @returns {Promise<{total: number, confirmed: number, pending: number, declined: number, plusOnes: number}>}
 */
const findGuestStats = async (weddingId) => {
    const result = await db.query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE rsvp = 'Confirmed') AS confirmed,
                COUNT(*) FILTER (WHERE rsvp = 'Pending') AS pending,
                COUNT(*) FILTER (WHERE rsvp = 'Declined') AS declined,
                COUNT(*) FILTER (WHERE plus_one IS NOT NULL AND plus_one <> '') AS plus_ones
         FROM guests WHERE wedding_id = $1;`,
        [weddingId]
    );
    const row = result.rows[0];
    return {
        total: Number(row.total),
        confirmed: Number(row.confirmed),
        pending: Number(row.pending),
        declined: Number(row.declined),
        plusOnes: Number(row.plus_ones)
    };
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<Object|null>}
 */
const findGuest = async (id, weddingId) => {
    const result = await db.query(`SELECT ${GUEST_COLUMNS} FROM guests WHERE id = $1 AND wedding_id = $2;`, [
        id,
        weddingId
    ]);
    return result.rows[0] ?? null;
};

/**
 * @param {string} weddingId
 * @param {{name: string, rsvp: string, diet: string|null, plusOne: string|null}} values - Already validated.
 * @returns {Promise<{id: string, name: string}>}
 */
const createGuest = async (weddingId, { name, rsvp, diet, plusOne }) => {
    const result = await db.query(
        `INSERT INTO guests (wedding_id, name, rsvp, diet, plus_one)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name;`,
        [weddingId, name, rsvp, diet, plusOne]
    );
    return result.rows[0];
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @param {{name: string, rsvp: string, diet: string|null, plusOne: string|null}} values - Already validated.
 * @returns {Promise<{id: string, name: string}|null>}
 */
const updateGuest = async (id, weddingId, { name, rsvp, diet, plusOne }) => {
    const result = await db.query(
        `UPDATE guests SET name = $3, rsvp = $4, diet = $5, plus_one = $6
         WHERE id = $1 AND wedding_id = $2
         RETURNING id, name;`,
        [id, weddingId, name, rsvp, diet, plusOne]
    );
    return result.rows[0] ?? null;
};

/**
 * Sets only the RSVP status (the one-click status button).
 * @param {string} id
 * @param {string} weddingId
 * @param {string} rsvp - Already validated.
 * @returns {Promise<{id: string, name: string, rsvp: string}|null>}
 */
const updateGuestRsvp = async (id, weddingId, rsvp) => {
    const result = await db.query(
        'UPDATE guests SET rsvp = $3 WHERE id = $1 AND wedding_id = $2 RETURNING id, name, rsvp;',
        [id, weddingId, rsvp]
    );
    return result.rows[0] ?? null;
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<boolean>}
 */
const deleteGuest = async (id, weddingId) => {
    const result = await db.query('DELETE FROM guests WHERE id = $1 AND wedding_id = $2;', [id, weddingId]);
    return result.rowCount > 0;
};

export { findGuests, findGuestStats, findGuest, createGuest, updateGuest, updateGuestRsvp, deleteGuest };
