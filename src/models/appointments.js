import db from './db.js';

const APPOINTMENT_SELECT = `SELECT id, title, to_char(starts_on, 'YYYY-MM-DD') AS starts_on,
                                   to_char(starts_at, 'HH24:MI') AS starts_at, to_char(ends_at, 'HH24:MI') AS ends_at,
                                   location, attendees, notes
                            FROM appointments`;
// Untimed appointments sort after timed ones on the same day.
const APPOINTMENT_ORDER = 'ORDER BY starts_on, starts_at NULLS LAST, created_at, id';

/**
 * A wedding's appointments, split into those still to come (from `today`) and past ones.
 * Dates come back as "YYYY-MM-DD" and times as "HH:MM".
 * @param {string} weddingId
 * @param {string} today - YYYY-MM-DD, from todayIso().
 * @returns {Promise<{upcoming: Array<Object>, past: Array<Object>}>}
 */
const findAppointments = async (weddingId, today) => {
    const result = await db.query(`${APPOINTMENT_SELECT} WHERE wedding_id = $1 ${APPOINTMENT_ORDER};`, [weddingId]);
    return {
        upcoming: result.rows.filter((row) => row.starts_on >= today),
        // Most recent first: the meeting you just had is the one you look back at.
        past: result.rows.filter((row) => row.starts_on < today).reverse()
    };
};

/**
 * The next few appointments from today on, for the dashboard.
 * @param {string} weddingId
 * @param {string} today - YYYY-MM-DD.
 * @param {number} limit
 * @returns {Promise<Array<Object>>}
 */
const findUpcomingAppointments = async (weddingId, today, limit) => {
    const result = await db.query(
        `${APPOINTMENT_SELECT} WHERE wedding_id = $1 AND starts_on >= $2::date ${APPOINTMENT_ORDER} LIMIT $3;`,
        [weddingId, today, limit]
    );
    return result.rows;
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<Object|null>}
 */
const findAppointment = async (id, weddingId) => {
    const result = await db.query(`${APPOINTMENT_SELECT} WHERE id = $1 AND wedding_id = $2;`, [id, weddingId]);
    return result.rows[0] ?? null;
};

const toParams = (v) => [v.title, v.startsOn, v.startsAt, v.endsAt, v.location, v.attendees, v.notes];

/**
 * @param {string} weddingId
 * @param {{title: string, startsOn: string, startsAt: string|null, endsAt: string|null, location: string|null, attendees: string|null, notes: string|null}} values
 *        Already validated.
 * @returns {Promise<{id: string, title: string}>}
 */
const createAppointment = async (weddingId, values) => {
    const result = await db.query(
        `INSERT INTO appointments (wedding_id, title, starts_on, starts_at, ends_at, location, attendees, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, title;`,
        [weddingId, ...toParams(values)]
    );
    return result.rows[0];
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @param {Object} values - As for createAppointment.
 * @returns {Promise<{id: string, title: string}|null>}
 */
const updateAppointment = async (id, weddingId, values) => {
    const result = await db.query(
        `UPDATE appointments
         SET title = $3, starts_on = $4, starts_at = $5, ends_at = $6, location = $7, attendees = $8, notes = $9
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
const deleteAppointment = async (id, weddingId) => {
    const result = await db.query('DELETE FROM appointments WHERE id = $1 AND wedding_id = $2;', [id, weddingId]);
    return result.rowCount > 0;
};

export {
    findAppointments,
    findUpcomingAppointments,
    findAppointment,
    createAppointment,
    updateAppointment,
    deleteAppointment
};
