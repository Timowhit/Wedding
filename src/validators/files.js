import { FILE_KINDS, FILE_NOTE_MAX } from '../constants.js';
import { cleanFileName, detectFileType } from '../utils/file-types.js';
import { checkText, collectErrors, isUuid, readChoice, readText } from './common.js';

/**
 * An upload: the file itself (already size-limited by the upload middleware), its kind, an
 * optional note and an optional vendor of this wedding.
 * @param {object} [body] - The multipart form's fields.
 * @param {{buffer: Buffer, originalname: string}|undefined} file - From multer.
 * @param {string[]} vendorIds - This wedding's vendor ids.
 * @returns {{values: {kind: string, note: string, vendor_id: string}, data: {kind: string|null, note: string|null, vendorId: string|null, name: string, contentType: string|null, buffer: Buffer|null}, errors: Array}}
 */
const validateFileUpload = (body = {}, file, vendorIds = []) => {
    const values = { kind: readText(body.kind), note: readText(body.note), vendor_id: readText(body.vendor_id) };
    const { errors, fail } = collectErrors();
    const kind = readChoice(values.kind, FILE_KINDS);
    if (!kind) fail('kind', 'validation.choice');
    checkText(fail, 'note', values.note, { max: FILE_NOTE_MAX });
    const vendorId = values.vendor_id && isUuid(values.vendor_id) ? readChoice(values.vendor_id, vendorIds) : null;
    if (values.vendor_id && !vendorId) fail('vendor_id', 'validation.choice');

    const type = file ? detectFileType(file.buffer, file.originalname) : null;
    if (!file) fail('file', 'files.choose');
    else if (!type) fail('file', 'files.badType');

    return {
        values,
        data: {
            kind,
            note: values.note || null,
            vendorId,
            name: cleanFileName(file?.originalname),
            contentType: type?.contentType ?? null,
            buffer: file?.buffer ?? null
        },
        errors
    };
};

export { validateFileUpload };
