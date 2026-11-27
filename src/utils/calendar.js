/** Calendar months as plain "YYYY-MM" strings, worked out in UTC so no time zone shifts a day. */

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const YEAR_MIN = 1900;
const YEAR_MAX = 2100;
const DAYS_PER_WEEK = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const iso = (date) => date.toISOString().slice(0, 10);

/**
 * A valid "YYYY-MM" from the query string, or the month of `today`.
 * @param {unknown} value
 * @param {string} today - YYYY-MM-DD (todayIso()).
 * @returns {string}
 */
const readMonth = (value, today) => {
    const match = typeof value === 'string' ? MONTH.exec(value) : null;
    if (match && Number(match[1]) >= YEAR_MIN && Number(match[1]) <= YEAR_MAX) return value;
    return today.slice(0, 7);
};

/**
 * @param {string} month - "YYYY-MM".
 * @param {number} delta - Months to add (negative goes back).
 * @returns {string} "YYYY-MM".
 */
const shiftMonth = (month, delta) => {
    const [year, index] = month.split('-').map(Number);
    return iso(new Date(Date.UTC(year, index - 1 + delta, 1))).slice(0, 7);
};

/**
 * The month's days as Monday-first weeks, padded with days of the months around it.
 * @param {string} month - "YYYY-MM".
 * @returns {{from: string, to: string, weeks: Array<Array<{day: string, inMonth: boolean}>>}}
 */
const monthGrid = (month) => {
    const [year, index] = month.split('-').map(Number);
    const first = new Date(Date.UTC(year, index - 1, 1));
    const last = new Date(Date.UTC(year, index, 0));
    const lead = (first.getUTCDay() + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK; // Monday = 0
    const start = first.getTime() - lead * MS_PER_DAY;
    const total = Math.ceil((lead + last.getUTCDate()) / DAYS_PER_WEEK) * DAYS_PER_WEEK;
    const weeks = [];
    for (let i = 0; i < total; i += 1) {
        const date = new Date(start + i * MS_PER_DAY);
        if (i % DAYS_PER_WEEK === 0) weeks.push([]);
        weeks.at(-1).push({ day: iso(date), inMonth: date.getUTCMonth() === index - 1 });
    }
    return { from: iso(first), to: iso(last), weeks };
};

export { readMonth, shiftMonth, monthGrid };
