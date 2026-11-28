import { MAX_PROPOSALS_PER_VENDOR } from '../constants.js';
import db, { withTransaction } from './db.js';

// The file join is scoped to the same wedding and vendor, so a link never shows someone else's file.
const PROPOSAL_SELECT = `SELECT p.id, p.vendor_id, p.title, p.amount::float AS amount, p.valid_until, p.notes, p.status,
                                p.file_id, f.name AS file_name
                         FROM vendor_proposals p
                         LEFT JOIN wedding_files f
                           ON f.id = p.file_id AND f.wedding_id = p.wedding_id AND f.vendor_id = p.vendor_id`;

/**
 * A vendor's proposals, newest first. Amounts are for comparing only: they are never summed into
 * the budget (money comes from models/payments.js).
 * @param {string} vendorId
 * @param {string} weddingId
 * @returns {Promise<Array<Object>>}
 */
const findProposals = async (vendorId, weddingId) => {
    const result = await db.query(
        `${PROPOSAL_SELECT} WHERE p.vendor_id = $1 AND p.wedding_id = $2 ORDER BY p.created_at DESC, p.id;`,
        [vendorId, weddingId]
    );
    return result.rows;
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<Object|null>}
 */
const findProposal = async (id, weddingId) => {
    const result = await db.query(`${PROPOSAL_SELECT} WHERE p.id = $1 AND p.wedding_id = $2;`, [id, weddingId]);
    return result.rows[0] ?? null;
};

/**
 * How many proposals each vendor of the wedding has, for the vendor list.
 * @param {string} weddingId
 * @returns {Promise<Map<string, number>>} vendor id -> count
 */
const countProposalsByVendor = async (weddingId) => {
    const result = await db.query(
        'SELECT vendor_id, COUNT(*)::int AS count FROM vendor_proposals WHERE wedding_id = $1 GROUP BY vendor_id;',
        [weddingId]
    );
    return new Map(result.rows.map((row) => [row.vendor_id, row.count]));
};

/**
 * Adds a proposal, unless the vendor already has MAX_PROPOSALS_PER_VENDOR. Locking the vendor row
 * first keeps two quick submits from both slipping past the limit.
 * @param {string} vendorId - Belongs to weddingId (checked by the caller).
 * @param {string} weddingId
 * @param {{title: string, amount: number|null, validUntil: string|null, fileId: string|null, notes: string|null}} values
 *        Already validated; fileId is one of this vendor's files.
 * @returns {Promise<{id: string, title: string}|null>} Null when the limit is reached.
 */
const createProposal = (vendorId, weddingId, values) =>
    withTransaction(async (client) => {
        await client.query('SELECT 1 FROM vendors WHERE id = $1 AND wedding_id = $2 FOR UPDATE;', [
            vendorId,
            weddingId
        ]);
        const result = await client.query(
            `INSERT INTO vendor_proposals (wedding_id, vendor_id, title, amount, valid_until, file_id, notes)
             SELECT $1, $2, $3, $4, $5, $6, $7
             WHERE (SELECT COUNT(*) FROM vendor_proposals WHERE wedding_id = $1 AND vendor_id = $2) < $8
             RETURNING id, title;`,
            [
                weddingId,
                vendorId,
                values.title,
                values.amount,
                values.validUntil,
                values.fileId,
                values.notes,
                MAX_PROPOSALS_PER_VENDOR
            ]
        );
        return result.rows[0] ?? null;
    });

/**
 * @param {string} id
 * @param {string} weddingId
 * @param {string} status - One of PROPOSAL_STATUSES.
 * @returns {Promise<{id: string, vendor_id: string, title: string}|null>}
 */
const setProposalStatus = async (id, weddingId, status) => {
    const result = await db.query(
        'UPDATE vendor_proposals SET status = $3 WHERE id = $1 AND wedding_id = $2 RETURNING id, vendor_id, title;',
        [id, weddingId, status]
    );
    return result.rows[0] ?? null;
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<{vendor_id: string}|null>} The deleted proposal's vendor, or null.
 */
const deleteProposal = async (id, weddingId) => {
    const result = await db.query(
        'DELETE FROM vendor_proposals WHERE id = $1 AND wedding_id = $2 RETURNING vendor_id;',
        [id, weddingId]
    );
    return result.rows[0] ?? null;
};

export { findProposals, findProposal, countProposalsByVendor, createProposal, setProposalStatus, deleteProposal };
