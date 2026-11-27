import { checkText, collectErrors, isValidDate, readChoice, readText } from './common.js';

const TITLE_MAX = 200;
const DETAILS_MAX = 2000;
const COMMENT_MAX = 1000;
const ANSWERS = Object.freeze(['approved', 'changes_requested']);

/**
 * A decision put to the couple.
 * @param {object} [body] - req.body
 * @returns {{values: {title: string, details: string, due_date: string}, data: {title: string, details: string|null, dueDate: string|null}, errors: Array}}
 */
const validateDecision = (body = {}) => {
    const values = { title: readText(body.title), details: readText(body.details), due_date: readText(body.due_date) };
    const { errors, fail } = collectErrors();
    checkText(fail, 'title', values.title, { required: true, max: TITLE_MAX });
    checkText(fail, 'details', values.details, { max: DETAILS_MAX });
    if (values.due_date.length > 0 && !isValidDate(values.due_date)) fail('due_date', 'validation.date');
    return {
        values,
        data: { title: values.title, details: values.details || null, dueDate: values.due_date || null },
        errors
    };
};

/**
 * The couple's answer. Sending a decision back needs a comment saying what to change.
 * @param {object} [body] - req.body
 * @returns {{values: {status: string, comment: string}, data: {status: 'approved'|'changes_requested'|null, comment: string|null}, errors: Array}}
 */
const validateAnswer = (body = {}) => {
    const values = { status: readText(body.status), comment: readText(body.comment) };
    const { errors, fail } = collectErrors();
    const status = readChoice(values.status, ANSWERS);
    if (!status) fail('status', 'validation.choice');
    if (status === 'changes_requested' && values.comment.length === 0) fail('comment', 'decisions.commentRequired');
    checkText(fail, 'comment', values.comment, { max: COMMENT_MAX });
    return { values, data: { status, comment: values.comment || null }, errors };
};

export { validateDecision, validateAnswer };
