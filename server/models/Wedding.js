/**
 * @file models/Wedding.js
 * @description Data-access layer for weddings and wedding_members.
 */

"use strict";

const { query, withTransaction } = require("../db");

class Wedding {
  /* ── Read ─────────────────────────────────────────────── */

  /** All weddings a user belongs to (owner or member). */
  static async findAllByUser(userId) {
    const { rows } = await query(
      `SELECT w.*, wm.role
       FROM   weddings w
       JOIN   wedding_members wm ON wm.wedding_id = w.id
       WHERE  wm.user_id = $1
       ORDER BY
         CASE WHEN wm.role = 'owner' THEN 0 ELSE 1 END,
         wm.joined_at ASC`,
      [userId],
    );
    return rows;
  }

  /** The user's primary wedding (owner first, then oldest join). */
  static async findPrimaryByUser(userId) {
    const { rows } = await query(
      `SELECT w.*, wm.role
       FROM   weddings w
       JOIN   wedding_members wm ON wm.wedding_id = w.id
       WHERE  wm.user_id = $1
       ORDER BY
         CASE WHEN wm.role = 'owner' THEN 0 ELSE 1 END,
         wm.joined_at ASC
       LIMIT 1`,
      [userId],
    );
    return rows[0] ?? null;
  }

  /** Find a wedding by its ID. */
  static async findById(id) {
    const { rows } = await query("SELECT * FROM weddings WHERE id = $1", [id]);
    return rows[0] ?? null;
  }

  /** All members of a wedding with their user details. */
  static async getMembers(weddingId) {
    const { rows } = await query(
      `SELECT u.id, u.email, u.display_name, u.avatar_url,
              wm.role, wm.joined_at
       FROM   wedding_members wm
       JOIN   users u ON u.id = wm.user_id
       WHERE  wm.wedding_id = $1
       ORDER BY wm.joined_at ASC`,
      [weddingId],
    );
    return rows;
  }

  /** Get a specific user's membership record for a wedding. */
  static async getMembership(weddingId, userId) {
    const { rows } = await query(
      `SELECT * FROM wedding_members
       WHERE  wedding_id = $1 AND user_id = $2`,
      [weddingId, userId],
    );
    return rows[0] ?? null;
  }

  /* ── Create ───────────────────────────────────────────── */

  /**
   * Create a new wedding and add the creator as owner.
   * @param {string} userId
   * @param {{ name?: string, weddingDate?: string }} data
   */
  static async create(userId, { name, weddingDate } = {}) {
    return withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO weddings (name, wedding_date, created_by)
         VALUES ($1, $2, $3) RETURNING *`,
        [name || "Our Wedding", weddingDate || null, userId],
      );
      const wedding = rows[0];

      await client.query(
        `INSERT INTO wedding_members (wedding_id, user_id, role)
         VALUES ($1, $2, 'owner')`,
        [wedding.id, userId],
      );

      return { ...wedding, role: "owner" };
    });
  }

  /* ── Update ───────────────────────────────────────────── */

  static async update(id, { name, weddingDate }) {
    const { rows } = await query(
      `UPDATE weddings
       SET name         = COALESCE($2, name),
           wedding_date = COALESCE($3, wedding_date)
       WHERE id = $1 RETURNING *`,
      [id, name ?? null, weddingDate ?? null],
    );
    return rows[0] ?? null;
  }

  /* ── Members ──────────────────────────────────────────── */

  /** Add (or update the role of) a member. */
  static async addMember(weddingId, userId, role = "editor") {
    const { rows } = await query(
      `INSERT INTO wedding_members (wedding_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (wedding_id, user_id) DO UPDATE SET role = $3
       RETURNING *`,
      [weddingId, userId, role],
    );
    return rows[0];
  }

  static async removeMember(weddingId, userId) {
    const { rowCount } = await query(
      `DELETE FROM wedding_members
       WHERE wedding_id = $1 AND user_id = $2`,
      [weddingId, userId],
    );
    return rowCount > 0;
  }

  static async updateMemberRole(weddingId, userId, role) {
    const { rows } = await query(
      `UPDATE wedding_members SET role = $3
       WHERE  wedding_id = $1 AND user_id = $2
       RETURNING *`,
      [weddingId, userId, role],
    );
    return rows[0] ?? null;
  }
}

module.exports = Wedding;
