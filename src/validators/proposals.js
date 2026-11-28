import { PROPOSAL_STATUSES, VENDOR_AVAILABILITY } from '../constants.js';
import { checkText, collectErrors, isUuid, isValidDate, parseMoney, readChoice, readText } from './common.js';

const LIMITS = Object.freeze({ title: 200, notes: 2000 });

/**
 * Whether a vendor is free on the day. A hold needs the date it ends; other choices drop it.
 * @param {object} [body] - req.body
 * @returns {{values: {availability: string, hold_until: string}, data: {availability: string, holdUntil: string|null}, errors: Array}}
 */
const validateAvailability = (body = {}) => {
    const values = { availability: readText(body.availability), hold_until: readText(body.hold_until) };
    const { errors, fail } = collectErrors();
    const availability = readChoice(values.availability, VENDOR_AVAILABILITY);
    if (!availability) fail('availability', 'validation.choice');
    const isHold = availability === 'hold';
    if (isHold && values.hold_until === '') fail('hold_until', 'vendor.holdNeedsDate');
    else if (isHold && !isValidDate(values.hold_until)) fail('hold_until', 'validation.date');
    return { values, data: { availability, holdUntil: isHold ? values.hold_until : null }, errors };
};

/**
 * One proposal (quote) from a vendor.
 * @param {object} [body] - req.body
 * @param {string[]} fileIds - Ids of this vendor's files; any other file id is refused.
 * @returns {{values: object, data: {title: string, amount: number|null, validUntil: string|null, fileId: string|null, notes: string|null}, errors: Array}}
 */
const validateProposal = (body = {}, fileIds = []) => {
    const values = Object.fromEntries(
        ['title', 'amount', 'valid_until', 'file_id', 'notes'].map((field) => [field, readText(body[field])])
    );
    const { errors, fail } = collectErrors();
    checkText(fail, 'title', values.title, { required: true, max: LIMITS.title });
    const amount = values.amount === '' ? null : parseMoney(values.amount);
    if (values.amount !== '' && amount === null) fail('amount', 'validation.amount');
    if (values.valid_until !== '' && !isValidDate(values.valid_until)) fail('valid_until', 'validation.date');
    if (values.file_id !== '' && !(isUuid(values.file_id) && fileIds.includes(values.file_id)))
        fail('file_id', 'validation.choice');
    checkText(fail, 'notes', values.notes, { max: LIMITS.notes });
    const orNull = (text) => (text === '' ? null : text);
    return {
        values,
        data: {
            title: values.title,
            amount,
            validUntil: orNull(values.valid_until),
            fileId: orNull(values.file_id),
            notes: orNull(values.notes)
        },
        errors
    };
};

/**
 * @param {unknown} value - The posted status.
 * @returns {string|null} One of PROPOSAL_STATUSES, or null.
 */
const readProposalStatus = (value) => readChoice(value, PROPOSAL_STATUSES);

export { validateAvailability, validateProposal, readProposalStatus };
