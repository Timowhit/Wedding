# Templates: design

Status: built without a separate approval round, at the product owner's request ("keep building on top like you are doing") · 2026-11-27 · branch `templates` (on `offline-event-day`, PR #5)

Every choice below that the product owner did not make is marked _(call)_.

## Why

This is the product owner's third priority. Planners repeat the same work for every couple: the same 40-task checklist with the same lead times, and the same event-day timeline (hair and makeup at 10:00, photos at 14:00, ceremony at 15:30…). The notes.txt ideas are "wedding-specific templates for timelines, task lists, budgets, and vendor coordination" and "reusable questionnaires, proposals, email messages". Templates save a planner time on every new client, and that is the direct value a subscription has to deliver.

Success means a planner builds a checklist or timeline once, saves it, and fills a new client's wedding with it in two taps. Due dates land at the right distance before the new wedding date.

## Goals

- **Save as template** from the active wedding's **checklist** and **event-day schedule**.
- **Add from template** to the active wedding's checklist or schedule.
- Checklist due dates are stored as "days before the wedding" and recalculated for each wedding.
- A **Templates** page in the account area: see, rename and delete your templates.

## Non-goals (this release)

- Budget, vendor, questionnaire, proposal and email templates. _(call)_ Checklist and timeline are where planners repeat the most, and those two lists are already itemised in the app. The others need features that don't exist yet: questionnaires, proposals and outgoing email.
- Sharing templates between planner accounts, or a template marketplace.
- Built-in starter templates. The checklist already offers example tasks.
- Editing a template's items directly. To change a template, save over it from a wedding; see "Saving under an existing name" below.

## Anti-goals

- Applying a template twice must not double the checklist. Tasks whose text already exists are skipped, and the page says how many were added and how many skipped.
- One person's templates must never be visible to or usable by another account. That includes the couple, when a planner saves a template inside a client's wedding.
- A template must not carry one couple's private details into another wedding. Schedule templates don't copy the vendor link or the contact field. _(call)_

## Approaches considered

1. **Templates owned by the user, with items stored as JSONB on one row. Chosen.** A template is always read and written whole; it is never queried item by item. One table keeps it simple, and the items are validated in code before saving and when applying.
2. **A `template_items` table.** Rejected: it means more joins and migrations for no query that needs them.
3. **Templates owned by a wedding**, as in "copy from another wedding". Rejected: planners think "my standard timeline", not "Ana's timeline". Copying from another wedding is what "Save as template" plus "Add from template" already gives.

## What people see

- **Checklist page** (editors and clients): two disclosures under the add-task panel.
  - **Save as template:** a name field. It saves every task: text, category, and days before the wedding. The days are null when the task has no due date or the wedding has no date. If a template of that kind and name exists, it is replaced; the form says so.
  - **Add from template:** a picker listing your checklist templates with their task counts. It is hidden when you have none, and shows a hint linking to the Templates page instead.
  - Flash after adding: "Added 32 tasks from "Full-service 12 months". 3 were already on the list."
  - With a wedding date, due dates are worked out as wedding date minus the days. A date before today is still set; the existing overdue styling shows it. _(call)_ With no wedding date, tasks are added without dates and a notice suggests setting the date first.
- **Schedule page:** the same two disclosures. Items keep their start and end times, title, location, setup notes and plan B.
- **Templates page (`/templates`, account area):** your templates grouped by kind, each with its item count and the date it was saved, plus rename and delete (with a confirmation). Empty state: how to save one. Linked from Settings and from the planner dashboard.

## Access

- Saving and applying need the `editor` right on the active wedding. Clients have it too, so a couple planning on their own can use templates.
- The Templates page needs an account (`loadOptionalWedding`, like Settings).
- Every template query is scoped by `user_id = session user`. Applying looks the template up by (id, user) and writes into the active wedding only.

## Data

New migration `010_templates.sql`. It only adds things and is safe to run more than once.

- `templates`:
  - `id`, `user_id` (FK users, cascade)
  - `kind` (CHECK `checklist` or `schedule`)
  - `name` (1–120 characters), `items JSONB NOT NULL`
  - `created_at`, `updated_at` (with the trigger)
  - `UNIQUE (user_id, kind, name)`
- Item shapes:
  - checklist: `{text, category, daysBefore: int|null}`
  - schedule: `{startsAt: 'HH:MM', endsAt: 'HH:MM'|null, title, location, notes, contingency}`
- Limits:
  - at most 300 items per template _(call)_
  - at most 100 templates per user _(call)_
  - text limits the same as the source tables' validators
- On apply, items are re-validated against the current category lists. An unknown category becomes `Other`, and broken items are skipped.

## Constraints

All `CLAUDE.md` conventions: layers, validators, CSRF, no inline script, en and es strings, `npm run check`. Phone first. Every feature works without JS.

## Testing

- Unit:
  - the item normalisers (checklist and schedule)
  - the days-before calculation in both directions
- Integration:
  - save, then apply into another wedding with dates recalculated
  - applying twice skips duplicates and reports the counts
  - no wedding date → no due dates, plus the notice
  - replacing an existing name
  - rename and delete
  - another user's template id can't be applied, renamed or deleted (404)
  - a viewer can't save or apply
  - a schedule template doesn't carry the vendor or contact
  - the limits

## Left to the builder

Exact copy, and the layout of the disclosures.
