import {
    answerDecision,
    createDecision,
    deleteDecision,
    findDecision,
    findDecisions,
    reopenDecision,
    updateDecision
} from '../models/decisions.js';
import { setFlash } from '../utils/flash.js';
import { toIsoDate } from '../utils/format.js';
import { isUuid } from '../validators/common.js';
import { validateAnswer, validateDecision } from '../validators/decisions.js';

const EMPTY_DECISION = { title: '', details: '', due_date: '' };

const renderDecisions = async (req, res, { status = 200, decisionForm, answerForm } = {}) => {
    const decisions = await findDecisions(req.wedding.id);
    res.status(status).render('decisions', {
        title: req.t('decisions.title'),
        decisions,
        today: toIsoDate(new Date()),
        decisionForm: decisionForm ?? { values: EMPTY_DECISION, errors: [] },
        // The answer form with errors belongs to one decision; the others render clean.
        answerForm: answerForm ?? { id: null, values: { status: '', comment: '' }, errors: [] }
    });
};

const renderEditDecision = (req, res, { status = 200, id, values, errors = [] }) =>
    res.status(status).render('edit-decision', {
        title: req.t('decisions.editTitle'),
        formAction: `/decisions/${id}/edit`,
        values,
        errors
    });

const showDecisions = (req, res) => renderDecisions(req, res);

const processNewDecision = async (req, res) => {
    const { values, data, errors } = validateDecision(req.body);
    if (errors.length > 0) return renderDecisions(req, res, { status: 400, decisionForm: { values, errors } });

    const decision = await createDecision(req.wedding.id, req.session.user.id, data);
    setFlash(req, 'success', 'decisions.created', { title: decision.title });
    res.redirect('/decisions');
};

const showEditDecision = async (req, res, next) => {
    const decision = isUuid(req.params.id) ? await findDecision(req.params.id, req.wedding.id) : null;
    if (!decision) return next();
    renderEditDecision(req, res, {
        id: decision.id,
        values: { title: decision.title, details: decision.details ?? '', due_date: toIsoDate(decision.due_date) }
    });
};

const processEditDecision = async (req, res, next) => {
    if (!isUuid(req.params.id)) return next();
    const { values, data, errors } = validateDecision(req.body);
    if (errors.length > 0) return renderEditDecision(req, res, { status: 400, id: req.params.id, values, errors });

    const updated = await updateDecision(req.params.id, req.wedding.id, data);
    if (!updated) return next();
    setFlash(req, 'success', 'decisions.saved', { title: updated.title });
    res.redirect('/decisions');
};

const processAnswer = async (req, res, next) => {
    const decision = isUuid(req.params.id) ? await findDecision(req.params.id, req.wedding.id) : null;
    if (!decision) return next();

    const { values, data, errors } = validateAnswer(req.body);
    if (errors.length > 0) {
        return renderDecisions(req, res, { status: 400, answerForm: { id: decision.id, values, errors } });
    }
    if (!(await answerDecision(decision.id, req.wedding.id, req.session.user.id, data))) {
        setFlash(req, 'error', 'decisions.alreadyApproved', { title: decision.title });
        return res.redirect('/decisions');
    }
    setFlash(req, 'success', data.status === 'approved' ? 'decisions.approved' : 'decisions.sentBack', {
        title: decision.title
    });
    res.redirect('/decisions');
};

const processReopen = async (req, res, next) => {
    if (!isUuid(req.params.id) || !(await reopenDecision(req.params.id, req.wedding.id))) return next();
    setFlash(req, 'success', 'decisions.reopened');
    res.redirect('/decisions');
};

const processDeleteDecision = async (req, res, next) => {
    if (!isUuid(req.params.id) || !(await deleteDecision(req.params.id, req.wedding.id))) return next();
    setFlash(req, 'success', 'decisions.deleted');
    res.redirect('/decisions');
};

export {
    showDecisions,
    processNewDecision,
    showEditDecision,
    processEditDecision,
    processAnswer,
    processReopen,
    processDeleteDecision
};
