import { PALETTES, THEME_MODES } from '../constants.js';
import { isSupportedLanguage } from '../i18n/index.js';
import { EMAIL_MAX, checkText, collectErrors, isEmail, readChoice, readText } from './common.js';

const NAME_MAX = 80;
const BUSINESS_NAME_MAX = 120;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200; // stops absurdly long passwords from tying up the hasher

/** Raw (untrimmed) string or ''. Passwords are never trimmed. */
const readSecret = (value) => (typeof value === 'string' ? value : '');

/**
 * Checks a new password's length and that it matches its confirmation.
 * @param {(field: string, key: string, vars?: object) => void} fail
 * @param {string} password
 * @param {string} confirmation
 * @param {string} [field]
 */
const checkNewPassword = (fail, password, confirmation, field = 'password') => {
    if (password.length < PASSWORD_MIN) fail(field, 'validation.passwordTooShort', { min: PASSWORD_MIN });
    else if (password.length > PASSWORD_MAX) fail(field, 'validation.tooLong', { max: PASSWORD_MAX });
    if (password !== confirmation) fail('confirm_password', 'validation.passwordMismatch');
};

/**
 * @param {object} [body] - req.body
 * @returns {{values: {email: string}, password: string, errors: Array}}
 */
const validateLogin = (body = {}) => {
    const values = { email: readText(body.email).toLowerCase() };
    const password = readSecret(body.password);
    const { errors, fail } = collectErrors();

    checkText(fail, 'email', values.email, { required: true, max: EMAIL_MAX });
    if (password.length === 0) fail('password', 'validation.required');
    else if (password.length > PASSWORD_MAX) fail('password', 'validation.tooLong', { max: PASSWORD_MAX });

    return { values, password, errors };
};

/**
 * @param {object} [body] - req.body
 * @returns {{values: {name: string, email: string}, password: string, errors: Array}}
 *          Values to show again on error (never the password) plus the password itself.
 */
const validateRegistration = (body = {}) => {
    const values = { name: readText(body.name), email: readText(body.email).toLowerCase() };
    const password = readSecret(body.password);
    const { errors, fail } = collectErrors();

    checkText(fail, 'name', values.name, { required: true, max: NAME_MAX });
    if (checkText(fail, 'email', values.email, { required: true, max: EMAIL_MAX }) && !isEmail(values.email)) {
        fail('email', 'validation.email');
    }
    checkNewPassword(fail, password, readSecret(body.confirm_password));

    return { values, password, errors };
};

/**
 * @param {object} [body] - req.body
 * @returns {{values: {display_name: string, language: string}, data: {displayName: string, language: string}, errors: Array}}
 */
const validateProfile = (body = {}) => {
    const values = { display_name: readText(body.display_name), language: readText(body.language) };
    const { errors, fail } = collectErrors();

    checkText(fail, 'display_name', values.display_name, { required: true, max: NAME_MAX });
    if (!isSupportedLanguage(values.language)) fail('language', 'validation.choice');

    return { values, data: { displayName: values.display_name, language: values.language }, errors };
};

/**
 * @param {object} [body] - req.body
 * @param {boolean} hasPassword - False for Google-only accounts, which set a first password without a current one.
 * @returns {{currentPassword: string, newPassword: string, errors: Array}}
 */
const validatePasswordChange = (body = {}, hasPassword = true) => {
    const currentPassword = readSecret(body.current_password);
    const newPassword = readSecret(body.new_password);
    const { errors, fail } = collectErrors();

    if (hasPassword && currentPassword.length === 0) fail('current_password', 'validation.required');
    checkNewPassword(fail, newPassword, readSecret(body.confirm_password), 'new_password');

    return { currentPassword, newPassword, errors };
};

/**
 * A user's own colour theme.
 * @param {object} [body] - req.body
 * @returns {{values: {palette: string, mode: string}, data: {palette: string, mode: string}, errors: Array}}
 */
const validateAppearance = (body = {}) => {
    const values = { palette: readText(body.palette), mode: readText(body.mode) };
    const { errors, fail } = collectErrors();
    const palette = readChoice(values.palette, PALETTES);
    const mode = readChoice(values.mode, THEME_MODES);
    if (!palette) fail('palette', 'validation.choice');
    if (!mode) fail('mode', 'validation.choice');
    return { values, data: { palette, mode }, errors };
};

/**
 * A planner's business details. An empty brand palette means "clients keep their own palette".
 * @param {object} [body] - req.body
 * @returns {{values: {business_name: string, brand_palette: string}, data: {businessName: string|null, brandPalette: string|null}, errors: Array}}
 */
const validateBusiness = (body = {}) => {
    const values = { business_name: readText(body.business_name), brand_palette: readText(body.brand_palette) };
    const { errors, fail } = collectErrors();
    checkText(fail, 'business_name', values.business_name, { max: BUSINESS_NAME_MAX });
    const brandPalette = values.brand_palette === '' ? null : readChoice(values.brand_palette, PALETTES);
    if (values.brand_palette !== '' && !brandPalette) fail('brand_palette', 'validation.choice');
    return { values, data: { businessName: values.business_name || null, brandPalette }, errors };
};

export {
    BUSINESS_NAME_MAX,
    validateAppearance,
    validateBusiness,
    NAME_MAX,
    PASSWORD_MIN,
    PASSWORD_MAX,
    validateLogin,
    validateRegistration,
    validateProfile,
    validatePasswordChange
};
