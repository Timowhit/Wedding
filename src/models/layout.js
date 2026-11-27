import { DEFAULT_ROOM, MAX_LAYOUT_ITEMS, MAX_ROOMS } from '../constants.js';
import db, { withTransaction } from './db.js';

// NUMERIC comes back from pg as a string; the plan works in numbers.
const toRoom = (row) => ({
    id: row.id,
    name: row.name,
    width: Number(row.width),
    depth: Number(row.depth),
    unit: row.unit
});
const toItem = (row) => ({
    ...row,
    x: Number(row.x),
    y: Number(row.y),
    width: Number(row.width),
    depth: Number(row.depth),
    seats: row.seats ?? null,
    seated: row.seated === null || row.seated === undefined ? null : Number(row.seated)
});

const ROOM_COLUMNS = 'id, name, width, depth, unit';

/**
 * The wedding's rooms (or floors), oldest first. A wedding with none gets the default 60 × 40 ft
 * room first; the last room can't be deleted, so there is always one.
 * @param {string} weddingId
 * @returns {Promise<Array<{id: string, name: string|null, width: number, depth: number, unit: string}>>}
 *   The first room's name is null: it is shown as "Main room" in the reader's language.
 */
// Room changes for one wedding happen one at a time (first room, adds, deletes).
const lockRooms = (client, weddingId) =>
    client.query(`SELECT pg_advisory_xact_lock(hashtext('venue_rooms:' || $1));`, [weddingId]);

const findRooms = async (weddingId) => {
    const exists = await db.query(`SELECT 1 FROM venue_rooms WHERE wedding_id = $1 LIMIT 1;`, [weddingId]);
    if (exists.rowCount === 0) {
        // Two first visits at once (a page and the offline worker) must not make two first rooms.
        await withTransaction(async (client) => {
            await lockRooms(client, weddingId);
            await client.query(
                `INSERT INTO venue_rooms (wedding_id, width, depth, unit)
                 SELECT $1, $2, $3, $4 WHERE NOT EXISTS (SELECT 1 FROM venue_rooms WHERE wedding_id = $1);`,
                [weddingId, DEFAULT_ROOM.width, DEFAULT_ROOM.depth, DEFAULT_ROOM.unit]
            );
        });
    }
    const result = await db.query(
        `SELECT ${ROOM_COLUMNS} FROM venue_rooms WHERE wedding_id = $1 ORDER BY created_at, id;`,
        [weddingId]
    );
    return result.rows.map(toRoom);
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<{id: string, name: string|null, width: number, depth: number, unit: string}|null>}
 */
const findRoom = async (id, weddingId) => {
    const result = await db.query(`SELECT ${ROOM_COLUMNS} FROM venue_rooms WHERE id = $1 AND wedding_id = $2;`, [
        id,
        weddingId
    ]);
    return result.rows[0] ? toRoom(result.rows[0]) : null;
};

/**
 * Adds a room, unless the wedding already has MAX_ROOMS.
 * @param {string} weddingId
 * @param {{name: string, width: number, depth: number, unit: string}} room - Already validated.
 * @returns {Promise<{id: string}|null>}
 */
const addRoom = async (weddingId, { name, width, depth, unit }) =>
    withTransaction(async (client) => {
        await lockRooms(client, weddingId);
        const result = await client.query(
            `INSERT INTO venue_rooms (wedding_id, name, width, depth, unit)
             SELECT $1, $2, $3, $4, $5 WHERE (SELECT COUNT(*) FROM venue_rooms WHERE wedding_id = $1) < $6
             RETURNING id;`,
            [weddingId, name, width, depth, unit, MAX_ROOMS]
        );
        return result.rows[0] ?? null;
    });

/**
 * @param {string} id
 * @param {string} weddingId
 * @param {{name: string|null, width: number, depth: number, unit: string}} room - Already validated.
 * @returns {Promise<boolean>}
 */
const saveRoom = async (id, weddingId, { name, width, depth, unit }) => {
    const result = await db.query(
        `UPDATE venue_rooms SET name = $3, width = $4, depth = $5, unit = $6 WHERE id = $1 AND wedding_id = $2;`,
        [id, weddingId, name, width, depth, unit]
    );
    return result.rowCount > 0;
};

/**
 * Deletes a room and puts its pieces in the inventory, resized by `toInventory` (the inventory
 * keeps sizes in feet). The wedding's last room stays.
 * @param {string} id
 * @param {string} weddingId
 * @param {(piece: {x: number, y: number, width: number, depth: number}, unit: string) => {width: number, depth: number}} toInventory
 * @returns {Promise<boolean>} False when there is no such room, or it is the last one.
 */
const deleteRoom = async (id, weddingId, toInventory) =>
    withTransaction(async (client) => {
        await lockRooms(client, weddingId);
        const rooms = await client.query(`SELECT id, unit FROM venue_rooms WHERE wedding_id = $1;`, [weddingId]);
        const room = rooms.rows.find((row) => row.id === id);
        if (!room || rooms.rows.length <= 1) return false;
        const pieces = await client.query(
            `SELECT id, x, y, width, depth FROM layout_items WHERE room_id = $1 AND wedding_id = $2;`,
            [id, weddingId]
        );
        for (const row of pieces.rows) {
            const { width, depth } = toInventory(toItem(row), room.unit);
            await client.query(
                `UPDATE layout_items SET room_id = NULL, x = 0, y = 0, width = $3, depth = $4 WHERE id = $1 AND wedding_id = $2;`,
                [row.id, weddingId, width, depth]
            );
        }
        await client.query(`DELETE FROM venue_rooms WHERE id = $1 AND wedding_id = $2;`, [id, weddingId]);
        return true;
    });

// A placed table brings its name, seats and how many guests sit there; both joins are scoped to the wedding.
const ITEM_SELECT = `SELECT i.id, i.room_id, i.kind, i.label, i.table_id, i.shape, i.x, i.y, i.width, i.depth, i.rotation,
                            t.name AS table_name, t.seats,
                            (SELECT COUNT(*) FROM guests g WHERE g.table_id = t.id AND g.wedding_id = i.wedding_id) AS seated
                     FROM layout_items i
                     LEFT JOIN seating_tables t ON t.id = i.table_id AND t.wedding_id = i.wedding_id`;

/**
 * The pieces in one room, oldest first (so newer pieces are drawn on top), or in the inventory.
 * @param {string} weddingId
 * @param {string|null} roomId - Null for the inventory (pieces off every plan).
 * @returns {Promise<Array<Object>>}
 */
const findLayoutItems = async (weddingId, roomId) => {
    const result = await db.query(
        `${ITEM_SELECT} WHERE i.wedding_id = $1 AND i.room_id IS NOT DISTINCT FROM $2::uuid ORDER BY i.created_at, i.id;`,
        [weddingId, roomId]
    );
    return result.rows.map(toItem);
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<Object|null>}
 */
const findLayoutItem = async (id, weddingId) => {
    const result = await db.query(`${ITEM_SELECT} WHERE i.id = $1 AND i.wedding_id = $2;`, [id, weddingId]);
    return result.rows[0] ? toItem(result.rows[0]) : null;
};

/**
 * Seating tables not on the plan yet.
 * @param {string} weddingId
 * @returns {Promise<Array<{id: string, name: string, seats: number}>>}
 */
const findUnplacedTables = async (weddingId) => {
    const result = await db.query(
        `SELECT t.id, t.name, t.seats FROM seating_tables t
         WHERE t.wedding_id = $1 AND NOT EXISTS (SELECT 1 FROM layout_items i WHERE i.table_id = t.id)
         ORDER BY t.sort_order, t.name;`,
        [weddingId]
    );
    return result.rows;
};

/**
 * One seating table of this wedding, and whether it is on the plan already.
 * @param {string} tableId
 * @param {string} weddingId
 * @returns {Promise<{id: string, name: string, seats: number, placed: boolean}|null>}
 */
const findTableForLayout = async (tableId, weddingId) => {
    const result = await db.query(
        `SELECT t.id, t.name, t.seats, EXISTS (SELECT 1 FROM layout_items i WHERE i.table_id = t.id) AS placed
         FROM seating_tables t WHERE t.id = $1 AND t.wedding_id = $2;`,
        [tableId, weddingId]
    );
    return result.rows[0] ?? null;
};

/**
 * @param {string} weddingId
 * @returns {Promise<number>}
 */
const countLayoutItems = async (weddingId) => {
    const result = await db.query(`SELECT COUNT(*)::int AS n FROM layout_items WHERE wedding_id = $1;`, [weddingId]);
    return result.rows[0].n;
};

const PIECE_COLUMNS = 'room_id, kind, label, table_id, shape, x, y, width, depth, rotation';

/**
 * Adds a piece, unless the plan already has MAX_LAYOUT_ITEMS. A table piece is only added when the
 * table belongs to this wedding and is not on the plan yet.
 * @param {string} weddingId
 * @param {{roomId: string|null, kind: string, label: string|null, tableId: string|null, shape: string, x: number, y: number, width: number, depth: number, rotation: number}} piece - Already validated; roomId null keeps it in the inventory.
 * @returns {Promise<{id: string}|null>} Null when nothing was added.
 */
const addLayoutItem = async (weddingId, piece) => {
    const result = await db.query(
        `INSERT INTO layout_items (wedding_id, ${PIECE_COLUMNS})
         SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
         WHERE (SELECT COUNT(*) FROM layout_items WHERE wedding_id = $1) < $12
           AND ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM venue_rooms WHERE id = $2 AND wedding_id = $1))
           AND ($5::uuid IS NULL OR EXISTS (SELECT 1 FROM seating_tables WHERE id = $5 AND wedding_id = $1))
         ON CONFLICT (table_id) DO NOTHING
         RETURNING id;`,
        [
            weddingId,
            piece.roomId,
            piece.kind,
            piece.label,
            piece.tableId,
            piece.shape,
            piece.x,
            piece.y,
            piece.width,
            piece.depth,
            piece.rotation,
            MAX_LAYOUT_ITEMS
        ]
    );
    return result.rows[0] ?? null;
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @param {{label: string|null, shape: string, x: number, y: number, width: number, depth: number, rotation: number}} piece - Already validated and inside the room.
 * @param {string} roomId - The room it was read from: if it has moved since, nothing changes.
 * @returns {Promise<boolean>}
 */
const updateLayoutItem = async (id, weddingId, piece, roomId) => {
    const result = await db.query(
        `UPDATE layout_items SET label = $3, shape = $4, x = $5, y = $6, width = $7, depth = $8, rotation = $9
         WHERE id = $1 AND wedding_id = $2 AND room_id = $10;`,
        [id, weddingId, piece.label, piece.shape, piece.x, piece.y, piece.width, piece.depth, piece.rotation, roomId]
    );
    return result.rowCount > 0;
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @param {{x: number, y: number}} position - Already inside the room.
 * @returns {Promise<boolean>}
 */
const moveLayoutItem = async (id, weddingId, { x, y }) => {
    const result = await db.query(`UPDATE layout_items SET x = $3, y = $4 WHERE id = $1 AND wedding_id = $2;`, [
        id,
        weddingId,
        x,
        y
    ]);
    return result.rowCount > 0;
};

/**
 * Puts a piece in a room (at the given place and size, already converted to that room's unit and
 * inside it) or, with roomId null, in the inventory.
 * @param {string} id
 * @param {string} weddingId
 * @param {string|null} roomId - A room of this wedding (checked here too), or null.
 * @param {{x: number, y: number, width: number, depth: number}} place
 * @returns {Promise<boolean>}
 */
const setItemRoom = async (id, weddingId, roomId, { x, y, width, depth }) => {
    const result = await db.query(
        `UPDATE layout_items SET room_id = $3, x = $4, y = $5, width = $6, depth = $7
         WHERE id = $1 AND wedding_id = $2
           AND ($3::uuid IS NULL OR EXISTS (SELECT 1 FROM venue_rooms WHERE id = $3 AND wedding_id = $2));`,
        [id, weddingId, roomId, x, y, width, depth]
    );
    return result.rowCount > 0;
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<boolean>}
 */
const deleteLayoutItem = async (id, weddingId) => {
    const result = await db.query(`DELETE FROM layout_items WHERE id = $1 AND wedding_id = $2;`, [id, weddingId]);
    return result.rowCount > 0;
};

export {
    findRooms,
    findRoom,
    addRoom,
    saveRoom,
    deleteRoom,
    setItemRoom,
    findLayoutItems,
    findLayoutItem,
    findUnplacedTables,
    findTableForLayout,
    countLayoutItems,
    addLayoutItem,
    updateLayoutItem,
    moveLayoutItem,
    deleteLayoutItem
};
