# Offline event day: design

Status: built without a separate approval round, at the product owner's request ("keep building on top like you are doing") · 2026-11-27 · branch `offline-event-day` (on `payments-contracts`, PR #4)

Every choice below that the product owner did not make is marked _(call)_.

## Why

This is the product owner's second priority (after payments and contracts). Venues often have no signal: a barn, a vineyard, a basement ballroom. On the wedding day the planner needs the timeline, vendor phone numbers and "what's included" on their phone, whether or not there is a connection. The notes.txt idea: "Make essential schedules and contacts easy to access on mobile, including offline on event day."

Success means: a planner opens the event-day schedule once while online, and later, with no connection at all, the same address still shows it. The vendor list and each scheduled vendor's page also work, and their phone numbers can still be tapped.

## Goals

- The **event-day schedule** (`/schedule`, plus its print view), the **vendor list** and the **vendor pages linked from the schedule** keep working offline once they have been opened online.
- Saving happens automatically on every online visit, and there is also a visible "Save for offline" button on the schedule.
- Offline, a banner says so and shows when the copy was saved, so nobody mistakes an old copy for live data.
- Any other page opened offline shows a friendly offline page with links to what is saved, instead of the browser's error.
- After sign-out, nothing about the wedding stays on the device.

## Non-goals

- Editing offline, or syncing changes made offline. Forms need a connection: no background sync and no queued posts.
- An installable app (web app manifest, icons, "Add to home screen" prompts). That could come later.
- Offline access to other pages (budget, guests, seating).
- Push notifications.

## Anti-goals

- **Showing the wrong wedding's day.** A planner runs several weddings; an offline copy must never silently be another couple's schedule. _(call)_ The saved copy is cleared whenever the active wedding changes, and every page shows the wedding's name in the header.
- Wedding data left on a shared device after sign-out.
- Breaking the no-JavaScript experience. Offline support needs JavaScript; without it, every page works online exactly as today.
- Caching anything that isn't a successful `GET` of the user's own pages: no POSTs, no login redirects, no error pages.

## Approaches considered

1. **A service worker with network-first caching of a few pages. Chosen.** It uses the pages that already exist, so there is nothing new to keep in sync. The same address works online and offline.
2. **A downloadable "event-day pack"** (a single HTML file or a PDF). Rejected: the planner has to remember to re-download it after every change, and a file can't keep up with the live data.
3. **Storing the data in IndexedDB and drawing the pages with JavaScript.** Rejected: it duplicates every view, breaks the server-rendering model, and is many times the work.

## How it works

- **`/sw.js`**, served from the site root so it controls every page, does the following:
  - **Static files** (`/css/*`, `/js/*`, `/images/*`): served from a cache, refreshed in the background.
  - **Event-day pages** (`/schedule`, `/schedule?print=1`, `/vendors`, `/vendors/<id>`): network first. A successful response (200, not redirected to `/login`) is saved. When the network fails, the saved copy is served. If there is none, the offline page is shown.
  - **Every other page:** network only. When the network fails, the offline page is shown.
  - Only `GET` requests are handled; everything else passes straight through.
  - The cache names carry a version, and old caches are deleted when the worker activates.
- **Registration:** `public/js/app.js` registers the worker only on signed-in pages (the body is marked `data-offline`), and only when the browser supports it.
- **Saving:** on the schedule page, `app.js` asks the worker to save `/schedule`, `/schedule?print=1`, `/vendors` and every vendor page linked from the schedule. This happens on each visit, and when the person taps **Save for offline**, which then reports "Saved for offline at 14:05". _(call)_ Vendor names on the schedule become links to their vendor pages, which is useful online too.
- **Offline page (`/offline`):** a small public page, saved when the worker installs, in the language in use at that time. It says "You're offline" and links to the event-day schedule and vendors.
- **Banner:** every page carries the time it was rendered (`data-rendered-at`). When the browser is offline, `app.js` shows a banner (`role="status"`): "You're offline. This copy was saved at 14:05." The time is formatted in the browser.
- **Clearing:** every rendered page carries an `X-FP-Wedding` header: the active wedding's id, or `none` when signed out or without a wedding. When it changes, the worker drops its saved pages, except the offline page. That covers switching weddings, signing in as someone else, an expired session and being removed from a wedding. Sign-out also sends `Clear-Site-Data: "cache", "storage"`, which removes everything, including the worker. _(Changed during review: the first version sent `Clear-Site-Data: "cache"` on switches, but that header doesn't clear the worker's page cache.)_
- **Weak signal:** if the network hasn't answered within 4 seconds and a saved copy exists, the saved copy is shown while the network keeps refreshing it in the background. A page served from the saved copy is marked (`data-saved-copy`), so the banner shows even when the browser thinks it is online. The banner shows the date when the copy is from another day. The print view has the banner too.
- **Save feedback:** "Saved for offline" only appears when `/schedule` itself was stored. Otherwise the page says it couldn't save.

## Constraints

- All `CLAUDE.md` conventions: no inline script or style (the service worker is a separate file, allowed by `script-src 'self'`), English and Spanish strings, and `npm run check` passing.
- The worker's routing decision is a pure function, `routeFor(url)`, returning `'static'`, `'event'`, `'page'` or `'skip'`. It is unit-tested by loading `sw.js` in a Node `vm` with a stub `self`.
- Phone first, as always.

## Testing

- **Unit (`routeFor`):**
  - static paths → `'static'`
  - `/schedule`, `/schedule?print=1`, `/vendors` and `/vendors/<uuid>` → `'event'`
  - `/vendors/<uuid>/edit` and `/vendors/<uuid>/contract` → `'page'`
  - other origins → `'skip'`
- **Integration:**
  - `/sw.js` is served as JavaScript.
  - `/offline` returns 200 for visitors and signed-in users, and links to `/schedule` and `/vendors`.
  - Sign-out sends `Clear-Site-Data` with `"cache"` and `"storage"`.
  - The wedding switcher and the planner's "Open" send `Clear-Site-Data: "cache"`.
  - Signed-in pages carry `data-offline` and `data-rendered-at`; visitor pages don't carry `data-offline`.
  - The schedule links vendor names to `/vendors/<id>` and has the Save for offline button.
- **Browser (Playwright, during verification, not in `npm test`):** open `/schedule` online, switch the context offline, reload `/schedule`, `/vendors` and a vendor page. All show the saved copies with the banner. `/budget` shows the offline page. Sign out, and the saved pages are gone.

## Left to the builder

The exact copy, the banner's styling, and the cache version string.
