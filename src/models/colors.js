import { MAX_WEDDING_COLORS } from '../constants.js';
import db from './db.js';

/**
 * The wedding's colour swatches, in the order they were added.
 * @param {string} weddingId
 * @returns {Promise<Array<{id: string, hex: string, name: string|null}>>}
 */
const findWeddingColors = async (weddingId) => {
    const result = await db.query(
        `SELECT id, hex, name FROM wedding_colors WHERE wedding_id = $1 ORDER BY sort_order, created_at, id;`,
        [weddingId]
    );
    return result.rows;
};

/**
 * Adds a swatch at the end, unless the wedding already has MAX_WEDDING_COLORS. The count and the
 * insert are one statement; two requests at the very same moment could still both pass, which
 * costs one extra swatch and nothing else.
 * @param {string} weddingId
 * @param {{hex: string, name: string|null}} values - Already validated ("#rrggbb", lowercase).
 * @returns {Promise<{id: string}|null>} Null when the limit is reached.
 */
const addWeddingColor = async (weddingId, { hex, name }) => {
    const result = await db.query(
        `INSERT INTO wedding_colors (wedding_id, hex, name, sort_order)
         SELECT $1, $2, $3, COALESCE(MAX(sort_order), 0) + 1
         FROM wedding_colors WHERE wedding_id = $1
         HAVING COUNT(*) < $4
         RETURNING id;`,
        [weddingId, hex, name, MAX_WEDDING_COLORS]
    );
    return result.rows[0] ?? null;
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<boolean>} False when no such swatch exists in this wedding.
 */
const deleteWeddingColor = async (id, weddingId) => {
    const result = await db.query(`DELETE FROM wedding_colors WHERE id = $1 AND wedding_id = $2;`, [id, weddingId]);
    return result.rowCount > 0;
};

/**
 * Applies colours to the whole app inside this wedding, or stops (null).
 * @param {string} weddingId
 * @param {string|null} colorsKey - A custom colours key (see src/themes.js), already validated.
 * @returns {Promise<void>}
 */
const setWeddingThemeColors = async (weddingId, colorsKey) => {
    await db.query(`UPDATE weddings SET theme_colors = $2 WHERE id = $1;`, [weddingId, colorsKey]);
};

export { findWeddingColors, addWeddingColor, deleteWeddingColor, setWeddingThemeColors };
