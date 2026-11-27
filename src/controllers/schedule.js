import { findVendors } from '../models/vendors.js';
import { findRooms } from '../models/layout.js';
import {
    createScheduleItem,
    deleteScheduleItem,
    findScheduleItem,
    findScheduleItems,
    updateScheduleItem
} from '../models/schedule.js';
import { findTemplates } from '../models/templates.js';
import { setFlash } from '../utils/flash.js';
import { isUuid } from '../validators/common.js';
import { validateScheduleItem } from '../validators/schedule.js';

const EMPTY_ITEM = {
    starts_at: '',
    ends_at: '',
    title: '',
    location: '',
    vendor_id: '',
    contact: '',
    notes: '',
    contingency: ''
};

/** Turns a schedule row into form values (nulls become empty strings). */
const toFormValues = (item) => Object.fromEntries(Object.keys(EMPTY_ITEM).map((field) => [field, item[field] ?? '']));

const renderSchedule = async (req, res, { status = 200, itemForm, templateForm } = {}) => {
    const [items, vendors, templates, rooms] = await Promise.all([
        findScheduleItems(req.wedding.id),
        findVendors(req.wedding.id),
        findTemplates(req.session.user.id, 'schedule'),
        findRooms(req.wedding.id)
    ]);
    const print = req.query.print === '1';
    // The printable version is black and white unless colour is asked for, on a white page.
    const colour = print && req.query.color === '1';
    res.status(status).render('schedule', {
        title: req.t('schedule.title'),
        bodyClass: print ? `print-view${colour ? '' : ' print-mono'}` : '',
        forceLightMode: print,
        print,
        colour,
        items,
        // "Save for offline" saves /layout; the other rooms are listed so they are saved too.
        offlineRooms: rooms.slice(1).map((room) => `/layout?room=${room.id}`),
        vendors,
        itemForm: itemForm ?? { values: EMPTY_ITEM, errors: [] },
        templates,
        templateForm: templateForm ?? { values: { name: '' }, errors: [] }
    });
};

const renderEditItem = async (req, res, { status = 200, id, values, errors = [] }) =>
    res.status(status).render('edit-schedule-item', {
        title: req.t('schedule.editTitle'),
        formAction: `/schedule/${id}/edit`,
        vendors: await findVendors(req.wedding.id),
        values,
        errors
    });

/** Validates against this wedding's own vendors, so a forged vendor id is refused. */
const validateForWedding = async (req) => {
    const vendors = await findVendors(req.wedding.id);
    return validateScheduleItem(
        req.body,
        vendors.map((vendor) => vendor.id)
    );
};

const showSchedule = (req, res) => renderSchedule(req, res);

const processNewItem = async (req, res) => {
    const { values, data, errors } = await validateForWedding(req);
    if (errors.length > 0) return renderSchedule(req, res, { status: 400, itemForm: { values, errors } });

    const item = await createScheduleItem(req.wedding.id, data);
    setFlash(req, 'success', 'schedule.added', { title: item.title });
    res.redirect('/schedule');
};

const showEditItem = async (req, res, next) => {
    const item = isUuid(req.params.id) ? await findScheduleItem(req.params.id, req.wedding.id) : null;
    if (!item) return next();
    renderEditItem(req, res, { id: item.id, values: toFormValues(item) });
};

const processEditItem = async (req, res, next) => {
    if (!isUuid(req.params.id)) return next();
    const { values, data, errors } = await validateForWedding(req);
    if (errors.length > 0) return renderEditItem(req, res, { status: 400, id: req.params.id, values, errors });

    const updated = await updateScheduleItem(req.params.id, req.wedding.id, data);
    if (!updated) return next();
    setFlash(req, 'success', 'schedule.saved', { title: updated.title });
    res.redirect('/schedule');
};

const processDeleteItem = async (req, res, next) => {
    if (!isUuid(req.params.id) || !(await deleteScheduleItem(req.params.id, req.wedding.id))) return next();
    setFlash(req, 'success', 'schedule.removed');
    res.redirect('/schedule');
};

export { renderSchedule, showSchedule, processNewItem, showEditItem, processEditItem, processDeleteItem };
