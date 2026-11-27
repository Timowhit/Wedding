import nodemailer from 'nodemailer';

/**
 * Transactional email over SMTP (any provider: Gmail app password, Resend, Mailgun, ...).
 * Without SMTP_HOST nothing is sent and callers fall back to showing the invite link.
 */

/** @returns {boolean} */
const isEmailConfigured = () => Boolean(process.env.SMTP_HOST);

let transporter = null;
const getTransporter = () => {
    transporter ??= nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });
    return transporter;
};

/**
 * Escapes text for an HTML email body. Names come from users, so they must never be inserted raw.
 * @param {unknown} value
 * @returns {string}
 */
const escapeHtml = (value) =>
    String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

/**
 * Sends a wedding invite.
 * @param {{to: string, inviteUrl: string, subject: string, lines: string[], buttonLabel: string}} message
 *        Already translated text; `lines` become paragraphs.
 * @returns {Promise<boolean>} True when the email was handed to the SMTP server, false when email is not configured.
 */
const sendInviteEmail = async ({ to, inviteUrl, subject, lines, buttonLabel }) => {
    if (!isEmailConfigured()) return false;

    const paragraphs = lines.map((line) => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(line)}</p>`);
    const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#faf8f5;font-family:Arial,sans-serif;color:#3d3535">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e8e2dc;border-radius:12px;padding:32px">
<h1 style="margin:0 0 24px;font-weight:400;color:#a85a73">Forever Planner</h1>
${paragraphs.join('\n')}
<p style="margin:24px 0"><a href="${escapeHtml(inviteUrl)}" style="display:inline-block;padding:12px 28px;background:#a85a73;color:#fff;text-decoration:none;border-radius:6px">${escapeHtml(buttonLabel)}</a></p>
<p style="font-size:13px;color:#6f6464;word-break:break-all">${escapeHtml(inviteUrl)}</p>
</div></body></html>`;

    await getTransporter().sendMail({
        from: `Forever Planner <${process.env.FROM_EMAIL || 'noreply@localhost'}>`,
        to,
        subject,
        text: `${lines.join('\n\n')}\n\n${inviteUrl}`,
        html
    });
    return true;
};

/**
 * Sends a daily summary built by services/reminders.js, with one-click unsubscribe headers.
 * @param {{to: string, subject: string, text: string, html: string, unsubscribeUrl: string}} message
 * @returns {Promise<boolean>} False when email is not configured.
 */
const sendReminderEmail = async ({ to, subject, text, html, unsubscribeUrl }) => {
    if (!isEmailConfigured()) return false;
    await getTransporter().sendMail({
        from: `Forever Planner <${process.env.FROM_EMAIL || 'noreply@localhost'}>`,
        to,
        subject,
        text,
        html,
        headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
        }
    });
    return true;
};

export { isEmailConfigured, sendInviteEmail, sendReminderEmail, escapeHtml };
