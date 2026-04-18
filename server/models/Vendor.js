/**
 * @file models/Vendor.js
 * @description Data-access layer for the `vendors` table.
 */

'use strict';

const { query } = require('../db');

class Vendor {
  static async findAll(userId, status = null) {
    const params = [userId];
    let sql = 'SELECT * FROM vendors WHERE user_id = $1';
    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }
    sql += ' ORDER BY name ASC';
    const { rows } = await query(sql, params);
    return rows;
  }

  static async findById(id, userId) {
    const { rows } = await query(
      'SELECT * FROM vendors WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    return rows[0] ?? null;
  }

  /**
   * @param {string} userId
   * @param {{ name, category, phone?, email?, website?, status?, notes? }} data
   */
  static async create(userId, { name, category, phone, email, website, status, notes }) {
    const { rows } = await query(
      `INSERT INTO vendors (user_id, name, category, phone, email, website, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [userId, name, category,
       phone   || null,
       email   || null,
       website || null,
       status  || 'Researching',
       notes   || null],
    );
    return rows[0];
  }

  static async update(id, userId, fields) {
    const setClauses = [];
    const params     = [];

    const add = (col, val) => {
      params.push(val);
      setClauses.push(`${col} = $${params.length}`);
    };

    if (fields.name     !== undefined) add('name',     fields.name);
    if (fields.category !== undefined) add('category', fields.category);
    if (fields.phone    !== undefined) add('phone',    fields.phone    || null);
    if (fields.email    !== undefined) add('email',    fields.email    || null);
    if (fields.website  !== undefined) add('website',  fields.website  || null);
    if (fields.status   !== undefined) add('status',   fields.status);
    if (fields.notes    !== undefined) add('notes',    fields.notes    || null);

    if (!setClauses.length) return Vendor.findById(id, userId);

    params.push(id, userId);
    const sql = `
      UPDATE vendors
      SET ${setClauses.join(', ')}
      WHERE id = $${params.length - 1} AND user_id = $${params.length}
      RETURNING *`;

    const { rows } = await query(sql, params);
    return rows[0] ?? null;
  }

  static async delete(id, userId) {
    const { rowCount } = await query(
      'DELETE FROM vendors WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    return rowCount > 0;
  }
}

module.exports = Vendor;
