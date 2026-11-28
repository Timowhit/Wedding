import { checkText, collectErrors, isValidDate, readText } from './common.js';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const FIELDS = ['title', 'starts_on', 'starts_at', 'ends_at', 'location', 'attendees', 'notes'];
const LIMITS = Object.freeze({ title: 200, location: 200, attendees: 500, notes: 2000 });

/**
 * One appointment: a title and a date, with optional times, place, attendees and notes.
 * An end time needs a start time and can't be before it.
 * @param {object} [body] - req.body
 * @returns {{values: object, data: {title: string, startsOn: string, startsAt: string|null, endsAt: string|null, location: string|null, attendees: string|null, notes: string|null}, errors: Array}}
 */
const validateAppointment = (body = {}) => {
    const values = Object.fromEntries(FIELDS.map((field) => [field, readText(body[field])]));
    const { errors, fail } = collectErrors();

    checkText(fail, 'title', values.title, { required: true, max: LIMITS.title });
    if (values.starts_on.length === 0) fail('starts_on', 'validation.required');
    else if (!isValidDate(values.starts_on)) fail('starts_on', 'validation.date');
    const startOk = values.starts_at.length > 0 && TIME_PATTERN.test(values.starts_at);
    if (values.starts_at.length > 0 && !startOk) fail('starts_at', 'validation.time');
    if (values.ends_at.length > 0) {
        if (!TIME_PATTERN.test(values.ends_at)) fail('ends_at', 'validation.time');
        else if (values.starts_at.length === 0) fail('starts_at', 'appointments.needStart');
        // "HH:MM" strings compare correctly as text.
        else if (startOk && values.ends_at < values.starts_at) fail('ends_at', 'schedule.endBeforeStart');
    }
    for (const field of ['location', 'attendees', 'notes'])
        checkText(fail, field, values[field], { max: LIMITS[field] });

    const orNull = (text) => (text.length === 0 ? null : text);
    return {
        values,
        data: {
            title: values.title,
            startsOn: values.starts_on,
            startsAt: orNull(values.starts_at),
            endsAt: orNull(values.ends_at),
            location: orNull(values.location),
            attendees: orNull(values.attendees),
            notes: orNull(values.notes)
        },
        errors
    };
};

export { validateAppointment };
