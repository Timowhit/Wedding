import { FILE_KINDS, MAX_FILE_MB, MAX_WEDDING_FILE_BYTES, MAX_WEDDING_FILES_MB } from '../constants.js';
import { addFile, deleteFile, findFileForDownload, findFiles, findStorageUsed } from '../models/files.js';
import { findVendors } from '../models/vendors.js';
import { contentDisposition } from '../utils/file-types.js';
import { setFlash } from '../utils/flash.js';
import { backTo } from '../utils/redirect.js';
import { isUuid, readChoice, readText } from '../validators/common.js';
import { validateFileUpload } from '../validators/files.js';

const INLINE_TYPES = Object.freeze(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const EMPTY_UPLOAD = Object.freeze({ kind: 'contract', note: '', vendor_id: '' });

const renderFiles = async (req, res, { status = 200, uploadForm } = {}) => {
    const kind = readChoice(req.query.kind, FILE_KINDS);
    const [files, used, vendors] = await Promise.all([
        findFiles(req.wedding.id, { kind }),
        findStorageUsed(req.wedding.id),
        findVendors(req.wedding.id)
    ]);
    res.status(status).render('files', {
        title: req.t('files.title'),
        files,
        kinds: FILE_KINDS,
        activeKind: kind,
        vendors,
        usedMb: Math.round((used / MAX_WEDDING_FILE_BYTES) * MAX_WEDDING_FILES_MB * 10) / 10,
        maxMb: MAX_WEDDING_FILES_MB,
        fileMaxMb: MAX_FILE_MB,
        uploadForm: uploadForm ?? { values: EMPTY_UPLOAD, errors: [] }
    });
};

/** GET /files: the wedding's files, optionally one kind. */
const showFiles = (req, res) => renderFiles(req, res);

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
    else if (req.uploadError) errors.unshift({ field: 'file', key: 'files.unreadable' });
    if (errors.length > 0) return renderFiles(req, res, { status: 400, uploadForm: { values, errors } });

    const added = await addFile(req.wedding.id, {
        kind: data.kind,
        name: data.name,
        contentType: data.contentType,
        note: data.note,
        vendorId: data.vendorId,
        uploadedBy: req.session.user.id,
        data: data.buffer
    });
    if (!added) {
        const full = [{ field: 'file', key: 'files.full', vars: { max: MAX_WEDDING_FILES_MB } }];
        return renderFiles(req, res, { status: 400, uploadForm: { values, errors: full } });
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
        'Content-Length': String(file.data.length),
        'Content-Disposition': contentDisposition(file.name, INLINE_TYPES.includes(file.content_type)),
        'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=3600'
    });
    res.end(file.data);
};

/** POST /files/:id/delete */
const processDeleteFile = async (req, res, next) => {
    if (!isUuid(req.params.id) || !(await deleteFile(req.params.id, req.wedding.id))) return next();
    setFlash(req, 'success', 'files.deleted');
    res.redirect(backTo(req, '/files'));
};

export { showFiles, processUpload, downloadFile, processDeleteFile, renderFiles };
