import {
    CUSTOM_FIELD_ENTITIES,
    CUSTOM_FIELD_LABEL_MAX,
    CUSTOM_FIELD_OPTIONS_MAX,
    CUSTOM_FIELD_TYPES,
    CUSTOM_VALUE_MAX
} from '../constants.js';
import { checkText, collectErrors, readChoice, readText } from './common.js';

/** Validators for custom fields (their definitions) and the values typed into them. */

const NUMBER = /^-?\d{1,12}(\.\d{1,4})?$/;
const OPTION_MAX = 80;

/** Choice options, one per line: trimmed, no blanks or repeats. */
const cleanOptions = (text) => [
    ...new Set(
        String(text ?? '')
            .split(/\r?\n/)
            .map((line) => line.trim().slice(0, OPTION_MAX))
            .filter(Boolean)
    )
];

/**
 * A new field: which entity it belongs to, its label and type, and options for a choice.
 * @param {object} [body] - req.body
 * @returns {{values: {entity: string, label: string, type: string, options: string}, data: {entity: string|null, label: string, type: string|null, options: string[]}, errors: Array}}
 */
const validateCustomField = (body = {}) => {
    const values = {
        entity: readText(body.entity),
        label: readText(body.label),
        type: readText(body.type),
        options: typeof body.options === 'string' ? body.options : ''
    };
    const { errors, fail } = collectErrors();
    const entity = readChoice(values.entity, CUSTOM_FIELD_ENTITIES);
    if (!entity) fail('entity', 'validation.choice');
    checkText(fail, 'label', values.label, { required: true, max: CUSTOM_FIELD_LABEL_MAX });
    const type = readChoice(values.type, CUSTOM_FIELD_TYPES);
    if (!type) fail('type', 'validation.choice');
    const options = type === 'choice' ? cleanOptions(values.options) : [];
    if (type === 'choice' && (options.length < 2 || options.length > CUSTOM_FIELD_OPTIONS_MAX)) {
        fail('options', 'fields.optionsRange', { max: CUSTOM_FIELD_OPTIONS_MAX });
    }
    return { values, data: { entity, label: values.label, type, options }, errors };
};

/**
 * The values typed into a form's custom fields (inputs named cf_<field id>). Only this wedding's
 * fields are read; empty values are left out.
 * @param {object} [body] - req.body
 * @param {Array<{id: string, label: string, type: string, options: string[]}>} fields - The entity's fields.
 * @returns {{values: Object<string, string>, data: Object<string, string|number|boolean>, errors: Array<{field: string, label: string, key: string, vars?: object}>}}
 *   Errors carry the field's own label, since custom fields have no translation key.
 */
const validateCustomValues = (body = {}, fields) => {
    const values = {};
    const data = {};
    const errors = [];
    for (const field of fields) {
        const raw = readText(body[`cf_${field.id}`]);
        values[field.id] = raw;
        const fail = (key, vars) => errors.push({ field: `cf_${field.id}`, label: field.label, key, vars });
        if (field.type === 'yesno') {
            if (raw === 'yes') data[field.id] = true;
            else if (raw === 'no') data[field.id] = false;
            continue;
        }
        if (raw === '') continue;
        if (field.type === 'number') {
            // A decimal comma (12,5) is how most of the app's languages write it.
            const number = raw.replace(',', '.');
            if (NUMBER.test(number)) data[field.id] = Number(number);
            else fail('fields.number');
        } else if (field.type === 'choice') {
            if (field.options.includes(raw)) data[field.id] = raw;
            else fail('validation.choice');
        } else if (raw.length > CUSTOM_VALUE_MAX) {
            fail('validation.tooLong', { max: CUSTOM_VALUE_MAX });
        } else {
            data[field.id] = raw;
        }
    }
    return { values, data, errors };
};

/**
 * Form values from stored custom values (true/false become "yes"/"no").
 * @param {Object<string, unknown>|null} custom
 * @returns {Object<string, string>}
 */
const customFormValues = (custom) =>
    Object.fromEntries(
        Object.entries(custom ?? {}).map(([id, value]) => [
            id,
            value === true ? 'yes' : value === false ? 'no' : String(value)
        ])
    );

export { validateCustomField, validateCustomValues, customFormValues, cleanOptions };
