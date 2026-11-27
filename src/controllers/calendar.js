import { findCalendarEntries, searchWeddings } from '../models/calendar.js';
import { monthGrid, readMonth, shiftMonth } from '../utils/calendar.js';
import { todayIso } from '../utils/today.js';
import { isUuid, readText } from '../validators/common.js';

// Where each kind of entry opens, inside its wedding.
const ENTRY_PAGES = Object.freeze({
    wedding: '/',
    task: '/checklist',
    payment: '/vendors',
    decision: '/decisions',
    guest: '/guests',
    vendor: '/vendors',
    schedule: '/schedule'
});
const SEARCH_KINDS = Object.freeze(['guest', 'vendor', 'task', 'decision', 'schedule']);
const SEARCH_MIN = 2;
const SEARCH_MAX = 100;
const RESULTS_PER_KIND = 20;
// 2024-01-01 was a Monday: used to name the weekdays in the page's language.
const A_MONDAY = Date.UTC(2024, 0, 1);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const weekdayNames = (lang) =>
    Array.from({ length: 7 }, (_, i) =>
        new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: 'UTC' }).format(new Date(A_MONDAY + i * MS_PER_DAY))
    );

const monthName = (month, lang) =>
    new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(`${month}-01T00:00:00Z`)
    );

/** GET /calendar: a month of dated entries across the person's weddings. */
const showCalendar = async (req, res) => {
    const today = todayIso();
    const month = readMonth(req.query.month, today);
    const weddingFilter = isUuid(req.query.wedding) ? req.query.wedding : null;
    const grid = monthGrid(month);
    const entries = await findCalendarEntries(req.session.user.id, grid.from, grid.to, weddingFilter);
    const byDay = new Map();
    for (const entry of entries) {
        if (!byDay.has(entry.day)) byDay.set(entry.day, []);
        byDay.get(entry.day).push({ ...entry, page: ENTRY_PAGES[entry.kind] });
    }
    res.render('calendar', {
        title: req.t('calendar.title'),
        month,
        monthLabel: monthName(month, res.locals.lang),
        weekdays: weekdayNames(res.locals.lang),
        weeks: grid.weeks,
        days: [...byDay.entries()].map(([day, list]) => ({ day, entries: list })),
        counts: Object.fromEntries([...byDay.entries()].map(([day, list]) => [day, list.length])),
        today,
        previous: shiftMonth(month, -1),
        next: shiftMonth(month, 1),
        weddingFilter
    });
};

/** GET /search?q=: guests, vendors, tasks, decisions and event-day items across the person's weddings. */
const showSearch = async (req, res) => {
    const query = readText(req.query.q).slice(0, SEARCH_MAX);
    const tooShort = query.length > 0 && query.length < SEARCH_MIN;
    const results =
        query.length >= SEARCH_MIN ? await searchWeddings(req.session.user.id, query, RESULTS_PER_KIND) : [];
    res.render('search', {
        title: req.t('search.title'),
        query,
        tooShort,
        minLength: SEARCH_MIN,
        groups: SEARCH_KINDS.map((kind) => ({
            kind,
            page: ENTRY_PAGES[kind],
            results: results.filter((result) => result.kind === kind)
        })).filter((group) => group.results.length > 0),
        total: results.length
    });
};

export { showCalendar, showSearch };
