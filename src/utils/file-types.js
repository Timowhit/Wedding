/**
 * Works out what an uploaded file really is from its first bytes (never from its name or the
 * browser's claim alone), and cleans its name for storage and download headers.
 */

const NAME_MAX = 200;
const startsWith = (buffer, bytes, offset = 0) => bytes.every((byte, i) => buffer[offset + i] === byte);
const ascii = (text) => [...text].map((char) => char.charCodeAt(0));

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OFFICE = Object.freeze({
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
});

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
    if (startsWith(buffer, ZIP) && OFFICE[extension]) return { contentType: OFFICE[extension], inline: false };
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
