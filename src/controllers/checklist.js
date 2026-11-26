import { EXAMPLE_TASKS, TASK_CATEGORIES, TASK_STATUSES } from '../constants.js';
import { PG_ERRORS } from '../models/db.js';
import {
    createTask,
    createTasksIfMissing,
    deleteTask,
    findTask,
    findTaskProgress,
    findTasks,
    toggleTask,
    updateTask
} from '../models/checklist.js';
import { setFlash } from '../utils/flash.js';
import { backTo } from '../utils/redirect.js';
import { toIsoDate } from '../utils/format.js';
import { isUuid, readChoice } from '../validators/common.js';
import { validateTask } from '../validators/planning.js';

const EMPTY_TASK = { text: '', category: TASK_CATEGORIES[0], due_date: '' };
const DUPLICATE_ERROR = { field: 'text', key: 'checklist.duplicate' };

const renderChecklist = async (req, res, { status = 200, taskForm } = {}) => {
    const weddingId = req.wedding.id;
    const filters = {
        category: readChoice(req.query.category, TASK_CATEGORIES),
        status: readChoice(req.query.status, TASK_STATUSES)
    };
    const [tasks, progress] = await Promise.all([findTasks(weddingId, filters), findTaskProgress(weddingId)]);

    res.status(status).render('checklist', {
        title: req.t('checklist.title'),
        tasks,
        progress,
        filters,
        categories: TASK_CATEGORIES,
        today: toIsoDate(new Date()),
        taskForm: taskForm ?? { values: EMPTY_TASK, errors: [] }
    });
};

const renderEditTask = (req, res, { status = 200, id, values, errors = [] }) =>
    res.status(status).render('edit-task', {
        title: req.t('checklist.editTitle'),
        formAction: `/checklist/${id}/edit`,
        categories: TASK_CATEGORIES,
        values,
        errors
    });

const showChecklist = (req, res) => renderChecklist(req, res);

const processNewTask = async (req, res) => {
    const { values, data, errors } = validateTask(req.body);
    if (errors.length === 0) {
        try {
            await createTask(req.wedding.id, data);
            setFlash(req, 'success', 'checklist.taskAdded');
            return res.redirect(backTo(req, '/checklist'));
        } catch (err) {
            if (err.code !== PG_ERRORS.UNIQUE_VIOLATION) throw err;
            errors.push(DUPLICATE_ERROR);
        }
    }
    renderChecklist(req, res, { status: 400, taskForm: { values, errors } });
};

const showEditTask = async (req, res, next) => {
    const task = isUuid(req.params.id) ? await findTask(req.params.id, req.wedding.id) : null;
    if (!task) return next();
    renderEditTask(req, res, {
        id: task.id,
        values: { text: task.text, category: task.category, due_date: toIsoDate(task.due_date) }
    });
};

const processEditTask = async (req, res, next) => {
    if (!isUuid(req.params.id)) return next();
    const { values, data, errors } = validateTask(req.body);
    if (errors.length === 0) {
        try {
            const updated = await updateTask(req.params.id, req.wedding.id, data);
            if (!updated) return next();
            setFlash(req, 'success', 'checklist.taskSaved');
            return res.redirect(backTo(req, '/checklist'));
        } catch (err) {
            if (err.code !== PG_ERRORS.UNIQUE_VIOLATION) throw err;
            errors.push(DUPLICATE_ERROR);
        }
    }
    renderEditTask(req, res, { status: 400, id: req.params.id, values, errors });
};

const processToggleTask = async (req, res, next) => {
    const task = isUuid(req.params.id) ? await toggleTask(req.params.id, req.wedding.id) : null;
    if (!task) return next();
    res.redirect(backTo(req, '/checklist'));
};

const processDeleteTask = async (req, res, next) => {
    if (!isUuid(req.params.id) || !(await deleteTask(req.params.id, req.wedding.id))) return next();
    setFlash(req, 'success', 'checklist.taskRemoved');
    res.redirect(backTo(req, '/checklist'));
};

/** Adds the example tasks (in the current language), skipping any the wedding already has. */
const processExampleTasks = async (req, res) => {
    const tasks = EXAMPLE_TASKS.map(({ key, category }) => ({ text: req.t(key), category }));
    const added = await createTasksIfMissing(req.wedding.id, tasks);
    if (added > 0) setFlash(req, 'success', 'checklist.examplesAdded', { count: added });
    else setFlash(req, 'info', 'checklist.examplesNone');
    res.redirect(backTo(req, '/checklist'));
};

export {
    showChecklist,
    processNewTask,
    showEditTask,
    processEditTask,
    processToggleTask,
    processDeleteTask,
    processExampleTasks
};
