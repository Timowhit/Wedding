/**
 * @file models/Guest.js
 * @description Data-access layer for the `guests` table.
 *
 * FIX: Guest.update previously used COALESCE for every column, which made
 * it impossible to deliberately clear a nullable field (e.g. removing a
 * dietary requirement) — passing null was silently ignored.
 *
 * The fix uses a dynamic SET-clause builder (same pattern as Vendor.js)
 * so only the fields that are explicitly present in `fields` are touched,
 * and a field CAN be set to null if the caller passes null for it.
 */

"use strict";

const { query } = require("../db");

const VALID_RSVP = ["Pending", "Confirmed", "Declined"];

class Guest {
  static async findAll(weddingId, rsvp = null) {
    const params = [weddingId];
    let sql = "SELECT * FROM guests WHERE wedding_id = $1";
    if (rsvp && VALID_RSVP.includes(rsvp)) {
      params.push(rsvp);
      sql += ` AND rsvp = $${params.length}`;
    }
    sql += " ORDER BY name ASC";
    const { rows } = await query(sql, params);
    return rows;
  }

  static async findById(id, userId) {
    const { rows } = await query(
      "SELECT * FROM guests WHERE id = $1 AND wedding_id = $2",
      [id, userId],
    );
    return rows[0] ?? null;
  }

  /**
   * @param {string} userId
   * @param {{ name: string, rsvp?: string, diet?: string, plusOne?: string }} data
   */
  static async create(
    userId,
    { name, rsvp = "Pending", diet = null, plusOne = null },
  ) {
    const { rows } = await query(
      `INSERT INTO guests (wedding_id, name, rsvp, diet, plus_one)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, name, rsvp, diet || null, plusOne || null],
    );
    return rows[0];
  }

  /**
   * Partial update — only keys present in `fields` are changed.
   * Explicitly passing `null` for a nullable column (diet, plusOne)
   * will clear that column, unlike the old COALESCE approach.
   *
   * @param {string} id
   * @param {string} userId
   * @param {{ name?: string, rsvp?: string, diet?: string|null, plusOne?: string|null }} fields
   */
  static async update(id, userId, fields) {
    const setClauses = [];
    const params = [];

    const add = (col, val) => {
      params.push(val);
      setClauses.push(`${col} = $${params.length}`);
    };

    if (fields.name !== undefined) {
      add("name", fields.name);
    }
    if (fields.rsvp !== undefined) {
      add("rsvp", fields.rsvp);
    }
    // Use explicit null so callers can clear these fields
    if (fields.diet !== undefined) {
      add("diet", fields.diet ?? null);
    }
    if (fields.plusOne !== undefined) {
      add("plus_one", fields.plusOne ?? null);
    }

    // Nothing to update — return current row unchanged
    if (!setClauses.length) {
      return Guest.findById(id, userId);
    }

    params.push(id, userId);
    const sql = `
      UPDATE guests
      SET ${setClauses.join(", ")}
      WHERE id = $${params.length - 1} AND wedding_id = $${params.length}
      RETURNING *`;

    const { rows } = await query(sql, params);
    return rows[0] ?? null;
  }

  static async delete(id, userId) {
    const { rowCount } = await query(
      "DELETE FROM guests WHERE id = $1 AND wedding_id = $2",
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
       FROM guests WHERE wedding_id = $1`,
      [userId],
    );
    const r = rows[0];
    return {
      total: Number(r.total),
      confirmed: Number(r.confirmed),
      pending: Number(r.pending),
      declined: Number(r.declined),
    };
  }
}

module.exports = Guest;
