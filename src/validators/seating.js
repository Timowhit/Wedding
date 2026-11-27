import { checkText, collectErrors, readText } from './common.js';

const NAME_MAX = 80;
const SEATS_MIN = 1;
const SEATS_MAX = 30;

/**
 * A seating table.
 * @param {object} [body] - req.body
 * @returns {{values: {name: string, seats: string}, data: {name: string, seats: number|null}, errors: Array}}
 */
const validateTable = (body = {}) => {
    const values = { name: readText(body.name), seats: readText(body.seats) };
    const { errors, fail } = collectErrors();
    checkText(fail, 'name', values.name, { required: true, max: NAME_MAX });
    const seats = /^\d{1,2}$/.test(values.seats) ? Number(values.seats) : null;
    if (seats === null || seats < SEATS_MIN || seats > SEATS_MAX) {
        fail('seats', 'seating.seatsRange', { min: SEATS_MIN, max: SEATS_MAX });
    }
    return { values, data: { name: values.name, seats }, errors };
};

export { validateTable };
