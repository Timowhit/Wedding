/**
 * Display formatting used by the views (exposed through res.locals in middleware/i18n.js).
 */

const LOCALES = { en: 'en-US', es: 'es-ES' };

/**
 * @param {number|string|null} amount - NUMERIC columns arrive from pg as strings.
 * @param {string} lang
 * @returns {string} e.g. "$1,250.00"
 */
const formatCurrency = (amount, lang) =>
    new Intl.NumberFormat(LOCALES[lang] ?? LOCALES.en, { style: 'currency', currency: 'USD' }).format(
        Number(amount ?? 0)
    );

/**
 * Formats a DATE column. pg returns DATE as a JS Date at local midnight; to avoid timezone
 * shifts the date is rebuilt from its local parts and formatted in UTC.
 * @param {Date|string|null} value
 * @param {string} lang
 * @returns {string} e.g. "Saturday, June 13, 2026", or '' when there is no date.
 */
const formatDate = (value, lang) => {
    const iso = toIsoDate(value);
    if (!iso) return '';
    return new Intl.DateTimeFormat(LOCALES[lang] ?? LOCALES.en, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC'
    }).format(new Date(`${iso}T00:00:00Z`));
};

/**
 * Converts a DATE column value to "YYYY-MM-DD" (for <input type="date"> and comparisons).
 * @param {Date|string|null} value
 * @returns {string} '' when there is no date.
 */
const toIsoDate = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value.slice(0, 10);
    const pad = (n) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
};

/**
 * Whole days from today (server time) until a date. Negative once the date has passed.
 * @param {Date|string|null} value
 * @param {Date} [today]
 * @returns {number|null}
 */
const daysUntil = (value, today = new Date()) => {
    const iso = toIsoDate(value);
    if (!iso) return null;
    const target = Date.UTC(...iso.split('-').map((part, i) => Number(part) - (i === 1 ? 1 : 0)));
    const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.round((target - now) / 86_400_000);
};

export { formatCurrency, formatDate, toIsoDate, daysUntil };
