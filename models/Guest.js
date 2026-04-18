/**
 * @file models/Guest.js
 * @description Data-access layer for the `guests` table.
 */

'use strict';

const { query } = require('../db');

const VALID_RSVP = ['Pending', 'Confirmed', 'Declined'];

class Guest {
  static async findAll(userId, rsvp = null) {
    const params = [userId];
    let sql = 'SELECT * FROM guests WHERE user_id = $1';
    if (rsvp && VALID_RSVP.includes(rsvp)) {
      params.push(rsvp);
      sql += ` AND rsvp = $${params.length}`;
    }
    sql += ' ORDER BY name ASC';
    const { rows } = await query(sql, params);
    return rows;
  }

  static async findById(id, userId) {
    const { rows } = await query(
      'SELECT * FROM guests WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    return rows[0] ?? null;
  }

  /**
   * @param {string} userId
   * @param {{ name: string, rsvp?: string, diet?: string, plusOne?: string }} data
   */
  static async create(userId, { name, rsvp = 'Pending', diet = null, plusOne = null }) {
    const { rows } = await query(
      `INSERT INTO guests (user_id, name, rsvp, diet, plus_one)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, name, rsvp, diet || null, plusOne || null],
    );
    return rows[0];
  }

  static async update(id, userId, { name, rsvp, diet, plusOne }) {
    const { rows } = await query(
      `UPDATE guests
       SET name     = COALESCE($3, name),
           rsvp     = COALESCE($4, rsvp),
           diet     = COALESCE($5, diet),
           plus_one = COALESCE($6, plus_one)
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId, name ?? null, rsvp ?? null, diet ?? null, plusOne ?? null],
    );
    return rows[0] ?? null;
  }

  static async delete(id, userId) {
    const { rowCount } = await query(
      'DELETE FROM guests WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    return rowCount > 0;
  }

  /** RSVP summary counts for a user. */
  static async stats(userId) {
    const { rows } = await query(
      `SELECT
         COUNT(*)                                    AS total,
         COUNT(*) FILTER (WHERE rsvp = 'Confirmed') AS confirmed,
         COUNT(*) FILTER (WHERE rsvp = 'Pending')   AS pending,
         COUNT(*) FILTER (WHERE rsvp = 'Declined')  AS declined
       FROM guests WHERE user_id = $1`,
      [userId],
    );
    const r = rows[0];
    return {
      total:     Number(r.total),
      confirmed: Number(r.confirmed),
      pending:   Number(r.pending),
      declined:  Number(r.declined),
    };
  }
}

module.exports = Guest;
