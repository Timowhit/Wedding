# Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save a wedding's checklist or event-day schedule as a personal template, and fill another wedding with it. Checklist due dates are recalculated from each wedding's date.

**Architecture:** Templates are one table owned by a user, with the items stored as JSONB. Pure helpers in `src/validators/templates.js` normalise items and convert due dates to and from "days before the wedding". `src/models/templates.js` owns the SQL. One controller serves the checklist and schedule actions and the `/templates` account page.

**Tech Stack:** Express 5, EJS, PostgreSQL JSONB, node:test.

**Spec:** `docs/superpowers/specs/2026-11-27-templates-design.md`

## Global Constraints

- **Kinds:** `TEMPLATE_KINDS = ['checklist', 'schedule']`.
- **Limits:** `MAX_TEMPLATES_PER_USER = 100`, `MAX_TEMPLATE_ITEMS = 300`, template name 1–120 characters.
- **Item shapes:**
  - checklist: `{ text, category, daysBefore }`, with `daysBefore` an integer or null
  - schedule: `{ startsAt, endsAt, title, location, notes, contingency }`, with no vendor and no contact
- Every query is scoped by `user_id` (templates) and `wedding_id` (where items are applied). An unknown id, or another user's, gives a 404 via `next()`.
- Applying a checklist: `INSERT … ON CONFLICT (wedding_id, text) DO NOTHING`, then report `{added, skipped}`.
- Saving under an existing (kind, name) replaces that template's items; the flash says "replaced".
- Routes:
  - editor: `POST /checklist/template`, `POST /checklist/from-template`, `POST /schedule/template`, `POST /schedule/from-template`
  - account: `GET /templates`, `POST /templates/:id/rename`, `POST /templates/:id/delete`
- `CLAUDE.md` conventions, en and es strings, works without JS, phone first.

## Review Focus

1. **Due date arithmetic around month ends and DST** (e.g. wedding 2027-03-31, task due 2026-12-31). Expected: whole days, calculated in UTC, round-tripping exactly.
   - Test: Task 1 unit, `daysBefore and dueDateFrom round-trip across month ends`.
2. **A template saved by a planner inside a client's wedding.** Expected: the couple (client) never sees it in their pickers and can't apply it by id.
   - Test: Task 2, `templates are private to the person who saved them`.
3. **A template item whose category was later removed, or corrupt JSON in the items.** Expected: the category becomes Other and broken items are skipped. The page never fails.
   - Test: Task 1 unit, `normalisers skip broken items and map unknown categories`.
4. **Applying to a wedding without a date.** Expected: tasks are added without due dates, and a notice says to set the date.
   - Test: Task 2.
5. **Renaming to a name that already exists for that kind.** Expected: a 400 re-render with a message, and nothing changes.
   - Test: Task 2.

---

### Task 1: Schema, helpers, model

**Files:**

- Create: `src/db/migrations/010_templates.sql`, `src/validators/templates.js`, `src/models/templates.js`
- Modify: `src/constants.js`
- Test: `tests/unit/templates.test.js`, `tests/integration/templates.test.js` (model part)

**Interfaces:**

- Helpers, in `validators/templates.js`:
  - `daysBefore(weddingIso, dueIso) → number|null`
  - `dueDateFrom(weddingIso, days) → string|null`
  - `checklistItemsFrom(tasks, weddingIso) → Item[]`
  - `scheduleItemsFrom(items) → Item[]`
  - `normaliseChecklistItems(raw) → Item[]`
  - `normaliseScheduleItems(raw) → Item[]`
  - `validateTemplateName(body) → {values: {name}, data: {name}, errors}`
- Model, in `models/templates.js`:
  - `findTemplates(userId, kind?) → Promise<Array<{id, kind, name, item_count, updated_at}>>`
  - `findTemplate(id, userId) → Promise<{id, kind, name, items}|null>`
  - `countTemplates(userId) → Promise<number>`
  - `saveTemplate(userId, kind, name, items) → Promise<{id, replaced: boolean}>`
  - `renameTemplate(id, userId, name) → Promise<boolean>` (`@throws` a unique violation)
  - `deleteTemplate(id, userId) → Promise<boolean>`
  - `addChecklistItems(weddingId, items: Array<{text, category, dueDate}>) → Promise<{added, skipped}>`
  - `addScheduleItems(weddingId, items) → Promise<number>`

- [ ] **Step 1: Write failing unit tests**
  - `daysBefore and dueDateFrom round-trip across month ends`
  - `null when either date is missing`
  - `checklistItemsFrom keeps text, category and days before`
  - `scheduleItemsFrom drops vendor and contact`
  - `normalisers skip broken items and map unknown categories`
  - `template names are required and at most 120 characters`

  Then failing model tests:
  - `save replaces under the same kind and name`
  - `addChecklistItems skips existing texts and counts them`
  - `findTemplate is scoped by user`

- [ ] **Step 2: Run them. Expected: FAIL.**
- [ ] **Step 3: Implement.** The migration follows 009's style: the `templates` table, `UNIQUE (user_id, kind, name)`, a CHECK on kind, a CHECK on name length, and the `updated_at` trigger.
- [ ] **Step 4: `npm run check`. Expected: PASS.**
- [ ] **Step 5: Commit `feat: templates schema, helpers and model`.**

### Task 2: Pages and actions

**Files:**

- Create: `src/controllers/templates.js`, `src/views/templates.ejs`, `src/views/partials/template-tools.ejs`
- Modify: `src/controllers/checklist.js` and `src/controllers/schedule.js` (pass the user's templates of that kind and the `templateForm`), `checklist.ejs`, `schedule.ejs`, `settings.ejs` and `planner.ejs` (links to /templates), `src/routes/index.js`, i18n, CSS
- Test: `tests/integration/templates.test.js`

- [ ] **Step 1: Write failing tests**
  - `a planner saves a checklist and fills another wedding with recalculated dates`
  - `applying twice adds nothing new and says how many were skipped`
  - `a wedding without a date gets tasks without due dates and a notice`
  - `schedule templates keep times and drop vendor and contact`
  - `saving under an existing name replaces it`
  - `rename, duplicate name refused, delete`
  - `templates are private to the person who saved them` (another user's id: apply, rename and delete all give 404; the client's picker doesn't list the planner's templates)
  - `viewers cannot save or apply`
  - `saving an empty list is refused`
  - `the template limit is enforced`
- [ ] **Step 2: Run them. Expected: FAIL.**
- [ ] **Step 3: Implement.** A name error re-renders the checklist or schedule page with 400 and the disclosure open. Use the `/templates` page layout from the spec.
- [ ] **Step 4: `npm run check`. Expected: PASS.**
- [ ] **Step 5: Commit `feat: save and apply checklist and schedule templates`.**

### Task 3: Docs, verification, review, PR

- [ ] README (feature, routes, schema) and CLAUDE.md (one line on templates being user-scoped).
- [ ] Browser sweep of `/checklist`, `/schedule` and `/templates` at 1280/390, light/dark, JS on/off.
- [ ] Final review (opus), one fix pass, `npm run check`, push, and a draft PR on `offline-event-day`.
