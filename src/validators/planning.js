import {
    BUDGET_CATEGORIES,
    BUDGET_CATEGORY_NAME_MAX,
    DEFAULT_TASK_PRIORITY,
    RSVP_STATUSES,
    TASK_CATEGORIES,
    TASK_PRIORITIES,
    VENDOR_CATEGORIES,
    VENDOR_STATUSES
} from '../constants.js';
import {
    checkText,
    collectErrors,
    isEmail,
    isHttpUrl,
    isValidDate,
    parseMoney,
    readChoice,
    readText
} from './common.js';

/** Validators for the planning forms: budget, checklist, guests, vendors and searches. */

const LIMITS = Object.freeze({
    expenseName: 200,
    taskText: 500,
    guestName: 200,
    diet: 300,
    plusOne: 200,
    group: 80,
    meal: 60,
    accessibility: 300,
    vendorName: 200,
    phone: 50,
    notes: 2000,
    search: 100
});

/** Text field that may be empty; empty becomes null for the database. */
const optional = (value) => (value.length === 0 ? null : value);

/**
 * @param {object} [body] - req.body
 * @returns {{values: {total: string}, data: {total: number|null}, errors: Array}}
 */
const validateBudgetLimit = (body = {}) => {
    const values = { total: readText(body.total) };
    const { errors, fail } = collectErrors();
    const total = parseMoney(values.total);
    if (total === null) fail('total', 'validation.amount');
    return { values, data: { total }, errors };
};

/** An optional planned amount: empty clears it. */
const readPlanned = (fail, text) => {
    if (text === '') return null;
    const planned = parseMoney(text);
    if (planned === null) fail('planned', 'validation.amount');
    return planned;
};

/**
 * A budget category of the wedding's own: a name and an optional planned amount.
 * @param {object} [body] - req.body
 * @returns {{values: {name: string, planned: string}, data: {name: string, planned: number|null}, errors: Array}}
 */
const validateBudgetCategory = (body = {}) => {
    const values = { name: readText(body.name), planned: readText(body.planned) };
    const { errors, fail } = collectErrors();
    checkText(fail, 'name', values.name, { required: true, max: BUDGET_CATEGORY_NAME_MAX });
    const planned = readPlanned(fail, values.planned);
    return { values, data: { name: values.name, planned }, errors };
};

/**
 * A category's planned amount (empty clears it).
 * @param {object} [body] - req.body
 * @returns {{values: {planned: string}, data: {planned: number|null}, errors: Array}}
 */
const validatePlanned = (body = {}) => {
    const values = { planned: readText(body.planned) };
    const { errors, fail } = collectErrors();
    const planned = readPlanned(fail, values.planned);
    return { values, data: { planned }, errors };
};

/**
 * @param {object} [body] - req.body
 * @param {string[]} [categories] - The wedding's category values (see findBudgetCategories).
 * @returns {{values: {name: string, category: string, amount: string}, data: {name: string, category: string, amount: number|null}, errors: Array}}
 */
const validateExpense = (body = {}, categories = BUDGET_CATEGORIES) => {
    const values = { name: readText(body.name), category: readText(body.category), amount: readText(body.amount) };
    const { errors, fail } = collectErrors();

    checkText(fail, 'name', values.name, { required: true, max: LIMITS.expenseName });
    const category = readChoice(values.category, categories);
    if (!category) fail('category', 'validation.choice');
    const amount = parseMoney(values.amount);
    if (amount === null || amount === 0) fail('amount', 'validation.positiveAmount');

    return { values, data: { name: values.name, category, amount }, errors };
};

/**
 * A checklist task. Priority and owner are optional in the body (forms from before they existed,
 * and the example tasks, leave them out): normal priority and nobody.
 * @param {object} [body] - req.body
 * @param {string[]} [memberIds] - User ids of the wedding's members; the owner must be one of them.
 * @returns {{values: {text: string, category: string, due_date: string, priority: string, assignee_id: string}, data: {text: string, category: string, dueDate: string|null, priority: string, assigneeId: string|null}, errors: Array}}
 */
const validateTask = (body = {}, memberIds = []) => {
    const values = {
        text: readText(body.text),
        category: readText(body.category),
        due_date: readText(body.due_date),
        priority: readText(body.priority) || DEFAULT_TASK_PRIORITY,
        assignee_id: readText(body.assignee_id)
    };
    const { errors, fail } = collectErrors();

    checkText(fail, 'text', values.text, { required: true, max: LIMITS.taskText });
    const category = readChoice(values.category, TASK_CATEGORIES);
    if (!category) fail('category', 'validation.choice');
    if (values.due_date.length > 0 && !isValidDate(values.due_date)) fail('due_date', 'validation.date');
    const priority = readChoice(values.priority, TASK_PRIORITIES);
    if (!priority) fail('priority', 'validation.choice');
    const assigneeId = values.assignee_id ? readChoice(values.assignee_id, memberIds) : null;
    if (values.assignee_id && !assigneeId) fail('assignee_id', 'validation.choice');

    return {
        values,
        data: { text: values.text, category, dueDate: optional(values.due_date), priority, assigneeId },
        errors
    };
};

/**
 * @param {object} [body] - req.body
 * @returns {{values: object, data: {name: string, rsvp: string, diet: string|null, plusOne: string|null, groupName: string|null, meal: string|null, accessibility: string|null}, errors: Array}}
 */
const validateGuest = (body = {}) => {
    const values = {
        name: readText(body.name),
        rsvp: readText(body.rsvp),
        diet: readText(body.diet),
        plus_one: readText(body.plus_one),
        group_name: readText(body.group_name),
        meal: readText(body.meal),
        accessibility: readText(body.accessibility)
    };
    const { errors, fail } = collectErrors();

    checkText(fail, 'name', values.name, { required: true, max: LIMITS.guestName });
    checkText(fail, 'meal', values.meal, { max: LIMITS.meal });
    checkText(fail, 'accessibility', values.accessibility, { max: LIMITS.accessibility });
    const rsvp = readChoice(values.rsvp, RSVP_STATUSES);
    if (!rsvp) fail('rsvp', 'validation.choice');
    checkText(fail, 'diet', values.diet, { max: LIMITS.diet });
    checkText(fail, 'plus_one', values.plus_one, { max: LIMITS.plusOne });
    checkText(fail, 'group_name', values.group_name, { max: LIMITS.group });

    return {
        values,
        data: {
            name: values.name,
            rsvp,
            diet: optional(values.diet),
            plusOne: optional(values.plus_one),
            groupName: optional(values.group_name),
            meal: optional(values.meal),
            accessibility: optional(values.accessibility)
        },
        errors
    };
};

/**
 * @param {object} [body] - req.body
 * @returns {{values: object, data: {name: string, category: string, phone: string|null, email: string|null, website: string|null, status: string, notes: string|null}, errors: Array}}
 */
const validateVendor = (body = {}) => {
    const values = {
        name: readText(body.name),
        category: readText(body.category),
        phone: readText(body.phone),
        email: readText(body.email).toLowerCase(),
        website: readText(body.website),
        status: readText(body.status),
        notes: readText(body.notes)
    };
    const { errors, fail } = collectErrors();

    checkText(fail, 'name', values.name, { required: true, max: LIMITS.vendorName });
    const category = readChoice(values.category, VENDOR_CATEGORIES);
    if (!category) fail('category', 'validation.choice');
    checkText(fail, 'phone', values.phone, { max: LIMITS.phone });
    if (values.email.length > 0 && !isEmail(values.email)) fail('email', 'validation.email');
    if (values.website.length > 0 && !isHttpUrl(values.website)) fail('website', 'validation.url');
    const status = readChoice(values.status, VENDOR_STATUSES);
    if (!status) fail('status', 'validation.choice');
    checkText(fail, 'notes', values.notes, { max: LIMITS.notes });

    return {
        values,
        data: {
            name: values.name,
            category,
            phone: optional(values.phone),
            email: optional(values.email),
            website: optional(values.website),
            status,
            notes: optional(values.notes)
        },
        errors
    };
};

/**
 * @param {unknown} value - req.query.q
 * @returns {{query: string, errors: Array}} query '' means "no search".
 */
const validateSearch = (value) => {
    const query = readText(value);
    const { errors, fail } = collectErrors();
    checkText(fail, 'q', query, { max: LIMITS.search });
    return { query: errors.length === 0 ? query : '', errors };
};

export {
    LIMITS,
    validateBudgetLimit,
    validateBudgetCategory,
    validatePlanned,
    validateExpense,
    validateTask,
    validateGuest,
    validateVendor,
    validateSearch
};
