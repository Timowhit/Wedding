import { ASSIGNABLE_ROLES } from '../models/weddings.js';
import { EMAIL_MAX, checkText, collectErrors, isEmail, isUuid, isValidDate, readChoice, readText } from './common.js';

const WEDDING_NAME_MAX = 200;
const INVITE_LINK_MAX = 500;
const TOKEN_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Validates an optional YYYY-MM-DD date field.
 * @returns {string|null} The date, or null when empty.
 */
const checkOptionalDate = (fail, field, value) => {
    if (value.length === 0) return null;
    if (!isValidDate(value)) fail(field, 'validation.date');
    return value;
};

/**
 * Wedding name and date (settings page and the "new wedding" form).
 * @param {object} [body] - req.body
 * @returns {{values: {name: string, wedding_date: string}, data: {name: string, weddingDate: string|null}, errors: Array}}
 */
const validateWedding = (body = {}) => {
    const values = { name: readText(body.name), wedding_date: readText(body.wedding_date) };
    const { errors, fail } = collectErrors();

    checkText(fail, 'name', values.name, { required: true, max: WEDDING_NAME_MAX });
    const weddingDate = checkOptionalDate(fail, 'wedding_date', values.wedding_date);

    return { values, data: { name: values.name, weddingDate }, errors };
};

/**
 * Only the date (dashboard form). An empty value clears the date.
 * @param {object} [body] - req.body
 * @returns {{weddingDate: string|null, errors: Array}}
 */
const validateWeddingDate = (body = {}) => {
    const { errors, fail } = collectErrors();
    const weddingDate = checkOptionalDate(fail, 'wedding_date', readText(body.wedding_date));
    return { weddingDate, errors };
};

/**
 * Email invite form. An empty email means "create a share link".
 * @param {object} [body] - req.body
 * @returns {{values: {email: string, role: string}, data: {email: string|null, role: string}, errors: Array}}
 */
const validateInvite = (body = {}) => {
    const values = { email: readText(body.email).toLowerCase(), role: readText(body.role) };
    const { errors, fail } = collectErrors();

    if (values.email.length > 0 && (values.email.length > EMAIL_MAX || !isEmail(values.email))) {
        fail('email', 'validation.email');
    }
    const role = readChoice(values.role, ASSIGNABLE_ROLES);
    if (!role) fail('role', 'validation.choice');

    return { values, data: { email: values.email || null, role }, errors };
};

/**
 * @param {object} [body] - req.body
 * @returns {'editor'|'viewer'|null}
 */
const readAssignableRole = (body = {}) => readChoice(readText(body.role), ASSIGNABLE_ROLES);

/**
 * Pulls an invite token out of a pasted link (".../invite/<token>" or "?token=<token>") or a bare token.
 * @param {unknown} value
 * @returns {string|null} The lower-cased token, or null.
 */
const extractInviteToken = (value) => {
    const text = readText(value);
    if (text.length === 0 || text.length > INVITE_LINK_MAX) return null;
    const match = text.match(TOKEN_PATTERN);
    return match && isUuid(match[0]) ? match[0].toLowerCase() : null;
};

export {
    WEDDING_NAME_MAX,
    validateWedding,
    validateWeddingDate,
    validateInvite,
    readAssignableRole,
    extractInviteToken
};
