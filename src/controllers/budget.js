import { BUDGET_CATEGORIES, FALLBACK_BUDGET_CATEGORY, MAX_BUDGET_CATEGORIES } from '../constants.js';
import { SUPPORTED_LANGUAGES, translate } from '../i18n/index.js';
import {
    addBudgetCategory,
    addSuggestedCategories,
    createExpense,
    deleteBudgetCategory,
    deleteExpense,
    findBudgetCategories,
    findExpenses,
    saveBudgetLimit,
    setCategoryPlanned
} from '../models/budget.js';
import {
    findBudgetCategoryTotals,
    findContractRows,
    findDuplicateExpenseHints,
    findMoneySummary
} from '../models/payments.js';
import { setFlash } from '../utils/flash.js';
import { backTo } from '../utils/redirect.js';
import { isUuid, readChoice } from '../validators/common.js';
import {
    validateBudgetCategory,
    validateBudgetLimit,
    validateExpense,
    validatePlanned
} from '../validators/planning.js';

const EMPTY_EXPENSE = { name: '', category: BUDGET_CATEGORIES[0], amount: '' };
const EMPTY_CATEGORY = { name: '', planned: '' };

/** How a category value reads: suggested ones are translated, the wedding's own are shown as typed. */
const labelFor = (req) => (value) => (BUDGET_CATEGORIES.includes(value) ? req.t(`budgetCategory.${value}`) : value);

/**
 * The suggested category a typed name means, in any language ("venue", "Lugar"), or null. Typing
 * one brings it back rather than adding a look-alike of the wedding's own.
 */
const suggestedKeyFor = (name) => {
    const typed = name.toLowerCase();
    return (
        BUDGET_CATEGORIES.find((key) =>
            [key, ...SUPPORTED_LANGUAGES.map((lang) => translate(lang, `budgetCategory.${key}`))].some(
                (label) => label.toLowerCase() === typed
            )
        ) ?? null
    );
};

/**
 * One row per category with money or a plan, for "By category": the wedding's categories plus
 * any value that only vendor contracts or older expenses still use.
 */
const categoryRows = (categories, totals, label) => {
    const spent = new Map(totals.map((row) => [row.category, row.total]));
    const rows = categories.map((category) => ({
        value: category.value,
        label: label(category.value),
        planned: category.planned,
        total: spent.get(category.value) ?? 0
    }));
    const known = new Set(rows.map((row) => row.value));
    for (const row of totals) {
        if (!known.has(row.category))
            rows.push({ value: row.category, label: label(row.category), planned: null, total: row.total });
    }
    return rows
        .filter((row) => row.total > 0 || row.planned > 0)
        .sort((a, b) => b.total - a.total || (b.planned ?? 0) - (a.planned ?? 0) || a.label.localeCompare(b.label));
};

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{status?: number, limitForm?: object, expenseForm?: object, categoryForm?: object, planForm?: object}} [forms]
 *   planForm: {id, values, errors} for the category whose planned amount failed.
 */
const renderBudget = async (req, res, { status = 200, limitForm, expenseForm, categoryForm, planForm } = {}) => {
    const weddingId = req.wedding.id;
    const [money, categories, categoryTotals, contracts, duplicateHint] = await Promise.all([
        findMoneySummary(weddingId),
        findBudgetCategories(weddingId),
        findBudgetCategoryTotals(weddingId),
        findContractRows(weddingId),
        findDuplicateExpenseHints(weddingId)
    ]);
    const label = labelFor(req);
    const values = categories.map((category) => category.value);
    const category = readChoice(req.query.category, [...values, ...categoryTotals.map((row) => row.category)]);
    const expenses = await findExpenses(weddingId, category);
    const { limit, committed } = money;
    const percentOf = (amount) => (limit > 0 ? Math.min(Math.round((amount / limit) * 100), 100) : 0);

    res.status(status).render('budget', {
        title: req.t('budget.title'),
        summary: {
            ...money,
            pct: percentOf(committed),
            paidPct: percentOf(money.paid)
        },
        contracts,
        duplicateHint,
        expenses,
        categoryRows: categoryRows(categories, categoryTotals, label),
        categories: categories.map((row) => ({
            ...row,
            label: label(row.value),
            deletable: row.value !== FALLBACK_BUDGET_CATEGORY
        })),
        categoryLabel: label,
        missingSuggested: BUDGET_CATEGORIES.some((key) => !values.includes(key)),
        activeCategory: category,
        limitForm: limitForm ?? { values: { total: limit > 0 ? String(limit) : '' }, errors: [] },
        expenseForm: expenseForm ?? { values: EMPTY_EXPENSE, errors: [] },
        categoryForm: categoryForm ?? { values: EMPTY_CATEGORY, errors: [] },
        planForm: planForm ?? null
    });
};

const showBudget = (req, res) => renderBudget(req, res);

const processBudgetLimit = async (req, res) => {
    const { values, data, errors } = validateBudgetLimit(req.body);
    if (errors.length > 0) return renderBudget(req, res, { status: 400, limitForm: { values, errors } });

    await saveBudgetLimit(req.wedding.id, data.total);
    setFlash(req, 'success', 'budget.limitSaved');
    res.redirect(backTo(req, '/budget'));
};

const processNewExpense = async (req, res) => {
    const categories = await findBudgetCategories(req.wedding.id);
    const { values, data, errors } = validateExpense(
        req.body,
        categories.map((category) => category.value)
    );
    if (errors.length > 0) return renderBudget(req, res, { status: 400, expenseForm: { values, errors } });

    const expense = await createExpense(req.wedding.id, data);
    setFlash(req, 'success', 'budget.expenseAdded', { name: expense.name });
    res.redirect(backTo(req, '/budget'));
};

const processDeleteExpense = async (req, res, next) => {
    if (!isUuid(req.params.id) || !(await deleteExpense(req.params.id, req.wedding.id))) return next();
    setFlash(req, 'success', 'budget.expenseRemoved');
    res.redirect(backTo(req, '/budget'));
};

/** POST /budget/categories: one of the wedding's own, or a suggested one typed by name. */
const processNewCategory = async (req, res) => {
    const { values, data, errors } = validateBudgetCategory(req.body);
    if (errors.length === 0) {
        const builtinKey = suggestedKeyFor(data.name);
        const outcome = await addBudgetCategory(req.wedding.id, {
            builtinKey,
            name: builtinKey ? null : data.name,
            planned: data.planned
        });
        if (outcome === 'added') {
            setFlash(req, 'success', 'budget.categoryAdded', {
                name: builtinKey ? labelFor(req)(builtinKey) : data.name
            });
            return res.redirect(backTo(req, '/budget'));
        }
        errors.push(
            outcome === 'exists'
                ? { field: 'name', key: 'budget.categoryTaken' }
                : { field: 'name', key: 'budget.categoryLimit', vars: { max: MAX_BUDGET_CATEGORIES } }
        );
    }
    renderBudget(req, res, { status: 400, categoryForm: { values, errors } });
};

/** POST /budget/categories/suggested: brings back the suggested categories that were deleted. */
const processSuggestedCategories = async (req, res) => {
    const count = await addSuggestedCategories(req.wedding.id);
    setFlash(req, 'success', 'budget.suggestedAdded', { count });
    res.redirect(backTo(req, '/budget'));
};

/** POST /budget/categories/:id/plan: sets or clears a category's planned amount. */
const processCategoryPlan = async (req, res, next) => {
    if (!isUuid(req.params.id)) return next();
    const { values, data, errors } = validatePlanned(req.body);
    if (errors.length > 0) {
        const known = (await findBudgetCategories(req.wedding.id)).some((row) => row.id === req.params.id);
        if (!known) return next();
        return renderBudget(req, res, { status: 400, planForm: { id: req.params.id, values, errors } });
    }
    if (!(await setCategoryPlanned(req.params.id, req.wedding.id, data.planned))) return next();
    setFlash(req, 'success', 'budget.plannedSaved');
    res.redirect(backTo(req, '/budget'));
};

/** POST /budget/categories/:id/delete: its expenses move to Other. */
const processDeleteCategory = async (req, res, next) => {
    const deleted = isUuid(req.params.id) ? await deleteBudgetCategory(req.params.id, req.wedding.id) : null;
    if (!deleted) return next();
    const label = labelFor(req);
    setFlash(req, 'success', 'budget.categoryDeleted', {
        name: label(deleted.value),
        other: label(FALLBACK_BUDGET_CATEGORY),
        count: deleted.moved
    });
    res.redirect(backTo(req, '/budget'));
};

export {
    showBudget,
    processBudgetLimit,
    processNewExpense,
    processDeleteExpense,
    processNewCategory,
    processSuggestedCategories,
    processCategoryPlan,
    processDeleteCategory
};
