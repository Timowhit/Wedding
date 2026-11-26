import db from './db.js';

/**
 * The saved board, oldest first.
 * @param {string} weddingId
 * @returns {Promise<Array<{id: string, photo_id: string, thumb_url: string, full_url: string, alt_desc: string|null, source_link: string|null}>>}
 */
const findPhotos = async (weddingId) => {
    const result = await db.query(
        `SELECT id, photo_id, thumb_url, full_url, alt_desc, source_link
         FROM inspiration_photos
         WHERE wedding_id = $1
         ORDER BY sort_order ASC, created_at ASC, id ASC;`,
        [weddingId]
    );
    return result.rows;
};

/**
 * @param {string} weddingId
 * @returns {Promise<number>}
 */
const countPhotos = async (weddingId) => {
    const result = await db.query('SELECT COUNT(*) AS total FROM inspiration_photos WHERE wedding_id = $1;', [
        weddingId
    ]);
    return Number(result.rows[0].total);
};

/**
 * Saves a photo. The URLs come from the photo service, never from the form.
 * @param {string} weddingId
 * @param {{photoId: string, thumbUrl: string, fullUrl: string, altDesc: string|null, sourceLink: string|null}} values
 * @returns {Promise<boolean>} False when the board already has this photo.
 */
const addPhoto = async (weddingId, { photoId, thumbUrl, fullUrl, altDesc, sourceLink }) => {
    const result = await db.query(
        `INSERT INTO inspiration_photos (wedding_id, photo_id, thumb_url, full_url, alt_desc, source_link)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (wedding_id, photo_id) DO NOTHING;`,
        [weddingId, photoId, thumbUrl, fullUrl, altDesc, sourceLink]
    );
    return result.rowCount > 0;
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<boolean>}
 */
const deletePhoto = async (id, weddingId) => {
    const result = await db.query('DELETE FROM inspiration_photos WHERE id = $1 AND wedding_id = $2;', [id, weddingId]);
    return result.rowCount > 0;
};

/**
 * @param {string} weddingId
 * @returns {Promise<number>} How many photos were removed.
 */
const deleteAllPhotos = async (weddingId) => {
    const result = await db.query('DELETE FROM inspiration_photos WHERE wedding_id = $1;', [weddingId]);
    return result.rowCount;
};

export { findPhotos, countPhotos, addPhoto, deletePhoto, deleteAllPhotos };
