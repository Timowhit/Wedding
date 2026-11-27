import {
    BUDGET_CATEGORIES,
    BUDGET_CATEGORY_NAME_MAX,
    MAX_TEMPLATE_ITEMS,
    TASK_CATEGORIES,
    VENDOR_CATEGORIES
} from '../constants.js';
import { validateCustomField } from './custom-fields.js';
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

const MONEY_MAX = 9_999_999_999.99;
const readPlanned = (value) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MONEY_MAX
        ? Math.round(value * 100) / 100
        : null;

/**
 * A whole wedding as a template: tasks (dated relative to the wedding), the schedule, budget
 * categories with planned amounts, vendors (name and kind only) and custom fields.
 * @param {{tasks: Array, weddingIso: string|null, schedule: Array, categories: Array<{builtin_key: string|null, name: string|null, planned: number|null}>, vendors: Array<{name: string, category: string}>, fields: Array<{entity: string, label: string, type: string, options: string[]}>}} wedding
 * @returns {{tasks: Array, schedule: Array, categories: Array<{key: string|null, name: string|null, planned: number|null}>, vendors: Array<{name: string, category: string}>, fields: Array<{entity: string, label: string, type: string, options: string[]}>}}
 */
const weddingTemplateFrom = ({ tasks, weddingIso, schedule, categories, vendors, fields }) => ({
    tasks: checklistItemsFrom(tasks, weddingIso),
    schedule: scheduleItemsFrom(schedule),
    // Only categories the wedding added or planned: the suggested ones come with every wedding.
    categories: categories
        .filter((category) => category.name || category.planned !== null)
        .map((category) => ({ key: category.builtin_key, name: category.name, planned: category.planned })),
    vendors: vendors.map((vendor) => ({ name: vendor.name, category: vendor.category })),
    fields: fields.map(({ entity, label, type, options }) => ({ entity, label, type, options }))
});

/**
 * Checks a stored whole-wedding template before it is applied: each part is cleaned like the
 * forms would clean it, broken items are dropped, and each list keeps at most MAX_TEMPLATE_ITEMS.
 * @param {unknown} raw - The template's items as stored.
 * @returns {ReturnType<typeof weddingTemplateFrom>}
 */
const normaliseWeddingTemplate = (raw) => {
    const items = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const list = (value) => (Array.isArray(value) ? value : []).filter((item) => item && typeof item === 'object');
    return {
        tasks: normaliseChecklistItems(items.tasks),
        schedule: normaliseScheduleItems(items.schedule),
        categories: list(items.categories)
            .map((item) => ({
                key: BUDGET_CATEGORIES.includes(item.key) ? item.key : null,
                name: BUDGET_CATEGORIES.includes(item.key) ? null : text(item.name, BUDGET_CATEGORY_NAME_MAX),
                planned: readPlanned(item.planned)
            }))
            .filter((item) => item.key || item.name)
            .slice(0, MAX_TEMPLATE_ITEMS),
        vendors: list(items.vendors)
            .map((item) => ({
                name: text(item.name, LIMITS.vendorName),
                category: VENDOR_CATEGORIES.includes(item.category) ? item.category : 'Other'
            }))
            .filter((item) => item.name)
            .slice(0, MAX_TEMPLATE_ITEMS),
        fields: list(items.fields)
            .map((item) =>
                validateCustomField({
                    entity: item.entity,
                    label: item.label,
                    type: item.type,
                    options: Array.isArray(item.options) ? item.options.join('\n') : ''
                })
            )
            .filter((result) => result.errors.length === 0)
            .map((result) => result.data)
            .slice(0, MAX_TEMPLATE_ITEMS)
    };
};

/**
 * How many things a whole-wedding template holds (for "nothing to save" and the list).
 * @param {ReturnType<typeof weddingTemplateFrom>} items
 * @returns {number}
 */
const weddingTemplateSize = (items) =>
    ['tasks', 'schedule', 'categories', 'vendors', 'fields'].reduce((sum, part) => sum + items[part].length, 0);

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
    weddingTemplateFrom,
    normaliseWeddingTemplate,
    weddingTemplateSize,
    daysBefore,
    dueDateFrom,
    checklistItemsFrom,
    scheduleItemsFrom,
    normaliseChecklistItems,
    normaliseScheduleItems,
    validateTemplateName
};
