import { isSupportedLanguage, languageFromHeader, translate } from '../i18n/index.js';
import { formatCurrency, formatDate, formatTime, toIsoDate } from '../utils/format.js';

/**
 * Chooses the page language and exposes translation/format helpers to every view:
 * `lang`, `t(key, vars)`, `formatCurrency(amount)`, `formatDate(date)`, `toIsoDate(date)`.
 *
 * Order: the logged-in user's saved language, then the visitor's choice for this session,
 * then the browser's Accept-Language header. Mount after the session and refreshSessionUser.
 * @type {import('express').RequestHandler}
 */
const setLanguage = (req, res, next) => {
    const candidates = [req.session.user?.language, req.session.language];
    const lang = candidates.find(isSupportedLanguage) ?? languageFromHeader(req.get('accept-language'));

    req.lang = lang;
    req.t = (key, vars) => translate(lang, key, vars);
    res.locals.lang = lang;
    res.locals.t = req.t;
    res.locals.formatCurrency = (amount) => formatCurrency(amount, lang);
    res.locals.formatDate = (value) => formatDate(value, lang);
    res.locals.formatTime = (value) => formatTime(value, lang);
    res.locals.toIsoDate = toIsoDate;
    next();
};

export { setLanguage };
