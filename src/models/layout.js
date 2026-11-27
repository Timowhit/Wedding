import { DEFAULT_ROOM, MAX_LAYOUT_ITEMS } from '../constants.js';
import db from './db.js';

// NUMERIC comes back from pg as a string; the plan works in numbers.
const toRoom = (row) => ({ width: Number(row.width), depth: Number(row.depth), unit: row.unit });
const toItem = (row) => ({
    ...row,
    x: Number(row.x),
    y: Number(row.y),
    width: Number(row.width),
    depth: Number(row.depth),
    seats: row.seats ?? null,
    seated: row.seated === null || row.seated === undefined ? null : Number(row.seated)
});

/**
 * The wedding's room, or the default 60 × 40 ft room when none has been saved yet.
 * @param {string} weddingId
 * @returns {Promise<{width: number, depth: number, unit: string, saved: boolean}>}
 */
const findRoom = async (weddingId) => {
    const result = await db.query(`SELECT width, depth, unit FROM venue_layouts WHERE wedding_id = $1;`, [weddingId]);
    return result.rows[0] ? { ...toRoom(result.rows[0]), saved: true } : { ...DEFAULT_ROOM, saved: false };
};

/**
 * @param {string} weddingId
 * @param {{width: number, depth: number, unit: string}} room - Already validated.
 * @returns {Promise<void>}
 */
const saveRoom = async (weddingId, { width, depth, unit }) => {
    await db.query(
        `INSERT INTO venue_layouts (wedding_id, width, depth, unit) VALUES ($1, $2, $3, $4)
         ON CONFLICT (wedding_id) DO UPDATE SET width = $2, depth = $3, unit = $4, updated_at = NOW();`,
        [weddingId, width, depth, unit]
    );
};

// A placed table brings its name, seats and how many guests sit there; both joins are scoped to the wedding.
const ITEM_SELECT = `SELECT i.id, i.kind, i.label, i.table_id, i.shape, i.x, i.y, i.width, i.depth, i.rotation,
                            t.name AS table_name, t.seats,
                            (SELECT COUNT(*) FROM guests g WHERE g.table_id = t.id AND g.wedding_id = i.wedding_id) AS seated
                     FROM layout_items i
                     LEFT JOIN seating_tables t ON t.id = i.table_id AND t.wedding_id = i.wedding_id`;

/**
 * Every piece on the plan, oldest first (so newer pieces are drawn on top).
 * @param {string} weddingId
 * @returns {Promise<Array<Object>>}
 */
const findLayoutItems = async (weddingId) => {
    const result = await db.query(`${ITEM_SELECT} WHERE i.wedding_id = $1 ORDER BY i.created_at, i.id;`, [weddingId]);
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

const PIECE_COLUMNS = 'kind, label, table_id, shape, x, y, width, depth, rotation';

/**
 * Adds a piece, unless the plan already has MAX_LAYOUT_ITEMS. A table piece is only added when the
 * table belongs to this wedding and is not on the plan yet.
 * @param {string} weddingId
 * @param {{kind: string, label: string|null, tableId: string|null, shape: string, x: number, y: number, width: number, depth: number, rotation: number}} piece - Already validated.
 * @returns {Promise<{id: string}|null>} Null when nothing was added.
 */
const addLayoutItem = async (weddingId, piece) => {
    const result = await db.query(
        `INSERT INTO layout_items (wedding_id, ${PIECE_COLUMNS})
         SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
         WHERE (SELECT COUNT(*) FROM layout_items WHERE wedding_id = $1) < $11
           AND ($4::uuid IS NULL OR EXISTS (SELECT 1 FROM seating_tables WHERE id = $4 AND wedding_id = $1))
         ON CONFLICT (table_id) DO NOTHING
         RETURNING id;`,
        [
            weddingId,
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
 * @returns {Promise<boolean>}
 */
const updateLayoutItem = async (id, weddingId, piece) => {
    const result = await db.query(
        `UPDATE layout_items SET label = $3, shape = $4, x = $5, y = $6, width = $7, depth = $8, rotation = $9
         WHERE id = $1 AND wedding_id = $2;`,
        [id, weddingId, piece.label, piece.shape, piece.x, piece.y, piece.width, piece.depth, piece.rotation]
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
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<boolean>}
 */
const deleteLayoutItem = async (id, weddingId) => {
    const result = await db.query(`DELETE FROM layout_items WHERE id = $1 AND wedding_id = $2;`, [id, weddingId]);
    return result.rowCount > 0;
};

export {
    findRoom,
    saveRoom,
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
