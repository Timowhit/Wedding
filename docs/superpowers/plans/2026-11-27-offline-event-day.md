# Offline Event Day Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The event-day schedule, vendor list and scheduled vendors' pages keep working offline once opened online; nothing stays on the device after sign-out.

**Architecture:** A root-scoped service worker (`public/sw.js`) caches static files and the event-day pages network-first. The server adds `/offline`, page markers (`data-offline`, `data-rendered-at`), and `Clear-Site-Data` on sign-out and on wedding switches. `public/js/app.js` registers the worker, asks it to save the event-day pages, and shows the offline banner.

**Tech Stack:** Express 5, EJS, Service Worker + Cache API, node:test (including `node:vm` for the worker's routing function).

**Spec:** `docs/superpowers/specs/2026-11-27-offline-event-day-design.md`

## Global Constraints

- The CSP is unchanged: no inline script or style. The worker is `/sw.js`, served by `express.static` from `public/`.
- Without JavaScript, every page behaves exactly as before. The Save button and the banner are `hidden` until JS reveals them.
- The worker only handles same-origin `GET`. It never caches non-200 responses, redirected responses, or `/login`.
- Cache names: `fp-static-<VERSION>` and `fp-pages-<VERSION>`, with `VERSION = 'v1'`. Old ones are deleted on `activate`.
- Event pages: `/schedule` (with any query), `/vendors`, and `/vendors/<uuid>` (exactly; not `/edit` or `/contract`).
- `Clear-Site-Data` values: sign-out `"cache", "storage"`; wedding switch and planner "Open" `"cache"`.
- en and es strings for every new message.

## Review Focus

1. **The active wedding changes while a copy is saved.** Expected: the next response clears the cache, so an offline visit can never show the previous couple's schedule.
   - Test: Task 1, `switching wedding clears the offline copy`.
2. **The session expired, and the worker's network fetch of `/schedule` is redirected to `/login`.** Expected: nothing is cached, and the login page is shown.
   - Test: Task 2, `routeFor` plus the `shouldStore(response)` unit test.
3. **A visitor who isn't signed in.** Expected: no worker is registered (no `data-offline`), and `/offline` still renders.
   - Test: Task 1.
4. **`/vendors/<id>/edit` and `/vendors/<id>/contract` opened offline.** Expected: these are not event pages, so the offline page is shown, never a stale form.
   - Test: Task 2, `routeFor`.
5. **The browser has no service worker support** (or JS is off). Expected: no errors, and the Save button stays hidden.
   - Test: Task 3, browser check with JS off.

---

### Task 1: Server side (offline page, markers, Clear-Site-Data, schedule links)

**Files:**

- Create: `src/controllers/offline.js`, `src/views/offline.ejs`
- Modify:
  - `src/routes/index.js`: `GET /offline`, public
  - `src/controllers/auth.js`: `processLogout` sets the header
  - the wedding switch handler (`processSwitchWedding` in `src/controllers/dashboard.js`) and `processOpenWedding` in `src/controllers/planner.js`: set the header
  - `src/views/partials/head.ejs`: body attributes, from `res.locals`, set in middleware
  - `src/views/partials/header.ejs`: the banner element
  - `src/views/schedule.ejs`: vendor links, the Save button and the hint
  - i18n, CSS
- Test: `tests/integration/offline.test.js`

**Interfaces:**

- Produces:
  - `GET /offline`
  - body attributes `data-offline` (signed-in only) and `data-rendered-at="<ISO>"`
  - `<p class="offline-banner" data-offline-banner role="status" hidden>` containing `<time data-saved-time>`
  - the schedule's `<button type="button" data-save-offline hidden>` and `<p data-save-offline-status hidden>`
  - vendor links `<a href="/vendors/<id>" data-offline-page>`

- [ ] **Step 1:** Write failing tests:
  - `offline page works for visitors and members` (200; links to `/schedule` and `/vendors`)
  - `sign-out clears site data` (header contains `"cache"` and `"storage"`)
  - `switching wedding clears the offline copy` (header switcher POST and planner open both send `Clear-Site-Data: "cache"`)
  - `signed-in pages are marked for offline; visitor pages are not`
  - `schedule links vendors and offers Save for offline`
  - `sw.js is served as JavaScript`
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm run check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: offline page, markers and clearing on sign-out and switch`.

### Task 2: Service worker

**Files:**

- Create: `public/sw.js`
- Modify: `eslint.config.js` (serviceworker globals for `public/sw.js`)
- Test: `tests/unit/sw.test.js`

**Interfaces:**

- Produces:
  - `self.routeFor(url: URL, origin: string): 'static'|'event'|'page'|'skip'`
  - `self.shouldStore(response: {ok, status, redirected, url, type}): boolean`
  - the message `{ type: 'save', urls: string[] }` → the worker fetches and stores each, then replies `{ type: 'saved', count }` on the message port

- [ ] **Step 1:** Write failing unit tests that load `public/sw.js` into a `vm` context, with `self = { addEventListener(){}, location: { origin } }`:
  - `routeFor classifies paths`, per the spec's Testing list, plus `/offline` → `'event'` (cached at install), and other origins and non-http → `'skip'`
  - `shouldStore only keeps good same-origin responses`: 200 → true; 302, 404, 500, `redirected` and a `url` ending `/login` → false
- [ ] **Step 2:** Run them. Expected: FAIL (the file is missing).
- [ ] **Step 3:** Implement `install` (pre-cache `/offline`, `/css/main.css`, `/css/themes.css`, `/js/app.js`), `activate` (delete old caches, `clients.claim()`), `fetch` (by route) and `message` (save).
- [ ] **Step 4:** Run the unit tests and `npm run check`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: service worker for the event-day pages`.

### Task 3: Client wiring, docs, verification, review

**Files:** `public/js/app.js`, `README.md`, `CLAUDE.md`

- [ ] **Step 1:** Wire up `app.js`:
  - Register `/sw.js` when `document.body.dataset.offline !== undefined && 'serviceWorker' in navigator`.
  - On a page with `[data-save-offline]`: reveal the button, and post `save` with `location.pathname + location.search`, `/schedule?print=1`, `/vendors` and every `[data-offline-page]` href, on load and on click. Show the status with the local time when the reply arrives.
  - Banner: on load and on `offline`/`online` events, toggle `[data-offline-banner]`, filling `<time data-saved-time>` from `body.dataset.renderedAt`, formatted with `toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})`.
- [ ] **Step 2:** Browser check with Playwright against the dev server, as in the spec's browser test. Also run the usual 1280/390, light/dark, JS on/off sweep on `/schedule` and `/offline`.
- [ ] **Step 3:** Update the docs: README (offline section, `/offline` route, how clearing works) and CLAUDE.md (event pages list lives in `sw.js`; bump `VERSION` when changing cached assets' meaning).
- [ ] **Step 4:** Final whole-branch review (opus), then one fix pass, then `npm run check`.
- [ ] **Step 5:** Commit, push, and open a draft PR on `payments-contracts`.
