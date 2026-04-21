/**
 * @file utils/email.js
 * @description Nodemailer wrapper for transactional emails.
 *
 * Required env vars (when SMTP_HOST is set):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 *   FROM_EMAIL  (defaults to noreply@foreverplanner.com)
 *   APP_URL     (defaults to http://localhost:3000)
 *
 * Works with any SMTP provider:
 *   Gmail:    smtp.gmail.com:587  (use an App Password)
 *   Resend:   smtp.resend.com:465
 *   Mailgun:  smtp.mailgun.org:587
 *   SendGrid: smtp.sendgrid.net:587
 *
 * If SMTP_HOST is not set the function logs a warning and returns
 * without throwing, so development works without email configured.
 */

"use strict";

const nodemailer = require("nodemailer");

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@foreverplanner.com";

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * Send a wedding invite email.
 * @param {{ to, inviterName, weddingName, token, role }} opts
 */
async function sendInviteEmail({ to, inviterName, weddingName, token, role }) {
  if (!process.env.SMTP_HOST) {
    /* eslint-disable-next-line no-console */
    console.warn(
      `[email] SMTP not configured — invite link: ${APP_URL}/invite.html?token=${token}`,
    );
    return;
  }

  const inviteUrl = `${APP_URL}/invite.html?token=${token}`;
  const roleLabel = role === "viewer" ? "view" : "edit";
  const transporter = createTransport();

  await transporter.sendMail({
    from: `Forever Planner 💍 <${FROM_EMAIL}>`,
    to,
    subject: `${inviterName} invited you to help plan "${weddingName}" 💍`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
</head>
<body style="margin:0;padding:0;background:#faf8f5;font-family:'DM Sans',sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:12px;
              border:1px solid #e8e2dc;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.09)">

    <!-- Header -->
    <div style="background:#c9748f;padding:28px 32px;text-align:center">
      <h1 style="color:#fff;font-size:1.6rem;margin:0;font-weight:300;letter-spacing:2px">
        💍 Forever Planner
      </h1>
    </div>

    <!-- Body -->
    <div style="padding:32px">
      <p style="color:#3d3535;font-size:1rem;line-height:1.6;margin:0 0 16px">
        <strong>${inviterName}</strong> has invited you to help plan
        <strong>${weddingName}</strong>.
      </p>
      <p style="color:#8a7f7f;font-size:.9rem;line-height:1.6;margin:0 0 28px">
        You'll be able to <strong>${roleLabel}</strong> the wedding plans together
        in real time — guests, budget, vendors, music, and more.
      </p>

      <div style="text-align:center;margin-bottom:28px">
        <a href="${inviteUrl}"
           style="display:inline-block;padding:14px 32px;background:#c9748f;
                  color:#fff;text-decoration:none;border-radius:6px;
                  font-weight:500;font-size:.95rem;letter-spacing:.5px">
          Accept Invitation
        </a>
      </div>

      <p style="color:#8a7f7f;font-size:.8rem;line-height:1.5;margin:0">
        Or paste this link in your browser:<br>
        <a href="${inviteUrl}" style="color:#c9748f;word-break:break-all">${inviteUrl}</a>
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f4f0ec;padding:16px 32px;border-top:1px solid #e8e2dc">
      <p style="color:#8a7f7f;font-size:.75rem;margin:0;text-align:center">
        This invite expires in 7 days. If you weren't expecting this, you can safely ignore it.
      </p>
    </div>
  </div>
</body>
</html>`,
    text: `${inviterName} invited you to help plan "${weddingName}".\n\nAccept here: ${inviteUrl}\n\nExpires in 7 days.`,
  });
}

module.exports = { sendInviteEmail };
