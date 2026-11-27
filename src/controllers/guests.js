import { RSVP_STATUSES } from '../constants.js';
import {
    createGuest,
    deleteGuest,
    findGuest,
    findGuestStats,
    findGuests,
    findMealOptions,
    findMealSummary,
    updateGuest,
    updateGuestRsvp
} from '../models/guests.js';
import { setFlash } from '../utils/flash.js';
import { backTo } from '../utils/redirect.js';
import { isUuid, readChoice } from '../validators/common.js';
import { validateGuest } from '../validators/planning.js';

const EMPTY_GUEST = {
    name: '',
    rsvp: 'Pending',
    diet: '',
    plus_one: '',
    group_name: '',
    meal: '',
    accessibility: ''
};

const renderGuests = async (req, res, { status = 200, guestForm } = {}) => {
    const rsvp = readChoice(req.query.rsvp, RSVP_STATUSES);
    const [guests, stats, mealSummary, mealOptions] = await Promise.all([
        findGuests(req.wedding.id, rsvp),
        findGuestStats(req.wedding.id),
        findMealSummary(req.wedding.id),
        findMealOptions(req.wedding.id)
    ]);

    res.status(status).render('guests', {
        title: req.t('guests.title'),
        guests,
        stats,
        statuses: RSVP_STATUSES,
        activeRsvp: rsvp,
        mealSummary,
        mealOptions,
        guestForm: guestForm ?? { values: EMPTY_GUEST, errors: [] }
    });
};

const renderEditGuest = async (req, res, { status = 200, id, values, errors = [] }) =>
    res.status(status).render('edit-guest', {
        title: req.t('guests.editTitle'),
        formAction: `/guests/${id}/edit`,
        statuses: RSVP_STATUSES,
        mealOptions: await findMealOptions(req.wedding.id),
        values,
        errors
    });

const showGuests = (req, res) => renderGuests(req, res);

const processNewGuest = async (req, res) => {
    const { values, data, errors } = validateGuest(req.body);
    if (errors.length > 0) return renderGuests(req, res, { status: 400, guestForm: { values, errors } });

    const guest = await createGuest(req.wedding.id, data);
    setFlash(req, 'success', 'guests.added', { name: guest.name });
    res.redirect(backTo(req, '/guests'));
};

const showEditGuest = async (req, res, next) => {
    const guest = isUuid(req.params.id) ? await findGuest(req.params.id, req.wedding.id) : null;
    if (!guest) return next();
    renderEditGuest(req, res, {
        id: guest.id,
        values: {
            name: guest.name,
            rsvp: guest.rsvp,
            diet: guest.diet ?? '',
            plus_one: guest.plus_one ?? '',
            meal: guest.meal ?? '',
            accessibility: guest.accessibility ?? '',
            group_name: guest.group_name ?? ''
        }
    });
};

const processEditGuest = async (req, res, next) => {
    if (!isUuid(req.params.id)) return next();
    const { values, data, errors } = validateGuest(req.body);
    if (errors.length > 0) return renderEditGuest(req, res, { status: 400, id: req.params.id, values, errors });

    const updated = await updateGuest(req.params.id, req.wedding.id, data);
    if (!updated) return next();
    setFlash(req, 'success', 'guests.saved', { name: updated.name });
    res.redirect(backTo(req, '/guests'));
};

/** The RSVP picker on each row: sets the chosen status. */
const processSetRsvp = async (req, res, next) => {
    if (!isUuid(req.params.id)) return next();
    const rsvp = readChoice(req.body?.rsvp, RSVP_STATUSES);
    if (!rsvp) {
        setFlash(req, 'error', 'validation.choice');
        return res.redirect(backTo(req, '/guests'));
    }
    const guest = await updateGuestRsvp(req.params.id, req.wedding.id, rsvp);
    if (!guest) return next();
    setFlash(req, 'success', 'guests.rsvpSaved', { name: guest.name });
    res.redirect(backTo(req, '/guests'));
};

const processDeleteGuest = async (req, res, next) => {
    if (!isUuid(req.params.id) || !(await deleteGuest(req.params.id, req.wedding.id))) return next();
    setFlash(req, 'success', 'guests.removed');
    res.redirect(backTo(req, '/guests'));
};

export { showGuests, processNewGuest, showEditGuest, processEditGuest, processSetRsvp, processDeleteGuest };
