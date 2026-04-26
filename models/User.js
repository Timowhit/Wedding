/**
 * @file models/User.js
 * @description Data-access layer for the `users` table.
 * Supports both password-based and Google OAuth accounts.
 * Includes per-user language preference.
 */

"use strict";

const bcrypt = require("bcryptjs");
const { query } = require("../db");

const ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;
const SUPPORTED_LANGS = ["en", "es"];

class User {
  /* ── READ ─────────────────────────────────────────────── */

  static async findById(id) {
    const { rows } = await query(
      `SELECT id, email, display_name, avatar_url, wedding_date,
              google_id, language, created_at
       FROM users WHERE id = $1`,
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

  static async findByGoogleId(googleId) {
    const { rows } = await query(
      `SELECT id, email, display_name, avatar_url, google_id, language, created_at
       FROM users WHERE google_id = $1`,
      [googleId],
    );
    return rows[0] ?? null;
  }

  /* ── CREATE ───────────────────────────────────────────── */

  static async create({ email, password, displayName = null }) {
    const passwordHash = await bcrypt.hash(password, ROUNDS);
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name, language, created_at`,
      [email.toLowerCase().trim(), passwordHash, displayName],
    );
    return rows[0];
  }

  static async upsertGoogleUser({ email, googleId, displayName, avatarUrl }) {
    const user = await User.findByGoogleId(googleId);
    if (user) {
      return user;
    }

    if (email) {
      const existing = await User.findByEmail(email);
      if (existing) {
        const { rows } = await query(
          `UPDATE users
           SET google_id    = $2,
               avatar_url   = COALESCE(avatar_url, $3),
               display_name = COALESCE(display_name, $4)
           WHERE id = $1
           RETURNING id, email, display_name, avatar_url, google_id, language`,
          [existing.id, googleId, avatarUrl, displayName],
        );
        return rows[0];
      }
    }

    const { rows } = await query(
      `INSERT INTO users (email, display_name, avatar_url, google_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, display_name, avatar_url, google_id, language`,
      [email?.toLowerCase().trim() ?? null, displayName, avatarUrl, googleId],
    );
    return rows[0];
  }

  /* ── UPDATE ───────────────────────────────────────────── */

  static async update(id, { displayName, weddingDate, language }) {
    // Only set language if it's a supported value
    const safeLang =
      language && SUPPORTED_LANGS.includes(language) ? language : null;

    const { rows } = await query(
      `UPDATE users
       SET display_name = COALESCE($2, display_name),
           wedding_date = COALESCE($3, wedding_date),
           language     = COALESCE($4, language)
       WHERE id = $1
       RETURNING id, email, display_name, avatar_url, wedding_date, language, created_at`,
      [id, displayName ?? null, weddingDate ?? null, safeLang],
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

  /* ── AUTH ─────────────────────────────────────────────── */

  static comparePassword(plain, hash) {
    if (!hash) {
      return Promise.resolve(false);
    }
    return bcrypt.compare(plain, hash);
  }
}

module.exports = User;
