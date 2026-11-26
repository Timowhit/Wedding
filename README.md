# Forever Planner

A server-rendered wedding planning app. Couples (and the people helping them) track the budget, guest list and RSVPs, vendors, a planning checklist, playlists for every part of the day, and an inspiration board. Several people can plan the same wedding with owner, editor and viewer roles, and the whole app is available in English and Spanish.

## Tech Stack

| Layer      | Technology                                                   |
| ---------- | ------------------------------------------------------------ |
| Runtime    | Node.js 22.9+ (ES modules)                                   |
| Server     | Express 5                                                    |
| Templating | EJS (server-side rendering with partials)                    |
| Database   | PostgreSQL via the `pg` connection pool                      |
| Sessions   | `express-session` stored in PostgreSQL (`connect-pg-simple`) |
| Security   | `helmet` (CSP), CSRF tokens, `express-rate-limit`, scrypt    |
| Sign-in    | Email + password, optional Google (Passport, OAuth only)     |
| Tests      | `node:test` (built in) against a real PostgreSQL database    |
| Quality    | ESLint 9, Prettier, GitHub Actions CI                        |

There is no frontend framework, bundler or TypeScript. `public/js/app.js` is a small progressive-enhancement script; every feature works with JavaScript turned off.

## Features

- **Dashboard**: countdown to the wedding date, a getting-started list for new weddings, totals for every section, pending invitations
- **Budget**: total budget, expenses, spending per category, spent/remaining with an over-budget warning
- **Guests**: RSVP status (changed from a picker on each row), dietary needs, plus-ones, filter by RSVP, edit
- **Vendors**: contact details, booking status (changed from a picker on each row), notes, filter by status, edit
- **Checklist**: tasks with categories and due dates, overdue highlighting, progress, example tasks
- **Music**: Spotify search, playlists for six parts of the day, in-page previews
- **Inspiration**: Unsplash search with photographer credit, a saved board
- **Collaboration**: several weddings per user, email invites and share links, editor/viewer roles, leave a wedding
- **Account**: profile, language, change (or, for Google accounts, set) a password
- English and Spanish everywhere, including validation messages and invite emails
- Light and dark themes, responsive layout, keyboard-visible focus, reduced-motion support

## Getting Started

### Prerequisites

- **Node.js 22.9 or newer.** The scripts use Node's built-in `--env-file-if-exists` flag instead of `dotenv`.
- **PostgreSQL 13 or newer** (local, or a hosted provider that gives you a connection string)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env` (it is gitignored, so never commit it) and fill it in:

```bash
cp .env.example .env
```

| Variable                | Required      | Purpose                                                                                         |
| ----------------------- | ------------- | ----------------------------------------------------------------------------------------------- |
| `DB_URL`                | Yes           | PostgreSQL connection string: `postgresql://user:pass@host:port/db`                             |
| `SESSION_SECRET`        | Yes           | At least 32 random characters; signs the session cookie. The server refuses to start without it |
| `APP_URL`               | In production | Public base URL, e.g. `https://planner.example.com`. Used in invite links and Google sign-in    |
| `NODE_ENV`              | No            | `development` or `production` (defaults to `production`)                                        |
| `PORT`                  | No            | Port the server listens on (defaults to `3000`)                                                 |
| `ENABLE_SQL_LOGGING`    | No            | `true` logs every query with timing. Only takes effect when `NODE_ENV=development`              |
| `DB_CA`                 | No            | Your database provider's CA certificate (PEM text; `\n` sequences are converted to newlines)    |
| `DB_SSL_INSECURE`       | No            | `true` keeps TLS encryption but skips certificate verification                                  |
| `DB_SSL_DISABLE`        | No            | `true` connects without TLS, for a local database. Refused when `NODE_ENV=production`           |
| `GOOGLE_CLIENT_ID`      | No            | Enables "Continue with Google" (with `GOOGLE_CLIENT_SECRET`)                                    |
| `GOOGLE_CLIENT_SECRET`  | No            | See above                                                                                       |
| `SPOTIFY_CLIENT_ID`     | No            | Enables music search (with `SPOTIFY_CLIENT_SECRET`)                                             |
| `SPOTIFY_CLIENT_SECRET` | No            | See above                                                                                       |
| `UNSPLASH_ACCESS_KEY`   | No            | Enables inspiration photo search                                                                |
| `SMTP_HOST`             | No            | Enables invite emails. Also `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL`  |

Generate a session secret with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

**TLS behavior** (see `src/models/db.js`): connections are strict by default. If you hit certificate errors, prefer setting `DB_CA` to your provider's CA. Use `DB_SSL_INSECURE=true` only for troubleshooting, and `DB_SSL_DISABLE=true` only for a database on your own machine.

**Optional services:** every optional integration degrades gracefully. Without Spotify or Unsplash keys, Music and Inspiration are left out of the navigation and dashboard, and their pages (still reachable by URL) explain that search is off; without SMTP, invites are still created and the owner copies the link from the Settings page; without Google keys the Google button is hidden.

**Google sign-in:** in the Google Cloud console, add `<APP_URL>/auth/google/callback` as an authorized redirect URI.

### 3. Create the database schema

```bash
npm run migrate
```

This applies every file in `src/db/migrations/` that has not run yet (tracked in `schema_migrations`), each in its own transaction. It is safe to run on every deploy.

### 4. Run the app

```bash
npm run dev     # development: nodemon, loads .env, restarts on changes
npm start       # production: node server.js (loads .env if present)
```

When it starts correctly you should see `Database connection successful` followed by `Server is running at http://127.0.0.1:3000`. If the database cannot be reached the server exits instead of starting.

## Upgrading from version 1 (the JSON API)

Version 2 replaces the JSON API and static HTML pages with server-rendered pages. Existing data is kept.

1. **Environment:** replace `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` with a single `DB_URL`. Set `SESSION_SECRET` (32+ characters) and, in production, `APP_URL`. `JWT_SECRET`, `JWT_EXPIRES_IN`, `BCRYPT_ROUNDS`, `CORS_ORIGIN` and `RATE_LIMIT_*` are no longer used.
2. **Database:** run `npm run migrate`. Migration `007` adds the `session` table and foreign keys from every feature table to `weddings` (added `NOT VALID`, so existing rows are not checked and the migration cannot fail on old orphaned data).
3. **Google sign-in:** the callback moved from `/api/v1/auth/google/callback` to `/auth/google/callback`. Update the redirect URI in the Google Cloud console.
4. **Passwords:** existing bcrypt hashes keep working. Each user's hash is upgraded to scrypt the next time they sign in.
5. **Logins:** everyone signs in once after the upgrade (JWTs in the browser's `localStorage` are no longer used).
6. **Old invite links** (`/invite.html?token=...`) no longer open directly. Paste them into "Join a wedding" (Settings, or the welcome page); the token is extracted from either link format.

## Routes

All `POST` routes require the session's CSRF token (see Security Notes).

| Method | Path                                        | Access | Description                                        |
| ------ | ------------------------------------------- | ------ | -------------------------------------------------- |
| GET    | `/login`, `/register`                       | Public | Sign-in and sign-up forms                          |
| POST   | `/login`, `/register`                       | Public | Sign in / create an account and its first wedding  |
| POST   | `/logout`                                   | Public | Sign out (new session id)                          |
| GET    | `/auth/google`, `/auth/google/callback`     | Public | Google sign-in round trip                          |
| POST   | `/language`                                 | Public | Change the page language                           |
| GET    | `/invite/:token`                            | Public | Invite page (offers sign-in when needed)           |
| POST   | `/invite/:token/accept`, `/decline`         | Login  | Accept or decline an invite                        |
| GET    | `/welcome`                                  | Login  | Create or join a wedding (users without one)       |
| POST   | `/weddings`                                 | Login  | Create another wedding                             |
| POST   | `/wedding/switch`                           | Login  | Change the active wedding (membership checked)     |
| POST   | `/invites/join`                             | Login  | Open an invite from a pasted link                  |
| GET    | `/`                                         | Member | Dashboard                                          |
| POST   | `/wedding/date`                             | Owner  | Set or clear the wedding date                      |
| GET    | `/budget`                                   | Member | Budget (`?category=` filter)                       |
| POST   | `/budget/limit`, `/budget/expenses`         | Editor | Set the total / add an expense                     |
| POST   | `/budget/expenses/:id/delete`               | Editor | Delete an expense                                  |
| GET    | `/checklist`                                | Member | Checklist (`?status=` and `?category=` filters)    |
| POST   | `/checklist`, `/checklist/examples`         | Editor | Add a task / add the example tasks                 |
| GET    | `/checklist/:id/edit`                       | Editor | Edit form                                          |
| POST   | `/checklist/:id/edit`, `/toggle`, `/delete` | Editor | Save / mark done or not / delete                   |
| GET    | `/guests`                                   | Member | Guest list (`?rsvp=` filter)                       |
| POST   | `/guests`                                   | Editor | Add a guest                                        |
| GET    | `/guests/:id/edit`                          | Editor | Edit form                                          |
| POST   | `/guests/:id/edit`, `/rsvp`, `/delete`      | Editor | Save / set the RSVP status / delete                |
| GET    | `/vendors`                                  | Member | Vendors (`?status=` filter)                        |
| POST   | `/vendors`                                  | Editor | Add a vendor                                       |
| GET    | `/vendors/:id/edit`                         | Editor | Edit form                                          |
| POST   | `/vendors/:id/edit`, `/status`, `/delete`   | Editor | Save / set the booking status / delete             |
| GET    | `/music`                                    | Member | Playlists, and Spotify search with `?q=`           |
| POST   | `/music/tracks`                             | Editor | Add a search result to a section                   |
| POST   | `/music/tracks/:id/delete`                  | Editor | Remove a song                                      |
| POST   | `/music/sections/:slug/clear`               | Editor | Empty one section                                  |
| GET    | `/inspiration`                              | Member | Board, and Unsplash search with `?q=`              |
| POST   | `/inspiration`, `/inspiration/clear`        | Editor | Save a search result / empty the board             |
| POST   | `/inspiration/:id/delete`                   | Editor | Remove a photo                                     |
| GET    | `/settings`                                 | Member | Wedding, members, invites, profile, password       |
| POST   | `/settings/profile`, `/password`, `/leave`  | Member | Save profile / change password / leave the wedding |
| POST   | `/settings/wedding`                         | Owner  | Rename, change date                                |
| POST   | `/settings/invites`                         | Owner  | Create an email invite or a share link             |
| POST   | `/settings/invites/:id/delete`              | Owner  | Revoke an invite                                   |
| POST   | `/settings/members/:userId/role`, `/delete` | Owner  | Change a member's role / remove them               |

**Access levels:** _Member_ = logged in and a member of the active wedding (`requireLogin` + `loadActiveWedding`). _Editor_ = member with the `editor` or `owner` role (`requireEditor`). _Owner_ = the wedding's owner (`requireOwner`). Viewers see every page read-only; forms they cannot use are not rendered, and the routes refuse them anyway.

Record ids are UUIDs checked by `isUuid` before any query. Every query is also scoped to the active wedding, so an id from another wedding behaves exactly like an unknown id: a 404.

## Project Structure

```
server.js                     # Starts the server (refuses to start without the database)
scripts/migrate.js            # npm run migrate
src/
  app.js                      # createApp(): config checks, helmet, sessions, middleware order, 404/500
  routes/index.js             # Every route and its access level
  middleware/
    auth.js                   # refreshSessionUser, setCurrentUser, requireLogin
    wedding.js                # loadActiveWedding, requireEditor, requireOwner
    csrf.js                   # CSRF token check for every POST
    i18n.js                   # Picks the language; exposes t() and formatters to views
    rateLimit.js              # Login, registration, password, invite and search limits
  controllers/                # Read input, call validators/models/services, render or redirect. No SQL.
  validators/                 # Pure functions: form body -> { values, data, errors }
  models/                     # All SQL (parameterized), one file per area; db.js owns the pool
  services/                   # Spotify, Unsplash, email, Google sign-in
  utils/                      # Passwords, sessions, flash messages, formatting, view helpers
  i18n/                       # en.js and es.js (same keys) + translate()
  constants.js                # Option lists stored in the database (categories, statuses, sections)
  db/
    migrate.js                # Migration runner (used by the script and the tests)
    migrations/               # SQL, applied in file-name order
  views/                      # EJS pages
    partials/                 # head, header, footer, flash, form-errors, shared form fields
    errors/                   # 403, 404, 429 and 500 pages
public/
  css/main.css                # Single token-driven stylesheet (light + dark)
  js/app.js                   # Progressive enhancement (auto-submit, confirm, copy, mobile nav)
tests/
  unit/                       # No database needed
  integration/                # Real app + real PostgreSQL (TEST_DB_URL)
  helpers/app.js              # Test server and a cookie/CSRF-aware client
```

### Architecture

- **Routes** map URLs to middleware chains and controllers, and state each route's access level.
- **Validators** are pure functions. They trim input, check it, and return values to show again plus typed data for the model. Error messages are i18n keys, so they appear in the page's language.
- **Controllers** call validators, models and services, then render a view or redirect (post/redirect/get). They contain no SQL. Express 5 forwards rejected promises to the error handler, so controllers do not need `try/catch` for unexpected errors.
- **Models** own all SQL, always parameterized, and always scoped by `wedding_id`.
- **Services** wrap third-party APIs with timeouts, and turn failures into a `ServiceError` with a reason the page can explain.
- **Views** render data with EJS. Output is escaped with `<%= %>`; `<%- %>` is used only for `include()` and for the helpers in `utils/view-helpers.js`, which escape their own output.

## Database Schema

```
users              (id PK, email UNIQUE, password_hash NULL, google_id UNIQUE, display_name, avatar_url, language, ...)
weddings           (id PK, name, wedding_date, created_by FK users)
wedding_members    (id PK, wedding_id FK, user_id FK, role CHECK owner|editor|viewer, UNIQUE (wedding_id, user_id))
wedding_invites    (id PK, wedding_id FK, invited_by FK, invited_email NULL, token UNIQUE, role, expires_at, accepted_at)
budget_limits      (id PK, wedding_id UNIQUE, total)
budget_items       (id PK, wedding_id, name, category, amount)
checklist_tasks    (id PK, wedding_id, text, category, due_date, done, sort_order, UNIQUE (wedding_id, text))
guests             (id PK, wedding_id, name, rsvp CHECK, diet, plus_one)
vendors            (id PK, wedding_id, name, category, phone, email, website, status CHECK, notes)
music_tracks       (id PK, wedding_id, section, track_id, track_name, artist_name, artwork_url, UNIQUE (wedding_id, section, track_id))
inspiration_photos (id PK, wedding_id, photo_id, thumb_url, full_url, alt_desc, source_link, UNIQUE (wedding_id, photo_id))
session            (sid PK, sess, expire)  -- connect-pg-simple
schema_migrations  (filename PK, applied_at)
```

Deleting a wedding cascades to its members, invites and (since migration 007) all of its planning data. Deleting a user cascades to their memberships.

## Security Notes

- **SQL:** all queries are parameterized. Route ids are validated as UUIDs first, and every query is scoped to the active wedding.
- **Validation:** server-side on every form (trimmed values, required fields, length limits, email format, real-calendar-date checks, http(s)-only links, money format, option lists). Client-side `required`/`maxlength`/`type` attributes mirror these, but the server never trusts them.
- **Authentication:** passwords are hashed with scrypt (built into Node) with a per-password salt and compared in constant time. Unknown emails are checked against a dummy hash, so response time does not reveal which emails exist. Legacy bcrypt hashes from version 1 are verified and upgraded on the next sign-in.
- **Sessions:** only the session id is in the cookie (`HttpOnly`, `SameSite=Lax`, `Secure` in production). Data lives in the PostgreSQL `session` table. The id is regenerated on sign-in and sign-out, a login expires after 8 hours of inactivity, and the session keeps only `{ id, email, name, avatarUrl, language }`. On every request `refreshSessionUser` re-reads the user and `loadActiveWedding` re-checks membership, so removing someone or deleting an account takes effect immediately.
- **Authorization:** roles are checked on the server for every change (`requireEditor`, `requireOwner`). Nobody can be made owner, the owner's own role cannot be changed, and only owners can see invite tokens.
- **Invites:** email invites are single use and only work for the account with the invited email. Share links are reusable until they expire (7 days). Accepting is one transaction, so an invite cannot be used twice at the same moment. Invite links use `APP_URL`, never the request's `Host` header.
- **CSRF:** every POST must carry the session's random token (hidden `_csrf` field from `partials/csrf-field.ejs`), compared in constant time. A missing or wrong token gets a 403 page. **Every new form must include that partial.**
- **Google sign-in:** Passport's `state` parameter blocks login CSRF, and an existing account is only linked when Google reports the email as verified.
- **Security headers:** `helmet` sets a Content-Security-Policy that allows only this site's scripts and styles, plus the exact third-party hosts in use (Google Fonts, Spotify artwork and embeds, Unsplash images). **Views must not use inline `<script>`, inline event handlers or `style=""` attributes**; the integration tests check every page for this.
- **Third-party data:** the forms that save songs and photos send only an id. The server looks the details up from Spotify or Unsplash and accepts image URLs only on their expected hosts, so a forged form cannot store arbitrary URLs. API keys never reach the browser.
- **Open redirects:** `return_to` values and post-login destinations must be same-site paths (`isLocalPath`).
- **Rate limiting:** failed logins (10 per 15 minutes per IP), registrations (10 per hour), wrong current passwords (10 per 15 minutes), invites (20 per hour) and searches (60 per 15 minutes). Counters are kept in server memory, so they reset on restart and are not shared between instances.
- **Errors:** users see a generic, translated page; details go to the server log only. Form bodies are limited to 20 KB.
- **Not yet implemented:** password reset by email, email verification for password accounts, and account lockout per email (limits are per IP).

## Testing

```bash
npm test          # unit tests always; integration tests when TEST_DB_URL is set
npm run lint      # ESLint
npm run format    # Prettier (write); npm run format:check to verify
npm run check     # all three, as CI runs them
```

Integration tests start the real app on a random port against a real database. Point `TEST_DB_URL` at an **empty database you do not care about**: each test file drops and recreates its `public` schema.

```bash
createdb forever_planner_test
TEST_DB_URL=postgresql://localhost/forever_planner_test npm test
```

Add `TEST_DB_SSL_DISABLE=false` if your test database requires TLS. Spotify and Unsplash are faked in the tests, so no keys or network access are needed. GitHub Actions runs lint, formatting, the full test suite against PostgreSQL 16, and `npm audit` on every push and pull request.

## Known Issues

1. **Legacy columns:** the feature tables still have the `user_id` columns from before weddings were shared. Nothing reads them; drop them in a future migration once every deployment has run migration 000.
2. **Migration history:** `000_Merged_1-6.sql` duplicates `001`–`006` (written to repair a partially migrated database). Both sets are idempotent and a fresh database applies all of them cleanly, but the history is harder to read than it should be.
3. **Unvalidated foreign keys:** migration 007 adds its foreign keys `NOT VALID`. After checking for orphaned rows, run `ALTER TABLE <table> VALIDATE CONSTRAINT fk_<table>_wedding;` for each feature table.
4. **Currency:** amounts are shown in US dollars regardless of language.
5. **Rate limits are per process** (see Security Notes).

## Manual Verification Checklist

Automated tests cover behavior. Before considering a UI change done, also check:

- `npm run dev` boots and logs `Database connection successful`
- Every page renders without console errors or CSP violations (browser dev tools)
- Layout works at phone (390px) and desktop widths, in light and dark mode
- Keyboard-only navigation works with visible focus, including the mobile menu (Escape closes it)
- The page works with JavaScript disabled (selects show their submit buttons)
- Spanish pages have no English left over (switch with the language menu in the footer)

## Contributing

- Small, focused commits with imperative messages (e.g. `Add vendor notes field`).
- Follow `CLAUDE.md`: ESM with `.js` extensions on relative imports, 4-space indentation, JSDoc on exported models, validators, services and utilities, parameterized SQL scoped by `wedding_id`, translations for every user-facing string.
- Schema changes go in a new numbered file in `src/db/migrations/`, written to be safe to run more than once. Never edit a migration that has already shipped.
- `npm run check` must pass.

## License

ISC
