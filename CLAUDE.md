# Forever Planner: conventions

Server-rendered Express 5 + EJS + PostgreSQL app. Read README.md for setup, routes and the security model.

## Commands

- `npm run dev`: run locally (needs `.env`, see `.env.example`)
- `npm run migrate`: apply new migrations
- `npm run check`: lint + format check + tests. Must pass before a change is done.
- `npm run build:themes`: regenerate `public/css/themes.css` after editing `src/themes.js` (a test fails if it is stale; never edit the CSS file by hand).
- Integration tests need `TEST_DB_URL` pointing at a throwaway database (it is wiped).

## Code style

- ES modules with `.js` extensions on relative imports. 4-space indentation, single quotes, semicolons (Prettier enforces this).
- JSDoc on every exported model, validator, service, middleware and utility function: what it does, `@param`, `@returns`, and `@throws` for expected database errors.
- Named constants instead of magic numbers (limits, durations, PostgreSQL error codes via `PG_ERRORS`).
- Comments explain _why_, not what. No "FIX:" changelog comments: history belongs in git.
- `console.info/warn/error` only (ESLint blocks `console.log`).

## Layers

- `routes/index.js` is the single list of routes; every route states its access level (`account`, `planner`, `member`, `editor`, `owner`, `asker`/`answerer`). Settings pages use the `account` chain (`loadOptionalWedding`) so they work for a planner with no wedding yet.
- Roles: compare with `ROLE_RANK` in `middleware/wedding.js` (`client` ranks with `editor`); never test role strings for "can edit". Who asks and answers decisions comes from `decisionPermissions(wedding)` (it depends on `planner_managed`). Offer roles through `assignableRoles(wedding)`, so `client` only appears in planner weddings.
- Offline: the list of pages saved for offline lives in `public/sw.js` (`EVENT_PATHS`); only read-only pages belong there. Bump its `VERSION` when cached assets change meaning.
- Money: every vendor/budget figure comes from `models/payments.js` (status rule: Booked counts, Declined counts only what was paid). Don't sum amounts elsewhere. Day-based rules use `todayIso()` (`utils/today.js`, `APP_TIME_ZONE`), not `new Date()` or `CURRENT_DATE`.
- Themes: page palette comes from `resolveTheme({ user, wedding })`; palettes and modes are listed in `PALETTES`/`THEME_MODES` in `constants.js`.
- Controllers: validate -> call models/services -> render or redirect. No SQL. On success, `setFlash` then redirect (post/redirect/get). On validation errors, re-render the page with status 400 and the submitted values.
- Validators (`src/validators`) are pure and return `{ values, data, errors }`, where errors are `{ field, key, vars? }` and `key` is an i18n key.
- Models own all SQL: parameterized, scoped by `wedding_id`, explicit column lists (never `SELECT *` for users: it would load `password_hash`).
- Services wrap external APIs, use `fetchJson` (timeouts), and throw `ServiceError`. Never trust URLs from forms: look details up by id on the server.
- Schema changes: a new numbered, idempotent file in `src/db/migrations/`. Never edit a shipped migration.

## Views

- Escape with `<%= %>`. Use `<%- %>` only for `include()` and the helpers in `utils/view-helpers.js`.
- Every form includes `partials/csrf-field`. Forms in list pages also include `partials/return-to` so filters survive.
- No inline `<script>`, event handlers or `style=""` (the CSP blocks them, and tests check every page). Styles go in `public/css/main.css` using its tokens; behavior goes in `public/js/app.js`, and every feature must work without it.
- Hide controls a viewer cannot use (`canEdit`, `isOwner`), but the route guards are what enforce access.
- Accessibility: every input has a label, errors use `fieldState()` for `aria-invalid`/`aria-describedby`, icon-only or repeated buttons get an `aria-label` naming the item.

## Translations

- Every user-facing string goes through `t()` with a key in **both** `src/i18n/en.js` and `src/i18n/es.js`. Tests fail on missing, unused or mismatched keys and placeholders.
- Values stored in the database (categories, statuses) are translated with prefixed keys, e.g. `t(\`rsvp.${guest.rsvp}\`)`.
- `*word*` in a heading string is rendered as `<em>`; translations must not contain HTML.
