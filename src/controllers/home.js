import { FOUNDING_DISCOUNT_PCT, FOUNDING_SPOTS } from '../constants.js';
import { countFoundingSpotsLeft } from '../models/founding.js';

/** Screenshots shown on the landing page (public/images, made by scripts/screenshots.cjs). */
const FEATURES = Object.freeze([
    { key: 'dashboard', image: '/images/landing-planner.jpg' },
    { key: 'decisions', image: '/images/landing-decisions.jpg' },
    { key: 'schedule', image: '/images/landing-schedule.jpg' },
    { key: 'seating', image: '/images/landing-seating.jpg' },
    { key: 'budget', image: '/images/landing-budget.jpg' }
]);

/** Ideas from notes.txt that are planned but not built yet; listed under "Coming next" only. */
const COMING_NEXT = Object.freeze(['workflows']);

/**
 * The public landing page for visitors who are not signed in. Signed-in users fall through to
 * the dashboard route that follows.
 * @type {import('express').RequestHandler}
 */
const showLanding = async (req, res, next) => {
    if (req.session.user) return next();
    res.render('landing', {
        title: req.t('landing.title'),
        spotsLeft: await countFoundingSpotsLeft(),
        foundingSpots: FOUNDING_SPOTS,
        discountPct: FOUNDING_DISCOUNT_PCT,
        features: FEATURES,
        comingNext: COMING_NEXT
    });
};

export { showLanding, FEATURES, COMING_NEXT };
