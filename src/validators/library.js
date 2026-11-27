import { LIBRARY_LIMITS, MAX_CHOICE_OPTIONS, MAX_QUESTIONS, MESSAGE_KINDS, QUESTION_TYPES } from '../constants.js';
import { checkText, collectErrors, readChoice, readText } from './common.js';

/**
 * A message template.
 * @param {object} [body] - req.body
 * @returns {{values: {kind: string, name: string, subject: string, body: string}, data: {kind: string|null, name: string, subject: string|null, body: string}, errors: Array}}
 */
const validateMessage = (body = {}) => {
    const values = {
        kind: readText(body.kind),
        name: readText(body.name),
        subject: readText(body.subject),
        // The body keeps its own line breaks and spacing; only the ends are trimmed.
        body: typeof body.body === 'string' ? body.body.replace(/\r\n/g, '\n').trim() : ''
    };
    const { errors, fail } = collectErrors();
    const kind = readChoice(values.kind, MESSAGE_KINDS);
    if (!kind) fail('kind', 'validation.choice');
    checkText(fail, 'name', values.name, { required: true, max: LIBRARY_LIMITS.name });
    checkText(fail, 'subject', values.subject, { max: LIBRARY_LIMITS.subject });
    checkText(fail, 'body', values.body, { required: true, max: LIBRARY_LIMITS.body });
    return { values, data: { kind, name: values.name, subject: values.subject || null, body: values.body }, errors };
};

const splitOptions = (text) =>
    String(text ?? '')
        .split(/\r?\n/)
        .map((option) => option.trim())
        .filter(Boolean);

/**
 * The questionnaire builder: a title, an intro and numbered rows q0_text/q0_type/q0_options…
 * Rows without text are dropped; a choice needs at least two options (one per line).
 * @param {object} [body] - req.body
 * @returns {{values: {title: string, intro: string, rows: Array<{text: string, type: string, options: string}>}, data: {title: string, intro: string|null, questions: Array<{text: string, type: string, options: string[]}>}, errors: Array}}
 */
const validateQuestionnaire = (body = {}) => {
    const rows = [];
    for (let i = 0; i < MAX_QUESTIONS + 10; i += 1) {
        if (!(`q${i}_text` in body)) continue;
        rows.push({
            text: readText(body[`q${i}_text`]),
            type: readText(body[`q${i}_type`]),
            options: String(body[`q${i}_options`] ?? '')
        });
    }
    const values = { title: readText(body.title), intro: readText(body.intro), rows };
    const { errors, fail } = collectErrors();
    checkText(fail, 'title', values.title, { required: true, max: LIBRARY_LIMITS.name });
    checkText(fail, 'intro', values.intro, { max: LIBRARY_LIMITS.intro });

    const questions = [];
    rows.forEach((row, index) => {
        if (!row.text) return;
        const field = `q${index}_text`;
        checkText(fail, field, row.text, { max: LIBRARY_LIMITS.question });
        const type = readChoice(row.type, QUESTION_TYPES) ?? 'short';
        const options = type === 'choice' ? splitOptions(row.options) : [];
        if (type === 'choice' && (options.length < 2 || options.length > MAX_CHOICE_OPTIONS)) {
            fail(`q${index}_options`, 'library.choiceOptions', { max: MAX_CHOICE_OPTIONS });
        }
        if (options.some((option) => option.length > LIBRARY_LIMITS.option)) {
            fail(`q${index}_options`, 'validation.tooLong', { max: LIBRARY_LIMITS.option });
        }
        questions.push({ text: row.text, type, options });
    });
    if (questions.length === 0) fail('q0_text', 'library.needQuestion');
    if (questions.length > MAX_QUESTIONS) fail('q0_text', 'library.tooManyQuestions', { max: MAX_QUESTIONS });
    return { values, data: { title: values.title, intro: values.intro || null, questions }, errors };
};

/**
 * Stored questions, re-checked before use (JSONB can be edited by hand or come from an older
 * version): broken entries are skipped, unknown types become short text.
 * @param {unknown} raw
 * @returns {Array<{text: string, type: string, options: string[]}>}
 */
const normaliseQuestions = (raw) =>
    (Array.isArray(raw) ? raw : [])
        .filter((q) => q && typeof q.text === 'string' && q.text.trim())
        .slice(0, MAX_QUESTIONS)
        .map((q) => {
            const options = Array.isArray(q.options) ? q.options.filter((o) => typeof o === 'string' && o.trim()) : [];
            const type =
                QUESTION_TYPES.includes(q.type) && !(q.type === 'choice' && options.length < 2) ? q.type : 'short';
            return { text: q.text.trim(), type, options: type === 'choice' ? options : [] };
        });

/**
 * Answers to a sent questionnaire: a0, a1… in question order. Choice answers must be one of
 * the options; every answer may be left empty.
 * @param {object} [body] - req.body
 * @param {Array<{text: string, type: string, options: string[]}>} questions - Normalised.
 * @returns {{values: string[], data: {answers: string[]}, errors: Array}}
 */
const validateAnswers = (body = {}, questions) => {
    const values = questions.map((question, i) =>
        question.type === 'long' && typeof body[`a${i}`] === 'string'
            ? body[`a${i}`].replace(/\r\n/g, '\n').trim()
            : readText(body[`a${i}`])
    );
    const { errors, fail } = collectErrors();
    questions.forEach((question, i) => {
        checkText(fail, `a${i}`, values[i], { max: LIBRARY_LIMITS.answer });
        if (question.type === 'choice' && values[i] && !question.options.includes(values[i]))
            fail(`a${i}`, 'validation.choice');
    });
    return { values, data: { answers: values }, errors };
};

/**
 * Fills a message's placeholders. Unknown placeholders stay as written, so a typo shows.
 * @param {string} text
 * @param {Object<string, string>} fields - e.g. { couple, date, days_left, planner }
 * @returns {string}
 */
const fillPlaceholders = (text, fields) =>
    String(text ?? '').replace(/\{(\w+)\}/g, (whole, key) => (Object.hasOwn(fields, key) ? fields[key] : whole));

export { validateMessage, validateQuestionnaire, normaliseQuestions, validateAnswers, fillPlaceholders };
