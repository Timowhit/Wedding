import {
    BYTES_PER_MB,
    FILE_KINDS,
    FILE_NOTE_MAX,
    FILES_PER_PAGE,
    MAX_FILE_MB,
    MAX_USER_FILES_GB,
    MAX_WEDDING_FILES_MB
} from '../constants.js';
import {
    addFile,
    countFiles,
    deleteFile,
    findFileForDownload,
    findFiles,
    findStorageUsed,
    readFileChunk
} from '../models/files.js';
import { findVendor, findVendors } from '../models/vendors.js';
import { renderVendorPage } from './payments.js';
import { contentDisposition } from '../utils/file-types.js';
import { setFlash } from '../utils/flash.js';
import { backTo } from '../utils/redirect.js';
import { isUuid, readChoice, readText } from '../validators/common.js';
import { validateFileUpload } from '../validators/files.js';

const INLINE_TYPES = Object.freeze(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']);
// Downloads are read from the database this much at a time.
const DOWNLOAD_CHUNK_BYTES = BYTES_PER_MB;
const PAGE_PARAM = /^[1-9]\d{0,4}$/;
const EMPTY_UPLOAD = Object.freeze({ kind: 'contract', note: '', vendor_id: '' });

const renderFiles = async (req, res, { status = 200, uploadForm } = {}) => {
    const kind = readChoice(req.query.kind, FILE_KINDS);
    const page = PAGE_PARAM.test(String(req.query.page ?? '')) ? Number(req.query.page) : 1;
    const [files, total, used, vendors] = await Promise.all([
        findFiles(req.wedding.id, { kind, limit: FILES_PER_PAGE, offset: (page - 1) * FILES_PER_PAGE }),
        countFiles(req.wedding.id, { kind }),
        findStorageUsed(req.wedding.id),
        findVendors(req.wedding.id)
    ]);
    res.status(status).render('files', {
        title: req.t('files.title'),
        files,
        kinds: FILE_KINDS,
        activeKind: kind,
        vendors,
        page,
        pages: Math.max(1, Math.ceil(total / FILES_PER_PAGE)),
        usedMb: Math.round((used / BYTES_PER_MB) * 10) / 10,
        noteMax: FILE_NOTE_MAX,
        maxMb: MAX_WEDDING_FILES_MB,
        fileMaxMb: MAX_FILE_MB,
        uploadForm: uploadForm ?? { values: EMPTY_UPLOAD, errors: [] }
    });
};

/** GET /files: the wedding's files, optionally one kind. */
const showFiles = (req, res) => renderFiles(req, res);

/** The vendor whose page the upload form was on, if any (it posts return_to /vendors/:id). */
const uploadVendor = async (req, vendorId) => {
    const target = readText(req.body?.return_to);
    return vendorId && target === `/vendors/${vendorId}` && isUuid(vendorId)
        ? findVendor(vendorId, req.wedding.id)
        : null;
};

/** A failed upload shows its errors on the page it came from: a vendor's page or /files. */
const renderUploadErrors = async (req, res, uploadForm) => {
    const vendor = await uploadVendor(req, uploadForm.values.vendor_id);
    if (vendor) return renderVendorPage(req, res, vendor, { status: 400, uploadForm });
    return renderFiles(req, res, { status: 400, uploadForm });
};

/** Where to go after an upload: the vendor page it came from, or the files page. */
const afterUpload = (req, vendorId) => {
    const target = readText(req.body?.return_to);
    return vendorId && target === `/vendors/${vendorId}` ? target : backTo(req, '/files');
};

/** POST /files (multipart): stores one file. */
const processUpload = async (req, res) => {
    const vendorIds = (await findVendors(req.wedding.id)).map((vendor) => vendor.id);
    const { values, data, errors } = validateFileUpload(req.body, req.file, vendorIds);
    if (req.uploadError === 'tooBig')
        errors.unshift({ field: 'file', key: 'files.tooBig', vars: { max: MAX_FILE_MB } });
    else if (req.uploadError === 'busy') errors.unshift({ field: 'file', key: 'files.busy' });
    else if (req.uploadError) errors.unshift({ field: 'file', key: 'files.unreadable' });
    if (errors.length > 0) return renderUploadErrors(req, res, { values, errors });

    const added = await addFile(req.wedding.id, {
        kind: data.kind,
        name: data.name,
        contentType: data.contentType,
        note: data.note,
        vendorId: data.vendorId,
        uploadedBy: req.session.user.id,
        data: data.buffer
    });
    if (added.full) {
        const full =
            added.full === 'wedding'
                ? { field: 'file', key: 'files.full', vars: { max: MAX_WEDDING_FILES_MB } }
                : { field: 'file', key: 'files.userFull', vars: { max: MAX_USER_FILES_GB } };
        return renderUploadErrors(req, res, { values, errors: [full] });
    }
    setFlash(req, 'success', 'files.uploaded', { name: data.name });
    res.redirect(afterUpload(req, data.vendorId));
};

/**
 * GET /files/:id: the file itself. Sandboxed and never sniffed, so even a file that slipped past
 * the type check could not run as a page on this site.
 */
const downloadFile = async (req, res, next) => {
    const file = isUuid(req.params.id) ? await findFileForDownload(req.params.id, req.wedding.id) : null;
    if (!file) return next();
    res.set({
        'Content-Type': file.content_type,
        'Content-Length': String(file.size),
        'Content-Disposition': contentDisposition(file.name, INLINE_TYPES.includes(file.content_type)),
        'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
        'X-Content-Type-Options': 'nosniff',
        // Not kept in the browser: a deleted file, or one a removed member saw, must not linger.
        'Cache-Control': 'private, no-store'
    });
    for (let offset = 0; offset < file.size; offset += DOWNLOAD_CHUNK_BYTES) {
        const chunk = await readFileChunk(file.id, req.wedding.id, offset, DOWNLOAD_CHUNK_BYTES);
        if (!chunk) break; // deleted while downloading
        if (!res.write(chunk)) await new Promise((resolve) => res.once('drain', resolve));
    }
    res.end();
};

/** POST /files/:id/delete: back to the page it was deleted from (the files page or a vendor's). */
const processDeleteFile = async (req, res, next) => {
    if (!isUuid(req.params.id) || !(await deleteFile(req.params.id, req.wedding.id))) return next();
    setFlash(req, 'success', 'files.deleted');
    const target = readText(req.body?.return_to);
    res.redirect(/^\/vendors\/[0-9a-f-]{36}$/i.test(target) ? target : backTo(req, '/files'));
};

export { showFiles, processUpload, downloadFile, processDeleteFile, renderFiles };
