import { COLOR_NAME_MAX, CUSTOM_BACKGROUNDS } from '../constants.js';
import { colorsKey } from '../themes.js';
import { checkText, collectErrors, readHex, readText } from './common.js';

/**
 * A new swatch. The typed hex code wins over the picker, because typing is deliberate and the
 * picker always sends some colour.
 * @param {object} [body] - req.body
 * @returns {{values: {picker: string, hex: string, name: string}, data: {hex: string|null, name: string|null}, errors: Array}}
 */
const validateWeddingColor = (body = {}) => {
    const values = { picker: readText(body.picker), hex: readText(body.hex), name: readText(body.name) };
    const { errors, fail } = collectErrors();
    const hex = values.hex ? readHex(values.hex) : readHex(values.picker);
    if (!hex) fail(values.hex ? 'hex' : 'picker', 'validation.color');
    checkText(fail, 'name', values.name, { max: COLOR_NAME_MAX });
    return { values, data: { hex, name: values.name || null }, errors };
};

/**
 * The wedding's colours applied to the app: three colours and a background choice.
 * @param {object} [body] - req.body
 * @returns {{values: {primary: string, secondary: string, accent: string, background: string}, data: {colors: string|null}, errors: Array}}
 */
const validateAppColors = (body = {}) => {
    const values = {
        primary: readText(body.primary),
        secondary: readText(body.secondary),
        accent: readText(body.accent),
        background: readText(body.background)
    };
    const { errors, fail } = collectErrors();
    for (const field of ['primary', 'secondary', 'accent']) {
        if (!readHex(values[field])) fail(field, 'validation.color');
    }
    if (!CUSTOM_BACKGROUNDS.includes(values.background)) fail('background', 'validation.choice');
    const colors = errors.length > 0 ? null : colorsKey({ ...values, background: values.background });
    return { values, data: { colors }, errors };
};

export { validateWeddingColor, validateAppColors };
