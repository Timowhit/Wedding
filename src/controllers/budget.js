import { BUDGET_CATEGORIES } from '../constants.js';
import {
    createExpense,
    deleteExpense,
    findBudgetLimit,
    findCategoryTotals,
    findExpenses,
    findTotalSpent,
    saveBudgetLimit
} from '../models/budget.js';
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
    const [limit, spent, expenses, categoryTotals] = await Promise.all([
        findBudgetLimit(weddingId),
        findTotalSpent(weddingId),
        findExpenses(weddingId, category),
        findCategoryTotals(weddingId)
    ]);

    res.status(status).render('budget', {
        title: req.t('budget.title'),
        summary: {
            limit,
            spent,
            remaining: limit - spent,
            pct: limit > 0 ? Math.min(Math.round((spent / limit) * 100), 100) : 0,
            over: limit > 0 && spent > limit
        },
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
