/**
 * Small, dependency-free validation helpers shared by every form validator.
 *
 * Validators never throw and never touch the database. They return
 * `{ values, data, errors }`:
 * - values: trimmed strings, safe to put back into the form when it is shown again
 * - data:   typed values for the model (only meaningful when errors is empty)
 * - errors: Array<{ field, key, vars? }>, where `key` is an i18n key (see src/i18n)
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

const YEAR_MIN = 1900; // keeps dates inside what PostgreSQL and the date picker handle sanely
const YEAR_MAX = 2100;
const EMAIL_MAX = 255;
const URL_MAX = 500;
const MONEY_MAX = 9_999_999_999.99; // NUMERIC(12,2)

/**
 * Reads a form field as a trimmed string. Non-strings (e.g. repeated fields parsed as
 * arrays, or missing fields) count as empty.
 * @param {unknown} value
 * @returns {string}
 */
const readText = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * Returns the value only if it is one of the allowed options, otherwise null.
 * @template T
 * @param {unknown} value
 * @param {readonly T[]} allowed
 * @returns {T|null}
 */
const readChoice = (value, allowed) => (allowed.includes(value) ? value : null);

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * A "#rrggbb" colour (what <input type="color"> sends), lowercased, or null.
 * @param {unknown} value
 * @returns {string|null}
 */
const readHex = (value) => {
    const text = readText(value);
    const withHash = text.startsWith('#') ? text : `#${text}`;
    return HEX_COLOR.test(withHash) ? withHash.toLowerCase() : null;
};

/**
 * True for a canonical UUID (the primary-key format of every table). Checking route ids
 * first keeps malformed input from ever reaching PostgreSQL.
 * @param {unknown} value
 * @returns {boolean}
 */
const isUuid = (value) => typeof value === 'string' && UUID_PATTERN.test(value);

/**
 * @param {string} text
 * @returns {boolean} True for a plausible email address of acceptable length.
 */
const isEmail = (text) => text.length <= EMAIL_MAX && EMAIL_PATTERN.test(text);

/**
 * True only for a real calendar date written as YYYY-MM-DD between YEAR_MIN and YEAR_MAX.
 * Round-tripping through Date rejects values like 2026-02-30.
 * @param {string} text
 * @returns {boolean}
 */
const isValidDate = (text) => {
    if (!DATE_PATTERN.test(text)) return false;
    const year = Number(text.slice(0, 4));
    if (year < YEAR_MIN || year > YEAR_MAX) return false;
    const date = new Date(`${text}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
};

/**
 * True for an absolute http(s) URL. Other schemes (javascript:, data:, ...) are rejected so
 * stored links are always safe to put in an href.
 * @param {string} text
 * @returns {boolean}
 */
const isHttpUrl = (text) => {
    if (text.length > URL_MAX) return false;
    try {
        const url = new URL(text);
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
};

/**
 * Parses a money amount such as "1250", "1,250.5" or "$99.99".
 * @param {string} text
 * @returns {number|null} The amount, or null when it is not a valid non-negative amount.
 */
const parseMoney = (text) => {
    const cleaned = text.replace(/[$,\s]/g, '');
    if (!MONEY_PATTERN.test(cleaned)) return null;
    const amount = Number(cleaned);
    return amount <= MONEY_MAX ? amount : null;
};

/**
 * Creates an error collector for one form.
 * @returns {{ errors: Array<{field: string, key: string, vars?: object}>, fail: (field: string, key: string, vars?: object) => void }}
 */
const collectErrors = () => {
    const errors = [];
    const fail = (field, key, vars) => errors.push(vars ? { field, key, vars } : { field, key });
    return { errors, fail };
};

/**
 * Validates a required (or optional) text field's presence and length.
 * @param {(field: string, key: string, vars?: object) => void} fail
 * @param {string} field - Form field name.
 * @param {string} value - Already trimmed.
 * @param {{ required?: boolean, max: number, min?: number }} rules
 * @returns {boolean} True when the value passed.
 */
const checkText = (fail, field, value, { required = false, max, min = 0 }) => {
    if (value.length === 0) {
        if (required) fail(field, 'validation.required');
        return !required;
    }
    if (value.length < min) {
        fail(field, 'validation.tooShort', { min });
        return false;
    }
    if (value.length > max) {
        fail(field, 'validation.tooLong', { max });
        return false;
    }
    return true;
};

export {
    EMAIL_MAX,
    readText,
    readChoice,
    isUuid,
    isEmail,
    isValidDate,
    isHttpUrl,
    parseMoney,
    collectErrors,
    checkText,
    readHex
};
