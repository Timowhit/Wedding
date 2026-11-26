import { countFoundingSpotsLeft } from '../models/founding.js';
import { createClientWedding, findPlannerOverview, findPlannerWorkload } from '../models/planner.js';
import { findUserById } from '../models/users.js';
import { toSessionUser } from '../middleware/auth.js';
import { switchActiveWedding } from '../middleware/wedding.js';
import { setFlash } from '../utils/flash.js';
import { isUuid, readChoice, readText } from '../validators/common.js';
import { validateWedding } from '../validators/weddings.js';

const WHEN_OPTIONS = Object.freeze(['upcoming', 'past', 'all']);
const SEARCH_MAX = 100;

const EMPTY_WEDDING = { name: '', wedding_date: '' };

const renderDashboard = async (req, res, { status = 200, weddingForm } = {}) => {
    const filters = {
        q: readText(req.query.q).slice(0, SEARCH_MAX),
        when: readChoice(req.query.when, WHEN_OPTIONS) ?? 'upcoming'
    };
    const userId = req.session.user.id;
    const [weddings, workload, spotsLeft] = await Promise.all([
        findPlannerOverview(userId, filters),
        findPlannerWorkload(userId),
        countFoundingSpotsLeft()
    ]);

    res.status(status).render('planner', {
        title: req.t('planner.title'),
        weddings,
        workload,
        filters,
        whenOptions: WHEN_OPTIONS,
        spotsLeft,
        weddingForm: weddingForm ?? { values: EMPTY_WEDDING, errors: [] }
    });
};

const showPlannerDashboard = (req, res) => renderDashboard(req, res);

/** "Add a client wedding". The first one also claims the planner's founding number. */
const processNewClientWedding = async (req, res) => {
    const { values, data, errors } = validateWedding(req.body);
    if (errors.length > 0) return renderDashboard(req, res, { status: 400, weddingForm: { values, errors } });

    const { wedding, foundingNumber } = await createClientWedding(req.session.user.id, data);
    const refreshed = await findUserById(req.session.user.id);
    if (refreshed) req.session.user = toSessionUser(refreshed);

    if (foundingNumber)
        setFlash(req, 'success', 'planner.foundingClaimed', { number: foundingNumber, name: wedding.name });
    else setFlash(req, 'success', 'planner.weddingCreated', { name: wedding.name });
    res.redirect('/planner');
};

/** "Open" on a wedding card: make it the active wedding and go to its dashboard. */
const processOpenWedding = async (req, res, next) => {
    const wedding = isUuid(req.params.id) ? await switchActiveWedding(req, req.params.id) : null;
    if (!wedding) return next();
    res.redirect('/');
};

export { showPlannerDashboard, processNewClientWedding, processOpenWedding };
