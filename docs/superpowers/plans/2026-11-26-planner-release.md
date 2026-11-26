# Planner Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Forever Planner into a planner-first product: public landing page with a 300-spot founding offer, planner accounts and dashboard, a `client` role, handover, decisions, event-day schedule, seating chart and colour themes.

**Architecture:** Approach A from the spec: planners are users with `account_type = 'planner'` who own client weddings through the existing `wedding_members` table; `weddings.planner_managed` marks those weddings. Every feature follows the existing layers (routes → controllers → validators/models → EJS views) and `CLAUDE.md`.

**Tech Stack:** Node 22, Express 5, EJS, PostgreSQL (`pg`), `node:test`, ESLint, Prettier.

**Spec:** `docs/superpowers/specs/2026-11-26-planner-release-design.md`

## Global Constraints

- Calls to action say "Start now", never "Sign up" (landing page, `/start`, planner and couple registration title and button).
- Founding offer copy: "40% off for life", first **300** planners; no base price shown.
- Founding numbers 1–300, unique, assigned only in the transaction creating a planner's first planner wedding (new client wedding or accepted handover).
- `CLAUDE.md` rules: ESM, JSDoc on exported model/validator/service/middleware/util functions, parameterized SQL scoped by `wedding_id`, CSRF partial in every form, `return-to` in list forms, every string in `en.js` and `es.js`, no inline script/style/handlers, everything works without JavaScript, 44px targets on narrow screens.
- Every palette passes WCAG AA in light and dark: text ≥ 4.5:1, form borders ≥ 3:1.
- No third-party scripts; screenshots are local static files.
- One migration: `src/db/migrations/008_planner_release.sql`, idempotent.

## Review Focus

1. Two planners finishing their first client wedding at the same moment when 1 spot is left: exactly one gets #300, the other none, no error page.
2. A client or viewer posting directly to owner-only routes (`/settings/invites`, `/settings/members/...`) or a viewer posting a decision answer: refused, data unchanged.
3. A handover invite opened by a couple account or a logged-out visitor: shown the upgrade/start path, never accepted as a couple.
4. Seating a guest on a table from another wedding (forged `table_id`): rejected, guest unchanged.
5. A user whose saved palette is unknown (removed later) or a planner wedding whose owner has no brand palette: falls back to Rose / the user's palette without errors.

Tests for each are listed in the owning task (marked _Review Focus_).

---

### Task 1: Migration, constants and roles

**Files:**

- Create: `src/db/migrations/008_planner_release.sql`
- Modify: `src/constants.js`, `src/models/weddings.js`, `src/middleware/wedding.js`, `src/validators/weddings.js`
- Test: `tests/integration/collaboration.test.js`

**Interfaces:**

- Produces (constants): `ACCOUNT_TYPES = ['couple','planner']`, `FOUNDING_SPOTS = 300`, `FOUNDING_DISCOUNT_PCT = 40`, `PALETTES = ['rose','sage','navy','champagne','slate']`, `THEME_MODES = ['auto','light','dark']`.
- Produces (models/weddings.js): `MEMBER_ROLES` adds `'client'`; `assignableRoles(wedding) → string[]` (`['client','editor','viewer']` when `wedding.planner_managed`, else `['editor','viewer']`); `findWeddingForMember`/`findWeddingsForUser` also return `planner_managed` and `owner_brand_palette` (the owner's `users.brand_palette` when the owner is a planner, else null).
- Produces (middleware/wedding.js): `ROLE_RANK = { viewer: 1, client: 2, editor: 2, owner: 3 }`; locals `isPlannerWedding`, `canAnswerDecisions` (planner wedding: role `client`; own wedding: rank ≥ editor), `canAskDecisions` (rank ≥ 2 and role ≠ `client` in planner weddings; any editor/owner otherwise).

**Migration contents:** `users`: `account_type TEXT NOT NULL DEFAULT 'couple' CHECK`, `founding_number INTEGER UNIQUE CHECK (founding_number BETWEEN 1 AND 300)`, `business_name TEXT`, `theme_palette TEXT NOT NULL DEFAULT 'rose'`, `theme_mode TEXT NOT NULL DEFAULT 'auto'`, `brand_palette TEXT`. `weddings.planner_managed BOOLEAN NOT NULL DEFAULT FALSE`. Replace `wedding_members_role_check` with `('owner','editor','client','viewer')` and `wedding_invites_role_check` with `('editor','client','viewer','planner')`. New tables `decisions`, `schedule_items`, `seating_tables`; `guests.table_id` (FK `seating_tables` `ON DELETE SET NULL`), `guests.group_name`. Columns per the spec. A single-row `founding_counter (id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id), next_number INTEGER NOT NULL DEFAULT 1)` seeded with one row (`ON CONFLICT DO NOTHING`).

- [ ] **Step 1:** Write failing test `'a planner wedding offers the client role; a couple wedding does not'`: owner of an own wedding posts `/settings/invites {role:'client'}` → 400; after `UPDATE weddings SET planner_managed = true` the same post → 302 and settings shows the role option `Client`.
- [ ] **Step 2:** Run `TEST_DB_URL=… node --test tests/integration/collaboration.test.js`, expect FAIL.
- [ ] **Step 3:** Write the migration, constants, `assignableRoles`, role ranks, locals; `validateInvite(body, wedding)` uses `assignableRoles(wedding)`; settings view lists roles from a new local `inviteRoles`.
- [ ] **Step 4:** Run the migration on a fresh DB twice (idempotent) and the test file; expect PASS. Run `npm run check`.
- [ ] **Step 5:** Commit `Add planner release schema, client role and role helpers`.

### Task 2: Themes

**Files:**

- Create: `src/themes.js`, `scripts/build-themes.js`, `public/css/themes.css` (generated, committed), `tests/unit/themes.test.js`
- Modify: `src/views/partials/head.ejs`, `src/app.js` (locals), `src/controllers/settings.js`, `src/views/settings.ejs`, `src/models/users.js`, `src/validators/auth.js`, `src/middleware/auth.js` (session user gets `themePalette`, `themeMode`, `accountType`, `brandPalette`, `foundingNumber`, `businessName`)

**Interfaces:**

- Produces: `PALETTE_TOKENS: Record<palette, {light: Tokens, dark: Tokens}>` with the token names already in `main.css` (`--primary`, `--primary-hover`, `--primary-soft`, `--secondary`, `--secondary-hover`, `--accent`, `--bg`, `--surface`, `--surface-2`, `--text`, `--text-muted`, `--border`, `--field-border`, `--danger`, `--success`, plus the soft variants); `renderThemesCss() → string`; `resolveTheme({ user, wedding }) → { palette, mode }` (brand palette of a planner wedding's owner wins; unknown values fall back to `rose`/`auto`).
- Produces (models/users.js): `updateAppearance(id, { palette, mode })`, `updateBusiness(id, { businessName, brandPalette })`.
- Produces (validators): `validateAppearance(body) → { values, data:{palette,mode}, errors }`, `validateBusiness(body) → { values, data:{businessName, brandPalette|null}, errors }`.
- Routes: `POST /settings/appearance` (member), `POST /settings/business` (planner accounts only; others 404).

`<html data-palette data-mode>`; `themes.css` holds `[data-palette=x]` light tokens, `[data-palette=x][data-mode=dark]` and `@media (prefers-color-scheme: dark) { [data-palette=x][data-mode=auto] }` dark tokens. Rose values equal today's `main.css` tokens; `main.css` keeps its `:root` defaults.

- [ ] **Step 1:** Failing unit tests: `'every palette passes AA in both modes'` (text/bg, text/surface, text-muted/bg, text-muted/surface-2, primary/surface, white or #1b1718 on primary button per mode, primary-hover/primary-soft ≥ 4.5; field-border vs surface and bg ≥ 3); `'themes.css is up to date'` (`readFile(public/css/themes.css) === renderThemesCss()`); `'resolveTheme prefers the planner brand palette and falls back safely'` (_Review Focus 5_: unknown palette → `rose`, unknown mode → `auto`, own wedding ignores brand).
- [ ] **Step 2:** Run `node --test tests/unit/themes.test.js`, expect FAIL.
- [ ] **Step 3:** Implement `src/themes.js`, the build script (`npm run build:themes`), regenerate CSS, head attributes, settings forms (Appearance with swatches; Business for planners), models, validators, i18n keys.
- [ ] **Step 4:** Integration test `'appearance and brand palette apply'`: couple saves `sage`/`dark` → page has `data-palette="sage" data-mode="dark"`; planner with brand `navy` → client in the planner wedding sees `data-palette="navy"`. Run all tests, `npm run check`.
- [ ] **Step 5:** Commit `Add colour themes and planner brand palette`.

### Task 3: Planner accounts, founding numbers and "Start now"

**Files:**

- Create: `src/models/founding.js`, `src/views/start.ejs`, `tests/integration/planner.test.js`
- Modify: `src/controllers/auth.js`, `src/views/register.ejs`, `src/models/users.js`, `src/routes/index.js`, `src/controllers/settings.js`, `src/views/settings.ejs`, `src/services/google.js` usage

**Interfaces:**

- Produces: `claimFoundingNumber(client, userId) → Promise<number|null>` (locks the counter row `FOR UPDATE`; returns null when the user already has one or `next_number > FOUNDING_SPOTS`); `countFoundingSpotsLeft() → Promise<number>`; `upgradeToPlanner(userId) → Promise<Object>` in `models/users.js`; `createUser` accepts `accountType`, `businessName`.
- Routes: `GET /start`; `GET /register?as=planner|couple`; `POST /register` reads hidden `as`; `POST /settings/become-planner` (couple accounts); `GET /auth/google?as=planner` stores `req.session.signupAs = 'planner'`.

- [ ] **Step 1:** Failing tests in `planner.test.js`: `'planner sign-up has no wedding and no founding number yet'` (register as planner with business name → redirect `/planner`; DB `account_type='planner'`, `founding_number IS NULL`, 0 memberships); `'start page uses Start now wording'` (`/start` and `/register?as=planner` contain "Start now", not "Sign up"); `'a couple can become a planner and keeps their wedding unchanged'` (`planner_managed` stays false); `'claimFoundingNumber never exceeds 300 under concurrency'` (_Review Focus 1_: set `next_number = 300`, run 5 claims in parallel transactions → exactly one returns 300, others null, no throw).
- [ ] **Step 2:** Run the file, expect FAIL.
- [ ] **Step 3:** Implement; registration as planner skips `createWedding`; redirects planners to `/planner` after login; Google intent upgrades an existing couple via `upgradeToPlanner` and clears `signupAs`.
- [ ] **Step 4:** Run tests and `npm run check`; expect PASS.
- [ ] **Step 5:** Commit `Add planner accounts, founding spots and Start now flow`.

### Task 4: Planner dashboard and client weddings

**Files:**

- Create: `src/controllers/planner.js`, `src/models/planner.js`, `src/views/planner.ejs`
- Modify: `src/routes/index.js`, `src/views/partials/header.ejs` ("All weddings" nav item for planners), `src/middleware/auth.js` (`requirePlanner`)

**Interfaces:**

- Consumes: `claimFoundingNumber`, `createWedding`.
- Produces: `findPlannerOverview(userId, { q, when: 'upcoming'|'past'|'all' }) → Promise<Array<{id,name,wedding_date,role,deadlines: Array<{kind:'task'|'decision', title, due_date, overdue}>, open_decisions, changes_requested, spent, budget_limit, guests_total, guests_confirmed}>>`; `findPlannerWorkload(userId) → {weddingsThisMonth, openDecisions, overdueTasks}`; `createClientWedding(plannerId, {name, weddingDate}) → {wedding, foundingNumber|null}` (one transaction: create, set `planner_managed`, claim).
- Routes: `GET /planner`, `POST /planner/weddings`, `POST /planner/weddings/:id/open` (switch active and redirect `/`). All `requirePlanner`.

- [ ] **Step 1:** Failing tests: `'first client wedding claims founding #1 and shows it'`; `'second client wedding does not claim another number'`; `'overview lists deadlines, decisions and budget per wedding with filters'` (two weddings, one past; `?when=past` shows only the past one; `?q=` filters by name); `'non-planners get 404 on /planner'`.
- [ ] **Step 2:** Run, expect FAIL.
- [ ] **Step 3:** Implement models (aggregate queries scoped by memberships of the planner), controller, view (cards, workload summary, filters as GET form, "Add a client wedding" add-panel, founding message), nav item.
- [ ] **Step 4:** Run tests and `npm run check`.
- [ ] **Step 5:** Commit `Add planner dashboard and client weddings`.

### Task 5: Handover

**Files:**

- Modify: `src/models/invites.js`, `src/controllers/invites.js`, `src/controllers/settings.js`, `src/views/settings.ejs`, `src/views/invite.ejs`, `src/routes/index.js`
- Test: `tests/integration/planner.test.js`

**Interfaces:**

- Produces: `acceptHandover(invite, plannerId) → Promise<{outcome:'handed-over'|'unavailable', foundingNumber:number|null}>` (one transaction: mark used, upsert planner as owner, previous owner and editors → client, `planner_managed = true`, claim founding number).
- Routes: `POST /settings/handover` (owner of a non-planner wedding; requires `confirm=yes`).

- [ ] **Step 1:** Failing tests: `'a couple hands their wedding to a planner'` (roles after: planner owner, couple owner + editor partner → client, viewer stays; `planner_managed` true; planner founding number assigned); `'couple accounts and visitors are offered the planner path'` (_Review Focus 3_: couple opening the link sees "Start now as a planner"/upgrade, POST accept → redirect back, nothing changes); `'planner weddings cannot be handed over'`; `'clients cannot use owner routes'` (_Review Focus 2_: client posts `/settings/invites` and `/settings/members/:id/delete` → redirected, unchanged).
- [ ] **Step 2:** Run, expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run tests and `npm run check`.
- [ ] **Step 5:** Commit `Add handover from couples to planners`.

### Task 6: Decisions

**Files:**

- Create: `src/models/decisions.js`, `src/controllers/decisions.js`, `src/validators/decisions.js`, `src/views/decisions.ejs`, `src/views/edit-decision.ejs`, `tests/integration/decisions.test.js`, `tests/unit` additions in `validators.test.js`
- Modify: `src/routes/index.js`, header nav, dashboard (count for answerers), `src/models/planner.js` uses decisions

**Interfaces:**

- Produces: `findDecisions(weddingId)`, `findDecision(id, weddingId)`, `createDecision(weddingId, userId, {title, details, dueDate})`, `updateDecision(id, weddingId, {...})`, `answerDecision(id, weddingId, userId, {status:'approved'|'changes_requested', comment})`, `reopenDecision(id, weddingId)`, `deleteDecision(id, weddingId)`, `countOpenDecisions(weddingId)`; `validateDecision(body)`, `validateAnswer(body)` (comment required for `changes_requested`).
- Routes: `GET /decisions` member; `POST /decisions`, `GET|POST /decisions/:id/edit`, `POST /decisions/:id/reopen`, `POST /decisions/:id/delete` (askers); `POST /decisions/:id/answer` (answerers).

- [ ] **Step 1:** Failing tests: planner asks, client approves and requests changes with comment; comment required for changes; viewer answer → refused (_Review Focus 2_); planner cannot answer in a planner wedding; both partners can answer in an own wedding; reopen clears answer; dashboard shows "decisions waiting for you".
- [ ] **Step 2:** Run, expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run tests and `npm run check`.
- [ ] **Step 5:** Commit `Add decisions for couples to approve`.

### Task 7: Event-day schedule

**Files:**

- Create: `src/models/schedule.js`, `src/controllers/schedule.js`, `src/validators/schedule.js`, `src/views/schedule.ejs`, `src/views/edit-schedule-item.ejs`, `tests/integration/schedule.test.js`
- Modify: routes, nav, `public/css/main.css` (`@media print`)

**Interfaces:**

- Produces: `findScheduleItems(weddingId)` (joins vendor name/phone of the same wedding), `createScheduleItem`, `updateScheduleItem`, `deleteScheduleItem`; `validateScheduleItem(body, vendorIds)` (times `HH:MM` 00:00–23:59; end ≥ start when both set; vendor id must be in `vendorIds`).
- Routes: `GET /schedule` (member; `?print=1` adds a print layout class), `POST /schedule`, `GET|POST /schedule/:id/edit`, `POST /schedule/:id/delete` (editor rank).

- [ ] **Step 1:** Failing tests: items sorted by time; vendor phone rendered as `tel:`; forged vendor id from another wedding → 400; end before start → 400; deleting the vendor clears the link; print view has no nav.
- [ ] **Step 2–4:** Run (FAIL), implement, run tests and `npm run check`.
- [ ] **Step 5:** Commit `Add event-day schedule`.

### Task 8: Seating chart and guest groups

**Files:**

- Create: `src/models/seating.js`, `src/controllers/seating.js`, `src/validators/seating.js`, `src/views/seating.ejs`, `tests/integration/seating.test.js`
- Modify: guests model/validator/views (group field), routes, nav, `public/js/app.js` (drag and drop), `main.css`

**Interfaces:**

- Produces: `findTablesWithGuests(weddingId) → Array<{id,name,seats,used,guests}>` (plus-one counts 2; declined excluded), `findUnseatedGuests(weddingId, group|null)`, `createTable`, `updateTable`, `deleteTable`, `assignGuestToTable(guestId, weddingId, tableId|null) → boolean` (false when the table is not in the wedding); `validateTable(body)` (name ≤ 80, seats 1–30, duplicate name → `seating.duplicate`).
- Routes: `GET /seating` (member, `?group=`), `POST /seating/tables`, `POST /seating/tables/:id/edit`, `POST /seating/tables/:id/delete`, `POST /seating/guests/:id` (editor rank, field `table_id`, empty = unseat).

- [ ] **Step 1:** Failing tests: seats used counts plus-ones as 2; over capacity flagged; declined guests not listed; forged table from another wedding → error flash, unchanged (_Review Focus 4_); deleting a table unseats its guests; group filter; guest form saves group.
- [ ] **Step 2–4:** Run (FAIL), implement (drag and drop submits the same form), run tests and `npm run check`.
- [ ] **Step 5:** Commit `Add seating chart and guest groups`.

### Task 9: Landing page and screenshots

**Files:**

- Create: `src/controllers/home.js`, `src/views/landing.ejs`, `scripts/screenshots.cjs` (Playwright; seeds a demo planner with two weddings and captures images), `public/images/landing-*.png`
- Modify: routes (`GET /` → landing when logged out, dashboard otherwise), `main.css`, i18n

**Interfaces:**

- Consumes: `countFoundingSpotsLeft()`.

- [ ] **Step 1:** Failing tests: logged-out `/` returns 200 with "Start now", "40%", "300", spots-left count from DB, a "Coming next" heading, no `<script src="http` and no "Sign up"; with counter past 300 it shows the offer-ended text; logged-in `/` still shows the dashboard.
- [ ] **Step 2–4:** Run (FAIL), implement and capture screenshots, run tests and `npm run check`.
- [ ] **Step 5:** Commit `Add public landing page for planners`.

### Task 10: Docs and final verification

**Files:** `README.md` (features, routes, roles, founding offer, themes, new env-free behaviour), `CLAUDE.md` (role helpers, themes build), plan checkboxes.

- [ ] **Step 1:** Update docs.
- [ ] **Step 2:** `npm run check` with `TEST_DB_URL`; Playwright pass at 1280/390 in light/dark across new pages (no console/CSP errors, no horizontal scroll, no targets < 44px, works without JS).
- [ ] **Step 3:** Fresh reviewer pass over the whole branch; fix findings.
- [ ] **Step 4:** Commit, push, update PR #3 description, mark ready when CI is green.
