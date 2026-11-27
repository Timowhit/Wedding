# Forever Planner

A server-rendered wedding planning app for **professional wedding planners and their clients**. Planners run every client wedding from one dashboard; couples join their wedding as clients for free, and couples without a planner can plan their own wedding here too. Each wedding has a budget, guest list and RSVPs, vendors, a checklist, decisions for the couple to approve, an event-day schedule, a seating chart, playlists and an inspiration board. The whole app is available in English and Spanish, in five colour themes.

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

- **Landing page** (`/` when signed out): written for planners, with the founding offer (40% off for life for the first 300 planners and the live number of spots left), real screenshots and a "Coming next" list. Every call to action says "Start now".
- **Planner accounts**: an all-weddings dashboard (next deadlines, open and returned decisions, budget status, confirmed guests, overdue tasks, search and filters, monthly workload), client weddings, a business name and a brand palette clients see
- **Founding planners**: the first 300 planners get a numbered founding spot when they add their first client wedding (or take one over)
- **Handover**: a couple who started on their own can bring in a planner, who becomes the owner while the couple stay on as clients
- **Decisions**: the planner asks, the couple approve or send back with a note
- **Event-day schedule**: times, places, vendors with tap-to-call numbers, setup notes and a plan B per item; printable
- **Seating chart**: tables with seat counts (plus-ones included), guest groups, a table picker per guest and drag and drop
- **Reminder emails**: one morning summary per person, only when something needs attention: booked vendors' payments and checklist tasks that are overdue or due within 7 days, and decisions waiting on them, across every wedding where they are owner, editor or client. Switch it off in Settings or with the one-click unsubscribe link in every email. Sent by `npm run reminders` from a daily scheduled job
- **Templates**: save a wedding's checklist or event-day timeline as your own template, then add it to another wedding in two taps. Checklist due dates are stored as days before the wedding and worked out again from each wedding's date; tasks already on the list are skipped. Timeline templates keep times, places, notes and plan B, but not the vendor or contact. Manage them at `/templates`
- **Offline event day**: once the event-day schedule has been opened online, the schedule (and its print view), the vendor list and the vendors on the schedule keep working with no connection, with tap-to-call numbers and a banner showing when the copy was saved. Other pages show a friendly offline page. Signing out removes everything saved on the device
- **Contracts and payments**: each vendor has a page with its contract (total, signed date, a link to the signed document, what's included, cancellation terms) and a payment schedule with "Mark paid". The budget counts booked vendors' contracts and shows Committed · Paid · Still owed; overdue and upcoming payments appear on each wedding's dashboard and, across all weddings, on the planner dashboard. The event-day schedule shows what each vendor's contract includes
- **Themes**: Rose, Sage, Navy, Champagne and Slate palettes, or your own colours (main, second, accent and a background tint, adjusted where needed to stay readable), each in light, dark or automatic mode. Settings > Appearance shows every change at once and saves it by itself
- **Wedding colours** (`/colors`): the wedding's palette of up to 12 named swatches, added with a colour picker, a hex code, or a photo (uploaded or taken with the camera): the browser suggests the photo's main colours and the photo never leaves the device. Editors can apply the palette to the app for everyone in that wedding
- **Venue layout** (`/layout`): one or more rooms or floors (tabs; `?room=`), each drawn to scale (feet or metres) with the seating tables (showing how many are seated) and fixtures such as the dance floor, stage, bar and entrance. Drag pieces or move them with the arrow keys; every piece on a plan has a form for its position, size and rotation, and pieces always stay inside the room. An inventory beside the plan holds seating tables not placed yet and pieces kept for later; place them one by one or all tables at once, and move pieces between rooms. Saved for offline use with the event-day pages
- **Checklist priorities and owners**: each task can be high, normal or low priority and assigned to a member of the wedding ("For Ana"); filters for Mine and High priority
- **Meals and access needs**: each guest has a meal choice (the wedding's meals are suggested) and accessibility needs; the guest list counts meals for everyone not declined, and the seating chart flags guests with access needs
- **Calendar** (`/calendar`): a month of wedding days, open tasks, unpaid booked-vendor payments and open decisions across all your weddings (planners can pick one); a Monday-first grid plus an agenda, agenda only on phones
- **Search** (`/search`): guests, vendors, tasks, decisions and event-day items across all your weddings; each result opens in its wedding
- **Wrap-up**: after the wedding day, the dashboard shows what is still owed, booked vendors to rate (1-5 stars and notes) and a button that adds dated wrap-up tasks. The owner can archive the wedding: it leaves active lists, the calendar and reminders, and can be brought back
- **Progress badge and celebrations**: a ring at the top right shows the wedding's checklist progress and opens to the next three tasks. Ticking a task off brings a short confetti burst and a message, with a bigger one at 25%, 50%, 75% and 100% (CSS only; still for people who prefer reduced motion)
- **Files** (`/files`): contracts, floor plans, inspiration photos and other files for each wedding, stored in PostgreSQL. Photos show as a grid; vendor pages show and upload that vendor's files. PDF, photos, Word, Excel and text up to 10 MB each and 250 MB per wedding; types are checked from the file's contents
- **Library** (`/library`, planners): your own email, follow-up and proposal templates with `{couple}`, `{date}`, `{days_left}` and `{planner}` filled in for a wedding (copy, open in your email app or print), and questionnaires you build once and send to any wedding. Couples answer them on `/questionnaires`; you read the answers there
- **Notices**: confirmations fade after a few seconds (paused while hovered or focused); errors stay until dismissed
- **Dashboard**: countdown to the wedding date, a getting-started list for new weddings, totals for every section, pending invitations
- **Budget**: total budget, expenses, spending per category, spent/remaining with an over-budget warning
- **Guests**: RSVP status (changed from a picker on each row), dietary needs, plus-ones, filter by RSVP, edit
- **Vendors**: contact details, booking status (changed from a picker on each row), notes, filter by status, edit
- **Checklist**: tasks with categories and due dates, overdue highlighting, progress, example tasks
- **Music**: Spotify search, playlists for six parts of the day, in-page previews
- **Inspiration**: Unsplash search with photographer credit, a saved board
- **Collaboration**: several weddings per user, email invites and share links, owner/editor/client/viewer roles, leave a wedding
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

| Variable                | Required      | Purpose                                                                                              |
| ----------------------- | ------------- | ---------------------------------------------------------------------------------------------------- |
| `DB_URL`                | Yes           | PostgreSQL connection string: `postgresql://user:pass@host:port/db`                                  |
| `SESSION_SECRET`        | Yes           | At least 32 random characters; signs the session cookie. The server refuses to start without it      |
| `APP_URL`               | In production | Public base URL, e.g. `https://planner.example.com`. Used in invite links and Google sign-in         |
| `NODE_ENV`              | No            | `development` or `production` (defaults to `production`)                                             |
| `PORT`                  | No            | Port the server listens on (defaults to `3000`)                                                      |
| `FROM_EMAIL`            | No            | Sender address for invite and reminder emails (default `noreply@localhost`)                          |
| `APP_TIME_ZONE`         | No            | IANA time zone for day-based rules such as overdue payments, e.g. `America/New_York` (default `UTC`) |
| `ENABLE_SQL_LOGGING`    | No            | `true` logs every query with timing. Only takes effect when `NODE_ENV=development`                   |
| `DB_CA`                 | No            | Your database provider's CA certificate (PEM text; `\n` sequences are converted to newlines)         |
| `DB_SSL_INSECURE`       | No            | `true` keeps TLS encryption but skips certificate verification                                       |
| `DB_SSL_DISABLE`        | No            | `true` connects without TLS, for a local database. Refused when `NODE_ENV=production`                |
| `GOOGLE_CLIENT_ID`      | No            | Enables "Continue with Google" (with `GOOGLE_CLIENT_SECRET`)                                         |
| `GOOGLE_CLIENT_SECRET`  | No            | See above                                                                                            |
| `SPOTIFY_CLIENT_ID`     | No            | Enables music search (with `SPOTIFY_CLIENT_SECRET`)                                                  |
| `SPOTIFY_CLIENT_SECRET` | No            | See above                                                                                            |
| `UNSPLASH_ACCESS_KEY`   | No            | Enables inspiration photo search                                                                     |
| `SMTP_HOST`             | No            | Enables invite emails. Also `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL`       |

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

| Method | Path                                                           | Access               | Description                                                                            |
| ------ | -------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------- |
| GET    | `/`                                                            | Public               | Landing page when signed out; dashboard when signed in                                 |
| POST   | `/checklist/template`, `/schedule/template`                    | Editor               | Save the list as one of your templates (same name replaces)                            |
| POST   | `/checklist/from-template`, `/schedule/from-template`          | Editor               | Add one of your templates to the active wedding                                        |
| GET    | `/templates`                                                   | Account              | Your templates                                                                         |
| POST   | `/templates/:id/rename`, `/templates/:id/delete`               | Account              | Rename / delete one of your templates                                                  |
| POST   | `/settings/reminders`                                          | Account              | Daily summary email on or off                                                          |
| GET    | `/reminders/unsubscribe?u=&t=`                                 | Public (signed link) | Asks to confirm unsubscribing                                                          |
| POST   | `/reminders/unsubscribe?u=&t=`                                 | Public (signed link) | Unsubscribes (also mail clients' one-click; no CSRF token)                             |
| GET    | `/offline`                                                     | Public               | Shown by the service worker when a page isn't saved for offline                        |
| GET    | `/start`                                                       | Public               | "Start now": choose planner or couple                                                  |
| GET    | `/register?as=planner\|couple`                                 | Public               | Sign-up form for a planner or a couple                                                 |
| GET    | `/login`, `/register`                                          | Public               | Sign-in and sign-up forms                                                              |
| POST   | `/login`, `/register`                                          | Public               | Sign in / create an account and its first wedding                                      |
| POST   | `/logout`                                                      | Public               | Sign out (new session id)                                                              |
| GET    | `/auth/google`, `/auth/google/callback`                        | Public               | Google sign-in round trip                                                              |
| POST   | `/language`                                                    | Public               | Change the page language                                                               |
| GET    | `/invite/:token`                                               | Public               | Invite page (offers sign-in when needed)                                               |
| POST   | `/invite/:token/accept`, `/decline`                            | Login                | Accept or decline an invite                                                            |
| GET    | `/welcome`                                                     | Login                | Create or join a wedding (users without one)                                           |
| POST   | `/weddings`                                                    | Login                | Create another wedding                                                                 |
| POST   | `/wedding/switch`                                              | Login                | Change the active wedding (membership checked)                                         |
| POST   | `/invites/join`                                                | Login                | Open an invite from a pasted link                                                      |
| GET    | `/`                                                            | Member               | Dashboard                                                                              |
| POST   | `/wedding/date`                                                | Owner                | Set or clear the wedding date                                                          |
| GET    | `/budget`                                                      | Member               | Budget (`?category=` filter)                                                           |
| POST   | `/budget/limit`, `/budget/expenses`                            | Editor               | Set the total / add an expense                                                         |
| POST   | `/budget/expenses/:id/delete`                                  | Editor               | Delete an expense                                                                      |
| POST   | `/budget/categories`, `/budget/categories/suggested`           | Editor               | Add a category / bring the suggested ones back                                         |
| POST   | `/budget/categories/:id/plan`, `/budget/categories/:id/delete` | Editor               | Set a planned amount / delete a category (expenses move to Other)                      |
| GET    | `/checklist`                                                   | Member               | Checklist (`?status=` and `?category=` filters)                                        |
| POST   | `/checklist`, `/checklist/examples`                            | Editor               | Add a task / add the example tasks                                                     |
| GET    | `/checklist/:id/edit`                                          | Editor               | Edit form                                                                              |
| POST   | `/checklist/:id/edit`, `/toggle`, `/delete`                    | Editor               | Save / mark done or not / delete                                                       |
| GET    | `/guests`                                                      | Member               | Guest list (`?rsvp=` filter)                                                           |
| POST   | `/guests`                                                      | Editor               | Add a guest                                                                            |
| GET    | `/guests/:id/edit`                                             | Editor               | Edit form                                                                              |
| POST   | `/guests/:id/edit`, `/rsvp`, `/delete`                         | Editor               | Save / set the RSVP status / delete                                                    |
| GET    | `/vendors`                                                     | Member               | Vendors (`?status=` filter)                                                            |
| POST   | `/vendors`                                                     | Editor               | Add a vendor                                                                           |
| GET    | `/vendors/:id/edit`                                            | Editor               | Edit form                                                                              |
| POST   | `/vendors/:id/edit`, `/status`, `/delete`                      | Editor               | Save / set the booking status / delete                                                 |
| GET    | `/vendors/:id`                                                 | Member               | The vendor's contract and payments                                                     |
| GET    | `/vendors/:id/contract`                                        | Editor               | Contract form                                                                          |
| POST   | `/vendors/:id/contract`, `/vendors/:id/payments`               | Editor               | Save (or clear) the contract / add a payment                                           |
| GET    | `/payments/:id/edit`                                           | Editor               | Payment form                                                                           |
| POST   | `/payments/:id/edit`, `/paid`, `/delete`                       | Editor               | Save / mark paid (`paid=1`) or unpaid (`paid=0`) / delete                              |
| GET    | `/music`                                                       | Member               | Playlists, and Spotify search with `?q=`                                               |
| POST   | `/music/tracks`                                                | Editor               | Add a search result to a section                                                       |
| POST   | `/music/tracks/:id/delete`                                     | Editor               | Remove a song                                                                          |
| POST   | `/music/sections/:slug/clear`                                  | Editor               | Empty one section                                                                      |
| GET    | `/inspiration`                                                 | Member               | Board, and Unsplash search with `?q=`                                                  |
| POST   | `/inspiration`, `/inspiration/clear`                           | Editor               | Save a search result / empty the board                                                 |
| POST   | `/inspiration/:id/delete`                                      | Editor               | Remove a photo                                                                         |
| GET    | `/settings`                                                    | Member               | Wedding, members, invites, profile, password                                           |
| POST   | `/settings/profile`, `/password`, `/leave`                     | Member               | Save profile / change password / leave the wedding                                     |
| POST   | `/settings/wedding`                                            | Owner                | Rename, change date                                                                    |
| GET    | `/planner`                                                     | Planner              | All weddings with deadlines, decisions and budgets                                     |
| POST   | `/planner/weddings`                                            | Planner              | Add a client wedding (first one claims a founding spot)                                |
| POST   | `/planner/weddings/:id/open`                                   | Planner              | Make a wedding active and open its dashboard                                           |
| GET    | `/decisions`                                                   | Member               | Decisions and their answers                                                            |
| POST   | `/decisions`, `/decisions/:id/edit`, `/reopen`, `/delete`      | Asker                | Ask, edit, reopen or delete a decision                                                 |
| POST   | `/decisions/:id/answer`                                        | Answerer             | Approve, or request changes with a note                                                |
| GET    | `/schedule`                                                    | Member               | Event-day timeline (`?print=1` for the printable version)                              |
| POST   | `/schedule`, `/schedule/:id/edit`, `/delete`                   | Editor               | Add, change or remove a schedule item                                                  |
| GET    | `/seating`                                                     | Member               | Tables and seated guests (`?group=` filters the not-seated list)                       |
| POST   | `/seating/tables`, `/seating/tables/:id/edit`, `/delete`       | Editor               | Add, rename/resize or delete a table                                                   |
| POST   | `/seating/guests/:id`                                          | Editor               | Seat a guest at a table (`table_id` empty = unseat)                                    |
| POST   | `/settings/appearance`                                         | Account              | Save your palette (or own colours) and light/dark mode; JSON for `fetch`               |
| GET    | `/css/custom/:key.css`                                         | Public               | Stylesheet for a set of custom colours (immutable)                                     |
| GET    | `/colors`                                                      | Member               | The wedding's colour palette                                                           |
| POST   | `/colors`, `/colors/:id/delete`                                | Editor               | Add or remove a swatch                                                                 |
| POST   | `/colors/app`, `/colors/app/off`                               | Editor               | Apply the wedding's colours to the app, or stop                                        |
| GET    | `/calendar?month=&wedding=`                                    | Account              | Month calendar across your weddings                                                    |
| GET    | `/search?q=`                                                   | Account              | Search guests, vendors, tasks, decisions, event-day items                              |
| POST   | `/checklist/wrap-up`                                           | Editor               | Add the wrap-up tasks (after the wedding)                                              |
| POST   | `/vendors/:id/rating`                                          | Editor               | Rate a vendor 1-5 with notes                                                           |
| POST   | `/wedding/archive`, `/wedding/unarchive`                       | Owner                | Archive the wedding or bring it back                                                   |
| GET    | `/files?kind=`                                                 | Member               | The wedding's files                                                                    |
| POST   | `/files` (multipart)                                           | Editor               | Upload a file (CSRF checked after parsing)                                             |
| GET    | `/files/:id`                                                   | Member               | Download (sandboxed, nosniff)                                                          |
| POST   | `/files/:id/delete`                                            | Editor               | Delete a file                                                                          |
| GET    | `/library`                                                     | Account              | Your message templates and questionnaires                                              |
| POST   | `/library/messages`, `/:id/edit`, `/:id/delete`                | Account              | Add, edit or delete a message template                                                 |
| GET    | `/library/messages/:id/use`                                    | Editor               | The message filled in for the active wedding                                           |
| GET    | `/library/questionnaires/new`, `/:id/edit`                     | Account              | Questionnaire builder                                                                  |
| POST   | `/library/questionnaires`, `/:id/edit`, `/:id/delete`          | Account              | Save or delete a questionnaire                                                         |
| GET    | `/questionnaires`, `/questionnaires/:id`                       | Member               | Questionnaires sent to the wedding, and one with its answers                           |
| POST   | `/questionnaires/send`, `/questionnaires/:id/delete`           | Editor               | Send one of yours to the wedding, or remove it                                         |
| POST   | `/questionnaires/:id/answers`                                  | Answerer             | Save the couple's answers                                                              |
| GET    | `/layout`                                                      | Member               | The venue floor plan (`?room=` for another room) and the inventory                     |
| POST   | `/layout/room`                                                 | Editor               | A room's name, size and unit (pieces are moved back inside)                            |
| POST   | `/layout/rooms`, `/layout/rooms/:id/delete`                    | Editor               | Add a room / delete one (its pieces go to the inventory; one always stays)             |
| POST   | `/layout/tables`, `/layout/tables/all`, `/layout/items`        | Editor               | Place a seating table / all of them / add a fixture (to a room or the inventory)       |
| POST   | `/layout/items/:id`, `/move`, `/room`, `/delete`               | Editor               | Edit, move (JSON for `fetch`), put in another room or the inventory, or remove a piece |
| POST   | `/settings/business`                                           | Planner              | Business name and brand palette                                                        |
| POST   | `/settings/become-planner`                                     | Account              | Switch a couple account to a planner account                                           |
| POST   | `/settings/handover`                                           | Owner                | "Bring in your planner" (couples' own weddings)                                        |
| POST   | `/settings/invites`                                            | Owner                | Create an email invite or a share link                                                 |
| POST   | `/settings/invites/:id/delete`                                 | Owner                | Revoke an invite                                                                       |
| POST   | `/settings/members/:userId/role`, `/delete`                    | Owner                | Change a member's role / remove them                                                   |

**Access levels:** _Account_ = logged in, with or without a wedding (`requireLogin` + `loadOptionalWedding`), so a new planner can use Settings before adding a client. _Planner_ = a planner account (`requirePlanner`; others get a 404). _Member_ = logged in and a member of the active wedding (`requireLogin` + `loadActiveWedding`). _Editor_ = member with the `editor`, `client` or `owner` role (`requireEditor`). _Owner_ = the wedding's owner (`requireOwner`). _Asker_ / _Answerer_ = `requireDecisionRight('ask' | 'answer')`: in a planner wedding the planner side asks and clients answer; in a couple's own wedding owner and editors do both. Viewers see every page read-only; forms they cannot use are not rendered, and the routes refuse them anyway.

**Roles:** `owner` (exactly one per wedding), `editor` (an assistant, or the second partner in a couple's own wedding), `client` (the couple in a planner wedding: edits plans and answers decisions, cannot manage members or settings) and `viewer` (read-only). The `client` role is only offered in planner weddings, so couples planning on their own never meet planner wording.

Record ids are UUIDs checked by `isUuid` before any query. Every query is also scoped to the active wedding, so an id from another wedding behaves exactly like an unknown id: a 404.

## Project Structure

```
server.js                     # Starts the server (refuses to start without the database)
scripts/migrate.js            # npm run migrate
scripts/build-themes.js       # npm run build:themes (writes public/css/themes.css)
scripts/screenshots.cjs       # Regenerates the landing-page screenshots (Playwright)
src/
  app.js                      # createApp(): config checks, helmet, sessions, middleware order, 404/500
  routes/index.js             # Every route and its access level
  middleware/
    auth.js                   # refreshSessionUser, setCurrentUser, requireLogin, requirePlanner
    wedding.js                # loadActiveWedding, loadOptionalWedding, requireEditor/Owner, requireDecisionRight
    csrf.js                   # CSRF token check for every POST
    i18n.js                   # Picks the language; exposes t() and formatters to views
    rateLimit.js              # Login, registration, password, invite and search limits
  controllers/                # Read input, call validators/models/services, render or redirect. No SQL.
  validators/                 # Pure functions: form body -> { values, data, errors }
  models/                     # All SQL (parameterized), one file per area; db.js owns the pool
  services/                   # Spotify, Unsplash, email, Google sign-in
  utils/                      # Passwords, sessions, flash messages, formatting, view helpers
  i18n/                       # en.js and es.js (same keys) + translate()
  constants.js                # Option lists stored in the database, founding offer, palettes
  themes.js                   # Colour tokens per palette and mode, custom colours (customTokens), resolveTheme()
  db/
    migrate.js                # Migration runner (used by the script and the tests)
    migrations/               # SQL, applied in file-name order
  views/                      # EJS pages
    partials/                 # head, header, footer, flash, form-errors, shared form fields
    errors/                   # 403, 404, 429 and 500 pages
public/
  css/main.css                # Token-driven stylesheet (layout and components)
  css/themes.css              # Generated from src/themes.js: every palette in light and dark
  images/                     # Landing-page screenshots and logo.svg (favicon)
  js/app.js                   # Progressive enhancement (auto-submit, confirm, copy, mobile nav, live appearance, layout drag)
  js/palette.js               # Wedding colours page: suggests a photo's main colours, in the browser
  sw.js                       # Service worker for the offline event-day pages
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
users              (id PK, email UNIQUE, password_hash NULL, google_id UNIQUE, display_name, avatar_url, language,
                    account_type couple|planner, founding_number 1..300 UNIQUE NULL, business_name,
                    theme_palette, theme_mode, brand_palette NULL, ...)
founding_counter   (id TRUE PK, next_number)  -- one row; locked to hand out founding numbers in order
weddings           (id PK, name, wedding_date, created_by FK users, planner_managed)
wedding_members    (id PK, wedding_id FK, user_id FK, role CHECK owner|editor|client|viewer, UNIQUE (wedding_id, user_id))
wedding_invites    (id PK, wedding_id FK, invited_by FK, invited_email NULL, token UNIQUE,
                    role CHECK editor|client|viewer|planner, expires_at, accepted_at)  -- 'planner' = handover
decisions          (id PK, wedding_id FK, title, details, due_date, status open|approved|changes_requested,
                    comment, created_by, answered_by, answered_at)
schedule_items     (id PK, wedding_id FK, starts_at TIME, ends_at TIME NULL, title, location, vendor_id FK NULL,
                    contact, notes, contingency)
seating_tables     (id PK, wedding_id FK, name, seats 1..30, sort_order, UNIQUE (wedding_id, name))
budget_limits      (id PK, wedding_id UNIQUE, total)
budget_items       (id PK, wedding_id, name, category, amount)
budget_categories  (id PK, wedding_id, builtin_key | name, planned)   -- category value = key or name
checklist_tasks    (id PK, wedding_id, text, category, due_date, done, sort_order, UNIQUE (wedding_id, text))
guests             (id PK, wedding_id, name, rsvp CHECK, diet, plus_one, group_name, table_id FK NULL)
vendors            (id PK, wedding_id, name, category, phone, email, website, status CHECK, notes,
                    contract_total >= 0 NULL, contract_signed_on, contract_url, contract_includes, contract_cancellation)
users (reminders)  reminder_emails BOOLEAN DEFAULT TRUE, reminders_sent_on DATE
templates          (id PK, user_id FK CASCADE, kind checklist|schedule, name 1..120, items JSONB,
                    UNIQUE (user_id, kind, name))  -- a person's own; never shared with the wedding
users (appearance) theme_colors NULL  -- custom colours key, e.g. a85a73-4f7a59-b8862b-p (see src/themes.js)
weddings (colours) theme_colors NULL  -- set when the wedding's colours are applied to the app
wedding_colors     (id PK, wedding_id FK CASCADE, hex #rrggbb, name NULL, sort_order)
venue_layouts      (wedding_id PK FK CASCADE, width, depth, unit ft|m)   -- no longer read (019 moved it into venue_rooms)
venue_rooms        (id PK, wedding_id FK CASCADE, name NULL = "Main room" for the first, "Room N" after, width, depth, unit ft|m)
layout_items       (id PK, wedding_id FK CASCADE, room_id FK venue_rooms SET NULL (NULL = inventory, sizes in ft), kind, label NULL, table_id UNIQUE FK seating_tables CASCADE NULL,
                    shape rect|round, x, y (centre), width, depth, rotation 0..359)
checklist (013)    priority high|normal|low, assignee_id FK users NULL (shown only while a member)
guests (013)       meal NULL, accessibility NULL
weddings (014)     archived_at NULL   vendors (014) rating 1..5 NULL, review NULL
wedding_files (015) (id PK, wedding_id FK CASCADE, vendor_id FK SET NULL, uploaded_by FK SET NULL, kind, name,
                    content_type, size, note, data BYTEA)  -- lists never select data
message_templates (016) (id PK, user_id FK CASCADE, kind email|follow_up|proposal, name, subject, body, UNIQUE (user_id, kind, name))
questionnaires (016)    (id PK, user_id FK CASCADE, title, intro, questions JSONB)
wedding_questionnaires  (id PK, wedding_id FK CASCADE, title, intro, questions JSONB (a copy), answers JSONB, sent_by, answered_by, answered_at)
vendor_payments    (id PK, wedding_id FK, vendor_id FK CASCADE, label, amount > 0, due_date, paid_on NULL = unpaid, note)
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
- **Uploads:** the file type comes from the file's first bytes (no HTML or SVG). Downloads send the stored type with `nosniff`, `Content-Security-Policy: sandbox` and `inline` only for images and PDFs. Multipart forms are parsed only on `/files` after the login and editor checks, then their CSRF token is checked (`middleware/upload.js`); the global CSRF check refuses any other multipart POST.
- **Payments:** every payment query is scoped by `wedding_id`; adding a payment checks the vendor's wedding in the same statement, so a forged vendor or payment id from another wedding changes nothing (404). Contract links must be `https://`, are shown as escaped links that open in a new tab with `rel="noopener noreferrer"`, and are never fetched by the server.
- **Founding numbers:** handed out inside the transaction that creates a planner's first planner wedding (or accepts a handover). The single `founding_counter` row is locked with `SELECT … FOR UPDATE`, so concurrent claims take turns; `users.founding_number` is `UNIQUE` and limited to 1–300 as the final guard. Tests run five simultaneous claims for the last spot.
- **Handover:** only the owner of a couple's own wedding can create one (after an explicit confirmation), only a planner account can accept it, the inviter cannot accept their own, and accepting is one transaction that keeps exactly one owner.
- **Open redirects:** `return_to` values and post-login destinations must be same-site paths (`isLocalPath`).
- **Rate limiting:** failed logins (10 per 15 minutes per IP), registrations (10 per hour), wrong current passwords (10 per 15 minutes), invites (20 per hour) and searches (60 per 15 minutes). Counters are kept in server memory, so they reset on restart and are not shared between instances.
- **Errors:** users see a generic, translated page; details go to the server log only. Form bodies are limited to 20 KB.
- **Not yet implemented:** password reset by email, email verification for password accounts, and account lockout per email (limits are per IP).

## Reminder emails

- `npm run reminders` (`scripts/send-reminders.js`) sends today's summaries and exits. Run it once a day from a scheduler. On Render: **New → Cron Job**, same repository and environment variables as the web service, build command `npm install`, command `npm run reminders`, schedule e.g. `30 12 * * *`. Render's schedule is in UTC and doesn't follow daylight saving: 12:30 UTC is 7:30 in New York in winter and 8:30 in summer. Cron Jobs are a paid Render instance type. Put the shared variables in a Render **Environment Group** used by both services, so `SESSION_SECRET` and `APP_URL` can't drift apart; the job refuses to run without them. It exits with an error only when nothing could be sent, not when one address is refused.
- It needs `DB_URL`, `SESSION_SECRET` (signs the unsubscribe links: use the same value as the web service), `APP_URL`, `APP_TIME_ZONE` and the `SMTP_*`/`FROM_EMAIL` settings. Without SMTP it logs that email isn't configured and sends nothing.
- Each person gets at most one email per day in `APP_TIME_ZONE` (`users.reminders_sent_on`); running it twice sends nothing new. A failure for one person is logged and retried the next day, and doesn't stop the others.
- `users.reminder_emails` (default on) is the switch in Settings. Unsubscribe links carry `HMAC-SHA256(SESSION_SECRET, user id)`; changing `SESSION_SECRET` invalidates old links (people can still switch off in Settings).

## Offline event day

- `public/sw.js` is a service worker, registered by `public/js/app.js` on signed-in pages only. It caches static files, and the event-day pages network-first: `/schedule` (with any query), `/layout`, `/vendors`, `/vendors/<id>` and `/offline`. Other pages are network-only and fall back to `/offline`. It only stores successful same-origin GETs, never a redirect to `/login`.
- The schedule page asks the worker to save the event-day pages on every online visit, and when someone taps "Save for offline".
- Each page carries `data-wedding`. When the active wedding changes, `app.js` asks the worker to drop the saved pages, so an offline copy is never another couple's day.
- Sign-out sends `Clear-Site-Data: "cache", "storage"`, which removes the saved pages and the worker.
- Bump `VERSION` in `sw.js` when what is cached changes meaning; old caches are deleted on activation.

## Money rules (contracts and payments)

All money figures come from `src/models/payments.js`, so the vendor page, budget, dashboards and planner cards always agree:

- **Booked** vendors count in full: committed = the larger of the contract total and the sum of its payments.
- **Researching / Contacted** vendors count nothing; a contract total is shown as a quote.
- **Declined** vendors count only payments already paid (as both committed and paid).
- Each vendor is worked out on its own, then summed: still owed = committed − paid, never below zero per vendor, so overpaying one vendor never hides money owed to another. Ordinary budget expenses count as committed and paid.
- Contracts count in the budget category mapped from the vendor's category (`VENDOR_BUDGET_CATEGORY` in `constants.js`).
- "Today" (overdue, due within 30 days, the date "Mark paid" records) is `todayIso()` in `APP_TIME_ZONE`.

## Planners and the founding offer

- A planner signs up at `/start` → "I'm a wedding planner" (or `/register?as=planner`, or Google with the same choice), or switches an existing couple account in Settings. Planner accounts start without a wedding and land on `/planner`.
- The first client wedding a planner adds, or the first handover they accept, claims the next founding number while any of the 300 remain. The landing page, `/start` and the planner dashboard show how many are left; when they are gone the landing page says the offer has ended.
- No billing exists yet. The founding number on the user row is what a future billing integration should read to apply the 40% lifetime discount.

## Themes

- Palettes are defined once, with every colour token for light and dark, in `src/themes.js`. After changing it, run `npm run build:themes` to regenerate `public/css/themes.css`; a unit test fails if the file is out of date, and another checks WCAG AA contrast for every palette and mode.
- **Custom colours** are stored as a key (`a85a73-4f7a59-b8862b-p`: main, second and accent colours, then the background: `n` neutral or a tint of `p`, `s` or `a`). `customTokens()` keeps each colour's hue and moves only its lightness, as far as WCAG AA needs in each mode; a unit test runs awkward inputs (yellow, white, black, pure blue) through every contrast pair. `GET /css/custom/<key>.css` serves the result, so pages never need inline styles.
- `resolveTheme()` picks a page's palette: inside a wedding whose colours are applied to the app, those; inside a planner wedding whose owner set a brand palette, that palette; otherwise the person's own palette or colours. Light/dark/automatic is always personal. Unknown stored values fall back to Rose and automatic.

## Landing-page screenshots

Start the app against a throwaway database, then run `BASE_URL=http://localhost:3000 node scripts/screenshots.cjs`. It signs up a demo planner, fills in demo weddings through the real forms and writes the five JPEGs in `public/images/`.

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
