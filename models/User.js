/**
 * @file models/User.js
 * @description Data-access layer for the `users` table.
 */

"use strict";

const bcrypt = require("bcryptjs");
const { query } = require("../db");

const ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;

class User {
  /* ── READ ─────────────────────────────────────────────── */

  static async findById(id) {
    const { rows } = await query(
      "SELECT id, email, display_name, wedding_date, created_at FROM users WHERE id = $1",
      [id],
    );
    return rows[0] ?? null;
  }

  static async findByEmail(email) {
    const { rows } = await query("SELECT * FROM users WHERE email = $1", [
      email.toLowerCase().trim(),
    ]);
    return rows[0] ?? null;
  }

  /* ── CREATE ───────────────────────────────────────────── */

  /**
   * @param {{ email: string, password: string, displayName?: string }} data
   * @returns {Promise<{ id, email, display_name, created_at }>}
   */
  static async create({ email, password, displayName = null }) {
    const passwordHash = await bcrypt.hash(password, ROUNDS);
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name, created_at`,
      [email.toLowerCase().trim(), passwordHash, displayName],
    );
    return rows[0];
  }

  /* ── UPDATE ───────────────────────────────────────────── */

  /**
   * @param {string} id
   * @param {{ displayName?: string, weddingDate?: string|null }} fields
   */
  static async update(id, { displayName, weddingDate }) {
    const { rows } = await query(
      `UPDATE users
       SET display_name = COALESCE($2, display_name),
           wedding_date = COALESCE($3, wedding_date)
       WHERE id = $1
       RETURNING id, email, display_name, wedding_date, created_at`,
      [id, displayName ?? null, weddingDate ?? null],
    );
    return rows[0] ?? null;
  }

  static async updatePassword(id, newPassword) {
    const hash = await bcrypt.hash(newPassword, ROUNDS);
    await query("UPDATE users SET password_hash = $2 WHERE id = $1", [
      id,
      hash,
    ]);
  }

  /* ── AUTH HELPERS ─────────────────────────────────────── */

  /**
   * Compare a plain-text password against the stored hash.
   * @param {string} plain
   * @param {string} hash
   */
  static comparePassword(plain, hash) {
    return bcrypt.compare(plain, hash);
  }
}

module.exports = User;
