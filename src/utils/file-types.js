/**
 * Works out what an uploaded file really is from its first bytes (never from its name or the
 * browser's claim alone), and cleans its name for storage and download headers.
 */

const NAME_MAX = 200;
const startsWith = (buffer, bytes, offset = 0) => bytes.every((byte, i) => buffer[offset + i] === byte);
const ascii = (text) => [...text].map((char) => char.charCodeAt(0));

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const ZIP_END = 0x06054b50;
const ZIP_ENTRY = 0x02014b50;
const ZIP_END_SIZE = 22;
const ZIP_ENTRY_SIZE = 46;
// The end record may be followed by a comment of up to 65,535 bytes.
const ZIP_COMMENT_MAX = 0xffff;
// Office files are zips whose parts say what they are; a macro part means .docm/.xlsm in disguise.
const OFFICE = Object.freeze({
    docx: {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        mainPart: 'word/document.xml',
        macros: 'word/vbaProject.bin'
    },
    xlsx: {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        mainPart: 'xl/workbook.xml',
        macros: 'xl/vbaProject.bin'
    }
});

/**
 * The entry names in a zip's central directory, or null when it can't be read. Names are stored
 * uncompressed there, so nothing needs unpacking.
 * @param {Buffer} buffer
 * @returns {Set<string>|null}
 */
const zipEntryNames = (buffer) => {
    const lowest = Math.max(0, buffer.length - ZIP_END_SIZE - ZIP_COMMENT_MAX);
    let end = -1;
    for (let at = buffer.length - ZIP_END_SIZE; at >= lowest; at -= 1) {
        // The real end record's comment runs exactly to the end of the file; a lookalike inside
        // a comment doesn't.
        if (buffer.readUInt32LE(at) === ZIP_END && at + ZIP_END_SIZE + buffer.readUInt16LE(at + 20) === buffer.length) {
            end = at;
            break;
        }
    }
    if (end < 0) return null;
    const count = buffer.readUInt16LE(end + 10);
    let at = buffer.readUInt32LE(end + 16);
    const names = new Set();
    for (let i = 0; i < count; i += 1) {
        if (at + ZIP_ENTRY_SIZE > end || buffer.readUInt32LE(at) !== ZIP_ENTRY) return null;
        const nameLength = buffer.readUInt16LE(at + 28);
        const extraLength = buffer.readUInt16LE(at + 30);
        const commentLength = buffer.readUInt16LE(at + 32);
        const nameEnd = at + ZIP_ENTRY_SIZE + nameLength;
        if (nameEnd > end) return null;
        names.add(buffer.toString('utf8', at + ZIP_ENTRY_SIZE, nameEnd));
        at = nameEnd + extraLength + commentLength;
    }
    return names;
};

/** The Office type when the zip holds that kind of document (and no macros), else null. */
const officeType = (buffer, extension) => {
    const office = OFFICE[extension];
    if (!office || buffer.length < ZIP_END_SIZE) return null;
    const names = zipEntryNames(buffer);
    const isDocument =
        names && names.has('[Content_Types].xml') && names.has(office.mainPart) && !names.has(office.macros);
    return isDocument ? { contentType: office.contentType, inline: false } : null;
};

const isUtf8Text = (buffer) => {
    if (buffer.includes(0)) return false;
    try {
        new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        return true;
    } catch {
        return false;
    }
};

/**
 * The supported type of a file, or null. HTML, SVG and anything else that could run in a
 * browser is never accepted.
 * @param {Buffer} buffer - The whole file.
 * @param {string} name - The original file name (only used to tell .docx from .xlsx, and .txt).
 * Word and Excel files must contain that kind of document.
 * @returns {{contentType: string, inline: boolean}|null} `inline`: safe to show in the browser (images, PDF).
 */
const detectFileType = (buffer, name) => {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
    const extension = String(name).toLowerCase().split('.').pop();
    if (startsWith(buffer, ascii('%PDF-'))) return { contentType: 'application/pdf', inline: true };
    if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        return { contentType: 'image/png', inline: true };
    if (startsWith(buffer, [0xff, 0xd8, 0xff])) return { contentType: 'image/jpeg', inline: true };
    if (startsWith(buffer, ascii('GIF87a')) || startsWith(buffer, ascii('GIF89a')))
        return { contentType: 'image/gif', inline: true };
    if (startsWith(buffer, ascii('RIFF')) && startsWith(buffer, ascii('WEBP'), 8))
        return { contentType: 'image/webp', inline: true };
    if (startsWith(buffer, ZIP)) return officeType(buffer, extension);
    if (extension === 'txt' && isUtf8Text(buffer)) return { contentType: 'text/plain; charset=utf-8', inline: false };
    return null;
};

/**
 * A file name safe to store and show: no folders, control characters or quotes, at most
 * NAME_MAX characters, never empty.
 * @param {unknown} name
 * @returns {string}
 */
const cleanFileName = (name) => {
    const base = String(name ?? '')
        .split(/[\\/]/)
        .pop()
        // Control characters (code points below 32, and 127) and quotes would break headers.
        .replace(/./gsu, (char) => (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || char === '"' ? '' : char))
        .trim()
        .slice(0, NAME_MAX);
    return base || 'file';
};

/**
 * The Content-Disposition value for a download (RFC 6266 / 5987, so any name survives).
 * @param {string} name - Already cleaned.
 * @param {boolean} inline
 * @returns {string}
 */
const contentDisposition = (name, inline) =>
    `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;

export { detectFileType, cleanFileName, contentDisposition };
