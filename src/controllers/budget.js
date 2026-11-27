import { BUDGET_CATEGORIES } from '../constants.js';
import { createExpense, deleteExpense, findExpenses, saveBudgetLimit } from '../models/budget.js';
import {
    findBudgetCategoryTotals,
    findContractRows,
    findDuplicateExpenseHints,
    findMoneySummary
} from '../models/payments.js';
import { setFlash } from '../utils/flash.js';
import { backTo } from '../utils/redirect.js';
import { isUuid, readChoice } from '../validators/common.js';
import { validateBudgetLimit, validateExpense } from '../validators/planning.js';

const EMPTY_EXPENSE = { name: '', category: BUDGET_CATEGORIES[0], amount: '' };

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{status?: number, limitForm?: object, expenseForm?: object}} [forms]
 */
const renderBudget = async (req, res, { status = 200, limitForm, expenseForm } = {}) => {
    const weddingId = req.wedding.id;
    const category = readChoice(req.query.category, BUDGET_CATEGORIES);
    const [money, expenses, categoryTotals, contracts, duplicateHint] = await Promise.all([
        findMoneySummary(weddingId),
        findExpenses(weddingId, category),
        findBudgetCategoryTotals(weddingId),
        findContractRows(weddingId),
        findDuplicateExpenseHints(weddingId)
    ]);
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
        categoryTotals,
        categories: BUDGET_CATEGORIES,
        activeCategory: category,
        limitForm: limitForm ?? { values: { total: limit > 0 ? String(limit) : '' }, errors: [] },
        expenseForm: expenseForm ?? { values: EMPTY_EXPENSE, errors: [] }
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
    const { values, data, errors } = validateExpense(req.body);
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

export { showBudget, processBudgetLimit, processNewExpense, processDeleteExpense };
