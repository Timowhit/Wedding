const FALLBACK_TIME_ZONE = 'UTC';

/**
 * True when `name` is an IANA time zone this runtime knows (e.g. "America/New_York").
 * @param {unknown} name
 * @returns {boolean}
 */
const isValidTimeZone = (name) => {
    if (typeof name !== 'string' || name === '') return false;
    try {
        new Intl.DateTimeFormat('en-CA', { timeZone: name });
        return true;
    } catch {
        return false;
    }
};

/**
 * Today's date in the app's time zone, as YYYY-MM-DD. Day-based rules (overdue, "due in the
 * next 30 days", the date "Mark paid" records) use this instead of the server clock's date:
 * the server runs in UTC, so an evening in the Americas would otherwise already be tomorrow.
 * @param {string} [timeZone] - IANA name; defaults to APP_TIME_ZONE, falling back to UTC.
 * @returns {string}
 */
const todayIso = (timeZone = process.env.APP_TIME_ZONE) =>
    new Intl.DateTimeFormat('en-CA', {
        timeZone: isValidTimeZone(timeZone) ? timeZone : FALLBACK_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());

export { isValidTimeZone, todayIso };
