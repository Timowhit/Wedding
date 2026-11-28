import {
    createAppointment,
    deleteAppointment,
    findAppointment,
    findAppointments,
    updateAppointment
} from '../models/appointments.js';
import { setFlash } from '../utils/flash.js';
import { todayIso } from '../utils/today.js';
import { validateAppointment } from '../validators/appointments.js';
import { isUuid } from '../validators/common.js';

const EMPTY_APPOINTMENT = {
    title: '',
    starts_on: '',
    starts_at: '',
    ends_at: '',
    location: '',
    attendees: '',
    notes: ''
};

/** Turns an appointment row into form values (nulls become empty strings). */
const toFormValues = (row) =>
    Object.fromEntries(Object.keys(EMPTY_APPOINTMENT).map((field) => [field, row[field] ?? '']));

const renderAppointments = async (req, res, { status = 200, form } = {}) => {
    const { upcoming, past } = await findAppointments(req.wedding.id, todayIso());
    res.status(status).render('appointments', {
        title: req.t('appointments.title'),
        upcoming,
        past,
        form: form ?? { values: EMPTY_APPOINTMENT, errors: [] }
    });
};

const renderEdit = (req, res, { status = 200, id, values, errors = [] }) =>
    res.status(status).render('edit-appointment', {
        title: req.t('appointments.editTitle'),
        formAction: `/appointments/${id}/edit`,
        values,
        errors
    });

const showAppointments = (req, res) => renderAppointments(req, res);

const processNewAppointment = async (req, res) => {
    const { values, data, errors } = validateAppointment(req.body);
    if (errors.length > 0) return renderAppointments(req, res, { status: 400, form: { values, errors } });
    const appointment = await createAppointment(req.wedding.id, data);
    setFlash(req, 'success', 'appointments.added', { title: appointment.title });
    res.redirect('/appointments');
};

const showEditAppointment = async (req, res, next) => {
    const appointment = isUuid(req.params.id) ? await findAppointment(req.params.id, req.wedding.id) : null;
    if (!appointment) return next();
    renderEdit(req, res, { id: appointment.id, values: toFormValues(appointment) });
};

const processEditAppointment = async (req, res, next) => {
    if (!isUuid(req.params.id)) return next();
    const { values, data, errors } = validateAppointment(req.body);
    if (errors.length > 0) return renderEdit(req, res, { status: 400, id: req.params.id, values, errors });
    const updated = await updateAppointment(req.params.id, req.wedding.id, data);
    if (!updated) return next();
    setFlash(req, 'success', 'appointments.saved', { title: updated.title });
    res.redirect('/appointments');
};

const processDeleteAppointment = async (req, res, next) => {
    if (!isUuid(req.params.id) || !(await deleteAppointment(req.params.id, req.wedding.id))) return next();
    setFlash(req, 'success', 'appointments.removed');
    res.redirect('/appointments');
};

export {
    showAppointments,
    processNewAppointment,
    showEditAppointment,
    processEditAppointment,
    processDeleteAppointment
};
