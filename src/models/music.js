import db from './db.js';

/**
 * Every saved track, in playlist order. Group them by `section` in the controller.
 * @param {string} weddingId
 * @returns {Promise<Array<{id: string, section: string, track_id: string, track_name: string, artist_name: string|null, artwork_url: string|null}>>}
 */
const findTracks = async (weddingId) => {
    const result = await db.query(
        `SELECT id, section, track_id, track_name, artist_name, artwork_url
         FROM music_tracks
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
const countTracks = async (weddingId) => {
    const result = await db.query('SELECT COUNT(*) AS total FROM music_tracks WHERE wedding_id = $1;', [weddingId]);
    return Number(result.rows[0].total);
};

/**
 * Adds a track to a section. The details come from the music service, never from the form.
 * @param {string} weddingId
 * @param {{section: string, trackId: string, trackName: string, artistName: string|null, artworkUrl: string|null}} values
 * @returns {Promise<boolean>} False when the section already has this track.
 */
const addTrack = async (weddingId, { section, trackId, trackName, artistName, artworkUrl }) => {
    const result = await db.query(
        `INSERT INTO music_tracks (wedding_id, section, track_id, track_name, artist_name, artwork_url)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (wedding_id, section, track_id) DO NOTHING;`,
        [weddingId, section, trackId, trackName, artistName, artworkUrl]
    );
    return result.rowCount > 0;
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<boolean>}
 */
const deleteTrack = async (id, weddingId) => {
    const result = await db.query('DELETE FROM music_tracks WHERE id = $1 AND wedding_id = $2;', [id, weddingId]);
    return result.rowCount > 0;
};

/**
 * Removes every track in one section.
 * @param {string} weddingId
 * @param {string} section - Already validated against MUSIC_SECTIONS.
 * @returns {Promise<number>} How many tracks were removed.
 */
const deleteSection = async (weddingId, section) => {
    const result = await db.query('DELETE FROM music_tracks WHERE wedding_id = $1 AND section = $2;', [
        weddingId,
        section
    ]);
    return result.rowCount;
};

export { findTracks, countTracks, addTrack, deleteTrack, deleteSection };
