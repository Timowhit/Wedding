import { MAX_WEDDING_FILE_BYTES } from '../constants.js';
import db from './db.js';

// Never `data`: lists and checks only need the facts about a file.
const FILE_COLUMNS = `f.id, f.kind, f.name, f.content_type, f.size, f.note, f.vendor_id, f.created_at,
                      v.name AS vendor_name, COALESCE(u.display_name, u.email) AS uploaded_by_name`;
const FILE_FROM = `FROM wedding_files f
                   LEFT JOIN vendors v ON v.id = f.vendor_id AND v.wedding_id = f.wedding_id
                   LEFT JOIN users u ON u.id = f.uploaded_by`;

/**
 * The wedding's files, newest first, optionally one kind or one vendor's.
 * @param {string} weddingId
 * @param {{kind?: string|null, vendorId?: string|null}} [filters] - Already validated.
 * @returns {Promise<Array<Object>>}
 */
const findFiles = async (weddingId, { kind = null, vendorId = null } = {}) => {
    const result = await db.query(
        `SELECT ${FILE_COLUMNS} ${FILE_FROM}
         WHERE f.wedding_id = $1 AND ($2::text IS NULL OR f.kind = $2) AND ($3::uuid IS NULL OR f.vendor_id = $3)
         ORDER BY f.created_at DESC, f.id;`,
        [weddingId, kind, vendorId]
    );
    return result.rows;
};

/**
 * One file with its contents, for download.
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<{id: string, name: string, content_type: string, size: number, data: Buffer}|null>}
 */
const findFileForDownload = async (id, weddingId) => {
    const result = await db.query(
        `SELECT id, name, content_type, size, data FROM wedding_files WHERE id = $1 AND wedding_id = $2;`,
        [id, weddingId]
    );
    return result.rows[0] ?? null;
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
 * Stores a file, unless it would take the wedding past MAX_WEDDING_FILE_BYTES. The check and the
 * insert are one statement; the vendor must belong to the same wedding.
 * @param {string} weddingId
 * @param {{kind: string, name: string, contentType: string, note: string|null, vendorId: string|null, uploadedBy: string, data: Buffer}} file - Already validated.
 * @returns {Promise<{id: string}|null>} Null when the wedding has no room left.
 */
const addFile = async (weddingId, { kind, name, contentType, note, vendorId, uploadedBy, data }) => {
    const result = await db.query(
        `INSERT INTO wedding_files (wedding_id, kind, name, content_type, size, note, vendor_id, uploaded_by, data)
         SELECT $1, $2, $3, $4, $5::int, $6,
                (SELECT id FROM vendors WHERE id = $7::uuid AND wedding_id = $1), $8, $9
         WHERE (SELECT COALESCE(SUM(size), 0) FROM wedding_files WHERE wedding_id = $1) + $5::int <= $10::bigint
         RETURNING id;`,
        [weddingId, kind, name, contentType, data.length, note, vendorId, uploadedBy, data, MAX_WEDDING_FILE_BYTES]
    );
    return result.rows[0] ?? null;
};

/**
 * @param {string} id
 * @param {string} weddingId
 * @returns {Promise<boolean>} False when no such file exists in this wedding.
 */
const deleteFile = async (id, weddingId) => {
    const result = await db.query(`DELETE FROM wedding_files WHERE id = $1 AND wedding_id = $2;`, [id, weddingId]);
    return result.rowCount > 0;
};

export { findFiles, findFileForDownload, findStorageUsed, addFile, deleteFile };
