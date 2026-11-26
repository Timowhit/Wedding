import db, { withTransaction } from './db.js';
import { addMember } from './weddings.js';

/**
 * Two kinds of invite share the wedding_invites table:
 * - email invites (invited_email set): single use, only for the account with that email
 * - share links (invited_email NULL): reusable by anyone with the link until they expire
 * Tokens and expiry (7 days) come from column defaults in the migrations.
 */

const INVITE_COLUMNS = `wi.id, wi.wedding_id, wi.invited_email, wi.token, wi.role,
                        wi.expires_at, wi.accepted_at, wi.created_at`;

/**
 * @param {string} weddingId
 * @param {string} invitedBy - The owner's user id.
 * @param {{email: string|null, role: 'editor'|'viewer'}} values - email null creates a share link.
 * @returns {Promise<{id: string, token: string, invited_email: string|null, role: string, expires_at: Date}>}
 */
const createInvite = async (weddingId, invitedBy, { email, role }) => {
    const result = await db.query(
        `INSERT INTO wedding_invites (wedding_id, invited_by, invited_email, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, token, invited_email, role, expires_at;`,
        [weddingId, invitedBy, email, role]
    );
    return result.rows[0];
};

/**
 * An invite with its wedding name and who sent it, or null.
 * @param {string} token
 * @returns {Promise<Object|null>} Includes `is_usable` (not expired and not yet used).
 */
const findInviteByToken = async (token) => {
    const result = await db.query(
        `SELECT ${INVITE_COLUMNS},
                w.name AS wedding_name,
                COALESCE(u.display_name, u.email) AS invited_by_name,
                (wi.accepted_at IS NULL AND wi.expires_at > NOW()) AS is_usable
         FROM wedding_invites wi
         JOIN weddings w ON w.id = wi.wedding_id
         JOIN users u ON u.id = wi.invited_by
         WHERE wi.token = $1;`,
        [token]
    );
    return result.rows[0] ?? null;
};

/**
 * Every invite of a wedding, newest first, with its state (owners only see these: they contain tokens).
 * @param {string} weddingId
 * @returns {Promise<Array<Object>>} Rows include `status`: 'pending' | 'accepted' | 'expired'.
 */
const findInvitesForWedding = async (weddingId) => {
    const result = await db.query(
        `SELECT ${INVITE_COLUMNS},
                CASE WHEN wi.accepted_at IS NOT NULL THEN 'accepted'
                     WHEN wi.expires_at <= NOW() THEN 'expired'
                     ELSE 'pending' END AS status
         FROM wedding_invites wi
         WHERE wi.wedding_id = $1
         ORDER BY wi.created_at DESC;`,
        [weddingId]
    );
    return result.rows;
};

/**
 * Usable email invites addressed to this email (shown on the dashboard).
 * @param {string} email
 * @returns {Promise<Array<Object>>}
 */
const findPendingInvitesForEmail = async (email) => {
    const result = await db.query(
        `SELECT ${INVITE_COLUMNS}, w.name AS wedding_name, COALESCE(u.display_name, u.email) AS invited_by_name
         FROM wedding_invites wi
         JOIN weddings w ON w.id = wi.wedding_id
         JOIN users u ON u.id = wi.invited_by
         WHERE LOWER(wi.invited_email) = LOWER($1)
           AND wi.accepted_at IS NULL
           AND wi.expires_at > NOW()
         ORDER BY wi.created_at DESC;`,
        [email]
    );
    return result.rows;
};

/**
 * Accepts an invite atomically: an email invite is marked used in the same transaction that
 * adds the membership, so two simultaneous accepts cannot both succeed.
 * @param {Object} invite - A row from findInviteByToken.
 * @param {string} userId
 * @returns {Promise<'joined'|'already-member'|'unavailable'>}
 */
const acceptInvite = async (invite, userId) =>
    withTransaction(async (client) => {
        if (invite.invited_email) {
            const used = await client.query(
                `UPDATE wedding_invites SET accepted_at = NOW()
                 WHERE id = $1 AND accepted_at IS NULL AND expires_at > NOW();`,
                [invite.id]
            );
            if (used.rowCount === 0) return 'unavailable';
        }
        const added = await addMember(invite.wedding_id, userId, invite.role, client);
        return added ? 'joined' : 'already-member';
    });

/**
 * Deletes an invite of a wedding (the owner revoking it).
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<boolean>}
 */
const deleteInvite = async (id, weddingId) => {
    const result = await db.query('DELETE FROM wedding_invites WHERE id = $1 AND wedding_id = $2;', [id, weddingId]);
    return result.rowCount > 0;
};

/**
 * Deletes an unused email invite addressed to this email (the invitee declining it).
 * @param {string} token
 * @param {string} email
 * @returns {Promise<boolean>}
 */
const declineInvite = async (token, email) => {
    const result = await db.query(
        `DELETE FROM wedding_invites
         WHERE token = $1 AND LOWER(invited_email) = LOWER($2) AND accepted_at IS NULL;`,
        [token, email]
    );
    return result.rowCount > 0;
};

export {
    createInvite,
    findInviteByToken,
    findInvitesForWedding,
    findPendingInvitesForEmail,
    acceptInvite,
    deleteInvite,
    declineInvite
};
