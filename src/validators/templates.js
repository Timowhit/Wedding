import { MAX_TEMPLATE_ITEMS, TASK_CATEGORIES } from '../constants.js';
import { toIsoDate } from '../utils/format.js';
import { LIMITS } from './planning.js';
import { checkText, collectErrors, isValidDate, readText } from './common.js';

const NAME_MAX = 120;
const SCHEDULE_TEXT_MAX = Object.freeze({ title: 200, location: 200, notes: 2000, contingency: 2000 });
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DATE_MS = 8.64e15; // the largest time a JavaScript Date can hold

const utcDay = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/**
 * Whole days from a due date to the wedding (positive = before the wedding). Counted on UTC
 * calendar days, so daylight-saving changes never produce fractions.
 * @param {string|null} weddingIso - YYYY-MM-DD
 * @param {string|null} dueIso - YYYY-MM-DD
 * @returns {number|null} Null when either date is missing.
 */
const daysBefore = (weddingIso, dueIso) =>
    weddingIso && dueIso ? Math.round((utcDay(weddingIso) - utcDay(dueIso)) / DAY_MS) : null;

/**
 * The due date that lies `days` before the wedding.
 * @param {string|null} weddingIso - YYYY-MM-DD
 * @param {number|null} days
 * @returns {string|null} YYYY-MM-DD, or null when the wedding has no date, the item had none, or
 *   the result would fall outside the dates the app accepts (1900-2100).
 */
const dueDateFrom = (weddingIso, days) => {
    if (!weddingIso || !Number.isInteger(days)) return null;
    const time = utcDay(weddingIso) - days * DAY_MS;
    if (!Number.isFinite(time) || Math.abs(time) > MAX_DATE_MS) return null;
    const due = new Date(time).toISOString().slice(0, 10);
    // Corrupt or extreme day counts must not produce dates the rest of the app refuses.
    return isValidDate(due) ? due : null;
};

const text = (value, max) => (typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, max) : null);

/**
 * Template items from a wedding's checklist tasks.
 * @param {Array<{text: string, category: string, due_date: Date|string|null}>} tasks
 * @param {string|null} weddingIso
 * @returns {Array<{text: string, category: string, daysBefore: number|null}>}
 */
const checklistItemsFrom = (tasks, weddingIso) =>
    tasks.map((task) => ({
        text: task.text,
        category: task.category,
        daysBefore: daysBefore(weddingIso, toIsoDate(task.due_date) || null)
    }));

/**
 * Template items from a wedding's schedule. The vendor and contact belong to that wedding and
 * are left out.
 * @param {Array<{starts_at: string, ends_at: string|null, title: string, location: string|null, notes: string|null, contingency: string|null}>} items
 * @returns {Array<{startsAt: string, endsAt: string|null, title: string, location: string|null, notes: string|null, contingency: string|null}>}
 */
const scheduleItemsFrom = (items) =>
    items.map((item) => ({
        startsAt: item.starts_at,
        endsAt: item.ends_at ?? null,
        title: item.title,
        location: item.location ?? null,
        notes: item.notes ?? null,
        contingency: item.contingency ?? null
    }));

/**
 * Checks stored checklist items before they are applied: unknown categories become "Other",
 * broken items are skipped, and at most MAX_TEMPLATE_ITEMS are kept.
 * @param {unknown} raw - The template's items as stored.
 * @returns {Array<{text: string, category: string, daysBefore: number|null}>}
 */
const normaliseChecklistItems = (raw) =>
    (Array.isArray(raw) ? raw : [])
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({
            text: text(item.text, LIMITS.taskText),
            category: TASK_CATEGORIES.includes(item.category) ? item.category : 'Other',
            daysBefore: Number.isInteger(item.daysBefore) ? item.daysBefore : null
        }))
        .filter((item) => item.text)
        .slice(0, MAX_TEMPLATE_ITEMS);

/**
 * Checks stored schedule items before they are applied: a valid start time and a title are
 * required; a bad end time is dropped.
 * @param {unknown} raw
 * @returns {Array<{startsAt: string, endsAt: string|null, title: string, location: string|null, notes: string|null, contingency: string|null}>}
 */
const normaliseScheduleItems = (raw) =>
    (Array.isArray(raw) ? raw : [])
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({
            startsAt: TIME_PATTERN.test(item.startsAt) ? item.startsAt : null,
            endsAt: TIME_PATTERN.test(item.endsAt) ? item.endsAt : null,
            title: text(item.title, SCHEDULE_TEXT_MAX.title),
            location: text(item.location, SCHEDULE_TEXT_MAX.location),
            notes: text(item.notes, SCHEDULE_TEXT_MAX.notes),
            contingency: text(item.contingency, SCHEDULE_TEXT_MAX.contingency)
        }))
        .filter((item) => item.startsAt && item.title)
        .slice(0, MAX_TEMPLATE_ITEMS);

/**
 * @param {object} [body] - req.body
 * @returns {{values: {name: string}, data: {name: string}, errors: Array<{field: string, key: string, vars?: object}>}}
 */
const validateTemplateName = (body = {}) => {
    const values = { name: readText(body.name) };
    const { errors, fail } = collectErrors();
    checkText(fail, 'name', values.name, { required: true, max: NAME_MAX });
    return { values, data: { name: values.name }, errors };
};

export {
    daysBefore,
    dueDateFrom,
    checklistItemsFrom,
    scheduleItemsFrom,
    normaliseChecklistItems,
    normaliseScheduleItems,
    validateTemplateName
};
