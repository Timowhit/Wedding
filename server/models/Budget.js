/**
 * @file models/Budget.js
 * @description Data-access layer for budget_items and budget_limits.
 */

"use strict";

const { query } = require("../db");

class Budget {
  /* ── LIMIT ────────────────────────────────────────────── */

  static async getLimit(weddingId) {
    const { rows } = await query(
      "SELECT total FROM budget_limits WHERE wedding_id = $1",
      [weddingId],
    );
    return rows[0]?.total ?? 0;
  }

  static async upsertLimit(weddingId, total) {
    const { rows } = await query(
      `INSERT INTO budget_limits (wedding_id, total)
       VALUES ($1, $2)
       ON CONFLICT (wedding_id) DO UPDATE SET total = $2, updated_at = NOW()
       RETURNING total`,
      [weddingId, total],
    );
    return rows[0].total;
  }

  /* ── ITEMS ────────────────────────────────────────────── */

  /**
   * @param {string}  weddingId
   * @param {string}  [category]   Optional filter
   * @returns {Promise<Array>}
   */
  static async findAll(weddingId, category = null) {
    const params = [weddingId];
    let sql = `SELECT * FROM budget_items WHERE wedding_id = $1`;
    if (category) {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }
    sql += " ORDER BY created_at DESC";
    const { rows } = await query(sql, params);
    return rows;
  }

  static async findById(id, weddingId) {
    const { rows } = await query(
      "SELECT * FROM budget_items WHERE id = $1 AND wedding_id = $2",
      [id, weddingId],
    );
    return rows[0] ?? null;
  }

  /**
   * @param {string} weddingId
   * @param {{ name: string, category: string, amount: number }} data
   */
  static async create(weddingId, { name, category, amount }) {
    const { rows } = await query(
      `INSERT INTO budget_items (wedding_id, name, category, amount)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [weddingId, name, category, amount],
    );
    return rows[0];
  }

  static async delete(id, weddingId) {
    const { rowCount } = await query(
      "DELETE FROM budget_items WHERE id = $1 AND wedding_id = $2",
      [id, weddingId],
    );
    return rowCount > 0;
  }

  /** Sum of all expense amounts for a wedding. */
  static async totalSpent(weddingId) {
    const { rows } = await query(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM budget_items WHERE wedding_id = $1",
      [weddingId],
    );
    return Number(rows[0].total);
  }
}

module.exports = Budget;
