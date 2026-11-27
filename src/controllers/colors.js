import { CUSTOM_BACKGROUNDS, MAX_WEDDING_COLORS } from '../constants.js';
import { addWeddingColor, deleteWeddingColor, findWeddingColors, setWeddingThemeColors } from '../models/colors.js';
import { parseColorsKey } from '../themes.js';
import { setFlash } from '../utils/flash.js';
import { isUuid } from '../validators/common.js';
import { validateAppColors, validateWeddingColor } from '../validators/colors.js';

const EMPTY_COLOR = { picker: '#c48b9f', hex: '', name: '' };

/** Starting values of "Use these colours for the app": what is applied, else the first swatches. */
const appColorValues = (wedding, colors) => {
    const applied = parseColorsKey(wedding.theme_colors);
    if (applied) return applied;
    const pick = (index) => colors[Math.min(index, colors.length - 1)]?.hex ?? '';
    return { primary: pick(0), secondary: pick(1), accent: pick(2), background: 'n' };
};

const renderColors = async (req, res, { status = 200, colorForm, appForm } = {}) => {
    const colors = await findWeddingColors(req.wedding.id);
    res.status(status).render('colors', {
        title: req.t('colors.title'),
        colors,
        maxColors: MAX_WEDDING_COLORS,
        backgrounds: CUSTOM_BACKGROUNDS,
        appColorsOn: Boolean(parseColorsKey(req.wedding.theme_colors)),
        colorForm: colorForm ?? { values: EMPTY_COLOR, errors: [] },
        appForm: appForm ?? { values: appColorValues(req.wedding, colors), errors: [] },
        scripts: ['/js/palette.js']
    });
};

/** GET /colors: the wedding's colour palette. */
const showColors = (req, res) => renderColors(req, res);

/** POST /colors: adds a swatch. */
const processNewColor = async (req, res) => {
    const { values, data, errors } = validateWeddingColor(req.body);
    if (errors.length > 0) return renderColors(req, res, { status: 400, colorForm: { values, errors } });
    const added = await addWeddingColor(req.wedding.id, data);
    if (added) setFlash(req, 'success', 'colors.added', { hex: data.hex });
    else setFlash(req, 'error', 'colors.limit', { max: MAX_WEDDING_COLORS });
    res.redirect('/colors');
};

/** POST /colors/:id/delete */
const processDeleteColor = async (req, res, next) => {
    if (!isUuid(req.params.id) || !(await deleteWeddingColor(req.params.id, req.wedding.id))) return next();
    setFlash(req, 'success', 'colors.deleted');
    res.redirect('/colors');
};

/** POST /colors/app: everyone in this wedding sees the app in these colours. */
const processAppColors = async (req, res) => {
    const { values, data, errors } = validateAppColors(req.body);
    if (errors.length > 0) return renderColors(req, res, { status: 400, appForm: { values, errors } });
    await setWeddingThemeColors(req.wedding.id, data.colors);
    setFlash(req, 'success', 'colors.appOn');
    res.redirect('/colors');
};

/** POST /colors/app/off: back to each person's own colours (or the planner's brand). */
const processAppColorsOff = async (req, res) => {
    await setWeddingThemeColors(req.wedding.id, null);
    setFlash(req, 'success', 'colors.appOff');
    res.redirect('/colors');
};

export { showColors, processNewColor, processDeleteColor, processAppColors, processAppColorsOff };
