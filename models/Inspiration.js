/**
 * @file models/Inspiration.js
 * @description Data-access layer for the `inspiration_photos` table.
 */

'use strict';

const { query } = require('../db');

class Inspiration {
  static async findAll(userId) {
    const { rows } = await query(
      `SELECT * FROM inspiration_photos
       WHERE user_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [userId],
    );
    return rows;
  }

  static async findById(id, userId) {
    const { rows } = await query(
      'SELECT * FROM inspiration_photos WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    return rows[0] ?? null;
  }

  /**
   * @param {string} userId
   * @param {{ photoId, thumbUrl, fullUrl, altDesc?, sourceLink? }} data
   */
  static async create(userId, { photoId, thumbUrl, fullUrl, altDesc, sourceLink }) {
    const { rows } = await query(
      `INSERT INTO inspiration_photos
         (user_id, photo_id, thumb_url, full_url, alt_desc, source_link)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, photo_id) DO NOTHING
       RETURNING *`,
      [userId, photoId, thumbUrl, fullUrl,
       altDesc     || null,
       sourceLink  || null],
    );
    return rows[0] ?? null; // null = already saved
  }

  static async delete(id, userId) {
    const { rowCount } = await query(
      'DELETE FROM inspiration_photos WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    return rowCount > 0;
  }

  static async deleteAll(userId) {
    const { rowCount } = await query(
      'DELETE FROM inspiration_photos WHERE user_id = $1',
      [userId],
    );
    return rowCount;
  }
}

module.exports = Inspiration;
