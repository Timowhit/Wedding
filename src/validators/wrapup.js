import { RATING_MAX, REVIEW_MAX } from '../constants.js';
import { checkText, collectErrors, readText } from './common.js';

/**
 * A vendor's rating after the wedding: whole stars from 1 to RATING_MAX and an optional note.
 * @param {object} [body] - req.body
 * @returns {{values: {rating: string, review: string}, data: {rating: number|null, review: string|null}, errors: Array}}
 */
const validateRating = (body = {}) => {
    const values = { rating: readText(body.rating), review: readText(body.review) };
    const { errors, fail } = collectErrors();
    const rating = /^\d$/.test(values.rating) ? Number(values.rating) : null;
    if (rating === null || rating < 1 || rating > RATING_MAX) fail('rating', 'wrapup.ratingRange', { max: RATING_MAX });
    checkText(fail, 'review', values.review, { max: REVIEW_MAX });
    return { values, data: { rating, review: values.review || null }, errors };
};

export { validateRating };
