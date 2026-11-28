import { REMINDER_DAY_CHOICES, REMINDER_FREQUENCIES, REMINDER_KINDS, REMINDER_WINDOW_DAYS } from '../constants.js';
import { collectErrors, readChoice, readText } from './common.js';

/**
 * The reminder settings form: an on/off box, days ahead, daily or weekly, and one box per kind
 * (`remind_<kind>`). With reminders on, at least one kind must be ticked; switching off needs nothing,
 * and keeps the earlier choices for anything not sent.
 * @param {object} [body] - req.body
 * @param {{days: number, frequency: string, kinds: string[]}} [current] - The person's saved choices.
 * @returns {{values: {on: boolean, days: string, frequency: string, kinds: string[]}, data: {on: boolean, days: number, frequency: string, kinds: string[]}, errors: Array}}
 */
const validateReminderPreferences = (
    body = {},
    current = { days: REMINDER_WINDOW_DAYS, frequency: REMINDER_FREQUENCIES[0], kinds: REMINDER_KINDS }
) => {
    const on = body.reminder_emails === 'on';
    const kinds = REMINDER_KINDS.filter((kind) => body[`remind_${kind}`] === 'on');
    const values = { on, days: readText(body.reminder_days), frequency: readText(body.reminder_frequency), kinds };
    const { errors, fail } = collectErrors();

    const days = values.days === '' ? current.days : Number(values.days);
    if (!REMINDER_DAY_CHOICES.includes(days)) fail('reminder_days', 'validation.choice');
    const frequency = values.frequency === '' ? current.frequency : readChoice(values.frequency, REMINDER_FREQUENCIES);
    if (!frequency) fail('reminder_frequency', 'validation.choice');
    if (on && kinds.length === 0) fail('remind_payments', 'settings.remindersNeedKind');

    // Switching off with nothing ticked keeps the kinds for when reminders go back on.
    const keptKinds = !on && kinds.length === 0 ? [...current.kinds] : kinds;
    return { values, data: { on, days, frequency, kinds: keptKinds }, errors };
};

export { validateReminderPreferences };
