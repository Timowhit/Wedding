import { checkText, collectErrors, readText } from './common.js';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const LIMITS = Object.freeze({ title: 200, location: 200, contact: 200, notes: 2000, contingency: 2000 });

/**
 * One event-day schedule item.
 * @param {object} [body] - req.body
 * @param {string[]} vendorIds - Ids of this wedding's vendors; any other vendor id is refused.
 * @returns {{values: object, data: {startsAt: string, endsAt: string|null, title: string, location: string|null, vendorId: string|null, contact: string|null, notes: string|null, contingency: string|null}, errors: Array}}
 */
const validateScheduleItem = (body = {}, vendorIds = []) => {
    const values = Object.fromEntries(
        ['starts_at', 'ends_at', 'title', 'location', 'vendor_id', 'contact', 'notes', 'contingency'].map((field) => [
            field,
            readText(body[field])
        ])
    );
    const { errors, fail } = collectErrors();

    if (values.starts_at.length === 0) fail('starts_at', 'validation.required');
    else if (!TIME_PATTERN.test(values.starts_at)) fail('starts_at', 'validation.time');
    if (values.ends_at.length > 0) {
        if (!TIME_PATTERN.test(values.ends_at)) fail('ends_at', 'validation.time');
        // "HH:MM" strings compare correctly as text.
        else if (TIME_PATTERN.test(values.starts_at) && values.ends_at < values.starts_at)
            fail('ends_at', 'schedule.endBeforeStart');
    }
    checkText(fail, 'title', values.title, { required: true, max: LIMITS.title });
    for (const field of ['location', 'contact', 'notes', 'contingency'])
        checkText(fail, field, values[field], { max: LIMITS[field] });
    if (values.vendor_id.length > 0 && !vendorIds.includes(values.vendor_id)) fail('vendor_id', 'validation.choice');

    const orNull = (text) => (text.length === 0 ? null : text);
    return {
        values,
        data: {
            startsAt: values.starts_at,
            endsAt: orNull(values.ends_at),
            title: values.title,
            location: orNull(values.location),
            vendorId: orNull(values.vendor_id),
            contact: orNull(values.contact),
            notes: orNull(values.notes),
            contingency: orNull(values.contingency)
        },
        errors
    };
};

export { validateScheduleItem };
