import { DEFAULT_TASK_PRIORITY, EXAMPLE_TASKS, TASK_CATEGORIES, TASK_PRIORITIES, TASK_STATUSES } from '../constants.js';
import { findMembers } from '../models/weddings.js';
import { PG_ERRORS } from '../models/db.js';
import {
    createTask,
    createTasksIfMissing,
    deleteTask,
    findTask,
    claimMilestone,
    findTaskProgress,
    findTasks,
    toggleTask,
    updateTask
} from '../models/checklist.js';
import { findTemplates } from '../models/templates.js';
import { setFlash } from '../utils/flash.js';
import { backTo } from '../utils/redirect.js';
import { toIsoDate } from '../utils/format.js';
import { todayIso } from '../utils/today.js';
import { celebrationFor } from '../utils/celebrate.js';
import { findCustomFields, saveCustomValues } from '../models/custom-fields.js';
import { readCustomForm } from './custom-fields.js';
import { customFormValues } from '../validators/custom-fields.js';
import { isUuid, readChoice } from '../validators/common.js';
import { validateTask } from '../validators/planning.js';

const EMPTY_TASK = {
    text: '',
    category: TASK_CATEGORIES[0],
    due_date: '',
    priority: DEFAULT_TASK_PRIORITY,
    assignee_id: ''
};
// ?who=me shows the signed-in person's tasks.
const WHO_FILTERS = Object.freeze(['me']);

/** The wedding's members as owner options: { id, name }. */
const ownerOptions = async (weddingId) =>
    (await findMembers(weddingId)).map((member) => ({ id: member.user_id, name: member.display_name || member.email }));
const DUPLICATE_ERROR = { field: 'text', key: 'checklist.duplicate' };

const renderChecklist = async (req, res, { status = 200, taskForm, templateForm } = {}) => {
    const weddingId = req.wedding.id;
    const filters = {
        category: readChoice(req.query.category, TASK_CATEGORIES),
        status: readChoice(req.query.status, TASK_STATUSES),
        priority: readChoice(req.query.priority, TASK_PRIORITIES),
        who: readChoice(req.query.who, WHO_FILTERS)
    };
    const assigneeId = filters.who === 'me' ? req.session.user.id : null;
    const [tasks, progress, templates, owners, customFields] = await Promise.all([
        findTasks(weddingId, { ...filters, assigneeId }),
        findTaskProgress(weddingId),
        findTemplates(req.session.user.id, 'checklist'),
        ownerOptions(weddingId),
        findCustomFields(weddingId, 'task')
    ]);

    res.status(status).render('checklist', {
        title: req.t('checklist.title'),
        tasks,
        progress,
        filters,
        categories: TASK_CATEGORIES,
        priorities: TASK_PRIORITIES,
        owners,
        customFields,
        today: todayIso(),
        taskForm: taskForm ?? { values: EMPTY_TASK, errors: [] },
        templates,
        templateForm: templateForm ?? { values: { name: '' }, errors: [] }
    });
};

const renderEditTask = async (req, res, { status = 200, id, values, errors = [] }) =>
    res.status(status).render('edit-task', {
        title: req.t('checklist.editTitle'),
        formAction: `/checklist/${id}/edit`,
        categories: TASK_CATEGORIES,
        priorities: TASK_PRIORITIES,
        owners: await ownerOptions(req.wedding.id),
        customFields: await findCustomFields(req.wedding.id, 'task'),
        values,
        errors
    });

/** Validates a task form against this wedding's members, with its custom fields. */
const readTaskForm = async (req) => {
    const task = validateTask(
        req.body,
        (await ownerOptions(req.wedding.id)).map((owner) => owner.id)
    );
    const custom = await readCustomForm(req, 'task');
    return {
        values: { ...task.values, custom: custom.values },
        data: task.data,
        custom: custom.data,
        errors: [...task.errors, ...custom.errors]
    };
};

const showChecklist = (req, res) => renderChecklist(req, res);

const processNewTask = async (req, res) => {
    const { values, data, custom, errors } = await readTaskForm(req);
    if (errors.length === 0) {
        try {
            const task = await createTask(req.wedding.id, data);
            await saveCustomValues('task', task.id, req.wedding.id, custom);
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
        values: {
            text: task.text,
            category: task.category,
            due_date: toIsoDate(task.due_date),
            priority: task.priority,
            assignee_id: task.assignee_id ?? '',
            custom: customFormValues(task.custom)
        }
    });
};

const processEditTask = async (req, res, next) => {
    if (!isUuid(req.params.id)) return next();
    const { values, data, custom, errors } = await readTaskForm(req);
    if (errors.length === 0) {
        try {
            const updated = await updateTask(req.params.id, req.wedding.id, data);
            if (!updated) return next();
            await saveCustomValues('task', req.params.id, req.wedding.id, custom);
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
    // Ticking a task off is celebrated on the next page: confetti (partials/celebrate.ejs) and a
    // notice, which fades, can be dismissed and is announced like every other notice.
    if (task.done) {
        const reached = celebrationFor(await findTaskProgress(req.wedding.id));
        const isNew = reached.milestone !== null && (await claimMilestone(req.wedding.id, reached.milestone));
        const celebration = { ...reached, milestone: isNew ? reached.milestone : null };
        req.session.celebrate = { ...celebration, weddingId: req.wedding.id };
        const headline = req.t(
            celebration.milestone ? `celebrate.milestone${celebration.milestone}` : 'celebrate.nice'
        );
        setFlash(req, 'success', 'celebrate.flash', {
            headline,
            done: celebration.done,
            total: celebration.total,
            pct: celebration.pct
        });
    }
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
    renderChecklist,
    showChecklist,
    processNewTask,
    showEditTask,
    processEditTask,
    processToggleTask,
    processDeleteTask,
    processExampleTasks
};
