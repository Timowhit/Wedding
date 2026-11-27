# Reminders: design

Status: built without a separate approval round, at the product owner's request ("keep building on top like you are doing") · 2026-11-27 · branch `reminders` (on `templates`, PR #6)

Every choice below that the product owner did not make is marked _(call)_.

## Why

This is the product owner's fourth priority. The app already shows what is overdue, but only to someone who opens it. The notes.txt idea is "configurable reminders for meetings, deadlines, payments, and unanswered questions". A planner juggling twenty weddings needs the app to come to them, and couples need a nudge when a decision is waiting on them.

Success means one short email in the morning, only when something needs attention. It lists what is overdue or due this week across every wedding the person helps run.

## Goals

- **A daily digest email per person**, sent only when there is something to report. It lists, per wedding:
  - **payments** of booked vendors that are overdue or due in the next 7 days
  - **checklist tasks** that are overdue or due in the next 7 days
  - **decisions waiting on you:** open decisions for people who answer, and decisions sent back for people who ask, using the existing `decisionPermissions`
- **A Settings switch:** "Email me a daily summary". Every email has a one-click unsubscribe link that works without signing in, plus the `List-Unsubscribe` header.
- **Sent by a script**, `npm run reminders`, meant for a once-a-day scheduled job (a Render Cron Job). Running it twice on the same day sends nothing new.

## Non-goals

- Reminders for meetings and appointments: the app has no calendar yet.
- Choosing which kinds, how far ahead, or what time. One fixed daily digest for now. _(call)_ Customisation can come once people use it.
- Text messages or push notifications.
- Emails to viewers. A viewer can't act on anything, so viewers get none.

## Anti-goals

- **Spam.** No email when there's nothing due. At most one per person per day. An unsubscribe that works in one click, without a password.
- Leaking another wedding's details. The digest only covers weddings where the person is owner, editor or client.
- A failure for one person (a bad address, the SMTP server refusing) stopping everyone else's digest.

## Approaches considered

1. **A command-line script run by an external daily scheduler. Chosen.** It is easy to reason about and test, and survives restarts and multiple web instances. Render offers Cron Jobs for this.
2. **A timer inside the web server.** Rejected: Render's free web services sleep, several instances would send twice, and a restart around the sending time would skip a day.
3. **A third-party email-automation service.** Rejected: a new vendor and new costs, and the data would leave the app.

## Details

- **Data:** migration `011_reminders.sql` adds to `users`:
  - `reminder_emails BOOLEAN NOT NULL DEFAULT TRUE` _(call: on by default, because people signed up for a planning tool. Every email has an unsubscribe link, and the Settings switch says what it does.)_
  - `reminders_sent_on DATE`
- **Who gets one:** users with `reminder_emails` on and `reminders_sent_on` not today, who are owner, editor or client of at least one wedding with something to report.
- **"Today"** is `todayIso()` (`APP_TIME_ZONE`). The window is today to today + 7 days, plus everything overdue.
- **Building it:** `findReminderDigest(userId, today)` in `src/models/reminders.js` returns weddings, each with payments, tasks and decisions. It reuses the same status rule as Payments due (Booked vendors only).
- **Sending:** `runReminders({ today, send, log })` in `src/services/reminders.js` handles everyone due today:
  - it builds each digest, sends it, then sets `reminders_sent_on = today`
  - one person's failure is logged and doesn't stop the others
  - it returns `{ sent, skipped, failed }`
  - the `send` function is injectable, so tests capture the messages instead of sending email
- **Email:** sent with the existing SMTP settings (`SMTP_*`, `FROM_EMAIL`), in the person's language (`users.language`). It has an HTML and a plain-text part.
  - Subject: "3 things need attention today".
  - One section per wedding with a link to the wedding (`APP_URL`). The planner dashboard needs signing in, so the link goes to `/planner` for planners and `/` for couples.
  - Footer: why they got it, a link to Settings, and the unsubscribe link.
- **Unsubscribe:** `/reminders/unsubscribe?u=<userId>&t=<token>`, where the token is an HMAC-SHA256 of the user id with `SESSION_SECRET`. It never expires and is compared in constant time.
  - GET shows a confirmation page with a button, because link scanners prefetch GETs.
  - POST switches reminders off and shows "You won't get daily summaries any more".
  - `List-Unsubscribe` points at the same URL, with `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
  - These routes are exempt from CSRF, because the HMAC token is the proof.
- **Without SMTP:** the script logs "email is not configured" and exits 0 without marking anyone as sent.
- **Script:** `scripts/send-reminders.js` (`npm run reminders`) runs the migrations' pool, calls `runReminders`, logs the totals and exits non-zero only if something unexpected fails.

## Constraints

All `CLAUDE.md` conventions, en and es strings, named constants (`REMINDER_WINDOW_DAYS = 7`), and `npm run check`.

## Testing

- `findReminderDigest`:
  - covers the window and overdue
  - booked vendors only
  - viewers get nothing
  - answer and ask decision roles
  - done tasks and paid payments left out
- `runReminders`:
  - sends only to people with something due
  - a second run on the same day sends nothing
  - someone switched off gets nothing
  - one failure doesn't stop the rest
  - the messages are in the person's language and escape names
- Unsubscribe:
  - a bad token gives 404
  - GET doesn't change anything
  - POST switches it off
  - the one-click POST works without a session or CSRF token
- Settings: the switch saves.
- Without SMTP: nothing is marked as sent.

## Left to the builder

Exact copy and the email's layout (keep the invite email's look).
