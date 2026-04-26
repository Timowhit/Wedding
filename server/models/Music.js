/**
 * @file models/Music.js
 * @description Data-access layer for the `music_tracks` table.
 */

"use strict";

const { query } = require("../db");

const VALID_SECTIONS = [
  "Processional",
  "Ceremony",
  "Cocktail Hour",
  "First Dance",
  "Reception",
  "Last Dance",
];

class Music {
  static get SECTIONS() {
    return VALID_SECTIONS;
  }

  /** Return all tracks grouped by section. */
  static async findAllGrouped(weddingId) {
    const { rows } = await query(
      `SELECT * FROM music_tracks
       WHERE wedding_id = $1
       ORDER BY section ASC, sort_order ASC, created_at ASC`,
      [weddingId],
    );

    // Group into { section: [track, …] }
    return rows.reduce((acc, row) => {
      if (!acc[row.section]) {
        acc[row.section] = [];
      }
      acc[row.section].push(row);
      return acc;
    }, {});
  }

  static async findBySection(userId, section) {
    const { rows } = await query(
      `SELECT * FROM music_tracks
       WHERE wedding_id = $1 AND section = $2
       ORDER BY sort_order ASC, created_at ASC`,
      [userId, section],
    );
    return rows;
  }

  static async findById(id, userId) {
    const { rows } = await query(
      "SELECT * FROM music_tracks WHERE id = $1 AND wedding_id = $2",
      [id, userId],
    );
    return rows[0] ?? null;
  }

  /**
   * @param {string} userId
   * @param {{ section, trackId, trackName, artistName?, artworkUrl?, previewUrl? }} data
   */
  static async create(
    userId,
    { section, trackId, trackName, artistName, artworkUrl, previewUrl },
  ) {
    const { rows } = await query(
      `INSERT INTO music_tracks
         (wedding_id, section, track_id, track_name, artist_name, artwork_url, preview_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (wedding_id, section, track_id) DO NOTHING
       RETURNING *`,
      [
        userId,
        section,
        trackId,
        trackName,
        artistName || null,
        artworkUrl || null,
        previewUrl || null,
      ],
    );
    return rows[0] ?? null; // null = duplicate
  }

  static async delete(id, userId) {
    const { rowCount } = await query(
      "DELETE FROM music_tracks WHERE id = $1 AND wedding_id = $2",
      [id, userId],
    );
    return rowCount > 0;
  }

  static async deleteBySection(userId, section) {
    const { rowCount } = await query(
      "DELETE FROM music_tracks WHERE wedding_id = $1 AND section = $2",
      [userId, section],
    );
    return rowCount;
  }
}

module.exports = Music;
