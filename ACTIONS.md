# Your to-do list

Things only you can do. I remove each one once it's done, so everything here is still open. Follow this file, not older instructions in the chat.

Nothing here blocks me. I keep building while these wait.

## 1. Update the Render database

The last four releases need new database columns. If you already ran this after merging #3 to #7, it prints "Database is up to date"; that's fine.

On your computer, in the project folder, with your `.env` pointing at Render (`DB_URL=…` and `DB_SSL_INSECURE=true`):

```bash
git checkout main
```

```bash
git pull origin main
```

```bash
npm install
```

```bash
npm run migrate
```

## 2. Set your time zone on Render

On Render, open your web service, then **Environment**, and add `APP_TIME_ZONE` with your zone, for example `America/Denver`. Click **Save changes**.

This makes "today" your day for overdue payments and reminders; without it the app uses UTC. Add the same line to your local `.env`.

## 3. Delete the old branches on GitHub

The releases are all merged into `main`, so these branches are no longer needed:

`planner-release`, `payments-contracts`, `offline-event-day`, `templates`, `reminders`, `revamp/cse340-standards`, `ui/design-review`.

On GitHub, go to **Code → Branches** and click the bin icon next to each one.

To clean up your computer as well, run each of these and ignore any "not found" errors:

```bash
git fetch --prune
```

```bash
git branch -D planner-release payments-contracts offline-event-day templates reminders revamp/cse340-standards ui/design-review
```

## 4. (Optional) Turn on reminder emails

Without this nothing is sent, and nothing breaks.

1. On Render, open your web service, then **Environment**. Add `SMTP_HOST`, `SMTP_PORT` (usually `587`), `SMTP_USER`, `SMTP_PASS` and `FROM_EMAIL` from your email provider. Resend, Postmark, Brevo and Mailgun all have free tiers. Invite emails start working too.
2. On Render, choose **New → Cron Job**:
   - **Repository:** `Timowhit/Wedding`, branch `main`
   - **Build command:** `npm install`
   - **Command:** `npm run reminders`
   - **Schedule:** `30 14 * * *`. The schedule is in UTC: 14:30 UTC is 7:30 in Denver in winter and 8:30 in summer.
   - **Environment:** the same variables as the web service. At least `DB_URL`, `DB_SSL_INSECURE`, `SESSION_SECRET` (the same value, or unsubscribe links break), `APP_URL`, `APP_TIME_ZONE` and the SMTP settings.
3. Click **Trigger Run** to test it.

Cron Jobs are a paid Render instance type.

## 5. Merge the appearance and venue layout release

[Timowhit/Wedding#9](https://github.com/Timowhit/Wedding/pull/9) adds:

- the live Appearance settings with your own colours
- the Wedding colours page
- the Venue layout page
- the new logo and the fading notices

I'm finishing its final review. When this step says "ready", do the following:

1. GitGuardian marks the PR with "2 secrets uncovered". These are false positives: the flagged strings are colour codes in a test, not passwords or keys, and the check doesn't block merging. To clear it, open the two incidents from the GitGuardian comment on the PR and mark each as **False positive**. You can also ignore it.
2. Open the PR, click **Ready for review**, wait for the "CI" check to turn green (GitGuardian may stay red; see 1), then **Merge pull request**. Squash is fine.
3. Repeat step 1 of this file (`git pull origin main`, then `npm run migrate`). It applies `012_appearance_and_layout.sql`, which only adds columns and tables.
4. Delete the `appearance-and-layout` branch on GitHub.

Status: **not ready yet** (review in progress).
