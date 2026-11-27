# Payments and Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Contract details and payment schedules on vendors, a budget that counts booked contracts (Committed · Paid · Still owed), and "Payments due" on wedding and planner dashboards.

**Architecture:** Contract fields are new nullable columns on `vendors`; payments are a new `vendor_payments` table. One model module (`src/models/payments.js`) owns every money calculation, applying the status rule in SQL, so the vendor page, budget, dashboards and planner cards all read the same figures. "Today" comes from one helper (`todayIso()`) in the configured `APP_TIME_ZONE` and is passed to SQL as a parameter.

**Tech Stack:** Express 5, EJS, PostgreSQL (`pg`), node:test, ESLint 9, Prettier.

**Spec:** `docs/superpowers/specs/2026-11-27-payments-contracts-design.md`

## Global Constraints

- Every convention in `CLAUDE.md`:
  - controllers have no SQL; validators are pure and return `{ values, data, errors }`
  - CSRF on every form; escaped output; no inline script or style
  - works without JS; en + es keys; JSDoc on exports; named constants
- Money: `NUMERIC(12,2)`; summed in SQL and cast with `::float` only at the end; formatted with `formatCurrency`.
- **Status rule:**
  - `Booked` counts in full.
  - `Researching` and `Contacted` count nothing; a contract total is shown as "Quote".
  - `Declined` counts only payments already paid, as both committed and paid.
- Per vendor:
  - committed = max(contract total, sum of payments); paid = sum of paid payments; owed = max(0, committed − paid)
  - for Declined: committed = paid = sum of paid payments, owed = 0
- Wedding totals:
  - Committed = Σ vendor committed + Σ expenses
  - Paid = Σ vendor paid + Σ expenses
  - Still owed = Σ vendor owed
- Contract link: optional; `https://` only; at most 2,000 characters. What's included: at most 2,000 characters. Cancellation: at most 1,000 characters.
- Payment: amount required and > 0; label optional, at most 120 characters; note optional, at most 500 characters; due and paid dates optional.
- Overdue: unpaid, with `due_date < today`.
- Wedding dashboard "Payments due": overdue first, then due within the next 30 days.
- Planner "Payments due" filters:
  - `month` (default): calendar month to date plus all overdue
  - `next30`: today to today + 30, plus overdue
  - `overdue`
  - covers all weddings the planner is a member of, ignoring the upcoming/past filter
- Phone first: 390px wide with no horizontal scroll, 44px touch targets.
- `APP_TIME_ZONE`: an IANA name, default `UTC`. An invalid value falls back to `UTC` with a `console.warn` at start-up.

## Review Focus

1. **A vendor moves from Booked to Declined after a paid deposit, with later payments unpaid.**
   - Expected: the budget keeps only the deposit (committed = paid = deposit), and the unpaid payments leave Payments due everywhere.
   - Test: Task 3, `declined vendor keeps only paid money`.
2. **Payment amounts like `0`, `-5`, `abc` or `1,200.555`** are rejected with a 400 and the form keeps the input. `$1,200` is accepted as 1200 (existing `parseMoney`).
   - Tests: Task 2 unit and Task 4 integration.
3. **Forged ids from another wedding** used to pay, edit or delete a payment, or to add a payment or contract to another wedding's vendor.
   - Expected: 404, nothing changes.
   - Test: Task 4, `another wedding's vendor or payment is out of reach`.
4. **A contract link of `javascript:alert(1)`, `http://…` or text containing quotes** is rejected or escaped, and is never rendered as anything but an escaped `https://` link.
   - Tests: Task 2 unit and Task 4 integration.
5. **A wedding with no vendors, no budget total and no expenses.**
   - Expected: the budget page, dashboard and planner card show $0.00, with no "NaN", no division by zero and no empty "Payments due" card.
   - Test: Task 5, `empty wedding shows zeros`.

---

### Task 1: Schema, constants and "today"

**Files:**

- Create: `src/db/migrations/009_payments_contracts.sql`
- Create: `src/utils/today.js`
- Modify: `src/constants.js`, `.env.example`, `src/app.js` (start-up time zone check)
- Test: `tests/unit/utils.test.js`, `tests/unit/constants.test.js` (new)

**Interfaces:**

- Produces:
  - `VENDOR_BUDGET_CATEGORY: Readonly<Record<VendorCategory, BudgetCategory>>`, using the mapping table in the spec
  - `COUNTED_STATUS = 'Booked'`, `PAID_ONLY_STATUS = 'Declined'`
  - `PAYMENT_DUE_WINDOW_DAYS = 30`, `PLANNER_PAYMENT_FILTERS = ['month','next30','overdue']`
  - `todayIso(timeZone = process.env.APP_TIME_ZONE): string` (YYYY-MM-DD); `isValidTimeZone(name): boolean`
  - The `vendor_payments` table and the `vendors.contract_*` columns, as in the spec's Data section

- [ ] **Step 1: Write failing tests.**
  - `constants.test.js`: `every vendor category maps to a budget category`. For each of `VENDOR_CATEGORIES`, `BUDGET_CATEGORIES.includes(VENDOR_BUDGET_CATEGORY[c])`.
  - `utils.test.js`:
    - `todayIso uses the configured time zone`: with a fixed clock (`mock.timers` set to `2027-03-01T03:00:00Z`), `todayIso('America/New_York') === '2027-02-28'` and `todayIso('UTC') === '2027-03-01'`.
    - `todayIso falls back to UTC on a bad zone`.
- [ ] **Step 2: Run `node --test tests/unit`. Expected: FAIL, the modules are missing.**
- [ ] **Step 3: Implement.**
  - `todayIso` uses `Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' })`. `isValidTimeZone` is a try/catch around the same.
  - Migration as in the spec:
    - `ALTER TABLE … ADD COLUMN IF NOT EXISTS`
    - a named CHECK added inside `DO $$ … IF NOT EXISTS (pg_constraint)` (008's style)
    - `CREATE TABLE IF NOT EXISTS vendor_payments` with `wedding_id REFERENCES weddings ON DELETE CASCADE`, `vendor_id REFERENCES vendors ON DELETE CASCADE`, `CHECK (amount > 0)`
    - `CREATE INDEX IF NOT EXISTS vendor_payments_unpaid_idx ON vendor_payments (wedding_id, due_date) WHERE paid_on IS NULL`
    - an `updated_at` trigger, using the same function 008 uses
  - `.env.example`: `APP_TIME_ZONE=America/New_York` with a comment.
  - `app.js`: warn once if the zone is invalid.
- [ ] **Step 4: Run `TEST_DB_URL=… npm test`. Expected: all pass. The migration runs twice cleanly (`node -e` calling `migrate` twice against fp_test).**
- [ ] **Step 5: Commit `feat: schema and today helper for payments`.**

### Task 2: Validators

**Files:**

- Create: `src/validators/payments.js`
- Test: `tests/unit/validators.test.js`

**Interfaces:**

- Produces:
  - `validateContract(body) → { values: {contract_total, contract_signed_on, contract_url, contract_includes, contract_cancellation}, data: {total: number|null, signedOn: string|null, url: string|null, includes: string|null, cancellation: string|null}, errors }`
  - `validatePayment(body) → { values: {label, amount, due_date, paid_on, note}, data: {label: string|null, amount: number, dueDate: string|null, paidOn: string|null, note: string|null}, errors }`
  - `CONTRACT_LIMITS = { url: 2000, includes: 2000, cancellation: 1000 }`
  - `PAYMENT_LIMITS = { label: 120, note: 500 }`

- [ ] **Step 1: Write failing tests.**
  - `validateContract` accepts all-empty: every `data` field is null and there are no errors.
  - It accepts `$4,800` as 4800.
  - It rejects `contract_url` of `http://x.com` and `javascript:alert(1)` (`field: 'contract_url'`, `key: 'validation.httpsUrl'`), and rejects 2,001 characters.
  - It rejects an invalid `contract_signed_on` (`validation.date`) and a negative total (`validation.amount`).
  - `validatePayment` rejects amounts `''`, `0`, `-5`, `abc` and `1,200.555` with `validation.positiveAmount`. It accepts `$1,200` as 1200, and accepts an empty label, due date and paid date as null. It rejects a 121-character label.
- [ ] **Step 2: Run `node --test tests/unit/validators.test.js`. Expected: FAIL.**
- [ ] **Step 3: Implement with the helpers in `common.js`** (`readText`, `parseMoney`, `isValidDate`, `checkText`, `collectErrors`). The https check is `new URL(v).protocol === 'https:'`. Add the i18n keys `validation.httpsUrl` (and `validation.amount` if it is missing) in en and es.
- [ ] **Step 4: Run the unit tests again. Expected: PASS.**
- [ ] **Step 5: Commit `feat: contract and payment validators`.**

### Task 3: Payments model (all money maths)

**Files:**

- Create: `src/models/payments.js`
- Modify: `src/models/vendors.js` (contract columns in `VENDOR_COLUMNS`; `updateContract`; `countVendorPayments`)
- Test: `tests/integration/payments.test.js` (new; model-level `describe('money', …)`)

**Interfaces:**

- Consumes: Task 1 constants and `todayIso`.
- Produces:
  - `updateContract(vendorId, weddingId, contractData) → Promise<boolean>`
  - `findPayments(vendorId, weddingId) → Promise<Payment[]>`, ordered by due_date ASC NULLS LAST, then created_at
  - `findPayment(id, weddingId) → Promise<Payment|null>`
  - `createPayment(vendorId, weddingId, data) → Promise<Payment|null>`. Null when the vendor isn't in this wedding: an `INSERT … SELECT … FROM vendors WHERE id=$ AND wedding_id=$`.
  - `updatePayment(id, weddingId, data) → Promise<Payment|null>`
  - `setPaymentPaid(id, weddingId, paidOn: string|null) → Promise<Payment|null>`
  - `deletePayment(id, weddingId) → Promise<boolean>`
  - `findVendorMoney(weddingId) → Promise<Map<vendorId, {counts: boolean, quote: number|null, committed, paid, owed, scheduled, unscheduled, overdue: boolean, nextDue: string|null}>>`
    - `scheduled` = sum of all payments; `unscheduled` = contract total − scheduled (it can be negative; null without a total)
    - `today` is a parameter, defaulting to `todayIso()`
  - `findMoneySummary(weddingId) → Promise<{limit, committed, paid, owed, expenses, over: boolean}>`
  - `findContractRows(weddingId) → Promise<Array<{id, name, category, budgetCategory, committed, paid, owed}>>`, counting vendors only
  - `findPaymentsDue(weddingId, { today, days = PAYMENT_DUE_WINDOW_DAYS }) → Promise<DueRow[]>`
  - `findPlannerPaymentsDue(userId, { filter, today }) → Promise<DueRow[]>`
  - `countPlannerOverdue(userId, today) → Promise<number>`
  - `DueRow = { id, wedding_id, wedding_name, vendor_id, vendor_name, label, amount, due_date, overdue: boolean }`
  - Due lists only include unpaid payments of Booked vendors.

- [ ] **Step 1: Write failing model tests** (seed SQL with `app.pool`, then call the functions).
  - `booked vendor: total only, payments only, both, overpaid`:
    - total 4800 with no payments → committed 4800, paid 0, owed 4800
    - payments 1000 (paid) + 500 with no total → committed 1500, paid 1000, owed 500
    - total 4800 with 1200 paid + 1800 unpaid → committed 4800, paid 1200, owed 3600, unscheduled 1800
    - total 4800 with 5100 paid → committed 5100, owed 0, unscheduled −300
  - `researching vendor counts nothing and shows a quote`: total 3000 → counts false, quote 3000, and it is not in the summary.
  - `declined vendor keeps only paid money`: total 4800, deposit 1200 paid, 1800 unpaid → committed = paid = 1200 and owed 0. Payments due excludes the 1800.
  - `summary adds expenses as paid`: one booked vendor (4800, 1200 paid) plus a 450 expense → `{committed: 5250, paid: 1650, owed: 3600}`.
  - `overpaying one vendor never hides another's debt`: A (1000, 1300 paid) and B (2000, 0 paid) → owed 2000.
  - `payments due window`: payments 5 days overdue, 10 days ahead and 40 days ahead, with today fixed → the first two, overdue first.
  - `planner filters`: with today `2027-03-15`, a payment due `2027-03-28` is in `month`. One due `2027-04-10` is in `next30` but not `month`. One due `2027-02-01` (overdue) is in all three. A past wedding's unpaid payment appears.
  - `createPayment refuses another wedding's vendor` → null and no row.
- [ ] **Step 2: Run `TEST_DB_URL=… node --test tests/integration/payments.test.js`. Expected: FAIL (the module is missing).**
- [ ] **Step 3: Implement.** One SQL CTE computes the per-vendor figures; `findVendorMoney`, `findMoneySummary` and `findContractRows` reuse it:

```sql
WITH pay AS (
  SELECT vendor_id, SUM(amount) AS scheduled,
         COALESCE(SUM(amount) FILTER (WHERE paid_on IS NOT NULL), 0) AS paid,
         BOOL_OR(paid_on IS NULL AND due_date < $2::date) AS overdue,
         MIN(due_date) FILTER (WHERE paid_on IS NULL) AS next_due
  FROM vendor_payments WHERE wedding_id = $1 GROUP BY vendor_id)
SELECT v.id, v.status, v.contract_total, COALESCE(p.scheduled,0) AS scheduled, COALESCE(p.paid,0) AS paid,
       CASE WHEN v.status = 'Booked' THEN GREATEST(COALESCE(v.contract_total,0), COALESCE(p.scheduled,0))
            WHEN v.status = 'Declined' THEN COALESCE(p.paid,0) ELSE 0 END AS committed, ...
FROM vendors v LEFT JOIN pay p ON p.vendor_id = v.id WHERE v.wedding_id = $1
```

The CASE uses the `COUNTED_STATUS`/`PAID_ONLY_STATUS` constants as parameters, not literals.

- [ ] **Step 4: Run the test file again. Expected: PASS.**
- [ ] **Step 5: Commit `feat: payments model and money summary`.**

### Task 4: Vendor page, contract form, payments

**Files:**

- Create: `src/controllers/payments.js`
- Create views: `vendor.ejs`, `edit-contract.ejs`, `edit-payment.ejs`, `partials/payment-fields.ejs`
- Modify: `src/controllers/vendors.js` (`showVendor`; delete confirmation count), `src/routes/index.js`, `src/views/vendors.ejs` (name links to the page; money line), `public/css/main.css`, `src/i18n/en.js`, `src/i18n/es.js`
- Test: `tests/integration/payments.test.js` (`describe('vendor page', …)`)

**Interfaces:**

- Consumes: Tasks 2 and 3.
- Routes:

  | Route                                        | Access |
  | -------------------------------------------- | ------ |
  | `GET /vendors/:id`                           | member |
  | `GET` and `POST /vendors/:id/contract`       | editor |
  | `POST /vendors/:id/payments`                 | editor |
  | `GET` and `POST /payments/:id/edit`          | editor |
  | `POST /payments/:id/paid` (body `paid=1\|0`) | editor |
  | `POST /payments/:id/delete`                  | editor |

  Every unknown or foreign id → `next()` → 404. Successful POSTs redirect to `/vendors/:vendorId`.

- [ ] **Step 1: Write failing tests.** Set up as in decisions.test.js: a planner, a client and a viewer.
  - `contract saves, shows and clears`:
    - POST the contract with total `$4,800`, signed `2027-03-12`, url `https://drive.example/c.pdf`, and includes "12 centrepieces".
    - The vendor page shows `$4,800.00`, `12 centrepieces` and `href="https://drive.example/c.pdf"` with `rel="noopener noreferrer"`.
    - POSTing all-empty clears the contract, and the page shows the empty state.
  - `invalid contract re-renders with 400`: url `javascript:alert(1)` → 400; the body contains the escaped value in the input; nothing is saved.
  - `add, pay, unpay, edit and delete a payment`:
    - Add `Deposit $1,200` → it is listed.
    - `paid=1` → `paid_on` = today. `paid=0` → null.
    - Edit the paid date to `2027-03-01` → it is shown.
    - Delete → gone.
  - `the vendor page shows owed and unscheduled`: total 4800, payments 1200 (paid) and 1800 → `Still owed $3,600.00` and `$1,800.00 not yet scheduled`. With 5100 scheduled → `$300.00 more than the contract total`.
  - `overdue is marked in words`: an unpaid payment with a past due date shows `overdue`.
  - `the vendor list shows the money line and a quote for unbooked vendors`:
    - Booked → `Contract $4,800.00 · $3,600.00 owed`.
    - Researching with a total → `Quote $3,000.00`.
  - `viewers see but cannot change`: the viewer sees the page with no forms. A viewer POST to `/vendors/:id/payments` is refused (redirect, as in decisions.test.js), and no row is added.
  - `another wedding's vendor or payment is out of reach`:
    - A second couple's wedding has a vendor and a payment.
    - The planner POSTs to their `/vendors/:id/contract`, `/vendors/:id/payments`, `/payments/:id/paid`, `/payments/:id/edit` and `/payments/:id/delete` → each 404, with rows unchanged.
  - `deleting a vendor removes its payments, and the confirmation says so`: the delete form's `data-confirm` text includes the payment count. After the delete, `vendor_payments` has no rows for it.
  - `bad payment amount keeps the input`: amount `abc` → 400, and the body contains `value="abc"`.
- [ ] **Step 2: Run the test file. Expected: the new tests FAIL with 404.**
- [ ] **Step 3: Implement.**
  - The controllers follow the decisions/schedule pattern: validate → model → `setFlash` → redirect; on errors re-render with 400.
  - Views follow the spec's sketch. Payment rows are a `<ul>` with a "Mark paid"/"Mark unpaid" form button, and the `aria-label` names the payment.
  - The "Add a payment" form uses `add-panel`, opened when the vendor has no payments.
  - Contract link: `<a href="<%= vendor.contract_url %>" target="_blank" rel="noopener noreferrer">`.
  - "What's included" and cancellation keep line breaks via CSS `white-space: pre-line` (no HTML).
- [ ] **Step 4: Run the tests, then `npm run check`. Expected: PASS.**
- [ ] **Step 5: Commit `feat: vendor page with contract and payments`.**

### Task 5: Budget uses committed / paid / owed

**Files:**

- Modify: `src/controllers/budget.js`, `src/views/budget.ejs`, `src/models/budget.js` (`findCategoryTotals` adds counting vendors through `VENDOR_BUDGET_CATEGORY`), `src/controllers/dashboard.js` and `src/views/dashboard.ejs` (budget stat), `src/models/planner.js` (`spent` → `committed`) and `src/views/planner.ejs`, i18n
- Test: `tests/integration/payments.test.js` (`describe('budget', …)`); update existing assertions in `planning.test.js` and `planner.test.js` that check "spent" wording, where the wording changes

**Interfaces:**

- Consumes: `findMoneySummary`, `findContractRows`, `findVendorMoney` (Task 3).
- Produces:
  - `findDuplicateExpenseHints(weddingId) → Promise<boolean>`, in `models/payments.js`: true if any expense matches a counting vendor by name (case-insensitive `POSITION`) or by mapped category plus the same amount as the contract total or one of its payments
  - The planner overview row field is renamed from `spent` to `committed`.

- [ ] **Step 1: Write failing tests.**
  - `budget shows committed, paid and still owed`: limit 32000, a booked vendor (4800, 1200 paid) and a 450 expense → the page shows `Committed $5,250.00`, `Paid $1,650.00` and `Still owed $3,600.00`. The vendor appears under the vendor contracts heading with a link to `/vendors/<id>`.
  - `category totals include contracts`: a booked Florist with 4800 → the Flowers total includes $4,800.00.
  - `duplicate hint`: an expense "Bloom & Blossom deposit" with a booked vendor "Bloom & Blossom" → the hint text appears. Delete the expense → it is gone. An expense in Flowers with a different amount → no hint.
  - `over budget uses committed`: limit 4000 with a booked 4800 contract → the over-budget state shows.
  - `empty wedding shows zeros`: a new couple wedding shows `$0.00` three times on `/budget`. The dashboard has no `NaN`. The planner card for an empty wedding shows `$0.00`.
  - `dashboard and planner card use committed`: the dashboard budget stat shows `$5,250.00`. The planner card shows `$5,250.00 of $32,000.00`.
- [ ] **Step 2: Run the tests. Expected: FAIL.**
- [ ] **Step 3: Implement.**
  - The `renderBudget` summary becomes `{limit, committed, paid, owed, pct (committed/limit capped at 100), paidPct, over}`.
  - Keep the expense list and form as they are, under an "Other expenses" heading.
  - The progress bar shows committed, with the paid share as a second layer (pure CSS widths). Since CSP forbids style attributes, use `<progress>` or `<meter>` elements. Check how budget.ejs draws the bar today and keep that technique.
- [ ] **Step 4: Run the tests and `npm run check`. Expected: PASS.**
- [ ] **Step 5: Commit `feat: budget counts booked vendor contracts`.**

### Task 6: Payments due on the dashboards

**Files:**

- Modify: `src/controllers/dashboard.js`, `src/views/dashboard.ejs`, `src/controllers/planner.js`, `src/views/planner.ejs`, `src/models/planner.js` (workload `overduePayments`), i18n, CSS
- Test: `tests/integration/payments.test.js` (`describe('payments due', …)`)

**Interfaces:**

- Consumes: `findPaymentsDue`, `findPlannerPaymentsDue`, `countPlannerOverdue`, `todayIso`.
- The planner query param is `pay=month|next30|overdue`, read with `readChoice` and defaulting to `month`. It sits alongside the existing `q` and `when` in the same GET form, so the filters survive.
- Opening a row: a POST form to the existing `/planner/weddings/:id/open` with hidden `return_to=/vendors/<vendorId>`. Extend `processOpenWedding` to honour a local `return_to` that starts with `/vendors/`, and default to `/` otherwise.

- [ ] **Step 1: Write failing tests.**
  - `wedding dashboard lists overdue then upcoming payments`: with payments 5 days overdue, 10 days ahead and 40 days ahead → the card lists the first two in that order, and the overdue one has the word `overdue`. A wedding with none → no "Payments due" heading.
  - `unbooked vendors' payments are not due`: a Researching vendor's unpaid payment is absent.
  - `planner sees payments due across weddings with filters`: two weddings, with payments as in Task 3's filter test (using real dates relative to `todayIso()`) → the default shows this month plus overdue. `?pay=next30` and `?pay=overdue` follow the spec. `?pay=bogus` behaves as `month`.
  - `workload counts overdue payments`: 2 overdue → the workload stat reads `2` with the label `payments overdue`.
  - `opening a payment row goes to the vendor in that wedding`: POST open with `return_to=/vendors/<id>` → the location is `/vendors/<id>`, and the active wedding has switched. `return_to=https://evil.com` → `/`.
- [ ] **Step 2: Run the tests. Expected: FAIL.**
- [ ] **Step 3: Implement as in the spec's Dashboards section, using the existing card, list and `filter-bar` styles.**
- [ ] **Step 4: Run the tests and `npm run check`. Expected: PASS.**
- [ ] **Step 5: Commit `feat: payments due on wedding and planner dashboards`.**

### Task 7: What's included on the event-day schedule

**Files:**

- Modify: `src/models/schedule.js` (select `v.contract_includes AS vendor_includes` in the existing scoped join), `src/views/schedule.ejs`, i18n
- Test: `tests/integration/schedule.test.js`

- [ ] **Step 1: Write the failing test** `schedule shows the vendor's included items`. Give the vendor `contract_includes` "Arch and 12 centrepieces" and link a schedule item to it. `/schedule` contains a `<details>` whose summary is "What's included" and the text. `/schedule?print=1` contains the text inside `<details open>`. An item whose vendor has no text shows no disclosure.
- [ ] **Step 2: Run it. Expected: FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the test file and `npm run check`. Expected: PASS.**
- [ ] **Step 5: Commit `feat: show vendor inclusions on the schedule`.**

### Task 8: Docs, verification, review, PR

**Files:** `README.md` (features, routes, schema, `APP_TIME_ZONE`), `CLAUDE.md` (money rules live in `models/payments.js`; use `todayIso()` rather than `new Date()` for day logic in new code).

- [ ] **Step 1: Update the docs and run `npx prettier --check .`.**
- [ ] **Step 2: Browser check** with the dev server on port 3998 against `fp_shots`:
  - pages: `/vendors/:id`, `/vendors/:id/contract`, `/payments/:id/edit`, `/budget`, `/`, `/planner`, `/schedule`
  - at 1280 and 390, in light and dark, with JS on and off
  - expect no console or CSP errors, no overflow, and 44px targets
- [ ] **Step 3: Final whole-branch review** (opus subagent with `code-reviewer.md`, this plan's Review Focus and the ledger rulings), then one fix pass.
- [ ] **Step 4: `npm run check` with the suite green, then push and update the PR #4 description.**
