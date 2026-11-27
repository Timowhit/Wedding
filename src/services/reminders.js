import { findReminderCandidates, findReminderDigest, markReminded } from '../models/reminders.js';
import { REMINDER_WINDOW_DAYS } from '../constants.js';
import { translate } from '../i18n/index.js';
import { formatCurrency, formatDate } from '../utils/format.js';
import { todayIso } from '../utils/today.js';
import { unsubscribeToken } from '../utils/unsubscribe.js';
import { escapeHtml, isEmailConfigured, sendReminderEmail } from './email.js';

/** Section headings in the email, in the order they appear. */
const GROUP_HEADINGS = Object.freeze({
    payments: 'reminders.payments',
    tasks: 'reminders.tasks',
    decisions: 'reminders.decisions'
});

const appUrl = () => (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');

/** One line per item, already translated; `overdue` marks lines shown in the danger colour. */
const linesFor = (wedding, t, lang) => [
    ...wedding.payments.map((p) => ({
        group: 'payments',
        overdue: p.overdue,
        text: t('reminders.paymentLine', {
            vendor: p.vendor_name,
            label: p.label || t('payments.payment'),
            amount: formatCurrency(p.amount, lang),
            date: formatDate(p.due_date, lang)
        })
    })),
    ...wedding.tasks.map((task) => ({
        group: 'tasks',
        overdue: task.overdue,
        text: t('reminders.taskLine', { text: task.text, date: formatDate(task.due_date, lang) })
    })),
    ...wedding.decisions.map((d) => ({
        group: 'decisions',
        overdue: false,
        text: t(d.status === 'open' ? 'reminders.decisionOpen' : 'reminders.decisionSentBack', { title: d.title })
    }))
];

/**
 * The summary email for one person, in their language.
 * @param {{id: string, email: string, language: string, account_type: string}} user
 * @param {Array<object>} digest - From findReminderDigest.
 * @returns {{to: string, lang: string, subject: string, text: string, html: string, unsubscribeUrl: string}}
 */
const buildReminderMessage = (user, digest) => {
    const lang = user.language;
    const t = (key, vars) => translate(lang, key, vars);
    const sections = digest.map((wedding) => ({ name: wedding.name, lines: linesFor(wedding, t, lang) }));
    const count = sections.reduce((sum, section) => sum + section.lines.length, 0);
    const subject = t(count === 1 ? 'reminders.subjectOne' : 'reminders.subject', { count });
    const openUrl = `${appUrl()}${user.account_type === 'planner' ? '/planner' : '/'}`;
    const settingsUrl = `${appUrl()}/settings#reminders-heading`;
    const unsubscribeUrl = `${appUrl()}/reminders/unsubscribe?u=${user.id}&t=${unsubscribeToken(user.id)}`;
    const intro = t('reminders.intro', { days: REMINDER_WINDOW_DAYS });
    const groups = Object.keys(GROUP_HEADINGS);

    const text = [
        intro,
        ...sections.map((section) =>
            [
                `${section.name}`,
                ...groups.flatMap((group) => {
                    const lines = section.lines.filter((line) => line.group === group);
                    if (lines.length === 0) return [];
                    return [
                        `  ${t(GROUP_HEADINGS[group])}`,
                        ...lines.map((line) => `  - ${line.text}${line.overdue ? ` (${t('payments.overdue')})` : ''}`)
                    ];
                })
            ].join('\n')
        ),
        `${t('reminders.open')}: ${openUrl}`,
        `${t('reminders.why')} ${t('reminders.settings')}: ${settingsUrl}`,
        `${t('reminders.unsubscribe')}: ${unsubscribeUrl}`
    ].join('\n\n');

    const htmlSections = sections
        .map(
            (
                section
            ) => `<h2 style="margin:24px 0 8px;font-size:18px;font-weight:400;color:#3d3535">${escapeHtml(section.name)}</h2>
${groups
    .map((group) => {
        const lines = section.lines.filter((line) => line.group === group);
        if (lines.length === 0) return '';
        const items = lines
            .map(
                (line) =>
                    `<li style="margin:0 0 6px;line-height:1.5${line.overdue ? ';color:#a3302f' : ''}">${escapeHtml(line.text)}${line.overdue ? ` <strong>(${escapeHtml(t('payments.overdue'))})</strong>` : ''}</li>`
            )
            .join('');
        return `<p style="margin:12px 0 4px;font-weight:bold">${escapeHtml(t(GROUP_HEADINGS[group]))}</p><ul style="margin:0;padding-left:20px">${items}</ul>`;
    })
    .join('\n')}`
        )
        .join('\n');

    const html = `<!doctype html>
<html lang="${escapeHtml(lang)}"><body style="margin:0;padding:24px;background:#faf8f5;font-family:Arial,sans-serif;color:#3d3535">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e8e2dc;border-radius:12px;padding:32px">
<h1 style="margin:0 0 16px;font-weight:400;color:#a85a73">Forever Planner</h1>
<p style="margin:0 0 8px;line-height:1.6">${escapeHtml(intro)}</p>
${htmlSections}
<p style="margin:28px 0"><a href="${escapeHtml(openUrl)}" style="display:inline-block;padding:12px 28px;background:#a85a73;color:#fff;text-decoration:none;border-radius:6px">${escapeHtml(t('reminders.open'))}</a></p>
<p style="font-size:13px;color:#6f6464;line-height:1.5">${escapeHtml(t('reminders.why'))} <a href="${escapeHtml(settingsUrl)}" style="color:#6f6464">${escapeHtml(t('reminders.settings'))}</a> · <a href="${escapeHtml(unsubscribeUrl)}" style="color:#6f6464">${escapeHtml(t('reminders.unsubscribe'))}</a></p>
</div></body></html>`;

    return { to: user.email, lang, subject, text, html, unsubscribeUrl };
};

/**
 * Sends today's summaries. Each person is handled on their own: a failure is logged and that
 * person is not marked, so tomorrow's run tries again, and everyone else still gets theirs.
 * @param {{today?: string, send?: (message: object) => Promise<unknown>, log?: Pick<Console, 'info'|'warn'|'error'>}} [options]
 *   `send` defaults to SMTP (sendReminderEmail); tests pass their own.
 * @returns {Promise<{sent: number, skipped: number, failed: number, configured: boolean}>}
 */
const runReminders = async ({ today = todayIso(), send, log = console } = {}) => {
    if (!send && !isEmailConfigured()) {
        log.warn('Reminders: email is not configured (SMTP_HOST); nothing sent.');
        return { sent: 0, skipped: 0, failed: 0, configured: false };
    }
    const deliver = send ?? sendReminderEmail;
    const result = { sent: 0, skipped: 0, failed: 0, configured: true };
    for (const user of await findReminderCandidates(today)) {
        try {
            const digest = await findReminderDigest(user.id, today);
            if (digest.length === 0) {
                result.skipped += 1;
                continue;
            }
            await deliver(buildReminderMessage(user, digest));
            await markReminded(user.id, today);
            result.sent += 1;
        } catch (error) {
            result.failed += 1;
            log.error(`Reminders: could not send to user ${user.id}: ${error.message}`);
        }
    }
    return result;
};

export { buildReminderMessage, runReminders };
