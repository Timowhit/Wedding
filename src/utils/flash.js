/**
 * One-time messages shown on the next rendered page ("flash"). The message is stored as an
 * i18n key, not as text, so it is shown in the language of the page that displays it.
 */

const FLASH_TYPES = ['success', 'error', 'info'];

/**
 * Stores a flash message in the session.
 * @param {import('express').Request} req
 * @param {'success'|'error'|'info'} type
 * @param {string} key - i18n key.
 * @param {Record<string, string|number>} [vars] - Values for {placeholders} in the message.
 */
const setFlash = (req, type, key, vars = {}) => {
    if (!FLASH_TYPES.includes(type)) throw new Error(`Unknown flash type: ${type}`);
    req.session.flash = { type, key, vars };
};

/**
 * Removes and returns the session's flash message (read once).
 * @param {import('express').Request} req
 * @returns {{type: string, key: string, vars: object}|null}
 */
const takeFlash = (req) => {
    const flash = req.session?.flash ?? null;
    if (flash) delete req.session.flash;
    return flash;
};

export { setFlash, takeFlash };
