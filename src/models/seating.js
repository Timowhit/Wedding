import db from './db.js';

/** Seats a guest takes: themselves plus a named plus-one. */
const SEATS_TAKEN = `(1 + CASE WHEN g.plus_one IS NOT NULL AND g.plus_one <> '' THEN 1 ELSE 0 END)`;

/**
 * Tables in order, each with its seated guests (declined guests are never counted) and seats used.
 * @param {string} weddingId
 * @returns {Promise<Array<{id: string, name: string, seats: number, used: number, guests: Array<{id: string, name: string, plus_one: string|null, group_name: string|null}>}>>}
 */
const findTablesWithGuests = async (weddingId) => {
    const [tables, guests] = await Promise.all([
        db.query(
            `SELECT id, name, seats FROM seating_tables WHERE wedding_id = $1 ORDER BY sort_order, LOWER(name), id;`,
            [weddingId]
        ),
        db.query(
            `SELECT g.id, g.name, g.plus_one, g.group_name, g.accessibility, g.table_id, ${SEATS_TAKEN} AS seats_taken
             FROM guests g
             WHERE g.wedding_id = $1 AND g.table_id IS NOT NULL AND g.rsvp <> 'Declined'
             ORDER BY LOWER(g.name), g.id;`,
            [weddingId]
        )
    ]);
    return tables.rows.map((table) => {
        const seated = guests.rows.filter((guest) => guest.table_id === table.id);
        return { ...table, guests: seated, used: seated.reduce((sum, guest) => sum + guest.seats_taken, 0) };
    });
};

/**
 * Guests without a table (declined guests excluded), optionally one group only.
 * @param {string} weddingId
 * @param {string|null} [group]
 * @returns {Promise<Array<{id: string, name: string, plus_one: string|null, group_name: string|null}>>}
 */
const findUnseatedGuests = async (weddingId, group = null) => {
    const result = await db.query(
        `SELECT g.id, g.name, g.plus_one, g.group_name, g.accessibility
         FROM guests g
         WHERE g.wedding_id = $1 AND g.table_id IS NULL AND g.rsvp <> 'Declined'
           AND ($2::text IS NULL OR g.group_name = $2)
         ORDER BY g.group_name NULLS LAST, LOWER(g.name), g.id;`,
        [weddingId, group]
    );
    return result.rows;
};

/**
 * @param {string} weddingId
 * @returns {Promise<string[]>} Distinct guest groups, alphabetically.
 */
const findGuestGroups = async (weddingId) => {
    const result = await db.query(
        `SELECT DISTINCT group_name FROM guests WHERE wedding_id = $1 AND group_name IS NOT NULL ORDER BY group_name;`,
        [weddingId]
    );
    return result.rows.map((row) => row.group_name);
};

/**
 * Adds a table at the end of the list.
 * @param {string} weddingId
 * @param {{name: string, seats: number}} values - Already validated.
 * @returns {Promise<{id: string, name: string}>}
 * @throws {Error} With code 23505 when the wedding already has a table with that name.
 */
const createTable = async (weddingId, { name, seats }) => {
    const result = await db.query(
        `INSERT INTO seating_tables (wedding_id, name, seats, sort_order)
         VALUES ($1, $2, $3, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM seating_tables WHERE wedding_id = $1))
         RETURNING id, name;`,
        [weddingId, name, seats]
    );
    return result.rows[0];
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @param {{name: string, seats: number}} values - Already validated.
 * @returns {Promise<{id: string, name: string}|null>}
 * @throws {Error} With code 23505 when another table already has that name.
 */
const updateTable = async (id, weddingId, { name, seats }) => {
    const result = await db.query(
        'UPDATE seating_tables SET name = $3, seats = $4 WHERE id = $1 AND wedding_id = $2 RETURNING id, name;',
        [id, weddingId, name, seats]
    );
    return result.rows[0] ?? null;
};

/**
 * Deletes a table; its guests become unseated (ON DELETE SET NULL).
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<boolean>}
 */
const deleteTable = async (id, weddingId) => {
    const result = await db.query('DELETE FROM seating_tables WHERE id = $1 AND wedding_id = $2;', [id, weddingId]);
    return result.rowCount > 0;
};

/**
 * Seats a guest at a table of the same wedding, or unseats them (tableId null).
 * @param {string} guestId
 * @param {string} weddingId
 * @param {string|null} tableId
 * @returns {Promise<'seated'|'unseated'|'no-guest'|'no-table'|'declined'>}
 */
const assignGuestToTable = async (guestId, weddingId, tableId) => {
    const guest = await db.query('SELECT rsvp FROM guests WHERE id = $1 AND wedding_id = $2;', [guestId, weddingId]);
    if (!guest.rows[0]) return 'no-guest';
    if (tableId === null) {
        await db.query('UPDATE guests SET table_id = NULL WHERE id = $1 AND wedding_id = $2;', [guestId, weddingId]);
        return 'unseated';
    }
    if (guest.rows[0].rsvp === 'Declined') return 'declined';
    // The table must belong to the same wedding; checked in the same statement as the update.
    const result = await db.query(
        `UPDATE guests SET table_id = $3
         WHERE id = $1 AND wedding_id = $2
           AND EXISTS (SELECT 1 FROM seating_tables t WHERE t.id = $3 AND t.wedding_id = $2);`,
        [guestId, weddingId, tableId]
    );
    return result.rowCount > 0 ? 'seated' : 'no-table';
};

export {
    findTablesWithGuests,
    findUnseatedGuests,
    findGuestGroups,
    createTable,
    updateTable,
    deleteTable,
    assignGuestToTable
};
