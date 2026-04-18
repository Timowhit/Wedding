/**
 * @file models/Budget.js
 * @description Data-access layer for budget_items and budget_limits.
 */

'use strict';

const { query } = require('../db');

class Budget {
  /* ── LIMIT ────────────────────────────────────────────── */

  static async getLimit(userId) {
    const { rows } = await query(
      'SELECT total FROM budget_limits WHERE user_id = $1',
      [userId],
    );
    return rows[0]?.total ?? 0;
  }

  static async upsertLimit(userId, total) {
    const { rows } = await query(
      `INSERT INTO budget_limits (user_id, total)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET total = $2, updated_at = NOW()
       RETURNING total`,
      [userId, total],
    );
    return rows[0].total;
  }

  /* ── ITEMS ────────────────────────────────────────────── */

  /**
   * @param {string}  userId
   * @param {string}  [category]   Optional filter
   * @returns {Promise<Array>}
   */
  static async findAll(userId, category = null) {
    const params = [userId];
    let sql = `SELECT * FROM budget_items WHERE user_id = $1`;
    if (category) {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }
    sql += ' ORDER BY created_at DESC';
    const { rows } = await query(sql, params);
    return rows;
  }

  static async findById(id, userId) {
    const { rows } = await query(
      'SELECT * FROM budget_items WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    return rows[0] ?? null;
  }

  /**
   * @param {string} userId
   * @param {{ name: string, category: string, amount: number }} data
   */
  static async create(userId, { name, category, amount }) {
    const { rows } = await query(
      `INSERT INTO budget_items (user_id, name, category, amount)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, name, category, amount],
    );
    return rows[0];
  }

  static async delete(id, userId) {
    const { rowCount } = await query(
      'DELETE FROM budget_items WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    return rowCount > 0;
  }

  /** Sum of all expense amounts for a user. */
  static async totalSpent(userId) {
    const { rows } = await query(
      'SELECT COALESCE(SUM(amount), 0) AS total FROM budget_items WHERE user_id = $1',
      [userId],
    );
    return Number(rows[0].total);
  }
}

module.exports = Budget;
