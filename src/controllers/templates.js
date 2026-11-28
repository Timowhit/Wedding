import { MAX_TEMPLATE_ITEMS, MAX_TEMPLATES_PER_USER } from '../constants.js';
import { findBudgetCategories } from '../models/budget.js';
import { findCustomFields } from '../models/custom-fields.js';
import { findVendors } from '../models/vendors.js';
import { findTasks } from '../models/checklist.js';
import { PG_ERRORS } from '../models/db.js';
import { findScheduleItems } from '../models/schedule.js';
import {
    addChecklistItems,
    addScheduleItems,
    applyWeddingTemplate,
    countTemplates,
    deleteTemplate,
    findTemplate,
    findTemplates,
    renameTemplate,
    saveTemplate
} from '../models/templates.js';
import { setFlash } from '../utils/flash.js';
import { backTo } from '../utils/redirect.js';
import { toIsoDate } from '../utils/format.js';
import { isUuid } from '../validators/common.js';
import {
    checklistItemsFrom,
    dueDateFrom,
    normaliseChecklistItems,
    normaliseScheduleItems,
    scheduleItemsFrom,
    validateTemplateName,
    weddingTemplateFrom,
    weddingTemplateSize
} from '../validators/templates.js';
import { renderChecklist } from './checklist.js';
import { renderSchedule } from './schedule.js';

/** Per kind: the page it lives on, how to re-render that page, and how to read the wedding's items. */
const KINDS = Object.freeze({
    checklist: {
        page: '/checklist',
        render: renderChecklist,
        itemsFrom: async (wedding) =>
            checklistItemsFrom(await findTasks(wedding.id), toIsoDate(wedding.wedding_date) || null)
    },
    schedule: {
        page: '/schedule',
        render: renderSchedule,
        itemsFrom: async (wedding) => scheduleItemsFrom(await findScheduleItems(wedding.id))
    }
});

/** POST /checklist/template and /schedule/template: save the active wedding's list. */
const processSaveTemplate = (kind) => async (req, res) => {
    const { page, render, itemsFrom } = KINDS[kind];
    const { values, data, errors } = validateTemplateName(req.body);
    if (errors.length > 0) return render(req, res, { status: 400, templateForm: { values, errors } });

    const userId = req.session.user.id;
    const items = await itemsFrom(req.wedding);
    const existing = (await findTemplates(userId, kind)).some((template) => template.name === data.name);
    if (items.length === 0) {
        setFlash(req, 'error', 'templates.nothingToSave');
    } else if (items.length > MAX_TEMPLATE_ITEMS) {
        setFlash(req, 'error', 'templates.tooManyItems', { max: MAX_TEMPLATE_ITEMS });
    } else if (!existing && (await countTemplates(userId)) >= MAX_TEMPLATES_PER_USER) {
        setFlash(req, 'error', 'templates.limit', { max: MAX_TEMPLATES_PER_USER });
    } else {
        const { replaced } = await saveTemplate(userId, kind, data.name, items);
        setFlash(req, 'success', replaced ? 'templates.replaced' : 'templates.saved', { name: data.name });
    }
    res.redirect(backTo(req, page));
};

/** POST /checklist/from-template and /schedule/from-template: add a template's items to the active wedding. */
const processApplyTemplate = (kind) => async (req, res, next) => {
    const template = isUuid(req.body?.template_id)
        ? await findTemplate(req.body.template_id, req.session.user.id)
        : null;
    if (!template || template.kind !== kind) return next();

    if (kind === 'checklist') {
        const weddingIso = toIsoDate(req.wedding.wedding_date) || null;
        const items = normaliseChecklistItems(template.items);
        const { added, skipped } = await addChecklistItems(
            req.wedding.id,
            items.map((item) => ({ ...item, dueDate: dueDateFrom(weddingIso, item.daysBefore) }))
        );
        const needsDate = !weddingIso && items.some((item) => item.daysBefore !== null);
        const key = needsDate
            ? 'templates.appliedNoDate'
            : skipped > 0
              ? 'templates.appliedSkipped'
              : added === 1
                ? 'templates.appliedOne'
                : 'templates.applied';
        setFlash(req, 'success', key, { count: added, skipped, name: template.name });
    } else {
        const added = await addScheduleItems(req.wedding.id, normaliseScheduleItems(template.items));
        const key = added === 1 ? 'templates.appliedScheduleOne' : 'templates.appliedSchedule';
        setFlash(req, 'success', key, { count: added, name: template.name });
    }
    res.redirect(backTo(req, KINDS[kind].page));
};

const renderTemplates = async (req, res, { status = 200, renameForm, weddingForm } = {}) => {
    const templates = await findTemplates(req.session.user.id);
    res.status(status).render('templates', {
        title: req.t('templates.title'),
        groups: ['wedding', ...Object.keys(KINDS)].map((kind) => ({
            kind,
            templates: templates.filter((t) => t.kind === kind)
        })),
        renameForm: renameForm ?? null,
        weddingForm: weddingForm ?? { values: { name: '' }, errors: [] }
    });
};

/** Everything a whole-wedding template keeps, read from a wedding. */
const weddingItemsFrom = async (wedding) => {
    const [tasks, schedule, categories, vendors, fields] = await Promise.all([
        findTasks(wedding.id),
        findScheduleItems(wedding.id),
        findBudgetCategories(wedding.id),
        findVendors(wedding.id),
        findCustomFields(wedding.id)
    ]);
    return weddingTemplateFrom({
        tasks,
        weddingIso: toIsoDate(wedding.wedding_date) || null,
        schedule,
        categories,
        vendors,
        fields
    });
};

/** POST /templates/wedding: saves the active wedding as a whole-wedding template. */
const processSaveWeddingTemplate = async (req, res) => {
    const { values, data, errors } = validateTemplateName(req.body);
    if (errors.length > 0) return renderTemplates(req, res, { status: 400, weddingForm: { values, errors } });
    const userId = req.session.user.id;
    const items = await weddingItemsFrom(req.wedding);
    const existing = (await findTemplates(userId, 'wedding')).some((template) => template.name === data.name);
    if (weddingTemplateSize(items) === 0) {
        setFlash(req, 'error', 'templates.nothingToSave');
    } else if (!existing && (await countTemplates(userId)) >= MAX_TEMPLATES_PER_USER) {
        setFlash(req, 'error', 'templates.limit', { max: MAX_TEMPLATES_PER_USER });
    } else {
        const { replaced } = await saveTemplate(userId, 'wedding', data.name, items);
        setFlash(req, 'success', replaced ? 'templates.replaced' : 'templates.saved', { name: data.name });
    }
    res.redirect('/templates');
};

/** POST /templates/:id/apply: adds one of the person's whole-wedding templates to the active wedding. */
const processApplyWeddingTemplate = async (req, res, next) => {
    const template = isUuid(req.params.id) ? await findTemplate(req.params.id, req.session.user.id) : null;
    if (!template || template.kind !== 'wedding') return next();
    await applyWeddingTemplate(req.wedding, template.items);
    setFlash(req, 'success', 'templates.appliedWedding', { name: template.name, wedding: req.wedding.name });
    res.redirect('/');
};

/** GET /templates: the person's templates, by kind. */
const showTemplates = (req, res) => renderTemplates(req, res);

const processRenameTemplate = async (req, res, next) => {
    const template = isUuid(req.params.id) ? await findTemplate(req.params.id, req.session.user.id) : null;
    if (!template) return next();
    const { values, data, errors } = validateTemplateName(req.body);
    if (errors.length > 0)
        return renderTemplates(req, res, { status: 400, renameForm: { id: template.id, values, errors } });
    try {
        await renameTemplate(template.id, req.session.user.id, data.name);
    } catch (error) {
        if (error.code !== PG_ERRORS.UNIQUE_VIOLATION) throw error;
        return renderTemplates(req, res, {
            status: 400,
            renameForm: { id: template.id, values, errors: [{ field: 'name', key: 'templates.nameTaken' }] }
        });
    }
    setFlash(req, 'success', 'templates.renamed', { name: data.name });
    res.redirect('/templates');
};

const processDeleteTemplate = async (req, res, next) => {
    if (!isUuid(req.params.id) || !(await deleteTemplate(req.params.id, req.session.user.id))) return next();
    setFlash(req, 'success', 'templates.deleted');
    res.redirect('/templates');
};

export {
    processSaveTemplate,
    processApplyTemplate,
    showTemplates,
    processRenameTemplate,
    processDeleteTemplate,
    processSaveWeddingTemplate,
    processApplyWeddingTemplate
};
