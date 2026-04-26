/**
 * @file models/Checklist.js
 * @description Data-access layer for checklist_tasks.
 */

"use strict";

const { query } = require("../db");

class Checklist {
  /**
   * @param {string} weddingId
   * @param {{ category?: string, status?: 'active'|'done' }} [filters]
   */
  static async findAll(weddingId, filters = {}) {
    const params = [weddingId];
    let sql = "SELECT * FROM checklist_tasks WHERE wedding_id = $1";

    if (filters.category) {
      params.push(filters.category);
      sql += ` AND category = $${params.length}`;
    }
    if (filters.status === "active") {
      sql += " AND done = FALSE";
    }
    if (filters.status === "done") {
      sql += " AND done = TRUE";
    }

    sql += " ORDER BY sort_order ASC, created_at ASC";
    const { rows } = await query(sql, params);
    return rows;
  }

  static async findById(id, weddingId) {
    const { rows } = await query(
      "SELECT * FROM checklist_tasks WHERE id = $1 AND wedding_id = $2",
      [id, weddingId],
    );
    return rows[0] ?? null;
  }

  /**
   * @param {string} weddingId
   * @param {{ text: string, category: string, dueDate?: string, sortOrder?: number }} data
   */
  static async create(
    weddingId,
    { text, category, dueDate = null, sortOrder = 0 },
  ) {
    const { rows } = await query(
      `INSERT INTO checklist_tasks (wedding_id, text, category, due_date, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [weddingId, text, category, dueDate, sortOrder],
    );
    return rows[0];
  }

  /**
   * Partial update — only supplied fields are changed.
   * @param {string} id
   * @param {string} userId
   * @param {{ done?: boolean, text?: string, category?: string, dueDate?: string }} fields
   */
  static async update(id, userId, fields) {
    const setClauses = [];
    const params = [];

    const add = (col, val) => {
      params.push(val);
      setClauses.push(`${col} = $${params.length}`);
    };

    if (fields.done !== undefined) {
      add("done", fields.done);
    }
    if (fields.text !== undefined) {
      add("text", fields.text);
    }
    if (fields.category !== undefined) {
      add("category", fields.category);
    }
    if (fields.dueDate !== undefined) {
      add("due_date", fields.dueDate || null);
    }

    if (!setClauses.length) {
      return Checklist.findById(id, userId);
    }

    params.push(id, userId);
    const sql = `
      UPDATE checklist_tasks
      SET ${setClauses.join(", ")}
      WHERE id = $${params.length - 1} AND wedding_id = $${params.length}
      RETURNING *`;

    const { rows } = await query(sql, params);
    return rows[0] ?? null;
  }

  static async delete(id, userId) {
    const { rowCount } = await query(
      "DELETE FROM checklist_tasks WHERE id = $1 AND wedding_id = $2",
      [id, userId],
    );
    return rowCount > 0;
  }

  /** Bulk-insert seed tasks, skipping duplicates by text per wedding. */
  static async bulkCreate(weddingId, tasks) {
    const created = [];
    for (const t of tasks) {
      const { rows } = await query(
        `INSERT INTO checklist_tasks (wedding_id, text, category, due_date)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [weddingId, t.text, t.category, t.dueDate || null],
      );
      if (rows[0]) {
        created.push(rows[0]);
      }
    }
    return created;
  }
}

module.exports = Checklist;
