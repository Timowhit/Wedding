# Planner release: design

Status: draft for approval · Date: 2026-11-26 · Source ideas: `notes.txt`

## Intent and why

Forever Planner is becoming a **subscription product for professional wedding planners**. Planners pay; their couples are invited in as clients for free. Couples planning on their own keep using the app free, as they do today, which also brings in people who may later hire a planner.

The goal of this release is **traction**: planners discover the product, start using it, and lock in a founding discount before billing exists. Success is founding planners starting accounts and running real client weddings in the app.

Today the app is built for one couple planning their own wedding, and logged-out visitors to `/` only see the sign-in form. This release adds a public landing page aimed at planners and the planner features that best show what a couple-only app cannot do.

## Goals

1. **Public landing page** at `/` for logged-out visitors, written for planners, with a short section for couples.
2. **Founding planners:** the first 300 planner accounts are numbered founding accounts with a **40% discount for life** once billing starts. The page shows how many of the 300 spots are left.
3. **Planner accounts** that run many client weddings, with an **all-weddings dashboard** (next deadlines, open decisions, budget status per wedding).
4. **Couples as clients:** a `client` role so the couple sees and works on their own wedding and approves decisions.
5. **Decisions:** questions the planner puts to the couple ("Choose the ceremony music"), which the couple approves or sends back with a comment.
6. **Event-day schedule:** a timeline with times, locations, vendor arrival times and contacts, setup notes and contingency notes, readable on a phone and printable.
7. **Seating chart:** tables with sizes, guest groups, and assigning guests to tables.
8. **Color themes:** every user picks a palette and light/dark/automatic mode; a planner sets a brand palette that everyone sees inside the planner's weddings.

## Non-goals (later rounds, already in `notes.txt`)

Payments and Stripe billing; email reminders; file uploads (contracts, floor plans, logos); questionnaires, proposals and message templates; custom fields and workflows; offline mode; calendar views; post-event wrap-up; vendors as users; a business "studio" above weddings (see Approaches); quotes, deposits and payment schedules; meal choices and accessibility needs on guests.

## Anti-goals (would make this a failure even if it works)

- The landing page promises features that do not exist. It may list upcoming features only under a clearly labelled "Coming next" heading.
- Couples' current experience gets worse: a couple who never meets a planner must see no planner jargon and lose nothing.
- Any feature stops working without JavaScript, or any page needs an inline script or style (the CSP forbids them).
- A theme fails WCAG AA contrast (4.5:1 text, 3:1 form-control borders) in light or dark mode.
- More than 300 founding numbers are handed out, or two planners get the same one, even under simultaneous sign-ups.
- Third-party trackers or analytics scripts added to the landing page.

## Decided with the product owner

- Calls to action say **"Start now"**, never "Sign up". This applies to the landing page and to the sign-up form title and button for planners and couples.
- The founding offer is exactly: **40% off for life, first 300 planners.** No base price is shown; the page says pricing will be announced and the discount is locked in.
- Approach **A** (below): planner accounts on the existing wedding/membership model.
- Themes: **personal palette and mode for everyone, and the planner's brand palette wins inside weddings the planner owns** (option "both"). Logo upload waits for the file-upload round.

## Approaches considered

| | Approach | Trade-off | Outcome |
|---|---|---|---|
| A | Planner accounts on the current model: a user is a planner (with a founding number); the planner owns each client wedding through `wedding_members`; couples join as `client`; assistants join as `editor` | Smallest change, built on working, tested code. A planner's assistants are added per wedding; the subscription will attach to the planner's user account | **Chosen**: ships to planners soonest; records can later move under a studio |
| B | A business "studio" owns weddings and the subscription; assistants join the studio once | Fits agencies and team billing, but needs a migration of every wedding and a concept couples never see, before anything reaches planners | Deferred |
| C | A separate planner area of the site | Two versions of the same screens to keep in sync | Rejected |

## The design

### Accounts and roles

- `users` gains `account_type` (`couple` | `planner`, default `couple`), `founding_number` (1 to 300, unique, null for non-founding), `business_name` (planners, optional, up to 120 characters), `theme_palette`, `theme_mode`, and `brand_palette` (planners only, null means "use each person's own palette").
- Existing users become `couple`. A couple can switch to a planner account from Settings ("I'm a wedding planner"); that path also gets a founding number while spots remain. A planner cannot switch back in this release.
- **Founding numbers:** assigned in the same transaction that creates (or upgrades) the planner account. Assignment must be safe under concurrent sign-ups: never above 300, never duplicated (for example an advisory lock or `SELECT … FOR UPDATE` on a single counter row, plus the unique constraint as the final guard). After 300, planners still sign up; they are just not founding. *(Mechanism: builder's call.)*
- `wedding_members.role` gains `client`. Role ranks: `viewer` < `client` = `editor` < `owner`. In this release a **client can do everything an editor can** (guests, budget, checklist, vendors, music, inspiration, seating, schedule) **plus answer decisions**. Only owners manage members, invites and wedding settings; only the owner and editors create decisions. *(Product call made by me: couples are used to editing their own guest list; restricting clients further is easy later.)*
- Invites gain the `client` role. Planners see "Client (the couple)", "Editor (assistant)" and "Viewer" when inviting; couples' own weddings keep "Editor" and "Viewer" only, so couples never see planner wording.

### Sign-up flow ("Start now")

- `GET /start` offers two cards: "I'm a wedding planner" and "We're planning our wedding". Each leads to the registration form with `?as=planner` or `?as=couple`; `/register` without it behaves as a couple sign-up, as today.
- Planner registration adds an optional business name field and shows "Founding planner #N" on success while spots remain. **Planner accounts do not get an automatic wedding**; their first screen is the empty planner dashboard with "Add a client wedding".
- Couple registration is unchanged (an automatic wedding, except when joining from an invite link).
- Google sign-in: "Start now" with Google on the planner card stores the intent in the session, so the new account is created as a planner.

### Landing page (`GET /` when logged out)

Logged-in users keep getting their dashboard at `/`. Sections, all translated (English and Spanish):

1. Hero: headline about running every client's wedding in one place, sub-line, "Start now" button (planner), secondary "Planning your own wedding? Start free" link.
2. Founding offer band: "40% off for life for the first 300 planners · N spots left", with a "Start now" button. When the spots run out, the band says the founding offer has ended and the page stays otherwise the same.
3. Feature sections with real screenshots: planner dashboard, client portal and decisions, event-day schedule, seating chart, budget and guests.
4. For couples: free to use, invited by their planner or on their own.
5. "Coming next": a plain list of upcoming features from `notes.txt` (files, reminders, templates, offline event day, calendar).
6. Footer with the language picker.

Screenshots are static images in `public/images/`, taken from a seeded demo wedding (both themes not required; light theme). Page weight stays small: compressed WebP/PNG with width/height set, lazy-loaded below the hero. No external scripts.

### Planner dashboard (`GET /planner`, planners only)

- Planners land here after sign-in. The nav shows "All weddings" for planners. The existing per-wedding dashboard stays at `/` for everyone, showing the active wedding.
- One card per wedding the planner owns or is a member of, soonest wedding date first, then undated:
  - name, date and days to go
  - next 3 deadlines: unfinished checklist tasks and open decisions that have due dates, soonest first (overdue ones flagged)
  - number of open decisions and of decisions sent back
  - budget: spent of total, flagged when over
  - guests: confirmed of total
  - "Open" (switches the active wedding and goes to `/`)
- Filters: search by wedding name; "Upcoming" (default) / "Past" / "All". Workload summary at the top: weddings this month, open decisions across all weddings, overdue tasks across all weddings.
- "Add a client wedding": couple's names (the wedding name) and optional date; creates the wedding owned by the planner and offers to invite the couple as clients straight away.

### Decisions (`/decisions`)

- `decisions` table: wedding, title (required, up to 200), details (optional, up to 2000), due date (optional), status `open` | `approved` | `changes_requested`, response comment (optional, up to 1000), created by, answered by, answered at, timestamps.
- Owners and editors create, edit and delete decisions. Clients (and owners, for couples' own weddings) answer: **Approve**, or **Request changes** with a comment. Re-opening a decision after changes sets it back to `open` and clears the answer.
- The list shows open decisions first; the per-wedding dashboard shows the count of open decisions for clients ("2 decisions waiting for you").
- Plain-language labels; no email notifications in this release.

### Event-day schedule (`/schedule`)

- `schedule_items` table: wedding, start time (`HH:MM`, required), end time (optional), title (required), location (optional), vendor (optional link to a vendor of the same wedding; deleting the vendor clears the link), contact (optional free text, e.g. a phone number), notes (optional), contingency (optional, the "plan B" text), sort by start time then creation.
- The schedule is for the wedding date. The page shows a clear timeline (time column, item, location, vendor with its phone as a `tel:` link), add/edit/delete like other list pages, and a print stylesheet (one clean column, no navigation, page breaks avoided inside items). "Print" uses a normal link to `/schedule?print=1` or the browser's print command; nothing needs JavaScript.

### Seating chart (`/seating`)

- `seating_tables` table: wedding, name (required, up to 80, unique per wedding), seats (1 to 30), sort order.
- `guests` gains `table_id` (nullable, `ON DELETE SET NULL`) and `group_name` (optional, up to 80, e.g. "Bride's family").
- A guest with a plus-one takes **two seats**. Declined guests are listed separately and are not seated.
- The page shows each table as a card with seats used/total (over capacity is flagged but allowed) and its guests, plus an "Unseated" list that can be filtered by group. Every guest row has a table select that saves on change (Save button without JavaScript). With JavaScript, guests can also be dragged between tables; the drop submits the same form.
- Guest group is added to the guest add/edit form and shown on the guest list.

### Themes

- Palettes: **Rose** (today's look, default), **Sage**, **Navy**, **Champagne**, **Slate**. Modes: **Automatic** (follows the device, default), **Light**, **Dark**.
- Implemented with the existing CSS variables: `<html data-palette="…" data-mode="…">`, one block of token overrides per palette for light and dark. No inline styles.
- Which palette applies: inside a wedding owned by a planner who set a brand palette, that brand palette; otherwise the person's own palette. Mode is always personal. The landing page uses Rose with automatic mode.
- Settings gets an "Appearance" section (palette and mode, with small colour swatches), and planners get "Your business" (business name, brand palette).
- Every palette must pass AA in both modes for text and form borders. A unit test computes the contrast of each palette's key token pairs from a single JavaScript definition of the palettes, which also generates or is checked against the CSS.

### Cross-cutting

- Conventions in `CLAUDE.md` apply: validators return i18n keys, models are scoped by `wedding_id`, every new form has CSRF and `return-to`, every string exists in English and Spanish, no inline script or style, 44px touch targets on narrow screens.
- One new migration (`008_…`) adds all columns and tables idempotently.
- README updated: features, routes, roles, founding offer. Integration tests cover each new route, role checks (a client cannot manage members; a viewer cannot answer decisions; a planner from another wedding sees nothing), founding-number assignment including the 300 cap under concurrent sign-ups, and theme resolution.

## Left to the builder

- Exact copy for the landing page, within the decided offer wording and "Start now" rule.
- The concurrency mechanism for founding numbers.
- The five palettes' exact colours, provided they meet AA in both modes.
- Drag-and-drop implementation details for the seating chart.
- How screenshots for the landing page are produced (a script that seeds demo data and captures them is preferred, so they can be refreshed).
