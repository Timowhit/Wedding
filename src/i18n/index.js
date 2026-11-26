import en from './en.js';
import es from './es.js';

/**
 * Server-side translations. Every user-facing string lives in en.js/es.js under a dotted key.
 * Strings may contain {placeholders}; values are inserted as plain text and EJS escapes the
 * result, so translations never inject HTML. tests/i18n.test.js checks both files share keys.
 */

const DEFAULT_LANGUAGE = 'en';
const SUPPORTED_LANGUAGES = Object.freeze(['en', 'es']);
const DICTIONARIES = { en, es };

/**
 * @param {unknown} value
 * @returns {boolean} True for a supported language code.
 */
const isSupportedLanguage = (value) => SUPPORTED_LANGUAGES.includes(value);

/**
 * Translates a key. Falls back to English, then to the key itself (so a missing string is
 * visible in the page rather than blank).
 * @param {string} lang
 * @param {string} key
 * @param {Record<string, string|number>} [vars]
 * @returns {string}
 */
const translate = (lang, key, vars = {}) => {
    const template = DICTIONARIES[lang]?.[key] ?? DICTIONARIES[DEFAULT_LANGUAGE][key] ?? key;
    return template.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
};

/**
 * Picks a language from an Accept-Language header, e.g. "es-MX,es;q=0.9,en;q=0.8" -> "es".
 * @param {string|undefined} header
 * @returns {string}
 */
const languageFromHeader = (header) => {
    const preferred = String(header ?? '')
        .split(',')
        .map((part) => part.trim().slice(0, 2).toLowerCase())
        .find(isSupportedLanguage);
    return preferred ?? DEFAULT_LANGUAGE;
};

export { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, DICTIONARIES, isSupportedLanguage, translate, languageFromHeader };
