import db from './db.js';

const GUEST_COLUMNS = 'id, name, rsvp, diet, plus_one, group_name, table_id, meal, accessibility, created_at';

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
 * How many guests who haven't declined chose each meal (most chosen first), and how many haven't
 * chosen yet. Meals are free text, so "fish" and "Fish" count together, shown as first written.
 * @param {string} weddingId
 * @returns {Promise<{meals: Array<{meal: string, count: number}>, notChosen: number}>}
 */
const findMealSummary = async (weddingId) => {
    const result = await db.query(
        `SELECT MIN(meal) AS meal, COUNT(*)::int AS count, meal IS NULL AS not_chosen
         FROM guests
         WHERE wedding_id = $1 AND rsvp <> 'Declined'
         GROUP BY LOWER(meal), meal IS NULL
         ORDER BY not_chosen, count DESC, LOWER(MIN(meal));`,
        [weddingId]
    );
    const notChosen = result.rows.find((row) => row.not_chosen)?.count ?? 0;
    return {
        meals: result.rows.filter((row) => !row.not_chosen).map(({ meal, count }) => ({ meal, count })),
        notChosen
    };
};

/**
 * Every meal written for this wedding, for the form's suggestions.
 * @param {string} weddingId
 * @returns {Promise<string[]>}
 */
const findMealOptions = async (weddingId) => {
    const result = await db.query(
        `SELECT MIN(meal) AS meal FROM guests WHERE wedding_id = $1 AND meal IS NOT NULL GROUP BY LOWER(meal) ORDER BY LOWER(MIN(meal));`,
        [weddingId]
    );
    return result.rows.map((row) => row.meal);
};

/**
 * @param {string} weddingId
 * @param {{name: string, rsvp: string, diet: string|null, plusOne: string|null, groupName: string|null, meal?: string|null, accessibility?: string|null}} values - Already validated.
 * @returns {Promise<{id: string, name: string}>}
 */
const createGuest = async (
    weddingId,
    { name, rsvp, diet, plusOne, groupName = null, meal = null, accessibility = null }
) => {
    const result = await db.query(
        `INSERT INTO guests (wedding_id, name, rsvp, diet, plus_one, group_name, meal, accessibility)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, name;`,
        [weddingId, name, rsvp, diet, plusOne, groupName, meal, accessibility]
    );
    return result.rows[0];
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @param {{name: string, rsvp: string, diet: string|null, plusOne: string|null, groupName: string|null, meal?: string|null, accessibility?: string|null}} values - Already validated.
 * @returns {Promise<{id: string, name: string}|null>}
 */
const updateGuest = async (
    id,
    weddingId,
    { name, rsvp, diet, plusOne, groupName = null, meal = null, accessibility = null }
) => {
    const result = await db.query(
        `UPDATE guests SET name = $3, rsvp = $4, diet = $5, plus_one = $6, group_name = $7, meal = $8, accessibility = $9
         WHERE id = $1 AND wedding_id = $2
         RETURNING id, name;`,
        [id, weddingId, name, rsvp, diet, plusOne, groupName, meal, accessibility]
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

export {
    findGuests,
    findGuestStats,
    findGuest,
    createGuest,
    updateGuest,
    updateGuestRsvp,
    deleteGuest,
    findMealSummary,
    findMealOptions
};
