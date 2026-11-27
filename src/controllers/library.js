import { MAX_QUESTIONS, MESSAGE_KINDS, QUESTION_TYPES, SPARE_QUESTION_ROWS } from '../constants.js';
import { PG_ERRORS } from '../models/db.js';
import {
    createMessage,
    createQuestionnaire,
    deleteMessage,
    deleteQuestionnaire,
    deleteSentQuestionnaire,
    findMessage,
    findMessages,
    findQuestionnaire,
    findQuestionnaires,
    findSentQuestionnaire,
    findSentQuestionnaires,
    saveAnswers,
    sendQuestionnaire,
    updateMessage,
    updateQuestionnaire
} from '../models/library.js';
import { findMembers } from '../models/weddings.js';
import { setFlash } from '../utils/flash.js';
import { daysUntil, formatDate } from '../utils/format.js';
import { todayIso } from '../utils/today.js';
import { isUuid } from '../validators/common.js';
import {
    fillPlaceholders,
    normaliseQuestions,
    validateAnswers,
    validateMessage,
    validateQuestionnaire
} from '../validators/library.js';

const EMPTY_MESSAGE = Object.freeze({ kind: 'email', name: '', subject: '', body: '' });
const DUPLICATE_NAME = { field: 'name', key: 'library.nameTaken' };
const blankRow = () => ({ text: '', type: 'short', options: '' });

// ---------- The library page ----------

const renderLibrary = async (req, res, { status = 200, messageForm } = {}) => {
    const userId = req.session.user.id;
    const [messages, questionnaires] = await Promise.all([findMessages(userId), findQuestionnaires(userId)]);
    res.status(status).render('library', {
        title: req.t('library.title'),
        kinds: MESSAGE_KINDS,
        groups: MESSAGE_KINDS.map((kind) => ({ kind, messages: messages.filter((m) => m.kind === kind) })),
        questionnaires,
        messageForm: messageForm ?? { values: EMPTY_MESSAGE, errors: [] }
    });
};

/** GET /library: the person's message templates and questionnaires. */
const showLibrary = (req, res) => renderLibrary(req, res);

/** POST /library/messages */
const processNewMessage = async (req, res) => {
    const { values, data, errors } = validateMessage(req.body);
    if (errors.length === 0) {
        try {
            const created = await createMessage(req.session.user.id, data);
            if (created) setFlash(req, 'success', 'library.messageSaved', { name: data.name });
            else setFlash(req, 'error', 'library.messageLimit');
            return res.redirect('/library');
        } catch (error) {
            if (error.code !== PG_ERRORS.UNIQUE_VIOLATION) throw error;
            errors.push(DUPLICATE_NAME);
        }
    }
    renderLibrary(req, res, { status: 400, messageForm: { values, errors } });
};

const loadMessage = (req) => (isUuid(req.params.id) ? findMessage(req.params.id, req.session.user.id) : null);

const renderEditMessage = (req, res, { status = 200, id, values, errors = [] }) =>
    res
        .status(status)
        .render('edit-message', { title: req.t('library.editMessage'), id, kinds: MESSAGE_KINDS, values, errors });

/** GET /library/messages/:id/edit */
const showEditMessage = async (req, res, next) => {
    const message = await loadMessage(req);
    if (!message) return next();
    renderEditMessage(req, res, { id: message.id, values: { ...message, subject: message.subject ?? '' } });
};

/** POST /library/messages/:id/edit */
const processEditMessage = async (req, res, next) => {
    const message = await loadMessage(req);
    if (!message) return next();
    const { values, data, errors } = validateMessage(req.body);
    if (errors.length === 0) {
        try {
            await updateMessage(message.id, req.session.user.id, data);
            setFlash(req, 'success', 'library.messageSaved', { name: data.name });
            return res.redirect('/library');
        } catch (error) {
            if (error.code !== PG_ERRORS.UNIQUE_VIOLATION) throw error;
            errors.push(DUPLICATE_NAME);
        }
    }
    renderEditMessage(req, res, { status: 400, id: message.id, values, errors });
};

/** POST /library/messages/:id/delete */
const processDeleteMessage = async (req, res, next) => {
    if (!isUuid(req.params.id) || !(await deleteMessage(req.params.id, req.session.user.id))) return next();
    setFlash(req, 'success', 'library.deleted');
    res.redirect('/library');
};

/**
 * GET /library/messages/:id/use: the message filled in for the active wedding, to copy, open in
 * the person's email app or print. Nothing is sent from the server.
 */
const showUseMessage = async (req, res, next) => {
    const message = await loadMessage(req);
    if (!message) return next();
    const [year, month, day] = todayIso().split('-').map(Number);
    const daysLeft = daysUntil(req.wedding.wedding_date, new Date(year, month - 1, day));
    const fields = {
        couple: req.wedding.name,
        date: req.wedding.wedding_date ? formatDate(req.wedding.wedding_date, res.locals.lang) : '',
        days_left: daysLeft === null ? '' : String(Math.max(daysLeft, 0)),
        planner: req.session.user.businessName || req.session.user.name
    };
    const subject = fillPlaceholders(message.subject ?? '', fields);
    const body = fillPlaceholders(message.body, fields);
    const recipients = (await findMembers(req.wedding.id))
        .filter((member) => member.user_id !== req.session.user.id)
        // Encoded, so an unusual address can never add mailto fields of its own.
        .map((member) => encodeURIComponent(member.email).replace(/%40/g, '@'));
    const mailto = `mailto:${recipients.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    res.render('use-message', { title: message.name, message, subject, body, mailto });
};

// ---------- Questionnaire builder ----------

/** Builder rows: the saved questions plus a few empty ones to add more without JavaScript. */
const builderRows = (questions) => [
    ...questions.map((q) => ({ text: q.text, type: q.type, options: q.options.join('\n') })),
    ...Array.from({ length: SPARE_QUESTION_ROWS }, blankRow)
];

const renderBuilder = (req, res, { status = 200, id = null, values, errors = [] }) =>
    res.status(status).render('edit-questionnaire', {
        title: req.t(id ? 'library.editQuestionnaire' : 'library.newQuestionnaire'),
        id,
        types: QUESTION_TYPES,
        maxRows: MAX_QUESTIONS + SPARE_QUESTION_ROWS,
        values: { ...values, rows: values.rows.length > 0 ? values.rows : builderRows([]) },
        errors
    });

/** GET /library/questionnaires/new */
const showNewQuestionnaire = (req, res) =>
    renderBuilder(req, res, { values: { title: '', intro: '', rows: builderRows([]) } });

/**
 * "Add a question" without JavaScript posts the form with add_row: show it again with one more
 * empty row, saving nothing and showing no errors yet.
 */
const addRow = (req, res, id = null) => {
    const { values } = validateQuestionnaire(req.body);
    renderBuilder(req, res, { id, values: { ...values, rows: [...values.rows, blankRow()] } });
};

/** POST /library/questionnaires */
const processNewQuestionnaire = async (req, res) => {
    if (req.body?.add_row) return addRow(req, res);
    const { values, data, errors } = validateQuestionnaire(req.body);
    if (errors.length > 0) return renderBuilder(req, res, { status: 400, values, errors });
    const created = await createQuestionnaire(req.session.user.id, data);
    if (created) setFlash(req, 'success', 'library.questionnaireSaved', { title: data.title });
    else setFlash(req, 'error', 'library.questionnaireLimit');
    res.redirect('/library');
};

const loadQuestionnaire = (req) =>
    isUuid(req.params.id) ? findQuestionnaire(req.params.id, req.session.user.id) : null;

/** GET /library/questionnaires/:id/edit */
const showEditQuestionnaire = async (req, res, next) => {
    const questionnaire = await loadQuestionnaire(req);
    if (!questionnaire) return next();
    renderBuilder(req, res, {
        id: questionnaire.id,
        values: {
            title: questionnaire.title,
            intro: questionnaire.intro ?? '',
            rows: builderRows(normaliseQuestions(questionnaire.questions))
        }
    });
};

/** POST /library/questionnaires/:id/edit */
const processEditQuestionnaire = async (req, res, next) => {
    const questionnaire = await loadQuestionnaire(req);
    if (!questionnaire) return next();
    if (req.body?.add_row) return addRow(req, res, questionnaire.id);
    const { values, data, errors } = validateQuestionnaire(req.body);
    if (errors.length > 0) return renderBuilder(req, res, { status: 400, id: questionnaire.id, values, errors });
    await updateQuestionnaire(questionnaire.id, req.session.user.id, data);
    setFlash(req, 'success', 'library.questionnaireSaved', { title: data.title });
    res.redirect('/library');
};

/** POST /library/questionnaires/:id/delete (questionnaires already sent to weddings stay there). */
const processDeleteQuestionnaire = async (req, res, next) => {
    if (!isUuid(req.params.id) || !(await deleteQuestionnaire(req.params.id, req.session.user.id))) return next();
    setFlash(req, 'success', 'library.deleted');
    res.redirect('/library');
};

// ---------- Questionnaires in a wedding ----------

/** GET /questionnaires: what was sent to this wedding, and (for editors) what they could send. */
const showQuestionnaires = async (req, res) => {
    const [sent, mine] = await Promise.all([
        findSentQuestionnaires(req.wedding.id),
        res.locals.canAskDecisions ? findQuestionnaires(req.session.user.id) : []
    ]);
    res.render('questionnaires', { title: req.t('questionnaires.title'), sent, mine });
};

/** POST /questionnaires/send: copies one of the sender's questionnaires into the wedding. */
const processSendQuestionnaire = async (req, res, next) => {
    const questionnaire = isUuid(req.body?.questionnaire_id)
        ? await findQuestionnaire(req.body.questionnaire_id, req.session.user.id)
        : null;
    if (!questionnaire) return next();
    const questions = normaliseQuestions(questionnaire.questions);
    await sendQuestionnaire(
        req.wedding.id,
        { title: questionnaire.title, intro: questionnaire.intro, questions },
        req.session.user.id
    );
    setFlash(req, 'success', 'questionnaires.sent', { title: questionnaire.title });
    res.redirect('/questionnaires');
};

const loadSent = async (req) => {
    const sent = isUuid(req.params.id) ? await findSentQuestionnaire(req.params.id, req.wedding.id) : null;
    return sent ? { ...sent, questions: normaliseQuestions(sent.questions) } : null;
};

const renderSent = (req, res, sent, { status = 200, values = null, errors = [] } = {}) =>
    res.status(status).render('questionnaire', {
        title: sent.title,
        sent,
        values: values ?? sent.questions.map((_, i) => (Array.isArray(sent.answers) ? (sent.answers[i] ?? '') : '')),
        errors
    });

/** GET /questionnaires/:id: answer it (the couple) or read the answers (everyone else). */
const showSentQuestionnaire = async (req, res, next) => {
    const sent = await loadSent(req);
    if (!sent) return next();
    renderSent(req, res, sent);
};

/** POST /questionnaires/:id/answers (whoever answers decisions in this wedding). */
const processAnswers = async (req, res, next) => {
    const sent = await loadSent(req);
    if (!sent) return next();
    const { values, data, errors } = validateAnswers(req.body, sent.questions);
    if (errors.length > 0) return renderSent(req, res, sent, { status: 400, values, errors });
    await saveAnswers(sent.id, req.wedding.id, data.answers, req.session.user.id);
    setFlash(req, 'success', 'questionnaires.answered');
    res.redirect(`/questionnaires/${sent.id}`);
};

/** POST /questionnaires/:id/delete */
const processDeleteSent = async (req, res, next) => {
    if (!isUuid(req.params.id) || !(await deleteSentQuestionnaire(req.params.id, req.wedding.id))) return next();
    setFlash(req, 'success', 'library.deleted');
    res.redirect('/questionnaires');
};

export {
    showLibrary,
    processNewMessage,
    showEditMessage,
    processEditMessage,
    processDeleteMessage,
    showUseMessage,
    showNewQuestionnaire,
    processNewQuestionnaire,
    showEditQuestionnaire,
    processEditQuestionnaire,
    processDeleteQuestionnaire,
    showQuestionnaires,
    processSendQuestionnaire,
    showSentQuestionnaire,
    processAnswers,
    processDeleteSent
};
