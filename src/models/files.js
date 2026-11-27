import { MAX_USER_FILE_BYTES, MAX_WEDDING_FILE_BYTES } from '../constants.js';
import db, { withTransaction } from './db.js';

// Never `data`: lists and checks only need the facts about a file.
const FILE_COLUMNS = `f.id, f.kind, f.name, f.content_type, f.size, f.note, f.vendor_id, f.created_at,
                      v.name AS vendor_name, COALESCE(u.display_name, u.email) AS uploaded_by_name`;
const FILE_FROM = `FROM wedding_files f
                   LEFT JOIN vendors v ON v.id = f.vendor_id AND v.wedding_id = f.wedding_id
                   LEFT JOIN users u ON u.id = f.uploaded_by`;

/**
 * One page of the wedding's files, newest first, optionally one kind or one vendor's.
 * @param {string} weddingId
 * @param {{kind?: string|null, vendorId?: string|null, limit?: number|null, offset?: number}} [filters] - Already validated; no limit = all.
 * @returns {Promise<Array<Object>>}
 */
const findFiles = async (weddingId, { kind = null, vendorId = null, limit = null, offset = 0 } = {}) => {
    const result = await db.query(
        `SELECT ${FILE_COLUMNS} ${FILE_FROM}
         WHERE f.wedding_id = $1 AND ($2::text IS NULL OR f.kind = $2) AND ($3::uuid IS NULL OR f.vendor_id = $3)
         ORDER BY f.created_at DESC, f.id
         LIMIT $4 OFFSET $5;`,
        [weddingId, kind, vendorId, limit, offset]
    );
    return result.rows;
};

/**
 * How many files match (for paging).
 * @param {string} weddingId
 * @param {{kind?: string|null}} [filters]
 * @returns {Promise<number>}
 */
const countFiles = async (weddingId, { kind = null } = {}) => {
    const result = await db.query(
        `SELECT COUNT(*)::int AS n FROM wedding_files WHERE wedding_id = $1 AND ($2::text IS NULL OR kind = $2);`,
        [weddingId, kind]
    );
    return result.rows[0].n;
};

/**
 * A file's details for download, without its contents (read in chunks with readFileChunk).
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<{id: string, name: string, content_type: string, size: number}|null>}
 */
const findFileForDownload = async (id, weddingId) => {
    const result = await db.query(
        `SELECT id, name, content_type, size FROM wedding_files WHERE id = $1 AND wedding_id = $2;`,
        [id, weddingId]
    );
    return result.rows[0] ?? null;
};

/**
 * Part of a file's contents, so a download never holds the whole file (and PostgreSQL's hex
 * text form of it) in memory at once.
 * @param {string} id
 * @param {string} weddingId
 * @param {number} offset - Zero-based byte offset.
 * @param {number} length
 * @returns {Promise<Buffer|null>}
 */
const readFileChunk = async (id, weddingId, offset, length) => {
    const result = await db.query(
        `SELECT substring(data FROM $3::int FOR $4::int) AS chunk FROM wedding_files WHERE id = $1 AND wedding_id = $2;`,
        [id, weddingId, offset + 1, length]
    );
    return result.rows[0]?.chunk ?? null;
};

/**
 * Bytes the wedding's files take up.
 * @param {string} weddingId
 * @returns {Promise<number>}
 */
const findStorageUsed = async (weddingId) => {
    const result = await db.query(
        `SELECT COALESCE(SUM(size), 0)::bigint AS used FROM wedding_files WHERE wedding_id = $1;`,
        [weddingId]
    );
    return Number(result.rows[0].used);
};

/**
 * Stores a file, unless it would take the wedding past MAX_WEDDING_FILE_BYTES or the uploader past
 * MAX_USER_FILE_BYTES across all their weddings. Locks the wedding and the uploader first, so two
 * uploads at the same moment can't both squeeze past a limit. The vendor must belong to the wedding.
 * @param {string} weddingId
 * @param {{kind: string, name: string, contentType: string, note: string|null, vendorId: string|null, uploadedBy: string, data: Buffer}} file - Already validated.
 * @returns {Promise<{id: string}|{full: 'wedding'|'user'}>}
 */
const addFile = async (weddingId, { kind, name, contentType, note, vendorId, uploadedBy, data }) =>
    withTransaction(async (client) => {
        // Transaction-scoped locks, released at COMMIT; ordered the same way everywhere.
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('files:wedding:' || $1));`, [weddingId]);
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('files:user:' || $1));`, [uploadedBy]);
        const usage = await client.query(
            `SELECT (SELECT COALESCE(SUM(size), 0) FROM wedding_files WHERE wedding_id = $1)::bigint AS wedding,
                    (SELECT COALESCE(SUM(size), 0) FROM wedding_files WHERE uploaded_by = $2)::bigint AS user_total;`,
            [weddingId, uploadedBy]
        );
        if (Number(usage.rows[0].wedding) + data.length > MAX_WEDDING_FILE_BYTES) return { full: 'wedding' };
        if (Number(usage.rows[0].user_total) + data.length > MAX_USER_FILE_BYTES) return { full: 'user' };
        const result = await client.query(
            `INSERT INTO wedding_files (wedding_id, kind, name, content_type, size, note, vendor_id, uploaded_by, data)
             VALUES ($1, $2, $3, $4, $5, $6, (SELECT id FROM vendors WHERE id = $7::uuid AND wedding_id = $1), $8, $9)
             RETURNING id;`,
            [weddingId, kind, name, contentType, data.length, note, vendorId, uploadedBy, data]
        );
        return result.rows[0];
    });

/**
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<boolean>} False when no such file exists in this wedding.
 */
const deleteFile = async (id, weddingId) => {
    const result = await db.query(`DELETE FROM wedding_files WHERE id = $1 AND wedding_id = $2;`, [id, weddingId]);
    return result.rowCount > 0;
};

export { findFiles, countFiles, findFileForDownload, readFileChunk, findStorageUsed, addFile, deleteFile };
