import { checkText, collectErrors, isValidDate, parseMoney, readText } from './common.js';

/** Longest values kept for a vendor's contract (characters). */
const CONTRACT_LIMITS = Object.freeze({ url: 2000, includes: 2000, cancellation: 1000 });
/** Longest values kept for one payment (characters). */
const PAYMENT_LIMITS = Object.freeze({ label: 120, note: 500 });

/** Empty text is stored as NULL so "not filled in" has one representation. */
const orNull = (text) => (text === '' ? null : text);

/**
 * True for an https link of acceptable length. Contract links are shown to every member and
 * opened in a new tab, so plain http and every other scheme are refused.
 * @param {string} text
 * @returns {boolean}
 */
const isHttpsUrl = (text) => {
    if (text.length > CONTRACT_LIMITS.url) return false;
    try {
        return new URL(text).protocol === 'https:';
    } catch {
        return false;
    }
};

/**
 * Validates a vendor's contract details. Every field is optional; all empty means "no contract".
 * @param {object} [body] - req.body
 * @returns {{values: {contract_total: string, contract_signed_on: string, contract_url: string, contract_includes: string, contract_cancellation: string}, data: {total: number|null, signedOn: string|null, url: string|null, includes: string|null, cancellation: string|null}, errors: Array<{field: string, key: string, vars?: object}>}}
 */
const validateContract = (body = {}) => {
    const values = {
        contract_total: readText(body.contract_total),
        contract_signed_on: readText(body.contract_signed_on),
        contract_url: readText(body.contract_url),
        contract_includes: readText(body.contract_includes),
        contract_cancellation: readText(body.contract_cancellation)
    };
    const { errors, fail } = collectErrors();

    const total = values.contract_total === '' ? null : parseMoney(values.contract_total);
    if (values.contract_total !== '' && total === null) fail('contract_total', 'validation.amount');
    if (values.contract_signed_on !== '' && !isValidDate(values.contract_signed_on)) {
        fail('contract_signed_on', 'validation.date');
    }
    if (values.contract_url !== '' && !isHttpsUrl(values.contract_url)) fail('contract_url', 'validation.httpsUrl');
    checkText(fail, 'contract_includes', values.contract_includes, { max: CONTRACT_LIMITS.includes });
    checkText(fail, 'contract_cancellation', values.contract_cancellation, { max: CONTRACT_LIMITS.cancellation });

    return {
        values,
        data: {
            total,
            signedOn: orNull(values.contract_signed_on),
            url: orNull(values.contract_url),
            includes: orNull(values.contract_includes),
            cancellation: orNull(values.contract_cancellation)
        },
        errors
    };
};

/**
 * Validates one scheduled payment to a vendor. A paid date means the payment is paid.
 * @param {object} [body] - req.body
 * @returns {{values: {label: string, amount: string, due_date: string, paid_on: string, note: string}, data: {label: string|null, amount: number, dueDate: string|null, paidOn: string|null, note: string|null}, errors: Array<{field: string, key: string, vars?: object}>}}
 */
const validatePayment = (body = {}) => {
    const values = {
        label: readText(body.label),
        amount: readText(body.amount),
        due_date: readText(body.due_date),
        paid_on: readText(body.paid_on),
        note: readText(body.note)
    };
    const { errors, fail } = collectErrors();

    checkText(fail, 'label', values.label, { max: PAYMENT_LIMITS.label });
    const amount = parseMoney(values.amount);
    if (amount === null || amount === 0) fail('amount', 'validation.positiveAmount');
    if (values.due_date !== '' && !isValidDate(values.due_date)) fail('due_date', 'validation.date');
    if (values.paid_on !== '' && !isValidDate(values.paid_on)) fail('paid_on', 'validation.date');
    checkText(fail, 'note', values.note, { max: PAYMENT_LIMITS.note });

    return {
        values,
        data: {
            label: orNull(values.label),
            amount,
            dueDate: orNull(values.due_date),
            paidOn: orNull(values.paid_on),
            note: orNull(values.note)
        },
        errors
    };
};

export { CONTRACT_LIMITS, PAYMENT_LIMITS, validateContract, validatePayment };
