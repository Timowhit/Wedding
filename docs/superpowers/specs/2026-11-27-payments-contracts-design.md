# Payments and contracts: design

Status: draft for approval · 2026-11-27 · branch `payments-contracts` (built on `planner-release`, PR #3)

## Why

Forever Planner is becoming a paid product for professional wedding planners. The product owner ranked the next releases: **1 payments and contracts**, 2 offline event day, 3 templates, 4 reminders. This release answers the two questions a planner asks most about a client's money and vendors:

- **"Who do we owe money to this month?"** Across one wedding, and across all of a planner's weddings.
- **"What exactly did the florist promise?"** Readable in seconds, including on a phone on the wedding day.

Success means a planner can stop keeping a separate spreadsheet of vendor payments and contract terms for each client.

## Goals

- A contract section on each vendor: total price, signed date, a link to the signed document, what's included, and cancellation terms.
- A payment schedule per vendor: amount, due date, paid/unpaid with the date it was paid.
- The budget counts contract totals automatically and shows **Committed · Paid · Still owed** against the budget total.
- "Payments due" on each wedding's dashboard and one cross-wedding list on the planner dashboard.
- The event-day schedule shows a vendor's "What's included" next to the items that name that vendor.

## Non-goals (this release)

- **File uploads.** Contracts are a link to wherever the planner already stores the signed PDF (Drive, Dropbox, email). Uploads (a storage service such as Cloudflare R2) may come later; the design must not block adding them.
- **Emails or notifications about due payments.** Those belong to the reminders release (4th). Overdue payments are shown in the app only.
- **Due dates or unpaid states for ordinary budget expenses.** Expenses that are not vendor contracts (the dress, the rings) keep counting as already paid, as today.
- Multiple currencies, invoices, receipts, taxes, tips, or taking payments through the app.
- Offline access (that is the next release).

## Anti-goals (a failure even if it works)

- Money counted twice. Moving to contracts must not silently double a wedding's committed total without the planner being able to see why and fix it.
- A contract section that turns a vendor into a long form. Every contract field is optional and can be filled in gradually; a vendor with no contract looks exactly as it does today.
- Fetching or embedding the document link on the server, or rendering it in a way that could run script.
- Couples or viewers seeing a different total from the planner.

## Decisions made with the product owner

- **Both questions matter equally:** payments due and contract terms.
- **Contracts: option A.** A link plus key terms written in the app. No file storage service in this release.
- **Budget: option 1.** Contract totals feed the budget automatically. The budget shows Committed / Paid / Still owed. Existing expenses stay; the planner deletes any that duplicate a contract.
- The contract section's content and look, as sketched below.
- "Who do we owe this month" appears on each wedding's dashboard and as one list across all weddings on the planner dashboard.

## Approaches considered

1. **Contract fields on the vendor, payments in a new table linked to the vendor. Chosen.** Planners think of contracts as "the florist's contract", so it lives with the vendor. One vendor has at most one contract, so it is a set of optional columns, not a separate table. Payments are many per vendor, so they get their own table.
2. **A separate Contracts page and table.** Rejected: it duplicates the vendor (name, category, contact details) and adds a place to look. Nothing in the questions above needs a contract that isn't attached to a vendor.
3. **Reuse budget expenses as payments.** Rejected: expenses have no vendor, due date or paid state, and treating an expense as a payment is exactly what causes double counting.

File storage: link only (A) was chosen over uploads to a storage service (B: setup, keys, cost, about double the work) and uploads into PostgreSQL (C: the database is small and backups would bloat).

## What the planner sees

### Vendor page (new: `/vendors/:id`)

Today vendors have a list and an edit form, but no page of their own. Each vendor gets a detail page; the vendor's name in the list links to it. _(Builder's call made in this design: a detail page is the natural home for the contract and payments; putting both on the list would make the list long.)_

```
← Vendors
Bloom & Blossom                          Florist · Booked
(555) 010-2000 · hello@bloom.example · bloom.example
[Edit vendor]

Contract
  Signed 12 Mar 2027 · Total $4,800.00 · View signed contract ↗
  What's included
    Bridal bouquet, 4 bridesmaid bouquets, ceremony arch,
    12 centrepieces. Setup from 12:00, teardown by 23:00.
  Cancellation
    Deposit non-refundable; 50% back if cancelled 90+ days out.
  [Edit contract]

Payments                         Paid $1,200 · Still owed $3,600
  ✓ Deposit        $1,200.00   paid 12 Mar 2027        [Mark unpaid]
    2nd payment    $1,800.00   due 1 Apr 2027  overdue  [Mark paid]
    Final payment  $1,800.00   due 1 May 2027           [Mark paid]
  $0.00 not yet scheduled
  [+ Add a payment]
```

- With no contract details yet: a short empty state and an "Add contract details" link.
- Payments without a contract total are allowed. "Still owed" is then the sum of unpaid payments.
- When scheduled payments don't add up to the contract total, show the difference: "$600.00 not yet scheduled", or "$300.00 more than the contract total" when they exceed it. This is not an error.
- Overdue = unpaid with a due date before today. Shown with the existing danger style and the word "overdue", not colour alone.
- "Mark paid" records today's date as the paid date. The edit form lets someone set a different paid date (paid by cheque last week).
- Payment rows: label (optional, e.g. "Deposit"), amount (required, > 0), due date (optional), paid date (optional; set = paid), note (optional).
- Edit and delete per payment, using the patterns of the decisions and schedule pages: an edit page, and delete behind `data-confirm`.

### Vendor list

- Each card gets one extra line when there is a contract or payments: "Contract $4,800 · $3,600 owed · next due 1 Apr", with "overdue" in the danger style when any payment is overdue.
- The vendor name links to the detail page.

### Contract form

On its own edit page (`/vendors/:id/contract`), not in the vendor edit form, so the existing vendor form stays short. Fields:

- **Total price** (optional, ≥ 0, same rules as budget amounts)
- **Signed on** (optional date)
- **Link to the signed contract** (optional; must be an `https://` URL of at most 2,000 characters)
- **What's included** (optional, multi-line, up to 2,000 characters)
- **Cancellation and refund terms** (optional, multi-line, up to 1,000 characters)

Saving with every field empty clears the contract.

### Budget page

```
Budget                                   Total $32,000.00
Committed $27,040.00 · Paid $14,690.00 · Still owed $12,350.00
[progress bar: committed vs total; paid portion shaded]

Vendor contracts
  Bloom & Blossom   Florist     $4,800.00   paid $1,200.00   →
  Golden Hour       Photography $2,800.00   paid $2,800.00   →
Other expenses
  Dress alterations Attire      $450.00
  ...
```

- Figures are worked out **per vendor, then summed** _(builder's call, from the builder check)_:
  - vendor committed = the larger of its contract total and the sum of its payments (a vendor with no total commits the sum of its payments)
  - vendor paid = the sum of its paid payments
  - vendor still owed = vendor committed − vendor paid, never below zero

  Overpaying one vendor never hides money owed to another.

- **Committed** = sum of vendor committed + sum of ordinary expenses.
- **Paid** = sum of vendor paid + sum of ordinary expenses.
- **Still owed** = sum of vendor still owed.
- The vendor page's "Still owed" uses the same per-vendor rule: contract total minus paid. That includes any part not yet scheduled, so it can be more than the sum of unpaid payments, and the page shows the unscheduled difference beside it.
- Over budget means Committed > Total. Category totals include vendor contracts under the vendor's category, using a fixed mapping kept beside the two lists in `constants.js` _(builder's call: the lists barely overlap by name)_:

  | Vendor category            | Budget category |
  | -------------------------- | --------------- |
  | Photographer, Videographer | Photography     |
  | Florist                    | Flowers         |
  | Caterer, Cake              | Catering        |
  | Venue                      | Venue           |
  | DJ / Band                  | Music           |
  | Hair & Makeup              | Attire          |
  | Transportation             | Transportation  |
  | Officiant, Other           | Other           |

  A test fails if a vendor category has no mapping.

- **Double-counting warning:** when an ordinary expense's name contains a vendor's name, or the expense is in a contracted vendor's (mapped) category **and** its amount equals that vendor's contract total or one of its payments, show a quiet notice at the top: "Some expenses may duplicate vendor contracts. Delete any that are already part of a contract." It links to the expense list. _(Builder's call: the amount check keeps it from nagging when an expense and a contract legitimately share a category. It only warns and never changes data.)_

### Dashboards

- **Wedding dashboard:** a "Payments due" card listing overdue payments first (in the danger style), then payments due in the next 30 days. Each row shows vendor, label, amount and due date, and links to the vendor page. Hidden when there is nothing overdue or due in 30 days.
- **The budget stat card** on the dashboard switches from "spent" to committed and still owed.
- **Planner dashboard (`/planner`):**
  - A "Payments due" section across all the planner's weddings, with "This month" (default), "Next 30 days" and "Overdue" filters. _(Builder's calls:)_
    - "This month" is the calendar month **plus everything overdue from before it**, since the question is "who do we owe".
    - "Next 30 days" is today to today + 30, plus overdue.
    - "Overdue" has no lower limit.
    - All weddings the planner is a member of are included, past ones too, and the dashboard's upcoming/past filter does not apply: an unpaid bill on a past wedding is still owed. Each row shows wedding, vendor, label, amount, due date and overdue state, and opening a row makes that wedding active and goes to the vendor page.
  - The workload totals get "payments overdue".
  - Each wedding card's budget line uses committed instead of spent.

### Event-day schedule

- A schedule item that names a vendor shows a "What's included" disclosure with that vendor's text, when there is some. It is also in the print view, fully open.

## Which day is "today"

Overdue, the 30-day window and the "Mark paid" date use one configured time zone: a new `APP_TIME_ZONE` setting (IANA name, default `UTC`), applied in SQL as `(NOW() AT TIME ZONE $tz)::date` through one helper. The existing date logic keeps working as it does. _(Builder's call: Render runs in UTC, so a US planner marking a payment paid in the evening would otherwise record tomorrow's date. Per-wedding time zones are a later improvement and would need a new column.)_

## Access

Same as vendors today:

- Members (including viewers) see contracts and payments.
- Editors, clients and the owner add, edit, delete and mark payments paid or unpaid.
- Viewers see no edit controls, and the routes refuse them.

## Data

New migration `009_payments_contracts.sql`. It only adds things and is safe to run more than once:

- `vendors` gets nullable columns: `contract_total NUMERIC(12,2) CHECK (contract_total >= 0)`, `contract_signed_on DATE`, `contract_url TEXT`, `contract_includes TEXT`, `contract_cancellation TEXT`.
- New table `vendor_payments`:
  - `id`, `wedding_id` (FK cascade), `vendor_id` (FK to vendors, cascade on delete)
  - `label TEXT`, `amount NUMERIC(12,2) NOT NULL CHECK (amount > 0)`, `due_date DATE`, `paid_on DATE`, `note TEXT`
  - `created_at`, `updated_at` (with the usual trigger)
  - an index on `(wedding_id, due_date) WHERE paid_on IS NULL`
- Every query is scoped by `wedding_id`. A payment's vendor must belong to the same wedding; the insert checks this in the same statement, as seating does for tables.
- Deleting a vendor deletes its payments. The vendor delete confirmation says so when the vendor has payments.

## Constraints

- All project conventions in `CLAUDE.md`:
  - layers, validators returning `{ values, data, errors }`
  - escaped output, CSRF on every form, no inline script or style
  - every feature works without JavaScript
  - English and Spanish strings, JSDoc, named constants
  - `npm run check` passing
- Phone first: the vendor page and the "Payments due" card must read well at 390px, with 44px touch targets.
- Money is `NUMERIC(12,2)`, formatted with the existing `formatCurrency`. No float arithmetic in SQL sums.
- The contract link is shown as a plain link with `rel="noopener noreferrer"` and `target="_blank"`. It is never fetched or embedded.

## Testing expectations

- Validators: contract fields (URL rule, lengths, all-empty clears) and payment fields (amount > 0, dates).
- Integration:
  - contract save and clear
  - adding, editing, paying and unpaying a payment
  - a payment for another wedding's vendor is refused
  - viewers are refused
  - budget figures in the four cases: contract total only, payments only, both, plus ordinary expenses
  - the over/under "not yet scheduled" difference
  - the dashboard and planner "Payments due" lists, including filters and overdue
  - the schedule shows "What's included"
  - deleting a vendor removes its payments
- The i18n tests already cover new keys in both languages.

## Left to the builder

- Exact copy beyond what's written here (in both languages).
- Whether payment edit uses its own page or an inline disclosure. Follow what the schedule page does.
- How "Mark paid" looks, within the existing button styles.
- Ordering within lists: due date ascending, unscheduled last.
- Landing page: if a "Coming next" item mentions payments or contracts, move it into the features list with one new screenshot from the vendor page.
