# Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A daily digest email, only when something needs attention, sent by `npm run reminders` from a once-a-day job. It comes with a Settings switch and a one-click unsubscribe.

**Architecture:**

- **Model:** `src/models/reminders.js` builds each person's digest with the same status rules as Payments due and decisions.
- **Service:** `src/services/reminders.js` runs the daily batch with an injectable sender.
- **Email:** `src/services/email.js` gets `sendReminderEmail`.
- **Web side:** a Settings switch, plus HMAC-signed unsubscribe pages that are exempt from CSRF.

**Tech Stack:** Express 5, EJS, PostgreSQL, nodemailer (already used), node:crypto, node:test.

**Spec:** `docs/superpowers/specs/2026-11-27-reminders-design.md`

## Global Constraints

- `REMINDER_WINDOW_DAYS = 7`. "Today" is `todayIso()`.
- **Roles that get reminders:** owner, editor and client. A viewer gets none.
- **Decisions:**
  - for people who can answer (`decisionPermissions(wedding).canAnswer`): `status = 'open'`
  - for people who can ask: `status = 'changes_requested'`
- **Payments:** Booked vendors only, unpaid, due on or before today + 7.
- **Tasks:** not done, due on or before today + 7.
- **Once per day:** `users.reminders_sent_on`. Never sent when `reminder_emails` is false.
- **Unsubscribe token:** `HMAC-SHA256(SESSION_SECRET, 'unsubscribe:' + userId)` as hex, compared with `timingSafeEqual`.
- **No SMTP:** nothing is sent and nobody is marked.
- `CLAUDE.md` conventions and en/es strings.

## Review Focus

1. **A person who is a viewer of one wedding and an editor of another.** Expected: only the editor wedding appears.
   - Test: Task 1, `viewers get nothing for that wedding`.
2. **SMTP refuses one address.** Expected: the others are still sent, and that person isn't marked (so they're retried tomorrow).
   - Test: Task 2.
3. **A forged or other user's unsubscribe link.** Expected: 404, nothing changes.
   - Test: Task 3.
4. **A wedding or vendor name containing HTML.** Expected: escaped in the HTML part.
   - Test: Task 2.
5. **The script run twice, or at 23:59 and 00:01 across midnight in `APP_TIME_ZONE`.** Expected: at most one email per local day.
   - Test: Task 2, `a second run the same day sends nothing`.

---

### Task 1: Schema, digest model, token

**Files:** create `011_reminders.sql`, `src/models/reminders.js` and `src/utils/unsubscribe.js`; modify `src/constants.js` and `src/models/users.js` (`PUBLIC_COLUMNS` gets `reminder_emails`; add `setReminderEmails(userId, on)`); test in `tests/integration/reminders.test.js` and `tests/unit/utils.test.js`.

**Interfaces:**

- `findReminderCandidates(today) → Promise<Array<{id, email, display_name, language, account_type}>>`
- `findReminderDigest(userId, today) → Promise<Array<{id, name, payments: [...], tasks: [...], decisions: [...]}>>` (weddings with at least one item)
- `markReminded(userId, today) → Promise<void>`
- `unsubscribeToken(userId) → string`, `isUnsubscribeToken(userId, token) → boolean`

Steps:

- [ ] Write the failing tests:
  - `digest covers the next 7 days and anything overdue`
  - `only booked vendors' unpaid payments`
  - `viewers get nothing for that wedding`
  - `decisions follow who answers and who asks`
  - `candidates skip switched-off and already-reminded people`
  - unit: `unsubscribe tokens verify only for their user`
- [ ] Watch them fail.
- [ ] Implement.
- [ ] Run `npm run check`.
- [ ] Commit.

### Task 2: Daily run, email, script

**Files:** create `src/services/reminders.js` and `scripts/send-reminders.js`; modify `src/services/email.js` (`sendReminderEmail({ to, subject, intro, sections, settingsUrl, unsubscribeUrl })`) and `package.json` (`"reminders"`); test in `tests/integration/reminders.test.js`.

**Interface:** `runReminders({ today, send, log }) → Promise<{ sent, skipped, failed }>`. Here `send(message)` receives `{ to, lang, subject, text, html, unsubscribeUrl }`. The default sender is `sendReminderEmail`.

Steps:

- [ ] Write the failing tests:
  - `sends one digest to each person with something due`
  - `a second run the same day sends nothing`
  - `switched-off people get nothing`
  - `one failure doesn't stop the rest and isn't marked`
  - `messages are in the person's language and escape names`
  - `without SMTP the default sender marks nobody`
- [ ] Watch them fail.
- [ ] Implement.
- [ ] Run `npm run check`.
- [ ] Commit.

### Task 3: Settings switch and unsubscribe

**Files:**

- Create `src/controllers/reminders.js` and `src/views/unsubscribe.ejs`.
- Modify:
  - `src/routes/index.js`: `GET`/`POST /reminders/unsubscribe` (public), `POST /settings/reminders` (account)
  - `src/middleware/csrf.js`: exempt `/reminders/unsubscribe` POST
  - `settings.ejs` and `src/controllers/settings.js`
  - i18n
- Test in `tests/integration/reminders.test.js`.

Steps:

- [ ] Write the failing tests:
  - `the settings switch turns reminders off and on`
  - `unsubscribe link: GET asks, POST switches off, without signing in or a CSRF token`
  - `a forged token or another user's id gives 404`
- [ ] Watch them fail.
- [ ] Implement.
- [ ] Run `npm run check`.
- [ ] Commit.

### Task 4: Docs, verification, review, PR

- [ ] README: feature, routes, schema, the Render Cron Job setup, `npm run reminders`. CLAUDE.md: one line.
- [ ] Render a sample digest to HTML and look at it. Run a browser sweep of `/settings` and the unsubscribe page.
- [ ] Final review (opus), one fix pass, `npm run check`, push, and a draft PR on `templates`.
