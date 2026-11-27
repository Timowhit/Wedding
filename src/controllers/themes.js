import { renderCustomCss } from '../themes.js';

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/**
 * GET /css/custom/:key.css: the stylesheet for one set of custom colours. The key is the whole
 * input, so the response never changes and browsers may keep it for a year.
 * @type {import('express').RequestHandler}
 */
const showCustomCss = (req, res, next) => {
    const css = renderCustomCss(req.params.key);
    if (!css) return next();
    res.type('text/css').set('Cache-Control', `public, max-age=${ONE_YEAR_SECONDS}, immutable`).send(css);
};

export { showCustomCss };
