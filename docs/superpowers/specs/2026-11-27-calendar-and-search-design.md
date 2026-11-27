# Calendar and search: design

Status: built without a separate approval round, at the product owner's request ("keep building the next items in notes") · 2026-11-27 · branch `planning-details`

This covers the notes item "Multiple concurrent weddings with calendar views, search, filters, and workload summaries". The planner dashboard already has filters and workload. This design adds the calendar and search. Choices the product owner didn't make are marked _(call)_.

## Calendar (`/calendar?month=YYYY-MM&wedding=<id>`)

- **What it shows:** everything with a date across every wedding the person belongs to, in any role.
  - wedding days
  - open checklist tasks by due date
  - unpaid payments of booked vendors by due date (the same rule as Payments due)
  - open decisions by due date
- **Filtering:** a planner can narrow it to one wedding.
- **Layout:**
  - At the top, a month grid with a count per day, where each day links to its entry below.
  - Below it, an agenda: the days that have something, in order.
  - On phones only the agenda shows _(call: a 7-column grid with text is unreadable at 390 px)_.
  - Weeks start on Monday _(call)_.
- **Each entry** names its wedding and opens the right page in that wedding, by switching to it first (the existing switch form with `return_to`).
- **Past items:** anything overdue from earlier months isn't repeated. The dashboards already show overdue items.
- **Access:** the `account` chain, so a planner with no wedding yet sees an empty calendar.
- **Navigation:** a "Calendar" link in the navigation for planners, and for anyone with a wedding.

## Search (`/search?q=…`)

- **What it searches:** guests, vendors, checklist tasks, decisions and event-day items across the person's weddings. It's a case-insensitive "contains" match, with at least 2 characters and up to 20 results per kind _(call)_.
- **Results** are grouped by kind. Each names its wedding and opens the page in that wedding.
- **Where to find it:** the search box is on the calendar page, on the planner dashboard, and on `/search` itself.
- **Safety:** `%` and `_` in the query are escaped, so they match themselves.

## Testing

- **Calendar:**
  - Shows only the person's own weddings.
  - Shows each kind of entry.
  - Done tasks, paid payments and payments of vendors that aren't booked are left out.
  - The month and wedding filters work, and a bad `month` falls back to this month.
- **Search:**
  - Finds each kind of entry.
  - Never shows another person's wedding.
  - A one-letter query asks for more.
  - A query of `%` matches only a literal %.
- **Opening a result:** the switch form takes the person to the page in that wedding.
