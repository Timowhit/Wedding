/**
 * @file models/Invite.js
 * @description Data-access layer for wedding_invites.
 */

"use strict";

const { query } = require("../db");
const { v4: uuidv4 } = require("uuid");

class Invite {
  /**
   * Create an invite token for an email address.
   * @param {string} weddingId
   * @param {string} invitedBy  userId of the sender
   * @param {{ invitedEmail: string, role?: string }} data
   */
  static async create(weddingId, invitedBy, { invitedEmail, role = "editor" }) {
    const token = uuidv4();
    const { rows } = await query(
      `INSERT INTO wedding_invites
         (wedding_id, invited_by, invited_email, token, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [weddingId, invitedBy, invitedEmail.toLowerCase().trim(), token, role],
    );
    return rows[0];
  }

  /**
   * Look up an invite by its token, including wedding and sender info.
   * @param {string} token
   */
  static async findByToken(token) {
    const { rows } = await query(
      `SELECT wi.*,
              w.name          AS wedding_name,
              u.display_name  AS invited_by_name,
              u.email         AS invited_by_email
       FROM   wedding_invites wi
       JOIN   weddings         w  ON w.id  = wi.wedding_id
       JOIN   users            u  ON u.id  = wi.invited_by
       WHERE  wi.token = $1`,
      [token],
    );
    return rows[0] ?? null;
  }

  /** All pending + used invites for a wedding. */
  static async findByWedding(weddingId) {
    const { rows } = await query(
      `SELECT wi.*, u.display_name AS invited_by_name
       FROM   wedding_invites wi
       JOIN   users u ON u.id = wi.invited_by
       WHERE  wi.wedding_id = $1
       ORDER BY wi.created_at DESC`,
      [weddingId],
    );
    return rows;
  }

  /** Mark an invite as accepted. Returns the accepted row, or null if already used/expired. */
  static async accept(token) {
    const { rows } = await query(
      `UPDATE wedding_invites
       SET accepted_at = NOW()
       WHERE token       = $1
         AND accepted_at IS NULL
         AND expires_at  > NOW()
       RETURNING *`,
      [token],
    );
    return rows[0] ?? null;
  }

  static async delete(id, weddingId) {
    const { rowCount } = await query(
      "DELETE FROM wedding_invites WHERE id = $1 AND wedding_id = $2",
      [id, weddingId],
    );
    return rowCount > 0;
  }

  /** Create a shareable link invite with no specific email target. */
  static async createShareLink(weddingId, invitedBy, { role = "editor" } = {}) {
    const token = uuidv4();
    const { rows } = await query(
      `INSERT INTO wedding_invites
        (wedding_id, invited_by, invited_email, token, role)
      VALUES ($1, $2, NULL, $3, $4)
      RETURNING *`,
      [weddingId, invitedBy, token, role],
    );
    return rows[0];
  }

  /** Pending (unexpired, unaccepted) invites addressed to this email. */
  static async findPendingForEmail(email) {
    const { rows } = await query(
      `SELECT wi.*, w.name AS wedding_name, u.display_name AS invited_by_name
      FROM   wedding_invites wi
      JOIN   weddings w ON w.id = wi.wedding_id
      JOIN   users    u ON u.id = wi.invited_by
      WHERE  LOWER(wi.invited_email) = LOWER($1)
        AND  wi.accepted_at IS NULL
        AND  wi.expires_at  > NOW()
      ORDER BY wi.created_at DESC`,
      [email],
    );
    return rows;
  }

  /** True if the invite cannot be used. */
  static isExpired(invite) {
    return (
      new Date(invite.expires_at) < new Date() || invite.accepted_at !== null
    );
  }
}

module.exports = Invite;
